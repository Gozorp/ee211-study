/* EE 211 Circuits — app core: constants, data loaders, store helpers, shared UI, global shell, router.
 * Exposes window.EEApp (documented in work/redesign/APP_API.md). Views and topic modes live in their own files
 * (js/app/*.js) and register themselves with EEApp.registerView / EEApp.registerMode before boot.
 * ES5 style (IIFE, var), no build step.
 */
(function (global) {
  'use strict';
  var doc = document;
  var R = global.EERender;
  var store = global.EEStore;

  /* ================================================================== constants */
  var TOPICS = [
    { id: 'deltawye', name: 'Δ–Y Conversions', short: 'Δ–Y', title: 'Delta–Wye Conversions',
      blurb: 'Convert between Δ (pi) and Y (T) resistor networks to simplify bridge circuits that series–parallel rules cannot reduce.' },
    { id: 'thevenin', name: 'Thévenin & Norton', short: 'Thévenin & Norton', title: 'Thévenin and Norton Equivalents',
      blurb: 'Replace a linear two-terminal network by one source and one resistor, then analyse loads and maximum power transfer.' },
    { id: 'srcxform', name: 'Source Transformations', short: 'Source Transforms', title: 'Source Transformations',
      blurb: 'Swap a voltage source with a series resistor for a current source with a parallel resistor, and back.' },
    { id: 'millman', name: 'Millman’s Theorem', short: 'Millman', title: 'Millman’s Theorem',
      blurb: 'Collapse parallel branches of sources with series resistors into one equivalent source and resistance.' },
    { id: 'lc', name: 'Capacitors, Inductors & RC/RL', short: 'C, L & RC/RL', title: 'Capacitors, Inductors, and RC/RL Circuits',
      blurb: 'Energy-storage elements, continuity rules, and first-order transients with τ = RC and τ = L/R.',
      subs: [{ id: 'rc', title: 'Capacitors & RC' }, { id: 'rl', title: 'Inductors & RL' }] },
    { id: 'scope', name: 'Oscilloscope Measurements', short: 'Oscilloscope', title: 'Oscilloscope Measurements',
      blurb: 'Read volts/div and time/div; measure period, frequency, peak, peak-to-peak and RMS values on the grid.' }
  ];
  var TOPIC = {};
  TOPICS.forEach(function (t) { TOPIC[t.id] = t; });

  var MODES = [
    { id: 'watch', label: 'Watch', short: 'Watch', key: 'w', desc: 'Video lessons with a searchable, timestamped transcript.' },
    { id: 'understand', label: 'Understand', short: 'Understand', key: 'u', desc: 'Complete study guides, formulas, diagrams, worked examples and labs.' },
    { id: 'practice', label: 'Practice', short: 'Practice', key: 'p', desc: 'Four scenarios with progressive hints and full solutions.' },
    { id: 'review', label: 'Review', short: 'Review', key: 'r', desc: 'Key concepts, formula sheets, common mistakes and what to revisit.' },
    { id: 'notes', label: 'My Notes', short: 'My Notes', key: 'n', desc: 'Your notes, linked to lessons and video times.' }
  ];
  var MODE = {};
  MODES.forEach(function (m) { MODE[m.id] = m; });

  var SITE = 'EE 211 Circuits';

  /* 24×24 line icons, stroke = currentColor */
  var ICON = {
    watch: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/>',
    understand: '<path d="M12 6.5C10 5 7 4.6 3.5 5v13c3.5-.4 6.5 0 8.5 1.5 2-1.5 5-1.9 8.5-1.5V5c-3.5-.4-6.5 0-8.5 1.5z"/><path d="M12 6.5v13"/>',
    practice: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    review: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/><path d="M12 8.5V12l2.6 1.8"/>',
    notes: '<path d="M6 3.5h9l4 4v13H6z"/><path d="M15 3.5v4h4M9 12h7M9 15.5h7M9 8.5h3"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
    pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3.2"/>',
    back: '<path d="M11.5 7l-5 5 5 5M18.5 7l-5 5 5 5"/>',
    fwd: '<path d="M12.5 7l5 5-5 5M5.5 7l5 5-5 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    expand: '<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/>',
    external: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    flag: '<path d="M5.5 21V4M5.5 4.5h11l-2.2 4 2.2 4h-11"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9.5a1 1 0 0 0 1 1h3.5"/>',
    trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    system: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    lab: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    transcript: '<path d="M4 6h16M4 10h16M4 14h10M4 18h13"/>',
    lessons: '<rect x="3" y="5" width="7" height="6" rx="1.2"/><rect x="3" y="13" width="7" height="6" rx="1.2"/><path d="M13 7h8M13 10h5M13 15h8M13 18h5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pill: '<path d="M5 12h14"/>',
    restore: '<rect x="4" y="6" width="16" height="12" rx="2"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    exam: '<path d="M6 3.5h9l4 4v13H6z"/><path d="M15 3.5v4h4"/><path d="M9 13.2l2.2 2.3 4.3-4.6"/>'
  };
  /* topic glyphs */
  var GLYPH = {
    deltawye: '<path d="M12 3.5 3 19.5h18z"/><path d="M12 3.5v10.2M12 13.7l-9 5.8M12 13.7l9 5.8"/><circle cx="12" cy="13.7" r="1.4" fill="currentColor" stroke="none"/>',
    thevenin: '<circle cx="6" cy="12" r="3.4"/><path d="M6 8.6V5h2.5l1.2-2 2 4 2-4 2 4 1.1-2H19.6M6 15.4V19h13.6"/><circle cx="20" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="20" cy="19" r="1.4" fill="currentColor" stroke="none"/>',
    srcxform: '<path d="M3.5 7v10M6.5 9.5v5"/><path d="M9.3 10h4.2m-1.6-1.6L13.5 10l-1.6 1.6M13.5 14H9.3m1.6-1.6L9.3 14l1.6 1.6"/><circle cx="18.4" cy="12" r="3.4"/><path d="M18.4 14.2V9.8m-1.4 1.4 1.4-1.4 1.4 1.4"/>',
    millman: '<path d="M3 4.5h18M3 19.5h18M6 4.5V9M6 15v4.5M12 4.5V9M12 15v4.5M18 4.5V9M18 15v4.5"/><rect x="4.6" y="9" width="2.8" height="6" rx=".6"/><rect x="10.6" y="9" width="2.8" height="6" rx=".6"/><rect x="16.6" y="9" width="2.8" height="6" rx=".6"/>',
    lc: '<path d="M3 3.5v17h18" opacity=".55"/><path d="M3 6.5h18" stroke-dasharray="2 2.2"/><path d="M3 20.5C5.5 12 9 8 21 7"/>',
    scope: '<rect x="2.5" y="4.5" width="19" height="15" rx="1.5"/><path d="M7.25 4.5v15M12 4.5v15M16.75 4.5v15M2.5 9.5h19M2.5 14.5h19" stroke-width=".9" opacity=".45"/><path d="M2.5 12Q4.9 5 7.25 12T12 12T16.75 12T21.5 12"/>'
  };

  /* ================================================================== small utilities */
  function $(sel, root) { return (root || doc).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function h(html) { var t = doc.createElement('template'); t.innerHTML = String(html).trim(); return t.content.firstElementChild; }
  function frag(html) { var t = doc.createElement('template'); t.innerHTML = String(html); return t.content; }
  function fmt(t) { return R.fmtTime(t || 0); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function debounce(fn, ms) { var t = null; var f = function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms || 200); }; f.flush = function () { clearTimeout(t); fn(); }; f.cancel = function () { clearTimeout(t); }; return f; }
  function reducedMotion() { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function isPhone() { return global.innerWidth < 720; }
  function icon(name, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICON[name] || '') + '</svg>'; }
  function glyph(tid, cls) { return '<svg class="glyph' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (GLYPH[tid] || '') + '</svg>'; }
  function pct(f) { return Math.round(Math.max(0, Math.min(1, f || 0)) * 100); }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : (b || a + 's')); }
  function ytUrl(l, t) { return 'https://www.youtube.com/watch?v=' + l.ytId + (t ? '&t=' + Math.floor(t) + 's' : ''); }
  function prefs() { return store.state.prefs || (store.state.prefs = {}); }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    var a = doc.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.rel = 'noopener';
    doc.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText && global.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = doc.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      doc.body.appendChild(ta); ta.select();
      var ok = false; try { ok = doc.execCommand('copy'); } catch (e) {}
      ta.remove();
      if (ok) resolve(); else reject(new Error('Copy is not allowed here'));
    });
  }

  /* ================================================================== store helpers (fall back when store.js lacks v2 helpers) */
  function has(name) { return typeof store[name] === 'function'; }
  var S = {
    lp: function (id) { return store.lessonProgress(id); },
    ln: function (id) { return store.lessonNotes(id); },
    pp: function (qid) { return store.practiceProgress(qid); },
    markWatched: function (id, t) {
      if (has('markWatched')) return store.markWatched(id, t);
      var p = store.lessonProgress(id), b = Math.floor(Math.max(0, t) / 10);
      var w = typeof p.watched === 'string' ? p.watched : '';
      if (w.length <= b) w += new Array(b - w.length + 2).join('0');
      if (w.charAt(b) !== '1') p.watched = w.slice(0, b) + '1' + w.slice(b + 1); else p.watched = w;
    },
    watchedFraction: function (id, duration, segments) {
      if (has('watchedFraction')) { try { return store.watchedFraction(id, duration, segments) || 0; } catch (e) { return 0; } }
      var p = store.state.progress.lessons[id];
      if (!p || typeof p.watched !== 'string' || !duration) return 0;
      var segs = (segments && segments.length) ? segments : [{ start: 0, end: duration }];
      var tot = 0, got = 0;
      for (var b = 0; b * 10 < duration; b++) {
        var mid = b * 10 + 5, inSeg = false;
        for (var i = 0; i < segs.length; i++) if (mid >= segs[i].start && mid < segs[i].end + 5) { inSeg = true; break; }
        if (!inSeg) continue;
        tot++; if (p.watched.charAt(b) === '1') got++;
      }
      return tot ? got / tot : 0;
    },
    /* true if the 10-s bucket containing t was watched (for chapter bars) */
    watchedAt: function (id, t) {
      var p = store.state.progress.lessons[id];
      if (!p || !p.watched) return false;
      if (typeof p.watched === 'string' && /^[01]*$/.test(p.watched)) return p.watched.charAt(Math.floor(t / 10)) === '1';
      return false;
    },
    setDone: function (id, v) {
      if (has('setDone')) return store.setDone(id, v);
      var p = store.lessonProgress(id); p.done = !!v; p.doneAt = v ? new Date().toISOString() : null; p.updated = Date.now(); store.save();
    },
    addNote: function (lessonId, o) {
      if (has('addNote')) return store.addNote(lessonId, o);
      var n = store.lessonNotes(lessonId);
      var it = { id: uid(), t: o.t == null ? null : Math.floor(o.t), text: o.text || '', created: Date.now(), updated: Date.now() };
      if (o.sec) it.sec = o.sec;
      n.items.push(it); n.updated = Date.now(); store.save();
      return it;
    },
    updateNote: function (lessonId, itemId, text) {
      if (has('updateNote')) return store.updateNote(lessonId, itemId, text);
      var n = store.lessonNotes(lessonId);
      n.items.forEach(function (it) { if (it.id === itemId) { it.text = text; it.updated = Date.now(); } });
      n.updated = Date.now(); store.save();
    },
    deleteNote: function (lessonId, itemId) {
      if (has('deleteNote')) return store.deleteNote(lessonId, itemId);
      var n = store.lessonNotes(lessonId), removed = null;
      n.items = n.items.filter(function (it) { if (it.id === itemId) { removed = it; return false; } return true; });
      store.save(); return removed;
    },
    restoreNote: function (lessonId, item) {
      if (has('restoreNote')) return store.restoreNote(lessonId, item);
      var n = store.lessonNotes(lessonId);
      if (!n.items.some(function (it) { return it.id === item.id; })) n.items.push(item);
      store.save();
    },
    sortedNotes: function (lessonId) {
      var n = store.state.notes.lessons[lessonId];
      return ((n && n.items) || []).slice().sort(function (a, b) { return (a.t == null ? 1e12 : a.t) - (b.t == null ? 1e12 : b.t) || (a.created || 0) - (b.created || 0); });
    },
    setFree: function (lessonId, text) { var n = store.lessonNotes(lessonId); n.free = text; n.updated = Date.now(); store.save(); },
    struggled: function (p) {
      if (!p) return false;
      if (has('struggled')) { try { return !!store.struggled(p); } catch (e) {} }
      if (p.recovered) return false;
      return !!(p.revealed || (p.wrong || 0) >= 2 || (p.hints || 0) >= 2 || p.flagged);
    },
    solvedOnOwn: function (p) { return !!(p && (p.solvedOnOwn || (p.solved && !p.revealed && p.solvedOnOwn !== false))); },
    topicUnderstanding: function (tid, ids) {
      if (has('topicUnderstanding')) { try { var r = store.topicUnderstanding(tid, ids); if (r) return r; } catch (e) {} }
      var out = { core: 0, help: 0, bonus: 0, revisit: 0 };
      ids.forEach(function (q) {
        var p = store.state.progress.practice[q];
        if (!p) return;
        var core = /-q\d+$/.test(q);
        if (core && S.solvedOnOwn(p)) out.core++;
        else if (core && p.solved) out.help++;
        if (!core && p.solved) out.bonus++;
        if (S.struggled(p)) out.revisit++;
      });
      return out;
    },
    revisitList: function (tid, opts) {
      if (has('revisitList')) { try { var r = store.revisitList(tid, opts); if (r) return r; } catch (e) {} }
      var out = [];
      Object.keys(store.state.progress.practice).forEach(function (q) {
        if (q.indexOf(tid + '-') !== 0) return;
        var p = store.state.progress.practice[q];
        if (S.struggled(p)) out.push({ type: 'question', qid: q, reasons: S.reasons(p) });
      });
      topicLessons(tid).forEach(function (l) {
        var p = store.state.progress.lessons[l.id];
        if (p && p.flags) Object.keys(p.flags).forEach(function (sec) { if (p.flags[sec]) out.push({ type: 'section', lessonId: l.id, secId: sec }); });
      });
      return out;
    },
    reasons: function (p) {
      if (has('struggleReasons')) { try { return (store.struggleReasons(p) || []).map(function (x) { return x && x.label != null ? x.label : String(x); }); } catch (e) {} }
      var r = [];
      if (!p) return r;
      if (p.recovered) return p.flagged ? ['flagged'] : r;
      if ((p.wrong || 0) >= 2) r.push(p.wrong + ' wrong tries');
      if (p.revealed) r.push('solution viewed');
      var hm = Math.max(p.hints || 0, p.hintsMax || 0);
      if (hm >= 2) r.push(hm + ' hints');
      if (p.flagged) r.push('flagged');
      return r;
    },
    labState: function (id) {
      if (has('labState')) return store.labState(id);
      var labs = store.state.labs || (store.state.labs = {});
      return labs[id] || null;
    },
    setLabState: function (id, values) {
      if (has('setLabState')) return store.setLabState(id, values);
      var labs = store.state.labs || (store.state.labs = {});
      labs[id] = values; store.save(600);
    }
  };

  /* ================================================================== data */
  var data = { lessons: [], byId: {}, related: {}, guideText: {}, guideTpl: {}, guideMeta: {}, tx: {}, practiceText: {}, practiceQs: {}, coverage: null };
  function fetchText(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status + ' ' + url); return r.text(); });
  }
  function fetchJSON(url) { return fetchText(url).then(JSON.parse); }
  function lesson(id) { return data.byId[id] || null; }
  function lessonsOf(tid, sub) {
    return data.lessons.filter(function (l) { return l.topic === tid && (!sub || sub === 'all' || l.sub === sub); })
      .sort(function (a, b) { return (a.sub || '').localeCompare(b.sub || '') || a.order - b.order; });
  }
  function topicLessons(tid, sub) {
    var t = TOPIC[tid];
    if (t && t.subs) {
      var out = [];
      t.subs.forEach(function (s) { if (!sub || sub === 'all' || sub === s.id) out = out.concat(lessonsOf(tid, s.id)); });
      return out;
    }
    return lessonsOf(tid);
  }
  function lessonGroups(tid, sub) {
    var t = TOPIC[tid];
    if (!t || !t.subs) return [{ sub: null, lessons: lessonsOf(tid) }];
    return t.subs.filter(function (s) { return !sub || sub === 'all' || s.id === sub; })
      .map(function (s) { return { sub: s, lessons: lessonsOf(tid, s.id) }; });
  }
  function lessonIndex(l) { var ls = topicLessons(l.topic); return { n: ls.indexOf(l) + 1, of: ls.length }; }
  function subTitle(tid, sub) { var t = TOPIC[tid]; var s = t && t.subs && t.subs.filter(function (x) { return x.id === sub; })[0]; return s ? s.title : ''; }
  function relevantDuration(l) {
    if (!l.segments || !l.segments.length) return l.durationSec || 0;
    return l.segments.reduce(function (a, s) { return a + Math.max(0, s.end - s.start); }, 0);
  }
  function lastLessonOf(tid) {
    var best = null, bestT = '';
    topicLessons(tid).forEach(function (l) {
      var p = store.state.progress.lessons[l.id];
      var seen = p && (p.lastSeen || (p.updated ? new Date(p.updated).toISOString() : ''));
      if (seen && seen > bestT) { bestT = seen; best = l; }
    });
    return best || topicLessons(tid)[0] || null;
  }

  /* one request per resource even when several callers ask at once; a failed request is forgotten so it can be retried */
  var inflight = {};
  function once(key, make) {
    if (inflight[key]) return inflight[key];
    var pr = make();
    inflight[key] = pr;
    pr.then(function () { delete inflight[key]; }, function () { delete inflight[key]; });
    return pr;
  }
  function guideText(id) {
    if (data.guideText[id] != null) return Promise.resolve(data.guideText[id]);
    return once('g:' + id, function () { return fetchText('data/guides/' + id + '.html').then(function (t) { data.guideText[id] = t; return t; }); });
  }
  /* Parsed, un-rendered guide (a <template>); clone from it, never render into it. */
  function guideTemplate(id) {
    if (data.guideTpl[id]) return Promise.resolve(data.guideTpl[id]);
    return guideText(id).then(function (t) {
      var tpl = doc.createElement('template'); tpl.innerHTML = t; data.guideTpl[id] = tpl; return tpl;
    });
  }
  /* Inline TeX (\( … \)) to readable plain text, for places that cannot render math (chips, titles, tooltips). */
  var TEX_SYM = { pi: 'π', omega: 'ω', Omega: 'Ω', tau: 'τ', Delta: 'Δ', delta: 'δ', theta: 'θ', phi: 'φ', varphi: 'φ', Phi: 'Φ', mu: 'μ', alpha: 'α', beta: 'β',
    gamma: 'γ', lambda: 'λ', sigma: 'σ', epsilon: 'ε', varepsilon: 'ε', rho: 'ρ', infty: '∞', cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', approx: '≈',
    le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', to: '→', rightarrow: '→', Rightarrow: '⇒', leftarrow: '←', leftrightarrow: '↔', parallel: '∥',
    angle: '∠', circ: '°', degree: '°', propto: '∝', sum: 'Σ', partial: '∂', ell: 'ℓ', prime: '′', ldots: '…', dots: '…', cdots: '…', quad: ' ', qquad: ' ' };
  function texToText(src) {
    var s = String(src);
    for (var i = 0; i < 4; i++) s = s.replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, function (_, a, b) { return (/[\s+\-]/.test(a.trim()) ? '(' + a + ')' : a) + '/' + (/[\s+\-]/.test(b.trim()) ? '(' + b + ')' : b); });
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\\(?:text|textrm|mathrm|mathbf|mathit|operatorname|boldsymbol|mathsf|textit|textbf|overline|vec|hat|bar)\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\(?:left|right|big|Big|bigg|Bigg)(?![a-zA-Z])/g, '')
      .replace(/\^\{?\\circ\}?/g, '°')
      .replace(/\\([a-zA-Z]+)(?:\s(?=[A-Za-z0-9]))?/g, function (m, w, off, str) {
        if (TEX_SYM[w] != null) return TEX_SYM[w];
        return (/^(sin|cos|tan|ln|log|exp|max|min|arctan)$/.test(w) && /[A-Za-z0-9}]/.test(str.charAt(off - 1)) ? ' ' : '') + w;   // V_{pk}\sin → "V_pk sin"
      })
      .replace(/\\[,;:! ]/g, ' ').replace(/\\%/g, '%').replace(/\\([{}_$&#])/g, '$1')
      .replace(/([_^])\{([^{}]*)\}/g, '$1$2')
      .replace(/[{}]/g, '');
    return s.replace(/\s+/g, ' ').trim();
  }
  function plainTitle(text) {
    return String(text).replace(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g, function (_, a, b) { return texToText(a != null ? a : b); }).replace(/\s+/g, ' ').trim();
  }
  function sectionTitle(sec) {
    var h2 = sec.querySelector(':scope > h2');
    if (!h2) return { text: sec.id, html: esc(sec.id) };
    var c = h2.cloneNode(true);
    $$('a.ts', c).forEach(function (a) { a.remove(); });
    return { text: plainTitle(c.textContent), html: c.innerHTML.trim() };
  }
  /* [{id, kind, title, titleHTML, t0, t1, index}] */
  function guideSections(id) {
    if (data.guideMeta[id]) return Promise.resolve(data.guideMeta[id]);
    return guideTemplate(id).then(function (tpl) {
      var out = $$('section.g-sec', tpl.content).map(function (s, i) {
        var tt = sectionTitle(s);
        var ts = (s.getAttribute('data-ts') || '').split('-').map(Number);
        var hasTs = ts.length === 2 && !isNaN(ts[0]) && !isNaN(ts[1]);
        return { id: s.id, kind: s.getAttribute('data-kind') || '', title: tt.text, titleHTML: tt.html,
          t0: hasTs ? ts[0] : null, t1: hasTs ? ts[1] : null, index: i };
      });
      data.guideMeta[id] = out;
      return out;
    });
  }
  /* Clone one guide section (secId may be any id inside it; empty = first section). Returns
     {section, targetId, title, titleHTML, kind, t0, t1} or null. The clone is not rendered yet. */
  function guideSection(id, secId) {
    return guideTemplate(id).then(function (tpl) {
      var root = tpl.content, el = null;
      if (secId) { try { el = root.querySelector('#' + (global.CSS && CSS.escape ? CSS.escape(secId) : secId)); } catch (e) { el = null; } }
      var sec = el ? (el.matches('section.g-sec') ? el : el.closest('section.g-sec')) : root.querySelector('section.g-sec');
      if (!sec) return null;
      var tt = sectionTitle(sec);
      var ts = (sec.getAttribute('data-ts') || '').split('-').map(Number);
      var clone = sec.cloneNode(true);
      var h2 = clone.querySelector(':scope > h2'); if (h2) h2.remove();
      return { section: clone, sectionId: sec.id, targetId: el && el !== sec ? secId : null, title: tt.text, titleHTML: tt.html,
        kind: sec.getAttribute('data-kind') || '', t0: ts.length === 2 && !isNaN(ts[0]) ? ts[0] : null, t1: ts.length === 2 && !isNaN(ts[1]) ? ts[1] : null };
    });
  }
  function transcript(id) {
    if (data.tx[id]) return Promise.resolve(data.tx[id]);
    return once('t:' + id, function () { return fetchJSON('data/transcripts/' + id + '.json').then(function (d) { data.tx[id] = d; return d; }); });
  }
  function practiceHTML(tid) {
    if (data.practiceText[tid] != null) return Promise.resolve(data.practiceText[tid]);
    return once('p:' + tid, function () { return fetchText('data/practice/' + tid + '.html').then(function (t) { data.practiceText[tid] = t; return t; }); });
  }
  /* [{qid, title, titleHTML, level, kind, bonus, num, label, sub}] */
  var LC_SUB = { 'lc-q1': 'Capacitors & inductors', 'lc-q2': 'Capacitors & RC', 'lc-q3': 'Inductors & RL', 'lc-q4': 'Capacitors & RC', 'lc-b1': 'Inductors & RL (AC)' };
  function practiceQuestions(tid) {
    if (data.practiceQs[tid]) return Promise.resolve(data.practiceQs[tid]);
    return once('q:' + tid, function () { return practiceQuestionsFrom(tid); });
  }
  function practiceQuestionsFrom(tid) {
    return practiceHTML(tid).then(function (t) {
      var tpl = doc.createElement('template'); tpl.innerHTML = t;
      var qs = $$('article.q', tpl.content).map(function (a) {
        var qid = a.id, b = /-b(\d+)$/.exec(qid), q = /-q(\d+)$/.exec(qid);
        var title = a.getAttribute('data-title') || qid;
        var tmp = doc.createElement('div'); tmp.innerHTML = title;
        var firstX = a.querySelector('.q-links a.xref, .q-hint a.xref, .q-solution a.xref, a.xref');
        var firstT = a.querySelector('a.ts');
        return { qid: qid, titleHTML: title, title: plainTitle(tmp.textContent), level: a.getAttribute('data-level'), kind: a.getAttribute('data-kind'),
          bonus: !!b, num: b ? 'B' + b[1] : (q ? q[1] : '?'), sub: LC_SUB[qid] || null,
          review: firstX ? { lessonId: firstX.getAttribute('data-lesson'), secId: firstX.getAttribute('data-sec') } : null,
          watch: firstT ? { lessonId: firstT.getAttribute('data-lesson'), t: R.parseTime(firstT.getAttribute('data-t')) } : null };
      });
      data.practiceQs[tid] = qs;
      return qs;
    });
  }
  function questionIds(tid) {
    var ids = [1, 2, 3, 4].map(function (n) { return tid + '-q' + n; });
    (data.practiceQs[tid] || []).forEach(function (q) { if (ids.indexOf(q.qid) < 0) ids.push(q.qid); });
    Object.keys(store.state.progress.practice || {}).forEach(function (q) { if (q.indexOf(tid + '-') === 0 && /-(q|b)\d+$/.test(q) && ids.indexOf(q) < 0) ids.push(q); });
    return ids;
  }

  /* ================================================================== progress */
  function lessonWatched(l) { return S.watchedFraction(l.id, l.durationSec, l.segments); }
  function topicStats(tid) {
    var ls = topicLessons(tid);
    var done = 0, wsum = 0, wtot = 0;
    ls.forEach(function (l) {
      var p = store.state.progress.lessons[l.id];
      if (p && p.done) done++;
      var d = relevantDuration(l); wtot += d; wsum += d * lessonWatched(l);
    });
    var u = S.topicUnderstanding(tid, questionIds(tid)) || {};
    return { lessons: ls.length, done: done, watched: wtot ? wsum / wtot : 0, core: u.core || 0, help: u.help || 0, bonus: u.bonus || 0, revisit: u.revisit || 0 };
  }
  /* 'new' | 'progress' | 'own' | 'help' | 'revisit' */
  function questionState(qid) {
    var p = store.state.progress.practice[qid];
    if (!p) return 'new';
    if (has('questionState')) {   /* THE rule (store.js), so pills, Home and the card chips agree; 'review' is 'revisit' here */
      try { var qs0 = store.questionState(p); if (qs0) return qs0 === 'review' ? 'revisit' : qs0; } catch (e) {}
    }
    if (p.flagged) return 'revisit';
    if (S.solvedOnOwn(p)) return 'own';
    if (p.solved) return 'help';
    if (S.struggled(p)) return 'revisit';
    var draft = p.draft && Object.keys(p.draft).some(function (k) { return p.draft[k] !== '' && p.draft[k] != null; });
    if (p.attempts || p.hints || draft) return 'progress';
    return 'new';
  }
  var QSTATE_LABEL = { 'new': 'Not started', progress: 'In progress', own: 'Solved on your own', help: 'Solved with help', revisit: 'Needs review' };

  /* ================================================================== UI helpers */
  function btn(label, o) {
    o = o || {};
    var cls = 'btn' + (o.kind ? ' ' + o.kind : '') + (o.small ? ' small' : '') + (o.cls ? ' ' + o.cls : '');
    var inner = (o.icon ? icon(o.icon) : '') + (label ? '<span>' + esc(label) + '</span>' : '');
    var attrs = o.attrs || '';
    if (o.title) attrs += ' title="' + esc(o.title) + '"';
    if (o.aria) attrs += ' aria-label="' + esc(o.aria) + '"';
    if (o.href) return '<a class="' + cls + '" href="' + esc(o.href) + '"' + (o.external ? ' target="_blank" rel="noopener"' : '') + attrs + '>' + inner + (o.external ? icon('external', 'ext') : '') + '</a>';
    return '<button type="button" class="' + cls + '"' + attrs + '>' + inner + '</button>';
  }
  function chip(text, kind, o) { o = o || {}; return '<span class="chip' + (kind ? ' ' + kind : '') + '"' + (o.title ? ' title="' + esc(o.title) + '"' : '') + '>' + (o.icon ? icon(o.icon) : '') + esc(text) + '</span>'; }
  /* progress ring: frac 0..1; animates its fill on insert */
  function ring(frac, o) {
    o = o || {};
    var size = o.size || 44, sw = o.stroke || 4, r = (size - sw) / 2, c = 2 * Math.PI * r;
    var off = c * (1 - Math.max(0, Math.min(1, frac || 0)));
    return '<svg class="ring' + (o.cls ? ' ' + o.cls : '') + '" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" aria-hidden="true" focusable="false">' +
      '<circle class="ring-track" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + sw + '"/>' +
      '<circle class="ring-fill" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + sw + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')" style="--c:' + c.toFixed(2) + ';stroke-dasharray:' + c.toFixed(2) + ';stroke-dashoffset:' + off.toFixed(2) + '"/>' +
      (o.text != null ? '<text x="50%" y="50%" class="ring-text" dominant-baseline="central" text-anchor="middle">' + esc(o.text) + '</text>' : '') + '</svg>';
  }
  /* four diamonds: solved on own (filled), with help (outlined + dot), not yet (empty) */
  function diamonds(core, helpN, total) {
    total = total || 4; core = Math.min(core || 0, total); helpN = Math.min(helpN || 0, total - core);
    var s = '';
    for (var i = 0; i < total; i++) {
      var st = i < core ? 'on' : (i < core + helpN ? 'help' : 'off');
      s += '<svg class="dia ' + st + '" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M7 1.2 12.8 7 7 12.8 1.2 7z"/>' + (st === 'help' ? '<circle cx="7" cy="7" r="1.6"/>' : '') + '</svg>';
    }
    var label = core + ' of ' + total + ' core scenarios solved on your own' + (helpN ? ', ' + helpN + ' solved with help' : '');
    return '<span class="dias" role="img" aria-label="' + esc(label) + '">' + s + '</span>';
  }
  /* segmented control (buttons with aria-pressed). options: [{value, label, icon?, title?}] */
  function seg(o) {
    var el = h('<div class="seg' + (o.small ? ' small' : '') + (o.cls ? ' ' + o.cls : '') + '" role="group"' + (o.label ? ' aria-label="' + esc(o.label) + '"' : '') + '></div>');
    o.options.forEach(function (op) {
      var b = h('<button type="button" class="seg-btn" data-value="' + esc(op.value) + '"' + (op.title ? ' title="' + esc(op.title) + '"' : '') + '>' + (op.icon ? icon(op.icon) : '') + '<span>' + esc(op.label) + '</span></button>');
      el.appendChild(b);
    });
    function set(v, fire) {
      $$('.seg-btn', el).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-value') === String(v))); });
      el.value = v;
      if (fire && o.onChange) o.onChange(v);
    }
    el.addEventListener('click', function (e) { var b = e.target.closest('.seg-btn'); if (b) set(b.getAttribute('data-value'), true); });
    el.set = set;
    set(o.value, false);
    return el;
  }
  function empty(o) {
    return '<div class="empty">' + (o.icon ? '<div class="empty-ic">' + icon(o.icon) + '</div>' : '') +
      '<p class="empty-title">' + esc(o.title || '') + '</p>' + (o.text ? '<p class="empty-text">' + o.text + '</p>' : '') +
      (o.actions ? '<div class="empty-actions">' + o.actions + '</div>' : '') + '</div>';
  }
  var saveWatchers = [];
  function saveStatus(o) {
    o = o || {};
    var el = h('<span class="save-status" role="status"></span>');
    function upd(pulse) {
      if (!store.available) { el.textContent = 'Not saved: browser storage is unavailable. Export your notes.'; el.className = 'save-status bad'; return; }
      if (store.lastSaved) {
        el.innerHTML = icon('check') + '<span>Saved ' + esc(store.lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) + '</span>';
        el.className = 'save-status ok';
        if (pulse && !reducedMotion()) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
      } else el.textContent = o.idle || 'Saves automatically as you type';
    }
    upd(false);
    saveWatchers.push({ el: el, fn: upd });
    return el;
  }
  /* inline two-step confirm: replaces trigger with "question [yes] [cancel]" */
  function confirmInline(trigger, o) {
    var box = h('<span class="confirm" role="group"><span class="confirm-q">' + esc(o.question || 'Are you sure?') + '</span>' +
      btn(o.yes || 'Yes', { kind: o.danger ? 'danger' : 'primary', small: true, cls: 'c-yes' }) + btn(o.no || 'Cancel', { small: true, cls: 'c-no' }) + '</span>');
    trigger.hidden = true;
    trigger.parentNode.insertBefore(box, trigger.nextSibling);
    $('.c-no', box).focus();
    function done() { box.remove(); trigger.hidden = false; trigger.focus(); }
    $('.c-no', box).onclick = done;
    $('.c-yes', box).onclick = function () { box.remove(); trigger.hidden = false; o.onYes(); };
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); done(); } });
  }
  function renderContent(root, lessonOrId) {
    var l = typeof lessonOrId === 'string' ? lesson(lessonOrId) : lessonOrId;
    var errs = R.renderContent(root, { lessonId: l && l.id, duration: l && l.durationSec });
    if (errs.length && global.console) console.warn('Content problems' + (l ? ' (' + l.id + ')' : '') + ':', errs);
    return errs;
  }
  /* animated "check" toggle button: returns element with .set(bool) */
  function checkToggle(o) {
    var el = h('<button type="button" class="ctoggle' + (o.cls ? ' ' + o.cls : '') + '" aria-pressed="false"><span class="ctoggle-box"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="ctoggle-path" d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="ctoggle-label"></span></button>');
    function set(v) { el.setAttribute('aria-pressed', String(!!v)); $('.ctoggle-label', el).textContent = v ? (o.on || o.label) : (o.off || o.label); }
    el.addEventListener('click', function () { var v = el.getAttribute('aria-pressed') !== 'true'; set(v); if (o.onChange) o.onChange(v); });
    el.set = set; set(!!o.value);
    return el;
  }

  /* ================================================================== toasts & announcements */
  function toast(msg, o) {
    o = o || {};
    var box = $('#toasts');
    var t = h('<div class="toast' + (o.kind ? ' ' + o.kind : '') + '"><span class="toast-msg"></span></div>');   /* #toasts is the (polite) live region */
    $('.toast-msg', t).textContent = msg;
    if (o.action) {
      var b = h('<button type="button" class="toast-act"></button>'); b.textContent = o.action;
      b.onclick = function () { close(); if (o.onAction) o.onAction(); };
      t.appendChild(b);
    }
    var x = h('<button type="button" class="toast-x" aria-label="Dismiss">' + icon('close') + '</button>');
    x.onclick = close; t.appendChild(x);
    box.appendChild(t);
    while (box.children.length > 3) box.firstElementChild.remove();
    requestAnimationFrame(function () { t.classList.add('in'); });
    var ms = o.ms || (o.action ? 10000 : 3500), timer = setTimeout(close, ms), hover = false, focus = false, closed = false;
    function hold() { clearTimeout(timer); }
    function resume() { clearTimeout(timer); if (!hover && !focus && !closed) timer = setTimeout(close, o.action ? 4000 : 2500); }
    t.addEventListener('mouseenter', function () { hover = true; hold(); });
    t.addEventListener('mouseleave', function () { hover = false; resume(); });
    t.addEventListener('focusin', function () { focus = true; hold(); });
    t.addEventListener('focusout', function (e) { if (e.relatedTarget && t.contains(e.relatedTarget)) return; focus = false; resume(); });
    t.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    function close() {
      if (closed) return; closed = true;
      clearTimeout(timer);
      var hadFocus = t.contains(doc.activeElement);
      t.classList.remove('in'); t.classList.add('out');
      setTimeout(function () { t.remove(); }, reducedMotion() ? 0 : 220);
      if (hadFocus && main) { try { main.focus({ preventScroll: true }); } catch (e) {} }
    }
    return { close: close };
  }
  function announce(msg) {
    var el = $('#srLive'); if (!el) return;
    el.textContent = '';
    setTimeout(function () { el.textContent = msg; }, 60);
  }

  /* ================================================================== theme */
  function currentTheme() { var t = prefs().theme; return t === 'light' || t === 'dark' ? t : 'system'; }
  function applyTheme(t) {
    if (t !== 'light' && t !== 'dark') t = 'system';
    prefs().theme = t; store.save();
    syncTheme();
  }
  /* re-read prefs.theme (e.g. after a reset or restore) and update the page and the header control */
  function syncTheme() {
    var t = currentTheme(), root = doc.documentElement;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
    buildThemeCtl();
  }
  var themeOutsideBound = false;
  function themeOutside(e) {
    var box = $('#themeCtl'); if (!box || box.contains(e.target)) return;
    var m = $('.menu', box), b = $('.theme-btn', box);
    if (m && !m.hidden) { m.hidden = true; if (b) b.setAttribute('aria-expanded', 'false'); }
  }
  function buildThemeCtl() {
    var box = $('#themeCtl'); if (!box) return;
    var t = currentTheme();
    var names = { system: 'System', light: 'Light', dark: 'Dark' };
    var ic = { system: 'system', light: 'sun', dark: 'moon' };
    box.innerHTML = '<button type="button" class="hdr-btn theme-btn" aria-haspopup="menu" aria-expanded="false" title="Theme: ' + names[t] + '">' + icon(ic[t]) + '<span class="sr-only">Theme: ' + names[t] + '</span></button>' +
      '<div class="menu" role="menu" aria-label="Theme" hidden>' + ['system', 'light', 'dark'].map(function (k) {
        return '<button type="button" role="menuitemradio" class="menu-item" data-theme-v="' + k + '" aria-checked="' + (k === t) + '">' + icon(ic[k]) + '<span>' + names[k] + '</span>' + (k === t ? icon('check', 'menu-check') : '') + '</button>';
      }).join('') + '</div>';
    var b = $('.theme-btn', box), m = $('.menu', box);
    function open(v) {
      m.hidden = !v; b.setAttribute('aria-expanded', String(v));
      if (v) { var cur = $('[aria-checked="true"]', m) || $('.menu-item', m); cur.focus(); }
    }
    b.onclick = function () { open(m.hidden); };
    m.addEventListener('click', function (e) { var it = e.target.closest('.menu-item'); if (it) { applyTheme(it.getAttribute('data-theme-v')); $('.theme-btn', box).focus(); } });
    m.addEventListener('keydown', function (e) {
      var items = $$('.menu-item', m), i = items.indexOf(doc.activeElement);
      if (e.key === 'ArrowDown') { items[(i + 1) % items.length].focus(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { items[(i - 1 + items.length) % items.length].focus(); e.preventDefault(); }
      else if (e.key === 'Home' || e.key === 'PageUp') { items[0].focus(); e.preventDefault(); }
      else if (e.key === 'End' || e.key === 'PageDown') { items[items.length - 1].focus(); e.preventDefault(); }
      else if (e.key === 'Escape') { open(false); b.focus(); e.stopPropagation(); }
      else if (e.key === 'Tab') open(false);
    });
    if (!themeOutsideBound) { themeOutsideBound = true; doc.addEventListener('click', themeOutside, true); }
  }

  /* ================================================================== header: topic tabs + topics sheet */
  function buildTabs() {
    var nav = $('#topicTabs');
    nav.innerHTML = TOPICS.map(function (t) {
      return '<a class="tab" data-topic="' + t.id + '" href="#/t/' + t.id + '" title="' + esc(t.name) + '">' + glyph(t.id) + '<span class="tab-label">' + esc(t.short) + '</span></a>';
    }).join('');
  }
  function markTabs(tid, page) {
    $$('#topicTabs .tab').forEach(function (a) {
      var on = a.getAttribute('data-topic') === tid;
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      a.setAttribute('href', on ? '#/t/' + tid : modeHref(a.getAttribute('data-topic')));
    });
    $$('.hdr-actions [data-nav]').forEach(function (a) { if (a.getAttribute('data-nav') === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var tb = $('#topicsBtn');
    if (tb) {
      tb.innerHTML = (tid ? '<span class="tb-glyph" data-topic="' + tid + '">' + glyph(tid) + '</span>' : icon('grid')) +
        '<span class="topics-btn-label">' + esc(tid ? TOPIC[tid].short : 'Topics') + '</span>' + icon('down', 'tb-caret');
      tb.setAttribute('aria-label', 'Topics' + (tid ? ' (current: ' + TOPIC[tid].name + ')' : ''));
    }
  }
  var sheet = null;
  function buildSheet() {
    sheet = h('<dialog class="sheet" id="topicsSheet" aria-labelledby="sheetTitle"><div class="sheet-head"><h2 id="sheetTitle">Topics</h2>' +
      '<button type="button" class="icon-btn sheet-x" aria-label="Close">' + icon('close') + '</button></div><div class="sheet-body"></div></dialog>');
    doc.body.appendChild(sheet);
    $('.sheet-x', sheet).onclick = function () { sheet.close(); };
    sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.close(); if (e.target.closest('a')) sheet.close(); });
    $('#topicsBtn').onclick = function () { fillSheet(); sheet.showModal(); };
  }
  function fillSheet() {
    var cur = current && current.spec.tid;
    $('.sheet-body', sheet).innerHTML = '<ul class="sheet-list">' + TOPICS.map(function (t) {
      var st = topicStats(t.id);
      return '<li><a class="sheet-item" data-topic="' + t.id + '" href="' + modeHref(t.id) + '"' + (t.id === cur ? ' aria-current="page"' : '') + '>' +
        '<span class="sheet-glyph">' + glyph(t.id) + '</span><span class="sheet-text"><span class="sheet-name">' + esc(t.name) + '</span>' +
        '<span class="sheet-stats"><span class="mini-stat">' + ring(st.lessons ? st.done / st.lessons : 0, { size: 18, stroke: 3 }) + st.done + '/' + st.lessons + ' studied</span>' +
        '<span class="mini-stat">' + diamonds(st.core, st.help) + st.core + '/4 understood</span></span></span>' + icon('right', 'sheet-go') + '</a></li>';
    }).join('') + '</ul>' +
      '<div class="sheet-foot"><a href="#/" class="btn small">Home</a><a href="#/exams" class="btn small">' + icon('exam') + '<span>Past Exam Examples</span></a><a href="#/notes" class="btn small">All notes</a><a href="#/about" class="btn small">About</a></div>';
  }

  /* ================================================================== topic chrome: band + mode bar */
  var chromeTid = null;
  function statsHTML(tid) {
    var st = topicStats(tid);
    var sf = st.lessons ? st.done / st.lessons : 0;
    return '<div class="stat stat-studied" title="Studied: lessons you marked complete, and how much of the relevant video you have watched">' +
      ring(sf, { size: 46, stroke: 4.5 }) +
      '<div class="stat-text"><span class="stat-label">Studied</span><span class="stat-value">' + st.done + ' of ' + plural(st.lessons, 'lesson') + '</span>' +
      '<span class="stat-sub">' + pct(st.watched) + '% of video watched</span></div></div>' +
      '<div class="stat stat-understood" title="Understood: core practice scenarios you solved without viewing the solution">' +
      diamonds(st.core, st.help) +
      '<div class="stat-text"><span class="stat-label">Understood</span><span class="stat-value">' + st.core + ' of 4 scenarios</span>' +
      '<span class="stat-sub">' + (st.help ? st.help + ' solved with help' : 'solved on your own') + (st.revisit ? ' · ' + st.revisit + ' to revisit' : '') + '</span></div></div>';
  }
  function modeBarHTML(tid, mode) {
    return MODES.map(function (m) {
      return '<a class="mode-tab" data-mode="' + m.id + '" href="' + modeHref(tid, m.id) + '"' + (m.id === mode ? ' aria-current="page"' : '') + '>' +
        icon(m.id) + '<span class="mode-label">' + esc(m.label) + '</span><span class="mode-short">' + esc(m.short) + '</span></a>';
    }).join('');
  }
  function renderChrome(spec) {
    var box = $('#chrome');
    if (!spec || spec.kind !== 'topic') { box.innerHTML = ''; box.removeAttribute('data-topic'); chromeTid = null; doc.body.classList.remove('in-topic'); setBandH(); return; }
    var tid = spec.tid, t = TOPIC[tid];
    doc.body.classList.add('in-topic');
    if (chromeTid !== tid) {
      chromeTid = tid;
      box.setAttribute('data-topic', tid);
      box.innerHTML = '<section class="band" aria-label="' + esc(t.name) + ' progress"><div class="band-inner">' +
        '<div class="band-glyph">' + glyph(tid) + '</div>' +
        '<div class="band-text"><p class="band-name">' + esc(t.name) + (t.subs ? '' : '') + '</p><p class="band-blurb">' + esc(t.blurb) + '</p></div>' +
        '<div class="band-stats" id="bandStats">' + statsHTML(tid) + '</div></div></section>' +
        '<nav class="modebar" aria-label="Study modes"><div class="modebar-inner" id="modeTabs">' + modeBarHTML(tid, spec.mode) + '</div></nav>';
      if (!reducedMotion()) { box.classList.remove('chrome-enter'); void box.offsetWidth; box.classList.add('chrome-enter'); }
    } else {
      $('#modeTabs').innerHTML = modeBarHTML(tid, spec.mode);
    }
    box.setAttribute('data-mode', spec.mode);
    setBandH();
  }
  function refreshChrome() {
    var bs = $('#bandStats');
    if (bs && chromeTid) bs.innerHTML = statsHTML(chromeTid).replace(/class="ring"/g, 'class="ring no-anim"');
    if (sheet && sheet.open) fillSheet();
  }
  var bandRO = null;
  function setBandH() {
    var band = $('#chrome .band');
    var root = doc.documentElement;
    root.style.setProperty('--band-h', band ? band.offsetHeight + 'px' : '0px');
    if (global.ResizeObserver && !bandRO) {
      bandRO = new ResizeObserver(function () { var b = $('#chrome .band'); root.style.setProperty('--band-h', b ? b.offsetHeight + 'px' : '0px'); });
    }
    if (bandRO) { bandRO.disconnect(); if (band) bandRO.observe(band); }
  }

  /* ================================================================== peek drawer */
  var peekEl = null, peekState = null;
  function buildPeek() {
    peekEl = h('<dialog class="peek" id="peek" aria-labelledby="peekTitle">' +
      '<div class="peek-head"><div class="peek-heading"><p class="peek-kicker"></p><h2 id="peekTitle" class="peek-title"></h2></div>' +
      '<button type="button" class="icon-btn peek-x" aria-label="Close">' + icon('close') + '</button></div>' +
      '<div class="peek-body guide" tabindex="0"></div><div class="peek-foot"></div></dialog>');
    doc.body.appendChild(peekEl);
    $('.peek-x', peekEl).onclick = closePeek;
    peekEl.addEventListener('click', function (e) {
      if (e.target === peekEl) { var r = peekEl.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closePeek(); }
    });
    peekEl.addEventListener('cancel', function (e) { e.preventDefault(); closePeek(); });
  }
  function closePeek() {
    if (!peekEl || !peekEl.open) return;
    if (reducedMotion()) { peekEl.close(); return; }
    peekEl.classList.add('closing');
    setTimeout(function () { peekEl.classList.remove('closing'); if (peekEl.open) peekEl.close(); }, 180);
  }
  function openPeek(o) {
    var l = lesson(o.lessonId);
    if (!l) { toast('That lesson could not be found.'); return; }
    if (!peekEl) buildPeek();
    peekState = o;
    peekEl.setAttribute('data-topic', l.topic);
    $('.peek-kicker', peekEl).textContent = TOPIC[l.topic].name + ' · ' + l.title;
    $('.peek-title', peekEl).textContent = 'Loading…';
    var body = $('.peek-body', peekEl);
    body.innerHTML = '<p class="muted">Loading the study-guide section…</p>';
    $('.peek-foot', peekEl).innerHTML = '';
    if (!peekEl.open) { peekEl.classList.remove('closing'); peekEl.showModal(); }
    guideSection(l.id, o.secId).then(function (res) {
      if (peekState !== o) return;
      if (!res) { body.innerHTML = '<p>This section is not in the guide.</p>'; return; }
      $('.peek-title', peekEl).innerHTML = res.titleHTML;
      R.renderMath($('.peek-title', peekEl));
      body.innerHTML = '';
      body.setAttribute('data-lesson', l.id);
      res.section.classList.add('peek-sec');
      body.appendChild(res.section);
      renderContent(body, l);
      body.scrollTop = 0;
      var t = o.t != null ? o.t : res.t0;
      var foot = btn('Open in Understand', { kind: 'primary', icon: 'understand', href: href.understand(l.id, res.targetId || res.sectionId), cls: 'peek-open' });
      if (t != null) foot += btn('Play this part' + (res.t0 != null ? ' (' + fmt(t) + (res.t1 != null && o.t == null ? '–' + fmt(res.t1) : '') + ')' : ' (' + fmt(t) + ')'), { icon: 'play', cls: 'peek-play' });
      foot += btn('Close', { cls: 'peek-close' });
      $('.peek-foot', peekEl).innerHTML = foot;
      var pp = $('.peek-play', peekEl);
      if (pp) pp.onclick = function () { if (global.EEDock) global.EEDock.load(l.id, { t: t, play: true }); closePeek(); };
      $('.peek-close', peekEl).onclick = closePeek;
      $('.peek-open', peekEl).addEventListener('click', function () { closePeek(); });
      if (res.targetId) {
        var tg = body.querySelector('#' + (global.CSS && CSS.escape ? CSS.escape(res.targetId) : res.targetId));
        if (tg) { setTimeout(function () { tg.scrollIntoView({ block: 'start' }); tg.classList.add('flash-target'); setTimeout(function () { tg.classList.remove('flash-target'); }, 1700); }, 50); }
      }
      $('.peek-x', peekEl).focus();
    }).catch(function (e) { body.innerHTML = '<p class="diagram-error">Could not load the study guide (' + esc(e.message) + ').</p>'; });
  }

  /* ================================================================== help dialog */
  var helpEl = null;
  function openHelp() {
    if (!helpEl) {
      helpEl = h('<dialog class="sheet help-dlg" aria-labelledby="helpTitle"><div class="sheet-head"><h2 id="helpTitle">Keyboard shortcuts</h2>' +
        '<button type="button" class="icon-btn sheet-x" aria-label="Close">' + icon('close') + '</button></div><div class="sheet-body">' +
        '<p class="muted small">Shortcuts work anywhere except while you are typing in a box.</p>' +
        '<p class="keys-pref"><label class="tgl"><input type="checkbox" class="keys-on"><span>Use single-key shortcuts (turn off if you use speech input)</span></label></p>' +
        '<dl class="keys">' +
        '<dt><kbd>k</kbd></dt><dd>Play or pause the video</dd>' +
        '<dt><kbd>j</kbd> <kbd>l</kbd></dt><dd>Back / forward 10 seconds</dd>' +
        '<dt><kbd>n</kbd></dt><dd>New note at the current video time</dd>' +
        '<dt><kbd>/</kbd></dt><dd>Search in the current view (transcript, guide, notes)</dd>' +
        '<dt><kbd>g</kbd> then <kbd>w</kbd> <kbd>u</kbd> <kbd>p</kbd> <kbd>r</kbd> <kbd>n</kbd></dt><dd>Go to Watch, Understand, Practice, Review or My Notes</dd>' +
        '<dt><kbd>?</kbd></dt><dd>Show this list</dd>' +
        '<dt><kbd>Esc</kbd></dt><dd>Close a drawer, sheet or menu</dd>' +
        '<dt><kbd>Ctrl</kbd> + <kbd>Enter</kbd></dt><dd>Save the note you are typing</dd>' +
        '</dl><p class="small"><a href="#/about/help">How to use this site</a></p></div></dialog>');
      doc.body.appendChild(helpEl);
      $('.sheet-x', helpEl).onclick = function () { helpEl.close(); };
      helpEl.addEventListener('click', function (e) { if (e.target === helpEl || e.target.closest('a')) helpEl.close(); });
      $('.keys-on', helpEl).addEventListener('change', function (e) { setShortcuts(e.target.checked); });
    }
    $('.keys-on', helpEl).checked = shortcutsOn();
    if (!helpEl.open) helpEl.showModal();
  }
  /* WCAG 2.1.4: single-character shortcuts can be turned off (prefs.shortcuts === false) */
  function shortcutsOn() { return prefs().shortcuts !== false; }
  function setShortcuts(v) {
    prefs().shortcuts = !!v; store.save();
    toast(v ? 'Single-key shortcuts are on' : 'Single-key shortcuts are off. Turn them back on under About → How to use.');
    $$('.keys-on').forEach(function (c) { c.checked = !!v; });
  }
  function closeOverlays() {
    closePeek();
    if (sheet && sheet.open) sheet.close();
    if (helpEl && helpEl.open) helpEl.close();
  }

  /* ================================================================== routes & hrefs */
  var modeRoutes = {};   // in-memory: tid -> mode -> last hash used for that mode
  var href = {
    topic: function (tid) { return '#/t/' + tid; },
    mode: function (tid, mode) { return modeHref(tid, mode); },
    watch: function (lessonId, t, play) { var l = lesson(lessonId); if (!l) return '#/'; return '#/t/' + l.topic + '/watch/' + l.id + (t != null ? '?t=' + Math.floor(t) + (play ? '&play=1' : '') : ''); },
    understand: function (lessonId, secId) { var l = lesson(lessonId); if (!l) return '#/'; return '#/t/' + l.topic + '/understand/' + l.id + (secId ? '/' + secId : ''); },
    lab: function (tid, labId, presetId) { return '#/t/' + tid + '/understand/lab' + (labId ? '/' + labId : '') + (presetId ? '?preset=' + encodeURIComponent(presetId) : ''); },
    practice: function (tid, qid) { return '#/t/' + tid + '/practice' + (qid ? '/' + qid : ''); },
    review: function (tid) { return '#/t/' + tid + '/review'; },
    notes: function (tid) { return tid ? '#/t/' + tid + '/notes' : '#/notes'; }
  };
  function modeHref(tid, mode) {
    if (!mode) mode = (prefs().lastMode && prefs().lastMode[tid]) || 'watch';
    var m = modeRoutes[tid] && modeRoutes[tid][mode];
    return m || '#/t/' + tid + '/' + mode;
  }
  R.xrefHref = function (lessonId, secId) { return href.understand(lessonId, secId); };

  function parseHash(raw) {
    var hash = (raw != null ? raw : location.hash).replace(/^#/, '') || '/';
    var q = {}, qi = hash.indexOf('?'), path = hash;
    if (qi >= 0) {
      path = hash.slice(0, qi);
      hash.slice(qi + 1).split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); try { q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' ')); } catch (e) {} });
    }
    var parts = path.split('/').filter(Boolean).map(function (p) { try { return decodeURIComponent(p); } catch (e) { return p; } });
    return { hash: '#' + (hash.charAt(0) === '/' ? hash : '/' + hash), path: path, parts: parts, query: q };
  }
  function qs(q) { var k = Object.keys(q || {}).filter(function (x) { return q[x] != null && q[x] !== ''; }); return k.length ? '?' + k.map(function (x) { return encodeURIComponent(x) + '=' + encodeURIComponent(q[x]); }).join('&') : ''; }
  function legacy(r) {
    var p = r.parts, q = r.query;
    if (p[0] === 'lesson' && p[1]) {
      var l = lesson(p[1]); if (!l) return '#/';
      if (p[2]) return '#/t/' + l.topic + '/understand/' + l.id + '/' + p[2];
      return '#/t/' + l.topic + '/watch/' + l.id + (q.t != null ? '?t=' + Math.floor(parseFloat(q.t) || 0) : '');
    }
    if (p[0] === 'topic' && p[1]) return '#/t/' + p[1] + (p[2] ? '/watch?sub=' + p[2] : '');
    if (p[0] === 'practice' && p[1]) return '#/t/' + p[1] + '/practice' + (p[2] ? '/' + p[2] : '');
    if (p[0] === 'coverage') return '#/about/coverage';
    if (p[0] === 'help') return '#/about/help';
    if (p[0] === 'topics') return '#/';
    return null;
  }
  function resolve(r) {
    var p = r.parts;
    if (!p.length) return { kind: 'page', name: 'home', params: [], query: r.query, hash: r.hash };
    if (p[0] === 't') {
      var tid = p[1];
      if (!TOPIC[tid]) return { kind: 'page', name: 'notfound', params: [], query: r.query, hash: r.hash };
      var mode = p[2];
      if (!mode) return { redirect: '#/t/' + tid + '/' + ((prefs().lastMode && prefs().lastMode[tid]) || 'watch') + qs(r.query) };
      if (!MODE[mode]) return { kind: 'page', name: 'notfound', params: [], query: r.query, hash: r.hash };
      return { kind: 'topic', tid: tid, mode: mode, params: p.slice(3), query: r.query, hash: r.hash };
    }
    if (p[0] === 'notes' || p[0] === 'about' || p[0] === 'exams') return { kind: 'page', name: p[0], params: p.slice(1), query: r.query, hash: r.hash };
    return { kind: 'page', name: 'notfound', params: [], query: r.query, hash: r.hash };
  }

  /* ================================================================== view registry & rendering */
  var views = {}, modes = {};
  function registerView(name, def) { views[name] = def; }
  function registerMode(id, def) { modes[id] = def; }
  var current = null;     // {spec, ctx, def}
  var scrollMem = {};
  var main = null;

  function makeCtx(spec, el) {
    var cleanups = [];
    var t = spec.tid ? TOPIC[spec.tid] : null;
    var ctx = {
      kind: spec.kind, view: spec.name || null, tid: spec.tid || null, topic: t, mode: spec.mode || null,
      params: spec.params || [], query: spec.query || {}, hash: spec.hash, el: el, container: el,
      sub: null, shortcuts: {}, manageScroll: false, title: null,
      onCleanup: function (f) { cleanups.push(f); },
      alive: function () { return !!current && current.ctx === ctx; },
      setTitle: function (s) { ctx.title = s; setDocTitle(ctx); },
      setQuery: function (patch) {
        Object.keys(patch).forEach(function (k) { if (patch[k] == null || patch[k] === '') delete ctx.query[k]; else ctx.query[k] = String(patch[k]); });
        var base = ctx.hash.split('?')[0];
        ctx.hash = base + qs(ctx.query);
        if (current && current.ctx === ctx) current.spec.hash = ctx.hash;
        try { history.replaceState(history.state, '', ctx.hash); } catch (e) { location.replace(ctx.hash); }
        rememberRoute(ctx);
      },
      setPath: function (hash) {   /* change the URL without re-rendering (view already shows it) */
        var r = parseHash(hash);
        ctx.hash = r.hash; ctx.params = r.parts.slice(ctx.kind === 'topic' ? 3 : 1); ctx.query = r.query;
        if (current && current.ctx === ctx) current.spec.hash = ctx.hash;
        try { history.replaceState(history.state, '', r.hash); } catch (e) {}
        rememberRoute(ctx);
      },
      _cleanups: cleanups
    };
    if (t && t.subs) ctx.sub = spec.query.sub === 'rc' || spec.query.sub === 'rl' || spec.query.sub === 'all' ? spec.query.sub : (prefs().lcSub || 'all');
    return ctx;
  }
  function teardown() {
    if (!current) return;
    current.ctx._cleanups.slice().reverse().forEach(function (f) { try { f(); } catch (e) { if (global.console) console.error(e); } });
    current.ctx._cleanups.length = 0;
    current = null;
  }
  function setDocTitle(ctx) {
    var s;
    if (ctx.kind === 'topic') s = MODE[ctx.mode].label + (ctx.title ? ' · ' + ctx.title : '') + ' · ' + ctx.topic.name + ' — ' + SITE;
    else s = (ctx.title ? ctx.title + ' — ' : '') + SITE;
    doc.title = s;
  }
  function rememberRoute(ctx) {
    if (ctx.kind !== 'topic') return;
    modeRoutes[ctx.tid] = modeRoutes[ctx.tid] || {};
    modeRoutes[ctx.tid][ctx.mode] = ctx.hash;
    var pr = prefs();
    pr.lastRoute = ctx.hash;
    pr.lastMode = pr.lastMode || {};
    pr.lastMode[ctx.tid] = ctx.mode;
    pr.lastTopic = ctx.tid;
    store.save(800);
    var a = $('#modeTabs [data-mode="' + ctx.mode + '"]'); if (a) a.setAttribute('href', ctx.hash);
    markTabs(ctx.tid, null);
  }
  function focusView(container) {
    var h1 = container.querySelector('h1');
    if (!h1) return;
    if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
    try { h1.focus({ preventScroll: true }); } catch (e) { h1.focus(); }
  }
  function restoreScroll(key, ctx) {
    if (ctx.manageScroll) return;
    var y = scrollMem[key];
    global.scrollTo(0, y || 0);
  }

  function route() {
    var r = parseHash();
    var red = legacy(r);
    if (red) { location.replace(red); return; }
    var spec = resolve(r);
    if (spec.redirect) { location.replace(spec.redirect); return; }
    closeOverlays();

    // in-place update within the same topic mode (e.g. another lesson section)
    if (current && spec.kind === 'topic' && current.spec.kind === 'topic' && current.spec.tid === spec.tid && current.spec.mode === spec.mode && current.def && current.def.update) {
      var ctx0 = current.ctx, prev = { params: ctx0.params, query: ctx0.query, hash: ctx0.hash };
      ctx0.params = spec.params; ctx0.query = spec.query; ctx0.hash = spec.hash;
      var handled = false;
      try { handled = current.def.update(ctx0, prev) === true; } catch (e) { if (global.console) console.error(e); }
      if (handled) { current.spec = spec; setDocTitle(ctx0); rememberRoute(ctx0); return; }
      ctx0.params = prev.params; ctx0.query = prev.query; ctx0.hash = prev.hash;
    }

    if (current) scrollMem[current.ctx.hash] = global.scrollY;
    teardown();
    var def = spec.kind === 'topic' ? modes[spec.mode] : views[spec.name];
    if (!def) def = views.notfound;

    renderChrome(spec);
    markTabs(spec.tid || null, spec.kind === 'page' ? spec.name : null);
    doc.body.setAttribute('data-view', spec.kind === 'topic' ? spec.mode : spec.name);
    if (spec.tid) main.setAttribute('data-topic', spec.tid); else main.removeAttribute('data-topic');

    var el = doc.createElement('div');
    el.className = 'view' + (reducedMotion() ? '' : ' view-enter');
    el.setAttribute('data-view', spec.kind === 'topic' ? spec.mode : spec.name);
    main.innerHTML = '';
    main.appendChild(el);
    var ctx = makeCtx(spec, el);
    current = { spec: spec, ctx: ctx, def: def };
    var ret = null;
    try { ret = def.render(ctx); }
    catch (e) {
      if (global.console) console.error(e);
      el.innerHTML = '<div class="page"><h1>Something went wrong</h1><p>This view could not be shown (' + esc(e.message) + '). Try reloading the page.</p></div>';
    }
    if (typeof ret === 'function') ctx.onCleanup(ret);
    else if (ret && typeof ret.destroy === 'function') ctx.onCleanup(ret.destroy);

    setDocTitle(ctx);
    rememberRoute(ctx);
    var key = ctx.hash;
    restoreScroll(key, ctx);
    var ready = ret && typeof ret.then === 'function' ? ret : (ret && ret.ready && typeof ret.ready.then === 'function' ? ret.ready : null);
    if (ready) ready.then(function () { if (ctx.alive() && scrollMem[key]) restoreScroll(key, ctx); }, function () {});
    focusView(el);
    var label = spec.kind === 'topic' ? MODE[spec.mode].label + ', ' + TOPIC[spec.tid].name : (ctx.title || (spec.name === 'home' ? 'Home' : spec.name));
    announce(label);
  }
  function go(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }

  /* ================================================================== global links & shortcuts */
  function cssId(id) { return '#' + (global.CSS && CSS.escape ? CSS.escape(id) : id.replace(/([^\w-])/g, '\\$1')); }
  function flash(el) { el.classList.remove('flash-target'); void el.offsetWidth; el.classList.add('flash-target'); setTimeout(function () { el.classList.remove('flash-target'); }, 1700); }
  /* a plain in-page link (href="#id", not a "#/" route): scroll to the element in the current view (revealing it in
     Understand), open the guide section in the Peek drawer when it is not on this page, and never touch location.hash */
  function jumpToAnchor(id, link) {
    if (!id) return;
    if (id === 'main' || id === 'content') {
      var m = main || $('#main');
      if (m) { try { m.focus({ preventScroll: true }); } catch (e) { m.focus(); } m.scrollIntoView({ block: 'start' }); }
      return;
    }
    var inPeek = !!(peekEl && peekEl.contains(link));
    var scope = inPeek ? $('.peek-body', peekEl) : main;
    var target = null;
    try { target = scope && scope.querySelector(cssId(id)); } catch (e) { target = null; }
    var holder = link.closest('[data-lesson]');
    var lid = holder && holder.getAttribute('data-lesson');
    if (!lid || !lesson(lid)) { var pre = id.split('-')[0]; if (lesson(pre)) lid = pre; }
    if (!inPeek && current && lid && typeof current.ctx.onXref === 'function' && current.spec.mode === 'understand') {
      if (current.ctx.onXref({ lessonId: lid, secId: id, t: null }) === true) return;
    }
    if (target && target.getClientRects().length) {
      target.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
      if (!target.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(target.tagName)) target.setAttribute('tabindex', '-1');
      try { target.focus({ preventScroll: true }); } catch (e) {}
      flash(target);
      return;
    }
    if (lid) { openPeek({ lessonId: lid, secId: id }); return; }
    toast('That part of the page was not found.');
  }
  function onDocClick(e) {
    if (e.defaultPrevented || e.button !== 0) return;
    var pa = e.target.closest('a[href^="#"]');
    if (pa && !pa.classList.contains('ts') && !pa.classList.contains('xref')) {
      var hv = pa.getAttribute('href') || '';
      if (hv.charAt(1) !== '/') {
        e.preventDefault();
        var aid = hv.slice(1); try { aid = decodeURIComponent(aid); } catch (er) {}
        jumpToAnchor(aid, pa);
        return;
      }
    }
    var a = e.target.closest('a.ts');
    if (a) {
      e.preventDefault();
      var t = R.parseTime(a.getAttribute('data-t'));
      var holder = a.closest('[data-lesson]');
      var lid = a.getAttribute('data-lesson') || (holder && holder.getAttribute('data-lesson')) || (global.EEDock && global.EEDock.current().lessonId);
      if (!lid || isNaN(t)) return;
      if (global.EEDock) global.EEDock.load(lid, { t: t, play: true });
      announce('Playing ' + (lesson(lid) ? lesson(lid).title : 'the video') + ' from ' + fmt(t));
      return;
    }
    var x = e.target.closest('a.xref');
    if (x && x.getAttribute('data-lesson')) {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;   // let the browser open the real link
      e.preventDefault();
      var o = { lessonId: x.getAttribute('data-lesson'), secId: x.getAttribute('data-sec') || null, t: x.getAttribute('data-t') != null ? R.parseTime(x.getAttribute('data-t')) : null };
      var inPeek = peekEl && peekEl.contains(x);
      if (!inPeek && current && current.ctx.onXref && current.ctx.onXref(o) === true) return;
      if (!inPeek && current && current.spec.mode === 'understand') { go(href.understand(o.lessonId, o.secId)); return; }
      openPeek(o);
    }
  }
  var gPending = 0;
  function isTyping(t) { return t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable); }
  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(e.target)) return;
    if (!shortcutsOn()) { gPending = 0; return; }
    if (doc.querySelector('dialog[open]') && e.key !== '?') return;
    var k = e.key, ctx = current && current.ctx, D = global.EEDock;
    if (gPending && Date.now() - gPending < 1500) {
      gPending = 0;
      var m = MODES.filter(function (x) { return x.key === k; })[0];
      if (m) {
        var tid = (ctx && ctx.tid) || prefs().lastTopic || 'deltawye';
        e.preventDefault(); go(modeHref(tid, m.id));
      }
      return;
    }
    if (k === 'g') { gPending = Date.now(); return; }
    if (k === '?') { e.preventDefault(); openHelp(); return; }
    if (ctx && ctx.shortcuts && typeof ctx.shortcuts[k] === 'function') { if (ctx.shortcuts[k](e) !== false) { e.preventDefault(); return; } }
    if (k === '/') {
      var s = main.querySelector('[data-search]');
      if (s) { e.preventDefault(); s.focus(); if (s.select) s.select(); }
      return;
    }
    if (k === 'k' || k === 'j' || k === 'l' || k === 'n') {
      if (!D || !D.current().lessonId) { if (k !== 'n') toast('No video is loaded. Open Watch to start a lesson.'); else toast('Open a lesson in Watch to take a timestamped note.'); e.preventDefault(); return; }
      e.preventDefault();
      if (k === 'k') D.toggle();
      else if (k === 'j') D.nudge(-10);
      else if (k === 'l') D.nudge(10);
      else D.quickNote();
    }
  }

  /* ================================================================== store save fan-out */
  var refreshSoon = debounce(refreshChrome, 300);
  function onStoreSave() {
    saveWatchers = saveWatchers.filter(function (w) { return doc.body.contains(w.el); });
    saveWatchers.forEach(function (w) { try { w.fn(true); } catch (e) {} });
    refreshSoon();
  }

  /* ================================================================== not-found view */
  registerView('notfound', {
    render: function (ctx) {
      ctx.setTitle('Not found');
      ctx.el.innerHTML = '<div class="page narrow">' + empty({ icon: 'info', title: 'This page does not exist', text: 'The link may be from an older version of the site.', actions: btn('Go to the start page', { kind: 'primary', href: '#/' }) }).replace('<p class="empty-title">', '<h1 class="empty-title">').replace('This page does not exist</p>', 'This page does not exist</h1>') + '</div>';
    }
  });

  /* ================================================================== boot */
  function banner(html) { var b = $('#banner'); b.hidden = false; b.innerHTML = '<div class="banner-inner">' + html + '</div>'; }
  function boot() {
    main = $('#main');
    var nn = $('#navNotes'), na = $('#navAbout'), nx = $('#navExams');
    if (nx) { nx.insertAdjacentHTML('afterbegin', icon('exam')); nx.setAttribute('aria-label', 'Past Exam Examples'); nx.title = 'Past Exam Examples: real exam questions with worked solutions'; }
    if (nn) { nn.insertAdjacentHTML('afterbegin', icon('notes')); nn.setAttribute('aria-label', 'All notes'); nn.title = 'All notes'; }
    if (na) { na.insertAdjacentHTML('afterbegin', icon('info')); na.setAttribute('aria-label', 'About this site'); na.title = 'About: how to use, coverage, privacy'; }
    buildTabs();
    buildThemeCtl();
    buildSheet();
    store.onSave(onStoreSave);
    doc.addEventListener('click', onDocClick);
    doc.addEventListener('keydown', onKey);
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-color-scheme: dark)');
      var syncMeta = function () { /* theme-color follows the chosen theme */
        var dark = currentTheme() === 'dark' || (currentTheme() === 'system' && mq.matches);
        $$('meta[name="theme-color"]').forEach(function (m) { m.setAttribute('content', dark ? '#0c1015' : '#f4f6f9'); m.removeAttribute('media'); });
      };
      syncMeta();
      if (mq.addEventListener) mq.addEventListener('change', syncMeta);
      store.onSave(syncMeta);
    }
    if (!store.available) banner('Browser storage is unavailable (private window or blocked site data). Notes and progress will be lost when you close this tab. Use <a href="#/notes">All notes → Download backup</a> before leaving.');
    if (location.protocol === 'file:') banner('You opened the site as a file. The guides and the YouTube player need it to be served over http(s), for example from the published address.');
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    Promise.all([
      fetchJSON('data/lessons.json'),
      fetchJSON('data/related.json').catch(function () { return {}; })
    ]).then(function (res) {
      data.lessons = res[0]; data.related = res[1] || {};
      data.lessons.forEach(function (l) { data.byId[l.id] = l; });
      var b = $('#boot'); if (b) b.remove();
      if (global.EEDock && global.EEDock.init) global.EEDock.init();
      global.addEventListener('hashchange', route);
      route();
    }).catch(function (e) {
      main.innerHTML = '<div class="page narrow"><h1>Could not load the lesson catalog</h1><p>' + esc(e.message) + '</p><p>Check your connection and reload the page.</p></div>';
    });
  }

  /* ================================================================== public API */
  global.EEApp = {
    TOPICS: TOPICS, MODES: MODES, topic: function (id) { return TOPIC[id] || null; }, mode: function (id) { return MODE[id] || null; },
    registerView: registerView, registerMode: registerMode,
    get current() { return current ? current.ctx : null; },
    go: go, href: href, parseHash: parseHash, qs: qs,
    data: {
      lessons: function () { return data.lessons; }, lesson: lesson, lessonsOf: lessonsOf, topicLessons: topicLessons, lessonGroups: lessonGroups,
      lessonIndex: lessonIndex, lastLessonOf: lastLessonOf, relevantDuration: relevantDuration, subTitle: subTitle,
      related: function (tid) { return data.related[tid] || []; },
      guideText: guideText, guideTemplate: guideTemplate, guideSections: guideSections, guideSection: guideSection,
      transcript: transcript, practiceHTML: practiceHTML, practiceQuestions: practiceQuestions, questionIds: questionIds,
      coverageHTML: function () { if (data.coverage != null) return Promise.resolve(data.coverage); return fetchText('data/coverage.html').then(function (t) { data.coverage = t; return t; }); },
      fetchText: fetchText, fetchJSON: fetchJSON, ytUrl: ytUrl
    },
    store: S,
    progress: { topicStats: topicStats, lessonWatched: lessonWatched, questionState: questionState, QSTATE_LABEL: QSTATE_LABEL, refresh: refreshChrome },
    peek: { open: openPeek, close: closePeek, get isOpen() { return !!(peekEl && peekEl.open); } },
    toast: toast, announce: announce, openHelp: openHelp, closeOverlays: closeOverlays,
    theme: { apply: applyTheme, sync: syncTheme, current: currentTheme },
    shortcuts: { enabled: shortcutsOn, set: setShortcuts },
    text: { plain: plainTitle, tex: texToText },
    renderContent: renderContent,
    ui: { $: $, $$: $$, esc: esc, h: h, frag: frag, icon: icon, glyph: glyph, btn: btn, chip: chip, ring: ring, diamonds: diamonds, seg: seg, empty: empty,
      saveStatus: saveStatus, confirmInline: confirmInline, checkToggle: checkToggle, fmt: fmt, pct: pct, plural: plural, debounce: debounce, uid: uid, today: today,
      download: download, copyText: copyText, reducedMotion: reducedMotion, isPhone: isPhone },
    ICONS: ICON, GLYPHS: GLYPH,
    boot: boot
  };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})(window);
