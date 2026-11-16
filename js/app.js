/* EE211 Study Site — main application (hash router + views). */
(function () {
  'use strict';

  var TOPICS = [
    { id: 'deltawye', short: 'Δ–Y Conversions', title: 'Delta–Wye Conversions', blurb: 'Convert between Δ (pi) and Y (T) resistor networks to simplify bridge circuits that series/parallel rules cannot reduce.' },
    { id: 'thevenin', short: 'Thévenin & Norton', title: 'Thévenin and Norton Equivalents', blurb: 'Replace any linear two-terminal network by one source and one resistor; analyse loads quickly.' },
    { id: 'srcxform', short: 'Source Transformations', title: 'Source Transformations', blurb: 'Swap a voltage source with series R for a current source with parallel R (and back).' },
    { id: 'millman', short: 'Millman', title: 'Millman’s Theorem', blurb: 'Collapse parallel branches of voltage sources with series resistors into one equivalent source.' },
    { id: 'lc', short: 'C, L, RC & RL', title: 'Capacitors, Inductors, and RC/RL Circuits', blurb: 'Energy-storage elements, continuity rules, and first-order transients with τ = RC and τ = L/R.',
      subs: [{ id: 'rc', title: 'Capacitors & RC circuits' }, { id: 'rl', title: 'Inductors & RL circuits' }] },
    { id: 'scope', short: 'Oscilloscope', title: 'Oscilloscope Measurements: Period, Frequency, Grid Divisions, and Amplitude', blurb: 'Read volts/div and time/div, measure period, frequency, peak, peak-to-peak and RMS.' }
  ];
  var RELATED = {}; // filled from data/related.json if present

  var lessons = [];
  var lessonById = {};
  var cache = { guide: {}, tx: {}, practice: {} };
  var main = document.getElementById('main');
  var store = window.EEStore;
  var R = window.EERender;
  var current = { view: null, lesson: null, cleanup: [] };

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function topicById(id) { return TOPICS.filter(function (t) { return t.id === id; })[0]; }
  function fmt(t) { return R.fmtTime(t); }
  function ytUrl(l, t) { return 'https://www.youtube.com/watch?v=' + l.ytId + (t ? '&t=' + Math.floor(t) + 's' : ''); }
  function lessonsOf(tid, sub) { return lessons.filter(function (l) { return l.topic === tid && (!sub || l.sub === sub); }).sort(function (a, b) { return (a.sub || '').localeCompare(b.sub || '') || a.order - b.order; }); }
  function topicLessons(tid) {
    var t = topicById(tid);
    if (t && t.subs) { var out = []; t.subs.forEach(function (s) { out = out.concat(lessonsOf(tid, s.id)); }); return out; }
    return lessonsOf(tid);
  }
  function toast(msg, actionLabel, action, ms) {
    var el = document.getElementById('toast');
    el.innerHTML = esc(msg);
    if (actionLabel) { var b = document.createElement('button'); b.textContent = actionLabel; b.onclick = function () { el.classList.remove('show'); action(); }; el.appendChild(b); }
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, ms || (actionLabel ? 7000 : 2600));
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function fetchText(url) { return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status + ' ' + url); return r.text(); }); }
  function fetchJSON(url) { return fetchText(url).then(JSON.parse); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function cleanup() { current.cleanup.forEach(function (f) { try { f(); } catch (e) {} }); current.cleanup = []; }
  function renderContent(root, lesson) {
    var errs = R.renderContent(root, { lessonId: lesson && lesson.id, duration: lesson && lesson.durationSec });
    if (errs.length && window.console) console.warn('Content problems:', errs);
    return errs;
  }
  function saveStatusEl() {
    var el = h('<span class="save-status" aria-live="polite"></span>');
    function upd() {
      if (!store.available) { el.textContent = 'Not saved — browser storage is unavailable (private window or blocked). Export your notes!'; el.classList.add('bad'); }
      else if (store.lastSaved) { el.textContent = 'Saved ✓ ' + store.lastSaved.toLocaleTimeString(); el.classList.remove('bad'); }
      else el.textContent = 'Autosaves as you type';
    }
    upd();
    store.onSave(upd);
    return el;
  }
  function progressBar(frac) { return '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(frac * 100) + '"><span style="width:' + Math.round(frac * 100) + '%"></span></div>'; }

  /* ---------- top nav ---------- */
  function renderTabs(activeTopic) {
    var nav = document.getElementById('topicTabs');
    nav.innerHTML = TOPICS.map(function (t) { return '<a href="#/topic/' + t.id + '"' + (t.id === activeTopic ? ' aria-current="page"' : '') + '>' + esc(t.short) + '</a>'; }).join('');
    var cur = nav.querySelector('[aria-current]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  document.getElementById('themeBtn').addEventListener('click', function () {
    var root = document.documentElement;
    var dark = root.getAttribute('data-theme') ? root.getAttribute('data-theme') === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    store.state.prefs.theme = next; store.save();
  });
  function updateTopbarVar() {
    var tb = document.querySelector('.topbar');
    if (tb) document.documentElement.style.setProperty('--topbar-h', tb.offsetHeight + 'px');
  }
  window.addEventListener('resize', updateTopbarVar);

  /* ---------- progress helpers ---------- */
  function lessonFrac(l) {
    var p = store.state.progress.lessons[l.id];
    if (!p) return 0;
    if (p.done) return 1;
    var n = l._secCount || l.secCount || 0;
    var k = Object.keys(p.secs || {}).filter(function (s) { return p.secs[s]; }).length;
    return n ? Math.min(1, k / n) * 0.95 : 0;
  }
  function topicStats(tid) {
    var ls = topicLessons(tid);
    var done = ls.filter(function (l) { var p = store.state.progress.lessons[l.id]; return p && p.done; }).length;
    var qs = Object.keys(store.state.progress.practice).filter(function (q) { return /-q\d+$/.test(q) && q.indexOf(tid + '-') === 0; });
    var solved = qs.filter(function (q) { return store.state.progress.practice[q].solved; }).length;
    var bs = Object.keys(store.state.progress.practice).filter(function (q) { return /-b\d+$/.test(q) && q.indexOf(tid + '-') === 0 && store.state.progress.practice[q].solved; }).length;
    return { lessons: ls.length, done: done, solved: solved, bonusSolved: bs };
  }

  /* ---------- views ---------- */
  function viewHome() {
    renderTabs(null);
    var last = store.state.prefs.lastLesson && lessonById[store.state.prefs.lastLesson];
    var html = '<h1>EE 211 — Video Study Guide</h1>' +
      '<p class="muted prose">Lecture videos by Eric Hernandez (CSULB), organised into six topics. Each lesson pairs the video with a follow-along transcript, a complete study guide, and your own timestamped notes. Each topic ends with four interactive practice scenarios.</p>';
    if (last) {
      var lp = store.lessonProgress(last.id);
      html += '<div class="card" style="margin:12px 0"><b>Continue where you left off:</b> <a href="#/lesson/' + last.id + '">' + esc(last.title) + '</a>' + (lp.pos > 5 ? ' <span class="muted">— at ' + fmt(lp.pos) + '</span>' : '') + '</div>';
    }
    html += '<div class="grid-cards">';
    TOPICS.forEach(function (t) {
      var st = topicStats(t.id);
      html += '<div class="card topic-card"><a class="cover" href="#/topic/' + t.id + '"><h2>' + esc(t.title) + '</h2></a><p class="small">' + esc(t.blurb) + '</p>' +
        '<div class="meta">' + st.lessons + ' lesson' + (st.lessons === 1 ? '' : 's') + ' · ' + st.done + ' complete · practice ' + st.solved + '/4 solved</div>' +
        progressBar(st.lessons ? st.done / st.lessons : 0) +
        '<div class="row" style="margin-top:10px"><a class="btn small primary" href="#/topic/' + t.id + '">Open topic</a><a class="btn small" href="#/practice/' + t.id + '">Practice</a></div></div>';
    });
    html += '</div>';
    html += '<div class="card prose" style="margin-top:16px"><h2 style="margin-top:0;font-size:1.1rem">How to study with this site</h2><ol>' +
      '<li>Pick a topic tab, then a lesson. The video sits on the left with the <b>Transcript</b> and <b>My notes</b> tabs; the <b>Study guide</b> is on the right (on tablets/phones use the Guide / Transcript / Notes tabs under the video).</li>' +
      '<li>Click any <span class="chip accent">▶ 12:34</span> timestamp in the guide or transcript to jump the video there.</li>' +
      '<li>Press <b>Add note</b> (or <kbd>n</kbd>) to attach a note to the current video time. Notes save automatically in this browser.</li>' +
      '<li>Mark guide sections “Reviewed” and the lesson “Complete” to track progress; then try the topic’s four practice scenarios.</li>' +
      '<li>Back up or export your notes from <a href="#/notes">Notes</a> — browser storage is local to this computer and browser.</li></ol></div>';
    main.innerHTML = html;
  }

  function viewTopic(tid, sub) {
    var t = topicById(tid);
    if (!t) return viewNotFound();
    renderTabs(tid);
    if (t.subs && !sub) sub = (store.state.prefs.sub && store.state.prefs.sub[tid]) || t.subs[0].id;
    if (t.subs) { store.state.prefs.sub = store.state.prefs.sub || {}; store.state.prefs.sub[tid] = sub; store.save(); }
    var ls = t.subs ? lessonsOf(tid, sub) : lessonsOf(tid);
    var st = topicStats(tid);
    var html = '<div class="crumbs"><a href="#/">Home</a> › Topic</div><h1>' + esc(t.title) + '</h1><p class="muted">' + esc(t.blurb) + '</p>';
    if (t.subs) {
      html += '<nav class="subtabs" aria-label="Subtopics">' + t.subs.map(function (s) { return '<a href="#/topic/' + tid + '/' + s.id + '"' + (s.id === sub ? ' aria-current="page"' : '') + '>' + esc(s.title) + '</a>'; }).join('') + '</nav>';
    }
    html += '<div class="two-col"><div><h2 style="font-size:1.1rem">Lessons' + (t.subs ? ' — ' + esc(t.subs.filter(function (s) { return s.id === sub; })[0].title) : '') + '</h2><div class="lesson-list">';
    ls.forEach(function (l, i) {
      var p = store.state.progress.lessons[l.id] || {};
      var frac = lessonFrac(l);
      html += '<div class="card lesson-item' + (p.done ? ' done' : '') + '"><div class="num">' + (p.done ? '✓' : i + 1) + '</div><div><h3><a href="#/lesson/' + l.id + '">' + esc(l.title) + '</a></h3>' +
        '<div class="small muted">Video: “' + esc(l.ytTitle) + '” · ' + fmt(l.durationSec) + (l.recorded ? ' · recorded ' + esc(l.recorded) : '') + '</div>' +
        (l.scope === 'segment' ? '<div class="small"><span class="chip warn">Topic covers part of this video</span> ' + esc(l.segmentNote || '') + '</div>' : '') +
        (p.pos > 5 ? '<div class="small muted">Last position ' + fmt(p.pos) + '</div>' : '') +
        '<div style="margin-top:6px">' + progressBar(frac) + '</div></div>' +
        '<a class="btn small primary" href="#/lesson/' + l.id + '">Study</a></div>';
    });
    html += '</div>';
    var rel = (RELATED[tid] || []).filter(function (r) { return !t.subs || !r.sub || r.sub === sub; });
    if (rel.length) {
      html += '<h2 style="font-size:1.05rem;margin-top:18px">Related segments in other lessons</h2><ul>' + rel.map(function (r) {
        if (r.url) return '<li><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.label) + ' ↗</a></li>';
        var l = lessonById[r.lesson];
        return l ? '<li><a href="#/lesson/' + l.id + (r.sec ? '/' + r.sec : '') + (r.t != null ? '?t=' + r.t : '') + '">' + esc(r.label) + '</a></li>' : '';
      }).join('') + '</ul>';
    }
    html += '</div><div>' +
      '<div class="card"><h2 style="font-size:1.05rem;margin-top:0">Practice — 4 scenarios</h2><p class="small muted">Conceptual → calculation → multistep → troubleshooting/special case. Hints, feedback and full worked solutions.</p>' +
      '<div class="meta small">' + st.solved + '/4 solved</div>' + progressBar(st.solved / 4) +
      '<p><a class="btn primary" href="#/practice/' + tid + '">Start practice</a></p></div>' +
      '<div class="card" style="margin-top:14px"><h2 style="font-size:1.05rem;margin-top:0">My topic notes</h2><p class="small muted">General notes for this whole topic (lesson-specific, timestamped notes live inside each lesson).</p>' +
      '<textarea class="notes-area" id="topicNotes" aria-label="Topic notes"></textarea><div class="row"><span id="tnSave"></span></div></div>' +
      '</div></div>';
    main.innerHTML = html;
    var ta = $('#topicNotes');
    ta.value = store.state.notes.topics[tid] || '';
    ta.addEventListener('input', function () { store.state.notes.topics[tid] = ta.value; store.save(); });
    $('#tnSave').appendChild(saveStatusEl());
  }

  /* ---------- lesson view ---------- */
  function viewLesson(id, secId, startT) {
    var l = lessonById[id];
    if (!l) return viewNotFound();
    var t = topicById(l.topic);
    renderTabs(l.topic);
    store.state.prefs.lastLesson = id; store.save();
    var ls = topicLessons(l.topic);
    var idx = ls.indexOf(l);
    var prev = ls[idx - 1], next = ls[idx + 1];
    var prog = store.lessonProgress(id);
    var subTitle = t.subs && l.sub ? ' › <a href="#/topic/' + t.id + '/' + l.sub + '">' + esc(t.subs.filter(function (s) { return s.id === l.sub; })[0].title) + '</a>' : '';
    main.innerHTML =
      '<div class="crumbs"><a href="#/">Home</a> › <a href="#/topic/' + t.id + '">' + esc(t.title) + '</a>' + subTitle + '</div>' +
      '<div class="lesson-head"><h1>' + esc(l.title) + '</h1><div class="row">' +
      (prev ? '<a class="btn small" href="#/lesson/' + prev.id + '" title="' + esc(prev.title) + '">‹ Previous</a>' : '') +
      (next ? '<a class="btn small" href="#/lesson/' + next.id + '" title="' + esc(next.title) + '">Next ›</a>' : '') +
      '<a class="btn small" href="#/practice/' + t.id + '">Practice</a>' +
      '<label class="check btn small"><input type="checkbox" id="lessonDone"' + (prog.done ? ' checked' : '') + '> Lesson complete</label></div></div>' +
      '<div class="lesson-layout pinned" id="lessonLayout">' +
      ' <div class="lesson-left">' +
      '  <div class="player-box" id="playerBox"><div class="player-msg" id="playerMsg">Loading video…</div></div>' +
      '  <div class="player-bar"><button class="btn small" id="pBack" title="Back 10 s (j)">−10 s</button><button class="btn small" id="pPlay" title="Play/pause (k)">Play/Pause</button><button class="btn small" id="pFwd" title="Forward 10 s (l)">+10 s</button>' +
      '   <select id="pRate" aria-label="Playback speed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2×</option></select>' +
      '   <span class="now" id="pNow">0:00</span><button class="btn small primary" id="pNote" title="Add a note at the current time (n)">+ Note @ time</button>' +
      '   <a class="btn small" href="' + ytUrl(l) + '" target="_blank" rel="noopener" id="pYt">YouTube ↗</a><button class="btn small pin-btn" id="pPin" title="Keep the video pinned while scrolling">Unpin video</button></div>' +
      '  <div class="panel-tabs desk-tabs" role="tablist" aria-label="Video side panels"><button role="tab" data-pane="transcript">Transcript</button><button role="tab" data-pane="notes">My notes</button></div>' +
      '  <div class="panel view-panel" data-pane="transcript" id="paneTx" role="tabpanel" aria-label="Transcript"></div>' +
      '  <div class="panel view-panel" data-pane="notes" id="paneNotes" role="tabpanel" aria-label="My notes"></div>' +
      ' </div>' +
      ' <div class="lesson-right">' +
      '  <div class="panel-tabs mobile-tabs" role="tablist" aria-label="Lesson panels"><button role="tab" data-pane="guide">Study guide</button><button role="tab" data-pane="transcript">Transcript</button><button role="tab" data-pane="notes">My notes</button></div>' +
      '  <div class="view-panel" data-pane="guide" id="paneGuide"><p class="muted">Loading study guide…</p></div>' +
      ' </div>' +
      '</div>';

    var layout = $('#lessonLayout');
    $('#lessonDone').addEventListener('change', function (e) { prog.done = e.target.checked; prog.updated = Date.now(); store.save(); toast(prog.done ? 'Lesson marked complete ✓' : 'Lesson marked incomplete'); });

    // panes
    var deskPane = store.state.prefs.deskPane || 'transcript';
    var mobPane = store.state.prefs.mobPane || 'guide';
    function applyPanes() {
      $$('.view-panel', layout).forEach(function (p) {
        p.classList.toggle('desk-active', p.getAttribute('data-pane') === deskPane);
        p.classList.toggle('mob-active', p.getAttribute('data-pane') === mobPane);
      });
      $$('.desk-tabs button', layout).forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-pane') === deskPane)); });
      $$('.mobile-tabs button', layout).forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-pane') === mobPane)); });
    }
    $$('.desk-tabs button', layout).forEach(function (b) { b.addEventListener('click', function () { deskPane = b.getAttribute('data-pane'); store.state.prefs.deskPane = deskPane; store.save(); applyPanes(); }); });
    $$('.mobile-tabs button', layout).forEach(function (b) { b.addEventListener('click', function () { mobPane = b.getAttribute('data-pane'); store.state.prefs.mobPane = mobPane; store.save(); applyPanes(); var tabs = $('.mobile-tabs', layout); var y = tabs.getBoundingClientRect().top; if (y < 0 || y > window.innerHeight * 0.6) window.scrollTo({ top: window.scrollY + y - 120, behavior: 'smooth' }); }); });
    applyPanes();
    function showPane(name) {
      // make a pane visible in both layouts (used when adding a note etc.)
      if (name !== 'guide') { deskPane = name; }
      mobPane = name; applyPanes();
    }

    // pin toggle (narrow screens)
    var pinned = store.state.prefs.pinned !== false;
    function applyPin() { layout.classList.toggle('pinned', pinned); $('#pPin').textContent = pinned ? 'Unpin video' : 'Pin video'; }
    $('#pPin').addEventListener('click', function () { pinned = !pinned; store.state.prefs.pinned = pinned; store.save(); applyPin(); });
    applyPin();
    var ro = window.ResizeObserver ? new ResizeObserver(function () { document.documentElement.style.setProperty('--player-h', $('#playerBox') ? $('#playerBox').offsetHeight + 'px' : '0px'); updateTopbarVar(); }) : null;
    if (ro) { ro.observe($('#playerBox')); current.cleanup.push(function () { ro.disconnect(); }); }

    // player
    var resumeAt = startT != null ? startT : (prog.pos > 5 && prog.pos < l.durationSec - 10 ? prog.pos : 0);
    if (location.protocol === 'file:') {
      $('#playerMsg').innerHTML = 'The YouTube player cannot run from a file:// page (YouTube “Error 153”). Start the site with <b>Start-Study-Site.bat</b> (or <code>python -m http.server 8211 --directory site</code>) and open http://localhost:8211. Meanwhile: <a href="' + ytUrl(l, resumeAt) + '" target="_blank" rel="noopener">watch on YouTube ↗</a>';
    } else {
      window.EEPlayer.mount($('#playerBox'), l.ytId, resumeAt, function (code) {
        var why = { 2: 'invalid video id', 5: 'HTML5 player error', 100: 'video not found or private', 101: 'the owner does not allow embedding', 150: 'the owner does not allow embedding', 153: 'player configuration error (page must be served over http://localhost)' }[code] || 'error ' + code;
        var msg = h('<div class="player-msg">The embedded player reported: ' + esc(why) + '. <a href="' + ytUrl(l, window.EEPlayer.time()) + '" target="_blank" rel="noopener">Open this video on YouTube ↗</a></div>');
        $('#playerBox').appendChild(msg);
      }).then(function () {
        var m = $('#playerMsg'); if (m) m.remove();
        if (startT != null) window.EEPlayer.seek(startT, true);
        else if (resumeAt > 5) toast('Resuming at ' + fmt(resumeAt), 'Start from 0:00', function () { window.EEPlayer.seek(0, false); });
      }).catch(function (e) {
        $('#playerMsg').innerHTML = esc(e.message) + ' <a href="' + ytUrl(l, resumeAt) + '" target="_blank" rel="noopener">Watch on YouTube ↗</a>';
      });
    }
    current.cleanup.push(function () { var t2 = window.EEPlayer.time(); if (t2 > 1) { prog.pos = t2; store.saveNow(); } window.EEPlayer.destroy(); });
    $('#pBack').onclick = function () { window.EEPlayer.nudge(-10); };
    $('#pFwd').onclick = function () { window.EEPlayer.nudge(10); };
    $('#pPlay').onclick = function () { window.EEPlayer.toggle(); };
    $('#pRate').onchange = function (e) { window.EEPlayer.setRate(parseFloat(e.target.value)); };
    var lastSavedPos = 0;
    var off = window.EEPlayer.onTick(function (tm, st) {
      var now = $('#pNow'); if (!now) return;
      now.textContent = fmt(tm);
      $('#pYt').href = ytUrl(l, tm);
      if (st === 1 && Math.abs(tm - lastSavedPos) >= 5) { prog.pos = tm; prog.updated = Date.now(); lastSavedPos = tm; store.save(1500); }
      if (txApi) txApi.highlight(tm);
      var nb = $('#noteAddBtn'); if (nb) nb.textContent = 'Add note @ ' + fmt(tm);
    });
    current.cleanup.push(off);

    // transcript, notes, guide
    var txApi = null;
    buildTranscript(l, $('#paneTx')).then(function (api) { txApi = api; });
    var notesApi = buildNotes(l, $('#paneNotes'), showPane);
    $('#pNote').onclick = function () { showPane('notes'); notesApi.focusNew(); };
    buildGuide(l, $('#paneGuide'), secId);

    // keyboard shortcuts
    function onKey(e) {
      var tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'k') { window.EEPlayer.toggle(); e.preventDefault(); }
      else if (e.key === 'j') { window.EEPlayer.nudge(-10); e.preventDefault(); }
      else if (e.key === 'l') { window.EEPlayer.nudge(10); e.preventDefault(); }
      else if (e.key === 'n') { showPane('notes'); notesApi.focusNew(); e.preventDefault(); }
      else if (e.key === '/') { showPane('transcript'); var s = $('#txSearch'); if (s) s.focus(); e.preventDefault(); }
    }
    document.addEventListener('keydown', onKey);
    current.cleanup.push(function () { document.removeEventListener('keydown', onKey); });
  }

  function buildTranscript(l, pane) {
    pane.innerHTML = '<p class="muted" style="padding:10px">Loading transcript…</p>';
    var p = cache.tx[l.id] ? Promise.resolve(cache.tx[l.id]) : fetchJSON('data/transcripts/' + l.id + '.json').then(function (d) { cache.tx[l.id] = d; return d; });
    return p.then(function (data) {
      var chunks = data.chunks;
      pane.innerHTML = '<div class="tx-tools"><input type="search" id="txSearch" placeholder="Search transcript ( / )" aria-label="Search transcript">' +
        '<span class="small muted" id="txCount"></span><button class="btn small" id="txPrev" aria-label="Previous match">↑</button><button class="btn small" id="txNext" aria-label="Next match">↓</button>' +
        '<label class="check small"><input type="checkbox" id="txOnly"> matches only</label><label class="check small"><input type="checkbox" id="txFollow"> follow video</label></div>' +
        '<div class="tx-src">Instructor’s words — YouTube auto-generated captions (speech recognition), grouped into short blocks. Not a human-verified transcript: expect occasional mis-heard words. <span class="fix">Dotted-underlined</span> words were corrected for technical terms; hover to see the original caption. Your study guide explanations are in the separate Study guide panel.</div>' +
        '<div class="tx-list" id="txList"></div>';
      var list = $('#txList', pane);
      var frag = document.createDocumentFragment();
      chunks.forEach(function (c, i) {
        var row = document.createElement('div');
        row.className = 'tx-line'; row.setAttribute('data-i', i);
        var text = esc(c.x).replace(/⟦([^|⟧]*)\|([^⟧]*)⟧/g, function (_, nw, orig) { return '<span class="fix" title="Auto-caption heard: “' + orig + '”">' + nw + '</span>'; });
        row.innerHTML = '<button class="tx-time" data-t="' + c.t + '" title="Play from here">' + fmt(c.t) + '</button><span class="tx-text">' + text + '</span><button class="tx-add" data-t="' + c.t + '" title="Add a note at this time">+ note</button>';
        frag.appendChild(row);
      });
      list.appendChild(frag);
      var rows = $$('.tx-line', list);
      var texts = rows.map(function (r) { return $('.tx-text', r).innerHTML; });
      list.addEventListener('click', function (e) {
        var b = e.target.closest('.tx-time');
        if (b) { window.EEPlayer.seek(parseFloat(b.getAttribute('data-t')), true); return; }
        var a = e.target.closest('.tx-add');
        if (a) { document.dispatchEvent(new CustomEvent('ee-add-note', { detail: { t: parseFloat(a.getAttribute('data-t')) } })); }
      });
      var follow = $('#txFollow', pane);
      follow.checked = store.state.prefs.follow !== false;
      follow.addEventListener('change', function () { store.state.prefs.follow = follow.checked; store.save(); });
      var userScrollUntil = 0;
      ['wheel', 'touchmove'].forEach(function (ev) { pane.addEventListener(ev, function () { userScrollUntil = Date.now() + 5000; }, { passive: true }); });
      var curIdx = -1, needScroll = false;
      function idxAt(tm) { var lo = 0, hi = chunks.length - 1, ans = 0; while (lo <= hi) { var mid = (lo + hi) >> 1; if (chunks[mid].t <= tm + 0.3) { ans = mid; lo = mid + 1; } else hi = mid - 1; } return ans; }
      function scrollToRow(row) {
        if (!row || row.offsetParent === null) return;
        var scrollable = pane.scrollHeight > pane.clientHeight + 4 && getComputedStyle(pane).overflowY !== 'visible';
        if (scrollable) {
          var top = row.offsetTop - pane.clientHeight / 2 + row.offsetHeight / 2;
          pane.scrollTo({ top: Math.max(0, top), behavior: document.hidden ? 'auto' : 'smooth' });
        } else {
          var r = row.getBoundingClientRect();
          var offTop = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 56) + ($('#lessonLayout.pinned') ? ($('#playerBox').offsetHeight + 44) : 44);
          if (r.top < offTop || r.bottom > window.innerHeight - 20) window.scrollTo({ top: window.scrollY + r.top - offTop - 40, behavior: 'smooth' });
        }
      }
      // search
      var matches = [], mPos = -1;
      var input = $('#txSearch', pane), only = $('#txOnly', pane), count = $('#txCount', pane);
      function runSearch() {
        var q = input.value.trim();
        matches = []; mPos = -1;
        rows.forEach(function (r, i) {
          var span = $('.tx-text', r);
          if (!q) { span.innerHTML = texts[i]; r.classList.remove('dim'); return; }
          var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
          var plain = span.textContent;
          var has = re.test(plain);
          re.lastIndex = 0;
          if (has) {
            // highlight inside text nodes only (keeps .fix spans intact)
            span.innerHTML = texts[i];
            markText(span, re);
            matches.push(i);
          } else span.innerHTML = texts[i];
          r.classList.toggle('dim', only.checked && !has);
        });
        count.textContent = q ? (matches.length ? matches.length + ' match' + (matches.length === 1 ? '' : 'es') : 'no matches') : '';
      }
      function markText(node, re) {
        var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
        var nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function (tn) {
          var s = tn.nodeValue; re.lastIndex = 0;
          if (!re.test(s)) return;
          re.lastIndex = 0;
          var span = document.createElement('span');
          span.innerHTML = esc(s).replace(new RegExp(re.source, 'gi'), '<mark>$1</mark>');
          tn.parentNode.replaceChild(span, tn);
        });
      }
      function go(d) {
        if (!matches.length) return;
        mPos = (mPos + d + matches.length) % matches.length;
        $$('mark.active', list).forEach(function (m) { m.classList.remove('active'); });
        var row = rows[matches[mPos]];
        var mk = $('mark', row); if (mk) mk.classList.add('active');
        userScrollUntil = Date.now() + 8000;
        scrollToRow(row);
        count.textContent = (mPos + 1) + ' / ' + matches.length;
      }
      var st;
      input.addEventListener('input', function () { clearTimeout(st); st = setTimeout(runSearch, 160); });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } });
      $('#txNext', pane).onclick = function () { go(1); };
      $('#txPrev', pane).onclick = function () { go(-1); };
      only.addEventListener('change', runSearch);
      return {
        highlight: function (tm) {
          var i = idxAt(tm);
          if (i !== curIdx) {
            if (rows[curIdx]) rows[curIdx].classList.remove('current');
            curIdx = i;
            rows[i].classList.add('current');
            needScroll = true;
          }
          if (needScroll && follow.checked && Date.now() > userScrollUntil && window.EEPlayer.state() === 1 && rows[i].offsetParent !== null) {
            needScroll = false;
            scrollToRow(rows[i]);
          }
        }
      };
    }).catch(function (e) {
      pane.innerHTML = '<p class="diagram-error" style="margin:10px">Transcript unavailable: ' + esc(e.message) + '</p>';
      return null;
    });
  }

  function buildNotes(l, pane, showPane) {
    var n = store.lessonNotes(l.id);
    pane.innerHTML = '<div class="notes-pane">' +
      '<div class="note-new"><label for="noteNew" class="small"><b>New timestamped note</b> <span class="muted">(Ctrl+Enter to add)</span></label><textarea id="noteNew" placeholder="Type while you watch… the note is pinned to the video time when you press Add."></textarea>' +
      '<div class="row" style="margin-top:6px"><button class="btn small primary" id="noteAddBtn">Add note @ 0:00</button><button class="btn small" id="noteAddNoTime">Add without time</button><span class="spacer"></span><span id="noteSave"></span></div></div>' +
      '<ul class="note-list" id="noteList" aria-label="Timestamped notes"></ul>' +
      '<label for="noteFree" class="small"><b>Lesson notes (free-form)</b></label><textarea class="notes-area" id="noteFree" placeholder="Summaries, questions for office hours, formulas to memorise…"></textarea>' +
      '<div class="row" style="margin-top:8px"><button class="btn small" id="noteExport">Export this lesson’s notes (.md)</button><a class="btn small" href="#/notes">All notes &amp; backups</a></div></div>';
    $('#noteSave', pane).appendChild(saveStatusEl());
    var list = $('#noteList', pane), free = $('#noteFree', pane), nw = $('#noteNew', pane);
    free.value = n.free || '';
    free.addEventListener('input', function () { n.free = free.value; n.updated = Date.now(); store.save(); });
    function sortItems() { n.items.sort(function (a, b) { return (a.t == null ? 1e12 : a.t) - (b.t == null ? 1e12 : b.t); }); }
    function renderList(flashId) {
      sortItems();
      list.innerHTML = '';
      if (!n.items.length) { list.innerHTML = '<li class="small muted">No timestamped notes yet.</li>'; return; }
      n.items.forEach(function (it) {
        var li = h('<li class="note-item"><span></span><textarea aria-label="Note text"></textarea><button class="del" title="Delete note" aria-label="Delete note">×</button></li>');
        li.firstChild.innerHTML = it.t != null ? '<button class="tx-time" title="Play from here">' + fmt(it.t) + '</button>' : '<span class="chip">no time</span>';
        var ta = $('textarea', li);
        ta.value = it.text || '';
        ta.rows = Math.min(8, Math.max(2, Math.ceil((it.text || '').length / 48)));
        ta.addEventListener('input', function () { it.text = ta.value; it.updated = Date.now(); n.updated = Date.now(); store.save(); });
        var tb = $('.tx-time', li); if (tb) tb.onclick = function () { window.EEPlayer.seek(it.t, true); };
        $('.del', li).onclick = function () {
          var pos = n.items.indexOf(it);
          n.items.splice(pos, 1); store.save(); renderList();
          toast('Note deleted', 'Undo', function () { n.items.splice(pos, 0, it); store.save(); renderList(it.id); });
        };
        if (flashId === it.id) { li.classList.add('flash'); setTimeout(function () { ta.focus(); }, 50); }
        list.appendChild(li);
      });
    }
    function add(tm, text) {
      var it = { id: uid(), t: tm == null ? null : Math.floor(tm), text: text || '', created: Date.now(), updated: Date.now() };
      n.items.push(it); n.updated = Date.now(); store.save(); renderList(it.id);
      return it;
    }
    $('#noteAddBtn', pane).onclick = function () { add(window.EEPlayer.time(), nw.value.trim()); nw.value = ''; };
    $('#noteAddNoTime', pane).onclick = function () { add(null, nw.value.trim()); nw.value = ''; };
    nw.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(window.EEPlayer.time(), nw.value.trim()); nw.value = ''; } });
    function onAdd(e) { showPane('notes'); add(e.detail.t, ''); }
    document.addEventListener('ee-add-note', onAdd);
    current.cleanup.push(function () { document.removeEventListener('ee-add-note', onAdd); });
    $('#noteExport', pane).onclick = function () { download('EE211-notes-' + l.id + '-' + today() + '.md', notesMarkdown([l])); };
    renderList();
    return { focusNew: function () { setTimeout(function () { nw.focus(); nw.scrollIntoView({ block: 'nearest' }); }, 30); } };
  }

  function buildGuide(l, pane, secId) {
    var p = cache.guide[l.id] != null ? Promise.resolve(cache.guide[l.id]) : fetchText('data/guides/' + l.id + '.html').then(function (t) { cache.guide[l.id] = t; return t; });
    p.then(function (html) {
      var prog = store.lessonProgress(l.id);
      pane.innerHTML = '<div class="guide-head"><span class="chip accent">Study guide</span><span class="small muted" id="gProg"></span><span class="spacer"></span>' +
        '<button class="btn small" id="gExpand">Expand all</button><button class="btn small" id="gCollapse">Collapse all</button><button class="btn small" onclick="window.print()">Print</button></div>' +
        '<details class="toc" id="gToc" open><summary>Contents</summary><ol id="gTocList"></ol></details>' +
        '<div class="guide" id="gBody"></div>';
      var body = $('#gBody', pane);
      body.innerHTML = html;
      var secs = $$('section.g-sec', body);
      l._secCount = secs.length;
      var toc = $('#gTocList', pane);
      var tocHtml = '';
      secs.forEach(function (s) {
        var h2 = s.querySelector(':scope > h2');
        var title = h2 ? h2.innerHTML : s.id;
        var panel = document.createElement('div');
        panel.className = 'g-panel'; panel.id = 'p-' + s.id;
        var tsr = (s.getAttribute('data-ts') || '').split('-').map(Number);
        var head = h('<div class="g-head"><button class="g-toggle" aria-expanded="true"><h2>' + title + '</h2></button></div>');
        if (tsr.length === 2 && !isNaN(tsr[0])) head.appendChild(h('<a class="ts" data-t="' + tsr[0] + '" data-lesson="' + l.id + '" title="Replay this part from ' + fmt(tsr[0]) + '">' + fmt(tsr[0]) + '–' + fmt(tsr[1]) + '</a>'));
        var rev = h('<label class="rev check"><input type="checkbox"> Reviewed</label>');
        var cb = $('input', rev);
        cb.checked = !!prog.secs[s.id];
        panel.classList.toggle('reviewed', cb.checked);
        cb.addEventListener('change', function () { prog.secs[s.id] = cb.checked; if (!cb.checked) delete prog.secs[s.id]; panel.classList.toggle('reviewed', cb.checked); prog.updated = Date.now(); store.save(); updProg(); markToc(); });
        head.appendChild(rev);
        var bodyDiv = document.createElement('div'); bodyDiv.className = 'g-body';
        if (h2) h2.remove();
        s.parentNode.insertBefore(panel, s);
        panel.appendChild(head); panel.appendChild(bodyDiv); bodyDiv.appendChild(s);
        var tbtn = $('.g-toggle', head);
        tbtn.addEventListener('click', function () { var c = panel.classList.toggle('collapsed'); tbtn.setAttribute('aria-expanded', String(!c)); });
        tocHtml += '<li data-sec="' + s.id + '"><a href="#/lesson/' + l.id + '/' + s.id + '">' + title.replace(/<a [^>]*class="ts"[^>]*>.*?<\/a>/g, '') + '</a> <span class="done-mark"></span></li>';
        $$('.example[id] > h3, .example[id] > h4', s).forEach(function (eh) {
          tocHtml += '<li class="sub"><a href="#/lesson/' + l.id + '/' + eh.parentNode.id + '">' + eh.textContent.replace(/\s*▶?\s*\d+:\d\d(:\d\d)?\s*$/, '') + '</a></li>';
        });
      });
      toc.innerHTML = tocHtml;
      function markToc() { $$('li[data-sec]', toc).forEach(function (li) { $('.done-mark', li).textContent = prog.secs[li.getAttribute('data-sec')] ? '✓' : ''; }); }
      function updProg() { var k = secs.filter(function (s) { return prog.secs[s.id]; }).length; $('#gProg', pane).textContent = k + ' of ' + secs.length + ' sections reviewed'; }
      markToc(); updProg();
      $('#gExpand', pane).onclick = function () { $$('.g-panel', body).forEach(function (p2) { p2.classList.remove('collapsed'); $('.g-toggle', p2).setAttribute('aria-expanded', 'true'); }); };
      $('#gCollapse', pane).onclick = function () { $$('.g-panel', body).forEach(function (p2) { p2.classList.add('collapsed'); $('.g-toggle', p2).setAttribute('aria-expanded', 'false'); }); };
      var errs = renderContent(body, l);
      if (errs.length) console.warn(l.id, errs);
      if (secId) setTimeout(function () { revealInGuide(secId); }, 60);
    }).catch(function (e) {
      pane.innerHTML = '<div class="card"><p class="diagram-error">The study guide for this lesson is not available yet (' + esc(e.message) + ').</p></div>';
    });
  }

  function revealInGuide(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var panel = el.closest('.g-panel');
    if (panel) { panel.classList.remove('collapsed'); var tb = $('.g-toggle', panel); if (tb) tb.setAttribute('aria-expanded', 'true'); }
    // on narrow screens make sure the guide pane is the visible one
    var gp = document.getElementById('paneGuide');
    if (gp && !gp.classList.contains('mob-active') && window.innerWidth <= 1100) { var b = $('.mobile-tabs button[data-pane="guide"]'); if (b) b.click(); }
    var target = id.indexOf('p-') === 0 ? el : (el.matches('section.g-sec') ? panel : el);
    function place(smooth) {
      var r = target.getBoundingClientRect();
      var pinnedOff = (window.innerWidth <= 1100 && $('#lessonLayout.pinned')) ? $('#playerBox').offsetHeight + 50 : 0;
      var want = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 56) + 12 + pinnedOff;
      if (Math.abs(r.top - want) > 24) window.scrollTo({ top: window.scrollY + r.top - want, behavior: smooth && !document.hidden ? 'smooth' : 'auto' });
    }
    setTimeout(function () {
      place(false);
      setTimeout(function () { place(false); }, 400);   // re-align after late layout (fonts, diagrams, player)
      target.classList.add('flash-target'); setTimeout(function () { target.classList.remove('flash-target'); }, 1700);
    }, 30);
  }

  /* ---------- practice view ---------- */
  function viewPractice(tid, qid) {
    var t = topicById(tid);
    if (!t) return viewNotFound();
    renderTabs(tid);
    main.innerHTML = '<div class="crumbs"><a href="#/">Home</a> › <a href="#/topic/' + tid + '">' + esc(t.title) + '</a> › Practice</div>' +
      '<div class="row"><h1 style="flex:1">Practice — ' + esc(t.title) + '</h1><span class="chip good" id="pqStat"></span></div>' +
      '<p class="muted small">Four scenarios of increasing difficulty. Enter numbers with or without units — prefixes like k, m, μ (or u) are understood (e.g. <code>4.7k</code>, <code>2.5 mA</code>, <code>1.2e-3 s</code>). Answers within the stated tolerance (usually ±2%) are accepted. Use hints progressively; the full solution and a physical sanity check are under each question.</p>' +
      '<div id="pqBody" class="guide"><p class="muted">Loading questions…</p></div>' +
      '<div class="card" style="margin-top:16px"><h2 style="font-size:1.05rem;margin-top:0">My topic notes</h2><textarea class="notes-area" id="topicNotes" aria-label="Topic notes"></textarea><div id="tnSave"></div></div>';
    var ta = $('#topicNotes');
    ta.value = store.state.notes.topics[tid] || '';
    ta.addEventListener('input', function () { store.state.notes.topics[tid] = ta.value; store.save(); });
    $('#tnSave').appendChild(saveStatusEl());
    var p = cache.practice[tid] != null ? Promise.resolve(cache.practice[tid]) : fetchText('data/practice/' + tid + '.html').then(function (x) { cache.practice[tid] = x; return x; });
    p.then(function (html) {
      var body = $('#pqBody');
      body.innerHTML = html;
      renderContent(body, null);
      var firstBonus = body.querySelector('article.q[id$="-b1"]');
      if (firstBonus) firstBonus.parentNode.insertBefore(h('<h2 class="bonus-head">Bonus scenario' + (body.querySelectorAll('article.q[id*="-b"]').length > 1 ? 's' : '') + ' <span class="small muted">— extra practice for the related lesson; not part of the four core scenarios</span></h2>'), firstBonus);
      function stat() { var s = topicStats(tid); $('#pqStat').textContent = s.solved + ' / 4 solved' + (firstBonus ? ' · bonus ' + s.bonusSolved : ''); }
      var probs = window.EEPractice.mount(body, { store: store, onProgress: stat, renderContent: function (n) { R.renderMath(n); } });
      if (probs.length) console.warn('practice problems', probs);
      stat();
      if (qid) {
        var goQ = function () { var q = document.getElementById(qid); if (q && Math.abs(q.getBoundingClientRect().top - 76) > 24) q.scrollIntoView({ block: 'start' }); };
        setTimeout(goQ, 80); setTimeout(goQ, 500);
      }
    }).catch(function (e) { $('#pqBody').innerHTML = '<p class="diagram-error">Practice questions are not available yet (' + esc(e.message) + ').</p>'; });
  }

  /* ---------- notes overview & export ---------- */
  function notesMarkdown(ls) {
    var out = '# EE 211 study notes\n\nExported ' + new Date().toLocaleString() + '\n';
    TOPICS.forEach(function (t) {
      var tl = topicLessons(t.id).filter(function (l) { return !ls || ls.indexOf(l) >= 0; });
      var tn = store.state.notes.topics[t.id];
      var parts = [];
      if (!ls && tn) parts.push('### Topic notes\n\n' + tn + '\n');
      tl.forEach(function (l) {
        var n = store.state.notes.lessons[l.id];
        if (!n || (!n.free && !(n.items || []).length)) return;
        var s = '### ' + l.title + '\n\nVideo: [' + l.ytTitle + '](' + ytUrl(l) + ')\n\n';
        (n.items || []).slice().sort(function (a, b) { return (a.t == null ? 1e12 : a.t) - (b.t == null ? 1e12 : b.t); }).forEach(function (it) {
          s += '- ' + (it.t != null ? '[' + fmt(it.t) + '](' + ytUrl(l, it.t) + ') ' : '') + (it.text || '').replace(/\n/g, '\n  ') + '\n';
        });
        if (n.free) s += '\n**Lesson notes**\n\n' + n.free + '\n';
        parts.push(s);
      });
      if (parts.length) out += '\n## ' + t.title + '\n\n' + parts.join('\n');
    });
    return out;
  }
  function notesText() { return notesMarkdown().replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 <$2>').replace(/\*\*/g, ''); }
  function notesHTML() {
    var body = '';
    TOPICS.forEach(function (t) {
      var sec = '';
      var tn = store.state.notes.topics[t.id];
      if (tn) sec += '<h3>Topic notes</h3><p>' + esc(tn).replace(/\n/g, '<br>') + '</p>';
      topicLessons(t.id).forEach(function (l) {
        var n = store.state.notes.lessons[l.id];
        if (!n || (!n.free && !(n.items || []).length)) return;
        sec += '<h3>' + esc(l.title) + '</h3><p class="v">Video: <a href="' + ytUrl(l) + '">' + esc(l.ytTitle) + '</a></p><ul>';
        (n.items || []).slice().sort(function (a, b) { return (a.t == null ? 1e12 : a.t) - (b.t == null ? 1e12 : b.t); }).forEach(function (it) {
          sec += '<li>' + (it.t != null ? '<a href="' + ytUrl(l, it.t) + '"><b>' + fmt(it.t) + '</b></a> ' : '') + esc(it.text || '').replace(/\n/g, '<br>') + '</li>';
        });
        sec += '</ul>' + (n.free ? '<h4>Lesson notes</h4><p>' + esc(n.free).replace(/\n/g, '<br>') + '</p>' : '');
      });
      if (sec) body += '<h2>' + esc(t.title) + '</h2>' + sec;
    });
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>EE 211 Notes</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#1d1f23;background:#fff}h2{border-bottom:2px solid #1f5fbf;padding-bottom:4px;margin-top:2em}h3{margin-bottom:2px}.v{color:#666;font-size:.9em;margin-top:0}a{color:#1f5fbf}li{margin:4px 0}</style></head><body><h1>EE 211 study notes</h1><p>Exported ' + esc(new Date().toLocaleString()) + '</p>' + (body || '<p>No notes yet.</p>') + '</body></html>';
  }

  function viewNotes() {
    renderTabs(null);
    var html = '<div class="crumbs"><a href="#/">Home</a> › Notes</div><h1>My notes</h1>' +
      '<div class="card"><div class="row"><b>Export:</b><button class="btn small" id="exMd">Markdown (.md)</button><button class="btn small" id="exHtml">Readable page (.html)</button><button class="btn small" id="exTxt">Plain text (.txt)</button>' +
      '<span class="spacer"></span><b>Backup:</b><button class="btn small" id="exJson">Download full backup (.json)</button><label class="btn small">Restore backup…<input type="file" id="imJson" accept="application/json,.json" hidden></label></div>' +
      '<p class="small muted" style="margin-bottom:0">The backup file contains notes <i>and</i> progress (completed lessons, reviewed sections, practice results, playback positions). Restoring merges it with what is already here.</p></div>' +
      '<div class="card" style="margin-top:12px"><h2 style="font-size:1.05rem;margin-top:0">About browser storage</h2><ul class="small">' +
      '<li>Everything is saved automatically in this browser’s <b>localStorage</b> for <code>' + esc(location.origin) + '</code>. ' + (store.available ? '<span class="status-covered">Storage is working.</span>' : '<b style="color:var(--bad)">Storage is NOT available right now — export your notes before closing the tab.</b>') + '</li>' +
      '<li>It does not sync to other browsers, computers or phones, and it is tied to the exact address: always open the site the same way (the start script uses <code>http://localhost:8211</code>). A different port or opening the file directly gives you an empty notebook.</li>' +
      '<li>Clearing browsing data / site data, or using a private/incognito window, deletes it. Download a backup regularly.</li>' +
      '<li>Capacity is roughly 5 MB — far more than text notes need.</li></ul></div>';
    var any = false;
    TOPICS.forEach(function (t) {
      var block = '';
      var tn = store.state.notes.topics[t.id];
      if (tn) block += '<div class="card" style="margin:8px 0"><b>Topic notes</b> — <a href="#/topic/' + t.id + '">edit</a><div class="small" style="white-space:pre-wrap;margin-top:4px">' + esc(tn) + '</div></div>';
      topicLessons(t.id).forEach(function (l) {
        var n = store.state.notes.lessons[l.id];
        if (!n || (!n.free && !(n.items || []).length)) return;
        block += '<div class="card" style="margin:8px 0"><b><a href="#/lesson/' + l.id + '">' + esc(l.title) + '</a></b> <span class="small muted">' + (n.items || []).length + ' timestamped note(s)</span><ul class="small">';
        (n.items || []).slice().sort(function (a, b) { return (a.t == null ? 1e12 : a.t) - (b.t == null ? 1e12 : b.t); }).forEach(function (it) {
          block += '<li>' + (it.t != null ? '<a href="#/lesson/' + l.id + '?t=' + it.t + '">' + fmt(it.t) + '</a> ' : '') + esc(it.text || '(empty)') + '</li>';
        });
        block += '</ul>' + (n.free ? '<div class="small" style="white-space:pre-wrap;border-top:1px dashed var(--border);padding-top:4px">' + esc(n.free) + '</div>' : '') + '</div>';
      });
      if (block) { any = true; html += '<h2 style="font-size:1.12rem;margin-top:22px">' + esc(t.title) + '</h2>' + block; }
    });
    if (!any) html += '<p class="muted" style="margin-top:20px">No notes yet. Open a lesson and use “+ Note @ time” while watching.</p>';
    main.innerHTML = html;
    $('#exMd').onclick = function () { download('EE211-notes-' + today() + '.md', notesMarkdown()); };
    $('#exTxt').onclick = function () { download('EE211-notes-' + today() + '.txt', notesText()); };
    $('#exHtml').onclick = function () { download('EE211-notes-' + today() + '.html', notesHTML(), 'text/html;charset=utf-8'); };
    $('#exJson').onclick = function () { download('EE211-backup-' + today() + '.json', store.exportJSON(), 'application/json'); };
    $('#imJson').onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      f.text().then(function (txt) { store.importJSON(txt, true); toast('Backup restored and merged ✓'); viewNotes(); }).catch(function (err) { toast('Restore failed: ' + err.message); });
    };
  }

  function viewCoverage() {
    renderTabs(null);
    main.innerHTML = '<div class="crumbs"><a href="#/">Home</a> › Coverage</div><h1>Coverage checklist &amp; limitations</h1><div id="covBody" class="prose" style="max-width:1200px"><p class="muted">Loading…</p></div>';
    fetchText('data/coverage.html').then(function (html) {
      var b = $('#covBody'); b.innerHTML = html; b.classList.add('guide');
      renderContent(b, null);
    }).catch(function () { $('#covBody').innerHTML = '<p class="muted">The coverage report has not been generated yet.</p>'; });
  }

  function viewHelp() {
    renderTabs(null);
    main.innerHTML = '<div class="crumbs"><a href="#/">Home</a> › Help</div><div class="prose"><h1>How to use this site</h1>' +
      '<h2>Layout</h2><p>On a wide screen each lesson shows the <b>video</b> (top left) with <b>Transcript</b> and <b>My notes</b> tabs underneath, and the <b>Study guide</b> on the right. On tablets and phones the video stays pinned at the top (use “Unpin video” to release it) and the Guide / Transcript / Notes tabs sit right under it.</p>' +
      '<h2>Video &amp; transcript</h2><ul><li>Click any timestamp (in the guide, the transcript, your notes or a practice question) to jump the video there.</li><li>The transcript highlights the block being spoken; “follow video” auto-scrolls it. Scrolling the transcript yourself pauses auto-scroll for a few seconds.</li><li>Search the transcript with the box (or press <kbd>/</kbd>); <kbd>Enter</kbd>/<kbd>Shift+Enter</kbd> step through matches, “matches only” filters the list.</li><li>The transcript is YouTube’s automatic speech recognition, regrouped and corrected for technical terms (dotted underline). It is not a verbatim, human-checked transcript — when in doubt, replay the video.</li><li>Your place in each video is remembered (saved every few seconds while playing).</li></ul>' +
      '<h2>Keyboard shortcuts (lesson page, when not typing)</h2><p><kbd>k</kbd> play/pause · <kbd>j</kbd> back 10 s · <kbd>l</kbd> forward 10 s · <kbd>n</kbd> new note at current time · <kbd>/</kbd> search transcript · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> add the note you are typing.</p>' +
      '<h2>Study guides</h2><ul><li>Each guide follows the video’s order: objectives, prerequisites, definitions, the lesson sections (concepts, formulas, derivations, worked examples), assumptions, common mistakes, recap and formula sheet.</li><li>Purple boxes marked <b>Additional teaching</b> are explanations added for this site, not from the video. Amber <b>Source uncertainty</b> boxes flag illegible or questionable items in the video. Blue <b>Instructor emphasis</b> boxes mark points the instructor stressed.</li><li>Sections can be collapsed; tick <b>Reviewed</b> to track progress. Use Contents to jump around; “Print” prints the full guide.</li></ul>' +
      '<h2>Practice</h2><p>Each topic has four scenarios (conceptual → calculation → multistep → troubleshooting/special case). Type numbers with units or SI prefixes (e.g. <code>4.7k</code>, <code>4700 Ω</code>, <code>2.5 mA</code>, <code>3.3u</code>). Wrong answers get specific feedback when the mistake is recognisable (wrong prefix, wrong sign, factor of 2, typical method errors). Hints unlock one at a time. Progress is saved.</p>' +
      '<h2>Running the site</h2><p>Double-click <code>Start-Study-Site.bat</code> in the project folder (needs Python). It serves the site at <code>http://localhost:8211</code> and opens your browser. The YouTube player needs an internet connection and does not work if <code>index.html</code> is opened directly as a file.</p>' +
      '<h2>Storage limitations</h2><p>See <a href="#/notes">Notes</a> → “About browser storage”. Download a backup regularly.</p></div>';
  }

  function viewNotFound() { renderTabs(null); main.innerHTML = '<h1>Not found</h1><p><a href="#/">Back to the start page</a></p>'; }

  /* ---------- global link handling ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a.ts');
    if (a) {
      e.preventDefault();
      var t = R.parseTime(a.getAttribute('data-t'));
      var lid = a.getAttribute('data-lesson');
      if (current.view === 'lesson' && (!lid || lid === current.lesson)) {
        window.EEPlayer.seek(t, true);
        if (window.innerWidth <= 1100 && !$('#lessonLayout.pinned')) { var pb = $('#playerBox'); if (pb) pb.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      } else if (lid) {
        location.hash = '#/lesson/' + lid + '?t=' + Math.floor(t);
      }
      return;
    }
    var x = e.target.closest('a.xref');
    if (x && x.getAttribute('data-lesson')) {
      e.preventDefault();
      var lid2 = x.getAttribute('data-lesson'), sec = x.getAttribute('data-sec');
      if (current.view === 'lesson' && lid2 === current.lesson && sec) revealInGuide(sec);
      else location.hash = '#/lesson/' + lid2 + (sec ? '/' + sec : '');
    }
  });

  /* ---------- router ---------- */
  function route() {
    var hash = location.hash.replace(/^#/, '') || '/';
    var q = {};
    var qi = hash.indexOf('?');
    if (qi >= 0) { hash.slice(qi + 1).split('&').forEach(function (kv) { var p = kv.split('='); q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }); hash = hash.slice(0, qi); }
    var parts = hash.split('/').filter(Boolean);
    // same lesson, only a section change → don't rebuild
    if (parts[0] === 'lesson' && current.view === 'lesson' && current.lesson === parts[1] && q.t == null) {
      if (parts[2]) revealInGuide(parts[2]);
      return;
    }
    cleanup();
    current.view = parts[0] || 'home'; current.lesson = null;
    window.scrollTo(0, 0);
    if (!parts.length) viewHome();
    else if (parts[0] === 'topic') viewTopic(parts[1], parts[2]);
    else if (parts[0] === 'lesson') { current.lesson = parts[1]; viewLesson(parts[1], parts[2], q.t != null ? parseFloat(q.t) : null); }
    else if (parts[0] === 'practice') viewPractice(parts[1], parts[2]);
    else if (parts[0] === 'notes') viewNotes();
    else if (parts[0] === 'coverage') viewCoverage();
    else if (parts[0] === 'help') viewHelp();
    else viewNotFound();
    var t = document.title.split(' — ')[0];
    document.title = 'EE 211 Study Guide' + (current.view !== 'home' ? ' — ' + (current.lesson && lessonById[current.lesson] ? lessonById[current.lesson].title : current.view) : '');
    updateTopbarVar();
  }

  /* ---------- boot ---------- */
  function boot() {
    if (!store.available) {
      var b = document.getElementById('banner');
      b.hidden = false;
      b.innerHTML = 'Browser storage is unavailable (private window or blocked site data). Notes and progress will be lost when you close this tab — use <a href="#/notes">Notes → Export</a>.';
    }
    if (location.protocol === 'file:') {
      var b2 = document.getElementById('banner');
      b2.hidden = false;
      b2.innerHTML = 'You opened the site as a file. Guides and the YouTube player need it to be served: double-click <b>Start-Study-Site.bat</b> (or run <code>python -m http.server 8211 --directory site</code>) and open <b>http://localhost:8211</b>.';
    }
    Promise.all([fetchJSON('data/lessons.json'), fetchJSON('data/related.json').catch(function () { return {}; })]).then(function (res) {
      lessons = res[0]; RELATED = res[1] || {};
      lessons.forEach(function (l) { lessonById[l.id] = l; });
      window.addEventListener('hashchange', route);
      route();
    }).catch(function (e) {
      main.innerHTML = '<h1>Could not load the lesson catalog</h1><p>' + esc(e.message) + '</p><p>Start the site with <b>Start-Study-Site.bat</b> and open <b>http://localhost:8211</b>.</p>';
    });
  }
  window.EEApp = { notesMarkdown: function () { return notesMarkdown(); }, lessons: function () { return lessons; } };
  boot();
})();
