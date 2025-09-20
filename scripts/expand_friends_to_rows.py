#!/usr/bin/env python3

import csv
import re
from pathlib import Path

INPUT = (
    Path(__file__).resolve().parents[1]
    / "notion_export"
    / "Japan Travel Planner 🌸 273042fae56c80149c0ded3ca759366a"
    / "Travel Itinerary 273042fae56c81f4b235f8b4a219d671.csv"
)
OUTPUT = INPUT.with_name("Travel Itinerary - per-person.csv")

# heuristic splits: '+' and ',' and ' + ' and ' and '
SPLIT_RE = re.compile(r"\s*\+\s*|\s*,\s*|\s+and\s+|/|\\|;\s*")
PAREN_RE = re.compile(r"\(([^)]*)\)")


def extract_names(field):
    """Return a list of normalized names from the Friends field.
    Handles constructs like:
      - "Henry + Nana (invite Phil if in town)"
      - "Mix of Nana, Nicole, Ken, James, Phil,"
      - "Henry + Nana + Nicole + Ken"
    Strategy:
      - Extract parenthetical content and treat phrases starting with invite or include as names if they contain a capitalized name.
      - Split the main field by +, comma, 'and', '/', '\\', ';'
      - Keep tokens that look like names (contain letters and start with capital letter)
    This is heuristic but should cover common patterns in the file.
    """
    if not field:
        return []
    field = field.strip()
    names = []

    # Extract parenthetical groups and try to pull names from them
    for m in PAREN_RE.finditer(field):
        inside = m.group(1)
        # find capitalized words that look like names
        for token in re.split(SPLIT_RE, inside):
            token = token.strip()
            if token:
                # common patterns: 'invite Phil if in town', 'Nicole & Ken join evening'
                # find single capitalized words
                caps = re.findall(r"\b[A-Z][a-z]+\b", token)
                for c in caps:
                    names.append(c)
    # Remove parentheticals from main field
    main = PAREN_RE.sub("", field)
    parts = [p.strip() for p in SPLIT_RE.split(main) if p.strip()]
    for p in parts:
        # skip words like 'Mix of' and 'depending on availability' heuristically
        if p.lower().startswith("mix of"):
            p = p[6:].strip()
        # also drop words that are too long and not name-lists
        # break into words and pick capitalized words sequences
        candidates = re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b", p)
        if candidates:
            for c in candidates:
                # split multi-word names by ' & ' or '/'
                sub = re.split(r"\s*&\s*|/|\\", c)
                for s in sub:
                    s = s.strip()
                    if s:
                        names.append(s)
        else:
            # fallback: if token looks short and capitalized, take it
            if re.match(r"^[A-Z][a-zA-Z'-]+$", p):
                names.append(p)
    # final cleanup: unique-preserve-order
    seen = set()
    out = []
    for n in names:
        if n not in seen:
            seen.add(n)
            out.append(n)
    return out


if __name__ == "__main__":
    print("Reading", INPUT)
    rows = []
    with INPUT.open(newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for r in reader:
            friends_field = r.get("Friends", "")
            names = extract_names(friends_field)
            if not names:
                # keep original as empty person entry
                new = r.copy()
                new["Friends"] = ""
                rows.append(new)
            else:
                for n in names:
                    new = r.copy()
                    new["Friends"] = n
                    rows.append(new)

    print(f"Writing {len(rows)} rows to", OUTPUT)
    with OUTPUT.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print("Done.")
