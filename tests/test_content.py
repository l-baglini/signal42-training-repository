"""Content tests.

The important ones here validate the *data* against theory: every curated voicing must
sound only notes belonging to its chord, and every position flagged as a root must
actually be the root. This is what catches a typo in a fingering.
"""

from __future__ import annotations

import pytest

from fretguide.content import CHORD_IDS, CHORDS, SCALE_IDS, SCALES, resolve_selection
from fretguide.theory import (
    chroma_at,
    split_chord_name,
    validate_chord,
    validate_roots,
    validate_scale,
)
from fretguide.types import Selection


class TestCuratedDataIsCorrect:
    @pytest.mark.parametrize("chord_id", CHORD_IDS)
    def test_every_voicing_sounds_only_chord_tones(self, chord_id):
        issues = validate_chord(CHORDS[chord_id])
        assert issues == [], f"{chord_id}: {[i.reason for i in issues]}"

    @pytest.mark.parametrize("chord_id", CHORD_IDS)
    def test_every_chord_root_flag_is_truthful(self, chord_id):
        chord = CHORDS[chord_id]
        root, _ = split_chord_name(chord.name)
        issues = validate_roots(root, chord.positions)
        assert issues == [], f"{chord_id}: {[i.reason for i in issues]}"

    @pytest.mark.parametrize("scale_id", SCALE_IDS)
    def test_every_box_position_is_in_the_scale(self, scale_id):
        issues = validate_scale(SCALES[scale_id])
        assert issues == [], f"{scale_id}: {[i.reason for i in issues]}"

    @pytest.mark.parametrize("scale_id", SCALE_IDS)
    def test_every_scale_root_flag_is_truthful(self, scale_id):
        box = SCALES[scale_id]
        assert validate_roots(box.root, box.positions) == []

    def test_a_deliberately_wrong_voicing_is_caught(self):
        """Guard the guard: validation must actually reject a bad fingering."""
        from dataclasses import replace

        from fretguide.types import FretPosition

        bad = replace(CHORDS["G"], positions=CHORDS["G"].positions + (FretPosition(4, 1),))
        assert validate_chord(bad) != []


class TestVoicingInvariants:
    @pytest.mark.parametrize("chord_id", CHORD_IDS)
    def test_open_and_muted_never_overlap(self, chord_id):
        chord = CHORDS[chord_id]
        assert not (set(chord.open) & set(chord.muted))

    @pytest.mark.parametrize("chord_id", CHORD_IDS)
    def test_strings_and_frets_are_in_range(self, chord_id):
        for p in CHORDS[chord_id].positions:
            assert 1 <= p.string <= 6
            assert p.fret >= 0
            assert p.finger is None or 1 <= p.finger <= 4

    @pytest.mark.parametrize("chord_id", CHORD_IDS)
    def test_at_most_one_position_per_string(self, chord_id):
        strings = [p.string for p in CHORDS[chord_id].positions]
        assert len(strings) == len(set(strings))

    def test_only_bm_declares_a_base_fret(self):
        with_base = {cid for cid in CHORD_IDS if CHORDS[cid].base_fret is not None}
        assert with_base == {"Bm"}

    def test_bm_barre_shares_one_finger_across_two_strings(self):
        ones = [p for p in CHORDS["Bm"].positions if p.finger == 1]
        assert len(ones) == 2
        assert {p.string for p in ones} == {5, 1}
        assert all(p.fret == 2 for p in ones)

    def test_fsharp_dim_voicing_is_the_chosen_one(self):
        """x x 4 2 1 2 — F#-A-C-F#; must not be silently substituted."""
        shape = {p.string: p.fret for p in CHORDS["F#dim"].positions}
        assert shape == {4: 4, 3: 2, 2: 1, 1: 2}
        assert set(CHORDS["F#dim"].muted) == {6, 5}


class TestSelectionResolution:
    def test_resolves_a_chord(self):
        got = resolve_selection(Selection("chord", "Am"))
        assert got is not None
        assert got.name == "Am"
        assert set(got.open) == {5, 1}
        assert set(got.muted) == {6}

    def test_resolves_a_curated_scale_box(self):
        got = resolve_selection(Selection("scale", "g-major-box"))
        assert got is not None
        assert len(got.positions) == 16
        assert got.open == () and got.muted == ()

    def test_carries_the_base_fret(self):
        assert resolve_selection(Selection("chord", "Bm")).base_fret == 2
        assert resolve_selection(Selection("chord", "G")).base_fret is None

    def test_resolves_a_generated_scale(self):
        got = resolve_selection(Selection("scale_generated", "A minor pentatonic"))
        assert got is not None
        assert got.name == "A minor pentatonic"
        assert len(got.positions) > 20
        from fretguide.theory import scale_chromas

        allowed = scale_chromas("A", "minor pentatonic")
        assert all(chroma_at(p.string, p.fret) in allowed for p in got.positions)

    def test_generated_scale_honours_max_fret(self):
        got = resolve_selection(Selection("scale_generated", "G major"), max_fret=5)
        assert max(p.fret for p in got.positions) <= 5

    @pytest.mark.parametrize(
        "sel",
        [
            Selection("chord", "Zz"),
            Selection("scale", "nope"),
            Selection("scale_generated", "G"),  # no scale name
            Selection("scale_generated", "G nonsense"),
        ],
    )
    def test_unknown_selections_return_none(self, sel):
        assert resolve_selection(sel) is None
