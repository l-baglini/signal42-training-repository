// ─── SESSION FACTORY ─────────────────────────────────────────────────────────
// Isolated from game logic so procedural generation can replace createMockSession()
// without touching any other module.

import 'package:maze_cli_escape/models.dart';

// Cypher words are thematically related to the key name but never equal to it.
MazeSession createMockSession() {
  final keys = [
    MazeKey(
      id: 'k1',
      fileName: 'ember.key',
      type: KeyType.easy,
      cypherWord: 'flame',          // ember → flame
      locationPath: '/hallway',
    ),
    MazeKey(
      id: 'k2',
      fileName: 'shadow.key',
      type: KeyType.medium,
      cypherWord: 'ninja',          // shadow → ninja
      locationPath: '/crypt',
    ),
    MazeKey(
      id: 'k3',
      fileName: 'abyss.key',
      type: KeyType.hard,
      cypherWord: 'shark',          // abyss → shark
      locationPath: '/crypt/vault',
    ),
  ];

  final vault   = FsNode.directory('vault',   [FsNode.keyFile(keys[2])]);
  final crypt   = FsNode.directory('crypt',   [FsNode.keyFile(keys[1]), vault]);
  final hallway = FsNode.directory('hallway', [FsNode.keyFile(keys[0])]);
  final foyer   = FsNode.directory('foyer',   []);
  final root    = FsNode.directory('dungeon', [hallway, crypt, foyer]);

  return MazeSession(
    id: 'mock-001',
    root: root,
    allKeys: keys,
    duration: const Duration(minutes: 3),
  );
}
