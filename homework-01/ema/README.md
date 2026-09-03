# Homework 01 — Emanuele Simonelli

## Submitted applications

---

### 1. gitdash

**gitdash** is a lightweight Electron desktop application that provides a unified dashboard for monitoring multiple Git repositories at once.

#### What it does

Point it at any folder on your machine and it will scan for every Git repository inside. For each repo you can:

- see the current branch and working-tree status (modified, staged, untracked, and deleted files)
- browse all local and remote branches
- review the last 10 commits with author and relative timestamp
- open an inline diff for any changed file, with syntax-highlighted additions, deletions, and hunk headers

#### Tech stack

| Layer | Technology |
| --- | --- |
| Shell | [Electron](https://www.electronjs.org/) |
| Git operations | [simple-git](https://github.com/steveukx/git-js) |
| UI | Vanilla HTML/CSS/JS (renderer process) |

#### How to run

```bash
cd gitdash
npm install
npm start
```

Requires Node.js ≥ 18.

#### Screenshots

![Empty state](gitdash/screenshots/01-empty-state.png)
![Repo detail](gitdash/screenshots/02-repo-detail.png)
![Diff view](gitdash/screenshots/03-diff-view.png)

---

### 2. nerd-quest

**nerd-quest** is a nerd-themed multiplayer board game inspired by the classic Game of the Goose, built as an Electron desktop application.

#### What it does

- 60-square snake-path board for 2–6 players
- Each player enters a name and picks a pawn colour before the game starts
- Virtual dice roll with animation; pawns move along the board automatically
- 14 special squares trigger nerd-themed events (7 bonuses, 7 obstacles) that advance, set back, or skip players
- Overshoot the finish line? You bounce back the excess steps
- Event cards overlay the board when a special square is triggered

#### Special squares (sample)

| Type | Event | Effect |
| --- | --- | --- |
| Bonus | PR Merged on First Review! | +6 squares |
| Bonus | O(1) Algorithm Found! | +5 squares |
| Obstacle | git push --force to main! | −8 squares |
| Obstacle | Production Down at 3 AM! | −10 squares |
| Obstacle | Segmentation Fault! | Teleport to square 21 |

#### Tech stack

| Layer | Technology |
| --- | --- |
| Shell | [Electron](https://www.electronjs.org/) |
| Rendering | HTML Canvas 2D API |
| UI | Vanilla JS (renderer process) |

#### How to run

```bash
cd nerd-quest
npm install
npm start
```

Requires Node.js ≥ 18.
