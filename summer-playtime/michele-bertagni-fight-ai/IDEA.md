# Fight AI — Human vs. AI, fought with Reddit sentiment

## Concept

A 2D web fighting game, in the spirit of the early Tekken titles, with exactly two
fighters:

- **Human**
- **AI**

Nobody plays with a gamepad. The fight is driven entirely by what people are
actually saying about AI on Reddit. The match is a live visualization of public
sentiment, rendered as a brawl.

## How the fight is decided

1. The user picks a **time range** before the match starts (see below).
2. **Claude** reads two communities in parallel —
   <https://www.reddit.com/r/singularity/> and
   <https://www.reddit.com/r/artificial/> — and collects the posts published
   inside that time range, counting back from the current date (the date on which
   the user is running the app). The two feeds are merged chronologically, so the
   fight follows the mood of both communities as it actually unfolded rather than
   one subreddit after the other.
3. The LLM reads the **titles** of those posts and performs a **sentiment analysis**
   on how people feel about *using* AI.
4. Each analyzed title becomes one exchange in the fight:
   - **Positive sentiment about AI usage** → the **AI** lands a hit (punch or kick)
     on the Human.
   - **Negative sentiment about AI usage** → the **Human** lands a hit (punch or
     kick) on the AI.

## Time range selection

The user chooses the window of the fight from a fixed set of options, always
measured backwards from the day they are using the app:

- TODAY (since midnight this morning)
- YESTERDAY
- 2 DAYS AGO
- 3 DAYS AGO
- 4 DAYS AGO

Each option is cumulative: it runs from the start of that day up to now, so
YESTERDAY includes today as well. Every button in the UI shows the dates it
actually covers, so the meaning is never in doubt.

Four days is the ceiling on purpose. Without Reddit API credentials the app
reads the public Atom feed, which reaches back roughly a hundred posts - about
four days on a subreddit this busy. Offering a month the app cannot deliver
would just produce a thin fight and an apology.

The same window is what the local LLM uses to decide which Reddit post titles to
fetch and read. A wider window means more titles, therefore a longer fight.

## Combat rules

- Both fighters start with **10 health points**.
- Every landed hit (punch or kick) removes **1 point** from the opponent.
- The first fighter to bring the opponent down to **0** wins.
- On defeat, the loser **falls to the ground** — an explicit knockout animation
  closes the match.

## Pacing and watchability

The point of the game is to be *watched*, not rushed. The interface must update at
a speed that is pleasant for a spectator:

- Hits are played out one at a time, with enough delay between them to read what
  is happening.
- Each hit is paired with the post title that caused it, so the viewer understands
  *why* that punch landed.
- Health bars animate down rather than snapping to the new value.
- Analysis of the Reddit posts happens up front (or streams ahead of the
  animation), so the fight never stutters waiting on the LLM.

## Technical outline

- **Frontend:** web-based 2D game (canvas or DOM-based sprites) with idle, punch,
  kick, hit-reaction and knockout states for both characters.
- **Data sources:** Reddit r/singularity and r/artificial, read in parallel,
  merged chronologically, deduplicated, filtered by the selected time range. If
  one community is unreachable the fight goes ahead on the other.
- **Analysis:** a locally running LLM classifies each post title as positive or
  negative regarding AI usage.
- **Orchestration layer:** turns the ordered list of classifications into a queue
  of timed combat events, which the frontend consumes at a viewer-friendly rhythm.

## Why it is interesting

The scoreboard is not invented by the game — it is a live readout of the mood of
two communities about AI, over a window the viewer chooses. Ask for TODAY and you see
this morning's mood; ask for four days back and you see the week taking shape.
Either way, the answer arrives as a fistfight.
