/* EE 211 — Δ–Y conversion lab (topic deltawye, lesson dw1).
 * Panel 1: bidirectional Δ ↔ Y converter on the same three nodes A, B, C (the dw1 labelling:
 *   R_A: A–B, R_B: B–C, R_C: A–C; R_1: centre–C, R_2: centre–A, R_3: centre–B; R_1↔R_A, R_2↔R_B, R_3↔R_C opposite).
 * Panel 2: the dw1 opening bridge (84 V; 10, 10, 2.7, 4.7, 3.9 Ω) solved by Δ→Y reduction and by nodal analysis.
 * All maths is in def.model (pure, DOM-free) and is tested by build/tests/test_lab_deltawye.py.
 */
(function (global) {
  'use strict';
  if (!global.EELabs) return;

  /* ------------------------------------------------------------------ model (pure) */
  function par(a, b) {
    if (!isFinite(a)) return b;
    if (!isFinite(b)) return a;
    if (a + b === 0) return 0;
    return a * b / (a + b);
  }
  function validR(v) { return typeof v === 'number' && isFinite(v) && v > 0; }

  /* Y → Δ (dw1 section 4): same numerator N, divide by the opposite Y resistor. */
  function y2d(R1, R2, R3) {
    var N = R1 * R2 + R2 * R3 + R3 * R1;
    return { N: N, RA: N / R1, RB: N / R2, RC: N / R3 };
  }
  /* Δ → Y (dw1 section 7): same denominator S, numerator = the other two Δ resistors. */
  function d2y(RA, RB, RC) {
    var S = RA + RB + RC;
    return { S: S, R1: RB * RC / S, R2: RC * RA / S, R3: RA * RB / S };
  }
  /* Resistance between each pair of terminals with the third terminal open. */
  function pairsY(R1, R2, R3) { return { AB: R2 + R3, AC: R1 + R2, BC: R1 + R3 }; }
  function pairsD(RA, RB, RC) { return { AB: par(RA, RB + RC), AC: par(RC, RA + RB), BC: par(RB, RA + RC) }; }
  function relDiff(a, b) {
    if (a === b) return 0;
    if (!isFinite(a) || !isFinite(b)) return Infinity;
    return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);
  }
  function balanced(a, b, c, tol) {
    tol = tol == null ? 1e-6 : tol;
    return relDiff(a, b) <= tol && relDiff(b, c) <= tol && relDiff(a, c) <= tol;
  }
  /* Converter: given mode and inputs → both networks + terminal checks. */
  function convert(mode, x, y, z) {
    var Y, D, extra;
    if (mode === 'd2y') {
      var r = d2y(x, y, z);
      D = { RA: x, RB: y, RC: z }; Y = { R1: r.R1, R2: r.R2, R3: r.R3 }; extra = { S: r.S };
    } else {
      var q = y2d(x, y, z);
      Y = { R1: x, R2: y, R3: z }; D = { RA: q.RA, RB: q.RB, RC: q.RC }; extra = { N: q.N };
    }
    var pY = pairsY(Y.R1, Y.R2, Y.R3), pD = pairsD(D.RA, D.RB, D.RC);
    var ok = ['AB', 'AC', 'BC'].every(function (k) { return relDiff(pY[k], pD[k]) < 1e-9; });
    return { mode: mode, Y: Y, D: D, N: extra.N, S: extra.S, pairsY: pY, pairsD: pD, match: ok, balancedIn: balanced(x, y, z) };
  }

  /* Bridge (dw1 opening circuit). Nodes: T (source +, at V_s), A (left middle), B (right middle), C (source −, 0 V).
   * p = {Vs, R4: T–A, R5: T–B, RA: A–B (bridge), RB: B–C, RC: A–C}. */
  function bridgeFromY(Vs, R4, R5, Y) {
    var RLb = R4 + Y.R2, RRb = R5 + Y.R3;          // left branch T→A→N, right branch T→B→N (guide: R_L, R_R)
    var Rp = par(RLb, RRb);
    var Req = Rp + Y.R1;
    var IT = Vs / Req;
    var VR1 = IT * Y.R1;
    var Vbr = Vs - VR1;                             // KVL: voltage across each parallel branch (T to N)
    var IL = Vbr / RLb, IR = Vbr / RRb;
    var VA = Vs - R4 * IL, VB = Vs - R5 * IR;
    return { RLb: RLb, RRb: RRb, Rp: Rp, Req: Req, IT: IT, VR1: VR1, Vbr: Vbr, IL: IL, IR: IR, VA: VA, VB: VB, VN: VR1 };
  }
  function elementCurrents(p, VA, VB) {
    return {
      I4: (p.Vs - VA) / p.R4,      // T → A
      I5: (p.Vs - VB) / p.R5,      // T → B
      IAB: (VA - VB) / p.RA,       // A → B (through the bridge R_A)
      IAC: VA / p.RC,              // A → C
      IBC: VB / p.RB               // B → C
    };
  }
  /* Method 1a (the lecture): convert the bottom Δ (R_A, R_B, R_C between A, B, C) to a Y. */
  function bridgeDY(p) {
    var Y = d2y(p.RA, p.RB, p.RC);
    var r = bridgeFromY(p.Vs, p.R4, p.R5, Y);
    r.Y = Y;
    r.cur = elementCurrents(p, r.VA, r.VB);
    return r;
  }
  /* Method 1b (guide section 6, added): convert the top Δ (R_4, R_5, R_A between T, A, B) to a Y with centre N.
   * Arms named by the node they reach: R_NT, R_NA, R_NB. */
  function bridgeTop(p) {
    var S = p.R4 + p.R5 + p.RA;
    var Yt = { S: S, NT: p.R4 * p.R5 / S, NA: p.R4 * p.RA / S, NB: p.R5 * p.RA / S };
    var left = Yt.NA + p.RC, right = Yt.NB + p.RB;  // N→A→C and N→B→C
    var Rp = par(left, right);
    var Req = Yt.NT + Rp;
    var IT = p.Vs / Req;
    var VN = p.Vs - IT * Yt.NT;
    var Ileft = VN / left, Iright = VN / right;
    var VA = Ileft * p.RC, VB = Iright * p.RB;
    return { Yt: Yt, left: left, right: right, Rp: Rp, Req: Req, IT: IT, VN: VN, Ileft: Ileft, Iright: Iright,
      VA: VA, VB: VB, cur: elementCurrents(p, VA, VB) };
  }
  /* Method 2: nodal analysis of the original bridge (C = 0 V reference, T = V_s). Unknowns V_A, V_B.
   *  KCL at A: (V_A − V_s)/R_4 + (V_A − V_B)/R_A + V_A/R_C = 0
   *  KCL at B: (V_B − V_s)/R_5 + (V_B − V_A)/R_A + V_B/R_B = 0 */
  function bridgeNodal(p) {
    var g11 = 1 / p.R4 + 1 / p.RA + 1 / p.RC;
    var g22 = 1 / p.R5 + 1 / p.RA + 1 / p.RB;
    var g12 = 1 / p.RA;
    var det = g11 * g22 - g12 * g12;
    function solve(Vs) {
      var b1 = Vs / p.R4, b2 = Vs / p.R5;
      var VA = (b1 * g22 + g12 * b2) / det;
      var VB = (g11 * b2 + g12 * b1) / det;
      return { b1: b1, b2: b2, VA: VA, VB: VB, IT: (Vs - VA) / p.R4 + (Vs - VB) / p.R5 };
    }
    var s = solve(p.Vs), unit = solve(1);
    var Req = 1 / unit.IT;                          // independent of V_s (linear circuit)
    return { g11: g11, g22: g22, g12: g12, det: det, b1: s.b1, b2: s.b2, VA: s.VA, VB: s.VB, IT: s.IT, Req: Req,
      cur: elementCurrents(p, s.VA, s.VB) };
  }
  /* Balanced bridge (extra teaching): no current in R_A when R_4/R_C = R_5/R_B. */
  function bridgeBalanced(p, tol) { return relDiff(p.R4 * p.RB, p.R5 * p.RC) <= (tol == null ? 1e-6 : tol); }
  function round(v, dp) { var f = Math.pow(10, dp); return Math.round(v * f) / f; }

  /* ---- display formatting (pure; uses EELabs.kit when called) */
  function K() { return global.EELabs.kit; }
  /* Resistance without the milli prefix (the guide writes 0.93 Ω, not 930 mΩ); k and M are kept. */
  function fmtR(v, sig) {
    sig = sig || 4;
    if (typeof v === 'number' && isFinite(v) && v !== 0 && Math.abs(v) < 1) return K().sigStr(v, sig) + ' Ω';
    return K().fmt(v, 'Ω', sig);
  }
  /* Product of two resistances, prefixed by its own size: 1 kΩ² = 1e6 Ω², 1 MΩ² = 1e12 Ω² (never mΩ²). */
  function fmtR2(v, sig) {
    sig = sig || 4;
    if (typeof v !== 'number' || isNaN(v)) return '—';
    if (!isFinite(v)) return '∞ Ω²';
    var a = Math.abs(v);
    if (a >= 1e12) return K().sigStr(v / 1e12, sig) + ' MΩ²';
    if (a >= 1e6) return K().sigStr(v / 1e6, sig) + ' kΩ²';
    return K().sigStr(v, sig) + ' Ω²';
  }
  /* One unit for a whole worked formula, chosen from the geometric mean of the magnitudes it shows,
   * so one large value does not push the small ones down to 0.00x kΩ. */
  function scaleFor(vals) {
    var s = 0, k = 0;
    vals.forEach(function (v) { if (typeof v === 'number' && isFinite(v) && v !== 0) { s += Math.log(Math.abs(v)) / Math.LN10; k++; } });
    var g = k ? Math.pow(10, s / k) : 1;
    if (g >= 1e6) return { f: 1e6, name: 'MΩ', u: '\\text{M}\\Omega', u2: '\\text{M}\\Omega^2', i: '\\mu\\text{A}', g: '\\mu\\text{S}' };
    if (g >= 1e3) return { f: 1e3, name: 'kΩ', u: '\\text{k}\\Omega', u2: '\\text{k}\\Omega^2', i: '\\text{mA}', g: '\\text{mS}' };
    return { f: 1, name: 'Ω', u: '\\Omega', u2: '\\Omega^2', i: '\\text{A}', g: '\\text{S}' };
  }
  /* KCL caption for the bridge currents table: both sides of each check are printed. */
  function kclCaption(cur, IT) {
    var f = function (x) { return K().fmt(x, 'A', 4); };
    return 'KCL check: at A, \\(I_{R_4} = I_{R_A} + I_{R_C}\\) (' + f(cur.I4) + ' = ' + f(cur.IAB + cur.IAC) + '); at C, \\(I_{R_C} + I_{R_B} = I_T\\) (' +
      f(cur.IAC + cur.IBC) + ' = ' + f(IT) + '). These currents come from \\(V_A\\) and \\(V_B\\) in the original circuit; the converted circuit does not contain the replaced resistors.';
  }
  /* Values for the converter readout (all strings, so kit.readout applies no milli prefix). */
  function convReadout(c) {
    return c.mode === 'y2d'
      ? { o1: fmtR(c.D.RA), o2: fmtR(c.D.RB), o3: fmtR(c.D.RC), common: fmtR2(c.N) }
      : { o1: fmtR(c.Y.R1), o2: fmtR(c.Y.R2), o3: fmtR(c.Y.R3), common: fmtR(c.S) };
  }

  var model = {
    par: par, validR: validR, y2d: y2d, d2y: d2y, pairsY: pairsY, pairsD: pairsD, relDiff: relDiff, balanced: balanced,
    convert: convert, bridgeFromY: bridgeFromY, bridgeDY: bridgeDY, bridgeTop: bridgeTop, bridgeNodal: bridgeNodal,
    elementCurrents: elementCurrents, bridgeBalanced: bridgeBalanced, round: round,
    fmtR: fmtR, fmtR2: fmtR2, scaleFor: scaleFor, kclCaption: kclCaption, convReadout: convReadout
  };

  /* ------------------------------------------------------------------ definition */
  var LESSON_BRIDGE = { Vs: 84, R4: 10, R5: 10, RA: 2.7, RB: 3.9, RC: 4.7 };
  var DEFAULTS = {
    panel: 'conv', mode: 'y2d', view: 'overlay',
    R1: 3.3, R2: 4.7, R3: 5.6, RA: 2.7, RB: 3.9, RC: 4.7,
    bridge: { Vs: 84, R4: 10, R5: 10, RA: 2.7, RB: 3.9, RC: 4.7, conv: 'bottom' }
  };
  var presets = [
    { id: 'dw1-ex1', label: 'Example 1: Y → Δ (3.3, 4.7, 5.6 Ω)', lesson: 'dw1', sec: 'dw1-y2d-example',
      values: { panel: 'conv', mode: 'y2d', R1: 3.3, R2: 4.7, R3: 5.6 } },
    { id: 'dw1-ex2', label: 'Example 2: Δ → Y (2.7, 3.9, 4.7 Ω)', lesson: 'dw1', sec: 'dw1-d2y-example',
      values: { panel: 'conv', mode: 'd2y', RA: 2.7, RB: 3.9, RC: 4.7 } },
    { id: 'dw1-bridge', label: 'Example 3: the 84 V bridge', lesson: 'dw1', sec: 'dw1-solve',
      values: { panel: 'bridge', bridge: { Vs: 84, R4: 10, R5: 10, RA: 2.7, RB: 3.9, RC: 4.7, conv: 'bottom' } } },
    { id: 'dw1-bridge-top', extra: true, label: 'Bridge via the top Δ (guide’s added check)', lesson: 'dw1', sec: 'dw1-bridge-delta',
      values: { panel: 'bridge', bridge: { Vs: 84, R4: 10, R5: 10, RA: 2.7, RB: 3.9, RC: 4.7, conv: 'top' } } },
    { id: 'dw1-balanced', extra: true, label: 'Balanced Δ: three 9 Ω (guide section 10)', lesson: 'dw1', sec: 'dw1-derivation',
      values: { panel: 'conv', mode: 'd2y', RA: 9, RB: 9, RC: 9 } }
  ];

  var def = {
    id: 'deltawye', topic: 'deltawye',
    title: 'Δ ↔ Y converter and the bridge circuit',
    blurb: 'Change any resistor and watch the equivalent network, the substituted formulas and the terminal check update. The second tab solves the lecture’s 84 V bridge two ways.',
    assumptions: [
      'Ideal, linear resistors (DC). The bridge source is an ideal voltage source with no internal resistance.',
      'The Δ and the Y connect to the <strong>same three nodes</strong> A, B, C. They are equivalent only as seen from those nodes: the currents inside the replaced resistors are not preserved (go back to the original circuit for them).',
      'Labelling as in dw1: \\(R_A\\) A–B, \\(R_B\\) B–C, \\(R_C\\) A–C; \\(R_1\\) centre–C, \\(R_2\\) centre–A, \\(R_3\\) centre–B. Opposite pairs: \\(R_1\\leftrightarrow R_A\\), \\(R_2\\leftrightarrow R_B\\), \\(R_3\\leftrightarrow R_C\\).',
      'Every resistance must be greater than 0 Ω. A 0 Ω Y arm would make the opposite Δ resistor infinite (an open circuit), so the inputs are limited to positive values.',
      'Bridge: node C (source −) is the 0 V reference and node T is at \\(V_s\\). \\(R_4\\) (T–A) and \\(R_5\\) (T–B) are the guide’s “left 10 Ω” and “right 10 Ω”.',
      'Results are computed without intermediate rounding and shown to 4 significant figures. The guide’s Example 3 rounds the Y to 1.62, 1.12, 0.93 Ω first, so it shows 7.132 Ω where full precision gives 7.135 Ω.',
      'The balanced-network shortcut (\\(R_Y = R_\\Delta/3\\)), the top-Δ alternative and the balanced-bridge condition are the guide’s added teaching, not from the video.'
    ],
    presets: presets,
    model: model,
    mount: mount
  };

  /* ------------------------------------------------------------------ UI */
  var CSS = [
    '.lab-deltawye-tabs{display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid var(--line);}',
    '.lab-deltawye-tab{font:inherit;font-size:var(--fs-sm);font-weight:600;padding:8px 14px;border:0;border-bottom:3px solid transparent;background:none;color:var(--ink-2);cursor:pointer;margin-bottom:-1px;border-radius:var(--r-sm) var(--r-sm) 0 0;}',
    '.lab-deltawye-tab:hover{color:var(--ink);background:var(--surface-2);}',
    '.lab-deltawye-tab[aria-selected="true"]{color:var(--topic-ink);border-bottom-color:var(--topic);}',
    '.lab-deltawye-tab:focus-visible{outline:2px solid var(--topic);outline-offset:-2px;}',
    '.lab[data-lab="deltawye"] [hidden]{display:none !important;}',
    '.lab-deltawye-panel{animation:lab-deltawye-in var(--dur-2) var(--ease-out);}',
    '@keyframes lab-deltawye-in{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}',
    '.lab-deltawye-row{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center;}',
    '.lab-deltawye-help{font-size:var(--fs-xs);color:var(--ink-3);margin:0;}',
    '.lab-deltawye-sub{margin:0;font-family:var(--font-display);font-size:var(--fs-base);font-weight:700;color:var(--ink);}',
    '.lab-deltawye-legend{display:flex;flex-wrap:wrap;gap:var(--sp-3);font-size:var(--fs-xs);color:var(--ink-2);margin:0;}',
    '.lab-deltawye-legend span{display:inline-flex;align-items:center;gap:6px;}',
    '.lab-deltawye-legend i{display:inline-block;width:20px;height:0;border-top:2px solid var(--ck-stroke);}',
    '.lab-deltawye-legend i.der{border-top:3px solid var(--topic);}',
    '.lab-deltawye-legend i.dash{border-top:2px dashed var(--ck-stroke);}',
    '.lab-deltawye-ckt svg.ckt .lab-deltawye-derived .ck-w{stroke:var(--topic);stroke-width:2.6;}',
    '.lab-deltawye-ckt svg.ckt .lab-deltawye-derived .ck-dash{stroke:var(--ck-stroke);stroke-width:1.6;}',
    '.lab-deltawye-ckt svg.ckt .lab-deltawye-derived .ck-fill{fill:var(--topic);}',
    '.lab-deltawye-ckt svg.ckt .lab-deltawye-derived .ck-text{fill:var(--topic-ink);font-weight:700;}',
    '.lab-deltawye-ckt svg.ckt .ck-text{font-family:var(--font-body);}',
    '.lab-deltawye-status{display:flex;gap:var(--sp-2);align-items:flex-start;}',
    '.lab-deltawye-status svg{flex:none;margin-top:2px;}',
    '.lab .lab-deltawye-tbl td,.lab .lab-deltawye-tbl th{vertical-align:middle;}',
    '.lab .lab-deltawye-tbl td{font-family:var(--font-mono);font-size:var(--fs-sm);}',
    '.lab .lab-deltawye-tbl td .katex{font-size:1.08em;}',
    '.lab-deltawye-ok{color:var(--ok);font-weight:600;font-family:var(--font-body);white-space:nowrap;}',
    '.lab-deltawye-no{color:var(--bad);font-weight:600;font-family:var(--font-body);white-space:nowrap;}',
    '.lab-deltawye-cap{font-size:var(--fs-xs);color:var(--ink-2);margin:4px 2px 0;}',
    '.lab-deltawye-figs{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--sp-3);}',
    '.lab .lab-deltawye-tbl td.rh{font-family:var(--font-body);font-weight:600;color:var(--ink);text-align:left;white-space:nowrap;}',
    '.lab-deltawye-figs figure{margin:0;min-width:0;}',
    '.lab-deltawye-src{font-size:var(--fs-xs);color:var(--ink-3);margin:0;}',
    '.lab-deltawye-ckt{overflow-x:auto;}',
    '@media (max-width:560px){.lab-deltawye-ckt svg.ckt{width:520px;max-width:none;height:auto;}.lab-deltawye-ckt svg.ckt .ck-text,.lab-deltawye-ckt svg.ckt .ck-node{font-size:15px;}}'
  ].join('\n');

  function ensureCss() {
    if (document.getElementById('lab-deltawye-css')) return;
    var st = document.createElement('style');
    st.id = 'lab-deltawye-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function sanitize(v) {
    var s = clone(DEFAULTS);
    if (!v || typeof v !== 'object') return s;
    if (v.panel === 'conv' || v.panel === 'bridge') s.panel = v.panel;
    if (v.mode === 'y2d' || v.mode === 'd2y') s.mode = v.mode;
    if (v.view === 'overlay' || v.view === 'side') s.view = v.view;
    ['R1', 'R2', 'R3', 'RA', 'RB', 'RC'].forEach(function (k) { if (validR(v[k])) s[k] = v[k]; });
    if (v.bridge && typeof v.bridge === 'object') {
      ['R4', 'R5', 'RA', 'RB', 'RC'].forEach(function (k) { if (validR(v.bridge[k])) s.bridge[k] = v.bridge[k]; });
      if (typeof v.bridge.Vs === 'number' && isFinite(v.bridge.Vs) && v.bridge.Vs > 0) s.bridge.Vs = v.bridge.Vs;
      if (v.bridge.conv === 'bottom' || v.bridge.conv === 'top') s.bridge.conv = v.bridge.conv;
    }
    return s;
  }
  function merge(base, over) {
    var out = clone(base);
    Object.keys(over || {}).forEach(function (k) {
      if (k === 'bridge' && over.bridge) { Object.keys(over.bridge).forEach(function (b) { out.bridge[b] = over.bridge[b]; }); }
      else out[k] = over[k];
    });
    return sanitize(out);
  }

  function mount(el, ctx) {
    var kit = ctx.kit || global.EELabs.kit;
    var h = kit.h, fmt = kit.fmt;
    ensureCss();

    var st = sanitize(ctx.state);
    if (ctx.preset) st = merge(st, ctx.preset);
    var cleanups = [];
    var dead = false;

    function save() { if (ctx.save) ctx.save(clone(st)); }
    /* resistances: no milli prefix (the guide writes 0.93 Ω, not 930 mΩ) */
    var R = fmtR;
    function n(v) { return isFinite(v) ? kit.num(v, 4) : '\\infty'; }

    var frame = kit.frame(def, { onPreset: function (p) { st = merge(st, p.values); applyAll(); save(); } });
    var root = frame.root;
    var body1 = frame.controls.parentNode;

    /* ---- tabs */
    var tabIds = { conv: kit.uid('dw-tab'), bridge: kit.uid('dw-tab') };
    var panIds = { conv: kit.uid('dw-pan'), bridge: kit.uid('dw-pan') };
    var tablist = h('div', { class: 'lab-deltawye-tabs', role: 'tablist', 'aria-label': 'Lab sections' });
    var tabs = {
      conv: h('button', { type: 'button', role: 'tab', class: 'lab-deltawye-tab', id: tabIds.conv, 'aria-controls': panIds.conv, text: 'Δ ↔ Y converter' }),
      bridge: h('button', { type: 'button', role: 'tab', class: 'lab-deltawye-tab', id: tabIds.bridge, 'aria-controls': panIds.bridge, text: 'The 84 V bridge' })
    };
    tablist.appendChild(tabs.conv); tablist.appendChild(tabs.bridge);
    var panels = {
      conv: h('div', { class: 'lab-deltawye-panel', role: 'tabpanel', id: panIds.conv, 'aria-labelledby': tabIds.conv }),
      bridge: h('div', { class: 'lab-deltawye-panel', role: 'tabpanel', id: panIds.bridge, 'aria-labelledby': tabIds.bridge })
    };
    root.insertBefore(tablist, body1);
    root.insertBefore(panels.conv, body1);
    root.insertBefore(panels.bridge, frame.foot);
    panels.conv.appendChild(body1);
    function showPanel(which, focus) {
      st.panel = which;
      ['conv', 'bridge'].forEach(function (k) {
        var on = k === which;
        tabs[k].setAttribute('aria-selected', on ? 'true' : 'false');
        tabs[k].setAttribute('tabindex', on ? '0' : '-1');
        panels[k].hidden = !on;
      });
      if (focus) tabs[which].focus();
    }
    ['conv', 'bridge'].forEach(function (k) {
      tabs[k].addEventListener('click', function () { showPanel(k); renderPanel(); save(); });
      tabs[k].addEventListener('keydown', function (e) {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(e.key) < 0) return;
        e.preventDefault();
        var other = k === 'conv' ? 'bridge' : 'conv';
        var tgt = e.key === 'Home' ? 'conv' : e.key === 'End' ? 'bridge' : other;
        showPanel(tgt, true); renderPanel(); save();
      });
    });

    /* ================================================================ panel 1: converter */
    var modeSeg = kit.segmented({ label: 'Direction', value: st.mode, options: [{ value: 'y2d', label: 'Y → Δ' }, { value: 'd2y', label: 'Δ → Y' }],
      onChange: function (m) {
        // keep the same pair of networks: the current results become the new inputs
        var c = convert(st.mode, inVals()[0], inVals()[1], inVals()[2]);
        if (m === 'd2y') { st.RA = c.D.RA; st.RB = c.D.RB; st.RC = c.D.RC; }
        else { st.R1 = c.Y.R1; st.R2 = c.Y.R2; st.R3 = c.Y.R3; }
        st.mode = m; syncControls(); renderConv(); save();
        kit.tex(modeNote, m === 'd2y' ? 'The Δ you just computed is now the input; converting it back gives the original Y.' : 'The Y you just computed is now the input; converting it back gives the original Δ.');
      } });
    var modeNote = h('p', { class: 'lab-deltawye-help', 'aria-live': 'polite' });
    function ctl(key, label, help) {
      return kit.control({ label: label, unit: 'Ω', min: 0.1, max: 1e6, scale: 'log', value: st[key], sig: 4, help: help,
        onInput: function (v) { st[key] = v; touched(); renderConv(); save(); } });
    }
    var yCtl = {
      R1: ctl('R1', '\\(R_1\\): centre to C', 'Opposite \\(R_A\\)'),
      R2: ctl('R2', '\\(R_2\\): centre to A', 'Opposite \\(R_B\\)'),
      R3: ctl('R3', '\\(R_3\\): centre to B', 'Opposite \\(R_C\\)')
    };
    var dCtl = {
      RA: ctl('RA', '\\(R_A\\): between A and B', 'Opposite \\(R_1\\)'),
      RB: ctl('RB', '\\(R_B\\): between B and C', 'Opposite \\(R_2\\)'),
      RC: ctl('RC', '\\(R_C\\): between A and C', 'Opposite \\(R_3\\)')
    };
    var yGroup = h('div', { class: 'lab-group', role: 'group', 'aria-label': 'Given Y resistors' }, [h('h4', { text: 'Given Y (wye) resistors' }), yCtl.R1.el, yCtl.R2.el, yCtl.R3.el]);
    var dGroup = h('div', { class: 'lab-group', role: 'group', 'aria-label': 'Given delta resistors' }, [h('h4', { text: 'Given Δ (delta) resistors' }), dCtl.RA.el, dCtl.RB.el, dCtl.RC.el]);
    var balBtn = h('button', { type: 'button', class: 'lab-btn', text: 'Make it balanced (all three equal)' });
    balBtn.addEventListener('click', function () {
      var keys = st.mode === 'd2y' ? ['RA', 'RB', 'RC'] : ['R1', 'R2', 'R3'];
      var v = st[keys[0]];
      keys.forEach(function (k) { st[k] = v; });
      syncControls(); renderConv(); save();
    });
    frame.controls.appendChild(h('div', { class: 'lab-deltawye-row' }, [modeSeg.el]));
    frame.controls.appendChild(modeNote);
    frame.controls.appendChild(yGroup);
    frame.controls.appendChild(dGroup);
    frame.controls.appendChild(h('div', { class: 'lab-deltawye-row' }, [balBtn]));
    frame.controls.appendChild(h('p', { class: 'lab-deltawye-help', text: 'Drag a slider or type a value (prefixes such as k and M work). Switching direction keeps the same pair of networks.' }));

    var viewSeg = kit.segmented({ label: 'Diagram', value: st.view, options: [{ value: 'overlay', label: 'Same three nodes' }, { value: 'side', label: 'Side by side' }],
      onChange: function (v) { st.view = v; renderConv(); save(); } });
    var convFig = h('div', { class: 'lab-deltawye-ckt' });
    var convLegend = h('p', { class: 'lab-deltawye-legend' });
    var convCap = h('p', { class: 'lab-deltawye-cap' });
    var convRo = kit.readout([
      { key: 'o1', label: 'out1', unit: 'Ω', emph: true }, { key: 'o2', label: 'out2', unit: 'Ω', emph: true }, { key: 'o3', label: 'out3', unit: 'Ω', emph: true },
      { key: 'common', label: 'common', unit: 'Ω' }
    ]);
    var convStatus = h('div', { class: 'lab-note' });
    var eqTitle = h('h4', { class: 'lab-deltawye-sub', text: 'Terminal check: resistance between two nodes, third node open' });
    var eqWrap = h('div', { class: 'lab-table-wrap' });
    var convWork = kit.workings('Show the substituted formulas');
    frame.output.appendChild(h('div', { class: 'lab-deltawye-row' }, [viewSeg.el]));
    frame.output.appendChild(h('figure', { style: { margin: '0' } }, [convFig, convCap]));
    frame.output.appendChild(convLegend);
    frame.output.appendChild(convRo.el);
    frame.output.appendChild(convStatus);
    frame.output.appendChild(convWork.el);
    frame.output.appendChild(eqTitle);
    frame.output.appendChild(eqWrap);

    function inVals() { return st.mode === 'd2y' ? [st.RA, st.RB, st.RC] : [st.R1, st.R2, st.R3]; }
    function syncControls() {
      modeSeg.set(st.mode); viewSeg.set(st.view);
      ['R1', 'R2', 'R3'].forEach(function (k) { yCtl[k].set(st[k]); });
      ['RA', 'RB', 'RC'].forEach(function (k) { dCtl[k].set(st[k]); });
      yGroup.hidden = st.mode !== 'y2d';
      dGroup.hidden = st.mode !== 'd2y';
    }

    /* diagram specs */
    function deltaParts(D, ox) {
      ox = ox || 0;
      return [
        { t: 'R', a: [ox, 0], b: [ox + 12, 0], label: 'R_A', value: R(D.RA) },
        { t: 'R', a: [ox, 0], b: [ox + 6, 10], label: 'R_C', value: R(D.RC), lpos: [-1.45, 0.45] },
        { t: 'R', a: [ox + 12, 0], b: [ox + 6, 10], label: 'R_B', value: R(D.RB), lpos: [1.45, 0.45] }
      ];
    }
    function nodeParts(ox) {
      ox = ox || 0;
      return [{ t: 'N', at: [ox, 0], label: 'A', pos: 'nw' }, { t: 'N', at: [ox + 12, 0], label: 'B', pos: 'ne' }, { t: 'N', at: [ox + 6, 10], label: 'C', pos: 's' }];
    }
    function wyeOverlayParts(Y) {
      return [
        { t: 'R', a: [1.8, 1.4], b: [6, 4.4], label: 'R_2', value: R(Y.R2), lpos: [-0.55, -1.25] },
        { t: 'R', a: [6, 4.4], b: [10.2, 1.4], label: 'R_3', value: R(Y.R3), lpos: [0.55, -1.25] },
        { t: 'R', a: [6, 4.4], b: [6, 8.0], label: 'R_1', value: R(Y.R1) },
        { t: 'W', pts: [[1.8, 1.4], [0, 0]], dashed: true },
        { t: 'W', pts: [[10.2, 1.4], [12, 0]], dashed: true },
        { t: 'W', pts: [[6, 8.0], [6, 10]], dashed: true },
        { t: 'N', at: [6, 4.4], label: 'N', pos: 'w' }
      ];
    }
    function sideSpec(c) {
      var yP = function (ox) {
        return [
          { t: 'R', a: [ox, 0], b: [ox + 2, 1.8], label: 'R_2', value: R(c.Y.R2), lpos: [-1.05, 0.55] },
          { t: 'R', a: [ox + 2, 1.8], b: [ox + 4, 0], label: 'R_3', value: R(c.Y.R3), lpos: [1.05, 0.55] },
          { t: 'R', a: [ox + 2, 1.8], b: [ox + 2, 4.4], label: 'R_1', value: R(c.Y.R1) },
          { t: 'N', at: [ox, 0], label: 'A', pos: 'nw' }, { t: 'N', at: [ox + 4, 0], label: 'B', pos: 'ne' },
          { t: 'N', at: [ox + 2, 4.4], label: 'C', pos: 's' }, { t: 'N', at: [ox + 2, 1.8] }
        ];
      };
      var dP = function (ox) {
        return [
          { t: 'R', a: [ox, 0], b: [ox + 4, 0], label: 'R_A', value: R(c.D.RA) },
          { t: 'R', a: [ox, 0], b: [ox + 2, 3.4], label: 'R_C', value: R(c.D.RC), side: -1 },
          { t: 'R', a: [ox + 4, 0], b: [ox + 2, 3.4], label: 'R_B', value: R(c.D.RB), side: -1 },
          { t: 'N', at: [ox, 0], label: 'A', pos: 'nw' }, { t: 'N', at: [ox + 4, 0], label: 'B', pos: 'ne' }, { t: 'N', at: [ox + 2, 3.4], label: 'C', pos: 's' }
        ];
      };
      var y2dm = c.mode === 'y2d';
      var parts = (y2dm ? yP(0) : dP(0)).concat([
        { t: 'ARROW', a: [5.2, 2.0], b: [6.8, 2.0] },
        { t: 'T', at: [2, -1.7], text: y2dm ? 'Given Y' : 'Given Δ', cls: 'muted' },
        { t: 'T', at: [10, -1.7], text: y2dm ? 'Equivalent Δ' : 'Equivalent Y', cls: 'accent' }
      ]).concat(y2dm ? dP(8) : yP(8));
      return { parts: parts, pad: 1.4, padX: 2.2, alt: altText(c) };
    }
    function altText(c) {
      return 'Delta R_A = ' + R(c.D.RA) + ' between A and B, R_B = ' + R(c.D.RB) + ' between B and C, R_C = ' + R(c.D.RC) +
        ' between A and C. Equivalent wye with centre N: R_1 = ' + R(c.Y.R1) + ' to C, R_2 = ' + R(c.Y.R2) + ' to A, R_3 = ' + R(c.Y.R3) + ' to B. ' +
        (c.mode === 'y2d' ? 'The wye is given; the delta is computed.' : 'The delta is given; the wye is computed.');
    }
    function drawOverlay(c) {
      if (!global.EEDiagrams) { convFig.textContent = '(diagram renderer missing)'; return; }
      var dSpec = { parts: deltaParts(c.D).concat(nodeParts()), pad: 1.2, padX: 2.6 };
      var ySpec = { parts: wyeOverlayParts(c.Y).concat([{ t: 'N', at: [0, 0] }, { t: 'N', at: [12, 0] }, { t: 'N', at: [6, 10] }]), pad: 1.2, padX: 2.6 };
      var given = c.mode === 'y2d' ? ySpec : dSpec, derived = c.mode === 'y2d' ? dSpec : ySpec;
      var r1 = global.EEDiagrams.renderCircuit(given), r2 = global.EEDiagrams.renderCircuit(derived);
      convFig.innerHTML = r1.svg;
      var svg = convFig.querySelector('svg');
      var tmp = document.createElement('div');
      tmp.innerHTML = r2.svg;
      var svg2 = tmp.querySelector('svg');
      if (svg && svg2) {
        var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'lab-deltawye-derived');
        Array.prototype.slice.call(svg2.childNodes).forEach(function (ch) { if (ch.nodeName.toLowerCase() !== 'title') g.appendChild(ch); });
        svg.appendChild(g);
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', altText(c));
      }
    }

    function renderConv() {
      var v = inVals();
      var c = convert(st.mode, v[0], v[1], v[2]);
      var y2dm = st.mode === 'y2d';
      // diagram
      if (st.view === 'overlay') {
        drawOverlay(c);
        kit.tex(convCap, y2dm ? 'The Y you entered (plain lines) and its equivalent Δ (thick teal lines, bold labels) on the same three nodes A, B, C. Dashed lines join each Y terminal to the Δ corner it shares. N is the Y centre node.'
          : 'The Δ you entered (plain lines) and its equivalent Y (thick teal lines, bold labels) on the same three nodes A, B, C. Dashed lines join each Y terminal to the Δ corner it shares. N is the new Y centre node.');
        convLegend.innerHTML = '';
        convLegend.appendChild(h('span', {}, [h('i'), document.createTextNode(y2dm ? 'Given Y' : 'Given Δ')]));
        convLegend.appendChild(h('span', {}, [h('i', { class: 'der' }), document.createTextNode(y2dm ? 'Computed Δ (bold labels)' : 'Computed Y (bold labels)')]));
        convLegend.appendChild(h('span', {}, [h('i', { class: 'dash' }), document.createTextNode('Same node')]));
        convLegend.hidden = false;
      } else {
        var r = global.EEDiagrams ? global.EEDiagrams.renderCircuit(sideSpec(c)) : null;
        if (r) { convFig.innerHTML = r.svg; } else convFig.textContent = '(diagram renderer missing)';
        kit.tex(convCap, 'Given network (left) and its equivalent (right), drawn like Example 1 in the guide. Node letters match: connect the new network to the same points A, B, C.');
        convLegend.hidden = true;
      }
      // readouts
      var lbl = y2dm ? ['\\(R_A\\) (A–B)', '\\(R_B\\) (B–C)', '\\(R_C\\) (A–C)', 'Common numerator \\(R_1R_2+R_2R_3+R_3R_1\\)'] : ['\\(R_1\\) (N–C)', '\\(R_2\\) (N–A)', '\\(R_3\\) (N–B)', 'Common denominator \\(R_A+R_B+R_C\\)'];
      Array.prototype.forEach.call(convRo.el.querySelectorAll('dt'), function (dt, i) { if (dt.getAttribute('data-l') !== lbl[i]) { dt.setAttribute('data-l', lbl[i]); kit.tex(dt, lbl[i]); } });
      var sc = scaleFor(v.concat(y2dm ? [c.D.RA, c.D.RB, c.D.RC] : [c.Y.R1, c.Y.R2, c.Y.R3]));
      convRo.update(convReadout(c));
      // balanced status
      var bal = c.balancedIn;
      convStatus.className = 'lab-note ' + (bal ? 'ok' : '');
      if (bal) {
        if (y2dm) kit.tex(convStatus, '<strong>Balanced Y.</strong> All three arms are equal, so every Δ resistor is \\(R_\\Delta = 3R_Y = 3(' + n(st.R1 / sc.f) + ') = ' + n(c.D.RA / sc.f) + '\\,' + sc.u + '\\).');
        else kit.tex(convStatus, '<strong>Balanced Δ.</strong> All three sides are equal, so every Y arm is \\(R_Y = R_\\Delta/3 = ' + n(st.RA / sc.f) + '/3 = ' + n(c.Y.R1 / sc.f) + '\\,' + sc.u + '\\).');
      } else {
        kit.tex(convStatus, '<strong>Not balanced.</strong> The three ' + (y2dm ? 'Y arms' : 'Δ sides') + ' differ, so use the full formulas (the balanced shortcut ' +
          '\\(R_Y = R_\\Delta/3\\) applies only when all three are equal). Sanity check: ' + (y2dm ? 'each Δ resistor is larger than the two Y arms it spans in series.' : 'each Y arm is smaller than both Δ resistors that touch its node.'));
      }
      // workings
      var a = function (x) { return n(x / sc.f); };
      var lines;
      if (y2dm) {
        lines = [
          '\\text{Common numerator: } R_1R_2+R_2R_3+R_3R_1 = ' + a(st.R1) + '(' + a(st.R2) + ')+' + a(st.R2) + '(' + a(st.R3) + ')+' + a(st.R3) + '(' + a(st.R1) + ')',
          '= ' + n(st.R1 * st.R2 / sc.f / sc.f) + '+' + n(st.R2 * st.R3 / sc.f / sc.f) + '+' + n(st.R3 * st.R1 / sc.f / sc.f) + ' = ' + n(c.N / sc.f / sc.f) + '\\ ' + sc.u2,
          'R_A = \\frac{R_1R_2+R_2R_3+R_3R_1}{R_1} = \\frac{' + n(c.N / sc.f / sc.f) + '}{' + a(st.R1) + '} = ' + a(c.D.RA) + '\\,' + sc.u,
          'R_B = \\frac{R_1R_2+R_2R_3+R_3R_1}{R_2} = \\frac{' + n(c.N / sc.f / sc.f) + '}{' + a(st.R2) + '} = ' + a(c.D.RB) + '\\,' + sc.u,
          'R_C = \\frac{R_1R_2+R_2R_3+R_3R_1}{R_3} = \\frac{' + n(c.N / sc.f / sc.f) + '}{' + a(st.R3) + '} = ' + a(c.D.RC) + '\\,' + sc.u,
          'Shortcut check (guide section 4): \\(R_A = R_2+R_3+\\dfrac{R_2R_3}{R_1} = ' + a(st.R2) + '+' + a(st.R3) + '+\\dfrac{' + a(st.R2) + '(' + a(st.R3) + ')}{' + a(st.R1) + '} = ' + a(st.R2 + st.R3 + st.R2 * st.R3 / st.R1) + '\\,' + sc.u + '\\)'
        ];
      } else {
        lines = [
          '\\text{Common denominator: } R_A+R_B+R_C = ' + a(st.RA) + '+' + a(st.RB) + '+' + a(st.RC) + ' = ' + a(c.S) + '\\,' + sc.u,
          'R_1 = \\frac{R_BR_C}{R_A+R_B+R_C} = \\frac{' + a(st.RB) + '(' + a(st.RC) + ')}{' + a(c.S) + '} = \\frac{' + n(st.RB * st.RC / sc.f / sc.f) + '}{' + a(c.S) + '} = ' + a(c.Y.R1) + '\\,' + sc.u,
          'R_2 = \\frac{R_CR_A}{R_A+R_B+R_C} = \\frac{' + a(st.RC) + '(' + a(st.RA) + ')}{' + a(c.S) + '} = \\frac{' + n(st.RC * st.RA / sc.f / sc.f) + '}{' + a(c.S) + '} = ' + a(c.Y.R2) + '\\,' + sc.u,
          'R_3 = \\frac{R_AR_B}{R_A+R_B+R_C} = \\frac{' + a(st.RA) + '(' + a(st.RB) + ')}{' + a(c.S) + '} = \\frac{' + n(st.RA * st.RB / sc.f / sc.f) + '}{' + a(c.S) + '} = ' + a(c.Y.R3) + '\\,' + sc.u,
          'Memory rule: same denominator for all three; the numerator is “the other two” Δ resistors (\\(R_1\\) is like \\(R_A\\), so it uses \\(R_BR_C\\)).'
        ];
      }
      convWork.update(lines);
      // equivalence table
      var rows = [
        ['A–B', 'R_2+R_3', [c.Y.R2, c.Y.R3], 'R_A\\parallel(R_B+R_C)', [c.D.RA, c.D.RB, c.D.RC], 'AB', 'C'],
        ['A–C', 'R_1+R_2', [c.Y.R1, c.Y.R2], 'R_C\\parallel(R_A+R_B)', [c.D.RC, c.D.RA, c.D.RB], 'AC', 'B'],
        ['B–C', 'R_1+R_3', [c.Y.R1, c.Y.R3], 'R_B\\parallel(R_A+R_C)', [c.D.RB, c.D.RA, c.D.RC], 'BC', 'A']
      ];
      var tbl = h('table', { class: 'lab-table lab-deltawye-tbl' });
      tbl.appendChild(h('caption', { class: 'lab-deltawye-cap', style: { 'caption-side': 'bottom', 'text-align': 'left' }, text: 'Values in ' + sc.name + '. Both networks must read the same between every pair of nodes; that is what “equivalent” means.' }));
      tbl.appendChild(h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: 'Nodes (open)' }), h('th', { scope: 'col', text: 'Y: two arms in series' }), h('th', { scope: 'col', text: 'Δ: one side ∥ the other two' }), h('th', { scope: 'col', text: 'Same?' })])]));
      var tb = h('tbody');
      rows.forEach(function (rw) {
        var yv = c.pairsY[rw[5]], dv = c.pairsD[rw[5]];
        var same = relDiff(yv, dv) < 1e-9;
        var tdY = h('td'), tdD = h('td');
        kit.tex(tdY, '\\(' + rw[1] + ' = ' + a(rw[2][0]) + '+' + a(rw[2][1]) + ' = ' + a(yv) + '\\)');
        kit.tex(tdD, '\\(' + rw[3] +'\\) <br>\\(= ' + a(rw[4][0]) + '\\parallel(' + a(rw[4][1]) + '+' + a(rw[4][2]) + ') = ' + a(dv) + '\\)');
        tb.appendChild(h('tr', {}, [h('td', { class: 'rh', text: rw[0] + ' (' + rw[6] + ' open)' }), tdY, tdD,
          h('td', {}, [h('span', { class: same ? 'lab-deltawye-ok' : 'lab-deltawye-no', text: same ? '✓ equal' : '✗ differ' })])]));
      });
      tbl.appendChild(tb);
      eqWrap.innerHTML = '';
      eqWrap.appendChild(tbl);
    }

    /* ================================================================ panel 2: bridge */
    var bBody = h('div', { class: 'lab-body' });
    var bCtlCol = h('div', { class: 'lab-controls' });
    var bOut = h('div', { class: 'lab-output' });
    bBody.appendChild(bCtlCol); bBody.appendChild(bOut);
    panels.bridge.appendChild(bBody);

    var convSeg = kit.segmented({ label: 'Convert', value: st.bridge.conv, options: [{ value: 'bottom', label: 'Bottom Δ (lecture)' }, { value: 'top', label: 'Top Δ (check)' }],
      onChange: function (v) { st.bridge.conv = v; renderBridge(); save(); } });
    function bctl(key, label, help, opts) {
      opts = opts || {};
      return kit.control({ label: label, unit: opts.unit || 'Ω', min: opts.min || 0.1, max: opts.max || 1e6, scale: opts.scale || 'log', step: opts.step,
        hardMin: opts.hardMin, hardMax: opts.hardMax, value: st.bridge[key], sig: 4, help: help,
        onInput: function (v) { st.bridge[key] = v; touched(); renderBridge(); save(); } });
    }
    var bc = {
      Vs: bctl('Vs', 'Source \\(V_s\\) (+ at node T)', null, { unit: 'V', min: 1, max: 200, scale: 'lin', step: 1, hardMin: 0.001, hardMax: 1e5 }),
      R4: bctl('R4', '\\(R_4\\): T to A (left 10 Ω in the lecture)'),
      R5: bctl('R5', '\\(R_5\\): T to B (right 10 Ω in the lecture)'),
      RA: bctl('RA', '\\(R_A\\): A to B, the bridge'),
      RB: bctl('RB', '\\(R_B\\): B to C'),
      RC: bctl('RC', '\\(R_C\\): A to C')
    };
    var resetBridge = h('button', { type: 'button', class: 'lab-btn', text: 'Back to the lecture values' });
    resetBridge.addEventListener('click', function () {
      Object.keys(LESSON_BRIDGE).forEach(function (k) { st.bridge[k] = LESSON_BRIDGE[k]; });
      syncBridge(); renderBridge(); save();
    });
    bCtlCol.appendChild(h('div', { class: 'lab-deltawye-row' }, [convSeg.el]));
    bCtlCol.appendChild(h('div', { class: 'lab-group', role: 'group', 'aria-label': 'Source' }, [h('h4', { text: 'Source' }), bc.Vs.el]));
    bCtlCol.appendChild(h('div', { class: 'lab-group', role: 'group', 'aria-label': 'Upper resistors' }, [h('h4', { text: 'Upper resistors' }), bc.R4.el, bc.R5.el]));
    bCtlCol.appendChild(h('div', { class: 'lab-group', role: 'group', 'aria-label': 'Lower delta' }, [h('h4', { text: 'Lower Δ (lecture labels)' }), bc.RA.el, bc.RB.el, bc.RC.el]));
    bCtlCol.appendChild(h('div', { class: 'lab-deltawye-row' }, [resetBridge]));

    var origFig = h('div', { class: 'lab-deltawye-ckt' });
    var origCap = h('figcaption', { class: 'lab-deltawye-cap' });
    var redFig = h('div', { class: 'lab-deltawye-ckt' });
    var redCap = h('figcaption', { class: 'lab-deltawye-cap' });
    var bRo = kit.readout([
      { key: 'Req', label: '\\(R_{eq}\\) seen by the source', unit: 'Ω', emph: true },
      { key: 'IT', label: 'Source current \\(I_T\\)', unit: 'A', emph: true },
      { key: 'VA', label: '\\(V_A\\) (C = 0 V)', unit: 'V' },
      { key: 'VB', label: '\\(V_B\\) (C = 0 V)', unit: 'V' },
      { key: 'IAB', label: 'Bridge current in \\(R_A\\)', unit: 'A' },
      { key: 'dir', label: 'It flows', unit: '' }
    ]);
    var bNote = h('div', { class: 'lab-note' });
    var cmpTitle = h('h4', { class: 'lab-deltawye-sub', text: 'Two methods, one answer' });
    var cmpWrap = h('div', { class: 'lab-table-wrap' });
    var curTitle = h('h4', { class: 'lab-deltawye-sub', text: 'Currents in the original five resistors' });
    var curWrap = h('div', { class: 'lab-table-wrap' });
    var work1 = kit.workings('Method 1: Δ → Y, then series–parallel');
    var work2 = kit.workings('Method 2: nodal analysis of the original circuit');
    work2.el.open = false;
    bOut.appendChild(h('div', { class: 'lab-deltawye-figs' }, [h('figure', {}, [origFig, origCap]), h('figure', {}, [redFig, redCap])]));
    bOut.appendChild(bRo.el);
    bOut.appendChild(bNote);
    bOut.appendChild(cmpTitle);
    bOut.appendChild(cmpWrap);
    bOut.appendChild(work1.el);
    bOut.appendChild(work2.el);
    bOut.appendChild(curTitle);
    bOut.appendChild(curWrap);

    function syncBridge() {
      convSeg.set(st.bridge.conv);
      Object.keys(bc).forEach(function (k) { bc[k].set(st.bridge[k]); });
    }

    function renderBridge() {
      var p = st.bridge;
      var top = p.conv === 'top';
      var m1 = top ? bridgeTop(p) : bridgeDY(p);
      var m2 = bridgeNodal(p);
      var sc = scaleFor([p.R4, p.R5, p.RA, p.RB, p.RC]);
      var a = function (x) { return n(x / sc.f); };       // resistance in scale unit
      var I = function (x) { return n(x * sc.f); };       // current in matching unit (V / scale)
      var V = function (x) { return n(x); };
      var cur = m2.cur;
      var abDir = cur.IAB >= 0 ? 'A → B' : 'B → A';
      var tinyAB = Math.abs(cur.IAB) <= 1e-9 * Math.max(Math.abs(cur.I4), Math.abs(cur.I5), 1e-300);

      /* original circuit diagram */
      var parts = [
        { t: 'BAT', a: [0, 6], b: [0, 2], label: 'V_s', value: fmt(p.Vs, 'V', 4), side: -1, plus: 'b' },
        { t: 'W', pts: [[0, 2], [0, 0], [9, 0]] },
        { t: 'IARR', a: [0.6, 0], b: [2.6, 0], label: 'I_T = ' + fmt(m2.IT, 'A', 4) },
        { t: 'R', a: [4, 0], b: [4, 4], label: 'R_4', value: R(p.R4) },
        { t: 'R', a: [9, 0], b: [9, 4], label: 'R_5', value: R(p.R5) },
        { t: 'R', a: [4, 4], b: [9, 4], label: 'R_A', value: R(p.RA) },
        { t: 'R', a: [4, 4], b: [4, 8], label: 'R_C', value: R(p.RC) },
        { t: 'R', a: [9, 4], b: [9, 8], label: 'R_B', value: R(p.RB) },
        { t: 'W', pts: [[0, 6], [0, 8], [9, 8]] },
        { t: 'BOX', a: top ? [3.3, -1.1] : [3.3, 2.6], b: top ? [11.6, 4.45] : [11.6, 8.7] },
        { t: 'T', at: top ? [10.5, -0.6] : [10.5, 8.45], text: 'Δ to convert', cls: 'muted', size: 12 },
        { t: 'N', at: [4, 0], label: 'T', pos: 'nw' },
        { t: 'N', at: [4, 4], label: 'A', pos: 'w' }, { t: 'N', at: [9, 4], label: 'B', pos: 'e' }, { t: 'N', at: [6.5, 8], label: 'C (0 V)', pos: 's' },
        { t: 'T', at: [1.95, 4.75], text: 'V_A = ' + fmt(m2.VA, 'V', 4), size: 12 },
        { t: 'T', at: [9.3, 4.85], text: 'V_B = ' + fmt(m2.VB, 'V', 4), size: 12, anchor: 'start' }
      ];
      if (!tinyAB) {
        parts.push(cur.IAB >= 0 ? { t: 'ARROW', a: [5.7, 4.75], b: [7.3, 4.75] } : { t: 'ARROW', a: [7.3, 4.75], b: [5.7, 4.75] });
        parts.push({ t: 'T', at: [6.5, 5.5], text: fmt(Math.abs(cur.IAB), 'A', 3), cls: 'accent', size: 12 });
      } else {
        parts.push({ t: 'T', at: [6.5, 5.5], text: 'no current', cls: 'accent', size: 12 });
      }
      var rO = global.EEDiagrams ? global.EEDiagrams.renderCircuit({ parts: parts, pad: 1.1, padX: 2.4,
        alt: 'Original bridge: source ' + fmt(p.Vs, 'V', 4) + ' with + at node T. R_4 = ' + R(p.R4) + ' from T to A, R_5 = ' + R(p.R5) + ' from T to B, bridge R_A = ' + R(p.RA) +
          ' from A to B, R_C = ' + R(p.RC) + ' from A to C, R_B = ' + R(p.RB) + ' from B to C. V_A = ' + fmt(m2.VA, 'V', 4) + ', V_B = ' + fmt(m2.VB, 'V', 4) + ', bridge current ' + fmt(Math.abs(cur.IAB), 'A', 3) + (tinyAB ? '' : ' from ' + abDir) + '.' }) : null;
      origFig.innerHTML = rO ? rO.svg : '(diagram renderer missing)';
      kit.tex(origCap, 'Original circuit with the node voltages from the solution. The arrow under \\(R_A\\) shows which way the bridge current actually flows. The dashed box is the Δ being converted.');

      /* reduced circuit diagram */
      var rp;
      if (!top) {
        rp = [
          { t: 'BAT', a: [0, 6], b: [0, 2], label: 'V_s', value: fmt(p.Vs, 'V', 4), side: -1, plus: 'b' },
          { t: 'W', pts: [[0, 2], [0, 0], [9, 0]] },
          { t: 'IARR', a: [0.6, 0], b: [2.6, 0], label: 'I_T = ' + fmt(m1.IT, 'A', 4) },
          { t: 'R', a: [4, 0], b: [4, 3], label: 'R_4', value: R(p.R4) },
          { t: 'R', a: [9, 0], b: [9, 3], label: 'R_5', value: R(p.R5), side: -1 },
          { t: 'R', a: [4, 3], b: [6.5, 5.2], label: 'R_2', value: R(m1.Y.R2), lpos: [-1.55, 0.55] },
          { t: 'R', a: [9, 3], b: [6.5, 5.2], label: 'R_3', value: R(m1.Y.R3), lpos: [1.55, 0.55] },
          { t: 'R', a: [6.5, 5.2], b: [6.5, 8], label: 'R_1', value: R(m1.Y.R1) },
          { t: 'W', pts: [[6.5, 8], [0, 8], [0, 6]] },
          { t: 'N', at: [4, 0], label: 'T', pos: 'nw' },
          { t: 'N', at: [4, 3], label: 'A', pos: 'w' }, { t: 'N', at: [9, 3], label: 'B', pos: 'e' },
          { t: 'N', at: [6.5, 5.2], label: 'N', pos: 'n' }, { t: 'N', at: [6.5, 8], label: 'C', pos: 's' }
        ];
      } else {
        rp = [
          { t: 'BAT', a: [0, 6], b: [0, 2], label: 'V_s', value: fmt(p.Vs, 'V', 4), side: -1, plus: 'b' },
          { t: 'W', pts: [[0, 2], [0, 0], [6.5, 0]] },
          { t: 'IARR', a: [0.6, 0], b: [2.6, 0], label: 'I_T = ' + fmt(m1.IT, 'A', 4) },
          { t: 'R', a: [6.5, 0], b: [6.5, 2.6], label: 'R_{NT}', value: R(m1.Yt.NT) },
          { t: 'R', a: [6.5, 2.6], b: [4, 4.8], label: 'R_{NA}', value: R(m1.Yt.NA), lpos: [-1.6, -0.45] },
          { t: 'R', a: [6.5, 2.6], b: [9, 4.8], label: 'R_{NB}', value: R(m1.Yt.NB), lpos: [1.6, -0.45] },
          { t: 'R', a: [4, 4.8], b: [4, 8], label: 'R_C', value: R(p.RC) },
          { t: 'R', a: [9, 4.8], b: [9, 8], label: 'R_B', value: R(p.RB) },
          { t: 'W', pts: [[9, 8], [0, 8], [0, 6]] },
          { t: 'N', at: [6.5, 0], label: 'T', pos: 'n' }, { t: 'N', at: [6.5, 2.6], label: 'N', pos: 'e' },
          { t: 'N', at: [4, 4.8], label: 'A', pos: 'w' }, { t: 'N', at: [9, 4.8], label: 'B', pos: 'e' },
          { t: 'N', at: [4, 8] }, { t: 'N', at: [6.5, 8], label: 'C', pos: 's' }
        ];
      }
      var rR = global.EEDiagrams ? global.EEDiagrams.renderCircuit({ parts: rp, pad: 1.1, padX: 2.4,
        alt: top ? ('After replacing the top delta with a wye of centre N: R_NT = ' + R(m1.Yt.NT) + ' from T to N, R_NA = ' + R(m1.Yt.NA) + ' from N to A, R_NB = ' + R(m1.Yt.NB) + ' from N to B, then R_C to C and R_B to C.')
          : ('After replacing the bottom delta with a wye of centre N: R_4 from T to A then R_2 = ' + R(m1.Y.R2) + ' to N; R_5 from T to B then R_3 = ' + R(m1.Y.R3) + ' to N; R_1 = ' + R(m1.Y.R1) + ' from N to C.') }) : null;
      redFig.innerHTML = rR ? rR.svg : '(diagram renderer missing)';
      kit.tex(redCap, top ? 'After the top Δ (\\(R_4, R_5, R_A\\)) is replaced by a Y. Each new arm is named by the node it reaches. Now \\(R_{NA}+R_C\\) and \\(R_{NB}+R_B\\) are in parallel, in series with \\(R_{NT}\\).'
        : 'After the bottom Δ is replaced by the Y (as in the lecture). Now \\(R_4+R_2\\) and \\(R_5+R_3\\) are in parallel, in series with \\(R_1\\).');

      /* readouts (nodal = reference; method 1 agrees, see table) */
      bRo.update({ Req: R(m2.Req), IT: m2.IT, VA: m2.VA, VB: m2.VB, IAB: tinyAB ? '0 A' : fmt(Math.abs(cur.IAB), 'A', 4), dir: tinyAB ? 'no current' : 'from ' + abDir });

      /* notes */
      var lesson = Object.keys(LESSON_BRIDGE).every(function (k) { return relDiff(p[k], LESSON_BRIDGE[k]) < 1e-9; });
      var notes = [];
      if (lesson && !top) {
        var Yr = { R1: round(m1.Y.R1, 2), R2: round(m1.Y.R2, 2), R3: round(m1.Y.R3, 2) };
        var rr = bridgeFromY(p.Vs, p.R4, p.R5, Yr);
        notes.push('<strong>These are the lecture values.</strong> The guide’s Example 3 rounds the Y to ' + kit.sigStr(Yr.R1, 3) + ', ' + kit.sigStr(Yr.R2, 3) + ', ' + kit.sigStr(Yr.R3, 3) +
          ' Ω first and gets \\(R_{eq} = ' + n(round(rr.Req, 3)) + '\\,\\Omega\\), \\(I_T = ' + n(round(rr.IT, 2)) + '\\,\\text{A}\\). This lab carries full precision: \\(R_{eq} = ' + n(m1.Req) + '\\,\\Omega\\), \\(I_T = ' + n(m1.IT) + '\\,\\text{A}\\).');
      } else if (lesson && top) {
        notes.push('<strong>The guide’s added check.</strong> Converting the top Δ instead gives arms of ' + R(m1.Yt.NT) + ' (to T) and ' + R(m1.Yt.NA) + ' (to A and to B), and the same \\(R_{eq} = ' + n(m1.Req) + '\\,\\Omega\\) as the lecture’s bottom-Δ route.');
      }
      if (bridgeBalanced(p)) notes.push('<strong>Balanced bridge</strong> (\\(R_4/R_C = R_5/R_B\\)): \\(V_A = V_B\\), so no current flows in the bridge \\(R_A\\). (Added teaching, not from the video.)');
      else notes.push('The bridge current depends on \\(V_A - V_B\\), which you only know after solving: that is why series–parallel rules alone cannot start this circuit (lecture, section 1). It would be zero only for a balanced bridge, \\(R_4/R_C = R_5/R_B\\) (added teaching).');
      kit.tex(bNote, notes.join('<br>'));

      /* comparison table */
      var rows = [
        ['\\(R_{eq}\\)', m1.Req, m2.Req, 'Ω'], ['\\(I_T\\)', m1.IT, m2.IT, 'A'], ['\\(V_A\\)', m1.VA, m2.VA, 'V'], ['\\(V_B\\)', m1.VB, m2.VB, 'V'],
        ['\\(I_{AB}\\) (A → B, signed)', m1.cur.IAB, m2.cur.IAB, 'A']
      ];
      var t = h('table', { class: 'lab-table lab-deltawye-tbl' });
      t.appendChild(h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: 'Quantity' }), h('th', { scope: 'col', text: top ? 'Top Δ → Y' : 'Bottom Δ → Y' }), h('th', { scope: 'col', text: 'Nodal analysis' }), h('th', { scope: 'col', text: 'Agree?' })])]));
      var tb = h('tbody');
      rows.forEach(function (r) {
        var scale = Math.max(Math.abs(r[1]), Math.abs(r[2]), r[3] === 'A' ? Math.abs(m2.IT) * 1e-6 : 0, 1e-300);
        var agree = Math.abs(r[1] - r[2]) <= 1e-9 * scale;
        var th = h('td', { class: 'rh' }); kit.tex(th, r[0]);
        var f5 = function (x) { return r[3] === 'Ω' ? R(x, 5) : fmt(x, r[3], 5); };
        tb.appendChild(h('tr', {}, [th, h('td', { text: f5(r[1]) }), h('td', { text: f5(r[2]) }),
          h('td', {}, [h('span', { class: agree ? 'lab-deltawye-ok' : 'lab-deltawye-no', text: agree ? '✓ same' : '✗ differ' })])]));
      });
      t.appendChild(tb);
      cmpWrap.innerHTML = ''; cmpWrap.appendChild(t);

      /* currents table (original circuit) */
      var ct = h('table', { class: 'lab-table lab-deltawye-tbl' });
      ct.appendChild(h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: 'Resistor' }), h('th', { scope: 'col', text: 'Nodes' }), h('th', { scope: 'col', text: 'Current' }), h('th', { scope: 'col', text: 'Flows' }), h('th', { scope: 'col', text: 'Voltage' })])]));
      var ctb = h('tbody');
      [['R_4', 'T–A', cur.I4, 'T → A', 'A → T', p.R4], ['R_5', 'T–B', cur.I5, 'T → B', 'B → T', p.R5], ['R_A', 'A–B', cur.IAB, 'A → B', 'B → A', p.RA],
        ['R_C', 'A–C', cur.IAC, 'A → C', 'C → A', p.RC], ['R_B', 'B–C', cur.IBC, 'B → C', 'C → B', p.RB]].forEach(function (r) {
        var th = h('td', { class: 'rh' }); kit.tex(th, '\\(' + r[0] + '\\) = ' + R(r[5]));
        var zero = Math.abs(r[2]) <= 1e-9 * Math.max(Math.abs(m2.IT), 1e-300);
        ctb.appendChild(h('tr', {}, [th, h('td', { text: r[1] }), h('td', { text: zero ? '0 A' : fmt(Math.abs(r[2]), 'A', 4) }), h('td', { text: zero ? '—' : (r[2] > 0 ? r[3] : r[4]) }), h('td', { text: fmt(Math.abs(r[2] * r[5]), 'V', 4) })]));
      });
      ct.appendChild(ctb);
      ct.appendChild(h('caption', { class: 'lab-deltawye-cap', style: { 'caption-side': 'bottom', 'text-align': 'left' } }));
      kit.tex(ct.lastChild, kclCaption(cur, m2.IT));
      curWrap.innerHTML = ''; curWrap.appendChild(ct);

      /* workings: method 1 */
      var w1;
      if (!top) {
        w1 = [
          '1.\\ \\text{Bottom } \\Delta \\to Y:\\ R_A+R_B+R_C = ' + a(p.RA) + '+' + a(p.RB) + '+' + a(p.RC) + ' = ' + a(m1.Y.S) + '\\,' + sc.u,
          'R_1 = \\frac{R_BR_C}{R_A+R_B+R_C} = \\frac{' + a(p.RB) + '(' + a(p.RC) + ')}{' + a(m1.Y.S) + '} = ' + a(m1.Y.R1) + ',\\quad R_2 = \\frac{R_CR_A}{' + a(m1.Y.S) + '} = ' + a(m1.Y.R2) + ',\\quad R_3 = \\frac{R_AR_B}{' + a(m1.Y.S) + '} = ' + a(m1.Y.R3) + '\\ (' + sc.u + ')',
          '2.\\ R_L = R_4 + R_2 = ' + a(p.R4) + '+' + a(m1.Y.R2) + ' = ' + a(m1.RLb) + ',\\quad R_R = R_5 + R_3 = ' + a(p.R5) + '+' + a(m1.Y.R3) + ' = ' + a(m1.RRb) + '\\ (' + sc.u + ')',
          '3.\\ R_L\\parallel R_R = \\frac{' + a(m1.RLb) + '(' + a(m1.RRb) + ')}{' + a(m1.RLb) + '+' + a(m1.RRb) + '} = ' + a(m1.Rp) + '\\,' + sc.u,
          '4.\\ R_{eq} = R_L\\parallel R_R + R_1 = ' + a(m1.Rp) + '+' + a(m1.Y.R1) + ' = ' + a(m1.Req) + '\\,' + sc.u,
          '5.\\ I_T = \\frac{V_s}{R_{eq}} = \\frac{' + V(p.Vs) + '\\,\\text{V}}{' + a(m1.Req) + '\\,' + sc.u + '} = ' + I(m1.IT) + '\\,' + sc.i,
          '6.\\ V_{R_1} = I_TR_1 = ' + V(m1.VR1) + '\\,\\text{V},\\quad V_s - V_{R_1} = ' + V(p.Vs) + '-' + V(m1.VR1) + ' = ' + V(m1.Vbr) + '\\,\\text{V}\\ \\text{(KVL)}',
          '7.\\ I_L = \\frac{' + V(m1.Vbr) + '}{' + a(m1.RLb) + '} = ' + I(m1.IL) + ',\\quad I_R = \\frac{' + V(m1.Vbr) + '}{' + a(m1.RRb) + '} = ' + I(m1.IR) + '\\ (' + sc.i + ')',
          '8.\\ \\text{Back to the original: } V_A = V_s - R_4I_L = ' + V(m1.VA) + '\\,\\text{V},\\ V_B = V_s - R_5I_R = ' + V(m1.VB) + '\\,\\text{V}',
          'I_{AB} = \\frac{V_A - V_B}{R_A} = \\frac{' + V(m1.VA) + '-' + V(m1.VB) + '}{' + a(p.RA) + '} = ' + I(m1.cur.IAB) + '\\,' + sc.i
        ];
      } else {
        w1 = [
          '1.\\ \\text{Top } \\Delta \\to Y:\\ R_4+R_5+R_A = ' + a(p.R4) + '+' + a(p.R5) + '+' + a(p.RA) + ' = ' + a(m1.Yt.S) + '\\,' + sc.u,
          'R_{NT} = \\frac{R_4R_5}{' + a(m1.Yt.S) + '} = \\frac{' + a(p.R4) + '(' + a(p.R5) + ')}{' + a(m1.Yt.S) + '} = ' + a(m1.Yt.NT) + '\\,' + sc.u,
          'R_{NA} = \\frac{R_4R_A}{' + a(m1.Yt.S) + '} = \\frac{' + a(p.R4) + '(' + a(p.RA) + ')}{' + a(m1.Yt.S) + '} = ' + a(m1.Yt.NA) + ',\\quad R_{NB} = \\frac{R_5R_A}{' + a(m1.Yt.S) + '} = \\frac{' + a(p.R5) + '(' + a(p.RA) + ')}{' + a(m1.Yt.S) + '} = ' + a(m1.Yt.NB) + '\\ (' + sc.u + ')',
          'Each arm uses the two Δ resistors that touch its node (the same rule as \\(R_1 = R_BR_C/\\Sigma\\)).',
          '2.\\ (R_{NA}+R_C)\\parallel(R_{NB}+R_B) = ' + a(m1.left) + '\\parallel' + a(m1.right) + ' = ' + a(m1.Rp) + '\\,' + sc.u,
          '3.\\ R_{eq} = R_{NT} + ' + a(m1.Rp) + ' = ' + a(m1.Yt.NT) + '+' + a(m1.Rp) + ' = ' + a(m1.Req) + '\\,' + sc.u,
          '4.\\ I_T = \\frac{' + V(p.Vs) + '\\,\\text{V}}{' + a(m1.Req) + '\\,' + sc.u + '} = ' + I(m1.IT) + '\\,' + sc.i + ',\\quad V_N = V_s - I_TR_{NT} = ' + V(m1.VN) + '\\,\\text{V}',
          '5.\\ V_A = R_C\\frac{V_N}{R_{NA}+R_C} = ' + V(m1.VA) + '\\,\\text{V},\\quad V_B = R_B\\frac{V_N}{R_{NB}+R_B} = ' + V(m1.VB) + '\\,\\text{V}',
          'I_{AB} = \\frac{V_A - V_B}{R_A} = ' + I(m1.cur.IAB) + '\\,' + sc.i
        ];
      }
      work1.update(w1);

      /* workings: method 2 (nodal) */
      var g = function (x) { return n(x * sc.f); };   // conductance in S / mS / µS
      work2.update([
        'Reference: node C = 0 V, so node T = \\(V_s\\) = ' + V(p.Vs) + ' V. Unknowns \\(V_A\\), \\(V_B\\). KCL (currents leaving the node sum to zero):',
        '\\text{A: } \\frac{V_A - ' + V(p.Vs) + '}{' + a(p.R4) + '} + \\frac{V_A - V_B}{' + a(p.RA) + '} + \\frac{V_A}{' + a(p.RC) + '} = 0',
        '\\text{B: } \\frac{V_B - ' + V(p.Vs) + '}{' + a(p.R5) + '} + \\frac{V_B - V_A}{' + a(p.RA) + '} + \\frac{V_B}{' + a(p.RB) + '} = 0',
        '\\begin{bmatrix} ' + g(m2.g11) + ' & -' + g(m2.g12) + ' \\\\ -' + g(m2.g12) + ' & ' + g(m2.g22) + ' \\end{bmatrix}\\begin{bmatrix} V_A \\\\ V_B \\end{bmatrix} = \\begin{bmatrix} ' + I(m2.b1) + ' \\\\ ' + I(m2.b2) + ' \\end{bmatrix}\\quad (' + sc.g + ',\\ ' + sc.i + ')',
        'V_A = ' + V(m2.VA) + '\\,\\text{V},\\quad V_B = ' + V(m2.VB) + '\\,\\text{V}\\quad\\text{(Cramer: } \\det = ' + n(m2.det * sc.f * sc.f) + ')',
        'I_T = \\frac{V_s - V_A}{R_4} + \\frac{V_s - V_B}{R_5} = ' + I(cur.I4) + ' + ' + I(cur.I5) + ' = ' + I(m2.IT) + '\\,' + sc.i,
        'R_{eq} = \\frac{V_s}{I_T} = \\frac{' + V(p.Vs) + '}{' + I(m2.IT) + '} = ' + a(m2.Req) + '\\,' + sc.u
      ]);
    }

    function renderPanel() { if (st.panel === 'bridge') renderBridge(); else renderConv(); }
    function applyAll() {
      syncControls(); syncBridge();
      showPanel(st.panel);
      modeNote.textContent = '';
      renderConv(); renderBridge();
    }
    function touched() { frame.markPreset(null); }

    el.appendChild(root);
    applyAll();
    if (ctx.presetId) frame.markPreset(ctx.presetId);
    ctx.presetId = null;

    return {
      destroy: function () {
        dead = true;
        cleanups.forEach(function (f) { try { f(); } catch (e) {} });
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      setState: function (v) { if (dead) return; st = sanitize(v); applyAll(); }
    };
  }

  global.EELabs.register(def);
})(typeof window !== 'undefined' ? window : this);
