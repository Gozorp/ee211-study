/* EE 211 — RC and RL transient labs (topic lc).
 * Registers two labs: 'rc' (sub 'rc') and 'rl' (sub 'rl').
 * All maths lives in def.model (pure functions, no DOM) and is tested by build/tests/test_lab_rcrl.py.
 * Symbols follow the guides: cl4 (RC) writes V_S, v_C, v_R, i, tau = RC; cl2 (RL) writes V_s, i, v_R, v_L, tau = L/R, I_max.
 * Sources of every preset: work/redesign/labs/rcrl.md
 */
(function (global) {
  'use strict';
  var EL = global.EELabs;
  if (!EL) return;

  /* ================================================================ maths (pure) */
  var LN = Math.log;
  function ex(u) { return Math.exp(-u); }                                        // e^(-u)
  function oneMinusEx(u) { return Math.expm1 ? -Math.expm1(-u) : 1 - Math.exp(-u); } // 1 - e^(-u), accurate for tiny u
  function pos(v) { return typeof v === 'number' && isFinite(v) && v > 0; }
  function finite(v) { return typeof v === 'number' && isFinite(v); }

  /* The universal time-constant chart as printed in the guides (cl2, cl3, cl4), rounded to 0.1 %. */
  var CHART_RISE = [63.2, 86.5, 95.0, 98.2, 99.3];
  var CHART_FALL = [36.8, 13.5, 5.0, 1.8, 0.7];

  /* ---------------- RC: series V_S, R, C ----------------
   * s = { mode: 'charge'|'discharge', Vs, R, C }
   * charge:    C uncharged, switch closes at t = 0 connecting V_S, R, C in series.
   * discharge: C charged to V_0 = V_S (switch at A for >> 5 tau), at t = 0 the switch moves to B: the source leaves
   *            the loop and C discharges through the same R.
   * Reference directions (both modes): i flows from the source + terminal through R into the top plate of C;
   * v_R and v_C are + at the top. So during discharge i and v_R are negative. */
  function rcValid(s) {
    var p = [];
    if (!s) return ['missing values'];
    if (!pos(s.Vs)) p.push('Vs');
    if (!pos(s.R)) p.push('R');
    if (!pos(s.C)) p.push('C');
    if (s.mode !== 'charge' && s.mode !== 'discharge') p.push('mode');
    return p;
  }
  function rcSummary(s) {
    var tau = s.R * s.C;
    var V0 = s.mode === 'discharge' ? s.Vs : 0;
    return {
      tau: tau, t5: 5 * tau,
      Imax: s.Vs / s.R,                 // charge: current at 0+; discharge: size of the current at 0+
      V0: V0, Vf: s.mode === 'discharge' ? 0 : s.Vs,
      W: 0.5 * s.C * s.Vs * s.Vs        // energy stored when charged to V_S (cl3: W = 1/2 C V^2)
    };
  }
  function rcAt(s, t) {
    var tau = s.R * s.C, u, x;
    if (s.mode === 'discharge') {
      var V0 = s.Vs;
      if (t < 0) return { t: t, tau: tau, u: t / tau, vC: V0, vR: 0, i: 0, pct: 100 };
      u = t / tau; x = ex(u);
      return { t: t, tau: tau, u: u, vC: V0 * x, vR: -V0 * x, i: -(V0 / s.R) * x, pct: 100 * x };
    }
    if (t < 0) return { t: t, tau: tau, u: t / tau, vC: 0, vR: 0, i: 0, pct: 0 };
    u = t / tau; x = ex(u);
    var y = oneMinusEx(u);
    return { t: t, tau: tau, u: u, vC: s.Vs * y, vR: s.Vs * x, i: (s.Vs / s.R) * x, pct: 100 * y };
  }
  /* values just before (0-), just after (0+) and long after (inf) the switching instant */
  function rcConditions(s) {
    var I = s.Vs / s.R;
    if (s.mode === 'discharge') {
      return { minus: { vC: s.Vs, vR: 0, i: 0 }, plus: { vC: s.Vs, vR: -s.Vs, i: -I }, inf: { vC: 0, vR: 0, i: 0 } };
    }
    return { minus: { vC: 0, vR: 0, i: 0 }, plus: { vC: 0, vR: s.Vs, i: I }, inf: { vC: s.Vs, vR: 0, i: 0 } };
  }
  /* time for v_C to reach v. charge: t = -tau ln(1 - v/V_S); discharge: t = tau ln(V_0/v). */
  function rcTimeTo(s, v) {
    var tau = s.R * s.C;
    if (!finite(v)) return { ok: false, why: 'nan' };
    if (s.mode === 'discharge') {
      var V0 = s.Vs;
      if (v > V0) return { ok: false, why: 'above' };   // discharge starts at V_0 and only falls
      if (v <= 0) return { ok: false, why: 'never' };   // approaches 0 V but never reaches it
      return { ok: true, t: tau * LN(V0 / v), frac: v / V0 };
    }
    if (v < 0) return { ok: false, why: 'below' };
    if (v >= s.Vs) return { ok: false, why: 'never' };  // approaches V_S but never reaches it
    return { ok: true, t: -tau * Math.log1p(-v / s.Vs), frac: v / s.Vs };
  }
  function rcTable(s) {
    var rows = [], tau = s.R * s.C;
    for (var n = 1; n <= 5; n++) {
      var a = rcAt(s, n * tau);
      rows.push({ n: n, t: n * tau, pct: a.pct, chart: s.mode === 'discharge' ? CHART_FALL[n - 1] : CHART_RISE[n - 1], vC: a.vC, vR: a.vR, i: a.i });
    }
    return rows;
  }

  /* ---------------- RL: series V_s, R, L ----------------
   * s = { mode: 'energize'|'deenergize', Vs, R, L, Rd }
   * energize:   i_L(0-) = 0; switch closes at t = 0 connecting V_s, R, L in series.  tau = L/R.
   * deenergize: switch at A for >> 5 tau so i_L = I_0 = V_s/R; at t = 0 the switch moves to B: L leaves the source
   *             loop and forms a loop with R_d alone (make-before-break).  tau = L/R_d.  R_d = R is the lessons' case.
   * Reference directions: i_L flows down through L (its build-up direction); v_L is + at the top of L;
   * v_R and v_Rd are + where i_L enters them, so v_L = -v_Rd during the decay. */
  function rlValid(s) {
    var p = [];
    if (!s) return ['missing values'];
    if (!pos(s.Vs)) p.push('Vs');
    if (!pos(s.R)) p.push('R');
    if (!pos(s.L)) p.push('L');
    if (s.mode === 'deenergize' && !pos(s.Rd)) p.push('Rd');
    if (s.mode !== 'energize' && s.mode !== 'deenergize') p.push('mode');
    return p;
  }
  function rlSummary(s) {
    var I = s.Vs / s.R;
    var de = s.mode === 'deenergize';
    var tau = de ? s.L / s.Rd : s.L / s.R;
    return {
      tau: tau, t5: 5 * tau, Imax: I, I0: de ? I : 0, If: de ? 0 : I,
      W: 0.5 * s.L * I * I,             // energy in the field at I_max (cl1: E = L I^2 / 2)
      spike: de ? -I * s.Rd : s.Vs      // v_L(0+)
    };
  }
  function rlAt(s, t) {
    var I = s.Vs / s.R, u, x;
    if (s.mode === 'deenergize') {
      var tau = s.L / s.Rd;
      if (t < 0) return { t: t, tau: tau, u: t / tau, i: I, vR: s.Vs, vRd: 0, vL: 0, pct: 100 };
      u = t / tau; x = ex(u);
      return { t: t, tau: tau, u: u, i: I * x, vR: 0, vRd: I * s.Rd * x, vL: -I * s.Rd * x, pct: 100 * x };
    }
    var tauE = s.L / s.R;
    if (t < 0) return { t: t, tau: tauE, u: t / tauE, i: 0, vR: 0, vRd: 0, vL: 0, pct: 0 };
    u = t / tauE; x = ex(u);
    var y = oneMinusEx(u);
    return { t: t, tau: tauE, u: u, i: I * y, vR: s.Vs * y, vRd: 0, vL: s.Vs * x, pct: 100 * y };
  }
  function rlConditions(s) {
    var I = s.Vs / s.R;
    if (s.mode === 'deenergize') {
      return { minus: { i: I, vR: s.Vs, vRd: 0, vL: 0 }, plus: { i: I, vR: 0, vRd: I * s.Rd, vL: -I * s.Rd }, inf: { i: 0, vR: 0, vRd: 0, vL: 0 } };
    }
    return { minus: { i: 0, vR: 0, vRd: 0, vL: 0 }, plus: { i: 0, vR: 0, vRd: 0, vL: s.Vs }, inf: { i: I, vR: s.Vs, vRd: 0, vL: 0 } };
  }
  /* time for i_L to reach i. energize: t = -tau ln(1 - i/I_max); deenergize: t = tau ln(I_0/i). */
  function rlTimeTo(s, i) {
    var I = s.Vs / s.R;
    if (!finite(i)) return { ok: false, why: 'nan' };
    if (s.mode === 'deenergize') {
      var tau = s.L / s.Rd;
      if (i > I) return { ok: false, why: 'above' };
      if (i <= 0) return { ok: false, why: 'never' };
      return { ok: true, t: tau * LN(I / i), frac: i / I };
    }
    var tauE = s.L / s.R;
    if (i < 0) return { ok: false, why: 'below' };
    if (i >= I) return { ok: false, why: 'never' };
    return { ok: true, t: -tauE * Math.log1p(-i / I), frac: i / I };
  }
  function rlTable(s) {
    var rows = [], tau = rlSummary(s).tau;
    for (var n = 1; n <= 5; n++) {
      var a = rlAt(s, n * tau);
      rows.push({ n: n, t: n * tau, pct: a.pct, chart: s.mode === 'deenergize' ? CHART_FALL[n - 1] : CHART_RISE[n - 1], i: a.i, vR: a.vR, vRd: a.vRd, vL: a.vL });
    }
    return rows;
  }

  /* De-energize with "Same as R" ticked is the lessons' topology (cl2 §5 figure, Ex. 5; cl3 Lab 7): ONE resistor R in
   * series with L in the switch-pole branch, contact B returning by a plain wire. That resistor carries I_0 before the
   * switch moves and the decay current after it, so its voltage is v_R (source side) before 0 and v_Rd after 0.
   * With a separate R_d the lab draws R on the source side and R_d alone in the B loop. */
  function rlShared(s) { return !!(s && s.mode === 'deenergize' && s.rdSame); }
  /* the resistor voltage shown next to v_L: { sym, v } */
  function rlShownR(s, a) {
    if (s.mode !== 'deenergize') return { sym: 'R', v: a.vR };
    return rlShared(s) ? { sym: 'R', v: a.vR + a.vRd } : { sym: 'R_d', v: a.vRd };
  }
  /* rows of the 0- / 0+ / infinity table: [{ q (TeX symbol), unit, minus, plus, inf }] */
  function rlCondRows(s) {
    var c = rlConditions(s), rows = [];
    function r(q, unit, f) { rows.push({ q: q, unit: unit, minus: f(c.minus), plus: f(c.plus), inf: f(c.inf) }); }
    r('i_L', 'A', function (x) { return x.i; });
    r('v_L', 'V', function (x) { return x.vL; });
    if (s.mode !== 'deenergize') r('v_R', 'V', function (x) { return x.vR; });
    else if (rlShared(s)) r('v_R', 'V', function (x) { return x.vR + x.vRd; });
    else { r('v_{R_d}', 'V', function (x) { return x.vRd; }); r('v_R\\ \\text{(source side)}', 'V', function (x) { return x.vR; }); }
    return rows;
  }

  /* ---------------- series RL in sinusoidal steady state (cl5) ----------------
   * a = { V (V_T amplitude, peak or RMS), f (Hz), L (H), R (ohm, may be 0) } */
  function acRL(a) {
    var XL = 2 * Math.PI * a.f * a.L;
    var Z = Math.sqrt(a.R * a.R + XL * XL);
    var theta = (a.R === 0 && XL === 0) ? 0 : Math.atan2(XL, a.R) * 180 / Math.PI;
    var I = Z > 0 ? a.V / Z : Infinity;
    return { XL: XL, Z: Z, theta: theta, I: I, VR: I * a.R, VL: I * XL };
  }
  function acValid(a) {
    var p = [];
    if (!a) return ['missing values'];
    if (!pos(a.V)) p.push('V');
    if (!(finite(a.f) && a.f >= 0)) p.push('f');
    if (!(finite(a.L) && a.L >= 0)) p.push('L');
    if (!(finite(a.R) && a.R >= 0)) p.push('R');
    if (!p.length && a.R === 0 && 2 * Math.PI * a.f * a.L === 0) p.push('Z0');
    return p;
  }

  var RC_MODEL = { valid: rcValid, summary: rcSummary, at: rcAt, conditions: rcConditions, timeTo: rcTimeTo, table: rcTable, CHART_RISE: CHART_RISE, CHART_FALL: CHART_FALL };
  var RL_MODEL = { valid: rlValid, summary: rlSummary, at: rlAt, conditions: rlConditions, timeTo: rlTimeTo, table: rlTable, ac: acRL, acValid: acValid, CHART_RISE: CHART_RISE, CHART_FALL: CHART_FALL };

  /* ================================================================ presets (sources: work/redesign/labs/rcrl.md) */
  var RC_PRESETS = [
    { id: 'cl3-ex6', label: 'cl3 Ex. 6 — 10 V, 100 Ω, 1 F', lesson: 'cl3', sec: 'cl3-rc',
      values: { mode: 'charge', Vs: 10, R: 100, C: 1, t: 100, target: 5 } },
    { id: 'cl4-ex1', label: 'cl4 Ex. 1 — 50 V, 100 kΩ, 0.1 µF at 10 ms', lesson: 'cl4', sec: 'cl4-example',
      values: { mode: 'charge', Vs: 50, R: 100e3, C: 0.1e-6, t: 0.01, target: 25 } },
    { id: 'cl4-ex2', label: 'cl4 Ex. 2 — LTspice lab: 10 V, 470 Ω, 10 µF', lesson: 'cl4', sec: 'cl4-ltspice',
      values: { mode: 'charge', Vs: 10, R: 470, C: 10e-6, t: 0.0047, target: 5 } },
    { id: 'cl4-lab-discharge', label: 'cl4 LTspice lab — discharge after the pulse ends', lesson: 'cl4', sec: 'cl4-ltspice',
      values: { mode: 'discharge', Vs: 10, R: 470, C: 10e-6, t: 0.0047, target: 5 } },
    { id: 'cl4-scope-9u7', label: 'cl4 scope demo — measured C = 9.70 µF', lesson: 'cl4', sec: 'cl4-scope',
      values: { mode: 'charge', Vs: 10, R: 470, C: 9.7e-6, t: 0.0047, target: 6.32 } }
  ];
  var RL_PRESETS = [
    { id: 'cl2-ex2', label: 'cl2 Ex. 2 — 5 V, 5 Ω, 10 H', lesson: 'cl2', sec: 'cl2-tau',
      values: { mode: 'energize', Vs: 5, R: 5, L: 10, Rd: 5, rdSame: true, t: 2, target: 0.5 } },
    { id: 'cl2-decay', label: 'cl2 §5 — the same circuit de-energizing', lesson: 'cl2', sec: 'cl2-chart-decay',
      values: { mode: 'deenergize', Vs: 5, R: 5, L: 10, Rd: 5, rdSame: true, t: 2, target: 0.5 } },
    { id: 'cl2-decay-20', extra: true, label: 'cl2 §5 added note — decay through 20 Ω (not from the video)', lesson: 'cl2', sec: 'cl2-chart-decay',
      values: { mode: 'deenergize', Vs: 5, R: 5, L: 10, Rd: 20, rdSame: false, t: 0, target: 0.5 } },
    { id: 'cl2-ex3', label: 'cl2 Ex. 3 — 10 V, 12 Ω, 10 H at 1τ', lesson: 'cl2', sec: 'cl2-ex-12ohm',
      values: { mode: 'energize', Vs: 10, R: 12, L: 10, Rd: 12, rdSame: true, t: 10 / 12, target: 0.52 } },
    { id: 'cl2-ex4', label: 'cl2 Ex. 4 — 10 V, 10 kΩ, 10 H at 1 ms', lesson: 'cl2', sec: 'cl2-ex-1ms',
      values: { mode: 'energize', Vs: 10, R: 10e3, L: 10, Rd: 10e3, rdSame: true, t: 1e-3, target: 0.5e-3 } },
    { id: 'cl2-ex5', label: 'cl2 Ex. 5 — 6 V, 2.2 kΩ, 50 mH, decay at 68 µs', lesson: 'cl2', sec: 'cl2-ex-68us',
      values: { mode: 'deenergize', Vs: 6, R: 2200, L: 0.05, Rd: 2200, rdSame: true, t: 68e-6, target: 1e-3 } },
    { id: 'cl3-ex7', label: 'cl3 Ex. 7 — Lab 7: 10 V, 10 Ω, 1 H', lesson: 'cl3', sec: 'cl3-lab-results',
      values: { mode: 'energize', Vs: 10, R: 10, L: 1, Rd: 10, rdSame: true, t: 0.1, target: 0.5 } },
    { id: 'cl3-lab7-decay', extra: true, label: 'cl3 Lab 7 — decay after the pulse (guide’s note, not worked in the video)', lesson: 'cl3', sec: 'cl3-lab-results',
      values: { mode: 'deenergize', Vs: 10, R: 10, L: 1, Rd: 10, rdSame: true, t: 0.1, target: 0.5 } },
    { id: 'cl5-ex1', label: 'cl5 Ex. 1 — \\(X_L\\) of 5 H at 60 Hz (AC panel)', lesson: 'cl5', sec: 'cl5-xl-formula',
      values: { ac: { f: 60, L: 5, R: 0 } } },
    { id: 'cl5-ex6-r400', extra: true, label: 'cl5 Ex. 6 completed with R = 400 Ω (guide’s added example, AC panel)', lesson: 'cl5', sec: 'cl5-ohm',
      values: { ac: { V: 50, f: 60, L: 300 / (2 * Math.PI * 60), R: 400 } } },
    { id: 'cl5-extra-a', extra: true, label: 'cl5 Extra example A — 10 H coil with 100 Ω at 159.2 Hz (guide’s added example, AC panel)', lesson: 'cl5', sec: 'cl5-ohm',
      values: { ac: { V: 10, f: 10000 / (2 * Math.PI * 10), L: 10, R: 100 } } }
  ];

  var RC_DEFAULT = RC_PRESETS[1].values;
  var RL_DEFAULT = RL_PRESETS[0].values;
  var AC_DEFAULT = { V: 10, f: 60, L: 5, R: 0 };

  var RC_ASSUME = [
    'Ideal parts: the resistor is pure resistance, the capacitor has no leakage or series resistance, the source has no internal resistance, and the switch changes position in zero time at \\(t = 0\\).',
    '<b>Charge:</b> the capacitor is uncharged before the switch closes, \\(v_C(0^-) = 0\\). <b>Discharge:</b> the switch has been at A long enough (well over \\(5\\tau\\)) for the capacitor to reach \\(V_0 = V_S\\); at \\(t = 0\\) it moves to B, which removes the source and leaves \\(R\\) and \\(C\\) in a loop, so the discharge runs through the same \\(R\\) (same \\(\\tau\\)), as in the cl4 LTspice lab.',
    'Reference directions: \\(i\\) is positive when it flows from the source\'s + terminal through \\(R\\) into the top plate of \\(C\\); \\(v_R\\) and \\(v_C\\) are + at the top. During discharge \\(i\\) and \\(v_R\\) are negative because the current flows the other way.',
    'One resistor in series with one capacitor. In a larger network the \\(R\\) in \\(\\tau = RC\\) is the Thévenin resistance seen by the capacitor (cl4).',
    '“Fully charged after \\(5\\tau\\)” is the engineering convention: the exponential is at 99.3 % after \\(5\\tau\\) and never reaches 100 % exactly.',
    'Real electrolytic capacitors are typically ±20 % (cl4 scope demo), so a measured \\(\\tau\\) can differ from the calculated one by that much.'
  ];
  var RL_ASSUME = [
    'Ideal parts: the inductor has no winding resistance (LTspice series resistance = 0, as in cl3 Lab 7), the source has no internal resistance, and the switch changes position in zero time at \\(t = 0\\).',
    '<b>Energize:</b> no current flows before the switch closes, \\(i_L(0^-) = 0\\). <b>De-energize:</b> the switch has been at A long enough (well over \\(5\\tau\\)) for the current to reach \\(I_0 = V_s/R\\); at \\(t = 0\\) it moves to B (make-before-break, so the inductor current always has a path). The inductor leaves the source loop and forms a loop with \\(R_d\\) alone, so \\(\\tau = L/R_d\\).',
    'The lessons\' circuits (cl2 §5, Ex. 5; cl3 Lab 7 after the pulse) keep the same resistor in the decay loop. That is the case \\(R_d = R\\), where the decay formulas are \\(i = \\frac{V_s}{R}\\mathrm{e}^{-Rt/L}\\) and \\(|v_L(0^+)| = V_s\\).',
    'Reference directions: \\(i_L\\) is positive flowing down through \\(L\\) (its build-up direction); \\(v_L\\) is + at the top of \\(L\\); each resistor voltage is + where \\(i_L\\) enters it. So \\(v_L = -v_{R_d}\\) during the decay.',
    'The AC panel assumes sinusoidal steady state at one frequency, an ideal inductor in series with \\(R\\), and magnitudes that are all peak or all RMS (cl5).'
  ];

  /* ================================================================ UI helpers */
  var CSS = [
    '.lab-rcrl-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}',
    '.lab-rcrl-chips .lab-rcrl-chiplbl{font-size:var(--fs-xs);color:var(--ink-2)}',
    '.lab-rcrl-chips .lab-chip{padding:3px 10px;font-family:var(--font-mono)}',
    '.lab-rcrl-row{display:flex;flex-wrap:wrap;gap:var(--sp-2);align-items:center}',
    '.lab-rcrl-check{display:flex;gap:8px;align-items:center;font-size:var(--fs-sm);color:var(--ink);cursor:pointer}',
    '.lab-rcrl-check input{width:18px;height:18px;accent-color:var(--topic);margin:0}',
    '.lab-rcrl-check input:focus-visible{outline:2px solid var(--topic);outline-offset:2px}',
    '.lab-rcrl-result{font-size:var(--fs-sm);color:var(--ink);min-height:1.4em}',
    '.lab-rcrl-result b{font-family:var(--font-mono);color:var(--topic-ink)}',
    '.lab-rcrl-h{margin:0;font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;color:var(--ink-2);font-weight:600}',
    '.lab-rcrl-h2{margin:0;font-size:var(--fs-sm);color:var(--ink);font-weight:600}',
    '.lab-rcrl-sec{display:flex;flex-direction:column;gap:var(--sp-2);min-width:0}',
    '.lab-rcrl-cond p{margin:4px 0 0;font-size:var(--fs-sm);color:var(--ink-2);max-width:var(--read-max)}',
    '.lab-rcrl-small{font-size:var(--fs-xs);color:var(--ink-3);margin:0}',
    '.lab-rcrl-ghostinfo{font-size:var(--fs-sm);color:var(--ink-2)}',
    '.lab-rcrl-ghostinfo:empty{display:none}',
    '.lab-rcrl-notes{display:flex;flex-direction:column;gap:var(--sp-2)}',
    '.lab-rcrl-notes:empty{display:none}',
    '.lab-rcrl-ac{border:1px solid var(--line);border-radius:var(--r-md);background:var(--surface)}',
    '.lab-rcrl-ac>summary{cursor:pointer;padding:var(--sp-2) var(--sp-3);font-weight:600;font-size:var(--fs-sm);color:var(--ink)}',
    '.lab-rcrl-ac>summary:focus-visible{outline:2px solid var(--topic);outline-offset:2px}',
    '.lab-rcrl-acbody{display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr);gap:var(--sp-4);padding:0 var(--sp-3) var(--sp-3)}',
    '@media (max-width:820px){.lab-rcrl-acbody{grid-template-columns:minmax(0,1fr)}}',
    '.lab-rcrl-acout{display:flex;flex-direction:column;gap:var(--sp-3);min-width:0}',
    '.lab .lab-rcrl-tabnum td{font-family:var(--font-mono)}',
    '.lab table.lab-rcrl-tabnum th{text-transform:none;letter-spacing:0}',
    /* KaTeX's hidden MathML is position:absolute; make the scroll containers its containing block so it cannot widen the page */
    '.lab[data-lab="rc"] .lab-table-wrap,.lab[data-lab="rl"] .lab-table-wrap,.lab[data-lab="rc"] .lab-work-body,.lab[data-lab="rl"] .lab-work-body{position:relative}',
    '.lab .lab-btn[disabled]{opacity:.55;cursor:not-allowed}',
    /* kept-curve time constant: long dashes in the kept curve's colour, so it cannot be mistaken for the solid time-probe line */
    '.lab .lab-mark.lab-rcrl-kept{stroke:var(--chart-2);stroke-dasharray:8 4;stroke-width:1.6}'
  ].join('\n');
  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('lab-rcrl-css')) return;
    var st = document.createElement('style');
    st.id = 'lab-rcrl-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function merge(a, b) { var o = {}, k; for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k]; for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) o[k] = b[k]; return o; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  /* TeX for a quantity with SI prefix: tq(1e-4,'A') -> "100\,\mu\text{A}" */
  function makeTq(kit) {
    return function tq(v, unit, sig) {
      var s = kit.fmt(v, unit, sig || 4).replace(/−/g, '-');
      var k = s.lastIndexOf(' ');
      if (k < 0) return s.replace('∞', '\\infty');
      var numPart = s.slice(0, k).replace('∞', '\\infty'), u = s.slice(k + 1);
      var pre = '', base = u;
      if (unit && u.length > unit.length && u.slice(-unit.length) === unit) { pre = u.slice(0, u.length - unit.length); base = unit; }
      var out = numPart + '\\,';
      if (pre) out += pre === 'µ' ? '\\mu' : '\\text{' + pre + '}';
      out += base === 'Ω' ? '\\Omega' : '\\text{' + base + '}';
      return out;
    };
  }

  /* time probe: slider over [-0.5 tau, 6 tau] + text field (accepts "10 ms", "2τ", "2 tau") + 0..5 tau chips */
  function timeProbe(kit, label, onChange) {
    var h = kit.h;
    var id = kit.uid('rcrl-t');
    var tau = 1, value = 0;
    var wrap = h('div', { class: 'lab-ctl' });
    var lab = h('label', { class: 'lab-ctl-label', for: id + '-n' });
    kit.tex(lab, label);
    var range = h('input', { type: 'range', id: id + '-r', min: 0, max: 1000, step: 1, 'aria-label': 'Time t slider, 0 to 6 time constants' });
    var input = h('input', { type: 'text', id: id + '-n', class: 'lab-ctl-num', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': id + '-h' });
    var unitEl = h('span', { class: 'lab-ctl-unit', text: 's' });
    var err = h('div', { class: 'lab-ctl-err', role: 'status', 'aria-live': 'polite' });
    var help = h('div', { class: 'lab-ctl-help', id: id + '-h' });
    kit.tex(help, 'Type a time such as 10 ms, or a multiple of \\(\\tau\\) such as 2τ.');
    wrap.appendChild(lab);
    wrap.appendChild(h('div', { class: 'lab-ctl-row' }, [range, h('span', { class: 'lab-ctl-val' }, [input, unitEl])]));
    wrap.appendChild(err);
    var chips = h('div', { class: 'lab-rcrl-chips', role: 'group', 'aria-label': 'Jump to a whole number of time constants' });
    chips.appendChild(h('span', { class: 'lab-rcrl-chiplbl', text: 'Jump to' }));
    [0, 1, 2, 3, 4, 5].forEach(function (n) {
      var b = h('button', { type: 'button', class: 'lab-chip', text: n === 0 ? '0' : n + 'τ', 'aria-label': n === 0 ? 't = 0' : 't = ' + n + ' time constants' });
      b.addEventListener('click', function () { set(n * tau); onChange(value); });
      chips.appendChild(b);
    });
    wrap.appendChild(chips);
    wrap.appendChild(help);
    function bare(v) { return kit.fmt(v, 's', 4).replace(/\s*s$/, '').trim(); }
    function show() {
      var f = (value / tau + 0.5) / 6.5;
      range.value = Math.round(kit.clamp(f, 0, 1) * 1000);
      range.setAttribute('aria-valuetext', kit.fmt(value, 's', 4) + ' (' + kit.sigStr(value / tau, 3) + ' τ)');
      if (document.activeElement !== input) input.value = bare(value);
    }
    function set(v) { value = v; show(); }
    range.addEventListener('input', function () {
      err.textContent = ''; wrap.classList.remove('bad');
      var u = +range.value / 1000 * 6.5 - 0.5;
      if (Math.abs(u) < 0.02) u = 0;
      value = +(u * tau).toPrecision(4);
      show(); onChange(value);
    });
    function fromText() {
      var s = String(input.value).trim().replace(/−/g, '-');
      var m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*(τ|tau)$/i);
      var v = m ? parseFloat(m[1]) * tau : kit.parse(s, 's');
      if (!isFinite(v) || Math.abs(v) > tau * 1e4) {
        wrap.classList.add('bad');
        err.textContent = 'Enter a time such as 10 ms, 4.7m or 2τ (up to ' + kit.fmt(tau * 1e4, 's', 3) + ').';
        return;
      }
      wrap.classList.remove('bad'); err.textContent = '';
      value = v; show(); onChange(value);
    }
    input.addEventListener('change', fromText);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fromText(); input.select(); } });
    input.addEventListener('blur', function () { input.value = bare(value); });
    return {
      el: wrap,
      get: function () { return value; },
      set: set,
      setTau: function (t) { tau = t; show(); }
    };
  }

  /* text-only quantity input (solve-for-time target) */
  function qtyInput(kit, label, unit, onChange) {
    var h = kit.h, id = kit.uid('rcrl-q'), value = 0;
    var wrap = h('div', { class: 'lab-ctl' });
    var lab = h('label', { class: 'lab-ctl-label', for: id });
    kit.tex(lab, label);
    var input = h('input', { type: 'text', id: id, class: 'lab-ctl-num', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false' });
    var err = h('div', { class: 'lab-ctl-err', role: 'status', 'aria-live': 'polite' });
    wrap.appendChild(lab);
    wrap.appendChild(h('div', { class: 'lab-ctl-row' }, [h('span', { class: 'lab-ctl-val' }, [input, h('span', { class: 'lab-ctl-unit', text: unit })])]));
    wrap.appendChild(err);
    function bare(v) { return kit.fmt(v, unit, 4).replace(new RegExp('\\s*' + unit + '$'), '').trim(); }
    function fromText() {
      var v = kit.parse(input.value, unit);
      if (!isFinite(v)) { wrap.classList.add('bad'); err.textContent = 'Enter a number, for example 5 or 2.5m (prefixes like m, µ, k work).'; return; }
      wrap.classList.remove('bad'); err.textContent = '';
      value = v; input.value = bare(v); onChange(value);
    }
    input.addEventListener('change', fromText);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fromText(); } });
    return { el: wrap, get: function () { return value; }, set: function (v) { value = v; input.value = bare(v); wrap.classList.remove('bad'); err.textContent = ''; } };
  }

  function table(kit, head, rows, cls) {
    var h = kit.h;
    var t = h('table', { class: 'lab-table ' + (cls || '') });
    var thead = h('thead'), tr = h('tr');
    head.forEach(function (c) { var th = h('th', { scope: 'col' }); kit.tex(th, c); tr.appendChild(th); });
    thead.appendChild(tr); t.appendChild(thead);
    var tb = h('tbody');
    rows.forEach(function (r) {
      var row = h('tr');
      r.forEach(function (c, k) { var td = h(k === 0 ? 'th' : 'td', k === 0 ? { scope: 'row' } : null); kit.tex(td, String(c)); row.appendChild(td); });
      tb.appendChild(row);
    });
    t.appendChild(tb);
    return h('div', { class: 'lab-table-wrap' }, [t]);
  }

  /* ================================================================ diagrams (site diagram DSL) */
  function rcDiagram(s, F, probe) {
    var Vs = F(s.Vs, 'V'), R = F(s.R, 'Ω'), C = F(s.C, 'F');
    var tau = s.R * s.C;
    if (s.mode === 'discharge') {
      return { parts: [
        { t: 'BAT', a: [0, 5], b: [0, 2], label: 'V_S', value: Vs, plus: 'b', side: -1 },
        { t: 'W', pts: [[0, 2], [0, 0], [3, 0]] },
        { t: 'W', pts: [[5, 0], [8, 0], [8, 6.5], [0, 6.5], [0, 5]] },
        { t: 'W', pts: [[4, 1], [5, 0]] },
        { t: 'W', pts: [[4, 1], [4, 1.8]] },
        { t: 'IARR', a: [4, 1.15], b: [4, 1.75], label: 'i', side: -1 },
        { t: 'R', a: [4, 1.8], b: [4, 3.9], label: 'R', value: R, side: -1 },
        { t: 'C', a: [4, 3.9], b: [4, 6.5], label: 'C', value: C, side: -1 },
        { t: 'N', at: [3, 0], open: true, label: 'A', pos: 'n' },
        { t: 'N', at: [5, 0], open: true, label: 'B', pos: 'n' },
        { t: 'N', at: [4, 1], open: true },
        { t: 'N', at: [4, 6.5] },
        { t: 'ARROW', a: [3.3, -0.9], b: [4.7, -0.9], label: 'A → B at t = 0', lat: [4, -1.25] },
        { t: 'VM', a: [4.75, 4.3], b: [4.75, 6.25], label: 'v_C = ' + F(probe.vC, 'V', 3), lat: [4.95, 5.2], anchor: 'start' },
        { t: 'VM', a: [4.75, 1.95], b: [4.75, 3.55], label: 'v_R = ' + F(probe.vR, 'V', 3), lat: [4.95, 2.85], anchor: 'start' },
        { t: 'T', at: [4, 8.1], text: 'τ = RC = ' + F(tau, 's', 3) + '   (source out of the loop)', cls: 'accent' },
        { t: 'T', at: [4, 8.7], text: 'i: charging reference direction (negative now)', cls: 'muted' }
      ], padX: 2.6, pad: 1.1, alt: 'Discharge circuit: the switch has moved from A to B, removing the ' + Vs + ' source. Resistor R = ' + R + ' and capacitor C = ' + C + ' form a loop through contact B. Reference current i points down through R and C; during discharge it is negative.' };
    }
    return { parts: [
      { t: 'BAT', a: [0, 5], b: [0, 1], label: 'V_S', value: Vs, plus: 'b', side: -1 },
      { t: 'W', pts: [[0, 1], [0, 0], [2, 0]] },
      { t: 'SW', a: [2, 0], b: [4, 0], label: 't = 0', state: 'open', arrow: true },
      { t: 'W', pts: [[4, 0], [6, 0]] },
      { t: 'R', a: [6, 0], b: [6, 3], label: 'R', value: R, side: -1 },
      { t: 'C', a: [6, 3], b: [6, 6], label: 'C', value: C, side: -1 },
      { t: 'W', pts: [[6, 6], [0, 6], [0, 5]] },
      { t: 'IARR', a: [4.6, 0], b: [5.6, 0], label: 'i' },
      { t: 'VM', a: [6.8, 0.5], b: [6.8, 2.5], label: 'v_R = ' + F(probe.vR, 'V', 3), lat: [7.0, 1.5], anchor: 'start' },
      { t: 'VM', a: [6.8, 3.5], b: [6.8, 5.5], label: 'v_C = ' + F(probe.vC, 'V', 3), lat: [7.0, 4.5], anchor: 'start' },
      { t: 'T', at: [3, 7.5], text: 'τ = RC = ' + F(tau, 's', 3), cls: 'accent' }
    ], padX: 2.6, pad: 1.2, alt: 'Charging circuit: source V_S = ' + Vs + ', a switch that closes at t = 0, resistor R = ' + R + ' and capacitor C = ' + C + ' in series. Current i flows clockwise; v_R and v_C are positive at the top.' };
  }
  function rlDiagram(s, F, probe) {
    var Vs = F(s.Vs, 'V'), R = F(s.R, 'Ω'), L = F(s.L, 'H');
    if (s.mode === 'deenergize' && rlShared(s)) {
      // the lessons' decay circuit (cl2-fig-decay, cl2-fig-ex68): R and L in series in the pole branch, B returns by wire
      return { parts: [
        { t: 'BAT', a: [0, 5], b: [0, 2], label: 'V_s', value: Vs, plus: 'b', side: -1 },
        { t: 'W', pts: [[0, 2], [0, 0], [3, 0]] },
        { t: 'W', pts: [[5, 0], [8, 0], [8, 6.5], [0, 6.5], [0, 5]] },
        { t: 'W', pts: [[4, 1], [5, 0]] },
        { t: 'W', pts: [[4, 1], [4, 1.3]] },
        { t: 'R', a: [4, 1.3], b: [4, 3.5], label: 'R', value: R, side: -1 },
        { t: 'L', a: [4, 3.5], b: [4, 6.1], label: 'L', value: L, side: -1 },
        { t: 'W', pts: [[4, 6.1], [4, 6.5]] },
        { t: 'N', at: [3, 0], open: true, label: 'A', pos: 'n' },
        { t: 'N', at: [5, 0], open: true, label: 'B', pos: 'n' },
        { t: 'N', at: [4, 1], open: true },
        { t: 'N', at: [4, 6.5] },
        { t: 'ARROW', a: [3.3, -0.9], b: [4.7, -0.9], label: 'A → B at t = 0', lat: [4, -1.25] },
        { t: 'IARR', a: [8, 4.4], b: [8, 2.4], label: 'i_L' },
        { t: 'VM', a: [4.75, 1.45], b: [4.75, 3.1], label: 'v_R = ' + F(probe.vR + probe.vRd, 'V', 3), lat: [4.95, 2.3], anchor: 'start' },
        { t: 'VM', a: [4.75, 3.9], b: [4.75, 5.95], label: 'v_L = ' + F(probe.vL, 'V', 3), lat: [4.95, 4.95], anchor: 'start' },
        { t: 'T', at: [4, 8.1], text: 'τ = L/R = ' + F(s.L / s.R, 's', 3) + '   (source out of the loop)', cls: 'accent' }
      ], padX: 1.8, pad: 1.1, alt: 'De-energize circuit as drawn in the lessons: source V_s = ' + Vs + ' connects to contact A. The switch pole feeds R = ' + R + ' and L = ' + L + ' in series down to the bottom wire; contact B returns to the bottom through the right-hand wire. At t = 0 the pole moves from A to B, so R and L form a loop without the source. The inductor current keeps flowing down through R and L and returns up the right-hand wire.' };
    }
    if (s.mode === 'deenergize') {
      var Rd = F(s.Rd, 'Ω');
      return { parts: [
        { t: 'BAT', a: [0, 5], b: [0, 2], label: 'V_s', value: Vs, plus: 'b', side: -1 },
        { t: 'W', pts: [[0, 2], [0, 0], [0.5, 0]] },
        { t: 'R', a: [0.5, 0], b: [3.5, 0], label: 'R', value: R },
        { t: 'W', pts: [[3.5, 0], [4, 0]] },
        { t: 'W', pts: [[5, 1], [6, 0]] },
        { t: 'W', pts: [[6, 0], [8.5, 0], [8.5, 1.5]] },
        { t: 'R', a: [8.5, 1.5], b: [8.5, 4.5], label: 'R_d', value: Rd },
        { t: 'W', pts: [[8.5, 4.5], [8.5, 6.5], [0, 6.5], [0, 5]] },
        { t: 'W', pts: [[5, 1], [5, 1.5]] },
        { t: 'L', a: [5, 1.5], b: [5, 4.5], label: 'L', value: L, side: -1 },
        { t: 'W', pts: [[5, 4.5], [5, 6.5]] },
        { t: 'N', at: [4, 0], open: true, label: 'A', pos: 'n' },
        { t: 'N', at: [6, 0], open: true, label: 'B', pos: 'n' },
        { t: 'N', at: [5, 1], open: true },
        { t: 'N', at: [5, 6.5] },
        { t: 'ARROW', a: [4.3, -0.9], b: [5.7, -0.9], label: 'A → B at t = 0', lat: [5, -1.25] },
        { t: 'IARR', a: [5, 4.8], b: [5, 6.2], label: 'i_L', side: -1 },
        { t: 'VM', a: [5.75, 1.75], b: [5.75, 4.25], label: 'v_L = ' + F(probe.vL, 'V', 3), lat: [5.95, 3], anchor: 'start' },
        { t: 'T', at: [4.25, 8.1], text: 'τ = L/R_d = ' + F(s.L / s.Rd, 's', 3) + '   (source loop open)', cls: 'accent' }
      ], padX: 1.8, pad: 1.1, alt: 'De-energize circuit: source V_s = ' + Vs + ' and R = ' + R + ' feed contact A. The switch pole feeds the inductor L = ' + L + '. At t = 0 the pole moves from A to B, so the inductor forms a loop with R_d = ' + Rd + ' alone. i_L flows down through L.' };
    }
    return { parts: [
      { t: 'BAT', a: [0, 4.5], b: [0, 1.5], label: 'V_s', value: Vs, plus: 'b', side: -1 },
      { t: 'W', pts: [[0, 1.5], [0, 0], [4, 0]] },
      { t: 'R', a: [4, 0], b: [4, 2.5], label: 'R', value: R, side: -1 },
      { t: 'L', a: [4, 2.5], b: [4, 5.5], label: 'L', value: L, side: -1 },
      { t: 'W', pts: [[4, 5.5], [4, 6.5], [3, 6.5]] },
      { t: 'SW', a: [1, 6.5], b: [3, 6.5], label: 't = 0', state: 'open', side: -1, arrow: true },
      { t: 'W', pts: [[1, 6.5], [0, 6.5], [0, 4.5]] },
      { t: 'IARR', a: [1.2, 0], b: [2.8, 0], label: 'i' },
      { t: 'VM', a: [4.8, 0.35], b: [4.8, 2.15], label: 'v_R = ' + F(probe.vR, 'V', 3), lat: [4.65, 1.25], anchor: 'start' },
      { t: 'VM', a: [4.8, 2.85], b: [4.8, 5.15], label: 'v_L = ' + F(probe.vL, 'V', 3), lat: [4.65, 4], anchor: 'start' },
      { t: 'T', at: [2.5, 8.7], text: 'τ = L/R = ' + F(s.L / s.R, 's', 3), cls: 'accent' }
    ], padX: 2.6, pad: 1.2, alt: 'Energize circuit: source V_s = ' + Vs + ', resistor R = ' + R + ', inductor L = ' + L + ' and a switch that closes at t = 0, all in series. Current i flows clockwise; v_R and v_L are positive at the top.' };
  }
  function acDiagram(a, r, F) {
    // impedance triangle drawn to scale: R horizontal, X_L up, Z hypotenuse
    var big = Math.max(a.R, r.XL) || 1, k = 5 / big;
    var x = a.R * k, y = r.XL * k;
    var parts = [
      { t: 'W', pts: [[-0.4, 5], [6.2, 5]] },
      { t: 'W', pts: [[0, 5.4], [0, -0.4]] }
    ];
    if (x > 0.05) parts.push({ t: 'ARROW', a: [0, 5], b: [x, 5], label: 'R = ' + F(a.R, 'Ω', 3), lat: [Math.max(x / 2, 1.2), 5.6] });
    if (y > 0.05) parts.push({ t: 'ARROW', a: [0, 5], b: [0, 5 - y], label: 'X_L = ' + F(r.XL, 'Ω', 3), lat: [-0.25, 5 - y / 2], anchor: 'end' });
    if (x > 0.05 && y > 0.05) {
      parts.push({ t: 'ARROW', a: [0, 5], b: [x, 5 - y], label: 'Z = ' + F(r.Z, 'Ω', 3), lat: [x + 0.2, 5 - y - 0.15], anchor: 'start' });
      parts.push({ t: 'W', pts: [[x, 5], [x, 5 - y]], dashed: true });
      parts.push({ t: 'T', at: [Math.min(1.5, x * 0.6) + 0.2, 4.7], text: 'θ = ' + r.theta.toFixed(2) + '°', anchor: 'start', cls: 'accent' });
    }
    return { parts: parts, pad: 1, padX: 3, scale: 0.9, alt: 'Impedance triangle drawn to scale: R = ' + F(a.R, 'Ω', 3) + ' horizontal, X_L = ' + F(r.XL, 'Ω', 3) + ' vertical, Z = ' + F(r.Z, 'Ω', 3) + ' along the hypotenuse at θ = ' + r.theta.toFixed(2) + ' degrees.' };
  }

  /* chart marks shared by both charts: switching instant, 1..5 tau, the kept curve's tau and the time probe.
   * The kept tau uses its own class (long dashes, kept-curve colour); only the probe uses 'accent'. */
  function chartMarks(tau, tg, t) {
    var marks = [{ type: 'vline', x: 0, label: 'switch' }];
    for (var n = 1; n <= 5; n++) marks.push({ type: 'vline', x: n * tau, label: n + 'τ' });
    if (tg > 0 && Math.abs(tg - tau) > 1e-12 * tau) marks.push({ type: 'vline', x: tg, label: 'kept τ', cls: 'lab-rcrl-kept' });
    var u = t / tau;
    var nearN = Math.abs(u - Math.round(u)) < 0.12 && Math.round(u) >= 0 && Math.round(u) <= 5;
    return { marks: marks, probe: { type: 'vline', x: t, cls: 'accent', label: nearN ? '' : 't' } };
  }
  /* true when a preset only sets the cl5 AC panel (no transient mode): mounting with it must open and show that panel */
  function acOnly(values) { return !!(values && typeof values === 'object' && values.ac && !values.mode); }

  /* ================================================================ shared transient-lab mount */
  /* K describes one lab kind (see RC_K / RL_K below). */
  function mountTransient(def, el, ctx, K) {
    var kit = ctx.kit || EL.kit, h = kit.h, F = kit.fmt, tq = makeTq(kit), N = function (v, s) { return kit.num(v, s || 4); };
    injectCss();
    var S = copy(K.defaults);
    var hasPreset = !!(ctx.preset && typeof ctx.preset === 'object');
    /* the app passes state:null with a preset (so the example wins) plus savedState; keep the untouched part from savedState */
    if (hasPreset && !(ctx.state && typeof ctx.state === 'object') && ctx.savedState && typeof ctx.savedState === 'object') ctx.state = ctx.savedState;
    var hasState = !!(ctx.state && typeof ctx.state === 'object');
    if (hasPreset) {
      /* A preset wins over the saved state, but only for its own part: an AC preset keeps the saved transient values
       * (rcrl.md), a transient preset keeps the saved AC panel. The in-lab chips behave the same way. */
      if (hasState) {
        if (acOnly(ctx.preset)) S = merge(S, ctx.state);
        else if (ctx.state.ac && typeof ctx.state.ac === 'object') S.ac = merge(S.ac || AC_DEFAULT, ctx.state.ac);
      }
      S = K.applyPreset(S, ctx.preset);
    } else if (hasState) S = merge(S, ctx.state);
    if (S.ac) S.ac = merge(AC_DEFAULT, S.ac);
    var ghost = null;
    var destroyed = false;

    var fr = kit.frame(def, { onPreset: function (p) { apply(K.applyPreset(S, p.values), p); } });
    el.innerHTML = '';
    el.appendChild(fr.root);
    if (ctx.presetId) fr.markPreset(ctx.presetId);

    /* ---- controls ---- */
    var seg = kit.segmented({ label: 'Switching', options: K.modes, value: S.mode, onChange: function (v) { S.mode = v; changed(); } });
    fr.controls.appendChild(seg.el);

    var gVals = h('div', { class: 'lab-group' }, [h('h4', { text: 'Circuit values' })]);
    var ctl = {};
    K.vars.forEach(function (vd) {
      ctl[vd.key] = kit.control({ label: vd.label, unit: vd.unit, min: vd.min, max: vd.max, scale: vd.scale, step: vd.step, value: S[vd.key], hardMin: vd.hardMin, hardMax: vd.hardMax, sig: 3, help: vd.help,
        onInput: function (v) { S[vd.key] = v; if (vd.key === 'R' && S.rdSame && ctl.Rd) { S.Rd = v; ctl.Rd.set(v); } changed(); } });
      gVals.appendChild(ctl[vd.key].el);
    });
    var rdBox = null, rdCheck = null;
    if (K.kind === 'rl') {
      rdCheck = h('input', { type: 'checkbox', id: kit.uid('rcrl-rd') });
      rdCheck.checked = !!S.rdSame;
      var rdLab = h('label', { class: 'lab-rcrl-check', for: rdCheck.id }, [rdCheck]);
      rdLab.appendChild(h('span', { text: 'Same as R (the lessons’ circuits)' }));
      ctl.Rd = kit.control({ label: 'Decay-loop resistance \\(R_d\\)', unit: 'Ω', min: 0.1, max: 1e6, scale: 'log', value: S.Rd, hardMin: 1e-3, hardMax: 1e9, sig: 3,
        onInput: function (v) { S.Rd = v; if (S.rdSame) { S.rdSame = false; rdCheck.checked = false; } changed(); } });
      rdCheck.addEventListener('change', function () { S.rdSame = rdCheck.checked; if (S.rdSame) { S.Rd = S.R; ctl.Rd.set(S.R); } changed(); });
      rdBox = h('div', { class: 'lab-rcrl-sec' }, [ctl.Rd.el, rdLab]);
      gVals.appendChild(rdBox);
    }
    fr.controls.appendChild(gVals);

    var gProbe = h('div', { class: 'lab-group' }, [h('h4', { text: 'Read values at a time' })]);
    var probe = timeProbe(kit, 'Time after switching, \\(t\\)', function (v) { S.t = v; changed(); });
    gProbe.appendChild(probe.el);
    fr.controls.appendChild(gProbe);

    var gSolve = h('div', { class: 'lab-group' }, [h('h4', { text: 'Solve for the time' })]);
    var target = qtyInput(kit, K.targetLabel, K.targetUnit, function (v) { S.target = v; changed(); });
    var solveOut = h('div', { class: 'lab-rcrl-result', role: 'status', 'aria-live': 'polite' });
    var solveBtn = h('button', { type: 'button', class: 'lab-btn', text: 'Set t to this time' });
    gSolve.appendChild(target.el);
    gSolve.appendChild(solveOut);
    gSolve.appendChild(h('div', { class: 'lab-rcrl-row' }, [solveBtn]));
    fr.controls.appendChild(gSolve);
    var lastSolve = null;
    solveBtn.addEventListener('click', function () { if (lastSolve && lastSolve.ok) { S.t = +lastSolve.t.toPrecision(6); changed(); } });

    var gGhost = h('div', { class: 'lab-group' }, [h('h4', { text: 'Compare' })]);
    var ghostBtn = h('button', { type: 'button', class: 'lab-btn', 'aria-pressed': 'false', text: 'Keep this curve to compare' });
    var ghostInfo = h('div', { class: 'lab-rcrl-ghostinfo', role: 'status', 'aria-live': 'polite' });
    gGhost.appendChild(h('p', { class: 'lab-rcrl-small', text: 'Keep the current curve, then change ' + K.ghostHint + ' to see how the time constant stretches or shrinks the response.' }));
    gGhost.appendChild(h('div', { class: 'lab-rcrl-row' }, [ghostBtn]));
    gGhost.appendChild(ghostInfo);
    fr.controls.appendChild(gGhost);
    ghostBtn.addEventListener('click', function () {
      if (ghost) ghost = null;
      else if (!K.model.valid(S).length) ghost = copy(S);
      render();
    });

    /* ---- output ---- */
    var notes = h('div', { class: 'lab-rcrl-notes', role: 'status', 'aria-live': 'polite' });
    var diag = h('div');
    var circ = kit.circuit(diag, { parts: [] });
    var roSum = kit.readout(K.sumItems(S), { compact: true });
    var probeHead = h('h4', { class: 'lab-rcrl-h2' });
    var roAt = kit.readout(K.atItems, { compact: true });
    var chartV = kit.chart({ height: 250 });
    var chartI = kit.chart({ height: 210 });
    var condBox = h('div', { class: 'lab-rcrl-sec lab-rcrl-cond' });
    var tabBox = h('div', { class: 'lab-rcrl-sec' });
    var work = kit.workings('Show the calculation (substituted values)');
    fr.output.appendChild(notes);
    fr.output.appendChild(diag);
    fr.output.appendChild(roSum.el);
    fr.output.appendChild(h('div', { class: 'lab-rcrl-sec' }, [probeHead, roAt.el]));
    fr.output.appendChild(h('div', { class: 'lab-rcrl-sec' }, [h('h4', { class: 'lab-rcrl-h', text: K.chartVTitle }), chartV.el]));
    fr.output.appendChild(h('div', { class: 'lab-rcrl-sec' }, [h('h4', { class: 'lab-rcrl-h', text: K.chartITitle }), chartI.el,
      h('p', { class: 'lab-rcrl-small', text: 'Hover, tap or focus a chart and use the arrow keys to read values. Short-dashed grey lines mark whole time constants; the solid coloured vertical line is your time t. After “Keep this curve”, a long-dashed line in the kept curve’s colour marks the kept τ. The table below lists the same values in text.' })]));
    fr.output.appendChild(condBox);
    fr.output.appendChild(tabBox);
    fr.output.appendChild(work.el);

    var ac = null, acTimer = null;
    if (K.kind === 'rl') ac = mountAc(kit, fr, function () { return S; }, function () { save(); });
    /* A lesson link with an AC preset (e.g. ?preset=cl5-ex1): open the AC panel now and scroll to it after the shell has
     * scrolled to the lab (the shell does that about 80 ms after mount). */
    if (ac && acOnly(ctx.preset)) {
      ac.open();
      // first wait for the mounting code (and the shell's scroll timer it registers) to finish, then scroll after that
      // timer, without smooth scrolling so a late layout change cannot cut the animation short
      acTimer = setTimeout(function () {
        acTimer = setTimeout(function () { acTimer = null; if (!destroyed) ac.focus(true); }, 150);
      }, 0);
    }

    /* ---- render ---- */
    function syncControls() {
      seg.set(S.mode);
      K.vars.forEach(function (vd) { ctl[vd.key].set(S[vd.key]); });
      Object.keys(ctl).forEach(function (k) { ctl[k].el.classList.remove('bad'); var er = ctl[k].el.querySelector('.lab-ctl-err'); if (er) er.textContent = ''; });
      if (ctl.Rd) { ctl.Rd.set(S.Rd); rdCheck.checked = !!S.rdSame; }
      target.set(S.target);
      if (ac) ac.sync();
    }
    function save() { if (ctx.save) { try { ctx.save(copy(S)); } catch (e) {} } }
    function changed() { if (destroyed) return; fr.markPreset(null); render(); save(); }

    function render() {
      if (K.kind === 'rl' && S.rdSame && pos(S.R)) S.Rd = S.R;   // "Same as R" means one resistor
      var bad = K.model.valid(S);
      notes.innerHTML = '';
      if (rdBox) rdBox.hidden = S.mode !== 'deenergize';
      if (bad.length) {
        notes.appendChild(kit.note('These values cannot be simulated: ' + bad.join(', ') + ' must be positive numbers.', 'bad'));
        return;
      }
      var sum = K.model.summary(S);
      var tau = sum.tau;
      probe.setTau(tau);
      probe.set(S.t);
      var at = K.model.at(S, S.t);

      // notes / edge cases
      K.notes(S, sum, at).forEach(function (n) { notes.appendChild(kit.note(n[1], n[0])); });

      circ.update(K.diagram(S, F, at));
      roSum.update(K.sumValues(S, sum));
      kit.tex(probeHead, 'Values at \\(t = ' + tq(S.t, 's') + '\\) (' + kit.sigStr(at.u, 4) + ' τ)');
      roAt.update(K.atValues(S, at));

      // solve-for-time
      var sol = K.model.timeTo(S, S.target);
      lastSolve = sol;
      solveBtn.disabled = !sol.ok;
      solveOut.innerHTML = '';
      kit.tex(solveOut, K.solveText(S, sum, sol, tq));

      // charts
      var tg = ghost ? K.model.summary(ghost).tau : 0;
      var xmax = 6 * Math.max(tau, tg), xmin = -0.5 * tau;
      var cm = chartMarks(tau, tg, S.t);
      var marks = cm.marks, tMark = cm.probe;
      var cv = K.chartV(S, sum, at, ghost), ci = K.chartI(S, sum, at, ghost);
      var fmtRows = function (x) { return K.cursorRows(S, x, tq); };
      chartV.update({ xmin: xmin, xmax: xmax, xunit: 's', yunit: 'V', xlabel: 'time t', ylabel: 'voltage (V)', cursor: true, cursorFmt: fmtRows, ariaLabel: cv.aria,
        series: cv.series, marks: marks.concat(cv.marks).concat([tMark]), height: 250 });
      chartI.update({ xmin: xmin, xmax: xmax, xunit: 's', yunit: 'A', xlabel: 'time t', ylabel: 'current (A)', cursor: true, cursorFmt: fmtRows, ariaLabel: ci.aria,
        series: ci.series, marks: marks.concat(ci.marks).concat([tMark]), height: 210 });

      // ghost info
      ghostBtn.textContent = ghost ? 'Clear the kept curve' : 'Keep this curve to compare';
      ghostBtn.setAttribute('aria-pressed', ghost ? 'true' : 'false');
      ghostInfo.textContent = ghost ? K.ghostText(ghost, tg, tau) : '';

      // conditions + table
      condBox.innerHTML = '';
      K.conditions(S, condBox, tq);
      tabBox.innerHTML = '';
      tabBox.appendChild(h('h4', { class: 'lab-rcrl-h', text: 'Whole time constants (universal time-constant chart)' }));
      tabBox.appendChild(K.tableEl(S, tq));
      tabBox.appendChild(h('p', { class: 'lab-rcrl-small', text: 'The “chart” column is the rounded value printed in the guides; the other columns are computed from the exact exponential.' }));

      work.update(K.workLines(S, sum, at, tq, N));
    }

    function apply(values, preset) {
      var prevAc = S.ac;
      S = merge(S, copy(values));
      if (values.ac) S.ac = merge(prevAc || AC_DEFAULT, values.ac);
      if (S.t == null || !isFinite(S.t)) S.t = K.model.summary(S).tau;
      syncControls();
      render();
      save();
      if (preset) {
        fr.markPreset(preset.id);
        if (acOnly(preset.values) && ac) ac.focus();
      }
    }

    syncControls();
    render();
    return {
      destroy: function () { destroyed = true; if (acTimer) { clearTimeout(acTimer); acTimer = null; } chartV.destroy(); chartI.destroy(); if (ac) ac.destroy(); el.innerHTML = ''; },
      setState: function (v) { if (v && typeof v === 'object') apply(v, null); }
    };
  }

  /* ---------------- AC (cl5) panel inside the RL lab ---------------- */
  function mountAc(kit, fr, getS, onSave) {
    var h = kit.h, F = kit.fmt, tq = makeTq(kit);
    if (!getS().ac) getS().ac = copy(AC_DEFAULT);
    var det = h('details', { class: 'lab-rcrl-ac' });
    det.appendChild(h('summary', { text: 'Sinusoidal steady state: reactance and impedance of a series RL circuit (cl5)' }));
    var body = h('div', { class: 'lab-rcrl-acbody' });
    var cbox = h('div', { class: 'lab-controls' }), obox = h('div', { class: 'lab-rcrl-acout' });
    body.appendChild(cbox); body.appendChild(obox);
    det.appendChild(body);
    fr.output.appendChild(det);
    var c = {};
    var defs = [
      { key: 'V', label: 'Source amplitude \\(V_T\\) (peak or RMS)', unit: 'V', min: 1, max: 240, scale: 'lin', step: 1, hardMin: 1e-3, hardMax: 1e5 },
      { key: 'f', label: 'Frequency \\(f\\)', unit: 'Hz', min: 1, max: 1e5, scale: 'log', hardMin: 0, hardMax: 1e9 },
      { key: 'L', label: 'Inductance \\(L\\)', unit: 'H', min: 1e-3, max: 100, scale: 'log', hardMin: 0, hardMax: 1e4 },
      { key: 'R', label: 'Series resistance \\(R\\) (0 = inductor only)', unit: 'Ω', min: 0, max: 10000, scale: 'lin', step: 10, hardMin: 0, hardMax: 1e8 }
    ];
    defs.forEach(function (d) {
      c[d.key] = kit.control({ label: d.label, unit: d.unit, min: d.min, max: d.max, scale: d.scale, step: d.step, value: getS().ac[d.key], hardMin: d.hardMin, hardMax: d.hardMax, sig: 4,
        onInput: function (v) { getS().ac[d.key] = v; render(); onSave(); } });
      cbox.appendChild(c[d.key].el);
    });
    var note = h('div', { role: 'status', 'aria-live': 'polite' });
    var dg = h('div');
    var circ = kit.circuit(dg, { parts: [] });
    var ro = kit.readout([
      { key: 'XL', label: '\\(X_L = 2\\pi f L\\)', unit: 'Ω', emph: true },
      { key: 'Z', label: '\\(Z = \\sqrt{R^2 + X_L^2}\\)', unit: 'Ω' },
      { key: 'th', label: 'Phase angle \\(\\theta\\)' },
      { key: 'I', label: '\\(I_T = V_T / Z\\)', unit: 'A' },
      { key: 'VR', label: '\\(V_R = I_T R\\)', unit: 'V' },
      { key: 'VL', label: '\\(V_L = I_T X_L\\)', unit: 'V' }
    ], { compact: true });
    var work = kit.workings('Show the calculation (substituted values)');
    obox.appendChild(note); obox.appendChild(dg); obox.appendChild(ro.el); obox.appendChild(work.el);
    function render() {
      var a = getS().ac;
      note.innerHTML = '';
      var bad = acValid(a);
      if (bad.length) {
        note.appendChild(kit.note(bad[0] === 'Z0' ? 'With \\(R = 0\\) and \\(X_L = 0\\) (f = 0 or L = 0) the impedance is 0 Ω, so the current would be unbounded. Give R or \\(X_L\\) a value.' : 'Enter non-negative values (V_T must be positive).', 'bad'));
        return;
      }
      var r = acRL(a);
      if (a.f === 0) note.appendChild(kit.note('At \\(f = 0\\) (DC) the inductor\'s reactance is 0 Ω: at steady state it acts like a wire.', ''));
      circ.update(acDiagram(a, r, F));
      ro.update({ XL: r.XL, Z: r.Z, th: r.theta.toFixed(2) + '°', I: r.I, VR: r.VR, VL: r.VL });
      var L2 = [
        'X_L = 2\\pi f L = 2\\pi(' + tq(a.f, 'Hz') + ')(' + tq(a.L, 'H') + ') = ' + tq(r.XL, 'Ω'),
        'Z = \\sqrt{R^2 + X_L^2} = \\sqrt{(' + tq(a.R, 'Ω') + ')^2 + (' + tq(r.XL, 'Ω') + ')^2} = ' + tq(r.Z, 'Ω'),
        '\\theta = \\tan^{-1}\\!\\frac{X_L}{R} = ' + (a.R === 0 ? '90^\\circ\\ \\text{(no resistance: pure inductance)}' : '\\tan^{-1}\\!\\frac{' + tq(r.XL, 'Ω') + '}{' + tq(a.R, 'Ω') + '} = ' + r.theta.toFixed(2) + '^\\circ'),
        'I_T = \\frac{V_T}{Z} = \\frac{' + tq(a.V, 'V') + '}{' + tq(r.Z, 'Ω') + '} = ' + tq(r.I, 'A'),
        'V_R = I_T R = ' + tq(r.VR, 'V') + ',\\qquad V_L = I_T X_L = ' + tq(r.VL, 'V'),
        'Check (phasors add by Pythagoras, not arithmetically): \\(\\sqrt{V_R^2 + V_L^2} = ' + tq(Math.sqrt(r.VR * r.VR + r.VL * r.VL), 'V') + ' = V_T\\), while \\(V_R + V_L = ' + tq(r.VR + r.VL, 'V') + '\\).'
      ];
      work.update(L2);
    }
    render();
    return {
      sync: function () { var A = getS().ac; Object.keys(c).forEach(function (k) { c[k].set(A[k]); }); render(); },
      open: function () { det.open = true; },
      isOpen: function () { return !!det.open; },
      focus: function (instant) { det.open = true; try { det.scrollIntoView({ behavior: instant || kit.reducedMotion() ? 'auto' : 'smooth', block: 'start' }); } catch (e) {} },
      destroy: function () {}
    };
  }

  /* ================================================================ RC kind */
  var RC_K = {
    kind: 'rc', model: RC_MODEL, defaults: merge(RC_DEFAULT, {}),
    modes: [{ value: 'charge', label: 'Charge' }, { value: 'discharge', label: 'Discharge' }],
    vars: [
      { key: 'Vs', label: 'Source voltage \\(V_S\\)', unit: 'V', min: 1, max: 100, scale: 'lin', step: 0.5, hardMin: 1e-3, hardMax: 1e5 },
      { key: 'R', label: 'Resistance \\(R\\)', unit: 'Ω', min: 1, max: 1e7, scale: 'log', hardMin: 1e-3, hardMax: 1e10 },
      { key: 'C', label: 'Capacitance \\(C\\)', unit: 'F', min: 1e-9, max: 10, scale: 'log', hardMin: 1e-15, hardMax: 1e4 }
    ],
    ghostHint: 'R or C',
    targetLabel: 'Capacitor voltage to reach, \\(v_C\\)', targetUnit: 'V',
    chartVTitle: 'Voltages', chartITitle: 'Current',
    applyPreset: function (S, v) { return merge(S, copy(v)); },
    sumItems: function () {
      return [
        { key: 'tau', label: '\\(\\tau = RC\\)', unit: 's', emph: true },
        { key: 't5', label: '\\(5\\tau\\) (practically done)', unit: 's' },
        { key: 'I', label: 'Current at \\(0^+\\)', unit: 'A' },
        { key: 'W', label: 'Energy at \\(V_S\\): \\(\\tfrac12 C V_S^2\\)', unit: 'J' }
      ];
    },
    sumValues: function (S, sum) { return { tau: sum.tau, t5: sum.t5, I: S.mode === 'discharge' ? -sum.Imax : sum.Imax, W: sum.W }; },
    atItems: [
      { key: 'vC', label: '\\(v_C(t)\\)', unit: 'V', emph: true },
      { key: 'vR', label: '\\(v_R(t)\\)', unit: 'V' },
      { key: 'i', label: '\\(i(t)\\)', unit: 'A' },
      { key: 'pct', label: '\\(v_C\\) on the time-constant chart' }
    ],
    atValues: function (S, a) {
      return { vC: a.vC, vR: a.vR, i: a.i, pct: kit0().sigStr(a.pct, 4) + (S.mode === 'discharge' ? ' % of V₀ left' : ' % of final') };
    },
    diagram: rcDiagram,
    notes: function (S, sum, at) {
      var k = kit0(), out = [];
      if (S.t < 0) out.push(['', 'Negative \\(t\\) shows the circuit before the switch moves (\\(t = 0^-\\)).']);
      else if (S.t > 6 * sum.tau) out.push(['', 'This \\(t\\) is beyond \\(6\\tau\\), past the right edge of the chart: the transient is over (' + k.sigStr(at.u, 3) + ' τ).']);
      if (sum.tau < 1e-9) out.push(['warn', '\\(\\tau\\) is below 1 ns. Real wiring adds stray inductance and capacitance at that scale, so this ideal model stops being realistic.']);
      if (sum.Imax > 100) out.push(['warn', 'The current at \\(0^+\\) is ' + k.fmt(sum.Imax, 'A', 3) + '. A real source and real wires could not deliver that; their resistance would limit it (cl4: the spark when you plug in a charger).']);
      return out;
    },
    solveText: function (S, sum, sol, tq) {
      var k = kit0();
      if (sol.ok) {
        if (S.mode === 'discharge') return '\\(t = \\tau\\ln\\frac{V_0}{v_C} = (' + tq(sum.tau, 's') + ')\\ln\\frac{' + tq(S.Vs, 'V') + '}{' + tq(S.target, 'V') + '} =\\) <b>' + k.fmt(sol.t, 's', 4) + '</b> (' + k.sigStr(sol.t / sum.tau, 4) + ' τ).';
        return '\\(t = -\\tau\\ln\\left(1 - \\frac{v_C}{V_S}\\right) = -(' + tq(sum.tau, 's') + ')\\ln\\left(1 - \\frac{' + tq(S.target, 'V') + '}{' + tq(S.Vs, 'V') + '}\\right) =\\) <b>' + k.fmt(sol.t, 's', 4) + '</b> (' + k.sigStr(sol.t / sum.tau, 4) + ' τ).';
      }
      if (sol.why === 'never') return S.mode === 'discharge' ? 'The capacitor voltage approaches 0 V but never reaches it exactly. Choose a value above 0 V.' : 'The capacitor voltage approaches \\(V_S = ' + tq(S.Vs, 'V') + '\\) but never reaches it (99.3 % after 5τ). Choose a value below \\(V_S\\).';
      if (sol.why === 'above') return 'During discharge \\(v_C\\) starts at \\(V_0 = ' + tq(S.Vs, 'V') + '\\) and only falls. Choose a value between 0 V and \\(V_0\\).';
      if (sol.why === 'below') return 'While charging from 0 V, \\(v_C\\) is never negative. Choose a value between 0 V and \\(V_S\\).';
      return 'Enter a target voltage.';
    },
    chartV: function (S, sum, at, ghost) {
      var m = RC_MODEL, ref = S.Vs, dis = S.mode === 'discharge';
      var series = [
        { id: 'vC', label: 'capacitor voltage vC', cls: 's1', fn: function (t) { return m.at(S, t).vC; } },
        { id: 'vR', label: 'resistor voltage vR', cls: 's3', fn: function (t) { return m.at(S, t).vR; } }
      ];
      if (ghost) series.push({ id: 'gvC', label: 'kept vC (τ = ' + kit0().fmt(m.summary(ghost).tau, 's', 3) + ')', cls: 'ghost', fn: function (t) { return m.at(ghost, t).vC; } });
      var marks = dis
        ? [{ type: 'hline', y: 0.368 * ref, label: '36.8 % of V₀' }, { type: 'hline', y: -0.368 * ref, label: '−36.8 %' }]
        : [{ type: 'hline', y: 0.632 * ref, label: '63.2 % of final' }, { type: 'hline', y: 0.368 * ref, label: '36.8 %' }];
      marks.push({ type: 'point', x: S.t, y: at.vC, label: 'vC', cls: 'filled' });
      marks.push({ type: 'point', x: S.t, y: at.vR, label: 'vR', cls: 's3' });
      return { series: series, marks: marks, aria: (dis ? 'Discharge' : 'Charging') + ' voltages versus time: vC ' + (dis ? 'falls from ' : 'rises from 0 to ') + kit0().fmt(ref, 'V', 3) + (dis ? ' to 0' : '') + ', time constant ' + kit0().fmt(sum.tau, 's', 3) + '. Values at whole time constants are in the table below.' };
    },
    chartI: function (S, sum, at, ghost) {
      var m = RC_MODEL, dis = S.mode === 'discharge', I = sum.Imax;
      var series = [{ id: 'i', label: 'current i', cls: 's1', fn: function (t) { return m.at(S, t).i; } }];
      if (ghost) series.push({ id: 'gi', label: 'kept i', cls: 'ghost', fn: function (t) { return m.at(ghost, t).i; } });
      var marks = [{ type: 'hline', y: (dis ? -1 : 1) * 0.368 * I, label: '36.8 % of the jump' },
        { type: 'point', x: S.t, y: at.i, label: 'i', cls: 'filled' }];
      return { series: series, marks: marks, aria: 'Current versus time: jumps to ' + kit0().fmt(dis ? -I : I, 'A', 3) + ' at the switching instant and decays to 0 with time constant ' + kit0().fmt(sum.tau, 's', 3) + '.' };
    },
    cursorRows: function (S, x, tq) {
      var a = RC_MODEL.at(S, x), k = kit0();
      return [{ label: '\\(t\\)', value: k.fmt(x, 's', 4) + ' (' + k.sigStr(a.u, 3) + ' τ)' }, { label: '\\(v_C\\)', value: k.fmt(a.vC, 'V', 4) }, { label: '\\(v_R\\)', value: k.fmt(a.vR, 'V', 4) }, { label: '\\(i\\)', value: k.fmt(a.i, 'A', 4) }];
    },
    ghostText: function (g, tg, tau) {
      var k = kit0();
      return 'Kept: R = ' + k.fmt(g.R, 'Ω', 3) + ', C = ' + k.fmt(g.C, 'F', 3) + ', τ = ' + k.fmt(tg, 's', 3) + '. Now τ = ' + k.fmt(tau, 's', 3) + ' (' + k.sigStr(tau / tg, 3) + ' × the kept τ).';
    },
    conditions: function (S, box, tq) {
      var k = kit0(), c = RC_MODEL.conditions(S), dis = S.mode === 'discharge';
      box.appendChild(k.h('h4', { class: 'lab-rcrl-h', text: 'Initial and final conditions' }));
      var row = function (lbl, key, u) { return [lbl, k.fmt(c.minus[key], u, 4), k.fmt(c.plus[key], u, 4), k.fmt(c.inf[key], u, 4)]; };
      box.appendChild(table(k, ['Quantity', '\\(t = 0^-\\) (just before)', '\\(t = 0^+\\) (just after)', '\\(t \\to \\infty\\) (after about \\(5\\tau\\))'],
        [row('\\(v_C\\)', 'vC', 'V'), row('\\(v_R\\)', 'vR', 'V'), row('\\(i\\)', 'i', 'A')], 'lab-rcrl-tabnum'));
      var p1 = k.h('p'), p2 = k.h('p'), p3 = k.h('p');
      if (dis) {
        k.tex(p1, '<b>Continuity:</b> \\(v_C(0^-) = v_C(0^+) = V_0 = ' + tq(S.Vs, 'V') + '\\). A capacitor\'s voltage cannot jump; that would need an infinite current.');
        k.tex(p2, '<b>Jumps:</b> \\(i\\) goes from 0 to \\(-V_0/R = ' + tq(-S.Vs / S.R, 'A') + '\\) instantly. The charged capacitor now pushes current out of its + plate, opposite to the charging direction, so \\(i\\) and \\(v_R\\) are negative (\\(v_R = -v_C\\) by KVL around the R–C loop).');
        k.tex(p3, '<b>Final:</b> the capacitor has given up its charge: \\(v_C \\to 0\\), \\(i \\to 0\\).');
      } else {
        k.tex(p1, '<b>Continuity:</b> \\(v_C(0^-) = v_C(0^+) = 0\\). A capacitor\'s voltage cannot jump (that would need an infinite current), so at \\(t = 0^+\\) the uncharged capacitor acts like a short (cl4).');
        k.tex(p2, '<b>Jumps:</b> \\(i\\) goes from 0 to \\(V_S/R = ' + tq(S.Vs / S.R, 'A') + '\\) and \\(v_R\\) from 0 to \\(V_S\\) instantly. Resistor quantities are free to jump.');
        k.tex(p3, '<b>Final:</b> after about \\(5\\tau\\) the capacitor is fully charged and acts like an open circuit: \\(v_C = V_S\\), \\(v_R = 0\\), \\(i = 0\\).');
      }
      box.appendChild(p1); box.appendChild(p2); box.appendChild(p3);
    },
    tableEl: function (S, tq) {
      var k = kit0(), rows = RC_MODEL.table(S), dis = S.mode === 'discharge';
      return table(k, ['\\(n\\)', '\\(t = n\\tau\\)', dis ? 'Chart: % of \\(V_0\\) left' : 'Chart: % of \\(V_S\\)', 'Exact %', '\\(v_C\\)', '\\(v_R\\)', '\\(i\\)'],
        rows.map(function (r) { return [r.n + 'τ', k.fmt(r.t, 's', 4), r.chart.toFixed(1) + ' %', k.sigStr(r.pct, 4) + ' %', k.fmt(r.vC, 'V', 4), k.fmt(r.vR, 'V', 4), k.fmt(r.i, 'A', 4)]; }), 'lab-rcrl-tabnum');
    },
    workLines: function (S, sum, at, tq, N) {
      var k = kit0(), L = [], u = at.u, x = Math.exp(-u);
      L.push('\\tau = RC = (' + tq(S.R, 'Ω') + ')(' + tq(S.C, 'F') + ') = ' + tq(sum.tau, 's') + ',\\qquad 5\\tau = ' + tq(sum.t5, 's'));
      if (S.t < 0) {
        L.push('Before the switch moves (\\(t \\lt 0\\)): \\(v_C = ' + tq(at.vC, 'V') + '\\), \\(v_R = 0\\), \\(i = 0\\).');
        return L;
      }
      L.push('\\frac{t}{\\tau} = \\frac{' + tq(S.t, 's') + '}{' + tq(sum.tau, 's') + '} = ' + N(u) + ',\\qquad \\mathrm{e}^{-t/\\tau} = \\mathrm{e}^{-' + N(u) + '} = ' + N(x));
      if (S.mode === 'discharge') {
        L.push('v_C(0^+) = v_C(0^-) = V_0 = ' + tq(S.Vs, 'V'));
        L.push('v_C = V_0\\,\\mathrm{e}^{-t/\\tau} = (' + tq(S.Vs, 'V') + ')(' + N(x) + ') = ' + tq(at.vC, 'V'));
        L.push('v_R = -v_C = ' + tq(at.vR, 'V') + '\\quad\\text{(KVL around the R-C loop)}');
        L.push('i = \\frac{v_R}{R} = \\frac{' + tq(at.vR, 'V') + '}{' + tq(S.R, 'Ω') + '} = ' + tq(at.i, 'A') + '\\quad\\text{(negative: opposite to the charging direction)}');
      } else {
        L.push('I_{max} = \\frac{V_S}{R} = \\frac{' + tq(S.Vs, 'V') + '}{' + tq(S.R, 'Ω') + '} = ' + tq(sum.Imax, 'A') + '\\quad(\\text{at } t = 0^+)');
        L.push('v_C = V_S\\left(1 - \\mathrm{e}^{-t/\\tau}\\right) = ' + tq(S.Vs, 'V') + '\\,(1 - ' + N(x) + ') = ' + tq(at.vC, 'V'));
        L.push('v_R = V_S\\,\\mathrm{e}^{-t/\\tau} = (' + tq(S.Vs, 'V') + ')(' + N(x) + ') = ' + tq(at.vR, 'V'));
        L.push('i = \\frac{v_R}{R} = \\frac{' + tq(at.vR, 'V') + '}{' + tq(S.R, 'Ω') + '} = ' + tq(at.i, 'A'));
        L.push('Check with KVL: \\(v_R + v_C = ' + tq(at.vR + at.vC, 'V') + ' = V_S\\). Position on the chart: \\(v_C / V_S = ' + k.sigStr(at.pct, 4) + '\\,\\%\\).');
      }
      return L;
    }
  };

  /* ================================================================ RL kind */
  var RL_K = {
    kind: 'rl', model: RL_MODEL, defaults: merge(RL_DEFAULT, { ac: copy(AC_DEFAULT) }),
    modes: [{ value: 'energize', label: 'Energize (build-up)' }, { value: 'deenergize', label: 'De-energize (decay)' }],
    vars: [
      { key: 'Vs', label: 'Source voltage \\(V_s\\)', unit: 'V', min: 1, max: 100, scale: 'lin', step: 0.5, hardMin: 1e-3, hardMax: 1e5 },
      { key: 'R', label: 'Resistance \\(R\\)', unit: 'Ω', min: 0.1, max: 1e6, scale: 'log', hardMin: 1e-3, hardMax: 1e9 },
      { key: 'L', label: 'Inductance \\(L\\)', unit: 'H', min: 1e-6, max: 100, scale: 'log', hardMin: 1e-12, hardMax: 1e5 }
    ],
    ghostHint: 'L, R or R_d',
    targetLabel: 'Inductor current to reach, \\(i\\)', targetUnit: 'A',
    chartVTitle: 'Voltages', chartITitle: 'Inductor current',
    applyPreset: function (S, v) {
      var o = merge(S, copy(v));
      if (v.ac) o.ac = merge(S.ac || AC_DEFAULT, v.ac);
      return o;
    },
    sumItems: function () {
      return [
        { key: 'tau', label: 'Time constant \\(\\tau\\)', unit: 's', emph: true },
        { key: 't5', label: '\\(5\\tau\\) (practically done)', unit: 's' },
        { key: 'I', label: '\\(I_{max} = V_s/R\\)', unit: 'A' },
        { key: 'spike', label: '\\(v_L(0^+)\\)', unit: 'V' },
        { key: 'W', label: 'Energy at \\(I_{max}\\): \\(\\tfrac12 L I_{max}^2\\)', unit: 'J' }
      ];
    },
    sumValues: function (S, sum) { return { tau: sum.tau, t5: sum.t5, I: sum.Imax, spike: sum.spike, W: sum.W }; },
    atItems: [
      { key: 'i', label: '\\(i_L(t)\\)', unit: 'A', emph: true },
      { key: 'vR', label: '\\(v_R\\) (\\(v_{R_d}\\) if \\(R_d\\) is separate)', unit: 'V' },
      { key: 'vL', label: '\\(v_L(t)\\)', unit: 'V' },
      { key: 'pct', label: '\\(i_L\\) as % of \\(I_{max}\\)' }
    ],
    atValues: function (S, a) {
      var de = S.mode === 'deenergize';
      return { i: a.i, vR: rlShownR(S, a).v, vL: a.vL, pct: kit0().sigStr(a.pct, 4) + ' %' };
    },
    diagram: rlDiagram,
    notes: function (S, sum, at) {
      var k = kit0(), out = [];
      if (S.t < 0) out.push(['', 'Negative \\(t\\) shows the circuit before the switch moves (\\(t = 0^-\\)).']);
      else if (S.t > 6 * sum.tau) out.push(['', 'This \\(t\\) is beyond \\(6\\tau\\), past the right edge of the chart: the transient is over (' + k.sigStr(at.u, 3) + ' τ).']);
      if (S.mode === 'deenergize' && S.Rd > S.R * 1.0001) out.push(['warn', 'Inductive kick: the same ' + k.fmt(sum.Imax, 'A', 3) + ' is forced through \\(R_d\\), so \\(|v_L(0^+)| = I_0 R_d = ' + makeTq(k)(-sum.spike, 'V', 3) + '\\), ' + k.sigStr(S.Rd / S.R, 3) + ' times the source voltage. With no decay path at all (\\(R_d \\to \\infty\\)) the spike would be unbounded and the switch contacts would arc (cl2 §5, cl1).']);
      if (sum.Imax > 100) out.push(['warn', '\\(I_{max} = ' + makeTq(k)(sum.Imax, 'A', 3) + '\\) is unrealistically large. As \\(R \\to 0\\), \\(V_s/R\\) grows without bound (cl2 §2b); a real source and wiring would limit it.']);
      if (sum.tau < 1e-9) out.push(['warn', '\\(\\tau\\) is below 1 ns. At that scale stray capacitance matters and this ideal model stops being realistic.']);
      return out;
    },
    solveText: function (S, sum, sol, tq) {
      var k = kit0();
      if (sol.ok) {
        if (S.mode === 'deenergize') return '\\(t = \\tau\\ln\\frac{I_0}{i} = (' + tq(sum.tau, 's') + ')\\ln\\frac{' + tq(sum.Imax, 'A') + '}{' + tq(S.target, 'A') + '} =\\) <b>' + k.fmt(sol.t, 's', 4) + '</b> (' + k.sigStr(sol.t / sum.tau, 4) + ' τ).';
        return '\\(t = -\\tau\\ln\\left(1 - \\frac{i}{I_{max}}\\right) = -(' + tq(sum.tau, 's') + ')\\ln\\left(1 - \\frac{' + tq(S.target, 'A') + '}{' + tq(sum.Imax, 'A') + '}\\right) =\\) <b>' + k.fmt(sol.t, 's', 4) + '</b> (' + k.sigStr(sol.t / sum.tau, 4) + ' τ).';
      }
      if (sol.why === 'never') return S.mode === 'deenergize' ? 'The current approaches 0 A but never reaches it exactly. Choose a value above 0 A.' : 'The current approaches \\(I_{max} = ' + tq(sum.Imax, 'A') + '\\) but never reaches it (99.3 % after 5τ). Choose a value below \\(I_{max}\\).';
      if (sol.why === 'above') return 'During the decay \\(i\\) starts at \\(I_0 = ' + tq(sum.Imax, 'A') + '\\) and only falls. Choose a value between 0 A and \\(I_0\\).';
      if (sol.why === 'below') return 'During build-up from 0 A the current is never negative. Choose a value between 0 A and \\(I_{max}\\).';
      return 'Enter a target current.';
    },
    chartV: function (S, sum, at, ghost) {
      var m = RL_MODEL, de = S.mode === 'deenergize', k = kit0();
      var sep = de && !rlShared(S);
      var series = [{ id: 'vL', label: 'inductor voltage vL', cls: 's1', fn: function (t) { return m.at(S, t).vL; } },
        { id: sep ? 'vRd' : 'vR', label: sep ? 'voltage across R_d' : 'resistor voltage vR', cls: 's3', fn: function (t) { return rlShownR(S, m.at(S, t)).v; } }];
      if (ghost) series.push({ id: 'gvL', label: 'kept vL (τ = ' + k.fmt(m.summary(ghost).tau, 's', 3) + ')', cls: 'ghost', fn: function (t) { return m.at(ghost, t).vL; } });
      var ref = de ? -sum.spike : S.Vs;
      var marks = de
        ? [{ type: 'hline', y: -0.368 * ref, label: '36.8 % of the kick' }, { type: 'hline', y: 0.368 * ref, label: '36.8 %' }]
        : [{ type: 'hline', y: 0.632 * ref, label: '63.2 % of final' }, { type: 'hline', y: 0.368 * ref, label: '36.8 %' }];
      marks.push({ type: 'point', x: S.t, y: at.vL, label: 'vL', cls: 'filled' });
      marks.push({ type: 'point', x: S.t, y: rlShownR(S, at).v, label: sep ? 'vRd' : 'vR', cls: 's3' });
      return { series: series, marks: marks, aria: (de ? 'Decay' : 'Build-up') + ' voltages versus time: vL ' + (de ? 'jumps to ' + k.fmt(sum.spike, 'V', 3) + ' and returns to 0' : 'jumps to ' + k.fmt(S.Vs, 'V', 3) + ' and decays to 0') + ', time constant ' + k.fmt(sum.tau, 's', 3) + '.' };
    },
    chartI: function (S, sum, at, ghost) {
      var m = RL_MODEL, de = S.mode === 'deenergize', I = sum.Imax, k = kit0();
      var series = [{ id: 'i', label: 'inductor current i', cls: 's1', fn: function (t) { return m.at(S, t).i; } }];
      if (ghost) series.push({ id: 'gi', label: 'kept i (τ = ' + k.fmt(m.summary(ghost).tau, 's', 3) + ')', cls: 'ghost', fn: function (t) { return m.at(ghost, t).i; } });
      var marks = de ? [{ type: 'hline', y: 0.368 * I, label: '36.8 % of I₀' }] : [{ type: 'hline', y: 0.632 * I, label: '63.2 % of final' }];
      marks.push({ type: 'point', x: S.t, y: at.i, label: 'i', cls: 'filled' });
      return { series: series, marks: marks, aria: 'Inductor current versus time: ' + (de ? 'starts at ' + k.fmt(I, 'A', 3) + ' and decays to 0' : 'rises from 0 toward ' + k.fmt(I, 'A', 3)) + ' with time constant ' + k.fmt(sum.tau, 's', 3) + ', without any jump.' };
    },
    cursorRows: function (S, x) {
      var a = RL_MODEL.at(S, x), k = kit0(), sr = rlShownR(S, a);
      return [{ label: '\\(t\\)', value: k.fmt(x, 's', 4) + ' (' + k.sigStr(a.u, 3) + ' τ)' }, { label: '\\(i\\)', value: k.fmt(a.i, 'A', 4) },
        { label: '\\(v_{' + sr.sym + '}\\)', value: k.fmt(sr.v, 'V', 4) }, { label: '\\(v_L\\)', value: k.fmt(a.vL, 'V', 4) }];
    },
    ghostText: function (g, tg, tau) {
      var k = kit0();
      return 'Kept: L = ' + k.fmt(g.L, 'H', 3) + ', ' + (g.mode === 'deenergize' && !rlShared(g) ? 'R_d = ' + k.fmt(g.Rd, 'Ω', 3) : 'R = ' + k.fmt(g.R, 'Ω', 3)) + ', τ = ' + k.fmt(tg, 's', 3) + '. Now τ = ' + k.fmt(tau, 's', 3) + ' (' + k.sigStr(tau / tg, 3) + ' × the kept τ).';
    },
    conditions: function (S, box, tq) {
      var k = kit0(), de = S.mode === 'deenergize';
      box.appendChild(k.h('h4', { class: 'lab-rcrl-h', text: 'Initial and final conditions' }));
      var rows = rlCondRows(S).map(function (r) { return ['\\(' + r.q + '\\)', k.fmt(r.minus, r.unit, 4), k.fmt(r.plus, r.unit, 4), k.fmt(r.inf, r.unit, 4)]; });
      var shared = rlShared(S), rd = shared ? 'R' : 'R_d';
      box.appendChild(table(k, ['Quantity', '\\(t = 0^-\\) (just before)', '\\(t = 0^+\\) (just after)', '\\(t \\to \\infty\\) (after about \\(5\\tau\\))'], rows, 'lab-rcrl-tabnum'));
      var p1 = k.h('p'), p2 = k.h('p'), p3 = k.h('p');
      var I = S.Vs / S.R;
      if (de) {
        k.tex(p1, '<b>Continuity:</b> \\(i_L(0^-) = i_L(0^+) = I_0 = V_s/R = ' + tq(I, 'A') + '\\). An inductor\'s current cannot jump; that would need an infinite voltage.');
        if (shared) k.tex(p2, '<b>Jumps:</b> the source leaves the loop, but the same current keeps flowing through \\(R\\), so \\(v_R\\) stays at \\(I_0 R = ' + tq(I * S.R, 'V') + '\\) and \\(v_L\\) flips polarity instantly: \\(v_L(0^+) = -I_0 R = -V_s = ' + tq(-I * S.R, 'V') + '\\). The collapsing field now acts as the source.');
        else k.tex(p2, '<b>Jumps:</b> the same current is forced through \\(R_d\\), so \\(v_L\\) flips polarity instantly: \\(v_L(0^+) = -I_0 R_d = ' + tq(-I * S.Rd, 'V') + '\\) (\\(R_d/R = ' + k.sigStr(S.Rd / S.R, 3) + '\\) times \\(V_s\\)). The collapsing field now acts as the source.');
        k.tex(p3, '<b>Final:</b> the stored energy (\\(\\tfrac12 L I_0^2 = ' + tq(0.5 * S.L * I * I, 'J') + '\\)) has been dissipated in \\(' + rd + '\\): \\(i_L \\to 0\\), \\(v_L \\to 0\\).');
      } else {
        k.tex(p1, '<b>Continuity:</b> \\(i_L(0^-) = i_L(0^+) = 0\\). An inductor\'s current cannot jump (that would need an infinite voltage), so at \\(t = 0^+\\) the inductor acts like an open circuit.');
        k.tex(p2, '<b>Jumps:</b> \\(v_L\\) goes from 0 to \\(V_s = ' + tq(S.Vs, 'V') + '\\) instantly: the whole source voltage appears across the inductor while \\(i = 0\\).');
        k.tex(p3, '<b>Final:</b> after about \\(5\\tau\\) the inductor acts like a wire: \\(i = V_s/R = ' + tq(I, 'A') + '\\), \\(v_R = V_s\\), \\(v_L = 0\\).');
      }
      box.appendChild(p1); box.appendChild(p2); box.appendChild(p3);
    },
    tableEl: function (S) {
      var k = kit0(), rows = RL_MODEL.table(S), de = S.mode === 'deenergize', sym = rlShownR(S, rows[0]).sym;
      return table(k, ['\\(n\\)', '\\(t = n\\tau\\)', de ? 'Chart: % of \\(I_0\\) left' : 'Chart: % of \\(I_{max}\\)', 'Exact %', '\\(i\\)', '\\(v_{' + sym + '}\\)', '\\(v_L\\)'],
        rows.map(function (r) { return [r.n + 'τ', k.fmt(r.t, 's', 4), r.chart.toFixed(1) + ' %', k.sigStr(r.pct, 4) + ' %', k.fmt(r.i, 'A', 4), k.fmt(rlShownR(S, r).v, 'V', 4), k.fmt(r.vL, 'V', 4)]; }), 'lab-rcrl-tabnum');
    },
    workLines: function (S, sum, at, tq, N) {
      var k = kit0(), L = [], u = at.u, x = Math.exp(-u), de = S.mode === 'deenergize';
      if (de) {
        L.push('I_0 = \\frac{V_s}{R} = \\frac{' + tq(S.Vs, 'V') + '}{' + tq(S.R, 'Ω') + '} = ' + tq(sum.Imax, 'A') + '\\quad\\text{(steady current with the switch at A)}');
        if (rlShared(S)) L.push('\\tau = \\frac{L}{R} = \\frac{' + tq(S.L, 'H') + '}{' + tq(S.R, 'Ω') + '} = ' + tq(sum.tau, 's') + ',\\qquad 5\\tau = ' + tq(sum.t5, 's') + '\\quad\\text{(the same R is in the decay loop)}');
        else L.push('\\tau = \\frac{L}{R_d} = \\frac{' + tq(S.L, 'H') + '}{' + tq(S.Rd, 'Ω') + '} = ' + tq(sum.tau, 's') + ',\\qquad 5\\tau = ' + tq(sum.t5, 's'));
      } else {
        L.push('\\tau = \\frac{L}{R} = \\frac{' + tq(S.L, 'H') + '}{' + tq(S.R, 'Ω') + '} = ' + tq(sum.tau, 's') + ',\\qquad 5\\tau = ' + tq(sum.t5, 's'));
        L.push('I_{max} = \\frac{V_s}{R} = \\frac{' + tq(S.Vs, 'V') + '}{' + tq(S.R, 'Ω') + '} = ' + tq(sum.Imax, 'A') + '\\quad\\text{(inductor acts like a wire at steady state)}');
      }
      if (S.t < 0) {
        L.push('Before the switch moves (\\(t \\lt 0\\)): \\(i_L = ' + tq(at.i, 'A') + '\\), \\(v_L = 0\\).');
        return L;
      }
      L.push('\\frac{t}{\\tau} = \\frac{' + tq(S.t, 's') + '}{' + tq(sum.tau, 's') + '} = ' + N(u) + ',\\qquad \\mathrm{e}^{-t/\\tau} = \\mathrm{e}^{-' + N(u) + '} = ' + N(x));
      if (de) {
        L.push('i = I_0\\,\\mathrm{e}^{-t/\\tau} = (' + tq(sum.Imax, 'A') + ')(' + N(x) + ') = ' + tq(at.i, 'A'));
        if (rlShared(S)) {
          L.push('v_R = iR = (' + tq(at.i, 'A') + ')(' + tq(S.R, 'Ω') + ') = ' + tq(at.vRd, 'V'));
          L.push('v_L = -v_R = ' + tq(at.vL, 'V') + ',\\qquad v_L(0^+) = -I_0 R = -V_s = ' + tq(sum.spike, 'V'));
          L.push('This is the lesson formula \\(i = \\frac{V_s}{R}\\mathrm{e}^{-Rt/L}\\) (cl2 §7).');
        } else {
          L.push('v_{R_d} = i R_d = (' + tq(at.i, 'A') + ')(' + tq(S.Rd, 'Ω') + ') = ' + tq(at.vRd, 'V'));
          L.push('v_L = -v_{R_d} = ' + tq(at.vL, 'V') + ',\\qquad v_L(0^+) = -I_0 R_d = ' + tq(sum.spike, 'V'));
          if (Math.abs(S.Rd - S.R) <= 1e-9 * S.R) L.push('With \\(R_d = R\\) the numbers match the lesson formula \\(i = \\frac{V_s}{R}\\mathrm{e}^{-Rt/L}\\) (cl2 §7); the lessons draw one resistor that carries both currents (tick “Same as R”).');
        }
      } else {
        L.push('i = \\frac{V_s}{R}\\left(1 - \\mathrm{e}^{-Rt/L}\\right) = (' + tq(sum.Imax, 'A') + ')(1 - ' + N(x) + ') = ' + tq(at.i, 'A'));
        L.push('v_R = iR = (' + tq(at.i, 'A') + ')(' + tq(S.R, 'Ω') + ') = ' + tq(at.vR, 'V'));
        L.push('v_L = V_s\\,\\mathrm{e}^{-Rt/L} = (' + tq(S.Vs, 'V') + ')(' + N(x) + ') = ' + tq(at.vL, 'V'));
        L.push('Check with KVL: \\(v_R + v_L = ' + tq(at.vR + at.vL, 'V') + ' = V_s\\). Position on the chart: \\(i / I_{max} = ' + k.sigStr(at.pct, 4) + '\\,\\%\\).');
      }
      L.push('W = \\tfrac12 L I_{max}^2 = \\tfrac12(' + tq(S.L, 'H') + ')(' + tq(sum.Imax, 'A') + ')^2 = ' + tq(sum.W, 'J') + '\\quad\\text{(energy in the field at full current)}');
      return L;
    }
  };

  function kit0() { return EL.kit; }

  /* ================================================================ register */
  EL.register({
    id: 'rc', topic: 'lc', sub: 'rc',
    title: 'RC circuit: charging and discharging a capacitor',
    blurb: 'Change \\(V_S\\), \\(R\\) and \\(C\\) and watch \\(v_C\\), \\(v_R\\) and \\(i\\) follow the universal time-constant curves, with \\(\\tau = RC\\).',
    assumptions: RC_ASSUME,
    presets: RC_PRESETS,
    model: RC_MODEL,
    ui: { chartMarks: chartMarks, diagram: rcDiagram, css: CSS },
    mount: function (el, ctx) { return mountTransient(this, el, ctx, RC_K); }
  });
  EL.register({
    id: 'rl', topic: 'lc', sub: 'rl',
    title: 'RL circuit: energizing and de-energizing an inductor',
    blurb: 'Change \\(V_s\\), \\(R\\) and \\(L\\) and watch \\(i\\), \\(v_R\\) and \\(v_L\\) follow the universal time-constant curves, with \\(\\tau = L/R\\). The de-energize mode lets the current decay through a separate resistance \\(R_d\\).',
    assumptions: RL_ASSUME,
    presets: RL_PRESETS,
    model: RL_MODEL,
    /* pure UI helpers, exported for build/tests/test_lab_rcrl.py */
    ui: { acOnly: acOnly, chartMarks: chartMarks, shared: rlShared, shownR: rlShownR, condRows: rlCondRows, diagram: rlDiagram, css: CSS },
    mount: function (el, ctx) { return mountTransient(this, el, ctx, RL_K); }
  });
})(typeof window !== 'undefined' ? window : this);
