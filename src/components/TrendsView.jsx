import { useMemo, useState } from 'react';
import { groupSum, yearOf, monthKey, addMonths, filterEntries } from '../lib/aggregate';
import { inr, monthLabel } from '../lib/format';
import { PEOPLE } from '../config';
import Chart from './Chart';

export default function TrendsView({ entries, colors }) {
  const years = useMemo(() => [...new Set(entries.map((e) => yearOf(e.month)))].sort(), [entries]);
  const latest = useMemo(() => entries.reduce((m, e) => (e.month > m ? e.month : m), ''), [entries]);
  const latestMonthNum = Number(monthKey(latest).slice(5));

  // yearly totals by person; current year flagged as year-to-date
  const yearly = useMemo(() => {
    const rows = groupSum(entries, ['year', 'payer']);
    return years.map((y) => {
      const r = { label: y === yearOf(latest) && latestMonthNum < 12 ? `${y} (to ${monthLabel(latest).slice(0, 3)})` : String(y) };
      PEOPLE.forEach((p) => (r[p] = rows.find((x) => x.year === String(y) && x.payer === p)?.total || 0));
      return r;
    });
  }, [entries, years, latest, latestMonthNum]);

  // tracker: a category or an item over time
  const categories = useMemo(() => groupSum(entries, ['category']).sort((a, b) => b.total - a.total).map((r) => r.category), [entries]);
  const topItems = useMemo(() => groupSum(entries, ['item']).filter((r) => r.count >= 6).sort((a, b) => b.total - a.total).map((r) => r.item), [entries]);
  const [track, setTrack] = useState('cat:Credit Card');
  const [grain, setGrain] = useState('month');
  const [range, setRange] = useState(24);

  const tracked = useMemo(() => {
    const [kind, name] = [track.slice(0, 4), track.slice(4)];
    const filtered = filterEntries(entries, kind === 'cat:' ? { categories: [name] } : { items: [name] })
      .filter((e) => kind === 'cat:' || e.item.toLowerCase() === name.toLowerCase());
    if (grain === 'year') {
      const g = groupSum(filtered, ['year']);
      return { name, data: years.map((y) => ({ label: String(y), value: g.find((r) => r.year === String(y))?.total || 0 })) };
    }
    const g = Object.fromEntries(groupSum(filtered, ['month']).map((r) => [r.month, r.total]));
    const data = [];
    for (let m = addMonths(latest, -(range - 1)); m <= latest; m = addMonths(m, 1)) {
      data.push({ label: monthLabel(m), value: g[monthKey(m)] ?? 0 });
    }
    return { name, data };
  }, [entries, track, grain, range, years, latest]);

  const trackedTotal = tracked.data.reduce((a, d) => a + d.value, 0);
  const nonZero = tracked.data.filter((d) => d.value).length || 1;

  return (
    <div className="stack">
      <div className="card">
        <h3>Every year, by person</h3>
        <Chart spec={{ type: 'stacked_bar', x_key: 'label', data: yearly, series: PEOPLE.map((p) => ({ key: p, label: p })) }} height={280} />
      </div>

      <div className="card">
        <div className="row spread" style={{ marginBottom: 12 }}>
          <div className="row">
            <h3 style={{ margin: 0 }}>Track</h3>
            <select className="select" value={track} onChange={(e) => setTrack(e.target.value)} aria-label="What to track">
              <optgroup label="Categories">{categories.map((c) => <option key={c} value={`cat:${c}`}>{c}</option>)}</optgroup>
              <optgroup label="Regular items">{topItems.map((i) => <option key={i} value={`itm:${i}`}>{i}</option>)}</optgroup>
            </select>
          </div>
          <div className="row">
            <div className="pills">
              <button className={`pill ${grain === 'month' ? 'on' : ''}`} onClick={() => setGrain('month')}>monthly</button>
              <button className={`pill ${grain === 'year' ? 'on' : ''}`} onClick={() => setGrain('year')}>yearly</button>
            </div>
            {grain === 'month' && (
              <select className="select" value={range} onChange={(e) => setRange(Number(e.target.value))} aria-label="Range">
                <option value={12}>last 12 months</option><option value={24}>last 24 months</option>
                <option value={36}>last 3 years</option><option value={84}>all years</option>
              </select>
            )}
          </div>
        </div>
        <Chart spec={{ type: grain === 'year' ? 'bar' : 'line', x_key: 'label', data: tracked.data,
          series: [{ key: 'value', label: tracked.name, color: colors[tracked.name] }] }} height={300} />
        <p className="muted small" style={{ marginBottom: 0 }}>
          {inr(trackedTotal)} over this range · average {inr(trackedTotal / nonZero)} per {grain} when it appears
        </p>
      </div>
    </div>
  );
}
