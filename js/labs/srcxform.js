/* EE 211 — Source transformation lab (topic: srcxform).
 * Voltage source V in series with R  <=>  current source I = V/R in parallel with the same R (st1).
 * A load R_L (or open / short) is attached to both forms: terminal quantities match, internal ones do not.
 * Also shows the two "not a pair" cases (R across an ideal V source, R in series with an ideal I source).
 * All numerical work is in def.model (pure, DOM-free; tested by build/tests/test_lab_srcxform.py).
 * Symbols follow st1: V, I, R, terminals a (top) and b (bottom); load R_L; v_ab = voltage of a relative to b;
 * i_L positive when it flows from a through R_L to b. Orientation: the arrow of I points toward the + side of V.
 */
(function (global) {
  'use strict';
  if (!global.EELabs) return;

  /* ------------------------------------------------------------------ model (pure) */
  function loadR(load) {
    if (!load || load.type === 'open') return Infinity;
    if (load.type === 'short') return 0;
    return load.RL;
  }
  function sgn(pol) { return pol === 'b' ? -1 : 1; }
  function bad(code) { return { ok: false, err: code }; }

  /* Series form: ideal V (+ toward pol) in series with R, load across a-b. R may be 0 (ideal source alone). */
  function seriesForm(V, R, pol, load) {
    var s = sgn(pol), RL = loadR(load);
    if (!(V >= 0) || !isFinite(V) || !(R >= 0) || !isFinite(R)) return bad('input');
    if (RL === Infinity) {
      return { ok: true, vab: s * V, iL: 0, PL: 0, iR: 0, PR: 0, Psrc: 0 };
    }
    if (!(RL >= 0)) return bad('input');
    if (R + RL === 0) return bad('shortIdealV');
    var i = V / (R + RL);
    return { ok: true, vab: s * i * RL, iL: s * i, PL: i * i * RL, iR: i, PR: i * i * R, Psrc: V * i };
  }

  /* Parallel form: ideal I (arrow toward pol) in parallel with R (R may be Infinity = ideal source alone). */
  function parallelForm(I, R, pol, load) {
    var s = sgn(pol), RL = loadR(load);
    if (!(I >= 0) || !isFinite(I) || !(R > 0)) return bad('input');
    if (RL === Infinity && R === Infinity) return bad('openIdealI');
    var vab, iL, iR;
    if (RL === Infinity) { iR = I; iL = 0; vab = I * R; }
    else if (RL === 0) { iR = 0; iL = I; vab = 0; }
    else {
      var Req = R === Infinity ? RL : R * RL / (R + RL);
      vab = I * Req; iL = vab / RL; iR = R === Infinity ? 0 : vab / R;
    }
    var PR = R === Infinity ? 0 : iR * iR * R;
    var PL = RL === Infinity ? 0 : iL * iL * RL;
    return { ok: true, vab: s * vab, iL: s * iL, PL: PL, iR: iR, PR: PR, Psrc: I * vab };
  }

  /* Not a pair: ideal V with R connected directly across it (R is redundant for the terminals). */
  function vWithShuntR(V, R, pol, load) {
    var s = sgn(pol), RL = loadR(load);
    if (!(V >= 0) || !isFinite(V) || !(R > 0) || !isFinite(R)) return bad('input');
    if (RL === 0) return bad('shortIdealV');
    var iL = RL === Infinity ? 0 : V / RL;
    var iR = V / R;
    return { ok: true, vab: s * V, iL: s * iL, PL: V * iL, iR: iR, PR: V * V / R, Psrc: V * (iR + iL) };
  }

  /* Not a pair: ideal I with R in series with it (R is redundant for the terminals). */
  function iWithSeriesR(I, R, pol, load) {
    var s = sgn(pol), RL = loadR(load);
    if (!(I >= 0) || !isFinite(I) || !(R >= 0) || !isFinite(R)) return bad('input');
    if (RL === Infinity) return bad('openIdealI');
    return { ok: true, vab: s * I * RL, iL: s * I, PL: I * I * RL, iR: I, PR: I * I * R, Psrc: I * I * (R + RL) };
  }

  /* Ohm's-law transformation of a pair. from = 'V' (value = V, series R) or 'I' (value = I, parallel R). */
  function transform(from, value, R) {
    if (!(value >= 0) || !isFinite(value)) return bad('input');
    if (from === 'V') {
      if (R === 0) return bad('noSeriesR');
      if (!(R > 0) || !isFinite(R)) return bad('input');
      return { ok: true, V: value, I: value / R, R: R };
    }
    if (R === Infinity) return bad('noParallelR');
    if (!(R > 0) || !isFinite(R)) return bad('input');
    return { ok: true, V: value * R, I: value, R: R };
  }

  function relSame(x, y) {
    if (x === y) return true;
    var m = Math.max(Math.abs(x), Math.abs(y));
    return Math.abs(x - y) <= 1e-9 * m;
  }

  /* Power balance of one solved form: source power = power in R + power in the load. */
  function balanced(f) {
    return !!(f && f.ok && relSame(f.Psrc, f.PR + f.PL));
  }

  /* Change the starting circuit without changing the circuit itself. Leaving a pair (Vs or Ip) first copies the
     transformed value into the other source, so V and I stay a matching pair (I = V/R, V = IR). Leaving a
     not-a-pair mode keeps V and I as they are (there is no pair to transform). Returns a new state. */
  function switchCfg(st, cfg) {
    var s = normalize(st);
    if (['Vs', 'Ip', 'Vp', 'Is'].indexOf(cfg) < 0 || cfg === s.cfg) return s;
    if (s.cfg === 'Vs' || s.cfg === 'Ip') {
      var t = transform(s.cfg === 'Vs' ? 'V' : 'I', s.cfg === 'Vs' ? s.V : s.I, s.R);
      if (t.ok && t.V > 0 && t.I > 0 && isFinite(t.V) && isFinite(t.I)) { s.V = t.V; s.I = t.I; }
    }
    s.cfg = cfg;
    return s;
  }

  /* Debounced saver that can be cancelled, so nothing is written after destroy(). Timer functions can be
     injected for tests. */
  function makeSaver(fn, ms, setT, clearT) {
    setT = setT || function (f, d) { return setTimeout(f, d); };
    clearT = clearT || function (id) { clearTimeout(id); };
    var timer = null, dead = false;
    return {
      schedule: function () {
        if (dead) return;
        if (timer !== null) clearT(timer);
        timer = setT(function () { timer = null; if (!dead) fn(); }, ms);
      },
      cancel: function () { dead = true; if (timer !== null) { clearT(timer); timer = null; } },
      pending: function () { return timer !== null; }
    };
  }

  /* Whole-lab solve from the state object. */
  function solve(st) {
    var load = { type: st.load, RL: st.RL };
    var out = { cfg: st.cfg, pol: st.pol, load: st.load, pair: st.cfg === 'Vs' || st.cfg === 'Ip' };
    if (out.pair) {
      var t = transform(st.cfg === 'Vs' ? 'V' : 'I', st.cfg === 'Vs' ? st.V : st.I, st.R);
      out.xf = t;
      if (!t.ok) { out.ok = false; out.err = t.err; return out; }
      out.V = t.V; out.I = t.I; out.R = t.R;
      out.series = seriesForm(t.V, t.R, st.pol, load);
      out.parallel = parallelForm(t.I, t.R, st.pol, load);
      out.ok = out.series.ok && out.parallel.ok;
      if (!out.ok) { out.err = out.series.err || out.parallel.err; return out; }
      out.same = {
        vab: relSame(out.series.vab, out.parallel.vab),
        iL: relSame(out.series.iL, out.parallel.iL),
        PL: relSame(out.series.PL, out.parallel.PL),
        PR: relSame(out.series.PR, out.parallel.PR),
        Psrc: relSame(out.series.Psrc, out.parallel.Psrc)
      };
      out.balanced = { series: balanced(out.series), parallel: balanced(out.parallel) };
      return out;
    }
    // not a pair
    if (st.cfg === 'Vp') {
      out.orig = vWithShuntR(st.V, st.R, st.pol, load);
      out.ideal = seriesForm(st.V, 0, st.pol, load);                 // the ideal V source alone
      out.naive = parallelForm(st.V / st.R, st.R, st.pol, load);      // wrong: "I = V/R in parallel with R"
      out.naiveVal = st.V / st.R;
    } else {
      out.orig = iWithSeriesR(st.I, st.R, st.pol, load);
      out.ideal = parallelForm(st.I, Infinity, st.pol, load);         // the ideal I source alone
      out.naive = seriesForm(st.I * st.R, st.R, st.pol, load);        // wrong: "V = IR in series with R"
      out.naiveVal = st.I * st.R;
    }
    out.ok = out.orig.ok;
    if (!out.ok) out.err = out.orig.err;
    if (out.ok && out.naive.ok) {
      out.naiveMatches = relSame(out.orig.vab, out.naive.vab) && relSame(out.orig.iL, out.naive.iL);
    }
    return out;
  }

  /* Power curves versus R_L for a pair with source V (series form) and resistor R (magnitudes, polarity-free). */
  function curves(V, R) {
    var I = V / R;
    return {
      PL: function (RL) { var i = V / (R + RL); return i * i * RL; },
      PRseries: function (RL) { var i = V / (R + RL); return i * i * R; },
      PRparallel: function (RL) { var iR = I * RL / (R + RL); return iR * iR * R; },
      Pmax: V * V / (4 * R),
      RLmax: R
    };
  }

  /* ------------------------------------------------------------------ presets (worked examples in st1 / mt1) */
  var presets = [
    { id: 'st1-ex1', label: 'st1 Ex. 1 + guide check (3 Ω load added in the guide): 10 V + 2 Ω → 5 A ∥ 2 Ω', lesson: 'st1', sec: 'st1-examples',
      values: { cfg: 'Vs', V: 10, I: 5, R: 2, pol: 'a', load: 'RL', RL: 3 } },
    { id: 'st1-ex2', label: 'st1 Ex. 2: 2 A ∥ 3 Ω → 6 V + 3 Ω', lesson: 'st1', sec: 'st1-examples',
      values: { cfg: 'Ip', V: 6, I: 2, R: 3, pol: 'a', load: 'open', RL: 3 } },
    { id: 'st1-ex3', label: 'st1 Ex. 3 (lab): 5 V + 666.6… Ω → 7.5 mA', lesson: 'st1', sec: 'st1-lab',
      values: { cfg: 'Vs', V: 5, I: 0.0075, R: 2000 / 3, pol: 'a', load: 'open', RL: 1000 } },
    { id: 'st1-open', extra: true, label: 'st1 guide note (not in the video): Ex. 1 open, 0 W vs 50 W in R', lesson: 'st1', sec: 'st1-assumptions',
      values: { cfg: 'Vs', V: 10, I: 5, R: 2, pol: 'a', load: 'open', RL: 3 } },
    { id: 'mt1-ex5', extra: true, label: 'mt1 added example (not in the video): 4 mA ∥ 1 kΩ → 4 V, 3 kΩ load', lesson: 'mt1', sec: 'mt1-apply',
      values: { cfg: 'Ip', V: 4, I: 0.004, R: 1000, pol: 'a', load: 'RL', RL: 3000 } }
  ];

  var DEFAULT = presets[0].values;
  function normalize(v) {
    v = v || {};
    var d = DEFAULT;
    function pos(x, dflt) { return typeof x === 'number' && isFinite(x) && x > 0 ? x : dflt; }
    return {
      cfg: ['Vs', 'Ip', 'Vp', 'Is'].indexOf(v.cfg) >= 0 ? v.cfg : d.cfg,
      V: pos(v.V, d.V), I: pos(v.I, d.I), R: pos(v.R, d.R),
      pol: v.pol === 'b' ? 'b' : 'a',
      load: ['open', 'RL', 'short'].indexOf(v.load) >= 0 ? v.load : d.load,
      RL: pos(v.RL, d.RL)
    };
  }

  var assumptionsList = [
    'Ideal sources: \\(V\\) keeps its voltage for any current; \\(I\\) pushes its current for any voltage. Resistors are linear; DC steady state.',
    'A source transformation needs a <b>pair</b>: \\(R\\) in <b>series</b> with \\(V\\) (same current), or \\(R\\) in <b>parallel</b> with \\(I\\) (same two nodes). Rule: \\(I = V/R\\) or \\(V = IR\\), and \\(R\\) stays the same.',
    'Orientation (st1): the arrow of \\(I\\) points toward the terminal on the + side of \\(V\\).',
    'The two forms are equivalent only at terminals a–b: \\(v_{ab}\\), \\(i_L\\) and \\(P_L\\) match for every load; the current and power in \\(R\\) and the power delivered by the source do not match in general (they coincide only when \\(R_L = R\\)).',
    'Reference directions: \\(v_{ab}\\) is the voltage of a relative to b; \\(i_L\\) is positive when it flows from a through \\(R_L\\) to b. Source power is the power the source delivers.',
    'Load: "Open" means nothing connected (\\(R_L \\to \\infty\\)); "Short" means a wire across a–b (\\(R_L = 0\\)).',
    'An ideal \\(V\\) with no series \\(R\\) (\\(R = 0\\)) or an ideal \\(I\\) with no parallel \\(R\\) (\\(R \\to \\infty\\)) cannot be transformed: \\(V/0\\) and \\(I \\cdot \\infty\\) are not finite.'
  ];

  /* ------------------------------------------------------------------ UI */
  var CSS = [
    '.lab-srcxform-figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));gap:var(--sp-3);}',
    '.lab-srcxform-fig{margin:0;display:flex;flex-direction:column;gap:var(--sp-2);min-width:0;}',
    '.lab-srcxform-fig figcaption{font-size:var(--fs-sm);font-weight:600;color:var(--ink);display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:baseline;}',
    '.lab-srcxform-tag{font-size:var(--fs-xs);font-weight:600;text-transform:uppercase;letter-spacing:.06em;padding:1px 8px;border-radius:var(--r-pill);border:1px solid var(--line-strong);color:var(--ink-2);background:var(--surface-2);}',
    '.lab-srcxform-tag.orig{border-color:var(--topic);color:var(--topic-ink);background:var(--topic-tint);}',
    '.lab-srcxform-tag.wrong{border-color:var(--bad);color:var(--bad);background:var(--bad-soft);}',
    '.lab-srcxform-fig .lab-circuit{flex:1;display:flex;align-items:center;}',
    '.lab-srcxform-swap{display:flex;justify-content:center;}',
    '.lab-srcxform-notes{display:flex;flex-direction:column;gap:var(--sp-2);}',
    '.lab .lab-table td.lab-srcxform-same{font-family:var(--font-body);font-weight:600;color:var(--ok);}',
    '.lab .lab-table td.lab-srcxform-diff{font-family:var(--font-body);font-weight:600;color:var(--warn);}',
    '.lab .lab-table td.lab-srcxform-wrong{font-family:var(--font-body);font-weight:600;color:var(--bad);}',
    '.lab .lab-table td{font-family:var(--font-mono);}',
    '.lab .lab-table td:first-child{font-family:var(--font-body);}',
    '.lab-srcxform-cap{margin:0;font-size:var(--fs-sm);color:var(--ink-2);}',
    '.lab-srcxform-tblcap{caption-side:top;text-align:left;font-size:var(--fs-sm);font-weight:600;color:var(--ink);padding:0 0 var(--sp-2);}',
    '.lab-srcxform-hide{display:none !important;}'
  ].join('\n');
  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('lab-srcxform-css')) return;
    var s = document.createElement('style');
    s.id = 'lab-srcxform-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function mount(el, ctx) {
    var kit = ctx.kit || global.EELabs.kit;
    var h = kit.h, fmt = kit.fmt;
    injectCss();
    var state = normalize(ctx.preset || ctx.state || DEFAULT);   // a preset (lesson link) wins over the saved state
    var fromDefault = !ctx.state && !ctx.preset;

    function F4(v, u) { return fmt(v, u, 4); }
    /* TeX for a quantity: 7.5 mA -> 7.5\,\text{mA}; 666.7 Ω -> 666.7\,\Omega */
    function tq(v, unit) {
      var s = fmt(v, unit, 4);
      var m = s.match(/^(\S+)\s*(.*)$/);
      if (!m) return s;
      var n = m[1].replace('−', '-').replace('∞', '\\infty');
      var u = m[2], pre = u.slice(0, Math.max(0, u.length - unit.length));
      var preT = pre === 'µ' || pre === 'μ' ? '\\mu ' : (pre ? '\\text{' + pre + '}' : '');
      var unitT = unit === 'Ω' ? '\\Omega' : '\\text{' + unit + '}';
      return n + '\\,' + preT + unitT;
    }

    var F = kit.frame(def, { onPreset: function (p) { apply(p.values); F.markPreset(p.id); } });
    el.appendChild(F.root);
    if (ctx.presetId && (ctx.preset || !ctx.state)) F.markPreset(ctx.presetId);
    else if (fromDefault) F.markPreset(presets[0].id);

    /* --- controls --- */
    var gStart = h('div', { class: 'lab-group' }, [h('h4', { text: 'Starting circuit' })]);
    var segCfg = kit.segmented({
      label: 'Circuit', value: state.cfg,
      options: [
        { value: 'Vs', label: '\\(V\\) in series with \\(R\\)' },
        { value: 'Ip', label: '\\(I\\) in parallel with \\(R\\)' },
        { value: 'Vp', label: '\\(R\\) across \\(V\\) (not a pair)' },
        { value: 'Is', label: '\\(R\\) in series with \\(I\\) (not a pair)' }
      ],
      onChange: function (v) { state = switchCfg(state, v); cV.set(state.V); cI.set(state.I); buildPol(); changed(); }
    });
    gStart.appendChild(segCfg.el);

    var gSrc = h('div', { class: 'lab-group' }, [h('h4', { text: 'Source and resistor' })]);
    var cV = kit.control({ label: 'Voltage source \\(V\\)', unit: 'V', min: 0.1, max: 100, value: state.V, scale: 'log', sig: 4, hardMin: 1e-6, hardMax: 1e5,
      onInput: function (v) { state.V = v; changed(); } });
    var cI = kit.control({ label: 'Current source \\(I\\)', unit: 'A', min: 1e-4, max: 10, value: state.I, scale: 'log', sig: 4, hardMin: 1e-9, hardMax: 1e3,
      onInput: function (v) { state.I = v; changed(); } });
    var cR = kit.control({ label: 'Resistor \\(R\\)', unit: 'Ω', min: 1, max: 1e6, value: state.R, scale: 'log', sig: 4, hardMin: 1e-3, hardMax: 1e9,
      help: 'Must be greater than 0 and finite. For \\(R = 0\\) or \\(R \\to \\infty\\) see the last assumption below.',
      onInput: function (v) { state.R = v; changed(); } });
    var polBox = h('div');
    gSrc.appendChild(cV.el); gSrc.appendChild(cI.el); gSrc.appendChild(cR.el); gSrc.appendChild(polBox);
    var segPol = null;
    function buildPol() {
      var isV = state.cfg === 'Vs' || state.cfg === 'Vp';
      var key = isV ? 'V' : 'I';
      if (segPol && segPol.key === key) { segPol.set(state.pol); return; }
      polBox.innerHTML = '';
      segPol = kit.segmented({
        label: isV ? '+ side of V faces' : 'Arrow of I points to',
        value: state.pol,
        options: [{ value: 'a', label: 'a (top)' }, { value: 'b', label: 'b (bottom)' }],
        onChange: function (v) { state.pol = v; changed(); }
      });
      segPol.key = key;
      polBox.appendChild(segPol.el);
    }
    buildPol();

    var gLoad = h('div', { class: 'lab-group' }, [h('h4', { text: 'Load across a–b' })]);
    var segLoad = kit.segmented({
      label: 'Load', value: state.load,
      options: [{ value: 'open', label: 'Open' }, { value: 'RL', label: '\\(R_L\\)' }, { value: 'short', label: 'Short' }],
      onChange: function (v) { state.load = v; changed(); }
    });
    var cRL = kit.control({ label: 'Load resistor \\(R_L\\)', unit: 'Ω', min: 1, max: 1e6, value: state.RL, scale: 'log', sig: 4, hardMin: 1e-3, hardMax: 1e9,
      onInput: function (v) { state.RL = v; changed(); } });
    gLoad.appendChild(segLoad.el); gLoad.appendChild(cRL.el);
    F.controls.appendChild(gStart); F.controls.appendChild(gSrc); F.controls.appendChild(gLoad);

    /* --- output --- */
    var notes = h('div', { class: 'lab-srcxform-notes', role: 'status', 'aria-live': 'polite' });
    function figBlock() {
      var cap = h('figcaption');
      var box = h('div');
      var fig = h('figure', { class: 'lab-srcxform-fig' }, [cap, box]);
      return { fig: fig, cap: cap, ck: kit.circuit(box, { parts: [] }) };
    }
    var figL = figBlock(), figR = figBlock();
    var figs = h('div', { class: 'lab-srcxform-figs' }, [figL.fig, figR.fig]);

    var roPair = kit.readout([
      { key: 'xf', label: 'Transformed source', emph: true },
      { key: 'R', label: '\\(R\\) (same in both forms)' },
      { key: 'vab', label: '\\(v_{ab}\\)', unit: 'V' },
      { key: 'iL', label: '\\(i_L\\) (a → \\(R_L\\) → b)', unit: 'A' },
      { key: 'PL', label: '\\(P_L\\) in the load', unit: 'W' },
      { key: 'PRs', label: '\\(P_R\\), series form', unit: 'W' },
      { key: 'PRp', label: '\\(P_R\\), parallel form', unit: 'W' }
    ]);
    var roNon = kit.readout([
      { key: 'eq', label: 'Seen from a–b', emph: true },
      { key: 'vab', label: '\\(v_{ab}\\)', unit: 'V' },
      { key: 'iL', label: '\\(i_L\\) (a → \\(R_L\\) → b)', unit: 'A' },
      { key: 'PL', label: '\\(P_L\\) in the load', unit: 'W' },
      { key: 'PR', label: '\\(P_R\\) (still dissipated)', unit: 'W' },
      { key: 'Ps', label: 'Power from the source', unit: 'W' }
    ]);
    var tblWrap = h('div', { class: 'lab-table-wrap' });
    var chartBox = h('div');
    var chart = kit.chart({ height: 260 });
    var chartCap = h('p', { class: 'lab-srcxform-cap' });
    chartBox.appendChild(chart.el); chartBox.appendChild(chartCap);
    var work = kit.workings('Show the calculation');

    [notes, figs, roPair.el, roNon.el, tblWrap, chartBox, work.el].forEach(function (x) { F.output.appendChild(x); });

    /* --- diagram specs --- */
    function loadParts(x0, res, ok) {
      // terminals at x0, load at x0 + 2 ; rails at y = 1 (a) and y = 4 (b)
      var p = [
        { t: 'N', at: [x0, 1], open: true, label: 'a', pos: 'n' },
        { t: 'N', at: [x0, 4], open: true, label: 'b', pos: 's' },
        { t: 'VM', a: [x0 + 0.55, 1.75], b: [x0 + 0.55, 3.25], label: 'v_{ab}', lat: [x0 + 0.55, 2.5] }
      ];
      var xl = x0 + 2.2;
      if (state.load === 'open') {
        p.push({ t: 'T', at: [x0 + 1.5, 2.62], text: 'open', anchor: 'start', cls: 'muted' });
      } else {
        p.push({ t: 'W', pts: [[x0, 1], [xl, 1]] });
        p.push({ t: 'W', pts: [[x0, 4], [xl, 4]] });
        if (state.load === 'short') {
          p.push({ t: 'W', pts: [[xl, 1], [xl, 4]] });
          p.push({ t: 'T', at: [xl + 0.25, 2.62], text: 'short', anchor: 'start', cls: 'muted' });
        } else {
          p.push({ t: 'R', a: [xl, 1], b: [xl, 4], label: 'R_L', value: F4(state.RL, 'Ω') });
        }
        if (ok && res && res.iL !== 0) {
          var fwd = res.iL > 0;
          p.push({ t: 'IARR', a: fwd ? [x0 + 0.3, 1] : [x0 + 1.9, 1], b: fwd ? [x0 + 1.9, 1] : [x0 + 0.3, 1], label: 'i_L' });
        }
      }
      return p;
    }
    function sumText(x0, res, ok, noR) {
      var cx = x0 / 2 + 0.6;
      if (!ok || !res || !res.ok) return [{ t: 'T', at: [cx, 5.35], text: 'not defined (see the note)', anchor: 'middle', cls: 'accent' }];
      return [
        { t: 'T', at: [cx, 5.35], text: 'v_{ab} = ' + F4(res.vab, 'V') + ',  i_L = ' + F4(res.iL, 'A'), anchor: 'middle' },
        { t: 'T', at: [cx, 5.95], text: (noR ? '' : 'P_R = ' + F4(res.PR, 'W') + ',  ') + 'source gives ' + F4(res.Psrc, 'W'), anchor: 'middle', cls: 'muted' }
      ];
    }
    function batPart(x, label, value) {
      return { t: 'BAT', a: [x, 4], b: [x, 1], label: label, value: value, plus: state.pol === 'a' ? 'b' : 'a', side: -1 };
    }
    function iPart(x, label, value) {
      return state.pol === 'a'
        ? { t: 'I', a: [x, 4], b: [x, 1], label: label, value: value, side: -1 }
        : { t: 'I', a: [x, 1], b: [x, 4], label: label, value: value, side: -1 };
    }
    function seriesSpec(V, R, res, ok, srcLabel, rLabel) {
      var x0 = 5;
      var parts = [batPart(0, srcLabel || 'V', F4(V, 'V')),
        { t: 'W', pts: [[0, 1], [1, 1]] },
        { t: 'W', pts: [[4, 1], [x0, 1]] },
        { t: 'W', pts: [[0, 4], [x0, 4]] }];
      if (R > 0) parts.push({ t: 'R', a: [1, 1], b: [4, 1], label: rLabel || ('R = ' + F4(R, 'Ω')), value: ok && res && res.ok ? 'i_R = ' + F4(res.iR, 'A') : '', side: -1 });
      else parts.push({ t: 'W', pts: [[1, 1], [4, 1]] });
      return parts.concat(loadParts(x0, res, ok), sumText(x0 + 2.2, res, ok, !(R > 0)));
    }
    function parallelSpec(I, R, res, ok, srcLabel) {
      var x0 = 5.5;
      var parts = [iPart(0, srcLabel || 'I', F4(I, 'A')),
        { t: 'W', pts: [[0, 1], [x0, 1]] },
        { t: 'W', pts: [[0, 4], [x0, 4]] }];
      if (R !== Infinity) parts.push({ t: 'R', a: [2.4, 1], b: [2.4, 4], label: 'R = ' + F4(R, 'Ω'), value: ok && res && res.ok ? 'i_R = ' + F4(res.iR, 'A') : '' });
      return parts.concat(loadParts(x0, res, ok), sumText(x0 + 2.2, res, ok, R === Infinity));
    }
    function shuntSpec(V, R, res, ok) {      // ideal V with R across it
      var x0 = 5.5;
      var parts = [batPart(0, 'V', F4(V, 'V')),
        { t: 'W', pts: [[0, 1], [x0, 1]] },
        { t: 'W', pts: [[0, 4], [x0, 4]] },
        { t: 'R', a: [2.4, 1], b: [2.4, 4], label: 'R = ' + F4(R, 'Ω'), value: ok && res && res.ok ? 'i_R = ' + F4(res.iR, 'A') : '' }];
      return parts.concat(loadParts(x0, res, ok), sumText(x0 + 2.2, res, ok));
    }
    function iSeriesSpec(I, R, res, ok) {    // ideal I with R in series
      var x0 = 5;
      var parts = [iPart(0, 'I', F4(I, 'A')),
        { t: 'W', pts: [[0, 1], [1, 1]] },
        { t: 'R', a: [1, 1], b: [4, 1], label: 'R = ' + F4(R, 'Ω'), value: ok && res && res.ok ? 'i_R = ' + F4(res.iR, 'A') : '', side: -1 },
        { t: 'W', pts: [[4, 1], [x0, 1]] },
        { t: 'W', pts: [[0, 4], [x0, 4]] }];
      return parts.concat(loadParts(x0, res, ok), sumText(x0 + 2.2, res, ok));
    }
    function tag(text, cls) { return '<span class="lab-srcxform-tag ' + (cls || '') + '">' + esc(text) + '</span>'; }
    function setCap(fb, html) { fb.cap.innerHTML = html; }

    function loadHtml() {
      return state.load === 'open' ? 'nothing connected (open)' : (state.load === 'short' ? 'a short across a–b' : 'R<sub>L</sub> = ' + esc(F4(state.RL, 'Ω')));
    }
    function loadTex() {
      return state.load === 'open' ? 'nothing connected (open)' : (state.load === 'short' ? 'a short across a–b' : '\\(R_L = ' + tq(state.RL, 'Ω') + '\\)');
    }
    function loadWords() {
      return state.load === 'open' ? 'nothing connected (open)' : (state.load === 'short' ? 'a short across a–b' : 'R_L = ' + F4(state.RL, 'Ω'));
    }
    function polWord(isV) {
      return isV ? '+ toward ' + state.pol : 'arrow toward ' + state.pol;
    }

    /* --- update --- */
    function setHidden(node, hide) { node.classList.toggle('lab-srcxform-hide', !!hide); }

    function update() {
      var r = solve(state);
      var isVcfg = state.cfg === 'Vs' || state.cfg === 'Vp';
      setHidden(cV.el, !isVcfg); setHidden(cI.el, isVcfg);
      setHidden(cRL.el, state.load !== 'RL');
      setHidden(roPair.el, !r.pair); setHidden(roNon.el, r.pair);
      setHidden(chartBox, !r.pair || !r.ok);
      notes.innerHTML = '';
      if (r.pair) updatePair(r); else updateNon(r);
    }

    function row(q, a, b, c, cls) {
      return '<tr><td>' + q + '</td><td>' + esc(a) + '</td><td>' + esc(b) + '</td><td class="' + (cls || '') + '">' + esc(c) + '</td></tr>';
    }
    function sameWord(same, terminal) {
      if (same) return terminal ? 'Same' : 'Equal at this load';
      return 'Different';
    }

    function updatePair(r) {
      var fromV = state.cfg === 'Vs';
      var ok = r.ok;
      if (!ok) {
        notes.appendChild(kit.note('<b>Cannot transform.</b> ' + (r.err === 'noSeriesR' ? 'A voltage source needs a series resistor (\\(R = 0\\) would give \\(I = V/0\\)).' : r.err === 'noParallelR' ? 'A current source needs a parallel resistor (\\(R \\to \\infty\\) would give \\(V = I\\cdot\\infty\\)).' : 'Check the values: \\(V\\), \\(I\\) and \\(R\\) must be positive and finite.'), 'bad'));
        roPair.update({ xf: '—', R: '—', vab: '—', iL: '—', PL: '—', PRs: '—', PRp: '—' });
        tblWrap.innerHTML = '';
        work.update([]);
        figL.ck.update({ parts: [] }); figR.ck.update({ parts: [] });
        return;
      }
      var S = r.series, P = r.parallel;
      // diagrams: original on the left
      var sSpec = { parts: seriesSpec(r.V, r.R, S, true), padX: 1.9, alt: 'Series form: voltage source V = ' + F4(r.V, 'V') + ' with ' + polWord(true) + ', in series with R = ' + F4(r.R, 'Ω') + ', terminals a and b, load: ' + loadWords() + '. v_ab = ' + F4(S.vab, 'V') + ', i_L = ' + F4(S.iL, 'A') + ', power in R = ' + F4(S.PR, 'W') + '.' };
      var pSpec = { parts: parallelSpec(r.I, r.R, P, true), padX: 1.9, alt: 'Parallel form: current source I = ' + F4(r.I, 'A') + ' with its ' + polWord(false) + ', in parallel with R = ' + F4(r.R, 'Ω') + ', load: ' + loadWords() + '. v_ab = ' + F4(P.vab, 'V') + ', i_L = ' + F4(P.iL, 'A') + ', power in R = ' + F4(P.PR, 'W') + '.' };
      var capS = 'Series form: \\(V\\) + \\(R\\) ' + tag(fromV ? 'Original' : 'Transformed', fromV ? 'orig' : '');
      var capP = 'Parallel form: \\(I\\) ∥ \\(R\\) ' + tag(fromV ? 'Transformed' : 'Original', fromV ? '' : 'orig');
      var first = fromV ? [figL, sSpec, capS] : [figL, pSpec, capP];
      var second = fromV ? [figR, pSpec, capP] : [figR, sSpec, capS];
      [first, second].forEach(function (x) { x[0].ck.update(x[1]); setCap(x[0], x[2]); kit.tex(x[0].cap, x[0].cap.innerHTML); });

      roPair.update({
        xf: fromV ? 'I = ' + F4(r.I, 'A') : 'V = ' + F4(r.V, 'V'),
        R: F4(r.R, 'Ω'), vab: S.vab, iL: S.iL, PL: S.PL, PRs: S.PR, PRp: P.PR
      });

      // notes
      var orient = fromV
        ? 'The + side of \\(V\\) faces <b>' + state.pol + '</b>, so the arrow of \\(I\\) points toward <b>' + state.pol + '</b>.'
        : 'The arrow of \\(I\\) points toward <b>' + state.pol + '</b>, so the + side of \\(V\\) faces <b>' + state.pol + '</b>.';
      notes.appendChild(kit.note((fromV ? '\\(I = V/R = ' + tq(r.I, 'A') + '\\)' : '\\(V = IR = ' + tq(r.V, 'V') + '\\)') + ', same \\(R = ' + tq(r.R, 'Ω') + '\\). ' + orient));
      var msg;
      if (r.same.PR) {
        msg = 'With \\(R_L = R\\) the power in \\(R\\) happens to be equal in both forms. Change \\(R_L\\) and watch the two values separate while \\(v_{ab}\\), \\(i_L\\) and \\(P_L\\) stay identical.';
        notes.appendChild(kit.note(msg, 'ok'));
      } else {
        msg = 'Terminal quantities match (\\(v_{ab}\\), \\(i_L\\), \\(P_L\\)). Inside they differ: \\(R\\) dissipates <b>' + esc(F4(S.PR, 'W')) + '</b> in the series form but <b>' + esc(F4(P.PR, 'W')) + '</b> in the parallel form, and the sources deliver ' + esc(F4(S.Psrc, 'W')) + ' vs ' + esc(F4(P.Psrc, 'W')) + '. Do not use the transformed circuit to find the current or power in \\(R\\) itself.';
        notes.appendChild(kit.note(msg, 'warn'));
      }

      // table
      var t = '<table class="lab-table"><caption class="lab-srcxform-tblcap">Both forms with ' + loadHtml() + '</caption>' +
        '<thead><tr><th scope="col">Quantity</th><th scope="col">Series form</th><th scope="col">Parallel form</th><th scope="col">Match?</th></tr></thead><tbody>';
      t += row('v<sub>ab</sub> (terminal)', F4(S.vab, 'V'), F4(P.vab, 'V'), sameWord(r.same.vab, true), r.same.vab ? 'lab-srcxform-same' : 'lab-srcxform-wrong');
      t += row('i<sub>L</sub> (terminal)', F4(S.iL, 'A'), F4(P.iL, 'A'), sameWord(r.same.iL, true), r.same.iL ? 'lab-srcxform-same' : 'lab-srcxform-wrong');
      t += row('P<sub>L</sub> in the load', F4(S.PL, 'W'), F4(P.PL, 'W'), sameWord(r.same.PL, true), r.same.PL ? 'lab-srcxform-same' : 'lab-srcxform-wrong');
      t += row('Current in R', F4(S.iR, 'A'), F4(P.iR, 'A'), sameWord(relSameUI(S.iR, P.iR), false), relSameUI(S.iR, P.iR) ? 'lab-srcxform-same' : 'lab-srcxform-diff');
      t += row('Power in R', F4(S.PR, 'W'), F4(P.PR, 'W'), sameWord(r.same.PR, false), r.same.PR ? 'lab-srcxform-same' : 'lab-srcxform-diff');
      t += row('Power from the source', F4(S.Psrc, 'W'), F4(P.Psrc, 'W'), sameWord(r.same.Psrc, false), r.same.Psrc ? 'lab-srcxform-same' : 'lab-srcxform-diff');
      var bal = r.balanced.series && r.balanced.parallel;
      t += row('Check: source = R + load', F4(S.PR + S.PL, 'W'), F4(P.PR + P.PL, 'W'),
        bal ? 'Balanced in each form' : (r.balanced.series ? 'Not balanced (parallel form)' : r.balanced.parallel ? 'Not balanced (series form)' : 'Not balanced'),
        bal ? 'lab-srcxform-same' : 'lab-srcxform-wrong');
      t += '</tbody></table>';
      tblWrap.innerHTML = t;

      updateChart(r);
      work.update(pairWork(r, fromV));
    }
    function relSameUI(x, y) { return relSame(x, y); }

    function pairWork(r, fromV) {
      var S = r.series, P = r.parallel, L = [];
      var V = tq(r.V, 'V'), I = tq(r.I, 'A'), R = tq(r.R, 'Ω');
      L.push('<b>1. Transform</b> (Ohm\'s law, \\(R\\) unchanged):');
      if (fromV) L.push('I = \\dfrac{V}{R} = \\dfrac{' + V + '}{' + R + '} = ' + I);
      else L.push('V = I\\,R = (' + I + ')(' + R + ') = ' + V);
      L.push('<b>2. Series form with the load</b> (\\(V\\), \\(R\\) and the load in one loop; ' + loadTex() + '):');
      if (state.load === 'open') {
        L.push('i_L = 0, \\qquad |v_{ab}| = V = ' + V);
      } else if (state.load === 'short') {
        L.push('|i_L| = \\dfrac{V}{R} = \\dfrac{' + V + '}{' + R + '} = ' + tq(Math.abs(S.iL), 'A'));
        L.push('v_{ab} = 0');
      } else {
        var RL = tq(state.RL, 'Ω');
        L.push('|i_L| = \\dfrac{V}{R + R_L} = \\dfrac{' + V + '}{' + R + ' + ' + RL + '} = ' + tq(Math.abs(S.iL), 'A'));
        L.push('|v_{ab}| = |i_L|\\,R_L = ' + tq(Math.abs(S.vab), 'V'));
      }
      L.push('<b>3. Load the parallel form</b> (current divider between \\(R\\) and the load):');
      if (state.load === 'open') {
        L.push('i_R = I = ' + I + ', \\qquad |v_{ab}| = I\\,R = ' + tq(Math.abs(P.vab), 'V'));
      } else if (state.load === 'short') {
        L.push('|i_L| = I = ' + I + ', \\qquad i_R = 0');
      } else {
        L.push('|i_L| = I\\,\\dfrac{R}{R + R_L}');
        L.push('= ' + I + '\\cdot\\dfrac{' + R + '}{' + R + ' + ' + tq(state.RL, 'Ω') + '} = ' + tq(Math.abs(P.iL), 'A'));
        L.push('i_R = I - |i_L| = ' + tq(P.iR, 'A'));
      }
      L.push('<b>4. Power in \\(R\\)</b> (\\(P = i^2R\\)) and from each source:');
      L.push('P_{R,\\text{series}} = i_L^2R = (' + tq(S.iR, 'A') + ')^2(' + R + ') = ' + tq(S.PR, 'W'));
      L.push('P_{R,\\text{parallel}} = i_R^2R = (' + tq(P.iR, 'A') + ')^2(' + R + ') = ' + tq(P.PR, 'W'));
      L.push('P_L = i_L^2R_L = ' + tq(S.PL, 'W'));
      L.push('P_V = V\\,|i_L| = ' + tq(S.Psrc, 'W') + ' = P_{R,\\text{series}} + P_L');
      L.push('P_I = I\\,|v_{ab}| = ' + tq(P.Psrc, 'W') + ' = P_{R,\\text{parallel}} + P_L');
      L.push('<b>Signs:</b> the + side / arrow faces ' + esc(state.pol) + ', so \\(v_{ab} = ' + tq(S.vab, 'V') + '\\) and \\(i_L = ' + tq(S.iL, 'A') + '\\) (positive means from a through the load to b).');
      return L;
    }

    function updateChart(r) {
      var C = curves(r.V, r.R);
      var RL = state.load === 'RL' ? state.RL : (state.load === 'short' ? 0 : null);
      var xmax = 4 * r.R;
      if (RL != null && RL > 3.2 * r.R) xmax = 1.25 * RL;
      var near = RL != null && Math.abs(RL - r.R) < 0.18 * xmax;
      var marks = [{ type: 'vline', x: r.R, label: near ? '' : 'load = R', cls: '' }];
      if (RL != null) {
        marks.push({ type: 'vline', x: RL, label: state.load === 'short' ? 'short' : (near && RL >= r.R ? 'your load (dashed: load = R)' : 'your load'), cls: 'accent' });
        marks.push({ type: 'point', x: RL, y: C.PL(RL), cls: 'filled' });
        marks.push({ type: 'point', x: RL, y: C.PRseries(RL), cls: 's2' });
        marks.push({ type: 'point', x: RL, y: C.PRparallel(RL), cls: 's3' });
      }
      chart.update({
        height: 260, xmin: 0, xmax: xmax, ymin: 0, xlabel: 'Load resistance R_L', ylabel: 'Power', xunit: 'Ω', yunit: 'W',
        ariaLabel: 'Power versus load resistance from 0 to ' + F4(xmax, 'Ω') + '. Load power is the same in both forms and peaks at R_L = R = ' + F4(r.R, 'Ω') + ' with ' + F4(C.Pmax, 'W') + '. Power in R falls with R_L in the series form and rises with R_L in the parallel form; they cross at R_L = R.',
        series: [
          { id: 'pl', label: 'Load power (same in both forms)', fn: C.PL, cls: 's1' },
          { id: 'prs', label: 'Power in R, series form', fn: C.PRseries, cls: 's2', dash: '7 4' },
          { id: 'prp', label: 'Power in R, parallel form', fn: C.PRparallel, cls: 's3', dash: '2 3' }
        ],
        marks: marks,
        cursor: true,
        cursorFmt: function (x) {
          return [{ label: '\\(R_L\\)', value: F4(x, 'Ω') }, { label: '\\(P_L\\)', value: F4(C.PL(x), 'W') },
            { label: '\\(P_R\\) series', value: F4(C.PRseries(x), 'W') }, { label: '\\(P_R\\) parallel', value: F4(C.PRparallel(x), 'W') }];
        }
      });
      kit.tex(chartCap, 'Chart (same \\(V\\), \\(R\\); \\(R_L\\) varied): the load power peaks at \\(R_L = R\\) (dashed vertical line) with \\(P_{\\max} = V^2/4R = ' + tq(C.Pmax, 'W') + '\\) in both forms. ' +
        (state.load === 'open' ? 'With the terminals open (\\(R_L \\to \\infty\\)): series form \\(P_R = 0\\), parallel form \\(P_R = I^2R = ' + tq(C.PRparallel(1e300), 'W') + '\\).' :
          'At your load: \\(P_L = ' + tq(C.PL(RL), 'W') + '\\), \\(P_R\\) = ' + '\\(' + tq(C.PRseries(RL), 'W') + '\\) (series form) vs \\(' + tq(C.PRparallel(RL), 'W') + '\\) (parallel form).') +
        ' Use the arrow keys on the chart to move the cursor.');
    }

    function updateNon(r) {
      var isV = state.cfg === 'Vp';
      var O = r.orig, ID = r.ideal, N = r.naive, ok = r.ok;
      var oSpec = isV ? shuntSpec(state.V, state.R, O, ok) : iSeriesSpec(state.I, state.R, O, ok);
      var iSpec = isV ? seriesSpec(state.V, 0, ID, ok) : parallelSpec(state.I, Infinity, ID, ok);
      figL.ck.update({ parts: oSpec, padX: 1.9, alt: isV ? 'Ideal voltage source V = ' + F4(state.V, 'V') + ' with R = ' + F4(state.R, 'Ω') + ' connected directly across it, terminals a and b, load: ' + loadWords() + '.' : 'Ideal current source I = ' + F4(state.I, 'A') + ' with R = ' + F4(state.R, 'Ω') + ' in series, terminals a and b, load: ' + loadWords() + '.' });
      figR.ck.update({ parts: iSpec, padX: 1.9, alt: isV ? 'The same terminals seen as the ideal voltage source alone.' : 'The same terminals seen as the ideal current source alone.' });
      setCap(figL, (isV ? '\\(R\\) across an ideal \\(V\\) ' : '\\(R\\) in series with an ideal \\(I\\) ') + tag('Original', 'orig'));
      setCap(figR, 'What a–b sees: ' + (isV ? 'the ideal \\(V\\) alone ' : 'the ideal \\(I\\) alone ') + tag('No transformation possible', 'wrong'));
      kit.tex(figL.cap, figL.cap.innerHTML); kit.tex(figR.cap, figR.cap.innerHTML);

      notes.appendChild(kit.note(isV
        ? '<b>Not a transformable pair.</b> \\(R\\) is in <b>parallel</b> with the voltage source, not in series. The ideal source holds \\(v_{ab}\\) at \\(V\\) whatever is connected, so \\(R\\) only draws extra current from the source: it is redundant for the terminals. Seen from a–b this is an ideal \\(V\\) with \\(R = 0\\) in series, which cannot become a current source (\\(V/0\\)).'
        : '<b>Not a transformable pair.</b> \\(R\\) is in <b>series</b> with the current source, not in parallel. The ideal source forces \\(I\\) through whatever is connected, so \\(R\\) changes nothing at a–b: it is redundant for the terminals. Seen from a–b this is an ideal \\(I\\) with no parallel resistor (\\(R \\to \\infty\\)), which cannot become a voltage source (\\(I\\cdot\\infty\\)).', 'warn'));
      if (!ok) {
        notes.appendChild(kit.note(r.err === 'shortIdealV'
          ? '<b>Not allowed:</b> a short across an ideal voltage source would need infinite current. Pick a load resistor or open terminals.'
          : r.err === 'openIdealI' ? '<b>Not allowed:</b> an ideal current source with nowhere for its current to go (open terminals) would need infinite voltage. Pick a load resistor or a short.'
            : 'Check the values: they must be positive and finite.', 'bad'));
        roNon.update({ eq: isV ? 'ideal ' + F4(state.V, 'V') + ' source' : 'ideal ' + F4(state.I, 'A') + ' source', vab: '—', iL: '—', PL: '—', PR: '—', Ps: '—' });
        tblWrap.innerHTML = '';
        work.update([]);
        return;
      }
      roNon.update({ eq: isV ? 'ideal ' + F4(state.V, 'V') + ' source' : 'ideal ' + F4(state.I, 'A') + ' source', vab: O.vab, iL: O.iL, PL: O.PL, PR: O.PR, Ps: O.Psrc });

      var naiveName = isV ? '"I = V/R = ' + F4(r.naiveVal, 'A') + ' ∥ R"' : '"V = IR = ' + F4(r.naiveVal, 'V') + ' + R"';
      var t = '<table class="lab-table"><caption class="lab-srcxform-tblcap">Test with ' + loadHtml() + '</caption>' +
        '<thead><tr><th scope="col">Quantity</th><th scope="col">Original</th><th scope="col">Ideal source alone</th><th scope="col">Wrong "transform" ' + esc(naiveName) + '</th></tr></thead><tbody>';
      function nv(k, u) { return N.ok ? F4(N[k], u) : 'not defined'; }
      t += '<tr><td>v<sub>ab</sub></td><td>' + esc(F4(O.vab, 'V')) + '</td><td>' + esc(F4(ID.vab, 'V')) + '</td><td>' + esc(nv('vab', 'V')) + '</td></tr>';
      t += '<tr><td>i<sub>L</sub></td><td>' + esc(F4(O.iL, 'A')) + '</td><td>' + esc(F4(ID.iL, 'A')) + '</td><td>' + esc(nv('iL', 'A')) + '</td></tr>';
      t += '<tr><td>P<sub>L</sub></td><td>' + esc(F4(O.PL, 'W')) + '</td><td>' + esc(F4(ID.PL, 'W')) + '</td><td>' + esc(nv('PL', 'W')) + '</td></tr>';
      var verdict = r.naiveMatches ? 'Same at this load only' : 'Different';
      t += '<tr><td>Matches the original?</td><td>—</td><td class="lab-srcxform-same">Yes, for every load</td><td class="' + (r.naiveMatches ? 'lab-srcxform-diff' : 'lab-srcxform-wrong') + '">' + verdict + '</td></tr>';
      t += '</tbody></table>';
      tblWrap.innerHTML = t;
      if (r.naiveMatches) notes.appendChild(kit.note('The wrong "transform" agrees for this particular load (' + loadTex() + '), but not in general. Try a load resistor to see it fail.', ''));

      var L = [], R = tq(state.R, 'Ω');
      if (isV) {
        var V = tq(state.V, 'V');
        L.push('<b>Original:</b> the source fixes \\(|v_{ab}| = V\\) for any load.');
        L.push('|v_{ab}| = ' + V + (state.load === 'RL' ? ', \\qquad |i_L| = \\dfrac{V}{R_L} = \\dfrac{' + V + '}{' + tq(state.RL, 'Ω') + '} = ' + tq(Math.abs(O.iL), 'A') : ', \\qquad i_L = 0'));
        L.push('i_R = \\dfrac{V}{R} = \\dfrac{' + V + '}{' + R + '} = ' + tq(O.iR, 'A') + ', \\qquad P_R = \\dfrac{V^2}{R} = ' + tq(O.PR, 'W'));
        L.push('<b>Wrong "transform":</b> \\(I = V/R = ' + tq(r.naiveVal, 'A') + '\\) in parallel with \\(R\\) gives \\(|v_{ab}| = ' + tq(Math.abs(N.vab), 'V') + '\\).');
      } else {
        var I = tq(state.I, 'A');
        L.push('<b>Original:</b> the source fixes \\(|i_L| = I\\) for any load.');
        L.push('|i_L| = ' + I + (state.load === 'RL' ? ', \\qquad |v_{ab}| = I\\,R_L = (' + I + ')(' + tq(state.RL, 'Ω') + ') = ' + tq(Math.abs(O.vab), 'V') : ', \\qquad v_{ab} = 0'));
        L.push('P_R = I^2R = (' + I + ')^2(' + R + ') = ' + tq(O.PR, 'W'));
        L.push('<b>Wrong "transform":</b> \\(V = IR = ' + tq(r.naiveVal, 'V') + '\\) in series with \\(R\\) gives \\(|i_L| = ' + tq(Math.abs(N.iL), 'A') + '\\).');
      }
      work.update(L);
    }

    var destroyed = false;
    var saver = makeSaver(function () { if (!destroyed && ctx.save) ctx.save(JSON.parse(JSON.stringify(state))); }, 250);
    function changed() { if (destroyed) return; F.markPreset(null); update(); saver.schedule(); }
    function apply(values) {
      if (destroyed) return;
      state = normalize(values);
      segCfg.set(state.cfg);
      cV.set(state.V); cI.set(state.I); cR.set(state.R); cRL.set(state.RL);
      segLoad.set(state.load);
      buildPol(); segPol.set(state.pol);
      update();
      if (ctx.save) ctx.save(JSON.parse(JSON.stringify(state)));
    }

    update();

    return {
      destroy: function () { destroyed = true; saver.cancel(); chart.destroy(); if (F.root.parentNode) F.root.parentNode.removeChild(F.root); },
      setState: function (v) { apply(v); }
    };
  }

  var def = {
    id: 'srcxform',
    topic: 'srcxform',
    title: 'Source transformation: V + R ⇄ I ∥ R',
    blurb: 'Swap a voltage source in series with \\(R\\) for a current source in parallel with the same \\(R\\) (and back). Attach a load to both forms: everything at terminals a–b matches, but the power inside \\(R\\) does not.',
    assumptions: assumptionsList,
    presets: presets,
    model: {
      seriesForm: seriesForm, parallelForm: parallelForm, vWithShuntR: vWithShuntR, iWithSeriesR: iWithSeriesR,
      transform: transform, solve: solve, curves: curves, normalize: normalize, loadR: loadR,
      balanced: balanced, switchCfg: switchCfg, makeSaver: makeSaver
    },
    mount: mount
  };
  global.EELabs.register(def);
})(typeof window !== 'undefined' ? window : this);
