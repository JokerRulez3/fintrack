import { useMemo, useState } from 'react';
import { store } from '../lib/store';
import { inr, parseAmount } from '../lib/format';
import { PEOPLE, PERSON_COLOR } from '../config';

const SECTIONS = ['Payments', 'Interiors', 'Essentials'];

/** The Imperia tabs: one-time project ledgers kept apart from monthly spending. */
export default function ProjectsView({ items, setItems, onError }) {
  const projects = useMemo(() => [...new Set(['Imperia', ...items.map((i) => i.project)])], [items]);
  const [project, setProject] = useState(projects[0]);
  const [section, setSection] = useState('Payments');
  const inProject = items.filter((i) => i.project === project);
  const list = inProject.filter((i) => i.section === section);
  const tot = (arr) => arr.reduce((a, i) => a + Number(i.amount), 0);
  const essentials = inProject.filter((i) => i.section === 'Essentials');

  async function add(row) {
    try {
      const saved = await store.saveProjectItem({ ...row, project, section });
      setItems((xs) => [...xs, saved]);
    } catch (err) { onError(err.message); }
  }
  async function remove(id) {
    try {
      await store.deleteProjectItem(id);
      setItems((xs) => xs.filter((x) => x.id !== id));
    } catch (err) { onError(err.message); }
  }

  return (
    <div>
      {projects.length > 1 && (
        <div className="pills" style={{ marginBottom: 12 }}>
          {projects.map((p) => <button key={p} className={`pill ${p === project ? 'on' : ''}`} onClick={() => setProject(p)}>{p}</button>)}
        </div>
      )}
      <div className="tiles">
        <div className="card tile">
          <div className="label">Payments to builder</div>
          <div className="value">{inr(tot(inProject.filter((i) => i.section === 'Payments')))}</div>
          <div className="sub">
            {PEOPLE.map((p) => `${p} ${inr(tot(inProject.filter((i) => i.section === 'Payments' && i.payer === p)))}`).join(' · ')}
          </div>
        </div>
        <div className="card tile">
          <div className="label">Interiors</div>
          <div className="value">{inr(tot(inProject.filter((i) => i.section === 'Interiors')))}</div>
          <div className="sub">{inProject.filter((i) => i.section === 'Interiors').length} milestones paid</div>
        </div>
        <div className="card tile">
          <div className="label">Essentials</div>
          <div className="value">{inr(tot(essentials))}</div>
          <div className="sub">{inr(tot(essentials.filter((i) => !i.is_gift)))} excluding gifts</div>
        </div>
      </div>

      <div className="card">
        <div className="pills" style={{ marginBottom: 12 }}>
          {SECTIONS.map((s) => <button key={s} className={`pill ${s === section ? 'on' : ''}`} onClick={() => setSection(s)}>{s}</button>)}
        </div>
        <table className="list-table">
          <thead>
            <tr>
              <th>{section === 'Payments' ? 'Payment' : section === 'Interiors' ? 'Phase' : 'Item'}</th>
              {section === 'Payments' && <th>Date</th>}
              {section === 'Essentials' && <th className="r">Cost × qty</th>}
              {section !== 'Interiors' && <th>Paid by</th>}
              <th className="r">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td>{i.label}{i.is_gift && <span className="muted small"> · gift</span>}</td>
                {section === 'Payments' && <td className="muted num small">{i.date ? new Date(i.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>}
                {section === 'Essentials' && <td className="r muted num small">{i.unit_cost ? `${inr(i.unit_cost)} × ${Number(i.qty || 1)}` : ''}</td>}
                {section !== 'Interiors' && <td>{i.payer ? <><span className="dot" style={{ background: PERSON_COLOR[i.payer] || '#5b6475' }} />{i.payer}</> : <span className="muted">—</span>}</td>}
                <td className="r num" title={i.breakdown?.length > 1 ? i.breakdown.map((n) => inr(n)).join(' + ') : undefined}>{inr(i.amount)}</td>
                <td className="r"><button className="icon-btn" title="Delete" onClick={() => remove(i.id)}>×</button></td>
              </tr>
            ))}
            <AddProjectItem section={section} onAdd={add} />
          </tbody>
          <tfoot>
            <tr>
              <td style={{ fontWeight: 700 }}>Total</td>
              {section === 'Payments' && <td />}
              {section === 'Essentials' && <td />}
              {section !== 'Interiors' && <td />}
              <td className="r num" style={{ fontWeight: 700 }}>{inr(tot(list))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="muted small">These ledgers sit apart from monthly totals, same as the separate Imperia tabs — some of these costs also appear as monthly rows (e.g. Interiors in 2026).</p>
    </div>
  );
}

function AddProjectItem({ section, onAdd }) {
  const blank = { label: '', date: '', payer: '', amount: '', unit: '', qty: '1', gift: false };
  const [f, setF] = useState(blank);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const unit = parseAmount(f.unit);
  const amount = section === 'Essentials' && unit ? { amount: unit.amount * (Number(f.qty) || 1), breakdown: null } : parseAmount(f.amount);
  const valid = f.label.trim() && amount?.amount;

  async function submit() {
    if (!valid) return;
    await onAdd({
      label: f.label.trim(), date: f.date || null, payer: f.payer || null, amount: amount.amount, breakdown: amount.breakdown,
      unit_cost: section === 'Essentials' ? unit?.amount ?? null : null, qty: section === 'Essentials' ? Number(f.qty) || 1 : null, is_gift: f.gift,
    });
    setF(blank);
  }
  const onKey = (e) => e.key === 'Enter' && submit();

  return (
    <tr className="add-row">
      <td><input className="input" style={{ width: '100%' }} placeholder="+ Add" value={f.label} onChange={set('label')} onKeyDown={onKey} /></td>
      {section === 'Payments' && <td><input className="input" type="date" value={f.date} onChange={set('date')} /></td>}
      {section === 'Essentials' && (
        <td className="r">
          <div className="row" style={{ gap: 4, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
            <input className="input" style={{ width: 90, textAlign: 'right' }} placeholder="cost" value={f.unit} onChange={set('unit')} onKeyDown={onKey} />
            <span className="muted">×</span>
            <input className="input" style={{ width: 48, textAlign: 'right' }} value={f.qty} onChange={set('qty')} onKeyDown={onKey} />
          </div>
        </td>
      )}
      {section !== 'Interiors' && (
        <td>
          <input className="input" list="payers" style={{ width: 120 }} placeholder="Paid by" value={f.payer} onChange={set('payer')} onKeyDown={onKey} />
          <datalist id="payers">{[...PEOPLE, 'Shashi', "Neela's Dad"].map((p) => <option key={p} value={p} />)}</datalist>
          {section === 'Essentials' && <label className="small muted" style={{ marginLeft: 8 }}><input type="checkbox" checked={f.gift} onChange={set('gift')} /> gift</label>}
        </td>
      )}
      <td className="r">
        {section === 'Essentials'
          ? <span className="num muted">{amount ? inr(amount.amount) : ''}</span>
          : <input className="input" style={{ width: 120, textAlign: 'right' }} inputMode="decimal" placeholder="0" value={f.amount} onChange={set('amount')} onKeyDown={onKey} />}
      </td>
      <td className="r"><button className="btn primary sm" disabled={!valid} onClick={submit}>Add</button></td>
    </tr>
  );
}
