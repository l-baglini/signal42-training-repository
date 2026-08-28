#!/usr/bin/env python3
"""Package everything needed to train on the Windows / NVIDIA box into one zip.

    python tools/make_bundle.py
    python tools/make_bundle.py --out /media/usb/fretguide-train.zip

A script rather than a one-off `zip` command so it can be re-run after labelling more
frames, and so the contents are verified rather than assumed. Before writing anything it:

  - imports the training modules and checks they only depend on what the bundle ships
  - loads the dataset and refuses to build a bundle whose labels do not parse
  - checks every file the Windows scripts reference actually exists

The last one is the point. A bundle that unzips and then fails on the target machine
because of one missing file costs a round trip to another computer to discover.
"""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

#: Directories copied wholesale, minus the exclusions below.
TREES = ["fretguide", "tests", "docs"]

#: Individual files. tools/ is filtered because collect.py and run_app.py need a camera
#: and OpenVINO, neither of which the training box has or wants.
FILES = [
    "tools/train.py",
    "tools/export.py",
    "tools/preview_aug.py",
    "conftest.py",
]

#: Windows launcher scripts, flattened to the zip root so they are visible on unzip.
WINDOWS = ["setup.bat", "verify.bat", "train.bat", "resume.bat",
           "requirements-train.txt", "README.md"]

EXCLUDE_SUFFIX = {".pyc", ".pyo"}
EXCLUDE_DIRS = {"__pycache__", ".pytest_cache", "research", "sim"}

#: Written with Windows line endings, so cmd.exe and Notepad behave.
CRLF_SUFFIX = {".bat", ".md", ".txt"}


def check_imports() -> None:
    """Fail here rather than on the other machine."""
    import fretguide.dataset  # noqa: F401
    import fretguide.geometry  # noqa: F401
    import fretguide.model  # noqa: F401  (needs torch, which the bundle installs)
    print("  imports              ok")


def check_dataset(frames_dir: Path, labels: Path) -> int:
    from fretguide.dataset import load_dataset, split_by_capture_order

    frames = load_dataset(frames_dir, labels)
    if len(frames) < 20:
        raise SystemExit(f"only {len(frames)} usable labelled frames; nothing worth training on")
    missing = [f.path for f in frames if not f.path.exists()]
    if missing:
        raise SystemExit(f"{len(missing)} labelled frames are missing from disk, e.g. {missing[0]}")
    train, val = split_by_capture_order(frames)
    print(f"  dataset              {len(frames)} frames -> train {len(train)}, val {len(val)}")
    return len(frames)


def walk(base: Path):
    for p in sorted(base.rglob("*")):
        if not p.is_file():
            continue
        if p.suffix in EXCLUDE_SUFFIX:
            continue
        if EXCLUDE_DIRS & set(p.relative_to(base).parts):
            continue
        yield p


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="fretguide-train-windows.zip")
    ap.add_argument("--frames", default="dataset/frames")
    ap.add_argument("--labels", default="dataset/labels.json")
    ap.add_argument("--no-frames", action="store_true",
                    help="omit the captured frames (code-only bundle, a few hundred KB)")
    ap.add_argument("--prefix", default="fretguide-train",
                    help="top-level folder inside the zip; '' for none")
    args = ap.parse_args()

    frames_dir = ROOT / args.frames
    labels = ROOT / args.labels
    win_dir = ROOT / "packaging" / "windows"

    print("checking the bundle before building it")
    check_imports()
    n_frames = check_dataset(frames_dir, labels)

    for name in WINDOWS:
        if not (win_dir / name).exists():
            raise SystemExit(f"missing launcher script: {win_dir / name}")
    for rel in FILES:
        if not (ROOT / rel).exists():
            raise SystemExit(f"missing file: {rel}")
    print(f"  launcher scripts     ok ({len(WINDOWS)})")

    members: list[tuple[Path, str]] = []
    for name in WINDOWS:
        members.append((win_dir / name, name))
    for rel in FILES:
        members.append((ROOT / rel, rel))
    for tree in TREES:
        base = ROOT / tree
        if base.exists():
            members += [(p, str(p.relative_to(ROOT))) for p in walk(base)]
    members.append((labels, "dataset/labels.json"))
    if not args.no_frames:
        members += [(p, f"dataset/frames/{p.name}") for p in sorted(frames_dir.glob("*.png"))]

    # Cross-check: every module the training entry points import must be in the bundle.
    packed = {arc for _, arc in members}
    for need in ("fretguide/dataset.py", "fretguide/model.py", "fretguide/geometry.py",
                 "fretguide/types.py", "tools/train.py", "dataset/labels.json"):
        if need not in packed:
            raise SystemExit(f"bundle would be missing {need}")

    out = Path(args.out)
    raw = sum(p.stat().st_size for p, _ in members)
    prefix = args.prefix.strip("/")
    print(f"\nwriting {out}  ({len(members)} files, {raw/1e6:.0f} MB raw)")
    n_crlf = 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for src, arc in members:
            name = f"{prefix}/{arc}" if prefix else arc
            if src.suffix in CRLF_SUFFIX:
                # cmd.exe can mis-parse a .bat with bare LF endings -- labels and goto are
                # the usual casualties, and the symptom is a script that silently does
                # nothing. Normalise on the way in rather than hoping git or the unzip
                # tool does it. .md and .txt get the same treatment so Notepad is happy.
                text = src.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
                z.writestr(name, text)
                n_crlf += 1
            else:
                z.write(src, name)
        z.writestr(f"{prefix}/bundle-info.json" if prefix else "bundle-info.json",
                   json.dumps({
                       "frames": n_frames,
                       "files": len(members),
                       "note": "Regenerate with tools/make_bundle.py after labelling more frames.",
                   }, indent=1))
    print(f"  {n_crlf} text files written with CRLF line endings")

    size = out.stat().st_size
    print(f"done: {out}  {size/1e6:.0f} MB  (compressed {100*size/raw:.0f}% of raw)")
    print("\nOn the Windows box: unzip, then setup.bat -> verify.bat -> train.bat")
    print("Bring models\\best.pt back here and run tools/export.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
