# Munshi Desk

A chat-first clerk for a small pouch factory in India: orders, the machine plan and payments, in Hindi, Hinglish or English. Built on [Agent-Native](https://agent-native.com). Demo data only.

- **Live app:** https://munshi-desk.netlify.app
- **Demo video (3:47):** https://clips.agent-native.com/r/eg9of4Xxfz6y
- **Phone app:** [Munshi](https://github.com/ra-jeev/munshi), the voice-first iOS/Android version

The owner pastes a WhatsApp message, types, or speaks. Munshi reads the factory data, proposes the change as a card, and saves only after the owner approves the card.

## What it does

- **Orders from WhatsApp.** A pasted message becomes an order card with the default rate and the ready time. The owner can correct it, see a fresh preview, then approve.
- **Machine stops.** "Machine 1 is off tomorrow" runs the real scheduler, tries a few plans, and shows the best plan among the plans tried and whose delivery moves.
- **Payments by voice.** "Verma Foods ne UPI se 4000 diye" becomes a payment card with the balance before and after.
- **Operators.** An operator sees only their own machine's jobs and can report a breakdown. The owner sees the report on Today. Payments are owner-only, and the server checks this on every action.
- **Hindi screens.** The whole interface works in English and in Hindi.

## How it works

| Part | Job |
|---|---|
| Meta `muse-wonder-1.0` | The chat agent: reads data with actions and proposes cards |
| Planner sub-agent (`agents/planner.md`, `muse-wonder-1.0`) | Compares schedules with `simulate-schedule` and `search-plans` |
| Meta `muse-voice-transcribe-1.0` | The "Speak to Munshi" button (`server/routes/api/transcribe.post.ts`) |
| Gemini | The mic inside the chat box (Agent-Native's built-in dictation) |
| `actions/` | The only way to read or change data, for the screens and the agent |
| `server/domain/scheduler/` | The scheduler from the phone app, with tests |
| Postgres (Neon) + Netlify | Storage and hosting |

Every write is a two-step flow: `check-proposal` previews the change, and the owner approves it on the card, which calls `save-proposal` with a revision check. The agent never saves on its own.

## Run it

Needs Node 22+, pnpm and a Meta Model API key.

```bash
pnpm install
cp .env.example .env    # set DATABASE_URL, BETTER_AUTH_SECRET, OPENAI_API_KEY and META_API_KEY
pnpm dev
```

Sign up, then use **Today → Reset demo data** to load the fictional factory. To try an operator, add a teammate and link them to a machine in **Settings → Factory**.

## Tests

```bash
pnpm test
```
