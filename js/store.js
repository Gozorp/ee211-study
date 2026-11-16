/* Persistent state in localStorage (per browser, per origin).
 * Key stays 'ee211.v1' for backward compatibility; the blob's `version` is 2 (version 1 blobs are migrated on load).
 * Loads without a DOM (py_mini_racer): window/localStorage/setTimeout/addEventListener are all guarded.
 * See work/redesign/SPEC_PRACTICE_NOTES.md for the full API. */
(function (global) {
  'use strict';
  var KEY = 'ee211.v1';
  var VERSION = 2;
  var BUCKET = 10;           // seconds per "watched" bucket
  var HISTORY_CAP = 30;
  var LESSON_TOPIC = { dw: 'deltawye', tn: 'thevenin', st: 'srcxform', mt: 'millman', cl: 'lc', os: 'scope' };
  var state = null;
  var available = true;
  var listeners = [];
  var saveTimer = null;
  var lastSaved = null;

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function nowISO() { return new Date().toISOString(); }
  function later(f, ms) { return typeof setTimeout === 'function' ? setTimeout(f, ms) : (f(), null); }
  function cancel(t) { if (t != null && typeof clearTimeout === 'function') clearTimeout(t); }
  function ls() { try { return global.localStorage || null; } catch (e) { return null; } }

  function blankPrefs() {
    return { follow: true, theme: 'system', lastRoute: null, lastMode: {}, lcSub: 'all', exampleMode: 'steps', introDismissed: false, rate: 1 };
  }
  function blank() {
    return { version: VERSION, notes: { lessons: {}, topics: {} }, progress: { lessons: {}, practice: {} }, prefs: blankPrefs(), labs: {}, review: { cards: {} } };
  }

  /* ---------- normalisation (fills missing fields; migrates v1) ---------- */
  function fillLessonNotes(n) {
    if (!isObj(n)) n = {};
    if (typeof n.free !== 'string') n.free = n.free == null ? '' : String(n.free);
    if (!Array.isArray(n.items)) n.items = [];
    n.items = n.items.filter(isObj);
    if (!hasOwn(n, 'updated')) n.updated = null;
    return n;
  }
  function fillLessonProgress(p) {
    if (!isObj(p)) p = {};
    p.done = !!p.done;
    if (!isObj(p.secs)) p.secs = {};
    if (typeof p.pos !== 'number' || !isFinite(p.pos)) p.pos = 0;
    if (!hasOwn(p, 'updated')) p.updated = null;
    if (typeof p.watched !== 'string' || /[^01]/.test(p.watched)) p.watched = '';
    if (!isObj(p.flags)) p.flags = {};
    if (!isObj(p.collapsed)) p.collapsed = {};
    if (!hasOwn(p, 'doneAt')) p.doneAt = null;
    if (!hasOwn(p, 'lastSeen')) p.lastSeen = null;
    return p;
  }
  function fillPractice(p) {
    if (!isObj(p)) p = {};
    var v1 = !Array.isArray(p.history);   // entries written by the v1 engine have no history
    p.attempts = +p.attempts || 0;
    p.solved = !!p.solved;
    p.hints = +p.hints || 0;
    p.revealed = !!p.revealed;
    if (!isObj(p.last)) p.last = {};
    if (v1) {
      // Best inference from v1 fields: v1 kept `revealed` true only while the solution was open.
      p.solOpen = p.revealed;
      p.solvedOnOwn = p.solved && !p.revealed;
      p.firstTry = p.solved && p.attempts === 1 && p.hints === 0 && !p.revealed;
      p.cur = { checks: p.attempts, wrong: 0, revealed: p.revealed, solved: p.solved };
      p.history = [];
    }
    p.wrong = +p.wrong || 0;
    if (!isObj(p.draft)) p.draft = {};
    p.flagged = !!p.flagged;
    p.retries = +p.retries || 0;
    p.retryActive = !!p.retryActive;
    p.solvedOnOwn = !!p.solvedOnOwn;
    p.firstTry = !!p.firstTry;
    p.recovered = !!p.recovered;
    p.solOpen = !!p.solOpen;
    p.hintsMax = Math.max(+p.hintsMax || 0, p.hints);
    if (!isObj(p.cur)) p.cur = { checks: 0, wrong: 0, revealed: false, solved: false };
    p.cur.checks = +p.cur.checks || 0; p.cur.wrong = +p.cur.wrong || 0;
    p.cur.revealed = !!p.cur.revealed; p.cur.solved = !!p.cur.solved;
    if (p.history.length > HISTORY_CAP) p.history = p.history.slice(-HISTORY_CAP);
    if (!hasOwn(p, 'updated')) p.updated = null;
    return p;
  }
  function normalize(s) {
    if (!isObj(s)) s = {};
    var b = blank();
    s.notes = isObj(s.notes) ? s.notes : b.notes;
    s.notes.lessons = isObj(s.notes.lessons) ? s.notes.lessons : {};
    s.notes.topics = isObj(s.notes.topics) ? s.notes.topics : {};
    Object.keys(s.notes.lessons).forEach(function (id) { s.notes.lessons[id] = fillLessonNotes(s.notes.lessons[id]); });
    s.progress = isObj(s.progress) ? s.progress : b.progress;
    s.progress.lessons = isObj(s.progress.lessons) ? s.progress.lessons : {};
    s.progress.practice = isObj(s.progress.practice) ? s.progress.practice : {};
    Object.keys(s.progress.lessons).forEach(function (id) { s.progress.lessons[id] = fillLessonProgress(s.progress.lessons[id]); });
    Object.keys(s.progress.practice).forEach(function (id) { s.progress.practice[id] = fillPractice(s.progress.practice[id]); });
    s.prefs = isObj(s.prefs) ? s.prefs : {};
    var bp = blankPrefs();
    Object.keys(bp).forEach(function (k) { if (!hasOwn(s.prefs, k) || s.prefs[k] === undefined) s.prefs[k] = bp[k]; });
    if (!isObj(s.prefs.lastMode)) s.prefs.lastMode = {};
    if (['system', 'light', 'dark'].indexOf(s.prefs.theme) < 0) s.prefs.theme = 'system';
    s.labs = isObj(s.labs) ? s.labs : {};
    s.review = isObj(s.review) ? s.review : { cards: {} };
    s.review.cards = isObj(s.review.cards) ? s.review.cards : {};
    s.version = VERSION;
    return s;
  }

  function load() {
    var store = ls();
    var raw = null;
    try {
      raw = store ? store.getItem(KEY) : null;
      state = raw ? JSON.parse(raw) : blank();
    } catch (e) { state = blank(); }
    state = normalize(state);
    try {
      if (!store) throw new Error('no localStorage');
      store.setItem(KEY + '.probe', '1');
      store.removeItem(KEY + '.probe');
      available = true;
    } catch (e) { available = false; }
    return state;
  }

  function saveNow() {
    cancel(saveTimer);
    saveTimer = null;
    try {
      var store = ls();
      if (!store) throw new Error('no localStorage');
      store.setItem(KEY, JSON.stringify(state));
      lastSaved = new Date();
      available = true;
    } catch (e) {
      available = false;
    }
    listeners.forEach(function (f) { try { f(available, lastSaved); } catch (e) {} });
    return available;
  }

  function save(delay) {
    cancel(saveTimer);
    saveTimer = later(saveNow, delay == null ? 350 : delay);
  }

  /* ---------- lessons ---------- */
  function lessonNotes(id) {
    var n = state.notes.lessons[id];
    if (!isObj(n)) n = state.notes.lessons[id] = fillLessonNotes({});
    if (!Array.isArray(n.items)) n.items = [];
    return n;
  }
  function lessonProgress(id) {
    var p = state.progress.lessons[id];
    if (!isObj(p)) p = state.progress.lessons[id] = fillLessonProgress({});
    if (!isObj(p.secs)) fillLessonProgress(p);
    return p;
  }
  function markWatched(id, t) {
    if (typeof t !== 'number' || !isFinite(t) || t < 0) return false;
    var p = lessonProgress(id);
    var b = Math.floor(t / BUCKET);
    var w = p.watched || '';
    if (w.charAt(b) === '1') return false;
    while (w.length < b) w += '0';
    p.watched = w.slice(0, b) + '1' + w.slice(b + 1);
    p.lastSeen = nowISO();
    save(1000);
    return true;
  }
  function normSegments(duration, segments) {
    var segs = [];
    (segments || []).forEach(function (s) {
      var a = Array.isArray(s) ? s[0] : (s && s.start), e = Array.isArray(s) ? s[1] : (s && s.end);
      a = +a; e = +e;
      if (isFinite(a) && isFinite(e) && e > a) segs.push([Math.max(0, a), e]);
    });
    if (!segs.length && duration > 0) segs.push([0, duration]);
    return segs;
  }
  /* fraction (0..1) of the relevant range watched; `segments` = [{start,end}] or [[s,e]] (seconds); default whole video */
  function watchedFraction(id, duration, segments) {
    var p = state.progress.lessons[id];
    var w = (p && p.watched) || '';
    var segs = normSegments(+duration || 0, segments);
    var total = 0, seen = 0;
    segs.forEach(function (s) {
      total += s[1] - s[0];
      for (var b = Math.floor(s[0] / BUCKET); b * BUCKET < s[1]; b++) {
        if (w.charAt(b) !== '1') continue;
        var lo = Math.max(s[0], b * BUCKET), hi = Math.min(s[1], (b + 1) * BUCKET);
        if (hi > lo) seen += hi - lo;
      }
    });
    return total > 0 ? Math.min(1, seen / total) : 0;
  }
  function setDone(id, done) {
    var p = lessonProgress(id);
    p.done = !!done;
    p.doneAt = done ? (p.doneAt || nowISO()) : null;
    p.updated = Date.now();
    save();
    return p;
  }
  function touchLesson(id) { var p = lessonProgress(id); p.lastSeen = nowISO(); save(1000); return p; }
  function setFlag(lessonId, secId, on) {
    var p = lessonProgress(lessonId);
    if (on) p.flags[secId] = true; else delete p.flags[secId];
    p.updated = Date.now(); save();
    return !!on;
  }

  /* ---------- notes ---------- */
  var uidN = 0;
  function uid() { uidN++; return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + uidN.toString(36); }
  function sortItems(items) { items.sort(function (a, b) { return (a.t == null ? 1e12 : a.t) - (b.t == null ? 1e12 : b.t); }); }
  function addNote(lessonId, o) {
    o = o || {};
    var n = lessonNotes(lessonId);
    var it = { id: uid(), t: (typeof o.t === 'number' && isFinite(o.t)) ? Math.floor(o.t) : null, text: o.text || '', created: Date.now(), updated: Date.now() };
    if (o.sec) it.sec = o.sec;
    n.items.push(it); sortItems(n.items);
    n.updated = Date.now(); save();
    return it;
  }
  function findNote(lessonId, itemId) {
    var n = lessonNotes(lessonId);
    for (var i = 0; i < n.items.length; i++) if (n.items[i].id === itemId) return { n: n, i: i, item: n.items[i] };
    return null;
  }
  function updateNote(lessonId, itemId, text) {
    var f = findNote(lessonId, itemId);
    if (!f) return null;
    f.item.text = text; f.item.updated = Date.now(); f.n.updated = Date.now(); save();
    return f.item;
  }
  function deleteNote(lessonId, itemId) {
    var f = findNote(lessonId, itemId);
    if (!f) return null;
    f.n.items.splice(f.i, 1); f.n.updated = Date.now(); save();
    return f.item;
  }
  function restoreNote(lessonId, item) {
    if (!isObj(item)) return null;
    var n = lessonNotes(lessonId);
    if (!findNote(lessonId, item.id)) { n.items.push(item); sortItems(n.items); }
    n.updated = Date.now(); save();
    return item;
  }

  /* ---------- practice ---------- */
  function practiceProgress(qid) {
    var p = state.progress.practice[qid];
    if (!isObj(p)) p = state.progress.practice[qid] = fillPractice({ history: [] });
    else if (!Array.isArray(p.history) || !isObj(p.cur)) fillPractice(p);
    return p;
  }
  function logEvent(p, event, extra) {
    var e = { at: nowISO(), event: event };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    p.history.push(e);
    if (p.history.length > HISTORY_CAP) p.history.splice(0, p.history.length - HISTORY_CAP);
    p.updated = Date.now();
    return e;
  }
  /* the single struggle rule (practice cards, Review and Home all use this) */
  function struggled(p) {
    if (!p) return false;
    if (p.flagged) return true;
    if (p.recovered) return false;
    return !!(p.revealed || (p.wrong || 0) >= 2 || Math.max(p.hints || 0, p.hintsMax || 0) >= 2);
  }
  function struggleReasons(p) {
    var r = [];
    if (!p) return r;
    if (!p.recovered) {
      if ((p.wrong || 0) >= 2) r.push({ code: 'wrong', label: p.wrong + ' wrong tries' });
      if (p.revealed) r.push({ code: 'revealed', label: 'solution viewed' });
      var h = Math.max(p.hints || 0, p.hintsMax || 0);
      if (h >= 2) r.push({ code: 'hints', label: h + ' hints' });
    }
    if (p.flagged) r.push({ code: 'flagged', label: 'flagged' });
    return r;
  }
  function isStarted(p) {
    if (!p) return false;
    if (p.attempts || p.hints || p.revealed || p.solved || p.retries) return true;
    var d = p.draft || {};
    return Object.keys(d).some(function (k) { return d[k] != null && String(d[k]).trim() !== ''; });
  }
  /* 'new' | 'progress' | 'own' | 'help' | 'review' */
  function questionState(p) {
    if (!p) return 'new';
    if (p.flagged) return 'review';
    if (p.solvedOnOwn) return 'own';
    if (p.solved) return 'help';
    if (struggled(p)) return 'review';
    return isStarted(p) ? 'progress' : 'new';
  }
  function isBonus(qid) { return /-b\d+$/.test(qid); }
  function isCore(qid) { return /-q\d+$/.test(qid); }
  function topicQids(tid, questionIds) {
    var seen = {}, out = [];
    function add(q) { if (!seen[q]) { seen[q] = 1; out.push(q); } }
    (questionIds || []).forEach(add);
    if (tid) Object.keys(state.progress.practice).forEach(function (q) {
      if (q.indexOf(tid + '-') === 0 && (isCore(q) || isBonus(q)) && q.slice(tid.length + 1).match(/^[qb]\d+$/)) add(q);
    });
    return out;
  }
  function topicUnderstanding(tid, questionIds) {
    var r = { core: 0, help: 0, coreTotal: 0, bonus: 0, bonusHelp: 0, bonusTotal: 0, revisit: 0, started: 0 };
    topicQids(tid, questionIds).forEach(function (q) {
      var p = state.progress.practice[q];
      var bonus = isBonus(q);
      if (bonus) r.bonusTotal++; else r.coreTotal++;
      if (!p) return;
      if (isStarted(p)) r.started++;
      if (struggled(p)) r.revisit++;
      if (bonus) { if (p.solvedOnOwn) r.bonus++; else if (p.solved) r.bonusHelp++; }
      else { if (p.solvedOnOwn) r.core++; else if (p.solved) r.help++; }
    });
    if (r.coreTotal < 4 && (!questionIds || !questionIds.length)) r.coreTotal = 4;
    return r;
  }
  function lessonTopic(lessonId) { var m = /^([a-z]+)\d/.exec(lessonId || ''); return m ? LESSON_TOPIC[m[1]] || null : null; }
  /* opts: {questionIds:[], lessonIds:[], limit:n, sections:true, questions:true} ; tid null = all topics */
  function revisitList(tid, opts) {
    opts = opts || {};
    var out = [];
    if (opts.questions !== false) {
      var qids = tid ? topicQids(tid, opts.questionIds) : Object.keys(state.progress.practice).concat(opts.questionIds || []);
      var seen = {};
      qids.forEach(function (q) {
        if (seen[q]) return; seen[q] = 1;
        var p = state.progress.practice[q];
        if (!p || !struggled(p)) return;
        var rs = struggleReasons(p);
        out.push({ type: 'question', qid: q, tid: q.replace(/-[qb]\d+$/, ''), reasons: rs.map(function (x) { return x.label; }), codes: rs.map(function (x) { return x.code; }), solved: !!p.solved, solvedOnOwn: !!p.solvedOnOwn, updated: p.updated || 0 });
      });
      out.sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    }
    if (opts.sections !== false) {
      var lids = opts.lessonIds || Object.keys(state.progress.lessons).filter(function (l) { return !tid || lessonTopic(l) === tid; });
      lids.forEach(function (l) {
        var p = state.progress.lessons[l];
        if (!p || !p.flags) return;
        Object.keys(p.flags).forEach(function (s) { if (p.flags[s]) out.push({ type: 'section', lessonId: l, secId: s, tid: lessonTopic(l), reviewed: !!(p.secs && p.secs[s]) }); });
      });
    }
    return opts.limit ? out.slice(0, opts.limit) : out;
  }

  /* ---------- labs ---------- */
  function labState(id) { return hasOwn(state.labs, id) ? state.labs[id] : null; }
  function setLabState(id, values) { state.labs[id] = values; save(500); return values; }

  /* ---------- import / export ---------- */
  function exportJSON() { return JSON.stringify(state, null, 2); }
  function importJSON(text, merge) {
    var data = typeof text === 'string' ? JSON.parse(text) : text;
    if (!isObj(data) || !isObj(data.notes) || !isObj(data.progress)) throw new Error('This file is not an EE211 study-site backup.');
    if (data.version != null && (typeof data.version !== 'number' || data.version < 1)) throw new Error('This backup has an unknown format version.');
    data = normalize(JSON.parse(JSON.stringify(data)));
    var sum = { notesAdded: 0, freeNotesMerged: 0, topicNotesMerged: 0, lessonsMerged: 0, questionsMerged: 0, labsAdded: 0, cardsAdded: 0, replaced: !merge };
    if (!merge) { state = data; saveNow(); return sum; }
    Object.keys(data.notes.lessons).forEach(function (id) {
      var cur = lessonNotes(id), inc = data.notes.lessons[id];
      if (inc.free && inc.free !== cur.free && cur.free.indexOf(inc.free) < 0) { cur.free = cur.free ? cur.free + '\n\n--- imported ---\n' + inc.free : inc.free; sum.freeNotesMerged++; }
      var have = {};
      cur.items.forEach(function (it) { have[it.id] = 1; });
      inc.items.forEach(function (it) { if (!have[it.id]) { cur.items.push(it); sum.notesAdded++; } });
      sortItems(cur.items);
    });
    Object.keys(data.notes.topics).forEach(function (id) {
      var inc = data.notes.topics[id] || '';
      var cur = state.notes.topics[id] || '';
      if (inc && inc !== cur && cur.indexOf(inc) < 0) { state.notes.topics[id] = cur ? cur + '\n\n--- imported ---\n' + inc : inc; sum.topicNotesMerged++; }
    });
    Object.keys(data.progress.lessons).forEach(function (id) {
      var cur = lessonProgress(id), inc = data.progress.lessons[id];
      cur.done = cur.done || inc.done;
      if (inc.doneAt && (!cur.doneAt || inc.doneAt < cur.doneAt)) cur.doneAt = inc.doneAt;
      if (cur.done && !cur.doneAt) cur.doneAt = inc.doneAt || null;
      Object.keys(inc.secs).forEach(function (k) { if (inc.secs[k]) cur.secs[k] = true; });
      Object.keys(inc.flags).forEach(function (k) { if (inc.flags[k]) cur.flags[k] = true; });
      Object.keys(inc.collapsed).forEach(function (k) { if (inc.collapsed[k] && !hasOwn(cur.collapsed, k)) cur.collapsed[k] = true; });
      if (!cur.pos && inc.pos) cur.pos = inc.pos;
      var a = cur.watched, b = inc.watched, w = '';
      for (var i = 0; i < Math.max(a.length, b.length); i++) w += (a.charAt(i) === '1' || b.charAt(i) === '1') ? '1' : '0';
      cur.watched = w;
      if (inc.lastSeen && (!cur.lastSeen || inc.lastSeen > cur.lastSeen)) cur.lastSeen = inc.lastSeen;
      sum.lessonsMerged++;
    });
    Object.keys(data.progress.practice).forEach(function (id) {
      var had = hasOwn(state.progress.practice, id);
      var cur = practiceProgress(id), inc = data.progress.practice[id];
      if (!had) { state.progress.practice[id] = inc; sum.questionsMerged++; return; }
      cur.attempts = Math.max(cur.attempts, inc.attempts);
      cur.solved = cur.solved || inc.solved;
      cur.hints = Math.max(cur.hints, inc.hints);
      cur.hintsMax = Math.max(cur.hintsMax, inc.hintsMax, cur.hints);
      cur.revealed = cur.revealed || inc.revealed;
      cur.wrong = Math.max(cur.wrong, inc.wrong);
      cur.flagged = cur.flagged || inc.flagged;
      cur.retries = Math.max(cur.retries, inc.retries);
      cur.solvedOnOwn = cur.solvedOnOwn || inc.solvedOnOwn;
      cur.firstTry = cur.firstTry || inc.firstTry;
      cur.recovered = cur.recovered || inc.recovered;
      if (!Object.keys(cur.draft).length) cur.draft = inc.draft;
      if (!Object.keys(cur.last).length) cur.last = inc.last;
      var keys = {}, h = [];
      cur.history.concat(inc.history).forEach(function (e) { var k = e.at + '|' + e.event; if (!keys[k]) { keys[k] = 1; h.push(e); } });
      h.sort(function (x, y) { return x.at < y.at ? -1 : x.at > y.at ? 1 : 0; });
      cur.history = h.slice(-HISTORY_CAP);
      cur.updated = Math.max(cur.updated || 0, inc.updated || 0) || null;
      sum.questionsMerged++;
    });
    Object.keys(data.labs).forEach(function (id) { if (!hasOwn(state.labs, id)) { state.labs[id] = data.labs[id]; sum.labsAdded++; } });
    Object.keys(data.review.cards).forEach(function (tid) {
      var cur = state.review.cards[tid] = isObj(state.review.cards[tid]) ? state.review.cards[tid] : {};
      var inc = data.review.cards[tid] || {};
      Object.keys(inc).forEach(function (term) { if (!hasOwn(cur, term)) { cur[term] = inc[term]; sum.cardsAdded++; } });
    });
    var bp = blankPrefs();
    Object.keys(data.prefs).forEach(function (k) {
      if (!hasOwn(state.prefs, k) || (hasOwn(bp, k) && JSON.stringify(state.prefs[k]) === JSON.stringify(bp[k]) && k !== 'theme')) state.prefs[k] = data.prefs[k];
    });
    Object.keys(data.prefs.lastMode || {}).forEach(function (t) { if (!hasOwn(state.prefs.lastMode, t)) state.prefs.lastMode[t] = data.prefs.lastMode[t]; });
    saveNow();
    return sum;
  }

  load();
  global.EEStore = {
    get state() { return state; },
    get available() { return available; },
    get lastSaved() { return lastSaved; },
    KEY: KEY, VERSION: VERSION, BUCKET: BUCKET,
    save: save, saveNow: saveNow, reload: load, normalize: normalize,
    lessonNotes: lessonNotes, lessonProgress: lessonProgress, practiceProgress: practiceProgress,
    markWatched: markWatched, watchedFraction: watchedFraction, setDone: setDone, touchLesson: touchLesson, setFlag: setFlag,
    addNote: addNote, updateNote: updateNote, deleteNote: deleteNote, restoreNote: restoreNote,
    struggled: struggled, struggleReasons: struggleReasons, questionState: questionState, isStarted: isStarted, logEvent: logEvent,
    topicUnderstanding: topicUnderstanding, revisitList: revisitList, lessonTopic: lessonTopic,
    labState: labState, setLabState: setLabState,
    exportJSON: exportJSON, importJSON: importJSON,
    onSave: function (f) { listeners.push(f); },
    reset: function () { state = blank(); saveNow(); }
  };
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('beforeunload', function () { if (saveTimer) saveNow(); });
    global.addEventListener('pagehide', function () { if (saveTimer) saveNow(); });
  }
})(typeof window !== 'undefined' ? window : this);
