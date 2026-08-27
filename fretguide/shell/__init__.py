"""The native PySide6 shell (docs/PLAN-shell.md).

Importing this package must not import Qt. ``layout`` and ``shaders`` are deliberately
Qt-free so the parts that can be reasoned about numerically -- letterbox arithmetic, the
colour matrix -- stay testable in CI, which installs the [dev] extra and not [gui].
``video`` and ``app`` do import Qt, and are imported only by the shell itself.
"""
