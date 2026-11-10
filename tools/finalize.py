"""Apply item clean-up + categories to parsed.json and write data.json, seed.sql, demo-data.json."""
import sys, json
from collections import defaultdict, Counter
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from categorize import canonical_items, category_for

src, out_dir = sys.argv[1], sys.argv[2]
d = json.load(open(src))
canon = canonical_items([e["item"] for e in d["entries"]])
for e in d["entries"]:
    e["item"] = canon(e["item"])
    e["category"] = category_for(e["item"])
for p in d["project_items"]:
    p["label"] = canon(p["label"]) if p["label"].lower() in {k.lower() for k in [e["item"] for e in d["entries"]]} else p["label"]

cats = defaultdict(Counter)
for e in d["entries"]:
    cats[e["category"]][e["item"]] += 1
for c in sorted(cats):
    print(f"\n## {c} ({sum(cats[c].values())}):", ", ".join(f"{i}×{n}" for i, n in cats[c].most_common()))

def q(v):
    if v is None: return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return repr(v)
    if isinstance(v, list): return "array[" + ",".join(repr(x) for x in v) + "]::numeric[]"
    return "'" + str(v).replace("'", "''") + "'"

with open(f"{out_dir}/seed.sql", "w") as f:
    f.write("-- One-time import of Expenditure_Sheet.xlsx (2020-2026 + Imperia tabs).\n")
    f.write("-- Run in Supabase SQL Editor AFTER schema.sql and AFTER you have signed in to the app once.\n")
    f.write("-- Replace YOUR_EMAIL below with the email you sign in with.\n\n")
    f.write("do $$\ndeclare uid uuid;\nbegin\n")
    f.write("  select id into uid from auth.users where email = 'YOUR_EMAIL';\n")
    f.write("  if uid is null then raise exception 'Sign in to the app once first, then re-run'; end if;\n")
    f.write("  delete from fin_entries where user_id = uid and source like 'xlsx:%';\n")
    f.write("  delete from fin_project_items where user_id = uid and source like 'xlsx:%';\n")
    rows = [f"(uid,{q(e['month'])},{q(e['item'])},{q(e['category'])},{q(e['payer'])},{q(e['amount'])},{q(e.get('breakdown'))},{q(e['pos'])},{q('xlsx:'+e['src'])})" for e in d["entries"]]
    for i in range(0, len(rows), 200):
        f.write("  insert into fin_entries (user_id,month,item,category,payer,amount,breakdown,pos,source) values\n    " + ",\n    ".join(rows[i:i+200]) + ";\n")
    rows = [f"(uid,{q(p['project'])},{q(p['section'])},{q(p['label'])},{q(p['date'])},{q(p['payer'])},{q(p['amount'])},{q(p.get('unit_cost'))},{q(p.get('qty'))},{q(p.get('is_gift', False))},{q(p.get('breakdown'))},{q('xlsx:'+p['src'])})" for p in d["project_items"]]
    f.write("  insert into fin_project_items (user_id,project,section,label,date,payer,amount,unit_cost,qty,is_gift,breakdown,source) values\n    " + ",\n    ".join(rows) + ";\n")
    f.write("end $$;\n")

json.dump(d, open(f"{out_dir}/data.json", "w"))
print("\nwrote", len(d["entries"]), "entries,", len(d["project_items"]), "project items")
