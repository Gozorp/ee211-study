/* EE 211 — persistent video dock (EEDock). One #dock element under <body> holds the single YouTube player for the
 * whole session. Modes: hidden · slotted (fixed over the Watch view's player slot, rect-synced) · mini (floating
 * card / compact phone bar on every other view) · mini + pill (collapsed, keeps playing).
 * Outside Watch the mini player appears only once the loaded lesson has actually been played (Play, a timestamp,
 * the transcript, a chapter, k/j/l) or explicitly opened (n); a lesson that was only cued in Watch stays hidden.
 * Closing hides it until the next playback.
 * The iframe is never re-parented or destroyed; lessons change with cue/loadVideoById (js/player.js).
 */
(function (global) {
  'use strict';
  var A = global.EEApp, U = A.ui, S = A.store, P = global.EEPlayer, store = global.EEStore;
  var esc = U.esc, icon = U.icon;
  var el = null, host, msgEl, titleA, timeEl, playBtn, progEl, noteForm, noteTa, noteAt;
  var st = { lessonId: null, mode: 'hidden', slot: null, closed: false, pill: false, started: false };
  var lessonCbs = [], tickCbs = [], stateCbs = [];
  var lastSavedPos = -10, noteT = null, msgKind = null;
  var pendingDetach = 0, ro = null, raf = 0;

  function lessonOf() { return st.lessonId ? A.data.lesson(st.lessonId) : null; }
  function each(list, args) { list.slice().forEach(function (f) { try { f.apply(null, args); } catch (e) { if (global.console) console.error(e); } }); }
  function sub(list, f) { list.push(f); return function () { var i = list.indexOf(f); if (i >= 0) list.splice(i, 1); }; }
  function ctrl(ic, label, title, cls) {
    return '<button type="button" class="dock-btn ' + (cls || '') + '" title="' + esc(title) + '" aria-label="' + esc(title) + '">' + icon(ic) + '<span class="dock-btn-label">' + esc(label) + '</span></button>';
  }

  function init() {
    if (el) return;
    el = document.getElementById('dock');
    el.innerHTML =
      '<div class="dock-card">' +
      '<div class="dock-video"><div class="dock-host"></div><div class="dock-msg" hidden></div></div>' +
      '<div class="dock-bar">' +
      '<div class="dock-meta"><a class="dock-title" href="#/"></a><span class="dock-time mono" aria-live="off"></span></div>' +
      '<div class="dock-ctrls">' +
      ctrl('back', '−10', 'Back 10 seconds (j)', 'dock-back') +
      ctrl('play', 'Play', 'Play (k)', 'dock-play') +
      ctrl('fwd', '+10', 'Forward 10 seconds (l)', 'dock-fwd') +
      ctrl('plus', 'Note', 'Add a note at the current time (n)', 'dock-note') +
      ctrl('expand', 'Watch', 'Open this lesson in Watch', 'dock-expand') +
      ctrl('down', 'Minimise', 'Collapse the player (audio keeps playing)', 'dock-pill') +
      ctrl('up', 'Show video', 'Show the video again', 'dock-unpill') +
      ctrl('close', 'Close', 'Close the player', 'dock-close') +
      '</div></div>' +
      '<form class="dock-noteform" hidden novalidate><label class="dock-note-label" for="dockNoteTa">Note <span class="dock-note-at mono"></span></label>' +
      '<textarea id="dockNoteTa" rows="2" placeholder="What do you want to remember about this moment?"></textarea>' +
      '<div class="dock-note-row">' + U.btn('Save note', { kind: 'primary', small: true, cls: 'dock-note-save' }) + U.btn('Cancel', { small: true, kind: 'ghost', cls: 'dock-note-cancel' }) + '</div></form>' +
      '<div class="dock-prog" aria-hidden="true"><span></span></div>' +
      '</div>';
    host = el.querySelector('.dock-host');
    msgEl = el.querySelector('.dock-msg');
    titleA = el.querySelector('.dock-title');
    timeEl = el.querySelector('.dock-time');
    playBtn = el.querySelector('.dock-play');
    progEl = el.querySelector('.dock-prog span');
    noteForm = el.querySelector('.dock-noteform');
    noteTa = el.querySelector('#dockNoteTa');
    noteAt = el.querySelector('.dock-note-at');
    P.ensure(host);

    el.querySelector('.dock-back').onclick = function () { nudge(-10); };
    el.querySelector('.dock-fwd').onclick = function () { nudge(10); };
    playBtn.onclick = function () { toggle(); };
    el.querySelector('.dock-note').onclick = function () { quickNote(); };
    el.querySelector('.dock-expand').onclick = function () { expand(); };
    el.querySelector('.dock-pill').onclick = function () { setPill(true); };
    el.querySelector('.dock-unpill').onclick = function () { setPill(false); };
    el.querySelector('.dock-close').onclick = function () { close(); };
    el.querySelector('.dock-note-cancel').onclick = function () { hideNote(); };
    el.querySelector('.dock-note-save').onclick = saveNote;
    noteForm.addEventListener('submit', function (e) { e.preventDefault(); saveNote(); });
    noteTa.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveNote(); }
      if (e.key === 'Escape') { e.stopPropagation(); hideNote(); }
    });

    P.onTick(onTick);
    P.onState(onState);
    P.onError(onError);
    P.onReady(function () { if (msgKind !== 'file') hideMsg(); });
    if (global.ResizeObserver) new ResizeObserver(measure).observe(el);
    global.addEventListener('resize', schedSync);
    global.addEventListener('scroll', schedSync, true);
    global.addEventListener('pagehide', function () { savePos(true); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) savePos(true); });
    var rate = parseFloat((store.state.prefs || {}).rate);
    if (rate) P.setRate(rate);
  }

  /* ---------------------------------------------------------------- geometry / modes */
  function schedSync() { if (st.mode !== 'slotted') return; sync(); if (!raf) raf = requestAnimationFrame(function () { raf = 0; sync(); }); }
  function sync() {
    if (st.mode !== 'slotted' || !st.slot) return;
    var r = st.slot.getBoundingClientRect();
    el.style.left = r.left + 'px'; el.style.top = r.top + 'px';
    el.style.width = r.width + 'px'; el.style.height = r.height + 'px';
    el.classList.toggle('offscreen', r.width < 2 || r.height < 2);
  }
  function clearGeom() { el.style.left = el.style.top = el.style.width = el.style.height = ''; el.classList.remove('offscreen'); }
  function setMode(m) {
    if (!el) return;
    if (m === st.mode) { if (m === 'slotted') sync(); return; }
    var from = st.mode;
    var first = from !== 'hidden' ? el.getBoundingClientRect() : null;
    st.mode = m;
    if (m !== 'mini') st.pill = false;      // the pill is a mini-only state; never carry it into Watch
    el.setAttribute('data-mode', m);
    if (m === 'slotted') sync(); else clearGeom();
    if (m !== 'mini') hideNote();
    syncBody();
    if (first && m !== 'hidden' && !U.reducedMotion()) {
      var last = el.getBoundingClientRect();
      if (last.width && last.height) {
        var dx = first.left - last.left, dy = first.top - last.top, sx = first.width / last.width, sy = first.height / last.height;
        var tf = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
        if (el.animate) {
          var anim = el.animate([{ transform: tf, transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }], { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
          setTimeout(function () { try { anim.cancel(); } catch (e) {} }, 320);   // never leave a stale transform behind
        }
      }
    } else if (m === 'mini' && from === 'hidden' && !U.reducedMotion()) {
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    }
  }
  function syncBody() {
    var b = document.body;
    b.classList.toggle('dock-mini', st.mode === 'mini');
    b.classList.toggle('dock-pill', st.mode === 'mini' && st.pill);
    b.classList.toggle('dock-slotted', st.mode === 'slotted');
    el.classList.toggle('pill', st.pill);
    measure();
  }
  /* --dock-h: height of the visible mini player, so the footer can reserve room for it (app.css) */
  function measure() {
    if (!el) return;
    document.documentElement.style.setProperty('--dock-h', (st.mode === 'mini' ? Math.ceil(el.offsetHeight) : 0) + 'px');
  }
  function setPill(v) {
    st.pill = !!v && st.mode === 'mini'; syncBody();
    if (v) hideNote();
    var f = el.querySelector(v ? '.dock-unpill' : '.dock-pill'); if (f) f.focus();
  }
  function show(force) {
    if (st.mode !== 'hidden') return;
    if (st.slot) setMode('slotted');
    else if (force || (st.started && !st.closed)) setMode('mini');
  }
  /* a player control was used while the player is hidden or closed: bring the mini player back (visibly) */
  function reopen() {
    if (st.mode === 'hidden' || st.closed) { st.closed = false; st.started = true; show(true); }
  }

  function attach(slot) {
    init();
    if (pendingDetach) { clearTimeout(pendingDetach); pendingDetach = 0; }
    st.slot = slot; st.closed = false;
    if (ro) ro.disconnect();
    if (global.ResizeObserver) { ro = new ResizeObserver(schedSync); ro.observe(slot); }
    setMode('slotted');
    sync();
    setTimeout(sync, 60); setTimeout(sync, 400);
  }
  function detach() {
    if (pendingDetach) clearTimeout(pendingDetach);
    pendingDetach = setTimeout(function () {
      pendingDetach = 0;
      if (ro) ro.disconnect();
      st.slot = null;
      setMode(st.lessonId && !st.closed && st.started ? 'mini' : 'hidden');
    }, 0);
  }

  /* ---------------------------------------------------------------- playback */
  function resumePos(l) {
    var p = store.state.progress.lessons[l.id];
    var pos = p && p.pos || 0;
    return pos > 5 && pos < (l.durationSec || 1e9) - 10 ? Math.floor(pos) : 0;
  }
  function savePos(now) {
    var l = lessonOf(); if (!l) return;
    var t = P.time();
    if (t > 1 && P.videoId === l.ytId) { var p = S.lp(l.id); p.pos = Math.floor(t); p.updated = Date.now(); }
    if (now) store.saveNow(); else store.save(600);
  }
  function load(lessonId, opts) {
    opts = opts || {};
    var l = A.data.lesson(lessonId);
    if (!l) return;
    init();
    if (opts.play) { st.closed = false; st.started = true; }
    else if (st.slot) st.closed = false;
    if (st.lessonId === lessonId && P.videoId === l.ytId) {
      if (!P.ready && msgKind !== 'file') hideMsg();   // a retry after a load failure (player.js re-creates the player)
      if (opts.t != null) P.seek(opts.t, opts.play ? true : undefined);
      else if (opts.play) P.play();
      show();
      return;
    }
    st.started = !!opts.play;     // a newly cued lesson stays out of sight outside Watch until it is played
    savePos();
    st.lessonId = lessonId;
    var p = S.lp(lessonId);
    p.lastSeen = new Date().toISOString();
    store.save(800);
    lastSavedPos = -10;
    var start = opts.t != null ? opts.t : resumePos(l);
    hideMsg();
    el.setAttribute('data-topic', l.topic);
    titleA.textContent = l.title;
    titleA.title = l.title;
    titleA.setAttribute('href', A.href.watch(l.id));
    timeEl.textContent = U.fmt(start) + ' / ' + U.fmt(l.durationSec);
    if (location.protocol === 'file:') { showMsg('The YouTube player cannot run from a file:// page.', l, start); msgKind = 'file'; }
    P.load(l.ytId, start, !!opts.play);
    show();
    each(lessonCbs, [lessonId]);
  }
  function seek(t, play) {
    if (!st.lessonId) return;
    if (play) { st.closed = false; st.started = true; }
    P.seek(t, play);
    show();
  }
  function play() { if (st.lessonId) { st.closed = false; st.started = true; P.play(); show(); } }
  function pause() { P.pause(); }
  function toggle() { if (!st.lessonId) return; reopen(); P.toggle(); }
  function nudge(d) { if (!st.lessonId) return; reopen(); P.nudge(d); }
  function close() {
    savePos(true);
    P.pause();
    st.closed = true; st.pill = false; st.started = false;
    setMode('hidden');
    A.announce('Video player closed');
  }
  function expand() { if (st.lessonId) A.go(A.href.watch(st.lessonId)); }

  function onTick(t, s) {
    var l = lessonOf(); if (!l) return;
    var playing = s === 1;
    timeEl.textContent = U.fmt(t) + ' / ' + U.fmt(l.durationSec);
    if (progEl) progEl.style.width = Math.min(100, (t / (l.durationSec || 1)) * 100).toFixed(2) + '%';
    if (playing) {
      S.markWatched(l.id, t);
      if (Math.abs(t - lastSavedPos) >= 5) {
        var p = S.lp(l.id); p.pos = Math.floor(t); p.updated = Date.now(); lastSavedPos = t;
        store.save(2000);
      }
    }
    each(tickCbs, [t, s, l.id]);
  }
  function onState(s) {
    var playing = s === 1 || s === 3;
    playBtn.innerHTML = icon(playing ? 'pause' : 'play') + '<span class="dock-btn-label">' + (playing ? 'Pause' : 'Play') + '</span>';
    playBtn.title = playing ? 'Pause (k)' : 'Play (k)';
    playBtn.setAttribute('aria-label', playing ? 'Pause (k)' : 'Play (k)');
    el.classList.toggle('playing', playing);
    if (s === 2 || s === 0) savePos();
    if (s === 1) {
      hideMsg();
      st.started = true;
      if (st.mode === 'hidden' && st.lessonId) { st.closed = false; show(true); }   // never play audio with no visible control
    }
    each(stateCbs, [s, st.lessonId]);
  }
  function hideMsg() { if (msgEl) msgEl.hidden = true; msgKind = null; }
  function showMsg(text, l, t) {
    msgEl.hidden = false; msgKind = 'error';
    msgEl.innerHTML = '<p>' + esc(text) + '</p>' + (l ? '<p><a href="' + A.data.ytUrl(l, t) + '" target="_blank" rel="noopener">Open this video on YouTube' + icon('external') + '</a></p>' : '');
  }
  function onError(err) {
    var l = lessonOf();
    showMsg(err.code === 'api' || err.code === 'timeout' ? err.message : 'The embedded player reported: ' + err.message + '.', l, P.time());
  }

  /* ---------------------------------------------------------------- quick note (mini dock) */
  function quickNote() {
    var l = lessonOf(); if (!l) return;
    var ctx = A.current;
    if (st.mode === 'slotted' && ctx && ctx.shortcuts && ctx.shortcuts.n) { ctx.shortcuts.n(); return; }
    if (st.mode === 'hidden' || st.closed) { st.closed = false; st.started = true; show(true); }
    if (st.pill) setPill(false);
    noteT = Math.floor(P.time());
    noteAt.textContent = 'at ' + U.fmt(noteT);
    noteForm.hidden = false;
    el.classList.add('noting');
    noteTa.focus();
  }
  function hideNote() { if (!noteForm) return; noteForm.hidden = true; el.classList.remove('noting'); noteTa.value = ''; }
  function saveNote() {
    var l = lessonOf(); if (!l) return;
    var txt = noteTa.value.trim();
    if (!txt) { noteTa.focus(); return; }
    S.addNote(l.id, { t: noteT, text: txt });
    hideNote();
    A.toast('Note saved at ' + U.fmt(noteT), { action: 'Open notes', onAction: function () { A.go(A.href.notes(l.topic)); } });
    playBtn.focus();
  }

  global.EEDock = {
    init: init,
    load: load, seek: seek, play: play, pause: pause, toggle: toggle, nudge: nudge,
    attach: attach, detach: detach, expand: expand, close: close, quickNote: quickNote,
    setRate: function (r) { P.setRate(r); (store.state.prefs || (store.state.prefs = {})).rate = r; store.save(); },
    current: function () { return { lessonId: st.lessonId, t: st.lessonId ? P.time() : 0, playing: P.playing, mode: st.mode, closed: st.closed }; },
    onTick: function (f) { return sub(tickCbs, f); },
    onLesson: function (f) { return sub(lessonCbs, f); },
    onState: function (f) { return sub(stateCbs, f); },
    get mode() { return st.mode; }
  };
})(window);
