import 'dart:io';
import 'package:maze_cli_escape/game_loop.dart';
import 'package:maze_cli_escape/screens.dart';
import 'package:maze_cli_escape/session_factory.dart';
import 'package:maze_cli_escape/theme.dart';

void main() {

  while (true) {
    final action = showStartMenu(hasSave: false);

    switch (action) {
      case 'new':
        final session = createMockSession();
        runGameLoop(session);
      case 'load':
        stdout.writeln('\n${Theme.cyan}  Loading session…${Theme.reset}');
        // TODO: deserialise session from disk
      case 'exit':
        stdout.writeln('\n${Theme.dim}  Farewell, explorer.${Theme.reset}\n');
        exit(0);
    }
    // After any finished session, loop back to the start menu.
  }
}
