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
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
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

async function fetchReport(ctx, cfg, report) {
    const page = await ctx.newPage();
    try {
        await page.goto(report.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        if (await looksLikeLogin(page)) {
            await waitForHumanLogin(page);
            await page.goto(report.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        }
        const downloadDir = resolve(__dirname, cfg.downloadDir || 'downloads');
        mkdirSync(downloadDir, { recursive: true });

        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 120000 }),
            clickExport(page, report.exportSelector)
        ]);
        const file = join(downloadDir, `${Date.now()}_${download.suggestedFilename()}`);
        await download.saveAs(file);
        console.log(`[${report.name}] downloaded ${download.suggestedFilename()}`);

        await ingestFile(file, { circle: report.circle });
        console.log(`[${report.name}] ingested — dashboard and MCP are now current.`);
    } finally {
        await page.close();
    }
}

async function runOnce(ctx, cfg) {
    for (const report of cfg.reports || []) {
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
    await page.goto(cfg.portalHome || 'https://upexcise.up.gov.in/', { waitUntil: 'domcontentloaded' });
    console.log('\n1. Log in to the portal in the Chrome window (CAPTCHA/OTP yourself).');
    console.log('2. Navigate all the way to the report you want (e.g. the FL4C MGR MIS report).');
    console.log('3. When the report page is showing, come back here and press Enter.\n');
    await new Promise(res => createInterface({ input: process.stdin }).once('line', res));

    const url = page.url();
    cfg.reports = cfg.reports?.length ? cfg.reports : [{ name: 'FL4C_MGR', circle: 'Circle - 4' }];
    cfg.reports[0].url = url;
    writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    console.log(`Saved report URL to portal.config.json:\n  ${url}`);
    console.log('Your login session is kept in the local Chrome profile. Test with: node fetch_reports.mjs --once');
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

    // Loop mode: every intervalMinutes inside activeHours, final run at end hour.
    const interval = (cfg.intervalMinutes || 30) * 60 * 1000;
    const { start = 8, end = 22 } = cfg.activeHours || {};
    console.log(`Loop mode: every ${cfg.intervalMinutes || 30} min, ${start}:00-${end}:00. Ctrl-C to stop.`);
    for (;;) {
        const h = new Date().getHours();
        if (h >= start && h <= end) await runOnce(ctx, cfg);
        else console.log(`Outside active hours (${start}:00-${end}:00) — idle.`);
        await new Promise(res => setTimeout(res, interval));
    }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
