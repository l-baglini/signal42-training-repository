// ─── SCREENS ─────────────────────────────────────────────────────────────────

import 'dart:io';
import 'package:maze_cli_escape/models.dart';
import 'package:maze_cli_escape/theme.dart';

void clearScreen() => stdout.write('\x1B[2J\x1B[H');

String showStartMenu({bool hasSave = false}) {
  clearScreen();

  stdout.writeln('${Theme.cyan}${Theme.bold}${Theme.logo}${Theme.reset}');
  stdout.writeln('${Theme.dim}  A procedural CLI dungeon. Find all the keys before the maze locks.${Theme.reset}');
  stdout.writeln();

  final options = <String, String>{
    'n': 'New game',
    if (hasSave) 'l': 'Load saved session',
    'x': 'Exit',
  };

  for (final entry in options.entries) {
    stdout.writeln('  ${Theme.yellow}[${entry.key}]${Theme.reset}  ${entry.value}');
  }

  stdout.writeln();

  while (true) {
    stdout.write('${Theme.green}> ${Theme.reset}');
    final raw = stdin.readLineSync()?.trim().toLowerCase() ?? '';

    switch (raw) {
      case 'n':
      case 'new':
        return 'new';
      case 'l':
      case 'load':
        if (hasSave) return 'load';
      case 'x':
      case 'exit':
        return 'exit';
    }

    stdout.writeln('${Theme.red}  Unknown option.${Theme.reset}  Type ${options.keys.join(', ')}.');
  }
}

// Timer bar: 20 filled blocks that drain left-to-right as time runs out.
// Colour shifts cyan → yellow → red in the last third.
String timerBar(int remainSecs, int totalSecs) {
  const barWidth = 20;
  final ratio    = (remainSecs / totalSecs).clamp(0.0, 1.0);
  final filled   = (ratio * barWidth).round();
  final empty    = barWidth - filled;

  final barColor = remainSecs < totalSecs ~/ 6
      ? Theme.red
      : remainSecs < totalSecs ~/ 3
          ? Theme.yellow
          : Theme.cyan;

  final bar = '$barColor${'█' * filled}${Theme.dim}${'░' * empty}${Theme.reset}';
  return '[$bar$barColor]${Theme.reset}';
}

void printPrompt(MazeSession session) {
  final totalSecs  = session.duration.inSeconds;
  final secs       = session.remaining.inSeconds.clamp(0, totalSecs);
  final mins       = secs ~/ 60;
  final ss         = (secs % 60).toString().padLeft(2, '0');
  final timerColor = secs < totalSecs ~/ 6
      ? Theme.red
      : secs < totalSecs ~/ 3
          ? Theme.yellow
          : Theme.cyan;
  final collected  = session.collectedKeys.length;
  final total      = session.allKeys.length;
  final bar        = timerBar(secs, totalSecs);

  // Line 1: bar + clock + path + key count
  stdout.writeln(
    '$timerColor${Theme.bold} ⏱  $mins:$ss${Theme.reset}  $bar'
    '  ${Theme.dim}${session.pwd}${Theme.reset}'
    '  ${Theme.yellow}🔑 $collected/$total${Theme.reset}',
  );
  // The raw-mode InputReader in game_loop.dart prints its own '$ ' prompt
  // so it can redraw the line in-place. We only emit it here as a fallback
  // when stdin is not a terminal (pipes, tests).
  if (!stdin.hasTerminal) stdout.write('\$ ');
}

void showEndScreen(MazeSession session) {
  clearScreen();

  if (session.isWon) {
    stdout.writeln('${Theme.green}${Theme.bold}${Theme.winArt}${Theme.reset}');
    stdout.writeln('  ${Theme.green}${Theme.bold}  The dungeon bows. You are free.${Theme.reset}\n');
  } else {
    stdout.writeln('${Theme.red}${Theme.bold}${Theme.loseArt}${Theme.reset}');
    stdout.writeln('  ${Theme.red}${Theme.bold}  The maze seals shut. You are trapped.${Theme.reset}\n');
  }

  // Key recap — always show all keys with collected / missed status.
  stdout.writeln('  ${Theme.bold}─────────────  K E Y S  ─────────────${Theme.reset}\n');

  for (final key in session.allKeys) {
    final wasCollected = session.collectedKeys.any((k) => k.id == key.id);
    final typeLabel    = key.type.name.toUpperCase();
    final typeColor    = switch (key.type) {
      KeyType.easy   => Theme.green,
      KeyType.medium => Theme.yellow,
      KeyType.hard   => Theme.red,
    };

    if (wasCollected) {
      stdout.writeln('  ${Theme.green}✓${Theme.reset}  ${key.fileName.padRight(14)} '
          '$typeColor[$typeLabel]${Theme.reset}  ${Theme.green} collected${Theme.reset}');
    } else {
      stdout.writeln('  ${Theme.red}✗${Theme.reset}  ${key.fileName.padRight(14)} '
          '$typeColor[$typeLabel]${Theme.reset}  ${Theme.dim} missed${Theme.reset}');
    }
  }

  final total     = session.allKeys.length;
  final collected = session.collectedKeys.length;
  final penalty   = session.penaltySeconds;

  stdout.writeln('');
  stdout.writeln('  ${Theme.dim}─────────────────────────────────────${Theme.reset}');
  stdout.writeln('  Keys collected : ${Theme.bold}$collected / $total${Theme.reset}');
  stdout.writeln('  Time penalties : ${Theme.bold}-${penalty}s${Theme.reset}');
  stdout.writeln('');
  stdout.write('  Press Enter to return to the main menu…');
  stdin.readLineSync();
}
