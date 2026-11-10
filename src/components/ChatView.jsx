import { useEffect, useRef, useState } from 'react';
import { store } from '../lib/store';
import Chart from './Chart';

const SUGGESTIONS = [
  'How has our total spend changed each year since 2020?',
  'Show credit card bills month by month for 2026',
  'What did the house (Imperia + fit-out) cost us in total?',
  'Which categories grew the most from 2025 to 2026?',
  'Split of who paid what this year',
  'What are our fixed monthly commitments right now?',
];

/** Minimal markdown: paragraphs, bullets, **bold**. No HTML injection. */
function Markdown({ text }) {
  const blocks = String(text).trim().split(/\n{2,}/);
  const inline = (s, k) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? <b key={`${k}-${i}`}>{p.slice(2, -2)}</b> : <span key={`${k}-${i}`}>{p}</span>);
  return blocks.map((b, bi) => {
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
      return <ul key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''), `${bi}-${li}`)}</li>)}</ul>;
    }
    return <p key={bi}>{lines.map((l, li) => <span key={li}>{li > 0 && <br />}{inline(l.replace(/^#+\s*/, ''), `${bi}-${li}`)}</span>)}</p>;
  });
}

export default function ChatView({ messages, setMessages }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const logRef = useRef(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setErr('');
    try {
      const history = next.slice(-12).map((m) => ({ role: m.role, content: m.content || '(chart)' }));
      const { reply, charts } = await store.chat(history);
      setMessages([...next, { role: 'assistant', content: reply, charts }]);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef}>
        {!messages.length && (
          <div style={{ maxWidth: 720 }}>
            <h2 style={{ margin: '8px 0 4px' }}>Ask about your money</h2>
            <p className="muted" style={{ marginTop: 0 }}>Claude reads your entries (read-only) and answers with numbers and charts. It can’t change anything.</p>
            <div className="suggest">{SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'user' ? m.content : (
              <>
                {m.charts?.map((c, ci) => <div key={ci} className="card chart-card"><Chart spec={c} height={280} /></div>)}
                <div className="body"><Markdown text={m.content} /></div>
              </>
            )}
          </div>
        ))}
        {busy && <div className="thinking">CRUNCHING NUMBERS…</div>}
        {err && <div className="err">{err}</div>}
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea rows={1} placeholder="e.g. How much did we spend on travel in 2025?" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button className="btn primary" disabled={busy || !input.trim()}>Ask</button>
        {messages.length > 0 && <button type="button" className="btn ghost" onClick={() => setMessages([])}>Clear</button>}
      </form>
    </div>
  );
}
