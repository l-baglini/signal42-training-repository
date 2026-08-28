// ─── MODELS ──────────────────────────────────────────────────────────────────

enum KeyType {
  easy,   // maxTimeLost: 10 s  — wrong-path multiplier: ×1
  medium, // maxTimeLost: 20 s  — wrong-path multiplier: ×2
  hard,   // maxTimeLost: 30 s  — wrong-path multiplier: ×3
}

// Returns the max seconds lost when forfeiting a key of this type.
// Also used to derive wrong-path penalty: multiplier = type.index + 1.
int maxTimeLostFor(KeyType t) => switch (t) {
  KeyType.easy   => 10,
  KeyType.medium => 20,
  KeyType.hard   => 30,
};

class MazeKey {
  final String id;
  final String fileName;   // shown by `ls`, triggers break mode when typed
  final KeyType type;
  final String cypherWord; // NOT the key name — a thematically related word
  // Absolute path of the directory that contains this key (set when building the tree).
  final String locationPath;

  const MazeKey({
    required this.id,
    required this.fileName,
    required this.type,
    required this.cypherWord,
    required this.locationPath,
  });

  int get maxTimeLost => maxTimeLostFor(type);
}

class FsNode {
  final String name;
  final bool isDirectory;
  final MazeKey? key;
  final List<FsNode> children;

  FsNode.directory(this.name, this.children)
      : isDirectory = true,
        key = null;

  FsNode.keyFile(MazeKey k)
      : name = k.fileName,
        isDirectory = false,
        key = k,
        children = const [];
}

class MazeSession {
  final String id;
  final FsNode root;
  final List<MazeKey> allKeys;

  FsNode currentDir;
  // Stack of visited nodes; [0] = root, .last = currentDir.
  final List<FsNode> currentPath;

  final List<MazeKey> collectedKeys = [];
  final DateTime startedAt;
  final Duration duration;
  // Accumulated penalty seconds from break-mode outcomes.
  int penaltySeconds = 0;

  bool isOver = false;
  bool isWon  = false;

  MazeSession({
    required this.id,
    required this.root,
    required this.allKeys,
    required this.duration,
  })  : currentDir = root,
        currentPath = [root],
        startedAt = DateTime.now();

  Duration get elapsed   => DateTime.now().difference(startedAt);
  Duration get remaining => duration - elapsed - Duration(seconds: penaltySeconds);
  bool get timedOut      => remaining.isNegative;

  String get pwd => '/${currentPath.skip(1).map((n) => n.name).join('/')}';
}
