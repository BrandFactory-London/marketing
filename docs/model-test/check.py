import json
import re
import sys
from pathlib import Path

DRAFTS = Path(sys.argv[1])
ALLOWED = {"/renovation-services/bathroom", "/renovation-services/kitchen", "/our-projects", "/resources/bathroom",
           "/locations/chigwell", "/locations/loughton", "/locations/ilford", "/contact"}
BANNED = [r"\bnot just\b", r"\bit'?s not\b[^.]{0,40}\bit'?s\b", r"\belevat", r"look no further", r"fast-paced world",
          r"\bseamless", r"transform your (space|bathroom|home)", r"dream bathroom", r"game-?changer"]
SPEC = {"A": (1800, 2500, True), "B": (700, 900, False)}

rows = []
for f in sorted(DRAFTS.glob("*.md")):
    text = f.read_text()
    topic = f.stem.split("-")[0]
    lo, hi, faq_wanted = SPEC[topic]
    body = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    words = len(re.findall(r"[A-Za-z0-9£'’-]+", re.sub(r"^#+ ", "", body, flags=re.M)))
    em = text.count("—")
    en = text.count("–")
    banned_hits = []
    for pat in BANNED:
        for m in re.finditer(pat, text, flags=re.I):
            start = max(0, m.start() - 40)
            banned_hits.append(text[start:m.end() + 40].replace("\n", " "))
    money = [m.group(0) for m in re.finditer(r"£\s?\d[\d,.]*(?:k|\s?000)?", text)]
    years = re.findall(r"\b(?:over|more than)\s+\d+\s+years\b", text, flags=re.I)
    pct = re.findall(r"\b\d+(?:\.\d+)?%", text)
    links = re.findall(r"\]\(([^)]+)\)", text)
    bad_links = [l for l in links if l.split("#")[0].rstrip("/") not in ALLOWED]
    placeholders = re.findall(r"\[[^\]]+\](?!\()", text)
    has_excerpt = bool(re.search(r"^Excerpt:", text, flags=re.M))
    excerpt = re.search(r"^Excerpt:\s*(.*)$", text, flags=re.M)
    excerpt_len = len(excerpt.group(1)) if excerpt else 0
    has_faq = bool(re.search(r"^##\s+Frequently asked questions", text, flags=re.M | re.I))
    h2 = len(re.findall(r"^## ", text, flags=re.M))
    rows.append({
        "file": f.name, "words": words, "in_range": lo <= words <= hi,
        "em_dashes": em, "en_dashes": en, "banned": banned_hits,
        "money_figures": money, "years_claims": years, "percentages": pct,
        "links": links, "bad_links": bad_links, "placeholders": placeholders,
        "excerpt": has_excerpt, "excerpt_chars": excerpt_len,
        "faq": has_faq, "faq_ok": has_faq == faq_wanted, "h2": h2,
    })
print(json.dumps(rows, indent=1, ensure_ascii=False))
