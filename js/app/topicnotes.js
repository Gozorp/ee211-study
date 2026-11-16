/* EE 211 — My Notes mode for one topic (SHELL-B).
 * Topic notes, each lesson's timestamped notes (time chip plays in the dock, inline edit, delete with undo,
 * section badge opens Peek) and free notes; add a note at the current video time; search; export; copy all. */
(function (global) {
  'use strict';
  var A = global.EEApp, U = A.ui, S = A.store, store = global.EEStore;
  var esc = U.esc, icon = U.icon, $ = U.$, $$ = U.$$;

  function prefs() { return store.state.prefs || (store.state.prefs = {}); }
  function noteCount(l) { var n = store.state.notes.lessons[l.id]; return ((n && n.items) || []).length; }
  function hasFree(l) { var n = store.state.notes.lessons[l.id]; return !!(n && n.free && n.free.trim()); }

  function render(ctx) {
    var tid = ctx.tid, t = ctx.topic;
    ctx.setTitle('');
    ctx.el.innerHTML = '<div class="page topicnotes">' +
      '<header class="page-head"><p class="eyebrow">My Notes · ' + esc(t.name) + '</p><h1>My notes</h1>' +
      '<p class="lede">Everything you wrote for this topic, by lesson. Click a time to play that moment; edit any note in place. <span class="tn-save"></span></p></header>' +
      '<div class="tn-summary small muted" aria-live="polite"></div>' +
      '<div class="an-tools tn-tools"><div class="search-box">' + icon('search') + '<input type="search" class="tn-search" data-search placeholder="Search these notes" aria-label="Search these notes (press / )" autocomplete="off"></div>' +
      '<div class="an-export" role="group" aria-label="Export this topic\'s notes">' + U.btn('Markdown', { small: true, icon: 'download', cls: 'tx-md', title: 'Download as Markdown (.md)' }) + U.btn('Web page', { small: true, icon: 'download', cls: 'tx-html', title: 'Download as a web page (.html)' }) +
      U.btn('Text', { small: true, icon: 'download', cls: 'tx-txt', title: 'Download as plain text (.txt)' }) + U.btn('Copy all', { small: true, icon: 'copy', cls: 'tx-copy', title: 'Copy all notes of this topic as text' }) + '</div></div>' +
      '<div class="tn-add card" hidden></div>' +
      '<section class="an-topic tn-topic" data-topic="' + tid + '" aria-label="Topic notes"><label class="an-label" for="tnTopic">Topic notes</label><textarea id="tnTopic" class="an-ta" rows="3" placeholder="General notes for the whole topic: what to ask in office hours, links between lessons…"></textarea></section>' +
      '<div class="tn-lessons"></div><p class="tn-nomatch empty-text" hidden>No notes match your search.</p>' +
      '</div>';
    $('.tn-save', ctx.el).appendChild(U.saveStatus());
    var page = $('.topicnotes', ctx.el);
    var ta = $('#tnTopic', ctx.el);
    ta.value = store.state.notes.topics[tid] || '';
    ta.addEventListener('input', function () { store.state.notes.topics[tid] = ta.value; store.save(); A.notesUI.autoGrow(ta); });
    setTimeout(function () { A.notesUI.autoGrow(ta); }, 0);

    var box = $('.tn-lessons', ctx.el), apis = [], query = '';
    var seg = null;
    if (t.subs) {
      seg = U.seg({ label: 'Show lessons from', small: true, cls: 'sub-seg', value: ctx.sub || 'all',
        options: [{ value: 'all', label: 'All' }].concat(t.subs.map(function (s) { return { value: s.id, label: s.title }; })),
        onChange: function (v) { prefs().lcSub = v; store.save(600); ctx.sub = v; ctx.setQuery({ sub: v === 'all' ? null : v }); build(); } });
      page.insertBefore(seg, $('.tn-summary', ctx.el));
    }

    function summary() {
      var ls = A.data.topicLessons(tid, ctx.sub || 'all'), n = 0, withN = 0;
      ls.forEach(function (l) { var c = noteCount(l); n += c; if (c || hasFree(l)) withN++; });
      $('.tn-summary', ctx.el).textContent = n || withN ? U.plural(n, 'note') + ' in ' + U.plural(withN, 'lesson') + '.' : 'No lesson notes yet. Add one below, from the transcript in Watch, or from a guide section in Understand.';
    }
    function lessonBlock(l) {
      var c = noteCount(l), open = c > 0 || hasFree(l);
      var d = U.h('<details class="tn-lesson an-lesson" data-lesson="' + l.id + '"' + (open ? ' open' : '') + '>' +
        '<summary class="tn-sum"><span class="mono cl-num">' + A.data.lessonIndex(l).n + '</span><span class="tn-ltitle">' + esc(l.title) + '</span><span class="chip tn-count">' + c + '</span></summary>' +
        '<div class="tn-lbody"><div class="tn-lacts">' + U.btn('Add a note', { small: true, kind: 'ghost', icon: 'plus', cls: 'tn-addl' }) +
        U.btn('Watch', { small: true, kind: 'ghost', icon: 'watch', href: A.href.watch(l.id) }) + U.btn('Study guide', { small: true, kind: 'ghost', icon: 'understand', href: A.href.understand(l.id) }) + '</div>' +
        '<div class="tn-l"></div></div></details>');
      var api = A.notesUI.lesson($('.tn-l', d), l.id, { composer: false, free: true, emptyText: 'No timestamped notes for this lesson yet.', filter: query,
        onChange: function () { $('.tn-count', d).textContent = String(noteCount(l)); summary(); } });
      $('.tn-addl', d).onclick = function () {
        var D = global.EEDock, cur = D && D.current();
        var tt = cur && cur.lessonId === l.id && !cur.closed ? Math.floor(cur.t) : null;
        if (query) { $('.tn-search', ctx.el).value = ''; setQuery(''); }
        d.open = true;
        api.add(tt, '');
        A.toast(tt != null ? 'Note added at ' + U.fmt(tt) + '. Type it in.' : 'Note added without a time. Type it in.');
      };
      return { l: l, el: d, api: api };
    }
    function build() {
      apis.forEach(function (a) { a.api.destroy(); });
      apis = []; box.innerHTML = '';
      A.data.lessonGroups(tid, ctx.sub || 'all').forEach(function (g) {
        if (g.sub) box.appendChild(U.h('<h2 class="lgroup-title">' + esc(g.sub.title) + '</h2>'));
        g.lessons.forEach(function (l) { var x = lessonBlock(l); apis.push(x); box.appendChild(x.el); });
      });
      summary(); applyFilter(); addBar();
    }
    ctx.onCleanup(function () { apis.forEach(function (a) { a.api.destroy(); }); });

    /* live "add at current time" bar for the lesson loaded in the dock */
    var addBox = $('.tn-add', ctx.el);
    function addBar() {
      var D = global.EEDock, cur = D && D.current();
      var l = cur && cur.lessonId && !cur.closed && A.data.lesson(cur.lessonId);
      var x = l && apis.filter(function (a) { return a.l.id === l.id; })[0];
      if (!x) { addBox.hidden = true; addBox.innerHTML = ''; return; }
      addBox.hidden = false;
      if (!addBox.firstChild || addBox.getAttribute('data-lesson') !== l.id) {
        addBox.setAttribute('data-lesson', l.id);
        addBox.innerHTML = '<span class="tn-add-ic">' + icon('watch') + '</span><span class="tn-add-text"><span class="small muted">Video loaded</span><span class="tn-add-title"></span></span>' + U.btn('Add a note at 0:00', { kind: 'primary', small: true, icon: 'plus', cls: 'tn-add-btn' });
        $('.tn-add-title', addBox).textContent = l.title;
        $('.tn-add-btn', addBox).onclick = function () {
          var c = global.EEDock.current(), y = apis.filter(function (a) { return a.l.id === c.lessonId; })[0];
          if (!y) return;
          if (query) { $('.tn-search', ctx.el).value = ''; setQuery(''); }
          y.el.open = true; y.api.add(Math.floor(c.t || 0), '');
        };
      }
      $('.tn-add-btn span', addBox).textContent = 'Add a note at ' + U.fmt(cur.t || 0);
    }
    if (global.EEDock) {
      var off1 = global.EEDock.onTick(function () { addBar(); });
      var off2 = global.EEDock.onLesson ? global.EEDock.onLesson(function () { addBar(); }) : null;
      ctx.onCleanup(function () { if (typeof off1 === 'function') off1(); if (typeof off2 === 'function') off2(); });
    }

    /* search */
    function applyFilter() {
      var q = query.toLowerCase(), any = false;
      apis.forEach(function (a) {
        a.api.setFilter(query);
        if (!q) { a.el.hidden = false; return; }
        var n = store.state.notes.lessons[a.l.id] || {};
        var hit = (n.items || []).some(function (it) { return (it.text || '').toLowerCase().indexOf(q) >= 0; }) || (n.free || '').toLowerCase().indexOf(q) >= 0 || a.l.title.toLowerCase().indexOf(q) >= 0;
        a.el.hidden = !hit; if (hit) { a.el.open = true; any = true; }
      });
      $$('.lgroup-title', box).forEach(function (h) {
        var nx = h.nextElementSibling, vis = false;
        while (nx && !nx.classList.contains('lgroup-title')) { if (!nx.hidden) vis = true; nx = nx.nextElementSibling; }
        h.hidden = !!q && !vis;
      });
      var topicHit = !q || (ta.value || '').toLowerCase().indexOf(q) >= 0;
      $('.tn-topic', ctx.el).classList.toggle('tn-dim', !topicHit);
      $('.tn-nomatch', ctx.el).hidden = !q || any || topicHit;
    }
    function setQuery(v) { query = v || ''; applyFilter(); }
    var deb = U.debounce(function () { setQuery($('.tn-search', ctx.el).value.trim()); }, 200);
    $('.tn-search', ctx.el).addEventListener('input', deb);
    $('.tn-search', ctx.el).addEventListener('keydown', function (e) { if (e.key === 'Escape' && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; deb.cancel(); setQuery(''); } });
    ctx.onCleanup(function () { deb.cancel(); });

    /* export */
    var name = 'EE211-notes-' + tid + '-' + U.today();
    $('.tx-md', ctx.el).onclick = function () { U.download(name + '.md', A.notesUI.exportMarkdown([tid], t.name + ' notes'), 'text/markdown;charset=utf-8'); A.toast('Markdown file downloaded'); };
    $('.tx-html', ctx.el).onclick = function () { U.download(name + '.html', A.notesUI.exportHTML([tid], t.name + ' notes'), 'text/html;charset=utf-8'); A.toast('Web page downloaded'); };
    $('.tx-txt', ctx.el).onclick = function () { U.download(name + '.txt', A.notesUI.exportText([tid], t.name + ' notes'), 'text/plain;charset=utf-8'); A.toast('Text file downloaded'); };
    $('.tx-copy', ctx.el).onclick = function () { U.copyText(A.notesUI.exportText([tid], t.name + ' notes')).then(function () { A.toast('All notes of this topic copied'); }, function () { A.toast('Copying is not allowed here; use a download instead.'); }); };

    build();
  }

  A.registerMode('notes', { render: render });
})(window);
