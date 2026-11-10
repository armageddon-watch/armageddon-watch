#!/usr/bin/env python3
"""Build data/unrest_news.json: countries with protest or riot headlines in the last 24 hours.

Searches Google News RSS for protest and riot coverage worldwide, works out which country each
headline names, and saves per-country counts plus up to four linked headlines.
This measures news coverage, not events on the ground. Protests and riots are counted separately:
a peaceful protest is not lawlessness.
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
OUT = ROOT / "data" / "unrest_news.json"
MAX_HEADLINES = 4

SEARCHES = [
    "protest OR protests OR protesters when:1d",
    "demonstration OR demonstrators OR rally OR marchers when:1d",
    "riot OR riots OR rioters OR looting when:1d",
    '"tear gas" OR curfew OR "state of emergency" OR unrest when:1d',
]

UNREST = re.compile(r"protest|demonstrat|\brall(y|ies)\b|\bmarch(ers|es|ed)\b|\bmarch (in|on|through|against|to|for)\b|riot|loot|unrest|clash|curfew|state of emergency|tear ?gas|uprising", re.I)
# "Rally" and "march" also mean share prices and motorsport; skip those unless the headline is clearly about unrest.
NOT_UNREST = re.compile(r"stock|shares?\b|market|price|investor|bitcoin|crypto|\bbonds?\b|index|world rally|rally car|\bwrc\b", re.I)
CLEARLY = re.compile(r"protest|demonstrat|riot|loot|unrest|tear ?gas|curfew", re.I)
VIOLENT = re.compile(r"riot|loot|unrest|clash|curfew|state of emergency|tear ?gas|uprising|violen|torch|arson|burn|dead|kill|shot", re.I)

# Map-outline name -> name shown on the site.
DISPLAY = {
    "United States of America": "United States", "Dem. Rep. Congo": "DR Congo", "Central African Rep.": "Central African Republic",
    "S. Sudan": "South Sudan", "Dominican Rep.": "Dominican Republic", "Bosnia and Herz.": "Bosnia and Herzegovina",
    "Czechia": "Czech Republic", "Côte d'Ivoire": "Ivory Coast", "Eq. Guinea": "Equatorial Guinea", "eSwatini": "Eswatini",
    "Solomon Is.": "Solomon Islands", "W. Sahara": "Western Sahara", "Falkland Is.": "Falkland Islands",
}
# Too easily confused with a person, a US state or another country to match on the bare name.
SKIP = {"Georgia", "Jordan", "Chad", "Guinea", "Dominica", "N. Cyprus", "Somaliland", "Fr. S. Antarctic Lands", "Greenland"}
# Extra ways headlines name a country. Patterns are case-insensitive unless marked (?-i:...).
ALIASES = {
    "United States": r"(?-i:\bU\.?S\.?A?\b)|\bAmerican?s?\b|United States|\bWashington\b|\bMinneapolis\b|\bLos Angeles\b|\bChicago\b|\bNew York\b",
    "United Kingdom": r"(?-i:\bUK\b)|\bBritain\b|\bBritish\b|\bEngland\b|\bScotland\b|\bWales\b|\bLondon\b|United Kingdom",
    "France": r"\bFrance\b|\bFrench\b|\bParis\b", "Germany": r"\bGerman[ys]?\b|\bBerlin\b", "Spain": r"\bSpain\b|\bSpanish\b|\bMadrid\b",
    "Italy": r"\bItal(y|ian)s?\b|\bRome\b", "Greece": r"\bGree(ce|k)s?\b|\bAthens\b", "Turkey": r"\bTurk(ey|ish)\b|\bTürkiye\b|\bIstanbul\b|\bAnkara\b",
    "Russia": r"\bRussian?s?\b|\bMoscow\b", "China": r"\bChin(a|ese)\b|\bBeijing\b|\bHong Kong\b", "India": r"\bIndian?s?\b(?! Ocean)|\bDelhi\b|\bMumbai\b",
    "Iran": r"\bIran(ian)?s?\b|\bTehran\b", "Israel": r"\bIsraeli?s?\b|\bTel Aviv\b|\bJerusalem\b", "Iraq": r"\bIraqi?s?\b|\bBaghdad\b",
    "Pakistan": r"\bPakistani?s?\b|\bIslamabad\b|\bKarachi\b", "Bangladesh": r"\bBangladeshi?s?\b|\bDhaka\b", "Nepal": r"\bNepal(i|ese)?\b|\bKathmandu\b",
    "Indonesia": r"\bIndonesian?s?\b|\bJakarta\b", "Philippines": r"\bPhilippines?\b|\bFilipinos?\b|\bManila\b", "Thailand": r"\bThai(land)?s?\b|\bBangkok\b",
    "Myanmar": r"\bMyanmar\b|\bBurm(a|ese)\b", "South Korea": r"South Korean?s?|\bSeoul\b", "Japan": r"\bJapan(ese)?\b|\bTokyo\b",
    "Mexico": r"\bMexic(o|an)s?\b", "Brazil": r"\bBrazil(ian)?s?\b|\bSão Paulo\b", "Argentina": r"\bArgentin(a|e|ian)s?\b|\bBuenos Aires\b",
    "Colombia": r"\bColombian?s?\b|\bBogot[aá]\b", "Venezuela": r"\bVenezuelan?s?\b|\bCaracas\b", "Peru": r"\bPeru(vian)?s?\b|\bLima\b",
    "Chile": r"\bChilean?s?\b|\bSantiago\b", "Ecuador": r"\bEcuador(ian)?s?\b|\bQuito\b", "Bolivia": r"\bBolivian?s?\b|\bLa Paz\b",
    "Kenya": r"\bKenyan?s?\b|\bNairobi\b", "Nigeria": r"\bNigerian?s?\b|\bLagos\b|\bAbuja\b", "South Africa": r"South African?s?|\bJohannesburg\b|\bCape Town\b",
    "Uganda": r"\bUgandan?s?\b|\bKampala\b", "Tanzania": r"\bTanzanian?s?\b|\bDar es Salaam\b", "Ethiopia": r"\bEthiopian?s?\b|\bAddis Ababa\b",
    "Sudan": r"(?<!South )\bSudan(ese)?\b|\bKhartoum\b", "Egypt": r"\bEgypt(ian)?s?\b|\bCairo\b", "Tunisia": r"\bTunisian?s?\b|\bTunis\b",
    "Morocco": r"\bMorocc(o|an)s?\b", "Madagascar": r"\bMadagasca[rn]\b|\bMalagasy\b", "Mozambique": r"\bMozambi(que|can)s?\b|\bMaputo\b",
    "Ukraine": r"\bUkrain(e|ian)s?\b|\bKyiv\b", "Serbia": r"\bSerbian?s?\b|\bBelgrade\b", "Hungary": r"\bHungar(y|ian)s?\b|\bBudapest\b",
    "Poland": r"\bPol(and|ish)\b|\bWarsaw\b", "Netherlands": r"\bNetherlands\b|\bDutch\b|\bAmsterdam\b", "Belgium": r"\bBelgi(um|an)s?\b|\bBrussels\b",
    "Australia": r"\bAustralian?s?\b|\bSydney\b|\bMelbourne\b", "Canada": r"\bCanad(a|ian)s?\b|\bToronto\b|\bOttawa\b",
    "Niger": r"\bNiger(ien)?\b", "Lebanon": r"\bLeban(on|ese)\b|\bBeirut\b", "Syria": r"\bSyrian?s?\b|\bDamascus\b",
    "DR Congo": r"\bDRC\b|DR Congo|Democratic Republic of (the )?Congo|\bKinshasa\b|\bGoma\b", "Congo": r"Congo-Brazzaville|Republic of (the )?Congo|\bBrazzaville\b",
    "Georgia": r"\bTbilisi\b|\bGeorgian (government|parliament|police|protesters|opposition)", "Sri Lanka": r"\bSri Lankan?s?\b|\bColombo\b",
    "Cameroon": r"\bCameroon(ian)?s?\b|\bYaound[eé]\b", "Ghana": r"\bGhana(ian)?s?\b|\bAccra\b", "Senegal": r"\bSenegal(ese)?\b|\bDakar\b",
    "Mali": r"\bMali(an)?s?\b|\bBamako\b", "Haiti": r"\bHaiti(an)?s?\b|\bPort-au-Prince\b", "Cuba": r"\bCuban?s?\b|\bHavana\b",
    "Portugal": r"\bPortug(al|uese)\b|\bLisbon\b", "Sweden": r"\bSwed(en|ish)\b|\bStockholm\b", "Ireland": r"\bIreland\b|\bIrish\b|\bDublin\b",
    "Bulgaria": r"\bBulgarian?s?\b|\bSofia\b", "Romania": r"\bRomanian?s?\b|\bBucharest\b", "Slovakia": r"\bSlovak(ia|ian)?s?\b|\bBratislava\b",
}
CENTRE = {"United States": [39, -98], "Russia": [60, 90], "France": [46.5, 2.5], "Norway": [61, 9], "Canada": [57, -102],
          "Indonesia": [-2.5, 118], "Chile": [-33, -71], "United Kingdom": [53, -1.5], "Japan": [36.5, 138.5], "Philippines": [13, 122],
          "New Zealand": [-41, 174], "Malaysia": [4, 102], "Denmark": [56, 9.5], "Italy": [42.8, 12.5], "Greece": [39, 22]}


def load_countries():
    """[(display name, compiled pattern, [lat, lon])], longest names first so 'South Sudan' wins over 'Sudan'."""
    world = json.loads((ROOT / "data" / "world.geojson").read_text(encoding="utf-8"))
    out = []
    for f in world["features"]:
        raw = f["properties"]["name"]
        name = DISPLAY.get(raw, raw)
        if raw in SKIP and name not in ALIASES:
            continue
        g = f["geometry"]
        rings = [p[0] for p in (g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]])]
        ring = max(rings, key=len)
        centre = CENTRE.get(name) or [round(sum(p[1] for p in ring) / len(ring), 1), round(sum(p[0] for p in ring) / len(ring), 1)]
        pattern = ALIASES.get(name) or r"\b%s\b" % re.escape(name)
        out.append((name, re.compile(pattern, re.I), centre))
    out.sort(key=lambda c: len(c[0]), reverse=True)
    return out


def countries_in(title, countries):
    """Countries a headline names (at most two). Matched words are blanked so a shorter name can't re-match them."""
    found, text = [], title
    for name, pattern, _ in countries:
        m = pattern.search(text)
        if m:
            found.append(name)
            text = pattern.sub(lambda mm: " " * len(mm.group(0)), text)
            if len(found) == 2:
                break
    return found


def search(q):
    url = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": "en-GB", "gl": "GB", "ceid": "GB:en"})
    root = ET.fromstring(http_get(url))
    items = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        src = it.find("source")
        source = (src.text or "").strip() if src is not None else ""
        if source and title.endswith(" - " + source):
            title = title[: -len(" - " + source)]
        link = (it.findtext("link") or "").strip()
        if link.startswith("https://"):
            items.append({"title": re.sub(r"\s+", " ", title)[:200], "url": link, "source": source[:60]})
    return items


def build(items, countries):
    centres = {name: centre for name, _, centre in countries}
    result, seen = {}, set()
    for it in items:
        key = it["title"].lower()
        if key in seen or not UNREST.search(it["title"]) or (NOT_UNREST.search(it["title"]) and not CLEARLY.search(it["title"])):
            continue
        seen.add(key)
        kind = "riot" if VIOLENT.search(it["title"]) else "protest"
        for name in countries_in(it["title"], countries):
            c = result.setdefault(name, {"lat": centres[name][0], "lon": centres[name][1], "protest": 0, "riot": 0, "headlines": []})
            c[kind] += 1
            if len(c["headlines"]) < MAX_HEADLINES:
                c["headlines"].append(dict(it, kind=kind))
    return result


def main():
    countries = load_countries()
    items, failures = [], 0
    for q in SEARCHES:
        try:
            got = search(q)
            print("%3d results for: %s" % (len(got), q))
            items += got
        except Exception as e:  # noqa: BLE001
            failures += 1
            print("search failed (%s): %s" % (type(e).__name__, q))
        time.sleep(2)
    if failures == len(SEARCHES):
        print("Every search failed; keeping the previous unrest_news.json.")
        return 0
    result = build(items, countries)
    for name, c in sorted(result.items(), key=lambda kv: -(kv[1]["protest"] + kv[1]["riot"]))[:12]:
        print("%-22s protest %2d  riot %2d" % (name, c["protest"], c["riot"]))
    OUT.write_text(json.dumps({
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": "last 24 hours",
        "source": "Google News",
        "note": "Counts are headlines found, not events. English-language coverage only.",
        "countries": result,
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print("wrote", OUT, "countries:", len(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
