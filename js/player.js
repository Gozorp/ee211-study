/* EE 211 — single-instance YouTube IFrame player wrapper.
 * One player is created once inside the host element given to ensure() and is never destroyed or moved while the
 * app runs (moving an iframe reloads it). Lessons are switched with cueVideoById / loadVideoById.
 * Tries the privacy-enhanced host (youtube-nocookie.com) first; falls back to the default host once if that
 * player errors or is not ready within ~8 s.
 */
(function (global) {
  'use strict';
  var NOCOOKIE = 'https://www.youtube-nocookie.com';
  var apiPromise = null;
  var host = null;            // element the player lives in
  var yt = null, ready = false, creating = false, timedOut = false;
  var useNoCookie = true, fellBack = false, everPlayed = false;
  var curVideo = null;        // video id currently in the player
  var pending = null;         // {videoId, start, autoplay} waiting for ready
  var cuedAt = 0;             // start position of a cued (not yet playing) video
  var createdWith = null;     // {videoId, start} the iframe was created with
  var rate = 1;
  var tickers = [], stateCbs = [], errorCbs = [], readyCbs = [];
  var tickTimer = null, readyTimer = null;

  function each(list, args) { list.slice().forEach(function (f) { try { f.apply(null, args); } catch (e) { if (global.console) console.error(e); } }); }
  function sub(list, f) { list.push(f); return function () { var i = list.indexOf(f); if (i >= 0) list.splice(i, 1); }; }

  function loadApi() {
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (resolve, reject) {
      if (global.YT && global.YT.Player) return resolve(global.YT);
      var prev = global.onYouTubeIframeAPIReady;
      global.onYouTubeIframeAPIReady = function () { if (prev) { try { prev(); } catch (e) {} } resolve(global.YT); };
      var s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = function () { apiPromise = null; reject(new Error('The YouTube player could not be loaded (offline, or YouTube is blocked on this network).')); };
      document.head.appendChild(s);
      setTimeout(function () {
        if (global.YT && global.YT.Player) return;
        apiPromise = null;          // forget the failure so the next play / seek / load can try again
        reject(new Error('The YouTube player did not load within 20 seconds (offline, or YouTube is blocked on this network).'));
      }, 20000);
    });
    return apiPromise;
  }

  function startTicker() {
    if (tickTimer) return;
    tickTimer = setInterval(function () {
      if (!ready || !yt || !yt.getCurrentTime) return;
      each(tickers, [time(), state()]);
    }, 400);
  }

  function create() {
    if (creating || yt || !host) return;
    creating = true;
    loadApi().then(function (YT) {
      var p = pending || {};
      var div = document.createElement('div');
      div.className = 'yt-target';
      host.innerHTML = '';
      host.appendChild(div);
      var opts = {
        width: '100%', height: '100%',
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1, enablejsapi: 1, origin: location.origin, cc_load_policy: 0, iv_load_policy: 3 },
        events: { onReady: onReady, onStateChange: onStateChange, onError: onError }
      };
      createdWith = p.videoId ? { videoId: p.videoId, start: Math.max(0, Math.floor(p.start || 0)) } : null;
      if (createdWith) { opts.videoId = createdWith.videoId; opts.playerVars.start = createdWith.start; }
      if (useNoCookie) opts.host = NOCOOKIE;
      yt = new YT.Player(div, opts);
      clearTimeout(readyTimer);
      readyTimer = setTimeout(function () {
        if (ready) return;
        if (!fallback('timeout')) {
          timedOut = true;   /* keep the player (it may still become ready late), but let retry() rebuild it */
          each(errorCbs, [{ code: 'timeout', message: 'The video player did not start. Check your connection, or open the video on YouTube.' }]);
        }
      }, 8000);
    }).catch(function (e) {
      creating = false;
      each(errorCbs, [{ code: 'api', message: e.message }]);
    });
  }

  function fallback(why) {
    if (!useNoCookie || fellBack) return false;
    fellBack = true; useNoCookie = false;
    if (global.console) console.info('[EEPlayer] privacy-enhanced host failed (' + why + '); using the default YouTube host.');
    var keep = pending || (curVideo ? { videoId: curVideo, start: time(), autoplay: state() === 1 } : null);
    try { if (yt && yt.destroy) yt.destroy(); } catch (e) {}
    yt = null; ready = false; creating = false; curVideo = null;
    pending = keep;
    create();
    return true;
  }

  function onReady() {
    clearTimeout(readyTimer);
    ready = true; creating = false; timedOut = false;
    if (createdWith) { curVideo = createdWith.videoId; cuedAt = createdWith.start; }
    var p = pending; pending = null;
    if (p && p.videoId) {
      if (p.videoId === curVideo && Math.floor(p.start || 0) === cuedAt) { if (p.autoplay) { try { yt.playVideo(); } catch (e) {} } }
      else { try { apply(p); } catch (e) {} }
    }
    try { yt.setPlaybackRate(rate); } catch (e) {}
    startTicker();
    each(readyCbs, []);
  }

  function onStateChange(e) {
    if (e.data === 1) { everPlayed = true; cuedAt = 0; try { if (yt.getPlaybackRate() !== rate) yt.setPlaybackRate(rate); } catch (er) {} }
    each(stateCbs, [e.data]);
  }

  function onError(e) {
    var code = e && e.data;
    // the privacy-enhanced host occasionally refuses configs the default host accepts: retry once there
    if (!everPlayed && useNoCookie && fallback('error ' + code)) return;
    each(errorCbs, [{ code: code, message: describe(code) }]);
  }

  function describe(code) {
    return ({ 2: 'invalid video id', 5: 'HTML5 player error', 100: 'video not found or private',
      101: 'the owner does not allow embedding', 150: 'the owner does not allow embedding',
      153: 'player configuration error (the page must be served over http or https)' })[code] || ('error ' + code);
  }

  function apply(p) {
    if (!ready || !yt) { pending = p; if (!yt) create(); return; }
    var start = Math.max(0, Math.floor(p.start || 0));
    if (p.videoId !== curVideo) {
      curVideo = p.videoId;
      if (p.autoplay) { cuedAt = 0; yt.loadVideoById({ videoId: p.videoId, startSeconds: start }); }
      else { cuedAt = start; yt.cueVideoById({ videoId: p.videoId, startSeconds: start }); }
    } else {
      seek(start, !!p.autoplay);
    }
  }

  /* ---- public ---- */
  function ensure(el) { if (!host) host = el; return api; }
  function load(videoId, start, autoplay) { apply({ videoId: videoId, start: start || 0, autoplay: !!autoplay }); }
  /* nothing usable yet: retry creating the player (after an API load failure) with the request that is waiting */
  function retry() {
    if (timedOut && !ready) {           /* player was built but never became ready: rebuild it */
      try { if (yt && yt.destroy) yt.destroy(); } catch (e) {}
      yt = null; creating = false; timedOut = false;
    }
    if (!yt && !creating && pending && pending.videoId) create();
  }
  function seek(t, play) {
    t = Math.max(0, t || 0);
    if (!ready || !yt) { if (pending) { pending.start = t; if (play != null) pending.autoplay = !!play; } retry(); return; }
    var st = state();
    if (st === 5 || st === -1) {             // cued / unstarted: seekTo would auto-play
      if (play) { cuedAt = 0; yt.seekTo(t, true); yt.playVideo(); }
      else { cuedAt = Math.floor(t); yt.cueVideoById({ videoId: curVideo, startSeconds: Math.floor(t) }); }
      return;
    }
    yt.seekTo(t, true);
    if (play === true) yt.playVideo();
    else if (play === false) yt.pauseVideo();
  }
  function time() {
    try {
      if (!ready || !yt) return pending ? pending.start || 0 : 0;
      var st = yt.getPlayerState();
      if (st === 5 || (st === -1 && cuedAt)) return cuedAt;
      return yt.getCurrentTime() || 0;
    } catch (e) { return 0; }
  }
  function state() { try { return ready && yt ? yt.getPlayerState() : -1; } catch (e) { return -1; } }
  function play() { if (ready && yt) { if (state() === 5 && cuedAt) { yt.seekTo(cuedAt, true); } yt.playVideo(); } else if (pending) { pending.autoplay = true; retry(); } }
  function pause() { if (ready && yt) yt.pauseVideo(); else if (pending) pending.autoplay = false; }
  function toggle() { if (state() === 1 || state() === 3) pause(); else play(); }
  function nudge(d) { var st = state(); seek(time() + d, st === 1 || st === 3); }
  function setRate(r) { rate = r || 1; if (ready && yt && yt.setPlaybackRate) { try { yt.setPlaybackRate(rate); } catch (e) {} } }
  function duration() { try { return ready && yt ? yt.getDuration() || 0 : 0; } catch (e) { return 0; } }

  var api = {
    ensure: ensure, load: load, seek: seek, play: play, pause: pause, toggle: toggle, nudge: nudge,
    setRate: setRate, rate: function () { return rate; }, time: time, state: state, duration: duration,
    onTick: function (f) { return sub(tickers, f); },
    onState: function (f) { return sub(stateCbs, f); },
    onError: function (f) { return sub(errorCbs, f); },
    onReady: function (f) { if (ready) { try { f(); } catch (e) {} } return sub(readyCbs, f); },
    get videoId() { return curVideo || (pending && pending.videoId) || null; },
    get ready() { return ready; },
    get host() { return useNoCookie ? NOCOOKIE : 'https://www.youtube.com'; },
    get playing() { var s = state(); return s === 1 || s === 3; }
  };
  global.EEPlayer = api;
})(window);
