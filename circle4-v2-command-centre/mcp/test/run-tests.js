// End-to-end smoke test: spawns the server over stdio via the official MCP
// client and exercises every tool against the shipped sample snapshot.
// Run with: npm test   (from the mcp/ directory)

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let failures = 0;

function check(name, cond, detail = '') {
    if (cond) console.log(`  ok   ${name}`);
    else { failures++; console.error(`  FAIL ${name} ${detail}`); }
}

const client = new Client({ name: 'smoke-test', version: '1.0.0' });
await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(__dirname, '..', 'server.js')],
    stderr: 'ignore'
}));

console.log('tools/list');
const { tools } = await client.listTools();
const names = tools.map(t => t.name).sort();
check('exposes 6 tools', names.length === 6, `got ${names.join(',')}`);
for (const expected of ['compare_cy_ly', 'generate_deo_brief', 'get_district_summary',
    'get_shop_profile', 'list_active_alerts', 'list_low_performers']) {
    check(`tool ${expected}`, names.includes(expected));
}
check('all tools read-only', tools.every(t => t.annotations?.readOnlyHint === true));

console.log('get_district_summary (Circle 4, Jul-2026)');
let r = await client.callTool({ name: 'get_district_summary', arguments: { circle: '4', month: '2026-07' } });
let s = r.structuredContent;
check('not error', !r.isError, r.content?.[0]?.text);
check('8 shops', s?.shop_count === 8, `got ${s?.shop_count}`);
check('assigned total', Math.round(s?.mgr_assigned_total) === 28993750, `got ${s?.mgr_assigned_total}`);
check('lifted total', Math.round(s?.mgr_lifted_total) === 31163327, `got ${s?.mgr_lifted_total}`);
check('achievement ~107.48%', Math.abs(s?.achievement_pct - 107.48) < 0.01, `got ${s?.achievement_pct}`);
check('weakest is PR_41', s?.weakest_shop?.shop_id === 'PR_41', `got ${s?.weakest_shop?.shop_id}`);
check('strongest is PR_38', s?.strongest_shop?.shop_id === 'PR_38', `got ${s?.strongest_shop?.shop_id}`);

console.log('get_district_summary (bad month)');
r = await client.callTool({ name: 'get_district_summary', arguments: { month: 'notamonth' } });
check('errors on bad month', r.isError === true);

console.log('compare_cy_ly (mtd)');
r = await client.callTool({ name: 'compare_cy_ly', arguments: { scope: 'mtd', circle: 'Circle - 4' } });
s = r.structuredContent;
check('not error', !r.isError, r.content?.[0]?.text);
check('LY honestly unavailable', s?.comparison_available === false);
check('CY side still reported', s?.cy?.shop_count === 8);
check('reason mentions LY month', /Jul-2025/.test(s?.reason || ''), s?.reason);

console.log('compare_cy_ly (day)');
r = await client.callTool({ name: 'compare_cy_ly', arguments: { scope: 'day', date: '2026-08-03' } });
s = r.structuredContent;
check('day feed honestly unavailable', s?.comparison_available === false);

console.log('list_low_performers (<80%)');
r = await client.callTool({ name: 'list_low_performers', arguments: { threshold_pct: 80, circle: '4' } });
s = r.structuredContent;
check('not error', !r.isError, r.content?.[0]?.text);
check('3 shops below 80%', s?.matched === 3, `got ${s?.matched}`);
check('worst first is PR_41', s?.shops?.[0]?.shop_id === 'PR_41');
check('PR_41 is critical', s?.shops?.[0]?.risk === 'critical');
check('PR_39 is watch', s?.shops?.some(x => x.shop_id === 'PR_39' && x.risk === 'watch'));

console.log('get_shop_profile (exact id, wrong case)');
r = await client.callTool({ name: 'get_shop_profile', arguments: { shop_id: 'pr_41' } });
s = r.structuredContent;
check('finds PR_41', s?.shop_id === 'PR_41');
check('achievement 20.34', s?.mgr_history?.[0]?.achievement_pct === 20.34);
check('has critical open alert', s?.open_alerts?.some(a => a.severity === 'critical'));

console.log('get_shop_profile (by name)');
r = await client.callTool({ name: 'get_shop_profile', arguments: { shop_id: 'Liquor Town' } });
check('finds RETAIL207178', r.structuredContent?.shop_id === 'RETAIL207178');

console.log('get_shop_profile (unknown shop)');
r = await client.callTool({ name: 'get_shop_profile', arguments: { shop_id: 'DOES_NOT_EXIST' } });
check('errors with shop list', r.isError === true && /Known shops/.test(r.content?.[0]?.text || ''));

console.log('list_active_alerts');
r = await client.callTool({ name: 'list_active_alerts', arguments: {} });
s = r.structuredContent;
check('derived alerts flagged', s?.derived_from_rules === true);
check('exactly 1 critical + 2 watch', s?.count === 3, `got ${s?.count}`);
r = await client.callTool({ name: 'list_active_alerts', arguments: { severity: 'critical' } });
check('1 critical (PR_41)', r.structuredContent?.count === 1 &&
    r.structuredContent?.alerts?.[0]?.shop_id === 'PR_41');

console.log('generate_deo_brief');
r = await client.callTool({ name: 'generate_deo_brief', arguments: { circle: '4', top_n: 3 } });
const brief = r.content?.[0]?.text || '';
check('not error', !r.isError, brief);
check('is markdown brief', brief.startsWith('# DEO Brief'));
check('names worst shop PR_41', brief.includes('PR_41'));
check('names top achiever PR_38', brief.includes('PR_38'));
check('states LY feed not connected', /not connected/.test(brief));
check('no invented YoY number', !/YoY: lifted/.test(brief));

await client.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL TESTS PASSED');
process.exit(failures ? 1 : 0);
