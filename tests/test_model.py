"""Tests for FretNet. Requires torch, so the whole module skips without it.

The load-bearing test here is the receptive-field bound. It is the structural guarantee
that replaced a pile of augmentation tricks: a model that cannot see the room cannot
locate the fretboard by recognising the room.
"""

from __future__ import annotations

import numpy as np
import pytest

torch = pytest.importorskip("torch", reason="training-only dependency")

from fretguide.dataset import INPUT_H, INPUT_W, STRIDE, n_keypoints
from fretguide.model import FretNet, heatmap_loss

#: Board geometry at 640x384 input, measured from the real 285-frame set.
BOARD_LEN_PX = 300.0
NECK_WIDTH_PX = 35.0
TIGHTEST_GAP_PX = 10.0
#: How far the room furniture the model was previously cheating with actually sits.
NEAREST_ROOM_CUE_PX = 150.0


def receptive_field(model: FretNet) -> int:
    """Measured, not derived: backpropagate one output cell to the input and see what moved."""
    torch.manual_seed(0)
    model.eval()
    # Random input rather than zeros: with zeros every ReLU sits at 0 and no gradient flows.
    x = (torch.rand(1, 1, INPUT_H, INPUT_W) * 0.5 + 0.25).requires_grad_(True)
    y = model(x)
    y[0, :, y.shape[2] // 2, y.shape[3] // 2].sum().backward()
    g = x.grad[0, 0].abs().numpy()
    ys, xs = np.nonzero(g > 1e-12)
    return int(max(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1))


def test_default_model_cannot_see_the_room():
    """THE STRUCTURAL GUARANTEE.

    A 200-epoch run with a 159 px receptive field learned to output the average board
    position and ignore the picture: 0.009 fret-widths on training frames, 4.4 on held-out
    ones, predicted centre 11 px from the training mean and 74 px from the truth. It located
    the board by recognising the furniture around it.

    No augmentation can fully prevent that, because warping the image moves the room and the
    guitar together. Bounding the receptive field below the distance to the nearest room cue
    makes it impossible instead of merely unattractive.
    """
    rf = receptive_field(FretNet())
    assert rf < NEAREST_ROOM_CUE_PX, (
        f"receptive field {rf}px reaches the room ({NEAREST_ROOM_CUE_PX:.0f}px away); "
        "the model can locate the board by recognising the furniture"
    )


def test_default_model_can_still_see_enough_to_identify_a_fret():
    """The other side of the trade. Too small and fret 5 becomes indistinguishable from 7.

    For one specific guitar the ratio of local fret gap to neck width fixes the position
    along the neck, and the unknown perspective scale cancels in that ratio. So the window
    has to hold the full neck width and several gaps.
    """
    rf = receptive_field(FretNet())
    assert rf > NECK_WIDTH_PX * 1.8, f"receptive field {rf}px barely spans the neck's width"
    assert rf > TIGHTEST_GAP_PX * 4, (
        f"receptive field {rf}px sees too few fret gaps to judge the spacing"
    )


def test_depth_trades_receptive_field_for_parameters_monotonically():
    prev_rf, prev_par = 0, 0
    for d in (2, 3, 4, 5):
        m = FretNet(depth=d)
        rf = receptive_field(m)
        par = sum(p.numel() for p in m.parameters())
        assert rf > prev_rf and par > prev_par
        prev_rf, prev_par = rf, par


@pytest.mark.parametrize("depth", [2, 3, 4, 5])
def test_output_shape_is_independent_of_depth(depth):
    out = FretNet(depth=depth)(torch.zeros(2, 1, INPUT_H, INPUT_W))
    assert out.shape == (2, n_keypoints(12), INPUT_H // STRIDE, INPUT_W // STRIDE)


def test_output_is_a_probability_like_heatmap():
    """The confidence gate downstream assumes [0, 1], so the sigmoid must be in the graph."""
    out = FretNet()(torch.rand(1, 1, INPUT_H, INPUT_W))
    assert float(out.min()) >= 0.0 and float(out.max()) <= 1.0


def test_untrained_model_predicts_nothing_anywhere():
    """The correct prior: a sigma-1.5 Gaussian target is ~99.9% zeros."""
    out = FretNet()(torch.rand(1, 1, INPUT_H, INPUT_W))
    assert float(out.mean()) < 0.05


def test_loss_punishes_predicting_zero_everywhere():
    """Unweighted MSE is nearly minimised by an all-zero output; the weight is what stops it."""
    target = torch.zeros(1, 26, INPUT_H // STRIDE, INPUT_W // STRIDE)
    target[0, :, 40, 60] = 1.0
    zero = torch.zeros_like(target)
    assert float(heatmap_loss(zero, target)) > float(heatmap_loss(target, target))
    # And a correct prediction must beat a confidently wrong one.
    wrong = torch.zeros_like(target)
    wrong[0, :, 80, 200] = 1.0
    assert float(heatmap_loss(target, target)) < float(heatmap_loss(wrong, target))


def test_invalid_depth_is_rejected():
    with pytest.raises(ValueError):
        FretNet(depth=1)
    with pytest.raises(ValueError):
        FretNet(depth=99)
