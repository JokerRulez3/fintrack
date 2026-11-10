import { useMemo, useState } from 'react';
import { groupSum, sum, yearOf, monthKey } from '../lib/aggregate';
import { inr, monthLabel } from '../lib/format';
import { PEOPLE, PERSON_COLOR, NON_SPEND } from '../config';
import Chart from './Chart';

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

export default function YearView({ entries, colors }) {
  const years = useMemo(() => [...new Set(entries.map((e) => yearOf(e.month)))].sort(), [entries]);
  const [year, setYear] = useState(years[years.length - 1]);
  const [excluded, setExcluded] = useState([]);
  const [split, setSplit] = useState('category');

  const inYear = (y) => entries.filter((e) => yearOf(e.month) === y && !excluded.includes(e.category));
  const cur = useMemo(() => inYear(year), [entries, year, excluded]); // eslint-disable-line
  const prev = useMemo(() => inYear(year - 1), [entries, year, excluded]); // eslint-disable-line
  const monthsWithData = new Set(cur.map((e) => monthKey(e.month))).size || 1;
  const total = sum(cur);

  // monthly chart, stacked by category (top colours + "Other") or by payer
  const chart = useMemo(() => {
    const keyOf = split === 'payer' ? (e) => e.payer : (e) => (colors[e.category] ? e.category : 'Other');
    const keys = new Set();
    const data = MONTHS.map((m) => ({ label: monthLabel(`${year}-${m}-01`).slice(0, 3) }));
    for (const e of cur) {
      const k = keyOf(e);
      keys.add(k);
      const row = data[Number(monthKey(e.month).slice(5)) - 1];
      row[k] = (row[k] || 0) + Number(e.amount);
    }
    const order = split === 'payer' ? PEOPLE : Object.keys(colors).filter((c) => colors[c]).concat('Other');
    return { data, series: order.filter((k) => keys.has(k)).map((k) => ({ key: k, label: k })) };
  }, [cur, split, colors, year]);

  const byCat = useMemo(() => {
    const prevMap = Object.fromEntries(groupSum(prev, ['category']).map((r) => [r.category, r.total]));
    return groupSum(cur, ['category']).sort((a, b) => b.total - a.total).map((r) => ({ ...r, prev: prevMap[r.category] || 0 }));
  }, [cur, prev]);

  // one-offs: items that appear in at most 2 months of the year
  const oneOffs = useMemo(() => {
    const months = new Map();
    cur.forEach((e) => months.set(e.item, (months.get(e.item) || new Set()).add(monthKey(e.month))));
    return groupSum(cur.filter((e) => months.get(e.item).size <= 2), ['item', 'category'])
      .sort((a, b) => b.total - a.total).slice(0, 12)
      .map((r) => ({ ...r, months: [...months.get(r.item)].sort().map((m) => monthLabel(`${m}-01`).slice(0, 3)).join(', ') }));
  }, [cur]);

  const prevTotal = sum(prev);
  const maxCat = byCat[0]?.total || 1;

  return (
    <div>
      <div className="row spread" style={{ marginBottom: 16 }}>
        <div className="pills">
          {years.map((y) => <button key={y} className={`pill ${y === year ? 'on' : ''}`} onClick={() => setYear(y)}>{y}</button>)}
        </div>
        <div className="row">
          {NON_SPEND.map((c) => (
            <label className="chip" key={c}>
              <input type="checkbox" checked={!excluded.includes(c)}
                onChange={(e) => setExcluded(e.target.checked ? excluded.filter((x) => x !== c) : [...excluded, c])} />
              {c}
            </label>
          ))}
        </div>
      </div>

      <div className="tiles">
        <div className="card tile">
          <div className="label">{year} total</div>
          <div className="value">{inr(total)}</div>
          <div className="sub">
            {prevTotal ? <>{years.includes(year - 1) ? `${year - 1}: ${inr(prevTotal)}` : ''}</> : 'first year of data'}
          </div>
        </div>
        {PEOPLE.map((p) => {
          const t = sum(cur.filter((e) => e.payer === p));
          return (
            <div className="card tile" key={p}>
              <div className="label"><span className="dot" style={{ background: PERSON_COLOR[p] }} />{p}</div>
              <div className="value">{inr(t)}</div>
              <div className="sub">{total ? Math.round((t / total) * 100) : 0}% of the year</div>
            </div>
          );
        })}
        <div className="card tile">
          <div className="label">Monthly average</div>
          <div className="value">{inr(total / monthsWithData)}</div>
          <div className="sub">over {monthsWithData} month{monthsWithData > 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className="card">
        <div className="row spread">
          <h3 style={{ margin: 0 }}>Month by month</h3>
          <div className="pills">
            <button className={`pill ${split === 'category' ? 'on' : ''}`} onClick={() => setSplit('category')}>by category</button>
            <button className={`pill ${split === 'payer' ? 'on' : ''}`} onClick={() => setSplit('payer')}>by person</button>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Chart spec={{ type: 'stacked_bar', x_key: 'label', data: chart.data, series: chart.series }} colors={colors} height={320} />
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>Where it went</h3>
          <table className="list-table">
            <thead><tr><th>Category</th><th /><th className="r">{year}</th><th className="r">vs {year - 1}</th></tr></thead>
            <tbody>
              {byCat.map((r) => {
                const d = r.prev ? (r.total - r.prev) / r.prev : null;
                return (
                  <tr key={r.category}>
                    <td><span className="dot" style={{ background: colors[r.category] || '#5b6475' }} />{r.category}</td>
                    <td style={{ width: '24%' }}><div className="share"><div style={{ width: `${(r.total / maxCat) * 100}%`, background: colors[r.category] || '#5b6475' }} /></div></td>
                    <td className="r num">{inr(r.total)}</td>
                    <td className={`r small ${d > 0 ? 'up' : 'down'}`}>{d === null ? <span className="muted">new</span> : `${d > 0 ? '+' : ''}${Math.round(d * 100)}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Biggest one-offs</h3>
          <table className="list-table">
            <thead><tr><th>Item</th><th>When</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {oneOffs.map((r) => (
                <tr key={r.item}>
                  <td>{r.item}<div className="muted small">{r.category}</div></td>
                  <td className="muted small">{r.months}</td>
                  <td className="r num">{inr(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
