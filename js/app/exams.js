/* EE 211 — Past Exam Examples.
 * Routes: #/exams (overview, ?topic=<tid>), #/exams/<exam> (exam page, ?topic=<tid>), #/exams/<exam>/q<N> (question).
 * Content: data/exams/exams.json (written by build/build_exams.py) + one article.xq per question
 * (format: work/exams/EXAMS_SPEC.md; app conventions: its "Exams UI" section).
 * Progress: EEStore.practiceProgress('xm-<exam>-q<N>') (practice-engine fields + steps); notes: notes-ui with the
 * same id. Original photos are local only: data/exams/originals/<exam>/manifest.json; features appear when it loads.
 * Also exposes EEApp.exams (topic "From past exams" cards, note labels for All notes / exports). ES5 style. */
(function (global) {
  'use strict';
  var A = global.EEApp, U = A.ui, S = A.store, store = global.EEStore;
  var esc = U.esc, icon = U.icon, $ = U.$, $$ = U.$$;
  var doc = global.document;
  var BASE = '#/exams';

  /* local icons (24×24, stroke currentColor) */
  var XI = {
    hint: '<path d="M9.5 18h5M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
    step: '<path d="M4 18h5v-5h5V8h6"/><path d="M17 5l3 3-3 3"/>',
    sol: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    hide: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.7M6.6 7.6A16.6 16.6 0 0 0 2.5 12S6 18 12 18a9.6 9.6 0 0 0 4.3-1"/><path d="M9.9 10a3 3 0 0 0 4.1 4.1"/>',
    reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
    pdf: '<path d="M6 3.5h9l4 4v13H6z"/><path d="M15 3.5v4h4"/><path d="M9 13h6M9 16.5h6"/>',
    scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8 9h8M8 12h8M8 15h5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    draw: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    prev: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>'
  };
  function xic(name, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (XI[name] || '') + '</svg>'; }
  function examIcon(cls) { return A.ICONS.exam ? icon('exam', cls) : xic('pdf', cls); }

  /* ================================================================== data */
  var cache = { index: null, indexP: null, text: {}, orig: {}, head: {} };
  function index() {
    if (cache.index) return Promise.resolve(cache.index);
    if (!cache.indexP) {
      cache.indexP = A.data.fetchJSON('data/exams/exams.json').then(function (d) {
        d.exams = (d.exams || []).map(function (ex) {
          ex.questions = (ex.questions || []).slice().sort(function (a, b) { return a.num - b.num; });
          ex.questionCount = ex.questionCount || ex.questions.reduce(function (m, q) { return Math.max(m, q.num); }, 0);
          return ex;
        });
        cache.index = d; return d;
      }, function (e) { cache.indexP = null; throw e; });
    }
    return cache.indexP;
  }
  function examById(ix, id) { return (ix.exams || []).filter(function (e) { return e.id === id; })[0] || null; }
  function qMeta(ex, num) { return ex.questions.filter(function (q) { return q.num === num; })[0] || null; }
  function qHref(exId, num) { return BASE + '/' + exId + '/q' + num; }
  function pidOf(exId, num) { return 'xm-' + exId + '-q' + num; }
  function questionText(file) {
    if (cache.text[file] != null) return Promise.resolve(cache.text[file]);
    return A.data.fetchText(file).then(function (t) { cache.text[file] = t; return t; });
  }
  /* local-only originals; null when not present (the published site never has them) */
  function originals(ex) {
    if (Object.prototype.hasOwnProperty.call(cache.orig, ex.id)) return Promise.resolve(cache.orig[ex.id]);
    if (ex.hasOriginalsLocally === false) { cache.orig[ex.id] = null; return Promise.resolve(null); }
    return A.data.fetchJSON('data/exams/originals/' + ex.id + '/manifest.json').then(function (m) { cache.orig[ex.id] = m; return m; }, function () { cache.orig[ex.id] = null; return null; });
  }
  /* does a file exist? (HEAD, cached for the session) */
  function exists(url) {
    if (Object.prototype.hasOwnProperty.call(cache.head, url)) return Promise.resolve(cache.head[url]);
    return fetch(url, { method: 'HEAD', cache: 'no-cache' }).then(function (r) { cache.head[url] = r.ok; return r.ok; }, function () { return false; });
  }
  function range(n) { var a = []; for (var i = 1; i <= n; i++) a.push(i); return a; }
  function plain(s) { return A.text.plain(s || ''); }
  function topicsUsed(questions) {
    var used = {};
    questions.forEach(function (q) { (q.topics || []).forEach(function (t) { used[t] = 1; }); });
    return A.TOPICS.filter(function (t) { return used[t.id]; });
  }

  /* ================================================================== progress */
  function peekP(pid) { return store.state.progress.practice[pid] || null; }
  function drafted(p) { var d = (p && p.draft) || {}; return Object.keys(d).some(function (k) { return d[k] != null && String(d[k]).trim() !== ''; }); }
  /* 'new' | 'progress' | 'viewed' | 'help' | 'own' */
  function xstate(pid) {
    var p = peekP(pid);
    if (!p) return 'new';
    if (p.solvedOnOwn) return 'own';
    if (p.solved) return 'help';
    if (p.revealed) return 'viewed';
    if (p.attempts || p.hints || p.retries || drafted(p)) return 'progress';
    return 'new';
  }
  var XLABEL = { 'new': 'Not started', progress: 'In progress', viewed: 'Solution viewed', help: 'Solved with help', own: 'Solved on your own' };
  function stateChip(pid) { var s = xstate(pid); return '<span class="xm-st s-' + s + '">' + esc(XLABEL[s]) + '</span>'; }
  function logEvent(p, event, extra) {
    if (!Array.isArray(p.history)) p.history = [];
    var e = { at: new Date().toISOString(), event: event };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    p.history.push(e);
    if (p.history.length > 30) p.history.splice(0, p.history.length - 30);
    p.updated = Date.now();
  }
  function ensure(p) {
    if (!p.cur || typeof p.cur !== 'object') p.cur = { checks: 0, wrong: 0, revealed: false, solved: false };
    if (!p.draft || typeof p.draft !== 'object') p.draft = {};
    if (!p.last || typeof p.last !== 'object') p.last = {};
    p.steps = +p.steps || 0;
    return p;
  }

  /* ================================================================== shared bits */
  function topicChip(tid, o) {
    o = o || {};
    var t = A.topic(tid); if (!t) return '';
    var inner = U.glyph(tid) + '<span>' + esc(o.short ? t.short : t.name) + '</span>' + (o.role ? '<span class="xm-tchip-role">' + esc(o.role) + '</span>' : '');
    if (o.link === false) return '<span class="xm-tchip" data-topic="' + tid + '">' + inner + '</span>';
    return '<a class="xm-tchip" data-topic="' + tid + '" href="' + esc(o.href || '#/t/' + tid + '/understand') + '"' + (o.title ? ' title="' + esc(o.title) + '"' : '') + '>' + inner + '</a>';
  }
  function flagBadge(q) {
    if (!q || q.status !== 'flagged') return '';
    return '<span class="xm-flagb" title="Something in the original is unclear; the question page explains how the solution handles it">' + icon('flag') + 'Source note</span>';
  }
  function crumbs(items) {
    return '<nav class="xm-crumbs" aria-label="Breadcrumb"><ol>' + items.map(function (it, i) {
      var last = i === items.length - 1;
      return '<li>' + (last ? '<span aria-current="page">' + esc(it.label) + '</span>' : '<a href="' + esc(it.href) + '">' + esc(it.label) + '</a>') + '</li>';
    }).join('') + '</ol></nav>';
  }
  function errorBox(ctx, title, msg) {
    ctx.el.innerHTML = '<div class="page narrow xm-page">' + crumbs([{ label: 'Past Exam Examples', href: BASE }, { label: title }]) +
      '<h1>' + esc(title) + '</h1><p class="diagram-error">' + esc(msg) + '</p>' + U.btn('Back to Past Exam Examples', { href: BASE, icon: 'back' }) + '</div>';
  }
  /* readable diagrams on phones: never shrink a circuit below 78 % of its natural size; its holder scrolls instead */
  function sizeDiagrams(root) {
    $$('svg.ckt, svg.scope', root).forEach(function (s) {
      var w = parseFloat(s.getAttribute('width'));
      if (w > 0) s.style.minWidth = Math.round(Math.min(w, 520) * 0.78) + 'px';
    });
  }
  function render(root) { A.renderContent(root, null); sizeDiagrams(root); }

  /* ================================================================== view entry */
  function renderView(ctx) {
    var p = ctx.params;
    ctx.setTitle('Past Exam Examples');
    ctx.el.innerHTML = '<div class="page xm-page"><p class="muted">Loading the exam index…</p></div>';
    var topic = ctx.query.topic && A.topic(ctx.query.topic) ? ctx.query.topic : null;
    function focusH1() {   // the shell focused the loading state; move focus to the real heading
      var h1 = ctx.alive() && $('h1', ctx.el);
      if (!h1) return;
      h1.setAttribute('tabindex', '-1');
      try { h1.focus({ preventScroll: true }); } catch (e) {}
    }
    return index().then(function (ix) {
      if (!ctx.alive()) return;
      var r = route(ix);
      focusH1();
      return r;
    }).catch(function (e) {
      if (!ctx.alive()) return;
      errorBox(ctx, 'Past Exam Examples', 'The exam index could not be loaded (' + e.message + '). Check your connection and reload.');
    });
    function route(ix) {
      if (!p.length) return renderOverview(ctx, ix, topic);
      var ex = examById(ix, p[0]);
      if (!ex) { errorBox(ctx, 'Exam not found', 'There is no exam called “' + p[0] + '” here.'); return; }
      if (!p[1]) return renderExam(ctx, ex, topic);
      var m = /^q(\d+)$/.exec(p[1]);
      var num = m ? +m[1] : NaN;
      if (!m || num < 1 || num > ex.questionCount) { errorBox(ctx, 'Question not found', ex.title + ' has questions 1 to ' + ex.questionCount + '.'); return; }
      return renderQuestion(ctx, ex, num);
    }
  }

  /* ================================================================== overview */
  function renderOverview(ctx, ix, topic) {
    var all = [];
    ix.exams.forEach(function (ex) { ex.questions.forEach(function (q) { all.push({ ex: ex, q: q }); }); });
    var used = topicsUsed(all.map(function (x) { return x.q; }));
    ctx.el.innerHTML = '<div class="page xm-page xm-over">' +
      '<header class="page-head"><p class="eyebrow">Practise with real exams</p><h1>Past Exam Examples</h1>' +
      '<p class="lede">Questions from past EE 211 exams, retyped with their diagrams redrawn. Attempt each one, check your answers, then open hints or the worked solution one step at a time. Every question shows which topic it tests and where that topic is taught on this site.</p></header>' +
      '<ol class="xm-how" aria-label="How to practise with an exam question">' +
      '<li><span class="xm-how-n">1</span><span><b>Work it on paper.</b> Read the given values and what to find.</span></li>' +
      '<li><span class="xm-how-n">2</span><span><b>Check your answers.</b> Wrong answers get targeted feedback.</span></li>' +
      '<li><span class="xm-how-n">3</span><span><b>Stuck?</b> Show a hint, or reveal the solution one step at a time.</span></li>' +
      '<li><span class="xm-how-n">4</span><span><b>Connect it.</b> See which lessons, videos and formulas the question comes from.</span></li></ol>' +
      '<section class="xm-sec" aria-labelledby="xmExamsH"><h2 id="xmExamsH" class="sec-title">Exams</h2><div class="xm-exgrid">' +
      ix.exams.map(examCard).join('') + '</div></section>' +
      '<section class="xm-sec" aria-labelledby="xmByTopicH"><div class="sec-head"><h2 id="xmByTopicH" class="sec-title">Questions by topic</h2></div>' +
      '<div class="xm-filter-slot"></div><div class="xm-bytopic"></div></section>' +
      '</div>';
    var slot = $('.xm-filter-slot', ctx.el), box = $('.xm-bytopic', ctx.el);
    function build(tid) {
      var list = (tid ? used.filter(function (t) { return t.id === tid; }) : used);
      if (!list.length) { box.innerHTML = '<p class="muted">' + (tid ? 'No exam question on this topic yet.' : 'No questions yet.') + '</p>'; return; }
      box.innerHTML = list.map(function (t) {
        var qs = all.filter(function (x) { return x.q.topics.indexOf(t.id) >= 0; })
          .sort(function (a, b) { return (a.q.topics[0] === t.id ? 0 : 1) - (b.q.topics[0] === t.id ? 0 : 1); });
        return '<div class="xm-tgroup" data-topic="' + t.id + '"><h3 class="xm-tgroup-title">' + topicChip(t.id, { title: 'Open the ' + t.name + ' topic' }) + '<span class="small muted">' + U.plural(qs.length, 'question') + '</span></h3>' +
          '<ul class="xm-qlist">' + qs.map(function (x) { return qRow(x.ex, x.q, t.id); }).join('') + '</ul></div>';
      }).join('');
    }
    slot.appendChild(topicFilter(used, topic, function (v) { ctx.setQuery({ topic: v || null }); build(v); }));
    build(topic);
  }
  function examCard(ex) {
    var done = 0, own = 0;
    ex.questions.forEach(function (q) { var s = xstate(pidOf(ex.id, q.num)); if (s === 'own') own++; if (s === 'own' || s === 'help') done++; });
    return '<a class="xm-excard" href="' + BASE + '/' + esc(ex.id) + '"><span class="xm-excard-ic">' + examIcon() + '</span>' +
      '<span class="xm-excard-body"><span class="xm-excard-title">' + esc(ex.title) + '</span>' +
      '<span class="xm-excard-meta">' + esc(ex.course || '') + '</span>' +
      '<span class="xm-excard-meta">' + ex.questionCount + ' questions · ' + (ex.totalPoints ? ex.totalPoints + ' points · ' : '') + (ex.pages ? ex.pages + ' pages' : '') + '</span>' +
      '<span class="xm-excard-chips">' + topicsUsed(ex.questions).map(function (t) { return topicChip(t.id, { link: false, short: true }); }).join('') + '</span>' +
      '<span class="xm-excard-prog">' + done + ' of ' + ex.questionCount + ' solved' + (own ? ' · ' + own + ' on your own' : '') +
      (ex.questions.length < ex.questionCount ? ' · ' + (ex.questionCount - ex.questions.length) + ' not available yet' : '') + '</span></span>' +
      '<span class="btn primary small xm-excard-go">Open<span class="sr-only"> ' + esc(ex.title) + '</span>' + icon('arrow') + '</span></a>';
  }
  function qRow(ex, q, tid) {
    var primary = !tid || q.topics[0] === tid;
    return '<li><a class="xm-qrow" href="' + qHref(ex.id, q.num) + '"><span class="xm-qrow-num">Q' + q.num + '</span>' +
      '<span class="xm-qrow-text"><span class="xm-qrow-kicker">' + esc(ex.title) + ' · ' + U.plural(q.points, 'pt') + (tid ? ' · ' + (primary ? 'main topic' : 'also uses it') : '') + '</span>' +
      '<span class="xm-qrow-title">' + esc(plain(q.title)) + '</span></span>' + flagBadge(q) + stateChip(pidOf(ex.id, q.num)) + '</a></li>';
  }
  function topicFilter(used, value, onChange) {
    var opts = [{ value: '', label: 'All topics' }].concat(used.map(function (t) { return { value: t.id, label: t.short }; }));
    var el = U.h('<div class="xm-filter" role="group" aria-label="Show questions on"></div>');
    opts.forEach(function (o) {
      el.insertAdjacentHTML('beforeend', '<button type="button" class="xm-fbtn"' + (o.value ? ' data-topic="' + o.value + '"' : '') + ' data-v="' + o.value + '" aria-pressed="' + String((value || '') === o.value) + '">' +
        (o.value ? U.glyph(o.value) : '') + '<span>' + esc(o.label) + '</span></button>');
    });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('.xm-fbtn'); if (!b) return;
      var v = b.getAttribute('data-v');
      $$('.xm-fbtn', el).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      onChange(v);
    });
    return el;
  }

  /* ================================================================== exam page */
  function renderExam(ctx, ex, topic) {
    ctx.setTitle(ex.title + ' · Past Exam Examples');
    var nums = range(ex.questionCount);
    var used = topicsUsed(ex.questions);
    var missing = nums.filter(function (n) { return !qMeta(ex, n); });
    var pageOf = {};
    (ex.pageMap || []).forEach(function (pg) { (pg.questions || []).forEach(function (n) { pageOf[n] = pg.page; }); });

    ctx.el.innerHTML = '<div class="page xm-page xm-exam">' +
      crumbs([{ label: 'Past Exam Examples', href: BASE }, { label: ex.title }]) +
      '<header class="page-head xm-ehead"><div><p class="eyebrow">Past Exam Examples</p><h1>' + esc(ex.title) + '</h1>' +
      '<p class="lede">' + esc(ex.course || '') + (ex.totalPoints ? ' · ' + ex.totalPoints + ' points' : '') + ' · ' + ex.questionCount + ' questions' + (ex.pages ? ' on ' + ex.pages + ' pages' : '') +
      '. Each question is retyped with the original numbering and its diagram redrawn. Try it first, then use hints and the step-by-step solution.</p></div>' +
      '<div class="xm-estats" aria-live="polite"></div></header>' +
      '<section class="xm-sec" aria-labelledby="xmQsH"><div class="sec-head"><h2 id="xmQsH" class="sec-title">Questions</h2></div>' +
      '<div class="xm-filter-slot"></div><ol class="xm-cards">' + nums.map(function (n) { return examQCard(ex, n, pageOf[n]); }).join('') + '</ol>' +
      '<p class="xm-filter-none muted" hidden>No question in this exam is on that topic.</p></section>' +
      '<section class="xm-sec" aria-labelledby="xmMxH"><h2 id="xmMxH" class="sec-title">Questions by topic</h2>' +
      '<p class="small muted xm-sec-intro">A filled dot marks the main topic a question tests; a ring marks a topic it also needs.</p>' + matrix(ex, used, nums) + '</section>' +
      '<section class="xm-sec xm-pdf" aria-labelledby="xmPdfH"><h2 id="xmPdfH" class="sec-title">Exam PDFs</h2><div class="xm-pdf-box"><p class="muted small">Checking which PDFs are available…</p></div></section>' +
      transcribedPanel(ex, missing) +
      '</div>';

    // status summary
    var own = 0, help = 0, prog = 0;
    ex.questions.forEach(function (q) { var s = xstate(pidOf(ex.id, q.num)); if (s === 'own') own++; else if (s === 'help') help++; else if (s !== 'new') prog++; });
    $('.xm-estats', ctx.el).innerHTML =
      '<div class="xm-estat"><span class="xm-estat-n">' + own + '</span><span>solved on your own</span></div>' +
      '<div class="xm-estat"><span class="xm-estat-n">' + help + '</span><span>solved with help</span></div>' +
      '<div class="xm-estat"><span class="xm-estat-n">' + prog + '</span><span>started</span></div>' +
      '<div class="xm-estat"><span class="xm-estat-n">' + ex.questionCount + '</span><span>questions</span></div>';

    // topic filter
    var cards = $('.xm-cards', ctx.el);
    function applyFilter(tid) {
      var any = false;
      $$('.xm-card-li', cards).forEach(function (li) {
        var on = !tid || (' ' + (li.getAttribute('data-topics') || '') + ' ').indexOf(' ' + tid + ' ') >= 0;
        li.hidden = !on; if (on) any = true;
      });
      $('.xm-filter-none', ctx.el).hidden = any;
      if (tid) A.announce(cards.querySelectorAll('.xm-card-li:not([hidden])').length + ' questions shown');
    }
    if (used.length > 1) $('.xm-filter-slot', ctx.el).appendChild(topicFilter(used, topic, function (v) { ctx.setQuery({ topic: v || null }); applyFilter(v); }));
    applyFilter(topic);

    // flag summaries: the bold lead sentence of each question's source note (aside.xq-flag)
    $$('.xm-flagtxt', ctx.el).forEach(function (sp) {
      var q = qMeta(ex, +sp.getAttribute('data-n')); if (!q) return;
      questionText(q.file).then(function (html) {
        var t = flagSummary(html); if (t && ctx.alive()) { sp.textContent = t; A.renderContent(sp, null); }
      }).catch(function () {});
    });
    // PDFs + local originals
    return originals(ex).then(function (orig) {
      if (!ctx.alive()) return;
      pdfViewer($('.xm-pdf-box', ctx.el), ex, orig, ctx);
    });
  }
  function examQCard(ex, n, page) {
    var q = qMeta(ex, n);
    if (!q) {
      return '<li class="xm-card-li is-missing" data-topics=""><div class="xm-card"><span class="xm-card-num">' + n + '</span>' +
        '<span class="xm-card-body"><span class="xm-card-kicker">Question ' + n + (page ? ' · page ' + page : '') + '</span>' +
        '<span class="xm-card-title">Not available yet</span><span class="small muted">The retyped question and its worked solution are still being prepared.</span></span></div></li>';
    }
    var pid = pidOf(ex.id, n);
    return '<li class="xm-card-li" data-topics="' + esc(q.topics.join(' ')) + '"><a class="xm-card" data-topic="' + esc(q.topics[0]) + '" href="' + qHref(ex.id, n) + '">' +
      '<span class="xm-card-num">' + n + '</span>' +
      '<span class="xm-card-body"><span class="xm-card-kicker">Question ' + n + ' · ' + U.plural(q.points, 'point') + (q.page ? ' · page ' + q.page : '') + '</span>' +
      '<span class="xm-card-title">' + esc(plain(q.title)) + '</span>' +
      '<span class="xm-card-chips">' + q.topics.map(function (t, i) { return topicChip(t, { link: false, short: true, role: i === 0 && q.topics.length > 1 ? 'main' : '' }); }).join('') + '</span></span>' +
      '<span class="xm-card-side">' + stateChip(pid) + flagBadge(q) + '</span></a></li>';
  }
  function matrix(ex, used, nums) {
    if (!used.length) return '<p class="muted small">No questions yet.</p>';
    return '<div class="table-wrap xm-mx-wrap"><table class="xm-matrix"><caption class="sr-only">Which topics each question of ' + esc(ex.title) + ' tests</caption><thead><tr><th scope="col">Topic</th>' +
      nums.map(function (n) {
        var q = qMeta(ex, n);
        return '<th scope="col">' + (q ? '<a href="' + qHref(ex.id, n) + '" title="' + esc(plain(q.title)) + '">Q' + n + '</a>' : '<span class="muted" title="Not available yet">Q' + n + '</span>') + '</th>';
      }).join('') + '</tr></thead><tbody>' +
      used.map(function (t) {
        return '<tr data-topic="' + t.id + '"><th scope="row"><a class="xm-mx-topic" href="#/t/' + t.id + '/understand">' + U.glyph(t.id) + '<span>' + esc(t.short) + '</span></a></th>' +
          nums.map(function (n) {
            var q = qMeta(ex, n), i = q ? q.topics.indexOf(t.id) : -1;
            if (i < 0) return '<td><span class="sr-only">no</span></td>';
            var main = i === 0;
            return '<td><a class="xm-dot' + (main ? ' main' : '') + '" href="' + qHref(ex.id, n) + '" aria-label="Question ' + n + ': ' + (main ? 'main topic' : 'also uses this topic') + '" title="Q' + n + ': ' + esc(plain(q.title)) + '"></a></td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function flagSummary(html) {
    var tpl = doc.createElement('template'); tpl.innerHTML = html;
    var f = tpl.content.querySelector('aside.xq-flag'); if (!f) return '';
    var lead = f.querySelector('p strong, p b') || f.querySelector('p') || f;
    var t = lead.textContent.replace(/\s+/g, ' ').replace(/^Source note:\s*/i, '').trim();   // TeX kept; rendered by KaTeX
    if (t.length > 240) t = t.slice(0, 237).replace(/\s+\S*$/, '') + '…';
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }
  function transcribedPanel(ex, missing) {
    var tr = ex.transcription || {};
    var LBL = { ocr: 'Text recognition (OCR)', visual: 'Visual verification', scope: 'Oscilloscope trace' };
    var rows = Object.keys(tr).map(function (k) { return '<dt>' + esc(LBL[k] || (k.charAt(0).toUpperCase() + k.slice(1))) + '</dt><dd>' + esc(tr[k]) + '</dd>'; }).join('');
    var flags = ex.questions.filter(function (q) { return q.flag || q.status === 'flagged'; });
    return '<details class="xm-panel xm-transcribed"><summary><span class="xm-sum-title">How this exam was transcribed</span><span class="xm-sum-sub">Source, text recognition, visual checks and anything unclear</span></summary><div class="xm-panel-body">' +
      (ex.source ? '<p>' + esc(ex.source) + '</p>' : '') +
      (rows ? '<dl class="xm-dl">' + rows + '</dl>' : '') +
      '<h3 class="xm-h3">Flags</h3>' +
      (flags.length ? '<ul>' + flags.map(function (q) {
        return '<li><a href="' + qHref(ex.id, q.num) + '">Question ' + q.num + '</a>' + (q.status === 'flagged' ? ' <span class="xm-flagb">' + icon('flag') + 'can change the answer</span>' : '') +
          ': <span class="xm-flagtxt" data-n="' + q.num + '">Part of the source is unclear; the question page explains how the solution handles it.</span></li>';
      }).join('') + '</ul>' : '<p class="small muted">No question has an open source problem.</p>') +
      (missing.length ? '<p class="small"><b>Not available yet:</b> ' + missing.map(function (n) { return 'question ' + n; }).join(', ') + '. They are still being prepared.</p>' : '') +
      '<p class="small muted">Question numbers, wording, values and units follow the printed exam. Diagrams are redrawn from it. Answers on this site come from our own worked solutions.</p>' +
      '</div></details>';
  }

  /* ---------------- embedded PDF viewer ---------------- */
  function pdfViewer(box, ex, orig, ctx) {
    var pdfs = ex.pdfs || {};
    var tabs = [];
    if (pdfs.questions) tabs.push({ id: 'questions', label: 'Clean questions', url: pdfs.questions, mode: 'questions',
      desc: 'Every question retyped, with redrawn diagrams and space for your answers. Print it and work through it like the real exam.' });
    if (pdfs.solutions) tabs.push({ id: 'solutions', label: 'Worked solutions', url: pdfs.solutions, mode: 'solutions',
      desc: 'Every question with its full step-by-step solution, answer check, common mistakes and topic connections.' });
    if (orig && orig.pdf) tabs.push({ id: 'originals', label: 'Original scans', local: true, url: orig.pdf,
      desc: 'Photos of the printed exam pages. This copy is only on your computer and is never published. Handwriting and marks on the paper are not part of the questions.' });
    if (!tabs.length) { box.innerHTML = '<p class="muted small">No PDFs are listed for this exam.</p>'; return; }
    var canEmbed = global.navigator.pdfViewerEnabled !== false;
    box.innerHTML = '<div class="xm-tabs" role="tablist" aria-label="Exam PDFs">' + tabs.map(function (t, i) {
      return '<button type="button" role="tab" class="xm-tab" id="xmTab-' + t.id + '" aria-controls="xmPdfPanel" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '" data-i="' + i + '">' +
        (t.local ? xic('scan') : xic('pdf')) + '<span>' + esc(t.label) + '</span>' + (t.local ? '<span class="xm-local">local only</span>' : '') + '</button>';
    }).join('') + '</div><div class="xm-pdf-panel" role="tabpanel" id="xmPdfPanel" tabindex="0"></div>';
    var panel = $('.xm-pdf-panel', box), cur = -1, gen = 0;
    function fileName(url) { return url.split('/').pop(); }
    function show(i) {
      if (i === cur) return;
      cur = i; var my = ++gen, t = tabs[i];
      $$('.xm-tab', box).forEach(function (b, k) { b.setAttribute('aria-selected', String(k === i)); b.tabIndex = k === i ? 0 : -1; });
      panel.setAttribute('aria-labelledby', 'xmTab-' + t.id);
      panel.innerHTML = '<p class="xm-pdf-desc small">' + esc(t.desc) + '</p><div class="xm-pdf-frame"><p class="muted small">Checking the file…</p></div>';
      exists(t.url).then(function (ok) {
        if (my !== gen || !ctx.alive()) return;
        var frame = $('.xm-pdf-frame', panel);
        var title = ex.title + ' — ' + t.label + ' (PDF)';
        if (!ok) {
          frame.innerHTML = '<div class="xm-pdf-msg">' + xic('pdf') + '<div><p><b>This PDF has not been generated yet.</b></p>' +
            '<p class="small">Everything it will contain is already on this page: open any question above.' + (t.mode ? ' You can also open the print layout and save it as a PDF from your browser’s print dialog.' : '') + '</p>' +
            (t.mode ? '<p>' + U.btn('Open the print layout', { small: true, href: 'tools/exam-print.html?exam=' + encodeURIComponent(ex.id) + '&mode=' + t.mode, external: true }) + '</p>' : '') + '</div></div>';
          return;
        }
        var btns = '<div class="xm-pdf-btns">' + U.btn('Open in new tab', { small: true, href: t.url, external: true }) +
          '<a class="btn small" href="' + esc(t.url) + '" download="' + esc(fileName(t.url)) + '">' + icon('download') + '<span>Download</span></a></div>';
        if (!canEmbed) {
          frame.innerHTML = '<div class="xm-pdf-msg">' + xic('pdf') + '<div><p><b>Your browser cannot show PDFs inside the page</b> (common on phones).</p><p class="small">Open it in a new tab or download it.</p>' + btns + '</div></div>';
          return;
        }
        frame.innerHTML = btns + '<iframe class="xm-iframe" src="' + esc(t.url) + '#view=FitH" title="' + esc(title) + '" loading="lazy"></iframe>';
      });
    }
    $('.xm-tabs', box).addEventListener('click', function (e) { var b = e.target.closest('.xm-tab'); if (b) show(+b.getAttribute('data-i')); });
    $('.xm-tabs', box).addEventListener('keydown', function (e) {
      var n = tabs.length, i = cur;
      if (e.key === 'ArrowRight') i = (cur + 1) % n; else if (e.key === 'ArrowLeft') i = (cur - 1 + n) % n;
      else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = n - 1; else return;
      e.preventDefault(); show(i); $$('.xm-tab', box)[i].focus();
    });
    show(0);
  }

  /* ================================================================== question page */
  function neighbours(ex, num) {
    var avail = ex.questions.map(function (q) { return q.num; });
    var prev = null, next = null;
    avail.forEach(function (n) { if (n < num && (prev == null || n > prev)) prev = n; if (n > num && (next == null || n < next)) next = n; });
    return { prev: prev, next: next };
  }
  function prevNext(ex, num, cls) {
    var nb = neighbours(ex, num);
    return '<nav class="xm-pn ' + (cls || '') + '" aria-label="Previous and next question">' +
      (nb.prev != null ? '<a class="btn small xm-pn-prev" href="' + qHref(ex.id, nb.prev) + '" rel="prev">' + xic('prev') + '<span>Question ' + nb.prev + '</span></a>' : '<span></span>') +
      (nb.next != null ? '<a class="btn small xm-pn-next" href="' + qHref(ex.id, nb.next) + '" rel="next"><span>Question ' + nb.next + '</span>' + xic('next') + '</a>' : '<a class="btn small ghost" href="' + BASE + '/' + ex.id + '"><span>All questions</span></a>') + '</nav>';
  }
  function qNavigator(ex, num) {
    return '<ol class="xm-qnav">' + range(ex.questionCount).map(function (n) {
      var q = qMeta(ex, n);
      if (!q) return '<li><span class="xm-qnav-it is-missing" title="Not available yet"><span class="xm-qnav-n">' + n + '</span><span class="xm-qnav-t">Not available yet</span></span></li>';
      var s = xstate(pidOf(ex.id, n));
      return '<li><a class="xm-qnav-it" href="' + qHref(ex.id, n) + '"' + (n === num ? ' aria-current="page"' : '') + ' data-n="' + n + '">' +
        '<span class="xm-qnav-n s-' + s + '">' + n + '</span><span class="xm-qnav-t">' + esc(plain(q.title)) + '<span class="sr-only">, ' + esc(XLABEL[s]) + '</span></span></a></li>';
    }).join('') + '</ol>';
  }

  function parseArticle(html, file) {
    var tpl = doc.createElement('template'); tpl.innerHTML = html;
    var art = tpl.content.querySelector('article.xq');
    if (!art) throw new Error('no article.xq in ' + file);
    function clone(sel) { var n = art.querySelector(sel); return n ? n.cloneNode(true) : null; }
    var parts = $$('.xq-find .xq-part', art).map(function (d) {
      var id = d.getAttribute('data-part');
      var extra = d.cloneNode(true); $$('.opt', extra).forEach(function (o) { o.remove(); });
      var tol = parseFloat(d.getAttribute('data-tol'));
      return {
        id: id, type: d.getAttribute('data-type') || 'num', points: parseInt(d.getAttribute('data-points'), 10) || null,
        label: d.getAttribute('data-label') || ('Part ' + id), value: parseFloat(d.getAttribute('data-value')), unit: d.getAttribute('data-unit') || '',
        tol: isNaN(tol) ? 0.02 : tol, abs: parseFloat(d.getAttribute('data-abs')) || 0,
        accept: d.getAttribute('data-accept') || '', correct: d.getAttribute('data-correct'),
        opts: $$('.opt', d).map(function (o) { return { v: o.getAttribute('data-v'), html: o.innerHTML, fb: o.getAttribute('data-fb') || '' }; }),
        extra: extra.innerHTML.trim(),
        fb: $$('.xq-find p.fb', art).filter(function (f) { return f.getAttribute('data-part') === id; }).map(function (f) {
          var ft = parseFloat(f.getAttribute('data-tol'));
          return { match: parseFloat(f.getAttribute('data-match')), tol: isNaN(ft) ? (isNaN(tol) ? 0.02 : tol) : ft, html: f.innerHTML };
        })
      };
    });
    return {
      prompt: clone('.xq-prompt'), flag: clone('aside.xq-flag'), parts: parts,
      hints: $$('.xq-hints .xq-hint', art).map(function (h) { return h.innerHTML; }),
      steps: $$('.xq-steps > .xq-step', art).map(function (s) { return { title: s.getAttribute('data-title') || '', html: s.innerHTML }; }),
      answer: clone('.xq-answer'), check: clone('.xq-check'), mistakes: clone('.xq-mistakes'), similar: clone('.xq-similar'), connect: clone('.xq-connect')
    };
  }
  function inner(node) { return node ? node.innerHTML : ''; }

  function renderQuestion(ctx, ex, num) {
    var q = qMeta(ex, num);
    var pid = pidOf(ex.id, num);
    ctx.setTitle('Question ' + num + ' · ' + ex.title + ' · Past Exam Examples');
    if (!q) {
      ctx.el.innerHTML = '<div class="page xm-page xm-qpage">' + crumbs([{ label: 'Past Exam Examples', href: BASE }, { label: ex.title, href: BASE + '/' + ex.id }, { label: 'Question ' + num }]) +
        '<header class="xm-qhead"><div class="xm-qhead-main"><span class="xm-qnum">' + num + '</span><div><p class="eyebrow">' + esc(ex.title) + ' · Question ' + num + '</p><h1>Not available yet</h1>' +
        '<p class="lede">The retyped version of this question and its worked solution are still being prepared. The original numbering is kept, so this number stays reserved for it.</p></div></div></header>' +
        prevNext(ex, num) + '<section class="card xm-navcard" aria-labelledby="xmNavH"><h2 id="xmNavH" class="card-title">Questions in ' + esc(ex.title) + '</h2>' + qNavigator(ex, num) + '</section></div>';
      return;
    }
    var primary = q.topics[0];
    ctx.el.innerHTML = '<div class="page xm-page xm-qpage" data-topic="' + esc(primary) + '">' +
      crumbs([{ label: 'Past Exam Examples', href: BASE }, { label: ex.title, href: BASE + '/' + ex.id }, { label: 'Question ' + num }]) +
      '<header class="xm-qhead"><div class="xm-qhead-main"><span class="xm-qnum" aria-hidden="true">' + num + '</span><div class="xm-qhead-text">' +
      '<p class="eyebrow">' + esc(ex.title) + ' · Question ' + num + ' · ' + U.plural(q.points, 'point') + (q.page ? ' · page ' + q.page : '') + '</p>' +
      '<h1><span class="sr-only">Question ' + num + ': </span>' + esc(plain(q.title)) + '</h1>' +
      '<div class="xm-qmeta">' + q.topics.map(function (t, i) { return topicChip(t, { role: q.topics.length > 1 ? (i === 0 ? 'main topic' : 'also') : '' }); }).join('') +
      '<span class="xm-qstate">' + stateChip(pid) + '</span>' + flagBadge(q) + '</div></div></div>' + prevNext(ex, num, 'xm-pn-top') + '</header>' +
      '<div class="xm-qgrid"><div class="xm-qmain"><p class="muted">Loading the question…</p></div>' +
      '<aside class="xm-rail" aria-label="Question tools">' +
      '<section class="card xm-notes" aria-labelledby="xmNotesH"><div class="xm-card-head"><h2 id="xmNotesH" class="card-title">Your notes on this question</h2><span class="xm-notes-save"></span></div><div class="xm-notes-ui"></div></section>' +
      '<details class="card xm-navcard" open><summary><h2 class="card-title">Questions in ' + esc(ex.title) + '</h2></summary>' + qNavigator(ex, num) + '</details>' +
      '</aside></div></div>';

    // notes (existing notes UI, no video time)
    var notesApi = A.notesUI.lesson($('.xm-notes-ui', ctx.el), pid, { composer: true, free: true, noTime: true, freeLabel: 'Question notes',
      placeholder: 'A note about this question: what tripped you up, a formula to remember…', emptyText: 'No notes on this question yet.' });
    $('.xm-notes-save', ctx.el).appendChild(U.saveStatus());
    ctx.onCleanup(function () { notesApi.destroy(); });
    ctx.shortcuts.n = function () { var t = $('.xm-notes .nu-new-ta', ctx.el); if (t) { t.focus(); t.scrollIntoView({ block: 'nearest' }); } };
    if (U.isPhone()) { var nv = $('.xm-navcard', ctx.el); if (nv) nv.open = false; }

    return Promise.all([questionText(q.file), originals(ex)]).then(function (res) {
      if (!ctx.alive()) return;
      var data;
      try { data = parseArticle(res[0], q.file); }
      catch (e) { $('.xm-qmain', ctx.el).innerHTML = '<p class="diagram-error">This question could not be read (' + esc(e.message) + ').</p>'; return; }
      buildQuestion(ctx, ex, q, data, res[1]);
    }).catch(function (e) {
      if (!ctx.alive()) return;
      $('.xm-qmain', ctx.el).innerHTML = '<p class="diagram-error">This question could not be loaded (' + esc(e.message) + ').</p>';
    });
  }

  function buildQuestion(ctx, ex, q, D, orig) {
    var pid = pidOf(ex.id, q.num);
    var main = $('.xm-qmain', ctx.el);
    var crop = orig && orig.crops && orig.crops['q' + q.num];
    var nParts = D.parts.length;
    var checkable = D.parts.filter(function (p) { return p.type !== 'draw'; });
    var totalSteps = D.steps.length + 1;   // steps + "final answer and check"
    var multi = nParts > 1;

    main.innerHTML =
      /* ---- the question ---- */
      '<section class="xm-sec xm-given" aria-labelledby="xmGivenH"><div class="xm-sec-head"><h2 id="xmGivenH" class="xm-h2">The question</h2>' +
      (crop ? '<button type="button" class="btn small ghost xm-orig-btn" aria-expanded="false" aria-controls="xmOrig">' + xic('scan') + '<span>Show original scan</span></button>' : '') + '</div>' +
      (crop ? '<figure class="xm-orig" id="xmOrig" hidden><img alt="Photo of question ' + q.num + ' as printed on the exam" loading="lazy" data-src="' + esc(crop) + '">' +
        '<figcaption>Original photo, local copy only: it is never published with the site. Handwriting and marks on the paper are not part of the question; use the retyped version above.</figcaption></figure>' : '') +
      '<div class="guide xm-content xm-prompt">' + inner(D.prompt) + '</div>' +
      (D.flag ? '<aside class="xm-flag" role="note"><p class="xm-flag-title">' + icon('flag') + 'Source note</p><div class="guide">' + D.flag.innerHTML + '</div></aside>' : '') +
      '</section>' +
      /* ---- attempt ---- */
      '<section class="xm-sec xm-attempt" aria-labelledby="xmTryH"><div class="xm-sec-head"><h2 id="xmTryH" class="xm-h2">Your attempt</h2><span class="small muted">' +
      (checkable.length ? 'Work it on paper, then enter your ' + (checkable.length > 1 ? 'answers' : 'answer') + '. Your typing is saved as you go.' : 'Work it on paper, then compare.') + '</span></div>' +
      '<form class="xm-form" novalidate>' + D.parts.map(function (p) { return partHTML(p, multi); }).join('') +
      (checkable.length ? '<div class="xm-form-actions">' + U.btn(checkable.length > 1 ? 'Check answers' : 'Check answer', { kind: 'primary', icon: 'check', cls: 'xm-check-btn' }) +
        '<span class="small muted xm-units-tip">Units and prefixes are optional: <code>12</code>, <code>12 V</code>, <code>4.7k</code>, <code>2.5 mA</code>.</span></div>' : '') +
      '</form><div class="xm-result" hidden></div></section>' +
      /* ---- help controls ---- */
      '<section class="xm-sec xm-help" aria-labelledby="xmHelpH"><div class="xm-sec-head"><h2 id="xmHelpH" class="xm-h2">Need help?</h2><span class="small muted">Use as little as you need: a hint, then one step at a time.</span></div>' +
      '<div class="xm-controls" role="group" aria-label="Help for this question">' +
      '<button type="button" class="btn xm-b-hint">' + xic('hint') + '<span class="xm-b-label">Show hint</span><span class="xm-count"></span></button>' +
      '<button type="button" class="btn xm-b-step">' + xic('step') + '<span class="xm-b-label">Reveal next step</span><span class="xm-count"></span></button>' +
      '<button type="button" class="btn xm-b-full">' + xic('sol') + '<span class="xm-b-label">Show full solution</span></button>' +
      '<button type="button" class="btn ghost xm-b-reset">' + xic('reset') + '<span>Start over</span></button></div>' +
      '<div class="xm-nudge" role="group" aria-labelledby="xmNudgeT" hidden><p id="xmNudgeT"><b>Try it first?</b> Even a rough attempt makes the solution stick. If you reveal a step now, this question counts as solved with help until you solve it on your own.</p>' +
      '<div class="xm-nudge-row">' + U.btn('Reveal anyway', { small: true, kind: 'primary', cls: 'xm-nudge-yes' }) + U.btn('I’ll try first', { small: true, cls: 'xm-nudge-no' }) + '</div></div>' +
      '<ol class="xm-hints" aria-label="Hints"></ol></section>' +
      /* ---- worked solution ---- */
      '<section class="xm-sec xm-solution" aria-labelledby="xmSolH"><div class="xm-sec-head"><h2 id="xmSolH" class="xm-h2">Worked solution</h2><span class="xm-solprog small" aria-hidden="true"></span></div>' +
      '<p class="xm-sol-empty small muted">Hidden until you ask for it: use <b>Reveal next step</b> or <b>Show full solution</b>.</p>' +
      '<ol class="xm-steps">' + D.steps.map(function (s, i) {
        return '<li class="xm-step" data-i="' + i + '" hidden><h3 class="xm-step-title" tabindex="-1"><span class="xm-step-n">' + (i + 1) + '</span><span>' + s.title + '</span></h3><div class="guide xm-content">' + s.html + '</div></li>';
      }).join('') + '</ol>' +
      '<div class="xm-final" hidden><h3 class="xm-step-title" tabindex="-1"><span class="xm-step-n">' + icon('check') + '</span><span>Final answer</span></h3><div class="guide xm-content xm-answer">' + inner(D.answer) + '</div>' +
      (D.check ? '<h3 class="xm-h3">Quick check: does it make sense?</h3><div class="guide xm-content xm-checkbox">' + inner(D.check) + '</div>' : '') + '</div>' +
      '</section>' +
      /* ---- panels ---- */
      (D.mistakes ? panel('xm-mistakes', 'Common mistakes', 'What students typically get wrong here', D.mistakes) : '') +
      (D.similar ? panel('xm-similar', 'Approach for similar problems', 'What changes when the numbers or the circuit change', D.similar) : '') +
      (D.connect ? '<details class="xm-panel xm-connect" data-topic="' + esc(q.topics[0]) + '"><summary><span class="xm-sum-title">Connection to the Topic</span><span class="xm-sum-sub">Which topic this tests, the clues, and where it is taught</span></summary>' +
        '<div class="xm-panel-body"><p class="xm-connect-chips"><span class="small muted">' + (q.topics.length > 1 ? 'Topics:' : 'Topic:') + '</span> ' +
        q.topics.map(function (t, i) {
          var T = A.topic(t);
          return '<span class="xm-tpair">' + topicChip(t, { role: q.topics.length > 1 ? (i === 0 ? 'main' : 'also') : '' }) +
            '<a class="xm-fs-link" data-topic="' + t + '" href="#/t/' + t + '/review" aria-label="' + esc((T ? T.name : t) + ' formula sheet and review') + '">' + icon('review') + '<span>Formulas</span></a></span>';
        }).join('') + '</p>' +
        '<div class="guide xm-content">' + D.connect.innerHTML + '</div></div></details>' : '') +
      prevNext(ex, q.num, 'xm-pn-bottom');

    // content rendering (KaTeX, diagrams, timestamps, cross-refs)
    $$('.xm-content, .xm-part-label, .xm-part-extra, .mc-opt-text, .xm-flag .guide, .xm-step-title', main).forEach(function (n) { render(n); });
    $$('.xm-connect .guide a[href^="#/t/"]:not(.xref):not(.ts)', main).forEach(function (a) {
      var m = /^#\/t\/([a-z]+)/.exec(a.getAttribute('href')); if (!m || !A.topic(m[1])) return;
      a.classList.add('xm-tlink'); a.setAttribute('data-topic', m[1]);
    });

    /* ---------- state ---------- */
    function P() { return ensure(S.pp(pid)); }      // creates the record on first interaction
    var p0 = peekP(pid); if (p0) ensure(p0);
    function save() { store.save(); refreshStatus(); }
    function refreshStatus() {
      var chip = $('.xm-qstate', ctx.el); if (chip) chip.innerHTML = stateChip(pid);
      var nav = $('.xm-qnav-it[aria-current] .xm-qnav-n', ctx.el); if (nav) nav.className = 'xm-qnav-n s-' + xstate(pid);
    }

    /* ---------- original scan ---------- */
    var ob = $('.xm-orig-btn', main);
    if (ob) ob.onclick = function () {
      var f = $('#xmOrig', main), open = f.hidden;
      if (open) { var img = $('img', f); if (!img.getAttribute('src')) img.src = img.getAttribute('data-src'); }
      f.hidden = !open; ob.setAttribute('aria-expanded', String(open));
      $('span', ob).textContent = open ? 'Hide original scan' : 'Show original scan';
    };

    /* ---------- attempt ---------- */
    var form = $('.xm-form', main), result = $('.xm-result', main);
    var draftTimer = null;
    function partEl(id) { return form.querySelector('.xm-part[data-part="' + id + '"]'); }
    function value(p) {
      var el = partEl(p.id);
      if (p.type === 'mc') { var r = el.querySelector('input[type=radio]:checked'); return r ? r.value : ''; }
      if (p.type === 'draw') return '';
      var i = el.querySelector('.xm-in'); return i ? i.value : '';
    }
    function collectDraft() { var d = {}; D.parts.forEach(function (p) { var v = value(p); if (v !== '') d[p.id] = v; }); return d; }
    function flushDraft() {
      draftTimer = null;
      var d = collectDraft(), p = peekP(pid);
      if (!p && !Object.keys(d).length) return;
      p = P(); p.draft = d; p.updated = Date.now(); save();
    }
    form.addEventListener('input', function (e) {
      var part = e.target.closest('.xm-part');
      if (part) { part.classList.remove('is-ok', 'is-no'); var fbx = $('.xm-pfb', part); if (fbx && part.getAttribute('data-type') !== 'draw') { fbx.hidden = true; } $$('.mc-opt', part).forEach(function (o) { o.classList.remove('ok', 'no'); }); }
      clearTimeout(draftTimer); draftTimer = setTimeout(flushDraft, 300);
    });
    form.addEventListener('change', function () { clearTimeout(draftTimer); draftTimer = setTimeout(flushDraft, 300); });
    form.addEventListener('submit', function (e) { e.preventDefault(); check(); });
    form.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') { e.preventDefault(); check(); } });
    ctx.onCleanup(function () { if (draftTimer) { clearTimeout(draftTimer); flushDraft(); } });

    function setPartState(p, st, html) {
      var el = partEl(p.id), fb = $('.xm-pfb', el);
      el.classList.remove('is-ok', 'is-no', 'is-self');
      if (st === 'ok') el.classList.add('is-ok'); else if (st === 'no') el.classList.add('is-no'); else if (st === 'self') el.classList.add('is-self');
      var inp = $('.xm-in', el);
      if (inp) { if (st === 'no') inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
      if (html == null) { fb.hidden = true; fb.innerHTML = ''; return; }
      fb.hidden = false;
      fb.className = 'xm-pfb ' + (st === 'ok' ? 'ok' : st === 'no' ? 'no' : 'info');
      fb.innerHTML = html;
      render(fb);
      if (st === 'no' && !U.reducedMotion()) { var t = inp || el; t.classList.remove('xm-shake'); void t.offsetWidth; t.classList.add('xm-shake'); }
      if (st === 'ok' && !U.reducedMotion()) { var mk = $('.xm-mark', el); if (mk) { mk.classList.remove('xm-draw'); void mk.offsetWidth; mk.classList.add('xm-draw'); } }
    }
    function checkPart(p) {
      var v = value(p);
      if (p.type === 'num') {
        var spec = { labelText: plain(p.label), unit: p.unit, value: p.value, tol: p.tol, abs: p.abs };
        if (!global.EEPractice) return { state: String(v).trim() ? 'self' : 'empty', msg: 'The answer checker did not load. Compare with the final answer.' };
        var r = global.EEPractice.checkNumeric(spec, v, p.fb);
        return { state: r.state, msg: r.state === 'ok' ? 'Correct' + (r.value != null && p.unit ? ': ' + esc(global.EEPractice.fmtNum(r.value)) + ' ' + esc(p.unit) : '') + '.' : (r.html ? r.msg : esc(r.msg)) };
      }
      if (p.type === 'mc') {
        if (!v) return { state: 'empty', msg: 'Choose an option.' };
        var o = p.opts.filter(function (x) { return x.v === v; })[0];
        $$('.mc-opt', partEl(p.id)).forEach(function (lab) { lab.classList.remove('ok', 'no'); var r2 = $('input', lab); if (r2.checked) lab.classList.add(v === p.correct ? 'ok' : 'no'); });
        return v === p.correct ? { state: 'ok', msg: 'Correct choice.' } : { state: 'no', msg: (o && o.fb) || 'Not this one. Re-read the options and check your reasoning.' };
      }
      if (p.type === 'text') {
        if (!String(v).trim()) return { state: 'empty', msg: 'Write your answer first.' };
        var ok = false; try { ok = new RegExp(p.accept, 'i').test(v); } catch (e) { ok = false; }
        if (ok) return { state: 'ok', msg: 'That matches the key idea.' };
        return { state: 'self', msg: 'The checker did not recognise your wording. That does not mean it is wrong: compare it with the answer.' };
      }
      return { state: 'skip' };
    }
    function selfRow(p) {
      return '<span class="xm-self-row">' + U.btn('Compare with the answer', { small: true, cls: 'xm-self-cmp', attrs: ' data-part="' + esc(p.id) + '"' }) + '</span>';
    }
    function allSolved(pr) {
      return checkable.length ? checkable.every(function (p) { return pr.last[p.id] === 'ok'; }) : D.parts.every(function (p) { return pr.last[p.id] === 'ok'; });
    }
    function markSolved(pr, via) {
      if (pr.cur.solved || !allSolved(pr)) return false;
      var own = !pr.cur.revealed;
      var struggledBefore = !!(pr.revealed || pr.wrong >= 2 || Math.max(pr.hints || 0, pr.hintsMax || 0) >= 2);
      pr.cur.solved = true; pr.solved = true;
      if (own) { pr.solvedOnOwn = true; if (pr.retryActive && struggledBefore) pr.recovered = true; }
      if (pr.attempts === 1 && !pr.hintsMax && !pr.revealed && !pr.retries) pr.firstTry = true;
      pr.retryActive = false;
      logEvent(pr, 'solved', { own: own, via: via });
      return true;
    }
    function solvedMsg(pr, fresh) {
      var own = pr.solvedOnOwn && !pr.cur.revealed;
      return '<p><b>' + icon('check') + (fresh ? 'Correct. ' + (own ? 'Solved on your own.' : 'Solved, with the solution open.') : 'You solved this question' + (pr.solvedOnOwn ? ' on your own.' : ' with help.')) + '</b> ' +
        (pr.solOpen ? 'Read the check below the solution.' : 'Compare your method with the worked solution, then read <b>Connection to the Topic</b>.') +
        (fresh ? '' : ' Use <b>Start over</b> to redo it from blank.') + '</p>';
    }
    function check() {
      if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
      var pr = P();
      var res = {}, anyFilled = false, anyWrong = false, says = [];
      checkable.forEach(function (p) {
        var r = checkPart(p); res[p.id] = r;
        if (r.state !== 'empty') anyFilled = true;
        if (r.state === 'no') anyWrong = true;
      });
      pr.draft = collectDraft();
      if (!anyFilled) {
        checkable.forEach(function (p) { setPartState(p, 'empty', '<p>' + esc(res[p.id].msg) + '</p>'); });
        result.hidden = false; result.className = 'xm-result info';
        result.innerHTML = '<p>Enter at least one answer, then check.</p>';
        A.announce('Enter at least one answer, then check.');
        var f = $('.xm-in, input[type=radio]', form); if (f) f.focus();
        save(); return;
      }
      var counted = !pr.cur.solved;
      pr.attempts = (pr.attempts || 0) + 1; pr.cur.checks = (pr.cur.checks || 0) + 1;
      if (anyWrong && counted) { pr.wrong = (pr.wrong || 0) + 1; pr.cur.wrong = (pr.cur.wrong || 0) + 1; }
      checkable.forEach(function (p) {
        var r = res[p.id];
        if (r.state === 'self' && pr.last[p.id] === 'ok') r = { state: 'ok', msg: 'You marked this as matching the answer.' };
        if (r.state !== 'self') pr.last[p.id] = r.state === 'ok' ? 'ok' : (r.state === 'no' ? 'no' : '');
        setPartState(p, r.state, (r.state === 'empty' ? '<p>' + esc(r.msg) + '</p>' : '<p>' + r.msg + '</p>') + (r.state === 'self' ? selfRow(p) : ''));
        says.push((multi ? 'Part ' + p.id + ': ' : '') + (r.state === 'ok' ? 'correct' : r.state === 'no' ? 'not correct' : r.state === 'self' ? 'compare with the answer' : 'no answer'));
      });
      logEvent(pr, 'check', { ok: !anyWrong && allSolved(pr) });
      var fresh = markSolved(pr, 'check');
      result.hidden = false;
      if (pr.cur.solved) {
        result.className = 'xm-result ok'; result.innerHTML = solvedMsg(pr, fresh);
        A.announce((fresh ? 'Correct. ' : '') + says.join('. '));
      } else {
        var nOk = checkable.filter(function (p) { return pr.last[p.id] === 'ok'; }).length;
        result.className = 'xm-result ' + (anyWrong ? 'no' : 'info');
        result.innerHTML = '<p>' + (checkable.length > 1 ? '<b>' + nOk + ' of ' + checkable.length + ' parts correct.</b> ' : '') +
          (anyWrong ? 'Read the feedback under each answer, fix what you can, and check again. Stuck? Try <b>Show hint</b>.' : 'Finish the remaining parts, then check again.') + '</p>';
        A.announce(says.join('. '));
      }
      openConnect();
      save(); syncControls();
    }
    form.addEventListener('click', function (e) {
      var b = e.target.closest('.xm-check-btn'); if (b) { check(); return; }
      var cmp = e.target.closest('.xm-self-cmp, .xm-draw-btn');
      if (cmp) { selfCompare(cmp.getAttribute('data-part')); return; }
      var yes = e.target.closest('.xm-self-yes, .xm-self-no');
      if (yes) {
        var pr = P(), id = yes.getAttribute('data-part'), p = D.parts.filter(function (x) { return x.id === id; })[0];
        var ok = yes.classList.contains('xm-self-yes');
        pr.last[id] = ok ? 'ok' : 'no';
        logEvent(pr, 'selfcheck', { part: id, ok: ok });
        setPartState(p, ok ? 'ok' : 'no', '<p>' + (ok ? 'Marked as matching the answer.' : 'Marked as not matching. Read the worked solution to see where it differs.') + '</p>');
        var fresh = markSolved(pr, 'selfcheck');
        if (fresh || pr.cur.solved) { result.hidden = false; result.className = 'xm-result ok'; result.innerHTML = solvedMsg(pr, fresh); }
        A.announce(ok ? 'Marked as matching.' : 'Marked as not matching.');
        save(); syncControls();
      }
    });
    function answerFigures() {
      var a = D.answer ? D.answer.cloneNode(true) : null;
      if (!a) return '<p class="small muted">No answer figure is available.</p>';
      var figs = $$('figure', a);
      return figs.length ? figs.map(function (f) { return f.outerHTML; }).join('') : a.innerHTML;
    }
    function selfCompare(id, anyway) {
      var p = D.parts.filter(function (x) { return x.id === id; })[0]; if (!p) return;
      var el = partEl(id), box = $('.xm-cmp', el);
      if (!box) { box = U.h('<div class="xm-cmp"></div>'); el.appendChild(box); }
      /* the answer section also shows the results of the other parts: comparing before those are correct is help */
      var pr0 = peekP(pid);
      var open = checkable.filter(function (x) { return x.id !== id && !(pr0 && pr0.last && pr0.last[x.id] === 'ok'); });
      if (!anyway && open.length && !(pr0 && pr0.cur && (pr0.cur.solved || pr0.cur.revealed))) {
        box.innerHTML = '<p class="xm-cmp-q">The answer also shows the result' + (open.length > 1 ? 's' : '') + ' of part' + (open.length > 1 ? 's ' : ' ') +
          open.map(function (x) { return '(' + esc(x.id) + ')'; }).join(', ') + '. Comparing now counts as viewing the solution.</p><p class="xm-cmp-q">' +
          U.btn('Compare anyway', { small: true, cls: 'xm-cmp-anyway', attrs: ' data-part="' + esc(id) + '"' }) + ' ' + U.btn('Check my other answers first', { small: true, kind: 'ghost', cls: 'xm-cmp-later' }) + '</p>';
        $('.xm-cmp-anyway', box).onclick = function () { var pr = P(); markRevealed(pr); save(); syncControls(); selfCompare(id, true); };
        $('.xm-cmp-later', box).onclick = function () { box.remove(); var f = partEl(open[0].id); var i = f && $('.xm-in, input[type=radio]', f); if (i) i.focus(); };
        try { $('.xm-cmp-anyway', box).focus({ preventScroll: true }); } catch (e) {}
        return;
      }
      box.innerHTML = '<div class="guide xm-content">' + (p.type === 'draw' ? answerFigures() : inner(D.answer)) + '</div>' +
        '<p class="xm-cmp-q"><b>' + (p.type === 'draw' ? 'Does your drawing match?' : 'Does your answer say the same thing?') + '</b> ' +
        U.btn('Yes, it matches', { small: true, kind: 'primary', cls: 'xm-self-yes', attrs: ' data-part="' + esc(id) + '"' }) + ' ' +
        U.btn('Not quite', { small: true, cls: 'xm-self-no', attrs: ' data-part="' + esc(id) + '"' }) + '</p>';
      render(box);
      var pr = P(); logEvent(pr, 'compare', { part: id }); save();
      openConnect();
      try { $('.xm-self-yes', box).focus({ preventScroll: true }); } catch (e) {}
      box.scrollIntoView({ block: 'nearest', behavior: U.reducedMotion() ? 'auto' : 'smooth' });
    }

    /* ---------- hints / steps / full solution ---------- */
    var hintsBox = $('.xm-hints', main), steps = $$('.xm-step', main), finalBox = $('.xm-final', main);
    var bHint = $('.xm-b-hint', main), bStep = $('.xm-b-step', main), bFull = $('.xm-b-full', main), bReset = $('.xm-b-reset', main);
    var nudge = $('.xm-nudge', main), pending = null;
    function hintsShown(pr) { return pr ? Math.max(pr.hints || 0, (pr.cur && pr.cur.hintsSeen) || 0) : 0; }
    function renderHints(animateLast) {
      var pr = peekP(pid), n = Math.min(hintsShown(pr), D.hints.length);
      hintsBox.innerHTML = D.hints.slice(0, n).map(function (h, i) {
        return '<li class="xm-hint' + (animateLast && i === n - 1 ? ' xm-rev' : '') + '"><p class="xm-hint-label">Hint ' + (i + 1) + ' of ' + D.hints.length + '</p><div class="guide xm-content">' + h + '</div></li>';
      }).join('');
      $$('.xm-content', hintsBox).forEach(render);
    }
    function showSteps(n, animateFrom) {
      steps.forEach(function (li, i) {
        var on = i < n;
        li.hidden = !on;
        li.classList.toggle('xm-rev', on && animateFrom != null && i >= animateFrom);
      });
      finalBox.hidden = n < totalSteps;
      finalBox.classList.toggle('xm-rev', n >= totalSteps && animateFrom != null && animateFrom >= D.steps.length);
      $('.xm-sol-empty', main).hidden = n > 0;
      var sp = $('.xm-solprog', main);
      sp.innerHTML = n ? 'Step ' + Math.min(n, D.steps.length) + ' of ' + D.steps.length + (n >= totalSteps ? ' · answer shown' : '') +
        '<span class="xm-dots">' + range(totalSteps).map(function (k) { return '<span class="xm-dotp' + (k <= n ? ' on' : '') + '"></span>'; }).join('') + '</span>' : '';
    }
    function setDisabled(b, dis) { b.setAttribute('aria-disabled', String(!!dis)); b.classList.toggle('is-done', !!dis); }
    function syncControls() {
      var pr = peekP(pid), hs = hintsShown(pr), st = pr ? pr.steps || 0 : 0, full = !!(pr && pr.solOpen);
      $('.xm-count', bHint).textContent = hs + '/' + D.hints.length;
      $('.xm-b-label', bHint).textContent = hs >= D.hints.length ? 'All hints shown' : (hs ? 'Show another hint' : 'Show hint');
      setDisabled(bHint, hs >= D.hints.length || !D.hints.length);
      $('.xm-count', bStep).textContent = Math.min(st, D.steps.length) + '/' + D.steps.length;
      $('.xm-b-label', bStep).textContent = st >= totalSteps ? 'All steps shown' : (st >= D.steps.length ? 'Show the final answer' : (st ? 'Reveal next step' : 'Reveal first step'));
      setDisabled(bStep, st >= totalSteps);
      bFull.setAttribute('aria-expanded', String(full));
      bFull.innerHTML = xic(full ? 'hide' : 'sol') + '<span class="xm-b-label">' + (full ? 'Hide solution' : 'Show full solution') + '</span>';
      var started = pr && (pr.attempts || hs || st || drafted(pr) || pr.solved);
      bReset.hidden = !started;
    }
    function attempted(pr) { return !!(pr && (pr.cur.checks || drafted(pr) || pr.cur.solved)) || Object.keys(collectDraft()).length > 0; }
    function needNudge() { var pr = peekP(pid); return !(pr && (pr.cur.revealed || pr.cur.solved)) && !attempted(pr ? ensure(pr) : null); }
    function askFirst(action) {
      pending = action; nudge.hidden = false;
      if (!U.reducedMotion()) { nudge.classList.remove('xm-rev'); void nudge.offsetWidth; nudge.classList.add('xm-rev'); }
      try { $('.xm-nudge-yes', nudge).focus({ preventScroll: true }); } catch (e) {}
      nudge.scrollIntoView({ block: 'nearest', behavior: U.reducedMotion() ? 'auto' : 'smooth' });
      A.announce('Try it first? Reveal anyway, or try first.');
    }
    $('.xm-nudge-yes', nudge).onclick = function () { nudge.hidden = true; var f = pending; pending = null; if (f) f(); };
    $('.xm-nudge-no', nudge).onclick = function () {
      nudge.hidden = true; pending = null;
      var f = $('.xm-in, input[type=radio], .xm-draw-btn', form); if (f) { f.focus(); f.scrollIntoView({ block: 'center', behavior: U.reducedMotion() ? 'auto' : 'smooth' }); }
    };
    function markRevealed(pr) {
      if (!pr.cur.solved && !pr.cur.revealed) { pr.cur.revealed = true; pr.revealed = true; if (pr.recovered && !pr.cur.solved) pr.recovered = false; logEvent(pr, 'reveal'); }
      else if (!pr.cur.solved) pr.revealed = true;
    }
    function focusStep(el, label) {
      var h = $('.xm-step-title', el) || el;
      try { h.focus({ preventScroll: true }); } catch (e) {}
      el.scrollIntoView({ block: 'nearest', behavior: U.reducedMotion() ? 'auto' : 'smooth' });
      A.announce(label);
    }
    bHint.onclick = function () {
      var pr = P();
      if (hintsShown(pr) >= D.hints.length) return;
      if (pr.cur.solved) pr.cur.hintsSeen = Math.min(D.hints.length, hintsShown(pr) + 1);
      else { pr.hints = Math.min(D.hints.length, (pr.hints || 0) + 1); pr.hintsMax = Math.max(pr.hintsMax || 0, pr.hints); }
      logEvent(pr, 'hint', { n: hintsShown(pr) });
      save(); renderHints(true); syncControls();
      var last = hintsBox.lastElementChild;
      if (last) { last.scrollIntoView({ block: 'nearest', behavior: U.reducedMotion() ? 'auto' : 'smooth' }); }
      A.announce('Hint ' + hintsShown(pr) + ' of ' + D.hints.length + ': ' + (last ? last.textContent.replace(/^Hint \d+ of \d+/, '').trim().slice(0, 200) : ''));
    };
    function doStep() {
      var pr = P();
      if (pr.steps >= totalSteps) return;
      markRevealed(pr);
      var from = pr.steps;
      pr.steps++;
      if (pr.steps >= totalSteps) { pr.solOpen = true; }
      logEvent(pr, 'step', { n: pr.steps });
      save(); showSteps(pr.steps, from); syncControls(); openConnect();
      if (pr.steps >= totalSteps) { openPanels(); focusStep(finalBox, 'Final answer shown, with a quick check.'); }
      else focusStep(steps[from], 'Step ' + pr.steps + ' of ' + D.steps.length + ': ' + D.steps[from].title.replace(/<[^>]+>/g, ''));
    }
    function doFull() {
      var pr = P();
      markRevealed(pr);
      var from = pr.steps;
      pr.steps = totalSteps; pr.solOpen = true;
      logEvent(pr, 'full');
      save(); showSteps(totalSteps, from); syncControls(); openPanels(); openConnect();
      focusStep(from < D.steps.length ? steps[from] : finalBox, 'Full solution shown: ' + D.steps.length + ' steps, the final answer, a check, common mistakes and how to approach similar problems.');
    }
    bStep.onclick = function () { if (bStep.getAttribute('aria-disabled') === 'true') return; if (needNudge()) askFirst(doStep); else doStep(); };
    bFull.onclick = function () {
      var pr = peekP(pid);
      if (pr && pr.solOpen) {   // hide again (the record of having viewed it stays)
        pr.solOpen = false; pr.steps = 0; save(); showSteps(0); syncControls();
        A.announce('Solution hidden.'); return;
      }
      if (needNudge()) askFirst(doFull); else doFull();
    };
    bReset.onclick = function () {
      U.confirmInline(bReset, { question: 'Clear your answers and hide the hints and the solution?', yes: 'Start over', onYes: function () {
        var pr = P();
        if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
        pr.draft = {}; pr.last = {}; pr.hints = 0; pr.steps = 0; pr.solOpen = false;
        pr.cur = { checks: 0, wrong: 0, revealed: false, solved: false };
        pr.retries = (pr.retries || 0) + 1; pr.retryActive = true;
        logEvent(pr, 'retry');
        $$('.xm-in', form).forEach(function (i) { i.value = ''; i.removeAttribute('aria-invalid'); });
        $$('input[type=radio]', form).forEach(function (r) { r.checked = false; });
        $$('.mc-opt', form).forEach(function (o) { o.classList.remove('ok', 'no'); });
        D.parts.forEach(function (p) { setPartState(p, '', null); var c = $('.xm-cmp', partEl(p.id)); if (c) c.remove(); });
        result.hidden = true; result.innerHTML = ''; nudge.hidden = true;
        save(); renderHints(); showSteps(0); syncControls();
        $$('.xm-mistakes, .xm-similar', main).forEach(function (d) { d.open = false; });
        var f = $('.xm-in, input[type=radio]', form); if (f) f.focus({ preventScroll: true });
        form.scrollIntoView({ block: 'nearest' });
        A.announce('Started over. Your answers are cleared; your history is kept.');
      } });
    };
    function openPanels() { $$('.xm-mistakes, .xm-similar', main).forEach(function (d) { d.open = true; }); }
    function openConnect() { var c = $('.xm-connect', main); if (c && !c.open) c.open = true; }

    /* ---------- restore ---------- */
    var pr0 = peekP(pid);
    if (pr0) {
      D.parts.forEach(function (p) {
        var v = pr0.draft[p.id]; if (v == null) return;
        var el = partEl(p.id);
        if (p.type === 'mc') { var r = el.querySelector('input[type=radio][value="' + (global.CSS && CSS.escape ? CSS.escape(v) : v) + '"]'); if (r) r.checked = true; }
        else { var i = $('.xm-in', el); if (i) i.value = v; }
      });
      if (pr0.cur.solved) {
        D.parts.forEach(function (p) { if (pr0.last[p.id] === 'ok') { var el = partEl(p.id); el.classList.add('is-ok'); } });
        result.hidden = false; result.className = 'xm-result ok'; result.innerHTML = solvedMsg(pr0, false);
      }
      if (pr0.attempts || pr0.revealed || pr0.steps || pr0.solOpen) openConnect();
      showSteps(pr0.solOpen ? totalSteps : Math.min(pr0.steps, totalSteps));
      if (pr0.solOpen) openPanels();
    } else showSteps(0);
    renderHints(false);
    syncControls();
  }
  function panel(cls, title, sub, node) {
    return '<details class="xm-panel ' + cls + '"><summary><span class="xm-sum-title">' + esc(title) + '</span><span class="xm-sum-sub">' + esc(sub) + '</span></summary>' +
      '<div class="xm-panel-body guide xm-content">' + node.innerHTML + '</div></details>';
  }
  function partHTML(p, multi) {
    var id = 'xmIn-' + p.id, pts = p.points ? '<span class="xm-part-pts">' + U.plural(p.points, 'pt') + '</span>' : '';
    var tag = multi ? '<span class="xm-part-id">(' + esc(p.id) + ')</span>' : '';
    var extra = p.extra ? '<div class="xm-part-extra guide">' + p.extra + '</div>' : '';
    var fb = '<div class="xm-pfb" id="xmFb-' + esc(p.id) + '" hidden aria-live="off"></div>';
    if (p.type === 'mc') {
      return '<fieldset class="xm-part" data-part="' + esc(p.id) + '" data-type="mc"><legend class="xm-part-head">' + tag + '<span class="xm-part-label">' + p.label + '</span>' + pts + '</legend>' + extra +
        '<div class="mc-opts">' + p.opts.map(function (o) {
          return '<label class="mc-opt"><input type="radio" name="xmMc-' + esc(p.id) + '" value="' + esc(o.v) + '"><span class="mc-opt-text">' + o.html + '</span></label>';
        }).join('') + '</div>' + fb + '</fieldset>';
    }
    if (p.type === 'draw') {
      return '<div class="xm-part" data-part="' + esc(p.id) + '" data-type="draw" role="group" aria-labelledby="xmL-' + esc(p.id) + '"><div class="xm-part-head">' + tag + '<span class="xm-part-label" id="xmL-' + esc(p.id) + '">' + p.label + '</span>' + pts + '</div>' + extra +
        '<p class="xm-draw small">' + xic('draw') + '<span>Draw it on paper. This part is not checked automatically.</span> ' +
        U.btn('I drew it — compare', { small: true, cls: 'xm-draw-btn', attrs: ' data-part="' + esc(p.id) + '"' }) + '</p>' + fb + '</div>';
    }
    if (p.type === 'text') {
      return '<div class="xm-part" data-part="' + esc(p.id) + '" data-type="text"><div class="xm-part-head">' + tag + '<label class="xm-part-label" for="' + id + '">' + p.label + '</label>' + pts + '</div>' + extra +
        '<div class="xm-ans"><textarea id="' + id + '" class="xm-in xm-ta" rows="3" aria-describedby="xmFb-' + esc(p.id) + '"></textarea><span class="xm-mark" aria-hidden="true">' + icon('check') + '</span></div>' + fb + '</div>';
    }
    var unitTxt = p.unit ? 'in ' + p.unit : 'no unit';
    return '<div class="xm-part" data-part="' + esc(p.id) + '" data-type="num"><div class="xm-part-head">' + tag + '<label class="xm-part-label" for="' + id + '">' + p.label + '</label>' + pts + '</div>' + extra +
      '<div class="xm-ans"><input id="' + id + '" class="xm-in" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-describedby="xmU-' + esc(p.id) + ' xmFb-' + esc(p.id) + '">' +
      '<span class="xm-unit" id="xmU-' + esc(p.id) + '">' + esc(unitTxt) + '</span><span class="xm-mark" aria-hidden="true">' + icon('check') + '</span></div>' + fb + '</div>';
  }

  /* ================================================================== topic integration ("From past exams") */
  function topicItems(ix, tid) {
    var out = [];
    ix.exams.forEach(function (ex, ei) {
      ex.questions.forEach(function (q) { var i = (q.topics || []).indexOf(tid); if (i >= 0) out.push({ ex: ex, q: q, main: i === 0, ei: ei }); });
    });
    return out.sort(function (a, b) { return (a.main ? 0 : 1) - (b.main ? 0 : 1) || a.ei - b.ei || a.q.num - b.q.num; });
  }
  /* fills el with a "From past exams" card for a topic; hides el when there are none */
  function topicCard(tid, el, ctx) {
    if (!el) return Promise.resolve();
    el.hidden = true;
    return index().then(function (ix) {
      if (ctx && ctx.alive && !ctx.alive()) return;
      var items = topicItems(ix, tid), t = A.topic(tid);
      if (!items.length) return;
      el.hidden = false;
      el.innerHTML = '<section class="xm-from" aria-labelledby="xmFrom-' + tid + '"><div class="xm-from-head"><span class="xm-from-ic">' + examIcon() + '</span><div><h2 class="xm-from-title" id="xmFrom-' + tid + '">From past exams</h2>' +
        '<p class="small muted">Real exam questions that test ' + esc(t ? t.name : 'this topic') + ', with hints, a step-by-step solution and links back to the lessons.</p></div>' +
        '<a class="btn small ghost xm-from-all" href="' + BASE + '?topic=' + tid + '"><span>All past exams</span>' + icon('arrow') + '</a></div>' +
        '<ul class="xm-qlist">' + items.map(function (x) { return qRow(x.ex, x.q, tid); }).join('') + '</ul></section>';
    }).catch(function () { el.hidden = true; });
  }
  /* notes: ids "xm-<exam>-q<N>" */
  function noteIds() {
    var L = store.state.notes.lessons || {};
    return Object.keys(L).filter(function (k) {
      if (!/^xm-/.test(k)) return false;
      var n = L[k]; return !!(n && ((n.items || []).length || (n.free || '').trim()));
    }).sort(function (a, b) {
      var ma = /^xm-(.+)-q(\d+)$/.exec(a) || [], mb = /^xm-(.+)-q(\d+)$/.exec(b) || [];
      return String(ma[1]).localeCompare(String(mb[1])) || (+ma[2] || 0) - (+mb[2] || 0);
    });
  }
  function noteInfo(id) {
    var m = /^xm-(.+)-q(\d+)$/.exec(id || '');
    if (!m) return { label: id, href: BASE, title: '' };
    var ex = cache.index ? examById(cache.index, m[1]) : null, q = ex ? qMeta(ex, +m[2]) : null;
    return { exam: m[1], num: +m[2], examTitle: ex ? ex.title : m[1].toUpperCase(), title: q ? plain(q.title) : '', href: qHref(m[1], +m[2]),
      label: (ex ? ex.title : m[1].toUpperCase()) + ', question ' + m[2] + (q ? ': ' + plain(q.title) : '') };
  }

  /* Home card */
  function homeCard(el, ctx) {
    if (!el) return Promise.resolve();
    return index().then(function (ix) {
      if (ctx && ctx.alive && !ctx.alive()) return;
      var n = 0, solved = 0;
      ix.exams.forEach(function (ex) { n += ex.questions.length; ex.questions.forEach(function (q) { var s = xstate(pidOf(ex.id, q.num)); if (s === 'own' || s === 'help') solved++; }); });
      var meta = $('.xm-home-meta', el);
      if (meta) meta.textContent = ix.exams.map(function (ex) { return ex.title + ': ' + ex.questionCount + ' questions'; }).join(' · ') + (n ? ' · ' + solved + ' of ' + n + ' solved' : '');
    }).catch(function () {});
  }

  A.registerView('exams', { render: renderView });
  A.exams = { index: index, topicCard: topicCard, homeCard: homeCard, noteIds: noteIds, noteInfo: noteInfo, state: xstate, STATE_LABEL: XLABEL, href: qHref, icon: examIcon };
})(window);
