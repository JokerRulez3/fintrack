import { useCallback, useEffect, useMemo, useState } from 'react';
import { store } from './lib/store';
import { categoryColors } from './lib/aggregate';
import Login from './components/Login';
import MonthView from './components/MonthView';
import YearView from './components/YearView';
import TrendsView from './components/TrendsView';
import ProjectsView from './components/ProjectsView';
import ChatView from './components/ChatView';

const TABS = [
  ['month', 'Month'],
  ['year', 'Year'],
  ['trends', 'Trends'],
  ['imperia', 'Imperia'],
  ['ask', 'Ask AI'],
];

export default function App() {
  const [session, setSession] = useState(undefined);
  const [allowed, setAllowed] = useState(null);
  const [entries, setEntries] = useState(null);
  const [projectItems, setProjectItems] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem('fin.tab') || 'month'; } catch { return 'month'; }
  });
  const [chat, setChat] = useState([]); // kept here so switching tabs doesn't lose the conversation

  useEffect(() => {
    store.getSession().then(setSession);
    return store.onAuthChange((s) => setSession(s));
  }, []);

  const load = useCallback(async () => {
    try {
      const ok = await store.isAllowed();
      setAllowed(ok);
      if (!ok) return;
      const [e, p] = await Promise.all([store.loadEntries(), store.loadProjectItems()]);
      setEntries(e);
      setProjectItems(p);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  const colors = useMemo(() => (entries ? categoryColors(entries) : {}), [entries]);

  function go(t) {
    setTab(t);
    try { localStorage.setItem('fin.tab', t); } catch { /* private mode */ }
  }

  if (session === undefined) return <div className="spinner" />;
  if (!session) return <Login />;
  if (allowed === false) return <Login denied />;

  return (
    <>
      <header className="top">
        <div className="top-row">
          <div className="brand">₹ FINTRACK<span>{store.demo ? 'DEMO DATA' : session.user.email}</span></div>
          <button className="link" onClick={() => store.signOut()}>Sign out</button>
        </div>
        <nav className="tabs">
          {TABS.map(([k, label]) => (
            <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => go(k)}>{label}</button>
          ))}
        </nav>
      </header>
      <main>
        {error && <div className="err">{error}</div>}
        {!entries ? (
          <div className="spinner" />
        ) : tab === 'month' ? (
          <MonthView entries={entries} setEntries={setEntries} colors={colors} onError={setError} />
        ) : tab === 'year' ? (
          <YearView entries={entries} colors={colors} />
        ) : tab === 'trends' ? (
          <TrendsView entries={entries} colors={colors} />
        ) : tab === 'imperia' ? (
          <ProjectsView items={projectItems} setItems={setProjectItems} onError={setError} />
        ) : (
          <ChatView messages={chat} setMessages={setChat} />
        )}
      </main>
    </>
  );
}
