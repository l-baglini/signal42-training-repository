// ─── RAW-MODE LINE READER ────────────────────────────────────────────────────
//
// Reads a single line from stdin in raw mode so we can intercept arrow keys,
// backspace, and other control sequences before the terminal echoes them.
// Supports:
//   ← / →        move cursor within the line
//   ↑ / ↓        scroll through command history
//   Backspace    delete character left of cursor
//   Delete       delete character right of cursor (CSI 3~)
//   Home / End   jump to start / end of line (CSI 1~ / 4~ and CSI H / F)
//   Ctrl-C / Ctrl-D   treated as empty input (returns '')
//   Enter        commit the line

import 'dart:io';

class InputReader {
  final _history  = <String>[];
  int _historyIdx = -1; // -1 = current (not yet in history)

  // Read one line, handling arrow keys and history. Returns the committed line.
  String readLine() {
    if (!stdin.hasTerminal) {
      return stdin.readLineSync() ?? '';
    }

    stdin.echoMode = false;
    stdin.lineMode = false;

    // Show the prompt immediately so the user knows input is expected.
    stdout.write('\$ ');

    final buffer = <int>[]; // codeUnits of the current line
    var   cursor = 0;       // insertion position in buffer
    String savedDraft = ''; // draft preserved when scrolling history

    try {
      while (true) {
        final b = _readByte();
        if (b == null) break; // EOF

        if (b == 0x0D || b == 0x0A) {
          // Enter — commit
          stdout.write('\r\n');
          break;
        }

        if (b == 0x03 || b == 0x04) {
          // Ctrl-C / Ctrl-D — cancel
          stdout.write('\r\n');
          buffer.clear();
          break;
        }

        if (b == 0x7F || b == 0x08) {
          // Backspace / Ctrl-H
          if (cursor > 0) {
            buffer.removeAt(cursor - 1);
            cursor--;
            _redraw(buffer, cursor);
          }
          continue;
        }

        if (b == 0x1B) {
          // Escape sequence — read ahead
          final seq = _readEscapeSequence();
          switch (seq) {
            case '[A': // ↑ — older history
              if (_historyIdx == -1) savedDraft = String.fromCharCodes(buffer);
              if (_historyIdx < _history.length - 1) {
                _historyIdx++;
                final line = _history[_history.length - 1 - _historyIdx];
                buffer
                  ..clear()
                  ..addAll(line.codeUnits);
                cursor = buffer.length;
                _redraw(buffer, cursor);
              }

            case '[B': // ↓ — newer history / back to draft
              if (_historyIdx > 0) {
                _historyIdx--;
                final line = _history[_history.length - 1 - _historyIdx];
                buffer
                  ..clear()
                  ..addAll(line.codeUnits);
                cursor = buffer.length;
                _redraw(buffer, cursor);
              } else if (_historyIdx == 0) {
                _historyIdx = -1;
                buffer
                  ..clear()
                  ..addAll(savedDraft.codeUnits);
                cursor = buffer.length;
                _redraw(buffer, cursor);
              }

            case '[C': // →
              if (cursor < buffer.length) {
                cursor++;
                _redraw(buffer, cursor);
              }

            case '[D': // ←
              if (cursor > 0) {
                cursor--;
                _redraw(buffer, cursor);
              }

            case '[H' || 'OH' || '[1~': // Home
              cursor = 0;
              _redraw(buffer, cursor);

            case '[F' || 'OF' || '[4~': // End
              cursor = buffer.length;
              _redraw(buffer, cursor);

            case '[3~': // Delete
              if (cursor < buffer.length) {
                buffer.removeAt(cursor);
                _redraw(buffer, cursor);
              }
          }
          continue;
        }

        // Printable ASCII (0x20–0x7E) and high-byte UTF-8 continuation bytes.
        if (b >= 0x20) {
          buffer.insert(cursor, b);
          cursor++;
          _redraw(buffer, cursor);
        }
      }
    } finally {
      stdin.echoMode = true;
      stdin.lineMode = true;
    }

    final line = String.fromCharCodes(buffer).trim();

    if (line.isNotEmpty) {
      // Don't push duplicates of the most-recent entry.
      if (_history.isEmpty || _history.last != line) {
        _history.add(line);
      }
      _historyIdx = -1;
    }

    return line;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  int? _readByte() {
    try {
      final bytes = stdin.readByteSync();
      return bytes == -1 ? null : bytes;
    } catch (_) {
      return null;
    }
  }

  // Read the rest of an escape sequence after the leading ESC byte.
  // Returns e.g. '[A', '[3~', 'OH'.
  String _readEscapeSequence() {
    final buf = StringBuffer();
    final first = _readByte();
    if (first == null) return '';
    buf.writeCharCode(first);

    if (first == 0x5B || first == 0x4F) {
      // CSI [ ... or SS3 O ...  — keep reading until a letter or tilde
      while (true) {
        final b = _readByte();
        if (b == null) break;
        buf.writeCharCode(b);
        if ((b >= 0x40 && b <= 0x7E)) break; // terminator
      }
    }
    return buf.toString();
  }

  // Rewrite the current input line in-place using ANSI cursor controls.
  void _redraw(List<int> buffer, int cursor) {
    final line = String.fromCharCodes(buffer);
    // \r moves to column 0; then overwrite and erase to EOL.
    stdout.write('\r\x1B[K\$ $line');
    // Reposition cursor if not at the end.
    if (cursor < buffer.length) {
      final back = buffer.length - cursor;
      stdout.write('\x1B[${back}D');
    }
  }
}
