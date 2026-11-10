#!/usr/bin/env python3
"""Build data/quake_news.json: news headlines for the biggest earthquakes of the past week.

For the top quakes in the USGS M4.5+ weekly feed, search Google News RSS for coverage and keep
only headlines that are clearly about an earthquake and were published after it struck.
Headlines, source names and links only. Never article text. Standard library, no keys.
"""
import json
import re
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_news import http_get  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "quake_news.json"
FEED = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson"
MIN_MAG = 5.0
MAX_QUAKES = 15
MAX_HEADLINES = 4
QUAKE_WORD = re.compile(r"quake|tremor|temblor|seismic|tsunami|terremoto|sismo|s[eé]isme|erdbeben|deprem|gempa", re.I)


def place_terms(place):
    """'23 km SE of Hualien City, Taiwan' -> 'Hualien City Taiwan'. Ocean ridges etc. pass through."""
    core = place.split(" of ", 1)[1] if " of " in place else place
    return re.sub(r"[^\w\s\-']", " ", core).strip()


def headlines_for(place, when, mag):
    q = "earthquake %s when:7d" % place_terms(place)
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": "en-GB", "gl": "GB", "ceid": "GB:en"})
    root = ET.fromstring(http_get(url))
    out, seen = [], set()
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        src = it.find("source")
        source = (src.text or "").strip() if src is not None else ""
        if source and title.endswith(" - " + source):
            title = title[: -len(" - " + source)]
        link = (it.findtext("link") or "").strip()
        try:
            published = parsedate_to_datetime(it.findtext("pubDate") or "")
        except Exception:  # noqa: BLE001
            continue
        if published < when - timedelta(hours=1):
            continue  # written before this quake happened: about an older one
        # A headline that states a magnitude must roughly match this quake, or it is about another one.
        stated = [float(m) for m in re.findall(r"(?<![\d.])([2-9]\.\d)(?![\d.])", title)]
        if stated and min(abs(x - mag) for x in stated) > 0.5:
            continue
        key = title.lower()
        if not QUAKE_WORD.search(title) or key in seen or not link.startswith("https://"):
            continue
        seen.add(key)
        out.append({"title": re.sub(r"\s+", " ", title)[:200], "url": link, "source": source[:60]})
        if len(out) >= MAX_HEADLINES:
            break
    return out


def main():
    feed = json.loads(http_get(FEED))
    quakes = [f for f in feed["features"] if isinstance(f["properties"].get("mag"), (int, float)) and f["properties"]["mag"] >= MIN_MAG]
    quakes.sort(key=lambda f: f["properties"]["mag"], reverse=True)
    result, failures = {}, 0
    for f in quakes[:MAX_QUAKES]:
        p = f["properties"]
        when = datetime.fromtimestamp(p["time"] / 1000, tz=timezone.utc)
        try:
            heads = headlines_for(p.get("place") or "", when, p["mag"])
        except Exception as e:  # noqa: BLE001
            failures += 1
            print("failed %s: %s" % (f["id"], type(e).__name__))
            continue
        finally:
            time.sleep(2)
        print("M%.1f %-45s %d headlines" % (p["mag"], (p.get("place") or "")[:45], len(heads)))
        result[f["id"]] = {"headlines": heads}
    if quakes and failures >= len(quakes[:MAX_QUAKES]):
        print("Every search failed; keeping the previous quake_news.json.")
        return 0
    OUT.write_text(json.dumps({
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Google News",
        "quakes": result,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("wrote", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
