"""Theory tests: note maths, chord/scale sets, and neck-wide generation."""

from __future__ import annotations

import pytest

from fretguide.theory import (
    OPEN_NOTES,
    chord_chromas,
    chord_pitch_classes,
    chroma,
    chroma_at,
    midi_to_name,
    note_at,
    parse_note,
    pitch_class_at,
    pitch_to_midi,
    scale_chromas,
    scale_pitch_classes,
    scale_positions,
    split_chord_name,
)


class TestNoteMaths:
    def test_parse_accidentals(self):
        assert parse_note("C")[0] == 0
        assert parse_note("C#")[0] == 1
        assert parse_note("Db")[0] == 1
        assert parse_note("B")[0] == 11
        assert parse_note("Cb")[0] == 11  # wraps

    def test_parse_octave(self):
        assert parse_note("E2") == (4, 2)
        assert parse_note("F#")[1] is None

    @pytest.mark.parametrize("bad", ["", "H", "x2"])
    def test_rejects_bad_names(self, bad):
        with pytest.raises(ValueError):
            parse_note(bad)

    def test_midi_reference_pitches(self):
        assert pitch_to_midi("C4") == 60
        assert pitch_to_midi("A4") == 69
        assert pitch_to_midi("E2") == 40  # guitar low E

    def test_midi_name_round_trip(self):
        for m in range(21, 108):
            assert pitch_to_midi(midi_to_name(m)) == m

    def test_pitch_to_midi_needs_an_octave(self):
        with pytest.raises(ValueError):
            pitch_to_midi("F#")


class TestFretboardNotes:
    def test_open_strings(self):
        for s, expected in OPEN_NOTES.items():
            assert note_at(s, 0) == expected

    def test_standard_tuning_landmarks(self):
        assert note_at(6, 3) == "G2"  # G major root
        assert note_at(5, 2) == "B2"
        assert note_at(1, 3) == "G4"
        assert note_at(6, 12) == "E3"  # octave

    def test_twelfth_fret_is_an_octave_on_every_string(self):
        for s in range(1, 7):
            assert pitch_to_midi(note_at(s, 12)) == pitch_to_midi(note_at(s, 0)) + 12

    def test_same_pitch_two_ways(self):
        """The ambiguity audio alone cannot resolve: string 6 fret 5 == string 5 fret 0."""
        assert note_at(6, 5) == note_at(5, 0) == "A2"

    def test_pitch_class_and_chroma_agree(self):
        assert pitch_class_at(6, 3) == "G"
        assert chroma_at(6, 3) == chroma("G")


class TestChordsAndScales:
    def test_split_chord_name(self):
        assert split_chord_name("G") == ("G", "")
        assert split_chord_name("Am") == ("A", "m")
        assert split_chord_name("F#dim") == ("F#", "dim")
        assert split_chord_name("Bbmaj7") == ("Bb", "maj7")

    def test_triads(self):
        assert chord_pitch_classes("G") == ["G", "B", "D"]
        assert chord_pitch_classes("Am") == ["A", "C", "E"]
        assert chord_pitch_classes("F#dim") == ["F#", "A", "C"]

    def test_chord_chromas_are_a_set(self):
        assert chord_chromas("Am") == {9, 0, 4}

    def test_unknown_quality_raises(self):
        with pytest.raises(ValueError):
            chord_chromas("Gwat")

    def test_g_major_scale(self):
        assert scale_pitch_classes("G", "major") == ["G", "A", "B", "C", "D", "E", "F#"]

    def test_relative_minor_shares_the_pitch_set(self):
        assert scale_chromas("G", "major") == scale_chromas("E", "minor")

    def test_modes_are_rotations_of_the_same_set(self):
        assert scale_chromas("C", "ionian") == scale_chromas("D", "dorian")

    def test_pentatonics(self):
        assert scale_pitch_classes("A", "minor pentatonic") == ["A", "C", "D", "E", "G"]
        assert len(scale_chromas("C", "major pentatonic")) == 5

    def test_unknown_scale_raises(self):
        with pytest.raises(ValueError):
            scale_chromas("G", "hypermixolocrian")


class TestNeckWideGeneration:
    def test_every_generated_note_is_in_the_scale(self):
        allowed = scale_chromas("G", "major")
        for p in scale_positions("G", "major", 0, 12):
            assert chroma_at(p.string, p.fret) in allowed

    def test_roots_are_flagged_correctly(self):
        for p in scale_positions("G", "major", 0, 12):
            assert p.is_root == (chroma_at(p.string, p.fret) == chroma("G"))

    def test_respects_the_fret_window(self):
        for p in scale_positions("A", "minor pentatonic", 5, 8):
            assert 5 <= p.fret <= 8

    def test_covers_all_six_strings(self):
        strings = {p.string for p in scale_positions("G", "major", 0, 12)}
        assert strings == {1, 2, 3, 4, 5, 6}

    def test_pentatonic_is_sparser_than_the_major_scale(self):
        major = scale_positions("A", "major", 0, 12)
        penta = scale_positions("A", "major pentatonic", 0, 12)
        assert len(penta) < len(major)

    def test_chromatic_scale_fills_every_position(self):
        n = len(scale_positions("C", "chromatic", 0, 12))
        assert n == 6 * 13

    def test_restricting_strings(self):
        got = scale_positions("G", "major", 0, 12, strings=(6, 5))
        assert {p.string for p in got} == {6, 5}
