# CliniDeck — Rate-Limit-Proof Full-Book Extraction Engine

Upgrade CliniDeck's extraction pipeline so multi-hundred-page medical PDFs (such as 188-page / 115 MB NEET PG rapid revision notes) adapt automatically to Gemini API rate limits, rotate across separate model quota pools, and patiently wait out full quota cooldowns without ever skipping pages.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> All three architectural preferences below were confirmed during clarification and will govern the implementation. Review the plan and click **Proceed** to begin building.

- **Confirmed Decision 1 — Adaptive Pacing**: CliniDeck will automatically adjust the delay between batches based on live API feedback—slowing down when rate limits are encountered and gradually speeding back up after clean consecutive batches—so extraction naturally stays below RPM/TPM ceilings.
- **Confirmed Decision 2 — Zero Page Skipping on Rate Limits**: Per-minute `429` rate limits will never cause a batch to be abandoned or marked skipped. CliniDeck will wait out the full quota reset window with a live countdown and retry until the batch succeeds (while keeping **Pause** and **Stop & Keep** responsive at every second).
- **Confirmed Decision 3 — Dual-Model Quota Rotation**: The backend will pool `gemini-4-hydrogen` (low-latency thinking mode) and `gemini-3.1-flash-lite` (independent per-model quota bucket), automatically routing to whichever model currently has available quota when the other is cooling down.

---

## 1. Overview & Core Concept

- **What It Does**: Transforms CliniDeck's batch runner from a fixed-interval, fixed-retry uploader into a self-regulating, quota-aware extraction scheduler capable of processing entire 188+ page medical books hands-free.
- **Target Audience / Persona**: NEET PG, INI-CET, and medical students uploading large scanned or illustrated rapid-revision PDFs (100–250 MB) who want every single page converted into flashcards, Q&As, and MCQs reliably—even on free or standard-tier API rate limits.
- **Key Value**: Eliminates cascading `429` failures and skipped page ranges (`Skipped pages: 11-15`) by combining proactive adaptive pacing, cross-model quota rotation, and patient full-window cooldown waits.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Steady-State Extraction**: After starting a 188-page PDF extraction, batches flow sequentially with an adaptive inter-batch breather (starting at 4.5s) and smaller 2.0 MB slices for fast uploads and lower per-request token spikes.
2. **Seamless Model Rotation (Zero Interruption)**: If the primary model hits its per-minute quota on batch *N*, the server immediately records that model's cooldown window and fulfills batch *N* on the secondary fast-lite model in the exact same request—no error toast, no skipped page, no lost momentum.
3. **Full-Window Cooldown Wait**: Only when *both* models are simultaneously cooling down does the UI enter a calm, informative cooldown state:
   - Progress header displays the exact live countdown (e.g., `Quota window cooling down on pp. 11–15 — resuming in 54s`) alongside the current adaptive pacing cadence (`Pacing: 12s/batch`) and active model indicator.
   - Once the countdown finishes, CliniDeck immediately retries the exact same pages (`pp. 11–15`) until they succeed—never advancing past an unfinished batch.
4. **Daily Quota Guardrail**: If the API specifically reports a *daily* quota exhaustion (`RPD`), CliniDeck distinguishes it from a per-minute limit, pauses the job cleanly with all extracted cards already saved in IndexedDB, and displays a clear notice explaining that extraction can be resumed once daily quota resets.
5. **Always-Responsive Controls**: Clicking **Pause** or **Stop & Keep** interrupts any active cooldown countdown immediately while preserving every completed page and generated card locally.

### Visual Identity & Theme
- **Aesthetic Direction**: Preserves CliniDeck's crisp clinical daylight workspace (`#F8FAFC` background, `#FFFFFF` cards, `#0284C7` clinical sky accent, `#0F172A` ink) and matching dark mode (`#0B1120` / `#111827`).
- **Typography & Hierarchy**: Tabular monospace numerals (`JetBrains Mono` / `tabular-nums`) for live cooldown timers, adaptive pacing cadence (`e.g. 9s/batch`), and page/card counters so numbers never jitter while ticking down.
- **Component Styling & Layout**: Zero-pill discipline—live model status and pacing cadence render as clean inline typographic metadata (`·`) within the existing extraction monitor and sticky study banner, with soft single-border amber callouts reserved strictly for paused/daily-limit alerts.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Server-Side Model Pool Cooldown Registry vs. Blind Retries**
  - *Chosen Approach*: Track per-model `cooldownUntil` timestamps on the server for both `gemini-4-hydrogen` and `gemini-3.1-flash-lite`. Before making an API call, immediately skip any model currently inside its cooldown window and use the available model; only return HTTP `429` to the browser when every model in the pool is cooling down, along with the exact minimum wait time until the next model reopens.
  - *Why*: Eliminates wasted `429` round-trips against a model we already know is rate-limited, doubles effective per-minute throughput across two independent model quota buckets, and gives the browser exact countdown timing.
  - *Alternatives Considered*: Always hitting the primary model first and only falling back after a failed call—rejected because every batch during a 60-second cooldown would waste an extra failing API request.

- **Decision 2 — Adaptive AIMD (Additive Decrease / Multiplicative Increase) Pacing**
  - *Chosen Approach*: Start with a conservative `4.5s` pacing gap between batches. Each time a pooled `429` occurs, step up the inter-batch delay (`4.5s → 9s → 14s → 20s → 28s`). After 4 consecutive clean `200 OK` batches with zero `429`s, gently decrease the delay by ~20% (down to the `4.5s` floor).
  - *Why*: Automatically discovers the exact sustainable throughput of the user's API key (whether free-tier or higher-tier) without requiring manual rate-limit configuration.
  - *Alternatives Considered*: Fixed 15-second delay for everyone—rejected because it unnecessarily slows down higher-tier keys while still potentially colliding with strict TPM windows on dense image pages.

- **Decision 3 — Patient Infinite Cooldown Wait for Per-Minute Limits vs. Daily-Quota Pause**
  - *Chosen Approach*: Remove the 4-retry skip cap for per-minute (`RPM`/`TPM`) `429` responses. Wait out the full server-provided cooldown (scaling cleanly up to 65 seconds on consecutive minute-window hits so the rolling 60-second token bucket fully clears). Conversely, parse Gemini error strings for daily-limit markers (`PerDay` / `RPD`) and pause cleanly rather than spinning endlessly.
  - *Why*: Guarantees 100% page coverage across 188-page PDFs on per-minute limits while handling hard daily caps honestly and safely.
  - *Alternatives Considered*: Deferring failed batches to the end—rejected because deferring causes out-of-order decks and still collides with the same rate limit unless pacing adapts.

- **Decision 4 — Tighter 2.0 MB Proxy-Safe Slice Ceiling**
  - *Chosen Approach*: Lower the adaptive PDF micro-slice cap from 3.5 MB to 2.0 MB.
  - *Why*: Network diagnostics showed slices near 3–3.5 MB taking 11–12 seconds to upload and triggering preview proxy `302` checks before splitting. Keeping slices under 2.0 MB speeds up uploads, prevents unnecessary `302` splits, and reduces per-request multimodal token spikes that trigger TPM limits.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Request Flow Diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    Browser: Adaptive Batch Scheduler                    │
│  ┌─────────────────────┐   ┌──────────────────────────────────────────┐ │
│  │  PDF Slicer (2 MB)  │──▶│  Adaptive Pacing Controller (AIMD)       │ │
│  │  3-8 pp -> <= 2 MB  │   │  • Delay: 4.5s .. 28s (auto-adjusts)     │ │
│  └─────────────────────┘   │  • Per-min 429: full countdown, 0 skips  │ │
│                            │  • Daily 429: safe pause + alert banner  │ │
│                            │  • 302 redirect: health check / refresh  │ │
│                            └────────────────────┬─────────────────────┘ │
└─────────────────────────────────────────────────┼───────────────────────┘
                                                  │ POST /api/extract-batch
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│               Express Server: Dual-Model Quota Pool Router              │
│                                                                         │
│  Model Pool State (in-memory cooldown registry):                        │
│  ┌──────────────────────────────────┐  ┌──────────────────────────────┐ │
│  │ Model A: gemini-4-hydrogen       │  │ Model B: gemini-3.1-flash-   │ │
│  │ (ThinkingLevel.LOW)              │  │          lite                │ │
│  │ cooldownUntil: timestamp         │  │ cooldownUntil: timestamp     │ │
│  └───────────────┬──────────────────┘  └──────────────┬───────────────┘ │
│                  │ 429 / 503? Mark cooldown           │                 │
│                  └───────────▶ Rotate immediately ───▶┘                 │
│                                                                         │
│  • If either succeeds ──▶ 200 OK JSON + { modelUsed, cards/QA/MCQs }    │
│  • If both cooling    ──▶ 429 JSON + { retryAfterSeconds, quotaScope }  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State
- **Server Quota Pool State**: In-memory registry per model storing `cooldownUntil` (epoch ms), `consecutiveRateLimits`, and `dailyExhaustedUntil` so repeated requests never hammer an actively cooling model.
- **Extraction Job Progress State (Client)**: Extended with `currentPacingSeconds` (live adaptive gap), `activeModelLabel` (e.g., `Flash` or `Flash Lite`), and `cooldownRemainingSeconds` (or formatted countdown label) alongside existing `sessionAlert`, `completedPages`, `cardsAdded`, `qaAdded`, and `mcqsAdded`.
- **Deck Persistence**: Unchanged atomic IndexedDB save after every completed batch, ensuring every extracted page and card survives reloads or daily-quota pauses.

### Interactive Component & State Mapping
- **Upload Monitor & Sticky Extraction Banner**:
  - Live countdown ticker updates every second during pooled cooldowns and resets cleanly on **Pause** or **Stop & Keep**.
  - Inline typographic readout displays current adaptive pacing (`Pacing: Xs/batch`) and active extraction model (`Gemini 4 Flash` / `Flash Lite`) without cluttering the layout.
  - If a daily quota limit (`quotaScope === 'daily'`) is detected, automatically flips job state to `paused` and surfaces a calm amber guidance callout with a **Resume** button.
- **Batch Runner State Transitions**:
  - `200 OK` → persist items to IndexedDB → increment clean-batch streak → step pacing down after 4 clean batches → wait adaptive pacing gap → proceed to next slice.
  - `429 (quotaScope: 'minute')` → step pacing up → wait full `retryAfterSeconds` countdown (buffered +3s, stepping to 65s if consecutive) → retry the exact same slice without advancing or marking skipped.
  - `429 (quotaScope: 'daily')` → pause job safely → preserve exact current slice so clicking **Resume** picks up on the exact same page.
  - `302 / opaqueredirect` → existing session-health check, silent iframe refresh, or safe pause preserved intact.
