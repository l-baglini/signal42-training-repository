# Nerd Quest — Game of the Goose

A nerd-themed multiplayer board game inspired by the classic Game of the Goose,
built as an **Electron desktop application**.

Roll the virtual dice, navigate a 60-square snake-path board, and be the first
player to reach the finish line. Along the way, special squares trigger events
drawn from the everyday triumphs and disasters of software development.

---

## Requirements

- [Node.js](https://nodejs.org/) 18+
- npm (bundled with Node.js)

---

## How to Run

```bash
npm install
npm start
```

---

## Players

- **2 to 6 players** are supported.
- Before the game starts, each player enters a **name** (up to 16 characters)
  and selects a **pawn colour** (Red, Blue, Green, Yellow, Purple, Cyan).
- Setup is done one player at a time; already-taken colours are crossed out.

---

## Gameplay

1. Players take turns in setup order.
2. On your turn, click **Roll Dice**. The die animates, then your pawn advances.
3. If you **overshoot square 60**, you bounce back the excess steps.
4. The first player to land **exactly on square 60** wins.
5. Clicking **Roll Dice** while you have pending skip-turns spends one skip
   instead of moving.

---

## Special Squares

The board has **14 special squares** — 7 that help you, 7 that hinder you.
Landing on one shows an event card. Click **Continue** to proceed.

### Help Squares (green `+`)

| Square | Event | Effect |
|--------|-------|--------|
| 5  | Vim Shortcut Mastered!       | Advance **3** squares  |
| 14 | Stack Overflow Saves You!    | Advance **5** squares  |
| 23 | PR Merged on First Review!   | Advance **6** squares  |
| 31 | Caffeine Overdose!           | Advance **4** squares  |
| 39 | O(1) Algorithm Found!        | Advance **5** squares  |
| 47 | Rubber Duck Debug!           | Advance **4** squares  |
| 55 | CI/CD Pipeline All Green!    | Advance **4** squares  |

### Obstacle Squares (red `!`)

| Square | Event | Effect |
|--------|-------|--------|
| 9  | Infinite Loop Detected!        | Go back **4** squares           |
| 18 | Merge Conflict!                | Lose **1** turn                 |
| 27 | Blue Screen of Death!          | Lose **2** turns                |
| 35 | git push --force to main!      | Go back **8** squares           |
| 43 | Segmentation Fault!            | Teleport back to **square 21**  |
| 51 | 404 — Docs Not Found!          | Go back **5** squares           |
| 58 | Production Down at 3 AM!       | Go back **10** squares          |

---

## Board Layout

```
[60]← [59]← [58]← [57]← [56]← [55]← [54]← [53]← [52]← [51]
[41]→ [42]→ [43]→ [44]→ [45]→ [46]→ [47]→ [48]→ [49]→ [50]
[40]← [39]← [38]← [37]← [36]← [35]← [34]← [33]← [32]← [31]
[21]→ [22]→ [23]→ [24]→ [25]→ [26]→ [27]→ [28]→ [29]→ [30]
[20]← [19]← [18]← [17]← [16]← [15]← [14]← [13]← [12]← [11]
 [1]→  [2]→  [3]→  [4]→  [5]→  [6]→  [7]→  [8]→  [9]→ [10]
```

Square **1** is the Start. Square **60** is the Finish.

---

## Controls

| Action | Input |
|--------|-------|
| Roll the dice | Click **Roll Dice** |
| Skip turn (forced) | Click **Roll Dice** when skip is pending |
| Select colour | Click a colour circle during setup |
| Confirm event | Click **Continue** |
| Quit | Press **ESC** or close the window |

---

## Project Structure

```
nerd-quest/
├── main.js       Electron main process — creates the BrowserWindow
├── index.html    HTML shell (just a <canvas>)
├── renderer.js   All game logic and Canvas 2D rendering
├── package.json  npm / Electron configuration
└── README.md     This file
```
