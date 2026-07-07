# External Services & Endpoints

Wangku has no custom backend API — every network call from the client goes to one of these external services directly.

## Supabase (PostgREST)

Base: `${SB_URL}/rest/v1/` (constants in `js/config.js`). Auth header is the anon key, same for every request — there is no per-user token/session issued by Supabase (see [roadmap.md](./roadmap.md)).

All calls go through `sb(path, method, body)` in `ui-helpers.js`. There's no fixed list of "endpoints" — it's direct table access via PostgREST filter syntax. The tables hit, and typical query shapes:

| Table | Typical calls |
|---|---|
| `users` | `SELECT` on login/session check, `PATCH` for profile/plan/token updates |
| `accounts` | `SELECT` all for user, `POST`/`PATCH`/`DELETE` from Settings → Akun |
| `transactions` | `SELECT` with `tanggal=gte./lt.` range filters (this month, 7d, 30d), `jenis=eq.` filters, `POST` on add, `PATCH` on edit, `DELETE` on remove |
| `targets` | `SELECT` all for user, `POST`/`PATCH`/`DELETE` from Target page |
| `user_categories` / `user_priorities` | `SELECT` all for user (defaults + custom together), full CRUD from the dedicated management pages |
| `orders` | `POST` on payment submission, polled by `startStatusPoll()` in `payment.js` |
| `detected_transactions` | `SELECT status=eq.pending`, `PATCH status` on confirm/dismiss (never `INSERT`ed by this codebase — see `ai.md`) |

## Groq API

`https://api.groq.com/openai/v1/chat/completions` — used by both `chat-ai.js` (text) and `transactions.js`'s `scanStruk()` (vision, image input). API key is read via `getKey()` (`ui-helpers.js`), sourced from a "pool key" stored in `localStorage` (`wangku_pool_key`), settable from Settings.

## Google Apps Script Web App

One deployed URL (constant `GAS` in `config.js`), handling three request "actions" via `doPost`/`doGet` (see [backend.md](./backend.md) for the draft implementation):
- `?action=ping` — liveness check, called by `pingSheetSync()`.
- `{action:'backup', ...}` — Drive backup, called by `backupToDrive()`.
- (external) Fonnte webhook POST — inbound WhatsApp messages, not called by the web app itself.

## Fonnte

WhatsApp Business API. The web app itself only links out to `wa.me/<CS number>` for "Hubungi CS" — it does not call Fonnte's API directly; that only happens from the Apps Script side (sending replies to users' messages).

## EmailJS

Used in `auth.js`'s `sendEmailOTP()` for registration/password-reset OTP delivery. Client-side call, API key embedded in `config.js`.

## No custom backend, no webhooks into the web app
The web app never receives inbound webhooks — it's a pure client that polls/reads. Anything that needs to push data *to* the app (detected transactions, WhatsApp-originated transactions) has to land in a Supabase table first; the app finds out by polling.
