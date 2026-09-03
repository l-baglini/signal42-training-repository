# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@./docs/APP_SPEC.md

## Commands

```bash
dart pub get                                                              # install dependencies
dart run bin/maze_cli_escape.dart                                         # run the game
dart compile exe bin/maze_cli_escape.dart -o .build/maze-escape-game     # compile native binary
dart test                                                                 # run tests
dart analyze                                                              # static analysis
```

## Architecture

`bin/maze_cli_escape.dart` is a thin entrypoint (`main()` only). All game logic lives in `lib/` as package-imported modules:

| File | Responsibility |
|------|---------------|
| `lib/theme.dart` | `Theme` class — static ANSI colour constants and ASCII art strings |
| `lib/models.dart` | `KeyType`, `MazeKey`, `FsNode`, `MazeSession`, `maxTimeLostFor()` |
| `lib/session_factory.dart` | `createMockSession()` — isolated so procedural generation can replace it without touching game logic |
| `lib/break_mode.dart` | `runBreakMode()` and private helpers for the three break paths |
| `lib/commands.dart` | `processCommand()` and all `_cmd*` handlers (`ls`, `cd`, `cat`, `pwd`, `break`, `help`) |
| `lib/screens.dart` | `showStartMenu()`, `showEndScreen()`, `printPrompt()`, `timerBar()`, `clearScreen()` |
| `lib/game_loop.dart` | `runGameLoop()` — main REPL: reads input → dispatches → checks win/timeout |
| `lib/input_reader.dart` | `InputReader` — raw-mode line editor; handles arrow keys, history, cursor movement |

## Code Guidelines

- Each `lib/` module is self-contained; cross-module calls go through public functions only
- Private helpers (prefixed `_`) stay internal to their own file
- Comment the main logic functions and anywhere a specific pattern is deliberately chosen
- Use external deps only when strictly necessary
- For difficult engineering tasks (e.g. procedural generation) implement mocks first to test gameplay

## Project Guidelines

- Iterative approach — stress-test gameplay before polish
- MVP mindset: reduce complexity, keep it maintainable
- Nice-to-haves (save/load, animations, colours) come after core loop is solid
