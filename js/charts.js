/* Small hand-rolled SVG charts. No libraries. */
(function () {
  var W = 360, H = 200, L = 34, R = 10, T = 14, B = 26;
  var C = { grid: '#232B3D', axis: '#3A4560', bar: '#6B7A96', accent: '#E0A33A', ink: '#EDE6D6', muted: '#9AA3B5', second: '#7FB3D5' };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function niceStep(v) { var p = Math.pow(10, Math.floor(Math.log10(v))); var n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  /* Round the top of the axis up to a whole number of tidy steps (about 4 gridlines). */
  function niceMax(v) { var step = niceStep(v / 4); return Math.ceil(v / step) * step; }
  function fmt(v) { return Math.abs(v) >= 10 || v === 0 ? String(Math.round(v)) : v.toFixed(1); }

  function frame(x0, x1, yMax, label) {
    var s = '', step = niceStep(yMax / 4), n = Math.round(yMax / step);
    for (var i = 0; i <= n; i++) {
      var v = step * i, y = T + (H - T - B) * (1 - v / yMax);
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="' + (i ? C.grid : C.axis) + '"/>';
      s += '<text x="' + (L - 5) + '" y="' + (y + 4) + '" fill="' + C.muted + '" font-size="10.5" text-anchor="end">' + fmt(v) + '</text>';
    }
    var start = Math.ceil(x0 / 10) * 10;
    for (var yr = start; yr <= x1; yr += 10) {
      s += '<text x="' + xPos(yr, x0, x1) + '" y="' + (H - 8) + '" fill="' + C.muted + '" font-size="10.5" text-anchor="middle">' + yr + '</text>';
    }
    return s;
  }
  function xPos(year, x0, x1) { return L + (W - L - R) * (year - x0 + 0.5) / (x1 - x0 + 1); }
  function yPos(v, yMax) { return T + (H - T - B) * (1 - v / yMax); }

  /* Bars per year, dashed average line, latest year in the accent. */
  window.barChart = function (rows, opts) {
    var x0 = rows[0][0], x1 = rows[rows.length - 1][0];
    var maxV = Math.max.apply(null, rows.map(function (r) { return r[1]; }));
    var yMax = niceMax(maxV * 1.08);
    var bw = Math.max(2, (W - L - R) / (x1 - x0 + 1) - 1.5);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.label) + '">' + frame(x0, x1, yMax);
    rows.forEach(function (r, i) {
      var x = xPos(r[0], x0, x1) - bw / 2, y = yPos(r[1], yMax);
      var last = i === rows.length - 1;
      s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (H - B - y).toFixed(1) + '" fill="' + (last ? C.accent : C.bar) + '"><title>' + r[0] + ': ' + r[1] + ' ' + esc(opts.unit) + '</title></rect>';
    });
    if (opts.average) {
      var avg = rows.reduce(function (a, r) { return a + r[1]; }, 0) / rows.length, ay = yPos(avg, yMax);
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ay + '" y2="' + ay + '" stroke="' + C.ink + '" stroke-dasharray="4 3"/>';
      s += '<text x="' + (L + 4) + '" y="' + (T + 10) + '" fill="' + C.ink + '" font-size="11">- - ' + rows.length + '-yr average ' + avg.toFixed(1) + '</text>';
    }
    return s + '</svg>';
  };

  /* One line per series on a shared year axis. First series grey, second blue. */
  window.lineChart = function (series, opts) {
    var all = [].concat.apply([], series.map(function (s) { return s.rows; }));
    var x0 = Math.min.apply(null, all.map(function (r) { return r[0]; }));
    var x1 = Math.max.apply(null, all.map(function (r) { return r[0]; }));
    var yMax = niceMax(Math.max.apply(null, all.map(function (r) { return r[1]; })) * 1.08);
    var colors = [C.bar, C.second];
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.label) + '">' + frame(x0, x1, yMax);
    series.forEach(function (ser, k) {
      var pts = ser.rows.map(function (r) { return xPos(r[0], x0, x1).toFixed(1) + ',' + yPos(r[1], yMax).toFixed(1); }).join(' ');
      s += '<polyline points="' + pts + '" fill="none" stroke="' + colors[k] + '" stroke-width="2.25"/>';
      ser.rows.forEach(function (r) {
        s += '<circle cx="' + xPos(r[0], x0, x1).toFixed(1) + '" cy="' + yPos(r[1], yMax).toFixed(1) + '" r="2" fill="' + colors[k] + '"><title>' + esc(ser.name) + ', ' + r[0] + ': ' + r[1] + esc(opts.unit) + '</title></circle>';
      });
      var lastR = ser.rows[ser.rows.length - 1];
      s += '<text x="' + Math.min(W - R, xPos(lastR[0], x0, x1) + 4) + '" y="' + (yPos(lastR[1], yMax) - 7) + '" fill="' + C.ink + '" font-size="11" text-anchor="end">' + lastR[1] + esc(opts.unit) + '</text>';
    });
    return s + '</svg>';
  };

  window.chartColors = C;
})();
