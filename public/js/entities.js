/* Pitch Legends — ball, players, teams, formations, clubs */
(function (root) {
  'use strict';
  var AS = root.AS = root.AS || {};
  var U = AS.U, P = AS.P;

  /* =========================================================
     FORMATIONS
     Slots are normalised into "attacking coordinates":
       hx = 0 own goal line ... 1 opponent goal line
       hy = 0 left touchline ... 1 right touchline
     ========================================================= */
  var FORMATIONS = {
    '4-4-2': [
      { r: 'GK', hx: 0.035, hy: 0.50 },
      { r: 'DF', hx: 0.215, hy: 0.16 }, { r: 'DF', hx: 0.150, hy: 0.38 },
      { r: 'DF', hx: 0.150, hy: 0.62 }, { r: 'DF', hx: 0.215, hy: 0.84 },
      { r: 'MF', hx: 0.450, hy: 0.14 }, { r: 'MF', hx: 0.375, hy: 0.40 },
      { r: 'MF', hx: 0.375, hy: 0.60 }, { r: 'MF', hx: 0.450, hy: 0.86 },
      { r: 'FW', hx: 0.660, hy: 0.42 }, { r: 'FW', hx: 0.660, hy: 0.58 }
    ],
    '4-3-3': [
      { r: 'GK', hx: 0.035, hy: 0.50 },
      { r: 'DF', hx: 0.230, hy: 0.15 }, { r: 'DF', hx: 0.150, hy: 0.38 },
      { r: 'DF', hx: 0.150, hy: 0.62 }, { r: 'DF', hx: 0.230, hy: 0.85 },
      { r: 'MF', hx: 0.320, hy: 0.50 }, { r: 'MF', hx: 0.430, hy: 0.30 },
      { r: 'MF', hx: 0.430, hy: 0.70 },
      { r: 'FW', hx: 0.680, hy: 0.16 }, { r: 'FW', hx: 0.720, hy: 0.50 },
      { r: 'FW', hx: 0.680, hy: 0.84 }
    ],
    '3-5-2': [
      { r: 'GK', hx: 0.035, hy: 0.50 },
      { r: 'DF', hx: 0.170, hy: 0.30 }, { r: 'DF', hx: 0.130, hy: 0.50 },
      { r: 'DF', hx: 0.170, hy: 0.70 },
      { r: 'MF', hx: 0.420, hy: 0.09 }, { r: 'MF', hx: 0.380, hy: 0.34 },
      { r: 'MF', hx: 0.310, hy: 0.50 }, { r: 'MF', hx: 0.380, hy: 0.66 },
      { r: 'MF', hx: 0.420, hy: 0.91 },
      { r: 'FW', hx: 0.680, hy: 0.42 }, { r: 'FW', hx: 0.680, hy: 0.58 }
    ],
    '5-3-2': [
      { r: 'GK', hx: 0.035, hy: 0.50 },
      { r: 'DF', hx: 0.230, hy: 0.10 }, { r: 'DF', hx: 0.140, hy: 0.30 },
      { r: 'DF', hx: 0.110, hy: 0.50 }, { r: 'DF', hx: 0.140, hy: 0.70 },
      { r: 'DF', hx: 0.230, hy: 0.90 },
      { r: 'MF', hx: 0.400, hy: 0.28 }, { r: 'MF', hx: 0.340, hy: 0.50 },
      { r: 'MF', hx: 0.400, hy: 0.72 },
      { r: 'FW', hx: 0.640, hy: 0.40 }, { r: 'FW', hx: 0.640, hy: 0.60 }
    ]
  };

  /* =========================================================
     CLUBS  (all fictional)
     ========================================================= */
  var CLUBS = [
    { name: 'Azure Rovers',    abbr: 'AZR', shirt: '#1f7ae0', shorts: '#0d2f5c', trim: '#ffffff', gk: '#ffd23f', rating: 0.80 },
    { name: 'Scarlet United',  abbr: 'SCU', shirt: '#d8342c', shorts: '#2a0d0c', trim: '#ffffff', gk: '#4cd964', rating: 0.80 },
    { name: 'Emerald City',    abbr: 'EMC', shirt: '#12a05a', shorts: '#ffffff', trim: '#0a2b18', gk: '#ff8a3d', rating: 0.76 },
    { name: 'Obsidian FC',     abbr: 'OBS', shirt: '#22242b', shorts: '#22242b', trim: '#e8b23a', gk: '#8f5cff', rating: 0.83 },
    { name: 'Golden Harbour',  abbr: 'GHB', shirt: '#e8b23a', shorts: '#1a1a1a', trim: '#1a1a1a', gk: '#2ad4ff', rating: 0.74 },
    { name: 'Violet Athletic', abbr: 'VLA', shirt: '#7a45c9', shorts: '#2b1352', trim: '#ffffff', gk: '#c8ff3d', rating: 0.72 },
    { name: 'Frost Wanderers', abbr: 'FRW', shirt: '#e9eef5', shorts: '#1b2a3a', trim: '#1b2a3a', gk: '#ff4d8d', rating: 0.70 },
    { name: 'Crimson Bay',     abbr: 'CRB', shirt: '#8c1c3a', shorts: '#f0e6d2', trim: '#f0e6d2', gk: '#3ddc97', rating: 0.78 }
  ];

  var FIRST = ['Ade', 'Luca', 'Marek', 'Diego', 'Kwame', 'Ivan', 'Noah', 'Yuki', 'Omar', 'Tobi',
    'Rafa', 'Sami', 'Milos', 'Jonas', 'Pedro', 'Kofi', 'Andre', 'Nico', 'Emre', 'Dan',
    'Leo', 'Bruno', 'Kai', 'Musa', 'Ruben', 'Theo', 'Ilias', 'Jamal'];
  var LAST = ['Okoye', 'Bianchi', 'Novak', 'Suarez', 'Mensah', 'Petrov', 'Berg', 'Tanaka', 'Haddad', 'Adeyemi',
    'Costa', 'Rahman', 'Jovic', 'Lindqvist', 'Silva', 'Boateng', 'Moreau', 'Vidal', 'Yilmaz', 'Whyte',
    'Marchetti', 'Fonseca', 'Weber', 'Diallo', 'Ortega', 'Larsen', 'Nakamura', 'Bello'];

  /* =========================================================
     BALL
     ========================================================= */
  function Ball() {
    this.x = P.CX; this.y = P.CY; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.spin = 0;
    this.owner = null;
    this.lastTouch = null;      // { team, player, deliberate, kind }
    this.prevTouch = null;
    this.kickLock = 0;          // seconds a kicker cannot re-take
    this.lockFor = null;        // player barred by kickLock
    this.rot = 0;
    this.heldBy = null;         // keeper holding it in hands
    this.held = 0;
    this.trail = [];
  }

  Ball.prototype.place = function (x, y) {
    this.x = x; this.y = y; this.z = 0;
    this.vx = this.vy = this.vz = 0;
    this.spin = 0; this.owner = null; this.heldBy = null; this.held = 0;
    this.trail.length = 0;
  };

  Ball.prototype.speed = function () { return Math.hypot(this.vx, this.vy); };

  Ball.prototype.update = function (dt, game) {
    if (this.kickLock > 0) {
      this.kickLock -= dt;
      if (this.kickLock <= 0) this.lockFor = null;
    }

    if (this.heldBy) {
      var k = this.heldBy;
      this.x = k.x + k.fx * 0.55;
      this.y = k.y + k.fy * 0.55;
      this.z = 1.0;
      this.vx = this.vy = this.vz = 0;
      this.held += dt;
      return;
    }

    if (this.owner) return; // dribble handled by the player

    var airborne = this.z > 0.02 || this.vz > 0.02;

    if (airborne) {
      this.vz -= 9.81 * dt;
      var drag = Math.exp(-0.09 * dt);
      // Magnus effect: curl perpendicular to travel
      var mx = -this.vy * this.spin * 0.85 * dt;
      var my = this.vx * this.spin * 0.85 * dt;
      this.vx = this.vx * drag + mx;
      this.vy = this.vy * drag + my;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        if (this.vz < -1.2) {
          this.vz = -this.vz * 0.56;
          this.vx *= 0.80; this.vy *= 0.80;
          if (game && game.fx) game.fx.dust(this.x, this.y, 0.6);
        } else {
          this.vz = 0;
        }
      }
    } else {
      this.z = 0; this.vz = 0;
      var f = Math.exp(-0.60 * dt);
      this.vx *= f; this.vy *= f;
      this.spin *= Math.exp(-1.8 * dt);
      if (this.speed() < 0.22) { this.vx = 0; this.vy = 0; }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.speed() * dt * 1.6;

    this.trail.push(this.x, this.y, this.z);
    if (this.trail.length > 36) this.trail.splice(0, 3);
  };

  /* =========================================================
     PLAYER
     ========================================================= */
  function Player(cfg) {
    this.id = cfg.id;
    this.team = cfg.team;
    this.number = cfg.number;
    this.name = cfg.name;
    this.role = cfg.role;                 // GK / DF / MF / FW
    this.isGK = cfg.role === 'GK';
    this.slot = cfg.slot;                 // { hx, hy }
    this.onField = cfg.onField !== false;

    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.fx = 1; this.fy = 0;             // facing
    this.state = 'normal';                // normal | slide | down | keeperDive
    this.stateT = 0;
    this.stamina = 100;
    this.kickCd = 0;
    this.tackleCd = 0;
    this.slideHitBall = false;

    this.yellow = 0;
    this.sentOff = false;
    this.offside = false;                 // flagged in an offside position
    this.userControlled = false;
    this.frozen = 0;                      // set-piece hold

    var a = cfg.attr || {};
    this.attr = {
      pace: a.pace !== undefined ? a.pace : 0.6,
      shoot: a.shoot !== undefined ? a.shoot : 0.6,
      pass: a.pass !== undefined ? a.pass : 0.6,
      tackle: a.tackle !== undefined ? a.tackle : 0.6,
      control: a.control !== undefined ? a.control : 0.6,
      reflex: a.reflex !== undefined ? a.reflex : 0.6,
      stam: a.stam !== undefined ? a.stam : 0.6
    };

    this.sprinting = false;
    this.desire = { x: 0, y: 0, sprint: false }; // desired unit move vector
    this.anim = 0;
    this.stats = { goals: 0, assists: 0, shots: 0, passes: 0, passesOk: 0, tackles: 0, saves: 0, distance: 0 };
  }

  Player.prototype.radius = 0.55;

  Player.prototype.topSpeed = function () {
    var base = 5.9 + this.attr.pace * 2.4;                    // 5.9 – 8.3 m/s
    var fatigue = 0.80 + 0.20 * (this.stamina / 100);
    var sp = this.sprinting ? 1.14 : 1.0;
    if (this.isGK) base *= 0.94;
    return base * fatigue * sp;
  };

  Player.prototype.reset = function () {
    this.state = 'normal'; this.stateT = 0;
    this.vx = this.vy = 0;
    this.slideHitBall = false;
    this.offside = false;
  };

  Player.prototype.startSlide = function () {
    if (this.state !== 'normal' || this.tackleCd > 0 || this.isGK) return false;
    this.state = 'slide';
    this.stateT = 0.62;
    this.slideHitBall = false;
    this.tackleCd = 1.5;
    var s = Math.max(this.topSpeed() * 1.15, 6.5);
    this.vx = this.fx * s;
    this.vy = this.fy * s;
    this.stamina = Math.max(0, this.stamina - 3.5);
    return true;
  };

  Player.prototype.knockDown = function (t) {
    this.state = 'down';
    this.stateT = t || 1.1;
    this.vx *= 0.2; this.vy *= 0.2;
  };

  Player.prototype.update = function (dt, game) {
    if (this.kickCd > 0) this.kickCd -= dt;
    if (this.tackleCd > 0) this.tackleCd -= dt;
    if (this.frozen > 0) this.frozen -= dt;

    if (this.state !== 'normal') {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.state = 'normal';
        this.stateT = 0;
      }
    }

    var px = this.x, py = this.y;

    if (this.state === 'slide') {
      var f = Math.exp(-2.6 * dt);
      this.vx *= f; this.vy *= f;
    } else if (this.state === 'down') {
      this.vx *= Math.exp(-8 * dt); this.vy *= Math.exp(-8 * dt);
    } else if (this.state === 'keeperDive') {
      this.vx *= Math.exp(-1.1 * dt); this.vy *= Math.exp(-1.1 * dt);
    } else {
      var d = this.desire;
      var want = Math.hypot(d.x, d.y);
      this.sprinting = !!d.sprint && want > 0.1 && this.stamina > 4;
      var top = this.topSpeed();
      var tx = 0, ty = 0;
      if (want > 0.001) {
        var s = Math.min(want, 1) * top;
        tx = (d.x / want) * s;
        ty = (d.y / want) * s;
      }
      var accel = (this.frozen > 0 ? 30 : 26) * dt;
      this.vx = U.approach(this.vx, tx, accel);
      this.vy = U.approach(this.vy, ty, accel);

      // stamina
      var moving = Math.hypot(this.vx, this.vy);
      var burn = (moving / 8) * (this.sprinting ? 2.1 : 0.62) * dt * (1.5 - this.attr.stam);
      this.stamina = U.clamp(this.stamina - burn + (moving < 1.2 ? 1.5 * dt : 0), 0, 100);

      if (moving > 0.35) {
        var nf = U.norm(this.vx, this.vy);
        this.fx += (nf.x - this.fx) * U.damp(11, dt);
        this.fy += (nf.y - this.fy) * U.damp(11, dt);
        var nn = U.norm(this.fx, this.fy);
        this.fx = nn.x; this.fy = nn.y;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    P.clampToArea(this, 0.4);

    this.anim += Math.hypot(this.vx, this.vy) * dt * 1.9;
    this.stats.distance += U.dist(px, py, this.x, this.y);
  };

  /* =========================================================
     TEAM
     ========================================================= */
  function Team(club, side, formationName, opts) {
    opts = opts || {};
    this.club = club;
    this.name = club.name;
    this.abbr = club.abbr;
    this.colors = { shirt: club.shirt, shorts: club.shorts, trim: club.trim, gk: club.gk };
    this.side = side;                       // 0 = left at kickoff, 1 = right
    this.attackDir = side === 0 ? 1 : -1;   // flipped at half time
    this.isUser = !!opts.isUser;
    this.formationName = formationName || '4-4-2';
    this.score = 0;
    this.shootoutScore = 0;
    this.shootoutTaken = 0;
    this.shootoutLog = [];
    this.subsUsed = 0;
    this.maxSubs = 5;
    this.mentality = 0;                     // -1 defensive .. +1 all-out attack
    this.chaser = null;
    this.support = null;
    this.stats = {
      shots: 0, onTarget: 0, corners: 0, fouls: 0, offsides: 0,
      yellow: 0, red: 0, saves: 0, passes: 0, passesOk: 0, possFrames: 0, throwIns: 0
    };
    this.players = [];
    this.bench = [];
    this.build(club, opts.difficulty || 0.5);
  }

  Team.prototype.build = function (club, difficulty) {
    var slots = FORMATIONS[this.formationName] || FORMATIONS['4-4-2'];
    var used = {};
    var self = this;
    var quality = club.rating * (0.85 + difficulty * 0.3);

    function makeName() {
      var n;
      do { n = U.pick(FIRST) + ' ' + U.pick(LAST); } while (used[n]);
      used[n] = 1; return n;
    }
    function attrFor(role, q) {
      function v(base, spread) { return U.clamp(base * q + U.rand(-spread, spread), 0.25, 0.99); }
      if (role === 'GK') return { pace: v(0.55, .06), shoot: v(0.35, .06), pass: v(0.6, .07), tackle: v(0.4, .06), control: v(0.55, .07), reflex: v(0.95, .07), stam: v(0.8, .07) };
      if (role === 'DF') return { pace: v(0.78, .09), shoot: v(0.5, .09), pass: v(0.72, .08), tackle: v(0.92, .07), control: v(0.68, .08), reflex: v(0.5, .08), stam: v(0.85, .07) };
      if (role === 'MF') return { pace: v(0.82, .09), shoot: v(0.75, .09), pass: v(0.92, .07), tackle: v(0.76, .08), control: v(0.86, .07), reflex: v(0.5, .08), stam: v(0.92, .06) };
      return { pace: v(0.93, .08), shoot: v(0.94, .07), pass: v(0.74, .09), tackle: v(0.5, .09), control: v(0.88, .07), reflex: v(0.5, .08), stam: v(0.8, .08) };
    }

    var numbers = [1, 2, 5, 6, 3, 7, 4, 8, 11, 9, 10];
    slots.forEach(function (s, i) {
      self.players.push(new Player({
        id: self.side + '-' + i,
        team: self,
        number: numbers[i] || (i + 1),
        name: makeName(),
        role: s.r,
        slot: { hx: s.hx, hy: s.hy },
        attr: attrFor(s.r, quality)
      }));
    });

    // bench: 1 GK, 2 DF, 2 MF, 2 FW
    var benchRoles = ['GK', 'DF', 'DF', 'MF', 'MF', 'FW', 'FW'];
    var benchNums = [12, 13, 14, 15, 16, 17, 18];
    benchRoles.forEach(function (r, i) {
      var p = new Player({
        id: self.side + '-b' + i,
        team: self,
        number: benchNums[i],
        name: makeName(),
        role: r,
        slot: { hx: 0.4, hy: 0.5 },
        attr: attrFor(r, quality * 0.94),
        onField: false
      });
      p.onField = false;
      self.bench.push(p);
    });
  };

  Team.prototype.onFieldPlayers = function () {
    var out = [];
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      if (p.onField && !p.sentOff) out.push(p);
    }
    return out;
  };

  Team.prototype.keeper = function () {
    var f = this.onFieldPlayers();
    for (var i = 0; i < f.length; i++) if (f[i].isGK) return f[i];
    return null;
  };

  /* Goal this team is attacking / defending (x coordinate) */
  Team.prototype.targetGoalX = function () { return this.attackDir > 0 ? P.L : 0; };
  Team.prototype.ownGoalX = function () { return this.attackDir > 0 ? 0 : P.L; };

  /* Convert a normalised formation slot into pitch coordinates */
  Team.prototype.slotToPitch = function (slot) {
    var x, y;
    if (this.attackDir > 0) { x = slot.hx * P.L; y = slot.hy * P.W; }
    else { x = P.L - slot.hx * P.L; y = P.W - slot.hy * P.W; }
    return { x: x, y: y };
  };

  AS.Ball = Ball;
  AS.Player = Player;
  AS.Team = Team;
  AS.FORMATIONS = FORMATIONS;
  AS.CLUBS = CLUBS;
})(typeof window !== 'undefined' ? window : globalThis);
