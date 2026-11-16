/* EE 211 — Watch mode: player slot (persistent dock), under-player controls, chapters from the guide, lesson
 * switcher, transcript (search, matches only, follow video, corrected words, + note) and lesson notes. */
(function (global) {
  'use strict';
  var A = global.EEApp, U = A.ui, S = A.store, store = global.EEStore;
  var esc = U.esc, icon = U.icon, $ = U.$, $$ = U.$$;
  var DESK = '(min-width: 1024px)';
  var RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

  function D() { return global.EEDock; }
  function prefs() { return store.state.prefs || (store.state.prefs = {}); }

  function pickLesson(ctx) {
    var lid = ctx.params[0], l = lid && A.data.lesson(lid);
    if (l && l.topic === ctx.tid) return l;
    var cur = D().current().lessonId, cl = cur && A.data.lesson(cur);
    if (cl && cl.topic === ctx.tid && !D().current().closed) return cl;
    if (ctx.sub && ctx.sub !== 'all') { var ls = A.data.topicLessons(ctx.tid, ctx.sub); var last = A.data.lastLessonOf(ctx.tid); if (last && last.sub === ctx.sub) return last; if (ls[0]) return ls[0]; }
    return A.data.lastLessonOf(ctx.tid);
  }

  function render(ctx) {
    var l = pickLesson(ctx);
    if (!l) { ctx.el.innerHTML = '<div class="page">' + U.empty({ title: 'No lessons in this topic yet' }) + '</div>'; return; }
    var tid = ctx.tid;
    var idx = A.data.lessonIndex(l);
    var q = ctx.query;
    var startT = q.t != null && !isNaN(parseFloat(q.t)) ? parseFloat(q.t) : null;
    var autoplay = q.play === '1';
    ctx.setTitle(l.title);
    // canonical URL contains the lesson id (without one-shot t/play)
    var keep = {}; Object.keys(q).forEach(function (k) { if (k !== 't' && k !== 'play') keep[k] = q[k]; });
    ctx.setPath('#/t/' + tid + '/watch/' + l.id + A.qs(keep));

    var p = S.lp(l.id);
    var segLesson = l.scope === 'segment';
    ctx.el.innerHTML =
      '<div class="watch" data-lesson="' + l.id + '">' +
      ' <div class="w-left">' +
      '  <div class="w-stage">' +
      '   <div class="w-slot-wrap"><div class="player-slot" id="wSlot"><div class="slot-ph"><div class="slot-spin"></div><span>Loading the video…</span></div></div></div>' +
      '   <div class="w-under">' +
      '    <div class="w-titlebar"><div class="w-titles"><p class="w-kicker"><span>Lesson ' + idx.n + ' of ' + idx.of + '</span><span class="dot-sep">·</span><span class="mono">' + U.fmt(l.durationSec) + '</span>' +
      (l.sub ? '<span class="dot-sep">·</span><span>' + esc(A.data.subTitle(tid, l.sub)) + '</span>' : '') +
      (segLesson ? '<span class="chip warn" title="' + esc(l.segmentNote || '') + '">Part of a longer video</span>' : '') + '</p>' +
      '     <h1 class="w-h1">' + esc(l.title) + '</h1></div><div class="w-done"></div></div>' +
      '    <div class="w-ctrls" role="group" aria-label="Video controls">' +
      '     <div class="w-ctrl-group">' + U.btn('', { icon: 'back', cls: 'w-back icon-only', aria: 'Back 10 seconds (j)', title: 'Back 10 s (j)' }) +
      U.btn('Play', { icon: 'play', cls: 'w-play', title: 'Play or pause (k)' }) +
      U.btn('', { icon: 'fwd', cls: 'w-fwd icon-only', aria: 'Forward 10 seconds (l)', title: 'Forward 10 s (l)' }) +
      '      <span class="w-time mono" aria-live="off">' + U.fmt(startT != null ? startT : (p.pos || 0)) + ' / ' + U.fmt(l.durationSec) + '</span></div>' +
      '     <label class="w-rate"><span class="sr-only">Playback speed</span><select class="w-rate-sel" aria-label="Playback speed">' + RATES.map(function (r) { return '<option value="' + r + '">' + r + '×</option>'; }).join('') + '</select></label>' +
      U.btn('Note at 0:00', { icon: 'plus', kind: 'primary', cls: 'w-note', title: 'Add a note at the current time (n)' }) +
      '     <span class="w-spacer"></span>' +
      '     <span class="chip w-watched" title="Share of the relevant video you have played">0% watched</span>' +
      U.btn('YouTube', { href: A.data.ytUrl(l), external: true, cls: 'w-yt ghost', small: true, title: 'Open on YouTube at the current time' }) +
      '    </div>' +
      '   </div>' +
      '  </div>' +
      '  <div class="w-left-scroll">' +
      '   <section class="w-pane" data-pane="chapters" aria-label="Chapters"></section>' +
      '   <section class="w-pane" data-pane="lessons" aria-label="Lessons in this topic"></section>' +
      '  </div>' +
      ' </div>' +
      ' <div class="w-right">' +
      '  <div class="w-tabs seg" role="group" aria-label="Side panel">' +
      ['transcript', 'chapters', 'notes', 'lessons'].map(function (k) {
        var lab = { transcript: 'Transcript', chapters: 'Chapters', notes: 'Notes', lessons: 'Lessons' }[k];
        var ic = { transcript: 'transcript', chapters: 'list', notes: 'notes', lessons: 'lessons' }[k];
        return '<button type="button" class="seg-btn w-tab" data-pane="' + k + '">' + icon(ic) + '<span>' + lab + '</span><span class="w-tab-count" hidden></span></button>';
      }).join('') + '</div>' +
      '  <section class="w-pane" data-pane="transcript" aria-label="Transcript"></section>' +
      '  <section class="w-pane" data-pane="notes" aria-label="Notes for this lesson"></section>' +
      ' </div>' +
      '</div>';

    var root = $('.watch', ctx.el);
    var slot = $('#wSlot', root);
    var dock = D();
    var cur = dock.current();
    var resumed = null;
    if (cur.lessonId !== l.id && startT == null) {
      var pos = p.pos || 0;
      if (pos > 5 && pos < l.durationSec - 10) resumed = pos;
    }
    dock.attach(slot);
    ctx.onCleanup(function () { dock.detach(); });
    dock.load(l.id, { t: startT != null ? startT : undefined, play: autoplay });
    if (resumed != null) A.toast('Resuming at ' + U.fmt(resumed), { action: 'Start from 0:00', onAction: function () { dock.seek(0, false); } });
    var slotRO = global.ResizeObserver ? new ResizeObserver(function () { root.style.setProperty('--slot-h', slot.offsetHeight + 'px'); }) : null;
    if (slotRO) { slotRO.observe(slot); ctx.onCleanup(function () { slotRO.disconnect(); }); }
    setTimeout(function () { var ph = $('.slot-ph', slot); if (ph) ph.innerHTML = '<span>If the video does not appear, check your connection or <a href="' + A.data.ytUrl(l) + '" target="_blank" rel="noopener">open it on YouTube</a>.</span>'; }, 9000);

    /* ---- done toggle ---- */
    var done = U.checkToggle({ off: 'Mark lesson complete', on: 'Lesson complete', value: !!p.done, cls: 'w-done-btn',
      onChange: function (v) {
        S.setDone(l.id, v);
        A.toast(v ? 'Lesson marked complete' : 'Lesson marked as not complete');
        renderLessons();
      } });
    $('.w-done', root).appendChild(done);

    /* ---- controls ---- */
    var playB = $('.w-play', root), timeEl = $('.w-time', root), noteB = $('.w-note', root), watchedEl = $('.w-watched', root), ytA = $('.w-yt', root);
    $('.w-back', root).onclick = function () { dock.nudge(-10); };
    $('.w-fwd', root).onclick = function () { dock.nudge(10); };
    playB.onclick = function () { dock.toggle(); };
    var rateSel = $('.w-rate-sel', root);
    rateSel.value = String(parseFloat(prefs().rate) || 1);
    rateSel.onchange = function () { dock.setRate(parseFloat(rateSel.value)); A.toast('Playback speed ' + rateSel.value + '×'); };
    noteB.onclick = function () { showPane('notes', true); notesApi.focusNew(dock.current().t); };
    function setPlay(playing) {
      playB.innerHTML = icon(playing ? 'pause' : 'play') + '<span>' + (playing ? 'Pause' : 'Play') + '</span>';
    }
    setPlay(dock.current().playing);
    ctx.onCleanup(dock.onState(function (s, lid) { if (lid === l.id) setPlay(s === 1 || s === 3); }));
    function updWatched() { watchedEl.textContent = U.pct(A.progress.lessonWatched(l)) + '% watched'; }
    updWatched();

    var tickN = 0;
    ctx.onCleanup(dock.onTick(function (t, s, lid) {
      if (lid !== l.id) return;
      var ph = $('.slot-ph', slot); if (ph) ph.remove();
      timeEl.textContent = U.fmt(t) + ' / ' + U.fmt(l.durationSec);
      $('span', noteB).textContent = 'Note at ' + U.fmt(t);
      if (txApi) txApi.highlight(t, s === 1);
      if (chApi) chApi.tick(t);
      if (notesApi) notesApi.tick();
      if (++tickN % 10 === 0) { ytA.href = A.data.ytUrl(l, t); if (s === 1) { updWatched(); if (chApi) chApi.refreshBars(); } }
    }));
    ctx.onCleanup(dock.onLesson(function (lid) {
      // another lesson started playing in the dock (e.g. a timestamp link): follow it here
      if (lid !== l.id && ctx.alive()) { var nl = A.data.lesson(lid); if (nl) A.go(A.href.watch(lid)); }
    }));

    /* ---- panes ---- */
    var paneHooks = [];
    var mq = global.matchMedia ? global.matchMedia(DESK) : { matches: true };
    var deskPane = prefs().watchPane === 'notes' ? 'notes' : 'transcript';
    var mobPane = ['transcript', 'chapters', 'notes', 'lessons'].indexOf(prefs().watchPaneMobile) >= 0 ? prefs().watchPaneMobile : 'transcript';
    function applyPanes() {
      var desk = mq.matches;
      var active = desk ? deskPane : mobPane;
      $$('.w-tab', root).forEach(function (b) {
        var k = b.getAttribute('data-pane');
        b.hidden = desk && (k === 'chapters' || k === 'lessons');
        b.setAttribute('aria-pressed', String(k === active));
      });
      $$('.w-pane', root).forEach(function (pn) {
        var k = pn.getAttribute('data-pane');
        pn.classList.toggle('on', desk ? (k === 'chapters' || k === 'lessons' || k === active) : k === active);
      });
      root.setAttribute('data-pane', active);
      paneHooks.forEach(function (f) { f(active); });
    }
    function showPane(k, scrollTo) {
      if (mq.matches) { if (k === 'transcript' || k === 'notes') { deskPane = k; prefs().watchPane = k; } }
      else { mobPane = k; prefs().watchPaneMobile = k; }
      store.save(1000);
      applyPanes();
      if (scrollTo && !mq.matches) {
        var tabs = $('.w-tabs', root), r = tabs.getBoundingClientRect();
        var hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 56;
        if (r.top > global.innerHeight * 0.7 || r.top < 0) global.scrollTo({ top: global.scrollY + r.top - hdr - slot.offsetHeight, behavior: U.reducedMotion() ? 'auto' : 'smooth' });
      }
    }
    $('.w-tabs', root).addEventListener('click', function (e) { var b = e.target.closest('.w-tab'); if (b) showPane(b.getAttribute('data-pane'), true); });
    var mqh = function () { applyPanes(); };
    if (mq.addEventListener) { mq.addEventListener('change', mqh); ctx.onCleanup(function () { mq.removeEventListener('change', mqh); }); }
    applyPanes();

    /* ---- notes pane ---- */
    var notesPane = $('.w-pane[data-pane="notes"]', root);
    notesPane.innerHTML = '<div class="w-pane-head"><h2 class="w-pane-title">Notes for this lesson</h2><span class="w-save"></span></div><div class="w-notes-body"></div>' +
      '<div class="w-pane-foot">' + U.btn('Export this lesson (.md)', { small: true, kind: 'ghost', icon: 'download', cls: 'w-exp' }) + U.btn('All notes for this topic', { small: true, kind: 'ghost', href: A.href.notes(tid) }) + '</div>';
    $('.w-save', notesPane).appendChild(U.saveStatus());
    var notesApi = A.notesUI.lesson($('.w-notes-body', notesPane), l.id, {
      composer: true, free: true, getTime: function () { var c = dock.current(); return c.lessonId === l.id ? c.t : null; },
      onChange: updNoteCount
    });
    ctx.onCleanup(function () { notesApi.destroy(); });
    function regrowNotes() {
      if (!notesPane.getClientRects().length) return;
      $$('textarea.nu-text, textarea.nu-free-ta', notesPane).forEach(function (ta) { if (ta.getClientRects().length && document.activeElement !== ta) A.notesUI.autoGrow(ta); });
    }
    var notesShown = false;
    var notesRO = global.ResizeObserver ? new ResizeObserver(function () {
      var vis = notesPane.getClientRects().length > 0 && notesPane.offsetWidth > 0;
      if (vis && !notesShown) regrowNotes();
      notesShown = vis;
    }) : null;
    if (notesRO) { notesRO.observe(notesPane); ctx.onCleanup(function () { notesRO.disconnect(); }); }
    paneHooks.push(function () { setTimeout(regrowNotes, 0); });
    $('.w-exp', notesPane).onclick = function () {
      var md = '# ' + l.title + '\n\nVideo: [' + l.ytTitle + '](' + A.data.ytUrl(l) + ')\n\n';
      S.sortedNotes(l.id).forEach(function (it) { md += '- ' + (it.t != null ? '[' + U.fmt(it.t) + '](' + A.data.ytUrl(l, it.t) + ') ' : '') + (it.text || '').replace(/\n/g, '\n  ') + '\n'; });
      var n = store.state.notes.lessons[l.id]; if (n && n.free) md += '\n**Lesson notes**\n\n' + n.free + '\n';
      U.download('EE211-notes-' + l.id + '-' + U.today() + '.md', md);
    };
    function updNoteCount() {
      var c = notesApi ? notesApi.count() : 0, b = $('.w-tab[data-pane="notes"] .w-tab-count', root);
      b.hidden = !c; b.textContent = c;
    }
    updNoteCount();

    /* ---- transcript ---- */
    var txApi = null;
    buildTranscript(l, $('.w-pane[data-pane="transcript"]', root), ctx, {
      onAdd: function (t) { showPane('notes', true); notesApi.focusNew(t); },
      isDesk: function () { return mq.matches; },
      stickyBottom: function () { var tabs = $('.w-tabs', root); return tabs ? tabs.getBoundingClientRect().bottom : 0; }
    }).then(function (api) { txApi = api; if (api) api.highlight(dock.current().t, false, true); });

    /* ---- chapters ---- */
    var chApi = null;
    chApi = buildChapters(l, $('.w-pane[data-pane="chapters"]', root), ctx);

    /* ---- lessons ---- */
    function renderLessons() { buildLessons(l, $('.w-pane[data-pane="lessons"]', root), ctx); }
    renderLessons();

    /* ---- shortcuts ---- */
    ctx.shortcuts.n = function () { showPane('notes', true); notesApi.focusNew(dock.current().t); };
    ctx.shortcuts['/'] = function () { showPane('transcript', true); var s = $('.tx-search', root); if (s) { s.focus(); s.select(); } };
    ctx.manageScroll = false;
  }

  function update(ctx, prev) {
    var lid = ctx.params[0];
    var cur = prev.params[0];
    if (lid && lid === cur) {
      if (ctx.query.t != null) { D().load(lid, { t: parseFloat(ctx.query.t), play: ctx.query.play === '1' }); ctx.setQuery({ t: null, play: null }); }
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ chapters */
  function buildChapters(l, pane, ctx) {
    var api = { tick: function () {}, refreshBars: function () {} };
    var segs = (l.segments || []).filter(function (s) { return s.end > s.start; });
    var partial = segs.length && !(segs.length === 1 && segs[0].start <= 1 && segs[0].end >= l.durationSec - 15);
    pane.innerHTML = '<div class="w-pane-head"><h2 class="w-pane-title">Chapters</h2><span class="muted small">Sections of the study guide, by video time</span></div>' +
      '<div class="tl" role="slider" tabindex="0" aria-label="Video position" aria-valuemin="0" aria-valuemax="' + Math.round(l.durationSec) + '" aria-valuenow="0" aria-valuetext="0:00">' +
      '<div class="tl-track">' + (partial ? segs.map(function (s) {
        return '<span class="tl-seg" style="left:' + (s.start / l.durationSec * 100).toFixed(3) + '%;width:' + ((s.end - s.start) / l.durationSec * 100).toFixed(3) + '%"></span>';
      }).join('') : '') + '<span class="tl-watched"></span><span class="tl-pos"></span></div>' +
      '<div class="tl-scale mono"><span>0:00</span><span>' + U.fmt(l.durationSec) + '</span></div></div>' +
      (partial ? '<p class="tl-legend small"><span class="tl-key seg"></span>Relevant to this topic' + (l.scope === 'segment' ? ': ' + esc((l.segmentNote || '').replace(/^Relevant parts?:\s*/, '')) + '. The rest of this video is outlined in the guide.' : '. The other parts are outlined in the guide.') + ' <span class="tl-key watched"></span>Watched</p>' : '<p class="tl-legend small"><span class="tl-key watched"></span>Watched</p>') +
      '<ol class="chapters"><li class="muted small">Loading chapters…</li></ol>';
    var tl = $('.tl', pane), pos = $('.tl-pos', pane), watched = $('.tl-watched', pane), list = $('.chapters', pane);
    var chapters = [];
    function seekFrac(f) { D().load(l.id, { t: Math.max(0, Math.min(1, f)) * l.durationSec, play: true }); }
    tl.addEventListener('click', function (e) { var r = $('.tl-track', tl).getBoundingClientRect(); seekFrac((e.clientX - r.left) / r.width); });
    tl.addEventListener('keydown', function (e) {
      var d = { ArrowLeft: -10, ArrowDown: -10, ArrowRight: 10, ArrowUp: 10, PageDown: -60, PageUp: 60 }[e.key];
      if (d) { e.preventDefault(); D().nudge(d); }
      else if (e.key === 'Home') { e.preventDefault(); D().seek(0); }
      else if (e.key === 'End') { e.preventDefault(); D().seek(Math.max(0, l.durationSec - 5)); }
    });
    function drawWatched() {
      // watched coverage in 30-s windows (works with any store encoding through watchedFraction)
      var parts = [], win = 30, n = Math.ceil(l.durationSec / win), run = null;
      for (var i = 0; i < n; i++) {
        var f = S.watchedFraction(l.id, l.durationSec, [{ start: i * win, end: Math.min(l.durationSec, (i + 1) * win) }]);
        if (f > 0.5) { if (!run) run = { s: i * win, e: 0 }; run.e = Math.min(l.durationSec, (i + 1) * win); }
        else if (run) { parts.push(run); run = null; }
      }
      if (run) parts.push(run);
      watched.innerHTML = parts.map(function (r) { return '<span style="left:' + (r.s / l.durationSec * 100).toFixed(3) + '%;width:' + ((r.e - r.s) / l.durationSec * 100).toFixed(3) + '%"></span>'; }).join('');
    }
    drawWatched();
    var curIdx = -1;
    api.tick = function (t) {
      pos.style.left = (t / l.durationSec * 100).toFixed(3) + '%';
      tl.setAttribute('aria-valuenow', String(Math.round(t))); tl.setAttribute('aria-valuetext', U.fmt(t));
      var i = -1;
      chapters.forEach(function (c, k) { if (t >= c.t0 && t < c.t1) i = k; });
      if (i !== curIdx) {
        if (chapters[curIdx]) chapters[curIdx].li.classList.remove('current');
        curIdx = i;
        if (chapters[i]) { chapters[i].li.classList.add('current'); chapters[i].li.setAttribute('aria-current', 'true'); }
        $$('.chap[aria-current]', list).forEach(function (x) { if (!chapters[i] || x !== chapters[i].li) x.removeAttribute('aria-current'); });
      }
    };
    api.refreshBars = function () {
      drawWatched();
      chapters.forEach(function (c) { var f = S.watchedFraction(l.id, l.durationSec, [{ start: c.t0, end: c.t1 }]); c.bar.style.width = U.pct(f) + '%'; c.li.classList.toggle('seen', f > 0.9); });
    };
    A.data.guideSections(l.id).then(function (secs) {
      if (!ctx.alive()) return;
      var ch = secs.filter(function (s) { return s.t0 != null; }).sort(function (a, b) { return a.t0 - b.t0; });
      if (!ch.length) { list.innerHTML = '<li class="muted small">This lesson’s guide has no timed sections.</li>'; return; }
      list.innerHTML = '';
      ch.forEach(function (s) {
        var f = S.watchedFraction(l.id, l.durationSec, [{ start: s.t0, end: s.t1 }]);
        var other = /other content|outside this topic/i.test(s.title) || s.id.slice(-6) === '-other';
        var li = U.h('<li class="chap' + (f > 0.9 ? ' seen' : '') + (other ? ' other' : '') + '">' +
          '<button type="button" class="chap-time mono" title="Play from ' + U.fmt(s.t0) + '">' + U.fmt(s.t0) + '<span class="chap-to">–' + U.fmt(s.t1) + '</span></button>' +
          '<button type="button" class="chap-title">' + s.titleHTML + '</button>' +
          '<a class="chap-go" href="' + A.href.understand(l.id, s.id) + '" title="Read this section in Understand">Read' + icon('arrow') + '</a>' +
          '<span class="chap-bar" aria-hidden="true"><span style="width:' + U.pct(f) + '%"></span></span></li>');
        var go = function () { D().load(l.id, { t: s.t0, play: true }); };
        $('.chap-time', li).onclick = go; $('.chap-title', li).onclick = go;
        list.appendChild(li);
        chapters.push({ li: li, t0: s.t0, t1: s.t1, bar: $('.chap-bar span', li) });
      });
      A.renderContent(list, l);
      curIdx = -1;
      api.tick(D().current().t);
    }).catch(function (e) { list.innerHTML = '<li class="diagram-error">Chapters unavailable (' + esc(e.message) + ').</li>'; });
    return api;
  }

  /* ------------------------------------------------------------------ lesson switcher */
  function buildLessons(l, pane, ctx) {
    var t = A.topic(l.topic), subs = t && t.subs;
    var sub = subs && (ctx.sub === 'rc' || ctx.sub === 'rl') ? ctx.sub : 'all';
    var groups = A.data.lessonGroups(l.topic, sub);
    var html = '<div class="w-pane-head"><h2 class="w-pane-title">Lessons in this topic</h2></div>';
    groups.forEach(function (g) {
      if (g.sub) html += '<h3 class="lgroup-title">' + esc(g.sub.title) + '</h3>';
      html += '<ul class="lcards">' + g.lessons.map(function (x) {
        var p = store.state.progress.lessons[x.id] || {};
        var w = A.progress.lessonWatched(x);
        var i = A.data.lessonIndex(x);
        return '<li><a class="lcard' + (x.id === l.id ? ' current' : '') + (p.done ? ' done' : '') + '" href="' + A.href.watch(x.id) + '"' + (x.id === l.id ? ' aria-current="page"' : '') + '>' +
          '<span class="lcard-num">' + (p.done ? icon('check') : i.n) + '</span>' +
          '<span class="lcard-body"><span class="lcard-title">' + esc(x.title) + '</span>' +
          '<span class="lcard-meta"><span class="mono">' + U.fmt(x.durationSec) + '</span><span class="dot-sep">·</span><span>' + U.pct(w) + '% watched</span>' +
          (p.done ? '<span class="dot-sep">·</span><span class="ok-text">Complete</span>' : '') +
          (x.id === l.id ? '<span class="dot-sep">·</span><span class="now-text">Now playing</span>' : '') + '</span>' +
          (x.scope === 'segment' ? '<span class="lcard-seg">' + esc(x.segmentNote || 'Part of a longer video') + '</span>' : '') +
          '<span class="lcard-bar" aria-hidden="true"><span style="width:' + U.pct(w) + '%"></span></span></span></a></li>';
      }).join('') + '</ul>';
    });
    var rel = A.data.related(l.topic);
    if (rel.length) {
      html += '<h3 class="lgroup-title">Related parts of other lessons</h3><ul class="rel-list">' + rel.map(function (r) {
        if (r.url) return '<li><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.label) + icon('external') + '</a></li>';
        var rl = A.data.lesson(r.lesson); if (!rl) return '';
        if (r.sec) return '<li><a class="xref" data-lesson="' + rl.id + '" data-sec="' + esc(r.sec) + '" href="' + A.href.understand(rl.id, r.sec) + '">' + esc(r.label) + '</a></li>';
        return '<li><a href="' + A.href.watch(rl.id, r.t) + '">' + esc(r.label) + '</a></li>';
      }).join('') + '</ul>';
    }
    pane.innerHTML = html;
    if (subs) {
      /* lc: All · Capacitors & RC · Inductors & RL (same preference and ?sub= as Understand, Review and My Notes) */
      var seg = U.seg({ label: 'Show lessons from', small: true, cls: 'sub-seg w-sub-seg', value: sub,
        options: [{ value: 'all', label: 'All' }].concat(subs.map(function (x) { return { value: x.id, label: x.title }; })),
        onChange: function (v) {
          prefs().lcSub = v; store.save(600); ctx.sub = v; ctx.setQuery({ sub: v === 'all' ? null : v });
          buildLessons(l, pane, ctx);
          var nb = $('.w-sub-seg [aria-pressed="true"]', pane); if (nb) nb.focus();
        } });
      var head = $('.w-pane-head', pane); head.parentNode.insertBefore(seg, head.nextSibling);
    }
  }

  /* ------------------------------------------------------------------ transcript (ported from v1) */
  function buildTranscript(l, pane, ctx, o) {
    pane.innerHTML = '<p class="muted small pad">Loading the transcript…</p>';
    return A.data.transcript(l.id).then(function (data) {
      if (!ctx.alive()) return null;
      var chunks = data.chunks || [];
      var follow0 = store.state.prefs.follow !== false;
      pane.innerHTML =
        '<div class="tx-tools">' +
        ' <div class="tx-search-wrap">' + icon('search') + '<input type="search" class="tx-search" data-search placeholder="Search the transcript" aria-label="Search the transcript (press / )"></div>' +
        ' <span class="tx-count small mono" aria-live="polite"></span>' +
        U.btn('', { icon: 'up', small: true, kind: 'ghost', cls: 'tx-prev icon-only', aria: 'Previous match (Shift+Enter)' }) +
        U.btn('', { icon: 'down', small: true, kind: 'ghost', cls: 'tx-next icon-only', aria: 'Next match (Enter)' }) +
        ' <label class="tgl small"><input type="checkbox" class="tx-only"><span>Matches only</span></label>' +
        ' <label class="tgl small"><input type="checkbox" class="tx-follow"' + (follow0 ? ' checked' : '') + '><span>Follow video</span></label>' +
        '</div>' +
        '<details class="tx-src"><summary>About this transcript</summary><p>The instructor’s words from YouTube’s automatic captions (speech recognition), grouped into short blocks. It is not a human-checked transcript, so expect occasional mis-heard words. <span class="fix">Dotted-underlined</span> words were corrected for technical terms; hover over them or tab to them to see the original caption. Click a block’s text or time to play from there.</p></details>' +
        '<div class="tx-list" role="list"></div>';
      var list = $('.tx-list', pane);
      var fr = document.createDocumentFragment();
      chunks.forEach(function (c, i) {
        var row = document.createElement('div');
        row.className = 'tx-line'; row.setAttribute('data-i', i); row.setAttribute('role', 'listitem');
        var text = esc(c.x).replace(/⟦([^|⟧]*)\|([^⟧]*)⟧/g, function (_, nw, orig) { return '<span class="fix" tabindex="0" data-orig="Auto-caption heard: “' + orig + '”" aria-description="Corrected word. Auto-caption heard: ' + orig + '">' + nw + '</span>'; });
        row.innerHTML = '<button type="button" class="tx-time mono" data-t="' + c.t + '" aria-label="Play from ' + U.fmt(c.t) + '">' + U.fmt(c.t) + '</button><span class="tx-text">' + text + '</span>' +
          '<button type="button" class="tx-add" data-t="' + c.t + '" aria-label="Add a note at ' + U.fmt(c.t) + '" title="Add a note at this time">' + icon('plus') + '<span>note</span></button>';
        fr.appendChild(row);
      });
      list.appendChild(fr);
      var rows = $$('.tx-line', list);
      var texts = rows.map(function (r) { return $('.tx-text', r).innerHTML; });
      list.addEventListener('click', function (e) {
        var b = e.target.closest('.tx-time');
        if (b) { D().load(l.id, { t: parseFloat(b.getAttribute('data-t')), play: true }); return; }
        var a = e.target.closest('.tx-add');
        if (a) { o.onAdd(parseFloat(a.getAttribute('data-t'))); return; }
        var tx = e.target.closest('.tx-text');
        if (tx && !(global.getSelection && String(global.getSelection()).length > 2)) {
          var r = tx.closest('.tx-line'); D().load(l.id, { t: chunks[+r.getAttribute('data-i')].t, play: true });
        }
      });
      var follow = $('.tx-follow', pane);
      follow.addEventListener('change', function () { store.state.prefs.follow = follow.checked; store.save(); if (follow.checked) { userScrollUntil = 0; needScroll = true; } });
      var userScrollUntil = 0;
      ['wheel', 'touchmove'].forEach(function (ev) { pane.addEventListener(ev, function () { userScrollUntil = Date.now() + 5000; }, { passive: true }); });
      var curIdx = -1, needScroll = false;
      function idxAt(tm) { var lo = 0, hi = chunks.length - 1, ans = 0; while (lo <= hi) { var mid = (lo + hi) >> 1; if (chunks[mid].t <= tm + 0.3) { ans = mid; lo = mid + 1; } else hi = mid - 1; } return ans; }
      function scrollToRow(row, force) {
        if (!row || row.offsetParent === null) return;
        var smooth = !document.hidden && !U.reducedMotion();
        if (o.isDesk()) {
          var top = row.offsetTop - pane.clientHeight / 2 + row.offsetHeight / 2;
          pane.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
        } else {
          var r = row.getBoundingClientRect(), offTop = o.stickyBottom() + 8;
          if (force || r.top < offTop || r.bottom > global.innerHeight - 90) global.scrollTo({ top: global.scrollY + r.top - offTop - 40, behavior: smooth ? 'smooth' : 'auto' });
        }
      }
      // search
      var matches = [], mPos = -1;
      var input = $('.tx-search', pane), only = $('.tx-only', pane), count = $('.tx-count', pane);
      function runSearch() {
        var q = input.value.trim();
        matches = []; mPos = -1;
        var re = q ? new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi') : null;
        rows.forEach(function (r, i) {
          var span = $('.tx-text', r);
          span.innerHTML = texts[i];
          if (!re) { r.classList.remove('dim'); return; }
          re.lastIndex = 0;
          var has = re.test(span.textContent);
          if (has) { markText(span, re); matches.push(i); }
          r.classList.toggle('dim', only.checked && !has);
        });
        list.classList.toggle('filtered', !!re && only.checked);
        count.textContent = q ? (matches.length ? plural(matches.length) : 'No matches') : '';
      }
      function plural(n) { return n + (n === 1 ? ' match' : ' matches'); }
      function markText(node, re) {
        var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
        var nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function (tn) {
          var s = tn.nodeValue; re.lastIndex = 0;
          if (!re.test(s)) return;
          var span = document.createElement('span');
          span.innerHTML = esc(s).replace(new RegExp(re.source, 'gi'), '<mark>$1</mark>');
          tn.parentNode.replaceChild(span, tn);
        });
      }
      function go(d) {
        if (!matches.length) return;
        if (mPos < 0) mPos = d > 0 ? 0 : matches.length - 1;
        else mPos = (mPos + d + matches.length) % matches.length;
        $$('mark.active', list).forEach(function (m) { m.classList.remove('active'); });
        var row = rows[matches[mPos]];
        var mk = $('mark', row); if (mk) mk.classList.add('active');
        userScrollUntil = Date.now() + 8000;
        scrollToRow(row, true);
        count.textContent = (mPos + 1) + ' / ' + matches.length;
      }
      var stt;
      input.addEventListener('input', function () { clearTimeout(stt); stt = setTimeout(runSearch, 160); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); clearTimeout(stt); if (mPos < 0 && !matches.length) runSearch(); go(e.shiftKey ? -1 : 1); }
        if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; runSearch(); }
      });
      $('.tx-next', pane).onclick = function () { go(1); };
      $('.tx-prev', pane).onclick = function () { go(-1); };
      only.addEventListener('change', runSearch);
      return {
        highlight: function (tm, playing, initial) {
          if (!rows.length) return;
          var i = idxAt(tm);
          if (i !== curIdx) {
            if (rows[curIdx]) { rows[curIdx].classList.remove('current'); rows[curIdx].removeAttribute('aria-current'); }
            curIdx = i;
            rows[i].classList.add('current'); rows[i].setAttribute('aria-current', 'true');
            needScroll = true;
          }
          if (initial && o.isDesk()) { scrollToRow(rows[i]); return; }
          if (needScroll && follow.checked && playing && Date.now() > userScrollUntil && rows[i].offsetParent !== null) {
            needScroll = false;
            scrollToRow(rows[i]);
          }
        }
      };
    }).catch(function (e) {
      pane.innerHTML = '<p class="diagram-error pad">Transcript unavailable (' + esc(e.message) + ').</p>';
      return null;
    });
  }

  A.registerMode('watch', { render: render, update: update });
})(window);
