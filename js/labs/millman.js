/* EE 211 — Millman's theorem lab (topic: millman).
 * 2–4 parallel branches between node a (top rail) and node b (bottom rail). Branch k = ideal source V_k
 * (+ toward a, + toward b, or no source) in series with R_k. Optional load R_L across a–b.
 * Second mode: the binary-weighted resistor DAC from mt1 (V_B0..V_B3 through R, 2R, 4R, 8R).
 * Notation follows site/data/guides/mt1.html: V_out, I_N, R_N, sum of V_k/R_k over sum of 1/R_k.
 * All maths lives in def.model (pure, no DOM) and is tested by build/tests/test_lab_millman.py.
 */
(function (global) {
  'use strict';
  if (!global.EELabs) return;

  var MAXN = 4, MINN = 2;
  var DEF_BR = [
    { pol: 'up', v: 12, r: 2000 },
    { pol: 'up', v: 6, r: 3000 },
    { pol: 'none', v: 0, r: 6000 },
    { pol: 'up', v: 5, r: 4000 }
  ];

  /* ------------------------------------------------------------------ model (pure) */
  function num(x, d) { x = +x; return isFinite(x) ? x : d; }
  function clampInt(x, a, b, d) { x = Math.round(num(x, d)); return Math.min(b, Math.max(a, x)); }

  /* Fill defaults and clamp a (possibly partial / old) state object. Never throws. */
  function normalize(s) {
    s = s || {};
    var out = {
      mode: s.mode === 'dac' ? 'dac' : 'general',
      n: clampInt(s.n, MINN, MAXN, 2),
      br: [],
      load: !!s.load,
      rl: num(s.rl, 3000),
      names: Array.isArray(s.names) ? s.names.map(String) : null,
      src: s.src ? String(s.src) : null,
      dac: {
        vref: num(s.dac && s.dac.vref, 5),
        r: num(s.dac && s.dac.r, 1000),
        bits: [0, 1, 2, 3].map(function (k) { return s.dac && s.dac.bits && s.dac.bits[k] ? 1 : 0; })
      }
    };
    for (var k = 0; k < MAXN; k++) {
      var b = (s.br && s.br[k]) || {};
      var d = DEF_BR[k];
      out.br.push({
        pol: b.pol === 'down' || b.pol === 'none' || b.pol === 'up' ? b.pol : d.pol,
        v: num(b.v, d.v),
        r: num(b.r, d.r)
      });
    }
    return out;
  }

  /* Signed source voltage of a branch: + toward a counts positive (guide convention), reversed negative, none 0. */
  function signedV(b) {
    if (!b || b.pol === 'none') return 0;
    var v = Math.abs(num(b.v, 0));
    return b.pol === 'down' ? -v : v;
  }

  /* DAC helper (binary-weighted, V_B0 on R ... V_B3 on 8R, inputs 0 or vref, unloaded).
   * weight = 8 b0 + 4 b1 + 2 b2 + b3 (V_B0 has the smallest resistor, hence the largest weight). */
  function dac(bits, vref) {
    var b = [0, 1, 2, 3].map(function (k) { return bits && bits[k] ? 1 : 0; });
    var code = 8 * b[0] + 4 * b[1] + 2 * b[2] + b[3];
    return {
      bits: b, code: code,
      vout: vref * code / 15,          // passive R-2R-4R-8R network, Millman, no load
      step: vref / 15,
      table16: vref * code / 16,       // the notes' 4-bit table: code x Vref/16 ("different DAC designs")
      rnOverR: 8 / 15
    };
  }

  /* Turn a state into the solver input: [{v (signed), r}], names, resistor labels, load. */
  function circuitOf(state) {
    var s = normalize(state);
    var list = [], names = [], rlabels = [], pols = [];
    if (s.mode === 'dac') {
      var RL = ['R', '2R', '4R', '8R'];
      for (var k = 0; k < 4; k++) {
        list.push({ v: s.dac.bits[k] ? s.dac.vref : 0, r: s.dac.r * Math.pow(2, k) });
        names.push('B' + k); rlabels.push(RL[k]); pols.push('up');
      }
    } else {
      for (var j = 0; j < s.n; j++) {
        var b = s.br[j];
        list.push({ v: signedV(b), r: b.r });
        var nm = s.names && s.names[j] ? s.names[j] : String(j + 1);
        names.push(nm); rlabels.push('R_{' + nm + '}'); pols.push(b.pol);
      }
    }
    return { list: list, names: names, rlabels: rlabels, pols: pols, rl: s.load ? s.rl : null, mode: s.mode, state: s };
  }

  /* Millman solver. list = [{v: signed source voltage (+ toward a), r: series resistance > 0}],
   * rl = load resistance across a-b (null/undefined/Infinity = no load, 0 = short).
   * down[k] = current leaving node a down through branch k = (V_ab - V_k)/R_k (guide's KCL check convention). */
  function solve(list, rl) {
    if (!list || !list.length) return { ok: false, error: 'Add at least one branch.' };
    for (var k = 0; k < list.length; k++) {
      var r = list[k].r, v = list[k].v;
      if (typeof r !== 'number' || !isFinite(r) || r <= 0) return { ok: false, k: k, error: 'Every branch resistance must be a finite value greater than 0 Ω (branch ' + (k + 1) + ').' };
      if (typeof v !== 'number' || !isFinite(v)) return { ok: false, k: k, error: 'Branch ' + (k + 1) + ' has an invalid source voltage.' };
    }
    var hasLoad = rl != null && rl !== Infinity;
    if (hasLoad && (typeof rl !== 'number' || isNaN(rl) || rl < 0)) return { ok: false, error: 'The load resistance must be 0 Ω or more.' };
    var G = [], I = [], sumG = 0, IN = 0;
    list.forEach(function (b) { var g = 1 / b.r; G.push(g); I.push(b.v / b.r); sumG += g; IN += b.v / b.r; });
    var RN = 1 / sumG, Vout = IN / sumG;
    var w = G.map(function (g) { return g / sumG; });
    var vmin = Infinity, vmax = -Infinity;
    list.forEach(function (b) { vmin = Math.min(vmin, b.v); vmax = Math.max(vmax, b.v); });
    var res = { ok: true, n: list.length, G: G, I: I, sumG: sumG, IN: IN, RN: RN, Vout: Vout, w: w, vmin: vmin, vmax: vmax, load: hasLoad };
    var vab = Vout, IL = 0;
    if (hasLoad) {
      var VL, VL2;
      if (rl === 0) { VL = 0; IL = IN; VL2 = 0; }
      else {
        IL = Vout / (RN + rl);
        VL = IL * rl;
        VL2 = IN / (sumG + 1 / rl);      // same thing: R_L as one more source-free branch
      }
      res.rl = rl; res.VL = VL; res.VL2 = VL2; res.IL = IL; res.PL = VL * IL;
      res.ratio = Vout !== 0 ? VL / Vout : (rl === 0 ? 0 : rl / (RN + rl));
      vab = VL;
    }
    res.vab = vab;
    // (V_ab - V_k) written as a weighted sum of source differences avoids cancellation when V_ab is close to V_k
    var gl = hasLoad ? (rl === 0 ? Infinity : 1 / rl) : 0;
    res.down = list.map(function (b) {
      if (gl === Infinity) return -b.v / b.r;
      var s = 0;
      list.forEach(function (q, j) { s += G[j] * (q.v - b.v); });
      return ((s - gl * b.v) / (sumG + gl)) / b.r;
    });
    // scale for rounding: the largest magnitude that enters any term (|V_ab| + |V_k|)/R_k
    var kcl = IL, scale = Math.abs(IL);
    res.down.forEach(function (d, k) { kcl += d; scale = Math.max(scale, (Math.abs(vab) + Math.abs(list[k].v)) / list[k].r); });
    res.kcl = kcl;
    res.kclScale = scale;
    res.kclOk = Math.abs(kcl) <= 1e-9 * Math.max(scale, 1e-300) + 1e-300;
    return res;
  }

  /* Convenience: solve straight from a lab state. */
  function evaluate(state) {
    var c = circuitOf(state);
    var r = solve(c.list, c.rl);
    r.circuit = c;
    if (c.mode === 'dac') r.dac = dac(c.state.dac.bits, c.state.dac.vref);
    return r;
  }

  var model = { normalize: normalize, signedV: signedV, circuitOf: circuitOf, solve: solve, evaluate: evaluate, dac: dac };

  /* ------------------------------------------------------------------ presets (sources in work/redesign/labs/millman.md) */
  var presets = [
    {
      id: 'mt1-notes-two-input',
      label: 'Notes: 3 V through R, 1 V through 2R',
      lesson: 'mt1', sec: 'mt1-dac',
      values: {
        mode: 'general', n: 2, load: false, rl: 3000, names: ['B0', 'B1'], src: 'mt1-notes-two-input',
        br: [{ pol: 'up', v: 3, r: 1000 }, { pol: 'up', v: 1, r: 2000 }, { pol: 'none', v: 0, r: 6000 }, { pol: 'up', v: 5, r: 4000 }]
      }
    },
    {
      id: 'mt1-dac-1010', extra: true,
      label: 'Binary-weighted DAC, inputs 1010',
      lesson: 'mt1', sec: 'mt1-dac',
      values: { mode: 'dac', n: 4, load: false, rl: 10000, src: 'mt1-dac-1010', dac: { vref: 5, r: 1000, bits: [1, 0, 1, 0] } }
    },
    {
      id: 'mt1-equal-200',
      label: 'Try: equal 200 Ω resistors (sources chosen by the lab)',
      extra: true,
      lesson: 'mt1', sec: 'mt1-qa',
      values: {
        mode: 'general', n: 2, load: false, rl: 1000, src: 'mt1-equal-200',
        br: [{ pol: 'up', v: 10, r: 200 }, { pol: 'up', v: 4, r: 200 }, { pol: 'none', v: 0, r: 6000 }, { pol: 'up', v: 5, r: 4000 }]
      }
    },
    {
      id: 'mt1-ex5', extra: true,
      label: 'Section 9: reversed source, no-source branch, 3 kΩ load',
      lesson: 'mt1', sec: 'mt1-apply',
      values: {
        mode: 'general', n: 3, load: true, rl: 3000, src: 'mt1-ex5',
        br: [{ pol: 'up', v: 12, r: 2000 }, { pol: 'down', v: 6, r: 3000 }, { pol: 'none', v: 0, r: 6000 }, { pol: 'up', v: 5, r: 4000 }]
      }
    }
  ];
  var PRESET_NOTES = {
    'mt1-notes-two-input': 'From the pencil notes in the DAC part of the lesson (not discussed aloud): \\(V_{B0} = 3\\ \\text{V}\\) through R and \\(V_{B1} = 1\\ \\text{V}\\) through 2R. The notes give no value for R, so the lab uses R = 1 kΩ. R cancels in \\(V_{out}\\) (7/3 V ≈ 2.33 V for any R) but not in \\(R_N\\). The guide flags that the notes may read "2 V"; the exact result is 2.33 V.',
    'mt1-dac-1010': 'The guide\'s worked Millman analysis of the R, 2R, 4R, 8R network (additional teaching in the lesson guide): inputs are 0 V or 5 V, \\(V_{out} = 5\\ \\text{V} \\times \\text{code}/15\\), so 1010 gives 3.333 V. The guide notes the video does not settle which input is the MSB; here \\(V_{B0}\\) (on R) carries the largest weight. R is not given, so the lab uses 1 kΩ (it does not change \\(V_{out}\\)).',
    'mt1-equal-200': 'Try scenario, not a lesson example; only the resistors come from the class Q&amp;A: two equal 200 Ω resistors in parallel give \\(R_N = 100\\ \\Omega\\). The lesson gives no source voltages for this case; 10 V and 4 V are lab choices to show that equal resistors make \\(V_{out}\\) the plain average (7 V).',
    'mt1-ex5': 'Practice example the guide adds in section 9 (additional teaching, not from the video): \\(V_{out} = 4\\ \\text{V}\\), \\(R_N = 1\\ \\text{k}\\Omega\\), and with the 3 kΩ load \\(I_L = 1\\ \\text{mA}\\), \\(V_L = 3\\ \\text{V}\\).'
  };

  /* ------------------------------------------------------------------ helpers for display */
  var CSS = [
    '.lab-millman-branch[hidden]{display:none}',
    '.lab-millman-branch > h4{display:flex;align-items:center;gap:6px}',
    '.lab-millman-sw{display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--topic)}',
    '.lab-millman-bits{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-2)}',
    '.lab-millman-bit{font:inherit;font-size:var(--fs-sm);display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:6px 10px;border:1px solid var(--line-strong);border-radius:var(--r-md);background:var(--surface);color:var(--ink);cursor:pointer;text-align:left;transition:background var(--dur-1),border-color var(--dur-1)}',
    '.lab-millman-bit b{font-family:var(--font-mono);font-size:var(--fs-md)}',
    '.lab-millman-bit span{font-size:var(--fs-xs);color:var(--ink-2)}',
    '.lab-millman-bit[aria-pressed="true"]{background:var(--topic-tint);border-color:var(--topic);color:var(--topic-ink)}',
    '.lab-millman-bit:focus-visible{outline:2px solid var(--topic);outline-offset:2px}',
    '.lab-millman-h{margin:0;font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--ink-2);font-weight:600}',
    '.lab-millman-sec{display:flex;flex-direction:column;gap:var(--sp-2);min-width:0}',
    '.lab-millman-cap{margin:0;font-size:var(--fs-sm);color:var(--ink-2)}',
    '.lab-millman-wavg{border:1px solid var(--line);border-radius:var(--r-md);background:var(--surface);padding:var(--sp-2);min-width:0}',
    '.lab-millman-wavg svg{display:block;width:100%;height:auto}',
    '.lab-millman-wavg .bar{fill:var(--topic-tint);stroke:var(--topic);stroke-width:1.5}',
    '.lab-millman-wavg .axis{stroke:var(--chart-axis);stroke-width:1}',
    '.lab-millman-wavg .tick{fill:var(--ink-2);font:11px var(--font-mono)}',
    '.lab-millman-wavg .nm{fill:var(--ink);font:600 12px var(--font-body)}',
    '.lab-millman-wavg .wt{fill:var(--ink-2);font:11px var(--font-mono)}',
    '.lab-millman-wavg .vo{stroke:var(--ink);stroke-width:2}',
    '.lab-millman-wavg .vo-t{fill:var(--ink);font:600 12px var(--font-mono)}',
    '.lab-millman-wavg .fulcrum{fill:var(--ink)}',
    '.lab-millman-wavg .vl{stroke:var(--chart-2);stroke-width:2;stroke-dasharray:5 4}',
    '.lab-millman-wavg .vl-t{fill:var(--ink-2);font:12px var(--font-mono)}',
    '.lab-millman-wavg text{paint-order:stroke;stroke:var(--surface);stroke-width:3px}',
    '.lab-millman-wavg .bar,.lab-millman-wavg .axis,.lab-millman-wavg .vo,.lab-millman-wavg .vl{paint-order:normal}',
    '.lab-millman-ok{color:var(--ok);font-weight:600}',
    '.lab-millman-badk{color:var(--bad);font-weight:600}',
    '.lab-millman-dir{white-space:nowrap}',
    '.lab-millman-msgs{display:flex;flex-direction:column;gap:var(--sp-2)}',
    '.lab-millman-msgs:empty{display:none}',
    '.lab .lab-table td.lab-millman-l, .lab .lab-table th.lab-millman-l{text-align:left}',
    '.lab-millman-tcap{caption-side:bottom;text-align:left;padding-top:6px}',
    '.lab-millman-hidden{display:none !important}',
    '.lab-millman .katex,.lab-millman .lab-millman-nm{text-transform:none;letter-spacing:normal}'
  ].join('\n');

  function injectCss() {
    if (document.getElementById('lab-millman-css')) return;
    var st = document.createElement('style');
    st.id = 'lab-millman-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  var PREFIX = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  function texUnit(prefix, unit) {
    var p = prefix === 'µ' ? '\\mu' : (prefix ? '\\text{' + prefix + '}' : '');
    var u = unit === 'Ω' ? '\\Omega' : '\\text{' + unit + '}';
    return p + u;
  }
  /* "−4.5 mA" (kit.fmt) → TeX "-4.5\,\text{mA}" */
  function tq(kit, v, unit, sig) {
    var s = kit.fmt(v, unit, sig || 4).replace(/−/g, '-');
    if (s.indexOf('∞') >= 0) return (v < 0 ? '-' : '') + '\\infty';
    var m = s.match(/^(-?[\d.]+)\s*(.*)$/);
    if (!m) return s;
    var rest = m[2], prefix = '';
    if (rest.length > unit.length) prefix = rest.slice(0, rest.length - unit.length);
    return m[1] + '\\,' + texUnit(prefix, unit);
  }
  /* Express several values in one common prefix (for sums): returns {terms:[tex], f, unitTex} */
  function common(kit, vals, unit) {
    var mx = 0;
    vals.forEach(function (v) { if (isFinite(v)) mx = Math.max(mx, Math.abs(v)); });
    var f = 1, pre = '';
    if (mx > 0) {
      for (var i = 0; i < PREFIX.length; i++) { if (mx >= PREFIX[i][0] * 0.9995 || i === PREFIX.length - 1) { f = PREFIX[i][0]; pre = PREFIX[i][1]; break; } }
    }
    var ut = texUnit(pre, unit);
    return {
      f: f, unitTex: ut,
      one: function (v) { return kit.sigStr(v / f, 4).replace(/−/g, '-') + '\\,' + ut; },
      sum: function (vs) {
        var out = '';
        vs.forEach(function (v, i) {
          var s = kit.sigStr(Math.abs(v / f) < 5e-13 ? 0 : v / f, 4).replace(/−/g, '-');
          if (i === 0) out += s;
          else if (s.charAt(0) === '-') out += ' - ' + s.slice(1);
          else out += ' + ' + s;
        });
        return out;
      }
    };
  }
  function sub(nm) { return nm.length > 1 ? '{' + nm + '}' : nm; }

  /* ------------------------------------------------------------------ diagrams */
  function mainSpec(kit, c, r) {
    var parts = [], n = c.list.length, X = 4;
    var hasLoad = c.rl != null;
    var lastX = (n - 1) * X;
    var xL = lastX + 3.5;
    var xT = (hasLoad ? xL : lastX) + 2.5;
    parts.push({ t: 'W', pts: [[0, 0], [xT, 0]] });
    parts.push({ t: 'W', pts: [[0, 6], [xT, 6]] });
    var desc = [];
    c.list.forEach(function (b, k) {
      var x = k * X, nm = c.names[k], pol = c.pols[k];
      parts.push({ t: 'R', a: [x, 0], b: [x, 3], label: c.rlabels[k], value: kit.fmt(b.r, 'Ω', 4) });
      var sdesc;
      if (pol === 'none') {
        parts.push({ t: 'W', pts: [[x, 3], [x, 6]] });
        sdesc = 'no source';
      } else {
        parts.push({ t: 'BAT', a: [x, 6], b: [x, 3], label: 'V_' + sub(nm), value: kit.fmt(Math.abs(b.v), 'V', 4), side: -1, plus: pol === 'down' ? 'a' : 'b' });
        sdesc = kit.fmt(Math.abs(b.v), 'V', 4) + ' source with + toward ' + (pol === 'down' ? 'b' : 'a');
      }
      var d = r.ok ? r.down[k] : 0;
      var dtxt = 'no current';
      if (r.ok && Math.abs(d) > 1e-12 * Math.max(r.kclScale, 1e-300)) {
        parts.push({ t: 'IARR', a: d > 0 ? [x, 0.1] : [x, 0.85], b: d > 0 ? [x, 0.85] : [x, 0.1], label: kit.fmt(Math.abs(d), 'A', 3), side: -1 });
        dtxt = kit.fmt(Math.abs(d), 'A', 3) + (d > 0 ? ' down' : ' up');
      } else if (r.ok) {
        parts.push({ t: 'T', at: [x - 0.35, 0.6], text: '0 A', anchor: 'end', cls: 'accent' });
      }
      desc.push('branch ' + nm + ': ' + c.rlabels[k].replace(/[{}_]/g, '') + ' = ' + kit.fmt(b.r, 'Ω', 4) + ', ' + sdesc + ', current ' + dtxt);
    });
    if (hasLoad) {
      parts.push({ t: 'W', pts: [[xL, 0], [xL, 1.5]] });
      parts.push({ t: 'R', a: [xL, 1.5], b: [xL, 4.5], label: 'R_L', value: kit.fmt(c.rl, 'Ω', 4) });
      parts.push({ t: 'W', pts: [[xL, 4.5], [xL, 6]] });
      if (r.ok && Math.abs(r.IL) > 1e-12 * Math.max(r.kclScale, 1e-300)) {
        parts.push({ t: 'IARR', a: r.IL > 0 ? [xL, 0.2] : [xL, 1.2], b: r.IL > 0 ? [xL, 1.2] : [xL, 0.2], label: 'I_L ' + kit.fmt(Math.abs(r.IL), 'A', 3), side: -1 });
      }
      desc.push('load R_L = ' + kit.fmt(c.rl, 'Ω', 4));
    }
    parts.push({ t: 'N', at: [xT, 0], open: true, label: 'a', pos: 'n' });
    parts.push({ t: 'N', at: [xT, 6], open: true, label: 'b', pos: 's' });
    parts.push({ t: 'VM', a: [xT + 0.7, 0.8], b: [xT + 0.7, 5.2], label: 'V_{ab}\n' + (r.ok ? kit.fmt(r.vab, 'V', 4) : '?'), lat: [xT + 1.0, 2.7], anchor: 'start' });
    return {
      parts: parts, pad: 1.1,
      alt: 'Millman circuit between node a (top) and node b (bottom). ' + desc.join('; ') + '. V_ab = ' + (r.ok ? kit.fmt(r.vab, 'V', 4) : 'undefined') + '.'
    };
  }

  function eqSpec(kit, r, hasLoad, rl) {
    var IN = kit.fmt(r.IN, 'A', 4), RN = kit.fmt(r.RN, 'Ω', 4), VO = kit.fmt(r.Vout, 'V', 4);
    var parts = [
      { t: 'I', a: [0, 4], b: [0, 1], label: 'I_N', value: IN, side: -1 },
      { t: 'W', pts: [[0, 1], [2, 1]] }, { t: 'W', pts: [[0, 4], [2, 4]] },
      { t: 'R', a: [2, 1], b: [2, 4], label: 'R_N', value: RN },
      { t: 'W', pts: [[2, 1], [4.2, 1]] }, { t: 'W', pts: [[2, 4], [4.2, 4]] },
      { t: 'N', at: [4.2, 1], open: true, label: 'a', pos: 'n' }, { t: 'N', at: [4.2, 4], open: true, label: 'b', pos: 's' },
      { t: 'T', at: [2.1, 5.6], text: 'Norton form', cls: 'muted' },
      { t: 'ARROW', a: [5.2, 2.5], b: [7.2, 2.5], label: 'transform', lat: [6.2, 2.1] },
      { t: 'BAT', a: [8.6, 4], b: [8.6, 1], label: 'V_{out}', value: VO, side: -1 },
      { t: 'W', pts: [[8.6, 1], [9.2, 1]] },
      { t: 'R', a: [9.2, 1], b: [12.2, 1], label: 'R_N', value: RN },
      { t: 'W', pts: [[12.2, 1], [13, 1]] },
      { t: 'W', pts: [[8.6, 4], [13, 4]] },
      { t: 'N', at: [13, 1], open: true, label: 'a', pos: 'n' }, { t: 'N', at: [13, 4], open: true, label: 'b', pos: 's' },
      { t: 'T', at: [10.8, 5.6], text: 'Thévenin form (Millman equivalent)', cls: 'muted' }
    ];
    var alt = 'Millman equivalent: Norton form, current source I_N = ' + IN + ' (arrow toward a) in parallel with R_N = ' + RN +
      ', transformed to a source V_out = ' + VO + ' (+ toward a) in series with R_N = ' + RN;
    if (hasLoad) {
      parts.push({ t: 'W', pts: [[13, 1], [15, 1], [15, 1.2]] });
      parts.push({ t: 'R', a: [15, 1.2], b: [15, 3.8], label: 'R_L', value: kit.fmt(rl, 'Ω', 4) });
      parts.push({ t: 'W', pts: [[15, 3.8], [15, 4], [13, 4]] });
      if (Math.abs(r.IL) > 0) parts.push({ t: 'IARR', a: r.IL > 0 ? [13.4, 1] : [14.6, 1], b: r.IL > 0 ? [14.6, 1] : [13.4, 1], label: 'I_L ' + kit.fmt(Math.abs(r.IL), 'A', 3) });
      alt += ', driving the load R_L = ' + kit.fmt(rl, 'Ω', 4) + ' with I_L = ' + kit.fmt(r.IL, 'A', 4);
    }
    return { parts: parts, pad: 1.0, alt: alt + '.' };
  }

  function sizeSvg(host) {
    var svg = host.querySelector('svg');
    if (!svg) return;
    var w = parseFloat(svg.getAttribute('width')) || 0;
    if (w) svg.style.minWidth = Math.min(w, 540) + 'px';
  }

  /* Weighted-average strip: each source voltage as a bar whose height is its weight G_k / ΣG; V_out is the balance point. */
  function drawWavg(kit, host, c, r) {
    var NS = 'http://www.w3.org/2000/svg';
    host.innerHTML = '';
    if (!r.ok) return;
    var W = Math.max(280, Math.round(host.clientWidth || 600)), H = 244;
    var ml = 26, mr = 26, base = 198, barMax = 100;
    var vals = c.list.map(function (b) { return b.v; }).concat([r.Vout]);
    if (r.load) vals.push(r.VL);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1e-9 * Math.max(1, Math.abs(hi))) { lo -= 1; hi += 1; }
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    function X(v) { return ml + (v - lo) / (hi - lo) * (W - ml - mr); }
    var svg = document.createElementNS(NS, 'svg');
    function el(name, attrs, txt) {
      var e = document.createElementNS(NS, name);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (txt != null) e.textContent = txt;
      svg.appendChild(e); return e;
    }
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    var parts = c.list.map(function (b, k) { return 'V_' + c.names[k] + ' = ' + kit.fmt(b.v, 'V', 4) + ' weight ' + kit.fmt(r.w[k] * 100, '%', 3); });
    svg.setAttribute('aria-label', 'Weighted average: ' + parts.join(', ') + '. V_out = ' + kit.fmt(r.Vout, 'V', 4) + (r.load ? '; with the load V_ab = ' + kit.fmt(r.VL, 'V', 4) : '') + '.');
    // axis + ticks
    el('line', { x1: ml, x2: W - mr, y1: base, y2: base, class: 'axis' });
    var st = kit.niceStep(hi - lo, W < 420 ? 4 : 7);
    for (var t = Math.ceil(lo / st - 1e-9) * st; t <= hi + 1e-9 * st; t += st) {
      var tv = Math.abs(t) < st * 1e-9 ? 0 : t;
      el('line', { x1: X(tv), x2: X(tv), y1: base, y2: base + 5, class: 'axis' });
      el('text', { x: X(tv), y: base + 18, class: 'tick', 'text-anchor': 'middle' }, kit.fmt(tv, 'V', 3));
    }
    // group equal voltages so their bars stack
    var groups = [];
    c.list.forEach(function (b, k) {
      var g = null;
      groups.forEach(function (q) { if (Math.abs(q.v - b.v) <= 1e-9 * Math.max(1, Math.abs(b.v))) g = q; });
      if (!g) { g = { v: b.v, ks: [] }; groups.push(g); }
      g.ks.push(k);
    });
    groups.sort(function (a, b) { return a.v - b.v; });
    var placed = [];
    function hit(a) { return placed.some(function (b) { return a.x1 < b.x2 + 6 && b.x1 < a.x2 + 6 && a.y1 < b.y2 + 2 && b.y1 < a.y2 + 2; }); }
    groups.forEach(function (g) {
      var x = X(g.v), y = base;
      g.ks.forEach(function (k) {
        var hgt = Math.max(1.5, r.w[k] * barMax);
        el('rect', { x: x - 9, y: y - hgt, width: 18, height: hgt, class: 'bar', rx: 2 });
        y -= hgt;
      });
      var nmLen = g.ks.reduce(function (s, k) { return s + 2 + c.names[k].length; }, 0) + 2 * (g.ks.length - 1);
      var wt = g.ks.map(function (k) { return kit.sigStr(r.w[k] * 100, 3) + '%'; }).join(' + ');
      var width = Math.max(nmLen * 7, wt.length * 6.8);
      var ty = y - 22, box, tries = 0;
      do { box = { x1: x - width / 2, x2: x + width / 2, y1: ty - 12, y2: ty + 19 }; if (!hit(box)) break; ty -= 33; tries++; } while (tries < 4);
      if (ty < 34) ty = 34;
      placed.push(box);
      var tn = el('text', { x: x, y: ty, class: 'nm', 'text-anchor': 'middle' }, '');
      g.ks.forEach(function (k, i) {
        if (i) tn.appendChild(document.createTextNode(', '));
        tn.appendChild(document.createTextNode('V'));
        var s = document.createElementNS(NS, 'tspan');
        s.setAttribute('baseline-shift', 'sub'); s.setAttribute('font-size', '9');
        s.textContent = c.names[k];
        tn.appendChild(s);
      });
      el('text', { x: x, y: ty + 16, class: 'wt', 'text-anchor': 'middle' }, wt);
    });
    // balance point
    var xo = X(r.Vout);
    el('line', { x1: xo, x2: xo, y1: 16, y2: base, class: 'vo' });
    el('path', { d: 'M' + xo + ' ' + base + ' l -8 14 l 16 0 Z', class: 'fulcrum' });
    var ta = xo > W * 0.7 ? 'end' : (xo < W * 0.3 ? 'start' : 'middle');
    el('text', { x: xo + (ta === 'start' ? 4 : ta === 'end' ? -4 : 0), y: 12, class: 'vo-t', 'text-anchor': ta }, 'Vout = ' + kit.fmt(r.Vout, 'V', 4));
    if (r.load) {
      var xl = X(r.VL);
      el('line', { x1: xl, x2: xl, y1: 30, y2: base, class: 'vl' });
      var la = xl > W * 0.7 ? 'end' : (xl < W * 0.3 ? 'start' : 'middle');
      el('text', { x: xl + (la === 'start' ? 4 : la === 'end' ? -4 : 0), y: base + 34, class: 'vl-t', 'text-anchor': la }, 'with load: ' + kit.fmt(r.VL, 'V', 4));
    }
    host.appendChild(svg);
  }

  /* ------------------------------------------------------------------ workings */
  function workLines(kit, c, r) {
    var L = [], n = c.list.length;
    var nm = c.names.map(sub);
    var R = c.mode === 'dac' ? ['R', '2R', '4R', '8R'] : nm.map(function (x) { return 'R_' + x; });
    var Vs = nm.map(function (x) { return 'V_' + x; });
    var numF = [], denF = [];
    for (var k = 0; k < n; k++) { numF.push('\\dfrac{' + Vs[k] + '}{' + R[k] + '}'); denF.push('\\dfrac{1}{' + R[k] + '}'); }
    L.push('V_{out} = \\frac{' + numF.join(' + ') + '}{' + denF.join(' + ') + '}');
    var cI = common(kit, r.I.concat([r.IN]), 'A');
    var subN = c.list.map(function (b) { return '\\frac{' + tq(kit, b.v, 'V') + '}{' + tq(kit, b.r, 'Ω') + '}'; });
    L.push('I_N = \\sum \\frac{V_k}{R_k} = ' + subN.join(' + ') +' = (' + cI.sum(r.I) + ')\\,' + cI.unitTex + ' = ' + tq(kit, r.IN, 'A'));
    var cG = common(kit, r.G.concat([r.sumG]), 'S');
    var subD = c.list.map(function (b) { return '\\frac{1}{' + tq(kit, b.r, 'Ω') + '}'; });
    L.push('\\sum \\frac{1}{R_k} = ' + subD.join(' + ') + ' = (' + cG.sum(r.G) + ')\\,' + cG.unitTex + ' = ' + tq(kit, r.sumG, 'S'));
    L.push('V_{out} = \\frac{I_N}{\\sum 1/R_k} = \\frac{' + tq(kit, r.IN, 'A') + '}{' + tq(kit, r.sumG, 'S') + '} = ' + tq(kit, r.Vout, 'V'));
    L.push('R_N = \\frac{1}{\\sum 1/R_k} = \\frac{1}{' + tq(kit, r.sumG, 'S') + '} = ' + tq(kit, r.RN, 'Ω'));
    // weighted-average reading
    var wt = c.list.map(function (b, k) { return kit.sigStr(r.w[k], 3).replace(/−/g, '-') + '\\,(' + tq(kit, b.v, 'V') + ')'; });
    L.push('Same result as a weighted average with weights \\(G_k / \\sum G\\) (where \\(G_k = 1/R_k\\)):');
    L.push('V_{out} = ' + wt.join(' + ') + ' = ' + tq(kit, r.Vout, 'V'));
    if (c.mode === 'dac' && r.dac) {
      var b = r.dac.bits, vr = c.state.dac.vref;
      L.push('DAC shortcut from the guide: all \\(R\\) cancel, so');
      L.push('V_{out} = \\frac{8V_{B0} + 4V_{B1} + 2V_{B2} + V_{B3}}{15} = \\frac{8(' + kit.num(b[0] * vr) + ') + 4(' + kit.num(b[1] * vr) + ') + 2(' + kit.num(b[2] * vr) + ') + ' + kit.num(b[3] * vr) + '}{15}\\,\\text{V} = ' + tq(kit, r.dac.vout, 'V'));
    }
    if (r.load) {
      if (c.rl === 0) {
        L.push('With \\(R_L = 0\\) the terminals are shorted: \\(V_{ab} = 0\\) and \\(I_L = I_N\\).');
      } else {
        L.push('I_L = \\frac{V_{out}}{R_N + R_L} = \\frac{' + tq(kit, r.Vout, 'V') + '}{' + tq(kit, r.RN, 'Ω') + ' + ' + tq(kit, c.rl, 'Ω') + '} = ' + tq(kit, r.IL, 'A'));
        L.push('V_L = V_{ab} = I_L R_L = ' + tq(kit, r.IL, 'A') + ' \\times ' + tq(kit, c.rl, 'Ω') + ' = ' + tq(kit, r.VL, 'V'));
        L.push('Check: treat \\(R_L\\) as one more branch with no source (0 V):');
        L.push('V_{ab} = \\frac{I_N}{\\sum 1/R_k + 1/R_L} = \\frac{' + tq(kit, r.IN, 'A') + '}{' + tq(kit, r.sumG, 'S') + ' + ' + tq(kit, 1 / c.rl, 'S') + '} = ' + tq(kit, r.VL2, 'V'));
      }
    }
    // KCL
    var terms = r.down.slice(); if (r.load) terms.push(r.IL);
    var cK = common(kit, terms, 'A');
    var symK = c.list.map(function (b, k) { return '\\frac{V_{ab} - ' + Vs[k] + '}{' + R[k] + '}'; });
    if (r.load) symK.push('\\frac{V_{ab}}{R_L}');
    L.push('KCL at node a: the currents leaving a down through each branch' + (r.load ? ' and the load' : '') + ' must add up to \\(0\\):');
    var kclv = Math.abs(r.kcl) <= 1e-9 * Math.max(r.kclScale, 1e-300) ? 0 : r.kcl;
    L.push(symK.join(' + ') + ' = (' + cK.sum(terms) + ')\\,' + cK.unitTex + ' = ' + (kclv === 0 ? '0' : tq(kit, kclv, 'A')));
    return L;
  }

  /* ------------------------------------------------------------------ mount */
  function mount(el, ctx) {
    var kit = ctx.kit || global.EELabs.kit;
    var h = kit.h;
    injectCss();
    var state;
    if (ctx.preset) state = normalize(ctx.preset);   // a preset (lesson link) wins over the saved state
    else if (ctx.state) state = normalize(ctx.state);
    else state = normalize(presets[0].values);

    var fr = kit.frame(def, { onPreset: function (p) { applyState(normalize(p.values)); persist(); } });
    el.appendChild(fr.root);
    fr.root.classList.add('lab-millman');
    // Any value, polarity, load or structure change by the user means the screen no longer shows the preset:
    // unpress its chip and drop its fixed answer note (update() renders the note from state.src).
    function userEdit() { state.src = null; fr.markPreset(null); }

    /* ---------- controls */
    var modeSeg = kit.segmented({
      label: 'Circuit', value: state.mode,
      options: [{ value: 'general', label: 'General' }, { value: 'dac', label: 'DAC (R, 2R, 4R, 8R)' }],
      onChange: function (v) { state.mode = v; userEdit(); structural(); update(); persist(); }
    });
    fr.controls.appendChild(modeSeg.el);

    // general mode
    var genBox = h('div', { class: 'lab-millman-sec' });
    var nSeg = kit.segmented({
      label: 'Branches', value: String(state.n),
      options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }],
      onChange: function (v) { state.n = +v; state.names = null; userEdit(); structural(); update(); persist(); }
    });
    genBox.appendChild(nSeg.el);
    var brUI = [];
    for (var k = 0; k < MAXN; k++) (function (k) {
      var g = h('div', { class: 'lab-group lab-millman-branch', role: 'group' });
      var title = h('h4');
      g.appendChild(title);
      var pol = kit.segmented({
        label: 'Source', value: state.br[k].pol,
        options: [{ value: 'up', label: '+ at a' }, { value: 'down', label: '+ at b' }, { value: 'none', label: 'None' }],
        onChange: function (v) { state.br[k].pol = v; userEdit(); structural(); update(); persist(); }
      });
      var vc = kit.control({ label: 'Source voltage (magnitude)', unit: 'V', min: 0, max: 100, step: 0.1, value: state.br[k].v, hardMin: 0, hardMax: 100, sig: 4,
        onInput: function (v) { state.br[k].v = v; userEdit(); update(); persist(); } });
      var rc = kit.control({ label: 'Series resistance', unit: 'Ω', min: 10, max: 1e6, scale: 'log', value: state.br[k].r, hardMin: 0.1, hardMax: 1e8, sig: 4,
        onInput: function (v) { state.br[k].r = v; userEdit(); update(); persist(); } });
      g.appendChild(pol.el); g.appendChild(vc.el); g.appendChild(rc.el);
      genBox.appendChild(g);
      brUI.push({ g: g, title: title, pol: pol, vc: vc, rc: rc });
    })(k);
    fr.controls.appendChild(genBox);

    // DAC mode
    var dacBox = h('div', { class: 'lab-group lab-millman-sec', role: 'group', 'aria-label': 'DAC inputs' });
    dacBox.appendChild(kit.tex(h('h4'), 'DAC inputs: 0 V or \\(V_{ref}\\) each'));
    var bitsWrap = h('div', { class: 'lab-millman-bits' });
    var bitBtns = [];
    ['R', '2R', '4R', '8R'].forEach(function (rr, k) {
      var b = h('button', { type: 'button', class: 'lab-millman-bit', 'aria-pressed': 'false' });
      b.addEventListener('click', function () { state.dac.bits[k] = state.dac.bits[k] ? 0 : 1; userEdit(); update(); persist(); });
      bitsWrap.appendChild(b);
      bitBtns.push({ b: b, rr: rr });
    });
    dacBox.appendChild(bitsWrap);
    var vrefC = kit.control({ label: '\\(V_{ref}\\) (logic high)', unit: 'V', min: 0, max: 15, step: 0.1, value: state.dac.vref, hardMin: 0, hardMax: 15, sig: 4,
      onInput: function (v) { state.dac.vref = v; userEdit(); update(); persist(); } });
    var dacR = kit.control({ label: 'Base resistance R', unit: 'Ω', min: 100, max: 1e6, scale: 'log', value: state.dac.r, hardMin: 1, hardMax: 1e8, sig: 4,
      help: 'Changes \\(R_N\\) and the loaded output, not the open-circuit \\(V_{out}\\).',
      onInput: function (v) { state.dac.r = v; userEdit(); update(); persist(); } });
    dacBox.appendChild(vrefC.el); dacBox.appendChild(dacR.el);
    fr.controls.appendChild(dacBox);

    // load
    var loadBox = h('div', { class: 'lab-group', role: 'group', 'aria-label': 'Load' });
    loadBox.appendChild(h('h4', { html: 'Load across <span class="lab-millman-nm">a–b</span>' }));
    var loadSeg = kit.segmented({
      label: 'Load', value: state.load ? 'on' : 'off',
      options: [{ value: 'off', label: 'Open' }, { value: 'on', label: 'Connect \\(R_L\\)' }],
      onChange: function (v) { state.load = v === 'on'; userEdit(); structural(); update(); persist(); }
    });
    var rlC = kit.control({ label: 'Load resistance \\(R_L\\)', unit: 'Ω', min: 10, max: 1e7, scale: 'log', value: state.rl, hardMin: 0.1, hardMax: 1e9, sig: 4,
      onInput: function (v) { state.rl = v; userEdit(); update(); persist(); } });
    loadBox.appendChild(loadSeg.el); loadBox.appendChild(rlC.el);
    fr.controls.appendChild(loadBox);

    /* ---------- outputs */
    var presetNote = h('div', { 'aria-live': 'polite' });
    var msgs = h('div', { class: 'lab-millman-msgs', role: 'status', 'aria-live': 'polite' });
    var ro = kit.readout([
      { key: 'vout', label: '\\(V_{out}\\) (open circuit)', unit: 'V', emph: true },
      { key: 'rn', label: '\\(R_N = 1/\\sum(1/R_k)\\)', unit: 'Ω', emph: true },
      { key: 'in', label: '\\(I_N = \\sum V_k/R_k\\)', unit: 'A' },
      { key: 'g', label: '\\(\\sum 1/R_k\\)', unit: 'S' },
      { key: 'vl', label: '\\(V_{ab}\\) with load', unit: 'V' },
      { key: 'il', label: 'Load current \\(I_L\\)', unit: 'A' },
      { key: 'pl', label: 'Load power \\(P_L\\)', unit: 'W' },
      { key: 'kcl', label: 'KCL at node a', unit: 'A' }
    ]);
    var dacRo = kit.readout([
      { key: 'code', label: 'Input code \\(B_0B_1B_2B_3\\) and its value' },
      { key: 'step', label: 'Step \\(V_{ref}/15\\) (this network)', unit: 'V' },
      { key: 't16', label: 'Notes\' table: code × \\(V_{ref}/16\\)', unit: 'V' },
      { key: 'rn8', label: '\\(R_N = 8R/15\\)', unit: 'Ω' }
    ], { compact: true });

    var ckSec = h('div', { class: 'lab-millman-sec' }, [h('h4', { class: 'lab-millman-h', text: 'Circuit (live values)' })]);
    var ckHost = h('div', { class: 'lab-millman-ckt' });
    ckSec.appendChild(ckHost);
    ckSec.appendChild(h('p', { class: 'lab-millman-cap', text: 'Arrows show the actual direction of each branch current. The long battery plate is +.' }));
    var ck = kit.circuit(ckHost, { parts: [] });

    var tblWrap = h('div', { class: 'lab-table-wrap' });
    var tblSec = h('div', { class: 'lab-millman-sec' }, [h('h4', { class: 'lab-millman-h', text: 'Branch by branch' }), tblWrap]);

    var wSec = h('div', { class: 'lab-millman-sec' }, [h('h4', { class: 'lab-millman-h', text: 'Why it works: a weighted average' })]);
    var wHost = h('div', { class: 'lab-millman-wavg' });
    wSec.appendChild(wHost);
    var wCap = h('p', { class: 'lab-millman-cap' });
    kit.tex(wCap, 'Each bar stands at a source voltage \\(V_k\\); its height is that branch\'s weight \\(G_k/\\sum G\\) with \\(G_k = 1/R_k\\). \\(V_{out}\\) is the balance point, so it always lies between the lowest and highest source voltage. A branch with no source is a bar at 0 V. A load acts like one more 0 V branch and pulls \\(V_{ab}\\) toward 0 V (dashed line).');
    wSec.appendChild(wCap);

    var eqSec = h('div', { class: 'lab-millman-sec' }, [h('h4', { class: 'lab-millman-h', html: 'Millman equivalent seen from <span class="lab-millman-nm">a–b</span>' })]);
    var eqHost = h('div', { class: 'lab-millman-ckt' });
    eqSec.appendChild(eqHost);
    var eq = kit.circuit(eqHost, { parts: [] });

    var chSec = h('div', { class: 'lab-millman-sec' }, [kit.tex(h('h4', { class: 'lab-millman-h' }), 'When does \\(R_N\\) matter? Load voltage versus \\(R_L\\)')]);
    var ch = kit.chart({ height: 240 });
    chSec.appendChild(ch.el);
    var chCap = h('p', { class: 'lab-millman-cap' });
    chSec.appendChild(chCap);

    var work = kit.workings('Show the calculation (substituted values)');

    [presetNote, msgs, ro.el, dacRo.el, ckSec, work.el, eqSec, tblSec, wSec, chSec].forEach(function (x) { fr.output.appendChild(x); });

    /* ---------- update logic */
    var dead = false;
    var persist = kit.debounce(function () { if (!dead && ctx.save) ctx.save(JSON.parse(JSON.stringify(state))); }, 250);

    function structural() {
      var gen = state.mode === 'general';
      genBox.classList.toggle('lab-millman-hidden', !gen);
      dacBox.classList.toggle('lab-millman-hidden', gen);
      dacRo.el.classList.toggle('lab-millman-hidden', gen);
      brUI.forEach(function (u, k) {
        u.g.hidden = k >= state.n;
        var nm = state.names && state.names[k] ? state.names[k] : String(k + 1);
        u.title.innerHTML = '';
        u.title.appendChild(h('span', { class: 'lab-millman-sw', 'aria-hidden': 'true' }));
        var t = h('span'); kit.tex(t, 'Branch ' + nm + ': \\(V_{' + nm + '}\\) in series with \\(R_{' + nm + '}\\)'); u.title.appendChild(t);
        u.g.setAttribute('aria-label', 'Branch ' + nm);
        u.vc.el.classList.toggle('lab-millman-hidden', state.br[k].pol === 'none');
      });
      rlC.el.classList.toggle('lab-millman-hidden', !state.load);
    }

    function syncControls() {
      modeSeg.set(state.mode);
      nSeg.set(String(state.n));
      brUI.forEach(function (u, k) { u.pol.set(state.br[k].pol); u.vc.set(state.br[k].v); u.rc.set(state.br[k].r); });
      vrefC.set(state.dac.vref); dacR.set(state.dac.r);
      loadSeg.set(state.load ? 'on' : 'off'); rlC.set(state.rl);
    }

    function table(c, r) {
      var rows = c.list.map(function (b, k) {
        var pol = c.pols[k];
        var src = pol === 'none' ? 'none (0 V)' : kit.fmt(b.v, 'V', 4) + (pol === 'down' ? ' (reversed)' : '');
        var d = r.down[k];
        var dir = Math.abs(d) <= 1e-12 * Math.max(r.kclScale, 1e-300) ? '0' : kit.fmt(Math.abs(d), 'A', 4) + (d > 0 ? ' down' : ' up');
        return '<tr><td class="lab-millman-l">' + c.names[k] + '</td><td>' + src + '</td><td>' + kit.fmt(b.r, 'Ω', 4) + '</td><td>' + kit.fmt(r.I[k], 'A', 4) +
          '</td><td>' + kit.fmt(r.w[k] * 100, '%', 3) + '</td><td>' + kit.fmt(d, 'A', 4) + '</td><td class="lab-millman-dir">' + dir + '</td></tr>';
      });
      if (r.load) {
        var il = r.IL;
        rows.push('<tr><td class="lab-millman-l">Load</td><td>none</td><td>' + kit.fmt(c.rl, 'Ω', 4) + '</td><td>—</td><td>—</td><td>' + kit.fmt(il, 'A', 4) +
          '</td><td class="lab-millman-dir">' + (il === 0 ? '0' : kit.fmt(Math.abs(il), 'A', 4) + (il > 0 ? ' down' : ' up')) + '</td></tr>');
      }
      var kv = r.kclOk ? 0 : r.kcl;
      rows.push('<tr><th class="lab-millman-l" scope="row">Sum</th><td></td><td></td><td>' + kit.fmt(r.IN, 'A', 4) + ' = \\(I_N\\)</td><td>100%</td><td>' + kit.fmt(kv, 'A', 4) +
        '</td><td class="lab-millman-dir ' + (r.kclOk ? 'lab-millman-ok' : 'lab-millman-badk') + '">' + (r.kclOk ? 'KCL holds' : 'KCL error') + '</td></tr>');
      tblWrap.innerHTML = '<table class="lab-table"><caption class="lab-millman-cap lab-millman-tcap">Branch current = current leaving node a down through the branch, \\((V_{ab} - V_k)/R_k\\), with ' +
        (r.load ? 'the load connected' : 'no load') + '. With no load the branch currents only circulate between branches; they add up to zero.</caption>' +
        '<thead><tr><th class="lab-millman-l" scope="col">Branch</th><th scope="col">\\(V_k\\)</th><th scope="col">\\(R_k\\)</th><th scope="col">\\(V_k/R_k\\)</th><th scope="col">Weight</th><th scope="col">Current down</th><th scope="col">Direction</th></tr></thead><tbody>' +
        rows.join('') + '</tbody></table>';
      kit.tex(tblWrap, tblWrap.innerHTML);
    }

    function chart(c, r) {
      var RN = r.RN, Vo = r.Vout;
      var xmax = 10 * RN;
      if (r.load && c.rl > 0) xmax = Math.max(xmax, 1.25 * c.rl);
      if (xmax > 200 * RN) xmax = 200 * RN;
      var marks = [{ type: 'hline', y: Vo, label: 'Vout = ' + kit.fmt(Vo, 'V', 3) }, { type: 'vline', x: RN, label: 'RL = RN', cls: 'accent' }];
      if (r.load && c.rl <= xmax) marks.push({ type: 'point', x: c.rl, y: r.VL, cls: 'filled', label: 'your RL' });
      ch.update({
        xmin: 0, xmax: xmax, xlabel: 'Load resistance RL', ylabel: 'Vab', xunit: 'Ω', yunit: 'V', samples: 200,
        ymin: Vo >= 0 ? 0 : Vo * 1.12, ymax: Vo > 0 ? Vo * 1.12 : (Vo < 0 ? 0 : 1),
        series: [{ id: 'vl', label: 'Vab = Vout × RL / (RN + RL)', fn: function (x) { return Vo * x / (RN + x); } }],
        marks: marks, cursor: true,
        ariaLabel: 'Load voltage V_ab versus load resistance from 0 to ' + kit.fmt(xmax, 'Ω', 3) + '. V_out = ' + kit.fmt(Vo, 'V', 4) + ', R_N = ' + kit.fmt(RN, 'Ω', 4) + '.',
        cursorFmt: function (x) { return [{ label: '\\(R_L\\)', value: kit.fmt(x, 'Ω', 3) }, { label: '\\(V_{ab}\\)', value: kit.fmt(Vo * x / (RN + x), 'V', 4) }, { label: '\\(I_L\\)', value: kit.fmt(Vo / (RN + x), 'A', 3) }]; }
      });
      var txt = 'At \\(R_L = R_N\\) (' + kit.fmt(RN, 'Ω', 4) + ') the load gets half of \\(V_{out}\\); at \\(10R_N\\) it gets 90.9 %; at \\(100R_N\\) 99.0 %. ';
      if (r.load) txt += 'Your load: \\(R_L = ' + tq(kit, c.rl, 'Ω') + '\\) gives \\(V_{ab} = ' + tq(kit, r.VL, 'V') + '\\), ' + kit.fmt(r.ratio * 100, '%', 3) + ' of \\(V_{out}\\).';
      else txt += 'Connect a load to place it on the curve.';
      kit.tex(chCap, txt + ' This is the lesson\'s point that \\(R_N\\) only matters once a load draws current.');
    }

    function messages(c, r) {
      msgs.innerHTML = '';
      if (!r.ok) { msgs.appendChild(kit.note(r.error, 'bad')); return; }
      if (c.list.every(function (b) { return b.v === 0; })) msgs.appendChild(kit.note('No branch has a non-zero source, so \\(V_{out} = 0\\) V. The resistors still set \\(R_N\\).', 'warn'));
      if (r.load) {
        if (c.rl < r.RN) msgs.appendChild(kit.note('\\(R_L\\) is smaller than \\(R_N\\): the load pulls \\(V_{ab}\\) below half of \\(V_{out}\\). Here the open-circuit formula alone would be badly wrong.', 'warn'));
        else if (c.rl >= 100 * r.RN) msgs.appendChild(kit.note('\\(R_L \\ge 100\\,R_N\\): the load voltage is within 1 % of \\(V_{out}\\). This is the "negligible current" case from the lesson, where only the voltage formula is needed.', 'ok'));
      }
      var inside = r.Vout >= r.vmin - 1e-12 * Math.max(1, Math.abs(r.vmin)) && r.Vout <= r.vmax + 1e-12 * Math.max(1, Math.abs(r.vmax));
      if (!inside) msgs.appendChild(kit.note('Check failed: \\(V_{out}\\) should lie between the lowest and highest branch voltage.', 'bad'));
    }

    function update() {
      if (dead) return;
      var r = evaluate(state);
      var c = r.circuit;
      // bit buttons
      bitBtns.forEach(function (x, k) {
        var on = !!state.dac.bits[k];
        x.b.setAttribute('aria-pressed', on ? 'true' : 'false');
        x.b.innerHTML = '';
        x.b.appendChild(h('b', { text: on ? '1' : '0' }));
        var lb = h('span'); kit.tex(lb, '\\(V_{B' + k + '}\\) on ' + x.rr + ': ' + kit.fmt(on ? state.dac.vref : 0, 'V', 4)); x.b.appendChild(lb);
        x.b.setAttribute('aria-label', 'Input V_B' + k + ' (through ' + x.rr + '): ' + (on ? 'high, ' + kit.fmt(state.dac.vref, 'V', 4) : 'low, 0 V'));
      });
      presetNote.innerHTML = '';
      if (state.src && PRESET_NOTES[state.src]) presetNote.appendChild(kit.note(PRESET_NOTES[state.src]));
      messages(c, r);
      if (!r.ok) {
        ro.update({ vout: '—', rn: '—', in: '—', g: '—', vl: '—', il: '—', pl: '—', kcl: '—' });
        ck.update(mainSpec(kit, c, r)); sizeSvg(ckHost);
        work.update(['\\text{Fix the input above to see the calculation.}']);
        eqHost.innerHTML = ''; tblWrap.innerHTML = ''; wHost.innerHTML = '';
        return;
      }
      ro.update({
        vout: r.Vout, rn: r.RN, in: r.IN, g: r.sumG,
        vl: r.load ? r.VL : 'no load', il: r.load ? r.IL : '0 (open)', pl: r.load ? r.PL : '0 (open)',
        kcl: r.kclOk ? '0 (holds)' : kit.fmt(r.kcl, 'A', 3)
      });
      if (r.dac) dacRo.update({ code: r.dac.bits.join('') + ' → ' + r.dac.code, step: r.dac.step, t16: r.dac.table16, rn8: r.RN });
      ck.update(mainSpec(kit, c, r)); sizeSvg(ckHost);
      eq.update(eqSpec(kit, r, r.load, c.rl)); sizeSvg(eqHost);
      work.update(workLines(kit, c, r));
      table(c, r);
      drawWavg(kit, wHost, c, r);
      chart(c, r);
    }

    function applyState(s) {
      state = normalize(s);
      syncControls();
      structural();
      update();
      fr.markPreset(state.src);
    }

    var lastW = 0, rafId = 0;
    var ro2 = global.ResizeObserver ? new ResizeObserver(function () {
      var w = wHost.clientWidth;
      if (Math.abs(w - lastW) <= 4 || rafId) return;
      rafId = requestAnimationFrame(function () {
        rafId = 0; if (dead) return;
        lastW = wHost.clientWidth; var r = evaluate(state); drawWavg(kit, wHost, r.circuit, r);
      });
    }) : null;
    if (ro2) ro2.observe(wHost);

    syncControls();
    structural();
    update();
    fr.markPreset(ctx.preset ? (ctx.presetId || state.src) : state.src);

    return {
      destroy: function () { dead = true; if (ro2) ro2.disconnect(); if (rafId) cancelAnimationFrame(rafId); ch.destroy(); el.innerHTML = ''; },
      setState: function (v) { applyState(v); }
    };
  }

  var def = {
    id: 'millman', topic: 'millman',
    title: "Millman's theorem: parallel source branches",
    blurb: 'Set up to four branches, each a voltage source in series with a resistor, between nodes a and b. See the Millman voltage \\(V_{out} = \\sum(V_k/R_k) / \\sum(1/R_k)\\), the equivalent resistance \\(R_N\\), the branch currents, and what a load does. Switch to the binary-weighted DAC from the lesson to try input codes.',
    assumptions: [
      'Ideal voltage sources and linear resistors; DC steady state.',
      'Every branch connects between the same two nodes, a (top rail) and b (bottom rail). \\(V_{out} = V_{ab}\\) is the voltage of a relative to b.',
      'Sign convention (lesson guide, section 9, additional teaching): \\(V_k\\) counts positive when its + terminal faces node a, as in all of the instructor\'s drawings, negative when reversed, and 0 for a branch with no source. A source-free branch still adds \\(1/R_k\\) to the denominator.',
      'Every branch needs \\(R_k &gt; 0\\). An ideal source with no series resistance would force \\(V_{ab}\\) directly and is not modelled.',
      '\\(V_{out}\\) is the open-circuit voltage (no load current). With a load: \\(I_L = V_{out}/(R_N + R_L)\\) and \\(V_L = V_{out}R_L/(R_N + R_L)\\), which equals treating \\(R_L\\) as one more 0 V branch.',
      'Branch currents are reported as the current leaving node a down through each branch, \\((V_{ab} - V_k)/R_k\\) (the guide\'s KCL check). Diagram arrows show the actual direction.',
      'DAC mode: inputs are 0 V or \\(V_{ref}\\) measured from the common bottom rail; resistors are exactly R, 2R, 4R, 8R with \\(V_{B0}\\) on R. The smallest resistor carries the largest weight, so \\(V_{B0}\\) acts as the MSB here; the guide notes the video does not settle the MSB labelling. This passive network steps by \\(V_{ref}/15\\) and reaches \\(V_{ref}\\) at 1111; the notes\' table (code × \\(V_{ref}/16\\)) describes a different DAC design and is shown only for comparison.',
      'Displayed numbers are rounded to 4 significant figures; the calculation uses full precision.'
    ],
    presets: presets,
    model: model,
    mount: mount
  };

  global.EELabs.register(def);
})(typeof window !== 'undefined' ? window : this);
