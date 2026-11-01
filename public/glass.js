/* A lancet-window triptych in stained glass. Pure SVG, no images. PlumbGlass.svg(id) returns markup;
   id keeps gradient ids unique when more than one is on a page. */
window.PlumbGlass = (function () {
  var JEWELS = [["#3552E0", "#7C93FF"], ["#C2354F", "#F27C94"], ["#12896B", "#55D3AE"], ["#E0A21A", "#FFD76A"], ["#7A45C2", "#B98BFF"], ["#1E7FB8", "#6FC7F5"]];
  function arch(x, y, w, h) { var r = w / 2; return "M" + x + "," + (y + h) + " L" + x + "," + (y + r) + " A" + r + "," + r + " 0 0 1 " + (x + w) + "," + (y + r) + " L" + (x + w) + "," + (y + h) + " Z"; }
  function win(i, id, x, y, w, h, order, cross) {
    var cid = id + "c" + i, g = "", r = w / 2, rows = Math.round((h - r) / 38), pw = w / 3, n = 0;
    for (var row = 0; row < rows; row++) for (var col = 0; col < 3; col++) {
      var j = JEWELS[order[(n++) % order.length]];
      g += '<rect x="' + (x + col * pw) + '" y="' + (y + r + row * ((h - r) / rows)) + '" width="' + pw + '" height="' + ((h - r) / rows + 1) + '" fill="url(#' + id + "g" + ((n + i) % JEWELS.length) + ')"/>';
    }
    var topj = JEWELS[order[0]];
    g += '<circle cx="' + (x + w / 2) + '" cy="' + (y + r) + '" r="' + (r * 0.78) + '" fill="url(#' + id + "g" + ((order[1] + 1) % JEWELS.length) + ')"/>';
    var lead = '<g stroke="#070B24" stroke-width="3" fill="none" stroke-linecap="round">'
      + '<circle cx="' + (x + w / 2) + '" cy="' + (y + r) + '" r="' + (r * 0.78) + '"/>'
      + '<line x1="' + (x + pw) + '" y1="' + (y + r) + '" x2="' + (x + pw) + '" y2="' + (y + h) + '"/><line x1="' + (x + 2 * pw) + '" y1="' + (y + r) + '" x2="' + (x + 2 * pw) + '" y2="' + (y + h) + '"/>';
    for (var k = 1; k < rows; k++) lead += '<line x1="' + x + '" y1="' + (y + r + k * ((h - r) / rows)) + '" x2="' + (x + w) + '" y2="' + (y + r + k * ((h - r) / rows)) + '"/>';
    lead += '<line x1="' + (x + w / 2) + '" y1="' + (y + 4) + '" x2="' + (x + w / 2) + '" y2="' + (y + r * 2 - r * 0.22) + '"/></g>';
    var cx = x + w / 2, cy = y + r, c = cross ? '<g stroke="#FFE9A8" stroke-width="3.2" stroke-linecap="round"><line x1="' + cx + '" y1="' + (cy - r * 0.42) + '" x2="' + cx + '" y2="' + (cy + r * 0.42) + '"/><line x1="' + (cx - r * 0.28) + '" y1="' + (cy - r * 0.1) + '" x2="' + (cx + r * 0.28) + '" y2="' + (cy - r * 0.1) + '"/></g>' : "";
    return '<clipPath id="' + cid + '"><path d="' + arch(x, y, w, h) + '"/></clipPath><g clip-path="url(#' + cid + ')"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + topj[0] + '"/>' + g
      + '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="url(#' + id + 'glow)"/>' + lead + c + "</g>"
      + '<path d="' + arch(x, y, w, h) + '" fill="none" stroke="#070B24" stroke-width="5"/><path d="' + arch(x - 5, y - 5, w + 10, h + 10) + '" fill="none" stroke="rgba(255,233,168,.55)" stroke-width="1.5"/>';
  }
  function svg(id) {
    id = id || "pg"; var defs = "";
    JEWELS.forEach(function (j, i) { defs += '<linearGradient id="' + id + "g" + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + j[1] + '"/><stop offset="1" stop-color="' + j[0] + '"/></linearGradient>'; });
    defs += '<radialGradient id="' + id + 'glow" cx=".5" cy=".18" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".55" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>';
    return '<svg class="glass" viewBox="0 0 380 330" role="img" aria-label="Three stained glass windows" xmlns="http://www.w3.org/2000/svg"><defs>' + defs + "</defs>"
      + win(0, id, 14, 62, 100, 250, [0, 4, 1, 5, 2, 3], false) + win(1, id, 134, 14, 112, 298, [3, 0, 4, 1, 2, 5], true) + win(2, id, 266, 62, 100, 250, [2, 3, 5, 0, 1, 4], false)
      + '<rect x="0" y="318" width="380" height="8" rx="4" fill="rgba(0,0,0,.35)"/></svg>';
  }
  return { svg: svg };
})();
