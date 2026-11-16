/* EE 211 — Understand mode (SHELL-B).
 * #/t/<tid>/understand[/<lessonId>[/<secId>]]           lesson study guide
 * #/t/<tid>/understand/lab[/<labId>][?preset=<id>]      the topic's interactive lab(s)
 *
 * Guide: lesson switcher (+ "Interactive lab" chip), sticky contents list with reviewed / flagged marks and progress,
 * collapsible section panels (time-range chip, Reviewed, Flag to revisit, + Note with the section's own notes),
 * toolbar (expand / collapse all, worked examples Step-by-step | Show all, + Note, print, find in guide),
 * worked-example stepper, lab-preset call-outs, robust deep-link scrolling. The guide HTML itself is never edited:
 * every section, figure, formula, aside, timestamp and cross-reference is rendered as delivered. */
(function (global) {
  'use strict';
  var A = global.EEApp, U = A.ui, S = A.store, store = global.EEStore;
  var esc = U.esc, icon = U.icon, $ = U.$, $$ = U.$$;
  var doc = global.document;

  var KIND = { overview: 'Overview', objectives: 'Objectives', prereqs: 'Before you start', definitions: 'Definitions',
    lesson: 'Lesson', assumptions: 'Assumptions', mistakes: 'Common mistakes', recap: 'Recap' };
  var KICON = {
    overview: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.1"/>',
    objectives: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    prereqs: '<path d="M4 19h5v-5h5V9h6"/><path d="M17 6l3 3-3 3"/>',
    definitions: '<path d="M6 4h10.5A2.5 2.5 0 0 1 19 6.5V20H8.5A2.5 2.5 0 0 1 6 17.5z"/><path d="M6 17.5A2.5 2.5 0 0 1 8.5 15H19"/>',
    lesson: '<path d="M12 6.5C10 5 7 4.6 3.5 5v13c3.5-.4 6.5 0 8.5 1.5 2-1.5 5-1.9 8.5-1.5V5c-3.5-.4-6.5 0-8.5 1.5z"/>',
    assumptions: '<rect x="4.5" y="4" width="15" height="16" rx="2.5"/><path d="M8 9h8M8 12.5h8M8 16h5"/>',
    mistakes: '<path d="M12 4.2 21 19.5H3z"/><path d="M12 10v4.2M12 16.8v.1"/>',
    recap: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>'
  };
  function kicon(kind) { return '<svg class="ic k-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (KICON[kind] || KICON.lesson) + '</svg>'; }

  var stepMem = {};   // example id -> number of revealed units (kept for the session, so switching modes keeps your place)

  function prefs() { return store.state.prefs || (store.state.prefs = {}); }
  function labs(tid, sub) { try { return global.EELabs ? global.EELabs.list(tid, sub && sub !== 'all' ? sub : null) : []; } catch (e) { return []; } }
  function presetsFor(lessonId, secId) { try { return global.EELabs && global.EELabs.findPreset ? global.EELabs.findPreset(lessonId, secId) : []; } catch (e) { return []; } }
  function narrow() { return global.innerWidth < 1024; }

  /* Pixels covered at the top of the viewport by sticky chrome (header, top mode bar, narrow contents bar). */
  function stickTop(root) {
    var y = 0, hdr = doc.getElementById('hdr');
    if (hdr) y = Math.max(0, hdr.getBoundingClientRect().height);
    var mb = doc.querySelector('.modebar');
    if (mb && getComputedStyle(mb).position === 'sticky') y += mb.offsetHeight;
    var toc = root && root.querySelector('.und-toc');
    if (toc && narrow() && getComputedStyle(toc).position === 'sticky') y += toc.querySelector('.toc-toggle').offsetHeight;
    var tools = root && root.querySelector('.und-tools');
    if (tools && getComputedStyle(tools).position === 'sticky') y += tools.offsetHeight;
    return y;
  }
  function scrollToEl(target, root, smooth) {
    var want = stickTop(root) + 12;
    var r = target.getBoundingClientRect();
    if (Math.abs(r.top - want) > 3) global.scrollTo({ top: Math.max(0, global.scrollY + r.top - want), behavior: smooth && !U.reducedMotion() ? 'smooth' : 'auto' });
  }

  /* lc: All · Capacitors & RC · Inductors & RL */
  function subSeg(ctx, onChange) {
    if (!ctx.topic || !ctx.topic.subs) return null;
    var opts = [{ value: 'all', label: 'All' }].concat(ctx.topic.subs.map(function (s) { return { value: s.id, label: s.title }; }));
    return U.seg({ label: 'Show lessons from', options: opts, value: ctx.sub || 'all', small: true, cls: 'sub-seg', onChange: function (v) {
      prefs().lcSub = v; store.save(600); ctx.sub = v; ctx.setQuery({ sub: v === 'all' ? null : v }); onChange(v);
    } });
  }

  function pickLesson(ctx) {
    var l = A.data.lesson(ctx.params[0]);
    if (l && l.topic === ctx.tid) return l;
    var last = A.data.lesson(prefs().lastGuide && prefs().lastGuide[ctx.tid]);
    var sub = ctx.sub && ctx.sub !== 'all' ? ctx.sub : null;
    if (last && last.topic === ctx.tid && (!sub || last.sub === sub)) return last;
    if (sub) { var ls = A.data.topicLessons(ctx.tid, sub); if (ls.length) return ls[0]; }
    return A.data.lastLessonOf(ctx.tid);
  }

  function switcherHTML(ctx, current) {
    var ls = labs(ctx.tid);
    var sub = ctx.sub && ctx.sub !== 'all' ? ctx.sub : 'all';
    var cur = A.data.lesson(current);
    if (cur && sub !== 'all' && cur.sub !== sub) sub = 'all';
    var html = '';
    if (ls.length) html += '<a class="chip-link lab-chip-link" href="' + A.href.lab(ctx.tid) + '"' + (current === 'lab' ? ' aria-current="page"' : '') + '>' + icon('lab') + '<span>Interactive lab</span></a>';
    A.data.lessonGroups(ctx.tid, sub).forEach(function (g) {
      if (g.sub) html += '<span class="chips-sep">' + esc(g.sub.title) + '</span>';
      g.lessons.forEach(function (l) {
        var p = store.state.progress.lessons[l.id] || {};
        html += '<a class="chip-link" href="' + A.href.understand(l.id) + '"' + (current === l.id ? ' aria-current="page"' : '') + ' title="' + esc(l.title) + (p.done ? ' (complete)' : '') + '">' +
          (p.done ? icon('check', 'cl-done') : '') + '<span class="cl-num">' + A.data.lessonIndex(l).n + '</span><span class="cl-title">' + esc(l.title) + '</span></a>';
      });
    });
    return html;
  }
  function topBar(ctx, current) {
    var bar = U.h('<div class="und-top"><nav class="und-switch chips" aria-label="Lessons and lab">' + switcherHTML(ctx, current) + '</nav></div>');
    var seg = subSeg(ctx, function () {
      if (current === 'lab') { $('.und-switch', bar).innerHTML = switcherHTML(ctx, current); return; }
      var cur = A.data.lesson(current);
      if (cur && ctx.sub !== 'all' && cur.sub !== ctx.sub) { A.go('#/t/' + ctx.tid + '/understand?sub=' + ctx.sub); return; }
      $('.und-switch', bar).innerHTML = switcherHTML(ctx, current);
    });
    if (seg) bar.insertBefore(seg, bar.firstChild);
    return bar;
  }

  /* ================================================================ worked-example stepper */
  function buildStepper(ex, key, l, getMode) {
    var kids = Array.prototype.slice.call(ex.childNodes);
    var steps = kids.filter(function (n) { return n.nodeType === 1 && n.classList.contains('step'); });
    if (steps.length < 2) return null;
    var units = [], cur = null, pending = [];
    for (var i = kids.indexOf(steps[0]); i < kids.length; i++) {
      var n = kids[i], isEl = n.nodeType === 1;
      if (isEl && n.classList.contains('step')) { cur = { type: 'step', nodes: pending.concat([n]) }; pending = []; units.push(cur); }
      else if (isEl && n.classList.contains('answer')) {
        if (cur && cur.type === 'answer') { cur.nodes = cur.nodes.concat(pending, [n]); }
        else { cur = { type: 'answer', nodes: pending.concat([n]) }; units.push(cur); }
        pending = [];
      }
      else if (cur.type === 'step') cur.nodes.push(n);
      else pending.push(n);
    }
    if (pending.length) cur.nodes = cur.nodes.concat(pending);
    units.forEach(function (u, k) {
      var w = doc.createElement('div');
      w.className = 'stp-unit stp-' + u.type;
      w.setAttribute('data-k', String(k + 1));
      var first = u.nodes.filter(function (x) { return x.parentNode === ex; })[0];
      ex.insertBefore(w, first);
      u.nodes.forEach(function (x) { w.appendChild(x); });
      u.el = w;
    });
    var nSteps = units.filter(function (u) { return u.type === 'step'; }).length;
    var N = units.length;
    var dots = units.map(function (u, k) { return '<span class="stp-dot' + (u.type === 'answer' ? ' ans' : '') + '" data-k="' + (k + 1) + '"></span>'; }).join('');
    var bar = U.h('<div class="stp-bar" role="group" aria-label="Worked example, step by step">' +
      '<p class="stp-hint">' + icon('practice') + '<span>Try it yourself first, then reveal the solution one step at a time.</span></p>' +
      '<div class="stp-row"><span class="stp-count mono" aria-hidden="true"></span><span class="stp-dots" aria-hidden="true">' + dots + '</span>' +
      '<span class="stp-btns">' + U.btn('Show next step', { kind: 'primary', small: true, cls: 'stp-next', icon: 'down' }) +
      U.btn('Show all steps', { kind: 'ghost', small: true, cls: 'stp-all' }) + U.btn('Start over', { kind: 'ghost', small: true, cls: 'stp-reset', icon: 'review' }) + '</span></div></div>');
    ex.classList.add('stp');
    var k = stepMem[key] != null ? Math.min(stepMem[key], N) : 0;
    var next = $('.stp-next', bar), all = $('.stp-all', bar), reset = $('.stp-reset', bar);

    function shownSteps() { var c = 0; for (var i = 0; i < k; i++) if (units[i].type === 'step') c++; return c; }
    function paint(animateIdx) {
      var stepsMode = getMode() === 'steps';
      ex.classList.toggle('stp-off', !stepsMode);
      units.forEach(function (u, i) { u.el.classList.toggle('stp-hidden', stepsMode && i >= k); u.el.classList.remove('stp-in'); });
      if (!stepsMode) { if (bar.parentNode) bar.remove(); return; }
      var anchor = k === 0 ? units[0].el : units[k - 1].el.nextSibling;
      var hadFocus = bar.contains(doc.activeElement) ? doc.activeElement : null;
      if (anchor !== bar) ex.insertBefore(bar, anchor);
      var done = k >= N;
      var nxt = units[k];
      $('span', next).textContent = nxt && nxt.type === 'answer' ? (shownSteps() < nSteps ? 'Show next part' : 'Show the answer') : 'Show next step';
      next.hidden = done; all.hidden = done; reset.hidden = k === 0;
      $('.stp-hint', bar).hidden = k > 0;
      var answerShown = units.slice(0, k).some(function (u) { return u.type === 'answer'; });
      $('.stp-count', bar).textContent = done ? 'All ' + N + ' parts shown' : 'Step ' + shownSteps() + ' of ' + nSteps + (answerShown ? ' · answer shown' : '');
      $$('.stp-dot', bar).forEach(function (d, i) { d.classList.toggle('on', i < k); });
      if (animateIdx != null && units[animateIdx] && !U.reducedMotion()) units[animateIdx].el.classList.add('stp-in');
      if (hadFocus) {
        var f = hadFocus.hidden ? (done ? reset : next) : hadFocus;
        try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
      }
    }
    function keepVisible() {
      var r = bar.getBoundingClientRect();
      var bottomGap = U.isPhone() ? 170 : (doc.body.classList.contains('dock-mini') ? 120 : 32);
      var limit = global.innerHeight - bottomGap;
      if (r.bottom > limit) global.scrollBy({ top: r.bottom - limit, behavior: U.reducedMotion() ? 'auto' : 'smooth' });
    }
    next.onclick = function () {
      if (k >= N) return; k++; stepMem[key] = k; paint(k - 1); keepVisible();
      var u = units[k - 1];
      A.announce(u.type === 'answer' ? 'Answer shown' : 'Step ' + shownSteps() + ' of ' + nSteps + ' shown');
    };
    all.onclick = function () { var from = k; k = N; stepMem[key] = k; paint(from); A.announce('All steps shown'); };
    reset.onclick = function () {
      k = 0; stepMem[key] = 0; paint(null);
      // measure against the page's own sticky chrome (toolbar on desktop, contents bar on narrow screens)
      var root = ex.closest('.understand');
      var r = ex.getBoundingClientRect(); if (r.top < stickTop(root) + 4) scrollToEl(ex, root, true);
      try { next.focus({ preventScroll: true }); } catch (e) {}
      A.announce('Steps hidden again. Start with step 1.');
    };
    paint(null);
    return {
      ex: ex,
      revealAll: function () { if (k < N) { k = N; stepMem[key] = k; paint(null); } },
      repaint: function () { paint(null); }
    };
  }

  /* ================================================================ guide */
  function render(ctx) {
    if (ctx.params[0] === 'lab') return renderLab(ctx);
    var l = pickLesson(ctx);
    if (!l) { ctx.el.innerHTML = '<div class="page"><h1>Understand</h1>' + U.empty({ title: 'No lessons yet' }) + '</div>'; return; }
    if (ctx.params[0] !== l.id) ctx.setPath(A.href.understand(l.id) + A.qs(ctx.query));
    prefs().lastGuide = prefs().lastGuide || {}; prefs().lastGuide[ctx.tid] = l.id; store.save(1000);
    ctx.setTitle(l.title);
    var secId = ctx.params[1] || null;
    ctx.manageScroll = !!secId;
    var idx = A.data.lessonIndex(l);
    var prog = S.lp(l.id);
    prog.secs = prog.secs || {}; prog.flags = prog.flags || {}; prog.collapsed = prog.collapsed || {};
    var exMode = function () { return prefs().exampleMode === 'all' ? 'all' : 'steps'; };
    var ls = A.data.topicLessons(ctx.tid);
    var nextL = ls[ls.indexOf(l) + 1] || null;
    var lessonLabs = labs(ctx.tid, l.sub);

    ctx.el.innerHTML = '<div class="page understand">' +
      '<div class="und-grid">' +
      ' <aside class="und-toc" aria-label="Contents">' +
      '  <button type="button" class="toc-toggle" aria-expanded="false" aria-controls="tocBody">' + icon('list') + '<span class="toc-toggle-text"><span class="toc-toggle-cur">Contents</span><span class="toc-toggle-prog mono"></span></span>' + icon('down', 'toc-toggle-caret') + '</button>' +
      '  <div class="toc-body" id="tocBody"><p class="toc-title">Contents</p><p class="toc-prog small"></p><div class="toc-bar" aria-hidden="true"><span></span></div><ol class="toc-list"></ol></div>' +
      ' </aside>' +
      ' <article class="und-main">' +
      '  <header class="page-head und-head"><p class="eyebrow">Lesson ' + idx.n + ' of ' + idx.of + (l.sub ? ' · ' + esc(A.data.subTitle(ctx.tid, l.sub)) : '') + '</p><h1>' + esc(l.title) + '</h1>' +
      '   <p class="und-meta small muted"></p>' +
      '   <div class="und-head-acts"><span class="und-done-slot"></span>' + U.btn('Watch this lesson', { small: true, kind: 'ghost', icon: 'watch', href: A.href.watch(l.id) }) + '</div>' +
      '  </header>' +
      '  <div class="und-tools" role="group" aria-label="Guide tools">' +
      '   <div class="tool-group">' + U.btn('Expand all', { small: true, kind: 'ghost', cls: 'g-exp', icon: 'down' }) + U.btn('Collapse all', { small: true, kind: 'ghost', cls: 'g-col', icon: 'up' }) + '</div>' +
      '   <div class="tool-group ex-mode"><span class="tool-label small">Worked examples</span></div>' +
      '   <div class="tool-group">' + U.btn('Note', { small: true, kind: 'ghost', cls: 'g-addnote', icon: 'plus', title: 'Add a note to the section you are reading (shortcut n)' }) + U.btn('Print', { small: true, kind: 'ghost', cls: 'g-print', title: 'Print the whole guide with every section and step shown' }) + '</div>' +
      '   <div class="und-find"><div class="search-box">' + icon('search') + '<input type="search" class="g-find" data-search placeholder="Find in this guide" aria-label="Find in this guide (press / )" autocomplete="off"></div>' +
      '    <span class="find-status small muted" role="status" aria-live="polite"></span>' +
      '    <span class="find-nav" hidden>' + U.btn('', { small: true, kind: 'ghost', cls: 'icon-only f-prev', icon: 'up', aria: 'Previous match' }) + U.btn('', { small: true, kind: 'ghost', cls: 'icon-only f-next', icon: 'down', aria: 'Next match' }) + '</span></div>' +
      '  </div>' +
      (lessonLabs.length ? '  <aside class="und-labcall" data-topic="' + ctx.tid + '"><span class="und-labcall-ic">' + icon('lab') + '</span><div class="und-labcall-text"><p class="und-labcall-title">Interactive lab: ' + esc(lessonLabs.map(function (d) { return d.title; }).join(' · ')) + '</p><p class="small muted">Change the circuit values and watch every result update. Look for "Try this example in the lab" after the sections with worked examples.</p></div>' +
        U.btn('Open the lab', { small: true, icon: 'lab', href: A.href.lab(ctx.tid, lessonLabs.length === 1 ? lessonLabs[0].id : null) }) + '</aside>' : '') +
      '  <div class="guide" id="gBody" data-lesson="' + l.id + '"><p class="muted">Loading the study guide…</p></div>' +
      '  <footer class="und-end card" hidden><div class="und-end-text"><p class="und-end-title">Finished this lesson?</p><p class="small muted">Marking it complete counts toward <em>Studied</em>. <em>Understood</em> comes from solving the practice scenarios on your own.</p></div><div class="und-end-acts"><span class="und-done-slot2"></span>' +
      (nextL ? U.btn('Next lesson: ' + nextL.title, { small: true, kind: 'ghost', icon: 'right', href: A.href.understand(nextL.id), cls: 'und-next' }) : '') +
      U.btn('Practice this topic', { small: true, kind: 'primary', icon: 'practice', href: A.href.practice(ctx.tid) }) + '</div></footer>' +
      ' </article></div></div>';
    var page = $('.understand', ctx.el);
    page.insertBefore(topBar(ctx, l.id), page.firstChild);

    var body = $('#gBody', ctx.el), toc = $('.toc-list', ctx.el), aside = $('.und-toc', ctx.el);
    var panels = [], steppers = [], active = null, findState = { q: '', hits: [], cur: -1 };

    // lesson complete toggles (head + end card, kept in sync)
    var doneTgls = [];
    function mkDone(slot) {
      var t = U.checkToggle({ on: 'Lesson complete', off: 'Mark lesson complete', value: !!prog.done, cls: 'small und-done', onChange: function (v) {
        S.setDone(l.id, v); doneTgls.forEach(function (x) { if (x !== t) x.set(v); });
        A.toast(v ? 'Lesson marked complete' : 'Lesson marked not complete');
        $$('.und-switch', ctx.el).forEach(function (n) { n.innerHTML = switcherHTML(ctx, l.id); });
      } });
      $(slot, ctx.el).appendChild(t); doneTgls.push(t);
    }
    mkDone('.und-done-slot'); mkDone('.und-done-slot2');

    // worked-example mode
    var modeSeg = U.seg({ label: 'Worked examples', small: true, value: exMode(), options: [{ value: 'steps', label: 'Step-by-step' }, { value: 'all', label: 'Show all' }], onChange: function (v) {
      prefs().exampleMode = v; store.save(600);
      steppers.forEach(function (s) { s.repaint(); });
      A.announce(v === 'all' ? 'Worked examples show every step' : 'Worked examples reveal one step at a time');
    } });
    $('.ex-mode', ctx.el).appendChild(modeSeg);

    $('.g-print', ctx.el).onclick = function () { global.print(); };

    function setCollapsed(panel, c, persist) {
      panel.classList.toggle('collapsed', c);
      var b = $('.g-toggle', panel); if (b) b.setAttribute('aria-expanded', String(!c));
      if (!c && !U.reducedMotion()) { var bd = $('.g-body', panel); bd.classList.remove('g-open'); void bd.offsetWidth; bd.classList.add('g-open'); }
      if (persist) { var id = panel.getAttribute('data-sec'); if (c) prog.collapsed[id] = true; else delete prog.collapsed[id]; store.save(1000); }
    }

    /* ---- notes linked to a section ---- */
    function secNotes(id) { return S.sortedNotes(l.id).filter(function (n) { return n.sec === id; }); }
    function paintNotes(p, flashId) {
      var box = $('.g-notes', p.el), items = secNotes(p.id);
      var cnt = $('.g-note .g-note-n', p.el); cnt.textContent = items.length ? String(items.length) : ''; cnt.hidden = !items.length;
      $('.g-note', p.el).setAttribute('aria-label', 'Add a note about this section' + (items.length ? ' (' + U.plural(items.length, 'note') + ' so far)' : ''));
      if (!items.length) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      box.innerHTML = '<p class="g-notes-title">' + icon('notes') + '<span>Your notes on this section</span><a class="small" href="' + A.href.notes(ctx.tid) + '">All my notes</a></p><ul class="g-notes-list"></ul>';
      var ul = $('ul', box);
      items.forEach(function (it) {
        var li = U.h('<li class="g-nitem">' + (it.t != null ? '<a class="ts g-nts" href="#" role="button" data-t="' + it.t + '" data-lesson="' + l.id + '" aria-label="Play the video from ' + U.fmt(it.t) + '">' + U.fmt(it.t) + '</a>' : '<span class="chip">No time</span>') +
          '<textarea class="g-ntext" rows="1" aria-label="Note text"></textarea><button type="button" class="icon-btn g-ndel" aria-label="Delete this note">' + icon('trash') + '</button></li>');
        var ta = $('textarea', li); ta.value = it.text || '';
        ta.addEventListener('input', function () { S.updateNote(l.id, it.id, ta.value); A.notesUI.autoGrow(ta); });
        $('.g-ndel', li).onclick = function () {
          var removed = S.deleteNote(l.id, it.id) || it;
          paintNotes(p);
          A.toast('Note deleted', { action: 'Undo', onAction: function () { S.restoreNote(l.id, removed); paintNotes(p, removed.id); } });
        };
        ul.appendChild(li);
        setTimeout(function () { A.notesUI.autoGrow(ta); }, 0);
        if (flashId === it.id) { li.classList.add('flash'); }
      });
    }
    function dockTimeHere() {
      var D = global.EEDock, c = D && D.current();
      return c && c.lessonId === l.id && !c.closed && c.t > 0 ? Math.floor(c.t) : null;
    }
    function openComposer(p, preferDock) {
      if (!p) return;
      if (p.el.classList.contains('collapsed')) setCollapsed(p.el, false, true);
      var old = $('.g-compose', p.el);
      if (old) { $('textarea', old).focus(); return; }
      var t = preferDock ? dockTimeHere() : null;
      if (t == null) t = p.t0;
      var f = U.h('<form class="g-compose" novalidate><label class="g-compose-label" for="gc-' + p.id + '">New note' + (t != null ? ' <span class="mono">at ' + U.fmt(t) + '</span>' : '') + ' · <span class="g-compose-sec"></span></label>' +
        '<textarea id="gc-' + p.id + '" rows="2" placeholder="What do you want to remember about this part?"></textarea>' +
        '<div class="g-compose-row">' + U.btn('Save note', { kind: 'primary', small: true, cls: 'gc-save', icon: 'check' }) + U.btn('Cancel', { kind: 'ghost', small: true, cls: 'gc-cancel' }) +
        (t != null ? '<label class="tgl small"><input type="checkbox" class="gc-time" checked><span>Link to ' + U.fmt(t) + ' in the video</span></label>' : '') +
        '<span class="muted small gc-hint">Ctrl+Enter saves</span></div></form>');
      $('.g-compose-sec', f).textContent = p.title;
      var bd = $('.g-body', p.el); bd.insertBefore(f, bd.firstChild);
      var ta = $('textarea', f);
      function close() { f.remove(); try { $('.g-note', p.el).focus({ preventScroll: true }); } catch (e) {} }
      function save() {
        var txt = ta.value.trim();
        if (!txt) { ta.focus(); ta.setAttribute('aria-invalid', 'true'); $('.gc-hint', f).textContent = 'Type the note first.'; return; }
        var tb = $('.gc-time', f);
        var it = S.addNote(l.id, { t: tb && tb.checked ? t : null, sec: p.id, text: txt });
        f.remove(); paintNotes(p, it && it.id);
        A.toast('Note saved' + (tb && tb.checked ? ' at ' + U.fmt(t) : ''), { action: 'Open My Notes', onAction: function () { A.go(A.href.notes(ctx.tid)); } });
      }
      $('.gc-save', f).onclick = save;
      $('.gc-cancel', f).onclick = close;
      f.addEventListener('submit', function (e) { e.preventDefault(); save(); });
      ta.addEventListener('input', function () { A.notesUI.autoGrow(ta); ta.removeAttribute('aria-invalid'); });
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      });
      var r = f.getBoundingClientRect();
      if (r.top < stickTop(ctx.el) || r.bottom > global.innerHeight - 80) scrollToEl(p.el, ctx.el, false);
      setTimeout(function () { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } }, 30);
    }

    /* ---- build ---- */
    var ready = A.data.guideText(l.id).then(function (html) {
      if (!ctx.alive()) return;
      body.innerHTML = html;
      A.renderContent(body, l);       // diagrams + KaTeX + timestamps on the guide exactly as delivered
      var secs = $$('section.g-sec', body), tocHtml = '';
      secs.forEach(function (s) {
        var kind = s.getAttribute('data-kind') || 'lesson';
        var h2 = s.querySelector(':scope > h2');
        var plainTitle = s.id;
        if (h2) { var hc = h2.cloneNode(true); $$('.katex-mathml', hc).forEach(function (x) { x.remove(); }); plainTitle = hc.textContent.replace(/[​‌‍]/g, '').replace(/\s+/g, ' ').trim(); }
        var tsr = (s.getAttribute('data-ts') || '').split('-').map(Number);
        var hasTs = tsr.length === 2 && !isNaN(tsr[0]) && !isNaN(tsr[1]);
        var panel = doc.createElement('div');
        panel.className = 'g-panel'; panel.id = 'p-' + s.id;
        panel.setAttribute('data-kind', kind); panel.setAttribute('data-sec', s.id);
        var head = U.h('<div class="g-head"><div class="g-acts"></div></div>');
        var tg = doc.createElement('button');
        tg.type = 'button'; tg.className = 'g-toggle'; tg.setAttribute('aria-expanded', 'true'); tg.setAttribute('aria-controls', 'b-' + s.id);
        tg.innerHTML = icon('down', 'g-caret') + '<span class="g-kind" data-kind="' + kind + '">' + kicon(kind) + '<span>' + esc(KIND[kind] || kind) + '</span></span>';
        var tt = doc.createElement('span'); tt.className = 'g-title';
        if (h2) { while (h2.firstChild) tt.appendChild(h2.firstChild); h2.appendChild(tg); h2.className = 'g-h'; }
        else { h2 = doc.createElement('h2'); h2.className = 'g-h'; tt.textContent = s.id; h2.appendChild(tg); }
        tg.appendChild(tt);
        head.insertBefore(h2, head.firstChild);
        var acts = $('.g-acts', head);
        if (hasTs) acts.appendChild(U.h('<a class="ts g-ts" href="#" role="button" data-t="' + tsr[0] + '" data-lesson="' + l.id + '" title="Play this part of the video" aria-label="Play this part of the video, ' + U.fmt(tsr[0]) + ' to ' + U.fmt(tsr[1]) + '">' + U.fmt(tsr[0]) + '–' + U.fmt(tsr[1]) + '</a>'));
        var p = { id: s.id, el: panel, sec: s, kind: kind, title: plainTitle, t0: hasTs ? tsr[0] : null, t1: hasTs ? tsr[1] : null };
        var rev = U.checkToggle({ label: 'Reviewed', value: !!prog.secs[s.id], cls: 'small g-rev', onChange: function (v) {
          if (v) prog.secs[s.id] = true; else delete prog.secs[s.id];
          panel.classList.toggle('reviewed', v); prog.updated = Date.now(); store.save(); updProg();
          if (v && secs.every(function (x) { return prog.secs[x.id]; }) && !prog.done) A.toast('Every section is reviewed.', { action: 'Mark lesson complete', onAction: function () { S.setDone(l.id, true); doneTgls.forEach(function (x) { x.set(true); }); } });
        } });
        rev.setAttribute('aria-label', 'Reviewed: ' + plainTitle);
        panel.classList.toggle('reviewed', !!prog.secs[s.id]);
        var flag = U.h('<button type="button" class="btn ghost small g-flag" aria-pressed="' + !!prog.flags[s.id] + '" title="Flag this section to revisit it from Review">' + icon('flag') + '<span class="g-flag-l">' + (prog.flags[s.id] ? 'Flagged' : 'Flag') + '</span></button>');
        flag.setAttribute('aria-label', 'Flag to revisit: ' + plainTitle);
        flag.onclick = function () {
          var v = flag.getAttribute('aria-pressed') !== 'true';
          flag.setAttribute('aria-pressed', String(v)); $('.g-flag-l', flag).textContent = v ? 'Flagged' : 'Flag';
          if (v) prog.flags[s.id] = true; else delete prog.flags[s.id];
          prog.updated = Date.now(); store.save(); updToc();
          A.toast(v ? 'Flagged. It is listed under Review → Revisit these.' : 'Flag removed');
        };
        var note = U.h('<button type="button" class="btn ghost small g-note" title="Add a note about this section">' + icon('plus') + '<span>Note</span><span class="g-note-n mono" hidden></span></button>');
        note.onclick = function () { openComposer(p, false); };
        acts.appendChild(rev); acts.appendChild(flag); acts.appendChild(note);
        var bd = doc.createElement('div'); bd.className = 'g-body'; bd.id = 'b-' + s.id;
        s.parentNode.insertBefore(panel, s);
        panel.appendChild(head); panel.appendChild(bd);
        bd.appendChild(U.h('<div class="g-notes" hidden></div>'));
        bd.appendChild(s);
        // lab presets for this section
        // lesson worked examples and "extra" scenarios (not from the videos) are listed apart, like the lab's own picker
        var fp = presetsFor(l.id, s.id);
        if (fp.length) {
          var fpLesson = fp.filter(function (x) { return !x.preset.extra; }), fpExtra = fp.filter(function (x) { return x.preset.extra; });
          var call = doc.createElement('div'); call.className = 'g-lab';
          [[fpLesson, fpLesson.length > 1 ? 'Try these examples in the interactive lab' : 'Try this example in the interactive lab', ''],
           [fpExtra, 'Also try in the lab (not from the videos)', ' g-lab-extra']].forEach(function (grp) {
            if (!grp[0].length) return;
            var row = U.h('<div class="g-lab-row' + grp[2] + '"><p class="g-lab-title">' + icon('lab') + '<span>' + grp[1] + '</span></p><div class="g-lab-btns"></div></div>');
            grp[0].forEach(function (x) {
              // link to the preset's own lab (an lc lesson's preset can belong to the rc or the rl lab)
              $('.g-lab-btns', row).insertAdjacentHTML('beforeend', U.btn(x.preset.label || x.preset.id, { small: true, icon: 'right', href: A.href.lab(x.lab.topic, x.lab.id, x.preset.id),
                title: 'Open the ' + x.lab.title + ' lab with ' + (x.preset.extra ? 'this scenario (not from the videos)' : 'these values') }));
            });
            call.appendChild(row);
          });
          bd.appendChild(call);
          if (global.EERender) global.EERender.renderMath(call);
        }
        if (prog.collapsed[s.id]) setCollapsed(panel, true, false);
        tg.addEventListener('click', function () { setCollapsed(panel, !panel.classList.contains('collapsed'), true); });
        panels.push(p);
        paintNotes(p);
        var th = tt.innerHTML, num = '';
        var m = /^\s*(\d+)\.\s*/.exec(tt.textContent);
        if (kind === 'lesson' && m) { num = m[1]; th = th.replace(/^\s*\d+\.\s*/, ''); }
        tocHtml += '<li data-sec="' + s.id + '" data-kind="' + kind + '"><a href="' + A.href.understand(l.id, s.id) + '"><span class="toc-k">' + (num ? '<span class="toc-num">' + num + '</span>' : kicon(kind)) + '</span><span class="toc-t">' + th + '</span><span class="toc-mk"></span></a></li>';
      });
      toc.innerHTML = tocHtml;
      // steppers
      $$('.example', body).forEach(function (ex, i) {
        var st = buildStepper(ex, ex.id || (l.id + '-example-' + i), l, exMode);
        if (st) steppers.push(st);
      });
      var nEx = $$('.example', body).length;
      $('.und-meta', ctx.el).innerHTML = U.plural(secs.length, 'section') + ' · ' + U.plural(nEx, 'worked example') + ' · video ' + U.fmt(l.durationSec || 0) +
        (l.scope === 'segment' && l.segmentNote ? ' · ' + esc(l.segmentNote) : '');
      $('.und-end', ctx.el).hidden = false;
      updProg();
      onScroll();
      setTimeout(function () { if (ctx.alive()) onScroll(); }, 80);   // after the shell restores the remembered scroll position
      if (secId) reveal(secId);
    }).catch(function (e) {
      if (!ctx.alive()) return;
      body.innerHTML = '<p class="diagram-error">The study guide for this lesson could not be loaded (' + esc(e.message) + '). Check your connection and reload the page.</p>';
    });

    /* ---- contents list ---- */
    function updToc() {
      $$('li[data-sec]', toc).forEach(function (li) {
        var id = li.getAttribute('data-sec');
        li.classList.toggle('done', !!prog.secs[id]); li.classList.toggle('flagged', !!prog.flags[id]);
        $('.toc-mk', li).innerHTML = (prog.secs[id] ? '<span class="mk-done" title="Reviewed">' + icon('check') + '<span class="sr-only">reviewed</span></span>' : '') +
          (prog.flags[id] ? '<span class="mk-flag" title="Flagged to revisit">' + icon('flag') + '<span class="sr-only">flagged</span></span>' : '');
      });
    }
    function updProg() {
      var k = panels.filter(function (p) { return prog.secs[p.id]; }).length;
      $('.toc-prog', ctx.el).textContent = k + ' of ' + panels.length + ' sections reviewed';
      $('.toc-toggle-prog', ctx.el).textContent = k + '/' + panels.length;
      $('.toc-bar span', ctx.el).style.width = (panels.length ? k / panels.length * 100 : 0) + '%';
      updToc();
    }
    function setTocOpen(v) {
      aside.classList.toggle('open', v);
      $('.toc-toggle', aside).setAttribute('aria-expanded', String(v));
    }
    $('.toc-toggle', aside).onclick = function () { setTocOpen(!aside.classList.contains('open')); };
    function outside(e) { if (aside.classList.contains('open') && !aside.contains(e.target)) setTocOpen(false); }
    doc.addEventListener('click', outside, true);
    ctx.onCleanup(function () { doc.removeEventListener('click', outside, true); });
    aside.addEventListener('keydown', function (e) { if (e.key === 'Escape' && aside.classList.contains('open')) { setTocOpen(false); $('.toc-toggle', aside).focus(); } });
    toc.addEventListener('click', function (e) {
      var a = e.target.closest('a'); if (!a) return;
      e.preventDefault();
      var id = a.closest('li').getAttribute('data-sec');
      setTocOpen(false);
      ctx.setPath(A.href.understand(l.id, id));
      reveal(id);
    });

    /* active section: the last panel whose top has passed the sticky chrome */
    var rafId = 0;
    function onScroll() {
      rafId = 0;
      if (!panels.length) return;
      var line = stickTop(ctx.el) + 90, cur = panels[0];
      for (var i = 0; i < panels.length; i++) {
        if (panels[i].el.offsetParent === null) continue;      // hidden by find
        if (panels[i].el.getBoundingClientRect().top <= line) cur = panels[i]; else break;
      }
      if (active === cur) return;
      active = cur;
      $$('li[data-sec]', toc).forEach(function (li) { var on = li.getAttribute('data-sec') === cur.id; li.classList.toggle('active', on); if (on) li.querySelector('a').setAttribute('aria-current', 'location'); else li.querySelector('a').removeAttribute('aria-current'); });
      $('.toc-toggle-cur', aside).textContent = cur.title;
      if (!narrow()) {
        var li = toc.querySelector('li.active'), box = aside;
        if (li && box.scrollHeight > box.clientHeight) {
          var lt = li.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop, top = box.scrollTop;
          if (lt < top + 40 || lt > top + box.clientHeight - 60) box.scrollTop = Math.max(0, lt - box.clientHeight / 3);
        }
      }
    }
    function sched() { if (!rafId) rafId = global.requestAnimationFrame(onScroll); }
    global.addEventListener('scroll', sched, { passive: true });
    global.addEventListener('resize', sched);
    ctx.onCleanup(function () { global.removeEventListener('scroll', sched); global.removeEventListener('resize', sched); if (rafId) global.cancelAnimationFrame(rafId); });

    /* ---- toolbar ---- */
    $('.g-exp', ctx.el).onclick = function () { panels.forEach(function (p) { setCollapsed(p.el, false, false); }); prog.collapsed = {}; store.save(1000); A.announce('All sections expanded'); };
    $('.g-col', ctx.el).onclick = function () { panels.forEach(function (p) { setCollapsed(p.el, true, false); prog.collapsed[p.id] = true; }); store.save(1000); A.announce('All sections collapsed'); };
    $('.g-addnote', ctx.el).onclick = function () { openComposer(active || panels[0], true); };
    ctx.shortcuts.n = function () { if (!panels.length) return false; openComposer(active || panels[0], true); };

    /* ---- find in guide ---- */
    var fInput = $('.g-find', ctx.el), fStatus = $('.find-status', ctx.el), fNav = $('.find-nav', ctx.el);
    function clearMarks() {
      $$('mark.g-hit', body).forEach(function (m) { var par = m.parentNode; par.replaceChild(doc.createTextNode(m.textContent), m); par.normalize(); });
    }
    var SKIP = '.katex, svg, script, style, .g-acts, .stp-bar, .g-notes, .g-compose, .g-lab, textarea, button.g-toggle > .g-kind';
    function markIn(root, q) {
      var w = doc.createTreeWalker(root, global.NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
        if (!n.nodeValue || n.nodeValue.toLowerCase().indexOf(q) < 0) return global.NodeFilter.FILTER_REJECT;
        return n.parentNode.closest(SKIP) ? global.NodeFilter.FILTER_REJECT : global.NodeFilter.FILTER_ACCEPT;
      } });
      var nodes = [], found = [];
      while (w.nextNode()) nodes.push(w.currentNode);
      nodes.forEach(function (n) {
        var text = n.nodeValue, low = text.toLowerCase(), i = 0, j, frag = doc.createDocumentFragment();
        while ((j = low.indexOf(q, i)) >= 0) {
          if (j > i) frag.appendChild(doc.createTextNode(text.slice(i, j)));
          var mk = doc.createElement('mark'); mk.className = 'g-hit'; mk.textContent = text.substr(j, q.length);
          frag.appendChild(mk); found.push(mk); i = j + q.length;
        }
        if (i < text.length) frag.appendChild(doc.createTextNode(text.slice(i)));
        n.parentNode.replaceChild(frag, n);
      });
      return found;
    }
    function goHit(i) {
      var h = findState.hits; if (!h.length) return;
      if (findState.cur >= 0 && h[findState.cur]) h[findState.cur].classList.remove('cur');
      findState.cur = (i + h.length) % h.length;
      var m = h[findState.cur];
      var st = steppers.filter(function (s) { return s.ex.contains(m); })[0];
      if (st && m.closest('.stp-hidden')) st.revealAll();
      m.classList.add('cur');
      var r = m.getBoundingClientRect();
      if (r.top < stickTop(ctx.el) + 8 || r.bottom > global.innerHeight - 90) global.scrollTo({ top: Math.max(0, global.scrollY + r.top - stickTop(ctx.el) - global.innerHeight * 0.25), behavior: 'auto' });
      fStatus.textContent = (findState.cur + 1) + ' of ' + h.length + ' · ' + U.plural(findState.secs, 'section');
    }
    function runFind(raw) {
      var q = (raw || '').trim().toLowerCase();
      clearMarks();
      findState = { q: q, hits: [], cur: -1, secs: 0 };
      if (q.length < 2) {
        panels.forEach(function (p) { p.el.classList.remove('g-miss'); setCollapsed(p.el, !!prog.collapsed[p.id], false); });
        $$('li[data-sec]', toc).forEach(function (li) { li.hidden = false; });
        fStatus.textContent = q.length ? 'Type at least 2 characters' : ''; fNav.hidden = true; body.classList.remove('finding');
        sched();
        return;
      }
      body.classList.add('finding');
      panels.forEach(function (p) {
        var hits = markIn(p.el, q);
        p.el.classList.toggle('g-miss', !hits.length);
        var li = toc.querySelector('li[data-sec="' + p.id + '"]'); if (li) li.hidden = !hits.length;
        if (hits.length) {
          findState.secs++;
          if (p.el.classList.contains('collapsed')) setCollapsed(p.el, false, false);
          steppers.forEach(function (s) { if (p.el.contains(s.ex) && hits.some(function (m) { return s.ex.contains(m) && m.closest('.stp-hidden'); })) s.revealAll(); });
        }
        findState.hits = findState.hits.concat(hits);
      });
      fNav.hidden = !findState.hits.length;
      if (!findState.hits.length) { fStatus.textContent = 'No matches. Formulas are not searched; try words from the text.'; return; }
      goHit(0);
      A.announce(U.plural(findState.hits.length, 'match', 'matches') + ' in ' + U.plural(findState.secs, 'section'));
    }
    var findDeb = U.debounce(function () { runFind(fInput.value); }, 220);
    fInput.addEventListener('input', findDeb);
    fInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); findDeb.cancel(); if (findState.q !== fInput.value.trim().toLowerCase()) runFind(fInput.value); else goHit(findState.cur + (e.shiftKey ? -1 : 1)); }
      else if (e.key === 'Escape' && fInput.value) { e.preventDefault(); e.stopPropagation(); fInput.value = ''; runFind(''); }
    });
    $('.f-prev', ctx.el).onclick = function () { goHit(findState.cur - 1); };
    $('.f-next', ctx.el).onclick = function () { goHit(findState.cur + 1); };
    ctx.onCleanup(function () { findDeb.cancel(); });

    /* ---- printing: everything visible ---- */
    function beforePrint() { panels.forEach(function (p) { p.el.classList.add('print-open'); }); }
    function afterPrint() { panels.forEach(function (p) { p.el.classList.remove('print-open'); }); }
    global.addEventListener('beforeprint', beforePrint); global.addEventListener('afterprint', afterPrint);
    ctx.onCleanup(function () { global.removeEventListener('beforeprint', beforePrint); global.removeEventListener('afterprint', afterPrint); });

    /* ---- deep links ---- */
    function reveal(id) {
      var el = null;
      try { el = body.querySelector('#' + (global.CSS && CSS.escape ? CSS.escape(id) : id)); } catch (e) { el = null; }
      if (!el) el = doc.getElementById('p-' + id);
      if (!el || !ctx.el.contains(el)) { A.toast('That part of the guide was not found; showing the lesson from the top.'); return; }
      var panel = el.classList.contains('g-panel') ? el : el.closest('.g-panel');
      if (panel && panel.classList.contains('g-miss')) { fInput.value = ''; runFind(''); }
      if (panel && panel.classList.contains('collapsed')) setCollapsed(panel, false, true);
      if (el.closest('.stp-hidden')) { var st = steppers.filter(function (s) { return s.ex.contains(el); })[0]; if (st) st.revealAll(); }
      var target = el.matches('section.g-sec') ? panel : el;
      function place() { if (ctx.alive()) scrollToEl(target, ctx.el, false); }
      place();
      setTimeout(place, 120); setTimeout(place, 450); setTimeout(place, 1000);
      target.classList.remove('flash-target'); void target.offsetWidth; target.classList.add('flash-target');
      setTimeout(function () { target.classList.remove('flash-target'); }, 1700);
    }
    ctx.onXref = function (o) {
      if (o.lessonId === l.id && o.secId) { ctx.setPath(A.href.understand(l.id, o.secId)); ready.then(function () { reveal(o.secId); }); return true; }
      return false;
    };
    ctx._reveal = function (id) { ready.then(function () { reveal(id); }); };
    ctx._lesson = l.id;
    return ready;
  }

  function update(ctx, prev) {
    if (ctx.params[0] === 'lab' || prev.params[0] === 'lab') return false;
    if (ctx.params[0] && ctx.params[0] === ctx._lesson) {
      if (ctx.params[1] && ctx._reveal) ctx._reveal(ctx.params[1]);
      else global.scrollTo({ top: 0, behavior: 'auto' });
      return true;
    }
    return false;
  }

  /* ================================================================ lab page */
  function renderLab(ctx) {
    ctx.setTitle('Interactive lab');
    var list = labs(ctx.tid);
    var want = ctx.params[1] || null;
    var presetId = ctx.query.preset || null;
    ctx.el.innerHTML = '<div class="page understand lab-page">' +
      '<header class="page-head"><p class="eyebrow">Interactive lab · ' + esc(ctx.topic.name) + '</p><h1>Try the circuits yourself</h1>' +
      '<p class="lede">Change the values and every result is recalculated, with the formulas substituted step by step. Each lab lists the assumptions of its model below it. The presets are the worked examples from the lessons; any listed under "Also try" are extra scenarios, not from the videos.</p></header>' +
      '<div class="lab-from" hidden></div><div class="lab-list"></div></div>';
    var page = $('.lab-page', ctx.el);
    page.insertBefore(topBar(ctx, 'lab'), page.firstChild);
    var box = $('.lab-list', ctx.el);
    if (!list.length) { box.innerHTML = U.empty({ icon: 'lab', title: 'The lab for this topic is not available', text: 'It may have failed to load. The study guides and practice questions are unaffected.' }); return; }
    var byId = {}; list.forEach(function (d) { byId[d.id] = d; });
    if (want && !byId[want]) want = null;
    // ?preset=<id> opens the lab that owns that preset, even when the path names another lab or none
    function owns(d, pid) { return !!d && (d.presets || []).some(function (x) { return x.id === pid; }); }
    if (presetId && !owns(byId[want], presetId)) {
      var owner = list.filter(function (d) { return owns(d, presetId); })[0];
      if (owner) { want = owner.id; ctx.setPath(A.href.lab(ctx.tid, owner.id, presetId)); }
    }
    var pr = prefs(); pr.lastLab = pr.lastLab || {};
    var sel = want || (byId[pr.lastLab[ctx.tid]] ? pr.lastLab[ctx.tid] : null);
    if (!sel && ctx.sub && ctx.sub !== 'all') { var f = list.filter(function (d) { return d.sub === ctx.sub; })[0]; if (f) sel = f.id; }
    if (!sel) sel = list[0].id;
    var inst = null, tabs = null;

    function mount(id, pid) {
      if (inst) { try { inst.destroy(); } catch (e) {} inst = null; }
      box.innerHTML = '';
      var d = byId[id];
      // h1 (page) -> h2 (this lab, for the outline) -> h3 (the lab frame's title) -> h4 (lab sub-heads)
      var sec = U.h('<section class="lab-wrap" id="lab-' + d.id + '" data-topic="' + d.topic + '" aria-labelledby="lab-h-' + d.id + '"><h2 class="sr-only" id="lab-h-' + d.id + '">Lab: ' + esc(d.title) + '</h2><div class="lab-mount"></div></section>');
      box.appendChild(sec);
      var wrap = $('.lab-mount', sec);
      var preset = null;
      if (pid) { preset = (d.presets || []).filter(function (x) { return x.id === pid; })[0] || null; }
      function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; } }
      var from = $('.lab-from', ctx.el);
      if (preset) {
        var pl = A.data.lesson(preset.lesson);
        from.hidden = false;
        from.innerHTML = icon('info') + (preset.extra
            ? '<span>Loaded the scenario <strong>' + esc(preset.label || preset.id) + '</strong>. It is an extra scenario, not a worked example from the videos.</span>' +
              (pl ? U.btn('Back to the lesson', { small: true, kind: 'ghost', icon: 'understand', href: A.href.understand(pl.id, preset.sec) }) : '')
            : '<span>Loaded the worked example <strong>' + esc(preset.label || preset.id) + '</strong>' + (pl ? ' from ' + esc(pl.title) : '') + '.</span>' +
              (pl ? U.btn('Back to the lesson section', { small: true, kind: 'ghost', icon: 'understand', href: A.href.understand(pl.id, preset.sec) }) : ''));
        A.renderContent(from, null);
      } else from.hidden = true;
      try {
        /* A preset from the URL wins over the lab's saved state: labs restore ctx.state before ctx.preset (SPEC §9),
         * so state is null here. The first save moves your work into the saved state and drops ?preset from the URL. */
        inst = global.EELabs.mount(d.id, wrap, { preset: preset ? clone(preset.values) : null, presetId: preset ? preset.id : null, state: preset ? null : S.labState(d.id), savedState: S.labState(d.id), save: function (v) {
          S.setLabState(d.id, v);
          if (ctx.alive() && ctx.query.preset) ctx.setQuery({ preset: null });
        } });
      } catch (e) {
        wrap.innerHTML = '<p class="diagram-error">This lab could not start (' + esc(e.message) + ').</p>';
        if (global.console) console.error(e);
      }
      pr.lastLab[ctx.tid] = id; store.save(1000);
      if (tabs) $$('.seg-btn', tabs).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-value') === id)); });
    }
    if (list.length > 1) {
      tabs = U.seg({ label: 'Choose a lab', options: list.map(function (d) { return { value: d.id, label: d.title, icon: 'lab' }; }), value: sel, cls: 'lab-seg', onChange: function (v) {
        mount(v, null); ctx.setPath(A.href.lab(ctx.tid, v));
      } });
      box.parentNode.insertBefore(tabs, $('.lab-from', ctx.el));
    }
    var usePreset = presetId && byId[sel] && (byId[sel].presets || []).some(function (x) { return x.id === presetId; }) ? presetId : null;
    if (presetId && !usePreset) ctx.setQuery({ preset: null });
    mount(sel, usePreset);
    ctx.onCleanup(function () { if (inst) { try { inst.destroy(); } catch (e) {} } inst = null; });
    if (want || usePreset) { ctx.manageScroll = true; global.scrollTo(0, 0); }
  }

  A.registerMode('understand', { render: render, update: update });
})(window);
