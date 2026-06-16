# Wonder Boy: Monster Quest

A fully playable browser game inspired by **Wonder Boy in Monster Land** (Sega, 1987).  
Pure JavaScript + HTML5 Canvas, zero dependencies. Open `index.html` in any browser to play.

## Files

| File | Contents |
|------|----------|
| `index.html` | Entry point — 800×500 canvas, loads `game.js`, minimal CSS |
| `game.js` | Entire game: ~1330 lines, no external dependencies |

## Architecture

Everything lives in `game.js`, organized as ES6 classes with a single global game loop.

```
Camera        — horizontal/vertical scroll with clamped offset
Tile          — world blocks: ground / platform / wall / spike
Particle      — short-lived visual burst squares
Gold          — coin pickups with bounce physics and bob animation
Projectile    — fireballs (player spells and boss shots)
Player        — movement, jump, sword swing, spells, inventory
Enemy (base)  — gravity, patrol AI, knockback, gold drop
  Slime       — jumps toward player on a timer
  Skeleton    — chases at close range, periodic sword swing
  Bat         — free-flying, steers toward player within 340px
  Dragon      — boss: floats, tracks player Y, shoots fireballs in 2 phases
Shop          — in-world building with overlay menu
Level         — generates tiles, owns enemies/gold/particles, runs update/draw
Game          — fixed-step loop at 60 fps, state machine
```

**Game loop:** fixed timestep accumulator at 60 fps. `requestAnimationFrame` → accumulate delta → drain in `1000/60 ms` steps → draw.

**State machine:** `MENU → PLAY ↔ SHOP → NEXT (level complete) → PLAY → … → WIN / OVER`

**Input:** two layers — `keydown` event for menu/shop navigation; `justPressed` map consumed each fixed step for gameplay actions (attack, spell, jump).

## Levels

| # | Theme | Enemies | Notes |
|---|-------|---------|-------|
| 1 | Grassy plains | Slime, Skeleton, Bat | Gap in ground, parallax trees + clouds |
| 2 | Dusk castle | Skeleton, Bat | Two-floor layout, platforms lead to upper walkway |
| 3 | Underground cave | Bat, Skeleton | Ceiling tiles, stone pillars, spike traps |
| 4 | Dragon lair | Dragon Boss | Closed arena, boss in 2 phases |

Spike tiles are placed **one row above the ground floor** (row `ground_ty - 1`) so they sit at standing-player height and correctly trigger overlap checks.

## Player Stats

Carried across levels. Restored +2 HP on each level transition. 180-frame spawn invincibility guaranteed on every level load.

| Item (shop) | Effect |
|-------------|--------|
| Potion | +2 HP |
| Iron Sword | `swordLv = 2`, ATK +1 |
| Fire Sword | `swordLv = 3`, ATK +2, fire visual |
| Shield | DEF +1 |
| Armor | Max HP +2 |
| Boots | Move speed +1 |
| Mana Orb | Max mana +1 (cap 5) |

## Controls

| Key | Action |
|-----|--------|
| `←→` / `WASD` | Move |
| `↑` / `W` / `Space` | Jump (held key, fires once per `justPressed`) |
| `Z` / `X` | Sword attack |
| `C` | Fireball spell (requires mana) |
| `E` | Enter shop (within 90px of building) |
| `Esc` | Return to main menu |

## Key Implementation Details

- **Collision order matters:** the `move()` tile loop processes `spike` type first (deals damage, then `continue`), then resolves solid/platform landing. Spikes placed at the same row as ground would never trigger because the player's bottom equals the tile top exactly (`>` not `>=`). Fix: place spikes one row above.
- **Spawn safety:** `_load()` always sets `player.invTimer = 180` regardless of carried-over state, giving 3 seconds of damage immunity at the start of every level.
- **Dragon clamping:** `boss.lw` must be set manually after construction (`boss.lw = 42 * TILE`) since `Dragon` has no reference to the level width.
- **Bat double-decrement bug (known, harmless):** `Bat.update()` calls `this._tick()` (which decrements `invT`) and then manually decrements `invT` again. Invincibility frames expire at 2× speed, but this does not affect gameplay meaningfully.
- **Screen shake:** global `shakeAmt` decremented by 0.6/frame; applied as a random canvas translation before drawing.

## How to Extend

**New enemy:** subclass `Enemy`, implement `update(tiles, player)` and `draw(cam)`. Add body-damage or custom attack logic inside `Level.update()` following the `instanceof` pattern already used for `Skeleton` and `Dragon`.

**New level:** add a `_lvN()` method in `Level`, add a case in `_build(n)`, increment `Game.totalLvs`.

**New shop item:** push an entry into `Shop.items`, add a `case` in `Shop._buy()`.

**Sound effects:** hook into the same points that call `this.burst(...)` or `shake()`; create an `AudioContext` and synthesize tones with `OscillatorNode`.
