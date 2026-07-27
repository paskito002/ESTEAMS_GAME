/* Pitch Legends — team & player AI */
(function (root) {
  'use strict';
  var AS = root.AS = root.AS || {};
  var U = AS.U, P = AS.P;

  var AI = {};

  /* Predict where a rolling ball will be after time t (friction k = 0.60) */
  function ballAt(ball, t) {
    var k = 0.60;
    var f = (1 - Math.exp(-k * t)) / k;
    return { x: ball.x + ball.vx * f, y: ball.y + ball.vy * f };
  }

  /* Fixed-point solve for the earliest point a player can meet the ball */
  function intercept(ball, p, speed) {
    var t = 0, pt = { x: ball.x, y: ball.y };
    for (var i = 0; i < 6; i++) {
      pt = ballAt(ball, t);
      var d = U.dist(pt.x, pt.y, p.x, p.y);
      t = d / Math.max(speed, 0.5);
      if (t > 4) { t = 4; }
    }
    return { x: pt.x, y: pt.y, t: t };
  }
  AI.intercept = intercept;

  /* How blocked is the straight line from A to B by members of `team`? */
  function laneBlocked(game, ax, ay, bx, by, team, ignore) {
    var worst = 0;
    var list = team.onFieldPlayers();
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o === ignore) continue;
      var c = U.closestOnSeg(ax, ay, bx, by, o.x, o.y);
      if (c.t <= 0.02 || c.t >= 0.99) continue;
      var d = U.dist(c.x, c.y, o.x, o.y);
      var block = U.clamp(1 - d / 3.2, 0, 1);
      if (block > worst) worst = block;
    }
    return worst;
  }
  AI.laneBlocked = laneBlocked;

  function nearestOpponent(game, p) {
    var opp = game.opponentOf(p.team).onFieldPlayers();
    var best = null, bd = 1e9;
    for (var i = 0; i < opp.length; i++) {
      var d = U.dist(p.x, p.y, opp[i].x, opp[i].y);
      if (d < bd) { bd = d; best = opp[i]; }
    }
    return { player: best, d: bd };
  }

  function pressureOn(game, p) {
    var opp = game.opponentOf(p.team).onFieldPlayers();
    var pr = 0;
    for (var i = 0; i < opp.length; i++) {
      if (opp[i].isGK) continue;
      var d = U.dist(p.x, p.y, opp[i].x, opp[i].y);
      if (d < 7) pr += (7 - d) / 7;
    }
    return U.clamp(pr, 0, 2.5);
  }

  /* =====================================================================
     TEAM LEVEL
     ===================================================================== */
  AI.updateTeam = function (game, team, dt) {
    var ball = game.ball;
    var opp = game.opponentOf(team);
    var owner = ball.owner || ball.heldBy;
    var hasBall = owner && owner.team === team;
    var oppHas = owner && owner.team === opp;

    // ---- pick a chaser & a supporting presser ----
    var field = team.onFieldPlayers();
    var c1 = null, c1s = 1e9, c2 = null, c2s = 1e9;
    for (var i = 0; i < field.length; i++) {
      var p = field[i];
      if (p.isGK || p.state === 'down') continue;
      var ip = intercept(ball, p, p.topSpeed());
      var score = ip.t;
      // players already goal-side / facing the ball are better candidates
      if (p.role === 'FW') score += 0.35;
      if (p.userControlled) score += 0.6;      // let the human choose their own runs
      if (score < c1s) { c2 = c1; c2s = c1s; c1 = p; c1s = score; }
      else if (score < c2s) { c2 = p; c2s = score; }
    }
    team.chaser = c1;
    team.support = c2;

    // ---- team mentality: chase the game late on ----
    var diff = team.score - opp.score;
    var late = game.clock > game.halfLength * 0.72;
    team.mentality = U.clamp((diff < 0 ? 0.45 : diff > 0 ? -0.3 : 0) * (late ? 1.6 : 1), -0.6, 0.9);

    var ctx = { hasBall: hasBall, oppHas: oppHas, owner: owner };

    // ---- marking assignments when defending ----
    if (oppHas) AI.assignMarking(game, team);

    for (var j = 0; j < field.length; j++) {
      var pl = field[j];
      if (pl.userControlled) continue;
      if (pl.state === 'down') { pl.desire.x = 0; pl.desire.y = 0; continue; }
      if (pl.isGK) AI.keeper(game, pl, dt, ctx);
      else AI.outfield(game, pl, dt, ctx);
    }
  };

  AI.assignMarking = function (game, team) {
    var opp = game.opponentOf(team);
    var threats = opp.onFieldPlayers().filter(function (o) { return !o.isGK; });
    var defenders = team.onFieldPlayers().filter(function (d) { return !d.isGK && d !== team.chaser; });
    // sort threats by danger (closeness to our goal)
    var ownGoal = team.ownGoalX();
    threats.sort(function (a, b) {
      return U.dist(a.x, a.y, ownGoal, P.CY) - U.dist(b.x, b.y, ownGoal, P.CY);
    });
    var taken = {};
    for (var i = 0; i < defenders.length; i++) defenders[i].mark = null;
    for (var t = 0; t < threats.length; t++) {
      var th = threats[t];
      var best = null, bd = 1e9;
      for (var d = 0; d < defenders.length; d++) {
        var def = defenders[d];
        if (taken[def.id]) continue;
        var dd = U.dist(def.x, def.y, th.x, th.y);
        if (def.role === 'FW') dd += 26;
        if (def.role === 'MF') dd += 7;
        if (dd < bd) { bd = dd; best = def; }
      }
      if (best && bd < 46) { best.mark = th; taken[best.id] = 1; }
    }
  };

  /* =====================================================================
     OFF-BALL POSITIONING
     ===================================================================== */
  AI.positionFor = function (game, p, ctx) {
    var team = p.team, ball = game.ball, dir = team.attackDir;
    var base = team.slotToPitch(p.slot);

    var adv = (ball.x - P.CX) * dir;                     // + when we are attacking
    var roleW = p.role === 'DF' ? 0.72 : p.role === 'MF' ? 1.0 : 1.12;
    var ment = 1 + team.mentality * 0.35;
    var shift = U.clamp(adv * 0.50, -19, 24) * roleW * ment;

    var x = base.x + dir * shift;
    var yPull = p.role === 'DF' ? 0.20 : p.role === 'MF' ? 0.30 : 0.22;
    var y = U.lerp(base.y, ball.y, yPull);

    if (ctx.hasBall) {
      // attacking shape: forwards run the channels, midfield supports
      if (p.role === 'FW') {
        x += dir * 6;
        var line = game.ref.offsideLineX(game.opponentOf(team));
        // stay a step onside
        var limit = line - dir * 0.6;
        if ((x - limit) * dir > 0) x = limit;
        if ((x - ball.x) * dir < 0 && (ball.x - P.CX) * dir > 0) x = ball.x + dir * 2;
      } else if (p.role === 'MF') {
        x += dir * 3;
      }
    } else if (ctx.oppHas) {
      if (p.mark) {
        var g = team.ownGoalX();
        var gv = U.norm(g - p.mark.x, P.CY - p.mark.y);
        var tight = p.role === 'DF' ? 2.0 : 2.8;
        x = p.mark.x + gv.x * tight;
        y = p.mark.y + gv.y * tight;
        // don't let the marker drift miles from shape
        x = U.lerp(base.x + dir * shift, x, 0.78);
        y = U.lerp(base.y, y, 0.82);
      } else {
        x -= dir * 5;
      }
    } else {
      // loose ball — squeeze toward it
      x = U.lerp(x, ball.x, 0.18);
      y = U.lerp(y, ball.y, 0.18);
    }

    // keep a defensive line: never let the last line be deeper than the 6-yard box
    if (p.role === 'DF') {
      var og = team.ownGoalX();
      if (dir > 0) x = Math.max(x, 4.5); else x = Math.min(x, P.L - 4.5);
      if (Math.abs(ball.x - og) > 45) {
        // push up when the ball is far away
        x = dir > 0 ? Math.max(x, ball.x - 34) : Math.min(x, ball.x + 34);
      }
    }

    x = U.clamp(x, 1.5, P.L - 1.5);
    y = U.clamp(y, 1.5, P.W - 1.5);
    return { x: x, y: y };
  };

  /* =====================================================================
     OUTFIELD PLAYER
     ===================================================================== */
  AI.outfield = function (game, p, dt, ctx) {
    var ball = game.ball;

    if (ball.owner === p) { AI.onBall(game, p, dt, ctx); return; }

    var d = p.desire;
    d.sprint = false;

    var tx, ty;
    var isChaser = (p === p.team.chaser);
    var isSupport = (p === p.team.support);
    var ballDist = U.dist(p.x, p.y, ball.x, ball.y);

    if (isChaser && !ball.heldBy) {
      var ip = intercept(ball, p, p.topSpeed());
      tx = ip.x; ty = ip.y;
      d.sprint = ballDist > 3.5;

      // tackle attempt on the carrier
      var owner = ball.owner;
      if (owner && owner.team !== p.team && p.state === 'normal' && p.tackleCd <= 0) {
        var od = U.dist(p.x, p.y, owner.x, owner.y);
        var goalSide = (owner.x - p.x) * p.team.attackDir < 0;
        var aggression = 0.35 + p.attr.tackle * 0.5 + (P.inPenaltyArea(p.x, p.y, p.team.ownGoalX()) ? -0.35 : 0);
        if (od < 2.6 && od > 0.9 && !goalSide && Math.random() < aggression * dt * 1.5) {
          var fv = U.norm(owner.x + owner.vx * 0.18 - p.x, owner.y + owner.vy * 0.18 - p.y);
          p.fx = fv.x; p.fy = fv.y;
          p.startSlide();
        }
      }
    } else if (isSupport && ctx.oppHas) {
      var o2 = ctx.owner;
      var cut = U.norm(p.team.ownGoalX() - o2.x, P.CY - o2.y);
      tx = o2.x + cut.x * 4.5; ty = o2.y + cut.y * 4.5;
      d.sprint = U.dist(p.x, p.y, tx, ty) > 8;
    } else {
      var pos = AI.positionFor(game, p, ctx);
      tx = pos.x; ty = pos.y;
      var far = U.dist(p.x, p.y, tx, ty);
      d.sprint = far > 14 || (ctx.hasBall && p.role === 'FW' && far > 7);
    }

    // spacing: don't stack on team-mates
    var mates = p.team.onFieldPlayers();
    var sx = 0, sy = 0;
    for (var i = 0; i < mates.length; i++) {
      var m = mates[i];
      if (m === p) continue;
      var dd = U.dist(p.x, p.y, m.x, m.y);
      if (dd < 4.5 && dd > 0.01) {
        sx += (p.x - m.x) / dd * (4.5 - dd) * 0.6;
        sy += (p.y - m.y) / dd * (4.5 - dd) * 0.6;
      }
    }
    tx += sx; ty += sy;

    var v = U.norm(tx - p.x, ty - p.y);
    var arrive = U.clamp(v.l / 2.2, 0, 1);
    d.x = v.x * arrive;
    d.y = v.y * arrive;
    if (v.l < 0.5) { d.x = 0; d.y = 0; }
  };

  /* =====================================================================
     ON THE BALL
     ===================================================================== */
  AI.bestPass = function (game, p, opts) {
    opts = opts || {};
    var team = p.team, opp = game.opponentOf(team), dir = team.attackDir;
    var mates = team.onFieldPlayers();
    var best = null;
    for (var i = 0; i < mates.length; i++) {
      var t = mates[i];
      if (t === p || t.state === 'down') continue;
      var d = U.dist(p.x, p.y, t.x, t.y);
      if (d < 4 || d > 45) continue;
      if (t.isGK && (t.x - p.x) * dir > 0) continue;

      // predicted receive point
      var flight = d / 16;
      var rx = t.x + t.vx * flight * 0.7;
      var ry = t.y + t.vy * flight * 0.7;

      var progress = (rx - p.x) * dir;                       // metres gained
      var blocked = laneBlocked(game, p.x, p.y, rx, ry, opp, null);
      var marker = 1e9, oppl = opp.onFieldPlayers();
      for (var j = 0; j < oppl.length; j++) {
        var md = U.dist(rx, ry, oppl[j].x, oppl[j].y);
        if (md < marker) marker = md;
      }
      var openness = U.clamp(marker / 9, 0, 1);

      // offside check — never play a team-mate offside on purpose
      var line = game.ref.offsideLineX(opp);
      var beyond = (t.x - line) * dir > 0.4;
      var inOppHalf = (t.x - P.CX) * dir > 0;
      var aheadOfBall = (t.x - p.x) * dir > 0;
      var wouldBeOffside = beyond && inOppHalf && aheadOfBall && !game.ref.restartExempt;

      var score =
        U.clamp(progress / 26, -0.7, 1) * 0.55 +
        openness * 0.42 +
        (1 - blocked) * 0.45 +
        (1 - U.clamp(Math.abs(d - 17) / 26, 0, 1)) * 0.16 +
        t.attr.control * 0.10;

      // reward finding someone in a shooting position
      var dGoal = U.dist(rx, ry, team.targetGoalX(), P.CY);
      if (dGoal < 24) score += 0.22;
      if (wouldBeOffside) score -= 1.4;
      if (t.isGK) score -= 0.55;
      if (blocked > 0.72) score -= 0.5;

      if (!best || score > best.score) {
        best = { player: t, score: score, x: rx, y: ry, d: d, blocked: blocked, lofted: blocked > 0.4 };
      }
    }
    return best;
  };

  AI.onBall = function (game, p, dt, ctx) {
    var ball = game.ball, team = p.team, opp = game.opponentOf(team);
    var dir = team.attackDir, goalX = team.targetGoalX();
    var d = p.desire;

    var pr = pressureOn(game, p);
    var dGoal = U.dist(p.x, p.y, goalX, P.CY);
    var ang = P.goalAngle(p.x, p.y, goalX);

    p.aiTimer = (p.aiTimer || 0) - dt;

    if (p.kickCd <= 0 && p.aiTimer <= 0) {
      // ---------- shoot? ----------
      var shootChance =
        (1 - U.clamp(dGoal / 30, 0, 1)) * 0.85 +
        U.clamp(ang / 0.55, 0, 1) * 0.45 +
        p.attr.shoot * 0.30 -
        pr * 0.16 -
        laneBlocked(game, p.x, p.y, goalX, P.CY, opp, null) * 0.40;
      if (dGoal < 36 && shootChance > 0.46) {
        AI.shoot(game, p);
        p.aiTimer = 0.5;
        return;
      }

      // ---------- pass? ----------
      var best = AI.bestPass(game, p);
      var mustRelease = pr > 0.85 || p.stamina < 12;
      if (best && (mustRelease || best.score > 0.80 || (best.score > 0.55 && Math.random() < 0.05))) {
        AI.pass(game, p, best);
        p.aiTimer = 0.35;
        return;
      }

      // ---------- hoof it clear when in trouble in our own third ----------
      if (pr > 1.3 && (p.x - team.ownGoalX()) * dir < 26 && Math.random() < 0.08) {
        var cy = p.y < P.CY ? -1 : 1;
        game.kick(p, dir * 0.86, cy * 0.5, 24 + Math.random() * 5, 7.5, 0, 'clearance');
        p.aiTimer = 0.4;
        return;
      }
    }

    // ---------- dribble ----------
    var tgx = goalX, tgy = P.CY;
    if (dGoal > 30) {
      // run into space rather than straight at the keeper
      tgy = U.lerp(p.y, P.CY, 0.35);
      tgx = p.x + dir * 20;
    }
    var v = U.norm(tgx - p.x, tgy - p.y);

    // steer around the nearest opponent
    var no = nearestOpponent(game, p);
    if (no.player && no.d < 6.5) {
      var away = U.norm(p.x - no.player.x, p.y - no.player.y);
      var w = (6.5 - no.d) / 6.5;
      v = U.norm(v.x + away.x * w * 1.5, v.y + away.y * w * 1.5);
    }
    // stay on the pitch
    if (p.y < 4) v = U.norm(v.x, v.y + 0.7);
    if (p.y > P.W - 4) v = U.norm(v.x, v.y - 0.7);

    d.x = v.x; d.y = v.y;
    d.sprint = pr < 0.9;
  };

  AI.shoot = function (game, p) {
    var team = p.team, goalX = team.targetGoalX();
    // aim for a corner
    var side = Math.random() < 0.5 ? -1 : 1;
    var aimY = P.CY + side * U.rand(1.4, P.GOAL_W / 2 + 0.7);
    var dGoal = U.dist(p.x, p.y, goalX, P.CY);
    var err = (1 - p.attr.shoot) * 0.10 + pressureOn(game, p) * 0.035 + U.clamp(dGoal / 80, 0, 0.06);
    var a = Math.atan2(aimY - p.y, goalX - p.x) + U.gauss() * err;
    var power = 21 + p.attr.shoot * 9 + U.rand(-1.5, 2.5);
    var lift = dGoal > 22 ? U.rand(1.2, 4.2) : U.rand(0.1, 2.0);
    var spin = U.gauss() * 0.35 * p.attr.shoot;
    game.kick(p, Math.cos(a), Math.sin(a), power, lift, spin, 'shot');
  };

  AI.pass = function (game, p, best) {
    var dx = best.x - p.x, dy = best.y - p.y;
    var d = Math.hypot(dx, dy) || 1;
    var err = (1 - p.attr.pass) * 0.075;
    var a = Math.atan2(dy, dx) + U.gauss() * err;
    var power = U.clamp(d * 0.78 + 4, 8, 27);
    var lift = best.lofted ? U.clamp(d * 0.16, 2.5, 7.5) : 0;
    if (best.lofted) power *= 1.14;
    game.kick(p, Math.cos(a), Math.sin(a), power, lift, 0, best.lofted ? 'through' : 'pass');
    game.lastPasser = p;
  };

  /* =====================================================================
     GOALKEEPER
     ===================================================================== */
  AI.keeper = function (game, k, dt, ctx) {
    var ball = game.ball, team = k.team;
    var goalX = team.ownGoalX();
    var dir = goalX === 0 ? 1 : -1;                  // into the pitch
    var d = k.desire;
    d.sprint = false;

    // ---- holding the ball: distribute ----
    if (ball.heldBy === k) {
      d.x = 0; d.y = 0;
      k.holdT = (k.holdT || 0) + dt;
      if (k.holdT > 1.4) {
        var best = AI.bestPass(game, k);
        if (best && best.score > 0.8 && best.d < 34) {
          AI.pass(game, k, best);
        } else {
          var ty = P.CY + U.rand(-22, 22);
          var a = Math.atan2(ty - k.y, (goalX === 0 ? P.L - 24 : 24) - k.x);
          game.kick(k, Math.cos(a), Math.sin(a), 27 + Math.random() * 4, 9, 0, 'clearance');
        }
        k.holdT = 0;
      }
      return;
    }
    k.holdT = 0;

    var inArea = P.inPenaltyArea(ball.x, ball.y, goalX);
    var bd = U.dist(k.x, k.y, ball.x, ball.y);
    var speed = ball.speed();

    // ---- shot-stopping ----
    var towardGoal = (ball.x - goalX) * dir > 0 && ((goalX === 0 && ball.vx < -2) || (goalX === P.L && ball.vx > 2));
    if (towardGoal && speed > 6) {
      var tToLine = Math.abs(ball.x - goalX) / Math.max(Math.abs(ball.vx), 0.1);
      var yAtLine = ball.y + ball.vy * tToLine;
      var zAtLine = ball.z + ball.vz * tToLine - 0.5 * 9.81 * tToLine * tToLine;
      var onTarget = Math.abs(yAtLine - P.CY) < P.GOAL_W / 2 + 2.6 && zAtLine < P.GOAL_H + 1.2 && zAtLine > -0.6;
      if (onTarget && tToLine < 1.5) {
        var ix = U.lerp(k.x, goalX + dir * 0.7, 0.55);
        var iy = U.clamp(yAtLine, P.GOAL_TOP - 2.2, P.GOAL_BOT + 2.2);
        var need = U.dist(k.x, k.y, ix, iy);
        var canWalk = k.topSpeed() * tToLine;
        if (k.state === 'normal' && need > canWalk * 0.75 && need < 6.5 && tToLine < 0.85) {
          // dive
          var dv = U.norm(ix - k.x, iy - k.y);
          k.state = 'keeperDive';
          k.stateT = 0.75;
          var dp = 7.5 + k.attr.reflex * 5.5;
          k.vx = dv.x * dp; k.vy = dv.y * dp;
          k.diveDir = U.sgn(iy - k.y) || 1;
          if (game.fx) game.fx.dust(k.x, k.y, 0.8);
        } else if (k.state === 'normal') {
          var mv = U.norm(ix - k.x, iy - k.y);
          d.x = mv.x; d.y = mv.y; d.sprint = true;
          return;
        }
      }
    }

    // ---- claim / gather ----
    var reach = k.state === 'keeperDive' ? 2.5 : 1.15;
    if (inArea && bd < reach && ball.z < 2.5 && !ball.heldBy) {
      var backPass = game.ref.isBackPassTo(k);
      if (!backPass) {
        if (speed < 17 + k.attr.reflex * 9 || k.state === 'keeperDive') {
          if (speed > 15 && Math.random() > 0.45 + k.attr.reflex * 0.45) {
            game.parry(k);
          } else {
            game.gather(k);
          }
          return;
        }
      } else if (bd < 0.9) {
        // must play it with the feet
        var bestB = AI.bestPass(game, k);
        if (bestB) AI.pass(game, k, bestB);
        else game.kick(k, dir * 0.9, U.rand(-0.4, 0.4), 26, 9, 0, 'clearance');
        return;
      }
    }

    if (k.state !== 'normal') { d.x = 0; d.y = 0; return; }

    // ---- rush out for a loose ball in the box ----
    var threat = null, td = 1e9;
    var oppl = game.opponentOf(team).onFieldPlayers();
    for (var i = 0; i < oppl.length; i++) {
      var dd = U.dist(oppl[i].x, oppl[i].y, ball.x, ball.y);
      if (dd < td) { td = dd; threat = oppl[i]; }
    }
    if (inArea && !ball.owner && bd < 13 && (bd < td - 0.8) && ball.z < 2.4) {
      var rv = U.norm(ball.x - k.x, ball.y - k.y);
      d.x = rv.x; d.y = rv.y; d.sprint = true;
      return;
    }

    // ---- default: sweeper-keeper positioning on the goal-ball line ----
    var gc = { x: goalX, y: P.CY };
    var toBall = U.norm(ball.x - gc.x, ball.y - gc.y);
    var ballDistGoal = U.dist(ball.x, ball.y, gc.x, gc.y);
    var out = U.clamp(2.0 + (1 - U.clamp(ballDistGoal / 55, 0, 1)) * 7.5, 1.2, 12);
    if (ballDistGoal > 60) out = U.clamp(out + 4, 1.2, 15);
    var tx = gc.x + toBall.x * out;
    var ty = U.clamp(gc.y + toBall.y * out * 0.72, P.GOAL_TOP - 3.6, P.GOAL_BOT + 3.6);
    // never stray far outside the area
    tx = goalX === 0 ? U.clamp(tx, 0.4, P.PEN_DEPTH + 2) : U.clamp(tx, P.L - P.PEN_DEPTH - 2, P.L - 0.4);

    var mv2 = U.norm(tx - k.x, ty - k.y);
    var arrive = U.clamp(mv2.l / 1.4, 0, 1);
    d.x = mv2.x * arrive; d.y = mv2.y * arrive;
    d.sprint = mv2.l > 7;
  };

  AS.AI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
