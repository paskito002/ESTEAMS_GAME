/* Pitch Legends — app glue */
(function (root) {
  'use strict';
  var AS = root.AS = root.AS || {};
  var U = AS.U, P = AS.P;

  var App = {};
  var els = {};
  var game = null, renderer = null, input = null;
  var rafId = null, lastT = 0;
  var chargingShot = false, shotPower = 0;
  var settings = {
    halfMinutes: 15,
    extraTime: true,
    difficulty: 0.55,
    sound: true,
    homeIdx: 0,
    awayIdx: 1
  };

  function $(id) { return document.getElementById(id); }

  App.init = function () {
    els.menu = $('menu');
    els.hud = $('hud');
    els.canvas = $('pitch');
    els.scoreHome = $('scoreHome');
    els.scoreAway = $('scoreAway');
    els.nameHome = $('nameHome');
    els.nameAway = $('nameAway');
    els.clock = $('clock');
    els.periodLbl = $('periodLbl');
    els.feed = $('feed');
    els.startBtn = $('startBtn');
    els.homeSelect = $('homeSelect');
    els.awaySelect = $('awaySelect');
    els.halfLenSel = $('halfLenSel');
    els.diffSel = $('diffSel');
    els.etToggle = $('etToggle');
    els.soundToggle = $('soundToggle');
    els.joyBase = $('joyBase');
    els.joyKnob = $('joyKnob');
    els.shootBtn = $('shootBtn');
    els.passBtn = $('passBtn');
    els.sprintBtn = $('sprintBtn');
    els.switchBtn = $('switchBtn');
    els.pauseBtn = $('pauseBtn');
    els.pauseMenu = $('pauseMenu');
    els.resumeBtn = $('resumeBtn');
    els.quitBtn = $('quitBtn');
    els.restartBtn = $('restartBtn');
    els.fullTime = $('fullTime');
    els.ftLine = $('ftLine');
    els.ftRematch = $('ftRematch');
    els.ftMenu = $('ftMenu');
    els.shotPowerWrap = $('shotPowerWrap');
    els.shotPowerBar = $('shotPowerBar');
    els.installBtn = $('installBtn');
    els.offlineBadge = $('offlineBadge');
    els.kitHome = $('kitHome');
    els.kitAway = $('kitAway');

    populateClubSelects();
    bindMenu();
    bindPause();
    bindOffline();

    input = new AS.Input({
      joyEl: els.joyBase, joyKnob: els.joyKnob,
      shootBtn: els.shootBtn, passBtn: els.passBtn,
      sprintBtn: els.sprintBtn, switchBtn: els.switchBtn
    });

    window.addEventListener('resize', function () { if (renderer) renderer.resize(); });
  };

  function populateClubSelects() {
    AS.CLUBS.forEach(function (c, i) {
      var o1 = document.createElement('option'); o1.value = i; o1.textContent = c.name;
      var o2 = document.createElement('option'); o2.value = i; o2.textContent = c.name;
      els.homeSelect.appendChild(o1); els.awaySelect.appendChild(o2);
    });
    els.homeSelect.value = 0; els.awaySelect.value = 1;
    updateKitPreview();
    els.homeSelect.addEventListener('change', updateKitPreview);
    els.awaySelect.addEventListener('change', updateKitPreview);
  }

  function updateKitPreview() {
    var h = AS.CLUBS[+els.homeSelect.value], a = AS.CLUBS[+els.awaySelect.value];
    els.kitHome.style.background = h.shirt; els.kitHome.style.borderColor = h.trim;
    els.kitAway.style.background = a.shirt; els.kitAway.style.borderColor = a.trim;
  }

  function bindMenu() {
    els.startBtn.addEventListener('click', function () {
      settings.homeIdx = +els.homeSelect.value;
      settings.awayIdx = +els.awaySelect.value;
      if (settings.homeIdx === settings.awayIdx) settings.awayIdx = (settings.homeIdx + 1) % AS.CLUBS.length;
      settings.halfMinutes = +els.halfLenSel.value;
      settings.difficulty = +els.diffSel.value;
      settings.extraTime = els.etToggle.checked;
      settings.sound = els.soundToggle.checked;
      startMatch();
    });
    els.ftRematch.addEventListener('click', function () { els.fullTime.classList.add('hidden'); startMatch(); });
    els.ftMenu.addEventListener('click', function () { els.fullTime.classList.add('hidden'); showMenu(); });
  }

  function bindPause() {
    els.pauseBtn.addEventListener('click', function () {
      if (!game) return;
      game.paused = !game.paused;
      els.pauseMenu.classList.toggle('hidden', !game.paused);
    });
    els.resumeBtn.addEventListener('click', function () {
      game.paused = false; els.pauseMenu.classList.add('hidden');
    });
    els.restartBtn.addEventListener('click', function () {
      els.pauseMenu.classList.add('hidden');
      startMatch();
    });
    els.quitBtn.addEventListener('click', function () {
      els.pauseMenu.classList.add('hidden');
      stopMatch();
      showMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && game) {
        game.paused = !game.paused;
        els.pauseMenu.classList.toggle('hidden', !game.paused);
      }
    });
  }

  function bindOffline() {
    window.addEventListener('online', updateOffline);
    window.addEventListener('offline', updateOffline);
    updateOffline();

    var deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      els.installBtn.classList.remove('hidden');
    });
    els.installBtn.addEventListener('click', function () {
      if (deferredPrompt) deferredPrompt.prompt();
      els.installBtn.classList.add('hidden');
    });
    window.addEventListener('appinstalled', function () { els.installBtn.classList.add('hidden'); });
  }

  function updateOffline() {
    els.offlineBadge.classList.toggle('hidden', navigator.onLine !== false);
  }

  function showMenu() {
    els.menu.classList.remove('hidden');
    els.hud.classList.add('hidden');
  }

  function showHud() {
    els.menu.classList.add('hidden');
    els.hud.classList.remove('hidden');
  }

  /* -------------------------------------------------------------- */
  function startMatch() {
    stopMatch();
    if (AS.Sound) { AS.Sound.init(); AS.Sound.resume(); AS.Sound.setMuted(!settings.sound); }

    var home = AS.CLUBS[settings.homeIdx], away = AS.CLUBS[settings.awayIdx];
    els.nameHome.textContent = home.abbr;
    els.nameAway.textContent = away.abbr;
    els.feed.innerHTML = '';

    game = new AS.Game({
      home: home, away: away,
      homeForm: '4-3-3', awayForm: pickAwayFormation(),
      halfLength: settings.halfMinutes * 60,
      etHalfLength: 7.5 * 60,
      extraTime: settings.extraTime,
      difficulty: settings.difficulty,
      onEvent: onMatchEvent,
      onGoalCB: onGoal,
      onFullTimeCB: onFullTime
    });

    showHud();

    renderer = new AS.Renderer(els.canvas);
    renderer.resize();
    updateScoreboard();
    lastT = performance.now();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function pickAwayFormation() {
    return U.pick(['4-4-2', '4-3-3', '3-5-2', '5-3-2']);
  }

  function stopMatch() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    game = null;
  }

  function onMatchEvent(e) {
    var row = document.createElement('div');
    row.className = 'feedRow feed-' + e.kind;
    row.innerHTML = '<span class="feedMin">' + (typeof e.min === 'number' ? e.min + "'" : e.min) + '</span>' +
      '<span class="feedTxt"></span>';
    row.querySelector('.feedTxt').textContent = e.text;
    els.feed.insertBefore(row, els.feed.firstChild);
    while (els.feed.children.length > 40) els.feed.removeChild(els.feed.lastChild);
  }

  function onGoal() { updateScoreboard(); flashScoreboard(); }

  function flashScoreboard() {
    var sb = $('scoreboard');
    sb.classList.remove('flash'); void sb.offsetWidth; sb.classList.add('flash');
  }

  function updateScoreboard() {
    if (!game) return;
    els.scoreHome.textContent = game.teams[0].score;
    els.scoreAway.textContent = game.teams[1].score;
    els.clock.textContent = game.half === 4 ? '' : U.fmtTime(Math.max(0, (game.currentHalfLength ? game.currentHalfLength() : game.halfLength) - game.clock)) ;
    els.clock.textContent = fmtClockUp(game);
    els.periodLbl.textContent = game.periodLabel();
  }

  function fmtClockUp(game) {
    var base = 0;
    if (game.half === 1) base = game.halfLength;
    else if (game.half === 2) base = game.halfLength * 2;
    else if (game.half === 3) base = game.halfLength * 2 + game.etHalfLength;
    else if (game.half >= 4) return 'PENS';
    var total = base + game.clock;
    return U.fmtTime(total);
  }

  function onFullTime(result) {
    setTimeout(function () {
      var a = result.home, b = result.away;
      var line;
      if (result.wentToShootout) {
        line = (a.shootoutScore > b.shootoutScore ? a.name : b.name) + ' win on penalties ' +
          Math.max(a.shootoutScore, b.shootoutScore) + '-' + Math.min(a.shootoutScore, b.shootoutScore) +
          ' (' + a.score + '-' + b.score + ' after extra time)';
      } else if (a.score === b.score) {
        line = "It's a draw, " + a.score + '-' + b.score + (result.wentToExtraTime ? ' after extra time' : '');
      } else {
        line = (a.score > b.score ? a.name : b.name) + ' win ' + Math.max(a.score, b.score) + '-' + Math.min(a.score, b.score) +
          (result.wentToExtraTime ? ' after extra time' : '');
      }
      els.ftLine.textContent = line;
      els.fullTime.classList.remove('hidden');
    }, 900);
  }

  /* -------------------------------------------------------------- */
  function loop(now) {
    rafId = requestAnimationFrame(loop);
    var dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    if (!game) return;

    handleInput(dt);
    if (!game.paused) game.step(dt);
    updateScoreboard();
    if (renderer) renderer.render(game, dt);
    updateShotPowerUI(dt);
  }

  function handleInput(dt) {
    if (!game || game.paused) return;
    var v = input.vector();
    var act = input.consume();

    game.setUserInput(v.x, v.y, act.sprint);

    if (act.switch) game.switchUserPlayer(1);

    if (game.phase === 'shootout' && game._shootPhase === 'waitingUser') {
      if (act.shoot && !chargingShot) { chargingShot = true; shotPower = 0; }
      if (chargingShot) {
        shotPower = Math.min(1, shotPower + dt / 0.9);
        if (!isShootHeld()) fireShootoutShot(v);
      }
      return;
    }

    // ---- set pieces: kickoff / free kick / throw-in / corner / goal kick / penalty ----
    // The ball has no "owner" while it's dead for a restart, so this must be handled
    // separately from open-play possession, or the user's own restarts never respond.
    var spTaker = getSetPieceTaker(game);
    if (spTaker && spTaker.userControlled) {
      if (game._setupTimer > 0) { if (chargingShot) { chargingShot = false; shotPower = 0; } return; }
      handleSetPieceInput(spTaker, act, v, dt);
      return;
    } else if (chargingShot && game.phase !== 'play') {
      chargingShot = false; shotPower = 0;
    }

    var owner = game.ball.owner;
    var isUserOnBall = owner && owner.userControlled;

    if (isUserOnBall) {
      if (act.pass) {
        var best = AS.AI.bestPass(game, owner);
        if (best) AS.AI.pass(game, owner, best);
        else AS.AI.shoot(game, owner);
      }
      if (act.shoot && !chargingShot) { chargingShot = true; shotPower = 0; }
      if (chargingShot) {
        shotPower = Math.min(1, shotPower + dt / 0.85);
        if (!isShootHeld()) fireUserShot(owner, v);
      }
    } else if (chargingShot) {
      chargingShot = false; shotPower = 0;
    }
  }

  function getSetPieceTaker(g) {
    if (g.phase === 'kickoff') return g._kickoffTaker;
    if (g.phase === 'restart' && g._restart) return g._restart.taker;
    return null;
  }

  function handleSetPieceInput(taker, act, v, dt) {
    var g = game;
    var kind = g.phase === 'kickoff' ? 'kickoff' : (g._restart ? g._restart.kind : 'freekick');

    if (kind === 'penalty') {
      if (act.shoot && !chargingShot) { chargingShot = true; shotPower = 0; }
      if (chargingShot) {
        shotPower = Math.min(1, shotPower + dt / 0.9);
        if (!isShootHeld()) {
          chargingShot = false;
          var side = v.x > 0.15 ? 1 : (v.x < -0.15 ? -1 : (Math.random() < 0.5 ? -1 : 1));
          var height = U.clamp(0.55 - v.y * 0.5, 0.05, 0.95);
          g.takePenalty(taker, { side: side, height: height });
          shotPower = 0;
        }
      }
      return;
    }

    if (act.pass) {
      var best = AS.AI.bestPass(g, taker);
      if (best) AS.AI.pass(g, taker, best);
      else fireSetPieceKick(taker, v, kind);
      return;
    }

    if (act.shoot && !chargingShot) { chargingShot = true; shotPower = 0; }
    if (chargingShot) {
      shotPower = Math.min(1, shotPower + dt / 0.85);
      if (!isShootHeld()) {
        chargingShot = false;
        fireSetPieceKick(taker, v, kind);
        shotPower = 0;
      }
    }
  }

  function fireSetPieceKick(p, v, kind) {
    var team = p.team;
    var aimx = team.attackDir, aimy = 0;
    var stickLen = Math.hypot(v.x, v.y);
    if (stickLen > 0.15) { aimx = v.x; aimy = v.y; }
    else if (kind === 'freekick') { aimx = team.targetGoalX() - p.x; aimy = P.CY - p.y; }
    var a = Math.atan2(aimy, aimx);
    var power = 13 + shotPower * 17;
    var lift = kind === 'throwin' ? 1 + shotPower * 2.5 : 2.5 + shotPower * 6.5;
    game.kick(p, Math.cos(a), Math.sin(a), power, lift, 0, 'restart');
    if (kind === 'freekick' || kind === 'corner') game._shotInFlight = true;
  }

  function isShootHeld() {
    return !!input.keys[' '] || (input._gpAWas === true);
  }

  function fireUserShot(p, v) {
    chargingShot = false;
    var team = p.team, goalX = team.targetGoalX();
    var aimx = goalX - p.x, aimy = P.CY - p.y;
    if (Math.hypot(v.x, v.y) > 0.2) {
      // steer shot direction with stick, blended toward goal
      aimx = U.lerp(aimx, v.x * 30, 0.35);
      aimy = U.lerp(aimy, v.y * 30, 0.35);
    }
    var a = Math.atan2(aimy, aimx);
    var power = 14 + shotPower * 20;
    var lift = 1 + shotPower * 5.5;
    game.kick(p, Math.cos(a), Math.sin(a), power, lift, U.rand(-0.15, 0.15), 'shot');
    game._shotInFlight = true;
    shotPower = 0;
  }

  function fireShootoutShot(v) {
    chargingShot = false;
    var side = v.x > 0.15 ? 1 : v.x < -0.15 ? -1 : (Math.random() < 0.5 ? -1 : 1);
    var height = U.clamp(0.5 - v.y * 0.5, 0.05, 0.95);
    game.userFireShootoutPenalty({ side: side, height: height });
    shotPower = 0;
  }

  function updateShotPowerUI(dt) {
    var show = chargingShot;
    els.shotPowerWrap.classList.toggle('hidden', !show);
    if (show) els.shotPowerBar.style.width = (shotPower * 100) + '%';
  }

  App.settings = settings;
  root.PitchLegends = App;
})(typeof window !== 'undefined' ? window : globalThis);

document.addEventListener('DOMContentLoaded', function () { PitchLegends.init(); });
