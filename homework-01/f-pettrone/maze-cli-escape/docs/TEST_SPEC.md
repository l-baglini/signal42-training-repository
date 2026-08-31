# Test Specifications

## Philosophy

Unit tests cover pure logic only — functions that take input and return output with no side effects. Modules that write to `stdout` or read from `stdin` are integration concerns and are excluded from unit testing until an IO abstraction layer is introduced.

The Dart test runner (`dart test`) and the `test` package are already declared as a dev dependency — no additional setup needed.

---

## Modules to test

### `lib/models.dart`

**`maxTimeLostFor(KeyType)`**

| Case | Input | Expected |
|------|-------|----------|
| Easy key | `KeyType.easy` | `10` |
| Medium key | `KeyType.medium` | `20` |
| Hard key | `KeyType.hard` | `30` |

**`MazeSession.remaining`**

Verify that `remaining` decreases as `penaltySeconds` increases and returns a negative `Duration` when penalties exceed the session duration.

**`MazeSession.pwd`**

| Case | `currentPath` | Expected `pwd` |
|------|--------------|----------------|
| At root | `[root]` | `/` |
| One level deep | `[root, hallway]` | `/hallway` |
| Two levels deep | `[root, crypt, vault]` | `/crypt/vault` |

**`MazeSession.timedOut`**

Construct a session with a 1-second duration, add 2 seconds of penalties, assert `timedOut` is `true`.

---

### `lib/session_factory.dart`

**`createMockSession()`**

| Case | Assertion |
|------|-----------|
| Key count | `allKeys.length == 3` |
| Key types | one easy, one medium, one hard |
| Location paths | each key's `locationPath` matches a reachable path in the `FsNode` tree |
| Root node | `root.name == 'dungeon'` |
| Session id | `id == 'mock-001'` |
| Duration | `duration == Duration(minutes: 3)` |

---

### `lib/commands.dart` — `_sanitizeInput` (expose for testing or move to `models.dart`)

`_sanitizeInput` is currently private. To test it, either:
- Promote it to a public top-level function (`sanitizeInput`)
- Move it to `lib/models.dart` as a utility

| Case | Input | Expected output |
|------|-------|-----------------|
| Plain text | `'cd hallway'` | `'cd hallway'` |
| Leading/trailing whitespace | `'  ls  '` | `'ls'` |
| Tab character | `'cd\thallway'` | `'cdhallway'` |
| CSI arrow key sequence | `'\x1B[A'` | `''` |
| SS3 sequence | `'\x1BOA'` | `''` |
| ESC prefix before text | `'\x1Bcd'` | `'d'` (ESC+c stripped, `d` survives) |
| Delete key sequence | `'\x1B[3~'` | `''` |
| Mixed ESC and text | `'\x1B[Acd hallway'` | `'cd hallway'` |

> `\x1Bcd` → `d` is intentional: ESC+one-char is stripped as a unit, leaving the remainder. Cover this edge case explicitly.

---

### `lib/break_mode.dart` — penalty arithmetic

The penalty calculations are currently embedded inside functions that call `stdin`/`stdout`. Extract them as pure functions before testing:

**`pathBreakCostOnSuccess(MazeKey key)`** → `key.maxTimeLost ~/ 2`

| Key type | Expected cost |
|----------|--------------|
| Easy | `5` |
| Medium | `10` |
| Hard | `15` |

**`pathBreakCostOnFailure(MazeKey key)`** → `key.type.index + 1`

| Key type | Expected cost |
|----------|--------------|
| Easy | `1` |
| Medium | `2` |
| Hard | `3` |

**Penalty accumulation** — construct a `MazeSession`, call `session.penaltySeconds +=` with the extracted helpers, assert the total accumulates correctly across multiple break attempts.

---

## Test file layout

```
test/
  models_test.dart          ← MazeSession, maxTimeLostFor, pwd, timedOut
  session_factory_test.dart ← createMockSession structure assertions
  sanitize_input_test.dart  ← _sanitizeInput edge cases (requires making it public)
  break_mode_test.dart      ← penalty cost helpers (requires extraction)
```

---

## What NOT to unit test

| Area | Reason |
|------|--------|
| `runGameLoop` | Reads stdin in a loop — needs IO mocking or end-to-end harness |
| `processCommand` dispatch | Side-effecting; test the handlers indirectly via session state |
| `showStartMenu` / `showEndScreen` | Pure stdout rendering; no return value to assert |
| `runBreakMode` sub-loop | stdin-driven; integration test only |

---

## Running tests

```bash
dart test                        # all tests
dart test test/models_test.dart  # single file
dart test --reporter expanded    # verbose output
```
