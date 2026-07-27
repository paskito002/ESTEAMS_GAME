/* Pitch Legends — pitch geometry (all units are metres, FIFA standard) */
(function (root) {
  'use strict';
  var AS = root.AS = root.AS || {};
  var U = AS.U;

  var P = {
    L: 105,            // touchline length (goal line to goal line)
    W: 68,             // width
    MARGIN: 6.5,       // run-off area around the pitch
    GOAL_W: 7.32,
    GOAL_H: 2.44,
    GOAL_DEPTH: 2.2,
    PEN_DEPTH: 16.5,
    PEN_W: 40.32,
    BOX_DEPTH: 5.5,
    BOX_W: 18.32,
    PEN_SPOT: 11,
    CENTRE_R: 9.15,
    CORNER_R: 1,
    KEEP_OUT: 9.15     // distance opponents must retreat at a set piece
  };

  P.CX = P.L / 2;
  P.CY = P.W / 2;
  P.GOAL_TOP = P.CY - P.GOAL_W / 2;
  P.GOAL_BOT = P.CY + P.GOAL_W / 2;
  P.PEN_TOP = P.CY - P.PEN_W / 2;
  P.PEN_BOT = P.CY + P.PEN_W / 2;
  P.BOX_TOP = P.CY - P.BOX_W / 2;
  P.BOX_BOT = P.CY + P.BOX_W / 2;

  /* Is (x,y) inside the penalty area belonging to the goal at goalX (0 or P.L)? */
  P.inPenaltyArea = function (x, y, goalX) {
    if (y < P.PEN_TOP || y > P.PEN_BOT) return false;
    if (goalX === 0) return x >= 0 && x <= P.PEN_DEPTH;
    return x <= P.L && x >= P.L - P.PEN_DEPTH;
  };

  P.inGoalArea = function (x, y, goalX) {
    if (y < P.BOX_TOP || y > P.BOX_BOT) return false;
    if (goalX === 0) return x >= 0 && x <= P.BOX_DEPTH;
    return x <= P.L && x >= P.L - P.BOX_DEPTH;
  };

  P.onPitch = function (x, y) {
    return x >= 0 && x <= P.L && y >= 0 && y <= P.W;
  };

  /* Where a player is allowed to physically be (pitch + run-off) */
  P.clampToArea = function (o, r) {
    r = r || 0;
    o.x = U.clamp(o.x, -P.MARGIN + r, P.L + P.MARGIN - r);
    o.y = U.clamp(o.y, -P.MARGIN + r, P.W + P.MARGIN - r);
  };

  /* Nearest corner flag to a point */
  P.nearestCorner = function (x, y) {
    return { x: x < P.CX ? 0 : P.L, y: y < P.CY ? 0 : P.W };
  };

  /* Goal centre point for the goal at goalX */
  P.goalCentre = function (goalX) { return { x: goalX, y: P.CY }; };

  /* Visible angle (radians) of the goal mouth from a point — used for shot quality */
  P.goalAngle = function (x, y, goalX) {
    var a1 = Math.atan2(P.GOAL_TOP - y, goalX - x);
    var a2 = Math.atan2(P.GOAL_BOT - y, goalX - x);
    var d = Math.abs(a2 - a1);
    if (d > Math.PI) d = U.TAU - d;
    return d;
  };

  AS.P = P;
})(typeof window !== 'undefined' ? window : globalThis);
