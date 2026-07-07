# Wangku — Project Documentation

Wangku is an AI-powered personal finance tracker for the Indonesian market (Bahasa Indonesia UI, IDR pricing), built as a no-build-step PWA (plain HTML/CSS/JS) backed by Supabase, distributed on Android as a TWA via Bubblewrap.

This `/docs` folder is a living map of the codebase. It should be updated whenever a feature, table, or integration changes — treat stale docs as a bug.

## Read this first
- **[architecture.md](./architecture.md)** — the big picture: stack, data flow, page routing, state management.
- **[database.md](./database.md)** — every table, column, relationship (ERD).
- **[features.md](./features.md)** — feature tree: what exists, where it lives.

## Then, as needed
- **[frontend.md](./frontend.md)** — file-by-file breakdown of `js/*.js`, `index.html`, CSS conventions.
- **[backend.md](./backend.md)** — Supabase usage patterns, Google Apps Script (Fonnte + backup).
- **[ai.md](./ai.md)** — every AI call in the app: chat assistant, receipt scanning.
- **[api.md](./api.md)** — every external endpoint the app talks to.
- **[environment.md](./environment.md)** — every credential/config value and where it lives.
- **[deployment.md](./deployment.md)** — Vercel hosting + Bubblewrap/TWA packaging.
- **[roadmap.md](./roadmap.md)** — known technical debt, open bugs, and what's next.

## Snapshot (as of this doc set)

| | |
|---|---|
| Frontend | Plain HTML/CSS/JS, no framework, no build step |
| Backend | Supabase (Postgres + REST API), Google Apps Script (WhatsApp bot + Drive backup) |
| AI | Groq API (Llama 4 Scout for receipt OCR, Llama 3.1/3.3 for chat) |
| Hosting | Vercel (`ai-finance-app-gamma.vercel.app`) |
| Android | TWA via Bubblewrap, signed with `android.keystore` |
| Auth | Custom (Supabase table + bcrypt-less password check client-side*), Email OTP, PIN, WebAuthn biometric |
| Repo | `github.com/ariftafachrizal/ai-finance-app` (Arif's fork) |

*See [backend.md](./backend.md) for the caveat on how auth actually works and its security implications — this is flagged as technical debt in [roadmap.md](./roadmap.md).

## How to keep this updated
Whenever you (or Claude, in a future session) ship a change:
1. Update the relevant doc(s) in the same session — don't defer it.
2. If a new table/column is added, update `database.md`'s ERD and table list.
3. If a new page/feature is added, add it to `features.md`'s tree.
4. If a new external call (API, webhook) is added, add it to `api.md`.
5. Log anything shipped as a workaround/compromise in `roadmap.md` under Technical Debt.
