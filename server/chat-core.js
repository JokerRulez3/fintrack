// The AI chat brain: Claude + read-only tools over the user's entries. Pure logic — the HTTP wrapper is api/chat.js.
import { filterEntries, groupSum, sum, monthKey, yearOf } from '../src/lib/aggregate.js';

const FILTER_PROPS = {
  from_month: { type: 'string', description: "Inclusive start, 'YYYY-MM'" },
  to_month: { type: 'string', description: "Inclusive end, 'YYYY-MM'" },
  categories: { type: 'array', items: { type: 'string' }, description: 'Only these categories (exact names from the overview)' },
  exclude_categories: { type: 'array', items: { type: 'string' } },
  items: { type: 'array', items: { type: 'string' }, description: "Item name contains any of these (case-insensitive), e.g. ['swiggy','zomato']" },
  exclude_items: { type: 'array', items: { type: 'string' } },
  payers: { type: 'array', items: { type: 'string', enum: ['Srikanth', 'Neelu'] } },
};

export const TOOLS = [
  {
    name: 'query_spending',
    description:
      'Sum monthly-sheet entries with optional filters, grouped by up to two dimensions. Use for every total, trend, comparison or ranking. ' +
      'Returns rows {<group keys>, total, count} plus grand_total.',
    input_schema: {
      type: 'object',
      properties: {
        group_by: { type: 'array', items: { type: 'string', enum: ['year', 'month', 'category', 'item', 'payer'] }, maxItems: 2 },
        ...FILTER_PROPS,
        sort: { type: 'string', enum: ['total_desc', 'key_asc'], description: 'Default: key_asc when grouping by year/month, else total_desc' },
        limit: { type: 'integer', description: 'Max rows returned (default 60, max 200)' },
      },
    },
  },
  {
    name: 'list_entries',
    description: 'List individual entries (month, item, category, payer, amount, breakdown) matching filters. Use to see what makes up a total.',
    input_schema: {
      type: 'object',
      properties: { ...FILTER_PROPS, sort: { type: 'string', enum: ['amount_desc', 'month_desc', 'month_asc'] }, limit: { type: 'integer', description: 'default 40, max 100' } },
    },
  },
  {
    name: 'get_project_items',
    description:
      'Items from the separate project ledgers (Imperia flat: builder Payments, Interiors milestones, Essentials bought for the home). ' +
      'These are NOT part of the monthly totals, and some overlap with monthly rows (e.g. Interiors in 2026) — never add both together without saying so.',
    input_schema: { type: 'object', properties: { project: { type: 'string' }, section: { type: 'string', enum: ['Payments', 'Interiors', 'Essentials'] } } },
  },
  {
    name: 'show_chart',
    description:
      'Display a chart to the user above your reply. Call it after you have the numbers. Use line for change over time with many points, ' +
      'bar for a few periods, stacked_bar for parts of a whole over time (e.g. per payer per year), hbar for ranking categories/items. ' +
      'Never pie. Max 6 series. data is an array of objects keyed by x_key and each series key; values are rupee amounts (numbers).',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['line', 'bar', 'stacked_bar', 'hbar'] },
        title: { type: 'string' },
        x_key: { type: 'string', description: 'Field holding the x label, e.g. "label"' },
        series: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, label: { type: 'string' } }, required: ['key'] }, maxItems: 6 },
        data: { type: 'array', items: { type: 'object' }, maxItems: 120 },
      },
      required: ['type', 'title', 'x_key', 'series', 'data'],
    },
  },
];

const round = (n) => Math.round(n);

export function runTool(name, input, { entries, projectItems }) {
  input = input || {};
  if (name === 'query_spending') {
    const groupBy = (input.group_by || []).slice(0, 2);
    const filtered = filterEntries(entries, input);
    let rows = groupSum(filtered, groupBy).map((r) => ({ ...r, total: round(r.total) }));
    const timeGrouped = groupBy.some((g) => g === 'month' || g === 'year');
    const sort = input.sort || (timeGrouped ? 'key_asc' : 'total_desc');
    rows.sort(sort === 'total_desc' ? (a, b) => b.total - a.total
      : (a, b) => groupBy.map((g) => String(a[g]).localeCompare(String(b[g]))).find((x) => x) || 0);
    const limit = Math.min(input.limit || 60, 200);
    return { grand_total: round(sum(filtered)), entry_count: filtered.length, rows: rows.slice(0, limit), truncated: rows.length > limit };
  }
  if (name === 'list_entries') {
    const filtered = filterEntries(entries, input);
    const sort = input.sort || 'amount_desc';
    const sorted = [...filtered].sort(
      sort === 'amount_desc' ? (a, b) => b.amount - a.amount
        : sort === 'month_asc' ? (a, b) => String(a.month).localeCompare(String(b.month))
          : (a, b) => String(b.month).localeCompare(String(a.month)),
    );
    const limit = Math.min(input.limit || 40, 100);
    return {
      total_matching: filtered.length,
      sum_matching: round(sum(filtered)),
      entries: sorted.slice(0, limit).map((e) => ({ month: monthKey(e.month), item: e.item, category: e.category, payer: e.payer, amount: Number(e.amount), ...(e.breakdown ? { breakdown: e.breakdown } : {}) })),
    };
  }
  if (name === 'get_project_items') {
    const list = projectItems.filter((p) => (!input.project || p.project.toLowerCase() === input.project.toLowerCase()) && (!input.section || p.section === input.section));
    const bySection = {};
    list.forEach((p) => (bySection[p.section] = round((bySection[p.section] || 0) + Number(p.amount))));
    return {
      totals_by_section: bySection,
      gifts_total: round(list.filter((p) => p.is_gift).reduce((a, p) => a + Number(p.amount), 0)),
      items: list.map((p) => ({ section: p.section, label: p.label, date: p.date, payer: p.payer, amount: Number(p.amount), is_gift: p.is_gift || undefined })),
    };
  }
  if (name === 'show_chart') {
    return { shown: true };
  }
  return { error: `unknown tool ${name}` };
}

export function systemPrompt({ entries, projectItems, today }) {
  const months = [...new Set(entries.map((e) => monthKey(e.month)))].sort();
  const cats = groupSum(entries, ['category']).sort((a, b) => b.total - a.total);
  const items = groupSum(entries, ['item', 'category']).filter((r) => r.count >= 6).sort((a, b) => b.count - a.count);
  const years = groupSum(entries, ['year']).sort((a, b) => a.year.localeCompare(b.year));
  const latest = months[months.length - 1];
  const projects = [...new Set(projectItems.map((p) => p.project))];
  return `You are the finance assistant inside FinTrack, a private household spending tracker for Srikanth and his wife Neelu (India). Today is ${today}.

DATA (read-only — you cannot add, edit or delete anything; if asked, tell the user to do it on the Month tab):
- Monthly sheet entries: ${entries.length} rows from ${months[0]} to ${latest}. Each row = month, item ("Paid for"), category, payer (Srikanth or Neelu), amount in INR. Breakdown = the pieces of an Excel-style sum (e.g. several credit card bills).
- These mirror their Excel tabs: one month block per month; "total expenditure" there = everything including Home Loan EMIs, Credit Card bill payments and Savings transfers.
- Credit Card rows are bill payments; the underlying purchases are not itemised, so don't double count them against other categories.
- Yearly totals: ${years.map((y) => `${y.year} ₹${round(y.total).toLocaleString('en-IN')}`).join(', ')}${latest && Number(latest.slice(5)) < 12 ? ` (${latest.slice(0, 4)} is year-to-date through ${latest})` : ''}.
- Categories (all-time total): ${cats.map((c) => `${c.category} ₹${round(c.total).toLocaleString('en-IN')}`).join('; ')}.
- Regular items (item → category, months seen): ${items.map((i) => `${i.item} → ${i.category} (${i.count})`).join('; ')}.
- Separate project ledgers (not in monthly totals): ${projects.join(', ') || 'none'} — use get_project_items.

HOW TO ANSWER:
- Always get numbers from tools; never estimate or do arithmetic in your head across many rows. One query_spending call with group_by usually answers a trend question.
- When the answer is a trend, comparison or breakdown, call show_chart with the numbers you fetched (x labels like "2025" or "Mar '26"; use payer names or category names as series labels so colours match the app).
- Write rupees Indian-style: ₹1,52,000 or ₹1.52L / ₹2.4Cr for big numbers.
- Be brief: lead with the answer in a sentence or two, then at most a few bullets of what stands out. No preamble, no restating the question, no tables (the chart covers that).
- If the data can't answer it (e.g. income, investments' current value), say so plainly.`;
}

/**
 * Run the tool loop. anthropic: an Anthropic SDK client (or a stub with messages.create).
 * Returns { reply, charts, usage }.
 */
export async function runChat({ messages, entries, projectItems, anthropic, model, today, maxTurns = 8 }) {
  const ctx = { entries, projectItems };
  const system = systemPrompt({ entries, projectItems, today });
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));
  const charts = [];
  const usage = { input_tokens: 0, output_tokens: 0 };

  for (let turn = 0; turn < maxTurns; turn++) {
    const res = await anthropic.messages.create({ model, max_tokens: 2048, system, tools: TOOLS, messages: convo });
    usage.input_tokens += res.usage?.input_tokens || 0;
    usage.output_tokens += res.usage?.output_tokens || 0;
    const toolUses = res.content.filter((b) => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || !toolUses.length) {
      const reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { reply: reply || (charts.length ? '' : 'I couldn’t produce an answer for that.'), charts, usage };
    }
    convo.push({ role: 'assistant', content: res.content });
    const results = toolUses.map((tu) => {
      let out;
      try {
        out = runTool(tu.name, tu.input, ctx);
        if (tu.name === 'show_chart') charts.push(sanitizeChart(tu.input));
      } catch (err) {
        out = { error: String(err.message || err) };
      }
      return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) };
    });
    convo.push({ role: 'user', content: results });
  }
  return { reply: 'That took too many steps — try asking a narrower question.', charts, usage };
}

function sanitizeChart(c) {
  const type = ['line', 'bar', 'stacked_bar', 'hbar'].includes(c?.type) ? c.type : 'bar';
  const series = (Array.isArray(c?.series) ? c.series : []).slice(0, 6).map((s) => ({ key: String(s.key), label: String(s.label || s.key) }));
  const data = (Array.isArray(c?.data) ? c.data : []).slice(0, 120).map((d) => {
    const row = {};
    for (const [k, v] of Object.entries(d || {})) row[k] = typeof v === 'number' ? v : String(v);
    return row;
  });
  return { type, title: String(c?.title || ''), x_key: String(c?.x_key || 'label'), series, data };
}

export { yearOf };
