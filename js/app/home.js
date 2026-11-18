/* EE 211 — Home: continue card, how-to strip, topic cards, revisit list, restore-backup banner. */
(function (global) {
  'use strict';
  var A = global.EEApp, U = A.ui, S = A.store, store = global.EEStore;
  var esc = U.esc, icon = U.icon, $ = U.$, $$ = U.$$;
  function prefs() { return store.state.prefs || (store.state.prefs = {}); }

  function hasAnyData() {
    var st = store.state;
    var notes = Object.keys(st.notes.lessons || {}).some(function (k) { var n = st.notes.lessons[k]; return n && ((n.items || []).length || (n.free || '').trim()); }) ||
      Object.keys(st.notes.topics || {}).some(function (k) { return (st.notes.topics[k] || '').trim(); });
    var prog = Object.keys(st.progress.lessons || {}).some(function (k) { var p = st.progress.lessons[k]; return p && (p.done || p.pos > 5 || Object.keys(p.secs || {}).length); }) ||
      Object.keys(st.progress.practice || {}).length > 0;
    return notes || prog;
  }

  function continueInfo() {
    var r = prefs().lastRoute;
    if (!r) return null;
    var pr = A.parseHash(r), p = pr.parts;
    if (p[0] !== 't' || !A.topic(p[1]) || !A.mode(p[2])) return null;
    var t = A.topic(p[1]), m = A.mode(p[2]), detail = '', l;
    if (m.id === 'watch') {
      l = A.data.lesson(p[3]) || A.data.lastLessonOf(t.id);
      if (l) { var lp = store.state.progress.lessons[l.id] || {}; var i = A.data.lessonIndex(l); detail = 'Lesson ' + i.n + ': ' + l.title + (lp.pos > 5 ? ' at ' + U.fmt(lp.pos) : ''); }
    } else if (m.id === 'understand') {
      if (p[3] === 'lab') detail = 'Interactive lab';
      else { l = A.data.lesson(p[3]); if (l) detail = 'Lesson ' + A.data.lessonIndex(l).n + ': ' + l.title; }
    } else if (m.id === 'practice') {
      var ids = A.data.questionIds(t.id), prog = null;
      ids.forEach(function (q) { if (!prog && A.progress.questionState(q) === 'progress') prog = q; });
      var target = p[3] || prog;
      if (target) { var mm = /-(q|b)(\d+)$/.exec(target); detail = (mm ? (mm[1] === 'b' ? 'Bonus question ' : 'Question ') + mm[2] : 'Question') + (A.progress.questionState(target) === 'progress' ? ', answer in progress' : ''); }
      else detail = 'Four scenarios';
    } else detail = m.desc;
    return { href: r, topic: t, mode: m, detail: detail };
  }

  function topicCard(t) {
    var st = A.progress.topicStats(t.id);
    var sf = st.lessons ? st.done / st.lessons : 0;
    return '<article class="tcard" data-topic="' + t.id + '">' +
      '<div class="tcard-mark" aria-hidden="true">' + U.glyph(t.id) + '</div>' +
      '<div class="tcard-top"><span class="tcard-glyph">' + U.glyph(t.id) + '</span>' +
      '<h3 class="tcard-name"><a class="tcard-link" href="#/t/' + t.id + '">' + esc(t.name) + '</a></h3></div>' +
      '<p class="tcard-blurb">' + esc(t.blurb) + '</p>' +
      '<div class="tcard-stats">' +
      '<div class="tstat">' + U.ring(sf, { size: 34, stroke: 3.5 }) + '<span><span class="tstat-label">Studied</span><span class="tstat-value">' + st.done + '/' + st.lessons + ' lessons · ' + U.pct(st.watched) + '% watched</span></span></div>' +
      '<div class="tstat">' + U.diamonds(st.core, st.help) + '<span><span class="tstat-label">Understood</span><span class="tstat-value">' + st.core + '/4 scenarios</span></span></div>' +
      '</div>' +
      (st.revisit ? '<p class="tcard-revisit">' + icon('flag') + U.plural(st.revisit, 'question') + ' to revisit</p>' : '') +
      '<div class="tcard-actions">' + U.btn('Watch', { small: true, icon: 'watch', href: '#/t/' + t.id + '/watch', cls: 'tcard-btn' }) +
      U.btn('Understand', { small: true, icon: 'understand', href: '#/t/' + t.id + '/understand', cls: 'tcard-btn' }) +
      U.btn('Practice', { small: true, icon: 'practice', href: '#/t/' + t.id + '/practice', cls: 'tcard-btn' }) + '</div>' +
      '</article>';
  }

  function render(ctx) {
    ctx.setTitle('');
    var ci = continueInfo();
    var any = hasAnyData();
    var intro = !prefs().introDismissed;
    var restore = !any && !prefs().restoreBannerDismissed;
    var total = A.TOPICS.reduce(function (a, t) { return a + A.data.topicLessons(t.id).length; }, 0);

    ctx.el.innerHTML =
      '<div class="page home">' +
      (restore ? '<div class="restore-banner" role="region" aria-label="Restore a backup">' + icon('upload') +
        '<p><b>Moved here from the local version?</b> Notes from the old localhost site are stored separately in that browser. Export a backup there (Notes → Download full backup), then restore it here.</p>' +
        '<div class="rb-actions">' + U.btn('Restore a backup', { small: true, kind: 'primary', href: '#/notes?restore=1' }) + U.btn('Dismiss', { small: true, kind: 'ghost', cls: 'rb-x' }) + '</div></div>' : '') +
      '<section class="hero">' +
      ' <div class="hero-text"><p class="eyebrow">Unofficial study companion · ' + total + ' lessons · 6 topics</p>' +
      '  <h1 class="hero-title">EE 211 Circuits</h1>' +
      '  <p class="lede">Watch Eric Hernandez’s lectures with a searchable transcript, read complete study guides with worked examples, try the circuits in interactive labs, and check yourself with practice scenarios. Everything you write stays in this browser.</p></div>' +
      ' <div class="continue">' + (ci ?
        '<p class="continue-label">Continue where you left off</p>' +
        '<a class="continue-card" data-topic="' + ci.topic.id + '" href="' + esc(ci.href) + '">' +
        '<span class="continue-glyph">' + U.glyph(ci.topic.id) + '</span>' +
        '<span class="continue-text"><span class="continue-where">' + esc(ci.topic.name) + ' · ' + esc(ci.mode.label) + '</span>' +
        '<span class="continue-detail">' + esc(ci.detail) + '</span></span>' +
        '<span class="btn primary continue-btn">' + icon(ci.mode.id) + '<span>Resume</span></span></a>'
        : '<p class="continue-label">Start studying</p><a class="continue-card" data-topic="deltawye" href="#/t/deltawye/watch"><span class="continue-glyph">' + U.glyph('deltawye') + '</span>' +
        '<span class="continue-text"><span class="continue-where">Δ–Y Conversions · Watch</span><span class="continue-detail">Begin with lesson 1, or pick any topic below.</span></span>' +
        '<span class="btn primary continue-btn">' + icon('watch') + '<span>Start</span></span></a>') + '</div>' +
      '</section>' +
      (intro ? '<section class="flow" aria-labelledby="flowTitle"><div class="flow-head"><h2 id="flowTitle" class="flow-title">How to study here</h2>' +
        U.btn('', { icon: 'close', small: true, kind: 'ghost', cls: 'flow-x icon-only', aria: 'Hide this guide' }) + '</div><ol class="flow-steps">' +
        A.MODES.slice(0, 4).map(function (m, i) {
          return '<li class="flow-step"><span class="flow-ic">' + icon(m.id) + '</span><span class="flow-txt"><b>' + (i + 1) + '. ' + esc(m.label) + '</b><span>' + esc(m.desc) + '</span></span></li>';
        }).join('') + '</ol><p class="flow-foot small muted">Each topic has these modes plus <b>My Notes</b>. <b>Studied</b> (ring) counts lessons you mark complete; <b>Understood</b> (diamonds) counts practice scenarios you solve on your own. Press <kbd>?</kbd> for keyboard shortcuts.</p></section>' : '') +
      '<section aria-labelledby="topicsTitle"><div class="sec-head"><h2 id="topicsTitle" class="sec-title">Topics</h2></div>' +
      '<div class="tgrid">' + A.TOPICS.map(topicCard).join('') + '</div></section>' +
      '<section class="xm-home" aria-labelledby="xmHomeT"><a class="xm-home-card" href="#/exams">' + (A.exams ? '<span class="xm-home-ic">' + A.exams.icon() + '</span>' : '') +
      '<span class="xm-home-text"><span class="xm-home-kicker">Practise with real exams</span><span class="xm-home-title" id="xmHomeT">Past Exam Examples</span>' +
      '<span class="xm-home-desc">Questions from past exams with redrawn diagrams. Try each one, then reveal hints and the worked solution one step at a time, and see which lessons it comes from.</span>' +
      '<span class="xm-home-meta small muted"></span></span><span class="btn primary small xm-home-go"><span>Open past exams</span>' + icon('arrow') + '</span></a></section>' +
      '<section class="revisit" aria-labelledby="revTitle"><div class="sec-head"><h2 id="revTitle" class="sec-title">Worth revisiting</h2><span class="muted small">Questions you struggled with and sections you flagged</span></div><div class="revisit-body"><p class="muted small">Checking…</p></div></section>' +
      '</div>';

    var rbx = $('.rb-x', ctx.el);
    if (rbx) rbx.onclick = function () { prefs().restoreBannerDismissed = true; store.save(); var b = $('.restore-banner', ctx.el); b.classList.add('leaving'); setTimeout(function () { b.remove(); }, 200); };
    var fx = $('.flow-x', ctx.el);
    if (fx) fx.onclick = function () { prefs().introDismissed = true; store.save(); var f = $('.flow', ctx.el); f.remove(); A.toast('Guide hidden. It is also under About → How to use.'); };
    // stretched links: whole card clickable except the buttons
    $$('.tcard', ctx.el).forEach(function (c) {
      c.addEventListener('click', function (e) { if (e.target.closest('a,button')) return; location.hash = $('.tcard-link', c).getAttribute('href'); });
    });
    if (A.exams) A.exams.homeCard($('.xm-home', ctx.el), ctx);
    return fillRevisit($('.revisit-body', ctx.el), ctx);
  }

  function fillRevisit(box, ctx) {
    var items = [];
    A.TOPICS.forEach(function (t) { (S.revisitList(t.id) || []).forEach(function (it) { it.tid = t.id; items.push(it); }); });
    if (!items.length) {
      box.innerHTML = U.empty({ icon: 'check', title: 'Nothing to revisit yet', text: 'Questions you needed several tries, hints or the solution for will appear here, along with guide sections you flag. That is normal and useful: revisiting them is how they stick.' });
      return Promise.resolve();
    }
    items = items.slice(0, 6);
    var tids = {}; items.forEach(function (it) { tids[it.tid] = 1; });
    return Promise.all(Object.keys(tids).map(function (tid) { return A.data.practiceQuestions(tid).catch(function () { return []; }); })).then(function () {
      if (!ctx.alive()) return;
      box.innerHTML = '<ul class="rev-list">' + items.map(function (it, i) {
        var t = A.topic(it.tid);
        if (it.type === 'question') {
          return '<li class="rev-item" data-topic="' + it.tid + '" data-i="' + i + '"><span class="rev-glyph">' + U.glyph(it.tid) + '</span>' +
            '<span class="rev-text"><span class="rev-kind">' + esc(t.name) + ' · Practice</span><span class="rev-title" data-qid="' + esc(it.qid) + '">' + esc(qLabel(it.qid)) + '</span>' +
            '<span class="rev-reasons">' + reasonChips(it) + '</span></span>' +
            '<span class="rev-actions">' + U.btn('Retry question', { small: true, href: A.href.practice(it.tid, it.qid) }) + '</span></li>';
        }
        var l = A.data.lesson(it.lessonId);
        return '<li class="rev-item" data-topic="' + it.tid + '"><span class="rev-glyph">' + U.glyph(it.tid) + '</span>' +
          '<span class="rev-text"><span class="rev-kind">' + esc(t.name) + ' · Flagged section</span><span class="rev-title" data-lesson="' + esc(it.lessonId) + '" data-sec="' + esc(it.secId) + '">' + esc(l ? 'A section of ' + l.title : 'Study-guide section') + '</span>' +
          '<span class="rev-reasons">' + (l ? '<span class="chip">' + esc(l.title) + '</span>' : '') + '</span></span>' +
          '<span class="rev-actions">' + U.btn('Open section', { small: true, cls: 'rev-peek', attrs: ' data-lesson="' + esc(it.lessonId) + '" data-sec="' + esc(it.secId) + '"' }) + '</span></li>';
      }).join('') + '</ul>';
      // fill titles
      $$('.rev-title[data-qid]', box).forEach(function (el) {
        var qid = el.getAttribute('data-qid'), tid = qid.replace(/-(q|b)\d+$/, '');
        A.data.practiceQuestions(tid).then(function (list) {
          var q = list.filter(function (x) { return x.qid === qid; })[0];
          if (q && ctx.alive()) { el.innerHTML = (q.bonus ? 'Bonus ' : 'Question ') + esc(q.num.replace('B', '')) + ': ' + q.titleHTML; A.renderContent(el, null); }
        }).catch(function () { /* keep the readable "Question n" label */ });
      });
      $$('.rev-title[data-sec]', box).forEach(function (el) {
        A.data.guideSections(el.getAttribute('data-lesson')).then(function (secs) {
          var s = secs.filter(function (x) { return x.id === el.getAttribute('data-sec'); })[0];
          if (s && ctx.alive()) { el.innerHTML = s.titleHTML; A.renderContent(el, null); }
        }).catch(function () { /* keep the "A section of <lesson>" label */ });
      });
      $$('.rev-peek', box).forEach(function (b) { b.onclick = function () { A.peek.open({ lessonId: b.getAttribute('data-lesson'), secId: b.getAttribute('data-sec') }); }; });
    });
  }
  function qLabel(qid) {
    var m = /-(q|b)(\d+)$/.exec(qid || '');
    return m ? (m[1] === 'b' ? 'Bonus question ' : 'Question ') + m[2] : 'Practice question';
  }
  /* reasons come from the store's struggle rule (EEStore.revisitList / struggleReasons), like Review and the cards */
  function reasonChips(it) {
    var rs = (it.reasons || []).filter(function (r) { return typeof r === 'string'; });
    if (!rs.length) rs = S.reasons(store.state.progress.practice[it.qid]);
    return rs.map(function (r) { return '<span class="chip warn">' + esc(r) + '</span>'; }).join('');
  }

  A.registerView('home', { render: render });
})(window);
