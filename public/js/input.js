/* Pitch Legends — input: keyboard, on-screen joystick, gamepad */
(function (root) {
  'use strict';
  var AS = root.AS = root.AS || {};
  var U = AS.U;

  function Input(opts) {
    opts = opts || {};
    this.keys = {};
    this.joy = { active: false, x: 0, y: 0 };
    this.actions = { shootPressed: false, passPressed: false, sprint: false, switchPressed: false };
    this.shootHeldT = 0;
    this._bindKeyboard();
    if (opts.joyEl) this._bindTouch(opts.joyEl, opts.joyKnob);
    if (opts.shootBtn) this._bindButton(opts.shootBtn, 'shoot');
    if (opts.passBtn) this._bindButton(opts.passBtn, 'pass');
    if (opts.sprintBtn) this._bindHold(opts.sprintBtn, 'sprint');
    if (opts.switchBtn) this._bindButton(opts.switchBtn, 'switch');
  }

  Input.prototype._bindKeyboard = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      var k = e.key.toLowerCase();
      self.keys[k] = true;
      if (k === ' ') { e.preventDefault(); self.actions.shootPressed = true; }
      if (k === 'shift') self.actions.sprint = true;
      if (k === 'x' || k === 'j') self.actions.passPressed = true;
      if (k === 'q' || k === 'tab') { e.preventDefault(); self.actions.switchPressed = true; }
    });
    window.addEventListener('keyup', function (e) {
      var k = e.key.toLowerCase();
      self.keys[k] = false;
      if (k === 'shift') self.actions.sprint = false;
    });
  };

  Input.prototype._bindButton = function (el, name) {
    var self = this;
    var fire = function (ev) { ev.preventDefault(); self.actions[name + 'Pressed'] = true; };
    el.addEventListener('touchstart', fire, { passive: false });
    el.addEventListener('mousedown', fire);
  };
  Input.prototype._bindHold = function (el, name) {
    var self = this;
    var on = function (ev) { ev.preventDefault(); self.actions[name] = true; };
    var off = function (ev) { self.actions[name] = false; };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off);
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', off);
  };

  Input.prototype._bindTouch = function (base, knob) {
    var self = this;
    var rect, active = false, id = null, cx = 0, cy = 0;

    function start(clientX, clientY, pid) {
      rect = base.getBoundingClientRect();
      cx = rect.left + rect.width / 2; cy = rect.top + rect.height / 2;
      active = true; id = pid;
      move(clientX, clientY);
    }
    function move(clientX, clientY) {
      if (!active) return;
      var dx = clientX - cx, dy = clientY - cy;
      var maxR = rect.width / 2;
      var d = Math.min(Math.hypot(dx, dy), maxR);
      var a = Math.atan2(dy, dx);
      var nx = Math.cos(a) * d, ny = Math.sin(a) * d;
      self.joy.x = nx / maxR; self.joy.y = ny / maxR;
      self.joy.active = d > maxR * 0.12;
      if (knob) knob.style.transform = 'translate(' + nx + 'px,' + ny + 'px)';
    }
    function end() {
      active = false; id = null;
      self.joy.x = 0; self.joy.y = 0; self.joy.active = false;
      if (knob) knob.style.transform = 'translate(0,0)';
    }

    base.addEventListener('touchstart', function (e) {
      e.preventDefault();
      var t = e.changedTouches[0];
      start(t.clientX, t.clientY, t.identifier);
    }, { passive: false });
    base.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === id) move(t.clientX, t.clientY);
      }
    }, { passive: false });
    base.addEventListener('touchend', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === id) end();
    });
    base.addEventListener('touchcancel', end);

    base.addEventListener('mousedown', function (e) { start(e.clientX, e.clientY, 'mouse'); });
    window.addEventListener('mousemove', function (e) { if (active) move(e.clientX, e.clientY); });
    window.addEventListener('mouseup', function () { if (active) end(); });
  };

  Input.prototype.vector = function () {
    var x = 0, y = 0;
    if (this.keys['w'] || this.keys['arrowup']) y -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) y += 1;
    if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
    if (this.keys['d'] || this.keys['arrowright']) x += 1;

    var gp = this.gamepadVector();
    if (gp) { x += gp.x; y += gp.y; }

    if (this.joy.active) { x += this.joy.x; y += this.joy.y; }

    var len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x: x, y: y, len: Math.min(len, 1) };
  };

  Input.prototype.gamepadVector = function () {
    if (!navigator.getGamepads) return null;
    var pads = navigator.getGamepads();
    var gp = pads && pads[0];
    if (!gp || !gp.connected) return null;
    var x = gp.axes[0] || 0, y = gp.axes[1] || 0;
    if (Math.abs(x) < 0.15) x = 0;
    if (Math.abs(y) < 0.15) y = 0;
    this._gpButtons = gp.buttons;
    return { x: x, y: y };
  };

  Input.prototype.pollGamepadButtons = function () {
    if (!this._gpButtons) return;
    var b = this._gpButtons;
    if (b[0] && b[0].pressed && !this._gpAWas) this.actions.shootPressed = true;
    if (b[2] && b[2].pressed && !this._gpXWas) this.actions.passPressed = true;
    if (b[1] && b[1].pressed && !this._gpBWas) this.actions.switchPressed = true;
    this.actions.sprint = this.actions.sprint || (b[7] && b[7].pressed) || (b[5] && b[5].pressed);
    this._gpAWas = b[0] && b[0].pressed;
    this._gpXWas = b[2] && b[2].pressed;
    this._gpBWas = b[1] && b[1].pressed;
  };

  Input.prototype.sprintHeld = function () {
    return !!this.actions.sprint || !!this.keys['shift'];
  };

  Input.prototype.consume = function () {
    this.pollGamepadButtons();
    var out = {
      shoot: this.actions.shootPressed,
      pass: this.actions.passPressed,
      switch: this.actions.switchPressed,
      sprint: this.sprintHeld()
    };
    this.actions.shootPressed = false;
    this.actions.passPressed = false;
    this.actions.switchPressed = false;
    return out;
  };

  AS.Input = Input;
})(typeof window !== 'undefined' ? window : globalThis);
