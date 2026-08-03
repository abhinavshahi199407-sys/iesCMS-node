// Tests for the IESCMS export ingester, using a fixture that reproduces the
// portal's known traps: fake-.xls HTML, branding table before the data table,
// =TRIM(...) wrappers mixed with plain cells, comma-grouped numbers, HTML
// entities, and a short "Grand Total" footer row.
// Run with: node collector/test/ingest-test.js

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMgrExport, ingestFile } from '../ingest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, 'fixtures', 'fl4c_fixture.xls');
let failures = 0;
const check = (name, cond, detail = '') => {
    if (cond) console.log(`  ok   ${name}`);
    else { failures++; console.error(`  FAIL ${name} ${detail}`); }
};

console.log('parseMgrExport');
const rows = parseMgrExport(readFileSync(fixture, 'utf8'));
check('3 data rows (header + footer skipped)', rows.length === 3, `got ${rows.length}`);
check('=TRIM district unwrapped', rows[0].district === 'GAUTAM BUDDHA NAGAR');
check('=TRIM month unwrapped', rows[0].month === 'Aug-2026');
check('=TRIM numeric unwrapped', rows[0].mgr_assigned === 2537916.67);
check('comma-grouped number parsed', rows[1].mgr_assigned === 1016250);
check('negative balance parsed', rows[1].balance === -1083750);
check('entity decoded in name', rows[1].shop_name === 'Liquor & Town');
check('=TRIM circle unwrapped', rows[1].circle === 'Circle - 4');
check('achievement parsed', rows[0].achievement === 47.28);

console.log('ingestFile with --circle filter');
const tmp = mkdtempSync(join(tmpdir(), 'c4-ingest-'));
try {
    const out = join(tmp, 'latest_mgr.json');
    const doc = await ingestFile(fixture, { circle: '4', out });
    check('filters to Circle-4 only', doc.rows.length === 2, `got ${doc.rows.length}`);
    check('excludes Circle-2 shop', !doc.rows.some(r => r.shop_id === 'PR_99'));
    const onDisk = JSON.parse(readFileSync(out, 'utf8'));
    check('output file written', onDisk.rows.length === 2);
    check('records source filename', onDisk.generated_from === 'fl4c_fixture.xls');
    check('records ingest time', typeof onDisk.ingested_at === 'string');
} finally {
    rmSync(tmp, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL INGEST TESTS PASSED');
process.exit(failures ? 1 : 0);
