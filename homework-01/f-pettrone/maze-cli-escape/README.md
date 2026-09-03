```
___________________________________________________
  __  __    _    _________    ____  _      ___
 |  \/  |  / \  |__  / ___|  / ___\|_|    |_ _|
 | |\/| | / _ \   / /| |__  | |    |_|     | |
 | |  | |/ ___ \ / /_| |__  | |___ | |___  | |
 |_|  |_/_/   \_\____|____|  \____||_____||___|

    E  S  C  A  P  E
___________________________________________________
```

> A terminal dungeon crawler where the dungeon **is** a filesystem.

---

## What is this?

Maze CLI Escape is a command-line game built in Dart. A procedural filesystem is generated at runtime — rooms are directories, secrets are files. You navigate with real Linux-style commands (`ls`, `cd`, `cat`, `pwd`) and hunt for **keys** hidden deep in the directory tree before the timer runs out.

Find a key, type its filename, and you enter **Key Break Mode** — a short puzzle where you can:

- Type the secret **cypher word** (free, if you know it)
- Enter the **exact absolute path** of the room (costs time)
- **Forfeit** and brute-force it open (costs more time)
- Type `back` to leave it and come back later

Collect all keys before the maze locks forever. Easy keys lose you 10 s, Medium 20 s, Hard 30 s — choose your battles.

---

## Requirements

- [Dart SDK](https://dart.dev/get-dart) `^3.12`

---

## Run

```bash
dart pub get
dart run bin/maze_cli_escape.dart
```

---

## Commands in-game

| Command       | Action |
|---------------|--------|
| `ls`          | List the current room (dirs as `name/`, keys with 🔑) |
| `pwd`         | Print your current path |
| `cd <room>`   | Enter a child directory |
| `cd ..`       | Go up one level |
| `cd /`        | Jump to dungeon root |
| `cat <file>`  | Inspect a key (type, masked cypher hint) without triggering break mode |
| `<key-name>`  | Type a key's exact filename to enter Key Break Mode |
| `help`        | Print command reference |
| `exit`        | Quit the session |

---

## Build a standalone executable

Dart can compile to a self-contained native binary — no SDK required on the target machine.

```bash
dart compile exe bin/maze_cli_escape.dart -o .build/maze-escape-game
```

Run it directly:

```bash
./.build/maze-escape-game
```

> The compiled binary targets your current platform (macOS, Linux, or Windows). Cross-compilation is not supported by the Dart AOT compiler — build on the platform you intend to run it on.

---

## Development

```bash
dart test        # run tests
dart analyze     # static analysis
```

---

## Terminal input

The game uses a raw-mode line reader (`lib/input_reader.dart`) instead of the standard `stdin.readLineSync()`. This means the terminal behaves like a proper shell prompt:

| Key | Behaviour |
|-----|-----------|
| `←` / `→` | Move cursor within the line |
| `↑` / `↓` | Scroll through command history |
| `Backspace` | Delete character left of cursor |
| `Delete` | Delete character right of cursor |
| `Home` / `End` | Jump to start / end of line |
| `Ctrl-C` / `Ctrl-D` | Cancel current input |

Without raw mode, arrow keys would print `^[[A` garbage to the terminal instead of being handled silently.

---

## Project structure

```
bin/maze_cli_escape.dart     ← entrypoint (main only)
lib/
  theme.dart                 ← ANSI colours & ASCII art (Theme class)
  models.dart                ← KeyType, MazeKey, FsNode, MazeSession
  session_factory.dart       ← createMockSession() (swap for procedural gen here)
  break_mode.dart            ← runBreakMode() sub-loop
  commands.dart              ← processCommand() + ls/cd/cat/pwd/break/help
  screens.dart               ← start menu, end screen, prompt, timer bar
  game_loop.dart             ← runGameLoop() REPL
  input_reader.dart          ← InputReader: raw-mode line editor with history
.build/                      ← compiled native binary (git-ignored)
test/                        ← unit tests
docs/APP_SPEC.md             ← full design spec
```
