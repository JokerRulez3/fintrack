import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { filterEntries, groupSum, sum, monthRows, suggestNewMonth, addMonths } from '../src/lib/aggregate.js';
import { parseAmount, inrShort, amountText } from '../src/lib/format.js';
import { runTool, runChat, systemPrompt, TOOLS } from '../server/chat-core.js';
import { scriptedClaude } from './scripted-claude.js';

// Demo data = the converted spreadsheet. It's personal, so it's gitignored; skip these tests where it's absent.
const file = new URL('../demo/demo-data.json', import.meta.url);
const have = fs.existsSync(file);
const data = have ? JSON.parse(fs.readFileSync(file)) : { entries: [], project_items: [] };
const E = data.entries;
const t = have ? test : test.skip;

t('imported yearly totals match the sheet cells', () => {
  const expect = { // each tab's Srikanth / Neelu total cells
    2020: [1630335, 1023703], 2021: [2016370, 887329], 2023: [2880222, 1230747.73],
    2024: [4081431, 1514789.3], 2025: [5860462, 1674741.27], 2026: [8653801, 1654664],
  };
  for (const [y, [s, n]] of Object.entries(expect)) {
    const rows = groupSum(filterEntries(E, { from_month: `${y}-01`, to_month: `${y}-12` }), ['payer']);
    assert.equal(rows.find((r) => r.payer === 'Srikanth').total, s, `${y} Srikanth`);
    assert.equal(rows.find((r) => r.payer === 'Neelu').total, n, `${y} Neelu`);
  }
  // 2022's sheet total (C2) only sums Srikanth's column
  assert.equal(sum(filterEntries(E, { from_month: '2022-01', to_month: '2022-12', payers: ['Srikanth'] })), 2436356);
});

t('breakdowns add up to amounts', () => {
  for (const e of E.filter((x) => x.breakdown)) assert.ok(Math.abs(e.breakdown.reduce((a, b) => a + b, 0) - e.amount) < 0.01, e.src);
  assert.deepEqual(E.find((e) => e.src === '2026!C27').breakdown, [10753, 10193]);
});

test('parseAmount handles Excel habits', () => {
  assert.deepEqual(parseAmount('10753+10193'), { amount: 20946, breakdown: [10753, 10193] });
  assert.deepEqual(parseAmount('=(21000 - 15000)'), { amount: 6000, breakdown: [21000, -15000] });
  assert.deepEqual(parseAmount('1,52,000'), { amount: 152000, breakdown: null });
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
  assert.equal(amountText({ amount: 6000, breakdown: [21000, -15000] }), '21000-15000');
  assert.equal(inrShort(152000), '₹1.52L');
  assert.equal(inrShort(25000000), '₹2.50Cr');
});

t('month rows merge payers like the sheet', () => {
  const rows = monthRows(E, '2026-02-01');
  const cc = rows.find((r) => r.item === 'Credit Card');
  assert.equal(cc.byPayer.Srikanth.amount, 20946);
  assert.equal(cc.byPayer.Neelu.amount, 15263);
  assert.equal(rows[0].item, 'Home Loan');
});

t('new month suggestions carry regular items with last amounts', () => {
  const s = suggestNewMonth(E, '2026-12-01');
  const hl = s.find((x) => x.item === 'Home Loan');
  assert.ok(hl.recurring);
  assert.equal(hl.byPayer.Srikanth, 162000); // Nov 2026 value
  assert.ok(!s.find((x) => x.item === 'Curtains').recurring); // Oct one-off is offered but unticked
  assert.equal(addMonths('2026-12-01', 1), '2027-01-01');
});

t('chat tools compute from data', () => {
  const ctx = { entries: E, projectItems: data.project_items };
  const r = runTool('query_spending', { group_by: ['year'] }, ctx);
  assert.equal(r.rows[0].year, '2020');
  assert.equal(r.rows.length, 7);
  const cc = runTool('query_spending', { categories: ['credit card'], from_month: '2026-01', to_month: '2026-12' }, ctx);
  assert.ok(cc.grand_total > 0);
  const swig = runTool('list_entries', { items: ['swiggy'] }, ctx);
  assert.ok(swig.entries.length && swig.entries.every((e) => /swiggy/i.test(e.item)));
  const p = runTool('get_project_items', { project: 'imperia' }, ctx);
  assert.ok(p.totals_by_section.Payments > 0 && p.totals_by_section.Essentials > 0);
  assert.ok(systemPrompt({ ...ctx, today: '2026-11-10' }).includes('2026-11'));
  assert.equal(TOOLS.length, 4);
});

t('chat loop runs tools, returns charts and text', async () => {
  const claude = scriptedClaude();
  const out = await runChat({ messages: [{ role: 'user', content: 'yearly?' }], entries: E, projectItems: data.project_items, anthropic: claude, model: 'm', today: '2026-11-10' });
  assert.equal(out.charts.length, 1);
  assert.equal(out.charts[0].type, 'stacked_bar');
  assert.equal(out.charts[0].data.length, 7);
  assert.match(out.reply, /Demo answer/);
  assert.equal(claude.calls.length, 3);
  assert.equal(claude.calls[1].messages.at(-1).content[0].type, 'tool_result');
});
