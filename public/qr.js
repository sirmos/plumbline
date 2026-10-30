// Minimal QR code generator (byte mode, error correction M, versions 1-10). No dependencies.
// Written for Plumb Line during the hackathon window. Usage: PlumbQR.svg("https://example.org", {size: 240})
(function (root) {
  "use strict";
  // Total codewords, EC codewords per block, and block layout [count, dataCodewords] for ECC level M, versions 1..10.
  const V = [null,
    { t: 26, e: 10, b: [[1, 16]] }, { t: 44, e: 16, b: [[1, 28]] }, { t: 70, e: 26, b: [[1, 44]] }, { t: 100, e: 18, b: [[2, 32]] },
    { t: 134, e: 24, b: [[2, 43]] }, { t: 172, e: 16, b: [[4, 27]] }, { t: 196, e: 18, b: [[4, 31]] }, { t: 242, e: 22, b: [[2, 38], [2, 39]] },
    { t: 292, e: 22, b: [[3, 36], [2, 37]] }, { t: 346, e: 26, b: [[4, 43], [1, 44]] }];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const EXP = new Array(512), LOG = new Array(256);
  (function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; } return g; }
  function rsRem(data, n) { const g = rsGen(n), r = new Array(n).fill(0); for (const d of data) { const f = d ^ r.shift(); r.push(0); if (f) for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f); } return r; }
  function utf8(s) { return Array.from(new TextEncoder().encode(s)); }
  function build(text) {
    const bytes = utf8(text);
    let ver = 0;
    for (let v = 1; v <= 10; v++) { const cap = V[v].b.reduce((a, [n, d]) => a + n * d, 0); const need = Math.ceil((4 + (v < 10 ? 8 : 16) + bytes.length * 8) / 8); if (need <= cap) { ver = v; break; } }
    if (!ver) throw new Error("Text too long for QR");
    const info = V[ver], cap = info.b.reduce((a, [n, d]) => a + n * d, 0), bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    for (let p = 0; data.length < cap; p ^= 1) data.push(p ? 0x11 : 0xec);
    const blocks = []; let o = 0;
    for (const [n, d] of info.b) for (let i = 0; i < n; i++) { const dc = data.slice(o, o + d); o += d; blocks.push({ d: dc, e: rsRem(dc, info.e) }); }
    const out = []; const maxd = Math.max(...blocks.map(b => b.d.length));
    for (let i = 0; i < maxd; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
    for (let i = 0; i < info.e; i++) for (const b of blocks) out.push(b.e[i]);
    const N = ver * 4 + 17, M = Array.from({ length: N }, () => new Array(N).fill(null)), F = Array.from({ length: N }, () => new Array(N).fill(false));
    const set = (r, c, v) => { if (r >= 0 && c >= 0 && r < N && c < N) { M[r][c] = v; F[r][c] = true; } };
    const finder = (r, c) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) { const on = i >= 0 && i <= 6 && j >= 0 && j <= 6 && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)); set(r + i, c + j, on); } };
    finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
    for (let i = 8; i < N - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const al = ALIGN[ver];
    for (const r of al) for (const c of al) { if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (c === 6 && r === al[al.length - 1])) continue;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) set(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1); }
    set(N - 8, 8, true);
    const fmtPos = [];
    for (let i = 0; i < 15; i++) { // reserve format areas
      const a = i < 8 ? [8, i < 6 ? i : i + 1] : (i < 9 ? [8, 7] : [14 - i, 8]); fmtPos.push(a); }
    const reserve = () => { for (let i = 0; i < 9; i++) { if (!F[8][i]) set(8, i, false); if (!F[i][8]) set(i, 8, false); } for (let i = 0; i < 8; i++) { set(8, N - 1 - i, false); set(N - 1 - i, 8, false); } set(N - 8, 8, true); };
    reserve();
    if (ver >= 7) { // version info
      let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const vb = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) { const bit = ((vb >> i) & 1) === 1, a = N - 11 + (i % 3), b = Math.floor(i / 3); set(b, a, bit); set(a, b, bit); }
    }
    // place data
    const stream = []; out.forEach(b => { for (let i = 7; i >= 0; i--) stream.push((b >> i) & 1); });
    const masks = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0, (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
    function layout(mask) {
      const G = M.map(r => r.slice()); let k = 0, up = true;
      for (let c = N - 1; c > 0; c -= 2) { if (c === 6) c--;
        for (let i = 0; i < N; i++) { const r = up ? N - 1 - i : i;
          for (let d = 0; d < 2; d++) { const cc = c - d; if (F[r][cc]) continue; let v = k < stream.length ? stream[k++] === 1 : false; if (masks[mask](r, cc)) v = !v; G[r][cc] = v; } }
        up = !up; }
      // format info, level M = 00
      const fi = ((0 << 3) | mask); let rem = fi; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const fb = (((fi << 10) | rem) ^ 0x5412);
      for (let i = 0; i < 15; i++) { const bit = ((fb >> i) & 1) === 1;
        if (i < 6) G[i][8] = bit; else if (i < 8) G[i + 1][8] = bit; else G[N - 15 + i][8] = bit;
        if (i < 8) G[8][N - 1 - i] = bit; else if (i < 9) G[8][15 - i - 1 + 1 - 1 + 0] = bit; else G[8][14 - i] = bit; }
      G[N - 8][8] = true; return G;
    }
    function penalty(G) {
      let p = 0;
      for (let r = 0; r < N; r++) for (const dir of [0, 1]) { let run = 1; for (let i = 1; i < N; i++) { const a = dir ? G[i][r] : G[r][i], b = dir ? G[i - 1][r] : G[r][i - 1]; if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) if (G[r][c] === G[r + 1][c] && G[r][c] === G[r][c + 1] && G[r][c] === G[r + 1][c + 1]) p += 3;
      let dark = 0; for (const row of G) for (const v of row) if (v) dark++;
      p += Math.floor(Math.abs((dark * 100) / (N * N) - 50) / 5) * 10; return p;
    }
    let best = null, bp = Infinity; for (let m = 0; m < 8; m++) { const G = layout(m), p = penalty(G); if (p < bp) { bp = p; best = G; } }
    return best;
  }
  function svg(text, o) {
    o = o || {}; const G = build(text), N = G.length, q = 4, S = N + q * 2; let d = "";
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (G[r][c]) d += "M" + (c + q) + " " + (r + q) + "h1v1h-1z";
    const px = o.size || 240;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + S + " " + S + '" width="' + px + '" height="' + px + '" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="' + (o.color || "#000") + '"/></svg>';
  }
  const api = { build, svg };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PlumbQR = api;
})(typeof self !== "undefined" ? self : this);
