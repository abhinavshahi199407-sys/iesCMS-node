#!/usr/bin/env node
// IESCMS export ingester — turns a portal "export to Excel" click into live
// dashboard + MCP data.
//
//   node ingest.js <export.xls> [--circle "Circle - 4"] [--out ../data/latest_mgr.json]
//   node ingest.js --watch ~/Downloads [--pattern FL4C] [--circle "Circle - 4"]
//
// UP Excise/IESCMS "xls" exports are actually HTML. The data lives in the
// largest table (id oasysMISToolTable); branding tables precede it. Numeric
// cells may arrive as literal =TRIM(...) formula strings — some cells wrapped,
// some plain, in the same column — so every cell is unwrapped before use.
//
// This script only ever reads files you already downloaded with your own
// authorized portal session. It performs no login, no scraping, no CAPTCHA/OTP
// handling.
//
// If C4_DB_URL / DATABASE_URL is set, rows are also inserted into the
// monitoring database (report_snapshots + shops upsert), deduped by file hash.

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync, watch } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = join(__dirname, '..', 'data', 'latest_mgr.json');

// ------------------------------------------------------------- parsing ----

function decodeEntities(s) {
    return s
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
        .replace(/&amp;/gi, '&');
}

function cleanCell(html) {
    let s = decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    // Unwrap the portal's literal =TRIM(45) / =TRIM("text") formula strings.
    const m = s.match(/^=TRIM\(\s*"?(.*?)"?\s*\)$/i);
    return m ? m[1].trim() : s;
}

function toNum(v) {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isNaN(n) ? null : n;
}

function extractTables(html) {
    const tables = [];
    const re = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
    let m;
    while ((m = re.exec(html))) tables.push({ attrs: m[1], body: m[2] });
    return tables;
}

function tableRows(tableBody) {
    const rows = [];
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let tr;
    while ((tr = trRe.exec(tableBody))) {
        const cells = [];
        const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
        let td;
        while ((td = tdRe.exec(tr[1]))) cells.push(cleanCell(td[1]));
        if (cells.length) rows.push(cells);
    }
    return rows;
}

/**
 * Parse an FL4C MGR export. Column layout matches the verified Python parser
 * (collector/parse_upexcise_xls.py): c[1]=district c[2]=circle c[3]=month
 * c[4]=shop_id c[5]=shop_name c[6]=license_type c[7]=mgr_assigned
 * c[10]=final_required c[15]=mgr_lifted c[16]=balance c[17]=achievement.
 */
export function parseMgrExport(html) {
    const tables = extractTables(html);
    if (!tables.length) throw new Error('No <table> found — is this really an IESCMS export?');
    const named = tables.find(t => /oasysMISToolTable/i.test(t.attrs));
    const table = named || tables.reduce((a, b) =>
        tableRows(a.body).length >= tableRows(b.body).length ? a : b);

    const rows = [];
    for (const c of tableRows(table.body)) {
        if (c.length < 18) continue;
        const mgrAssigned = toNum(c[7]);
        if (mgrAssigned == null) continue; // header / footer / branding rows
        rows.push({
            district: c[1], circle: c[2], month: c[3],
            shop_id: c[4], shop_name: c[5] || c[4], license_type: c[6],
            mgr_assigned: mgrAssigned,
            final_required: toNum(c[10]),
            mgr_lifted: toNum(c[15]),
            balance: toNum(c[16]),
            achievement: toNum(c[17])
        });
    }
    return rows;
}

/**
 * Generic parser for reports whose layout has not been mapped yet (FL5DB,
 * FL4A, CL5C, POS sales …): captures the main table as-is, first row as
 * headers, every later row as an object keyed by normalized header names.
 * Raw captures go to data/raw/ so the MGR-shaped MCP snapshots stay clean.
 */
export function parseGenericExport(html) {
    const tables = extractTables(html);
    if (!tables.length) throw new Error('No <table> found — is this really an IESCMS export?');
    const named = tables.find(t => /oasysMISToolTable/i.test(t.attrs));
    const table = named || tables.reduce((a, b) =>
        tableRows(a.body).length >= tableRows(b.body).length ? a : b);

    const all = tableRows(table.body).filter(r => r.length >= 2);
    if (all.length < 2) throw new Error('Table has no data rows.');
    const headers = all[0].map((h, i) =>
        (h || `col_${i}`).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `col_${i}`);
    return {
        columns: headers,
        rows: all.slice(1)
            .filter(c => c.length >= Math.min(3, headers.length))
            .map(c => Object.fromEntries(headers.map((h, i) => {
                const v = c[i] ?? '';
                const n = toNum(v);
                return [h, n != null && /[\d]/.test(v) && !/[a-z]{2,}/i.test(v) ? n : v];
            })))
    };
}

// ------------------------------------------------------------ database ----

async function insertIntoDb(rows, sourceFile, sourceHash) {
    const url = process.env.C4_DB_URL || process.env.DATABASE_URL;
    if (!url) return false;

    let pg;
    try {
        // pg is installed under mcp/ — resolve it from there.
        pg = createRequire(join(__dirname, '..', 'mcp', 'package.json'))('pg');
    } catch {
        throw new Error('C4_DB_URL is set but pg is not installed. Run: cd ../mcp && npm install');
    }

    const pool = new pg.Pool({ connectionString: url, max: 2 });
    try {
        const dup = await pool.query('select 1 from report_snapshots where source_hash = $1 limit 1', [sourceHash]);
        if (dup.rows.length) {
            console.log(`DB: snapshot ${sourceHash.slice(0, 10)} already ingested — skipping insert`);
            return true;
        }
        const monthDate = (m) => {
            const p = String(m || '').match(/^([A-Za-z]{3})-(\d{4})$/);
            if (!p) return null;
            const idx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(p[1].toLowerCase());
            return idx === -1 ? null : `${p[2]}-${String(idx + 1).padStart(2, '0')}-01`;
        };
        for (const r of rows) {
            await pool.query(
                `insert into shops (shop_id, shop_name, circle, license_type)
                 values ($1, $2, $3, $4) on conflict (shop_id) do update
                 set shop_name = excluded.shop_name, circle = excluded.circle, license_type = excluded.license_type`,
                [r.shop_id, r.shop_name, r.circle, r.license_type]);
            await pool.query(
                `insert into report_snapshots (report_type, source_period, cutoff_at, district, circle, shop_id, metric, source_hash)
                 values ('MGR', $1, now(), $2, $3, $4, $5, $6)`,
                [monthDate(r.month), r.district, r.circle, r.shop_id, JSON.stringify(r), sourceHash]);
        }
        console.log(`DB: inserted ${rows.length} MGR snapshot rows from ${sourceFile}`);
        return true;
    } finally {
        await pool.end();
    }
}

// -------------------------------------------------------------- ingest ----

const circleMatches = (value, circle) => {
    const want = circle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const have = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return have === want || have.endsWith(want) || have === `circle${want}`;
};

export async function ingestFile(path, { circle, out, parser = 'mgr', name } = {}) {
    const raw = readFileSync(path, 'utf8');

    if (parser === 'generic') {
        const parsed = parseGenericExport(raw);
        let rows = parsed.rows;
        if (circle) {
            const key = parsed.columns.find(c => c.includes('circle'));
            if (key) rows = rows.filter(r => circleMatches(r[key], circle));
        }
        const rawDir = join(__dirname, '..', 'data', 'raw');
        mkdirSync(rawDir, { recursive: true });
        const target = out || join(rawDir, `${name || basename(path).replace(/\.[^.]+$/, '')}.json`);
        const doc = {
            generated_from: basename(path),
            report: name || null,
            parser: 'generic',
            ingested_at: new Date().toISOString(),
            columns: parsed.columns,
            rows
        };
        writeFileSync(target, JSON.stringify(doc, null, 2));
        console.log(`Wrote ${rows.length} raw rows (${parsed.columns.length} cols) -> ${target}`);
        console.log('Note: generic capture only — share this export once and the layout can be mapped to a typed parser + DB feed.');
        return doc;
    }

    let rows = parseMgrExport(raw);
    if (circle) rows = rows.filter(r => circleMatches(r.circle, circle));
    if (!rows.length) throw new Error(`Parsed 0 data rows from ${path} — layout may differ from the FL4C MGR report.`);

    const doc = {
        generated_from: basename(path),
        ingested_at: new Date().toISOString(),
        rows
    };
    const target = out || DEFAULT_OUT;
    writeFileSync(target, JSON.stringify(doc, null, 2));
    console.log(`Wrote ${rows.length} rows -> ${target}`);

    const hash = createHash('sha1').update(raw).digest('hex');
    await insertIntoDb(rows, basename(path), hash);
    return doc;
}

function watchDir(dir, { pattern, circle, out }) {
    const re = new RegExp(pattern, 'i');
    const pending = new Map();
    const tryIngest = (file) => {
        const full = join(dir, file);
        if (!existsSync(full) || !statSync(full).isFile()) return;
        ingestFile(full, { circle, out })
            .catch(err => console.error(`Skip ${file}: ${err.message}`));
    };

    console.log(`Watching ${dir} for /${pattern}/i exports… (Ctrl-C to stop)`);
    // Ingest the newest matching file already present, so a restart never misses one.
    const existing = readdirSync(dir).filter(f => re.test(f))
        .map(f => ({ f, t: statSync(join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
    if (existing.length) tryIngest(existing[0].f);

    watch(dir, (_event, file) => {
        if (!file || !re.test(file)) return;
        // Debounce: browsers write downloads in chunks / via rename.
        clearTimeout(pending.get(file));
        pending.set(file, setTimeout(() => { pending.delete(file); tryIngest(file); }, 1500));
    });
}

// ----------------------------------------------------------------- cli ----

function arg(name) {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : undefined;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const watchTarget = arg('--watch');
    const opts = {
        circle: arg('--circle'),
        parser: arg('--parser') || 'mgr',
        name: arg('--name'),
        out: arg('--out') ? resolve(arg('--out')) : undefined
    };
    if (watchTarget) {
        watchDir(resolve(watchTarget), { ...opts, pattern: arg('--pattern') || 'FL4C.*\\.xls' });
    } else {
        const argv = process.argv.slice(2);
        const positionals = [];
        for (let i = 0; i < argv.length; i++) {
            if (argv[i].startsWith('--')) i++; // skip the flag's value
            else positionals.push(argv[i]);
        }
        const file = positionals[0];
        if (!file) {
            console.error('Usage: node ingest.js <export.xls> [--circle "Circle - 4"] [--parser mgr|generic] [--name REPORT] [--out path.json]\n' +
                '       node ingest.js --watch <dir> [--pattern FL4C] [--circle "Circle - 4"]');
            process.exit(2);
        }
        ingestFile(resolve(file), opts).catch(err => { console.error(err.message); process.exit(1); });
    }
}
