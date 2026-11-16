/* Practice-question engine: turns <article class="q"> fragments into interactive cards. */
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

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* Build interactive cards. root contains <article class="q"> elements. opts: {store, onProgress, renderContent} */
  function mount(root, opts) {
    var arts = Array.prototype.slice.call(root.querySelectorAll('article.q'));
    var problems = [];
    arts.forEach(function (art, idx) {
      try { buildCard(art, idx, opts); } catch (e) { problems.push((art.id || 'q' + idx) + ': ' + e.message); }
    });
    return problems;
  }

  var KIND_LABEL = { conceptual: 'Conceptual', calculation: 'Direct calculation', multistep: 'Multistep application', troubleshooting: 'Troubleshooting', special: 'Special case', measurement: 'Measurement' };

  function buildCard(art, idx, opts) {
    var store = opts.store;
    var qid = art.id;
    if (!qid) throw new Error('question without id');
    var prog = store.practiceProgress(qid);
    var card = el('section', 'q-card');
    card.id = qid;
    var kind = art.getAttribute('data-kind') || '';
    var title = art.getAttribute('data-title') || ('Question ' + (idx + 1));
    var head = el('header');
    var bonus = /-b(\d+)$/.exec(qid);
    var coreNum = /-q(\d+)$/.exec(qid);
    head.appendChild(el('div', 'q-num' + (bonus ? ' bonus' : ''), bonus ? 'B' + bonus[1] : (coreNum ? coreNum[1] : String(idx + 1))));
    var h = el('h2', null, title);
    head.appendChild(h);
    if (bonus) head.appendChild(el('span', 'chip warn', 'Bonus'));
    head.appendChild(el('span', 'chip accent', (KIND_LABEL[kind] || kind || 'Practice') + ' · level ' + (art.getAttribute('data-level') || idx + 1)));
    var status = el('span', 'chip');
    head.appendChild(status);
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
        inp.placeholder = spec.unit ? 'e.g. 1.5 k' + (spec.unit === 'Ω' ? 'Ω' : spec.unit) : 'number';
        if (prog.last[name] != null) inp.value = prog.last[name];
        var unit = el('span', 'unit', spec.unit ? 'unit: ' + spec.unit + ' (prefixes OK)' : '');
        row.appendChild(lab); row.appendChild(inp); row.appendChild(unit);
        form.appendChild(row);
        spec.input = inp;
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
        Array.prototype.forEach.call(a.querySelectorAll('.opt'), function (o) {
          var v = o.getAttribute('data-v');
          var optEl = el('label', 'mc-opt');
          var r = el('input'); r.type = 'radio'; r.name = qid + '-' + name; r.value = v;
          if (prog.last[name] === v) r.checked = true;
          var fbEl = o.querySelector('.opt-fb');
          if (fbEl) fbEl.parentNode.removeChild(fbEl);
          var txt = el('div', null, '<div>' + o.innerHTML + '</div>');
          if (fbEl) { var f2 = el('div', 'opt-fb', fbEl.innerHTML); txt.appendChild(f2); }
          optEl.appendChild(r); optEl.appendChild(txt);
          box.appendChild(optEl);
          optSpecs.push({ v: v, el: optEl, radio: r });
        });
        if (!correct) throw new Error('mc answer ' + name + ' has no data-correct');
        form.appendChild(box);
        answersSpec.push({ type: 'mc', name: name, correct: correct, opts: optSpecs, labelText: name });
      }
    });
    if (!answersSpec.length) throw new Error('no answers defined');
    ansBox.appendChild(form);
    inner.appendChild(ansBox);

    var actions = el('div', 'q-actions');
    var bCheck = el('button', 'btn primary', 'Check answer'); bCheck.type = 'button';
    var hints = Array.prototype.slice.call(art.querySelectorAll('.q-hint'));
    var bHint = el('button', 'btn', ''); bHint.type = 'button';
    var bSol = el('button', 'btn', 'Show full solution'); bSol.type = 'button';
    var bReset = el('button', 'btn', 'Reset'); bReset.type = 'button';
    actions.appendChild(bCheck); if (hints.length) actions.appendChild(bHint); actions.appendChild(bSol); actions.appendChild(bReset);
    inner.appendChild(actions);
    var feedback = el('div', 'q-feedback'); feedback.setAttribute('aria-live', 'polite'); feedback.hidden = true;
    inner.appendChild(feedback);
    var hintBox = el('div', 'q-hints');
    inner.appendChild(hintBox);
    var solBox = el('div', 'q-sol-box'); solBox.hidden = true;
    var sol = art.querySelector('.q-solution');
    if (!sol) throw new Error('missing .q-solution');
    solBox.appendChild(el('h3', null, 'Worked solution'));
    solBox.appendChild(sol);
    var chk = art.querySelector('.q-check');
    if (chk) { var cb = el('div', 'q-check-box'); cb.appendChild(el('h4', null, 'Does the answer make physical sense?')); cb.appendChild(chk); solBox.appendChild(cb); }
    inner.appendChild(solBox);
    var links = art.querySelector('.q-links');
    if (links) { var lb = el('div', 'q-links-box'); lb.appendChild(links); inner.appendChild(lb); }

    function renderHints() {
      hintBox.innerHTML = '';
      for (var i = 0; i < Math.min(prog.hints, hints.length); i++) {
        var hb = el('div', 'q-hint-shown');
        hb.setAttribute('data-label', 'Hint ' + (i + 1) + ' of ' + hints.length);
        hb.innerHTML = hints[i].innerHTML;
        hintBox.appendChild(hb);
      }
      if (opts.renderContent) opts.renderContent(hintBox);
      var left = hints.length - Math.min(prog.hints, hints.length);
      bHint.textContent = left ? (prog.hints ? 'Next hint (' + left + ' left)' : 'Get a hint (' + hints.length + ')') : 'All hints shown';
      bHint.disabled = !left;
    }
    function renderStatus() {
      card.classList.toggle('solved', !!prog.solved);
      status.className = 'chip' + (prog.solved ? ' good' : (prog.attempts ? ' warn' : ''));
      status.textContent = prog.solved ? 'Solved ✓' + (prog.revealed ? ' (solution viewed)' : '') : (prog.revealed ? 'Solution viewed' : (prog.attempts ? 'Attempted ×' + prog.attempts : 'Not attempted'));
      solBox.hidden = !prog.revealed;
      bSol.textContent = prog.revealed ? 'Hide solution' : 'Show full solution';
      if (opts.onProgress) opts.onProgress();
    }
    function check() {
      var allOk = true, msgs = [], anyEmpty = false;
      answersSpec.forEach(function (s) {
        if (s.type === 'num') {
          prog.last[s.name] = s.input.value;
          var r = checkNumeric(s, s.input.value, s.fb);
          s.input.classList.remove('ok', 'no');
          if (r.state === 'empty') { anyEmpty = true; allOk = false; msgs.push(r.msg); return; }
          s.input.classList.add(r.state === 'ok' ? 'ok' : 'no');
          if (r.state !== 'ok') { allOk = false; msgs.push('<b>' + s.label + ':</b> ' + r.msg); }
          else msgs.push('<b>' + s.label + ':</b> correct ✓');
        } else {
          var chosen = s.opts.filter(function (o) { return o.radio.checked; })[0];
          s.opts.forEach(function (o) { o.el.classList.remove('ok', 'no', 'show-fb'); });
          if (!chosen) { anyEmpty = true; allOk = false; msgs.push('Choose one of the options.'); return; }
          prog.last[s.name] = chosen.v;
          var good = chosen.v === s.correct;
          chosen.el.classList.add(good ? 'ok' : 'no', 'show-fb');
          if (!good) { allOk = false; msgs.push('That choice is not correct — read the explanation under it, then try again.'); }
          else msgs.push('Correct choice ✓');
        }
      });
      if (!anyEmpty || answersSpec.length > 1) prog.attempts++;
      if (allOk) prog.solved = true;
      feedback.hidden = false;
      feedback.className = 'q-feedback ' + (allOk ? 'ok' : (anyEmpty && msgs.length === 1 ? 'info' : 'no'));
      feedback.innerHTML = (allOk ? '<b>Correct!</b> ' + (prog.revealed ? '' : 'Compare your method with the worked solution and the sanity check.') + '<br>' : '') + msgs.join('<br>');
      if (opts.renderContent) opts.renderContent(feedback);
      store.save();
      renderStatus();
    }
    bCheck.addEventListener('click', check);
    form.addEventListener('submit', function (e) { e.preventDefault(); check(); });
    form.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') { e.preventDefault(); check(); } });
    bHint.addEventListener('click', function () { prog.hints = Math.min(hints.length, prog.hints + 1); store.save(); renderHints(); renderStatus(); });
    var confirmArmed = false;
    bSol.addEventListener('click', function () {
      if (prog.revealed) { prog.revealed = false; store.save(); renderStatus(); return; }
      if (!prog.attempts && !confirmArmed) { confirmArmed = true; bSol.textContent = 'Reveal anyway? (try first!)'; setTimeout(function () { confirmArmed = false; if (!prog.revealed) bSol.textContent = 'Show full solution'; }, 4000); return; }
      prog.revealed = true; store.save(); renderStatus();
      solBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    bReset.addEventListener('click', function () {
      answersSpec.forEach(function (s) {
        if (s.type === 'num') { s.input.value = ''; s.input.classList.remove('ok', 'no'); }
        else s.opts.forEach(function (o) { o.radio.checked = false; o.el.classList.remove('ok', 'no', 'show-fb'); });
      });
      prog.last = {}; prog.hints = 0; prog.revealed = false; prog.solved = false; prog.attempts = 0;
      feedback.hidden = true; store.save(); renderHints(); renderStatus();
    });

    art.parentNode.replaceChild(card, art);
    if (opts.renderContent) opts.renderContent(ansBox);
    renderHints();
    renderStatus();
  }

  global.EEPractice = { mount: mount, parseQuantity: parseQuantity, checkNumeric: checkNumeric, fmtNum: fmtNum };
})(window);
