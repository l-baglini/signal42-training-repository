# OneTag Inspector

A Chrome extension (Manifest V3) that monitors every iframe on any page,
detects ads served by OneTag, and lists them in a custom DevTools panel.
Clicking an entry reveals that ad's iframe in the **Elements** panel.

## Detection rule

A sub-frame is considered a OneTag ad when **either**:

- its iframe URL is `https` on a OneTag host, **or**
- its document contains a `<script>` whose URL is `https` on a OneTag host.

OneTag hosts: `onetag-sys.com`, `local.onetag.net`, **and their subdomains**
(production ads are served from subdomains like `serv-eu-1.onetag-sys.com`).

The `/usync` (user-sync API) and `/static/topicsapi.html` (Topics API) paths are
**ignored** in both cases — they're related to the ad system but distinct from
it. The page's own top document is never
treated as an ad (only sub-frames are), so a publisher page that merely embeds
the OneTag library script is not flagged.

## Build

```bash
npm install
npm run build      # outputs the loadable extension into ./dist
npm run watch      # rebuild JS on change (run `npm run build` first for assets)
npm run clean      # remove ./dist
```

## Load into Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the `dist/` folder.

The toolbar icon is a plain red circle and acts as a status light: it stays
**disabled (greyed out)** on any tab where no OneTag ad is detected, and becomes
active once one is found.

## Using the panel

1. Open a page that serves OneTag ads — the toolbar icon turns active.
2. Open DevTools (F12) and select the **OneTag Inspector** panel.
3. The **Overview** section shows page-level info for ad ops: domain, a link to
   the site's `ads.txt`, the **OneTag accounts declared in it** (a collapsible
   list, collapsed by default and fetched lazily on first expand, cross-
   referenced with OneTag's `sellers.json` to show each seller's name / domain /
   type instead of raw IDs), transport (https), detected consent
   APIs (TCF v2 / US Privacy / GPP), iframe count, page timing (DCL / load), and
   the live auto-refresh rate (hover its **?** for details).
4. The **Integration method** section reports how OneTag is integrated:
   - on `local.onetag.net` it shows a local-development note (no integration);
   - otherwise it detects the integration method — **Prebid**, **GPT**, or
     **GPT + Prebid** — and shows page-level debug info for each:
     - **Prebid**, split into **Auctions** (stats — auction count, wins,
       timeouts, rejections, floors — plus the auctions captured across page
       auto-refreshes) and **AdUnits** (the current per-ad-unit bid breakdown:
       bidder, CPM, floor, win/loss status and reason). Each ad unit is a
       collapsible block (expanded by default only when OneTag won it); the
       winner has a ↗ button that reveals and scrolls to its slot element.
     - **GPT**, split into **Renders** (stats + slot renders captured across
       auto-refreshes) and **Slots** (current slots): ad unit path, element,
       sizes, the Prebid winner handed to GAM (`hb_bidder`/`hb_pb`), render
       result (rendered/empty), and GAM line item / creative / advertiser ids.
       Slots served by OneTag are emphasised and expanded.
   - When a page **auto-refreshes itself** to reload ads, those sections aren't
     reset: the previous load's auctions/renders are kept (greyed) above a
     "↻ page refreshed" marker, with a `↻N` count and a live **auto-refresh rate** in
     the Overview (`N× · every ~30s · last 12s ago`). Only *automatic* refreshes
     count — a manual reload (F5/Ctrl-R) or a navigation to another page resets
     it. A reload (meta refresh, `location.href`/`replace`, or
     `location.reload()`) counts as automatic; F5 / Ctrl-R are excluded because
     the page-side heuristic sees their key press just before the reload. The
     browser's reload button can't be observed as a page event and is
     indistinguishable from `location.reload()`, so it's counted too (an
     accepted false positive).
5. The **OneTag ads** section (collapsible, with a count badge; expanded only
   when at least one ad is detected) lists the detected ads. Click any row to
   reveal that ad's `<iframe>` element in the **Elements** panel. A ⚠ next to an
   ad means it (or one of its ancestors, across container iframes) is hidden or
   zero-sized — `display:none`, `visibility:hidden`, `opacity:0`, `0×0`, or
   `[hidden]`; hover the icon for the offending elements.
6. If an ad is removed from the page while the panel is open, it isn't dropped:
   it moves to a **Closed** section at the bottom of the list (greyed out and
   non-clickable, since its iframe no longer exists).

> Note: revealing a node in the Elements panel uses the DevTools `inspect()`
> API, which only a DevTools page can call — hence the inspector lives in a
> DevTools panel rather than, say, a side panel.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/manifest.json` | Extension manifest (MV3) |
| `src/content.ts` | Runs in every frame: detects OneTag ads and reports them |
| `src/inject.ts` | MAIN-world script (document_start): refresh classification + GPT render log |
| `src/background.ts` | Service worker: registry, toolbar status, panel streaming, inspect-target resolution |
| `src/devtools.ts` / `src/devtools.html` | Registers the DevTools panel |
| `src/panel.ts` / `src/panel.html` | The DevTools panel UI (list + reveal-in-Elements) |
| `src/common.ts` | Shared OneTag URL helpers |
| `src/messages.ts` | Shared message/type contracts between the components |
| `scripts/generate-icons.js` | Generates the red-circle PNG icons at build time |
| `tsconfig.json` | TypeScript compiler config (used for type-checking) |
| `build.js` | esbuild bundler + asset copier |

The TypeScript sources are type-checked with `tsc --noEmit` and bundled to
plain JS by esbuild. The build tooling (`build.js`, `scripts/generate-icons.js`)
stays in Node-run JavaScript by design.

## Notes & limitations

- Detection is per-frame and self-reported by the content script: an
  onetag-hosted iframe and an iframe running an onetag script both execute the
  content script and report themselves, so each frame is a single entry no
  matter how many criteria it matches. (A frame that runs no scripts at all —
  e.g. sandboxed without `allow-scripts` — won't report itself, but onetag ad
  frames always execute scripts.)
- Iframe matching for highlighting is by resolved URL, which can be ambiguous if
  a page has multiple iframes with identical `src` values.
