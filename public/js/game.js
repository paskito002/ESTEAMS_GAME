/* Pitch Legends — match engine */
(function (root) {
  'use strict';
  var AS = root.AS = root.AS || {};
  var U = AS.U, P = AS.P;

  var CFG = {
    HALF_LENGTH: 15 * 60,     // seconds of match-clock per half (15 = "half time" default)
    ET_HALF: 15 * 60,         // each extra-time half length: two 15s = 30 total... overridden below
    SPEED: 1,                 // match-seconds per real second (arcade pace)
    PEN_TAKERS: 5
  };

  function Game(opts) {
    opts = opts || {};
    this.mode = opts.mode || 'exhibition';        // exhibition | league | career (all local)
    this.halfLength = opts.halfLength || CFG.HALF_LENGTH;
    this.etHalfLength = opts.etHalfLength || Math.min(this.halfLength, 15 * 60) * 0.5 && (opts.etHalfLength || 7.5 * 60);
    this.extraTimeOn = opts.extraTime !== false;
    this.difficulty = opts.difficulty !== undefined ? opts.difficulty : 0.55;
    this.userSide = 0;

    this.ball = new AS.Ball();
    this.fx = new AS.FX();
    this.ref = new AS.Referee(this);
    this.teams = [
      new AS.Team(opts.home, 0, opts.homeForm || '4-3-3', { isUser: true, difficulty: this.difficulty }),
      new AS.Team(opts.away, 1, opts.awayForm || '4-4-2', { isUser: false, difficulty: this.difficulty })
    ];

    this.time = 0;                 // wall time in current phase (s)
    this.clock = 0;                // match clock this half (s)
    this.half = 0;                 // 0 first half, 1 second half, 2/3 ET halves, 4 shootout
    this.totalClock = 0;            // cumulative displayed minute basis
    this.stoppage = 0;              // extra seconds added due to stoppages this half
    this.phase = 'kickoff';         // kickoff | play | stoppedForRestart | halfEnd | fullEnd | goalCelebration | shootout | matchEnd
    this.paused = false;
    this.speed = CFG.SPEED;
    this.events = [];               // {min, text, kind, team}
    this.pendingIndirect = null;
    this.lastPasser = null;
    this.woodworkCount = 0;
    this.matchOver = false;
    this.wentToExtraTime = false;
    this.wentToShootout = false;
    this.onUpdate = opts.onUpdate || function () {};
    this.onEvent = opts.onEvent || function () {};
    this.onGoalCB = opts.onGoalCB || function () {};
    this.onWhistleCB = opts.onWhistleCB || function () {};
    this.onFullTimeCB = opts.onFullTimeCB || function () {};

    this._restart = null;
    this._setupTimer = 0;
    this._celebT = 0;
    this._afterGoal = null;

    this.beginKickoff(0, true);
  }

  Game.prototype.opponentOf = function (team) { return team === this.teams[0] ? this.teams[1] : this.teams[0]; };
  Game.prototype.stats = function (team) { return team.stats; };

  Game.prototype.say = function (text, kind, team) {
    var min = this.displayMinute();
    var e = { min: min, text: text, kind: kind || 'info', team: team || null };
    this.events.unshift(e);
    if (this.events.length > 80) this.events.length = 80;
    this.onEvent(e);
  };

  Game.prototype.periodLabel = function () {
    return ['1st Half', '2nd Half', 'ET 1st Half', 'ET 2nd Half', 'Penalties'][this.half] || '';
  };

  Game.prototype.displayMinute = function () {
    var base = 0, cap = this.halfLength;
    if (this.half === 0) base = 0;
    else if (this.half === 1) base = this.halfLength;
    else if (this.half === 2) base = this.halfLength * 2;
    else if (this.half === 3) base = this.halfLength * 2 + this.etHalfLength;
    else return "PEN";
    var m = Math.floor((base + this.clock) / 60) + 1;
    return m;
  };

  /* =====================================================================
     KICK-OFF / RESTART SETUP
     ===================================================================== */
  Game.prototype.beginKickoff = function (byTeamIdx, isMatchStart) {
    this.phase = 'kickoff';
    this.ref.restartExempt = true;
    this.ref.clearOffside();
    this.ball.place(P.CX, P.CY);

    for (var s = 0; s < 2; s++) {
      var team = this.teams[s];
      var field = team.onFieldPlayers();
      for (var i = 0; i < field.length; i++) {
        var p = field[i];
        var pos = team.slotToPitch(p.slot);
        if (!p.isGK) {
          // huddle to own half for kickoff
          var half = team.attackDir > 0 ? Math.min(pos.x, P.CX - 0.3) : Math.max(pos.x, P.CX + 0.3);
          p.x = half; p.y = pos.y;
        } else {
          p.x = pos.x; p.y = pos.y;
        }
        p.reset();
      }
    }
    var kicker = this.teams[byTeamIdx].onFieldPlayers().filter(function (p) { return !p.isGK; })
      .sort(function (a, b) { return Math.abs(a.y - P.CY) - Math.abs(b.y - P.CY); })[0];
    if (kicker) { kicker.x = P.CX - this.teams[byTeamIdx].attackDir * 0.6; kicker.y = P.CY; }
    this._kickoffTaker = kicker;
    this._kickoffTeam = byTeamIdx;
    this._setupTimer = 1.0;
    this.assignUserControl();
  };

  Game.prototype.setRestart = function (kind, team, x, y, opts) {
    opts = opts || {};
    this.phase = 'restart';
    this._restart = { kind: kind, team: team, x: x, y: y };
    if (opts.exempt) this.ref.restartExempt = true;

    var opp = this.opponentOf(team);
    var keepOutR = kind === 'corner' ? 9.15 : kind === 'penalty' ? 9.15 : 9.15;

    this.ball.place(x, y);
    if (kind === 'goalkick') this.ball.z = 0;

    var self = this;
    function place(list) {
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        p.reset();
        var d = U.dist(p.x, p.y, x, y);
        if (p.team === opp && !p.isGK && d < keepOutR) {
          var away = U.norm(p.x - x, p.y - y);
          if (away.l < 0.01) away = { x: -opp.attackDir, y: 0 };
          p.x = x + away.x * keepOutR; p.y = y + away.y * keepOutR;
          P.clampToArea(p, 0.4);
        }
      }
    }
    place(this.teams[0].onFieldPlayers());
    place(this.teams[1].onFieldPlayers());

    if (kind === 'throwin') {
      var taker = team.onFieldPlayers().filter(function (p) { return !p.isGK; })
        .sort(function (a, b) { return U.dist(a.x, a.y, x, y) - U.dist(b.x, b.y, x, y); })[0];
      if (taker) { taker.x = U.clamp(x, 0.2, P.L - 0.2); taker.y = y === 0 ? 0.1 : P.W - 0.1; }
      this._restart.taker = taker;
    } else {
      var taker2 = this.pickSetPieceTaker(team, kind, x, y);
      this._restart.taker = taker2;
      if (taker2) { taker2.x = x + (team.attackDir) * -0.4; taker2.y = y; }
      // corner/goal-kick target runs handled generically by normal AI positioning
    }
    this._setupTimer = kind === 'penalty' ? 1.6 : 1.1;
    this.assignUserControl();
  };

  Game.prototype.pickSetPieceTaker = function (team, kind, x, y) {
    var list = team.onFieldPlayers().filter(function (p) { return !p.isGK; });
    if (!list.length) return null;
    if (kind === 'corner') {
      return list.sort(function (a, b) { return b.attr.pass - a.attr.pass; })[0];
    }
    return list.sort(function (a, b) {
      var da = U.dist(a.x, a.y, x, y), db = U.dist(b.x, b.y, x, y);
      var sa = (a.attr.pass + a.attr.shoot) - da * 0.02;
      var sb = (b.attr.pass + b.attr.shoot) - db * 0.02;
      return sb - sa;
    })[0];
  };

  Game.prototype.assignUserControl = function () {
    var team = this.teams[this.userSide];
    var field = team.onFieldPlayers();
    for (var i = 0; i < field.length; i++) field[i].userControlled = false;
    if (!field.length) return;

    var owner = this.ball.owner || this.ball.heldBy;
    var pick;
    if (owner && owner.team === team) pick = owner;
    else {
      var ball = this.ball;
      pick = field.filter(function (p) { return !p.isGK; })
        .sort(function (a, b) { return U.dist(a.x, a.y, ball.x, ball.y) - U.dist(b.x, b.y, ball.x, ball.y); })[0] || field[0];
    }
    pick.userControlled = true;
    this.userPlayer = pick;
  };

  Game.prototype.switchUserPlayer = function (dir) {
    var team = this.teams[this.userSide];
    var field = team.onFieldPlayers().filter(function (p) { return !p.isGK; });
    if (!field.length) return;
    var ball = this.ball;
    field.sort(function (a, b) { return U.dist(a.x, a.y, ball.x, ball.y) - U.dist(b.x, b.y, ball.x, ball.y); });
    var idx = field.indexOf(this.userPlayer);
    idx = (idx + (dir || 1) + field.length) % field.length;
    for (var i = 0; i < field.length; i++) field[i].userControlled = false;
    this.userPlayer = field[idx];
    this.userPlayer.userControlled = true;
  };

  /* =====================================================================
     KICKING / BALL CONTACT
     ===================================================================== */
  Game.prototype.kick = function (p, dirx, diry, power, lift, spin, kind) {
    var b = this.ball;
    var n = U.norm(dirx, diry);
    b.owner = null;
    b.vx = n.x * power; b.vy = n.y * power;
    b.vz = lift || 0;
    b.spin = spin || 0;
    b.x = p.x + n.x * (p.radius + AS.BALL_R + 0.05);
    b.y = p.y + n.y * (p.radius + AS.BALL_R + 0.05);
    if (b.z < 0.05) b.z = 0.05;
    b.lastTouch = { team: p.team, player: p, deliberate: true, kind: kind || 'kick' };
    b.prevTouch = b.lastTouch;
    b.kickLock = 0.12; b.lockFor = p;
    p.kickCd = kind === 'shot' ? 0.5 : 0.32;
    this.lastKicker = p;

    if (kind === 'shot') { p.stats.shots++; this.stats(p.team).shots++; if (Math.abs(diry) < 1) {} }
    if (kind === 'pass' || kind === 'through') { p.stats.passes++; this.stats(p.team).passes++; this._pendingPassCredit = p; }

    if (this.phase === 'restart' || this.phase === 'kickoff') {
      this.phase = 'play';
      this._restart = null;
    }
    this.ref.snapshotOffside(p);
    if (AS.Sound) AS.Sound.kick(U.clamp(power / 30, 0, 1));
    this.fx.dust(p.x, p.y, U.clamp(power / 26, 0.2, 1));
  };

  Game.prototype.gather = function (k) {
    var b = this.ball;
    b.heldBy = k; b.owner = null;
    b.vx = b.vy = b.vz = 0;
    b.lastTouch = { team: k.team, player: k, deliberate: true, kind: 'save' };
    k.stats.saves += (this._shotInFlight ? 1 : 0);
    this._shotInFlight = false;
    if (AS.Sound) AS.Sound.tap();
  };

  Game.prototype.parry = function (k) {
    var b = this.ball;
    var n = U.norm(b.vx, b.vy);
    var side = (Math.random() < 0.5 ? -1 : 1);
    var perp = { x: -n.y * side, y: n.x * side };
    b.vx = (-n.x * 0.3 + perp.x) * 12;
    b.vy = (-n.y * 0.3 + perp.y) * 12;
    b.vz = U.rand(3, 6);
    k.stats.saves++;
    this.stats(k.team).saves++;
    b.lastTouch = { team: k.team, player: k, deliberate: true, kind: 'parry' };
    this._shotInFlight = false;
    this.say(k.name + ' with a fine save!', 'save', k.team);
    if (AS.Sound) AS.Sound.tap();
    this.fx.spark(b.x, b.y, '#ffffff');
  };

  Game.prototype.onWoodwork = function (part) {
    this.woodworkCount++;
    this.say('Off the ' + part + '!', 'chance');
    this.fx.spark(this.ball.x, this.ball.y, '#ffe27a');
    if (AS.Sound) AS.Sound.post();
    this.fx.addShake(0.5);
  };

  Game.prototype.defendersBetween = function (attacker, attTeam) {
    var opp = this.opponentOf(attTeam);
    var goalX = attTeam.targetGoalX();
    var list = opp.onFieldPlayers();
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (d.isGK) continue;
      if ((d.x - attacker.x) * attTeam.attackDir > 0 && (d.x - goalX) * attTeam.attackDir < 0) n++;
    }
    return n;
  };

  /* =====================================================================
     GOALS
     ===================================================================== */
  Game.prototype.onGoal = function (scorer, conceder, y, z) {
    scorer.score++;
    var scorerPlayer = null, assistPlayer = null;
    var lt = this.ball.lastTouch;
    if (lt && lt.team === scorer) { scorerPlayer = lt.player; scorerPlayer.stats.goals++; }
    if (this._pendingPassCredit && this._pendingPassCredit !== scorerPlayer && this._pendingPassCredit.team === scorer) {
      assistPlayer = this._pendingPassCredit; assistPlayer.stats.assists++;
      this.stats(scorer).passesOk++;
    }
    this.stats(scorer).onTarget++;

    if (this.phase === 'shootout') { this.shootoutGoalScored(scorer); return; }

    this.phase = 'goalCelebration';
    this._celebT = 3.0;
    this.ball.vx = this.ball.vy = this.ball.vz = 0;
    var text = (scorerPlayer ? scorerPlayer.name : scorer.name) + ' scores' + (assistPlayer ? ' (assist: ' + assistPlayer.name + ')' : '') + '! ' + this.teams[0].abbr + ' ' + this.teams[0].score + ' - ' + this.teams[1].score + ' ' + this.teams[1].abbr;
    this.say(text, 'goal', scorer);
    if (AS.Sound) { AS.Sound.whistle('short'); AS.Sound.cheer(1); AS.Sound.net(); }
    this.fx.confetti(this.ball.x, this.ball.y, scorer.colors.shirt, scorer.colors.trim);
    this.fx.addFlash(1); this.fx.addShake(1.2);
    this.onGoalCB({ scorer: scorer, scorerPlayer: scorerPlayer, assistPlayer: assistPlayer });
    this._afterGoal = conceder;
    this._pendingPassCredit = null;
  };

  /* =====================================================================
     FREE KICKS / PENALTIES
     ===================================================================== */
  Game.prototype.awardFreeKick = function (team, x, y, indirect, offender, card) {
    this.say((card ? (card === 'red' ? 'RED CARD! ' : 'Yellow card. ') : '') + 'Foul' + (offender ? ' by ' + offender.name : '') + ' — free kick to ' + team.abbr, card ? 'card' : 'foul', team);
    if (card && AS.Sound) AS.Sound.card(card === 'red');
    else if (AS.Sound) AS.Sound.whistle('short');
    if (indirect) this.pendingIndirect = { taker: null };
    this.setRestart('freekick', team, U.clamp(x, 1, P.L - 1), U.clamp(y, 1, P.W - 1), { exempt: false });
    if (this.pendingIndirect) this.pendingIndirect.taker = this._restart.taker;
  };

  Game.prototype.awardPenalty = function (team, offender, card) {
    this.say((card ? (card === 'red' ? 'RED CARD! ' : 'Yellow card. ') : '') + 'PENALTY! ' + (offender ? offender.name + ' fouls in the box' : 'Foul in the box') + ' — ' + team.abbr + ' to the spot', 'card', team);
    if (card && AS.Sound) AS.Sound.card(card === 'red');
    var goalX = team.targetGoalX();
    var spotX = goalX === 0 ? P.PEN_SPOT : P.L - P.PEN_SPOT;
    this.phase = 'restart';
    this.ref.restartExempt = true;
    this.ball.place(spotX, P.CY);
    var opp = this.opponentOf(team);
    var self = this;
    [this.teams[0], this.teams[1]].forEach(function (t) {
      var list = t.onFieldPlayers();
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        p.reset();
        if (p.isGK && p.team === opp) { p.x = goalX === 0 ? 0.3 : P.L - 0.3; p.y = P.CY; continue; }
        if (p.isGK && p.team === team) continue;
        // everyone else outside the box and 9.15m from the spot, roughly on the D
        var away = U.norm(p.x - spotX, p.y - P.CY);
        if (away.l < 0.01) away = { x: goalX === 0 ? 1 : -1, y: 0.3 };
        var placeX = spotX + away.x * 13;
        var placeY = P.CY + away.y * 13;
        p.x = U.clamp(placeX, goalX === 0 ? P.PEN_DEPTH + 3 : 4, goalX === 0 ? P.L - 4 : P.L - P.PEN_DEPTH - 3);
        p.y = U.clamp(placeY, 2, P.W - 2);
      }
    });
    var taker = this.pickSetPieceTaker(team, 'penalty', spotX, P.CY);
    if (taker) { taker.x = spotX - team.attackDir * 2.2; taker.y = P.CY; }
    this._restart = { kind: 'penalty', team: team, x: spotX, y: P.CY, taker: taker };
    this._setupTimer = 1.7;
    this.assignUserControl();
  };

  /* =====================================================================
     OFFSIDE WHISTLE
     ===================================================================== */
  Game.prototype.whistleOffside = function (player) {
    var team = player.team, opp = this.opponentOf(team);
    this.say('Offside! Flag against ' + player.name, 'foul', opp);
    if (AS.Sound) AS.Sound.whistle('short');
    var x = U.clamp(player.x, 1, P.L - 1), y = U.clamp(player.y, 1, P.W - 1);
    this.setRestart('freekick', opp, x, y, { exempt: false });
  };

  /* =====================================================================
     PENALTY SHOOTOUT
     ===================================================================== */
  Game.prototype.beginShootout = function () {
    this.wentToShootout = true;
    this.phase = 'shootout';
    this.shootoutOrder = Math.random() < 0.5 ? 0 : 1;
    this.shootoutRound = 0;
    this.say('It\'s going to penalties!', 'info');
    this.startShootoutKick();
  };

  Game.prototype.startShootoutKick = function () {
    var takerIdx = (this.shootoutRound + this.shootoutOrder) % 2;
    var team = this.teams[takerIdx];
    var opp = this.opponentOf(team);
    if (this.shootoutDone()) { this.finishShootout(); return; }

    var goalX = team.targetGoalX();
    var spotX = goalX === 0 ? P.PEN_SPOT : P.L - P.PEN_SPOT;
    this.ball.place(spotX, P.CY);
    [this.teams[0], this.teams[1]].forEach(function (t) { t.onFieldPlayers().forEach(function (p) { p.reset(); }); });

    var pool = team.players.filter(function (p) { return !p.sentOff && !p.isGK; });
    var already = team.shootoutLog.map(function (l) { return l.player; });
    var fresh = pool.filter(function (p) { return already.indexOf(p) === -1; });
    var taker = (fresh.length ? fresh : pool).sort(function (a, b) { return b.attr.shoot - a.attr.shoot; })[0];
    var keeper = opp.keeper() || opp.players.filter(function (p) { return p.isGK; })[0];

    taker.x = spotX - team.attackDir * 2.2; taker.y = P.CY;
    keeper.x = goalX === 0 ? 0.3 : P.L - 0.3; keeper.y = P.CY;
    keeper.onField = true;
    this.teams[0].onFieldPlayers().forEach(function (p) { p.userControlled = false; });
    this.teams[1].onFieldPlayers().forEach(function (p) { p.userControlled = false; });
    if (team.isUser) taker.userControlled = true; else if (opp.isUser) keeper.userControlled = true;

    this._shootTaker = taker; this._shootKeeper = keeper; this._shootTeam = team;
    this._setupTimer = 1.3;
    this._shootPhase = 'ready';
    this.userPlayer = team.isUser ? taker : keeper;
  };

  Game.prototype.shootoutDone = function () {
    var a = this.teams[0], b = this.teams[1];
    var takenEach = Math.ceil(this.shootoutRound / 2) || 0;
    if (this.shootoutRound < 10) {
      // sudden-ish stop once outcome is decided within first 5 rounds each
      var aTaken = a.shootoutLog.length, bTaken = b.shootoutLog.length;
      var aRemain = 5 - aTaken, bRemain = 5 - bTaken;
      if (a.shootoutScore > b.shootoutScore + bRemain) return true;
      if (b.shootoutScore > a.shootoutScore + aRemain) return true;
      return aTaken >= 5 && bTaken >= 5;
    }
    return a.shootoutScore !== b.shootoutScore && a.shootoutLog.length === b.shootoutLog.length;
  };

  Game.prototype.shootoutGoalScored = function (team) {
    team.shootoutScore++;
    team.shootoutLog.push({ player: this._shootTaker, in: true });
    this.say(this._shootTaker.name + ' scores! (' + this.teams[0].shootoutScore + '-' + this.teams[1].shootoutScore + ')', 'goal', team);
    if (AS.Sound) { AS.Sound.cheer(0.7); AS.Sound.net(); }
    this.fx.confetti(this.ball.x, this.ball.y, team.colors.shirt, team.colors.trim);
    this.advanceShootout();
  };

  Game.prototype.shootoutMiss = function (team, reason) {
    team.shootoutLog.push({ player: this._shootTaker, in: false });
    this.say(this._shootTaker.name + ' ' + (reason || 'misses') + '! (' + this.teams[0].shootoutScore + '-' + this.teams[1].shootoutScore + ')', 'foul', team);
    if (AS.Sound) AS.Sound.groan();
    this.advanceShootout();
  };

  Game.prototype.advanceShootout = function () {
    this.shootoutRound++;
    this._setupTimer = 1.4;
    var self = this;
    this._afterShootoutKick = function () {
      if (self.shootoutDone()) self.finishShootout();
      else self.startShootoutKick();
    };
  };

  Game.prototype.finishShootout = function () {
    this.phase = 'matchEnd';
    this.matchOver = true;
    var winner = this.teams[0].shootoutScore > this.teams[1].shootoutScore ? this.teams[0] : this.teams[1];
    this.say(winner.name + ' win the shootout ' + Math.max(this.teams[0].shootoutScore, this.teams[1].shootoutScore) + '-' + Math.min(this.teams[0].shootoutScore, this.teams[1].shootoutScore) + '!', 'full', winner);
    if (AS.Sound) AS.Sound.whistle('long');
    this.onFullTimeCB(this.result());
  };

  Game.prototype.result = function () {
    return {
      home: this.teams[0], away: this.teams[1],
      wentToExtraTime: this.wentToExtraTime, wentToShootout: this.wentToShootout
    };
  };

  Game.prototype.addStoppage = function (sec) { this.stoppage += sec; };

  /* =====================================================================
     HALF / MATCH FLOW
     ===================================================================== */
  Game.prototype.endHalf = function () {
    this.phase = 'halfEnd';
    if (AS.Sound) AS.Sound.whistle(this.half === 1 || this.half === 3 ? 'triple' : 'double');
    this.onWhistleCB(this.half);

    if (this.half === 0) {
      this.say('Half-time.', 'ht');
      this._afterHalt = function () { this.startSecondHalf(); }.bind(this);
    } else if (this.half === 1) {
      if (this.needsExtraTime()) {
        this.say('Full-time. Scores level — we\'re going to extra time!', 'ft');
        this._afterHalt = function () { this.startExtraTime(); }.bind(this);
      } else {
        this.finishMatch();
      }
    } else if (this.half === 2) {
      this.say('End of the first period of extra time.', 'ht');
      this._afterHalt = function () { this.startEtSecondHalf(); }.bind(this);
    } else if (this.half === 3) {
      if (this.needsShootout()) {
        this.say('Still level after extra time!', 'ft');
        this._afterHalt = function () { this.beginShootout(); }.bind(this);
      } else {
        this.finishMatch();
      }
    }
    this._haltTimer = 2.6;
  };

  Game.prototype.needsExtraTime = function () {
    return this.extraTimeOn && this.teams[0].score === this.teams[1].score && this.mode !== 'league';
  };
  Game.prototype.needsShootout = function () {
    return this.teams[0].score === this.teams[1].score;
  };

  Game.prototype.startSecondHalf = function () {
    this.half = 1; this.clock = 0; this.stoppage = 0;
    this.teams[0].attackDir *= -1; this.teams[1].attackDir *= -1;
    this.beginKickoff(1 - this._kickoffTeam, false);
    this.say('Second half under way.', 'kickoff');
  };

  Game.prototype.startExtraTime = function () {
    this.wentToExtraTime = true;
    this.half = 2; this.clock = 0; this.stoppage = 0;
    // sides keep the ends they had at the end of normal time, swap for ET 2nd half like real rules
    this.beginKickoff(Math.random() < 0.5 ? 0 : 1, false);
    this.say('Extra time begins!', 'kickoff');
  };
  Game.prototype.startEtSecondHalf = function () {
    this.half = 3; this.clock = 0; this.stoppage = 0;
    this.teams[0].attackDir *= -1; this.teams[1].attackDir *= -1;
    this.beginKickoff(1 - this._kickoffTeam, false);
    this.say('Second period of extra time.', 'kickoff');
  };

  Game.prototype.finishMatch = function () {
    this.phase = 'matchEnd';
    this.matchOver = true;
    var a = this.teams[0], b = this.teams[1];
    var line = a.score === b.score ? 'Full-time: it finishes level, ' + a.score + '-' + b.score + '.' :
      'Full-time! ' + (a.score > b.score ? a.name : b.name) + ' win ' + Math.max(a.score, b.score) + '-' + Math.min(a.score, b.score) + '.';
    this.say(line, 'full');
    if (AS.Sound) AS.Sound.whistle('long');
    this.onFullTimeCB(this.result());
  };

  Game.prototype.currentHalfLength = function () {
    return (this.half === 2 || this.half === 3) ? this.etHalfLength : this.halfLength;
  };

  /* =====================================================================
     MAIN STEP
     ===================================================================== */
  Game.prototype.step = function (dt) {
    if (this.paused || this.matchOver && this.phase !== 'shootout') { /* still allow shootout anims */ }
    dt = Math.min(dt, 1 / 20) * this.speed;
    this.time += dt;

    if (this.fx) this.fx.update(dt);
    if (AS.Sound) AS.Sound.update(dt);

    if (this.phase === 'goalCelebration') {
      this._celebT -= dt;
      if (this._celebT <= 0) {
        var conceder = this._afterGoal;
        this._afterGoal = null;
        this.beginKickoff(conceder === this.teams[0] ? 0 : 1, false);
      }
      return;
    }

    if (this.phase === 'halfEnd') {
      this._haltTimer -= dt;
      if (this._haltTimer <= 0 && this._afterHalt) { var fn = this._afterHalt; this._afterHalt = null; fn(); }
      return;
    }

    if (this.phase === 'matchEnd') return;

    if (this.phase === 'shootout') {
      this.stepShootout(dt);
      return;
    }

    if (this.phase === 'kickoff' || this.phase === 'restart') {
      this._setupTimer -= dt;
      this.holdSetPiece(dt);
      if (this._setupTimer <= 0) {
        var taker = this.phase === 'kickoff' ? this._kickoffTaker : (this._restart && this._restart.taker);
        if (taker && taker.userControlled) {
          // safety net: never let a match hang forever waiting on the user —
          // give them a generous window, then take the restart for them.
          this._userWaitT = (this._userWaitT || 0) + dt;
          if (this._userWaitT > 9) { this._userWaitT = 0; this.autoTakeRestartForced(); }
        } else {
          this._userWaitT = 0;
          this.autoStartIfNeeded();
        }
      }
      this.updateFielders(dt, true);
      return;
    }
    this._userWaitT = 0;

    // ---- live play ----
    this.clock += dt;
    this.updateFielders(dt, false);
    this.updateBallAndContacts(dt);
    this.ref.update(dt);

    var cap = this.currentHalfLength() + this.stoppage;
    if (this.clock >= cap && this.ballIsSafeForWhistle()) {
      this.endHalf();
    }
  };

  Game.prototype.ballIsSafeForWhistle = function () {
    // don't blow full time mid-passage inside a box scramble; just check phase is normal play
    return this.phase === 'play';
  };

  Game.prototype.holdSetPiece = function (dt) {
    var r = this._restart;
    if (!r && this.phase !== 'kickoff') return;
    var taker = this.phase === 'kickoff' ? this._kickoffTaker : (r && r.taker);
    if (taker) { taker.frozen = 0.05; }
  };

  Game.prototype.autoStartIfNeeded = function () {
    if (this.phase === 'kickoff') {
      var t = this._kickoffTaker;
      if (t && !t.userControlled) {
        this.kick(t, this.teams[this._kickoffTeam].attackDir, U.rand(-0.15, 0.15), 9 + Math.random() * 2, 0, 0, 'restart');
      } else if (!t) {
        this.phase = 'play';
      }
      return;
    }
    if (this.phase === 'restart') {
      var r = this._restart;
      if (!r) { this.phase = 'play'; return; }
      var taker = r.taker;
      if (!taker) { this.phase = 'play'; this._restart = null; return; }
      if (!taker.userControlled) this.autoTakeRestart(r, taker);
    }
  };

  /* Forced fallback so a match can never hang forever on an idle human player */
  Game.prototype.autoTakeRestartForced = function () {
    if (this.phase === 'kickoff') {
      var t = this._kickoffTaker;
      if (t) this.kick(t, this.teams[this._kickoffTeam].attackDir, U.rand(-0.15, 0.15), 9 + Math.random() * 2, 0, 0, 'restart');
      else this.phase = 'play';
      return;
    }
    if (this.phase === 'restart' && this._restart) {
      if (this._restart.kind === 'penalty') this.takePenalty(this._restart.taker, null);
      else this.autoTakeRestart(this._restart, this._restart.taker);
    }
  };

  Game.prototype.autoTakeRestart = function (r, taker) {
    var team = r.team, opp = this.opponentOf(team);
    if (r.kind === 'throwin') {
      var best = AS.AI.bestPass(this, taker) || { x: r.x + team.attackDir * 8, y: r.y === 0 ? 6 : P.W - 6 };
      var dx = best.x - taker.x, dy = best.y - taker.y;
      var a = Math.atan2(dy, dx);
      this.kick(taker, Math.cos(a), Math.sin(a), U.clamp(Math.hypot(dx, dy) * 0.9, 6, 16), 1.5, 0, 'restart');
      return;
    }
    if (r.kind === 'goalkick') {
      var target = AS.AI.bestPass(this, taker);
      var goalX2 = team.targetGoalX();
      var tx = target ? target.x : P.CX + team.attackDir * 15;
      var ty = target ? target.y : P.CY + U.rand(-15, 15);
      var a2 = Math.atan2(ty - taker.y, tx - taker.x);
      this.kick(taker, Math.cos(a2), Math.sin(a2), 24 + Math.random() * 5, 8.5, 0, 'restart');
      return;
    }
    if (r.kind === 'corner') {
      var goalX3 = team.targetGoalX();
      var ty2 = P.CY + U.rand(-6, 6);
      var a3 = Math.atan2(ty2 - taker.y, goalX3 - taker.x);
      this.kick(taker, Math.cos(a3), Math.sin(a3), 20 + Math.random() * 4, 6.5, U.rand(-0.3, 0.3), 'restart');
      return;
    }
    if (r.kind === 'penalty') {
      this.takePenalty(taker, null);
      return;
    }
    // free kick
    var goalX4 = team.targetGoalX();
    var dGoal = U.dist(taker.x, taker.y, goalX4, P.CY);
    if (dGoal < 28 && P.goalAngle(taker.x, taker.y, goalX4) > 0.28) {
      AS.AI.shoot(this, taker);
    } else {
      var best2 = AS.AI.bestPass(this, taker);
      if (best2) AS.AI.pass(this, taker, best2);
      else {
        var a4 = Math.atan2(P.CY - taker.y, goalX4 - taker.x);
        this.kick(taker, Math.cos(a4), Math.sin(a4), 20, 6, 0, 'restart');
      }
    }
  };

  Game.prototype.takePenalty = function (taker, aimOverride) {
    var team = taker.team, goalX = team.targetGoalX();
    var side = aimOverride ? aimOverride.side : (Math.random() < 0.5 ? -1 : 1);
    var height = aimOverride ? aimOverride.height : Math.random();
    var aimY = P.CY + side * U.rand(P.GOAL_W * 0.28, P.GOAL_W * 0.46);
    var aimZ = 0.3 + height * (P.GOAL_H - 0.6);
    var errBase = (1 - taker.attr.shoot) * 0.05;
    var a = Math.atan2(aimY - taker.y, goalX - taker.x) + U.gauss() * errBase;
    var power = 24 + taker.attr.shoot * 5;
    var lift = aimZ * 5.2;
    this.penSpotY = aimY; this.penSpotZ = aimZ;
    this.kick(taker, Math.cos(a), Math.sin(a), power, lift, 0, 'shot');
    this._shotInFlight = true;
    if (this.phase !== 'shootout') this.phase = 'play';
    if (AS.Sound) AS.Sound.whistle('short');
  };

  /* keeper dive decision for a penalty, called from stepShootout / free play GK already handles run-of-play shots */

  Game.prototype.stepShootout = function (dt) {
    if (this._setupTimer > 0) {
      this._setupTimer -= dt;
      if (this._setupTimer <= 0) {
        if (this._afterShootoutKick) { var f = this._afterShootoutKick; this._afterShootoutKick = null; f(); return; }
        if (this._shootPhase === 'ready' && this._shootTaker) {
          var t = this._shootTaker;
          if (!t.userControlled) {
            this.takePenalty(t, null);
            this._shootPhase = 'kicked';
            this._shootResolveT = 1.8;
            var self = this; self._diveKeeper();
          } else {
            this._shootPhase = 'waitingUser';
          }
        }
      }
      this.updateFielders(dt, true);
      return;
    }
    if (this._shootPhase === 'waitingUser') {
      this.updateFielders(dt, true);
      if (this._userShotFired) {
        this._userShotFired = false;
        this._shootPhase = 'kicked';
        this._shootResolveT = 1.8;
        this._diveKeeper();
      }
      return;
    }
    if (this._shootPhase === 'kicked') {
      this.updateBallAndContacts(dt);
      this.updateFielders(dt, false);
      this._shootResolveT -= dt;
      var b = this.ball;
      var goalX = this._shootTeam.targetGoalX();
      if (Math.abs(b.x - goalX) < 0.5 && this._shootResolveT > 0) {
        // resolved via checkGoalLine/gather already
      }
      if (this._shootResolveT <= 0 && this.phase === 'shootout') {
        this.shootoutMiss(this._shootTeam, 'goes wide');
        this._shootPhase = 'done';
      }
    }
  };

  Game.prototype._diveKeeper = function () {
    var k = this._shootKeeper;
    if (!k || k.userControlled) return;
    var goalX = k.team.ownGoalX();
    var side = Math.random() < 0.5 ? -1 : 1;
    var guess = (Math.random() < (0.35 + k.attr.reflex * 0.3));
    setTimeout(function () {
      if (!guess) return;
      k.state = 'keeperDive';
      k.stateT = 0.7;
      var targetY = P.CY + side * P.GOAL_W * 0.32;
      var dv = U.norm(targetY - k.y, 0);
      k.vy = side * (7 + k.attr.reflex * 5);
      k.vx = (goalX === 0 ? 1 : -1) * 1.5;
    }, 180 + Math.random() * 140);
  };

  Game.prototype.userFireShootoutPenalty = function (aim) {
    if (this.phase === 'shootout' && this._shootPhase === 'waitingUser') {
      this.takePenalty(this._shootTaker, aim);
      this._userShotFired = true;
    }
  };

  /* =====================================================================
     BALL <-> PLAYER CONTACT (dribble, gather, header/volley taps)
     ===================================================================== */
  Game.prototype.updateBallAndContacts = function (dt) {
    var b = this.ball;
    b.px = b.x; b.py = b.y; b.pz = b.z;

    if (b.owner) {
      var p = b.owner;
      if (p.state !== 'normal' || p.sentOff) { b.owner = null; }
      else {
        var speed = Math.hypot(p.vx, p.vy);
        var lead = 0.5 + U.clamp(speed / 8, 0, 1) * 0.3;
        var tx = p.x + p.fx * lead, ty = p.y + p.fy * lead;
        b.x += (tx - b.x) * Math.min(1, 10 * dt);
        b.y += (ty - b.y) * Math.min(1, 10 * dt);
        b.z = 0; b.vx = p.vx; b.vy = p.vy; b.vz = 0;
        b.trail.push(b.x, b.y, b.z);
        if (b.trail.length > 36) b.trail.splice(0, 3);
      }
    }

    b.update(dt, this);

    if (this._shotInFlight === undefined) this._shotInFlight = false;
    if (b.lastTouch && b.lastTouch.kind === 'shot') this._shotInFlight = true;

    // credit a completed pass once the ball is next controlled/kicked by a mate
    if (this._pendingPassCredit && b.owner && b.owner.team === this._pendingPassCredit.team && b.owner !== this._pendingPassCredit) {
      this.stats(b.owner.team).passesOk++;
      this._pendingPassCredit.stats.passesOk++;
      this._pendingPassCredit = null;
    }

    if (b.heldBy || b.kickLock > 0) return;

    var all = this.teams[0].onFieldPlayers().concat(this.teams[1].onFieldPlayers());
    var closest = null, cd = 1e9;

    for (var i = 0; i < all.length; i++) {
      var pl = all[i];
      if (pl === b.lockFor) continue;
      if (pl.state === 'down') continue;
      var reach = pl.radius + AS.BALL_R + (pl.state === 'slide' ? 0.9 : 0.28);
      var height = pl.isGK ? 2.2 : 1.0;
      if (b.z > height) continue;
      var d = U.dist(pl.x, pl.y, b.x, b.y);
      if (d < reach && d < cd) { cd = d; closest = pl; }
    }

    if (!closest) return;

    // ---- sliding tackle resolution ----
    if (closest.state === 'slide' && !closest.slideHitBall) {
      var carrier = b.owner;
      closest.slideHitBall = true;
      closest.stats.tackles++;
      if (carrier && carrier !== closest) {
        var clean = Math.random() < (0.30 + closest.attr.tackle * 0.55 - 0.15);
        if (clean) {
          b.owner = null;
          var away = U.norm(b.x - carrier.x, b.y - carrier.y);
          if (away.l < 0.01) away = { x: closest.fx, y: closest.fy };
          b.vx = away.x * U.rand(3, 6); b.vy = away.y * U.rand(3, 6);
          b.lastTouch = { team: closest.team, player: closest, deliberate: true, kind: 'tackle' };
          this.stats(closest.team).tackles = (this.stats(closest.team).tackles || 0) + 1;
          if (AS.Sound) AS.Sound.tap();
        } else {
          this.ref.foul(closest, carrier, U.rand(0.5, 1.1));
        }
      } else if (!carrier) {
        b.owner = null;
        var n2 = U.norm(closest.fx, closest.fy);
        b.vx = n2.x * 4; b.vy = n2.y * 4;
        b.lastTouch = { team: closest.team, player: closest, deliberate: true, kind: 'tackle' };
      }
      this.fx.dust(closest.x, closest.y, 1);
      return;
    }
    if (closest.state === 'slide') return;

    // ---- shoulder-to-shoulder challenge for a loose/owned ball ----
    if (b.owner && b.owner !== closest && closest.state === 'normal') {
      var carrier2 = b.owner;
      if (carrier2.team !== closest.team) {
        var rel = U.dist(carrier2.x, carrier2.y, closest.x, closest.y);
        if (rel < closest.radius + carrier2.radius + 0.15 && closest.tackleCd <= 0) {
          var win = Math.random() < (0.42 + (closest.attr.tackle - carrier2.attr.control) * 0.35);
          closest.tackleCd = 0.5;
          if (win) {
            closest.stats.tackles++;
            this.stats(closest.team).tackles = (this.stats(closest.team).tackles || 0) + 1;
            b.owner = closest;
            b.lastTouch = { team: closest.team, player: closest, deliberate: true, kind: 'tackle' };
            if (AS.Sound) AS.Sound.tap();
          } else if (Math.random() < 0.05) {
            this.ref.foul(closest, carrier2, U.rand(0.3, 0.7));
          }
        }
        return;
      }
    }

    // ---- keeper hands ----
    if (closest.isGK) { AS.AI.keeper(this, closest, 0, {}); }

    // ---- take control (dribble) ----
    if (!b.owner || b.owner !== closest) {
      var prevOwnerTeam = b.owner ? b.owner.team : null;
      b.owner = closest;
      var isFirstTouch = !b.lastTouch || b.lastTouch.player !== closest;
      if (isFirstTouch && AS.Sound && cd < closest.radius + AS.BALL_R + 0.05) AS.Sound.tap();
      if (!b.lastTouch || b.lastTouch.team !== closest.team) {
        // possession change (interception without a modelled tackle, e.g. blocked pass)
      }
      b.lastTouch = { team: closest.team, player: closest, deliberate: false, kind: 'touch' };
    }
  };

  /* =====================================================================
     PLAYERS TICK
     ===================================================================== */
  Game.prototype.updateFielders = function (dt, frozen) {
    AS.AI.updateTeam(this, this.teams[0], dt);
    AS.AI.updateTeam(this, this.teams[1], dt);

    var user = this.userPlayer;
    if (user && user.userControlled && this._userInput) {
      user.desire.x = this._userInput.x;
      user.desire.y = this._userInput.y;
      user.desire.sprint = this._userInput.sprint;
    }

    var all = this.teams[0].onFieldPlayers().concat(this.teams[1].onFieldPlayers());
    for (var i = 0; i < all.length; i++) all[i].update(frozen ? Math.min(dt, dt) : dt, this);

    // soft body-collision separation
    for (var a = 0; a < all.length; a++) {
      for (var b2 = a + 1; b2 < all.length; b2++) {
        var pa = all[a], pb = all[b2];
        if (pa.state === 'slide' || pb.state === 'slide') continue;
        var dx = pa.x - pb.x, dy = pa.y - pb.y;
        var d = Math.hypot(dx, dy);
        var min = pa.radius + pb.radius;
        if (d < min && d > 0.001) {
          var ov = (min - d) / 2;
          var nx = dx / d, ny = dy / d;
          pa.x += nx * ov; pa.y += ny * ov;
          pb.x -= nx * ov; pb.y -= ny * ov;
        }
      }
    }
  };

  Game.prototype.setUserInput = function (x, y, sprint) {
    this._userInput = { x: x, y: y, sprint: sprint };
  };

  AS.Game = Game;
  AS.CFG = CFG;
})(typeof window !== 'undefined' ? window : globalThis);
