// Vercel serverless function: POST /api/chat
// Keeps the Anthropic key on the server, checks who is calling, loads only that user's rows (Supabase RLS), runs the tool loop.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { runChat } from '../server/chat-core.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const ALLOWED = (process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';

export const config = { maxDuration: 60 };

async function loadAll(sb, table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

function validMessages(m) {
  return Array.isArray(m) && m.length > 0 && m.length <= 24 &&
    m.every((x) => (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string' && x.content.length <= 8000) &&
    m[m.length - 1].role === 'user';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY || !ALLOWED.length) {
    return res.status(500).json({ error: 'Server not configured: set ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY and ALLOWED_EMAILS in Vercel.' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  const email = userData?.user?.email?.toLowerCase();
  if (userErr || !email) return res.status(401).json({ error: 'Session expired — sign in again' });
  if (!ALLOWED.includes(email)) return res.status(403).json({ error: 'This account is not allowed to use the assistant' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (!validMessages(body.messages)) return res.status(400).json({ error: 'Bad request' });
  // conversation must alternate and start with the user for the Messages API
  const messages = [];
  for (const m of body.messages) {
    if (messages.length && messages[messages.length - 1].role === m.role) messages[messages.length - 1].content += `\n\n${m.content}`;
    else messages.push({ role: m.role, content: m.content });
  }
  while (messages[0]?.role === 'assistant') messages.shift();

  try {
    const [entries, projectItems] = await Promise.all([
      loadAll(sb, 'fin_entries', 'month,item,category,payer,amount,breakdown'),
      loadAll(sb, 'fin_project_items', 'project,section,label,date,payer,amount,is_gift'),
    ]);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const out = await runChat({
      messages,
      entries: entries.map((e) => ({ ...e, amount: Number(e.amount), breakdown: e.breakdown?.map(Number) ?? null })),
      projectItems,
      anthropic,
      model: MODEL,
      today,
    });
    return res.status(200).json({ reply: out.reply, charts: out.charts });
  } catch (err) {
    console.error('chat error', err);
    const msg = err?.status === 401 ? 'Anthropic API key rejected — check ANTHROPIC_API_KEY in Vercel'
      : err?.status === 404 ? `Model ${MODEL} not available — set CLAUDE_MODEL in Vercel`
        : err?.status === 429 ? 'Rate limited by the Claude API — try again in a minute'
          : 'Something went wrong answering that';
    return res.status(502).json({ error: msg });
  }
}
