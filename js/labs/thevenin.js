/* EE 211 — Thévenin / Norton equivalent + load (maximum power transfer) lab.
 * Registers lab id "thevenin" (topic thevenin). All maths is in def.model (pure, DOM-free; tested by
 * build/tests/test_lab_thevenin.py). Sources of every preset: work/redesign/labs/thevenin.md.
 *
 * State (the lab's own value shape, also used by presets):
 *   { tpl: 'divider'|'ladder'|'pairT'|'serpar'|'isrc', V, I, idir: 'up'|'down',
 *     R: {leafKey: ohms}, on: {leafKey: bool}, names: {leafKey: 'R_1', ...}, src: 'V_s', sym: 'BAT'|'V',
 *     ta: 'a', tb: 'b', lsym: 'L'|'RL', RL, view: 'oc'|'off'|'sc'|'load', pid: presetId|null, edited: bool }
 */
(function (global) {
  'use strict';
  var INF = Infinity;
  function K() { return global.EELabs.kit; }

  /* ================================================================== maths (pure) */
  /* Series / parallel of resistances. 0 = wire, Infinity = open. */
  function ser(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) { if (arr[i] === INF) return INF; s += arr[i]; }
    return s;
  }
  function par(arr) {
    var g = 0, any = false;
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (v === 0) return 0;
      if (v === INF) continue;
      g += 1 / v; any = true;
    }
    return any ? 1 / g : INF;
  }

  /* Ladder engine (voltage source V, + at the top rail).
   * slots: s1 (top rail, first), s2 (bottom rail, first), p1 (first shunt), s3 (top rail, toward a),
   *        s4 (bottom rail, toward b), p2 (shunt across a–b). 0 = wire, INF = open.
   * Node voltages are measured from the source's − terminal (0 V), as in the lessons. */
  function ladder(V, s) {
    var Zb = ser([s.s3, s.p2, s.s4]);
    var Zm = par([s.p1, Zb]);
    var RT = ser([s.s1, s.s2, Zm]);
    var r = { RT: RT, Zm: Zm, Zb: Zb, shorted: false };
    var IT;
    if (RT === INF) IT = 0;
    else if (RT === 0) { r.shorted = true; r.IT = INF; r.Vab = NaN; return r; }
    else IT = V / RT;
    var t1 = V - IT * s.s1, b1 = IT * s.s2;
    var Vm = t1 - b1;
    var Ip1 = s.p1 === INF ? 0 : Vm / s.p1;
    var Ib = Zb === INF ? 0 : IT - Ip1;
    if (Zb !== INF && s.p1 !== INF && Zb > 0) Ib = Vm / Zb; // same value, better conditioned
    var t2 = t1 - Ib * s.s3, b2 = b1 + Ib * s.s4;
    var Ip2 = s.p2 === INF ? 0 : (s.p2 === 0 ? Ib : (t2 - b2) / s.p2);
    r.IT = IT; r.Vm = Vm; r.Ip1 = Ip1; r.Ib = Ib; r.Ip2 = Ip2;
    r.nodes = { t0: V, t1: t1, b1: b1, t2: t2, b2: b2, b0: 0 };
    r.Vab = t2 - b2;
    r.Psrc = V * IT;
    return r;
  }
  function ladderRth(s) {
    return par([s.p2, ser([s.s3, s.s4, par([s.p1, ser([s.s1, s.s2])])])]);
  }

  /* Network with a current source: V_s –R1– node x; R2 x→b; I_s into x (sign +) ; R3 x→a; R4 a→b.
   * R1 finite > 0; R2 INF if absent; R3 0 if absent; R4 INF if absent (0 = shorted a–b). */
  function isrc(V, I, R) {
    var Zb = ser([R.R3, R.R4]);
    var Vx, Ib;
    if (Zb === 0) { Vx = 0; Ib = V / R.R1 + I; }
    else {
      var G = 1 / R.R1 + (R.R2 === INF ? 0 : 1 / R.R2) + (Zb === INF ? 0 : 1 / Zb);
      Vx = (V / R.R1 + I) / G;
      Ib = Zb === INF ? 0 : Vx / Zb;
    }
    var Va = Vx - Ib * R.R3;
    var I1 = (V - Vx) / R.R1;
    var I2 = R.R2 === INF ? 0 : Vx / R.R2;
    var I4 = R.R4 === INF ? 0 : (R.R4 === 0 ? Ib : Va / R.R4);
    return {
      shorted: false, Vx: Vx, Va: Va, Vab: Va, Ib: Ib, I1: I1, I2: I2, I4: I4,
      nodes: { t0: V, x: Vx, a: Va, b0: 0 },
      Pv: V * I1, Pi: I * Vx, Psrc: V * I1 + I * Vx
    };
  }
  function isrcRth(R) { return par([R.R4, ser([R.R3, par([R.R1, R.R2])])]); }

  /* Load on a Thévenin equivalent. */
  function loadCalc(Vth, Rth, RL) {
    var IL = Vth / (Rth + RL), VL = IL * RL;
    var PL = IL * IL * RL, Pint = IL * IL * Rth;
    return { IL: IL, VL: VL, PL: PL, Pint: Pint, Ptot: PL + Pint, eta: RL / (Rth + RL) };
  }
  function pmax(Vth, Rth) { return Rth > 0 ? Vth * Vth / (4 * Rth) : INF; }
  function loadPower(Vth, Rth, RL) { var I = Vth / (Rth + RL); return I * I * RL; }

  /* ------------------------------------------------------------------ templates */
  /* Expression trees: a leaf key (string) or {op:'ser'|'par', a:[...]} ; leaf "off" → 0 (wire) or INF (open). */
  function S() { return { op: 'ser', a: Array.prototype.slice.call(arguments) }; }
  function Pp() { return { op: 'par', a: Array.prototype.slice.call(arguments) }; }

  var TPL = {
    divider: {
      label: 'Voltage divider', kind: 'ladder', sym: 'BAT',
      desc: 'A source, a series resistor \\(R_1\\), a shunt \\(R_2\\) and an optional series resistor \\(R_3\\) to terminal a. With only \\(R_1\\) left in, it is the tn4 "real source" (\\(V\\) with \\(r_{int}\\)).',
      leaves: [
        { k: 'R1', name: 'R_1', off: 'wire', where: 'series, top rail' },
        { k: 'R2', name: 'R_2', off: 'open', where: 'shunt, top rail to bottom rail' },
        { k: 'R3', name: 'R_3', off: 'wire', where: 'series, toward terminal a' }
      ],
      pos: { s1: 'R1', p1: 'R2', s3: 'R3' }
    },
    ladder: {
      label: 'Ladder (tn1, tn2, Lab 5)', kind: 'ladder', sym: 'BAT',
      desc: 'Two series sections (top and bottom rail) and two shunts. Switch resistors out to get each ladder from the lessons. The shunt across a–b sits directly across the terminals.',
      leaves: [
        { k: 's1', name: 'R_1', off: 'wire', where: 'top rail, next to the source' },
        { k: 's2', name: 'R_2', off: 'wire', where: 'bottom rail, next to the source' },
        { k: 'p1', name: 'R_3', off: 'open', where: 'first shunt (rail to rail)' },
        { k: 's3', name: 'R_5', off: 'wire', where: 'top rail, toward terminal a' },
        { k: 's4', name: 'R_6', off: 'wire', where: 'bottom rail, toward terminal b' },
        { k: 'p2', name: 'R_4', off: 'open', where: 'shunt directly across a–b' }
      ],
      pos: { s1: 's1', s2: 's2', p1: 'p1', s3: 's3', s4: 's4', p2: 'p2' }
    },
    pairT: {
      label: 'Parallel pair + T (tn3 Ex. 1)', kind: 'ladder', sym: 'V',
      desc: 'The source feeds \\(R_1 \\parallel R_2\\) to junction x; \\(R_3\\) goes from x to the bottom rail and \\(R_4\\) from x to terminal A.',
      leaves: [
        { k: 'R1', name: 'R_1', off: null, where: 'top branch of the pair' },
        { k: 'R2', name: 'R_2', off: 'open', where: 'middle branch of the pair' },
        { k: 'R3', name: 'R_3', off: 'open', where: 'shunt, x to the bottom rail' },
        { k: 'R4', name: 'R_4', off: 'wire', where: 'series, x to terminal A' }
      ],
      pos: { s1: Pp('R1', 'R2'), p1: 'R3', s3: 'R4' }
    },
    serpar: {
      label: 'Series pair + shunt at A–B (tn3 Ex. 2)', kind: 'ladder', sym: 'V',
      desc: 'The source feeds \\(R_1\\) and then \\(R_2 \\parallel R_3\\) down to terminal A; \\(R_4\\) sits directly across A–B.',
      leaves: [
        { k: 'R1', name: 'R_1', off: 'wire', where: 'series, next to the source' },
        { k: 'R2', name: 'R_2', off: null, where: 'left resistor of the pair' },
        { k: 'R3', name: 'R_3', off: 'open', where: 'right resistor of the pair' },
        { k: 'R4', name: 'R_4', off: 'open', where: 'directly across A–B' }
      ],
      pos: { s1: S('R1', Pp('R2', 'R3')), p2: 'R4' }
    },
    isrc: {
      label: 'With a current source (try it)', kind: 'isrc', sym: 'V',
      desc: 'Not from the videos: the same layout as practice question 3. \\(V_s\\) feeds \\(R_1\\) to node x, \\(R_2\\) goes from x to the bottom rail, the current source \\(I_s\\) pushes current into (or out of) x, \\(R_3\\) leads to a and \\(R_4\\) sits across a–b.',
      leaves: [
        { k: 'R1', name: 'R_1', off: null, where: 'series, source to node x' },
        { k: 'R2', name: 'R_2', off: 'open', where: 'shunt, x to the bottom rail' },
        { k: 'R3', name: 'R_3', off: 'wire', where: 'series, x to terminal a' },
        { k: 'R4', name: 'R_4', off: 'open', where: 'directly across a–b' }
      ]
    }
  };
  var TPL_ORDER = ['divider', 'ladder', 'pairT', 'serpar', 'isrc'];

  function leafVal(st, k, tpl) {
    var T = TPL[tpl || st.tpl];
    var lf = null;
    T.leaves.forEach(function (l) { if (l.k === k) lf = l; });
    if (!lf) return null;
    var on = !lf.off || !st.on || st.on[k] !== false;
    if (!on) return lf.off === 'wire' ? 0 : INF;
    return +st.R[k];
  }
  function leafVals(st) {
    var o = {};
    TPL[st.tpl].leaves.forEach(function (l) { o[l.k] = leafVal(st, l.k); });
    return o;
  }
  function evalE(e, vals) {
    if (e == null) return null;
    if (typeof e === 'string') return vals[e];
    if (e.c != null) return e.c;
    var xs = e.a.map(function (x) { return evalE(x, vals); });
    return e.op === 'ser' ? ser(xs) : par(xs);
  }
  /* numeric slot values for the ladder engine (missing slots: series → wire, shunt → open) */
  function slotVals(st, vals) {
    var T = TPL[st.tpl], o = {};
    ['s1', 's2', 's3', 's4'].forEach(function (k) { o[k] = T.pos[k] != null ? evalE(T.pos[k], vals) : 0; });
    ['p1', 'p2'].forEach(function (k) { o[k] = T.pos[k] != null ? evalE(T.pos[k], vals) : INF; });
    return o;
  }

  /* Full analysis of a state. Pure. */
  function analyze(st) {
    var T = TPL[st.tpl];
    var vals = leafVals(st);
    var V = +st.V, RL = +st.RL;
    var out = { tpl: st.tpl, vals: vals, V: V, RL: RL };
    var oc, sc, ld, Rth;
    if (T.kind === 'ladder') {
      var s = slotVals(st, vals);
      out.slots = s;
      oc = ladder(V, s);
      sc = ladder(V, extend(s, { p2: 0 }));
      ld = ladder(V, extend(s, { p2: par([s.p2, RL]) }));
      Rth = ladderRth(s);
    } else {
      var I = (st.idir === 'down' ? -1 : 1) * (+st.I);
      out.Is = I;
      oc = isrc(V, I, vals);
      sc = isrc(V, I, extend(vals, { R4: 0 }));
      ld = isrc(V, I, extend(vals, { R4: par([vals.R4, RL]) }));
      Rth = isrcRth(vals);
    }
    out.oc = oc; out.sc = sc; out.ld = ld;
    out.Vth = oc.Vab;
    out.Rth = Rth;
    out.In = sc.shorted ? INF : (T.kind === 'ladder' ? sc.Ib : sc.Ib);
    out.InRatio = Rth > 0 ? out.Vth / Rth : (out.Vth === 0 ? 0 : INF);
    out.norton = Rth > 0 && isFinite(Rth);
    out.consistent = out.norton ? Math.abs(out.In - out.InRatio) <= 1e-9 * Math.max(1, Math.abs(out.In)) : true;
    out.load = loadCalc(out.Vth, Rth, RL);
    out.Pmax = pmax(out.Vth, Rth);
    out.net = { VL: ld.Vab, IL: ld.Vab / RL, Psrc: ld.Psrc };
    out.net.PL = out.net.VL * out.net.IL;
    out.net.eta = ld.Psrc > 0 ? out.net.PL / ld.Psrc : NaN;
    return out;
  }
  function extend(a, b) { var o = {}; Object.keys(a).forEach(function (k) { o[k] = a[k]; }); Object.keys(b).forEach(function (k) { o[k] = b[k]; }); return o; }

  /* Validate a state: returns list of problems (empty = fine). */
  function validate(st) {
    var errs = [];
    if (!TPL[st.tpl]) { errs.push('Unknown network.'); return errs; }
    if (!isFinite(st.V) || st.V < 0) errs.push('Source voltage must be 0 or more.');
    if (TPL[st.tpl].kind === 'isrc' && (!isFinite(st.I) || st.I < 0)) errs.push('Source current must be 0 or more (use the direction switch for its sign).');
    TPL[st.tpl].leaves.forEach(function (l) { var v = st.R[l.k]; if (!(v > 0) || !isFinite(v)) errs.push(l.name + ' must be a positive resistance.'); });
    if (!(st.RL > 0) || !isFinite(st.RL)) errs.push('R_L must be a positive resistance.');
    return errs;
  }

  /* ------------------------------------------------------------------ TeX helpers (pure) */
  var PRE_TEX = { k: '\\text{k}', M: '\\text{M}', m: '\\text{m}', 'µ': '\\mu', n: '\\text{n}', G: '\\text{G}', p: '\\text{p}' };
  function tq(v, unit, sig) {
    if (v == null || isNaN(v)) return '\\text{—}';
    if (!isFinite(v)) return (v < 0 ? '-' : '') + '\\infty';
    if (unit === '%') return K().num(v, sig || 3) + '\\,\\%';
    var s = K().fmt(v, unit, sig || 4);
    var i = s.lastIndexOf(' ');
    var m = s.slice(0, i).replace('−', '-'), pu = s.slice(i + 1);
    var pre = pu.slice(0, pu.length - unit.length);
    var u = unit === 'Ω' ? '\\Omega' : '\\text{' + unit + '}';
    return m + '\\,' + (pre ? (PRE_TEX[pre] || pre) : '') + u;
  }
  function n4(v) { return isFinite(v) ? K().num(v, 4) : (v > 0 ? '\\infty' : '-\\infty'); }
  function paren(s) { return '\\left(' + s + '\\right)'; }

  /* simplify an expression with the current on/off states */
  function simp(e, vals) {
    if (e == null) return { t: 'none' };
    if (typeof e === 'string') { var v = vals[e]; return v === 0 ? { t: 'wire' } : (v === INF ? { t: 'open' } : { t: 'leaf', k: e }); }
    if (e.t) return e;
    var kids = [], i, c;
    for (i = 0; i < e.a.length; i++) {
      c = simp(e.a[i], vals);
      if (c.t === 'none') continue;
      if (e.op === 'ser') {
        if (c.t === 'open') return { t: 'open' };
        if (c.t === 'wire') continue;
      } else {
        if (c.t === 'wire') return { t: 'wire' };
        if (c.t === 'open') continue;
      }
      if (c.t === e.op) kids = kids.concat(c.a); else kids.push(c);
    }
    if (!kids.length) return { t: e.op === 'ser' ? 'wire' : 'open' };
    if (kids.length === 1) return kids[0];
    return { t: e.op, a: kids };
  }
  function evalS(n, vals) {
    if (n.t === 'leaf') return vals[n.k];
    if (n.t === 'wire') return 0;
    if (n.t === 'open') return INF;
    var xs = n.a.map(function (c) { return evalS(c, vals); });
    return n.t === 'ser' ? ser(xs) : par(xs);
  }
  function texS(n, leafTex, inner) {
    if (n.t === 'leaf') return leafTex(n);
    if (n.t === 'wire') return '0';
    if (n.t === 'open') return '\\infty';
    if (n.t === 'num') return n.s;
    var parts = n.a.map(function (c) { return texS(c, leafTex, n.t); });
    var s = parts.join(n.t === 'ser' ? ' + ' : ' \\parallel ');
    return inner && inner !== n.t ? paren(s) : s;
  }
  function leafMax(n, vals) {
    if (n.t === 'leaf') return vals[n.k];
    if (!n.a) return 0;
    return Math.max.apply(null, n.a.map(function (c) { return leafMax(c, vals); }));
  }
  /* "LHS = symbolic = substituted [= partly evaluated] = result" for a resistance expression */
  function eqR(lhs, e, vals, names) {
    var n = e && e.t ? e : simp(e, vals);
    if (n.t === 'wire') return lhs + ' = 0\\,\\Omega';
    if (n.t === 'open') return lhs + ' = \\infty \\;(\\text{open})';
    var val = evalS(n, vals);
    if (n.t === 'leaf') return lhs + ' = ' + names(n.k) + ' = ' + tq(val, 'Ω');
    var mx = leafMax(n, vals), sc = mx >= 1e6 ? 1e6 : (mx >= 1e3 ? 1e3 : 1);
    var su = sc === 1e6 ? '\\text{M}\\Omega' : (sc === 1e3 ? '\\text{k}\\Omega' : '\\Omega');
    var sym = texS(n, function (l) { return names(l.k); });
    var num = texS(n, function (l) { return n4(vals[l.k] / sc); });
    var mid = null;
    if (n.a.some(function (c) { return c.t !== 'leaf'; })) {
      mid = texS({ t: n.t, a: n.a.map(function (c) { return c.t === 'leaf' ? c : { t: 'num', s: n4(evalS(c, vals) / sc) }; }) }, function (l) { return n4(vals[l.k] / sc); });
    }
    var rest = ' = ' + num + (mid && mid !== num ? ' = ' + mid : '') + ' = ' + n4(val / sc) + '\\,' + su;
    if ((sym + rest).replace(/\\[a-z]+|[{}]/g, '').length > 64) return '\\begin{aligned}' + lhs + ' &= ' + sym + '\\\\ &' + rest + '\\end{aligned}';
    return lhs + ' = ' + sym + rest;
  }

  /* names helpers */
  function namer(st) {
    var T = TPL[st.tpl];
    return function (k) {
      if (st.names && st.names[k]) return st.names[k];
      for (var i = 0; i < T.leaves.length; i++) if (T.leaves[i].k === k) return T.leaves[i].name;
      return k;
    };
  }
  function lsyms(st) {
    var L = st.lsym === 'RL' ? 'RL' : 'L';
    return { V: 'V_{' + L + '}', I: 'I_{' + L + '}', P: 'P_{' + L + '}', R: 'R_L' };
  }

  /* True when no shunt is switched in (ladder-type templates only): the source current is then the load current,
     so the network's efficiency equals the equivalent's for every value. Never true for the current-source template. */
  function seriesOnly(st, res) {
    var T = TPL[st.tpl];
    if (T.kind !== 'ladder' || !T.pos) return false;
    var vals = res && res.vals ? res.vals : leafVals(st);
    return Object.keys(T.pos).every(function (p) { return p.charAt(0) !== 'p' || !isFinite(vals[T.pos[p]]); });
  }
  /* Text comparing the real network (with R_L) to the equivalent: {text, kind}. Pure (uses kit.fmt only). */
  function netNoteText(st, r) {
    var F = K().fmt, L = lsyms(st), isI = TPL[st.tpl].kind === 'isrc';
    var same = Math.abs(r.net.VL - r.load.VL) <= 1e-9 * Math.max(1, Math.abs(r.load.VL));
    var s1 = 'In the original network with \\(R_L\\) attached: \\(' + L.V + ' = ' + tq(r.net.VL, 'V') + '\\), \\(' + L.I + ' = ' + tq(r.net.IL, 'A') + '\\)' + (same ? ', the same as the equivalent gives.' : ' (does not match: please report).');
    var etaEq = r.load.eta, etaNet = r.net.eta;
    if (isFinite(etaNet) && r.net.Psrc > 0) {
      var src = isI ? ' The two sources deliver ' : ' Its source delivers ';
      if (seriesOnly(st, r)) {
        s1 += ' No resistor is connected across the path from the source to the load, so the source current is the load current. The source delivers ' + F(r.net.Psrc, 'W', 4) + ', and the efficiency is the same ' + F(etaNet * 100, '%', 3) + ' as the equivalent\'s.';
      } else if (Math.abs(etaEq - etaNet) <= 1e-6 * Math.max(Math.abs(etaEq), Math.abs(etaNet))) {
        s1 += src + F(r.net.Psrc, 'W', 4) + (isI ? ' in total' : '') + ', and ' + F(etaNet * 100, '%', 3) + ' of it reaches the load. With these values that happens to equal the equivalent\'s efficiency, but it is a coincidence: in general the equivalent matches the network only at the terminals, not in the power lost inside.';
      } else {
        s1 += src + F(r.net.Psrc, 'W', 4) + (isI ? ' in total' : '') + ', and ' + F(etaNet * 100, '%', 3) + ' of it reaches the load. That differs from the equivalent\'s ' + F(etaEq * 100, '%', 3) + ': the equivalent matches the network only at the terminals, not in the power lost inside.';
      }
    } else if (isI) {
      s1 += ' The two sources deliver ' + F(r.net.Psrc, 'W', 4) + ' in total (one of them may be absorbing power).';
    }
    return { text: s1, kind: same ? '' : 'bad' };
  }

  /* ------------------------------------------------------------------ workings (pure) */
  function workingsFor(st, res) {
    var T = TPL[st.tpl], nm = namer(st), vals = res.vals;
    var src = st.src || 'V_s', A = st.ta || 'a', B = st.tb || 'b';
    var ab = A + '–' + B;
    var out = { vth: [], rth: [], inn: [], load: [] };
    if (T.kind === 'ladder') ladderWork(st, res, T, nm, vals, src, A, B, ab, out);
    else isrcWork(st, res, nm, vals, src, A, B, ab, out);
    // check line
    if (res.norton) {
      out.inn.push('\\frac{V_{TH}}{R_{TH}} = \\frac{' + tq(res.Vth, 'V') + '}{' + tq(res.Rth, 'Ω') + '} = ' + tq(res.InRatio, 'A') + (res.consistent ? '\\;=\\; I_N \\;\\checkmark' : '\\;\\neq\\; I_N'));
      out.inn.push('So \\(R_N = R_{TH} = ' + tq(res.Rth, 'Ω') + '\\) and \\(V_{TH} = I_N R_N\\): the Norton current source points toward ' + (res.In >= 0 ? A : B) + '.');
    }
    // load
    var L = lsyms(st), ld = res.load;
    out.load.push(L.I + ' = \\frac{V_{TH}}{R_{TH} + R_L} = \\frac{' + tq(res.Vth, 'V') + '}{' + tq(res.Rth, 'Ω') + ' + ' + tq(res.RL, 'Ω') + '} = ' + tq(ld.IL, 'A'));
    out.load.push(L.V + ' = ' + L.I + ' R_L = ' + tq(ld.IL, 'A') + ' \\times ' + tq(res.RL, 'Ω') + ' = ' + tq(ld.VL, 'V'));
    out.load.push(L.P + ' = ' + L.I + '^2 R_L = ' + L.V + L.I + ' = ' + tq(ld.PL, 'W'));
    out.load.push('\\eta = \\frac{' + L.P + '}{P_{total}} = \\frac{R_L}{R_{TH} + R_L} = \\frac{' + tq(res.RL, 'Ω') + '}{' + tq(res.Rth, 'Ω') + ' + ' + tq(res.RL, 'Ω') + '} = ' + tq(ld.eta * 100, '%'));
    if (res.Rth > 0) out.load.push('P_{max} = \\frac{V_{TH}^2}{4R_{TH}} = \\frac{(' + tq(res.Vth, 'V') + ')^2}{4 \\times ' + tq(res.Rth, 'Ω') + '} = ' + tq(res.Pmax, 'W') + '\\quad\\text{at } R_L = R_{TH}');
    else out.load.push('With \\(R_{TH} = 0\\) there is no maximum: \\(' + L.P + ' = V_{TH}^2/R_L\\) keeps rising as \\(R_L\\) gets smaller.');
    return out;
  }

  function ladderWork(st, res, T, nm, vals, src, A, B, ab, out) {
    var pos = T.pos;
    var e = function (k) { return pos[k] != null ? pos[k] : { c: (k.charAt(0) === 'p' ? INF : 0) }; };
    var simp2 = function (x) { return simp(fixC(x), vals); };
    var slot = function (k) { return simp2(e(k)); };
    var s = res.slots, oc = res.oc, sc = res.sc;
    var p1 = slot('p1'), p2 = slot('p2');
    var p1n = p1.t === 'leaf' ? nm(p1.k) : null, p2n = p2.t === 'leaf' ? nm(p2.k) : null;
    var Vsrc = tq(res.V, 'V');
    // --- V_TH
    var Zb = S(e('s3'), e('p2'), e('s4')), Zm = Pp(e('p1'), Zb), RT = S(e('s1'), e('s2'), Zm);
    var RTn = simp(fixC(RT), vals);
    if (oc.RT === INF) {
      out.vth.push('With ' + ab + ' open there is no closed path through \\(' + src + '\\), so no current flows and no resistor drops any voltage.');
      out.vth.push('V_{TH} = V_{' + A + B + '} = ' + src + ' = ' + Vsrc);
    } else {
      out.vth.push('With ' + ab + ' open, find the total resistance \\(R_T\\) the source sees' + (s.p2 === INF && (s.s3 > 0 || s.s4 > 0) ? ' (the resistor' + (s.s3 > 0 && s.s4 > 0 ? 's' : '') + ' leading to the open terminal' + (s.s3 > 0 && s.s4 > 0 ? 's carry' : ' carries') + ' no current, so ' + (s.s3 > 0 && s.s4 > 0 ? 'they are' : 'it is') + ' left out)' : '') + ':');
      out.vth.push(eqR('R_T', RTn, vals, nm));
      out.vth.push('I_T = \\frac{' + src + '}{R_T} = \\frac{' + Vsrc + '}{' + tq(oc.RT, 'Ω') + '} = ' + tq(oc.IT, 'A'));
      var ZbS = simp(fixC(Zb), vals);
      if (p1.t !== 'open' && ZbS.t === 'open') {
        out.vth.push('V_{' + p1n + '} = I_T\\,' + p1n + ' = ' + tq(oc.IT, 'A') + ' \\times ' + tq(vals[p1.k], 'Ω') + ' = ' + tq(oc.Vm, 'V'));
        var dead = [e('s3'), e('s4')].map(function (x) { return simp2(x); }).filter(function (x) { return x.t !== 'wire'; });
        if (dead.length) out.vth.push('No current flows through ' + dead.map(function (x) { return '\\(' + texS(x, function (l) { return nm(l.k); }) + '\\)'; }).join(' and ') + ' (it leads to an open terminal), so it drops 0 V and ' + ab + ' sees the full \\(V_{' + p1n + '}\\):');
        else out.vth.push('Terminals ' + A + ' and ' + B + ' sit on the two ends of \\(' + p1n + '\\):');
        out.vth.push('V_{TH} = V_{' + p1n + '} = ' + tq(res.Vth, 'V'));
      } else if (p1.t !== 'open') {
        var mid = simp(fixC(Zm), vals);
        out.vth.push('V_{' + p1n + '} = I_T\\,' + paren(texS(mid, function (l) { return nm(l.k); })) + ' = ' + tq(oc.IT, 'A') + ' \\times ' + tq(oc.Zm, 'Ω') + ' = ' + tq(oc.Vm, 'V'));
        if (s.s3 === 0 && s.s4 === 0) {
          out.vth.push('Here \\(' + p2n + '\\) is connected to the same two rails as \\(' + p1n + '\\), so it has the same voltage:');
          out.vth.push('V_{TH} = V_{' + p2n + '} = V_{' + p1n + '} = ' + tq(res.Vth, 'V'));
        } else {
          out.vth.push('Voltage divider along the branch toward ' + ab + ' (\\(' + p2n + '\\) is across the terminals):');
          out.vth.push('V_{TH} = V_{' + p1n + '}\\,\\frac{' + p2n + '}{' + texS(ZbS, function (l) { return nm(l.k); }) + '} = ' + tq(oc.Vm, 'V') + ' \\times \\frac{' + n4(s.p2) + '}{' + n4(oc.Zb) + '} = ' + tq(res.Vth, 'V'));
        }
      } else {
        out.vth.push('Single loop: \\(' + p2n + '\\) is across ' + ab + ', so Ohm\'s law gives');
        out.vth.push('V_{TH} = I_T\\,' + p2n + ' = ' + tq(oc.IT, 'A') + ' \\times ' + tq(s.p2, 'Ω') + ' = ' + tq(res.Vth, 'V'));
      }
    }
    // --- R_TH
    out.rth.push('Turn the source off (\\(' + src + '\\) becomes a wire) and look back into the circuit from ' + ab + ':');
    var RthE = Pp(e('p2'), S(e('s3'), e('s4'), Pp(e('p1'), S(e('s1'), e('s2')))));
    out.rth.push(eqR('R_{TH}', simp(fixC(RthE), vals), vals, nm));
    if (res.Rth === 0) out.rth.push('The wire that replaced \\(' + src + '\\) connects ' + A + ' straight to ' + B + ', so \\(R_{TH} = 0\\): the equivalent is just the ideal source.');
    // --- I_N
    out.inn.push('Put a wire from ' + A + ' to ' + B + ' (all sources stay on) and find the current \\(I_N\\) in it' + (p2n ? '. \\(' + p2n + '\\) is in parallel with the short, so it carries no current and drops out' : '') + ':');
    var Zb2 = simp(fixC(S(e('s3'), e('s4'))), vals);
    if (sc.shorted) {
      out.inn.push('The short now sits directly across the ideal source \\(' + src + '\\) (\\(R_T = 0\\)), so \\(I_N\\) would be unlimited. The Norton form does not exist when \\(R_{TH} = 0\\).');
    } else if (p1.t !== 'open' && Zb2.t === 'wire') {
      out.inn.push('The short also bypasses \\(' + p1n + '\\), so only the series resistors are left:');
      out.inn.push(eqR("R_T'", simp(fixC(S(e('s1'), e('s2'))), vals), vals, nm));
      out.inn.push("I_N = I_T' = \\frac{" + src + "}{R_T'} = \\frac{" + Vsrc + '}{' + tq(sc.RT, 'Ω') + '} = ' + tq(res.In, 'A'));
    } else if (p1.t === 'open') {
      out.inn.push(eqR("R_T'", simp(fixC(S(e('s1'), e('s2'), e('s3'), e('s4'))), vals), vals, nm));
      out.inn.push("I_N = I_T' = \\frac{" + src + "}{R_T'} = \\frac{" + Vsrc + '}{' + tq(sc.RT, 'Ω') + '} = ' + tq(res.In, 'A'));
    } else {
      out.inn.push(eqR("R_T'", simp(fixC(S(e('s1'), e('s2'), Pp(e('p1'), S(e('s3'), e('s4'))))), vals), vals, nm));
      out.inn.push("I_T' = \\frac{" + src + "}{R_T'} = \\frac{" + Vsrc + '}{' + tq(sc.RT, 'Ω') + '} = ' + tq(sc.IT, 'A'));
      var zb2t = texS(Zb2, function (l) { return nm(l.k); });
      out.inn.push('Current divider: \\(I_T\'\\) splits between \\(' + p1n + '\\) and the path to the short.');
      out.inn.push("I_N = I_T'\\,\\frac{" + p1n + '}{' + p1n + ' + ' + (Zb2.t === 'leaf' ? zb2t : paren(zb2t)) + '} = ' + tq(sc.IT, 'A') + ' \\times \\frac{' + n4(s.p1) + '}{' + n4(s.p1) + ' + ' + n4(s.s3 + s.s4) + '} = ' + tq(res.In, 'A'));
    }
  }
  /* turn {c:0|INF} placeholders into simp nodes inside a tree (simp handles strings/ops) */
  function fixC(e) {
    if (e == null || typeof e === 'string') return e;
    if (e.c != null) return { t: e.c === 0 ? 'wire' : 'open' };
    if (e.t) return e;
    return { op: e.op, a: e.a.map(fixC) };
  }

  function isrcWork(st, res, nm, vals, src, A, B, ab, out) {
    var I = res.Is, Iabs = Math.abs(I), sgn = I >= 0 ? '+' : '-';
    var r1 = nm('R1'), r2 = nm('R2'), r3 = nm('R3'), r4 = nm('R4');
    var has2 = vals.R2 !== INF, has3 = vals.R3 !== 0, has4 = vals.R4 !== INF;
    var Vs = tq(res.V, 'V');
    var zbT = has4 ? (has3 ? r3 + ' + ' + r4 : r4) : null;
    var zbN = has4 ? (has3 ? n4(vals.R3) + ' + ' + n4(vals.R4) : n4(vals.R4)) : null;
    out.vth.push('KCL at node x with ' + ab + ' open (current into x = current out of x). \\(I_s\\) points ' + (I >= 0 ? 'into' : 'out of') + ' x' + (has4 ? '' : '; ' + (has3 ? '\\(' + r3 + '\\) leads to the open terminal and carries no current' : 'nothing else is connected to x')) + ':');
    var lhs = '\\frac{' + src + ' - V_x}{' + r1 + '} ' + sgn + ' I_s';
    var rhs = [];
    if (has2) rhs.push('\\frac{V_x}{' + r2 + '}');
    if (has4) rhs.push('\\frac{V_x}{' + zbT + '}');
    out.vth.push(lhs + ' = ' + (rhs.length ? rhs.join(' + ') : '0'));
    var den = ['\\frac{1}{' + r1 + '}'], denN = ['\\frac{1}{' + n4(vals.R1) + '}'];
    if (has2) { den.push('\\frac{1}{' + r2 + '}'); denN.push('\\frac{1}{' + n4(vals.R2) + '}'); }
    if (has4) { den.push('\\frac{1}{' + zbT + '}'); denN.push('\\frac{1}{' + zbN + '}'); }
    out.vth.push('V_x = \\frac{' + src + '/' + r1 + ' ' + sgn + ' I_s}{' + den.join(' + ') + '} = \\frac{' + n4(res.V) + '/' + n4(vals.R1) + ' ' + sgn + ' ' + n4(Iabs) + '}{' + denN.join(' + ') + '} = ' + tq(res.oc.Vx, 'V'));
    if (has4 && has3) out.vth.push('V_{TH} = V_x\\,\\frac{' + r4 + '}{' + r3 + ' + ' + r4 + '} = ' + tq(res.oc.Vx, 'V') + ' \\times \\frac{' + n4(vals.R4) + '}{' + zbN + '} = ' + tq(res.Vth, 'V'));
    else out.vth.push('V_{TH} = V_x = ' + tq(res.Vth, 'V'));
    if (res.Vth < 0) out.vth.push('Here \\(V_{TH}\\) is negative: ' + B + ' is the + terminal, so the equivalent source is drawn with + toward ' + B + '.');
    out.rth.push('Turn both sources off: \\(' + src + '\\) becomes a wire (0 V) and \\(I_s\\) becomes an open (0 A). Then look back from ' + ab + ':');
    var e = Pp('R4', S('R3', Pp('R1', 'R2')));
    out.rth.push(eqR('R_{TH}', simp(e, vals), vals, nm));
    out.inn.push('Put a wire from ' + A + ' to ' + B + ' with both sources on and find the current \\(I_N\\) in it' + (has4 ? '. \\(' + r4 + '\\) is in parallel with the short and drops out' : '') + ':');
    if (!has3) {
      out.inn.push('Node x is now shorted to the bottom rail, so every current that reaches x goes into the short (\\(' + (has2 ? r2 : r1) + '\\) ' + (has2 ? 'has 0 V across it' : 'sees the full source') + '):');
      out.inn.push('I_N = \\frac{' + src + '}{' + r1 + '} ' + sgn + ' I_s = \\frac{' + n4(res.V) + '}{' + n4(vals.R1) + '} ' + sgn + ' ' + n4(Iabs) + ' = ' + tq(res.In, 'A'));
    } else {
      var d2 = ['\\frac{1}{' + r1 + '}'], d2n = ['\\frac{1}{' + n4(vals.R1) + '}'];
      if (has2) { d2.push('\\frac{1}{' + r2 + '}'); d2n.push('\\frac{1}{' + n4(vals.R2) + '}'); }
      d2.push('\\frac{1}{' + r3 + '}'); d2n.push('\\frac{1}{' + n4(vals.R3) + '}');
      out.inn.push("V_x' = \\frac{" + src + '/' + r1 + ' ' + sgn + ' I_s}{' + d2.join(' + ') + '} = \\frac{' + n4(res.V) + '/' + n4(vals.R1) + ' ' + sgn + ' ' + n4(Iabs) + '}{' + d2n.join(' + ') + '} = ' + tq(res.sc.Vx, 'V'));
      out.inn.push("I_N = \\frac{V_x'}{" + r3 + '} = \\frac{' + tq(res.sc.Vx, 'V') + '}{' + tq(vals.R3, 'Ω') + '} = ' + tq(res.In, 'A'));
    }
  }

  /* ------------------------------------------------------------------ diagrams (pure: return DSL specs) */
  function fV(v) { return K().fmt(Math.abs(v) < 1e-12 ? 0 : v, 'V', 4); }
  function fA(v) { return K().fmt(Math.abs(v) < 1e-15 ? 0 : Math.abs(v), 'A', 3); }
  function fR(v) { return K().fmt(v, 'Ω', 4); }

  function diagram(st, mode, res) {
    var T = TPL[st.tpl];
    if (T.kind === 'isrc') return isrcDiagram(st, mode, res);
    if (st.tpl === 'pairT') return pairTDiagram(st, mode, res);
    if (st.tpl === 'serpar') return serparDiagram(st, mode, res);
    return ladderDiagram(st, mode, res);
  }
  function modeRes(res, mode) { return mode === 'oc' ? res.oc : (mode === 'sc' ? res.sc : (mode === 'load' ? res.ld : null)); }
  function annot(r) { return r && !r.shorted; }
  function resPart(a, b, name, R, side, r, I) {
    var p = { t: 'R', a: a, b: b, label: name, value: fR(R) };
    if (side) p.side = side;
    if (annot(r) && I != null) p.value += '\n' + fA(I) + ', ' + fV(Math.abs(I) * R);
    return p;
  }
  function srcParts(st, mode, x, yTop, yBot, res) {
    var parts = [];
    if (mode === 'off') {
      parts.push({ t: 'W', pts: [[x, yTop], [x, yBot]] });
      parts.push({ t: 'T', at: [x - 0.3, (yTop + yBot) / 2 + 0.1], text: 'wire\n(was ' + fV(res.V) + ')', anchor: 'end', cls: 'muted' });
    } else {
      parts.push({ t: st.sym || 'BAT', a: [x, yBot], b: [x, yTop], plus: 'b', label: st.src || 'V_s', value: fV(res.V), side: -1 });
    }
    parts.push({ t: 'T', at: [x - 2.1, yTop], text: ' ' });
    return parts;
  }
  /* terminals + the thing connected in this mode. xT = terminal x, ya/yb rows */
  function termParts(st, mode, res, xT, ya, yb) {
    var A = st.ta || 'a', B = st.tb || 'b', L = st.lsym === 'RL' ? 'RL' : 'L';
    var parts = [], r = modeRes(res, mode), xL = xT + 1.8;
    parts.push({ t: 'N', at: [xT, ya], open: true, label: A, pos: 'n' });
    parts.push({ t: 'N', at: [xT, yb], open: true, label: B, pos: 's' });
    if (mode === 'oc') {
      parts.push({ t: 'VM', a: [xT + 1.1, ya + 0.5], b: [xT + 1.1, yb - 0.5], label: 'V_{TH} = ' + fV(res.Vth), lat: [xT + 1.45, (ya + yb) / 2], anchor: 'start' });
      parts.push({ t: 'T', at: [xT + 4.0, (ya + yb) / 2], text: ' ' });
    } else if (mode === 'sc') {
      parts.push({ t: 'W', pts: [[xT, ya], [xL, ya], [xL, yb], [xT, yb]] });
      parts.push({ t: 'IARR', a: [xL, (ya + yb) / 2 - 0.5], b: [xL, (ya + yb) / 2 + 0.5], label: r.shorted ? 'I_N → ∞' : 'I_N = ' + fA(res.In) + (res.In < 0 ? ' (' + B + '→' + A + ')' : '') });
      parts.push({ t: 'T', at: [xL + 2.9, (ya + yb) / 2], text: ' ' });
    } else if (mode === 'load') {
      parts.push({ t: 'W', pts: [[xT, ya], [xL, ya]] });
      parts.push({ t: 'W', pts: [[xT, yb], [xL, yb]] });
      if (Math.abs(res.net.IL) > 1e-15) parts.push(res.net.IL >= 0 ? { t: 'IARR', a: [xT + 0.3, ya], b: [xL - 0.2, ya] } : { t: 'IARR', a: [xL - 0.2, ya], b: [xT + 0.3, ya] });
      parts.push({ t: 'R', a: [xL, ya], b: [xL, yb], label: 'R_L', value: fR(res.RL) + '\n' + 'I_{' + L + '} = ' + fA(res.net.IL) + '\nV_{' + L + '} = ' + fV(res.net.VL) });
      parts.push({ t: 'T', at: [xL + 3.2, (ya + yb) / 2], text: ' ' });
    } else {
      parts.push({ t: 'ARROW', a: [xT + 1.9, (ya + yb) / 2], b: [xT + 0.5, (ya + yb) / 2] });
      parts.push({ t: 'T', at: [xT + 2.1, (ya + yb) / 2 + 0.1], text: 'R_{TH} = ' + fR(res.Rth), anchor: 'start', cls: 'accent' });
      parts.push({ t: 'T', at: [xT + 5.0, (ya + yb) / 2], text: ' ' });
    }
    return parts;
  }
  function nodeV(at, v, anchor) { return { t: 'T', at: at, text: fV(v), anchor: anchor || 'middle', cls: 'accent' }; }

  function ladderDiagram(st, mode, res) {
    var nm = namer(st), T = TPL[st.tpl], v = res.vals, s = res.slots, r = modeRes(res, mode);
    var key = function (slot) { return T.pos[slot]; };
    var has = function (slot) { var k = key(slot); return k != null && v[k] !== 0 && v[k] !== INF; };
    var parts = srcParts(st, mode, 0, 0, 4, res);
    var IT = r && r.IT, Ib = r && r.Ib;
    // top rail
    if (has('s1')) { parts.push({ t: 'W', pts: [[0, 0], [1, 0]] }); parts.push(resPart([1, 0], [4, 0], nm(key('s1')), v[key('s1')], 0, r, IT)); parts.push({ t: 'W', pts: [[4, 0], [5.5, 0]] }); }
    else parts.push({ t: 'W', pts: [[0, 0], [5.5, 0]] });
    if (has('s2')) { parts.push({ t: 'W', pts: [[0, 4], [1, 4]] }); parts.push(resPart([1, 4], [4, 4], nm(key('s2')), v[key('s2')], -1, r, IT)); parts.push({ t: 'W', pts: [[4, 4], [5.5, 4]] }); }
    else parts.push({ t: 'W', pts: [[0, 4], [5.5, 4]] });
    if (annot(r) && IT > 0) parts.push({ t: 'IARR', a: [4.2, 0], b: [5.3, 0] });
    var xT = 13;
    if (has('p1')) { parts.push(resPart([5.5, 0], [5.5, 4], nm(key('p1')), v[key('p1')], 0, r, r && r.Ip1)); parts.push({ t: 'N', at: [5.5, 0] }); parts.push({ t: 'N', at: [5.5, 4] }); }
    if (has('s3')) { parts.push({ t: 'W', pts: [[5.5, 0], [7, 0]] }); parts.push(resPart([7, 0], [10, 0], nm(key('s3')), v[key('s3')], 0, r, Ib)); parts.push({ t: 'W', pts: [[10, 0], [xT, 0]] }); }
    else parts.push({ t: 'W', pts: [[5.5, 0], [xT, 0]] });
    if (has('s4')) { parts.push({ t: 'W', pts: [[5.5, 4], [7, 4]] }); parts.push(resPart([7, 4], [10, 4], nm(key('s4')), v[key('s4')], -1, r, Ib)); parts.push({ t: 'W', pts: [[10, 4], [xT, 4]] }); }
    else parts.push({ t: 'W', pts: [[5.5, 4], [xT, 4]] });
    if (has('p2')) {
      var Ip2 = r ? (mode === 'sc' ? 0 : r.Ip2) : null;
      if (mode === 'load' && r && !r.shorted) Ip2 = (r.nodes.t2 - r.nodes.b2) / s.p2;
      parts.push(resPart([11.5, 0], [11.5, 4], nm(key('p2')), v[key('p2')], 0, r, Ip2)); parts.push({ t: 'N', at: [11.5, 0] }); parts.push({ t: 'N', at: [11.5, 4] });
    }
    if (annot(r)) {
      var N = r.nodes;
      parts.push(nodeV([0, -0.55], N.t0)); parts.push(nodeV([0, 4.95], 0));
      if (has('p1')) { parts.push(nodeV([6.3, -0.5], N.t1)); parts.push(nodeV([6.3, 4.85], N.b1)); }
      parts.push(nodeV([12.6, -0.5], N.t2, 'end')); parts.push(nodeV([12.6, 4.85], N.b2, 'end'));
      parts.push({ t: 'T', at: [6.5, 6.35], text: 'node voltages measured from the source’s − terminal (0 V)', cls: 'muted' });
    }
    parts = parts.concat(termParts(st, mode, res, xT, 0, 4));
    parts.push({ t: 'T', at: [2, -1.6], text: ' ' });
    parts.push({ t: 'T', at: [2, 6.6], text: ' ' });
    return { parts: parts, pad: 0.45, padX: 0.5, alt: altText(st, mode, res) };
  }

  function pairTDiagram(st, mode, res) {
    var nm = namer(st), v = res.vals, r = modeRes(res, mode);
    var on = function (k) { return v[k] !== 0 && v[k] !== INF; };
    var parts = srcParts(st, mode, 0, 2, 6, res);
    var IT = r && r.IT, Vpair = r && !r.shorted ? r.IT * res.slots.s1 : null;
    parts.push({ t: 'W', pts: [[0, 2], [0, 0], [1, 0]] });
    parts.push(resPart([1, 0], [4, 0], nm('R1'), v.R1, 0, r, Vpair != null ? Vpair / v.R1 : null));
    parts.push({ t: 'W', pts: [[4, 0], [5, 0], [5, 2]] });
    if (on('R2')) { parts.push({ t: 'W', pts: [[0, 2], [1, 2]] }); parts.push(resPart([1, 2], [4, 2], nm('R2'), v.R2, -1, r, Vpair != null ? Vpair / v.R2 : null)); parts.push({ t: 'W', pts: [[4, 2], [5, 2]] }); parts.push({ t: 'N', at: [0, 2] }); }
    parts.push({ t: 'N', at: [5, 2], label: 'x', pos: 'nw' });
    if (on('R3')) { parts.push(resPart([5, 2], [5, 6], nm('R3'), v.R3, 0, r, r && r.Ip1)); parts.push({ t: 'N', at: [5, 6] }); }
    var xT = 11;
    if (on('R4')) { parts.push({ t: 'W', pts: [[5, 2], [6.5, 2]] }); parts.push(resPart([6.5, 2], [9.5, 2], nm('R4'), v.R4, 0, r, r && r.Ib)); parts.push({ t: 'W', pts: [[9.5, 2], [xT, 2]] }); }
    else parts.push({ t: 'W', pts: [[5, 2], [xT, 2]] });
    parts.push({ t: 'W', pts: [[0, 6], [xT, 6]] });
    if (annot(r)) {
      parts.push(nodeV([-0.25, -0.3], r.nodes.t0, 'end'));
      parts.push(nodeV([4.8, 2.6], r.nodes.t1, 'end'));
      parts.push(nodeV([10.6, 2.65], r.nodes.t2, 'end'));
      parts.push(nodeV([0, 6.95], 0));
      parts.push({ t: 'T', at: [5.5, 7.6], text: 'node voltages measured from the source’s − terminal (0 V)', cls: 'muted' });
    }
    parts = parts.concat(termParts(st, mode, res, xT, 2, 6));
    parts.push({ t: 'T', at: [2, -1.4], text: ' ' });
    parts.push({ t: 'T', at: [2, 7.9], text: ' ' });
    return { parts: parts, pad: 0.45, padX: 0.5, alt: altText(st, mode, res) };
  }

  function serparDiagram(st, mode, res) {
    var nm = namer(st), v = res.vals, r = modeRes(res, mode);
    var on = function (k) { return v[k] !== 0 && v[k] !== INF; };
    var parts = srcParts(st, mode, 0, 1, 6, res);
    var IT = r && r.IT;
    var Vpair = r && !r.shorted ? r.IT * par([v.R2, v.R3]) : null;
    parts.push({ t: 'W', pts: [[0, 1], [0, 0], [1, 0]] });
    if (on('R1')) { parts.push(resPart([1, 0], [4, 0], nm('R1'), v.R1, 0, r, IT)); parts.push({ t: 'W', pts: [[4, 0], [5, 0]] }); }
    else parts.push({ t: 'W', pts: [[1, 0], [5, 0]] });
    parts.push(resPart([5, 0], [5, 3], nm('R2'), v.R2, -1, r, Vpair != null ? Vpair / v.R2 : null));
    if (on('R3')) { parts.push({ t: 'W', pts: [[5, 0], [8, 0]] }); parts.push(resPart([8, 0], [8, 3], nm('R3'), v.R3, 0, r, Vpair != null ? Vpair / v.R3 : null)); parts.push({ t: 'W', pts: [[5, 3], [8, 3]] }); parts.push({ t: 'N', at: [5, 0] }); parts.push({ t: 'N', at: [8, 3] }); }
    var xT = 11;
    parts.push({ t: 'W', pts: [[5, 3], [xT, 3]] });
    if (on('R4')) {
      var I4 = null;
      if (annot(r)) I4 = mode === 'sc' ? 0 : (r.nodes.t2 - r.nodes.b2) / v.R4;
      parts.push(resPart([6.5, 3], [6.5, 6], nm('R4'), v.R4, 0, r, I4)); parts.push({ t: 'N', at: [6.5, 3] }); parts.push({ t: 'N', at: [6.5, 6] });
    }
    parts.push({ t: 'W', pts: [[0, 6], [xT, 6]] });
    if (annot(r)) {
      parts.push(nodeV([-0.25, -0.3], r.nodes.t0, 'end'));
      if (on('R1')) parts.push(nodeV([5.2, -0.55], r.nodes.t0 - r.IT * v.R1, 'start'));
      parts.push(nodeV([10.6, 3.65], r.nodes.t2, 'end'));
      parts.push(nodeV([0, 6.95], 0));
      parts.push({ t: 'T', at: [5.5, 7.6], text: 'node voltages measured from the source’s − terminal (0 V)', cls: 'muted' });
    }
    parts = parts.concat(termParts(st, mode, res, xT, 3, 6));
    parts.push({ t: 'T', at: [2, -1.6], text: ' ' });
    parts.push({ t: 'T', at: [2, 7.9], text: ' ' });
    return { parts: parts, pad: 0.45, padX: 0.5, alt: altText(st, mode, res) };
  }

  function isrcDiagram(st, mode, res) {
    var nm = namer(st), v = res.vals, r = modeRes(res, mode);
    var on = function (k) { return v[k] !== 0 && v[k] !== INF; };
    var parts = srcParts(st, mode, 0, 0, 4, res);
    parts.push({ t: 'W', pts: [[0, 0], [1, 0]] });
    parts.push(resPart([1, 0], [4, 0], nm('R1'), v.R1, 0, r, r && r.I1));
    parts.push({ t: 'W', pts: [[4, 0], [7.5, 0]] });
    parts.push({ t: 'N', at: [5, 0], label: 'x', pos: 'n' });
    if (on('R2')) { parts.push(resPart([5, 0], [5, 4], nm('R2'), v.R2, -1, r, r && r.I2)); parts.push({ t: 'N', at: [5, 4] }); }
    var up = st.idir !== 'down';
    if (mode === 'off') parts.push({ t: 'T', at: [7.5, 2.1], text: 'open\n(was ' + K().fmt(+st.I, 'A', 3) + ')', cls: 'muted' });
    else parts.push({ t: 'I', a: up ? [7.5, 4] : [7.5, 0], b: up ? [7.5, 0] : [7.5, 4], label: 'I_s', value: K().fmt(+st.I, 'A', 3) });
    parts.push({ t: 'N', at: [7.5, 0] }); parts.push({ t: 'N', at: [7.5, 4] });
    var xT = 15;
    if (on('R3')) { parts.push({ t: 'W', pts: [[7.5, 0], [9, 0]] }); parts.push(resPart([9, 0], [12, 0], nm('R3'), v.R3, 0, r, r && r.Ib)); parts.push({ t: 'W', pts: [[12, 0], [xT, 0]] }); }
    else parts.push({ t: 'W', pts: [[7.5, 0], [xT, 0]] });
    if (on('R4')) { parts.push(resPart([13.5, 0], [13.5, 4], nm('R4'), v.R4, 0, r, r ? (mode === 'sc' ? 0 : r.Va / v.R4) : null)); parts.push({ t: 'N', at: [13.5, 0] }); parts.push({ t: 'N', at: [13.5, 4] }); }
    parts.push({ t: 'W', pts: [[0, 4], [xT, 4]] });
    if (annot(r)) {
      parts.push(nodeV([0, -0.55], r.nodes.t0));
      parts.push(nodeV([5.9, -0.5], r.nodes.x, 'start'));
      parts.push(nodeV([14.6, -0.5], r.nodes.a, 'end'));
      parts.push(nodeV([0, 4.95], 0));
      parts.push({ t: 'T', at: [7.5, 5.7], text: 'node voltages measured from the source’s − terminal (0 V)', cls: 'muted' });
    }
    parts = parts.concat(termParts(st, mode, res, xT, 0, 4));
    parts.push({ t: 'T', at: [2, -1.6], text: ' ' });
    parts.push({ t: 'T', at: [2, 6.0], text: ' ' });
    return { parts: parts, pad: 0.45, padX: 0.5, alt: altText(st, mode, res) };
  }

  function altText(st, mode, res) {
    var what = { oc: 'with terminals open; V_TH = ' + fV(res.Vth), off: 'with the sources turned off; R_TH = ' + fR(res.Rth), sc: 'with the terminals shorted; I_N = ' + (res.sc.shorted ? 'unbounded' : fA(res.In) + (res.In < 0 ? ', flowing from ' + (st.tb || 'b') + ' to ' + (st.ta || 'a') + ' through the short' : (res.In > 0 ? ', flowing from ' + (st.ta || 'a') + ' to ' + (st.tb || 'b') + ' through the short' : ''))), load: 'with R_L = ' + fR(res.RL) + ' attached; V_L = ' + fV(res.net.VL) }[mode];
    return TPL[st.tpl].label + ' circuit ' + what + '.';
  }

  /* Thévenin and Norton equivalents side by side */
  function eqDiagram(st, res) {
    var A = st.ta || 'a', B = st.tb || 'b';
    var neg = res.Vth < 0, parts = [];
    parts.push({ t: 'T', at: [2.5, -1.3], text: 'Thévenin', bold: true });
    parts.push({ t: st.sym || 'BAT', a: [0, 3], b: [0, 0], plus: neg ? 'a' : 'b', label: 'V_{TH}', value: fV(Math.abs(res.Vth)), side: -1 });
    parts.push({ t: 'T', at: [-2.6, 0], text: ' ' });
    if (res.Rth > 0) { parts.push({ t: 'W', pts: [[0, 0], [1, 0]] }); parts.push({ t: 'R', a: [1, 0], b: [4, 0], label: 'R_{TH}', value: fR(res.Rth) }); parts.push({ t: 'W', pts: [[4, 0], [5, 0]] }); }
    else { parts.push({ t: 'W', pts: [[0, 0], [5, 0]] }); parts.push({ t: 'T', at: [2.5, -0.4], text: 'R_{TH} = 0', cls: 'muted' }); }
    parts.push({ t: 'W', pts: [[0, 3], [5, 3]] });
    parts.push({ t: 'N', at: [5, 0], open: true, label: A + (neg ? '' : ' (+)'), pos: 'e' });
    parts.push({ t: 'N', at: [5, 3], open: true, label: B + (neg ? ' (+)' : ''), pos: 'e' });
    parts.push({ t: 'T', at: [7.3, 1.65], text: '⇔', size: 22 });
    var x0 = 10.6;
    parts.push({ t: 'T', at: [x0 + 2.5, -1.3], text: 'Norton', bold: true });
    if (res.norton) {
      var up = res.In >= 0;
      parts.push({ t: 'I', a: up ? [x0, 3] : [x0, 0], b: up ? [x0, 0] : [x0, 3], label: 'I_N', value: fA(res.In), side: -1 });
      parts.push({ t: 'W', pts: [[x0, 0], [x0 + 5, 0]] });
      parts.push({ t: 'W', pts: [[x0, 3], [x0 + 5, 3]] });
      parts.push({ t: 'R', a: [x0 + 3, 0], b: [x0 + 3, 3], label: 'R_N', value: fR(res.Rth) });
      parts.push({ t: 'N', at: [x0 + 3, 0] }); parts.push({ t: 'N', at: [x0 + 3, 3] });
      parts.push({ t: 'N', at: [x0 + 5, 0], open: true, label: A, pos: 'e' });
      parts.push({ t: 'N', at: [x0 + 5, 3], open: true, label: B, pos: 'e' });
    } else {
      parts.push({ t: 'T', at: [x0 + 2.5, 1.2], text: 'not defined:', cls: 'muted' });
      parts.push({ t: 'T', at: [x0 + 2.5, 1.8], text: 'R_{TH} = 0 would need', cls: 'muted' });
      parts.push({ t: 'T', at: [x0 + 2.5, 2.4], text: 'an infinite I_N', cls: 'muted' });
    }
    parts.push({ t: 'T', at: [x0 + 6.8, 1.5], text: ' ' });
    parts.push({ t: 'T', at: [2, 3.9], text: ' ' });
    var alt = 'Thévenin equivalent: ' + fV(Math.abs(res.Vth)) + ' source with + toward ' + (neg ? B : A) + ', in series with ' + fR(res.Rth) + '. ' +
      (res.norton ? 'Norton equivalent: ' + fA(res.In) + ' current source pointing toward ' + (res.In >= 0 ? A : B) + ', in parallel with ' + fR(res.Rth) + '.' : 'No Norton equivalent because R_TH = 0.');
    return { parts: parts, pad: 0.5, padX: 0.5, alt: alt };
  }

  /* ------------------------------------------------------------------ presets */
  function P(id, label, lesson, sec, values, info) { return { id: id, label: label, lesson: lesson, sec: sec, values: values, info: info }; }
  var LAD_OFF = { s1: false, s2: false, p1: false, s3: false, s4: false, p2: false };
  function on(list, base) { var o = extend(base, {}); list.forEach(function (k) { o[k] = true; }); return o; }
  var PRESETS = [
    P('tn1-ex1', 'tn1 Ex. 1 & 5: 10 V across 10 Ω', 'tn1', 'tn1-vth',
      { tpl: 'divider', V: 10, R: { R1: 10, R2: 10, R3: 10 }, on: { R1: false, R2: true, R3: false }, names: { R1: 'R_1', R2: 'R', R3: 'R_3' }, src: 'V_s', sym: 'BAT', ta: 'A', tb: 'B', lsym: 'L', RL: 10, view: 'off' },
      { ts: '19:25', heading: 'Example 1 (\\(V_{TH}\\)) and Example 5 (\\(R_{TH}\\))', expect: 'Lesson: \\(V_{TH} = 10\\,\\text{V}\\), \\(R_{TH} = 0\\,\\Omega\\) (the short lands directly across the 10 Ω).', rlNote: true }),
    P('tn1-ex2', 'tn1 Ex. 2 & 4: A–B across the 100 Ω', 'tn1', 'tn1-vth',
      { tpl: 'ladder', V: 5, R: { s1: 100, s2: 400, p1: 100, s3: 100, s4: 100, p2: 100 }, on: on(['s2', 'p2'], LAD_OFF), names: { p2: 'R_1', s2: 'R_2', s1: 'R_3', p1: 'R_4', s3: 'R_5', s4: 'R_6' }, src: 'V_s', sym: 'BAT', ta: 'A', tb: 'B', lsym: 'L', RL: 80, view: 'oc' },
      { ts: '20:06', heading: 'Example 2 (\\(V_{TH}\\)) and Example 4 (\\(R_{TH}\\))', expect: 'Lesson: \\(I = 10\\,\\text{mA}\\), \\(V_{TH} = 1\\,\\text{V}\\), \\(R_{TH} = 400 \\parallel 100 = 80\\,\\Omega\\); the guide\'s added check gives \\(I_{SC} = 12.5\\,\\text{mA}\\).', drawNote: 'Drawn as a ladder: the 400 Ω sits in the bottom rail. It connects the same nodes as the lesson figure (A at the top of the 100 Ω, B at the junction). The names \\(R_1\\), \\(R_2\\) are added; the lesson labels the resistors by value.', rlNote: true }),
    P('tn1-ex3', 'tn1 Ex. 3: A–B across the 400 Ω', 'tn1', 'tn1-vth',
      { tpl: 'ladder', V: 5, R: { s1: 100, s2: 100, p1: 100, s3: 100, s4: 100, p2: 400 }, on: on(['s1', 'p2'], LAD_OFF), names: { s1: 'R_1', p2: 'R_2', s2: 'R_3', p1: 'R_4', s3: 'R_5', s4: 'R_6' }, src: 'V_s', sym: 'BAT', ta: 'A', tb: 'B', lsym: 'L', RL: 80, view: 'oc' },
      { ts: '21:35', heading: 'Example 3', expect: 'Lesson: \\(V_{TH} = 4\\,\\text{V}\\). The guide adds \\(R_{TH} = 80\\,\\Omega\\) (not computed in the video).', drawNote: 'Same circuit as Example 2 with the terminals moved: compare the two presets. The names \\(R_1\\), \\(R_2\\) are added.', rlNote: true }),
    P('tn1-ex6', 'tn1 Ex. 6: 100 V ladder', 'tn1', 'tn1-ladder',
      { tpl: 'ladder', V: 100, R: { s1: 25, s2: 25, p1: 100, s3: 100, s4: 100, p2: 100 }, on: on(['s1', 's2', 'p1', 'p2'], LAD_OFF), names: { s1: 'R_1', s2: 'R_2', p1: 'R_3', p2: 'R_4', s3: 'R_5', s4: 'R_6' }, src: 'V_s', sym: 'BAT', ta: 'A', tb: 'B', lsym: 'L', RL: 75, view: 'oc' },
      { ts: '29:46', heading: 'Example 6 (and the added Example 7 load table)', expect: 'Lesson: \\(R_T = 100\\,\\Omega\\), \\(I_T = 1\\,\\text{A}\\), rails at 75 V and 25 V, \\(V_{TH} = 50\\,\\text{V}\\), \\(R_{TH} = 25\\,\\Omega\\). Guide\'s added Example 7: \\(R_L = 75\\,\\Omega\\) gives \\(I_L = 0.5\\,\\text{A}\\), \\(V_L = 37.5\\,\\text{V}\\).' }),
    P('tn2-ex1', 'tn2 Ex. 1: 20 V, zero-current resistor', 'tn2', 'tn2-thev-vth',
      { tpl: 'ladder', V: 20, R: { s1: 10, s2: 10, p1: 20, s3: 20, s4: 10, p2: 10 }, on: on(['s1', 's2', 'p1', 's3'], LAD_OFF), names: { s1: 'R_1', p1: 'R_2', s3: 'R_3', s2: 'R_4', p2: 'R_5', s4: 'R_6' }, src: 'V_s', sym: 'BAT', ta: 'a', tb: 'b', lsym: 'L', RL: 30, view: 'oc' },
      { ts: '2:54', heading: 'Example 1 (parts A and B)', expect: 'Lesson: \\(R_T = 40\\,\\Omega\\), \\(I_T = 0.5\\,\\text{A}\\), a at 15 V, b at 5 V, \\(V_{TH} = 10\\,\\text{V}\\), \\(R_{TH} = 30\\,\\Omega\\). Guide checks: \\(R_L = 30\\,\\Omega\\) gives \\(V_{ab} = 5\\,\\text{V}\\); Norton \\(I_N = 1/3\\,\\text{A}\\).' }),
    P('tn2-ex2', 'tn2 Ex. 2: Norton of the 100 V ladder', 'tn2', 'tn2-norton-ex',
      { tpl: 'ladder', V: 100, R: { s1: 25, s2: 25, p1: 100, s3: 100, s4: 100, p2: 100 }, on: on(['s1', 's2', 'p1', 'p2'], LAD_OFF), names: { s1: 'R_1', p1: 'R_2', p2: 'R_3', s2: 'R_4', s3: 'R_5', s4: 'R_6' }, src: 'V_s', sym: 'BAT', ta: 'a', tb: 'b', lsym: 'L', RL: 25, view: 'sc' },
      { ts: '26:40', heading: 'Example 2: Norton equivalent of the 100 V circuit', expect: 'Lesson: shorting a–b removes both 100 Ω, \\(R_T = 50\\,\\Omega\\), \\(I_N = 2\\,\\text{A}\\), \\(R_N = 25\\,\\Omega\\). Guide checks: \\(V_{TH} = I_N R_N = 50\\,\\text{V}\\); a 25 Ω load gets 1 A.' }),
    P('tn3-ex1', 'tn3 Ex. 1: 30 V, 30 ∥ 9 Ω, two 12 Ω', 'tn3', 'tn3-ex1-in',
      { tpl: 'pairT', V: 30, R: { R1: 30, R2: 9, R3: 12, R4: 12 }, on: { R1: true, R2: true, R3: true, R4: true }, names: { R1: 'R_1', R2: 'R_2', R3: 'R_3', R4: 'R_4' }, src: 'V_s', sym: 'V', ta: 'A', tb: 'B', lsym: 'L', RL: 16.39, view: 'sc' },
      { ts: '0:54', heading: 'Example 1: 30 V source, 30 Ω ∥ 9 Ω, two 12 Ω', expect: 'Lesson (rounded at each step): \\(R_T = 12.92\\,\\Omega\\), \\(I_T = 2.32\\,\\text{A}\\), junction at 13.95 V, \\(I_N = 1.16\\,\\text{A}\\), \\(R_N = 16.39\\,\\Omega\\). Guide: \\(V_{TH} = 19.0\\,\\text{V}\\) (19.02 V exact).', drawNote: 'The lab does not round, so the junction shows 13.93 V instead of the board\'s 13.95 V (the guide explains this rounding).', rlNote: true }),
    P('tn3-ex2', 'tn3 Ex. 2: 50 V, 51 Ω across A–B', 'tn3', 'tn3-ex2-in',
      { tpl: 'serpar', V: 50, R: { R1: 10, R2: 20, R3: 20, R4: 51 }, on: { R1: true, R2: true, R3: true, R4: true }, names: { R1: 'R_1', R2: 'R_2', R3: 'R_3', R4: 'R_4' }, src: 'V_s', sym: 'V', ta: 'A', tb: 'B', lsym: 'L', RL: 51, view: 'sc' },
      { ts: '23:33', heading: 'Example 2: 50 V, 10 Ω, 20 Ω ∥ 20 Ω, 51 Ω across A–B', expect: 'Lesson: the short removes the 51 Ω, \\(I_N = 2.5\\,\\text{A}\\), \\(R_N = 20 \\parallel 51 = 14.37\\,\\Omega\\). Guide checks: \\(V_{TH} = 35.92\\,\\text{V}\\); loads 10, 51, 100 Ω give 14.74, 28.02, 31.40 V.' }),
    P('tn3-lab5', 'tn3 Lab 5 circuit (1 kΩ load)', 'tn3', 'tn3-lab5',
      { tpl: 'ladder', V: 30, R: { s1: 2000, s2: 1000, p1: 2000, s3: 1000, s4: 1000, p2: 1000 }, on: on(['s1', 'p1', 's4', 'p2'], LAD_OFF), names: { s1: 'R_1', p1: 'R_2', s4: 'R_3', p2: 'R_4', s2: 'R_5', s3: 'R_6' }, src: 'V_1', sym: 'V', ta: 'A', tb: 'B', lsym: 'RL', RL: 1000, view: 'load' },
      { ts: '52:43', heading: 'Lab 5 preview: the handout\'s original circuit', expect: 'The video shows the circuit only. The guide\'s own check (not from the video): \\(V_{TH} = 5\\,\\text{V}\\), \\(R_{TH} = 666.7\\,\\Omega\\), \\(I_N = 7.5\\,\\text{mA}\\); with \\(R_L = 1\\,\\text{k}\\Omega\\): \\(V_{RL} = 3.0\\,\\text{V}\\), \\(I_{RL} = 3.0\\,\\text{mA}\\).' }),
    P('tn4-ex1', 'tn4 Ex. 1: 20 V, \\(r_{int}\\) 10 Ω, \\(R_L\\) 10 Ω', 'tn4', 'tn4-load10',
      { tpl: 'divider', V: 20, R: { R1: 10, R2: 10, R3: 10 }, on: { R1: true, R2: false, R3: false }, names: { R1: 'r_{int}', R2: 'R_2', R3: 'R_3' }, src: 'V', sym: 'BAT', ta: 'a', tb: 'b', lsym: 'RL', RL: 10, view: 'load' },
      { ts: '11:56', heading: 'Example 1: matched load', expect: 'Lesson: \\(I_{RL} = 1\\,\\text{A}\\), \\(V_{RL} = 10\\,\\text{V}\\), \\(P_{RL} = 10\\,\\text{W}\\) (the maximum).', drawNote: 'The lesson\'s source is \\(V\\) with internal resistance \\(r_{int}\\); terminal names a, b are added.' }),
    P('tn4-ex2', 'tn4 Ex. 2: \\(R_L\\) 5 Ω', 'tn4', 'tn4-load5',
      { tpl: 'divider', V: 20, R: { R1: 10, R2: 10, R3: 10 }, on: { R1: true, R2: false, R3: false }, names: { R1: 'r_{int}', R2: 'R_2', R3: 'R_3' }, src: 'V', sym: 'BAT', ta: 'a', tb: 'b', lsym: 'RL', RL: 5, view: 'load' },
      { ts: '14:37', heading: 'Example 2: smaller load', expect: 'Lesson: \\(I_{RL} = 1.33\\,\\text{A}\\), \\(V_{r_{int}} = 13.33\\,\\text{V}\\), \\(V_{RL} = 6.66\\,\\text{V}\\), \\(P_{RL} = 8.89\\,\\text{W}\\).' }),
    P('tn4-ex3', 'tn4 Ex. 3: \\(R_L\\) 30 Ω', 'tn4', 'tn4-load30',
      { tpl: 'divider', V: 20, R: { R1: 10, R2: 10, R3: 10 }, on: { R1: true, R2: false, R3: false }, names: { R1: 'r_{int}', R2: 'R_2', R3: 'R_3' }, src: 'V', sym: 'BAT', ta: 'a', tb: 'b', lsym: 'RL', RL: 30, view: 'load' },
      { ts: '19:01', heading: 'Example 3: larger load', expect: 'Lesson: \\(I_{RL} = 0.5\\,\\text{A}\\), \\(V_{RL} = 15\\,\\text{V}\\), \\(P_{RL} = 7.5\\,\\text{W}\\).' })
  ];
  /* "Try:" defaults when you switch network (not attributed to the lessons, except where a template is a lesson figure) */
  var TPL_DEFAULT = {
    divider: { tpl: 'divider', V: 12, R: { R1: 4000, R2: 2000, R3: 1000 }, on: { R1: true, R2: true, R3: false }, names: {}, src: 'V_s', sym: 'BAT', ta: 'a', tb: 'b', lsym: 'L', RL: 1000, view: 'oc' },
    ladder: null, // tn1-ex6
    pairT: null,  // tn3-ex1
    serpar: null, // tn3-ex2
    isrc: { tpl: 'isrc', V: 20, I: 1, idir: 'up', R: { R1: 10, R2: 10, R3: 5, R4: 20 }, on: { R1: true, R2: true, R3: true, R4: true }, names: {}, src: 'V_s', sym: 'V', ta: 'a', tb: 'b', lsym: 'L', RL: 10, view: 'oc' }
  };
  function presetById(id) { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i]; return null; }
  function tplDefault(tpl) {
    var d = TPL_DEFAULT[tpl];
    if (!d) { var p = presetById({ ladder: 'tn1-ex6', pairT: 'tn3-ex1', serpar: 'tn3-ex2' }[tpl]); return extend(clone(p.values), { pid: p.id, edited: false }); }
    return extend(clone(d), { pid: null, edited: false });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function normalize(v) {
    var st = clone(v || {});
    if (!TPL[st.tpl]) return tplDefault('ladder');
    var d = TPL_DEFAULT[st.tpl] || presetById({ ladder: 'tn1-ex6', pairT: 'tn3-ex1', serpar: 'tn3-ex2' }[st.tpl]).values;
    ['V', 'I', 'idir', 'src', 'sym', 'ta', 'tb', 'lsym', 'RL', 'view'].forEach(function (k) { if (st[k] == null && d[k] != null) st[k] = d[k]; });
    if (st.I == null) st.I = 1;
    if (!st.idir) st.idir = 'up';
    st.R = extend(d.R, st.R || {}); st.on = extend(d.on, st.on || {}); st.names = extend(d.names || {}, st.names || {});
    if (['oc', 'off', 'sc', 'load'].indexOf(st.view) < 0) st.view = 'oc';
    return st;
  }

  /* ================================================================== UI */
  var CSS = [
    '.lab-thv-tpls{display:flex;flex-direction:column;align-items:stretch}',
    '.lab-thv-desc{font-size:var(--fs-sm);color:var(--ink-2);margin:0}',
    '.lab-thv-inc{display:flex;align-items:center;gap:6px;font-size:var(--fs-xs);color:var(--ink-2);margin:-2px 0 2px}',
    '.lab-thv-inc input{accent-color:var(--topic);width:16px;height:16px;margin:0}',
    '.lab-thv-off .lab-ctl-row{opacity:.45}',
    '.lab-thv-where{font-size:var(--fs-xs);color:var(--ink-3)}',
    '.lab-thv-ckt svg{min-width:540px}',
    '.lab-thv-eq svg{min-width:460px}',
    '.lab-thv-cap{font-size:var(--fs-sm);color:var(--ink-2);margin:0}',
    '.lab-thv-info{display:flex;flex-direction:column;gap:4px}',
    '.lab-thv-info a{color:var(--link)}',
    '.lab-thv-h{margin:var(--sp-2) 0 0;font-family:var(--font-display);font-size:var(--fs-md);font-weight:700;color:var(--ink)}',
    '.lab-thv-row{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center}',
    '.lab-thv-chart svg{cursor:crosshair;touch-action:pan-y}',
    '.lab-thv-chart .lab-thv-hit{fill:transparent}',
    '.lab-thv-msg:empty{display:none}',
    '.lab table.lab-table.lab-thv-tbl th{text-transform:none;letter-spacing:0}',
    '.lab table.lab-table.lab-thv-tbl tbody th{font-weight:500;color:var(--ink);font-size:var(--fs-sm)}',
    '.lab table.lab-table.lab-thv-tbl td{white-space:nowrap}',
    '.lab-thv-figcap{padding:4px 8px 2px}',
    '.lab-thv-check{font-family:var(--font-mono);font-size:var(--fs-sm)}',
    '@media (max-width:560px){.lab-thv-ckt svg{min-width:480px}.lab-thv-eq svg{min-width:420px}}'
  ].join('\n');

  function mount(el, ctx) {
    var kit = ctx.kit || K(), h = kit.h;
    if (!document.getElementById('lab-thevenin-css')) {
      var stl = document.createElement('style'); stl.id = 'lab-thevenin-css'; stl.textContent = CSS; document.head.appendChild(stl);
    }
    var st;
    if (ctx.preset) st = extend(normalize(ctx.preset), { pid: ctx.presetId || ctx.preset.pid || null, edited: false });   // a preset (lesson link) wins over the saved state
    else if (ctx.state && ctx.state.tpl) st = normalize(ctx.state);
    else st = tplDefault('ladder');
    if (!st.pid && ctx.presetId) st.pid = ctx.presetId;

    var fr = kit.frame(def, { onPreset: function (p) { applyValues(extend(clone(p.values), { pid: p.id, edited: false })); }, layout: 'wide-controls' });
    el.appendChild(fr.root);
    var destroyed = false, cleanups = [];

    /* ---- controls */
    var gNet = h('div', { class: 'lab-group' }, [h('h4', { text: 'Network' })]);
    var tplSeg = kit.segmented({ options: TPL_ORDER.map(function (k) { return { value: k, label: TPL[k].label }; }), value: st.tpl, onChange: function (v) { applyValues(tplDefault(v)); } });
    var tplDesc = h('p', { class: 'lab-thv-desc' });
    tplSeg.el.setAttribute('aria-label', 'Network'); tplSeg.el.classList.add('lab-thv-tpls');
    gNet.appendChild(tplSeg.el); gNet.appendChild(tplDesc);
    var gSrc = h('div', { class: 'lab-group' }, [h('h4', { text: 'Sources' })]);
    var gRes = h('div', { class: 'lab-group' }, [h('h4', { text: 'Resistors' })]);
    var resBox = h('div', { class: 'lab-thv-res' });
    gRes.appendChild(resBox);
    var gLoad = h('div', { class: 'lab-group' }, [h('h4', { text: 'Load across the terminals' })]);
    var ctlV = null, ctlI = null, segDir = null, leafCtl = {};
    var ctlRL = kit.control({ label: 'Load resistance \\(R_L\\)', unit: 'Ω', min: 0.1, max: 1e6, scale: 'log', value: st.RL, hardMin: 1e-3, hardMax: 1e9, sig: 4, onInput: function (v) { st.RL = v; changed(); } });
    var btnMatch = h('button', { type: 'button', class: 'lab-btn', html: 'Set <i>R</i><sub>L</sub> = <i>R</i><sub>TH</sub> (maximum power)' });
    btnMatch.addEventListener('click', function () { var r = analyze(st); if (r.Rth > 0 && isFinite(r.Rth)) { st.RL = +r.Rth.toPrecision(4); ctlRL.set(st.RL); changed(); } });
    gLoad.appendChild(ctlRL.el); gLoad.appendChild(h('div', { class: 'lab-thv-row' }, [btnMatch]));
    gLoad.appendChild(h('p', { class: 'lab-thv-desc', html: 'You can also click or drag on the power chart to set <i>R</i><sub>L</sub>.' }));
    [gNet, gSrc, gRes, gLoad].forEach(function (g) { fr.controls.appendChild(g); });

    function buildSourceControls() {
      gSrc.innerHTML = ''; gSrc.appendChild(h('h4', { text: 'Sources' }));
      ctlV = kit.control({ label: 'Voltage source \\(' + (st.src || 'V_s') + '\\) (+ on top)', unit: 'V', min: 0, max: 120, step: 0.5, value: st.V, hardMin: 0, hardMax: 1e5, sig: 4, onInput: function (v) { st.V = v; changed(); } });
      gSrc.appendChild(ctlV.el);
      ctlI = segDir = null;
      if (TPL[st.tpl].kind === 'isrc') {
        ctlI = kit.control({ label: 'Current source \\(I_s\\)', unit: 'A', min: 0.001, max: 10, scale: 'log', value: st.I, hardMin: 1e-6, hardMax: 1e4, sig: 4, onInput: function (v) { st.I = v; changed(); } });
        segDir = kit.segmented({ label: 'Arrow', options: [{ value: 'up', label: 'into x (up)' }, { value: 'down', label: 'out of x (down)' }], value: st.idir, onChange: function (v) { st.idir = v; changed(); } });
        gSrc.appendChild(ctlI.el); gSrc.appendChild(segDir.el);
      }
    }
    function buildLeafControls() {
      resBox.innerHTML = ''; leafCtl = {};
      var nm = namer(st);
      TPL[st.tpl].leaves.forEach(function (lf) {
        var c = kit.control({ label: '\\(' + nm(lf.k) + '\\)', unit: 'Ω', min: 1, max: 1e5, scale: 'log', value: st.R[lf.k], hardMin: 1e-3, hardMax: 1e9, sig: 4,
          onInput: function (v) { st.R[lf.k] = v; changed(); } });
        var where = h('div', { class: 'lab-thv-where', text: lf.where });
        c.el.insertBefore(where, c.el.children[1]);
        if (lf.off) {
          var cid = kit.uid('thv-inc');
          var cb = h('input', { type: 'checkbox', id: cid });
          cb.checked = st.on[lf.k] !== false;
          var lab = h('label', { class: 'lab-thv-inc', for: cid });
          lab.appendChild(cb);
          lab.appendChild(document.createTextNode(lf.off === 'wire' ? 'In the circuit (off: replaced by a wire)' : 'In the circuit (off: removed, leaves an open)'));
          c.el.insertBefore(lab, c.el.children[2]);
          cb.addEventListener('change', function () { st.on[lf.k] = cb.checked; syncLeaf(lf.k); changed(); });
          c.cb = cb;
        }
        leafCtl[lf.k] = c;
        resBox.appendChild(c.el);
        syncLeaf(lf.k);
      });
    }
    function syncLeaf(k) {
      var c = leafCtl[k]; if (!c) return;
      var off = c.cb && !c.cb.checked;
      c.range.disabled = !!off; c.input.disabled = !!off;
      c.el.classList.toggle('lab-thv-off', !!off);
    }

    /* ---- output */
    var info = h('div', { class: 'lab-thv-info' });
    var viewSeg = kit.segmented({ label: 'Show', options: [
      { value: 'oc', label: 'Terminals open (<i>V</i><sub>TH</sub>)' }, { value: 'off', label: 'Sources off (<i>R</i><sub>TH</sub>)' },
      { value: 'sc', label: 'Terminals shorted (<i>I</i><sub>N</sub>)' }, { value: 'load', label: 'Load attached' }], value: st.view, onChange: function (v) { st.view = v; render(false); save(); } });
    var cktEl = h('div', { class: 'lab-thv-ckt' });
    var ckt = kit.circuit(cktEl, { parts: [] });
    var cap = h('p', { class: 'lab-thv-cap' });
    var msg = h('div', { class: 'lab-thv-msg', role: 'status', 'aria-live': 'polite' });
    var ro = kit.readout([
      { key: 'vth', label: '\\(V_{TH}\\) (open circuit)', unit: 'V', emph: true },
      { key: 'rth', label: '\\(R_{TH} = R_N\\) (sources off)', unit: 'Ω', emph: true },
      { key: 'in', label: '\\(I_N\\) (short-circuit current)', unit: 'A', emph: true },
      { key: 'ratio', label: '\\(V_{TH}/R_{TH}\\)', unit: 'A' }
    ]);
    var checkNote = h('div');
    var eqEl = h('div', { class: 'lab-thv-eq' });
    var eqC = kit.circuit(eqEl, { parts: [] });
    var wV = kit.workings('Calculation of V_TH (terminals open)');
    var wR = kit.workings('Calculation of R_TH (sources off)');
    var wI = kit.workings('Calculation of I_N (terminals shorted), an independent check');
    var loadH = h('h4', { class: 'lab-thv-h', text: 'Load and maximum power transfer' });
    var roL = kit.readout([
      { key: 'vl', label: '\\(V_L\\)', unit: 'V' }, { key: 'il', label: '\\(I_L\\)', unit: 'A' },
      { key: 'pl', label: '\\(P_L\\)', unit: 'W', emph: true }, { key: 'eta', label: 'Efficiency \\(\\eta\\) (equivalent)', unit: '%', sig: 3 },
      { key: 'pmax', label: '\\(P_{max}\\) at \\(R_L = R_{TH}\\)', unit: 'W' }, { key: 'ratio', label: '\\(R_L / R_{TH}\\)', unit: '', sig: 3 }
    ], { compact: true });
    var chart = powerChart(kit, function (R) { st.RL = R; ctlRL.set(R); changed(); });
    var tblWrap = h('div', { class: 'lab-table-wrap' });
    var netNote = h('div');
    var mpNote = kit.note('At \\(R_L = R_{TH}\\) the load gets \\(P_{max} = V_{TH}^2/(4R_{TH})\\) and the equivalent circuit\'s efficiency is exactly 50 %: as much power is lost in \\(R_{TH}\\) as reaches the load. A larger \\(R_L\\) is more efficient but receives less power.');
    var wL = kit.workings('Calculation for the load (using the Thévenin equivalent)');
    [info, viewSeg.el, cktEl, cap, msg, ro.el, checkNote, eqEl, wV.el, wR.el, wI.el, loadH, roL.el, chart.el, mpNote, tblWrap, netNote, wL.el].forEach(function (x) { fr.output.appendChild(x); });

    function save() { if (ctx.save) ctx.save(clone(st)); }
    function changed() { if (st.pid && !st.edited) st.edited = true; render(true); save(); }
    function applyValues(v) {
      st = normalize(v);
      if (v.pid !== undefined) st.pid = v.pid;
      st.edited = !!v.edited;
      tplSeg.set(st.tpl); viewSeg.set(st.view);
      buildSourceControls(); buildLeafControls();
      ctlRL.set(st.RL);
      render(false); save();
    }

    function render(fromInput) {
      if (destroyed) return;
      fr.markPreset(st.pid && !st.edited ? st.pid : null);
      kit.tex(tplDesc, TPL[st.tpl].desc);
      // preset info
      info.innerHTML = '';
      var p = st.pid ? presetById(st.pid) : null;
      if (p) {
        var lines = '<strong>' + p.label + '</strong> · ' + p.lesson + ', ' + p.info.heading + ' at ' + p.info.ts + ' · <a href="#/t/thevenin/understand/' + p.lesson + '/' + p.sec + '">Open the lesson section</a><br>' + p.info.expect;
        if (p.info.drawNote) lines += '<br>' + p.info.drawNote;
        if (p.info.rlNote) lines += '<br>The lesson has no load here; the lab sets \\(R_L\\) to a convenient value.';
        if (st.edited) lines += '<br><em>You have changed values since loading this example.</em>';
        info.appendChild(kit.note(lines));
      } else if (st.tpl === 'divider' || st.tpl === 'isrc') {
        info.appendChild(kit.note('Try it: these starting values are not from the videos. Load an example above to see a lesson circuit.', 'warn'));
      }
      var errs = validate(st);
      if (errs.length) { msg.innerHTML = ''; msg.appendChild(kit.note(errs.join(' '), 'bad')); return; }
      var r = analyze(st);
      // diagrams
      ckt.update(diagram(st, st.view, r));
      cap.innerHTML = {
        oc: 'Nothing is connected to the terminals. Each resistor shows its current and voltage drop; the red numbers are node voltages.',
        off: 'Voltage sources become wires (0 V) and current sources become opens (0 A). <i>R</i><sub>TH</sub> is the resistance seen looking back from the terminals.',
        sc: 'A wire joins the terminals; the current in that wire is <i>I</i><sub>N</sub>. Anything in parallel with the wire carries no current.',
        load: '<i>R</i><sub>L</sub> is attached to the original network. Compare its voltage and current with the equivalent-circuit results in the load section below: they match.'
      }[st.view];
      msg.innerHTML = '';
      if (r.Rth === 0) msg.appendChild(kit.note('\\(R_{TH} = 0\\): the ideal source sits directly across the terminals. Every load gets exactly \\(V_{TH}\\), the Norton form does not exist (\\(I_N\\) would be infinite) and there is no maximum-power point.', 'warn'));
      if (r.Vth === 0 && r.Rth > 0) msg.appendChild(kit.note('\\(V_{TH} = 0\\): this network delivers no power to any load.', 'warn'));
      ro.update({ vth: r.Vth, rth: r.Rth, 'in': r.sc.shorted ? '∞ (not defined)' : r.In, ratio: r.Rth > 0 ? r.InRatio : '— (R_TH = 0)' });
      checkNote.innerHTML = '';
      if (r.norton) checkNote.appendChild(kit.note((r.consistent ? '' : 'Mismatch: ') + '\\(I_N\\) was found from the shorted circuit, separately from \\(V_{TH}\\) and \\(R_{TH}\\). It equals \\(V_{TH}/R_{TH}\\), as it must: <span class="lab-thv-check">' + kit.fmt(r.In, 'A', 4) + ' = ' + kit.fmt(r.Vth, 'V', 4) + ' / ' + kit.fmt(r.Rth, 'Ω', 4) + '</span>.', r.consistent ? 'ok' : 'bad'));
      eqC.update(eqDiagram(st, r));
      var w = workingsFor(st, r);
      wV.update(w.vth); wR.update(w.rth); wI.update(w.inn); wL.update(w.load);
      // load section
      var L = lsyms(st);
      roL.update({ vl: r.load.VL, il: r.load.IL, pl: r.load.PL, eta: r.load.eta * 100, pmax: r.Rth > 0 ? r.Pmax : '— (no maximum)', ratio: r.Rth > 0 ? st.RL / r.Rth : '—' });
      relabel(roL.el, L);
      chart.update(r, st);
      tblWrap.innerHTML = ''; tblWrap.appendChild(loadTable(kit, r, st));
      netNote.innerHTML = '';
      var nn = netNoteText(st, r);
      netNote.appendChild(kit.note(nn.text, nn.kind));
    }
    function relabel(dl, L) {
      var dts = dl.querySelectorAll('dt');
      kit.tex(dts[0], '\\(' + L.V + '\\)'); kit.tex(dts[1], '\\(' + L.I + '\\)'); kit.tex(dts[2], '\\(' + L.P + '\\)');
    }

    buildSourceControls(); buildLeafControls();
    tplSeg.set(st.tpl); viewSeg.set(st.view);
    render(false);

    return {
      destroy: function () { destroyed = true; chart.destroy(); cleanups.forEach(function (f) { f(); }); if (fr.root.parentNode) fr.root.parentNode.removeChild(fr.root); },
      setState: function (v) { applyValues(extend(normalize(v), { pid: v.pid || null, edited: !!v.edited })); }
    };
  }

  /* P_L vs R_L on a log axis (own SVG: kit.chart has linear axes only). */
  function powerChart(kit, onPick) {
    var h = kit.h, NS = 'http://www.w3.org/2000/svg';
    var wrap = h('figure', { class: 'lab-chart lab-thv-chart' });
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('role', 'img');
    wrap.appendChild(svg);
    var cap = h('figcaption', { class: 'lab-thv-desc lab-thv-figcap' });
    wrap.appendChild(cap);
    var cur = null, W = 640, H = 260, M = { l: 58, r: 16, t: 16, b: 44 }, dom = null, dragging = false;
    function el(name, attrs, parent) { var e = document.createElementNS(NS, name); Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); }); if (parent) parent.appendChild(e); return e; }
    function txt(parent, x, y, s, cls, anchor) { var t = el('text', { x: x, y: y, class: cls, 'text-anchor': anchor || 'middle' }, parent); if (global.EEDiagrams && global.EEDiagrams.rich) t.innerHTML = global.EEDiagrams.rich(s); else t.textContent = s; return t; }
    function draw() {
      if (!cur) return;
      var r = cur.r, st = cur.st;
      W = Math.max(300, Math.round(wrap.getBoundingClientRect().width || 640) - 16);
      M.l = 68;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var Vth = r.Vth, Rth = r.Rth, RL = st.RL;
      var c = Rth > 0 ? Rth : RL;
      var lo = Math.min(c / 100, RL / 2), hi = Math.max(c * 100, RL * 2);
      var l0 = Math.log10(lo), l1 = Math.log10(hi);
      var N = 240, pts = [], ymax = 0;
      for (var i = 0; i <= N; i++) { var R = Math.pow(10, l0 + (l1 - l0) * i / N), P = loadPower(Vth, Rth, R); pts.push([R, P]); if (isFinite(P)) ymax = Math.max(ymax, P); }
      if (Rth > 0) ymax = r.Pmax;
      if (!(ymax > 0)) ymax = 1;
      ymax *= 1.15;
      dom = { l0: l0, l1: l1 };
      var X = function (R) { return M.l + (Math.log10(R) - l0) / (l1 - l0) * (W - M.l - M.r); };
      var Y = function (P) { return M.t + (1 - P / ymax) * (H - M.t - M.b); };
      var g = el('g', {}, svg);
      for (var e = Math.floor(l0); e <= Math.ceil(l1); e++) {
        [1, 2, 5].forEach(function (m) {
          var R = m * Math.pow(10, e); if (R < lo * 0.999 || R > hi * 1.001) return;
          el('line', { x1: X(R), x2: X(R), y1: M.t, y2: H - M.b, class: 'lab-grid', 'stroke-opacity': m === 1 ? null : 0.5 }, g);
          if (m === 1 || (l1 - l0 < 3 && m !== 1)) txt(g, X(R), H - M.b + 16, kit.fmt(R, 'Ω', 3), 'lab-tick');
        });
      }
      var st2 = kit.niceStep(ymax, 4);
      for (var y = 0; y <= ymax + 1e-12; y += st2) { el('line', { x1: M.l, x2: W - M.r, y1: Y(y), y2: Y(y), class: 'lab-grid' }, g); txt(g, M.l - 6, Y(y) + 4, kit.fmt(y, 'W', 3), 'lab-tick', 'end'); }
      el('rect', { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, class: 'lab-frame', fill: 'none' }, g);
      txt(svg, (M.l + W - M.r) / 2, H - 6, 'Load resistance R_L (log scale)', 'lab-axlabel');
      var yl = txt(svg, 11, (M.t + H - M.b) / 2, 'Load power P_L', 'lab-axlabel'); yl.setAttribute('transform', 'rotate(-90 11 ' + ((M.t + H - M.b) / 2) + ')');
      var clipId = kit.uid('thvclip');
      var cp = el('clipPath', { id: clipId }, el('defs', {}, svg));
      el('rect', { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b }, cp);
      var d = '';
      pts.forEach(function (p, k) { if (!isFinite(p[1])) return; d += (d ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Math.max(-1e4, Y(p[1])).toFixed(1); });
      el('path', { d: d, class: 'lab-series s1', fill: 'none', 'clip-path': 'url(#' + clipId + ')' }, svg);
      if (Rth > 0) {
        el('line', { x1: X(Rth), x2: X(Rth), y1: M.t, y2: H - M.b, class: 'lab-mark accent' }, svg);
        var rgt = X(Rth) > W * 0.6;
        txt(svg, rgt ? X(Rth) - 5 : X(Rth) + 5, H - M.b - 8, 'R_L = R_{TH} = ' + kit.fmt(Rth, 'Ω', 3), 'lab-mark-label', rgt ? 'end' : 'start');
        el('line', { x1: M.l, x2: W - M.r, y1: Y(r.Pmax), y2: Y(r.Pmax), class: 'lab-mark' }, svg);
        txt(svg, W - M.r - 4, Y(r.Pmax) - 5, 'P_{max} = ' + kit.fmt(r.Pmax, 'W', 3), 'lab-mark-label', 'end');
        el('circle', { cx: X(Rth), cy: Y(r.Pmax), r: 3.5, class: 'lab-point' }, svg);
      }
      var PL = r.load.PL;
      if (isFinite(PL)) {
        var cx = X(RL), cy = Y(Math.min(PL, ymax));
        el('line', { x1: cx, x2: cx, y1: cy, y2: H - M.b, class: 'lab-mark' }, svg);
        el('circle', { cx: cx, cy: cy, r: 6, class: 'lab-point filled' }, svg);
        txt(svg, cx > W * 0.6 ? cx - 9 : cx + 9, Math.max(M.t + 26, cy - 9), 'P_L = ' + kit.fmt(PL, 'W', 3), 'lab-mark-label', cx > W * 0.6 ? 'end' : 'start');
      }
      el('rect', { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, class: 'lab-thv-hit' }, svg);
      svg.setAttribute('aria-label', 'Load power versus load resistance on a logarithmic axis. ' + (Rth > 0 ? 'Maximum ' + kit.fmt(r.Pmax, 'W', 3) + ' at R_L = R_TH = ' + kit.fmt(Rth, 'Ω', 3) + '. ' : 'No maximum because R_TH = 0. ') + 'Current point: R_L = ' + kit.fmt(RL, 'Ω', 3) + ', P_L = ' + kit.fmt(PL, 'W', 3) + '. The table below lists the same values.');
      cap.innerHTML = Rth > 0 ? 'The curve peaks at <i>R</i><sub>L</sub> = <i>R</i><sub>TH</sub>. Click or drag on the chart to move <i>R</i><sub>L</sub> (the slider does the same).' : 'With <i>R</i><sub>TH</sub> = 0 the power keeps rising as <i>R</i><sub>L</sub> falls. Click or drag to move <i>R</i><sub>L</sub>.';
    }
    function pick(e) {
      if (!dom) return;
      var rect = svg.getBoundingClientRect();
      var px = (e.clientX - rect.left) / rect.width * W;
      var f = kit.clamp((px - M.l) / (W - M.l - M.r), 0, 1);
      var R = Math.pow(10, dom.l0 + f * (dom.l1 - dom.l0));
      R = +R.toPrecision(3);
      R = kit.clamp(R, 1e-3, 1e9);
      onPick(R);
    }
    /* The svg has touch-action: pan-y, so a vertical swipe that starts on the chart still scrolls the page (the browser
     * then sends pointercancel). For touch, R_L is therefore set only by a horizontal drag (pointermove) or a tap
     * (pointerup), never by the pointerdown that may begin a scroll. Mouse and pen set it at once, as before. */
    svg.addEventListener('pointerdown', function (e) { dragging = true; try { svg.setPointerCapture(e.pointerId); } catch (x) {} if (e.pointerType !== 'touch') pick(e); });
    svg.addEventListener('pointermove', function (e) { if (dragging) pick(e); });
    svg.addEventListener('pointerup', function (e) { if (dragging && e.pointerType === 'touch') pick(e); dragging = false; });
    svg.addEventListener('pointercancel', function () { dragging = false; });
    var ro = global.ResizeObserver ? new ResizeObserver(function () { draw(); }) : null;
    if (ro) ro.observe(wrap);
    return {
      el: wrap,
      update: function (r, st) { cur = { r: r, st: st }; draw(); },
      destroy: function () { if (ro) ro.disconnect(); }
    };
  }

  function loadTable(kit, r, st) {
    var h = kit.h, L = lsyms(st);
    var tbl = h('table', { class: 'lab-table lab-thv-tbl' });
    var cap = h('caption', { class: 'lab-thv-desc', style: { 'text-align': 'left', 'caption-side': 'top', 'padding-bottom': '4px' } });
    kit.tex(cap, 'Load values from the Thévenin equivalent (\\(V_{TH} = ' + tq(r.Vth, 'V') + '\\), \\(R_{TH} = ' + tq(r.Rth, 'Ω') + '\\))');
    tbl.appendChild(cap);
    var thead = h('thead'), tr = h('tr');
    ['\\(R_L\\)', '\\(' + L.I + '\\)', '\\(' + L.V + '\\)', '\\(' + L.P + '\\)', '\\(\\eta\\)'].forEach(function (t) { var th = h('th', { scope: 'col' }); kit.tex(th, t); tr.appendChild(th); });
    thead.appendChild(tr); tbl.appendChild(thead);
    var tb = h('tbody'), rows = [];
    if (r.Rth > 0) rows.push(['½ <i>R</i><sub>TH</sub>', r.Rth / 2], ['<i>R</i><sub>TH</sub> (match)', r.Rth], ['2 <i>R</i><sub>TH</sub>', r.Rth * 2]);
    rows.push(['your <i>R</i><sub>L</sub>', st.RL]);
    rows.forEach(function (row) {
      var c = loadCalc(r.Vth, r.Rth, row[1]);
      var tr2 = h('tr');
      [row[0] + '<br>' + kit.fmt(row[1], 'Ω', 4), kit.fmt(c.IL, 'A', 4), kit.fmt(c.VL, 'V', 4), kit.fmt(c.PL, 'W', 4), kit.fmt(c.eta * 100, '%', 3)].forEach(function (t, i) { tr2.appendChild(h(i ? 'td' : 'th', i ? { text: t } : { html: t, scope: 'row' })); });
      tb.appendChild(tr2);
    });
    tbl.appendChild(tb);
    return tbl;
  }

  /* ================================================================== register */
  var def = {
    id: 'thevenin', topic: 'thevenin',
    title: 'Thévenin and Norton equivalents, and the best load',
    blurb: 'Pick a network, change its values, and see \\(V_{TH}\\), \\(R_{TH}\\) and \\(I_N\\) worked out step by step on the circuit. Then attach a load and find where it receives the most power.',
    assumptions: [
      'Linear DC circuit: ideal independent sources, ideal (fixed) resistors, ideal wires (0 Ω) and ideal open terminals. Steady state, so no capacitors or inductors.',
      '\\(V_{TH} = V_{ab} = V_a - V_b\\) with nothing connected to the terminals. A negative value means b is the + terminal; the equivalent is then drawn with + toward b.',
      '\\(R_{TH}\\): every independent source turned off. A voltage source becomes a wire (0 V); a current source becomes an open (0 A). The tn1 video only had voltage sources; the current-source rule is from the guides\' added notes. Dependent sources are not covered.',
      '\\(I_N\\) is the current from a to b through a wire placed across the terminals, computed from the shorted circuit on its own. \\(R_N = R_{TH}\\), and \\(I_N = V_{TH}/R_{TH}\\) only when \\(0 \\lt R_{TH} \\lt \\infty\\).',
      'Node voltages on the diagrams are measured from the voltage source\'s − terminal (0 V), as in the lessons. Currents and drops on each resistor are magnitudes; arrows show direction where drawn.',
      'Load section: \\(R_L\\) is a resistor across a–b. \\(P_L = I_L^2 R_L\\). For a fixed source network the maximum is at \\(R_L = R_{TH}\\), \\(P_{max} = V_{TH}^2/(4R_{TH})\\). The efficiency \\(\\eta = R_L/(R_{TH}+R_L)\\) is that of the equivalent circuit; the real network\'s efficiency is computed separately and is usually different.',
      'The equivalent circuits match the original only as seen from a–b (for anything you connect there), not inside the network.'
    ],
    presets: PRESETS,
    model: {
      ser: ser, par: par, ladder: ladder, ladderRth: ladderRth, isrc: isrc, isrcRth: isrcRth,
      loadCalc: loadCalc, pmax: pmax, loadPower: loadPower, analyze: analyze, validate: validate,
      normalize: normalize, tplDefault: tplDefault, templates: TPL, templateOrder: TPL_ORDER,
      workings: workingsFor, netNote: netNoteText, seriesOnly: seriesOnly, altText: altText, diagram: diagram, eqDiagram: eqDiagram, simp: simp, eqR: eqR, tq: tq
    },
    mount: mount
  };
  if (global.EELabs) global.EELabs.register(def);
})(typeof window !== 'undefined' ? window : this);
