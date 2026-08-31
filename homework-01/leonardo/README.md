# Zero-shot multilingual IAB content classification — `iab_biencoder_qwen3_4b_tier12.ipynb`

Tag the text of a web page with one or more **IAB Content Taxonomy** categories (Tier 1–2) — with a relevance score and a confidence filter — without any labelled training data and across many languages. A single bi-encoder, `Qwen/Qwen3-Embedding-4B`, tuned to run on a free Colab T4 GPU.

---

## Purpose

Given the (already cleaned) text of a web page, assign the IAB content categories that describe *what the page is about*. The problem has four defining constraints:

- **Multi-label** — a page can belong to several categories, each with a continuous **relevance score**, plus a **filter** that keeps only the sufficiently relevant ones.
- **Hierarchical** — IAB categories form a tree; this notebook keeps the two broadest levels (Tier 1 and Tier 2), which are the most stable and the easiest to validate.
- **Zero-shot** — there is **no annotated training set**; the only signal about a category is its label text.
- **Multilingual** — works for English, Italian, Spanish, German, French and Portuguese, and also Chinese, Russian and Japanese.

This is the kind of contextual page classification used in programmatic advertising to describe inventory.

## How it works

The task is framed as **cross-lingual semantic retrieval**, not supervised classification:

1. **Embed the categories and the page in a shared vector space.** Each IAB label is turned into a vector once; each page is turned into a vector at run time. **Relevance = cosine similarity** between page and label.
2. **Enrich the labels with their hierarchy path.** A category is embedded as `Tier 1 > Tier 2` rather than the bare name, which injects context and disambiguates short labels at zero cost.
3. **Cross-lingual matching with no translation.** The model aligns languages in one space, so a page in Italian (or Chinese, Russian, …) matches the English category labels directly — labels are never translated.
4. **Aggregate scores up the tree.** Each Tier 1 inherits the strongest score among its Tier 2 children, so a page about basketball also surfaces *Sports* (*relevant to a child ⇒ relevant to the ancestor*).
5. **Filter to a final set.** Keep categories above an absolute **floor** *and* within a **margin** of the page's best match, capped at **top-k**. A configurable **granularity** returns the most specific tags, rolls them up to Tier 1, or keeps both.

## Technical choices (and why)

- **Taxonomy — IAB Content Taxonomy 3.1, capped at Tier 1–2.** The current version is downloaded at run time from the official IAB Tech Lab repository, so it is never stale. Keeping only the top two tiers (~360 categories) yields coarser but more stable, less ambiguous tags, and makes retrieval faster.
- **Single-stage bi-encoder.** Labels are embedded once and the page once, then ranked by a single matrix multiply. This scales to the whole taxonomy with one model call per page and produces a continuous score, ideal for thresholding.
- **Model — `Qwen/Qwen3-Embedding-4B`.** A strong, instruction-aware multilingual embedding model. Loaded in **fp16** (~8 GB of weights) it fits a free Colab T4 (16 GB) comfortably, since no second model shares the GPU. A `Qwen/Qwen3-Embedding-0.6B` fallback is one line away if memory is tight.
- **Instruction-aware, asymmetric encoding.** Qwen3-Embedding distinguishes two roles. The **page is the query**, embedded with a task instruction in Qwen3's required format:

  ```
  Instruct: {task description}
  Query: {page text}
  ```

  The **IAB labels are documents**, embedded **plain** (no instruction). Editing the instruction to describe your real task can shift results by a few points. Last-token pooling and left padding (which Qwen3 needs) are handled by the `sentence-transformers` integration.
- **Hierarchy by enrichment + upward aggregation.** Preferred over flattening (which loses parents) or a top-down cascade (where early errors propagate); it keeps the tree consistent while staying simple.
- **Relative + absolute thresholding on the cosine scale.** Cosine scores are not calibrated probabilities and sit in a narrow band, so an absolute **floor** is combined with a **margin** from the page's top score and a **top-k** cap. All knobs are exposed for tuning.

## Running on Colab

1. `Runtime → Change runtime type → GPU (T4)`.
2. Run the cells top to bottom. The first run downloads the model (~8 GB in fp16) and the taxonomy.
3. Inspect the results table (100 pages, predictions + scores) and the single-example cell, then tune the thresholds.

The dependency cell upgrades only `sentence-transformers` and `transformers` (≥ 4.51, required by Qwen3) and **never** force-upgrades NumPy/pandas, which would break the running Colab kernel.

## Test dataset

A hardcoded DataFrame of **100 real pages** (`url`, `content`, `language`): 50 English and 50 Italian, sourced from stable, navigable **Wikipedia** articles so each prediction can be verified by opening the URL. `content` is a clean, topic-faithful excerpt — the "already cleaned text" the task assumes as input.

## Tuning and operation

- **Thresholds** (`floor`, `margin`, `top_k`) act on the **cosine** scale and are meant to be calibrated on the 100 hand-checkable examples via a small grid search.
- **Granularity** — `'specific'` for the most precise tag, `'tier1'` for broad buckets, `'all'` for the full consistent set.
- **Instruction** — keep the exact `Instruct: … \n Query: …` format and apply it only to pages, never to labels.
- **Memory** — fp16 keeps the 4B model around 8 GB; if you OOM, lower `batch_size`, reduce `max_seq_length`, or switch to `Qwen/Qwen3-Embedding-0.6B`.
- **Real pages** — excerpts here are short; for long raw pages raise `max_seq_length` (Qwen3 supports up to 32k tokens).
- **Persistence** — compute the label embeddings once and save them; per page the cost then collapses to a single instructed encoding plus a matrix-vector product.

## Limitations

- Zero-shot quality depends on how well a category's *name* captures its meaning; vague or idiosyncratic labels are harder.
- Public benchmark scores (e.g. MTEB) are only a proxy — always validate on your own pages and traffic.
- Capping at Tier 1–2 deliberately yields coarser tags.
- Thresholds are heuristic and must be tuned per deployment; they are not calibrated probabilities.
