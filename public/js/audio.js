/* Pitch Legends — procedural audio. Everything is synthesised, so there are
   zero audio files to download and the game sounds identical offline. */
(function (root) {
  'use strict';
  var AS = root.AS = root.AS || {};
  var U = AS.U;

  function Sound() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volume = 0.7;
    this.noiseBuf = null;
    this.crowdLevel = 0.25;
    this._crowdTarget = 0.25;
  }

  Sound.prototype.init = function () {
    if (this.ready) return;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }

    var ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);

    // ---- noise buffer (2 s of white noise, reused everywhere) ----
    var len = ctx.sampleRate * 2;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this._buildCrowd();
    this.ready = true;
  };

  Sound.prototype.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  Sound.prototype.setMuted = function (m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  };

  /* ---------- ambient crowd: filtered noise with slow swells ---------- */
  Sound.prototype._buildCrowd = function () {
    var ctx = this.ctx;
    var src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 780; lp.Q.value = 0.4;

    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 140;

    var g = ctx.createGain();
    g.gain.value = 0.0;

    // slow amplitude wobble so it feels like a living crowd
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.035;
    lfo.connect(lfoGain).connect(g.gain);

    src.connect(hp).connect(lp).connect(g).connect(this.master);
    src.start(0);
    lfo.start(0);

    this.crowdGain = g;
    this.crowdFilter = lp;
  };

  /* level 0..1 — call every frame with match tension */
  Sound.prototype.crowd = function (level) {
    this._crowdTarget = U.clamp(level, 0, 1);
  };

  Sound.prototype.update = function (dt) {
    if (!this.ready) return;
    this.crowdLevel += (this._crowdTarget - this.crowdLevel) * U.damp(1.2, dt);
    if (this.crowdGain) {
      this.crowdGain.gain.value = 0.02 + this.crowdLevel * 0.16;
      this.crowdFilter.frequency.value = 620 + this.crowdLevel * 900;
    }
  };

  Sound.prototype._noise = function (dur, type, freq, q, gain, when) {
    var ctx = this.ctx, t = (when || ctx.currentTime);
    var src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1;
    var f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
    return { filter: f, gain: g, t: t };
  };

  Sound.prototype._tone = function (freq, dur, type, gain, when, glideTo) {
    var ctx = this.ctx, t = (when || ctx.currentTime);
    var o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  };

  /* ---------- individual effects ---------- */

  Sound.prototype.kick = function (power) {
    if (!this.ready || this.muted) return;
    power = U.clamp(power, 0, 1);
    var t = this.ctx.currentTime;
    this._noise(0.09 + power * 0.05, 'bandpass', 900 + power * 900, 1.1, 0.35 + power * 0.35, t);
    this._tone(150 - power * 40, 0.11, 'sine', 0.32 + power * 0.3, t, 60);
  };

  Sound.prototype.tap = function () {
    if (!this.ready || this.muted) return;
    this._noise(0.05, 'bandpass', 1500, 1.4, 0.16);
  };

  Sound.prototype.post = function () {
    if (!this.ready || this.muted) return;
    var t = this.ctx.currentTime;
    this._tone(1180, 0.5, 'triangle', 0.3, t, 700);
    this._tone(1790, 0.34, 'triangle', 0.14, t + 0.004, 1100);
  };

  Sound.prototype.net = function () {
    if (!this.ready || this.muted) return;
    this._noise(0.24, 'highpass', 2600, 0.7, 0.24);
  };

  Sound.prototype.whistle = function (kind) {
    if (!this.ready || this.muted) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var blasts = kind === 'long' ? [[0, 0.85]] :
                 kind === 'double' ? [[0, 0.2], [0.28, 0.2]] :
                 kind === 'triple' ? [[0, 0.22], [0.3, 0.22], [0.6, 0.75]] :
                 [[0, 0.28]];
    for (var i = 0; i < blasts.length; i++) {
      var st = t + blasts[i][0], dur = blasts[i][1];
      var o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 2180;
      var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 2760;
      // trill
      var lfo = ctx.createOscillator(); lfo.frequency.value = 38;
      var lg = ctx.createGain(); lg.gain.value = 90;
      lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);

      var n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
      var nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2400; nf.Q.value = 6;
      var ng = ctx.createGain(); ng.gain.value = 0.10;

      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.30, st + 0.02);
      g.gain.setValueAtTime(0.30, st + dur - 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, st + dur);

      o1.connect(g); o2.connect(g); n.connect(nf).connect(ng).connect(g);
      g.connect(this.sfxBus);
      o1.start(st); o2.start(st); lfo.start(st); n.start(st);
      o1.stop(st + dur + 0.05); o2.stop(st + dur + 0.05);
      lfo.stop(st + dur + 0.05); n.stop(st + dur + 0.05);
    }
  };

  /* big roar */
  Sound.prototype.cheer = function (intensity) {
    if (!this.ready || this.muted) return;
    intensity = U.clamp(intensity === undefined ? 1 : intensity, 0, 1);
    var ctx = this.ctx, t = ctx.currentTime;
    var dur = 2.2 + intensity * 2.2;
    var src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.linearRampToValueAtTime(1500, t + 0.5);
    f.frequency.linearRampToValueAtTime(600, t + dur);
    f.Q.value = 0.7;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.28 * (0.5 + intensity * 0.5), t + 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.1);
  };

  /* disappointed "ooooh" */
  Sound.prototype.groan = function () {
    if (!this.ready || this.muted) return;
    var ctx = this.ctx, t = ctx.currentTime;
    var src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(240, t + 1.3);
    f.Q.value = 1.1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.17, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + 1.5);
  };

  Sound.prototype.ui = function (up) {
    if (!this.ready || this.muted) return;
    this._tone(up ? 520 : 380, 0.09, 'square', 0.10);
  };

  Sound.prototype.card = function (red) {
    if (!this.ready || this.muted) return;
    var t = this.ctx.currentTime;
    this._tone(red ? 300 : 440, 0.16, 'sawtooth', 0.12, t);
    this._tone(red ? 220 : 330, 0.22, 'sawtooth', 0.10, t + 0.12);
  };

  AS.Sound = new Sound();
})(typeof window !== 'undefined' ? window : globalThis);
