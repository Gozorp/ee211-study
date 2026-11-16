/* EE 211 — Oscilloscope lab (topic "scope").
 * Explore: a function-generator signal (sine / square / triangle, or the capacitor voltage of an RC driven by a
 * square wave) on a 10 x 8 division screen with 1-2-5 knobs, vertical position, DC/AC coupling, probe attenuation vs
 * the scope's probe setting, trigger level/slope and two cursors.
 * Practice: read a random (seeded) screen and enter T, f, Vpp, Vpk, Vrms (and V_DC); or set the knobs so one period
 * fills at least 4 divisions.
 * All maths is in `model` (pure, DOM-free) and is re-checked by build/tests/test_lab_scope.py.
 */
(function (global) {
  'use strict';

  /* ================================================================== model */
  var TWO_PI = 2 * Math.PI;
  var SQRT2 = Math.sqrt(2), SQRT3 = Math.sqrt(3);

  /* 1-2-5 sequence between lo and hi (inclusive), clean floats. */
  function seq(lo, hi) {
    var out = [];
    for (var e = -10; e <= 4; e++) {
      [1, 2, 5].forEach(function (m) {
        var v = +(m * Math.pow(10, e)).toPrecision(3);
        if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
      });
    }
    return out;
  }
  /* V/div at the scope INPUT (what the knob really sets). The label on screen = this x the scope's probe setting. */
  var VDIV_IN = seq(1e-3, 100);
  var TDIV = seq(1e-7, 5);
  function vdivOptions(scopeProbe) { return VDIV_IN.map(function (v) { return +(v * (scopeProbe || 1)).toPrecision(3); }); }
  function snap(list, v) {
    var best = list[0];
    list.forEach(function (x) { if (Math.abs(Math.log(x / v)) < Math.abs(Math.log(best / v))) best = x; });
    return best;
  }

  function frac(x) { return x - Math.floor(x); }
  function tanh(x) { var e = Math.exp(-2 * Math.abs(x)); var r = (1 - e) / (1 + e); return x < 0 ? -r : r; }

  /* Normalised periodic shapes, ph = fraction of a cycle in [0,1). All start at 0 going up (square: high first half). */
  function waveNorm(shape, ph) {
    ph = frac(ph);
    if (shape === 'square') return ph < 0.5 ? 1 : -1;
    if (shape === 'triangle') return ph < 0.25 ? 4 * ph : (ph < 0.75 ? 2 - 4 * ph : 4 * ph - 4);
    return Math.sin(TWO_PI * ph);
  }
  /* RC driven by a symmetric square wave (+A first half, -A second half), steady state: capacitor swings ±V0. */
  function rcV0(amp, f, tau) { var T = 1 / f; return amp * tanh(T / (4 * tau)); }

  /* sig = {shape, f, amp, offset, tau, phase} ; returns the true voltage at the probe tip at time t (s). */
  function signalValue(sig, t) {
    var ph = frac(t * sig.f + (sig.phase || 0));
    var off = sig.offset || 0;
    if (sig.shape === 'rc') {
      var T = 1 / sig.f, A = sig.amp, tau = sig.tau, V0 = rcV0(A, sig.f, tau);
      if (ph < 0.5) return off + A - (A + V0) * Math.exp(-ph * T / tau);
      return off - A + (A + V0) * Math.exp(-(ph - 0.5) * T / tau);
    }
    return off + sig.amp * waveNorm(sig.shape, ph);
  }

  /* RMS of the AC part (DC offset removed). */
  function rmsAC(sig) {
    var A = sig.amp;
    if (sig.shape === 'square') return A;
    if (sig.shape === 'triangle') return A / SQRT3;
    if (sig.shape === 'rc') {
      var T = 1 / sig.f, h = T / 2, tau = sig.tau, V0 = rcV0(A, sig.f, tau), r = h / tau;
      if (r < 1e-3) return V0 / SQRT3;   // tau >> T: the capacitor voltage is a triangle of peak V0
      var B = A + V0;
      var ms = A * A - 2 * A * B * (1 - Math.exp(-r)) / r + B * B * (1 - Math.exp(-2 * r)) / (2 * r);
      return Math.sqrt(Math.max(0, ms));
    }
    return A / SQRT2;
  }

  /* Everything true about the signal at the probe tip. */
  function stats(sig) {
    var T = 1 / sig.f;
    var pk = sig.shape === 'rc' ? rcV0(sig.amp, sig.f, sig.tau) : sig.amp;
    var off = sig.offset || 0;
    var r = rmsAC(sig);
    return {
      T: T, f: sig.f, omega: TWO_PI * sig.f,
      vpk: pk, vpp: 2 * pk, vmax: off + pk, vmin: off - pk,
      vdc: off, vavg: off, vrmsAC: r, vrmsTotal: Math.sqrt(off * off + r * r),
      rmsFactor: pk > 0 ? r / pk : NaN
    };
  }

  /* What the scope displays. sc = {vdiv (label), tdiv, pos, coupling 'DC'|'AC', probe (actual 1|10), scopeProbe (1|10),
   * trig (V, displayed), slope 'rise'|'fall'}. k = scope setting / probe: matched -> 1; 10x probe, 1x menu -> 0.1. */
  function displayFactor(sc) { return (sc.scopeProbe || 1) / (sc.probe || 1); }
  function displayValue(sig, sc, t) {
    var dc = sc.coupling === 'AC' ? (sig.offset || 0) : 0;
    return displayFactor(sc) * (signalValue(sig, t) - dc);
  }
  function displayStats(sig, sc) {
    var s = stats(sig), k = displayFactor(sc), ac = sc.coupling === 'AC';
    var dc = ac ? 0 : s.vdc;
    return {
      k: k, T: s.T, f: s.f, omega: s.omega,
      vpk: k * s.vpk, vpp: k * s.vpp, vmax: k * (dc + s.vpk), vmin: k * (dc - s.vpk),
      vavg: k * dc, vrmsAC: k * s.vrmsAC, vrms: k * Math.sqrt(dc * dc + s.vrmsAC * s.vrmsAC)
    };
  }

  /* Time (s, within the first period) where the displayed signal crosses sc.trig with the chosen slope; null if never. */
  function findTrigger(sig, sc) {
    var T = 1 / sig.f, N = 720, L = sc.trig || 0, rise = sc.slope !== 'fall';
    // scan one full period starting half a step before t = 0, so a crossing exactly at t = 0 is not missed
    var prev = displayValue(sig, sc, -T / (2 * N));
    for (var i = 0; i < N; i++) {
      var ta = T * (i - 0.5) / N, tb = T * (i + 0.5) / N;
      var b = displayValue(sig, sc, tb);
      var hit = rise ? (prev < L && b >= L) : (prev > L && b <= L);
      if (hit) {
        var lo = ta, hi = tb;
        for (var k = 0; k < 60; k++) {
          var mid = (lo + hi) / 2, m = displayValue(sig, sc, mid);
          if (rise ? m < L : m > L) lo = mid; else hi = mid;
        }
        var r = hi - T * Math.floor(hi / T);
        return r >= T || r < 0 ? 0 : r;
      }
      prev = b;
    }
    return null;
  }
  /* Screen y (divisions from the centre line, + up) at screen x (divisions from the left edge, 0..10).
   * The trigger point sits at the centre of the screen (x = 5), as on the scope in the videos. */
  function screenTime(sc, t0, x) { return t0 + (x - 5) * sc.tdiv; }
  function screenY(sig, sc, t0, x) { return displayValue(sig, sc, screenTime(sc, t0, x)) / sc.vdiv + (sc.pos || 0); }

  function geometry(sig, sc) {
    var d = displayStats(sig, sc), pos = sc.pos || 0;
    var top = d.vmax / sc.vdiv + pos, bottom = d.vmin / sc.vdiv + pos;
    return {
      periodDiv: d.T / sc.tdiv, cycles: 10 * sc.tdiv / d.T, heightDiv: d.vpp / sc.vdiv,
      top: top, bottom: bottom, clipTop: top > 4 + 1e-9, clipBottom: bottom < -4 - 1e-9,
      fits: top <= 4 + 1e-9 && bottom >= -4 - 1e-9,
      freqReadable: 10 * sc.tdiv >= d.T * (1 - 1e-9),
      trigDiv: (sc.trig || 0) / sc.vdiv + pos
    };
  }

  /* Cursor readout. mode 'time': c in div from the left (times measured from the trigger point at the centre);
   * mode 'volt': c in div from the centre line (voltages measured from the channel's 0 V marker). */
  function cursorRead(sc, mode, c1, c2) {
    if (mode === 'time') {
      var t1 = (c1 - 5) * sc.tdiv, t2 = (c2 - 5) * sc.tdiv, dt = t2 - t1;
      return { t1: t1, t2: t2, dt: Math.abs(dt), inv: dt !== 0 ? 1 / Math.abs(dt) : Infinity };
    }
    var v1 = (c1 - (sc.pos || 0)) * sc.vdiv, v2 = (c2 - (sc.pos || 0)) * sc.vdiv;
    return { v1: v1, v2: v2, dv: Math.abs(v2 - v1) };
  }

  /* Time cursors also read the trace: displayed volts (from the 0 V marker) where each cursor line meets the trace,
   * t0 = signal time at the trigger point (screen centre). dvTrue = the same difference at the probe tip (÷ k).
   * off1/off2: the trace point is outside the 8-division screen. */
  function cursorTrace(sig, sc, t0, c1, c2) {
    var v1 = displayValue(sig, sc, screenTime(sc, t0, c1)), v2 = displayValue(sig, sc, screenTime(sc, t0, c2));
    var pos = sc.pos || 0, lim = 4 + 1e-9;
    return { v1: v1, v2: v2, dv: Math.abs(v2 - v1), dvTrue: Math.abs(v2 - v1) / displayFactor(sc),
      off1: Math.abs(v1 / sc.vdiv + pos) > lim, off2: Math.abs(v2 / sc.vdiv + pos) > lim };
  }
  /* Trigger text in the bottom bar. showLevel false (reading practice) hides the level: it would give the DC level away. */
  function trigText(sc, triggered, showLevel, F) {
    F = F || function (v, u) { return v + ' ' + u; };
    var arrow = sc.slope === 'fall' ? '↓' : '↑';
    if (!showLevel) return 'Trig ' + arrow;
    return triggered ? 'Trig ' + arrow + ' ' + F(sc.trig, 'V', 3) : 'Trig?  ' + F(sc.trig, 'V', 3);
  }

  /* Smallest V/div (label) from the 1-2-5 list that keeps the whole trace on screen at position 0. */
  function bestVdiv(sig, sc) {
    var opts = vdivOptions(sc.scopeProbe || 1);
    var d = displayStats(sig, sc);
    var need = Math.max(Math.abs(d.vmax), Math.abs(d.vmin)) / 4;
    for (var i = 0; i < opts.length; i++) if (opts[i] >= need * (1 - 1e-9)) return opts[i];
    return opts[opts.length - 1];
  }
  /* Goals of the "set the controls" challenge. */
  function setupGoals(sig, sc) {
    var g = geometry(sig, sc), best = bestVdiv(sig, sc);
    var periodOk = g.periodDiv >= 4 - 1e-9 && g.periodDiv <= 10 + 1e-9;
    var bestOk = g.fits && sc.vdiv <= best * (1 + 1e-9);
    return { periodDiv: g.periodDiv, periodOk: periodOk, fits: g.fits, heightDiv: g.heightDiv, best: best, bestOk: bestOk,
      done: periodOk && g.fits && bestOk };
  }

  /* ---------------------------------------------------------------- seeded practice */
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(r, list) { return list[Math.floor(r() * list.length) % list.length]; }
  function clean(v) { return +v.toPrecision(12); }

  var READ_VDIV_IN = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5];
  var READ_TDIV = [1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2];
  var READ_PERIOD_DIV = [1.6, 2, 2.4, 3.2, 4, 5];

  /* level: 'basic' | 'offset' | 'probe'. Every crest, trough and trigger crossing lands on a 0.2-div minor tick. */
  function genRead(seed, level) {
    var r = rng(seed * 7919 + (level === 'offset' ? 17 : level === 'probe' ? 31 : 3));
    var shape = pick(r, ['sine', 'sine', 'square', 'triangle']);
    var vIn = pick(r, READ_VDIV_IN), tdiv = pick(r, READ_TDIV), m = pick(r, READ_PERIOD_DIV);
    var probe = 1, scopeProbe = 1, offDiv = 0, ampDiv;
    if (level === 'offset') {
      offDiv = (2 + Math.floor(r() * 7)) / 5 * (r() < 0.5 ? -1 : 1);          // ±0.4 … ±1.6 div
      var maxA = Math.round((3.8 - Math.abs(offDiv)) * 5);                   // keep the trace inside ±3.8 div
      ampDiv = (5 + Math.floor(r() * (maxA - 4))) / 5;                       // 1.0 div …
    } else {
      ampDiv = (6 + Math.floor(r() * 14)) / 5;                               // 1.2 … 3.8 div
      if (level === 'probe') { if (r() < 0.5) { probe = 10; scopeProbe = 1; } else { probe = 1; scopeProbe = 10; } }
    }
    var label = clean(vIn * scopeProbe);
    var trueScale = clean(label * probe / scopeProbe);                         // volts per division at the probe tip
    var sig = { shape: shape, f: clean(1 / (m * tdiv)), amp: clean(ampDiv * trueScale), offset: clean(offDiv * trueScale), tau: 0, phase: 0 };
    var sc = { vdiv: label, tdiv: tdiv, pos: 0, coupling: 'DC', probe: probe, scopeProbe: scopeProbe, trig: clean(offDiv * label), slope: 'rise' };
    var s = stats(sig);
    return {
      seed: seed, level: level, sig: sig, sc: sc, ampDiv: ampDiv, offDiv: offDiv, periodDiv: m, trueScale: trueScale,
      ans: { T: s.T, f: s.f, vpp: s.vpp, vpk: s.vpk, vrms: s.vrmsAC, vdc: s.vdc },
      fields: level === 'offset' ? ['T', 'f', 'vpp', 'vpk', 'vrms', 'vdc'] : ['T', 'f', 'vpp', 'vpk', 'vrms']
    };
  }

  var SETUP_F = [50, 60, 100, 120, 200, 250, 400, 500, 1000, 1200, 2000, 2500, 5000, 8000, 10000];
  var SETUP_AMP = [0.15, 0.3, 0.45, 0.6, 0.8, 1.2, 1.5, 2.5, 3.3, 4, 6, 9, 12, 17];
  /* "Set the controls" challenge: a sine/square/triangle with deliberately bad starting knobs. */
  function genSetup(seed) {
    var r = rng(seed * 104729 + 11);
    var shape = pick(r, ['sine', 'sine', 'square', 'triangle']);
    var f = pick(r, SETUP_F), A = pick(r, SETUP_AMP);
    var sig = { shape: shape, f: f, amp: A, offset: 0, tau: 0, phase: 0 };
    var T = 1 / f;
    var tGood = snap(TDIV, T / 6);
    var tStart = r() < 0.5 ? snap(TDIV, T * 3) : snap(TDIV, T / 40);          // too many cycles, or a sliver of one
    var vGood = bestVdiv(sig, { scopeProbe: 1, probe: 1, coupling: 'DC' });
    var iv = VDIV_IN.indexOf(vGood);
    var vStart = VDIV_IN[Math.max(0, Math.min(VDIV_IN.length - 1, r() < 0.5 ? iv - 3 : iv + 4))];
    var sc = { vdiv: vStart, tdiv: tStart, pos: 0, coupling: 'DC', probe: 1, scopeProbe: 1, trig: 0, slope: 'rise' };
    return { seed: seed, sig: sig, sc: sc, hintT: tGood };
  }

  /* ---------------------------------------------------------------- answer checking */
  var UNIT_OF = { T: 's', f: 'Hz', vpp: 'V', vpk: 'V', vrms: 'V', vdc: 'V' };
  function parseAnswer(str) {
    var s = String(str == null ? '' : str).trim();
    if (!s) return { err: 'empty' };
    var P = global.EEPractice && global.EEPractice.parseQuantity;
    if (P) { var q = P(s); if (q && !q.err) return { value: q.value, unit: q.unit || null }; if (q && q.err === 'unit') return { err: 'unit', text: q.text }; return { err: 'parse' }; }
    var m = s.replace(/−/g, '-').match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([pnuµmkM]?)(\S*)$/i);
    if (!m) return { err: 'parse' };
    var mult = { p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, m: 1e-3, k: 1e3, M: 1e6, '': 1 }[m[2]] || 1;
    var u = m[3] ? (/^hz$/i.test(m[3]) ? 'Hz' : /^v/i.test(m[3]) ? 'V' : /^s$/.test(m[3]) ? 's' : null) : null;
    return { value: parseFloat(m[1]) * mult, unit: u };
  }
  function within(v, target, tol) { return Math.abs(v - target) <= tol; }
  function rel(v, target, r) { return target !== 0 ? Math.abs(v - target) <= Math.abs(target) * r : Math.abs(v) < 1e-12; }

  /* Tolerances: ±0.1 div (half of a 0.2-div minor tick) on the division count read for that quantity, plus 0.5 %
   * for rounding; f follows from the T interval; Vrms from the Vpk interval (+1 % for 0.707-style rounding). */
  function tolerances(task) {
    var s = task.sc, ts = task.trueScale, a = task.ans;
    var tT = Math.max(0.1 * s.tdiv, 0.005 * a.T);
    var tV = 0.1 * ts;
    return {
      T: tT,
      fLo: 1 / (a.T + tT) * 0.995, fHi: 1 / (a.T - tT) * 1.005,
      vpp: Math.max(tV, 0.005 * a.vpp), vpk: Math.max(tV, 0.005 * a.vpk),
      vrmsLo: (a.vpk - tV) * (a.vrms / a.vpk) * 0.99, vrmsHi: (a.vpk + tV) * (a.vrms / a.vpk) * 1.01,
      vdc: Math.max(tV, 0.005 * Math.abs(a.vdc))
    };
  }
  function okField(key, v, task, tol) {
    var a = task.ans;
    if (key === 'f') return v >= tol.fLo && v <= tol.fHi;
    if (key === 'vrms') return v >= tol.vrmsLo && v <= tol.vrmsHi;
    if (key === 'vdc') return within(v, a.vdc, tol.vdc);
    return within(v, a[key], tol[key]);
  }

  /* Returns {fields:{key:{state:'ok'|'wrong'|'empty'|'invalid', msg, review}}, allOk, nOk}. Messages explain the
   * likely slip without giving the number away; review = [lessonId, secId] to open. */
  function checkRead(task, answers) {
    var F = global.EELabs && global.EELabs.kit ? global.EELabs.kit.fmt : function (v, u) { return v + ' ' + u; };
    var a = task.ans, sc = task.sc, tol = tolerances(task), k = displayFactor(sc), ts = task.trueScale;
    var out = { fields: {}, allOk: true, nOk: 0 };
    var parsed = {};
    task.fields.forEach(function (key) { parsed[key] = parseAnswer(answers ? answers[key] : ''); });
    var tStudent = parsed.T && parsed.T.value != null && (!parsed.T.unit || parsed.T.unit === 's') ? parsed.T.value : null;
    var tOk = tStudent != null && okField('T', tStudent, task, tol);
    var vpkStudent = parsed.vpk && parsed.vpk.value != null ? parsed.vpk.value : null;
    var vpkOk = vpkStudent != null && okField('vpk', vpkStudent, task, tol);
    function n(v) { return F(v, '', 3); }
    function asDivV(v) { return n(v / ts) + ' div at the true scale of ' + F(ts, 'V') + '/div'; }

    task.fields.forEach(function (key) {
      var p = parsed[key], res = { state: 'wrong', msg: '', review: null };
      var unit = UNIT_OF[key];
      if (p.err === 'empty') { res.state = 'empty'; res.msg = 'Enter a value.'; out.allOk = false; out.fields[key] = res; return; }
      if (p.err) { res.state = 'invalid'; res.msg = 'Could not read that number. Use a number with an optional prefix and unit, e.g. ' + (unit === 's' ? '6.4 ms' : unit === 'Hz' ? '156 Hz' : '2.4 V') + '.'; out.allOk = false; out.fields[key] = res; return; }
      if (p.unit && p.unit !== unit) {
        res.state = 'invalid';
        res.msg = key === 'T' ? 'A period is a time: give it in s (ms and µs are fine).' : key === 'f' ? 'Frequency is in Hz (kHz is fine). If you have a time, take f = 1/T.' : 'This is a voltage: give it in V (mV is fine).';
        out.allOk = false; out.fields[key] = res; return;
      }
      var v = p.value;
      if (okField(key, v, task, tol)) { res.state = 'ok'; res.msg = 'Correct.'; out.nOk += 1; out.fields[key] = res; return; }
      out.allOk = false;
      var m = '';
      var slip = [1e3, 1e-3, 1e6, 1e-6].filter(function (x) { return okField(key, v / x, task, tol); })[0];
      if (key === 'T') {
        res.review = ['os1', 'os1-scope-demo'];
        var d = v / sc.tdiv;
        if (rel(v, task.periodDiv, 0.03)) m = 'That is the number of divisions, not a time. Multiply the divisions per cycle by the time/div (' + F(sc.tdiv, 's') + '/div).' + (slip ? ' (If you meant a time in ms or µs, write the prefix.)' : '');
        else if (slip) m = 'The digits are right but the prefix is off by a factor of ' + F(slip >= 1 ? slip : 1 / slip, '') + '. Check ms versus µs versus s.';
        else if (rel(v, a.T / 2, 0.06)) m = 'Your ' + F(v, 's') + ' is ' + n(d) + ' div at ' + F(sc.tdiv, 's') + '/div: that is half a cycle (for example a rising crossing to the next falling one). A period ends where the waveform repeats at the same level going the same way.';
        else if (rel(v, 2 * a.T, 0.06)) m = 'Your ' + F(v, 's') + ' is ' + n(d) + ' div: that spans two cycles. Measure between two neighbouring repeats.';
        else if (rel(v, 10 * sc.tdiv, 0.02)) m = 'That is the width of the whole screen (10 div × time/div), not one cycle.';
        else if (rel(v, sc.tdiv, 0.02)) m = 'That is the time/div setting itself. Count how many divisions one cycle spans, then multiply.';
        else m = 'Your ' + F(v, 's') + ' corresponds to ' + n(d) + ' div at ' + F(sc.tdiv, 's') + '/div. Recount the divisions between two points where the cycle repeats (e.g. two rising crossings of the centre of the swing).';
      } else if (key === 'f') {
        res.review = ['os2', 'os2-period'];
        if (slip) m = 'Unit slip: 1/ms gives kHz, 1/µs gives MHz, 1/s gives Hz. Your number is off by a factor of ' + F(slip >= 1 ? slip : 1 / slip, '') + '.';
        else if (rel(v, a.f * TWO_PI, 0.02)) m = 'That is ω = 2πf in rad/s. The frequency in Hz is cycles per second: f = 1/T.';
        else if (rel(v, a.T, 0.02) || rel(v, a.T * 1e3, 0.02)) m = 'That looks like the period. Frequency is its reciprocal: f = 1/T.';
        else if (tStudent != null && !tOk && rel(v, 1 / tStudent, 0.02)) m = 'This is 1/T for your period, so the method is right. Fix the period first.';
        else if (rel(v, a.f * 2, 0.06)) m = 'This is twice the frequency: it comes from half a period. Use the time of one full cycle.';
        else if (rel(v, a.f / 2, 0.06)) m = 'This is half the frequency: it comes from two periods. Use the time of one cycle.';
        else m = 'Take f = 1/T with T in seconds (or use 1/ms = kHz). Your value would need T = ' + F(1 / v, 's') + '.';
      } else if (key === 'vpp' || key === 'vpk' || key === 'vrms' || key === 'vdc') {
        res.review = ['os1', 'os1-magnitude'];
        var shown = function (x) { return rel(v, x * k, 0.03) && k !== 1; };
        // screen = true × k. Correct: true = screen ÷ k. Backwards: screen × k = true × k². Twice: screen ÷ k ÷ k = true ÷ k.
        var wrongWay = function (x) { return rel(v, x * k * k, 0.03) && k !== 1; };
        var twice = function (x) { return rel(v, x / k, 0.03) && k !== 1; };
        var probeMsg = function (x) {
          if (wrongWay(x)) return 'The probe correction went the wrong way: the screen value was ' + (k < 1 ? 'divided by ' + F(1 / k, '') + ' instead of multiplied' : 'multiplied by ' + F(k, '') + ' instead of divided') + ', so the result is 100× ' + (k < 1 ? 'too small' : 'too large') + '. True voltage = screen voltage × (probe ÷ scope setting) = screen × ' + F(1 / k, '') + '.';
          if (twice(x)) return 'The probe correction was applied twice, so the result is 10× ' + (k < 1 ? 'too large' : 'too small') + '. Correct the screen reading once: true voltage = screen voltage × (probe ÷ scope setting) = screen × ' + F(1 / k, '') + '.';
          return '';
        };
        // crest and trough measured from 0 V (they include the DC offset)
        var vmax = a.vdc + a.vpk, vmin = a.vdc - a.vpk;
        var fromZero = function (x) { return a.vdc !== 0 && Math.abs(x) > 1e-12 && rel(Math.abs(v), Math.abs(x), 0.03); };
        var fromZeroMsg = function (what) {
          return what === 'crest' ? 'That is the crest measured from 0 V (' + (vmax >= 0 ? 'the highest voltage' : 'a negative voltage, because the offset is larger than the peak') + '), which includes the DC offset.'
            : 'That is the size of the trough measured from 0 V (the most negative voltage), which includes the DC offset.';
        };
        var label = sc.vdiv;
        var divCount = key === 'vpp' ? 2 * task.ampDiv : key === 'vpk' ? task.ampDiv : key === 'vdc' ? Math.abs(task.offDiv) : NaN;
        if (key === 'vpp') {
          if (shown(a.vpp)) { m = 'You read the screen correctly but did not correct for the probe: the probe is ×' + sc.probe + ' and the scope is set to ×' + sc.scopeProbe + ', so every voltage on the screen is ' + (k < 1 ? '10× too small' : '10× too large') + '.'; res.review = ['os2', 'os2-probes']; }
          else if (probeMsg(a.vpp)) { m = probeMsg(a.vpp); res.review = ['os2', 'os2-probes']; }
          else if (rel(v, a.vpk, 0.03)) m = 'That is the peak (centre of the swing to a crest). Peak-to-peak runs from a trough to a crest, twice as many divisions.';
          else if (slip) m = 'The prefix is off by a factor of ' + F(slip >= 1 ? slip : 1 / slip, '') + ' (mV versus V).';
          else if (rel(v, divCount, 0.03)) m = 'That is the number of divisions. Volts = divisions × V/div.';
          else if (rel(v, divCount / label, 0.03)) m = 'You divided the divisions by V/div. Volts = divisions × V/div.';
          else m = 'Your value is ' + asDivV(v) + '. Count trough to crest in divisions and multiply by the V/div.';
        } else if (key === 'vpk') {
          if (shown(a.vpk)) { m = 'Right number of divisions, but the probe correction is missing (probe ×' + sc.probe + ', scope set to ×' + sc.scopeProbe + ').'; res.review = ['os2', 'os2-probes']; }
          else if (probeMsg(a.vpk)) { m = probeMsg(a.vpk); res.review = ['os2', 'os2-probes']; }
          else if (rel(v, a.vpp, 0.03)) m = 'That is peak-to-peak (trough to crest). The peak is half of it: centre of the swing to a crest.';
          else if (fromZero(vmax)) { m = fromZeroMsg('crest') + ' The peak of the AC part is measured from the middle of the swing to a crest.'; res.review = ['os1', 'os1-assumptions']; }
          else if (fromZero(vmin)) { m = fromZeroMsg('trough') + ' The peak of the AC part is measured from the middle of the swing to a crest.'; res.review = ['os1', 'os1-assumptions']; }
          else if (slip) m = 'The prefix is off by a factor of ' + F(slip >= 1 ? slip : 1 / slip, '') + ' (mV versus V).';
          else if (rel(v, divCount, 0.03)) m = 'That is the number of divisions. Multiply by the V/div.';
          else if (rel(v, divCount / label, 0.03)) m = 'You divided by the V/div. Volts = divisions × V/div.';
          else m = 'Your value is ' + asDivV(v) + '. Count from the middle of the swing to a crest.';
        } else if (key === 'vrms') {
          res.review = ['os1', 'os1-magnitude'];
          var sh = task.sig.shape;
          var fac = a.vrms / a.vpk;
          if (shown(a.vrms)) { m = 'Method right, but the probe correction is missing.'; res.review = ['os2', 'os2-probes']; }
          else if (probeMsg(a.vrms)) { m = probeMsg(a.vrms); res.review = ['os2', 'os2-probes']; }
          else if (a.vdc !== 0 && rel(v, Math.sqrt(a.vdc * a.vdc + a.vrms * a.vrms), 0.02)) m = 'That is the RMS of the whole signal, DC included. The question asks for the AC part only.';
          else if (fromZero(vmax * fac)) m = 'You converted the crest measured from 0 V, which includes the DC offset. Use the peak of the AC part (middle of the swing to a crest).';
          else if (fromZero(vmin * fac)) m = 'You converted the trough measured from 0 V, which includes the DC offset. Use the peak of the AC part (middle of the swing to a crest).';
          else if (vpkStudent != null && !vpkOk && rel(v, vpkStudent * a.vrms / a.vpk, 0.02)) m = 'This follows correctly from your peak value. Fix the peak first.';
          else if (rel(v, a.vpp / SQRT2, 0.03)) m = 'You applied 1/√2 to the peak-to-peak value. Shape factors convert the peak (half of Vpp).';
          else if (sh === 'sine' && rel(v, a.vpk, 0.02)) m = 'That is the peak. For a sine, V_RMS = V_pk/√2 ≈ 0.707 V_pk.';
          else if (sh === 'square' && rel(v, a.vpk / SQRT2, 0.02)) m = '0.707 is the factor for a sine only. A square wave sits at ±V_pk all the time, so its RMS equals V_pk.';
          else if (sh === 'triangle' && rel(v, a.vpk / SQRT2, 0.02)) m = '0.707 is the factor for a sine only. For a triangle wave V_RMS = V_pk/√3 ≈ 0.577 V_pk.';
          else if (sh === 'triangle' && rel(v, a.vpk, 0.02)) m = 'That is the peak. For a triangle wave V_RMS = V_pk/√3.';
          else m = 'Use the peak of the AC part and the shape factor: sine 1/√2, square 1, triangle 1/√3.';
        } else {
          res.review = ['os1', 'os1-assumptions'];
          if (Math.abs(v) < 1e-12) m = 'The trace is not centred on the 0 V marker (1▸): with DC coupling the shift of the middle of the swing is the DC level.';
          else if (shown(a.vdc)) m = 'Right position, but the probe correction is missing.';
          else if (probeMsg(a.vdc)) m = probeMsg(a.vdc);
          else if (rel(v, a.vdc + a.vpk, 0.03)) m = 'That is the crest. The DC level (average) is the middle of the swing, halfway between crest and trough.';
          else if (rel(v, a.vdc - a.vpk, 0.03)) m = 'That is the trough. The DC level is the middle of the swing.';
          else if (Math.abs(v) < 1e-12) m = 'The trace is not centred on the 0 V marker (1▸): with DC coupling the shift of the middle of the swing is the DC level.';
          else if (rel(v, -a.vdc, 0.03)) m = 'Right size, wrong sign: is the middle of the swing above or below the 0 V marker?';
          else m = 'Your value is ' + asDivV(v) + '. Find the middle of the swing relative to the 0 V marker on the left edge.';
        }
      }
      res.msg = m;
      out.fields[key] = res;
    });
    return out;
  }

  var model = {
    VDIV_IN: VDIV_IN, TDIV: TDIV, vdivOptions: vdivOptions, snap: snap, seq: seq,
    waveNorm: waveNorm, rcV0: rcV0, signalValue: signalValue, rmsAC: rmsAC, stats: stats,
    displayFactor: displayFactor, displayValue: displayValue, displayStats: displayStats,
    findTrigger: findTrigger, screenTime: screenTime, screenY: screenY, geometry: geometry, cursorRead: cursorRead,
    cursorTrace: cursorTrace, trigText: trigText,
    bestVdiv: bestVdiv, setupGoals: setupGoals, rng: rng, genRead: genRead, genSetup: genSetup,
    parseAnswer: parseAnswer, tolerances: tolerances, checkRead: checkRead
  };

  /* ================================================================== presets (sources in work/redesign/labs/scope.md) */
  function ex(o) {
    var base = { shape: 'sine', f: 1000, amp: 2.5, offset: 0, tau: 0.0047, vdiv: 1, tdiv: 5e-4, pos: 0, coupling: 'DC',
      probe: 1, scopeProbe: 1, trig: 0, slope: 'rise', cursors: 'off', c1: 3, c2: 7, meas: true };
    Object.keys(o).forEach(function (k) { base[k] = o[k]; });
    return { mode: 'explore', ex: base };
  }
  var PRESETS = [
    { id: 'os1-ex5a', label: 'os1 Ex 5: 10 kHz at 500 µs/div', lesson: 'os1', sec: 'os1-scope-demo', t: '45:22',
      values: ex({ f: 10000, amp: 2.5, vdiv: 2, tdiv: 5e-4, trig: 1.2 }) },
    { id: 'os1-ex5b', label: 'os1 Ex 5: 10 kHz at 50 µs/div', lesson: 'os1', sec: 'os1-scope-demo', t: '46:10',
      values: ex({ f: 10000, amp: 2.5, vdiv: 1, tdiv: 5e-5, trig: 1.2 }) },
    { id: 'os1-60hz-fast', label: 'os1 §4.4: 60 Hz at 50 µs/div', lesson: 'os1', sec: 'os1-scope-demo', t: '47:18',
      values: ex({ f: 60, amp: 2.5, vdiv: 1, tdiv: 5e-5, trig: 0.08 }) },
    { id: 'os1-ex6', label: 'os1 Ex 6: 60 Hz at 5 ms/div', lesson: 'os1', sec: 'os1-scope-demo', t: '47:45',
      values: ex({ f: 60, amp: 2.5, vdiv: 1, tdiv: 5e-3, trig: 0.08 }) },
    { id: 'os1-ex7', label: 'os1 Ex 7: 1 kHz at 500 µs/div', lesson: 'os1', sec: 'os1-scope-demo', t: '48:34',
      values: ex({ f: 1000, amp: 2.5, vdiv: 1, tdiv: 5e-4, trig: 0.08 }) },
    { id: 'os1-ex9', label: 'os1 Ex 9: transformer output, cursors', lesson: 'os1', sec: 'os1-wall-measure', t: '1:21:35',
      values: ex({ f: 60, amp: 40, vdiv: 20, tdiv: 5e-3, cursors: 'volt', c1: 2, c2: -1.96 }) },
    { id: 'os1-ex10', label: 'os1 Ex 10: wall outlet, cursors', lesson: 'os1', sec: 'os1-wall-measure', t: '1:24:58',
      values: ex({ f: 60, amp: 170, vdiv: 100, tdiv: 5e-3, cursors: 'volt', c1: 1.72, c2: -1.76 }) },
    { id: 'os2-start', label: 'os2 §5: 500 mV/div, 5 µs/div', lesson: 'os2', sec: 'os2-vdiv', t: '1:17:06',
      values: ex({ f: 60, amp: 5, vdiv: 0.5, tdiv: 5e-6, probe: 10, scopeProbe: 10, trig: -0.2 }) },
    { id: 'os2-offscreen', label: 'os2 §5: 500 mV/div, 2 ms/div', lesson: 'os2', sec: 'os2-vdiv', t: '1:17:52',
      values: ex({ f: 60, amp: 5, vdiv: 0.5, tdiv: 2e-3, probe: 10, scopeProbe: 10, trig: -0.2 }) },
    { id: 'os2-ex5', label: 'os2 Ex 5: 2 V/div, 5 ms/div', lesson: 'os2', sec: 'os2-vdiv', t: '1:18:21',
      values: ex({ f: 60, amp: 5, vdiv: 2, tdiv: 5e-3, probe: 10, scopeProbe: 10, trig: -0.2 }) },
    { id: 'os2-ex6', label: 'os2 Ex 6: period with time cursors', lesson: 'os2', sec: 'os2-period', t: '1:19:52',
      values: ex({ f: 60, amp: 5, vdiv: 2, tdiv: 5e-3, probe: 10, scopeProbe: 10, trig: -0.2, cursors: 'time', c1: 5.04, c2: 8.38 }) },
    { id: 'os3-ex1', label: 'os3 Ex 1: outlet, 170 V pk, 60 Hz', lesson: 'os3', sec: 'os3-outlet', t: '16:43',
      values: ex({ f: 60, amp: 170, vdiv: 50, tdiv: 2e-3 }) },
    { id: 'cl4-1tau', label: 'cl4 §8.4: τ with cursors (1τ)', lesson: 'cl4', sec: 'cl4-scope', t: '1:21:55',
      values: ex({ shape: 'rc', f: 12, amp: 5, tau: 0.0047, vdiv: 2, tdiv: 0.01, probe: 10, scopeProbe: 10, trig: 0, cursors: 'time', c1: 4.674, c2: 5.144 }) },
    { id: 'cl4-5tau', label: 'cl4 §8.6: 5τ with cursors', lesson: 'cl4', sec: 'cl4-scope', t: '1:31:15',
      values: ex({ shape: 'rc', f: 12, amp: 5, tau: 0.0047, vdiv: 2, tdiv: 0.01, probe: 10, scopeProbe: 10, trig: 0, cursors: 'time', c1: 4.674, c2: 7.024 }) }
  ];
  /* Notes shown under the screen when a preset is loaded (what is read from the screen vs estimated). */
  var PRESET_NOTE = {
    'os1-ex5a': 'Settings from the screen at [45:22] (the V/div is partly hidden and appears to read 2 V). The generator amplitude is never stated; 2.5 V peak is an estimate read from the grid in Example 7. Trigger rising at 1.2 V, as listed for this screen (the guide notes it read "80mV" later).',
    'os1-ex5b': 'Settings and F = 10.0001 kHz from the screen at [46:10]. Amplitude 2.5 V peak is estimated (not stated in the video). Trigger rising at 1.2 V, as listed for this screen (the guide notes it read "80mV" later).',
    'os1-60hz-fast': 'The generator was turned down to 60 Hz while the time base was still 50 µs/div: a sliver of one cycle, and the frequency readout gave up ("<2Hz" at [47:18]). Amplitude estimated. Trigger rising at 80 mV: the guide lists "1.2V" at the start of the demo and "80mV" later without saying when it changed, so the later value is used here.',
    'os1-ex6': 'Settings from the screen at [47:45] (F 59.9924 Hz); about three cycles. Amplitude estimated. Trigger rising at 80 mV: the guide lists "1.2V" at the start of the demo and "80mV" later without saying when it changed, so the later value is used here.',
    'os1-ex7': 'Settings from the screen at [48:34]. The ≈2.5 V peak is the guide\'s own reading of the grid, so treat it as approximate. Trigger rising at 80 mV: the guide lists "1.2V" at the start of the demo and "80mV" later without saying when it changed, so the later value is used here.',
    'os1-ex9': '20 V/div and 5 ms/div from the screen. The instructor rounds the cursor readout (40.0 V and −39.2 V, Δ 79.2 V) to 80 V p-p = 40 V peak; the signal here is 40 V peak. Probe setting not shown in the video (matched 1× assumed).',
    'os1-ex10': 'The V/div was hidden behind the webcam inset; ≈100 V/div is inferred from the trace height. Cursors as on screen: 172 V and −176 V (Δ 348 V); the instructor reads 170 V peak, 340 V p-p. Probe setting not shown (matched 1× assumed).',
    'os2-start': 'Start of the bench demo: 500 mV/div and 5 µs/div, so the screen spans only 50 µs of a 16.7 ms period. Trigger CH1 rising at −200 mV as read from the screen at [1:17:20]. Probe 10X as shown in the CH2 menu [1:21:42]; assumed the same for CH1 (the display is the same whenever probe and menu match).',
    'os2-offscreen': 'At 500 mV/div a 5 V peak needs 10 divisions above centre, but the screen has 4.',
    'os2-ex5': 'The chosen settings: the peak sits 2.5 div above centre, 2.5 div × 2 V/div = 5 V.',
    'os2-ex6': 'Time cursors as on screen at [1:19:52]: 200 µs and 16.9 ms from the trigger point, Δ = 16.7 ms, f = 1/Δt ≈ 59.9 Hz. In the video both cursors met the trace at 80.0 mV (ΔV = 0, equivalent points). Here the trace voltages at the cursors differ by about 0.06 V, because the 5 V amplitude and the rounded cursor times are approximations.',
    'os3-ex1': 'Drawn to scale as in the guide\'s added figure (50 V/div, 2 ms/div): 170 V peak is 3.4 div and one 16.7 ms period is 8.33 div. Do not probe a wall outlet without a rated scope and probe.',
    'cl4-1tau': 'Capacitor of the 470 Ω, 10 µF demo (τ = 4.7 ms) driven by a ≈12 Hz square wave; 2 V/div, 10 ms/div, probe ×10 with the menu at 10X, trigger rising at 0 V. The generator amplitude is not stated; ±5 V is taken from the capacitor swing on the screen. Cursor 1 at the start of the rise, cursor 2 at Δt = 4.70 ms. The ideal model gives ΔV = 6.32 V; the video read about 5.8–6.2 V.',
    'cl4-5tau': 'Cursor 2 moved to Δt = 23.5 ms (5τ). The ideal model gives ΔV = 9.93 V (99.3 % of the step); the video read 9.67–9.76 V.'
  };

  var LESSON_TOPIC = { os1: 'scope', os2: 'scope', os3: 'scope', cl4: 'lc' };
  var REVIEW_TEXT = {
    'os1-scope-demo': 'os1 §4: reading the screen, frequency and period',
    'os1-magnitude': 'os1 §2: peak, peak-to-peak and RMS',
    'os1-assumptions': 'os1: sine-wave and DC-offset assumptions',
    'os2-period': 'os2 §6: period and frequency, 1/ms = kHz',
    'os2-probes': 'os2 §4: probe 10X and the channel menu',
    'os2-vdiv': 'os2 §5: choosing volts/division and time/division'
  };
  function lessonHref(lesson, sec) { return '#/t/' + (LESSON_TOPIC[lesson] || 'scope') + '/understand/' + lesson + (sec ? '/' + sec : ''); }

  var ASSUMPTIONS = [
    'Ideal, noise-free function generator and scope: the trace is exact and perfectly stable once triggered. Real traces have noise (the instructor used Average 32 to clean them).',
    'Screen: 10 horizontal × 8 vertical divisions, minor ticks every 0.2 div on the centre axes, trigger point at the centre of the screen (cursor times are measured from it, as on the scope in os2).',
    'Shapes: sine \\(V_{DC} + V_{pk}\\sin(2\\pi f t)\\); square and triangle with the same peak; "RC" = capacitor voltage of a series RC driven by a ±\\(V_{pk}\\) square wave, in steady state: it swings ±\\(V_{pk}\\tanh\\!\\big(T/(4\\tau)\\big)\\).',
    'RMS of the AC part: sine \\(V_{pk}/\\sqrt2\\), square \\(V_{pk}\\), triangle \\(V_{pk}/\\sqrt3\\), RC from the definition (square → mean → root). "Incl. DC" = \\(\\sqrt{V_{DC}^2 + V_{RMS(ac)}^2}\\), what a DC-coupled RMS measurement reads.',
    'Probe: a ×10 probe delivers 1/10 of the tip voltage (idealised 9 MΩ + 1 MΩ divider, compensation ignored). The scope multiplies by its probe setting, so readings are true only when the setting matches the probe.',
    'AC coupling removes the DC level only; the signal frequency is assumed far above the coupling corner (no tilt or droop).',
    'Knob ranges are generic (1 mV/div to 100 V/div at the input, 100 ns/div to 5 s/div), not one particular scope model. No roll mode, bandwidth limit or sampling artefacts are modelled; when a cycle is narrower than a few pixels the trace is drawn as a band.',
    'The frequency readout needs at least one full cycle on screen (with less, the scope in os1 showed "<2Hz").'
  ];

  /* ================================================================== view */
  var CSS = [
    '.lab-scope-screen{position:relative;border-radius:var(--r-md);background:var(--sc-bg);padding:6px;box-shadow:var(--sh-1);}',
    '.lab-scope-screen canvas{display:block;width:100%;height:auto;border-radius:6px;}',
    '.lab-scope-desc{font-size:var(--fs-xs);color:var(--ink-2);margin:0;}',
    '.lab-scope-row{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center;}',
    '.lab-scope-check{display:inline-flex;gap:6px;align-items:center;font-size:var(--fs-sm);cursor:pointer;}',
    '.lab-scope-check input{accent-color:var(--topic);width:16px;height:16px;}',
    '.lab-scope-task{display:flex;flex-direction:column;gap:var(--sp-3);}',
    '.lab-scope-task p{margin:0;}',
    '.lab-scope-fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:var(--sp-3);}',
    '.lab-scope-field{display:flex;flex-direction:column;gap:4px;border:1px solid var(--line);border-radius:var(--r-md);padding:var(--sp-2) var(--sp-3);background:var(--surface);}',
    '.lab-scope-field label{font-size:var(--fs-sm);font-weight:600;color:var(--ink);}',
    '.lab-scope-field input{font-family:var(--font-mono);font-size:var(--fs-sm);padding:6px 8px;border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--surface);color:var(--ink);min-width:0;}',
    '.lab-scope-field input:focus-visible{outline:2px solid var(--topic);outline-offset:1px;}',
    '.lab-scope-field.ok{border-color:var(--ok);background:var(--ok-soft);}',
    '.lab-scope-field.bad{border-color:var(--bad);background:var(--bad-soft);}',
    '.lab-scope-field.bad input{border-color:var(--bad);}',
    '.lab-scope-fb{font-size:var(--fs-sm);color:var(--ink);}',
    '.lab-scope-fb:empty{display:none;}',
    '.lab-scope-fb b{font-weight:700;}',
    '.lab-scope-field.ok .lab-scope-fb b{color:var(--ok);}',
    '.lab-scope-field.bad .lab-scope-fb b{color:var(--bad);}',
    '.lab-scope-fb a, .lab-scope-goals a, .lab-scope-note a{color:var(--link);}',
    '.lab-scope-field.shake{animation:lab-scope-shake 0.32s var(--ease-in-out) 1;}',
    '@keyframes lab-scope-shake{0%,100%{transform:translateX(0);}25%{transform:translateX(-4px);}75%{transform:translateX(4px);}}',
    '@media (prefers-reduced-motion: reduce){.lab-scope-field.shake{animation:none;}}',
    '.lab-scope-goals{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:var(--fs-sm);}',
    '.lab-scope-goals li{display:flex;gap:8px;align-items:baseline;padding:6px 10px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface);}',
    '.lab-scope-goals li .tag{font-family:var(--font-mono);font-size:var(--fs-xs);font-weight:600;min-width:5.2em;color:var(--ink-2);}',
    '.lab-scope-goals li.done{border-color:var(--ok);background:var(--ok-soft);}',
    '.lab-scope-goals li.done .tag{color:var(--ok);}',
    '.lab-scope-sol ol{margin:0;padding:0 var(--sp-4) var(--sp-3) calc(var(--sp-4) + 1em);font-size:var(--fs-sm);}',
    '.lab-scope-sol li + li{margin-top:6px;}',
    '.lab-scope-settings{font-family:var(--font-mono);font-size:var(--fs-sm);margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px 12px;}',
    '.lab-scope-settings dt{color:var(--ink-2);}',
    '.lab-scope-settings dd{margin:0;color:var(--ink);}',
    '.lab-scope-sub{font-size:var(--fs-xs);color:var(--ink-2);margin:0;}',
    '.lab[data-lab="scope"] [hidden]{display:none !important;}'
  ].join('\n');

  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('lab-scope-css')) return;
    var s = document.createElement('style');
    s.id = 'lab-scope-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var SHAPE_NAME = { sine: 'sine', square: 'square', triangle: 'triangle', rc: 'RC (capacitor voltage, square drive)' };

  function mount(el, ctx) {
    var kit = ctx.kit || global.EELabs.kit;
    var h = kit.h, fmt = kit.fmt, tex = kit.tex;
    injectCss();
    var def = global.EELabs.get('scope');

    /* ---------------------------------------------------------------- state */
    var DEFAULT = PRESETS[1].values; // os1 Example 5 at 50 µs/div: the first fully legible screen in the lessons
    function fresh() {
      return { mode: 'explore', ex: JSON.parse(JSON.stringify(DEFAULT.ex)), presetId: 'os1-ex5b',
        read: { seed: 1, level: 'basic', ans: {}, checked: false, revealed: false },
        setup: { seed: 1, vdiv: null, tdiv: null, pos: 0 } };
    }
    function merge(base, v) {
      if (!v || typeof v !== 'object') return base;
      if (v.mode) base.mode = v.mode;
      if (v.ex) Object.keys(v.ex).forEach(function (k) { base.ex[k] = v.ex[k]; });
      if (v.read) Object.keys(v.read).forEach(function (k) { base.read[k] = v.read[k]; });
      if (v.setup) Object.keys(v.setup).forEach(function (k) { base.setup[k] = v.setup[k]; });
      if ('presetId' in v) base.presetId = v.presetId;
      return base;
    }
    var S = fresh();
    if (ctx.preset) { merge(S, ctx.preset); S.presetId = ctx.presetId || null; }   // a preset (lesson link) wins over the saved state
    else if (ctx.state) merge(S, ctx.state);
    sanitize();

    function sanitize() {
      var e = S.ex;
      if (['sine', 'square', 'triangle', 'rc'].indexOf(e.shape) < 0) e.shape = 'sine';
      e.probe = e.probe === 10 ? 10 : 1; e.scopeProbe = e.scopeProbe === 10 ? 10 : 1;
      e.vdiv = snap(vdivOptions(e.scopeProbe), +e.vdiv > 0 ? +e.vdiv : 1);
      e.tdiv = snap(TDIV, +e.tdiv > 0 ? +e.tdiv : 1e-3);
      if (!(e.f > 0)) e.f = 1000; if (!(e.amp > 0)) e.amp = 1; if (!isFinite(e.offset)) e.offset = 0;
      if (!(e.tau > 0)) e.tau = 0.0047; if (!isFinite(e.pos)) e.pos = 0; if (!isFinite(e.trig)) e.trig = 0;
      if (e.coupling !== 'AC') e.coupling = 'DC';
      if (e.slope !== 'fall') e.slope = 'rise';
      if (['off', 'time', 'volt'].indexOf(e.cursors) < 0) e.cursors = 'off';
      if (!isFinite(e.c1)) e.c1 = 3; if (!isFinite(e.c2)) e.c2 = 7;
      if (['explore', 'read', 'setup'].indexOf(S.mode) < 0) S.mode = 'explore';
      if (['basic', 'offset', 'probe'].indexOf(S.read.level) < 0) S.read.level = 'basic';
      if (!(S.read.seed >= 1)) S.read.seed = 1; if (!(S.setup.seed >= 1)) S.setup.seed = 1;
      if (!S.read.ans || typeof S.read.ans !== 'object') S.read.ans = {};
    }
    var saveSoon = kit.debounce(function () { if (ctx.save) ctx.save(JSON.parse(JSON.stringify(S))); }, 250);

    /* current task objects */
    var readTask = null, setupTask = null;
    function ensureTasks() {
      if (!readTask || readTask.seed !== S.read.seed || readTask.level !== S.read.level) readTask = genRead(S.read.seed, S.read.level);
      if (!setupTask || setupTask.seed !== S.setup.seed) {
        setupTask = genSetup(S.setup.seed);
        if (S.setup.vdiv == null || S.setup.tdiv == null) { S.setup.vdiv = setupTask.sc.vdiv; S.setup.tdiv = setupTask.sc.tdiv; S.setup.pos = 0; }
      }
    }
    /* signal + scope settings currently on the screen */
    function current() {
      ensureTasks();
      if (S.mode === 'read') return { sig: readTask.sig, sc: readTask.sc };
      if (S.mode === 'setup') {
        var sc = JSON.parse(JSON.stringify(setupTask.sc));
        sc.vdiv = S.setup.vdiv; sc.tdiv = S.setup.tdiv; sc.pos = S.setup.pos || 0;
        return { sig: setupTask.sig, sc: sc };
      }
      var e = S.ex;
      return { sig: { shape: e.shape, f: e.f, amp: e.amp, offset: e.offset, tau: e.tau, phase: 0 },
        sc: { vdiv: e.vdiv, tdiv: e.tdiv, pos: e.pos, coupling: e.coupling, probe: e.probe, scopeProbe: e.scopeProbe, trig: e.trig, slope: e.slope } };
    }

    /* ---------------------------------------------------------------- frame */
    var F = kit.frame(def, { onPreset: applyPreset, layout: 'wide-controls' });
    el.innerHTML = '';
    el.appendChild(F.root);
    var C = F.controls, O = F.output;

    var modeSeg = kit.segmented({ label: 'Mode', value: S.mode, options: [
      { value: 'explore', label: 'Explore' }, { value: 'read', label: 'Practice: read' }, { value: 'setup', label: 'Practice: set up' }],
      onChange: function (v) { S.mode = v; changed(true); } });
    C.appendChild(modeSeg.el);

    /* ---- explore controls ---- */
    var gExplore = h('div', { class: 'lab-scope-explore' });
    C.appendChild(gExplore);
    var gGen = group('Function generator'); gExplore.appendChild(gGen);
    var shapeSeg = kit.segmented({ label: 'Shape', value: S.ex.shape, options: [
      { value: 'sine', label: 'Sine' }, { value: 'square', label: 'Square' }, { value: 'triangle', label: 'Triangle' }, { value: 'rc', label: 'RC' }],
      onChange: function (v) { S.ex.shape = v; userEdit(); } });
    gGen.appendChild(shapeSeg.el);
    var cF = kit.control({ label: 'Frequency \\(f\\)', unit: 'Hz', min: 1, max: 1e6, scale: 'log', value: S.ex.f, hardMin: 0.1, hardMax: 1e7, sig: 4, onInput: function (v) { S.ex.f = v; userEdit(); } });
    var cA = kit.control({ label: 'Amplitude \\(V_{pk}\\) (of the AC part, at the probe tip)', unit: 'V', min: 0.001, max: 500, scale: 'log', value: S.ex.amp, hardMin: 1e-4, hardMax: 1000, sig: 4, onInput: function (v) { S.ex.amp = v; userEdit(); } });
    var cOff = kit.control({ label: 'DC offset \\(V_{DC}\\)', unit: 'V', min: -20, max: 20, step: 0.05, value: S.ex.offset, hardMin: -1000, hardMax: 1000, sig: 4, onInput: function (v) { S.ex.offset = v; userEdit(); } });
    var cTau = kit.control({ label: 'Time constant \\(\\tau = RC\\)', unit: 's', min: 1e-6, max: 1, scale: 'log', value: S.ex.tau, hardMin: 1e-8, hardMax: 100, sig: 3, onInput: function (v) { S.ex.tau = v; userEdit(); },
      help: 'RC shape only: the capacitor voltage of a series RC driven by the square wave.' });
    [cF, cA, cOff, cTau].forEach(function (c) { gGen.appendChild(c.el); });

    var gProbe = group('Probe'); gExplore.appendChild(gProbe);
    var probeSeg = kit.segmented({ label: 'Switch on the probe', value: String(S.ex.probe), options: [{ value: '1', label: '×1' }, { value: '10', label: '×10' }],
      onChange: function (v) { S.ex.probe = +v; userEdit(); } });
    var menuSeg = kit.segmented({ label: 'Scope channel menu', value: String(S.ex.scopeProbe), options: [{ value: '1', label: '×1' }, { value: '10', label: '×10' }],
      onChange: function (v) { var old = S.ex.scopeProbe; S.ex.scopeProbe = +v; S.ex.vdiv = snap(vdivOptions(S.ex.scopeProbe), S.ex.vdiv * S.ex.scopeProbe / old); S.ex.trig = S.ex.trig * S.ex.scopeProbe / old; rebuildVdiv(); rebuildTrig(); userEdit(); } });
    gProbe.appendChild(probeSeg.el); gProbe.appendChild(menuSeg.el);
    gProbe.appendChild(h('p', { class: 'lab-scope-sub', text: 'Changing the menu setting relabels the V/div knob (the trace does not move); only a matching setting gives true voltages.' }));

    var gScope = group('Scope'); gExplore.appendChild(gScope);
    var vdivHolder = h('div'); gScope.appendChild(vdivHolder);
    var cT = kit.control({ label: 'Time/div', unit: 's/div', options: TDIV, value: S.ex.tdiv, sig: 3, onInput: function (v) { S.ex.tdiv = v; userEdit(); } });
    gScope.appendChild(cT.el);
    var cPos = kit.control({ label: 'Vertical position (0 V marker)', unit: 'div', min: -4, max: 4, step: 0.1, value: S.ex.pos, hardMin: -4, hardMax: 4, sig: 2, onInput: function (v) { S.ex.pos = v; userEdit(); } });
    gScope.appendChild(cPos.el);
    var coupSeg = kit.segmented({ label: 'Coupling', value: S.ex.coupling, options: [{ value: 'DC', label: 'DC' }, { value: 'AC', label: 'AC' }], onChange: function (v) { S.ex.coupling = v; userEdit(); } });
    gScope.appendChild(coupSeg.el);
    var trigHolder = h('div'); gScope.appendChild(trigHolder);
    var slopeSeg = kit.segmented({ label: 'Trigger slope', value: S.ex.slope, options: [{ value: 'rise', label: 'Rising' }, { value: 'fall', label: 'Falling' }], onChange: function (v) { S.ex.slope = v; userEdit(); } });
    var btn50 = h('button', { type: 'button', class: 'lab-btn', text: 'Trigger level to 50 %' });
    btn50.addEventListener('click', function () { var c = current(); var d = displayStats(c.sig, c.sc); S.ex.trig = +((d.vmax + d.vmin) / 2).toPrecision(6); rebuildTrig(); userEdit(); });
    gScope.appendChild(h('div', { class: 'lab-scope-row' }, [slopeSeg.el, btn50]));

    var gCur = group('Cursors'); gExplore.appendChild(gCur);
    var curSeg = kit.segmented({ label: 'Cursors', value: S.ex.cursors, options: [{ value: 'off', label: 'Off' }, { value: 'time', label: 'Time (vertical lines)' }, { value: 'volt', label: 'Voltage (horizontal lines)' }],
      onChange: function (v) { if (v !== S.ex.cursors) { if (v === 'time') { S.ex.c1 = 3; S.ex.c2 = 7; } else if (v === 'volt') { S.ex.c1 = 2; S.ex.c2 = -2; } } S.ex.cursors = v; rebuildCursors(); userEdit(); } });
    gCur.appendChild(curSeg.el);
    var curHolder = h('div', { class: 'lab-controls' }); gCur.appendChild(curHolder);
    var measBox = h('input', { type: 'checkbox' }); measBox.checked = S.ex.meas !== false;
    measBox.addEventListener('change', function () { S.ex.meas = measBox.checked; changed(false); });
    gExplore.appendChild(h('label', { class: 'lab-scope-check' }, [measBox, 'Show automatic measurements']));

    var cV = null, cTrig = null, cC1 = null, cC2 = null;
    function rebuildVdiv() {
      vdivHolder.innerHTML = '';
      cV = kit.control({ label: 'Volts/div (label on screen)', unit: 'V/div', options: vdivOptions(S.ex.scopeProbe), value: S.ex.vdiv, sig: 3, onInput: function (v) { S.ex.vdiv = v; rebuildTrig(); userEdit(); } });
      vdivHolder.appendChild(cV.el);
    }
    var trigRangeKey = '';
    function rebuildTrig(force) {
      var key = S.ex.vdiv + '|' + S.ex.scopeProbe;
      if (!force && key === trigRangeKey && cTrig) { cTrig.set(S.ex.trig); return; }
      trigRangeKey = key;
      trigHolder.innerHTML = '';
      var span = 4 * S.ex.vdiv;
      cTrig = kit.control({ label: 'Trigger level (displayed volts)', unit: 'V', min: -span, max: span, step: S.ex.vdiv / 25, value: S.ex.trig, hardMin: -1e4, hardMax: 1e4, sig: 3,
        onInput: function (v) { S.ex.trig = v; userEdit(); } });
      trigHolder.appendChild(cTrig.el);
    }
    function rebuildCursors() {
      curHolder.innerHTML = '';
      cC1 = cC2 = null;
      if (S.ex.cursors === 'off') return;
      var time = S.ex.cursors === 'time';
      var lbl = time ? 'div from the left edge' : 'div from the centre line';
      cC1 = kit.control({ label: 'Cursor 1 (' + lbl + ')', unit: 'div', min: time ? 0 : -4, max: time ? 10 : 4, step: 0.02, value: S.ex.c1, hardMin: time ? 0 : -4, hardMax: time ? 10 : 4, sig: 4, onInput: function (v) { S.ex.c1 = v; userEdit(); } });
      cC2 = kit.control({ label: 'Cursor 2 (' + lbl + ')', unit: 'div', min: time ? 0 : -4, max: time ? 10 : 4, step: 0.02, value: S.ex.c2, hardMin: time ? 0 : -4, hardMax: time ? 10 : 4, sig: 4, onInput: function (v) { S.ex.c2 = v; userEdit(); } });
      curHolder.appendChild(cC1.el); curHolder.appendChild(cC2.el);
    }
    rebuildVdiv(); rebuildTrig(true); rebuildCursors();

    /* ---- read-practice controls ---- */
    var gRead = h('div', { class: 'lab-controls' }); C.appendChild(gRead);
    var levelSeg = kit.segmented({ label: 'Level', value: S.read.level, options: [{ value: 'basic', label: 'Basic' }, { value: 'offset', label: 'DC offset' }, { value: 'probe', label: 'Probe trap' }],
      onChange: function (v) { S.read.level = v; S.read.ans = {}; S.read.checked = false; S.read.revealed = false; changed(true); } });
    var btnNew = h('button', { type: 'button', class: 'lab-btn primary', text: 'New signal' });
    btnNew.addEventListener('click', function () { S.read.seed += 1; S.read.ans = {}; S.read.checked = false; S.read.revealed = false; changed(true); });
    gRead.appendChild(levelSeg.el);
    gRead.appendChild(h('div', { class: 'lab-scope-row' }, [btnNew, h('span', { class: 'lab-scope-sub', 'data-k': 'seed' })]));
    var readSettings = h('div', { class: 'lab-group' }); gRead.appendChild(readSettings);

    /* ---- setup-practice controls ---- */
    var gSetup = h('div', { class: 'lab-controls' }); C.appendChild(gSetup);
    var btnNewSetup = h('button', { type: 'button', class: 'lab-btn primary', text: 'New challenge' });
    btnNewSetup.addEventListener('click', function () { S.setup.seed += 1; S.setup.vdiv = null; S.setup.tdiv = null; S.setup.pos = 0; setupTask = null; ensureTasks(); syncSetupControls(); changed(true); });
    gSetup.appendChild(h('div', { class: 'lab-scope-row' }, [btnNewSetup]));
    var setupInfo = h('div', { class: 'lab-note' }); gSetup.appendChild(setupInfo);
    var gSetupKnobs = group('Scope'); gSetup.appendChild(gSetupKnobs);
    var sV = kit.control({ label: 'Volts/div', unit: 'V/div', options: VDIV_IN, value: 1, sig: 3, onInput: function (v) { S.setup.vdiv = v; changed(false); } });
    var sT = kit.control({ label: 'Time/div', unit: 's/div', options: TDIV, value: 1e-3, sig: 3, onInput: function (v) { S.setup.tdiv = v; changed(false); } });
    var sP = kit.control({ label: 'Vertical position (0 V marker)', unit: 'div', min: -4, max: 4, step: 0.1, value: 0, hardMin: -4, hardMax: 4, sig: 2, onInput: function (v) { S.setup.pos = v; changed(false); } });
    [sV, sT, sP].forEach(function (c) { gSetupKnobs.appendChild(c.el); });
    function syncSetupControls() { ensureTasks(); sV.set(S.setup.vdiv); sT.set(S.setup.tdiv); sP.set(S.setup.pos || 0); }
    syncSetupControls();

    /* ---- output: screen ---- */
    var screenWrap = h('div', { class: 'lab-scope-screen' });
    var canvas = h('canvas', { role: 'img', 'aria-label': 'Oscilloscope screen' });
    screenWrap.appendChild(canvas);
    O.appendChild(screenWrap);
    var descEl = h('p', { class: 'lab-scope-desc', 'aria-live': 'off' });
    O.appendChild(descEl);
    var noteHolder = h('div', { class: 'lab-controls' }); O.appendChild(noteHolder);

    /* explore output */
    var oExplore = h('div', { class: 'lab-output' }); O.appendChild(oExplore);
    var ro = kit.readout([
      { key: 'T', label: 'Period \\(T\\)', unit: 's', emph: true },
      { key: 'f', label: 'Frequency \\(f\\)', unit: 'Hz', emph: true },
      { key: 'vpp', label: '\\(V_{pp}\\)', unit: 'V', emph: true },
      { key: 'vpk', label: '\\(V_{pk}\\) (AC part)', unit: 'V' },
      { key: 'vrms', label: '\\(V_{RMS}\\) (AC part)', unit: 'V' },
      { key: 'vrmsTot', label: '\\(V_{RMS}\\) incl. DC', unit: 'V' },
      { key: 'vavg', label: '\\(V_{avg}\\)', unit: 'V' },
      { key: 'w', label: '\\(\\omega = 2\\pi f\\)', unit: 'rad/s' },
      { key: 'perDiv', label: 'One cycle spans', unit: 'div' },
      { key: 'hDiv', label: 'Trace height', unit: 'div' },
      { key: 'cyc', label: 'Cycles on screen', unit: '' }
    ]);
    var roHead = h('p', { class: 'lab-scope-sub', text: 'Automatic measurements (what this scope would report with its current settings):' });
    oExplore.appendChild(roHead);
    oExplore.appendChild(ro.el);
    var curRoT = kit.readout([
      { key: 'a', label: 'Cursor 1 time', unit: 's' }, { key: 'b', label: 'Cursor 2 time', unit: 's' }, { key: 'd', label: '\\(\\Delta t\\)', unit: 's', emph: true }, { key: 'e', label: '\\(1/\\Delta t\\)', unit: 'Hz' },
      { key: 'v1', label: 'Trace at cursor 1', unit: 'V', sig: 3 }, { key: 'v2', label: 'Trace at cursor 2', unit: 'V', sig: 3 }, { key: 'dv', label: '\\(\\Delta V\\) between the cursors', unit: 'V', sig: 3, emph: true }, { key: 'dvt', label: 'True \\(\\Delta V\\) at the probe tip', unit: 'V', sig: 3 }
    ], { compact: true });
    var curRoV = kit.readout([
      { key: 'a', label: 'Cursor 1', unit: 'V', sig: 3 }, { key: 'b', label: 'Cursor 2', unit: 'V', sig: 3 }, { key: 'd', label: '\\(\\Delta V\\)', unit: 'V', sig: 3, emph: true }, { key: 'e', label: 'True \\(\\Delta V\\) at the probe tip', unit: 'V', sig: 3 }
    ], { compact: true });
    oExplore.appendChild(curRoT.el); oExplore.appendChild(curRoV.el);
    var circEl = h('div'); oExplore.appendChild(circEl);
    var circ = null;
    var work = kit.workings('Show the calculation'); oExplore.appendChild(work.el);

    /* read output */
    var oRead = h('div', { class: 'lab-scope-task' }); O.appendChild(oRead);
    var readPrompt = h('div', { class: 'lab-note' }); oRead.appendChild(readPrompt);
    var fieldsWrap = h('div', { class: 'lab-scope-fields' }); oRead.appendChild(fieldsWrap);
    var btnCheck = h('button', { type: 'button', class: 'lab-btn primary', text: 'Check answers' });
    var btnSol = h('button', { type: 'button', class: 'lab-btn', text: 'Show solution' });
    var btnClear = h('button', { type: 'button', class: 'lab-btn', text: 'Clear answers' });
    oRead.appendChild(h('div', { class: 'lab-scope-row' }, [btnCheck, btnSol, btnClear]));
    var readSummary = h('div', { role: 'status', 'aria-live': 'polite' }); oRead.appendChild(readSummary);
    var solWrap = h('div'); oRead.appendChild(solWrap);
    btnCheck.addEventListener('click', function () { S.read.checked = true; renderReadFeedback(true); saveSoon(); });
    btnSol.addEventListener('click', function () { S.read.revealed = !S.read.revealed; renderSolution(); saveSoon(); });
    btnClear.addEventListener('click', function () { S.read.ans = {}; S.read.checked = false; S.read.revealed = false; buildReadFields(); renderReadFeedback(false); renderSolution(); saveSoon(); });

    /* setup output */
    var oSetup = h('div', { class: 'lab-scope-task' }); O.appendChild(oSetup);
    var goalsEl = h('ul', { class: 'lab-scope-goals' }); oSetup.appendChild(goalsEl);
    var setupStatus = h('div', { role: 'status', 'aria-live': 'polite' }); oSetup.appendChild(setupStatus);

    /* ---------------------------------------------------------------- helpers */
    function group(title) { var g = h('div', { class: 'lab-group' }); g.appendChild(h('h4', { text: title })); return g; }
    function sigWord(sig) { return SHAPE_NAME[sig.shape] || sig.shape; }
    function vd(v) { return fmt(v, 'V', 3) + '/div'; }
    function td(v) { return fmt(v, 's', 3) + '/div'; }
    function T_(v, u, s) { return ('\\text{' + fmt(v, u, s || 4) + '}').replace(/µ/g, '}\\mu\\text{').replace(/−/g, '}-\\text{'); }
    function n3(v) { return kit.sigStr(v, 3); }
    function reviewLink(r) {
      if (!r) return null;
      var a = h('a', { href: lessonHref(r[0], r[1]), text: 'Review: ' + (REVIEW_TEXT[r[1]] || r[0]) });
      return a;
    }

    function userEdit() { S.presetId = null; F.markPreset(null); changed(false); }
    function changed(structural) {
      saveSoon();
      render(structural);
    }
    function applyPreset(p) {
      merge(S, JSON.parse(JSON.stringify(p.values)));
      S.presetId = p.id;
      sanitize();
      syncExploreControls();
      render(true);
      F.markPreset(p.id);
      saveSoon();
    }
    function syncExploreControls() {
      var e = S.ex;
      modeSeg.set(S.mode); shapeSeg.set(e.shape); cF.set(e.f); cA.set(e.amp); cOff.set(e.offset); cTau.set(e.tau);
      probeSeg.set(String(e.probe)); menuSeg.set(String(e.scopeProbe)); cT.set(e.tdiv); cPos.set(e.pos); coupSeg.set(e.coupling);
      slopeSeg.set(e.slope); curSeg.set(e.cursors); measBox.checked = e.meas !== false;
      rebuildVdiv(); rebuildTrig(true); rebuildCursors();
    }

    /* ---------------------------------------------------------------- canvas drawing */
    var cssVar = function (name, fallback) {
      try { var v = getComputedStyle(el).getPropertyValue(name).trim(); return v || fallback; } catch (e) { return fallback; }
    };
    var roll = 0, rollAnim = null, lastTs = null, untriggered = false;
    var lastView = null;

    function drawScreen(view) {
      lastView = view;
      var cw = Math.max(260, Math.round(screenWrap.clientWidth - 12 || 640));
      var dpr = global.devicePixelRatio || 1;
      var D = (cw - 16) / 10;                     // pixels per division
      var gx = 8, gy = 8, GW = D * 10, GH = D * 8;
      var barH = Math.max(40, Math.round(D * 1.25));
      var ch = Math.round(gy + GH + barH);
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
      canvas.style.aspectRatio = cw + ' / ' + ch;
      var g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      var col = {
        bg: cssVar('--sc-bg', '#0d1a14'), grid: cssVar('--sc-grid', '#2f4a3c'), axis: cssVar('--sc-axis', '#5f8a74'),
        t1: cssVar('--sc-t1', '#f2d32c'), cur: cssVar('--sc-cursor', '#ff8a3d'), text: cssVar('--sc-text', '#cfe8da'), t2: cssVar('--sc-t2', '#3fc6f0')
      };
      var mono = cssVar('--font-mono', 'monospace');
      var fs = Math.max(10, Math.min(13, Math.round(D * 0.3)));
      g.fillStyle = col.bg; g.fillRect(0, 0, cw, ch);
      // graticule
      g.lineWidth = 1;
      g.strokeStyle = col.grid;
      g.setLineDash([2, 3]);
      for (var i = 1; i < 10; i++) if (i !== 5) line(g, gx + i * D, gy, gx + i * D, gy + GH);
      for (var j = 1; j < 8; j++) if (j !== 4) line(g, gx, gy + j * D, gx + GW, gy + j * D);
      g.setLineDash([]);
      g.strokeStyle = col.axis;
      g.strokeRect(gx + 0.5, gy + 0.5, GW - 1, GH - 1);
      line(g, gx + 5 * D, gy, gx + 5 * D, gy + GH);
      line(g, gx, gy + 4 * D, gx + GW, gy + 4 * D);
      for (var t = 1; t < 50; t++) { var xx = gx + t * D / 5; line(g, xx, gy + 4 * D - 3, xx, gy + 4 * D + 3); }
      for (var u = 1; u < 40; u++) { var yy = gy + u * D / 5; line(g, gx + 5 * D - 3, yy, gx + 5 * D + 3, yy); }
      var X = function (x) { return gx + x * D; };
      var Y = function (y) { return gy + (4 - y) * D; };
      var sig = view.sig, sc = view.sc, geo = view.geo;
      // trace
      g.save();
      g.beginPath(); g.rect(gx, gy, GW, GH); g.clip();
      var pxPerCycle = geo.periodDiv * D;
      g.strokeStyle = col.t1; g.fillStyle = col.t1;
      if (pxPerCycle < 4) {
        var yt = Math.min(4.2, geo.top), yb = Math.max(-4.2, geo.bottom);
        g.globalAlpha = 0.55; g.fillRect(gx, Y(yt), GW, Math.max(1.5, Y(yb) - Y(yt))); g.globalAlpha = 1;
      } else {
        g.lineWidth = 2; g.lineJoin = 'round';
        g.beginPath();
        var N = Math.round(GW * 4);
        for (var k = 0; k <= N; k++) {
          var x = 10 * k / N;
          var y = screenY(sig, sc, view.t0, x);
          y = Math.max(-6, Math.min(6, y));
          if (k === 0) g.moveTo(X(x), Y(y)); else g.lineTo(X(x), Y(y));
        }
        g.stroke();
      }
      g.restore();
      // markers: 0 V marker (left), trigger level (right), trigger point (top)
      g.font = '600 ' + fs + 'px ' + mono;
      g.fillStyle = col.t1;
      var my = Math.max(-3.9, Math.min(3.9, sc.pos || 0));
      tri(g, gx + 1, Y(my), 'right', 7);
      g.fillText('1', gx + 9, Y(my) + fs * 0.35);
      if (view.showTrig) {
        var ty = geo.trigDiv;
        if (view.showTrigLevel) {   // hidden in reading practice: the level marker would point at the DC level
          var tyc = Math.max(-3.9, Math.min(3.9, ty));
          g.fillStyle = col.cur;
          tri(g, gx + GW - 1, Y(tyc), 'left', 7);
          g.fillText('T', gx + GW - 18, Y(tyc) + fs * 0.35);
        }
        g.fillStyle = col.text;
        tri(g, X(5), gy + 1, 'down', 6);
      }
      // clipping arrows
      g.fillStyle = col.cur;
      g.textAlign = 'center';
      if (geo.clipTop) { g.fillText('▲ off screen', X(7.5), gy + fs + 4); }
      if (geo.clipBottom) { g.fillText('▼ off screen', X(7.5), gy + GH - 6); }
      g.textAlign = 'left';
      // cursors
      if (view.cursors && view.cursors !== 'off') {
        g.strokeStyle = col.cur; g.fillStyle = col.cur; g.setLineDash([5, 4]); g.lineWidth = 1.2;
        [view.c1, view.c2].forEach(function (c, i) {
          if (view.cursors === 'time') { line(g, X(c), gy, X(c), gy + GH); g.fillText('C' + (i + 1), X(c) + 3, gy + GH - 6 - i * (fs + 2)); }
          else { line(g, gx, Y(c), gx + GW, Y(c)); g.fillText('C' + (i + 1), gx + GW - 26, Y(c) - 4); }
        });
        g.setLineDash([]);
        // readout box top-left
        var cr = view.cr, lines;
        if (view.cursors === 'time') {
          var cv = view.cv, vtx = function (v, off) { return !view.triggered ? '—' : off ? 'off screen' : fmt(v, 'V', 3); };
          lines = ['C1 ' + fmt(cr.t1, 's', 4) + '  ' + vtx(cv.v1, cv.off1), 'C2 ' + fmt(cr.t2, 's', 4) + '  ' + vtx(cv.v2, cv.off2),
            'Δt ' + fmt(cr.dt, 's', 4) + '  1/Δt ' + fmt(cr.inv, 'Hz', 4), 'ΔV ' + (view.triggered && !cv.off1 && !cv.off2 ? fmt(cv.dv, 'V', 3) : '—')];
        }
        else lines = ['C1 ' + fmt(cr.v1, 'V', 3), 'C2 ' + fmt(cr.v2, 'V', 3), 'Δ ' + fmt(cr.dv, 'V', 3)];
        var bw = 0; lines.forEach(function (s) { bw = Math.max(bw, g.measureText(s).width); });
        g.fillStyle = col.bg; g.globalAlpha = 0.85; g.fillRect(gx + 4, gy + 4, bw + 12, lines.length * (fs + 3) + 8); g.globalAlpha = 1;
        g.strokeStyle = col.axis; g.strokeRect(gx + 4.5, gy + 4.5, bw + 11, lines.length * (fs + 3) + 7);
        g.fillStyle = col.cur;
        lines.forEach(function (s, i) { g.fillText(s, gx + 10, gy + 8 + (i + 1) * (fs + 3) - 3); });
      }
      // bottom bar
      var by = gy + GH + 6;
      g.fillStyle = col.text;
      g.font = '600 ' + fs + 'px ' + mono;
      var left = 'CH1 ' + (sc.coupling === 'AC' ? 'AC' : 'DC') + ' ' + vd(sc.vdiv) + '  ×' + sc.scopeProbe;
      var mid = td(sc.tdiv);
      g.fillText(left, gx, by + fs);
      g.fillText(mid, gx, by + 2 * fs + 6);
      g.textAlign = 'right';
      var trigTxt = trigText(sc, view.triggered, view.showTrigLevel, fmt);
      g.fillText(trigTxt, gx + GW, by + fs);
      if (view.showF) g.fillText(geo.freqReadable ? 'F ' + fmt(sig.f, 'Hz', 6) : 'F ?  (no full cycle)', gx + GW, by + 2 * fs + 6);
      g.textAlign = 'left';
    }
    function line(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5); g.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5); g.stroke(); }
    function tri(g, x, y, dir, s) {
      g.beginPath();
      if (dir === 'right') { g.moveTo(x, y - s * 0.7); g.lineTo(x + s, y); g.lineTo(x, y + s * 0.7); }
      else if (dir === 'left') { g.moveTo(x, y - s * 0.7); g.lineTo(x - s, y); g.lineTo(x, y + s * 0.7); }
      else { g.moveTo(x - s * 0.7, y); g.lineTo(x + s * 0.7, y); g.lineTo(x, y + s); }
      g.closePath(); g.fill();
    }

    function startRoll() {
      if (rollAnim || kit.reducedMotion()) return;
      lastTs = null;
      var step = function (ts) {
        if (!untriggered || !lastView) { rollAnim = null; return; }
        if (lastTs != null) roll += (ts - lastTs) / 1000 * 0.35 / lastView.sig.f; // drifts 0.35 cycle per second
        lastTs = ts;
        lastView.t0 = roll;
        drawScreen(lastView);
        rollAnim = global.requestAnimationFrame(step);
      };
      rollAnim = global.requestAnimationFrame(step);
    }
    function stopRoll() { if (rollAnim) global.cancelAnimationFrame(rollAnim); rollAnim = null; }

    /* ---------------------------------------------------------------- description (text alternative) */
    function describe(sig, sc, geo, triggered) {
      var parts = [];
      parts.push('Screen: ' + vd(sc.vdiv) + ', ' + td(sc.tdiv) + ', ' + (sc.coupling === 'AC' ? 'AC' : 'DC') + ' coupling, 0 V marker at ' + n3(sc.pos || 0) + ' div.');
      if (geo.periodDiv * 10 < 0.4 * 10 && geo.cycles > 25) parts.push('About ' + n3(geo.cycles) + ' cycles are squeezed across the screen; individual cycles cannot be seen.');
      else if (!geo.freqReadable) parts.push('Less than one cycle is visible (' + n3(geo.cycles) + ' of a cycle); one cycle would span ' + n3(geo.periodDiv) + ' div.');
      else parts.push(sigWord(sig).charAt(0).toUpperCase() + sigWord(sig).slice(1) + ' trace: one cycle spans ' + n3(geo.periodDiv) + ' div (' + n3(geo.cycles) + ' cycles on screen).');
      parts.push('Highest point ' + n3(geo.top) + ' div, lowest ' + n3(geo.bottom) + ' div from the centre line' + (geo.fits ? '.' : ' (part of the trace is off screen).'));
      if (!triggered) parts.push('Not triggered: the trigger level is outside the trace, so a real display would not stand still.');
      return parts.join(' ');
    }

    /* ---------------------------------------------------------------- main render */
    var lastMode = null;
    function render(structural) {
      ensureTasks();
      var mode = S.mode;
      if (structural || mode !== lastMode) {
        gExplore.hidden = mode !== 'explore'; oExplore.hidden = mode !== 'explore';
        gRead.hidden = mode !== 'read'; oRead.hidden = mode !== 'read';
        gSetup.hidden = mode !== 'setup'; oSetup.hidden = mode !== 'setup';
        if (F.presetBar) F.presetBar.hidden = false;
        if (mode === 'read') { buildReadFields(); renderReadFeedback(false); renderSolution(); }
        if (mode === 'setup') syncSetupControls();
        lastMode = mode;
      }
      cTau.el.hidden = S.ex.shape !== 'rc';
      var cur = current(), sig = cur.sig, sc = cur.sc;
      var t0 = findTrigger(sig, sc);
      var triggered = t0 != null;
      untriggered = !triggered;
      var geo = geometry(sig, sc);
      var cursors = mode === 'explore' ? S.ex.cursors : 'off';
      var cr = cursors !== 'off' ? cursorRead(sc, cursors, S.ex.c1, S.ex.c2) : null;
      var cv = cursors === 'time' ? cursorTrace(sig, sc, triggered ? t0 : roll, S.ex.c1, S.ex.c2) : null;
      var view = { sig: sig, sc: sc, geo: geo, t0: triggered ? t0 : roll, triggered: triggered, showF: mode !== 'read', showTrig: true, showTrigLevel: mode !== 'read',
        cursors: cursors, c1: S.ex.c1, c2: S.ex.c2, cr: cr, cv: cv };
      drawScreen(view);
      if (untriggered) startRoll(); else stopRoll();
      var desc = describe(sig, sc, geo, triggered);
      canvas.setAttribute('aria-label', 'Oscilloscope screen. ' + desc);
      descEl.textContent = desc;
      descEl.hidden = mode === 'read';   // in the reading task the description stays on the canvas's aria-label only
      renderNotes(mode, sig, sc, geo, triggered);
      if (mode === 'explore') renderExplore(sig, sc, geo, cr, cv, triggered ? t0 : null);
      else if (mode === 'read') renderReadSettings();
      else renderSetup(sig, sc);
    }

    function renderNotes(mode, sig, sc, geo, triggered) {
      noteHolder.innerHTML = '';
      var add = function (html, kind) { noteHolder.appendChild(kit.note(html, kind)); };
      if (mode === 'explore' && S.presetId && PRESET_NOTE[S.presetId]) {
        var p = null; PRESETS.forEach(function (x) { if (x.id === S.presetId) p = x; });
        var n = kit.note(PRESET_NOTE[S.presetId] + ' ', '');
        n.classList.add('lab-scope-note');
        if (p) n.appendChild(h('a', { href: lessonHref(p.lesson, p.sec), text: 'Open ' + p.lesson + ' (' + p.sec + ', at ' + p.t + ')' }));
        noteHolder.appendChild(n);
      }
      if (mode === 'read') return;
      if (!triggered) add('Not triggered: the trigger level (' + fmt(sc.trig, 'V', 3) + ') is never crossed by the displayed trace, so the picture cannot be held still' + (kit.reducedMotion() ? '' : ' (it drifts, as on a real scope)') + '. Move the trigger level inside the trace or press "Trigger level to 50 %".', 'warn');
      if (geo.clipTop || geo.clipBottom) add('The trace runs off the ' + (geo.clipTop && geo.clipBottom ? 'top and bottom' : geo.clipTop ? 'top' : 'bottom') + ' of the 8-division screen: peaks cannot be read. Increase the volts/div' + ((sc.pos || 0) !== 0 ? ' or recentre the trace' : '') + '. (os2 §5: a 5 V peak at 500 mV/div needs 10 divisions.)', 'warn');
      if (geo.periodDiv * 10 < 4 && geo.cycles > 25) add('Too many cycles on the screen (' + n3(geo.cycles) + ') to see individual cycles: decrease the time/div.', 'warn');
      else if (!geo.freqReadable) add('Less than one full cycle on the screen (' + n3(geo.cycles) + ' of a cycle): the frequency readout cannot work (os1 showed "<2Hz"). Increase the time/div.', 'warn');
      if (mode === 'explore' && sc.probe !== sc.scopeProbe) add('Probe mismatch: the probe is ×' + sc.probe + ' but the channel menu says ×' + sc.scopeProbe + '. Every voltage on the screen and in the measurements is ' + (sc.probe > sc.scopeProbe ? '10× too small' : '10× too large') + '. Time and frequency are not affected.', 'bad');
      if (mode === 'explore' && sc.coupling === 'AC' && (sig.offset || 0) !== 0) add('AC coupling blocks the ' + fmt(sig.offset, 'V', 3) + ' DC level: the trace is centred on the 0 V marker and \\(V_{avg}\\) reads 0.', '');
    }

    function renderExplore(sig, sc, geo, cr, cv, t0) {
      var d = displayStats(sig, sc), s = stats(sig);
      var show = S.ex.meas !== false;
      ro.el.hidden = !show; roHead.hidden = !show;
      if (show) {
        ro.update({
          T: geo.freqReadable ? d.T : '— (needs a full cycle)', f: geo.freqReadable ? d.f : '— (needs a full cycle)',
          vpp: geo.fits ? d.vpp : 'clipped', vpk: geo.fits ? d.vpk : 'clipped', vrms: geo.fits ? d.vrmsAC : 'clipped',
          vrmsTot: geo.fits ? d.vrms : 'clipped', vavg: geo.fits ? d.vavg : 'clipped', w: geo.freqReadable ? d.omega : '— (needs a full cycle)',
          perDiv: geo.periodDiv, hDiv: geo.heightDiv, cyc: geo.cycles
        });
      }
      curRoT.el.hidden = !cr || S.ex.cursors !== 'time';
      curRoV.el.hidden = !cr || S.ex.cursors !== 'volt';
      if (cr && S.ex.cursors === 'time') {
        var na = t0 == null ? '— (not triggered)' : null, offTxt = 'off screen';
        var both = !na && !cv.off1 && !cv.off2;
        curRoT.update({ a: cr.t1, b: cr.t2, d: cr.dt, e: cr.inv,
          v1: na || (cv.off1 ? offTxt : cv.v1), v2: na || (cv.off2 ? offTxt : cv.v2),
          dv: na || (both ? cv.dv : offTxt), dvt: na || (both ? cv.dvTrue : offTxt) });
      }
      if (cr && S.ex.cursors === 'volt') curRoV.update({ a: cr.v1, b: cr.v2, d: cr.dv, e: cr.dv / d.k });
      // circuit
      var spec = circuitSpec(sig, sc);
      if (!circ) circ = kit.circuit(circEl, spec); else circ.update(spec);
      // workings
      var L = [];
      L.push('T = \\frac{1}{f} = \\frac{1}{' + T_(s.f, 'Hz') + '} = ' + T_(s.T, 's'));
      L.push('\\text{one cycle} = \\frac{T}{\\text{time/div}} = \\frac{' + T_(s.T, 's') + '}{' + T_(sc.tdiv, 's', 3) + '\\text{/div}} = \\text{' + n3(geo.periodDiv) + ' div}');
      L.push('\\text{cycles on screen} = \\frac{10\\ \\text{div} \\times ' + T_(sc.tdiv, 's', 3) + '\\text{/div}}{' + T_(s.T, 's') + '} = ' + n3(geo.cycles));
      if (sig.shape === 'rc') {
        L.push('V_{pk} = A\\tanh\\!\\left(\\frac{T}{4\\tau}\\right) = ' + T_(sig.amp, 'V') + '\\times\\tanh\\!\\left(\\frac{' + T_(s.T, 's') + '}{4(' + T_(sig.tau, 's') + ')}\\right) = ' + T_(s.vpk, 'V'));
        if (rcCursorFromEdge(sig, sc, cr, t0)) L.push('\\Delta V(\\Delta t\\ \\text{after the rising edge}) = (A + V_{pk})\\left(1 - e^{-\\Delta t/\\tau}\\right) = (' + T_(sig.amp, 'V') + ' + ' + T_(s.vpk, 'V') + ')\\left(1 - e^{-' + T_(cr.dt, 's') + '/' + T_(sig.tau, 's') + '}\\right) = ' + T_(rcStep(sig, s, cr.dt), 'V'));
        else L.push('\\Delta V(\\tau\\ \\text{after an edge}) = (A + V_{pk})(1 - e^{-1}) = (' + T_(sig.amp, 'V') + ' + ' + T_(s.vpk, 'V') + ')(0.632) = ' + T_(rcStep(sig, s, sig.tau), 'V'));
      }
      if (cr && S.ex.cursors === 'time' && t0 != null && !cv.off1 && !cv.off2) {
        L.push('\\Delta V_{\\text{cursors}} = |v(t_2) - v(t_1)| = |' + T_(cv.v2, 'V') + ' - (' + T_(cv.v1, 'V') + ')| = ' + T_(cv.dv, 'V') + (d.k !== 1 ? '\\ \\text{(shown)}' : ''));
      }
      L.push('V_{pp} = 2V_{pk} = 2(' + T_(s.vpk, 'V') + ') = ' + T_(s.vpp, 'V'));
      if (d.k !== 1) L.push('\\text{shown} = \\text{true}\\times\\frac{\\text{menu setting}}{\\text{probe}} = ' + T_(s.vpp, 'V') + '\\times\\frac{' + sc.scopeProbe + '}{' + sc.probe + '} = ' + T_(d.vpp, 'V'));
      L.push('\\text{height} = \\frac{V_{pp,\\text{shown}}}{\\text{V/div}} = \\frac{' + T_(d.vpp, 'V') + '}{' + T_(sc.vdiv, 'V', 3) + '\\text{/div}} = \\text{' + n3(geo.heightDiv) + ' div}' + (geo.fits ? '\\ (\\le 8:\\ \\text{fits})' : '\\ (\\text{does not fit})'));
      var rmsTex = sig.shape === 'sine' ? 'V_{RMS} = \\frac{V_{pk}}{\\sqrt2} = \\frac{' + T_(s.vpk, 'V') + '}{\\sqrt2}' :
        sig.shape === 'square' ? 'V_{RMS} = V_{pk}' : sig.shape === 'triangle' ? 'V_{RMS} = \\frac{V_{pk}}{\\sqrt3} = \\frac{' + T_(s.vpk, 'V') + '}{\\sqrt3}' : 'V_{RMS} = \\sqrt{\\overline{v^2}}\\ \\text{(from the definition)}';
      L.push(rmsTex + ' = ' + T_(s.vrmsAC, 'V') + '\\ \\text{(AC part, true)}');
      if ((sig.offset || 0) !== 0) L.push('V_{avg} = V_{DC} = ' + T_(sig.offset, 'V') + ', \\qquad V_{RMS,\\text{incl. DC}} = \\sqrt{V_{DC}^2 + V_{RMS}^2} = ' + T_(s.vrmsTotal, 'V'));
      L.push('\\omega = 2\\pi f = 2\\pi(' + T_(s.f, 'Hz') + ') = \\text{' + kit.sigStr(s.omega, 4) + ' rad/s}');
      work.update(L);
    }

    /* Time cursors on the RC shape: cursor 1 on a rising edge of the square drive (within 0.01 div) and cursor 2 later in
     * the same half-cycle, so the step response (A + V_pk)(1 - e^(-Δt/τ)) applies to the measured Δt. */
    function rcCursorFromEdge(sig, sc, cr, t0) {
      if (!cr || S.ex.cursors !== 'time' || t0 == null || sig.shape !== 'rc') return false;
      var T = 1 / sig.f, ta = t0 + Math.min(cr.t1, cr.t2), tb = t0 + Math.max(cr.t1, cr.t2);
      var ph = ta / T - Math.floor(ta / T);
      return ph * T <= 0.01 * sc.tdiv || (1 - ph) * T <= 0.01 * sc.tdiv ? (tb - ta) <= T / 2 + 1e-12 : false;
    }
    function rcStep(sig, s, dt) { return (sig.amp + s.vpk) * (1 - Math.exp(-dt / sig.tau)); }

    function circuitSpec(sig, sc) {
      var gen = { sine: 'sine', square: 'square', triangle: 'triangle', rc: 'square' }[sig.shape];
      var val = fmt(sig.amp, 'V', 3).replace(' V', ' V_{pk}') + ', ' + fmt(sig.f, 'Hz', 4) + ((sig.offset || 0) !== 0 ? '\n' + (sig.offset > 0 ? '+' : '') + fmt(sig.offset, 'V', 3) + ' DC' : '');
      var parts = [], x0;
      parts.push({ t: 'VAC', a: [0, 3], b: [0, 0], label: gen + ' generator', value: val, side: -1 });
      if (sig.shape === 'rc') {
        parts.push({ t: 'R', a: [0, 0], b: [3, 0], label: 'R' });
        parts.push({ t: 'C', a: [3, 0], b: [3, 3], label: 'C', value: 'τ = RC\n= ' + fmt(sig.tau, 's', 3), side: -1 });
        parts.push({ t: 'W', pts: [[3, 3], [0, 3]] });
        parts.push({ t: 'W', pts: [[3, 0], [5, 0]] });
        parts.push({ t: 'W', pts: [[3, 3], [5, 3]] });
        x0 = 5;
      } else {
        parts.push({ t: 'W', pts: [[0, 0], [3, 0]] });
        parts.push({ t: 'W', pts: [[0, 3], [3, 3]] });
        x0 = 3;
      }
      parts.push({ t: 'N', at: [x0, 0], label: 'probe tip', pos: 'nw', open: true });
      parts.push({ t: 'N', at: [x0, 3], label: 'ground clip', pos: 'sw', open: true });
      if (sc.probe === 10) parts.push({ t: 'R', a: [x0, 0], b: [x0 + 3, 0], label: '9 MΩ', value: '(×10 probe)', side: -1 });
      else { parts.push({ t: 'W', pts: [[x0, 0], [x0 + 3, 0]] }); parts.push({ t: 'T', at: [x0 + 1.5, 0.7], text: '×1 probe', anchor: 'middle', size: 12 }); }
      parts.push({ t: 'W', pts: [[x0, 3], [x0 + 3, 3]] });
      parts.push({ t: 'R', a: [x0 + 3, 0], b: [x0 + 3, 3], label: '1 MΩ', value: 'scope input' });
      parts.push({ t: 'G', at: [x0 + 3, 3] });
      parts.push({ t: 'BOX', a: [x0 + 2.3, -1.3], b: [x0 + 9.2, 4.5], label: 'scope CH1' });
      parts.push({ t: 'T', at: [x0 + 7.4, 0.9], text: 'menu: ×' + sc.scopeProbe, anchor: 'middle', size: 12 });
      parts.push({ t: 'T', at: [x0 + 7.4, 1.7], text: sc.probe === sc.scopeProbe ? 'readings true' : (sc.probe > sc.scopeProbe ? 'reads 10× low' : 'reads 10× high'), anchor: 'middle', size: 12, cls: sc.probe === sc.scopeProbe ? 'muted' : 'accent' });
      var alt = 'Function generator (' + gen + ', ' + fmt(sig.amp, 'V', 3) + ' peak, ' + fmt(sig.f, 'Hz', 4) + ')' + (sig.shape === 'rc' ? ' driving a series RC; the probe measures the capacitor voltage' : '') +
        '. Probe tip and ground clip go to channel 1 through a ×' + sc.probe + ' probe; the channel menu is set to ×' + sc.scopeProbe + '.';
      return { padX: 5, parts: parts, alt: alt };
    }

    /* ---------------------------------------------------------------- read practice */
    var FIELD_DEF = {
      T: { label: 'Period \\(T\\)', ph: 'e.g. 6.4 ms' },
      f: { label: 'Frequency \\(f\\)', ph: 'e.g. 156 Hz' },
      vpp: { label: 'Peak-to-peak \\(V_{pp}\\)', ph: 'e.g. 3.2 V' },
      vpk: { label: 'Peak \\(V_{pk}\\) (AC part)', ph: 'e.g. 1.6 V' },
      vrms: { label: '\\(V_{RMS}\\) (AC part)', ph: 'e.g. 1.13 V' },
      vdc: { label: 'DC level \\(V_{DC}\\) (average)', ph: 'e.g. −0.8 V' }
    };
    var fieldEls = {};
    function buildReadFields() {
      fieldsWrap.innerHTML = '';
      fieldEls = {};
      var task = readTask;
      task.fields.forEach(function (key) {
        var id = kit.uid('scope-ans');
        var lab = h('label', { for: id }); tex(lab, FIELD_DEF[key].label);
        var inp = h('input', { type: 'text', id: id, inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', placeholder: FIELD_DEF[key].ph });
        inp.value = S.read.ans[key] || '';
        var fb = h('div', { class: 'lab-scope-fb', id: id + '-fb', 'aria-live': 'polite' });
        inp.setAttribute('aria-describedby', id + '-fb');
        inp.addEventListener('input', function () { S.read.ans[key] = inp.value; saveSoon(); });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); S.read.checked = true; renderReadFeedback(true); saveSoon(); } });
        var box = h('div', { class: 'lab-scope-field' }, [lab, inp, fb]);
        fieldEls[key] = { box: box, inp: inp, fb: fb };
        fieldsWrap.appendChild(box);
      });
      var t = readTask;
      var txt = 'Read the screen (count divisions; the small ticks on the centre axes are 0.2 div apart) and enter the values. ';
      if (t.level === 'probe') txt += t.sc.probe === 10 ? 'The probe switch is on ×10, but the channel menu was left at ×1. Give the true values at the probe tip.' : 'The probe switch is on ×1, but the channel menu says ×10. Give the true values at the probe tip.';
      else if (t.level === 'offset') txt += 'The signal has a DC offset; give the peak and RMS of the AC part and the DC level. Probe and menu match.';
      else txt += 'Probe and menu match, and the signal is centred on the 0 V marker.';
      txt += ' Answers within ±0.1 div (half a minor tick) of the exact reading are accepted.';
      tex(readPrompt, txt);
    }
    function renderReadSettings() {
      var t = readTask;
      readSettings.innerHTML = '';
      readSettings.appendChild(h('h4', { text: 'Scope settings (as displayed)' }));
      var dl = h('dl', { class: 'lab-scope-settings' });
      [['Vertical', vd(t.sc.vdiv)], ['Time base', td(t.sc.tdiv)], ['Coupling', 'DC'], ['Menu probe', '×' + t.sc.scopeProbe], ['0 V marker', 'centre line'], ['Trigger', 'rising edge, trigger point at the screen centre (level not shown)']].forEach(function (r) {
        dl.appendChild(h('dt', { text: r[0] })); dl.appendChild(h('dd', { text: r[1] }));
      });
      readSettings.appendChild(dl);
      var seedEl = gRead.querySelector('[data-k="seed"]');
      if (seedEl) seedEl.textContent = 'Signal #' + S.read.seed;
    }
    function renderReadFeedback(animate) {
      var t = readTask;
      var res = checkRead(t, S.read.ans);
      var any = false;
      t.fields.forEach(function (key) {
        var fe = fieldEls[key]; if (!fe) return;
        var r = res.fields[key];
        fe.box.classList.remove('ok', 'bad', 'shake');
        fe.fb.innerHTML = '';
        fe.inp.removeAttribute('aria-invalid');
        if (!S.read.checked) return;
        any = true;
        if (r.state === 'ok') { fe.box.classList.add('ok'); fe.fb.appendChild(h('b', { text: 'Correct. ' })); }
        else if (r.state === 'empty') { fe.fb.textContent = 'Not answered yet.'; }
        else {
          fe.box.classList.add('bad'); fe.inp.setAttribute('aria-invalid', 'true');
          fe.fb.appendChild(h('b', { text: 'Not yet. ' }));
          var sp = h('span'); tex(sp, r.msg.replace(/V_RMS/g, '\\(V_{RMS}\\)').replace(/V_pk/g, '\\(V_{pk}\\)')); fe.fb.appendChild(sp);
          var a = reviewLink(r.review); if (a) { fe.fb.appendChild(document.createTextNode(' ')); fe.fb.appendChild(a); }
          if (animate && !kit.reducedMotion()) { void fe.box.offsetWidth; fe.box.classList.add('shake'); }
        }
      });
      readSummary.innerHTML = '';
      if (any) {
        var nf = t.fields.length;
        readSummary.appendChild(kit.note(res.allOk ? 'All ' + nf + ' values are correct. Try "New signal" for another screen' + (t.level === 'basic' ? ', or a harder level.' : '.') : res.nOk + ' of ' + nf + ' correct. Fix the marked values, or open the solution for the full reading.', res.allOk ? 'ok' : ''));
      }
    }
    function renderSolution() {
      solWrap.innerHTML = '';
      btnSol.textContent = S.read.revealed ? 'Hide solution' : 'Show solution';
      btnSol.setAttribute('aria-expanded', S.read.revealed ? 'true' : 'false');
      if (!S.read.revealed) return;
      var t = readTask, sc = t.sc, a = t.ans, k = displayFactor(sc), ts = t.trueScale;
      var sh = t.sig.shape;
      var steps = [];
      if (k !== 1) steps.push('Correct the scale first. True volts/div = displayed × probe ÷ menu = ' + vd(sc.vdiv) + ' × ' + sc.probe + ' ÷ ' + sc.scopeProbe + ' = ' + vd(ts) + '. The time base needs no correction.');
      else steps.push('Scales: each vertical division is ' + vd(ts).replace('/div', '') + ', each horizontal division is ' + td(sc.tdiv).replace('/div', '') + '.');
      var crest = t.offDiv + t.ampDiv, trough = t.offDiv - t.ampDiv;
      steps.push('Vertical reading: crest at ' + n3(crest) + ' div, trough at ' + n3(trough) + ' div (from the 0 V marker). \\(V_{pp} = ' + n3(crest - trough) + '\\ \\text{div} \\times ' + T_(ts, 'V', 3) + '\\text{/div} = ' + T_(a.vpp, 'V') + '\\).');
      steps.push('\\(V_{pk} = V_{pp}/2 = ' + T_(a.vpk, 'V') + '\\) (' + n3(t.ampDiv) + ' div from the middle of the swing to a crest).');
      if (t.level === 'offset') steps.push('DC level = middle of the swing: \\((' + n3(crest) + ' + (' + n3(trough) + '))/2 = ' + n3(t.offDiv) + '\\) div, so \\(V_{DC} = ' + T_(a.vdc, 'V') + '\\).');
      steps.push('Period: the trigger crossing is at the centre (5 div) and the waveform repeats ' + n3(t.periodDiv) + ' div later. \\(T = ' + n3(t.periodDiv) + '\\ \\text{div} \\times ' + T_(sc.tdiv, 's', 3) + '\\text{/div} = ' + T_(a.T, 's') + '\\).');
      steps.push('\\(f = 1/T = 1/' + T_(a.T, 's') + ' = ' + T_(a.f, 'Hz') + '\\) (and \\(\\omega = 2\\pi f = \\text{' + kit.sigStr(TWO_PI * a.f, 4) + ' rad/s}\\)).');
      steps.push(sh === 'sine' ? 'Sine: \\(V_{RMS} = V_{pk}/\\sqrt2 = ' + T_(a.vrms, 'V') + '\\).' : sh === 'square' ? 'Square wave: it sits at \\(\\pm V_{pk}\\) all the time, so \\(V_{RMS} = V_{pk} = ' + T_(a.vrms, 'V') + '\\).' : 'Triangle wave: \\(V_{RMS} = V_{pk}/\\sqrt3 = ' + T_(a.vrms, 'V') + '\\).');
      var det = h('div', { class: 'lab-work lab-scope-sol' });
      det.appendChild(h('div', { class: 'lab-work-body' }, [h('p', { text: 'Solution (' + sigWord(t.sig) + ' wave):' })]));
      var ol = h('ol');
      steps.forEach(function (s) { var li = h('li'); tex(li, s); ol.appendChild(li); });
      det.appendChild(ol);
      var links = h('p', { class: 'lab-scope-sub' });
      links.appendChild(document.createTextNode('Lessons: '));
      [['os1', 'os1-scope-demo'], ['os2', 'os2-vdiv'], ['os2', 'os2-period'], ['os1', 'os1-magnitude']].concat(t.level === 'probe' ? [['os2', 'os2-probes']] : []).forEach(function (r, i) {
        if (i) links.appendChild(document.createTextNode(' · '));
        links.appendChild(h('a', { href: lessonHref(r[0], r[1]), text: REVIEW_TEXT[r[1]] }));
      });
      det.appendChild(h('div', { class: 'lab-work-body' }, [links]));
      solWrap.appendChild(det);
    }

    /* ---------------------------------------------------------------- setup practice */
    var lastDone = null;
    function renderSetup(sig, sc) {
      var t = setupTask;
      tex(setupInfo, 'A ' + sigWord(sig) + ' wave from the generator is on CH1 (probe and menu ×1, DC coupling), but the knobs were left in a bad place. Set them so that <b>one period spans at least 4 divisions</b> (with at least one full period on screen) and the <b>whole waveform fits</b> in the 8 vertical divisions, using the <b>smallest</b> volts/div that still fits. The frequency readout is shown; amplitudes you have to read.');
      var g = setupGoals(sig, sc);
      goalsEl.innerHTML = '';
      var items = [
        [g.periodOk, 'One period spans ' + n3(g.periodDiv) + ' div', g.periodDiv < 4 ? ' (need 4 to 10: decrease the time/div so each division holds less time)' : g.periodDiv > 10 ? ' (wider than the screen: increase the time/div)' : ''],
        [g.fits, 'Waveform ' + (g.fits ? 'fits on the screen' : 'runs off the screen'), g.fits ? '' : ' (increase the volts/div or recentre)'],
        [g.bestOk, 'Volts/div ' + vd(sc.vdiv), g.bestOk ? ' is the smallest setting that fits (trace uses ' + n3(g.heightDiv) + ' of 8 div)' : (g.fits ? ' fits, but a smaller setting would still fit and read more precisely' : '')]
      ];
      items.forEach(function (it) {
        goalsEl.appendChild(h('li', { class: it[0] ? 'done' : '' }, [h('span', { class: 'tag', text: it[0] ? 'Done' : 'Not yet' }), h('span', { text: it[1] + it[2] })]));
      });
      if (g.done !== lastDone) {
        setupStatus.innerHTML = '';
        if (g.done) {
          var msg = 'Done. One cycle is ' + fmt(1 / sig.f, 's', 3) + ' and spans ' + n3(g.periodDiv) + ' div at ' + td(sc.tdiv) + '; the trace is ' + n3(g.heightDiv) + ' div tall at ' + vd(sc.vdiv) + '. Reading error of ±0.1 div is now a small fraction of the signal. ';
          var n = kit.note(msg, 'ok');
          n.appendChild(h('a', { href: lessonHref('os2', 'os2-vdiv'), text: 'Why the smallest V/div: os2 §5' }));
          setupStatus.appendChild(n);
        }
        lastDone = g.done;
      }
    }

    /* ---------------------------------------------------------------- lifecycle */
    if (S.presetId) F.markPreset(S.presetId);
    render(true);
    // redraw only when the available WIDTH changes (drawing changes the height, which must not re-trigger the observer)
    var lastW = screenWrap.clientWidth, roRaf = null;
    var ro2 = global.ResizeObserver ? new ResizeObserver(function () {
      var w = screenWrap.clientWidth;
      if (w === lastW || roRaf) return;
      roRaf = global.requestAnimationFrame(function () { roRaf = null; lastW = screenWrap.clientWidth; if (lastView && !destroyed) drawScreen(lastView); });
    }) : null;
    if (ro2) ro2.observe(screenWrap);
    var mo = global.MutationObserver ? new MutationObserver(function () { if (lastView) drawScreen(lastView); }) : null;
    if (mo) mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    var mq = null, mqFn = function () { if (lastView) drawScreen(lastView); };
    try { mq = global.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', mqFn); else if (mq.addListener) mq.addListener(mqFn); } catch (e) { mq = null; }
    // fonts can arrive after the first paint
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (lastView && !destroyed) drawScreen(lastView); }); } catch (e) {}
    var destroyed = false;

    return {
      destroy: function () {
        destroyed = true;
        stopRoll();
        if (roRaf) global.cancelAnimationFrame(roRaf);
        if (ro2) ro2.disconnect();
        if (mo) mo.disconnect();
        if (mq) { if (mq.removeEventListener) mq.removeEventListener('change', mqFn); else if (mq.removeListener) mq.removeListener(mqFn); }
        el.innerHTML = '';
      },
      setState: function (v) {
        S = fresh(); merge(S, v); sanitize(); readTask = null; setupTask = null; ensureTasks();
        syncExploreControls(); levelSeg.set(S.read.level); syncSetupControls();
        F.markPreset(S.presetId || null);
        render(true);
      }
    };
  }

  /* ================================================================== register */
  if (global.EELabs) global.EELabs.register({
    id: 'scope', topic: 'scope',
    title: 'Oscilloscope bench',
    blurb: 'Read amplitude, period and frequency off a 10 × 8 division screen. Turn the volts/div and time/div knobs, move the trace, switch DC/AC coupling, try a ×10 probe with the wrong menu setting, set the trigger, and use cursors. Then practise on random screens.',
    assumptions: ASSUMPTIONS,
    presets: PRESETS.map(function (p) { return { id: p.id, label: p.label, lesson: p.lesson, sec: p.sec, values: p.values }; }),
    model: model,
    mount: mount
  });
})(typeof window !== 'undefined' ? window : this);
