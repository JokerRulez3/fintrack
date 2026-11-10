// Pure data helpers shared by the UI and the /api/chat function. No browser or Node APIs here.

export const monthKey = (d) => String(d).slice(0, 7); // '2026-03'
export const yearOf = (d) => Number(String(d).slice(0, 4));

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** Filter entries. All filters optional. Month bounds are 'YYYY-MM' inclusive. */
export function filterEntries(entries, f = {}) {
  const cats = f.categories?.length ? new Set(f.categories.map(norm)) : null;
  const exCats = f.exclude_categories?.length ? new Set(f.exclude_categories.map(norm)) : null;
  const payers = f.payers?.length ? new Set(f.payers.map(norm)) : null;
  const items = f.items?.length ? f.items.map(norm) : null;
  const exItems = f.exclude_items?.length ? f.exclude_items.map(norm) : null;
  return entries.filter((e) => {
    const m = monthKey(e.month);
    if (f.from_month && m < f.from_month) return false;
    if (f.to_month && m > f.to_month) return false;
    if (cats && !cats.has(norm(e.category))) return false;
    if (exCats && exCats.has(norm(e.category))) return false;
    if (payers && !payers.has(norm(e.payer))) return false;
    if (items && !items.some((i) => norm(e.item).includes(i))) return false;
    if (exItems && exItems.some((i) => norm(e.item).includes(i))) return false;
    return true;
  });
}

const KEYFN = {
  year: (e) => String(yearOf(e.month)),
  month: (e) => monthKey(e.month),
  category: (e) => e.category,
  item: (e) => e.item,
  payer: (e) => e.payer,
};

/** Group and sum. groupBy: array of 'year'|'month'|'category'|'item'|'payer'. */
export function groupSum(entries, groupBy = []) {
  const map = new Map();
  for (const e of entries) {
    const keys = groupBy.map((g) => KEYFN[g](e));
    const k = keys.join('\u0001');
    let row = map.get(k);
    if (!row) {
      row = Object.fromEntries(groupBy.map((g, i) => [g, keys[i]]));
      row.total = 0;
      row.count = 0;
      map.set(k, row);
    }
    row.total += Number(e.amount);
    row.count += 1;
  }
  const rows = [...map.values()];
  rows.forEach((r) => (r.total = Math.round(r.total * 100) / 100));
  return rows;
}

export const sum = (entries) => Math.round(entries.reduce((a, e) => a + Number(e.amount), 0) * 100) / 100;

/** Entries for one month merged into sheet-like rows: { item, category, byPayer: {Srikanth: entry} } */
export function monthRows(entries, month) {
  const rows = new Map();
  for (const e of entries) {
    if (monthKey(e.month) !== monthKey(month)) continue;
    let r = rows.get(e.item);
    if (!r) {
      r = { item: e.item, category: e.category, pos: e.pos ?? 1000, byPayer: {} };
      rows.set(e.item, r);
    }
    r.byPayer[e.payer] = e;
    r.pos = Math.min(r.pos, e.pos ?? 1000);
  }
  return [...rows.values()].sort((a, b) => a.pos - b.pos || a.item.localeCompare(b.item));
}

export const addMonths = (month, n) => {
  const [y, m] = monthKey(month).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
};

/**
 * Suggest the rows for a new month: every item that appeared in at least 2 of the
 * last 3 months, carrying last month's amount per payer (or the latest one seen).
 */
export function suggestNewMonth(entries, newMonth) {
  const prev = [1, 2, 3].map((n) => monthKey(addMonths(newMonth, -n)));
  const seen = new Map();
  const sorted = [...entries].sort((a, b) => String(b.month).localeCompare(String(a.month)));
  for (const e of sorted) {
    const m = monthKey(e.month);
    if (!prev.includes(m)) continue;
    let s = seen.get(e.item);
    if (!s) {
      s = { item: e.item, category: e.category, months: new Set(), byPayer: {}, pos: e.pos ?? 1000, lastMonth: m };
      seen.set(e.item, s);
    }
    s.months.add(m);
    if (s.byPayer[e.payer] === undefined && m === s.lastMonth) s.byPayer[e.payer] = Number(e.amount);
    if (m === s.lastMonth) s.pos = Math.min(s.pos, e.pos ?? 1000);
  }
  return [...seen.values()]
    .map((s) => ({ ...s, recurring: s.months.size >= 2 }))
    .sort((a, b) => (b.recurring - a.recurring) || a.pos - b.pos);
}

/** Fixed colour per category, assigned once from all-time totals so a category never changes colour between views. */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const OTHER_COLOR = '#5b6475';
export function categoryColors(entries, slots = 7) {
  const totals = groupSum(entries, ['category']).sort((a, b) => b.total - a.total);
  const map = {};
  totals.forEach((r, i) => (map[r.category] = i < slots ? SERIES[i] : null));
  return map;
}
