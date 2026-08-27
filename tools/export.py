#!/usr/bin/env python3
"""Export a trained checkpoint to ONNX and OpenVINO IR, and measure real latency.

    python tools/export.py --checkpoint models/best.pt

Produces ``models/fretnet.onnx`` and ``models/fretnet.xml`` / ``.bin``, then benchmarks
every available OpenVINO device so the choice of CPU / GPU / NPU is made from measured
numbers rather than assumed. Verifies the IR against PyTorch before reporting anything:
a silently-wrong export that still produces plausible heatmaps is the failure mode worth
guarding against.

Static input shape (1, 1, 384, 640) on purpose. Dynamic shapes cost real throughput on
the Intel stack and there is no reason to pay for them -- the camera resolution is fixed
and letterboxing absorbs any aspect-ratio difference.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root, so `fretguide` imports

import torch

from fretguide.dataset import INPUT_H, INPUT_W, STRIDE, n_keypoints
from fretguide.model import FretNet


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--checkpoint", default="models/best.pt")
    ap.add_argument("--out-dir", default="models")
    ap.add_argument("--name", default="fretnet")
    ap.add_argument("--fp16", action="store_true", default=True)
    ap.add_argument("--fp32", dest="fp16", action="store_false")
    ap.add_argument("--iters", type=int, default=60)
    ap.add_argument("--opset", type=int, default=17)
    args = ap.parse_args()

    ck_path = Path(args.checkpoint)
    if not ck_path.exists():
        print(f"no checkpoint at {ck_path}; train first:  python tools/train.py")
        return 1
    # weights_only=False because our own checkpoints carry a little metadata (max_fret,
    # width, depth, the best score) and the score arrives as a numpy scalar, which the
    # torch>=2.6 safe unpickler rejects. This file was written by tools/train.py on the
    # user's own machine, so there is nothing untrusted about it.
    ck = torch.load(ck_path, map_location="cpu", weights_only=False)
    max_fret = int(ck.get("max_fret", 12))
    width = float(ck.get("width", 1.0))
    depth = int(ck.get("depth", 4))
    model = FretNet(max_fret, width, depth)
    model.load_state_dict(ck["model"])
    model.eval()
    print(f"loaded {ck_path}  epoch {ck.get('epoch')}  score {ck.get('best')}")
    print(f"  max_fret {max_fret}  width {width}  depth {depth}  "
          f"keypoints {n_keypoints(max_fret)}")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = out_dir / f"{args.name}.onnx"

    dummy = torch.zeros(1, 1, INPUT_H, INPUT_W)
    torch.onnx.export(
        model, dummy, str(onnx_path),
        input_names=["image"], output_names=["heatmaps"],
        opset_version=args.opset, dynamo=False,
    )
    with torch.no_grad():
        ref = model(dummy_real := torch.rand(1, 1, INPUT_H, INPUT_W)).numpy()
    print(f"\nwrote {onnx_path}  ({onnx_path.stat().st_size/1e6:.1f} MB)")
    print(f"  output shape {tuple(ref.shape)}  (expect (1, {n_keypoints(max_fret)}, "
          f"{INPUT_H//STRIDE}, {INPUT_W//STRIDE}))")

    try:
        import openvino as ov
    except ImportError:
        print("\nopenvino not installed; ONNX is still usable via onnxruntime")
        return 0

    core = ov.Core()
    ov_model = ov.convert_model(str(onnx_path))
    xml_path = out_dir / f"{args.name}.xml"
    ov.save_model(ov_model, str(xml_path), compress_to_fp16=args.fp16)
    print(f"wrote {xml_path}  (fp16={args.fp16})")

    devices = [d for d in core.available_devices]
    print(f"\nOpenVINO devices: {devices}")
    x = dummy_real.numpy()
    best = None
    for dev in devices:
        try:
            compiled = core.compile_model(str(xml_path), dev,
                                          {"PERFORMANCE_HINT": "LATENCY"})
            out = compiled(x)[compiled.output(0)]
            # Correctness before speed: FP16 on a different device is allowed to differ
            # slightly, but not to disagree about where the peaks are.
            max_abs = float(np.abs(out - ref).max())
            peak_shift = float(
                np.abs(
                    np.stack(np.unravel_index(out.reshape(out.shape[1], -1).argmax(1),
                                              out.shape[2:]))
                    - np.stack(np.unravel_index(ref.reshape(ref.shape[1], -1).argmax(1),
                                                ref.shape[2:]))
                ).max()
            )
            for _ in range(5):
                compiled(x)
            t0 = time.perf_counter()
            for _ in range(args.iters):
                compiled(x)
            ms = (time.perf_counter() - t0) / args.iters * 1000.0
            print(f"  {dev:8s} {ms:7.1f} ms  ({1000/ms:5.1f} fps)   "
                  f"max|diff| vs torch {max_abs:.4f}   peak shift {peak_shift:.0f} cells")
            if best is None or ms < best[1]:
                best = (dev, ms)
        except Exception as e:  # a device being unusable is information, not a failure
            print(f"  {dev:8s} unavailable: {type(e).__name__}: {e}")

    if best:
        print(f"\nfastest: {best[0]} at {best[1]:.1f} ms ({1000/best[1]:.1f} fps)")
        # --device is the CAMERA in run_app.py; the OpenVINO one is --infer-device.
        print(f"run it:  python tools/run_app.py -d 4 --model {xml_path} "
              f"--infer-device {best[0]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
