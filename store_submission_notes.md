# Mirra — Edge Add-ons Store Submission Notes

Use this document as reference when filling out the submission form on the Microsoft Partner Center.

---

## Extension Name
Mirra

## Short Description (max 250 characters)
Mirra helps you distill deep AI conversations into lasting personal knowledge assets. Pin key insights from Google AI Studio, build your thinking library, and watch your cognition compound over time.

## Detailed Description
Most people finish an AI conversation and walk away with nothing. Mirra changes that.

**What Mirra does:**
Mirra is a side panel extension for Google AI Studio. While you're in a conversation, you can select any text — a key insight, a surprising reframe, a conclusion worth keeping — and pin it with a single click. Add a personal annotation, or just save it as-is.

When you've collected enough fragments, hit "Generate Mirra Insight" and the extension will distill your pinned moments into a structured knowledge asset: what you were struggling with, what shifted in your thinking, what to do next, and the perfect opening line for your next conversation on this topic.

Over time, Mirra builds a library of these assets. After 3 or more entries, a Cognitive Portrait appears — a living summary of your evolving thinking patterns.

**Key features:**
- Floating toolbar on text selection — pin or annotate in one click
- Highlighted pins persist visually on the page
- Side panel dashboard to manage all pins
- AI-powered insight generation (supports Gemini, DeepSeek, OpenAI APIs)
- Personal knowledge library with full history
- Cognitive Portrait that evolves as you accumulate insights
- All data stored locally — no account required, no data leaves your device

**Privacy:**
Mirra stores everything locally in your browser. No data is collected or sent to any server. Your API key is used only to communicate directly with your chosen AI provider.

---

## Category
Productivity

## Privacy Policy URL
[Host your privacy_policy.html file and paste the URL here]
→ Suggested: GitHub Pages, Notion public page, or any static hosting

---

## Permissions Justification
Use this text in the "Permission justification" field:

| Permission | Reason |
|---|---|
| `activeTab` | Required to inject the floating toolbar into the active Google AI Studio tab so users can select and pin text. |
| `storage` | Required to save pinned fragments, annotations, API keys, and generated insights locally on the user's device. No data leaves the device. |
| `sidePanel` | Required to render the Mirra dashboard as a persistent side panel alongside the AI Studio interface. |
| `tabs` | Required to open the knowledge library in a new tab when the user clicks "View Library". |
| `host_permissions: aistudio.google.com` | The extension is purpose-built for Google AI Studio. Content scripts are injected only on this domain to enable text selection functionality. |

---

## Screenshots needed (prepare separately)
1. **440 × 280 px** — Promotional tile (required)
2. **1280 × 800 px** — At least 1 screenshot showing the side panel open in Google AI Studio
3. Optional: second screenshot showing the knowledge library page

