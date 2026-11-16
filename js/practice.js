/* Practice-question engine: turns <article class="q"> fragments into interactive cards.
 * Loads without a DOM (py_mini_racer). API notes: work/redesign/SPEC_PRACTICE_NOTES.md */
(function (global) {
  'use strict';

  var PREFIX = { pico: 1e-12, nano: 1e-9, micro: 1e-6, milli: 1e-3, kilo: 1e3, mega: 1e6, giga: 1e9,
    p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
  var UNITS = {
    'Ω': ['Ω', 'Ω', 'ohms', 'ohm', 'Ohms', 'Ohm', 'OHMS', 'OHM', 'O'],
    'V': ['volts', 'volt', 'Vrms', 'vrms', 'Vpp', 'vpp', 'Vp-p', 'Vpk', 'vpk', 'Vp', 'vp', 'V', 'v'],
    'A': ['amperes', 'ampere', 'amps', 'amp', 'A', 'a'],
    's': ['seconds', 'second', 'secs', 'sec', 's'],
    'Hz': ['hertz', 'Hz', 'hz', 'HZ'],
    'F': ['farads', 'farad', 'F', 'f'],
    'H': ['henries', 'henrys', 'henry', 'H', 'h'],
    'W': ['watts', 'watt', 'W', 'w'],
    'J': ['joules', 'joule', 'J'],
    'div': ['divisions', 'division', 'divs', 'div'],
    '%': ['percent', '%'],
    'rad/s': ['rad/s', 'rad/sec', 'rads/s'],
    '°': ['degrees', 'degree', 'deg', '°']
  };
  var ALIAS = [];
  Object.keys(UNITS).forEach(function (u) { UNITS[u].forEach(function (a) { ALIAS.push([a, u]); }); });
  ALIAS.sort(function (x, y) { return y[0].length - x[0].length; });

  function parseQuantity(str) {
    if (str == null) return { err: 'empty' };
    var s = String(str).trim().replace(/−/g, '-').replace(/,/g, '').replace(/\s*[x×]\s*10\s*\^\s*/i, 'e');
    if (!s) return { err: 'empty' };
    var m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*)$/);
    if (!m) return { err: 'parse' };
    var num = parseFloat(m[1]);
    var rest = m[2].replace(/\s+/g, '');
    if (!rest) return { value: num, unit: null };
    if (Object.prototype.hasOwnProperty.call(PREFIX, rest)) return { value: num * PREFIX[rest], unit: null, prefixOnly: true };
    for (var i = 0; i < ALIAS.length; i++) {
      var a = ALIAS[i][0];
      if (rest.length >= a.length && rest.slice(rest.length - a.length) === a) {
        var pre = rest.slice(0, rest.length - a.length);
        if (pre === '') return { value: num, unit: ALIAS[i][1] };
        if (Object.prototype.hasOwnProperty.call(PREFIX, pre)) return { value: num * PREFIX[pre], unit: ALIAS[i][1] };
      }
    }
    return { err: 'unit', text: rest };
  }

  function fmtNum(v) {
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a >= 1e4 || a < 1e-3) return v.toExponential(3).replace(/\.?0+e/, 'e');
    return String(+v.toPrecision(4));
  }

  function checkNumeric(spec, input, extraFb) {
    var q = parseQuantity(input);
    if (q.err === 'empty') return { state: 'empty', msg: 'Enter a value for ' + spec.labelText + '.' };
    if (q.err === 'parse') return { state: 'no', msg: 'I could not read “' + input + '” as a number. Try forms like 4.7k, 4700 Ω, 2.5 mA, 1.2e-3 s.' };
    if (q.err === 'unit') return { state: 'no', msg: 'I did not recognise the unit “' + q.text + '”. Use SI symbols like Ω, kΩ, V, mA, μF, mH, ms, Hz.' };
    if (q.unit && spec.unit && q.unit !== spec.unit) return { state: 'no', msg: 'Your answer for ' + spec.labelText + ' is in ' + q.unit + ', but this quantity is measured in ' + spec.unit + '. Check which quantity is being asked for.' };
    var v = q.value, target = spec.value;
    var tol = Math.max(spec.tol * Math.abs(target), spec.abs || 1e-15);
    if (Math.abs(v - target) <= tol) return { state: 'ok', value: v };
    // targeted feedback written for this question
    for (var i = 0; i < extraFb.length; i++) {
      var f = extraFb[i];
      var ftol = Math.max(f.tol * Math.abs(f.match), 1e-15);
      if (Math.abs(v - f.match) <= ftol) return { state: 'no', msg: f.html, html: true, value: v };
    }
    if (Math.abs(-v - target) <= tol && target !== 0) return { state: 'no', value: v, msg: 'Right magnitude, wrong sign. Re-check the polarity or current direction you assumed.' };
    var factors = [1e3, 1e-3, 1e6, 1e-6, 1e9, 1e-9];
    for (var k = 0; k < factors.length; k++) {
      if (Math.abs(v * factors[k] - target) <= tol) return { state: 'no', value: v, msg: 'Your number is off by a factor of ' + (factors[k] > 1 ? factors[k] : '1/' + (1 / factors[k])) + ' — check the unit prefix (k, m, μ…) or a missing conversion.' };
    }
    if (Math.abs(v - target) <= 0.08 * Math.abs(target)) return { state: 'no', value: v, msg: 'Close, but outside the accepted tolerance (±' + +(spec.tol * 100).toFixed(2) + '%). Carry more digits through the intermediate steps.' };
    if (Math.abs(v * 2 - target) <= tol || Math.abs(v / 2 - target) <= tol) return { state: 'no', value: v, msg: 'Off by a factor of 2 — check peak vs. peak-to-peak, or whether two equal parts were combined correctly.' };
    return { state: 'no', value: v, msg: 'Not quite. Re-check your setup, or open a hint.' };
  }

  /* "25:05", "1:02:03", "95" or 95 -> seconds (null if unreadable) */
  function parseTime(s) {
    if (typeof s === 'number') return isFinite(s) ? s : null;
    if (s == null) return null;
    var parts = String(s).trim().split(':');
    if (!parts.length || parts.length > 3) return null;
    var t = 0;
    for (var i = 0; i < parts.length; i++) {
      if (!/^\d+(\.\d+)?$/.test(parts[i])) return null;
      t = t * 60 + parseFloat(parts[i]);
    }
    return t;
  }
  function fmtTime(t) {
    t = Math.max(0, Math.floor(t || 0));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------- progress helpers (prefer the store's single rule, fall back to local copies) ---------- */
  var HISTORY_CAP = 30;
  function localStruggled(p) {
    if (!p) return false;
    if (p.flagged) return true;
    if (p.recovered) return false;
    return !!(p.revealed || (p.wrong || 0) >= 2 || Math.max(p.hints || 0, p.hintsMax || 0) >= 2);
  }
  function localState(p, struggledFn) {
    if (!p) return 'new';
    if (p.flagged) return 'review';
    if (p.solvedOnOwn) return 'own';
    if (p.solved) return 'help';
    if (struggledFn(p)) return 'review';
    var d = p.draft || {};
    var drafted = Object.keys(d).some(function (k) { return d[k] != null && String(d[k]).trim() !== ''; });
    return (p.attempts || p.hints || p.revealed || p.retries || drafted) ? 'progress' : 'new';
  }
  function ensureFields(p) {
    if (!p.last || typeof p.last !== 'object') p.last = {};
    if (!p.draft || typeof p.draft !== 'object') p.draft = {};
    if (!Array.isArray(p.history)) p.history = [];
    if (!p.cur || typeof p.cur !== 'object') p.cur = { checks: p.attempts || 0, wrong: 0, revealed: !!p.revealed, solved: !!p.solved };
    ['attempts', 'hints', 'wrong', 'retries', 'hintsMax'].forEach(function (k) { p[k] = +p[k] || 0; });
    return p;
  }
  function logEvent(p, event, extra) {
    var e = { at: new Date().toISOString(), event: event };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    p.history.push(e);
    if (p.history.length > HISTORY_CAP) p.history.splice(0, p.history.length - HISTORY_CAP);
    p.updated = Date.now();
  }
  function blankFields(p, keepFlag) {
    Object.keys(p).forEach(function (k) { delete p[k]; });
    p.attempts = 0; p.solved = false; p.hints = 0; p.revealed = false; p.last = {};
    p.wrong = 0; p.draft = {}; p.flagged = !!keepFlag; p.retries = 0; p.retryActive = false;
    p.solvedOnOwn = false; p.firstTry = false; p.recovered = false; p.solOpen = false; p.hintsMax = 0;
    p.cur = { checks: 0, wrong: 0, revealed: false, solved: false }; p.history = []; p.updated = Date.now();
    return p;
  }

  /* ---------- pure bookkeeping rules (DOM-free; exported as EEPractice.rules for the headless tests) ---------- */
  var hasOwn = function (o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); };
  /* value an answer field starts with: the draft is the latest state, so a field the student cleared
     (stored as '' in the draft) stays empty; the last checked value is used only when the draft has no entry */
  function initialAnswer(p, name) {
    if (!p) return undefined;
    if (hasOwn(p.draft, name) && p.draft[name] != null) return p.draft[name];
    return p.last ? p.last[name] : undefined;
  }
  /* hints on screen: counted hints, plus any read after the current attempt was solved */
  function hintsShown(p) { return Math.max(p.hints || 0, (p.cur && p.cur.hintsSeen) || 0); }
  /* one hint click. Returns false when it was only read after solving (not help, mirrors the reveal-after-solve rule). */
  function countHint(p, total) {
    if (p.cur && p.cur.solved) {
      p.cur.hintsSeen = Math.min(total, hintsShown(p) + 1);
      return false;
    }
    p.hints = Math.min(total, (p.hints || 0) + 1);
    p.hintsMax = Math.max(p.hintsMax || 0, p.hints);
    return true;
  }
  /* one graded check. Wrong checks made after the current attempt is already solved are practice, not a struggle. */
  function countCheck(p, anyWrong) {
    var counted = !(p.cur && p.cur.solved);
    p.attempts = (p.attempts || 0) + 1; p.cur.checks = (p.cur.checks || 0) + 1;
    if (anyWrong && counted) { p.wrong = (p.wrong || 0) + 1; p.cur.wrong = (p.cur.wrong || 0) + 1; }
    return counted;
  }

  function reducedMotion() {
    try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function animate(node, cls) {
    if (!node || reducedMotion()) return;
    node.classList.remove(cls);
    void node.offsetWidth;          // restart the animation
    node.classList.add(cls);
    var done = function () { node.classList.remove(cls); node.removeEventListener('animationend', done); };
    node.addEventListener('animationend', done);
    setTimeout(done, 1500);
  }

  var CSS = [
    '@keyframes q-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-4px)}40%,80%{transform:translateX(4px)}}',
    '@keyframes q-pulse{0%{box-shadow:0 0 0 0 var(--ok)}100%{box-shadow:0 0 0 12px transparent}}',
    '@keyframes q-draw{from{stroke-dashoffset:24}to{stroke-dashoffset:0}}',
    '@keyframes q-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    '.q-anim-shake{animation:q-shake var(--dur-3,320ms) var(--ease-in-out,ease-in-out) 1}',
    '.q-anim-pulse{animation:q-pulse var(--dur-4,520ms) var(--ease-out,ease-out) 1}',
    '.q-anim-rise{animation:q-rise var(--dur-2,200ms) var(--ease-out,ease-out) both}',
    '.q-tick{display:inline-flex;width:1.25em;height:1.25em;vertical-align:-0.25em;margin-right:6px;color:var(--ok)}',
    '.q-tick svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}',
    '.q-tick path{stroke-dasharray:24;stroke-dashoffset:0;animation:q-draw var(--dur-4,520ms) var(--ease-out,ease-out) both}',
    '.q-icon{width:1em;height:1em;vertical-align:-0.125em;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.q-live{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
    '@media (prefers-reduced-motion: reduce){.q-anim-shake,.q-anim-pulse,.q-anim-rise,.q-tick path{animation:none!important}}'
  ].join('\n');
  function injectCSS() {
    if (typeof document === 'undefined' || document.getElementById('practice-css')) return;
    var st = document.createElement('style');
    st.id = 'practice-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  var ICON = {
    tick: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    play: '<svg class="q-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>',
    book: '<svg class="q-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13"/></svg>',
    flag: '<svg class="q-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4"/><path d="M6 4h11l-2.5 4L17 12H6"/></svg>'
  };

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function button(cls, html) { var b = el('button', cls, html); b.type = 'button'; return b; }

  var registry = {};

  /* Build interactive cards. root contains <article class="q"> elements.
     opts: {store, onProgress(qid, p), renderContent(node), onReview({lessonId, secId, title}), onWatch({lessonId, t, label})} */
  function mount(root, opts) {
    opts = opts || {};
    injectCSS();
    var arts = Array.prototype.slice.call(root.querySelectorAll('article.q'));
    var problems = [];
    arts.forEach(function (art, idx) {
      try { buildCard(art, idx, opts); } catch (e) { problems.push((art.id || 'q' + idx) + ': ' + e.message); }
    });
    return problems;
  }

  var KIND_LABEL = { conceptual: 'Conceptual', calculation: 'Direct calculation', multistep: 'Multistep application', troubleshooting: 'Troubleshooting', special: 'Special case', measurement: 'Measurement' };
  var STATE_LABEL = { 'new': 'Not started', progress: 'In progress', own: 'Solved on your own', help: 'Solved with help', review: 'Needs review' };
  var STATE_CHIP = { 'new': 'chip', progress: 'chip', own: 'chip good', help: 'chip accent', review: 'chip warn' };

  function buildCard(art, idx, opts) {
    var store = opts.store;
    var qid = art.id;
    if (!qid) throw new Error('question without id');
    var prog = ensureFields(store.practiceProgress(qid));
    var struggled = typeof store.struggled === 'function' ? store.struggled : localStruggled;
    var stateOf = typeof store.questionState === 'function' ? store.questionState : function (p) { return localState(p, struggled); };
    function emit() { if (opts.onProgress) { try { opts.onProgress(qid, prog); } catch (e) { if (global.console) console.error(e); } } }

    var card = el('section', 'q-card');
    card.id = qid;
    card.setAttribute('data-qid', qid);
    var kind = art.getAttribute('data-kind') || '';
    var title = art.getAttribute('data-title') || ('Question ' + (idx + 1));
    var head = el('header');
    var bonus = /-b(\d+)$/.exec(qid);
    var coreNum = /-q(\d+)$/.exec(qid);
    head.appendChild(el('div', 'q-num' + (bonus ? ' bonus' : ''), bonus ? 'B' + bonus[1] : (coreNum ? coreNum[1] : String(idx + 1))));
    var h = el('h2', null, title);
    h.id = qid + '-title';
    card.setAttribute('aria-labelledby', h.id);
    head.appendChild(h);
    if (bonus) head.appendChild(el('span', 'chip warn', 'Bonus'));
    head.appendChild(el('span', 'chip accent q-kind', (KIND_LABEL[kind] || kind || 'Practice') + ' · level ' + (art.getAttribute('data-level') || idx + 1)));
    var status = el('span', 'chip q-state');
    head.appendChild(status);
    var revisitChip = el('span', 'chip warn q-revisit', 'On your revisit list');
    revisitChip.hidden = true;
    head.appendChild(revisitChip);
    var bFlag = button('btn small q-flag', '');
    head.appendChild(bFlag);
    card.appendChild(head);
    var inner = el('div', 'q-inner guide');
    card.appendChild(inner);

    // prompt & figures
    var prompt = art.querySelector('.q-prompt');
    if (!prompt) throw new Error('missing .q-prompt');
    inner.appendChild(prompt);
    Array.prototype.forEach.call(art.querySelectorAll(':scope > figure'), function (f) { inner.appendChild(f); });

    // answers
    var answersSpec = [];
    var ansBox = el('div', 'q-answers');
    var form = el('form');
    form.setAttribute('novalidate', '');
    form.setAttribute('aria-label', 'Your answers');
    function initial(name) { return initialAnswer(prog, name); }
    Array.prototype.forEach.call(art.querySelectorAll('.q-answers > .ans'), function (a, k) {
      var type = a.getAttribute('data-type') || 'num';
      var name = a.getAttribute('data-name') || ('a' + k);
      var label = a.getAttribute('data-label') || name;
      if (type === 'num') {
        var spec = { type: 'num', name: name, label: label, labelText: label.replace(/\\\(|\\\)|\\|[{}_^]/g, ''),
          value: parseFloat(a.getAttribute('data-value')), unit: a.getAttribute('data-unit') || '',
          tol: a.hasAttribute('data-tol') ? parseFloat(a.getAttribute('data-tol')) : 0.02,
          abs: a.hasAttribute('data-abs') ? parseFloat(a.getAttribute('data-abs')) : 0 };
        if (isNaN(spec.value)) throw new Error('answer ' + name + ' has no numeric data-value');
        var row = el('div', 'ans-row');
        var id = qid + '-' + name;
        var lab = el('label', null, label);
        lab.setAttribute('for', id);
        var inp = el('input');
        inp.type = 'text'; inp.id = id; inp.autocomplete = 'off'; inp.spellcheck = false; inp.inputMode = 'text';
        inp.setAttribute('data-name', name);
        inp.placeholder = spec.unit ? 'e.g. 1.5 k' + (spec.unit === 'Ω' ? 'Ω' : spec.unit) : 'number';
        var v0 = initial(name);
        if (v0 != null) inp.value = v0;
        var unit = el('span', 'unit', spec.unit ? 'unit: ' + spec.unit + ' (prefixes OK)' : '');
        unit.id = id + '-unit';
        if (spec.unit) inp.setAttribute('aria-describedby', unit.id);
        row.appendChild(lab); row.appendChild(inp); row.appendChild(unit);
        form.appendChild(row);
        spec.input = inp; spec.row = row;
        spec.fb = Array.prototype.map.call(art.querySelectorAll('.fb[data-for="' + name + '"]'), function (f) {
          return { match: parseFloat(f.getAttribute('data-match')), tol: f.hasAttribute('data-tol') ? parseFloat(f.getAttribute('data-tol')) : 0.02, html: f.innerHTML };
        });
        answersSpec.push(spec);
      } else if (type === 'mc') {
        var correct = a.getAttribute('data-correct');
        var box = el('fieldset', 'mc-opts');
        box.style.border = '0'; box.style.padding = '0';
        if (label && label !== name) { var lg = el('legend', null, label); box.appendChild(lg); }
        var optSpecs = [];
        var chosen0 = initial(name);
        Array.prototype.forEach.call(a.querySelectorAll('.opt'), function (o) {
          var v = o.getAttribute('data-v');
          var optEl = el('label', 'mc-opt');
          var r = el('input'); r.type = 'radio'; r.name = qid + '-' + name; r.value = v;
          r.setAttribute('data-name', name);
          if (chosen0 === v) r.checked = true;
          var fbEl = o.querySelector('.opt-fb');
          if (fbEl) fbEl.parentNode.removeChild(fbEl);
          var txt = el('div', null, '<div>' + o.innerHTML + '</div>');
          var f2 = null;
          if (fbEl) { f2 = el('div', 'opt-fb', fbEl.innerHTML); txt.appendChild(f2); }
          optEl.appendChild(r); optEl.appendChild(txt);
          box.appendChild(optEl);
          optSpecs.push({ v: v, el: optEl, radio: r, fb: f2 });
        });
        if (!correct) throw new Error('mc answer ' + name + ' has no data-correct');
        form.appendChild(box);
        answersSpec.push({ type: 'mc', name: name, correct: correct, opts: optSpecs, labelText: name, box: box });
      }
    });
    if (!answersSpec.length) throw new Error('no answers defined');
    ansBox.appendChild(form);
    inner.appendChild(ansBox);

    var actions = el('div', 'q-actions');
    var bCheck = button('btn primary q-check-btn', 'Check answer');
    var hints = Array.prototype.slice.call(art.querySelectorAll('.q-hint'));
    var bHint = button('btn q-hint-btn', '');
    var bSol = button('btn q-sol-btn', 'Show full solution');
    var bRetry = button('btn q-retry', 'Try again');
    var bReset = button('btn q-reset', 'Reset');
    actions.appendChild(bCheck); if (hints.length) actions.appendChild(bHint); actions.appendChild(bSol); actions.appendChild(bRetry); actions.appendChild(bReset);
    inner.appendChild(actions);

    // inline confirmation (replaces confirm())
    var confirmBox = el('div', 'q-confirm');
    confirmBox.setAttribute('role', 'group');
    confirmBox.hidden = true;
    var confirmMsg = el('p', 'q-confirm-msg');
    var confirmYes = button('btn primary q-confirm-yes', '');
    var confirmNo = button('btn q-confirm-no', 'Cancel');
    var confirmBtns = el('div', 'q-confirm-actions');
    confirmBtns.appendChild(confirmYes); confirmBtns.appendChild(confirmNo);
    confirmBox.appendChild(confirmMsg); confirmBox.appendChild(confirmBtns);
    confirmBox.setAttribute('aria-labelledby', qid + '-confirm-msg');
    confirmMsg.id = qid + '-confirm-msg';
    inner.appendChild(confirmBox);

    // Visible feedback is not a live region: it is un-hidden and filled in one tick, which screen readers
    // often skip. A permanently rendered, visually hidden status node carries a plain-text summary instead.
    var feedback = el('div', 'q-feedback'); feedback.hidden = true;
    inner.appendChild(feedback);
    var live = el('div', 'sr-only q-live');
    live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
    inner.appendChild(live);
    var liveTimer = null;
    function announce(text) {
      if (liveTimer) clearTimeout(liveTimer);
      live.textContent = '';                       // clear first so a repeated message is announced again
      liveTimer = setTimeout(function () { liveTimer = null; live.textContent = text; }, 80);
    }
    var reviewRow = el('div', 'q-review-row'); reviewRow.hidden = true;
    inner.appendChild(reviewRow);
    var hintBox = el('div', 'q-hints');
    inner.appendChild(hintBox);
    var solBox = el('div', 'q-sol-box'); solBox.hidden = true;
    solBox.id = qid + '-solution';
    bSol.setAttribute('aria-controls', solBox.id);
    var sol = art.querySelector('.q-solution');
    if (!sol) throw new Error('missing .q-solution');
    solBox.appendChild(el('h3', null, 'Worked solution'));
    solBox.appendChild(sol);
    inner.appendChild(solBox);
    var chk = art.querySelector('.q-check');
    var checkBox = null;
    if (chk) { checkBox = el('div', 'q-check-box'); checkBox.appendChild(el('h4', null, 'Does the answer make physical sense?')); checkBox.appendChild(chk); checkBox.hidden = true; }
    var links = art.querySelector('.q-links');
    var linksBox = null;
    if (links) { linksBox = el('div', 'q-links-box'); linksBox.appendChild(links); inner.appendChild(linksBox); }

    /* ---- rendering ---- */
    function renderHints(animateLast) {
      hintBox.innerHTML = '';
      var shown = Math.min(hintsShown(prog), hints.length), last = null;
      for (var i = 0; i < shown; i++) {
        var hb = el('div', 'q-hint-shown');
        hb.setAttribute('data-label', 'Hint ' + (i + 1) + ' of ' + hints.length);
        hb.innerHTML = hints[i].innerHTML;
        hintBox.appendChild(hb);
        last = hb;
      }
      if (opts.renderContent && shown) opts.renderContent(hintBox);
      var left = hints.length - shown;
      bHint.textContent = left ? (shown ? 'Next hint (' + left + ' left)' : 'Get a hint (' + hints.length + ')') : 'All hints shown';
      // aria-disabled, not disabled: the last hint click must not disable the button that has focus
      if (left) bHint.removeAttribute('aria-disabled'); else bHint.setAttribute('aria-disabled', 'true');
      if (animateLast && last) animate(last, 'q-anim-rise');
      return shown;
    }
    function placeCheck() {
      if (!checkBox) return;
      var show = !!(prog.cur.solved || prog.solOpen);
      if (prog.cur.solved) { if (checkBox.parentNode !== inner || checkBox.previousSibling !== reviewRow) inner.insertBefore(checkBox, hintBox); }
      else if (checkBox.parentNode !== solBox) solBox.appendChild(checkBox);
      checkBox.hidden = !show;
    }
    function renderStatus() {
      var st = stateOf(prog);
      card.setAttribute('data-state', st);
      card.classList.toggle('solved', !!prog.solved);
      card.classList.toggle('flagged', !!prog.flagged);
      status.className = STATE_CHIP[st] + ' q-state';
      status.textContent = STATE_LABEL[st];
      var detail = [];
      if (prog.attempts) detail.push(prog.attempts + (prog.attempts === 1 ? ' check' : ' checks'));
      if (prog.wrong) detail.push(prog.wrong + ' with a wrong part');
      if (prog.hintsMax) detail.push(prog.hintsMax + (prog.hintsMax === 1 ? ' hint' : ' hints') + ' used');
      if (prog.revealed) detail.push('solution viewed before solving');
      if (prog.retries) detail.push(prog.retries + (prog.retries === 1 ? ' retry' : ' retries'));
      status.title = detail.join(' · ');
      revisitChip.hidden = !(struggled(prog) && st !== 'review');
      /* fixed name + aria-pressed (state is shown by the pressed styling, not by changing the label) */
      if (!bFlag.getAttribute('data-ready')) { bFlag.innerHTML = ICON.flag + ' Mark for review'; bFlag.setAttribute('data-ready', '1'); }
      bFlag.setAttribute('aria-pressed', prog.flagged ? 'true' : 'false');
      bFlag.title = prog.flagged ? 'On your revisit list. Press again to remove it.' : 'Add this question to your revisit list';
      solBox.hidden = !prog.solOpen;
      bSol.textContent = prog.solOpen ? 'Hide solution' : 'Show full solution';
      bSol.setAttribute('aria-expanded', prog.solOpen ? 'true' : 'false');
      bRetry.hidden = !(prog.cur.solved || prog.cur.revealed || struggled(prog) && prog.cur.checks > 0);
      placeCheck();
      emit();
    }
    function save() { store.save(); }

    /* ---- teaching links ---- */
    function firstIn(nodes, sel) {
      for (var i = 0; i < nodes.length; i++) {
        if (!nodes[i]) continue;
        var a = nodes[i].matches && nodes[i].matches(sel) ? nodes[i] : nodes[i].querySelector(sel);
        if (a) return a;
      }
      return null;
    }
    function renderReview(sources) {
      var pool = sources.concat([links]).concat(hints).concat([sol]);
      var xr = firstIn(pool, 'a.xref[data-lesson][data-sec]');
      var ts = firstIn(pool, 'a.ts[data-t]');
      reviewRow.innerHTML = '';
      if (!xr && !ts) { reviewRow.hidden = true; return; }
      reviewRow.appendChild(el('span', 'q-review-label', 'Review this:'));
      if (xr) {
        var lessonId = xr.getAttribute('data-lesson'), secId = xr.getAttribute('data-sec');
        var ttl = el('span', 'q-review-title', xr.innerHTML);
        if (opts.onReview) {
          var bR = button('btn small q-review-sec', ICON.book + ' Open the lesson section');
          bR.addEventListener('click', function () { opts.onReview({ lessonId: lessonId, secId: secId, title: ttl.textContent, qid: qid }); });
          reviewRow.appendChild(ttl); reviewRow.appendChild(bR);
        } else {
          var a = xr.cloneNode(true); a.classList.add('q-review-title'); reviewRow.appendChild(a);
        }
      }
      if (ts) {
        var t = parseTime(ts.getAttribute('data-t'));
        var tl = ts.getAttribute('data-lesson') || (xr && xr.getAttribute('data-lesson'));
        if (opts.onWatch && t != null && tl) {
          var bW = button('btn small q-review-watch', ICON.play + ' Watch the explanation <span class="q-review-time">' + fmtTime(t) + '</span>');
          bW.setAttribute('aria-label', 'Watch the explanation at ' + fmtTime(t));
          bW.addEventListener('click', function () { opts.onWatch({ lessonId: tl, t: t, label: ts.getAttribute('data-t'), qid: qid }); });
          reviewRow.appendChild(bW);
        } else if (!opts.onWatch) {
          reviewRow.appendChild(ts.cloneNode(true));
        }
      }
      reviewRow.hidden = false;
      if (opts.renderContent) opts.renderContent(reviewRow);
    }

    /* ---- drafts ---- */
    var draftTimer = null;
    function collectDraft() {
      var d = {};
      answersSpec.forEach(function (s) {
        // an empty field is kept as '' so a cleared answer stays cleared (see initialAnswer)
        if (s.type === 'num') d[s.name] = s.input.value;
        else { var c = s.opts.filter(function (o) { return o.radio.checked; })[0]; if (c) d[s.name] = c.v; }
      });
      return d;
    }
    function flushDraft() {
      if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
      prog.draft = collectDraft();
      prog.updated = Date.now();
      save(); renderStatus();
      return true;
    }
    function onEdit(e) {
      var t = e.target;
      if (t && t.classList && t.tagName === 'INPUT' && t.type === 'text') t.classList.remove('ok', 'no');
      if (draftTimer) clearTimeout(draftTimer);
      draftTimer = setTimeout(flushDraft, 300);
    }
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);

    /* ---- struggle bookkeeping ---- */
    function relapse() {
      // a recovered question becomes a struggle again if a later (unsolved) attempt needs heavy help
      if (prog.recovered && !prog.cur.solved && (prog.cur.revealed || prog.cur.wrong >= 2 || prog.hints >= 2)) prog.recovered = false;
    }
    function hadStruggle() { return !!(prog.revealed || prog.wrong >= 2 || Math.max(prog.hints, prog.hintsMax) >= 2); }

    /* ---- inline confirmation ---- */
    var pending = null, pendingReturn = null;
    function askConfirm(msg, yesLabel, onYes, returnTo) {
      confirmMsg.textContent = msg;
      confirmYes.textContent = yesLabel;
      pending = onYes; pendingReturn = returnTo;
      confirmBox.hidden = false;
      animate(confirmBox, 'q-anim-rise');
      confirmYes.focus();
    }
    function closeConfirm(restoreFocus) {
      confirmBox.hidden = true;
      var r = pendingReturn;
      pending = null; pendingReturn = null;
      if (restoreFocus && r) r.focus();
    }
    confirmYes.addEventListener('click', function () {
      var f = pending, r = pendingReturn;
      closeConfirm(false);
      if (f) f();
      // the confirm button is now hidden: unless the action placed focus itself, return it to the control that asked
      var a = document.activeElement;
      if (r && (!a || a === document.body || a === confirmYes)) r.focus({ preventScroll: true });
    });
    confirmNo.addEventListener('click', function () { closeConfirm(true); });
    confirmBox.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closeConfirm(true); } });

    /* ---- check ---- */
    function mcPrefix(s) {
      // multi-part questions: say which part the message is about
      if (answersSpec.length < 2) return '';
      var lg = s.box.querySelector('legend');
      return lg ? '<b>' + lg.innerHTML + (/[?:]\s*$/.test(lg.textContent) ? '' : ':') + '</b> ' : '';
    }
    function check() {
      closeConfirm(false);
      if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
      var allOk = true, anyWrong = false, anyFilled = false, msgs = [], sources = [], wrongNodes = [], emptyMsgs = [], says = [];
      answersSpec.forEach(function (s) {
        if (s.type === 'num') {
          var r = checkNumeric(s, s.input.value, s.fb);
          s.input.classList.remove('ok', 'no');
          s.input.removeAttribute('aria-invalid');
          if (r.state === 'empty') { allOk = false; emptyMsgs.push(r.msg); msgs.push(r.msg); says.push(r.msg); return; }
          anyFilled = true;
          prog.last[s.name] = s.input.value;
          s.input.classList.add(r.state === 'ok' ? 'ok' : 'no');
          if (r.state !== 'ok') {
            allOk = false; anyWrong = true; wrongNodes.push(s.row);
            s.input.setAttribute('aria-invalid', 'true');
            msgs.push('<b>' + s.label + ':</b> ' + r.msg);
            says.push(s.labelText + ': ' + (r.html ? 'not correct. Read the feedback shown below the buttons.' : r.msg));
            if (r.html) { var tmp = el('div', null, r.msg); sources.push(tmp); }
          } else { msgs.push('<b>' + s.label + ':</b> correct'); says.push(s.labelText + ': correct.'); }
        } else {
          var chosen = s.opts.filter(function (o) { return o.radio.checked; })[0];
          s.opts.forEach(function (o) { o.el.classList.remove('ok', 'no', 'show-fb'); });
          var lgEl = answersSpec.length > 1 ? s.box.querySelector('legend') : null;
          var sayPre = lgEl ? lgEl.textContent.replace(/\s+/g, ' ').trim().replace(/([^?:])$/, '$1:') + ' ' : '';
          if (!chosen) { allOk = false; emptyMsgs.push('Choose one of the options.'); msgs.push(mcPrefix(s) + 'Choose one of the options.'); says.push(sayPre + 'Choose one of the options.'); return; }
          anyFilled = true;
          prog.last[s.name] = chosen.v;
          var good = chosen.v === s.correct;
          chosen.el.classList.add(good ? 'ok' : 'no', 'show-fb');
          if (!good) {
            allOk = false; anyWrong = true; wrongNodes.push(chosen.el);
            if (chosen.fb) sources.push(chosen.fb);
            msgs.push(mcPrefix(s) + 'That choice is not correct. Read the explanation under it, then try again.');
            says.push(sayPre + 'That choice is not correct. Read the explanation under it, then try again.');
          } else { msgs.push(mcPrefix(s) + 'Correct choice.'); says.push(sayPre + 'Correct choice.'); }
        }
      });
      prog.draft = collectDraft();
      feedback.hidden = false;
      if (!anyFilled) {
        feedback.className = 'q-feedback info';
        feedback.innerHTML = emptyMsgs.join('<br>');
        reviewRow.hidden = true;
        if (opts.renderContent) opts.renderContent(feedback);
        announce(emptyMsgs.join(' '));
        save(); renderStatus();
        return;
      }
      var counted = countCheck(prog, anyWrong);
      logEvent(prog, 'check', counted ? { ok: allOk } : { ok: allOk, afterSolve: true });
      var newlySolved = false, own = false;
      if (allOk && !prog.cur.solved) {
        own = !prog.cur.revealed;
        var struggledBefore = hadStruggle();
        prog.cur.solved = true; prog.solved = true; newlySolved = true;
        if (own) {
          prog.solvedOnOwn = true;
          if (prog.retryActive && struggledBefore) prog.recovered = true;
        }
        if (prog.attempts === 1 && prog.hintsMax === 0 && !prog.revealed && !prog.retries) prog.firstTry = true;
        prog.retryActive = false;
        logEvent(prog, 'solved', { own: own });
      }
      relapse();
      if (allOk) {
        feedback.className = 'q-feedback ok';
        var lead = newlySolved ? (own ? (prog.recovered && prog.retries ? 'Solved on your own this time.' : 'Solved on your own.') : 'Solved, with the solution open.') : '';
        feedback.innerHTML = '<span class="q-tick">' + ICON.tick + '</span><b>Correct.</b> ' + lead +
          (checkBox ? ' Read the sanity check below' + (prog.solOpen ? '.' : ', then compare your method with the worked solution.') : (prog.solOpen ? '' : ' Compare your method with the worked solution.')) +
          '<br>' + msgs.join('<br>');
        reviewRow.hidden = true;
        animate(card, 'q-anim-pulse');
        announce('Correct. ' + (lead ? lead + ' ' : '') + (answersSpec.length > 1 ? says.join(' ') : ''));
      } else {
        feedback.className = 'q-feedback ' + (anyWrong ? 'no' : 'info');
        feedback.innerHTML = msgs.join('<br>');
        announce((anyWrong ? 'Not correct yet. ' : 'Not complete yet. ') + says.join(' '));
        if (anyWrong) {
          renderReview(sources);
          wrongNodes.forEach(function (n) { animate(n, 'q-anim-shake'); });
        } else reviewRow.hidden = true;
      }
      if (opts.renderContent) opts.renderContent(feedback);
      save();
      renderStatus();
      if (newlySolved && checkBox && !checkBox.hidden) animate(checkBox, 'q-anim-rise');
    }

    /* ---- actions ---- */
    function giveHint() {
      closeConfirm(false);
      if (hintsShown(prog) >= hints.length) return;      // button is aria-disabled, not disabled
      var counted = countHint(prog, hints.length);
      logEvent(prog, 'hint', counted ? { n: prog.hints } : { n: hintsShown(prog), afterSolve: true });
      relapse();
      save();
      var shown = renderHints(true);
      renderStatus();
      announce('Hint ' + shown + ' of ' + hints.length + ' is shown below the buttons.' + (shown >= hints.length ? ' That was the last hint.' : ''));
    }
    function revealSolution() {
      prog.solOpen = true;
      if (!prog.cur.solved) {
        prog.cur.revealed = true; prog.revealed = true;
        logEvent(prog, 'reveal');
        relapse();
      }
      save(); renderStatus();
      animate(solBox, 'q-anim-rise');
      if (solBox.scrollIntoView) solBox.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
    }
    function toggleSolution() {
      if (prog.solOpen) { prog.solOpen = false; closeConfirm(false); save(); renderStatus(); return; }
      if (!prog.cur.solved && !prog.cur.checks) {
        askConfirm('You have not checked an answer yet. If you open the solution now, this question counts as solved with help until you solve it again on your own.', 'Show the solution', revealSolution, bSol);
        return;
      }
      revealSolution();
    }
    function clearInputs() {
      answersSpec.forEach(function (s) {
        if (s.type === 'num') { s.input.value = ''; s.input.classList.remove('ok', 'no'); s.input.removeAttribute('aria-invalid'); }
        else s.opts.forEach(function (o) { o.radio.checked = false; o.el.classList.remove('ok', 'no', 'show-fb'); });
      });
      feedback.hidden = true; feedback.innerHTML = '';
      reviewRow.hidden = true;
    }
    function retry() {
      closeConfirm(false);
      if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
      clearInputs();
      prog.last = {}; prog.draft = {}; prog.hints = 0; prog.solOpen = false;
      prog.cur = { checks: 0, wrong: 0, revealed: false, solved: false };
      prog.retries++; prog.retryActive = true;
      logEvent(prog, 'retry');
      save(); renderHints(); renderStatus();
      var first = form.querySelector('input');
      if (first) first.focus({ preventScroll: true });
    }
    function resetAll() {
      if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
      clearInputs();
      blankFields(prog, prog.flagged);
      save(); renderHints(); renderStatus();
      bReset.focus();
    }

    bCheck.addEventListener('click', check);
    form.addEventListener('submit', function (e) { e.preventDefault(); check(); });
    form.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') { e.preventDefault(); check(); } });
    bHint.addEventListener('click', giveHint);
    bSol.addEventListener('click', toggleSolution);
    bRetry.addEventListener('click', retry);
    bReset.addEventListener('click', function () {
      askConfirm('Reset this question? Your answers, hints, attempts and history for it are cleared' + (prog.flagged ? ' (the review mark stays)' : '') + '.', 'Reset question', resetAll, bReset);
    });
    bFlag.addEventListener('click', function () {
      prog.flagged = !prog.flagged; prog.updated = Date.now();
      save(); renderStatus();
    });

    art.parentNode.replaceChild(card, art);
    if (opts.renderContent) opts.renderContent(ansBox);
    renderHints();
    if (prog.cur.solved) {
      feedback.hidden = false;
      feedback.className = 'q-feedback ok';
      feedback.innerHTML = '<span class="q-tick">' + ICON.tick + '</span>You solved this earlier' + (prog.solvedOnOwn ? ' on your own' : ' with help') + '. Use <b>Try again</b> to redo it from a blank card.';
    }
    renderStatus();

    registry[qid] = { card: card, retry: retry, store: store, flush: function () { return draftTimer ? flushDraft() : false; }, focus: function () { var f = form.querySelector('input'); if (f) f.focus({ preventScroll: true }); } };
  }

  function retryQuestion(qid) { var r = registry[qid]; if (r && r.card.isConnected !== false) { r.retry(); return true; } return false; }
  /* Write any draft still waiting on its 300 ms debounce, and save it now: store.save() is itself a debounced
     timer that never runs while the page unloads (and the store's own pagehide handler has already run). */
  function flushDrafts() {
    var stores = [];
    Object.keys(registry).forEach(function (k) {
      var r = registry[k];
      if (r.flush() && r.store && stores.indexOf(r.store) < 0) stores.push(r.store);
    });
    stores.forEach(function (s) { if (typeof s.saveNow === 'function') { try { s.saveNow(); } catch (e) {} } });
    return stores.length > 0;
  }
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('pagehide', flushDrafts);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushDrafts(); });
  }

  global.EEPractice = { mount: mount, parseQuantity: parseQuantity, checkNumeric: checkNumeric, fmtNum: fmtNum,
    parseTime: parseTime, fmtTime: fmtTime, retry: retryQuestion, flushDrafts: flushDrafts,
    struggled: localStruggled, STATE_LABEL: STATE_LABEL,
    rules: { initialAnswer: initialAnswer, hintsShown: hintsShown, countHint: countHint, countCheck: countCheck } };
})(typeof window !== 'undefined' ? window : this);
