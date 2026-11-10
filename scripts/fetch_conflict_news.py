#!/usr/bin/env python3
"""Build data/conflict_news.json: recent conflict headlines for each country on the conflict map.

For every country in data/conflicts2025.json, search Google News RSS for conflict coverage from the
last two days and keep headlines that actually name the country.
Headlines, source names and links only. Never article text. Standard library, no keys.
"""
import json
import re
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_news import http_get  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "conflict_news.json"
MAX_HEADLINES = 4
TERMS = "(war OR conflict OR fighting OR attack OR airstrike OR militants OR troops OR ceasefire)"

# A headline must also be about fighting, not just mention the country.
CONFLICT_WORD = re.compile(
    r"\bwar\b|warfare|conflict|fight|attack|strike|militan|troop|ceasefire|truce|kill|rebel|jihad|clash|\barmy\b|"
    r"drone|bomb|insurg|violen|shell(ed|ing)|soldier|militia|junta|\bcoup\b|gunm[ae]n|terror|hostage|missile|"
    r"offensive|invasion|\btalks\b|negotiat|massacre|displace|ambush|raid", re.I)

# What to type into the search when the map name is not what newspapers write.
SEARCH_AS = {"DR Congo": "DR Congo", "Congo": "Congo-Brazzaville", "Palestine": "Gaza", "Central African Republic": "Central African Republic"}

# A headline must match this to count as being about the country. Default: the name plus common endings.
MATCH = {
    "Afghanistan": r"\bAfghan",
    "Burkina Faso": r"\bBurkina",
    "Central African Republic": r"Central African Republic|\bCAR\b",
    "Congo": r"Congo-Brazzaville|Republic of (the )?Congo|\bBrazzaville",
    "DR Congo": r"\bDRC\b|DR Congo|Democratic Republic of (the )?Congo|\bGoma\b|\bM23\b|\bKinshasa",
    "Lebanon": r"\bLeban|\bHezbollah|\bBeirut",
    "Mozambique": r"\bMozambi",
    "Myanmar": r"\bMyanmar|\bBurm",
    "Niger": r"\bNiger(ien)?\b",
    "Palestine": r"\bGaza|\bWest Bank\b|\bPalestin|\bHamas",
    "Philippines": r"\bPhilippin|\bFilipino",
    "Saudi Arabia": r"\bSaudi",
    "Somalia": r"\bSomali",
    "Sudan": r"(?<!South )\bSudan(ese)?\b",
    "Thailand": r"\bThai",
    "Ukraine": r"\bUkrain|\bKyiv",
    "Yemen": r"\bYemen|\bHouthi",
}


def pattern_for(name):
    return re.compile(MATCH.get(name) or r"\b%s(ese|lese|ian|an|i|n)?\b" % re.escape(name), re.I)


def headlines_for(name):
    q = '"%s" %s when:2d' % (SEARCH_AS.get(name, name), TERMS)
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": "en-GB", "gl": "GB", "ceid": "GB:en"})
    root = ET.fromstring(http_get(url))
    about, out, seen = pattern_for(name), [], set()
    items = list(root.iter("item"))
    if not items:
        return None  # Google sent an empty feed: treat as "no answer", not as "no news"
    for it in items:
        title = (it.findtext("title") or "").strip()
        src = it.find("source")
        source = (src.text or "").strip() if src is not None else ""
        if source and title.endswith(" - " + source):
            title = title[: -len(" - " + source)]
        link = (it.findtext("link") or "").strip()
        key = title.lower()
        if not about.search(title) or not CONFLICT_WORD.search(title) or key in seen or not link.startswith("https://"):
            continue
        seen.add(key)
        out.append({"title": re.sub(r"\s+", " ", title)[:200], "url": link, "source": source[:60]})
        if len(out) >= MAX_HEADLINES:
            break
    return out


def main():
    countries = [c[0] for c in json.loads((ROOT / "data" / "conflicts2025.json").read_text(encoding="utf-8"))["countries"]]
    try:
        previous = json.loads(OUT.read_text(encoding="utf-8")).get("countries", {})
    except Exception:  # noqa: BLE001
        previous = {}
    result, failures = {}, 0
    for name in countries:
        try:
            heads = headlines_for(name)
        except Exception as e:  # noqa: BLE001
            failures += 1
            print("failed %s: %s" % (name, type(e).__name__))
            continue
        finally:
            time.sleep(2)
        if heads is None:
            print("%-26s empty feed, keeping previous" % name)
            if name in previous:
                result[name] = previous[name]
            continue
        print("%-26s %d headlines" % (name, len(heads)))
        result[name] = {"headlines": heads}
    if failures > len(countries) // 2:
        print("Most searches failed; keeping the previous conflict_news.json.")
        return 0
    OUT.write_text(json.dumps({
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": "last 48 hours",
        "source": "Google News",
        "countries": result,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("wrote", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
