#!/usr/bin/env python3
"""Build data/story.json: how each region's outlets cover today's top risk story.

Runs on a schedule in GitHub Actions. Standard library only, no API keys.

Primary source: GDELT DOC 2.0 API (headlines, article counts, tone).
Fallback when GDELT does not answer: Google News RSS (headlines and counts, no tone).

Only headlines, links and numbers are stored. Never article text.
If too few regions return data, the previous story.json is left untouched.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "story.json"
GDELT = "https://api.gdeltproject.org/api/v2/doc/doc"
UA = "armageddon-watch-news-pipeline/1.0 (+https://github.com/armageddon-watch/armageddon-watch)"
GDELT_PAUSE = 6  # GDELT asks for at most one request every 5 seconds
MIN_REGIONS = 5  # write the file only if at least this many regions returned data

TOPICS = [
    {"id": "war", "label": "War and conflict", "terms": ["war", "airstrike", "missile", "invasion", "troops"]},
    {"id": "nuclear", "label": "Nuclear threat", "terms": ["nuclear weapons", "nuclear test", "nuclear threat"]},
    {"id": "pandemic", "label": "Disease outbreaks", "terms": ["outbreak", "epidemic", "pandemic"]},
    {"id": "famine", "label": "Food crisis", "terms": ["famine", "food crisis", "food shortage"]},
    {"id": "quake", "label": "Earthquakes and eruptions", "terms": ["earthquake", "tsunami", "volcanic eruption"]},
    {"id": "climate", "label": "Extreme weather", "terms": ["heatwave", "wildfire", "flood", "drought"]},
]

STOP = set("""
about after again against amid among around back been before being between calls could days dead deal
does during each every first five four from have here into just killed kills last least less like live
made make many more most much near news next over says said seen show shows since some than that their
them then there these they this those three today under until update updates video warns what when where
which while will with would year years your also amid over into what watch latest world report reports
state states president minister government officials official police people group talks plan plans
attack attacks strike strikes forces army military leader leaders court city country national
monday tuesday wednesday thursday friday saturday sunday january february march april june july august
september october november december explained analysis opinion breaking exclusive
""".split())


def http_get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


# ---------- GDELT ----------

_last_gdelt = 0.0


def gdelt(query, mode, timespan="24h", **extra):
    """One GDELT DOC call, spaced out to respect its rate limit. Raises on any non-JSON reply."""
    global _last_gdelt
    wait = GDELT_PAUSE - (time.time() - _last_gdelt)
    if wait > 0:
        time.sleep(wait)
    params = {"query": query, "mode": mode, "format": "json", "timespan": timespan}
    params.update(extra)
    try:
        text = http_get(GDELT + "?" + urllib.parse.urlencode(params))
    finally:
        _last_gdelt = time.time()
    if not text.strip():
        return {}
    return json.loads(text)  # GDELT sends plain-text errors; json.loads then raises


def or_group(words):
    return "(" + " OR ".join('"%s"' % w if " " in w else w for w in words) + ")"


def gdelt_query(topic, focus, domains=None):
    q = or_group(topic["terms"])
    if focus:
        q += ' "%s"' % focus
    if domains:
        q += " " + ("(" + " OR ".join("domain:" + d for d in domains) + ")" if len(domains) > 1 else "domain:" + domains[0])
    return q


def gdelt_alive():
    for attempt in range(2):
        try:
            gdelt("earthquake", "timelinevol", timespan="1d")
            return True
        except Exception as e:  # noqa: BLE001
            print("GDELT check failed (%d): %s" % (attempt + 1, e))
            time.sleep(10)
    return False


def pick_topic_gdelt():
    """Topic whose last-24h coverage is highest against its own previous six days."""
    best, best_ratio = None, 0.0
    for t in TOPICS:
        try:
            data = gdelt(or_group(t["terms"]), "timelinevol", timespan="7d")
            vals = [p["value"] for p in data["timeline"][0]["data"]]
            cut = max(1, len(vals) // 7)
            recent, before = vals[-cut:], vals[:-cut]
            ratio = (sum(recent) / len(recent)) / max(1e-9, sum(before) / max(1, len(before)))
            print("topic %-9s ratio %.2f" % (t["id"], ratio))
            if ratio > best_ratio:
                best, best_ratio = t, ratio
        except Exception as e:  # noqa: BLE001
            print("topic %s failed: %s" % (t["id"], e))
    return best or TOPICS[0]


def region_gdelt(topic, focus, domains):
    q = gdelt_query(topic, focus, domains)
    arts = gdelt(q, "artlist", maxrecords=75, sort="hybridrel").get("articles", [])
    items = [{"title": a.get("title", ""), "url": a.get("url", ""), "domain": a.get("domain", "")} for a in arts]
    tone = None
    try:
        pts = gdelt(q, "timelinetone").get("timeline", [{}])[0].get("data", [])
        vals = [p["value"] for p in pts if p.get("value")]
        if vals:
            tone = round(sum(vals) / len(vals), 1)
    except Exception as e:  # noqa: BLE001
        print("  tone failed: %s" % e)
    return items, tone


# ---------- Google News RSS fallback ----------

def google_rss(terms, focus, domains=None):
    q = "(" + " OR ".join('"%s"' % w if " " in w else w for w in terms) + ")"
    if focus:
        q += ' "%s"' % focus
    if domains:
        q += " (" + " OR ".join("site:" + d for d in domains) + ")"
    q += " when:1d"
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": "en-GB", "gl": "GB", "ceid": "GB:en"})
    root = ET.fromstring(http_get(url))
    items = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        src = it.find("source")
        src_name = (src.text or "").strip() if src is not None else ""
        if src_name and title.endswith(" - " + src_name):
            title = title[: -len(" - " + src_name)]
        dom = urllib.parse.urlparse(src.get("url", "")).netloc if src is not None else ""
        items.append({"title": title, "url": (it.findtext("link") or "").strip(), "domain": dom.replace("www.", "")})
    time.sleep(2)
    return items


# ---------- shared ----------

def find_focus(titles, topic):
    """Most common proper-noun-like word across the headlines, e.g. a country. None if nothing dominates."""
    skip = STOP | {w.lower() for t in topic["terms"] for w in t.split()}
    df = Counter()
    for title in titles:
        words = set()
        for w in re.findall(r"[A-Za-z][A-Za-z'\-]{3,}", title):
            if w[0].isupper() and w.lower() not in skip:
                words.add(w[:-2] if w.endswith("'s") else w)
        df.update(words)
    if not df:
        return None
    word, n = df.most_common(1)[0]
    need = max(4, int(0.12 * len(titles)))
    print("focus candidates:", df.most_common(5), "need", need)
    return word if n >= need else None


def clean(items, limit=3):
    """Top headlines: valid links only, no duplicate titles, spread across outlets where possible."""
    seen, per_domain, out = set(), Counter(), []
    for pass_no in (1, 2):
        for it in items:
            title = re.sub(r"\s+", " ", it["title"]).strip()[:200]
            key = title.lower()
            if not title or key in seen or not it["url"].startswith(("http://", "https://")):
                continue
            if pass_no == 1 and per_domain[it["domain"]] >= 1:
                continue
            seen.add(key)
            per_domain[it["domain"]] += 1
            out.append({"title": title, "url": it["url"], "domain": it["domain"]})
            if len(out) >= limit:
                return out
    return out


def main():
    outlets = json.loads((ROOT / "data" / "outlets.json").read_text(encoding="utf-8"))
    use_gdelt = gdelt_alive()
    print("source:", "GDELT" if use_gdelt else "Google News RSS (GDELT not answering)")

    topic = pick_topic_gdelt() if use_gdelt else TOPICS[0]
    print("topic:", topic["label"])

    focus = None
    try:
        if use_gdelt:
            world = gdelt(or_group(topic["terms"]) + " sourcelang:english", "artlist", maxrecords=75, sort="hybridrel").get("articles", [])
            focus = find_focus([a.get("title", "") for a in world], topic)
        else:
            focus = find_focus([i["title"] for i in google_rss(topic["terms"], None)], topic)
    except Exception as e:  # noqa: BLE001
        print("focus failed:", e)
    print("focus:", focus)

    regions, ok = [], 0
    for r in outlets["regions"]:
        domains = [o[2] for o in r["outlets"] if len(o) > 2 and o[2]]
        entry = {"name": r["name"], "count": 0, "capped": False, "tone": None, "headlines": [], "error": False}
        try:
            if use_gdelt:
                items, tone = region_gdelt(topic, focus, domains)
                entry["tone"] = tone
                entry["capped"] = len(items) >= 75
            else:
                items = google_rss(topic["terms"], focus, domains)
                entry["capped"] = len(items) >= 100
            entry["count"] = len(items)
            entry["headlines"] = clean(items)
            ok += 1
        except Exception as e:  # noqa: BLE001
            entry["error"] = True
            print("region %s failed: %s" % (r["name"], e))
        print("%-14s %3d articles, tone %s" % (r["name"], entry["count"], entry["tone"]))
        regions.append(entry)

    if ok < MIN_REGIONS:
        print("Only %d regions returned data; keeping the previous story.json." % ok)
        return 0

    story = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": "last 24 hours",
        "source": "GDELT" if use_gdelt else "Google News",
        "topic": topic["label"],
        "focus": focus,
        "regions": regions,
    }
    OUT.write_text(json.dumps(story, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("wrote", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
