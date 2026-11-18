/* EE 211 — All notes: every note by topic, export, backup / restore (merge), delete everything, storage explanation. */
(function (global) {
  'use strict';
  var A = global.EEApp, U = A.ui, S = A.store, store = global.EEStore;
  var esc = U.esc, icon = U.icon, $ = U.$, $$ = U.$$;

  function counts() {
    var st = store.state, c = { notes: 0, free: 0, topics: 0, done: 0, secs: 0, practice: 0, solved: 0 };
    Object.keys(st.notes.lessons || {}).forEach(function (k) { var n = st.notes.lessons[k]; c.notes += (n.items || []).length; if ((n.free || '').trim()) c.free++; });
    Object.keys(st.notes.topics || {}).forEach(function (k) { if ((st.notes.topics[k] || '').trim()) c.topics++; });
    Object.keys(st.progress.lessons || {}).forEach(function (k) { var p = st.progress.lessons[k]; if (p.done) c.done++; c.secs += Object.keys(p.secs || {}).filter(function (s) { return p.secs[s]; }).length; });
    Object.keys(st.progress.practice || {}).forEach(function (k) { c.practice++; if (st.progress.practice[k].solved) c.solved++; });
    return c;
  }
  function diffSummary(a, b) {
    var parts = [];
    function d(k, label) { var x = b[k] - a[k]; if (x > 0) parts.push(x + ' ' + label); }
    d('notes', 'timestamped note(s)'); d('free', 'lesson free-form note(s)'); d('topics', 'topic note(s)');
    d('done', 'completed lesson(s)'); d('secs', 'reviewed section(s)'); d('practice', 'practice question record(s)'); d('solved', 'solved question(s)');
    return parts.length ? 'Merged: ' + parts.join(', ') + '.' : 'Nothing new: everything in the backup was already here (text that differed was appended).';
  }

  function render(ctx) {
    ctx.setTitle('All notes');
    var c = counts();
    ctx.el.innerHTML = '<div class="page allnotes">' +
      '<header class="page-head"><p class="eyebrow">Your notebook</p><h1>All notes</h1>' +
      '<p class="lede">' + U.plural(c.notes, 'timestamped note') + ', ' + U.plural(c.free + c.topics, 'free-form note') + '. Everything here is editable and saves automatically. <span class="an-save"></span></p></header>' +
      '<div class="an-grid">' +
      ' <div class="an-main">' +
      '  <div class="an-tools">' +
      '   <div class="search-box">' + icon('search') + '<input type="search" class="an-search" data-search placeholder="Search your notes" aria-label="Search your notes (press / )"></div>' +
      '   <div class="an-export" role="group" aria-label="Export notes">' + U.btn('Markdown', { small: true, icon: 'download', cls: 'ex-md', title: 'Download all notes as Markdown (.md)' }) +
      U.btn('Web page', { small: true, icon: 'download', cls: 'ex-html', title: 'Download all notes as a readable page (.html)' }) +
      U.btn('Text', { small: true, icon: 'download', cls: 'ex-txt', title: 'Download all notes as plain text (.txt)' }) +
      U.btn('Copy all', { small: true, icon: 'copy', cls: 'ex-copy', title: 'Copy all notes as text' }) + '</div>' +
      '  </div>' +
      '  <div class="an-list"></div>' +
      ' </div>' +
      ' <aside class="an-side">' +
      '  <section class="card an-card" id="backup" aria-labelledby="bkTitle"><h2 id="bkTitle" class="card-title">Backup and restore</h2>' +
      '   <p class="small muted">A backup holds your notes <i>and</i> progress: completed lessons, reviewed and flagged sections, watched parts, practice results and drafts, lab settings and preferences.</p>' +
      '   <div class="stack">' + U.btn('Download backup (.json)', { icon: 'download', kind: 'primary', cls: 'bk-dl' }) + U.btn('Copy backup text', { icon: 'copy', cls: 'bk-copy' }) + '</div>' +
      '   <h3 class="card-sub">Restore</h3><p class="small muted">Restoring <b>merges</b> the backup into what is here: nothing is deleted, notes are combined, and progress keeps the better of the two.</p>' +
      '   <div class="stack"><label class="btn bk-file-btn">' + icon('upload') + '<span>Restore from file…</span><input type="file" class="bk-file sr-only" accept="application/json,.json"></label>' +
      U.btn('Restore from pasted text', { icon: 'upload', cls: 'bk-paste-btn' }) + '</div>' +
      '   <div class="bk-paste" hidden><label class="small" for="bkPaste">Paste the backup text</label><textarea id="bkPaste" rows="5" spellcheck="false" placeholder="{ &quot;version&quot;: … }"></textarea>' +
      '    <div class="row">' + U.btn('Merge into my notes', { kind: 'primary', small: true, cls: 'bk-paste-go' }) + U.btn('Cancel', { small: true, kind: 'ghost', cls: 'bk-paste-x' }) + '</div></div>' +
      '   <p class="bk-result small" role="status" aria-live="polite"></p>' +
      '  </section>' +
      '  <section class="card an-card" aria-labelledby="stTitle"><h2 id="stTitle" class="card-title">How storage works</h2><ul class="small tight">' +
      '   <li>Saved automatically in this browser’s local storage for this address. ' + (store.available ? '<span class="ok-text">Storage is working.</span>' : '<b class="bad-text">Storage is NOT available right now; download a backup before closing the tab.</b>') + '</li>' +
      '   <li>Per browser and per device: it does not sync to your other computers, tablet or phone. Move it with a backup file.</li>' +
      '   <li>Survives reloads. Clearing site data or using a private window deletes it.</li>' +
      '   <li>The old localhost version kept its data separately: export a backup there and restore it here.</li>' +
      '   <li>Nothing you write leaves this browser. <a href="#/about/privacy">Privacy details</a></li></ul></section>' +
      '  <section class="card an-card danger-zone" aria-labelledby="dzTitle"><h2 id="dzTitle" class="card-title">Delete everything</h2><p class="small muted">Removes all notes, progress, drafts and preferences from this browser. It cannot be undone; download a backup first.</p>' +
      '   <div>' + U.btn('Delete everything…', { kind: 'danger', icon: 'trash', cls: 'dz-btn' }) + '</div></section>' +
      ' </aside>' +
      '</div></div>';
    $('.an-save', ctx.el).appendChild(U.saveStatus());

    var list = $('.an-list', ctx.el), apis = [];
    function build(filter) {
      apis.forEach(function (a) { a.destroy(); }); apis = [];
      list.innerHTML = '';
      var any = false, f = (filter || '').toLowerCase();
      A.TOPICS.forEach(function (t) {
        var tn = store.state.notes.topics[t.id] || '';
        var ls = A.data.topicLessons(t.id).filter(function (l) {
          if (!A.notesUI.lessonHasNotes(l)) return false;
          if (!f) return true;
          var n = store.state.notes.lessons[l.id];
          return (n.free || '').toLowerCase().indexOf(f) >= 0 || (n.items || []).some(function (it) { return (it.text || '').toLowerCase().indexOf(f) >= 0; }) || l.title.toLowerCase().indexOf(f) >= 0;
        });
        var showTopic = tn.trim() && (!f || tn.toLowerCase().indexOf(f) >= 0);
        if (!ls.length && !showTopic) return;
        any = true;
        var sec = U.h('<section class="an-topic" data-topic="' + t.id + '"><h2 class="an-topic-title"><span class="an-glyph">' + U.glyph(t.id) + '</span><a href="' + A.href.notes(t.id) + '">' + esc(t.name) + '</a></h2></section>');
        if (showTopic) {
          var tw = U.h('<div class="an-tnotes"><label class="an-label" for="tn-' + t.id + '">Topic notes</label><textarea id="tn-' + t.id + '" class="an-ta" rows="3"></textarea></div>');
          var ta = $('textarea', tw); ta.value = tn;
          ta.addEventListener('input', function () { store.state.notes.topics[t.id] = ta.value; store.save(); A.notesUI.autoGrow(ta); });
          setTimeout(function () { A.notesUI.autoGrow(ta); }, 0);
          sec.appendChild(tw);
        }
        ls.forEach(function (l) {
          var lw = U.h('<div class="an-lesson"><h3 class="an-lesson-title"><a href="' + A.href.watch(l.id) + '">' + esc(l.title) + '</a></h3><div class="an-lesson-notes"></div></div>');
          sec.appendChild(lw);
          apis.push(A.notesUI.lesson($('.an-lesson-notes', lw), l.id, { composer: false, free: true, filter: f, showEmpty: false }));
        });
        list.appendChild(sec);
      });
      /* past-exam question notes (ids xm-<exam>-q<N>, written on the question pages of js/app/exams.js) */
      var xs = A.exams ? A.exams.noteIds().filter(function (id) {
        if (!f) return true;
        var n = store.state.notes.lessons[id], info = A.exams.noteInfo(id);
        return (n.free || '').toLowerCase().indexOf(f) >= 0 || (n.items || []).some(function (it) { return (it.text || '').toLowerCase().indexOf(f) >= 0; }) || info.label.toLowerCase().indexOf(f) >= 0;
      }) : [];
      if (xs.length) {
        any = true;
        var xsec = U.h('<section class="an-topic an-exams"><h2 class="an-topic-title"><span class="an-glyph">' + A.exams.icon() + '</span><a href="#/exams">Past exam questions</a></h2></section>');
        xs.forEach(function (id) {
          var info = A.exams.noteInfo(id);
          var lw = U.h('<div class="an-lesson"><h3 class="an-lesson-title"><a href="' + esc(info.href) + '">' + esc(info.label) + '</a></h3><div class="an-lesson-notes"></div></div>');
          xsec.appendChild(lw);
          apis.push(A.notesUI.lesson($('.an-lesson-notes', lw), id, { composer: false, free: true, noTime: true, freeLabel: 'Question notes', filter: f, showEmpty: false }));
        });
        list.appendChild(xsec);
      }
      if (!any) list.innerHTML = f ? U.empty({ icon: 'search', title: 'No notes match “' + esc(filter) + '”' }) :
        U.empty({ icon: 'notes', title: 'No notes yet', text: 'Open a lesson in Watch and press <b>Note</b> (or <kbd>n</kbd>) to pin a note to the current video moment. Notes from every topic collect here.', actions: U.btn('Go to the topics', { kind: 'primary', href: '#/' }) });
    }
    build('');
    /* exam question titles come from the exam index: rebuild once it is loaded (only when there are exam notes) */
    if (A.exams && A.exams.noteIds().length) A.exams.index().then(function () { if (ctx.alive()) build($('.an-search', ctx.el).value); }, function () {});
    ctx.onCleanup(function () { apis.forEach(function (a) { a.destroy(); }); });
    var stt; $('.an-search', ctx.el).addEventListener('input', function (e) { clearTimeout(stt); var v = e.target.value; stt = setTimeout(function () { build(v); }, 200); });

    var stamp = U.today();
    $('.ex-md', ctx.el).onclick = function () { U.download('EE211-notes-' + stamp + '.md', A.notesUI.exportMarkdown()); };
    $('.ex-html', ctx.el).onclick = function () { U.download('EE211-notes-' + stamp + '.html', A.notesUI.exportHTML(), 'text/html;charset=utf-8'); };
    $('.ex-txt', ctx.el).onclick = function () { U.download('EE211-notes-' + stamp + '.txt', A.notesUI.exportText()); };
    $('.ex-copy', ctx.el).onclick = function () { U.copyText(A.notesUI.exportText()).then(function () { A.toast('All notes copied as text'); }, function () { A.toast('Copying is not allowed here; use a download instead.'); }); };

    $('.bk-dl', ctx.el).onclick = function () { store.saveNow(); U.download('EE211-backup-' + stamp + '.json', store.exportJSON(), 'application/json'); A.toast('Backup downloaded'); };
    $('.bk-copy', ctx.el).onclick = function () { U.copyText(store.exportJSON()).then(function () { A.toast('Backup text copied. Paste it into “Restore from pasted text” on another device.'); }, function () { A.toast('Copying is not allowed here; download the file instead.'); }); };
    var result = $('.bk-result', ctx.el);
    function doImport(text, src) {
      var before = counts();
      try { store.importJSON(text, true); }
      catch (e) { result.className = 'bk-result small bad-text'; result.textContent = 'Restore failed: ' + (e instanceof SyntaxError ? 'this is not valid backup data (it should start with {).' : (e.message || 'this is not a valid backup.')); return false; }
      var msg = diffSummary(before, counts());
      result.className = 'bk-result small ok-text'; result.textContent = 'Restored from ' + src + '. ' + msg;
      A.toast('Backup merged');
      build($('.an-search', ctx.el).value);
      A.progress.refresh();
      return true;
    }
    $('.bk-file', ctx.el).onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      f.text().then(function (txt) { doImport(txt, f.name); e.target.value = ''; });
    };
    var paste = $('.bk-paste', ctx.el);
    $('.bk-paste-btn', ctx.el).onclick = function () { paste.hidden = !paste.hidden; if (!paste.hidden) $('#bkPaste', ctx.el).focus(); };
    $('.bk-paste-x', ctx.el).onclick = function () { paste.hidden = true; };
    $('.bk-paste-go', ctx.el).onclick = function () {
      var t = $('#bkPaste', ctx.el).value.trim();
      if (!t) { $('#bkPaste', ctx.el).focus(); return; }
      if (doImport(t, 'pasted text')) { $('#bkPaste', ctx.el).value = ''; paste.hidden = true; }
    };
    var dz = $('.dz-btn', ctx.el);
    dz.onclick = function () {
      U.confirmInline(dz, { question: 'Delete all notes and progress in this browser?', yes: 'Yes, delete everything', danger: true, onYes: function () {
        store.reset();
        if (A.theme) A.theme.sync(); else document.documentElement.removeAttribute('data-theme');   // page + header control back to System
        A.toast('Everything was deleted from this browser.');
        A.go('#/notes');
        A.progress.refresh();
      } });
    };
    if (ctx.query.restore) { var bk = $('#backup', ctx.el); setTimeout(function () { bk.scrollIntoView({ block: 'start' }); bk.classList.add('flash-target'); }, 60); ctx.manageScroll = true; }
  }

  A.registerView('notes', { render: render });
})(window);
