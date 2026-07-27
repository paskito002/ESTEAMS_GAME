/* Pitch Legends — Laws of the Game */
(function (root) {
  'use strict';
  var AS = root.AS = root.AS || {};
  var U = AS.U, P = AS.P;

  var BALL_R = 0.11;

  function Referee(game) {
    this.game = game;
    this.restartExempt = false;   // no offside directly from throw-in/goal kick/corner
    this.offsidePending = null;
    this.addedTime = 0;
    this.lastWhistle = 0;
  }

  /* ---------------------------------------------------------------
     OFFSIDE
     --------------------------------------------------------------- */

  /* x of the second-last defender of `defTeam` (the offside line) */
  Referee.prototype.offsideLineX = function (defTeam) {
    var dirToOwnGoal = -defTeam.attackDir;     // attackers move this way
    var list = defTeam.onFieldPlayers();
    var xs = [];
    for (var i = 0; i < list.length; i++) xs.push(list[i].x);
    if (!xs.length) return defTeam.ownGoalX();
    if (dirToOwnGoal < 0) {
      xs.sort(function (a, b) { return a - b; });          // own goal at x = 0
      return xs.length >= 2 ? xs[1] : xs[0];
    }
    xs.sort(function (a, b) { return b - a; });            // own goal at x = L
    return xs.length >= 2 ? xs[1] : xs[0];
  };

  /* Is this player in an offside position right now? */
  Referee.prototype.isOffsidePosition = function (p, ballX) {
    var team = p.team, dir = team.attackDir;
    var opp = this.game.opponentOf(team);
    if ((p.x - P.CX) * dir <= 0) return false;               // own half is always fine
    if ((p.x - ballX) * dir <= 0) return false;              // level with / behind the ball
    var line = this.offsideLineX(opp);
    return (p.x - line) * dir > 0.12;                        // small tolerance
  };

  /* Called every time a team deliberately plays the ball */
  Referee.prototype.snapshotOffside = function (kicker) {
    var g = this.game;
    this.clearOffside();
    if (this.restartExempt) { this.restartExempt = false; return; }
    var mates = kicker.team.onFieldPlayers();
    for (var i = 0; i < mates.length; i++) {
      var m = mates[i];
      if (m === kicker) continue;
      if (this.isOffsidePosition(m, g.ball.x)) m.offside = true;
    }
  };

  Referee.prototype.clearOffside = function () {
    var t = this.game.teams;
    for (var s = 0; s < 2; s++) {
      var list = t[s].players.concat(t[s].bench);
      for (var i = 0; i < list.length; i++) list[i].offside = false;
    }
  };

  /* ---------------------------------------------------------------
     BACK-PASS RULE (keeper may not handle a deliberate kick from a mate)
     --------------------------------------------------------------- */
  Referee.prototype.isBackPassTo = function (gk) {
    var lt = this.game.ball.lastTouch;
    if (!lt) return false;
    return lt.team === gk.team && lt.player !== gk && lt.deliberate &&
      (lt.kind === 'pass' || lt.kind === 'through' || lt.kind === 'clearance' || lt.kind === 'restart');
  };

  /* ---------------------------------------------------------------
     MAIN CHECKS — called once per physics step while the ball is live
     --------------------------------------------------------------- */
  Referee.prototype.update = function (dt) {
    var g = this.game, b = g.ball;
    if (g.phase !== 'play') return;

    // ---- goal frame + goal line ----
    if (this.checkGoalLine()) return;

    // ---- touchlines -> throw-in ----
    if (b.y < -BALL_R || b.y > P.W + BALL_R) {
      var side = b.y < 0 ? 0 : P.W;
      var lt = b.lastTouch;
      var awarded = lt ? g.opponentOf(lt.team) : g.teams[0];
      g.stats(awarded).throwIns++;
      g.setRestart('throwin', awarded, U.clamp(b.x, 0.5, P.L - 0.5), side, { exempt: true });
      g.say((lt ? lt.team.abbr : '') + ' put it out — throw-in to ' + awarded.abbr, 'info');
      return;
    }

    // ---- goal lines (outside the goal) -> goal kick or corner ----
    if (b.x < -BALL_R || b.x > P.L + BALL_R) {
      var goalX = b.x < 0 ? 0 : P.L;
      var defTeam = (g.teams[0].ownGoalX() === goalX) ? g.teams[0] : g.teams[1];
      var att = g.opponentOf(defTeam);
      var lt2 = b.lastTouch;
      var lastWasAttacker = lt2 ? lt2.team === att : true;
      if (lastWasAttacker) {
        var gy = b.y < P.CY ? P.BOX_TOP + 1.2 : P.BOX_BOT - 1.2;
        var gx = goalX === 0 ? P.BOX_DEPTH - 0.6 : P.L - P.BOX_DEPTH + 0.6;
        g.setRestart('goalkick', defTeam, gx, gy, { exempt: true });
        g.say('Goal kick to ' + defTeam.abbr, 'info');
      } else {
        var cx = goalX === 0 ? P.CORNER_R * 0.4 : P.L - P.CORNER_R * 0.4;
        var cy = b.y < P.CY ? P.CORNER_R * 0.4 : P.W - P.CORNER_R * 0.4;
        g.stats(att).corners++;
        g.setRestart('corner', att, cx, cy, { exempt: true });
        g.say('Corner to ' + att.name, 'chance');
      }
      return;
    }

    // ---- offside involvement ----
    var toucher = b.owner || b.heldBy;
    if (toucher && toucher.offside && !toucher.isGK) {
      var team = toucher.team;
      g.stats(team).offsides++;
      this.clearOffside();
      g.whistleOffside(toucher);
      return;
    }

    // ---- keeper illegally handling a back-pass is resolved in AI/gather ----
  };

  /* Returns true if play was interrupted */
  Referee.prototype.checkGoalLine = function () {
    var g = this.game, b = g.ball;
    var px = b.px, py = b.py, pz = b.pz;

    for (var s = 0; s < 2; s++) {
      var goalX = s === 0 ? 0 : P.L;
      var crossed = (px > goalX && b.x <= goalX) || (px < goalX && b.x >= goalX);
      if (!crossed) continue;
      var t = (goalX - px) / ((b.x - px) || 1e-6);
      t = U.clamp(t, 0, 1);
      var yc = py + (b.y - py) * t;
      var zc = pz + (b.z - pz) * t;

      var insidePosts = yc > P.GOAL_TOP && yc < P.GOAL_BOT;

      // crossbar
      if (insidePosts && Math.abs(zc - P.GOAL_H) < 0.22 && b.vz > -60) {
        b.x = goalX + (goalX === 0 ? 0.25 : -0.25);
        b.z = P.GOAL_H - 0.25;
        b.vz = -Math.abs(b.vz) * 0.4 - 1.5;
        b.vx *= -0.45;
        g.onWoodwork('crossbar');
        return false;
      }
      // posts
      if (zc < P.GOAL_H && (Math.abs(yc - P.GOAL_TOP) < 0.20 || Math.abs(yc - P.GOAL_BOT) < 0.20)) {
        b.x = goalX + (goalX === 0 ? 0.3 : -0.3);
        b.vx *= -0.55;
        b.vy *= 0.6;
        g.onWoodwork('post');
        return false;
      }
      // GOAL
      if (insidePosts && zc >= 0 && zc < P.GOAL_H) {
        var defTeam = (g.teams[0].ownGoalX() === goalX) ? g.teams[0] : g.teams[1];
        var scorer = g.opponentOf(defTeam);
        // indirect free kick scored straight in = goal kick instead
        if (g.pendingIndirect && g.ball.lastTouch && g.ball.lastTouch.player &&
            g.ball.lastTouch.player === g.pendingIndirect.taker &&
            g.ball.lastTouch.team === scorer) {
          g.pendingIndirect = null;
          var gy = yc < P.CY ? P.BOX_TOP + 1.2 : P.BOX_BOT - 1.2;
          var gx = goalX === 0 ? P.BOX_DEPTH - 0.6 : P.L - P.BOX_DEPTH + 0.6;
          g.say('No goal — indirect free kick cannot be scored directly', 'info');
          g.setRestart('goalkick', defTeam, gx, gy, { exempt: true });
          return true;
        }
        g.onGoal(scorer, defTeam, yc, zc);
        return true;
      }
    }
    return false;
  };

  /* ---------------------------------------------------------------
     FOULS & CARDS
     --------------------------------------------------------------- */
  Referee.prototype.foul = function (offender, victim, impact) {
    var g = this.game;
    if (g.phase !== 'play') return;
    if (g.time - this.lastWhistle < 0.4) return;
    this.lastWhistle = g.time;

    var awarded = victim.team;
    var offTeam = offender.team;
    g.stats(offTeam).fouls++;

    var inOwnBox = P.inPenaltyArea(victim.x, victim.y, offTeam.ownGoalX());
    var goalX = awarded.targetGoalX();
    var dGoal = U.dist(victim.x, victim.y, goalX, P.CY);

    // was the victim through on goal?
    var clearChance = dGoal < 30 && g.defendersBetween(victim, awarded) <= 1;

    // card decision
    var sev = impact * 0.7 + (clearChance ? 0.35 : 0) + (offender.state === 'slide' ? 0.2 : 0);
    var card = null;
    if (sev > 1.35 || (clearChance && inOwnBox && sev > 0.95)) card = 'red';
    else if (sev > 0.78) card = 'yellow';

    if (card === 'yellow') {
      offender.yellow++;
      offTeam.stats.yellow++;
      if (offender.yellow >= 2) card = 'red';
    }
    if (card === 'red') {
      offender.sentOff = true;
      offender.onField = false;
      offTeam.stats.red++;
      g.addStoppage(35);
    } else if (card === 'yellow') {
      g.addStoppage(15);
    }

    victim.knockDown(U.rand(0.7, 1.3));

    if (inOwnBox) {
      g.awardPenalty(awarded, offender, card);
    } else {
      var indirect = false;
      g.awardFreeKick(awarded, victim.x, victim.y, indirect, offender, card);
    }
  };

  AS.Referee = Referee;
  AS.BALL_R = BALL_R;
})(typeof window !== 'undefined' ? window : globalThis);
