import { useState } from 'react';
import { store } from '../lib/store';

export default function Login({ denied }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendLink() {
    setBusy(true); setErr('');
    const { error } = await store.signInEmail(email);
    if (error) setErr(error.message); else setSent(true);
    setBusy(false);
  }

  return (
    <div className="login">
      <div className="box">
        <div style={{ fontSize: 40 }}>₹</div>
        <h1>FINTRACK</h1>
        <p className="muted small" style={{ marginBottom: 28 }}>Household spending · private</p>
        {denied ? (
          <>
            <p className="err">This account isn’t on the FinTrack allow-list.</p>
            <button className="btn" onClick={() => store.signOut()}>Sign out</button>
          </>
        ) : sent ? (
          <p>Check your inbox for the sign-in link.</p>
        ) : (
          <>
            <button className="btn" style={{ width: '100%', background: '#fff', color: '#111', marginBottom: 16 }} onClick={() => store.signInGoogle()}>
              Continue with Google
            </button>
            <div className="muted small" style={{ marginBottom: 12 }}>or sign in with email</div>
            <input className="input" style={{ width: '100%', marginBottom: 8 }} type="email" placeholder="you@email.com"
              value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && email && sendLink()} />
            {err && <div className="err">{err}</div>}
            <button className="btn primary" style={{ width: '100%' }} disabled={!email || busy} onClick={sendLink}>
              {busy ? 'Sending…' : 'Send magic link'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
