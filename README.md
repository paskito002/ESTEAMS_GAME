# Pitch Legends — Arcade Football

A full arcade football (soccer) game that runs entirely in the browser: real pitch
physics, 11-a-side AI teams, offside with a visible line and flag, fouls and
yellow/red cards, direct & indirect free kicks, penalties, corners, throw-ins,
goal kicks, the back-pass rule, half-time, extra time, and penalty shootouts.
It's a PWA, so once it's loaded once it keeps working **with no internet
connection** — install it to a phone home screen for a native-feeling app.

No build step, no framework, no dependencies. Plain HTML/CSS/JS + a tiny
zero-dependency Node static server for hosting.

## Play it locally

```bash
npm start
# open http://localhost:3000
```

(Node 18+ only — nothing else to install.)

You can also just open `public/index.html` directly in a browser; everything
works without the server except the service worker (offline mode needs to be
served over http/https, so use `npm start` or a deployed URL for that part).

## Controls

| Action        | Keyboard        | Touch                  | Gamepad          |
|----------------|-----------------|-------------------------|------------------|
| Move           | WASD / Arrows   | Drag the left joystick  | Left stick       |
| Shoot (charge) | hold Space      | hold SHOOT              | hold A           |
| Pass           | X / J           | tap PASS                | X                |
| Sprint         | hold Shift      | hold SPRINT             | triggers/bumpers |
| Switch player  | Q / Tab         | tap SWITCH              | B                |
| Pause          | Esc             | pause icon (top right)  | —                |

## Match settings

- Half length: 2 / 5 / 10 / 15 real minutes per half (15 = a full 30-minute match)
- Extra time + penalty shootout toggle if the match is level
- 3 difficulty tiers for the AI
- 8 fictional clubs, 4 formations, procedurally generated squads and names

## Deploy to GitHub + Render

### 1. Push to GitHub

```bash
cd pitch-legends          # this project folder
git init
git add .
git commit -m "Pitch Legends — arcade football game"
gh repo create pitch-legends --public --source=. --push
# (or manually: create an empty repo on github.com, then)
git remote add origin https://github.com/<you>/pitch-legends.git
git branch -M main
git push -u origin main
```

### 2. Deploy on Render

**Option A — one click with the blueprint file:**
This repo includes `render.yaml`. On Render: **New → Blueprint**, point it at
your GitHub repo, and Render will read `render.yaml` and configure everything
automatically (Node web service, `npm install`, `npm start`).

**Option B — manual setup:**
1. Render dashboard → **New → Web Service**
2. Connect your GitHub repo
3. Environment: **Node**
4. Build command: `npm install`
5. Start command: `npm start`
6. Instance type: Free is fine
7. Deploy — Render gives you a URL like `https://pitch-legends.onrender.com`

That's it — open the URL, play, and (after the first load) it works offline
and can be installed as an app from the browser's install/share menu.

## Project structure

```
public/
  index.html          Menu, HUD, overlays
  manifest.webmanifest PWA metadata (installable app)
  sw.js               Service worker — offline caching
  css/style.css
  js/
    util.js           Math helpers
    pitch.js           Pitch geometry (real FIFA metres)
    audio.js           Procedural sound (no audio files to fetch)
    fx.js              Particles: dust, sparks, confetti
    entities.js        Ball / Player / Team / formations / clubs
    ai.js               Off-ball movement, marking, on-ball decisions, keeper AI
    rules.js            Referee: offside, goals, fouls, cards, restarts
    game.js             Match state machine: kickoff, halves, ET, shootouts
    renderer.js         Canvas rendering, camera, offside line
    input.js            Keyboard / touch joystick / gamepad
    app.js              Menu flow + game loop wiring
  assets/               Icons
server.js               Static file server (used by `npm start` / Render)
render.yaml             Render blueprint
```

## Notes on the simulation

- All 22 players (+ substitutes) are independently simulated: they press,
  mark, hold a defensive line, make runs, and the goalkeepers dive, rush out,
  and distribute.
- Offside is computed properly against the second-last defender, with an
  on-screen dashed line and flag call when it's given.
- Fouls scale with tackle timing/impact into no-card / yellow / red, and two
  yellows sends a player off (reducing that team to 10, 9…).
- Extra time is two more periods (configurable length) and, if still level,
  a full penalty shootout with alternating kicks, sudden-death-aware
  stopping logic, and user-controlled kicks/saves when it's your team's turn.
