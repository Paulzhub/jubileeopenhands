# Jubilee Open Hands

A single-page site for our five-member savings group (₹500 each, every month).

- **Hero:** a narrated 3D explainer (Kokoro voice `af_heart`, captions, transcript).
- **Insights:** six interactive 3D charts (orbit, zoom, hover tooltips, snapshot).
- **Members** and a month-by-month **Ledger**.
- Dark/light/system theme, 3D orb particle background, reduced-motion and no-WebGL fallbacks.

All numbers are computed from [`data/ledger.json`](data/ledger.json). To add a month, append to `months` with the ids of everyone who paid.

## Run locally

```powershell
python -m http.server 5173
```

Then open http://localhost:5173.

## Regenerate the voiceover

Edit [`tools/narration.json`](tools/narration.json), then (with `kokoro-js@1.2.1` installed):

```powershell
node tools/gen-voice.mjs voice
```

## Build the claude.ai Artifact page

```powershell
node tools/build-artifact.mjs dist/artifact.html
```
