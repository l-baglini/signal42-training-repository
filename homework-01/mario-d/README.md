# Breakout Neon

A neon-styled Breakout game built with vanilla HTML5 Canvas and JavaScript — no dependencies, single file.

## How to play

Open `index.html` in any modern browser. No build step or server required.

## Controls

| Action | Keyboard | Mouse |
|---|---|---|
| Move paddle | Arrow keys or A / D | Move cursor |
| Launch ball | Space or Enter | Click |
| Pause / Resume | P or Escape | — |
| Quit to menu | Q | — |
| Navigate menus | Arrow keys | Hover + click |

## Gameplay

Clear all bricks to advance to the next wave. Each wave adds more bricks and increases ball speed.

**Brick colors** indicate row difficulty — red rows are at the top and score the most points. Higher waves introduce multi-HP bricks (marked with cracks) that require multiple hits to destroy.

### Power-up drops

Some bricks hide a falling power-up. Catch it with the paddle to trigger its effect:

| Symbol | Type | Effect |
|---|---|---|
| `+` | Extra ball | Spawns an additional ball |
| `✕` | Bomb | Loses one life |
| `⚡` | Thunder | Speeds up all balls |
| `−` | Minus | Slows down all balls |

### Scoring

- Each brick is worth `(row_position × 10 × current_wave)` points.
- Top rows score the most.
- Your personal best is saved for the session and shown on the main menu and HUD.

## Screens

- **Main Menu** — start a new game or view score history.
- **Score History** — last 5 runs with score, wave reached, and date. Personal bests are marked with ★.
- **Game Over** — shows final score, wave, and personal best. Click to return to the menu.
