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

## Updating

- **Event status**: edit `status` in `data/events.json` (`now`, `watching`, `occurred`, `future`). Nothing changes it automatically, on purpose.
- **History data**: `data/history.json`, one `[year, value]` pair per row. Add each new year when the source publishes it.

## Data and credits

| Chart | Source | Licence |
| --- | --- | --- |
| Earthquakes M7+ per year | [USGS ComCat](https://earthquake.usgs.gov/fdsnws/event/1/) | Public domain |
| Battle deaths per 100,000 | [UCDP and PRIO via Our World in Data](https://ourworldindata.org/grapher/state-based-battle-related-deaths-per-100000-since-1946) | CC BY 4.0 |
| Armed conflicts | [UCDP via Our World in Data](https://ourworldindata.org/grapher/number-of-armed-conflicts) | CC BY 4.0 |
| Undernourishment | [FAO via Our World in Data](https://ourworldindata.org/grapher/prevalence-of-undernourishment) | CC BY 4.0 |
| Religion restrictions | [Pew Research Center](https://www.pewresearch.org/religion/) | Cited figures only |
| Live quakes and space weather | [USGS](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php), [NOAA SWPC](https://www.swpc.noaa.gov/) | Public domain |

## Next

- A scheduled GitHub Action that fetches the feeds, scores each risk against its own history, and commits fresh JSON. Keys stay in repository secrets, never in the page.
- News tagging for the signs, showing headline, source and link only.
