// ─── GAME LOOP ────────────────────────────────────────────────────────────────

import 'dart:io';
import 'package:maze_cli_escape/commands.dart';
import 'package:maze_cli_escape/input_reader.dart';
import 'package:maze_cli_escape/models.dart';
import 'package:maze_cli_escape/screens.dart';
import 'package:maze_cli_escape/theme.dart';

void runGameLoop(MazeSession session) {
  clearScreen();
  stdout.writeln('\n${Theme.cyan}${Theme.bold}  Session ${session.id} started.${Theme.reset}'
      '  Find ${session.allKeys.length} keys in ${session.duration.inMinutes} min.'
      '  (type help)\n');

  final reader = InputReader();

  while (!session.timedOut) {
    // Win check — all keys collected.
    if (session.collectedKeys.length == session.allKeys.length) {
      session.isOver = true;
      session.isWon  = true;
      break;
    }

    printPrompt(session);
    final input = reader.readLine();
    if (input.isEmpty) continue;

    final keepRunning = processCommand(input, session);
    if (!keepRunning) break;

    stdout.writeln();
  }

  // Mark timed-out sessions as over (isWon stays false).
  if (session.timedOut) session.isOver = true;

  if (session.isOver) showEndScreen(session);
}
