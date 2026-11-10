import { useEffect, useMemo, useRef, useState } from 'react';
import { store } from '../lib/store';
import { monthKey, monthRows, addMonths, sum, suggestNewMonth } from '../lib/aggregate';
import { inr, monthLabel, currentMonth, parseAmount, amountText } from '../lib/format';
import { PEOPLE, PERSON_COLOR, CATEGORIES, NON_SPEND } from '../config';
import NewMonth from './NewMonth';

export default function MonthView({ entries, setEntries, onError }) {
  const months = useMemo(() => [...new Set(entries.map((e) => monthKey(e.month)))].sort(), [entries]);
  const latest = months.length ? `${months[months.length - 1]}-01` : currentMonth();
  const nextAfterLatest = addMonths(latest, 1);
  const [month, setMonth] = useState(() => (months.includes(monthKey(currentMonth())) ? currentMonth() : latest));

  const rows = useMemo(() => monthRows(entries, month), [entries, month]);
  const monthEntries = useMemo(() => entries.filter((e) => monthKey(e.month) === monthKey(month)), [entries, month]);
  const prevEntries = useMemo(() => entries.filter((e) => monthKey(e.month) === monthKey(addMonths(month, -1))), [entries, month]);
  const knownItems = useMemo(() => {
    const last = new Map();
    for (const e of entries) if (!last.has(e.item) || e.month > last.get(e.item).month) last.set(e.item, e);
    return last;
  }, [entries]);
  const categories = useMemo(() => [...new Set([...CATEGORIES, ...entries.map((e) => e.category)])], [entries]);

  const total = sum(monthEntries);
  const prevTotal = sum(prevEntries);
  const spend = sum(monthEntries.filter((e) => !NON_SPEND.includes(e.category)));
  const delta = prevTotal ? (total - prevTotal) / prevTotal : null;
  const [skipNew, setSkipNew] = useState(false);
  useEffect(() => setSkipNew(false), [month]);
  const showNew = rows.length === 0 && !skipNew && suggestNewMonth(entries, month).length > 0;
  const idx = months.indexOf(monthKey(month));
  const showStartBanner = monthKey(latest) < monthKey(currentMonth()) && monthKey(month) !== monthKey(nextAfterLatest);

  // ── mutations (optimistic where safe) ────────────────────────────────────
  async function saveCell(row, payer, text) {
    const existing = row.byPayer[payer];
    const parsed = parseAmount(text);
    try {
      if (!parsed || parsed.amount === 0) {
        if (!existing) return;
        const others = Object.values(row.byPayer).filter((e) => e.id !== existing.id);
        if (others.length) {
          await store.deleteEntries([existing.id]);
          setEntries((es) => es.filter((e) => e.id !== existing.id));
        } else {
          // last cell in the row: keep the row as a ₹0 placeholder; use × to remove it
          const saved = await store.saveEntry({ ...existing, amount: 0, breakdown: null });
          setEntries((es) => es.map((e) => (e.id === existing.id ? saved : e)));
        }
        return;
      }
      const saved = await store.saveEntry({
        ...(existing || { month, item: row.item, category: row.category, payer, pos: row.pos }),
        amount: parsed.amount,
        breakdown: parsed.breakdown,
      });
      setEntries((es) => (existing ? es.map((e) => (e.id === existing.id ? saved : e)) : [...es, saved]));
    } catch (err) {
      onError(err.message);
    }
  }

  async function setCategory(row, category) {
    try {
      await store.updateItem(row.item, { category });
      setEntries((es) => es.map((e) => (e.item === row.item ? { ...e, category } : e)));
    } catch (err) { onError(err.message); }
  }

  async function renameRow(row, item) {
    item = item.trim();
    if (!item || item === row.item) return;
    if (rows.some((r) => r.item === item)) return onError(`“${item}” is already in this month`);
    try {
      await store.updateItem(row.item, { item }, month);
      setEntries((es) => es.map((e) => (e.item === row.item && monthKey(e.month) === monthKey(month) ? { ...e, item } : e)));
    } catch (err) { onError(err.message); }
  }

  async function deleteRow(row) {
    const ids = Object.values(row.byPayer).map((e) => e.id);
    try {
      await store.deleteEntries(ids);
      setEntries((es) => es.filter((e) => !ids.includes(e.id)));
    } catch (err) { onError(err.message); }
  }

  async function addRow({ item, category, amounts }) {
    const pos = Math.max(0, ...rows.map((r) => r.pos)) + 1;
    const toInsert = PEOPLE.filter((p) => amounts[p]?.amount).map((p) => ({
      month, item, category, payer: p, amount: amounts[p].amount, breakdown: amounts[p].breakdown, pos,
    }));
    if (!toInsert.length) return;
    try {
      const saved = await store.insertEntries(toInsert);
      setEntries((es) => [...es, ...saved]);
    } catch (err) { onError(err.message); }
  }

  async function createMonth(newRows) {
    try {
      const saved = await store.insertEntries(newRows);
      setEntries((es) => [...es, ...saved]);
    } catch (err) { onError(err.message); }
  }

  return (
    <div>
      {showStartBanner && (
        <div className="banner">
          <span>{monthLabel(nextAfterLatest, true)} hasn’t been started yet.</span>
          <button className="btn primary sm" onClick={() => setMonth(nextAfterLatest)}>Start {monthLabel(nextAfterLatest, true)}</button>
        </div>
      )}

      <div className="row spread" style={{ marginBottom: 16 }}>
        <div className="month-nav">
          <button aria-label="Previous month" disabled={idx === 0} onClick={() => setMonth(idx === -1 ? latest : `${months[idx - 1]}-01`)}>‹</button>
          <div className="title">{monthLabel(month, true)}</div>
          <button aria-label="Next month" disabled={monthKey(month) >= monthKey(nextAfterLatest)}
            onClick={() => setMonth(idx === months.length - 1 || idx === -1 ? nextAfterLatest : `${months[idx + 1]}-01`)}>›</button>
        </div>
        <select className="select" value={monthKey(month)} onChange={(e) => setMonth(`${e.target.value}-01`)} aria-label="Jump to month">
          {!months.includes(monthKey(month)) && <option value={monthKey(month)}>{monthLabel(month, true)}</option>}
          {[...months].reverse().map((m) => <option key={m} value={m}>{monthLabel(m, true)}</option>)}
        </select>
      </div>

      {showNew ? (
        <NewMonth key={month} month={month} entries={entries} onCreate={createMonth} onSkip={() => setSkipNew(true)} />
      ) : (
        <>
          <div className="tiles">
            <div className="card tile">
              <div className="label">Total</div>
              <div className="value">{inr(total)}</div>
              <div className="sub">
                {delta === null ? 'no previous month' : (
                  <><span className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta * 100).toFixed(0)}%</span> vs {monthLabel(addMonths(month, -1))}</>
                )}
              </div>
            </div>
            {PEOPLE.map((p) => (
              <div className="card tile" key={p}>
                <div className="label"><span className="dot" style={{ background: PERSON_COLOR[p] }} />{p}</div>
                <div className="value">{inr(sum(monthEntries.filter((e) => e.payer === p)))}</div>
                <div className="sub">{monthEntries.filter((e) => e.payer === p && e.amount).length} items</div>
              </div>
            ))}
            <div className="card tile">
              <div className="label">Spend</div>
              <div className="value">{inr(spend)}</div>
              <div className="sub">excl. savings, loans &amp; EMIs</div>
            </div>
          </div>

          <div className="card" style={{ padding: '6px 8px' }}>
            <table className="sheet">
              <thead>
                <tr>
                  <th>Paid for</th>
                  <th className="cat-col">Category</th>
                  {PEOPLE.map((p) => <th key={p} className="amt"><span className="dot" style={{ background: PERSON_COLOR[p] }} />{p}</th>)}
                  <th className="act" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <SheetRow key={r.item} row={r} categories={categories}
                    onSave={saveCell} onCategory={setCategory} onRename={renameRow} onDelete={deleteRow} />
                ))}
                <AddRow knownItems={knownItems} categories={categories} existing={rows.map((r) => r.item)} onAdd={addRow} />
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="cat-col" />
                  {PEOPLE.map((p) => <td key={p} className="amt num" style={{ paddingRight: 18 }}>{inr(sum(monthEntries.filter((e) => e.payer === p)))}</td>)}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="muted small">Tip: type sums the way you do in Excel — <span className="num">10753+10193</span> — and the pieces are kept.</p>
        </>
      )}
    </div>
  );
}

function SheetRow({ row, categories, onSave, onCategory, onRename, onDelete }) {
  const [confirm, setConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  return (
    <tr>
      <td className="item-name">
        {editingName ? (
          <input className="input" autoFocus defaultValue={row.item} style={{ width: '100%', padding: '5px 8px' }}
            onBlur={(e) => { setEditingName(false); if (e.target.dataset.cancel !== '1') onRename(row, e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.dataset.cancel = '1'; e.target.blur(); } }} />
        ) : (
          <span onDoubleClick={() => setEditingName(true)} title="Double-click to rename in this month">{row.item}</span>
        )}
      </td>
      <td className="cat-col">
        <select className="cat-select" value={row.category} onChange={(e) => onCategory(row, e.target.value)} title="Changes this item's category in every month">
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
      </td>
      {PEOPLE.map((p) => (
        <td key={p} className="amt"><AmountCell entry={row.byPayer[p]} onSave={(t) => onSave(row, p, t)} /></td>
      ))}
      <td className="act">
        <button className="icon-btn" title={confirm ? 'Click again to delete' : 'Delete row'} onClick={() => (confirm ? onDelete(row) : setConfirm(true))}>
          {confirm ? <span className="small" style={{ color: 'var(--danger)' }}>Delete?</span> : '×'}
        </button>
      </td>
    </tr>
  );
}

function AmountCell({ entry, onSave }) {
  const [editing, setEditing] = useState(false);
  const cancel = useRef(false);
  if (editing) {
    return (
      <input className="cell-input" autoFocus defaultValue={entry?.amount ? amountText(entry) : ''} inputMode="decimal"
        onFocus={(e) => e.target.select()}
        onBlur={(e) => {
          setEditing(false);
          if (!cancel.current && e.target.value !== (entry?.amount ? amountText(entry) : '')) onSave(e.target.value);
          cancel.current = false;
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { cancel.current = true; e.target.blur(); } }} />
    );
  }
  const parts = entry?.breakdown?.length > 1 ? entry.breakdown : null;
  return (
    <button className={`cell ${entry?.amount ? '' : 'empty'}`} onClick={() => setEditing(true)}
      title={parts ? parts.map((n) => inr(n)).join(' + ') : entry && !entry.amount ? 'Waiting for amount' : undefined}>
      {parts && <span className="sum-hint">Σ{parts.length}</span>}
      {entry?.amount ? inr(entry.amount) : entry ? '…' : '—'}
    </button>
  );
}

function AddRow({ knownItems, categories, existing, onAdd }) {
  const [item, setItem] = useState('');
  const [category, setCategory] = useState('Other');
  const [amounts, setAmounts] = useState({});
  const options = useMemo(() => [...knownItems.values()].sort((a, b) => b.month.localeCompare(a.month)).map((e) => e.item).filter((i) => !existing.includes(i)), [knownItems, existing]);
  const parsed = Object.fromEntries(PEOPLE.map((p) => [p, parseAmount(amounts[p])]));
  const valid = item.trim() && !existing.includes(item.trim()) && PEOPLE.some((p) => parsed[p]?.amount);

  function onItem(v) {
    setItem(v);
    const known = knownItems.get(v.trim());
    if (known) setCategory(known.category);
  }
  async function submit() {
    if (!valid) return;
    await onAdd({ item: item.trim(), category, amounts: parsed });
    setItem(''); setAmounts({}); setCategory('Other');
  }
  const onKey = (e) => e.key === 'Enter' && submit();

  return (
    <tr className="add-row">
      <td colSpan={PEOPLE.length + 3}>
        <div className="add-grid">
          <input className="input item" list="known-items" placeholder="+ Add item (e.g. Swiggy)" value={item} onChange={(e) => onItem(e.target.value)} onKeyDown={onKey} aria-label="New item" />
          <datalist id="known-items">{options.map((o) => <option key={o} value={o} />)}</datalist>
          <select className="select cat" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          {PEOPLE.map((p) => (
            <input key={p} className="input amt-in" inputMode="decimal" placeholder={p} aria-label={`${p} amount`}
              value={amounts[p] || ''} onChange={(e) => setAmounts({ ...amounts, [p]: e.target.value })} onKeyDown={onKey} />
          ))}
          <button className="btn primary sm add" disabled={!valid} onClick={submit}>Add</button>
        </div>
      </td>
    </tr>
  );
}
