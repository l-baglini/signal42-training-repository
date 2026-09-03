// ─── COMMAND PROCESSOR ───────────────────────────────────────────────────────

import 'dart:io';
import 'package:maze_cli_escape/break_mode.dart';
import 'package:maze_cli_escape/models.dart';
import 'package:maze_cli_escape/theme.dart';

// Strip ANSI escape sequences and non-printable characters (tabs, DEL, arrow keys, etc.)
// that can slip in when the user presses Tab, Delete, or arrow keys in raw terminal mode.
// Removes ANSI/VT escape sequences emitted by arrow keys, Tab, Delete, etc.
// Order matters: strip bracketed CSI sequences first (covers cursor-movement
// sequences like ESC[1;5D that carry numeric params), then SS3, then bare
// ESC+one-char pairs, then remaining non-printable control bytes.
// The cursor-position variant ESC[<row>;<col>H is covered by the CSI pattern.
String _sanitizeInput(String raw) => raw
    .replaceAll(RegExp(r'\x1B\[[0-9;]*[A-Za-z~]'), '') // CSI: ESC [ … letter/tilde (arrows, cursor move, Del)
    .replaceAll(RegExp(r'\x1BO[A-Za-z]'), '')           // SS3: ESC O letter (F-keys, numpad arrows)
    .replaceAll(RegExp(r'\x1B[^\x1B]'), '')             // other ESC+one-char sequences
    .replaceAll(RegExp(r'[\x00-\x08\x0B-\x1F\x7F]'), '') // non-printable except \n/\r
    .replaceAll('\t', '')                                // tab (attempted autocomplete)
    .trim();

// Dispatches one input line. Returns true while the session should keep running.
bool processCommand(String input, MazeSession session) {
  final sanitized = _sanitizeInput(input);
  if (sanitized.isEmpty) return true;
  final parts = sanitized.split(RegExp(r'\s+'));
  final cmd   = parts[0].toLowerCase();
  final arg   = parts.length > 1 ? parts[1] : '';

  // Typing a key filename directly triggers break mode for that key.
  final keyNode = session.currentDir.children
      .where((n) => !n.isDirectory && n.name == cmd)
      .firstOrNull;

  if (keyNode != null && keyNode.key != null) {
    final key = keyNode.key!;
    if (session.collectedKeys.any((k) => k.id == key.id)) {
      stdout.writeln('${Theme.dim}  Already collected.${Theme.reset}');
    } else {
      runBreakMode(key, session);
    }
    return true;
  }

  switch (cmd) {
    case 'ls':
      _cmdLs(session);
    case 'pwd':
      _cmdPwd(session);
    case 'cd':
      _cmdCd(arg, session);
    case 'cat':
      _cmdCat(arg, session);
    case 'break':
      _cmdBreak(arg, session);
    case 'help':
      _cmdHelp();
    case 'exit':
    case 'quit':
      return false;
    default:
      stdout.writeln('${Theme.red}  Unknown command: $cmd${Theme.reset}  (type help)');
  }

  return true;
}

void _cmdLs(MazeSession session) {
  final children = session.currentDir.children;

  if (children.isEmpty) {
    stdout.writeln('${Theme.dim}  (empty room)${Theme.reset}');
    return;
  }

  for (final node in children) {
    if (node.isDirectory) {
      stdout.writeln('  ${Theme.cyan}${Theme.bold}${node.name}/${Theme.reset}');
    } else {
      final alreadyCollected = node.key != null &&
          session.collectedKeys.any((k) => k.id == node.key!.id);
      final icon  = alreadyCollected ? '✓' : '🔑';
      final color = alreadyCollected ? Theme.dim : Theme.yellow;
      stdout.writeln('  $color$icon  ${node.name}${Theme.reset}');
    }
  }
}

void _cmdPwd(MazeSession session) {
  stdout.writeln('  ${session.pwd}');
}

void _cmdCd(String target, MazeSession session) {
  if (target.isEmpty || target == '/') {
    session.currentPath
      ..clear()
      ..add(session.root);
    session.currentDir = session.root;
    return;
  }

  if (target == '..') {
    if (session.currentPath.length <= 1) {
      stdout.writeln('${Theme.dim}  Already at root.${Theme.reset}');
      return;
    }
    session.currentPath.removeLast();
    session.currentDir = session.currentPath.last;
    return;
  }

  final match = session.currentDir.children
      .where((n) => n.isDirectory && n.name == target)
      .firstOrNull;

  if (match == null) {
    stdout.writeln('${Theme.red}  No such directory: $target${Theme.reset}');
    return;
  }

  session.currentPath.add(match);
  session.currentDir = match;
}

// cat shows the key card but does NOT trigger break mode — type the filename for that.
void _cmdCat(String filename, MazeSession session) {
  if (filename.isEmpty) {
    stdout.writeln('${Theme.red}  Usage: cat <filename>${Theme.reset}');
    return;
  }

  final node = session.currentDir.children
      .where((n) => !n.isDirectory && n.name == filename)
      .firstOrNull;

  if (node == null) {
    stdout.writeln('${Theme.red}  No such file: $filename${Theme.reset}');
    return;
  }

  final key       = node.key!;
  final typeLabel = key.type.name.toUpperCase();
  final collected = session.collectedKeys.any((k) => k.id == key.id);

  stdout.writeln('');
  stdout.writeln('  ${Theme.yellow}${Theme.bold}╔══════════════════════╗${Theme.reset}');
  stdout.writeln('  ${Theme.yellow}${Theme.bold}║  🔑  ${key.fileName.padRight(16)}║${Theme.reset}');
  stdout.writeln('  ${Theme.yellow}      Type    : $typeLabel${Theme.reset}');
  stdout.writeln('  ${Theme.yellow}      Cypher  : ██████████${Theme.reset}');
  stdout.writeln('  ${Theme.yellow}      Status  : ${collected ? "COLLECTED" : "LOCKED"}${Theme.reset}');
  stdout.writeln('  ${Theme.yellow}${Theme.bold}╚══════════════════════╝${Theme.reset}');
  stdout.writeln('');
  if (!collected) {
    stdout.writeln('${Theme.dim}  Type "${key.fileName}" or "break ${key.fileName}" to enter break mode.${Theme.reset}');
  }
}

// `break <filename>` — explicit break-mode trigger; useful when Tab or typos
// make typing the bare filename error-prone.
void _cmdBreak(String filename, MazeSession session) {
  if (filename.isEmpty) {
    // No argument: list breakable keys in the room as a hint.
    final available = session.currentDir.children
        .where((n) => !n.isDirectory && n.key != null &&
            !session.collectedKeys.any((k) => k.id == n.key!.id))
        .toList();

    if (available.isEmpty) {
      stdout.writeln('${Theme.dim}  No keys to break here.${Theme.reset}');
    } else {
      stdout.writeln('${Theme.dim}  Keys here: ${available.map((n) => n.name).join(', ')}${Theme.reset}');
      stdout.writeln('${Theme.dim}  Usage: break <filename>${Theme.reset}');
    }
    return;
  }

  final node = session.currentDir.children
      .where((n) => !n.isDirectory && n.name == filename)
      .firstOrNull;

  if (node == null || node.key == null) {
    stdout.writeln('${Theme.red}  No key named "$filename" in this room.${Theme.reset}');
    return;
  }

  final key = node.key!;
  if (session.collectedKeys.any((k) => k.id == key.id)) {
    stdout.writeln('${Theme.dim}  Already collected.${Theme.reset}');
    return;
  }

  runBreakMode(key, session);
}

void _cmdHelp() {
  stdout.writeln('');
  stdout.writeln('  ${Theme.bold}Navigation${Theme.reset}');
  stdout.writeln('  ${Theme.cyan}ls${Theme.reset}                  list current room');
  stdout.writeln('  ${Theme.cyan}pwd${Theme.reset}                 show current path');
  stdout.writeln('  ${Theme.cyan}cd <room>${Theme.reset}           enter a room');
  stdout.writeln('  ${Theme.cyan}cd ..${Theme.reset}               go back one level');
  stdout.writeln('  ${Theme.cyan}cd /${Theme.reset}                go to dungeon root');
  stdout.writeln('  ${Theme.cyan}cat <file>${Theme.reset}          inspect a key file');
  stdout.writeln('  ${Theme.cyan}<key-name>${Theme.reset}          trigger break mode (type filename directly)');
  stdout.writeln('  ${Theme.cyan}break <key-name>${Theme.reset}    trigger break mode explicitly');
  stdout.writeln('');
  stdout.writeln('  ${Theme.bold}Session${Theme.reset}');
  stdout.writeln('  ${Theme.cyan}exit${Theme.reset}                quit the game');
  stdout.writeln('');
}
