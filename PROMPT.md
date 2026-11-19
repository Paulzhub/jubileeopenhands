# Build prompt: Jubilee Open Hands site

> Paste everything below the line into a new session to build the site.
> Member "Emma" in the ledger is **Emma Zoliannu**.

---

## 1. Goal

Build a responsive single-page website for **Jubilee Open Hands**, a savings group of 5 members who each pay Rs 500 a month. The page should look cinematic and feel tactile: a 3D particle background, a narrated 3D motion explainer in the hero, and a data section of interactive 3D charts with orbit controls. It must still be fully usable on a phone, with a keyboard, with reduced motion, and without WebGL.

- **Source of truth:** the GitHub repo `https://github.com/Paulzhub/jubileeopenhands` (branch `main`; right now it only has a LICENSE). Clone it into `C:\Users\Lenovo\OneDrive\Desktop\Claude Projects\Jubilee Open Hands`. That folder currently sits inside a stray git repo rooted at `C:\Users\Lenovo`, so the clone needs its own `.git`. Work on a branch such as `feat/site` and open a PR to `main`.
- **Delivery:** publish the page as a claude.ai **Artifact**, with the voice clips as supporting files. Keep the same files in the repo so GitHub Pages can serve them too.
- **Skill:** follow `/immersive-scene-interactions` (tiers: Core, Polish, 3D, a slim Tour player). Read its `architecture.md`, `theming.md`, `motion.md`, `three.md`, `audio.md` and `accessibility.md` before writing code.

## 2. Stack and constraints

- Vanilla HTML, CSS and JS (ES modules), with no build step. Files: `index.html`, `css/`, `js/`, `data/ledger.json`, `voice/`.
- CDN only, pinned exact versions: `three@0.160.0` (with `examples/jsm` OrbitControls, EffectComposer, UnrealBloomPass) and `gsap@3.12.5` + ScrollTrigger from cdn.jsdelivr.net/npm or cdnjs. No `latest` and no `^` ranges.
- Fonts from Google Fonts only:
  - **Fraunces** (variable; its `opsz` and `SOFT` axes animate the headline) for display text.
  - **Manrope** for UI and body text.
  - **JetBrains Mono** with tabular numerals for amounts and counters.
- Budget: 200 KB or less of initial JS of our own. Lazy-load three.js and the chart scenes when they come near the viewport.
- Spacing: use only multiples of 8, set as tokens: `--s1: 8px` … `--s12: 96px`. The mobile side gutter is 16px (`--s2`).
- Radii must be concentric: an inner radius equals the outer radius minus the padding. Example: a card has radius 32 and padding 16, so its inner chip has radius 16. Tokens: `--r-xl: 32`, `--r-lg: 24`, `--r-md: 16`, `--r-sm: 8`.

## 3. Theme (Dark/Light toggle)

The theme toggle cycles **System → Light → Dark**. Resolve the theme before first paint, remember it in `localStorage` (wrapped in try/catch), and morph the toggle icon from sun to moon with a View Transition circular reveal that starts from the button.

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#EEF3F3` (a tint of #97B3B6) | `#2C3732` |
| `--surface` | `#97B3B6` at 24% on glass | `#2C3732` lifted to `#36443E` |
| `--brand` | `#97B3B6` | `#97B3B6` (as an accent; it passes 4.5:1 on #2C3732) |
| `--accent` | `#B88F7A` (fills and large shapes only) | `#874844` (fills only) |
| `--accent-ink` | `#874844` (accent text that passes 4.5:1) | `#D9B3A2` (a light clay for accent text) |
| `--text` | `#1E2724` | `#EEF3F3` |
| `--paid` / `--unpaid` | `#97B3B6` / `#B88F7A` with a striped pattern | `#97B3B6` / `#874844` with a striped pattern |

Mix the two palettes in each theme. Light mode borrows the oxblood for accent text, and dark mode borrows the sage for highlights. Every text pair must reach 4.5:1. Paid and unpaid must also differ by pattern or icon, never by colour alone.

## 4. Data (`data/ledger.json`, the single source for every view)

```json
{
  "group": "Jubilee Open Hands",
  "currency": "INR",
  "monthlyDue": 500,
  "members": [
    { "id": "paulz", "name": "Paulz" },
    { "id": "ms",    "name": "MS" },
    { "id": "elis",  "name": "Elis Chacha" },
    { "id": "emma",  "name": "Emma Zoliannu" },
    { "id": "james", "name": "Theologian James" }
  ],
  "months": [
    { "month": "2026-06", "paid": ["paulz","ms","elis","emma","james"] },
    { "month": "2026-07", "paid": ["paulz","ms","elis","emma","james"] },
    { "month": "2026-08", "paid": ["paulz","ms","elis","emma","james"] },
    { "month": "2026-09", "paid": ["paulz","ms","elis","emma","james"] },
    { "month": "2026-10", "paid": ["paulz","ms","elis","emma","james"] },
    { "month": "2026-11", "paid": ["paulz","ms","elis","emma"] }
  ]
}
```

Compute every figure in code from this file and never hard-code it. The expected results are:

- Monthly totals: 2500 ×5, then 2000.
- **Grand total in hand: Rs 14,500.** Expected so far: Rs 15,000, so the collection rate is 96.7%. **Outstanding: Rs 500** (James, Nov).
- Per member: Rs 3,000 each, except James at Rs 2,500.
- The cumulative line runs 2,500 → 5,000 → 7,500 → 10,000 → 12,500 → 14,500.
- The current paid streak is 6 months for four members. James has a 5-month streak, which ended in Nov.

Format amounts with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })`.

## 5. Page structure

1. **Loading screen.** Show the "JOH" monogram drawn as an SVG line. Under it, a counter runs from 0 to 100% and follows real asset progress (fonts, three.js, the first voice clip). When loading finishes, a two-layer curtain wipes upward to reveal the page. Keep it under 2.5 s, and let the user skip it with a key press or tap.
2. **Pinned menu bar.** Show the wordmark "Jubilee Open Hands" in Fraunces, then the section links (Explainer, Insights, Members, Ledger), the theme toggle and the sound toggle. The bar sticks to the top. Once the page scrolls more than 24px, it changes over 240ms:
   - it turns into translucent glass (`backdrop-filter: blur(16px) saturate(140%)`, background at 64% opacity);
   - it gains a hairline border and a soft shadow;
   - its height shrinks from 80 to 64px, and the wordmark tightens its letter spacing (sticky transform).

   The link for the section in view gets a sliding pill underline (clear active state). On a phone, the links fold into a menu sheet that slides out with a clip reveal.
3. **Hero: JUBILEE OPEN HANDS.**
   - The headline reveals one character at a time, masked and staggered at 24ms per character. Fraunces `opsz` and `SOFT` ease from 144/0 to 72/100 as it settles.
   - Below it sits a **3D motion explainer** with a female Kokoro voiceover (see §7).
   - There are two magnetic CTAs, "▶ Watch the story" and "See the numbers". Each has a 0.3 magnetic pull, a pressed scale of 0.96, and a ripple for button feedback.
   - A scroll cue pulses at the bottom of the hero.
4. **Stats strip.** Four glass KPI cards: Total in hand ₹14,500, Collection rate 96.7%, Months running 6, Members 5.
   - Counters count up when the strip enters view, and the digits scramble before they settle.
   - The cards fade and lift in with a staggered appearance (80ms between cards).
   - On hover, a card tilts by 6° or less, a specular highlight follows the cursor, and the shadow deepens (layered depth).
5. **Data visualisation: "Insights".** A tab bar switches between six 3D views. The tab indicator slides between tabs, and the content crossfades as it changes (see §6).
6. **Members.** One card per member, each with an avatar (an initials orb), the amount contributed, a streak badge and a mini 6-dot payment strip.
   - On hover, a preview grows out showing that member's month-by-month history.
   - The avatar zooms 1.08× inside its concentric frame, and the name gets a text hover effect: a split-letter wave.
   - James's card shows a gentle "Nov pending" chip with a tooltip.
7. **Ledger timeline.** A pinned horizontal scroll runs through the six months on desktop and becomes a vertical list on a phone.
   - Each month card expands on click to show who paid, the ✅ ticks and the total. It uses an expand-and-confirm pattern with an aria-expanded disclosure.
   - A fully paid month plays a small success burst of confetti in brand colours. Reduced motion replaces the burst with a static check.
   - An SVG line draws the running total as you scroll.
8. **Footer.** "© 2026 Jubilee Open Hands", a back-to-top magnetic button and a tiny marquee reading "Open hands · open hearts · saving together ·".

## 6. 3D data visualisations (three.js + OrbitControls)

- **Shared controls.** Each chart sits in a glass panel and has OrbitControls with 360° rotation, damping and zoom (min/max clamped). On a fine pointer, these controls switch on when the user hovers the panel or clicks it. On touch, they switch on with a tap, and the panel shows "Tap to interact" so the page scroll is never stolen. The wheel only zooms while the panel is active, and Esc releases the panel.
- **Shared behaviour.** Every chart has:
  - hover hotspots with tooltips (an HTML label projected from 3D);
  - auto-rotate after 4 s idle;
  - a "Reset view" button and a "Download PNG" snapshot button;
  - a skeleton shimmer while it lazy-loads;
  - a visually hidden data table with the same numbers for screen readers;
  - a 2D SVG fallback when WebGL is unavailable.

| Tab | Visual | Data |
|---|---|---|
| Overview | **3D bar city**: a 6 × 5 grid of rounded columns (month × member) that rise from the floor with a stagger. Paid columns are sage glass; the unpaid one is a hollow clay wireframe. | Paid matrix |
| Monthly | **3D bars** of monthly totals with a value cap on each. The Nov bar is shorter and shows a ghost outline up to 2500. | Monthly totals |
| Growth | **3D ribbon/area line** of the cumulative total climbing to 14,500, with a camera fly-through along the spline on scroll. | Cumulative |
| Share | **3D donut/pie** of contribution per member. Each slice is extruded and lifts out on hover, and clicking a slice filters the other charts. | Per member |
| Collection | **3D radial gauge**: a torus filled to 96.7%. The remaining 3.3% is the outstanding ₹500, which glows softly. | Rate |
| Heatmap | **Payment heatmap** of extruded tiles (month × member), with a hover preview of each cell. | Paid matrix |

Use bloom on the highlights, soft shadows, a lighting preset for each theme, and a "lens breath" FOV punch of 2° when the tab changes.

## 7. Hero 3D motion explainer + Kokoro voiceover

There are 6 scenes, about 40 s in total, driven by one timeline clock. Captions (WebVTT) and a transcript toggle are always available.

| # | Visual | Narration (female voice `af_heart`, American English) |
|---|---|---|
| 1 | Five glowing orbs drift in from the particle field. | "This is Jubilee Open Hands — five friends who decided to save together." |
| 2 | Each orb shows a name label: Paulz, MS, Elis, Emma, James. | "Paulz, MS, Elis, Emma and James each put in five hundred rupees every month." |
| 3 | Coins arc from each orb into a central glass jar, month by month from June to October. | "From June to October, every single member paid — twenty-five hundred rupees, every month." |
| 4 | In November, four coins land and one slot stays open. | "In November, four of five payments came in." |
| 5 | The jar fills and a counter rolls to ₹14,500. | "Together, we now hold fourteen thousand five hundred rupees." |
| 6 | The orbs join hands in a ring, and the camera pulls back into the page. | "Open hands, growing together. Scroll down to explore our numbers." |

- **Voice:** generate the clips at build time with Python `kokoro` (`KPipeline(lang_code='a')`, voice `af_heart`). Save them as Opus, with an M4A copy for older Safari, plus a `voice/manifest.json` of clip durations. Each scene's length comes from its clip's length. If Python or Kokoro isn't available, fall back to `kokoro-js@1.2.1` in a Web Worker, started only when the user presses Play and with visible progress.
- **Audio rules:** sound starts only after a user gesture, so show a "Tap for sound" hint until then. Voice and sound effects have separate mute toggles. Captions stay on by default.
- **Player:** play/pause, a scrubber with chapter ticks, captions toggle, a 1×/1.25×/1.5× speed control, fullscreen, and orbit/zoom while paused. Wire up Media Session as well.

## 8. Background: interactive 3D orb particles

Behind everything sits a single fixed three.js canvas (`aria-hidden`) with roughly 1,200 instanced soft orbs, using additive blending and depth fade.

- **Scroll:** scrolling drives camera dolly and particle drift. The orbs tint toward the theme colours of the section in view.
- **Pointer and touch:** the cursor or touch point acts as a repulsor force field. Touch leaves ripples, and a tap sends out a pulse wave.
- **Phones:** use gyroscope tilt, but only after a permission tap.

Use adaptive quality to keep the frame rate steady. Halve the particle count and drop bloom when the frame time stays above 20ms, and start at half the count on mobile. Pause the loop when the tab is hidden. Under reduced motion, show a static gradient with a few still orbs instead.

## 9. Motion and interaction checklist (map every requested effect)

| Effect | Where |
|---|---|
| Loading screen, loading motion | §5.1 monogram line draw and progress counter |
| Headline reveal, clip reveal | Hero title, section titles (`clip-path` inset from 100% to 0) |
| Magnetic buttons / CTA | Hero CTAs, back-to-top, tab buttons (fine pointer only) |
| Staggered scroll, staggered appearance, fade & lift, scroll reveal, content reveal | KPI cards, member cards, month cards (GSAP ScrollTrigger, 80ms stagger, y 24 → 0, opacity 0 → 1) |
| Page transitions, smooth page transitions | Nav clicks scroll smoothly. The section title re-reveals, and a View Transition crossfades the tab panels. |
| Cursor with context, subtle cursor trail | A dot and ring cursor whose label changes with context: "Drag" over charts, "Play" over the explainer, "Open" on month cards. A 6-point fading trail in brand colours. Fine pointer only. |
| Micro-interactions, button feedback, interactive icons | Press scale, ripple, an icon morph for the theme and sound toggles, play↔pause morph |
| Loading states, skeleton screens | Chart panels and member cards before data loads |
| Shadows, layered depth | Three-level elevation tokens (`--shadow-1/2/3`) tinted with the theme colours, plus parallax depth in the hero |
| Concentric radii | All nested cards, chips and buttons (§2) |
| Image zoom, text interaction | Member avatars; a split-letter wave on names and nav links |
| Sticky transform | Menu bar (§5.2) |
| Expand and confirm, clear state change | Month cards expand. The member filter shows a clear "Filtered: MS ✕" chip. |
| Clear active state | Nav pill, tab indicator, active chart slice |
| Hover preview | Member history popover, heatmap cell preview |
| Success feedback | Confetti on fully paid months; a "Snapshot saved" toast |
| Tooltips | Chart hotspots, the pending chip, icon buttons (accessible, shown on focus as well as hover) |

**Extra effects from `/immersive-scene-interactions`:**
- a rolling ghost numeral of the month number behind the ledger;
- a scroll progress rail on the right edge;
- a film-grain overlay at 3% opacity;
- brand-coloured text selection;
- bloom and lens breath (§6);
- a keyboard shortcuts overlay (`?`), with T for theme, M for mute and Space for play;
- deep links (`#insights/share`);
- toasts.

## 10. Timing tokens

| Token | Value |
|---|---|
| `--dur-1` | 120ms (press) |
| `--dur-2` | 240ms (hover, state) |
| `--dur-3` | 480ms (reveal) |
| `--dur-4` | 800ms (curtain, hero) |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` |
| `--ease-in-out` | `cubic-bezier(.65,0,.35,1)` |
| `--ease-spring` | `cubic-bezier(.34,1.56,.64,1)` |

Under reduced motion, every duration becomes 0.01ms or a plain fade.

## 11. Definition of done

- Every listed effect works, and nothing beyond this list has been added.
- The layout has no horizontal scroll at 320px, every target is at least 44px, and nothing clips at 200% zoom.
- The axe scan is clean, a keyboard-only pass works through the whole page, and contrast passes in both themes.
- Reduced motion, no WebGL, blocked audio and blocked storage each still give a working page.
- The page holds a steady frame rate on a mid-range phone.
- All the numbers match §4 exactly.
- The page is published as an Artifact. The code is committed on a branch, with a PR opened to `main`.
