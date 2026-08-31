# Space Invaders

Classic arcade game built with plain HTML5 Canvas + Web Audio API. No dependencies, no build step.

## How to play

Open `index.html` in any modern browser (or serve with `npx serve .`).

| Key | Action |
|-----|--------|
| `←` / `A` | Move left |
| `→` / `D` | Move right |
| `Space` / `↑` / `W` | Shoot |

## Features

- 5 rows × 11 columns of aliens (3 types, 10/20/30 pts)
- Mystery UFO worth 50–300 bonus points
- 4 destructible bunkers (pixel-level damage)
- Progressive difficulty: aliens speed up as they die and with each level
- Procedural sound effects via Web Audio API
- Particle explosion effects
- Animated starfield background
- High score persisted in localStorage
