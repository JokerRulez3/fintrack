"""Item-name clean-up and first-pass categories. Categories are editable in the app later."""
import re
from collections import Counter

SYNONYMS = {
    "basket ball": "Basketball", "grocery": "Groceries", "electricity bill": "Electricity",
    "interior": "Interiors", "school fee": "School Fees", "house loan": "Home Loan",
    "kovalm flight booking": "Kovalam Flight Booking", "kovalm hotel booking": "Kovalam Hotel Booking",
    "kovalum trip": "Kovalam Trip", "shiridi": "Shirdi", "interior flaseceiling": "Interior False Ceiling",
    "sprinker extension": "Sprinkler Extension", "kent softner": "Kent Softener", "water softner": "Water Softener",
}

# first match wins; patterns are lower-case regexes
RULES = [
    ("Credit Card", r"credit card|cc bill"),
    ("Loans & EMIs", r"home loan|car loan|personal loan|lucky loan|self borrow|\bmodt\b"),
    ("Jewellery & Gold", r"gold|khazana|studs|\bring\b"),
    ("Family & Gifts", r"gift"),
    ("Savings & Investments", r"^savings$|^mf$|^rd$|investment|chitti"),
    ("Rent", r"\brent\b"),
    ("Bills & Utilities", r"airtel|electricity|mobile bill|fibernet|internet|tatasky|\bgas$|bharath gas|water bill"),
    ("Household Help", r"maid|^cook$|house cleaning|outside cleaning"),
    ("Car", r"car cleaning|car service|car repair|car damage|\bkia\b|ignis|petrol"),
    ("Kids & Education", r"tuition|dance|basketball|school|myra (education|books|games|tiffin|vaccine)|global art|phonics"),
    ("Travel", r"trip|flight|goa|andaman|kodai|kovalam|singapore|dubai|meghalaya|mussorie|pondicherry|shirdi|wayanad|coorg|makau|dindi|kashmir|uber"),
    ("Taxes", r"tax|\btds\b"),
    ("Home Fit-out", r"interior|automation|sofas?$|tiles|vanity|curtain|kent|exhaust|panels|sprinkler|plumbing|\bbed\b|dining|stove|inspection|false ceiling|electrical|ac installation|ac wiring|mosquito|balcony|softener|geyser|sanitary|washing machine|sony tv|house warming|home inspection|transteel|chair|bathroom|shower|packers|painter"),
    ("Home Maintenance", r"maintenance|repair|ac cleaning|sofa cleaning|interior cleaning"),
    ("Food & Groceries", r"groceries|swiggy|zomato|zepto|instamart|eating out"),
    ("Shopping", r"shopping|amazon|h&m|shoppers stop|saree|blouse|dress|zudio|lenskart|airpods|hosiery|clothes|mag safe|sheets|opulentus|lifestyle"),
    ("Health & Personal", r"medical|hospital|salon|yoga"),
    ("Family & Gifts", r"gift|mom|dad|due|birthday|bday|party|wedding|shower|neelu|shashi|toys|festival|elsewhere|myra"),
]

def canonical_items(names):
    """Merge case/spacing variants to the most common spelling, then apply synonyms."""
    by_key = {}
    counts = Counter(names)
    for n in counts:
        k = n.lower()
        if k in SYNONYMS:
            continue
        if k not in by_key or counts[n] > counts[by_key[k]]:
            by_key[k] = n
    def canon(n):
        k = n.lower()
        if k in SYNONYMS:
            return SYNONYMS[k]
        return by_key[k]
    return canon

def category_for(item):
    s = item.lower()
    for cat, pat in RULES:
        if re.search(pat, s):
            return cat
    return "Other"
