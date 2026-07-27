/* Pitch Legends — canvas renderer */
(function (root) {
  'use strict';
  var AS = root.AS = root.AS || {};
  var U = AS.U, P = AS.P;

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: P.CX, y: P.CY, zoom: 1 };
    this.ppm = 9;               // pixels per metre baseline, rescaled in resize()
    this.followUser = true;
    this.grassPhase = 0;
  }

  Renderer.prototype.resize = function () {
    var c = this.canvas;
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var w = c.clientWidth, h = c.clientHeight;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    this.dpr = dpr; this.w = w; this.h = h;
  };

  Renderer.prototype.worldToScreen = function (x, y) {
    return {
      x: (x - this.cam.x) * this.ppm * this.dpr + this.canvas.width / 2,
      y: (y - this.cam.y) * this.ppm * this.dpr + this.canvas.height / 2
    };
  };

  Renderer.prototype.updateCamera = function (game, dt) {
    var target = game.ball;
    var focusX = target.x, focusY = target.y;
    if (game.userPlayer && this.followUser) {
      focusX = U.lerp(target.x, game.userPlayer.x, 0.28);
      focusY = U.lerp(target.y, game.userPlayer.y, 0.28);
    }
    var margin = 15;
    focusX = U.clamp(focusX, margin, P.L - margin);
    var visW = Math.min(this.w, this.h * 1.9);
    var basePpm = Math.max(this.w / (P.L + 12), this.h / (P.W + 10));
    this.ppm = U.lerp(this.ppm, Math.max(basePpm, this.w / 62), U.damp(3, dt));
    this.cam.x += (focusX - this.cam.x) * U.damp(3.2, dt);
    this.cam.y += (P.CY - this.cam.y) * U.damp(2, dt) * 0.5 + (focusY - this.cam.y) * U.damp(2, dt) * 0.5;
    // keep whole width of pitch visible when possible; clamp vertical drift
    this.cam.y = U.clamp(this.cam.y, P.CY - 8, P.CY + 8);
  };

  /* ---------------- field ---------------- */
  Renderer.prototype.drawPitch = function (game) {
    var ctx = this.ctx, dpr = this.dpr;
    var tl = this.worldToScreen(-P.MARGIN, -P.MARGIN);
    var br = this.worldToScreen(P.L + P.MARGIN, P.W + P.MARGIN);

    ctx.fillStyle = '#0d5c22';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // mowed stripes across full pitch incl run-off
    var stripes = 18;
    var stripeW = (br.x - tl.x) / stripes;
    for (var i = 0; i < stripes; i++) {
      ctx.fillStyle = (i % 2 === 0) ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)';
      ctx.fillRect(tl.x + i * stripeW, tl.y, stripeW + 1, br.y - tl.y);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = Math.max(1.5, 0.12 * this.ppm * dpr);
    var lw = ctx.lineWidth;

    function seg(x1, y1, x2, y2, self) {
      var a = self.worldToScreen(x1, y1), b = self.worldToScreen(x2, y2);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    function circ(x, y, r, self) {
      var a = self.worldToScreen(x, y);
      ctx.beginPath(); ctx.arc(a.x, a.y, r * self.ppm * self.dpr, 0, U.TAU); ctx.stroke();
    }
    function rect(x, y, w, h, self) {
      var a = self.worldToScreen(x, y);
      ctx.strokeRect(a.x, a.y, w * self.ppm * self.dpr, h * self.ppm * self.dpr);
    }

    // outer boundary
    var o1 = this.worldToScreen(0, 0);
    ctx.strokeRect(o1.x, o1.y, P.L * this.ppm * dpr, P.W * this.ppm * dpr);
    // halfway line
    seg(P.CX, 0, P.CX, P.W, this);
    circ(P.CX, P.CY, P.CENTRE_R, this);
    var cc = this.worldToScreen(P.CX, P.CY);
    ctx.beginPath(); ctx.arc(cc.x, cc.y, Math.max(2, 0.14 * this.ppm * dpr), 0, U.TAU); ctx.fillStyle = '#fff'; ctx.fill();

    // penalty + goal areas, both ends
    [0, P.L].forEach(function (gx) {
      var x0 = gx === 0 ? 0 : P.L - P.PEN_DEPTH;
      rect(x0, P.PEN_TOP, P.PEN_DEPTH, P.PEN_W, this);
      var x1 = gx === 0 ? 0 : P.L - P.BOX_DEPTH;
      rect(x1, P.BOX_TOP, P.BOX_DEPTH, P.BOX_W, this);
      var spotX = gx === 0 ? P.PEN_SPOT : P.L - P.PEN_SPOT;
      var sp = this.worldToScreen(spotX, P.CY);
      ctx.beginPath(); ctx.arc(sp.x, sp.y, Math.max(2, 0.14 * this.ppm * dpr), 0, U.TAU); ctx.fillStyle = '#fff'; ctx.fill();
      // D arc
      ctx.beginPath();
      var startA = gx === 0 ? -0.9 : Math.PI - 0.9;
      var endA = gx === 0 ? 0.9 : Math.PI + 0.9;
      var sc = this.worldToScreen(spotX, P.CY);
      ctx.arc(sc.x, sc.y, P.CENTRE_R * this.ppm * dpr, startA, endA);
      ctx.stroke();
      // corner arcs
      var cyTop = 0, cyBot = P.W;
      [cyTop, cyBot].forEach(function (cy) {
        var cx = gx === 0 ? 0 : P.L;
        var p0 = this.worldToScreen(cx, cy);
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, P.CORNER_R * this.ppm * dpr, 0, U.TAU);
        ctx.stroke();
      }, this);
    }, this);

    this.drawGoals(game);
  };

  Renderer.prototype.drawGoals = function (game) {
    var ctx = this.ctx, dpr = this.dpr, ppm = this.ppm;
    [0, P.L].forEach(function (gx) {
      var depth = gx === 0 ? -P.GOAL_DEPTH : P.GOAL_DEPTH;
      var top = this.worldToScreen(gx, P.GOAL_TOP);
      var bot = this.worldToScreen(gx, P.GOAL_BOT);
      var backTop = this.worldToScreen(gx + depth, P.GOAL_TOP - 0.25);
      var backBot = this.worldToScreen(gx + depth, P.GOAL_BOT + 0.25);

      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.moveTo(top.x, top.y); ctx.lineTo(backTop.x, backTop.y);
      ctx.lineTo(backBot.x, backBot.y); ctx.lineTo(bot.x, bot.y);
      ctx.closePath(); ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
      var rows = 6;
      for (var r = 1; r < rows; r++) {
        var ty = P.GOAL_TOP + (P.GOAL_BOT - P.GOAL_TOP) * (r / rows);
        var a = this.worldToScreen(gx, ty), b = this.worldToScreen(gx + depth, ty);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (var c = 1; c < 4; c++) {
        var tx = gx + depth * (c / 4);
        var a2 = this.worldToScreen(tx, P.GOAL_TOP), b2 = this.worldToScreen(tx, P.GOAL_BOT);
        ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
      }

      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(3, 0.09 * ppm * dpr);
      ctx.beginPath();
      ctx.moveTo(top.x, top.y); ctx.lineTo(backTop.x, backTop.y);
      ctx.lineTo(backBot.x, backBot.y); ctx.lineTo(bot.x, bot.y);
      ctx.stroke();
    }, this);
  };

  Renderer.prototype.drawOffsideLine = function (game) {
    if (game.phase !== 'play') return;
    var att = null;
    var ball = game.ball;
    var owner = ball.owner || ball.heldBy || game.lastKicker;
    if (!owner) return;
    var attTeam = owner.team, defTeam = game.opponentOf(attTeam);
    var anyFwd = attTeam.onFieldPlayers().some(function (p) { return !p.isGK && p.offside; });
    if (!anyFwd) return;
    var lineX = game.ref.offsideLineX(defTeam);
    var a = this.worldToScreen(lineX, 0), b = this.worldToScreen(lineX, P.W);
    var ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,220,40,0.85)';
    ctx.setLineDash([10 * this.dpr, 8 * this.dpr]);
    ctx.lineWidth = 2 * this.dpr;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  };

  /* ---------------- ball ---------------- */
  Renderer.prototype.drawBall = function (game) {
    var b = game.ball, ctx = this.ctx;
    // trail
    ctx.save();
    for (var i = 0; i < b.trail.length - 3; i += 3) {
      var tx = b.trail[i], ty = b.trail[i + 1], tz = b.trail[i + 2];
      var pos = this.worldToScreen(tx, ty - tz * 0.5);
      var alpha = (i / b.trail.length) * 0.25;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 0.09 * this.ppm * this.dpr, 0, U.TAU); ctx.fill();
    }
    ctx.restore();

    var shadow = this.worldToScreen(b.x, b.y);
    var shR = Math.max(1, (0.12 - Math.min(b.z, 3) * 0.012) * this.ppm * this.dpr);
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, shR * 1.3, shR * 0.7, 0, 0, U.TAU);
    ctx.fillStyle = 'rgba(0,0,0,' + U.clamp(0.4 - b.z * 0.04, 0.08, 0.4) + ')';
    ctx.fill();

    var pos2 = this.worldToScreen(b.x, b.y - b.z * 0.62);
    var r = Math.max(2.4, 0.115 * this.ppm * this.dpr);
    ctx.save();
    ctx.translate(pos2.x, pos2.y);
    ctx.rotate(b.rot);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, U.TAU);
    ctx.fillStyle = '#f4f4f0'; ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.08); ctx.strokeStyle = '#2a2a2a'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, U.TAU); ctx.fillStyle = '#222'; ctx.fill();
    for (var k = 0; k < 5; k++) {
      var ang = k / 5 * U.TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * r * 0.42, Math.sin(ang) * r * 0.42);
      ctx.lineTo(Math.cos(ang) * r * 0.9, Math.sin(ang) * r * 0.9);
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = Math.max(0.6, r * 0.05);
      ctx.stroke();
    }
    ctx.restore();
  };

  /* ---------------- players ---------------- */
  Renderer.prototype.drawPlayer = function (p, game) {
    var ctx = this.ctx, ppm = this.ppm, dpr = this.dpr;
    var pos = this.worldToScreen(p.x, p.y);
    var r = p.radius * ppm * dpr;

    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + r * 0.15, r * 1.15, r * 0.5, 0, 0, U.TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fill();

    if (p.state === 'down') {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(Math.atan2(p.fy, p.fx));
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.4, r * 0.7, 0, 0, U.TAU);
      ctx.fillStyle = p.team.colors.shirt; ctx.fill();
      ctx.restore();
      return;
    }

    var bodyY = pos.y;
    if (p.state === 'slide') {
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(Math.atan2(p.fy, p.fx));
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.55, r * 0.62, 0, 0, U.TAU);
      ctx.fillStyle = p.team.colors.shorts; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }

    // running legs (simple scissor)
    var swing = Math.sin(p.anim) * r * 0.5;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = Math.max(1.4, r * 0.22);
    ctx.beginPath();
    ctx.moveTo(pos.x - r * 0.25, bodyY + r * 0.5);
    ctx.lineTo(pos.x - r * 0.25 + swing * 0.4, bodyY + r * 1.15);
    ctx.moveTo(pos.x + r * 0.25, bodyY + r * 0.5);
    ctx.lineTo(pos.x + r * 0.25 - swing * 0.4, bodyY + r * 1.15);
    ctx.stroke();

    // body
    ctx.beginPath();
    ctx.arc(pos.x, bodyY, r, 0, U.TAU);
    ctx.fillStyle = p.isGK ? p.team.colors.gk : p.team.colors.shirt;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.strokeStyle = p.team.colors.trim;
    ctx.stroke();

    if (p.offside) {
      ctx.beginPath(); ctx.arc(pos.x, bodyY, r + 3 * dpr, 0, U.TAU);
      ctx.strokeStyle = 'rgba(255,210,0,0.95)'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    }
    if (p.userControlled) {
      var t = (game.time * 3) % 1;
      ctx.beginPath(); ctx.arc(pos.x, bodyY, r + 4 * dpr + Math.sin(game.time * 6) * 1.5 * dpr, 0, U.TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2 * dpr; ctx.stroke();
      // little arrow above
      ctx.beginPath();
      ctx.moveTo(pos.x, bodyY - r - 9 * dpr);
      ctx.lineTo(pos.x - 4 * dpr, bodyY - r - 4 * dpr);
      ctx.lineTo(pos.x + 4 * dpr, bodyY - r - 4 * dpr);
      ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
    }
    if (p.team.chaser === p && !p.userControlled) {
      ctx.beginPath(); ctx.arc(pos.x, bodyY, r + 3 * dpr, 0, U.TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.4 * dpr; ctx.stroke();
    }

    // number
    ctx.fillStyle = p.team.colors.trim;
    ctx.font = Math.max(8, r * 0.85) + 'px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.number, pos.x, bodyY + 0.5);

    if (p.yellow > 0) {
      ctx.fillStyle = p.yellow >= 2 ? '#ff2b2b' : '#ffd23f';
      ctx.fillRect(pos.x + r * 0.75, bodyY - r * 1.3, r * 0.42, r * 0.62);
    }

    if (p.stamina < 28) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = p.stamina < 12 ? '#ff4d4d' : '#ffd23f';
      ctx.fillRect(pos.x - r, bodyY - r * 1.9, r * 2 * (p.stamina / 100), r * 0.28);
      ctx.globalAlpha = 1;
    }
  };

  /* ---------------- particles ---------------- */
  Renderer.prototype.drawParticles = function (game) {
    var ctx = this.ctx, fx = game.fx;
    for (var i = 0; i < fx.parts.length; i++) {
      var p = fx.parts[i];
      var pos = this.worldToScreen(p.x, p.y - p.z * 0.6);
      var alpha = U.clamp(p.life, 0, 1);
      ctx.globalAlpha = alpha;
      if (p.kind === 'ripple') {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, p.r * this.ppm * this.dpr, 0, U.TAU);
        ctx.strokeStyle = p.col; ctx.lineWidth = 1.5 * this.dpr; ctx.stroke();
        continue;
      }
      if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.size * this.ppm * this.dpr * 0.5, -p.size * this.ppm * this.dpr * 0.5, p.size * this.ppm * this.dpr, p.size * this.ppm * this.dpr * 0.5);
        ctx.restore();
        continue;
      }
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, Math.max(0.6, p.size * this.ppm * this.dpr), 0, U.TAU);
      ctx.fillStyle = p.col; ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  /* ---------------- full frame ---------------- */
  Renderer.prototype.render = function (game, dt) {
    this.updateCamera(game, dt);
    var ctx = this.ctx;
    ctx.save();

    if (game.fx.shake > 0.01) {
      var m = game.fx.shake * 6 * this.dpr;
      ctx.translate(U.rand(-m, m), U.rand(-m, m));
    }

    this.drawPitch(game);
    this.drawOffsideLine(game);

    var all = game.teams[0].onFieldPlayers().concat(game.teams[1].onFieldPlayers());
    all.sort(function (a, b) { return a.y - b.y; });
    for (var i = 0; i < all.length; i++) this.drawPlayer(all[i], game);

    this.drawBall(game);
    this.drawParticles(game);

    ctx.restore();

    if (game.fx.flash > 0.01) {
      ctx.fillStyle = 'rgba(255,255,255,' + (game.fx.flash * 0.35) + ')';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  };

  AS.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
