import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SERIES, OTHER_COLOR } from '../lib/aggregate';
import { inr, inrShort } from '../lib/format';
import { PERSON_COLOR } from '../config';

const AXIS = { stroke: '#26304a', tick: { fill: '#6b7690', fontSize: 11 }, tickLine: false };

/**
 * Generic chart used by the Year/Trends views and by AI chat answers.
 * spec: { type: 'bar'|'stacked_bar'|'line'|'hbar', title?, x_key, series:[{key,label,color?}], data:[{...}] }
 */
export function resolveColors(series, colors = {}) {
  let next = 0;
  return series.map((s) => ({
    ...s,
    color: s.color || PERSON_COLOR[s.label] || PERSON_COLOR[s.key] || colors[s.label] || colors[s.key]
      || (s.key === 'Other' || s.label === 'Other' ? OTHER_COLOR : SERIES[next++ % SERIES.length]),
  }));
}

function Tip({ active, payload, label, stacked }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value);
  const total = rows.reduce((a, p) => a + Number(p.value), 0);
  return (
    <div className="tt">
      <div className="h">{label}</div>
      {[...rows].reverse().map((p) => (
        <div className="r" key={p.dataKey}>
          <span><span className="dot" style={{ background: p.color || p.fill }} />{p.name}</span>
          <b>{inr(p.value)}</b>
        </div>
      ))}
      {stacked && rows.length > 1 && <div className="r tot"><span>Total</span><b>{inr(total)}</b></div>}
    </div>
  );
}

export default function Chart({ spec, colors, height = 300 }) {
  const { type = 'bar', x_key = 'label', data = [] } = spec;
  const series = resolveColors(spec.series?.length ? spec.series : [{ key: 'value', label: spec.title || 'Amount' }], colors);
  const stacked = type === 'stacked_bar';
  const showLegend = series.length > 1;

  if (type === 'hbar') {
    const s = series[0];
    const max = Math.max(1, ...data.map((d) => Math.abs(Number(d[s.key]) || 0)));
    return (
      <div>
        {spec.title && <h3>{spec.title}</h3>}
        <table className="list-table">
          <tbody>
            {data.map((d) => (
              <tr key={d[x_key]}>
                <td style={{ width: '38%' }}>{d[x_key]}</td>
                <td><div className="share"><div style={{ width: `${(Math.abs(d[s.key]) / max) * 100}%`, background: colors?.[d[x_key]] || s.color }} /></div></td>
                <td className="r num" style={{ width: 120 }}>{inr(d[s.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const Legend = showLegend && (
    <div className="legend">
      {series.map((s) => <span key={s.key}><span className="sw" style={{ background: s.color }} />{s.label || s.key}</span>)}
    </div>
  );

  return (
    <div>
      {spec.title && <h3>{spec.title}</h3>}
      {Legend}
      <ResponsiveContainer width="100%" height={height}>
        {type === 'line' ? (
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#141d31" vertical={false} />
            <XAxis dataKey={x_key} {...AXIS} minTickGap={16} />
            <YAxis {...AXIS} axisLine={false} width={64} tickFormatter={inrShort} />
            <Tooltip content={<Tip />} cursor={{ stroke: '#3a4766' }} />
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label || s.key} stroke={s.color} strokeWidth={2}
                animationDuration={400} dot={data.length <= 24 ? { r: 3, strokeWidth: 0, fill: s.color } : false} activeDot={{ r: 5, stroke: '#0a1120', strokeWidth: 2 }} connectNulls />
            ))}
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid stroke="#141d31" vertical={false} />
            <XAxis dataKey={x_key} {...AXIS} minTickGap={8} />
            <YAxis {...AXIS} axisLine={false} width={64} tickFormatter={inrShort} />
            <Tooltip content={<Tip stacked={stacked} />} cursor={{ fill: '#ffffff08' }} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label || s.key} fill={s.color} stackId={stacked ? 'a' : undefined}
                stroke={stacked ? '#0a1120' : undefined} strokeWidth={stacked ? 1 : 0}
                radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={48} animationDuration={400} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
