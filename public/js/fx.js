/* Pitch Legends — particle effects (world coordinates, metres) */
(function (root) {
  'use strict';
  var AS = root.AS = root.AS || {};
  var U = AS.U, P = AS.P;

  function FX() {
    this.parts = [];
    this.shake = 0;
    this.flash = 0;
  }

  FX.prototype.spawn = function (o) {
    if (this.parts.length > 700) this.parts.shift();
    this.parts.push(o);
  };

  FX.prototype.dust = function (x, y, amount) {
    var n = Math.round(3 + amount * 7);
    for (var i = 0; i < n; i++) {
      var a = U.rand(0, U.TAU), s = U.rand(0.6, 3.4) * (0.5 + amount);
      this.spawn({
        kind: 'dust', x: x, y: y, z: U.rand(0, 0.2),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rand(0.4, 2.4),
        life: 1, decay: U.rand(1.6, 2.8), size: U.rand(0.06, 0.18),
        col: Math.random() < 0.7 ? '#8fce6a' : '#cdb98a'
      });
    }
  };

  FX.prototype.spark = function (x, y, col) {
    for (var i = 0; i < 14; i++) {
      var a = U.rand(0, U.TAU), s = U.rand(2, 9);
      this.spawn({
        kind: 'spark', x: x, y: y, z: U.rand(0.2, 1.4),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rand(1, 5),
        life: 1, decay: U.rand(1.4, 2.4), size: U.rand(0.08, 0.2),
        col: col || '#ffe27a'
      });
    }
  };

  FX.prototype.confetti = function (cx, cy, colA, colB) {
    for (var i = 0; i < 190; i++) {
      var a = U.rand(0, U.TAU), s = U.rand(1, 16);
      this.spawn({
        kind: 'confetti', x: cx + Math.cos(a) * U.rand(0, 8), y: cy + Math.sin(a) * U.rand(0, 6),
        z: U.rand(2, 16),
        vx: Math.cos(a) * s * 0.35, vy: Math.sin(a) * s * 0.35, vz: U.rand(2, 9),
        life: 1, decay: U.rand(0.22, 0.5), size: U.rand(0.14, 0.34),
        spin: U.rand(-8, 8), rot: U.rand(0, 6),
        col: Math.random() < 0.5 ? colA : (Math.random() < 0.6 ? colB : '#ffffff')
      });
    }
  };

  FX.prototype.ripple = function (x, y, col) {
    this.spawn({ kind: 'ripple', x: x, y: y, z: 0, r: 0.4, life: 1, decay: 1.6, col: col || '#ffffff' });
  };

  FX.prototype.addShake = function (v) { this.shake = Math.min(1.6, this.shake + v); };
  FX.prototype.addFlash = function (v) { this.flash = Math.min(1, this.flash + v); };

  FX.prototype.update = function (dt) {
    this.shake *= Math.exp(-4.5 * dt);
    this.flash *= Math.exp(-5.5 * dt);
    for (var i = this.parts.length - 1; i >= 0; i--) {
      var p = this.parts[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      if (p.kind === 'ripple') { p.r += 9 * dt; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vz -= 9.81 * dt * (p.kind === 'confetti' ? 0.32 : 1);
      p.z += p.vz * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
      p.vx *= Math.exp(-1.6 * dt); p.vy *= Math.exp(-1.6 * dt);
      if (p.spin !== undefined) p.rot += p.spin * dt;
    }
  };

  FX.prototype.clear = function () { this.parts.length = 0; };

  AS.FX = FX;
})(typeof window !== 'undefined' ? window : globalThis);
