/* Pitch Legends — utility helpers */
(function (root) {
  'use strict';
  var AS = root.AS = root.AS || {};

  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function invLerp(a, b, v) { return b === a ? 0 : (v - a) / (b - a); }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function rand(a, b) { if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function chance(p) { return Math.random() < p; }
  function sgn(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function gauss() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }

  function approach(cur, tgt, step) {
    if (cur < tgt) return Math.min(cur + step, tgt);
    return Math.max(cur - step, tgt);
  }

  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  function norm(x, y) {
    var l = Math.sqrt(x * x + y * y);
    if (l > 1e-6) return { x: x / l, y: y / l, l: l };
    return { x: 0, y: 0, l: 0 };
  }

  // exponential smoothing factor that is frame-rate independent
  function damp(rate, dt) { return 1 - Math.exp(-rate * dt); }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // closest point on segment AB to point P
  function closestOnSeg(ax, ay, bx, by, px, py) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) return { x: ax, y: ay, t: 0 };
    var t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
    return { x: ax + dx * t, y: ay + dy * t, t: t };
  }

  AS.U = {
    TAU: TAU, clamp: clamp, lerp: lerp, invLerp: invLerp, dist: dist, dist2: dist2,
    rand: rand, randInt: randInt, pick: pick, chance: chance, sgn: sgn, shuffle: shuffle,
    gauss: gauss, approach: approach, smoothstep: smoothstep, norm: norm, damp: damp,
    fmtTime: fmtTime, closestOnSeg: closestOnSeg
  };
})(typeof window !== 'undefined' ? window : globalThis);
