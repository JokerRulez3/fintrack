// Data access. Talks to Supabase in normal use; VITE_DEMO=1 runs fully in memory from /demo-data.json (local testing only).
import { createClient } from '@supabase/supabase-js';

const DEMO = import.meta.env.VITE_DEMO === '1';
const sb = DEMO ? null : createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

let demo = null;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
async function demoData() {
  if (!demo) {
    const d = await fetch('/demo-data.json').then((r) => r.json());
    demo = {
      entries: d.entries.map((e) => ({ id: uid(), ...e })),
      project_items: d.project_items.map((p) => ({ id: uid(), ...p })),
    };
  }
  return demo;
}
const DEMO_SESSION = { access_token: 'demo', user: { id: 'demo', email: 'demo@local' } };

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

const ENTRY_COLS = 'id,month,item,category,payer,amount,breakdown,note,pos';

export const store = {
  demo: DEMO,

  async getSession() {
    if (DEMO) return DEMO_SESSION;
    return (await sb.auth.getSession()).data.session;
  },
  onAuthChange(cb) {
    if (DEMO) return () => {};
    const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session));
    return () => data.subscription.unsubscribe();
  },
  signInGoogle: () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }),
  signInEmail: (email) => sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }),
  signOut: () => (DEMO ? null : sb.auth.signOut()),

  async isAllowed() {
    if (DEMO) return true;
    return Boolean(check(await sb.rpc('fin_is_allowed')));
  },

  async loadEntries() {
    if (DEMO) return [...(await demoData()).entries];
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = check(await sb.from('fin_entries').select(ENTRY_COLS).order('month').order('pos').range(from, from + 999));
      out.push(...rows);
      if (rows.length < 1000) return out.map((r) => ({ ...r, amount: Number(r.amount), breakdown: r.breakdown?.map(Number) ?? null }));
    }
  },

  async loadProjectItems() {
    if (DEMO) return [...(await demoData()).project_items];
    const rows = check(await sb.from('fin_project_items').select('*').order('date', { nullsFirst: false }).order('created_at'));
    return rows.map((r) => ({ ...r, amount: Number(r.amount), unit_cost: r.unit_cost == null ? null : Number(r.unit_cost) }));
  },

  /** Insert or update one entry; returns the saved row. */
  async saveEntry(e) {
    const row = { month: e.month, item: e.item, category: e.category, payer: e.payer, amount: e.amount, breakdown: e.breakdown ?? null, note: e.note ?? null, pos: e.pos ?? 1000 };
    if (DEMO) {
      const d = await demoData();
      if (e.id) {
        const i = d.entries.findIndex((x) => x.id === e.id);
        d.entries[i] = { ...d.entries[i], ...row };
        return d.entries[i];
      }
      const saved = { id: uid(), ...row };
      d.entries.push(saved);
      return saved;
    }
    const q = e.id
      ? sb.from('fin_entries').update(row).eq('id', e.id).select(ENTRY_COLS).single()
      : sb.from('fin_entries').insert(row).select(ENTRY_COLS).single();
    const saved = check(await q);
    return { ...saved, amount: Number(saved.amount), breakdown: saved.breakdown?.map(Number) ?? null };
  },

  async insertEntries(rows) {
    if (DEMO) {
      const d = await demoData();
      const saved = rows.map((r) => ({ id: uid(), ...r }));
      d.entries.push(...saved);
      return saved;
    }
    return check(await sb.from('fin_entries').insert(rows).select(ENTRY_COLS)).map((r) => ({ ...r, amount: Number(r.amount) }));
  },

  async deleteEntries(ids) {
    if (!ids.length) return;
    if (DEMO) {
      const d = await demoData();
      d.entries = d.entries.filter((x) => !ids.includes(x.id));
      return;
    }
    check(await sb.from('fin_entries').delete().in('id', ids));
  },

  /** Rename an item and/or change its category across one month or all history. */
  async updateItem(oldItem, { item, category }, month = null) {
    const patch = {};
    if (item) patch.item = item;
    if (category) patch.category = category;
    if (DEMO) {
      const d = await demoData();
      d.entries.forEach((x) => {
        if (x.item === oldItem && (!month || x.month === month)) Object.assign(x, patch);
      });
      return;
    }
    let q = sb.from('fin_entries').update(patch).eq('item', oldItem);
    if (month) q = q.eq('month', month);
    check(await q);
  },

  async saveProjectItem(p) {
    const row = { project: p.project, section: p.section, label: p.label, date: p.date || null, payer: p.payer || null, amount: p.amount, breakdown: p.breakdown ?? null, is_gift: Boolean(p.is_gift), unit_cost: p.unit_cost ?? null, qty: p.qty ?? null };
    if (DEMO) {
      const d = await demoData();
      const saved = { id: uid(), ...row };
      d.project_items.push(saved);
      return saved;
    }
    const saved = check(await sb.from('fin_project_items').insert(row).select('*').single());
    return { ...saved, amount: Number(saved.amount) };
  },

  async deleteProjectItem(id) {
    if (DEMO) {
      const d = await demoData();
      d.project_items = d.project_items.filter((x) => x.id !== id);
      return;
    }
    check(await sb.from('fin_project_items').delete().eq('id', id));
  },

  async chat(messages) {
    const session = await this.getSession();
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ messages }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Chat failed (${res.status})`);
    return body; // { reply, charts }
  },
};
