# FinTrack ₹

Your Expenditure Sheet as a web app: monthly sheet, year summaries, trends, the Imperia ledgers, and an AI chat that answers questions with charts.

Same stack as InvestIQ: **React (Vite) on Vercel + Supabase** for sign-in and data. The AI chat runs as a Vercel function (`api/chat.js`), so the Claude API key stays on the server and there's no separate Railway service.

## What's inside

| Tab | What it does |
|---|---|
| **Month** | The month block from your sheet, with Srikanth and Neelu columns. Click any amount to edit it, and type sums the way you do in Excel (`10753+10193`); the pieces are kept. Add rows at the bottom, where item names autocomplete. **Start next month** copies your regular items over with last month's amounts. |
| **Year** | Totals per person, a month-by-month chart by category or by person, category changes vs last year, and the biggest one-offs. Toggle Savings and Loans in or out. |
| **Trends** | Every year side by side, plus a tracker for any category or regular item, monthly or yearly. |
| **Imperia** | Payments to the builder, interior milestones, and essentials (with the gifts total), kept apart from the monthly totals like your separate tabs. |
| **Ask AI** | Claude reads your entries (read-only) through tools and answers with numbers and charts. |

## Deploy (about 15 minutes)

### 0. Revoke the leaked key first
`investiq-backend/env.reference.txt` has a real Anthropic key committed in it. Revoke it at console.anthropic.com → API Keys, create a new key, and put the new one only in Railway Variables and Vercel (step 3). Change that file to a placeholder.

### 1. Supabase: create the tables
Use the **same Supabase project as InvestIQ**. Every table here is prefixed `fin_`, so nothing clashes.
1. Supabase → SQL Editor → paste `supabase/schema.sql`.
2. Replace `YOUR_EMAIL` on the last line with the email you sign in with, then click **Run**.

### 2. GitHub: push this folder to a new **private** repo
```bash
cd fintrack
git init && git add . && git commit -m "FinTrack"
git branch -M main
git remote add origin https://github.com/JokerRulez3/fintrack.git
git push -u origin main
```
`.gitignore` keeps `.env`, `supabase/seed.sql` and the demo data out of git, since they contain your real numbers.

### 3. Vercel: import the repo
Vercel → Add New → Project → import `fintrack`. It detects Vite. Before you deploy, add these **Environment Variables**:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | same as InvestIQ's `REACT_APP_SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | same as InvestIQ's `REACT_APP_SUPABASE_ANON_KEY` |
| `ANTHROPIC_API_KEY` | your **new** key |
| `ALLOWED_EMAILS` | your sign-in email (comma-separate to add Neelu later) |
| `CLAUDE_MODEL` | optional, default `claude-sonnet-5-5` |

Then click Deploy.

### 4. Supabase: allow the new URL to sign in
Supabase → Authentication → URL Configuration → **Redirect URLs** → add your Vercel URL (e.g. `https://fintrack-xyz.vercel.app`). Leave InvestIQ's Site URL as it is; adding a redirect URL is enough.

### 5. Sign in once, then import your history
1. Open the Vercel URL and sign in (Google or magic link). The app will be empty.
2. Supabase → SQL Editor → paste `seed.sql` (sent separately), replace `YOUR_EMAIL`, and click **Run**. This loads 1,276 entries from 2020 to Nov 2026, plus 88 Imperia items.
3. Reload the app.

The import can be re-run safely: it replaces only imported rows and keeps anything you've added in the app.

## Letting Neelu in later
Add her email to `fin_allowed_emails` (SQL: `insert into fin_allowed_emails values ('her@email.com');`) and to `ALLOWED_EMAILS` in Vercel. Note that each person sees only their own rows today. Moving to one shared household ledger is a small schema change; ask when you want it.

## Local development
```bash
npm install
cp .env.example .env.local   # fill in the Supabase values
npm run dev                  # uses your real Supabase data
npm test                     # tests for maths, import totals and chat tools
```
`VITE_DEMO=1 npm run dev` runs entirely offline from `demo/demo-data.json`, with nothing sent to Supabase. The chat uses a scripted stand-in unless `ANTHROPIC_API_KEY` is set in `.env.local`.

## Re-converting the Excel
`tools/parse_sheet.py` reads the workbook, and `tools/finalize.py` cleans up names, assigns categories and writes `seed.sql`:
```bash
python3 tools/parse_sheet.py Expenditure_Sheet.xlsx parsed.json
python3 tools/finalize.py parsed.json supabase/
```
Category rules live in `tools/categorize.py`. You can also change any item's category in the app: on the Month tab, the category dropdown applies to that item in every month.

## How the AI chat stays safe
- The browser sends your Supabase session token. `api/chat.js` checks it with Supabase and refuses any email not in `ALLOWED_EMAILS` before calling Claude.
- Data is read with your own token, so Supabase row-level security applies. The chat has no write tools.
- The tools (`query_spending`, `list_entries`, `get_project_items`, `show_chart`) do the arithmetic in code, so Claude never adds up numbers itself.
