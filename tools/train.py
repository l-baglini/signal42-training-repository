#!/usr/bin/env python3
"""Train the fretboard keypoint model.

    python tools/train.py                      # defaults: 285 frames, ~120 epochs
    python tools/train.py --epochs 300 --device cuda      # on the 4060 laptop
    python tools/train.py --limit 8 --epochs 2            # smoke test, seconds

Reports the only metric that matters: dot placement error in FRET-WIDTHS, budget 0.25
(docs/research/00-diagnosis.md). Heatmap loss is shown too, but loss going down while
the fret error stays flat is the failure mode to watch for, which is exactly why both
are printed.

TWO validation numbers, deliberately:

  val_still  un-augmented held-out frames. Flattering, because every captured frame
             has the board at roughly the same place, angle and distance -- so this
             mostly measures "did it memorise this one pose".
  val_aug    the same frames under deterministic random warps. This is the number to
             trust, because it is the one that answers the actual question: does the
             overlay still land when the guitar moves?

Validation frames are the LAST 20% in capture order, never a random sample: 211 of 284
consecutive pairs in the real set move the board under 15 px, so random splitting would
put a near-identical twin of every val frame into training.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root, so `fretguide` imports

import torch
from torch.utils.data import DataLoader, Dataset

from fretguide.dataset import (
    DEFAULT_MAX_FRET,
    INPUT_H,
    INPUT_W,
    STRIDE,
    AugConfig,
    LabelledFrame,
    canonical_uv,
    decode_heatmaps,
    fret_width_error,
    homography_from_keypoints,
    letterbox_matrix,
    load_dataset,
    make_sample,
    n_keypoints,
    split_by_capture_order,
)
from fretguide.geometry import apply_homography
from fretguide.model import FretNet, heatmap_loss


class FretDataset(Dataset):
    """Labelled frames + augmentation.

    Frames are cached in RAM at ``cache_scale`` of full resolution (0.5 by default,
    downsampled once with INTER_AREA so the antialiasing is done properly). The warp
    into the 640x384 input then works from 960x540, which is within about 1x of the
    final scale for the whole augmentation range -- so no aliasing, and 4x less warping
    work per sample than going from 1920x1080 every time.
    """

    def __init__(
        self,
        frames: list[LabelledFrame],
        cfg: AugConfig,
        max_fret: int = DEFAULT_MAX_FRET,
        sigma: float = 1.5,
        cache_scale: float = 0.5,
        seed: int | None = None,
        repeats: int = 1,
    ):
        self.frames = frames
        self.cfg = cfg
        self.max_fret = max_fret
        self.sigma = sigma
        self.cache_scale = cache_scale
        self.seed = seed  # None -> fresh randomness each epoch; int -> reproducible
        self.repeats = max(1, repeats)
        self.epoch = 0
        self._cache: dict[int, tuple[np.ndarray, np.ndarray]] = {}

    def __len__(self) -> int:
        return len(self.frames) * self.repeats

    def _load(self, i: int) -> tuple[np.ndarray, np.ndarray]:
        hit = self._cache.get(i)
        if hit is not None:
            return hit
        f = self.frames[i]
        gray = cv2.imread(str(f.path), cv2.IMREAD_GRAYSCALE)
        if gray is None:
            raise FileNotFoundError(f.path)
        s = self.cache_scale
        if s != 1.0:
            gray = cv2.resize(gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
            H = np.diag([s, s, 1.0]) @ f.H
        else:
            H = f.H
        self._cache[i] = (gray, H)
        return gray, H

    def __getitem__(self, k: int):
        i = k % len(self.frames)
        gray, H = self._load(i)
        if self.seed is None:
            rng = np.random.default_rng()
        else:
            rng = np.random.default_rng((self.seed, self.epoch, k))
        # A different frame supplies the background when compositing. Drawn from THIS split
        # only, so a validation sample never borrows pixels from a training frame.
        bg = bg_H = None
        if self.cfg.bg_replace_p > 0.0 and len(self.frames) > 1:
            j = int(rng.integers(0, len(self.frames) - 1))
            bg, bg_H = self._load(j + (j >= i))
        img, hm, H_in = make_sample(gray, H, rng, self.cfg, self.max_fret, self.sigma,
                                    bg, bg_H)
        return (
            torch.from_numpy(img[None].astype(np.float32) / 255.0),
            torch.from_numpy(hm),
            torch.from_numpy(H_in.astype(np.float32)),
        )


def evaluate(
    model, loader, device, max_fret: int, min_conf: float,
    train_centre: np.ndarray | None = None,
) -> dict[str, float]:
    """Decode -> fit pose -> report fret-width error and how often a pose was usable.

    ``train_centre`` enables the SHORTCUT CHECK. Given the mean board centre over the
    training frames, this also measures how far each prediction sits from the true board
    versus from that training average. A model that has learned to recognise the room
    rather than the guitar scores *closer to the training average* -- which is exactly what
    a 200-epoch run did (11 px to the training mean, 74 px to the truth) while its heatmap
    loss looked healthy. Loss and even fret error tell you something is wrong; this tells
    you what.
    """
    model.eval()
    losses, med_errs, p95_errs = [], [], []
    d_true, d_mean = [], []
    canon = canonical_uv(max_fret)
    n_posed = n_total = 0
    with torch.no_grad():
        for imgs, hms, Hs in loader:
            pred = model(imgs.to(device))
            losses.append(float(heatmap_loss(pred, hms.to(device)).item()))
            pred_np = pred.detach().cpu().numpy()
            for b in range(len(pred_np)):
                n_total += 1
                pts, conf = decode_heatmaps(pred_np[b], STRIDE)
                H_pred, _ = homography_from_keypoints(
                    pts, conf, max_fret=max_fret, min_conf=min_conf
                )
                if H_pred is None:
                    continue
                H_true = Hs[b].numpy().astype(np.float64)
                err = fret_width_error(H_pred, H_true, max_fret)
                if not np.isfinite(err).all():
                    continue
                n_posed += 1
                med_errs.append(float(np.median(err)))
                p95_errs.append(float(np.percentile(err, 95)))
                if train_centre is not None:
                    pc = apply_homography(H_pred, canon).mean(axis=0)
                    tc = apply_homography(H_true, canon).mean(axis=0)
                    if np.isfinite(pc).all():
                        d_true.append(float(np.linalg.norm(pc - tc)))
                        d_mean.append(float(np.linalg.norm(pc - train_centre)))
    out = {
        "loss": float(np.mean(losses)) if losses else float("nan"),
        # Median over frames of the per-frame median dot error, in fret-widths.
        "fret_med": float(np.median(med_errs)) if med_errs else float("inf"),
        "fret_p90": float(np.percentile(med_errs, 90)) if med_errs else float("inf"),
        "fret_worst_dot": float(np.median(p95_errs)) if p95_errs else float("inf"),
        "posed_frac": n_posed / max(1, n_total),
    }
    if d_true:
        out["px_to_true"] = float(np.median(d_true))
        out["px_to_train_mean"] = float(np.median(d_mean))
    return out


def montage(model, ds, device, out_path: Path, n: int = 6, max_fret: int = DEFAULT_MAX_FRET):
    """Draw predicted (green) vs labelled (red) fret wires, so failures are visible."""
    from fretguide.geometry import apply_homography, fret_u
    from fretguide.types import UV

    model.eval()
    tiles = []
    for i in range(min(n, len(ds))):
        img, hm, H_true = ds[i]
        with torch.no_grad():
            pred = model(img[None].to(device))[0].cpu().numpy()
        pts, conf = decode_heatmaps(pred, STRIDE)
        H_pred, mask = homography_from_keypoints(pts, conf, max_fret=max_fret)
        view = cv2.cvtColor((img[0].numpy() * 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)
        for H, col in ((H_true.numpy().astype(np.float64), (60, 60, 235)), (H_pred, (80, 235, 80))):
            if H is None:
                continue
            for f in range(max_fret + 1):
                a, b = apply_homography(H, [UV(fret_u(f), 0.0), UV(fret_u(f), 1.0)])
                if np.isfinite(a).all() and np.isfinite(b).all():
                    cv2.line(view, tuple(np.int32(a)), tuple(np.int32(b)), col, 1, cv2.LINE_AA)
        for (x, y), c in zip(pts, conf):
            if c >= 0.15:
                cv2.circle(view, (int(x), int(y)), 2, (0, 220, 255), -1, cv2.LINE_AA)
        cv2.putText(view, f"kp {int(mask.sum())}/{len(pts)}", (8, 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
        tiles.append(view)
    if not tiles:
        return
    rows = [np.hstack(tiles[i:i + 2]) for i in range(0, len(tiles) - len(tiles) % 2, 2)]
    if rows:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(out_path), np.vstack(rows))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--frames", default="dataset/frames")
    ap.add_argument("--labels", default="dataset/labels.json")
    ap.add_argument("--out", default="models")
    ap.add_argument("--epochs", type=int, default=120)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--weight-decay", type=float, default=1e-4)
    ap.add_argument("--width", type=float, default=1.0, help="channel multiplier")
    ap.add_argument("--depth", type=int, default=3,
                    help="encoder stages, which set the receptive field: 2->31px, 3->83px, "
                         "4->159px, 5->209px. 3 is the default because at 83px the model "
                         "CANNOT see the room furniture it was previously cheating with, "
                         "while still seeing the whole neck width and ~8 fret gaps. Go to 4 "
                         "only if the montage shows the grid offset by WHOLE FRETS")
    ap.add_argument("--sigma", type=float, default=1.5, help="target Gaussian, heatmap cells")
    ap.add_argument("--max-fret", type=int, default=DEFAULT_MAX_FRET)
    ap.add_argument("--val-frac", type=float, default=0.2)
    ap.add_argument("--repeats", type=int, default=4,
                    help="augmented views per frame per epoch (285 frames is small)")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--cache-scale", type=float, default=0.5)
    ap.add_argument("--min-conf", type=float, default=0.15)
    ap.add_argument("--device", default="auto")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--limit", type=int, default=0, help="use only the first N frames (smoke test)")
    ap.add_argument("--resume", default="")
    ap.add_argument("--no-bg-replace", action="store_true",
                    help="disable background compositing. Geometry-only augmentation was "
                         "MEASURED to be insufficient -- the model then learns the room "
                         "instead of the guitar (see fretguide/dataset.AugConfig)")
    ap.add_argument("--no-aug", action="store_true",
                    help="disable augmentation. Only for the overfit sanity check -- a run "
                         "with this on cannot generalise, because the captured frames cover "
                         "one pose")
    args = ap.parse_args()

    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    torch.manual_seed(args.seed)

    frames = load_dataset(args.frames, args.labels, args.max_fret)
    if args.limit:
        frames = frames[: args.limit]
    if len(frames) < 4:
        print(f"only {len(frames)} usable labelled frames; label more first")
        return 1
    train_f, val_f = split_by_capture_order(frames, args.val_frac)
    rms = np.array([f.rms_px for f in frames])
    print(f"device {device}   frames {len(frames)}  ->  train {len(train_f)}  val {len(val_f)}")
    print(f"label fit residual @full-res: med {np.median(rms):.2f}px  p90 "
          f"{np.percentile(rms, 90):.2f}px  max {rms.max():.2f}px")
    print(f"train frames {train_f[0].path.name} .. {train_f[-1].path.name}   "
          f"val {val_f[0].path.name} .. {val_f[-1].path.name}")

    cfg = AugConfig().still() if args.no_aug else AugConfig()
    if args.no_bg_replace:
        cfg.bg_replace_p = 0.0

    # Mean board centre over the TRAINING frames, in network-input pixels. Used only as a
    # reference for the shortcut check in evaluate() -- never as a target.
    S = letterbox_matrix(1920, 1080)
    canon = canonical_uv(args.max_fret)
    _train_centres = np.array([apply_homography(S @ f.H, canon).mean(axis=0) for f in train_f])
    train_centre = _train_centres.mean(axis=0)
    # How tightly the board actually sits across the training set. A prediction landing
    # within a couple of these of the mean is, for practical purposes, just reciting the
    # average -- which is the distinction the shortcut warning needs to make.
    train_centre_spread = float(np.linalg.norm(_train_centres - train_centre, axis=1).std())
    shortcut_px = max(20.0, 2.0 * train_centre_spread)
    print(f"board centre across training frames: ({train_centre[0]:.0f},{train_centre[1]:.0f}) "
          f"spread {train_centre_spread:.0f}px -> shortcut warning below {shortcut_px:.0f}px")
    train_ds = FretDataset(train_f, cfg, args.max_fret, args.sigma, args.cache_scale,
                           seed=None, repeats=args.repeats)
    # Both val sets are seeded, so epoch-to-epoch movement is the model changing, not
    # the data. val_aug reuses the training warp ranges -- that is the point of it.
    val_still = FretDataset(val_f, cfg.still(), args.max_fret, args.sigma, args.cache_scale,
                            seed=1234)
    val_aug = FretDataset(val_f, cfg, args.max_fret, args.sigma, args.cache_scale,
                          seed=5678, repeats=2)

    mk = lambda ds, sh: DataLoader(ds, batch_size=args.batch, shuffle=sh,
                                   num_workers=args.workers, drop_last=False,
                                   persistent_workers=args.workers > 0)
    train_dl, still_dl, aug_dl = mk(train_ds, True), mk(val_still, False), mk(val_aug, False)

    model = FretNet(args.max_fret, args.width, args.depth).to(device)
    n_par = sum(p.numel() for p in model.parameters())
    print(f"model: {n_par/1e6:.2f}M params, depth {args.depth}, "
          f"{n_keypoints(args.max_fret)} keypoints, input {INPUT_W}x{INPUT_H}, "
          f"heatmap {INPUT_W//STRIDE}x{INPUT_H//STRIDE}")

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    steps = max(1, len(train_dl)) * args.epochs
    warm = min(300, steps // 10)
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: (s + 1) / max(1, warm) if s < warm
        else 0.5 * (1 + np.cos(np.pi * (s - warm) / max(1, steps - warm))))

    start_epoch, best = 0, float("inf")
    if args.resume and Path(args.resume).exists():
        ck = torch.load(args.resume, map_location=device)
        model.load_state_dict(ck["model"])
        opt.load_state_dict(ck["opt"])
        start_epoch, best = ck.get("epoch", 0) + 1, ck.get("best", float("inf"))
        print(f"resumed from {args.resume} at epoch {start_epoch}, best {best:.3f}")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    hist_path = out_dir / "history.jsonl"

    for epoch in range(start_epoch, args.epochs):
        train_ds.epoch = epoch
        model.train()
        t0, tot, nb = time.time(), 0.0, 0
        for imgs, hms, _ in train_dl:
            imgs, hms = imgs.to(device, non_blocking=True), hms.to(device, non_blocking=True)
            loss = heatmap_loss(model(imgs), hms)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step()
            sched.step()
            tot += float(loss.item())
            nb += 1
        train_loss = tot / max(1, nb)

        s = evaluate(model, still_dl, device, args.max_fret, args.min_conf, train_centre)
        a = evaluate(model, aug_dl, device, args.max_fret, args.min_conf, train_centre)
        dt = time.time() - t0
        # The shortcut check. Three conditions, all necessary -- an earlier version used only
        # the relative one and cried wolf on every under-trained model: a net predicting
        # near the image centre lands 72px from this dataset's training mean and 126px from
        # the truth, which "looks like" the shortcut without being it. So also require the
        # prediction to be genuinely parked ON the average position, and require the model
        # to be posing reliably enough for the question to mean anything at all.
        shortcut = ""
        if "px_to_true" in s:
            shortcut = f"  [true {s['px_to_true']:4.0f}px | avg {s['px_to_train_mean']:4.0f}px]"
            if (s["posed_frac"] > 0.5
                    and s["px_to_train_mean"] < shortcut_px
                    and s["px_to_train_mean"] < s["px_to_true"] * 0.7):
                shortcut += " <-- LEARNING THE ROOM"
            elif s["posed_frac"] <= 0.5:
                shortcut += " (too few poses to judge yet)"
        print(f"e{epoch:3d}  loss {train_loss:.5f}  "
              f"still: fret {s['fret_med']:.3f} posed {s['posed_frac']*100:3.0f}%   "
              f"aug: fret {a['fret_med']:.3f} p90 {a['fret_p90']:.3f} "
              f"posed {a['posed_frac']*100:3.0f}%{shortcut}   {dt:.0f}s", flush=True)
        with hist_path.open("a") as fh:
            fh.write(json.dumps({"epoch": epoch, "train_loss": train_loss,
                                 "still": s, "aug": a, "sec": dt}) + "\n")

        # Selection on the AUGMENTED score: the still score is inflated by the dataset's
        # single-pose bias, so choosing on it would pick the most over-fitted epoch.
        score = float(a["fret_med"] + (1.0 - a["posed_frac"]) * 2.0)
        # Plain Python scalars only. A numpy float here makes the checkpoint unloadable
        # under torch>=2.6's default weights_only=True.
        ck = {"model": model.state_dict(), "opt": opt.state_dict(), "epoch": int(epoch),
              "best": float(min(best, score)), "max_fret": int(args.max_fret),
              "width": float(args.width), "depth": int(args.depth),
              "input": [INPUT_W, INPUT_H], "stride": STRIDE, "sigma": float(args.sigma)}
        torch.save(ck, out_dir / "last.pt")
        if score < best:
            best = score
            torch.save(ck, out_dir / "best.pt")
            montage(model, val_aug, device, out_dir / "val_montage.png", 6, args.max_fret)

    print(f"\nbest augmented score {best:.3f}  ->  {out_dir/'best.pt'}")
    print(f"montage: {out_dir/'val_montage.png'}   history: {hist_path}")
    print(f"next:  python tools/export.py --checkpoint {out_dir/'best.pt'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
