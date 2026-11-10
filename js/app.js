(function () {
  var STATUS = { now: 'You are here', watching: 'Watching · not yet', occurred: 'Happened', future: 'Future' };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function avg(rows) { return rows.reduce(function (a, r) { return a + r[1]; }, 0) / rows.length; }
  function maxRow(rows) { return rows.reduce(function (m, r) { return r[1] > m[1] ? r : m; }); }
  function get(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }); }

  /* Tabs */
  function showTab(name) {
    document.querySelectorAll('.panel').forEach(function (p) { p.hidden = p.id !== name; });
    document.querySelectorAll('.tab').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === name)); });
    if (name === 'doomsday') { loadLive(); loadMap(); loadStory(); }
  }
  document.querySelectorAll('.tab').forEach(function (b) {
    /* '#/name' rather than '#name', so the browser never scrolls to the section with that id */
    b.addEventListener('click', function () { history.replaceState(null, '', '#/' + b.dataset.tab); showTab(b.dataset.tab); });
  });

  /* Findings: one sentence per chart, worked out from the rows so it can never disagree with them */
  function findings(h) {
    var q = h.earthquakes.rows, qAvg = avg(q), qLast10 = avg(q.slice(-10));
    var w = h.wars.rows, wPeak = maxRow(w), wLast = w[w.length - 1];
    var c = h.conflicts.rows, cLast = c[c.length - 1], cPeak = maxRow(c);
    var dev = h.hunger.series[0].rows, wld = h.hunger.series[1].rows;
    var wldLow = wld.reduce(function (m, r) { return r[1] < m[1] ? r : m; });
    var wldPeakAfter = maxRow(wld.filter(function (r) { return r[0] > wldLow[0]; }));
    return {
      earthquakes: { text: 'About ' + Math.round(qAvg) + ' a year for 50 years. The last 10 years average ' + qLast10.toFixed(1) + ': no rise.', state: 'Normal vs ' + Math.round(qAvg) + '/yr', cls: 'calm' },
      wars: { text: 'Deadliest year since 1976 was ' + wPeak[0] + ' (' + wPeak[1] + ' per 100k). In ' + wLast[0] + ' it was ' + wLast[1] + '.', state: (cLast[1] >= cPeak[1] ? 'Record ' : '') + cLast[1] + ' conflicts (' + cLast[0] + ')', cls: 'hot' },
      conflicts: { text: (cLast[1] >= cPeak[1] ? 'A record ' : '') + cLast[1] + ' conflicts in ' + cLast[0] + ', up from ' + c[0][1] + ' in ' + c[0][0] + '.' },
      hunger: { text: 'Fell from ' + Math.round(dev[0][1]) + '% (' + dev[0][0] + ') to ' + Math.round(dev[dev.length - 1][1]) + '% (' + dev[dev.length - 1][0] + ') in developing countries. Worldwide it rose again after ' + wldLow[0] + ', to ' + wldPeakAfter[1] + '% in ' + wldPeakAfter[0] + '.', state: wld[wld.length - 1][1] + '% undernourished (' + wld[wld.length - 1][0] + ')', cls: 'hot' }
    };
  }

  /* The road */
  function renderRoad(events) {
    document.getElementById('road').innerHTML = events.map(function (e, i) {
      var cls = 'ev ' + e.status + (e.id === 'peace' ? ' watch-open' : '') + (i === events.length - 1 ? ' final' : '');
      var body = '<div class="ev-status">' + STATUS[e.status] + '</div>' +
        '<div class="ev-title">' + esc(e.title) + '</div>' +
        '<div class="ev-refs">' + esc(e.refs) + '</div>' +
        (e.text ? '<p class="ev-text">' + esc(e.text) + '</p>' : '') +
        (e.wouldCount ? '<p class="ev-text"><b>Would count:</b> ' + esc(e.wouldCount) + '</p>' : '') +
        (e.watching ? '<p class="ev-text"><b>Watching:</b> ' + esc(e.watching) + '</p>' : '') +
        (e.note ? '<p class="ev-text"><b>Timing:</b> ' + esc(e.note) + '</p>' : '') +
        (e.background ? '<div class="ev-bg">Background trend, not the event: ' + esc(e.background) + '</div>' : '');
      return '<li class="' + cls + '"><div class="ev-rail"><div class="dot"></div><div class="rail-line"></div></div>' +
        '<div class="ev-body"><div class="ev-box">' + body + '</div></div></li>';
    }).join('');
  }

  /* Signs grid */
  function renderSigns(signs, f) {
    document.getElementById('signs').innerHTML = signs.map(function (s) {
      var inner = '<span class="sign-name">' + esc(s.name) + '</span><span class="sign-ref">' + esc(s.ref) + '</span>';
      if (s.history && f[s.history]) {
        return '<a class="sign" href="#chart-' + s.history + '">' + inner + '<span class="sign-state ' + f[s.history].cls + '">' + esc(f[s.history].state) + '</span></a>';
      }
      return '<div class="sign">' + inner + '<span class="sign-state muted">' + esc(s.data) + '</span></div>';
    }).join('');
  }

  /* History charts */
  function chartCard(key, d, f, svg, legend) {
    return '<div class="chart-card" id="chart-' + key + '">' +
      '<p class="chart-title">' + esc(d.title) + '</p>' +
      '<p class="chart-finding">' + esc(f.text) + '</p>' + (legend || '') +
      '<div class="chart">' + svg + '</div>' +
      '<p class="chart-src">' + esc(d.note) + ' Source: <a href="' + d.sourceUrl + '" rel="noopener">' + esc(d.source) + '</a></p></div>';
  }
  function renderHistory(h, f) {
    var C = window.chartColors;
    var legend = '<div class="legend">' + h.hunger.series.map(function (s, i) { return '<span><i style="background:' + (i ? C.second : C.bar) + '"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>';
    document.getElementById('history').innerHTML =
      chartCard('earthquakes', h.earthquakes, f.earthquakes, barChart(h.earthquakes.rows, { label: h.earthquakes.title, unit: h.earthquakes.unit, average: true })) +
      chartCard('wars', h.wars, f.wars, barChart(h.wars.rows, { label: h.wars.title, unit: h.wars.unit })) +
      chartCard('conflicts', h.conflicts, f.conflicts, barChart(h.conflicts.rows, { label: h.conflicts.title, unit: h.conflicts.unit })) +
      chartCard('hunger', h.hunger, f.hunger, lineChart(h.hunger.series, { label: h.hunger.title, unit: h.hunger.unit }), legend);
  }

  /* Doomsday tab: live feeds that need no key */
  var liveLoaded = false;
  function card(label, big, small) { return '<div class="card"><div class="label">' + esc(label) + '</div><div class="big">' + esc(big) + '</div><div class="muted small">' + small + '</div></div>'; }
  function loadLive() {
    if (liveLoaded) return; liveLoaded = true;
    var el = document.getElementById('live');
    el.innerHTML = card('Loading', '…', 'Fetching live feeds');
    Promise.allSettled([
      get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson'),
      get('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')
    ]).then(function (res) {
      var out = '';
      if (res[0].status === 'fulfilled') {
        var feats = res[0].value.features, m7 = feats.filter(function (x) { return x.properties.mag >= 7; }).length;
        out += card('M7+ quakes, last 30 days', String(m7), 'Long-run normal: about 1.2 a month. <a href="https://earthquake.usgs.gov/earthquakes/map/">USGS</a>');
        out += card('M4.5+ quakes, last 30 days', String(feats.length), 'USGS live feed');
      } else out += card('Earthquakes', '—', 'USGS feed unavailable right now');
      if (res[1].status === 'fulfilled') {
        var rows = res[1].value, last = rows[rows.length - 1];
        var kp = Array.isArray(last) ? parseFloat(last[1]) : parseFloat(last.Kp || last.kp);
        var g = kp >= 9 ? 'G5' : kp >= 8 ? 'G4' : kp >= 7 ? 'G3' : kp >= 6 ? 'G2' : kp >= 5 ? 'G1' : 'No storm';
        out += card('Geomagnetic activity (Kp)', isNaN(kp) ? '—' : kp.toFixed(1), g + '. <a href="https://www.swpc.noaa.gov/">NOAA SWPC</a>');
      } else out += card('Space weather', '—', 'NOAA feed unavailable right now');
      el.innerHTML = out;
    });
  }

  /* World map: 2025 conflict countries (static file) + live USGS quakes */
  var map = null;
  function loadMap() {
    if (map) { setTimeout(function () { map.invalidateSize(); map.fitBounds([[-56, -170], [78, 190]]); }, 0); return; }
    if (!window.L) { document.getElementById('map').innerHTML = '<p class="muted small" style="padding:12px">Map library could not load.</p>'; return; }
    /* No tile server: the world outline ships in the repo (Natural Earth, public domain), so no API key or tile terms. */
    var world = [[-56, -170], [78, 190]];
    map = L.map('map', { zoomSnap: 0.25, minZoom: 1, maxZoom: 6, maxBounds: [[-75, -200], [88, 200]], maxBoundsViscosity: 0.8, attributionControl: true });
    map.fitBounds(world);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>').addAttribution('<a href="https://www.naturalearthdata.com/">Natural Earth</a>');
    map.createPane('quakes').style.zIndex = 450;

    var fit = function () { map.invalidateSize(); map.fitBounds(world); };
    window.addEventListener('resize', function () { clearTimeout(fit.t); fit.t = setTimeout(fit, 200); });

    Promise.all([get('data/world.geojson'), get('data/conflicts2025.json')]).then(function (d) {
      var outline = d[0], c = d[1], alias = c.outlineNames || {};
      var hot = {};
      c.countries.forEach(function (row) { hot[alias[row[0]] || row[0]] = row[0]; });
      L.geoJSON(outline, {
        style: function (f) {
          var on = hot[f.properties.name];
          return on ? { color: '#E58C6A', weight: 1, fillColor: '#E58C6A', fillOpacity: 0.55 }
                    : { color: '#2E3850', weight: 0.6, fillColor: '#1B2232', fillOpacity: 1 };
        },
        onEachFeature: function (f, layer) {
          var on = hot[f.properties.name];
          layer.bindTooltip(esc(on || f.properties.name) + (on ? ': armed conflict in 2025' : ''), { sticky: true });
        }
      }).addTo(map);
      /* Small countries vanish at world scale, so every conflict country also gets a ring at its centre */
      c.countries.forEach(function (row) {
        L.circleMarker([row[1], row[2]], { radius: 4, color: '#E58C6A', weight: 1.5, fillColor: '#E58C6A', fillOpacity: 0.9 })
          .bindTooltip(esc(row[0]) + ': armed conflict in 2025').addTo(map);
      });
      document.getElementById('map-src').innerHTML = esc(c.countries.length + ' countries. ' + c.note) + ' Sources: <a href="' + c.sourceUrl + '">' + esc(c.source) + '</a>, <a href="https://earthquake.usgs.gov/earthquakes/map/">USGS</a>, Natural Earth.';
    });

    get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson').then(function (gj) {
      gj.features.forEach(function (f) {
        var p = f.properties, xy = f.geometry.coordinates;
        L.circleMarker([xy[1], xy[0]], { pane: 'quakes', radius: Math.max(2.5, (p.mag - 4) * 3), color: '#7FB3D5', weight: 1, fillColor: '#7FB3D5', fillOpacity: 0.55 })
          .bindPopup('<b>M' + p.mag.toFixed(1) + '</b> ' + esc(p.place || '') + '<br>' + new Date(p.time).toUTCString().slice(5, 22) + ' UTC<br><a href="' + p.url + '" target="_blank" rel="noopener">USGS details</a>').addTo(map);
      });
    }).catch(function () { /* quakes layer simply stays empty if USGS is unreachable */ });
  }

  /* Same story, every region. data/story.json is written by the scheduled news pipeline (scripts/fetch_news.py).
     It is read straight from the repo so a fresh run shows up without waiting for a site rebuild. */
  var storyLoaded = false;
  function toneWord(t) { return t <= -5 ? 'very negative' : t <= -2 ? 'negative' : t < 2 ? 'neutral' : 'positive'; }
  function safeUrl(u) { return /^https?:\/\//i.test(u) ? u : '#'; }
  function loadStory() {
    if (storyLoaded) return; storyLoaded = true;
    var repo = (window.SITE_CONFIG || {}).dataRepo;
    var live = (repo ? get('https://raw.githubusercontent.com/' + repo + '/main/data/story.json') : Promise.reject())
      .catch(function () { return get('data/story.json'); })
      .catch(function () { return null; });
    Promise.all([get('data/outlets.json'), live]).then(function (res) {
      var d = res[0], story = res[1], byName = {};
      if (story) story.regions.forEach(function (r) { byName[r.name] = r; });
      var maxCount = story ? Math.max.apply(null, story.regions.map(function (r) { return r.count; }).concat([1])) : 1;

      var rows = d.regions.map(function (r) {
        var outlets = r.outlets.map(function (o) { return esc(o[0]) + (o[1] ? '<span class="tag ' + o[1] + '">' + (o[1] === 'state' ? 'state-controlled' : 'public funding') + '</span>' : ''); }).join(', ');
        var head = '<div class="region"><div class="region-name">' + esc(r.name) + '</div><div class="region-outlets">' + outlets + '</div>';
        var s = byName[r.name];
        if (!story) return head + '<div class="skel" aria-hidden="true"></div><div class="skel-line">Coverage volume, tone and top headline appear here</div></div>';
        if (!s || s.error) return head + '<div class="skel-line">No data on this run</div></div>';
        var stat = (s.count + (s.capped ? '+' : '')) + (s.count === 1 ? ' article' : ' articles') +
          (s.tone === null || s.tone === undefined ? '' : ' · tone ' + (s.tone > 0 ? '+' : '') + s.tone + ' (' + toneWord(s.tone) + ')');
        var heads = s.headlines.length ? s.headlines.map(function (h) {
          return '<a class="headline" href="' + esc(safeUrl(h.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(h.title) + '</a>';
        }).join('') : '<div class="skel-line">No coverage found from these outlets</div>';
        return head + '<div class="vol" aria-hidden="true"><i style="width:' + Math.round(100 * s.count / maxCount) + '%"></i></div>' +
          '<div class="region-stat">' + esc(stat) + '</div><div class="region-heads">' + heads + '</div></div>';
      }).join('');

      var top;
      if (story) {
        var when = new Date(story.generated);
        top = '<p class="story-title">Today\'s top risk story: ' + esc(story.topic) + (story.focus ? ' · ' + esc(story.focus) : '') + '</p>' +
          '<p class="small muted">Coverage in the ' + esc(story.window) + ' from each region\'s outlets. Updated ' + esc(when.toUTCString().slice(5, 22)) + ' UTC. Data: ' + esc(story.source) + '. Headlines link to the original outlet.</p>';
      } else {
        top = '<span class="badge">Layout preview</span><p class="story-title">Today\'s top risk story</p>' +
          '<p class="small muted">Filled automatically once the news pipeline runs. Headlines link to the original outlet.</p>';
      }
      document.getElementById('story').innerHTML = top + '<div class="regions">' + rows + '</div>' +
        '<div class="ai-box"><b>How the framing differs</b> (AI summary of headlines only): not switched on yet.</div>';
    });
  }

  /* Email signup via Buttondown, switched on in js/config.js */
  (function () {
    var user = (window.SITE_CONFIG || {}).buttondownUser, form = document.getElementById('signup-form');
    var note = document.getElementById('signup-note'), btn = form.querySelector('button');
    if (user) {
      form.action = 'https://buttondown.com/api/emails/embed-subscribe/' + encodeURIComponent(user);
      note.textContent = 'You will get one email to confirm. Handled by Buttondown.';
    } else {
      btn.disabled = true; form.querySelector('input').disabled = true;
      note.textContent = 'Signup opens soon.';
    }
  })();

  /* Boot */
  Promise.all([get('data/events.json'), get('data/history.json')]).then(function (d) {
    var f = findings(d[1]);
    renderRoad(d[0].events);
    renderSigns(d[0].signs, f);
    renderHistory(d[1], f);
  }).catch(function () {
    document.getElementById('road').innerHTML = '<li class="muted">Could not load data. If you opened the file directly, serve the folder instead (see README).</li>';
  });
  function tabFromHash() {
    if (/^#\/?doomsday$/.test(location.hash)) return showTab('doomsday');
    if (/^#\/?bible$/.test(location.hash) || !location.hash) return showTab('bible');
    /* any other hash (a chart anchor) leaves the current tab as it is */
  }
  window.addEventListener('hashchange', tabFromHash);
  showTab(/^#\/?doomsday$/.test(location.hash) ? 'doomsday' : 'bible');
})();
