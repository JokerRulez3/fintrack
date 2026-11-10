const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const inr = (n) =>
  (n < 0 ? '−' : '') + '₹' + Math.abs(Math.round(Number(n) || 0)).toLocaleString('en-IN');

/** Short form for chart axes and tiles: ₹1.52L, ₹2.4Cr */
export function inrShort(n) {
  const a = Math.abs(Number(n) || 0);
  const s = n < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(a >= 1e8 ? 1 : 2)}Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(a >= 1e6 ? 1 : 2)}L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return `${s}₹${Math.round(a)}`;
}

export const monthLabel = (d, long = false) => {
  const [y, m] = String(d).slice(0, 7).split('-').map(Number);
  return long ? `${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ’${String(y).slice(2)}`;
};

export const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

/**
 * Parse what you'd type into an Excel cell: "10753+10193", "=(21000-15000)", "1,52,000".
 * Returns { amount, breakdown } or null when it isn't a number/sum.
 */
export function parseAmount(text) {
  let s = String(text ?? '').trim().replace(/^=/, '').replace(/[₹,\s]/g, '');
  if (!s) return null;
  s = s.replace(/^\((.*)\)$/, '$1');
  if (!/^[+-]?\d+(\.\d+)?([+-]\d+(\.\d+)?)*$/.test(s)) return null;
  const parts = s.match(/[+-]?\d+(\.\d+)?/g).map(Number);
  const amount = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
  return { amount, breakdown: parts.length > 1 ? parts : null };
}

export const amountText = (e) =>
  !e ? '' : e.breakdown?.length > 1
    ? e.breakdown.map((n, i) => (i && n >= 0 ? '+' : '') + n).join('')
    : String(Number(e.amount));
