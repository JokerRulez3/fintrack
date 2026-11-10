"""Convert the Expenditure Sheet workbook into normalized JSON entries.
Usage: python3 parse_sheet.py <workbook.xlsx> <out.json>
"""
import sys, re, json, datetime
from collections import Counter, defaultdict
import openpyxl

FIX = {"tution": "Tuition", "maintenence": "Maintenance", "electrictiy": "Electricity"}
PEOPLE = {"srikanth": "Srikanth", "neelu": "Neelu", "neelalaka": "Neelu"}

def clean_label(s):
    s = re.sub(r"\s+", " ", str(s)).strip()
    return FIX.get(s.lower(), s)

def breakdown(formula):
    """'=(10753 +10193)' -> [10753, 10193]; returns None for non-arithmetic or single value."""
    if not isinstance(formula, str) or not formula.startswith("="):
        return None
    body = formula[1:].replace(" ", "")
    body = re.sub(r"(?i)SUM\(", "(", body).replace(",", "+")
    if not re.fullmatch(r"[0-9.+\-()]+", body):
        return None
    if "(" in body.strip("()") or ")" in body.strip("()"):
        inner = body.strip("()")
        if "(" in inner or ")" in inner:
            return None
    nums = [float(x) for x in re.findall(r"[+-]?[0-9.]+", body.strip("()"))]
    nums = [int(n) if n == int(n) else n for n in nums]
    return nums if len(nums) > 1 else None

def year_sheets(wb_f, wb_v):
    out, issues, placeholders = [], [], []
    for name in wb_v.sheetnames:
        if not re.fullmatch(r"20\d\d", name):
            continue
        year = int(name)
        wv, wf = wb_v[name], wb_f[name]
        hdr, cols = None, {}
        for r in range(1, 15):
            vals = {c.column: c.value for c in wv[r] if c.value is not None}
            if "Paid for" in vals.values():
                hdr = r
                for col, v in vals.items():
                    if isinstance(v, str) and v.strip().lower() in PEOPLE:
                        cols[col] = PEOPLE[v.strip().lower()]
                break
        maxc = max(cols)
        month = None
        for r in range(hdr + 1, wv.max_row + 1):
            a = wv.cell(r, 1).value
            if isinstance(a, datetime.datetime):
                month = a.date().replace(day=1)
                if month.year != year:
                    issues.append(f"{name}!A{r}: month {month} not in {year}")
            b = wv.cell(r, 2).value
            # numbers in non-person columns inside the main block
            for c in range(3, maxc + 1):
                v = wv.cell(r, c).value
                if c not in cols and isinstance(v, (int, float)) and v:
                    issues.append(f"{name}!{wv.cell(r,c).coordinate}: stray number {v} (label {b!r})")
            if not isinstance(b, str) or not b.strip():
                for c in cols:
                    v = wv.cell(r, c).value
                    if isinstance(v, (int, float)) and v:
                        issues.append(f"{name}!{wv.cell(r,c).coordinate}: amount {v} without label")
                continue
            if month is None:
                issues.append(f"{name}!B{r}: label before any month")
                continue
            label = clean_label(b)
            any_amt = False
            for c, person in cols.items():
                v = wv.cell(r, c).value
                if isinstance(v, (int, float)) and v != 0:
                    any_amt = True
                    e = {"month": month.isoformat(), "item": label, "payer": person,
                         "amount": round(float(v), 2), "pos": r, "src": f"{name}!{wv.cell(r,c).coordinate}"}
                    bd = breakdown(wf.cell(r, c).value)
                    if bd:
                        if abs(sum(bd) - v) > 0.01:
                            issues.append(f"{e['src']}: breakdown {bd} != {v}")
                        else:
                            e["breakdown"] = bd
                    out.append(e)
            if not any_amt:
                # empty rows ("Maid" with no amount yet) — kept only for the newest month, as ₹0 placeholders
                placeholders.append({"month": month.isoformat(), "item": label, "pos": r, "src": f"{name}!B{r}"})
    latest = max(e["month"] for e in out)
    for ph in placeholders:
        if ph["month"] != latest:
            continue
        prev = sorted((e for e in out if e["item"] == ph["item"] and e["month"] < latest), key=lambda e: e["month"])
        out.append({**ph, "payer": prev[-1]["payer"] if prev else "Srikanth", "amount": 0.0})
    return out, issues

def project_items(wb_f, wb_v):
    items = []
    ws = wb_v["Imperia Payments"]; wf = wb_f["Imperia Payments"]
    payer_cols = {3: "Neelu", 5: "Srikanth"}
    for r in range(8, ws.max_row + 1):
        a = ws.cell(r, 1).value
        if a is None:
            continue
        for c, p in payer_cols.items():
            v = ws.cell(r, c).value
            if isinstance(v, (int, float)) and v:
                date = a.date().isoformat() if isinstance(a, datetime.datetime) else None
                label = "Monthly payment" if date else clean_label(a)
                it = {"project": "Imperia", "section": "Payments", "label": label, "date": date,
                      "payer": p, "amount": float(v), "src": f"Imperia Payments!{ws.cell(r,c).coordinate}"}
                bd = breakdown(wf.cell(r, c).value)
                if bd: it["breakdown"] = bd
                items.append(it)
    ws = wb_v["Imperia Interiors"]; wf = wb_f["Imperia Interiors"]
    for r in range(6, ws.max_row + 1):
        a, v = ws.cell(r, 1).value, ws.cell(r, 2).value
        if a and isinstance(v, (int, float)):
            it = {"project": "Imperia", "section": "Interiors", "label": clean_label(a), "date": None,
                  "payer": None, "amount": float(v), "src": f"Imperia Interiors!B{r}"}
            bd = breakdown(wf.cell(r, 2).value)
            if bd: it["breakdown"] = bd
            items.append(it)
    ws = wb_v["Imperia Essentials"]
    for r in range(2, ws.max_row + 1):
        a, cost, cnt, tot, by = (ws.cell(r, c).value for c in range(1, 6))
        if a and isinstance(cost, (int, float)):
            gift = by in ("Shashi", "Neela's Dad")
            items.append({"project": "Imperia", "section": "Essentials", "label": clean_label(a), "date": None,
                          "payer": by, "unit_cost": float(cost), "qty": cnt or 1,
                          "amount": float(tot if isinstance(tot, (int, float)) else cost * (cnt or 1)),
                          "is_gift": gift, "src": f"Imperia Essentials!A{r}"})
    return items

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    wb_f = openpyxl.load_workbook(src)
    wb_v = openpyxl.load_workbook(src, data_only=True)
    entries, issues = year_sheets(wb_f, wb_v)
    proj = project_items(wb_f, wb_v)
    json.dump({"entries": entries, "project_items": proj}, open(dst, "w"), indent=1)
    print("entries", len(entries), "project items", len(proj))
    print("\n".join(issues) or "no issues")
    tot = defaultdict(lambda: defaultdict(float))
    for e in entries:
        tot[e["month"][:4]][e["payer"]] += e["amount"]
    for y in sorted(tot):
        print(y, {k: round(v, 2) for k, v in tot[y].items()})
    print(Counter(e["item"] for e in entries).most_common(400))
