/* EE 211 — interactive lab registry + shared toolkit.
 *
 * A lab file (js/labs/<id>.js) calls EELabs.register(def) at load time and must NOT touch the DOM at load time
 * (so its pure maths can be unit-tested in a DOM-less JS engine).
 *
 * def = {
 *   id, topic, sub?,            // topic id: deltawye|thevenin|srcxform|millman|lc|scope ; sub (lc only): 'rc'|'rl'
 *   title, blurb,               // plain text
 *   assumptions: [html...],     // strings, may contain \( TeX \)
 *   presets: [{ id, label, lesson, sec, values }],   // worked examples from the guides; values = the lab's own state shape
 *   model: { ...pure functions },                     // all numerical work lives here (tested headless)
 *   mount(el, ctx) -> { destroy(), setState?(values) } // builds the UI into el
 * }
 * ctx = { preset: values|null, state: saved values|null, save(values) /* debounced persist *\/, kit: EELabs.kit }
 */
(function (global) {
  'use strict';
  var registry = {};
  var order = [];

  function register(def) {
    if (!def || !def.id) throw new Error('lab needs an id');
    if (!registry[def.id]) order.push(def.id);
    registry[def.id] = def;
  }
  function get(id) { return registry[id] || null; }
  function list(topic, sub) {
    return order.map(function (id) { return registry[id]; }).filter(function (d) {
      return (!topic || d.topic === topic) && (!sub || !d.sub || d.sub === sub);
    });
  }
  function findPreset(lessonId, secId) {
    var out = [];
    order.forEach(function (id) {
      (registry[id].presets || []).forEach(function (p) {
        if (p.lesson === lessonId && (!secId || p.sec === secId)) out.push({ lab: registry[id], preset: p });
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------ numbers */
  var PRE = [
    [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']
  ];
  var NO_PREFIX = { '%': 1, '°': 1, 'div': 1, '': 1, 'rad/s': 1, 'τ': 1 };

  /* Round to sig significant figures, return string without exponent where possible. */
  function sigStr(v, sig) {
    sig = sig || 4;
    if (!isFinite(v)) return v > 0 ? '∞' : (v < 0 ? '−∞' : '—');
    if (v === 0) return '0';
    var a = Math.abs(v);
    var d = Math.floor(Math.log10(a));
    var dec = Math.max(0, sig - 1 - d);
    var s = v.toFixed(Math.min(dec, 12));
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('-', '−');
  }
  /* Engineering format with SI prefix: fmt(0.00123,'A') -> "1.23 mA"; fmt(4700,'Ω') -> "4.7 kΩ". */
  function fmt(v, unit, sig) {
    unit = unit == null ? '' : unit;
    if (v == null || isNaN(v)) return '—';
    if (!isFinite(v)) return (v > 0 ? '∞' : '−∞') + (unit ? ' ' + unit : '');
    if (NO_PREFIX[unit] !== undefined) return sigStr(v, sig) + (unit ? (unit === '%' || unit === '°' ? '' : ' ') + unit : '');
    if (v === 0) return '0 ' + unit;
    var a = Math.abs(v);
    for (var i = 0; i < PRE.length; i++) {
      var f = PRE[i][0];
      // use this prefix if the rounded mantissa is >= 1
      if (a >= f * 0.9995 || i === PRE.length - 1) {
        var m = v / f;
        var s = sigStr(m, sig);
        if (Math.abs(parseFloat(s.replace('−', '-'))) >= 1000 && i > 0) { m = v / PRE[i - 1][0]; s = sigStr(m, sig); return s + ' ' + PRE[i - 1][1] + unit; }
        return s + ' ' + PRE[i][1] + unit;
      }
    }
    return sigStr(v, sig) + ' ' + unit;
  }
  /* Plain number for TeX (no prefixes): tex number with \, thousands not used. */
  function num(v, sig) { return sigStr(v, sig || 4).replace('−', '-'); }

  /* Parse "4.7k", "4.7 kΩ", "10m", "2.2µF", "1e-3" → number in base units (NaN if invalid). */
  function parse(str, unit) {
    if (str == null) return NaN;
    var s = String(str).trim();
    if (!s) return NaN;
    if (global.EEPractice && global.EEPractice.parseQuantity) {
      var q = global.EEPractice.parseQuantity(s);
      if (q && isFinite(q.value)) return q.value;
    }
    s = s.replace(/−/g, '-').replace(/,/g, '').replace(/\s+/g, '');
    if (unit) s = s.replace(new RegExp(unit.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + '$'), '');
    s = s.replace(/(ohms?|Ω|V|A|F|H|s|Hz|W)$/i, '');
    var m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([TGMkmuµnp]?)$/i);
    if (!m) return NaN;
    var mult = { T: 1e12, G: 1e9, M: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, 'µ': 1e-6, n: 1e-9, p: 1e-12, '': 1 }[m[2]];
    if (m[2] === 'M' || m[2] === 'm') mult = m[2] === 'M' ? 1e6 : 1e-3;
    return parseFloat(m[1]) * (mult == null ? 1 : mult);
  }

  /* 1-2-5 sequence helpers (scope knobs, chart ticks). */
  function seq125(lo, hi) {
    var out = [];
    for (var e = Math.floor(Math.log10(lo)) - 1; e <= Math.ceil(Math.log10(hi)) + 1; e++) {
      [1, 2, 5].forEach(function (m) { var v = m * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(+v.toPrecision(3)); });
    }
    return out;
  }
  function niceStep(span, target) {
    var raw = span / Math.max(1, target || 5);
    var p = Math.pow(10, Math.floor(Math.log10(raw)));
    var r = raw / p;
    return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p;
  }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  /* ------------------------------------------------------------------ DOM */
  var uidN = 0;
  function uid(p) { uidN += 1; return (p || 'lab') + '-' + uidN; }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (s) { e.style.setProperty(s, v[s]); });
      else e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function reducedMotion() {
    try { return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  /* KaTeX: render TeX into el. tex may contain \( \) delimiters (mixed text) or be raw TeX when raw=true. */
  function tex(el, s, opts) {
    opts = opts || {};
    if (opts.raw) {
      if (global.katex) {
        try { global.katex.render(s, el, { displayMode: !!opts.display, throwOnError: false, output: 'htmlAndMathml' }); return el; } catch (e) { /* fall through */ }
      }
      el.textContent = s; return el;
    }
    el.innerHTML = s;
    if (global.renderMathInElement) {
      try {
        global.renderMathInElement(el, { delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }], throwOnError: false });
      } catch (e) {}
    }
    return el;
  }

  /* Number control: label + slider + editable value with unit. Log scale for quantities spanning decades.
   * opts: {label (may contain \( \)), unit, min, max, value, scale:'lin'|'log', step (lin only), sig, hardMin, hardMax,
   *        options (array of allowed values → discrete slider), onInput(v), help}
   * returns { el, get(), set(v, silent), input, range } */
  /* Plain-text version of a label that may contain \( TeX \) — for aria-labels. */
  var TEX_SYM = { tau: 'τ', Omega: 'Ω', omega: 'ω', mu: 'µ', Delta: 'Δ', delta: 'δ', theta: 'θ', phi: 'φ', infty: '∞', cdot: '·', times: '×', parallel: '∥', pi: 'π', approx: '≈', le: '≤', ge: '≥', to: '→', pm: '±', circ: '°' };
  function plain(s) {
    return String(s == null ? '' : s)
      .replace(/<[^>]+>/g, '')
      .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
      .replace(/\\(text|mathrm|mathit|operatorname)\s*\{([^}]*)\}/g, '$2')
      .replace(/\\([A-Za-z]+)/g, function (m, w) { return TEX_SYM[w] != null ? TEX_SYM[w] : ''; })
      .replace(/\\[,;:! ]/g, ' ')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function control(opts) {
    var id = uid('ctl');
    var log = opts.scale === 'log';
    /* resistances below 1 Ω are written 0.93 Ω in the guides, not 930 mΩ */
    var noMilli = opts.noMilli != null ? !!opts.noMilli : opts.unit === 'Ω';
    var discrete = Array.isArray(opts.options) ? opts.options.slice() : null;
    var min = opts.min, max = opts.max;
    var value = opts.value;
    var hardMin = opts.hardMin != null ? opts.hardMin : (log ? min / 100 : -Infinity);
    var hardMax = opts.hardMax != null ? opts.hardMax : (log ? max * 100 : Infinity);
    var STEPS = 1000;
    var wrap = h('div', { class: 'lab-ctl' });
    var lab = h('label', { class: 'lab-ctl-label', for: id + '-n' });
    tex(lab, opts.label);
    var range = h('input', { type: 'range', id: id + '-r', min: 0, max: discrete ? discrete.length - 1 : STEPS, step: 1, 'aria-label': (opts.ariaLabel || plain(opts.label)) + ' slider' });
    var input = h('input', { type: 'text', id: id + '-n', class: 'lab-ctl-num', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false' });
    var unitEl = h('span', { class: 'lab-ctl-unit', text: opts.unit || '' });
    var err = h('div', { class: 'lab-ctl-err', role: 'status', 'aria-live': 'polite' });
    var row = h('div', { class: 'lab-ctl-row' }, [range, h('span', { class: 'lab-ctl-val' }, [input, unitEl])]);
    wrap.appendChild(lab); wrap.appendChild(row); wrap.appendChild(err);
    if (opts.help) { var hp = h('div', { class: 'lab-ctl-help' }); tex(hp, opts.help); wrap.appendChild(hp); }

    function toPos(v) {
      if (discrete) { var best = 0; discrete.forEach(function (d, i) { if (Math.abs(d - v) < Math.abs(discrete[best] - v)) best = i; }); return best; }
      var f = log ? (Math.log(v / min) / Math.log(max / min)) : ((v - min) / (max - min));
      return Math.round(clamp(f, 0, 1) * STEPS);
    }
    function fromPos(p) {
      if (discrete) return discrete[p];
      var f = p / STEPS;
      var v = log ? min * Math.pow(max / min, f) : min + f * (max - min);
      if (log) { var mag = Math.pow(10, Math.floor(Math.log10(v)) - 2); v = Math.round(v / mag) * mag; } // 3 sig figs
      else if (opts.step) v = Math.round(v / opts.step) * opts.step;
      return +v.toPrecision(12);
    }
    function fmtCtl(v) {
      if (noMilli && Math.abs(v) < 1 && v !== 0) return sigStr(v, opts.sig || 3) + (opts.unit ? ' ' + opts.unit : '');
      return fmt(v, opts.unit || '', opts.sig || 3);
    }
    function show() {
      range.value = toPos(value);
      if (document.activeElement !== input) input.value = fmtBare(value);
      range.setAttribute('aria-valuetext', fmtCtl(value));
    }
    function fmtBare(v) {
      var s = fmtCtl(v);
      return opts.unit ? s.replace(new RegExp('\\s*' + opts.unit.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + '$'), '').trim() : s;
    }
    function clearErr() { err.textContent = ''; wrap.classList.remove('bad'); }
    function commit(v, silent) {
      value = v; show();
      if (!silent && opts.onInput) opts.onInput(value);
    }
    range.addEventListener('input', function () { clearErr(); commit(fromPos(+range.value)); });
    function fromText() {
      var v = parse(input.value, opts.unit);
      if (!isFinite(v) || v < hardMin || v > hardMax || (log && v <= 0)) {
        wrap.classList.add('bad');
        var lo = isFinite(hardMin) ? hardMin : null, hi = isFinite(hardMax) ? hardMax : null;
        err.textContent = (lo != null && hi != null)
          ? 'Enter a number from ' + fmtCtl(lo) + ' to ' + fmtCtl(hi) + ' (prefixes like k, m, µ work).'
          : (lo != null ? 'Enter a number of at least ' + fmtCtl(lo) + ' (prefixes like k, m, µ work).'
            : (hi != null ? 'Enter a number no larger than ' + fmtCtl(hi) + ' (prefixes like k, m, µ work).'
              : 'Enter a number (prefixes like k, m, µ work).'));
        return;
      }
      clearErr();
      if (discrete) v = discrete[toPos(v)];
      commit(v);
    }
    input.addEventListener('change', fromText);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fromText(); input.select(); } });
    input.addEventListener('blur', function () { input.value = fmtBare(value); });
    show();
    return { el: wrap, input: input, range: range, get: function () { return value; }, set: function (v, silent) { clearErr(); commit(v, silent !== false ? true : false); } };
  }

  /* Segmented control (radio group). opts: {label, options:[{value,label}], value, onChange} */
  function segmented(opts) {
    var name = uid('seg');
    var wrap = h('div', { class: 'lab-seg', role: 'radiogroup', 'aria-label': opts.label || '' });
    if (opts.label) wrap.appendChild(h('span', { class: 'lab-seg-label', text: opts.label }));
    var value = opts.value;
    var inputs = [];
    opts.options.forEach(function (o) {
      var id = uid('segopt');
      var inp = h('input', { type: 'radio', name: name, id: id, value: String(o.value), 'aria-label': o.ariaLabel || plain(o.label) || String(o.value) });
      if (String(o.value) === String(value)) inp.checked = true;
      inp.addEventListener('change', function () { if (inp.checked) { value = o.value; if (opts.onChange) opts.onChange(value); } });
      var lb = h('label', { for: id });
      tex(lb, o.label);
      inputs.push({ inp: inp, v: o.value });
      wrap.appendChild(inp); wrap.appendChild(lb);
    });
    return {
      el: wrap,
      get: function () { return value; },
      set: function (v) { value = v; inputs.forEach(function (x) { x.inp.checked = String(x.v) === String(v); }); }
    };
  }

  /* One shared polite live region for lab results (screen readers hear key results after a change settles). */
  var srEl = null, srTimer = null;
  function announce(text, delay) {
    if (typeof document === 'undefined' || !document.body || !text) return;
    clearTimeout(srTimer);
    srTimer = setTimeout(function () {
      if (!srEl || !srEl.isConnected) {
        srEl = h('div', { class: 'lab-sr', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
        document.body.appendChild(srEl);
      }
      srEl.textContent = '';
      setTimeout(function () { srEl.textContent = text; }, 40);
    }, delay == null ? 700 : delay);
  }

  /* Read-out grid: items [{key, label (TeX ok), unit, sig, hint, emph}] ; update({key: value}) flashes changed cells.
   * After the first update, changes to emph cells are announced to screen readers (debounced). */
  function readout(items, opts) {
    var wrap = h('dl', { class: 'lab-readout' + (opts && opts.compact ? ' compact' : '') });
    var cells = {};
    items.forEach(function (it) {
      var dt = h('dt'); tex(dt, it.label);
      var dd = h('dd', { 'aria-live': 'off' });
      var box = h('div', { class: 'lab-ro-item' + (it.emph ? ' emph' : '') }, [dt, dd]);
      cells[it.key] = { dd: dd, it: it, last: null };
      wrap.appendChild(box);
    });
    var firstUpdate = true;
    function update(vals) {
      var changedEmph = false;
      Object.keys(vals).forEach(function (k) {
        var c = cells[k]; if (!c) return;
        var v = vals[k];
        var s = typeof v === 'string' ? v : fmt(v, c.it.unit || '', c.it.sig || 4);
        if (s !== c.last) {
          c.dd.textContent = s; c.last = s;
          if (c.it.emph) changedEmph = true;
          if (!reducedMotion()) { c.dd.classList.remove('flash'); void c.dd.offsetWidth; c.dd.classList.add('flash'); }
        }
      });
      if (changedEmph && !firstUpdate && !(opts && opts.silent)) {
        announce(items.filter(function (it) { return it.emph && cells[it.key].last; })
          .map(function (it) { return (it.ariaLabel || plain(it.label)) + ' ' + cells[it.key].last; }).join('; '));
      }
      firstUpdate = false;
    }
    return { el: wrap, update: update };
  }

  /* "Show the working" block: list of TeX display lines, re-rendered on update. */
  function workings(title) {
    var det = h('details', { class: 'lab-work', open: true });
    det.appendChild(h('summary', { text: title || 'Show the calculation' }));
    var body = h('div', { class: 'lab-work-body' });
    det.appendChild(body);
    var last = '';
    return {
      el: det,
      update: function (lines) {
        var key = lines.map(function (l) { return typeof l === 'object' && l ? JSON.stringify(l) : String(l); }).join('\n');
        if (key === last) return; last = key;
        body.innerHTML = '';
        lines.forEach(function (ln) {
          var d = h('div', { class: 'lab-work-line' });
          if (ln && typeof ln === 'object') {           // {text: 'mixed text with \\( math \\)'} or {tex: 'display TeX'}
            if (ln.text != null) { d.classList.add('text'); tex(d, ln.text); }
            else tex(d, ln.tex || '', { raw: true, display: true });
          } else if (/^\s*(<|[A-Za-z].*\\\()/.test(ln) && ln.indexOf('\\(') >= 0) tex(d, ln); // mixed text with inline math
          else tex(d, ln, { raw: true, display: true });
          body.appendChild(d);
        });
      }
    };
  }

  function assumptions(list, title) {
    var det = h('details', { class: 'lab-assume' });
    det.appendChild(h('summary', { text: title || 'Assumptions behind this model' }));
    var ul = h('ul');
    list.forEach(function (a) { var li = h('li'); tex(li, a); ul.appendChild(li); });
    det.appendChild(ul);
    return det;
  }

  function note(html, kind) { var d = h('div', { class: 'lab-note ' + (kind || '') }); tex(d, html); return d; }

  /* Live circuit diagram using the site's renderer. spec = EEDiagrams circuit spec. */
  function circuit(el, spec) {
    function draw(s) {
      if (!global.EEDiagrams) { el.textContent = '(diagram renderer missing)'; return; }
      var r = global.EEDiagrams.renderCircuit(s);
      el.innerHTML = r.svg;
      var svg = el.querySelector('svg');
      if (svg && s.alt) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', s.alt); }
    }
    el.classList.add('lab-circuit');
    draw(spec);
    return { update: draw };
  }

  /* ------------------------------------------------------------------ chart */
  /* SVG line chart drawn to scale.
   * opts: { height, xlabel, ylabel, xunit, yunit, xmin, xmax, ymin, ymax, ypad,
   *         series: [{ id, label, fn(x) | points:[[x,y]...], cls:'s1'|'s2'|'s3'|'ghost', dash, width }],
   *         marks: [{ type:'vline'|'hline'|'point'|'vband', x, y, x2, label, cls }],
   *         cursor: true, cursorFmt(x) -> [{label, value}], samples, ariaLabel }
   * returns { el, update(opts) } */
  function chart(opts) {
    var NS = 'http://www.w3.org/2000/svg';
    var wrap = h('figure', { class: 'lab-chart' });
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('role', 'img');
    wrap.appendChild(svg);
    var tip = h('div', { class: 'lab-chart-tip', hidden: true });
    wrap.appendChild(tip);
    var legend = h('div', { class: 'lab-chart-legend' });
    wrap.appendChild(legend);
    var W = 640, H = opts.height || 280;
    var M = { l: 58, r: 16, t: 14, b: 44 };
    var cur = null;           // current options
    var prevPaths = {};       // id -> sampled points (for morph animation)
    var animId = null;
    var cursorX = null;

    function sampleSeries(s, o) {
      if (s.points) return s.points.slice();
      var n = s.samples || o.samples || 240, pts = [];
      for (var i = 0; i <= n; i++) {
        var x = o.xmin + (o.xmax - o.xmin) * i / n;
        var y = s.fn(x);
        pts.push([x, y]);
      }
      return pts;
    }
    function el(name, attrs, parent) {
      var e = document.createElementNS(NS, name);
      Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (parent) parent.appendChild(e);
      return e;
    }
    function ticks(lo, hi, target) {
      var st = niceStep(hi - lo, target), out = [];
      var start = Math.ceil(lo / st - 1e-9) * st;
      for (var v = start; v <= hi + st * 1e-6; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : +v.toPrecision(12));
      return out;
    }
    function draw(o, t) {
      // t in [0,1] morph progress
      var rect = wrap.getBoundingClientRect();
      W = Math.max(280, Math.round(rect.width || 640));
      H = o.height || 280;
      if (W < 420) { M.l = 50; }
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      svg.setAttribute('aria-label', o.ariaLabel || ((o.ylabel || '') + ' versus ' + (o.xlabel || '')));
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var sampled = o.series.map(function (s) { return sampleSeries(s, o); });
      var ymin = o.ymin, ymax = o.ymax;
      if (ymin == null || ymax == null) {
        var lo = Infinity, hi = -Infinity;
        sampled.forEach(function (p) { p.forEach(function (q) { if (isFinite(q[1])) { lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]); } }); });
        if (!isFinite(lo)) { lo = 0; hi = 1; }
        if (lo === hi) { lo -= 1; hi += 1; }
        var pad = (hi - lo) * (o.ypad != null ? o.ypad : 0.08);
        if (ymin == null) ymin = lo >= 0 && lo - pad < 0 ? 0 : lo - pad;
        if (ymax == null) ymax = hi + pad;
      }
      var X = function (x) { return M.l + (x - o.xmin) / (o.xmax - o.xmin) * (W - M.l - M.r); };
      var Y = function (y) { return M.t + (ymax - y) / (ymax - ymin) * (H - M.t - M.b); };
      cur.X = X; cur.Y = Y; cur.ymin = ymin; cur.ymax = ymax; cur.sampled = sampled;
      var g = el('g', { class: 'grid' }, svg);
      var xt = ticks(o.xmin, o.xmax, W < 420 ? 4 : 7), yt = ticks(ymin, ymax, 5);
      xt.forEach(function (v) {
        el('line', { x1: X(v), x2: X(v), y1: M.t, y2: H - M.b, class: 'lab-grid' }, g);
        var tx = el('text', { x: X(v), y: H - M.b + 16, class: 'lab-tick', 'text-anchor': 'middle' }, g);
        tx.textContent = fmt(v, o.xunit || '', 3).replace(/\s(?=\S*$)/, ' ');
      });
      yt.forEach(function (v) {
        el('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), class: 'lab-grid' }, g);
        var ty = el('text', { x: M.l - 6, y: Y(v) + 4, class: 'lab-tick', 'text-anchor': 'end' }, g);
        ty.textContent = fmt(v, o.yunit || '', 3);
      });
      if (ymin < 0 && ymax > 0) el('line', { x1: M.l, x2: W - M.r, y1: Y(0), y2: Y(0), class: 'lab-axis0' }, g);
      el('rect', { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, class: 'lab-frame', fill: 'none' }, g);
      var xl = el('text', { x: (M.l + W - M.r) / 2, y: H - 6, class: 'lab-axlabel', 'text-anchor': 'middle' }, svg); xl.textContent = o.xlabel || '';
      var yl = el('text', { x: 12, y: (M.t + H - M.b) / 2, class: 'lab-axlabel', 'text-anchor': 'middle', transform: 'rotate(-90 12 ' + ((M.t + H - M.b) / 2) + ')' }, svg); yl.textContent = o.ylabel || '';
      // marks under curves
      var clipId = uid('clip');
      var defs = el('defs', {}, svg);
      var cp = el('clipPath', { id: clipId }, defs);
      el('rect', { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b }, cp);
      var mg = el('g', { 'clip-path': 'url(#' + clipId + ')' }, svg);
      (o.marks || []).forEach(function (m) {
        if (m.type === 'vband') el('rect', { x: X(m.x), y: M.t, width: Math.max(0, X(m.x2) - X(m.x)), height: H - M.t - M.b, class: 'lab-band ' + (m.cls || '') }, mg);
      });
      // series
      var sg = el('g', { 'clip-path': 'url(#' + clipId + ')' }, svg);
      o.series.forEach(function (s, i) {
        var pts = sampled[i];
        var prev = prevPaths[s.id];
        if (t < 1 && prev && prev.length === pts.length) {
          pts = pts.map(function (p, k) { return [p[0], prev[k][1] + (p[1] - prev[k][1]) * t]; });
        }
        var d = '', pen = false;
        pts.forEach(function (p) {
          if (!isFinite(p[1])) { pen = false; return; }
          var yy = clamp(Y(p[1]), -1e4, 1e4);
          d += (pen ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + yy.toFixed(1);
          pen = true;
        });
        el('path', { d: d, class: 'lab-series ' + (s.cls || 's' + (i + 1)), fill: 'none', 'stroke-dasharray': s.dash || null, 'stroke-width': s.width || null }, sg);
      });
      // marks over curves
      (o.marks || []).forEach(function (m) {
        var lbl;
        if (m.type === 'vline' && m.x >= o.xmin && m.x <= o.xmax) {
          el('line', { x1: X(m.x), x2: X(m.x), y1: M.t, y2: H - M.b, class: 'lab-mark ' + (m.cls || '') }, svg);
          if (m.label) { lbl = el('text', { x: X(m.x) + 4, y: M.t + 12, class: 'lab-mark-label' }, svg); lbl.textContent = m.label; }
        } else if (m.type === 'hline' && m.y >= ymin && m.y <= ymax) {
          el('line', { x1: M.l, x2: W - M.r, y1: Y(m.y), y2: Y(m.y), class: 'lab-mark ' + (m.cls || '') }, svg);
          if (m.label) { lbl = el('text', { x: W - M.r - 4, y: Y(m.y) - 5, class: 'lab-mark-label', 'text-anchor': 'end' }, svg); lbl.textContent = m.label; }
        } else if (m.type === 'point' && m.x >= o.xmin && m.x <= o.xmax && m.y >= ymin && m.y <= ymax) {
          el('circle', { cx: X(m.x), cy: Y(m.y), r: 4.5, class: 'lab-point ' + (m.cls || '') }, svg);
          if (m.label) { lbl = el('text', { x: X(m.x) + 7, y: Y(m.y) - 7, class: 'lab-mark-label' }, svg); lbl.textContent = m.label; }
        }
      });
      // cursor
      if (o.cursor && cursorX != null) drawCursor(o);
      // legend
      legend.innerHTML = '';
      o.series.forEach(function (s, i) {
        if (!s.label) return;
        legend.appendChild(h('span', { class: 'lab-leg ' + (s.cls || 's' + (i + 1)) + (s.dash ? ' dashed' : '') }, [h('i'), h('span', { text: s.label })]));
      });
    }
    function drawCursor(o) {
      var x = clamp(cursorX, o.xmin, o.xmax);
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'lab-cursor');
      var ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', cur.X(x)); ln.setAttribute('x2', cur.X(x)); ln.setAttribute('y1', M.t); ln.setAttribute('y2', H - M.b);
      g.appendChild(ln);
      o.series.forEach(function (s, i) {
        if (!s.fn) return;
        var y = s.fn(x);
        if (!isFinite(y) || y < cur.ymin || y > cur.ymax) return;
        var c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', cur.X(x)); c.setAttribute('cy', cur.Y(y)); c.setAttribute('r', 4);
        c.setAttribute('class', 'lab-point ' + (s.cls || 's' + (i + 1)));
        g.appendChild(c);
      });
      svg.appendChild(g);
      var rows = o.cursorFmt ? o.cursorFmt(x) : [{ label: o.xlabel || 'x', value: fmt(x, o.xunit || '', 4) }].concat(o.series.filter(function (s) { return s.fn && s.label; }).map(function (s) { return { label: s.label, value: fmt(s.fn(x), o.yunit || '', 4) }; }));
      tip.innerHTML = '';
      rows.forEach(function (r) { var d = h('div'); var b = h('b'); tex(b, r.label); d.appendChild(b); d.appendChild(document.createTextNode(' ' + r.value)); tip.appendChild(d); });
      tip.hidden = false;
      var px = cur.X(x) / W * 100;
      tip.style.left = px > 60 ? 'auto' : 'calc(' + px + '% + 10px)';
      tip.style.right = px > 60 ? 'calc(' + (100 - px) + '% + 10px)' : 'auto';
    }
    function pointer(e) {
      if (!cur || !cur.cursor) return;
      var r = svg.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width * W;
      if (px < M.l || px > W - M.r) return;
      cursorX = cur.xmin + (px - M.l) / (W - M.l - M.r) * (cur.xmax - cur.xmin);
      draw(cur, 1);
    }
    svg.addEventListener('pointermove', pointer);
    svg.addEventListener('pointerdown', pointer);
    svg.addEventListener('pointerleave', function () { if (cur && cur.cursorSticky) return; cursorX = null; tip.hidden = true; if (cur) draw(cur, 1); });
    svg.setAttribute('tabindex', '0');
    svg.addEventListener('keydown', function (e) {
      if (!cur || !cur.cursor) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var stp = (cur.xmax - cur.xmin) / 100 * (e.shiftKey ? 10 : 1);
      cursorX = clamp((cursorX == null ? cur.xmin : cursorX) + (e.key === 'ArrowRight' ? stp : -stp), cur.xmin, cur.xmax);
      draw(cur, 1);
      announce(Array.prototype.map.call(tip.children, function (d) { return d.textContent; }).join('; '), 350);
    });
    function update(o) {
      var first = !cur;
      var old = cur;
      cur = o;
      if (animId) cancelAnimationFrame(animId);
      if (first || reducedMotion() || !old || old.xmin !== o.xmin || old.xmax !== o.xmax) {
        draw(o, 1); remember(o); return;
      }
      var t0 = null, D = 260;
      function step(ts) {
        if (t0 == null) t0 = ts;
        var t = Math.min(1, (ts - t0) / D);
        var e = 1 - Math.pow(1 - t, 3);
        draw(o, e);
        if (t < 1) animId = requestAnimationFrame(step); else { animId = null; remember(o); }
      }
      animId = requestAnimationFrame(step);
    }
    function remember(o) {
      prevPaths = {};
      (cur.sampled || []).forEach(function (p, i) { if (o.series[i]) prevPaths[o.series[i].id || i] = p; });
    }
    var lastW = 0, roFrame = null;
    var ro = global.ResizeObserver ? new ResizeObserver(function (entries) {
      var w = Math.round(entries && entries[0] ? entries[0].contentRect.width : wrap.getBoundingClientRect().width);
      if (w === lastW) return;              // only redraw when the width really changed
      lastW = w;
      if (roFrame) cancelAnimationFrame(roFrame);
      roFrame = requestAnimationFrame(function () { roFrame = null; if (cur && !animId) draw(cur, 1); });
    }) : null;
    if (ro) ro.observe(wrap);
    return {
      el: wrap,
      update: function (o) { if (!o.series) o.series = []; o.series.forEach(function (s, i) { if (!s.id) s.id = 's' + i; }); update(o); },
      setCursor: function (x) { cursorX = x; if (cur) draw(cur, 1); },
      destroy: function () { if (ro) ro.disconnect(); if (animId) cancelAnimationFrame(animId); if (roFrame) cancelAnimationFrame(roFrame); }
    };
  }

  /* Standard lab frame: header (title, blurb), preset picker, body grid (controls | output), footer (assumptions). */
  function frame(def, opts) {
    opts = opts || {};
    var root = h('section', { class: 'lab', 'data-lab': def.id, 'data-topic': def.topic, 'aria-label': def.title });
    var head = h('header', { class: 'lab-head' });
    head.appendChild(h('h3', { class: 'lab-title', text: def.title }));
    if (def.blurb) { var b = h('p', { class: 'lab-blurb' }); tex(b, def.blurb); head.appendChild(b); }
    root.appendChild(head);
    var presetBar = null;
    if (def.presets && def.presets.length && opts.onPreset) {
      /* presets flagged extra:true are scenarios that are NOT from the videos — they get their own "Also try" row */
      presetBar = h('div', { class: 'lab-presets-wrap' });
      var groups = [
        { list: def.presets.filter(function (p) { return !p.extra; }), label: 'Load an example from the lessons:', aria: 'Load a worked example from the lessons' },
        { list: def.presets.filter(function (p) { return p.extra; }), label: 'Also try (not from the videos):', aria: 'Extra scenarios not from the videos' }
      ];
      groups.forEach(function (g) {
        if (!g.list.length) return;
        var row = h('div', { class: 'lab-presets' + (g.list.length > 6 ? ' many' : ''), role: 'group', 'aria-label': g.aria });
        row.appendChild(h('span', { class: 'lab-presets-label', text: g.label }));
        var chips = h('div', { class: 'lab-presets-chips' });
        g.list.forEach(function (p) {
          var btn = h('button', { type: 'button', class: 'lab-chip', 'data-preset': p.id, 'aria-label': p.ariaLabel || plain(p.label) });
          tex(btn, p.label);
          btn.addEventListener('click', function () {
            Array.prototype.forEach.call(presetBar.querySelectorAll('.lab-chip'), function (c) { c.setAttribute('aria-pressed', c === btn ? 'true' : 'false'); });
            opts.onPreset(p);
          });
          btn.setAttribute('aria-pressed', 'false');
          chips.appendChild(btn);
        });
        row.appendChild(chips);
        presetBar.appendChild(row);
      });
      root.appendChild(presetBar);
    }
    var body = h('div', { class: 'lab-body' + (opts.layout ? ' ' + opts.layout : '') });
    var controls = h('div', { class: 'lab-controls' });
    var output = h('div', { class: 'lab-output' });
    body.appendChild(controls); body.appendChild(output);
    root.appendChild(body);
    var foot = h('footer', { class: 'lab-foot' });
    if (def.assumptions && def.assumptions.length) foot.appendChild(assumptions(def.assumptions));
    root.appendChild(foot);
    return {
      root: root, head: head, controls: controls, output: output, foot: foot, presetBar: presetBar,
      markPreset: function (id) { if (!presetBar) return; Array.prototype.forEach.call(presetBar.querySelectorAll('.lab-chip'), function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-preset') === id ? 'true' : 'false'); }); }
    };
  }

  /* Debounce helper. */
  /* Debounce helper with .cancel() (drop a pending call, e.g. in destroy) and .flush() (run it now). */
  function debounce(fn, ms) {
    var t = null, lastArgs = null, lastThis = null;
    function d() { lastArgs = arguments; lastThis = this; clearTimeout(t); t = setTimeout(run, ms || 200); }
    function run() { t = null; var a = lastArgs, s = lastThis; lastArgs = lastThis = null; if (a) fn.apply(s, a); }
    d.cancel = function () { clearTimeout(t); t = null; lastArgs = lastThis = null; };
    d.flush = function () { if (t) { clearTimeout(t); run(); } };
    return d;
  }

  global.EELabs = {
    register: register, get: get, list: list, findPreset: findPreset,
    /* mount a lab into el. ctx: {preset, state, save} */
    mount: function (id, el, ctx) {
      var def = registry[id];
      if (!def) throw new Error('Unknown lab ' + id);
      ctx = ctx || {};
      ctx.kit = global.EELabs.kit;
      return def.mount(el, ctx) || { destroy: function () {} };
    },
    kit: {
      h: h, uid: uid, tex: tex, plain: plain, fmt: fmt, num: num, sigStr: sigStr, parse: parse, clamp: clamp, seq125: seq125, niceStep: niceStep,
      control: control, segmented: segmented, readout: readout, announce: announce, workings: workings, assumptions: assumptions, note: note,
      circuit: circuit, chart: chart, frame: frame, debounce: debounce, reducedMotion: reducedMotion
    }
  };
})(typeof window !== 'undefined' ? window : this);
