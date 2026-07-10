# Wangku — Project Documentation

Wangku is an AI-powered personal finance tracker for the Indonesian market (Bahasa Indonesia UI, IDR pricing), built as a no-build-step PWA (plain HTML/CSS/JS) backed by Supabase, distributed on Android as a TWA via Bubblewrap.

## Read this first if you're picking up this project

**If you are Claude Code (or any engineer) starting a session on this repo, read the docs in this order before touching code:**
1. This file (workflow + snapshot)
2. [architecture.md](./architecture.md) — the big picture
3. [database.md](./database.md) — every table, RLS model, migration history
4. [features.md](./features.md) — what exists, where it lives

Then reference the others (`frontend.md`, `backend.md`, `ai.md`, `api.md`, `environment.md`, `deployment.md`) as needed for the specific area you're touching. `roadmap.md` lists known gaps and technical debt — check it before assuming something is "done."

## How this project is run

This project is split between two roles, deliberately:

- **Product / Planning (Claude, in chat)** — brainstorming, UX decisions, architecture, writing specifications, reviewing screenshots, planning features. Does **not** write code.
- **Engineering (Claude Code)** — implements everything: reads specs and this `/docs` folder, writes/edits the actual files, runs and tests changes.

**What this means for Claude Code specifically:** you will typically receive a spec, a UX decision, or a bug description that originated from a planning conversation, not raw code. Use this `/docs` folder as ground truth for the *current* state of the app — it's kept up to date after every shipped change. If a spec you receive conflicts with what's in these docs, flag the conflict rather than silently picking one.

**Workflow going forward:**
1. Product/planning happens in chat → produces a clear spec or decision.
2. That spec gets handed to Claude Code along with a pointer to relevant docs here.
3. Claude Code implements, and — this is important — **updates the relevant `.md` file(s) in the same change**, not as an afterthought. Stale docs are treated as a bug.
4. Anything shipped as a workaround, compromise, or with a known gap gets logged in `roadmap.md` under Technical Debt, not left undocumented.

## Snapshot (current state)

| | |
|---|---|
| Frontend | Plain HTML/CSS/JS, no framework, no build step |
| Backend | Supabase (Postgres + PostgREST), custom RPC-based auth (not Supabase Auth) |
| Auth model | Custom JWT signed inside Postgres (`pgcrypto` + hand-rolled HS256), enforced via real per-user RLS on every table |
| AI | Groq API, proxied through Vercel serverless functions (`/api/ai-chat`, `/api/ai-scan`) — **the API key never reaches the browser** |
| Hosting | Vercel (`ai-finance-app-gamma.vercel.app`) |
| Android | TWA via Bubblewrap, signed with `android.keystore` |
| Admin panel | `admin.html`, separate app, real login against `role='admin'` accounts (no longer a shared static password) |
| Repo | `github.com/ariftafachrizal/ai-finance-app` (Arif's fork) |
| Release status | Still testing-only (Arif + close testers). Not yet released publicly. |

## What's been built (high level — see features.md for the full tree)

- **Core ledger**: transactions (pemasukan/pengeluaran/transfer), multiple accounts (with a permanent default "Cash" account), unified default+custom categories and priorities, savings targets with direct contribution flow.
- **Home dashboard**: all-time running balance, 7-day sparkline, AI-generated insight card (rule-based, cycles through a few observations), financial health score gauge, nearest-target card, recent transactions with filters.
- **Laporan**: a full financial report — trends vs. last month, category donuts, priority breakdown, rule-based recommendations.
- **Settings**: profile w/ avatar, account management, category/priority management (full pages, not popups), notification preferences, plan upgrade flow, data reset with multi-step confirmation.
- **Security hardening** (this was a multi-round effort — see roadmap.md for the full history): Groq key moved server-side, password hashes no longer bulk-readable, forgot-password OTP validated server-side, and — the big one — real per-user row-level security via custom-signed JWTs, replacing the original "anyone with the anon key can read/write anyone's data" state.
- **Admin panel**: real authentication, admin/App-user segregation, transactions view with account column.

## What's explicitly on hold / deferred
- **Fonnte WhatsApp bot enhancement** (reading account name from messages) — on hold; the actual live Apps Script for the bot was never shared, so `gas/wangku-backend.gs` in this repo is an unverified draft, not a confirmed patch to what's running in production.
- **Token refresh** — sessions expire after 30 days and force a full re-login; no refresh flow yet.
- **Registration email verification** is still checked client-side only (unlike the forgot-password OTP, which was moved server-side) — a real but lower-severity gap.

## How to keep this updated
Whenever a change ships:
1. Update the relevant doc(s) in the same session — don't defer it.
2. New table/column → update `database.md`'s ERD and migration-block list.
3. New page/feature → add it to `features.md`'s tree.
4. New external call (API, webhook, RPC) → add it to `api.md`.
5. Anything shipped as a workaround/compromise → log it in `roadmap.md` under Technical Debt.
