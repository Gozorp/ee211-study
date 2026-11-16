/* EE 211 — About: How to use · Coverage · Limitations · Privacy & storage. */
(function (global) {
  'use strict';
  var A = global.EEApp, U = A.ui, store = global.EEStore;
  var esc = U.esc, icon = U.icon, $ = U.$, $$ = U.$$;
  var TABS = [
    { id: 'help', label: 'How to use' },
    { id: 'coverage', label: 'Coverage' },
    { id: 'limitations', label: 'Limitations' },
    { id: 'privacy', label: 'Privacy & storage' }
  ];

  function helpHTML() {
    return '<div class="prose">' +
      '<h2>The five study modes</h2><p>Every topic tab has the same five sections, in this order. Switching between them never stops the video, and your unfinished answers and notes are kept.</p>' +
      '<dl class="modes-dl">' + A.MODES.map(function (m) { return '<dt>' + icon(m.id) + esc(m.label) + '</dt><dd>' + esc(m.desc) + '</dd>'; }).join('') + '</dl>' +
      '<h2>Watch</h2><ul>' +
      '<li>The video sits on the left with <b>Chapters</b> (the study-guide sections, by video time) and the list of lessons below it. The <b>Transcript</b> and your <b>Notes</b> are on the right. On a phone, the video stays at the top and the four panels are under it.</li>' +
      '<li>When you leave Watch, the video keeps playing in a small player in the corner (a bar above the bottom navigation on phones). Use it to pause, skip 10 s, add a note, go back to Watch, minimise it or close it.</li>' +
      '<li>Click any timestamp, like <a class="ts" data-t="0" data-lesson="dw1" href="#" role="button">0:00</a>, anywhere on the site to play that moment. You stay where you are.</li>' +
      '<li>The transcript highlights the block being spoken. “Follow video” scrolls it for you; scrolling yourself pauses that for a few seconds. Search with the box (or press <kbd>/</kbd>); <kbd>Enter</kbd> and <kbd>Shift</kbd>+<kbd>Enter</kbd> step through matches.</li>' +
      '<li>Your place in each video is saved every few seconds, and the parts you have played are counted as “watched”.</li></ul>' +
      '<h2>Understand</h2><ul>' +
      '<li>Each lesson has a complete study guide following the video’s order: objectives, prerequisites, definitions, the lesson itself with formulas, derivations, diagrams and worked examples, then assumptions, common mistakes and a recap with a formula sheet.</li>' +
      '<li>Purple <b>Additional teaching</b> boxes are explanations added for this site, not from the video. Amber <b>Source uncertainty</b> boxes flag illegible or questionable items in the video. <b>Instructor emphasis</b> boxes mark points the instructor stressed.</li>' +
      '<li>Sections can be collapsed and expanded; tick <b>Reviewed</b> to track your reading, and flag sections you want to revisit.</li>' +
      '<li>The <b>Interactive lab</b> lets you change circuit values and see every result recalculated, with the formulas substituted and the model’s assumptions stated next to it.</li></ul>' +
      '<h2>Practice and Review</h2><ul>' +
      '<li>Each topic has four scenarios: a concept check, a direct calculation, a multistep application and a troubleshooting or special case (some topics add a bonus). Hints open one at a time; the full solution and a physical sanity check are always available.</li>' +
      '<li>Review collects what you struggled with, the key concepts, every formula sheet and the common mistakes for the topic.</li></ul>' +
      '<h2>What the progress figures mean</h2><ul>' +
      '<li><b>Studied</b> (ring): lessons you marked complete, plus how much of the relevant video you have played. It measures exposure.</li>' +
      '<li><b>Understood</b> (four diamonds): core practice scenarios you solved without opening the solution. A diamond with a dot means solved with help. It measures demonstrated understanding.</li></ul>' +
      '<h2>Notes and backups</h2><ul>' +
      '<li>Notes save automatically as you type. Timestamped notes link back to the video moment; notes made from a guide section link back to that section.</li>' +
      '<li><a href="#/notes">All notes</a> lets you export notes (Markdown, a readable web page, or plain text) and download or restore a full backup.</li></ul>' +
      '<h2>Keyboard shortcuts</h2><p>When you are not typing in a box: <kbd>k</kbd> play/pause · <kbd>j</kbd> / <kbd>l</kbd> back/forward 10 s · <kbd>n</kbd> note at the current time · <kbd>/</kbd> search · <kbd>g</kbd> then <kbd>w</kbd> <kbd>u</kbd> <kbd>p</kbd> <kbd>r</kbd> <kbd>n</kbd> switch mode · <kbd>?</kbd> list of shortcuts.</p>' +
      '<p>' + U.btn('Show the shortcut list', { small: true, icon: 'keyboard', cls: 'ab-keys' }) + '</p>' +
      '<p><label class="tgl"><input type="checkbox" class="keys-on ab-keys-on"><span>Use single-key shortcuts. Turn this off if you use speech input or keep pressing them by accident.</span></label></p>' +
      '</div>';
  }
  function privacyHTML() {
    var avail = store.available;
    return '<div class="prose">' +
      '<h2>Where your notes and progress are stored</h2>' +
      '<p>Everything you do here — notes, completed lessons, reviewed sections, watched parts, practice answers and drafts, lab settings and preferences — is saved only in this browser’s <b>localStorage</b> for this web address (key <code>ee211.v1</code>). ' +
      (avail ? '<span class="ok-text">Storage is working in this browser.</span>' : '<b class="bad-text">Storage is not available right now (private window or blocked site data). Download a backup before you close the tab.</b>') + '</p>' +
      '<ul><li>It is per browser and per device. It does not sync between your computer, tablet and phone. Use a backup file to move it.</li>' +
      '<li>It survives reloads and restarts, but clearing browsing or site data, or using a private window, deletes it.</li>' +
      '<li>The old local version of this site (on <code>localhost</code>) kept its data separately. Export a backup there and restore it here from <a href="#/notes">All notes</a>.</li>' +
      '<li>Nothing you write is sent anywhere. There are no accounts, analytics, ads or trackers.</li></ul>' +
      '<h2>What is loaded from other sites</h2><ul>' +
      '<li><b>YouTube</b>: the lecture videos are embedded with YouTube’s player, using the privacy-enhanced youtube-nocookie.com host when it works. The player script comes from youtube.com. When a video loads or plays, YouTube receives the usual information a browser sends (such as your IP address) under Google’s privacy policy.</li>' +
      '<li><b>Google Fonts</b>: the Archivo and IBM Plex typefaces are loaded from fonts.googleapis.com and fonts.gstatic.com.</li>' +
      '<li>The site itself is a set of static files on the web host, which (like any web server) sees standard request information when pages are loaded.</li></ul>' +
      '<p>Nothing else is requested. The page is marked <code>noindex</code> so search engines are asked not to list it.</p>' +
      '<h2>Your controls</h2><p>' + U.btn('Open All notes: export, backup, restore, delete', { small: true, href: '#/notes' }) + '</p></div>';
  }

  function render(ctx) {
    var tab = ctx.params[0] && TABS.some(function (t) { return t.id === ctx.params[0]; }) ? ctx.params[0] : 'help';
    var T = TABS.filter(function (t) { return t.id === tab; })[0];
    ctx.setTitle(T.label + ' · About');
    ctx.el.innerHTML = '<div class="page about">' +
      '<header class="page-head"><p class="eyebrow">About this site</p><h1>' + esc(T.label) + '</h1></header>' +
      '<nav class="subnav" aria-label="About">' + TABS.map(function (t) { return '<a href="#/about/' + t.id + '"' + (t.id === tab ? ' aria-current="page"' : '') + '>' + esc(t.label) + '</a>'; }).join('') + '</nav>' +
      '<div class="about-body"></div></div>';
    var body = $('.about-body', ctx.el);
    if (tab === 'help') {
      body.innerHTML = helpHTML(); A.renderContent(body, null); $('.ab-keys', body).onclick = A.openHelp;
      var ko = $('.ab-keys-on', body);
      if (A.shortcuts) { ko.checked = A.shortcuts.enabled(); ko.onchange = function () { A.shortcuts.set(ko.checked); }; } else ko.parentNode.parentNode.hidden = true;
      return;
    }
    if (tab === 'privacy') { body.innerHTML = privacyHTML(); return; }
    body.innerHTML = '<p class="muted">Loading…</p>';
    return A.data.coverageHTML().then(function (html) {
      if (!ctx.alive()) return;
      var box = U.h('<div class="guide coverage"></div>');
      box.innerHTML = html;
      if (tab === 'limitations') {
        var hs = $$('h2', box), start = hs.filter(function (x) { return /limitation/i.test(x.textContent); })[0];
        if (start) {
          var keep = document.createElement('div'); keep.className = 'guide coverage';
          var n = start;
          while (n) { var next = n.nextSibling; if (n !== start && n.nodeType === 1 && n.tagName === 'H2') break; keep.appendChild(n); n = next; }
          box = keep;
        }
      }
      body.innerHTML = '';
      body.appendChild(box);
      A.renderContent(box, null);
      $$('table', box).forEach(function (t) { if (!t.parentNode.classList.contains('table-wrap')) { var w = document.createElement('div'); w.className = 'table-wrap'; t.parentNode.insertBefore(w, t); w.appendChild(t); } });
    }).catch(function () { body.innerHTML = '<p class="muted">The coverage report could not be loaded.</p>'; });
  }

  A.registerView('about', { render: render });
})(window);
