"""FretNet: a small U-Net that predicts one heatmap per fret-wire endpoint.

Why a heatmap net and not direct coordinate regression: the frets are locally
distinguishable (wire, inlay dots, the widening of the board) but globally ambiguous --
fret 5 looks a lot like fret 7. A heatmap keeps every hypothesis spatially explicit and
lets the pose fit in ``dataset.homography_from_keypoints`` arbitrate between them with 26
votes for 8 unknowns. A coordinate head has to commit to a single number per keypoint and
averages competing hypotheses into a position that is on neither fret. This is the same
reason sports-field registration (PnLCalib, SoccerNet) uses heatmaps for line intersections
rather than regressing the camera directly.

Deliberately small and deliberately plain. The whole thing runs through OpenVINO, so: no
deformable convs, no attention, static shapes, BatchNorm + ReLU + bilinear upsample only --
all first-class in the OpenVINO opset. Nothing runs at full input resolution; the stem
downsamples immediately and the finest feature map is the stride-2 one the head predicts on.

THE RECEPTIVE FIELD IS THE MOST IMPORTANT DESIGN PARAMETER HERE, and it is a bound from
above, not a resource to maximise. ``depth`` sets it. Measured by backpropagating one output
cell to the input:

    depth   receptive field   params   sees the room?
      2          31 px        0.09M    no
      3          83 px        0.30M    no      <- default
      4         159 px        0.97M    YES
      5         209 px        2.32M    YES

At 640x384 input the board is ~300 px long, the neck ~35 px wide, the fret 11-12 gap ~10 px,
and the room furniture that surrounds it 150-400 px away.

A 200-epoch run at depth 4 failed exactly as the upper half of that table predicts. It scored
0.009 fret-widths on training frames and 4.4 on held-out ones, and its predicted board centre
sat 11 px from the *average* training board position while being 74 px from the true one. It
had learned to recognise the room and recite where the guitar usually is. That is a rational
strategy when the guitar moves only 13 px between frames of a session, and no amount of
augmentation reliably prevents it, because warping an image moves the room and the guitar
together and preserves the relationship between them.

Capping the receptive field below the distance to the nearest room cue makes the shortcut
impossible rather than merely unattractive. 83 px still contains the full neck width and
about eight fret gaps, which is what identifying a fret actually needs: for one specific
guitar the ratio of local fret gap to neck width fixes the position along the neck, and the
unknown perspective scale cancels in that ratio. Inlay dots at frets 3, 5, 7, 9 and 12 are a
second, independent local cue. Fewer parameters is a bonus, not a cost, on 228 training
frames.

Go to ``depth=4`` only on a specific symptom: the validation montage showing the predicted
grid offset from the labelled one by WHOLE FRETS, which means local evidence genuinely was
not enough to identify which fret is which. A grid that is roughly right but loose everywhere
is a different problem and more context will not fix it.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from .dataset import DEFAULT_MAX_FRET, n_keypoints

#: Channels per encoder stage, from stride 2 upward.
STAGE_CHANNELS = (24, 48, 96, 160, 192)


def _block(cin: int, cout: int, stride: int = 1) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, stride, 1, bias=False),
        nn.BatchNorm2d(cout),
        nn.ReLU(inplace=True),
        nn.Conv2d(cout, cout, 3, 1, 1, bias=False),
        nn.BatchNorm2d(cout),
        nn.ReLU(inplace=True),
    )


class FretNet(nn.Module):
    """Input (N, 1, 384, 640) grayscale in [0, 1]; output (N, K, 192, 320) heatmaps.

    ``width`` scales every channel count. ``depth`` sets the number of encoder stages and
    therefore the receptive field, which is the parameter that decides whether the model can
    cheat by recognising the room -- see the module docstring before changing it.
    """

    def __init__(self, max_fret: int = DEFAULT_MAX_FRET, width: float = 1.0, depth: int = 3):
        super().__init__()
        if not 2 <= depth <= len(STAGE_CHANNELS):
            raise ValueError(f"depth must be 2..{len(STAGE_CHANNELS)}, got {depth}")
        self.max_fret = max_fret
        self.depth = depth
        self.n_kp = n_keypoints(max_fret)
        c = [max(8, int(round(x * width))) for x in STAGE_CHANNELS[:depth]]

        # Stem takes us straight to stride 2, which is also the output stride: the
        # expensive full-resolution level is never materialised.
        self.stem = _block(1, c[0], stride=2)
        self.encoders = nn.ModuleList(
            [_block(c[i], c[i + 1], stride=2) for i in range(depth - 1)]
        )
        # Decoders mirror the encoders. The last one outputs c[1] channels regardless of
        # depth, so the head sees the same width whatever the encoder looks like.
        decs = [_block(c[i + 1] + c[i], c[i] if i > 0 else c[1]) for i in range(depth - 1)]
        self.decoders = nn.ModuleList(reversed(decs))
        self.head = nn.Conv2d(c[1], self.n_kp, 1)
        # Start with strongly negative logits so early training predicts "nothing
        # anywhere" -- the correct prior, since a Gaussian target is ~99% zeros.
        nn.init.constant_(self.head.bias, -4.0)
        nn.init.normal_(self.head.weight, std=0.01)

    @staticmethod
    def _up(x: torch.Tensor, ref: torch.Tensor) -> torch.Tensor:
        return F.interpolate(x, size=ref.shape[-2:], mode="bilinear", align_corners=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        skips = [self.stem(x)]
        for enc in self.encoders:
            skips.append(enc(skips[-1]))
        y = skips[-1]
        for dec, skip in zip(self.decoders, reversed(skips[:-1])):
            y = dec(torch.cat([self._up(y, skip), skip], 1))
        # Sigmoid in the graph, not in the loss, so the exported model emits heatmaps in
        # [0, 1] and the confidence gate means the same thing at train and at run time.
        return torch.sigmoid(self.head(y))


def heatmap_loss(pred: torch.Tensor, target: torch.Tensor, pos_weight: float = 12.0) -> torch.Tensor:
    """Weighted MSE. The positive weight is what stops "predict zero" from winning.

    A sigma-1.5 Gaussian occupies well under 1% of a 192x320 map, so unweighted MSE is
    minimised almost perfectly by an all-zero output -- measured, that floor is a loss of
    about 7e-4, which is exactly where an under-trained run plateaus. Upweighting the cells
    where the target is non-zero restores the gradient on the handful of pixels that carry
    the answer.
    """
    w = 1.0 + pos_weight * target
    return (w * (pred - target) ** 2).mean()
