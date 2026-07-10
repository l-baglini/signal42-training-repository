"""
VILLAIN ORIGIN STORY  —  Streamlit edition
============================================
Tell it the petty thing that finally broke you, and it forges a deadly-serious
supervillain dossier around your minor inconvenience.

Run it:
    pip install streamlit
    streamlit run villain_origin_story.py

The generator logic below is pure (only uses `random`), so it can be tested
without launching the server.
"""

import random

from word_banks import (
    ADJECTIVES, NOUNS, TITLES, PROPER_NOUNS, PLACES, THREAT_LEVELS,
    OPENINGS, INCIDENTS, TRANSFORMATIONS, POWERS, PLANS, NEMESES,
    WEAKNESSES, TAGLINES, FALLBACK_INCIDENT,
)


# ----------------------------------------------------------------------------
# GENERATOR  —  pure functions, no Streamlit, easy to test
# ----------------------------------------------------------------------------

def make_alias():
    """Return a randomly assembled villain alias."""
    pattern = random.choice(["adj_noun", "title_proper", "noun_of_place"])
    if pattern == "adj_noun":
        return f"The {random.choice(ADJECTIVES)} {random.choice(NOUNS)}"
    if pattern == "title_proper":
        return f"{random.choice(TITLES)} {random.choice(PROPER_NOUNS)}"
    return f"The Phantom of {random.choice(PLACES)}"


def _clean(text):
    """Strip whitespace and trailing punctuation; fall back to the default incident if empty."""
    text = (text or "").strip()
    if not text:
        return FALLBACK_INCIDENT
    return text.rstrip(".!?")


def _lower_first(text):
    """Return text with its first character lowercased."""
    return text[0].lower() + text[1:] if text else text


def _cap_first(text):
    """Return text with its first character uppercased."""
    return text[0].upper() + text[1:] if text else text


def generate_story(user_incident, hero_name=""):
    """Assemble and return a complete villain dossier dict from the given incident."""
    incident = _clean(user_incident)
    incident_mid = _lower_first(incident)   # for "Then came... {incident}"
    incident_cap = _cap_first(incident)     # for standalone sentence

    alias = make_alias()
    threat = random.choice(THREAT_LEVELS)
    opening = random.choice(OPENINGS)
    incident_line = random.choice(INCIDENTS).format(
        incident=incident_mid, incident_cap=incident_cap
    )
    transformation = random.choice(TRANSFORMATIONS).format(alias=alias)
    powers = random.sample(POWERS, 3)
    plan = random.choice(PLANS)
    nemesis = random.choice(NEMESES)
    weakness = random.choice(WEAKNESSES)
    tagline = random.choice(TAGLINES)

    known_as = hero_name.strip() or "Subject Unknown"

    return {
        "alias": alias,
        "threat": threat,
        "known_as": known_as,
        "opening": opening,
        "incident_line": incident_line,
        "transformation": transformation,
        "powers": powers,
        "plan": plan,
        "nemesis": nemesis,
        "weakness": weakness,
        "tagline": tagline,
        "case_no": (
            f"{random.randint(100, 999)}"
            f"-{random.choice('ABCDEFGHJKMNPQRSTVWXYZ')}"
            f"{random.randint(10, 99)}"
        ),
    }


_GOOGLE_FONTS = (
    "https://fonts.googleapis.com/css2?"
    "family=Cinzel+Decorative:wght@700;900"
    "&family=Spectral:ital,wght@0,400;0,600;1,400"
    "&family=Space+Mono:wght@400;700&display=swap"
)

# ----------------------------------------------------------------------------
# STREAMLIT UI
# ----------------------------------------------------------------------------

def render():
    """Render the Streamlit UI."""
    import streamlit as st

    st.set_page_config(page_title="Villain Origin Story", page_icon="🦹", layout="centered")

    st.markdown(
        f"""
        <style>
        @import url('{_GOOGLE_FONTS}');

        :root {{
            --void:#15101d; --oxblood:#2a1129; --violet:#6b3fa0;
            --gold:#e8b43a; --bone:#ede6d6; --danger:#c2412d;
        }}
        .stApp {{ background: radial-gradient(120% 90% at 50% -10%, #2a1129 0%, #15101d 60%); }}
        .block-container {{ max-width: 720px; }}

        .eyebrow {{
            font-family:'Space Mono',monospace; letter-spacing:.32em; text-transform:uppercase;
            font-size:.72rem; color:var(--gold); opacity:.85; margin-bottom:.4rem;
        }}
        .masthead {{
            font-family:'Cinzel Decorative',serif; font-weight:900; color:var(--bone);
            font-size:2.4rem; line-height:1.05; margin:0 0 .2rem 0;
        }}
        .rule {{
            height:1px; background:linear-gradient(90deg,var(--gold),transparent);
            margin:.8rem 0 1.4rem;
        }}

        /* Inputs */
        .stTextInput textarea, .stTextArea textarea, .stTextInput input {{
            background:#1d1426 !important; color:var(--bone) !important;
            border:1px solid #4a2f55 !important; font-family:'Space Mono',monospace !important;
        }}
        label, .stTextInput label, .stTextArea label {{
            color:var(--bone) !important; font-family:'Space Mono',monospace !important;
            letter-spacing:.12em; text-transform:uppercase; font-size:.74rem !important;
        }}
        .stButton button {{
            background:var(--danger); color:#fff; border:none; border-radius:2px;
            font-family:'Space Mono',monospace; font-weight:700; letter-spacing:.18em;
            text-transform:uppercase; padding:.7rem 1.2rem; width:100%;
        }}
        .stButton button:hover {{ background:#d9512f; color:#fff; }}

        /* Dossier */
        .dossier {{
            position:relative; background:#1c1326; border:1px solid #4a2f55;
            border-top:3px solid var(--gold); padding:2rem 2rem 2.4rem; margin-top:1.4rem;
            box-shadow:0 24px 60px rgba(0,0,0,.5);
        }}
        .stamp {{
            position:absolute; top:18px; right:14px; transform:rotate(8deg);
            border:3px solid var(--danger); color:var(--danger); border-radius:4px;
            font-family:'Space Mono',monospace; font-weight:700; text-transform:uppercase;
            padding:.3rem .6rem; font-size:.7rem; letter-spacing:.12em; opacity:.92;
            text-align:center; line-height:1.3; max-width:170px;
        }}
        .stamp small {{ display:block; font-size:.58rem; opacity:.8; letter-spacing:.2em; }}
        .casebar {{
            font-family:'Space Mono',monospace; font-size:.7rem; letter-spacing:.18em;
            color:var(--gold); text-transform:uppercase; margin-bottom:1.2rem;
        }}
        .alias {{
            font-family:'Cinzel Decorative',serif; font-weight:900; color:var(--bone);
            font-size:2.1rem; line-height:1.1; margin:.2rem 0 1.4rem;
            text-shadow:0 0 26px rgba(232,180,58,.18);
        }}
        .field-label {{
            font-family:'Space Mono',monospace; font-size:.66rem; letter-spacing:.22em;
            text-transform:uppercase; color:var(--violet); margin:1.3rem 0 .35rem;
        }}
        .narrative {{
            font-family:'Spectral',serif; font-size:1.06rem; line-height:1.65; color:var(--bone);
        }}
        .narrative p {{ margin:0 0 .9rem; }}
        .powers {{
            font-family:'Spectral',serif; color:var(--bone); padding-left:1.1rem; margin:.2rem 0 0;
        }}
        .powers li {{ margin:.3rem 0; }}
        .tagline {{
            font-family:'Cinzel Decorative',serif; color:var(--gold); font-size:1.15rem;
            text-align:center; margin-top:1.8rem; padding-top:1.2rem;
            border-top:1px solid #4a2f55;
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )

    st.markdown(
        '<div class="eyebrow">Department of Infamy · Confidential</div>',
        unsafe_allow_html=True,
    )
    st.markdown('<h1 class="masthead">Villain Origin Story</h1>', unsafe_allow_html=True)
    st.markdown(
        '<div class="rule"></div>'
        '<p style="font-family:Spectral,serif;color:#cbb9d6;margin-top:-.4rem;">'
        'Every supervillain started with one small, unforgivable inconvenience. Name yours.</p>',
        unsafe_allow_html=True,
    )

    incident = st.text_area(
        "The final straw — the petty thing that broke you",
        placeholder="e.g. someone took the parking spot I'd been patiently waiting for",
        height=90,
    )
    hero_name = st.text_input(
        "Your name (optional — for the record)",
        placeholder="e.g. Dave from Accounting",
    )

    if st.button("Initiate transformation"):
        st.session_state["story"] = generate_story(incident, hero_name)

    story = st.session_state.get("story")
    if story:
        powers_html = "".join(f"<li>{p}</li>" for p in story["powers"])
        st.markdown(
            f"""
            <div class="dossier">
              <div class="stamp">Threat Level<small>{story['threat']}</small></div>
              <div class="casebar">
                Case File No. {story['case_no']} · Known As: {story['known_as']}
              </div>
              <div class="alias">{story['alias']}</div>

              <div class="field-label">Origin</div>
              <div class="narrative">
                <p>{story['opening']}</p>
                <p>{story['incident_line']}</p>
                <p>{story['transformation']}</p>
              </div>

              <div class="field-label">Powers Acquired</div>
              <ul class="powers">{powers_html}</ul>

              <div class="field-label">The Plan</div>
              <div class="narrative"><p>{story['plan']}</p></div>

              <div class="field-label">Known Nemesis</div>
              <div class="narrative"><p>{story['nemesis']}</p></div>

              <div class="field-label">Fatal Weakness</div>
              <div class="narrative"><p>{story['weakness']}</p></div>

              <div class="tagline">"{story['tagline']}"</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        if st.button("Summon another (same straw)"):
            st.session_state["story"] = generate_story(incident, hero_name)
            st.rerun()


if __name__ == "__main__":
    render()
