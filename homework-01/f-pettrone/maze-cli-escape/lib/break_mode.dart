// ─── BREAK MODE ──────────────────────────────────────────────────────────────

import 'dart:io';
import 'package:maze_cli_escape/models.dart';
import 'package:maze_cli_escape/theme.dart';

// Runs the break-mode sub-loop for a discovered key.
// Returns true if the key was collected, false if the user backed out.
bool runBreakMode(MazeKey key, MazeSession session) {
  _printBreakModeHeader(key);

  while (true) {
    _printBreakModeOptions(key);
    stdout.write('${Theme.green}> ${Theme.reset}');
    final input = stdin.readLineSync()?.trim() ?? '';

    switch (input.toLowerCase()) {
      case '1':
        if (_breakWithCypher(key, session)) return true;
      case '2':
        if (_breakWithPath(key, session))   return true;
      case '3':
        _breakWithForfeit(key, session);
        return true;
      case 'back':
        stdout.writeln('${Theme.dim}  You step away from the key…${Theme.reset}\n');
        return false;
      default:
        stdout.writeln('${Theme.red}  Choose 1, 2, 3, or type back.${Theme.reset}\n');
    }
  }
}

void _printBreakModeHeader(MazeKey key) {
  final typeColor = switch (key.type) {
    KeyType.easy   => Theme.green,
    KeyType.medium => Theme.yellow,
    KeyType.hard   => Theme.red,
  };
  final typeLabel = key.type.name.toUpperCase();

  stdout.writeln('');
  stdout.writeln('  $typeColor${Theme.bold}┌─────────────────────────────┐${Theme.reset}');
  stdout.writeln('  $typeColor${Theme.bold}│  🔑  ${key.fileName.padRight(23)}│${Theme.reset}');
  stdout.writeln('  $typeColor      Type : $typeLabel${' ' * (22 - typeLabel.length)}${Theme.reset}');
  stdout.writeln('  $typeColor${Theme.bold}└─────────────────────────────┘${Theme.reset}');
  stdout.writeln('');
  stdout.writeln('  You found a key. How do you break it?');
  stdout.writeln('');
}

void _printBreakModeOptions(MazeKey key) {
  final forfeitCost = key.maxTimeLost;
  final wrongCost   = 1 * (key.type.index + 1);

  stdout.writeln('  ${Theme.yellow}[1]${Theme.reset}  Enter the cypher word');
  stdout.writeln('  ${Theme.yellow}[2]${Theme.reset}  "Where are you?" — type the exact path  '
      '(${Theme.dim}-${forfeitCost ~/ 2}s if correct, -${wrongCost}s if wrong${Theme.reset})');
  stdout.writeln('  ${Theme.yellow}[3]${Theme.reset}  Take your time  ${Theme.dim}(-${forfeitCost}s)${Theme.reset}');
  stdout.writeln('  ${Theme.dim}[back]${Theme.reset} leave the key for now');
  stdout.writeln('');
}

// Option 1 — enter the cypher word.
// Returns true (collected) on match, loops back to options on failure.
bool _breakWithCypher(MazeKey key, MazeSession session) {
  stdout.write('  Cypher word: ');
  final input = stdin.readLineSync()?.trim().toLowerCase() ?? '';

  if (input == key.cypherWord.toLowerCase()) {
    stdout.writeln('\n  ${Theme.green}${Theme.bold}  ✓ Correct! Key collected.${Theme.reset}\n');
    session.collectedKeys.add(key);
    return true;
  }

  stdout.writeln('\n  ${Theme.red}  ✗ Wrong cypher. The lock holds.${Theme.reset}\n');
  return false;
}

// Option 2 — type the exact absolute path of the room where the key is.
// Correct: timer -= maxTimeLost / 2.  Wrong: timer -= 1 × type multiplier.
bool _breakWithPath(MazeKey key, MazeSession session) {
  stdout.write('  Path: ');
  final input = stdin.readLineSync()?.trim() ?? '';

  // Normalise both sides: lowercase, strip trailing slash.
  final given    = input.toLowerCase().replaceAll(RegExp(r'/$'), '');
  final expected = key.locationPath.toLowerCase().replaceAll(RegExp(r'/$'), '');

  if (given == expected) {
    final cost = key.maxTimeLost ~/ 2;
    session.penaltySeconds += cost;
    stdout.writeln('\n  ${Theme.green}${Theme.bold}  ✓ Correct path! Key collected.${Theme.reset}  '
        '${Theme.yellow}  −${cost}s penalty  │  total penalties: ${session.penaltySeconds}s${Theme.reset}\n');
    session.collectedKeys.add(key);
    return true;
  }

  final cost = 1 * (key.type.index + 1);
  session.penaltySeconds += cost;
  stdout.writeln('\n  ${Theme.red}  ✗ Wrong path. The maze echoes back.${Theme.reset}  '
      '${Theme.yellow}  −${cost}s penalty  │  total penalties: ${session.penaltySeconds}s${Theme.reset}\n');
  return false;
}

// Option 3 — brute force: always succeeds, costs maxTimeLost seconds.
void _breakWithForfeit(MazeKey key, MazeSession session) {
  session.penaltySeconds += key.maxTimeLost;
  stdout.writeln('\n  ${Theme.yellow}  You force the lock… it yields.${Theme.reset}  '
      '${Theme.yellow}  −${key.maxTimeLost}s penalty  │  total penalties: ${session.penaltySeconds}s${Theme.reset}\n');
  session.collectedKeys.add(key);
}
