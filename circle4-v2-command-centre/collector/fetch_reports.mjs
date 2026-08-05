#!/usr/bin/env node
// Authorized portal report fetcher — runs ON YOUR OFFICE MACHINE, never in
// the cloud/AI layer.
//
// How access works (and the lines this script will not cross):
//   - It drives YOUR OWN Chrome with a persistent profile directory.
//   - The first time (and whenever the portal session expires) YOU log in
//     manually in the window it opens — username, password, CAPTCHA, OTP are
//     all typed by you. The script only waits.
//   - After that it reuses the logged-in session to open the report page,
//     click export, and hand the file to ingest.js. No credentials are read,
//     stored, transmitted, or automated by this script, and it contains no
//     CAPTCHA/OTP handling of any kind.
//
// Modes:
//   node fetch_reports.mjs --setup            one-time: log in, navigate to the
//                                             report, press Enter — the URL is
//                                             saved into portal.config.json
//   node fetch_reports.mjs --once             fetch + ingest every configured
//                                             report one time (for cron)
//   node fetch_reports.mjs                    loop: every intervalMinutes
//                                             within activeHours (08:00-22:00)
//
// Setup on the office machine:
//   cd circle4-v2-command-centre/collector
//   npm install                (installs playwright-core; uses installed Chrome)
//   cp portal.config.example.json portal.config.json
//   node fetch_reports.mjs --setup

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { ingestFile } from './ingest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, 'portal.config.json');

function loadConfig() {
    if (!existsSync(CONFIG_PATH)) {
        console.error('No portal.config.json found. Copy portal.config.example.json to portal.config.json first.');
        process.exit(2);
    }
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    delete cfg._steps_help;
    return cfg;
}

async function launchBrowser(cfg) {
    let chromium;
    try {
        ({ chromium } = await import('playwright-core'));
    } catch {
        console.error('playwright-core is not installed. Run: npm install   (in the collector/ folder)');
        process.exit(2);
    }
    const profileDir = resolve(__dirname, cfg.profileDir || '.portal-profile');
    mkdirSync(profileDir, { recursive: true });
    // channel:'chrome' uses the Chrome already installed on the machine —
    // nothing is downloaded. Headed by default: government portals behave
    // best in a visible window, and you may need to complete a login.
    return chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        headless: process.argv.includes('--headless'),
        acceptDownloads: true,
        viewport: null
    });
}

function looksLikeLogin(page) {
    return page.locator('input[type="password"]').first().isVisible().catch(() => false);
}

async function waitForHumanLogin(page) {
    console.log('\n*** Portal wants a login. Complete it yourself in the Chrome window');
    console.log('*** (username, password, CAPTCHA, OTP). The script is only waiting.\n');
    while (await looksLikeLogin(page)) {
        await page.waitForTimeout(2000);
    }
    console.log('Login detected — continuing.');
}

const EXPORT_CANDIDATES = [
    'a:has-text("Excel")', 'input[value*="excel" i]', 'button:has-text("Excel")',
    'img[alt*="excel" i]', 'img[src*="excel" i]',
    'a:has-text("Export")', 'button:has-text("Export")', 'input[value*="export" i]'
];

async function clickExport(page, selector) {
    const candidates = selector ? [selector, ...EXPORT_CANDIDATES] : EXPORT_CANDIDATES;
    for (const sel of candidates) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
            await el.click();
            return sel;
        }
    }
    throw new Error(
        'Could not find the export control on the page. Open the report yourself once, ' +
        'right-click the Excel/export button → Inspect, and put a selector for it into ' +
        `portal.config.json as "exportSelector". Tried: ${candidates.join(' , ')}`);
}

// Optional per-report steps executed after the page loads and before the
// export click — for report-builder pages (like /customreport) that need a
// report type selected and a Generate click first. Configure in
// portal.config.json:  "steps": [{action, selector, value|ms}, ...]
async function runSteps(page, steps) {
    for (const s of steps || []) {
        switch (s.action) {
            case 'click': await page.locator(s.selector).first().click(); break;
            case 'select': await page.locator(s.selector).first().selectOption({ label: s.value }).catch(() =>
                page.locator(s.selector).first().selectOption(s.value)); break;
            case 'fill': await page.locator(s.selector).first().fill(s.value); break;
            case 'wait': await page.locator(s.selector).first().waitFor({ timeout: s.ms || 60000 }); break;
            case 'pause': await page.waitForTimeout(s.ms || 1000); break;
            default: throw new Error(`Unknown step action "${s.action}" (use click/select/fill/wait/pause)`);
        }
    }
}

async function fetchReport(ctx, cfg, report) {
    const page = await ctx.newPage();
    try {
        await page.goto(report.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        if (await looksLikeLogin(page)) {
            await waitForHumanLogin(page);
            await page.goto(report.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        }
        await runSteps(page, report.steps);
        const downloadDir = resolve(__dirname, cfg.downloadDir || 'downloads');
        mkdirSync(downloadDir, { recursive: true });

        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 120000 }),
            clickExport(page, report.exportSelector)
        ]);
        const file = join(downloadDir, `${Date.now()}_${download.suggestedFilename()}`);
        await download.saveAs(file);
        console.log(`[${report.name}] downloaded ${download.suggestedFilename()}`);

        await ingestFile(file, {
            circle: report.circle,
            parser: report.parser || 'mgr',
            name: report.name,
            out: report.out
        });
        console.log(`[${report.name}] ingested — dashboard and MCP are now current.`);
    } finally {
        await page.close();
    }
}

// Keep-alive: touch the portal every few minutes so the authorized session's
// idle timer never expires — the same effect as keeping the tab open and
// clicking now and then. This does NOT bypass anything: a server-side forced
// expiry (daily cutoff, password change, single-session policy) still ends
// the session, and the next cycle will pause for a manual login.
async function keepAlive(ctx, cfg) {
    const page = await ctx.newPage();
    try {
        await page.goto(cfg.keepAliveUrl || cfg.portalHome, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (await looksLikeLogin(page)) {
            console.warn(`[keep-alive ${new Date().toLocaleTimeString()}] portal session EXPIRED server-side — ` +
                'log in again in the collector window (or run: npm run setup).');
            return false;
        }
        return true;
    } catch (err) {
        console.warn(`[keep-alive] ping failed: ${err.message}`);
        return true; // network blip — don't spam login warnings
    } finally {
        await page.close();
    }
}

async function runOnce(ctx, cfg) {
    for (const report of cfg.reports || []) {
        if (report.enabled === false) continue;
        if (!report.url || report.url.includes('PASTE-THE-REPORT-PAGE-URL')) {
            console.log(`[${report.name}] skipped — no URL configured yet (run --setup).`);
            continue;
        }
        try {
            await fetchReport(ctx, cfg, report);
        } catch (err) {
            console.error(`[${report.name}] failed: ${err.message}`);
        }
    }
}

async function setup(cfg) {
    const ctx = await launchBrowser(cfg);
    const page = await ctx.newPage();
    await page.goto(cfg.portalHome || 'https://mis.upexciseonline.co/', { waitUntil: 'domcontentloaded' });

    const needsUrl = !cfg.reports?.[0]?.url || cfg.reports[0].url.includes('PASTE-THE-REPORT-PAGE-URL');
    console.log('\n1. Log in to the portal in the Chrome window (username/password/CAPTCHA/OTP — you type them).');
    if (needsUrl) console.log('2. Navigate to the report you want collected.');
    console.log(`${needsUrl ? '3' : '2'}. Then come back here and press Enter.\n`);
    await new Promise(res => createInterface({ input: process.stdin }).once('line', res));

    if (needsUrl) {
        cfg.reports = cfg.reports?.length ? cfg.reports : [{ name: 'FL4C_MGR', circle: 'Circle - 4' }];
        cfg.reports[0].url = page.url();
        writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        console.log(`Saved report URL to portal.config.json:\n  ${cfg.reports[0].url}`);
    }
    console.log('Login session saved in the local Chrome profile. Test with: node fetch_reports.mjs --once');
    await ctx.close();
    process.exit(0);
}

async function main() {
    const cfg = loadConfig();
    if (process.argv.includes('--setup')) return setup(cfg);

    const ctx = await launchBrowser(cfg);
    if (process.argv.includes('--once')) {
        await runOnce(ctx, cfg);
        await ctx.close();
        return;
    }

    // Loop mode: reports every intervalMinutes inside activeHours; keep-alive
    // pings every keepAliveMinutes around the clock so the one-time login
    // stays valid as long as the machine and this script keep running.
    const fetchEvery = (cfg.intervalMinutes || 30) * 60 * 1000;
    const pingEvery = (cfg.keepAliveMinutes || 10) * 60 * 1000;
    const { start = 8, end = 22 } = cfg.activeHours || {};
    console.log(`Loop mode: reports every ${cfg.intervalMinutes || 30} min (${start}:00-${end}:00), ` +
        `session keep-alive every ${cfg.keepAliveMinutes || 10} min, 24x7. Ctrl-C to stop.`);

    let lastFetch = 0, lastPing = 0;
    for (;;) {
        const now = Date.now();
        const h = new Date().getHours();
        if (now - lastPing >= pingEvery) {
            lastPing = now;
            await keepAlive(ctx, cfg);
        }
        if (h >= start && h <= end && now - lastFetch >= fetchEvery) {
            lastFetch = now;
            await runOnce(ctx, cfg);
        }
        await new Promise(res => setTimeout(res, 60 * 1000));
    }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
