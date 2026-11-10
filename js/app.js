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
    if (map) { setTimeout(function () { map.invalidateSize(); }, 0); return; }
    if (!window.L) { document.getElementById('map').innerHTML = '<p class="muted small" style="padding:12px">Map library could not load.</p>'; return; }
    map = L.map('map', { worldCopyJump: true, minZoom: 1, zoomControl: true }).setView([20, 15], 1);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 8,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }).addTo(map);
    get('data/conflicts2025.json').then(function (d) {
      d.countries.forEach(function (c) {
        L.circleMarker([c[1], c[2]], { radius: 9, color: '#E58C6A', weight: 1.5, fillColor: '#E58C6A', fillOpacity: 0.45 })
          .bindPopup('<b>' + esc(c[0]) + '</b><br>Armed conflict in 2025').addTo(map);
      });
      document.getElementById('map-src').innerHTML = esc(d.countries.length + ' countries. ' + d.note) + ' Sources: <a href="' + d.sourceUrl + '">' + esc(d.source) + '</a>, <a href="https://earthquake.usgs.gov/earthquakes/map/">USGS</a>.';
    });
    get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson').then(function (gj) {
      gj.features.forEach(function (f) {
        var p = f.properties, xy = f.geometry.coordinates;
        L.circleMarker([xy[1], xy[0]], { radius: Math.max(3, (p.mag - 4) * 3), color: '#7FB3D5', weight: 1, fillColor: '#7FB3D5', fillOpacity: 0.5 })
          .bindPopup('<b>M' + p.mag.toFixed(1) + '</b> ' + esc(p.place || '') + '<br>' + new Date(p.time).toUTCString().slice(5, 22) + ' UTC<br><a href="' + p.url + '" target="_blank" rel="noopener">USGS details</a>').addTo(map);
      });
    }).catch(function () { /* quakes layer simply stays empty if USGS is unreachable */ });
  }

  /* Same story, every region: layout mockup until the news pipeline fills it */
  var storyLoaded = false;
  function loadStory() {
    if (storyLoaded) return; storyLoaded = true;
    get('data/outlets.json').then(function (d) {
      var rows = d.regions.map(function (r) {
        var outlets = r.outlets.map(function (o) { return esc(o[0]) + (o[1] ? '<span class="tag ' + o[1] + '">' + (o[1] === 'state' ? 'state-controlled' : 'public funding') + '</span>' : ''); }).join(', ');
        return '<div class="region"><div class="region-name">' + esc(r.name) + '</div><div class="region-outlets">' + outlets + '</div>' +
          '<div class="skel" aria-hidden="true"></div><div class="skel-line">Coverage volume, tone and top headline appear here</div></div>';
      }).join('');
      document.getElementById('story').innerHTML = '<span class="badge">Layout preview</span>' +
        '<p class="story-title">Today\'s top risk story</p><p class="small muted">Filled automatically once the news pipeline runs. Headlines link to the original outlet.</p>' + rows +
        '<div class="ai-box"><b>How the framing differs</b> (AI summary of headlines only): appears here, clearly labelled.</div>';
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
  showTab(/^#\/?doomsday$/.test(location.hash) ? 'doomsday' : 'bible');
})();
