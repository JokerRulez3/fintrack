import { useMemo, useState } from 'react';
import { suggestNewMonth, monthKey, addMonths } from '../lib/aggregate';
import { inr, monthLabel, parseAmount } from '../lib/format';
import { PEOPLE, PERSON_COLOR } from '../config';

/** Replaces "copy last month's rows" in Excel: pick the regular items, adjust amounts, create. */
export default function NewMonth({ month, entries, onCreate, onSkip }) {
  const suggestions = useMemo(() => suggestNewMonth(entries, month), [entries, month]);
  const [state, setState] = useState(() =>
    Object.fromEntries(suggestions.map((s) => [s.item, {
      on: s.recurring,
      amounts: Object.fromEntries(PEOPLE.map((p) => [p, s.byPayer[p] != null ? String(s.byPayer[p]) : ''])),
    }])),
  );
  const [busy, setBusy] = useState(false);

  // A ticked row with no amount is still created (as a ₹0 placeholder, like the empty rows in the sheet)
  // under whoever paid it last time, so it's there to fill in when the bill arrives.
  const rows = suggestions.filter((s) => state[s.item]?.on).flatMap((s, i) => {
    const filled = PEOPLE.map((p) => ({ p, v: parseAmount(state[s.item].amounts[p]) })).filter(({ v }) => v?.amount);
    const base = { month, item: s.item, category: s.category, pos: i + 1 };
    if (!filled.length) {
      const payer = PEOPLE.find((p) => s.byPayer[p] != null) || PEOPLE[0];
      return [{ ...base, payer, amount: 0, breakdown: null }];
    }
    return filled.map(({ p, v }) => ({ ...base, payer: p, amount: v.amount, breakdown: v.breakdown }));
  });
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const set = (item, patch) => setState((st) => ({ ...st, [item]: { ...st[item], ...patch } }));

  return (
    <div className="card">
      <div className="row spread" style={{ marginBottom: 6 }}>
        <h3 style={{ margin: 0 }}>Start {monthLabel(month, true)}</h3>
        <span className="muted small">copied from {monthLabel(addMonths(month, -1), true)} — untick what doesn’t apply, fix amounts</span>
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>Ticked: items that showed up in at least 2 of the last 3 months. Leave an amount blank to fill it in when the bill arrives.</p>
      <div className="nm-row" style={{ borderBottom: '1px solid var(--border)' }}>
        <span />
        <span className="label">Paid for</span>
        {PEOPLE.map((p) => <span key={p} className="label" style={{ textAlign: 'right' }}><span className="dot" style={{ background: PERSON_COLOR[p] }} />{p}</span>)}
      </div>
      <div className="nm-list">
        {suggestions.map((s) => {
          const st = state[s.item];
          return (
            <label key={s.item} className={`nm-row ${st.on ? '' : 'off'}`}>
              <input type="checkbox" checked={st.on} onChange={(e) => set(s.item, { on: e.target.checked })} />
              <span>
                {s.item}
                {!s.recurring && <span className="muted small"> · one-off in {monthLabel(`${s.lastMonth}-01`)}</span>}
              </span>
              {PEOPLE.map((p) => (
                <input key={p} className="input" inputMode="decimal" placeholder="—" value={st.amounts[p]}
                  onChange={(e) => set(s.item, { amounts: { ...st.amounts, [p]: e.target.value } })} />
              ))}
            </label>
          );
        })}
      </div>
      <div className="row spread" style={{ marginTop: 16 }}>
        <span className="muted">{new Set(rows.map((r) => r.item)).size} items · <span className="num">{inr(total)}</span> · <button className="link" onClick={onSkip}>start blank instead</button></span>
        <button className="btn primary" disabled={busy || !rows.length}
          onClick={async () => { setBusy(true); await onCreate(rows); setBusy(false); }}>
          Create {monthLabel(month, true)}
        </button>
      </div>
      {monthKey(month) > monthKey(new Date().toISOString()) && <p className="muted small">This month is in the future — that’s fine if you’re planning ahead.</p>}
    </div>
  );
}
