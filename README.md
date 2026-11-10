# Armageddon Watch

A static web page with two tabs:

- **Bible last days**: the events described in scripture, in order, with each sign checked against 50 years of real data.
- **Doomsday**: live readings from public risk feeds. A combined risk score comes once the data pipeline is running.

Plain HTML, CSS and JavaScript. No build step, no framework, no API keys.

## Run it locally

The page loads its data with `fetch`, so open it through a local server rather than double-clicking `index.html`:

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Publish on GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)`.

## Switch on the email signup

1. Make a free account at [buttondown.com](https://buttondown.com).
2. Put your Buttondown username in `js/config.js` (`buttondownUser`).

Until then the form shows "Signup opens soon".

## Updating

- **Event status**: edit `status` in `data/events.json` (`now`, `watching`, `occurred`, `future`). Nothing changes it automatically, on purpose.
- **History data**: `data/history.json`, one `[year, value]` pair per row. Add each new year when the source publishes it.
- **Conflict map layer**: `data/conflicts2025.json`. Replace yearly with UCDP's new figures.
- **Regional outlets**: `data/outlets.json` is the published source list for "Same story, every region". Keep it balanced and public.

## Before charging money

- The map needs no tile service: its outline is `data/world.geojson` (Natural Earth, public domain), so there is no key or usage limit to worry about.
- ACLED data needs a commercial licence. USGS, NOAA and Our World in Data are fine with credit.

## Data and credits

| Chart | Source | Licence |
| --- | --- | --- |
| Earthquakes M7+ per year | [USGS ComCat](https://earthquake.usgs.gov/fdsnws/event/1/) | Public domain |
| Battle deaths per 100,000 | [UCDP and PRIO via Our World in Data](https://ourworldindata.org/grapher/state-based-battle-related-deaths-per-100000-since-1946) | CC BY 4.0 |
| Armed conflicts | [UCDP via Our World in Data](https://ourworldindata.org/grapher/number-of-armed-conflicts) | CC BY 4.0 |
| Undernourishment | [FAO via Our World in Data](https://ourworldindata.org/grapher/prevalence-of-undernourishment) | CC BY 4.0 |
| Religion restrictions | [Pew Research Center](https://www.pewresearch.org/religion/) | Cited figures only |
| Conflict map, 2025 | [UCDP via Our World in Data](https://ourworldindata.org/grapher/number-of-armed-conflicts) | CC BY 4.0 |
| World map outline | [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas), 1:110m | Public domain |
| Live quakes and space weather | [USGS](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php), [NOAA SWPC](https://www.swpc.noaa.gov/) | Public domain |

## Next

- A scheduled GitHub Action that fetches the feeds, scores each risk against its own history, and commits fresh JSON. Keys stay in repository secrets, never in the page.
- News tagging for the signs, showing headline, source and link only.
- Fill "Same story, every region" from GDELT: group articles into stories, split by the outlet list, add volume, tone and one linked headline per region, then an AI summary of framing from headlines only.

## After changing CSS or JS

Bump the `?v=` number on the `css/` and `js/` links in `index.html`, so browsers fetch the new files instead of cached ones.

## News pipeline

`.github/workflows/news.yml` runs `scripts/fetch_news.py` every 6 hours (or on demand from the Actions tab). It picks the risk topic with the biggest jump in coverage, then for each region in `data/outlets.json` saves article count, tone and up to three linked headlines to `data/story.json`. It uses GDELT, and falls back to Google News RSS (no tone) if GDELT does not answer. Check Google News' terms before relying on that fallback in a paid product. No article text is stored.

## Fonts

The header wordmark uses Cinzel (SIL Open Font License 1.1), hosted in `fonts/` with its licence file.
