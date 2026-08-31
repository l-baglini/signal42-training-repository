# Villain Origin Story

Type in the petty thing that finally broke you; it forges a deadly-serious
supervillain dossier around your minor inconvenience. The humor comes from
melodramatic gravitas applied to something trivial.

## Primary version — Streamlit (Python)

```bash
pip install -r requirements.txt
streamlit run villain_origin_story.py
```

It opens in your browser automatically.

## Backup version — HTML/CSS/JS (zero setup)

Double-click `villain_origin_story.html`. It runs in any browser with no
install. Use this if Streamlit won't launch during a demo.

## How it works

A combinatorial generator: large curated word banks (villain aliases, powers,
evil plans, nemeses, fatal weaknesses) combined through several randomized
sentence templates, with your input woven into the origin. So every result
reads as written, not as a single hardcoded joke.
