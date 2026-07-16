# External Services & Endpoints

No custom REST API of our own. Three categories: Supabase (PostgREST + RPC), Vercel serverless functions, and third-party services called client-side.

## Supabase (PostgREST + RPC)

Base: `${SB_URL}/rest/v1/`. Every request now carries `Authorization: Bearer <token>` where `<token>` is the user's custom-signed JWT after login (falls back to the anon key when logged out). See `database.md` for the full RLS model this enables.

All calls go through `sb(path, method, body)` (table access) or `rpc(fnName, params)` (functions) in `ui-helpers.js`.

### Table access (`sb()`)
| Table | Typical calls |
|---|---|
| `users` | `PATCH` for profile/plan/token updates (never `SELECT *` — `password_hash` is not selectable by `anon`/`authenticated` at all; auth reads go through RPCs instead) |
| `accounts` | Full CRUD from Settings → Akun |
| `transactions` | `SELECT` with date-range + jenis filters, full CRUD |
| `targets` | Full CRUD, plus `terkumpul` increments on contribution |
| `user_categories` / `user_priorities` | Full CRUD from the dedicated management pages |
| `orders` | `POST` on payment submission (manual Basic/Pro plan purchases only — token top-ups use `token_purchases` instead, see below) |
| `detected_transactions` | `SELECT status=eq.pending`, `PATCH status` (never `INSERT`ed by this codebase) |
| `token_purchases` | **Never written by the client** — `FOR ALL USING (false)`, same lockdown as `password_reset_tokens`; only `/api/create-payment.js`/`/api/xendit-webhook.js` write to it, via the service role key. **Reads are allowed for the row's own owner** (block `[30]`, a separate `FOR SELECT` policy alongside the write lockdown) — powers the "Riwayat Pembayaran" page in Settings |

### RPC functions (`rpc()`)
| Function | Purpose |
|---|---|
| `login_check(username, password_hash)` | Login — returns `{user, token}`, requires `status='active'` |
| `get_user_by_username(username)` | Biometric login |
| `get_user_by_id(user_id)` | Session restore |
| `change_password(user_id, old_hash, new_hash)` | Requires proof of old password |
| `create_password_reset(email)` | Forgot-password step 1 |
| `confirm_password_reset(user_id, otp, new_hash)` | Forgot-password step 2 |
| `set_pin_hash(pin_hash)` | Set/clear the caller's own PIN lock — identity from JWT, not a parameter (block `[29]`, see `database.md`) |
| `verify_pin(pin_hash)` | Check the caller's own PIN — same JWT-derived identity |

## Vercel serverless functions (`/api`)

| Endpoint | Purpose |
|---|---|
| `POST /api/ai-chat` | Chat completion, server-side plan/token check, Groq key never leaves the server |
| `POST /api/ai-scan` | Receipt vision parsing, same server-side gating |
| `POST /api/create-payment` | Token top-up (Xendit, test mode) — `{user_id, package}` → creates a `token_purchases` row + a Xendit-hosted invoice, returns `{checkout_url}`. Package tiers (2jt/Rp35rb, 5jt/Rp59rb) are hardcoded server-side, never trusted from the client. If the Xendit invoice-creation call itself fails, the row is marked `'failed'` instead of left dangling as `'pending'`. Alternatively `{user_id, resume_purchase_id}` — resumes an existing `pending` row instead of creating a new one, reusing the live Xendit invoice if still valid or issuing a fresh one for the same row if it expired |
| `POST /api/xendit-webhook` | **The only inbound webhook this app receives** — see below. Handles Xendit's invoice callback for both terminal states: `PAID` (idempotently grants tokens) and `EXPIRED` (marks the row `'expired'`, no grant) — verifies `x-callback-token` against `XENDIT_WEBHOOK_VERIFICATION_TOKEN_TEST` before trusting either (see `backend.md`) |

The two AI functions are same-origin with the static site (no CORS handling needed). `create-payment.js` (called from the browser) sets explicit CORS headers; `xendit-webhook.js` (called only by Xendit's servers, never the browser) doesn't need any.

## Groq API
`https://api.groq.com/openai/v1/chat/completions` — called **only** from the two Vercel functions above. The browser never has a Groq key.

## Google Apps Script Web App
One deployed URL (`GAS` constant in `config.js`). Two actions are actually called from the client today: `?action=ping` (liveness, `pingSheetSync()` in `settings.js`) and `?action=notifyAdmin&msg=...` (`submitPayment()` in `payment.js`, pings an admin on WhatsApp after a paid-plan order is submitted, itself currently unreachable from any UI — see `features.md`). `gs/fonnte.gs` is real, committed code, not a draft — it's the Fonnte WhatsApp webhook, handling inbound messages via `doPost`; see `backend.md` for the full breakdown.

## Fonnte
WhatsApp Business API. The web app itself only links out to `wa.me/<CS number>` for "Hubungi CS" — it doesn't call Fonnte's API directly. Inbound WhatsApp messages reach `gs/fonnte.gs`'s `doPost`, deployed separately in Apps Script (see `backend.md`), not this web app.

## EmailJS
Used in `auth.js` for OTP delivery (registration and password reset). Client-side call, key in `config.js`.

## SheetJS (xlsx), via CDN
Loaded in `webapp.html` (`cdnjs.cloudflare.com/ajax/libs/xlsx/...`), used client-side only for the Transaksi page's "Export Excel" button — no server involvement.

## Xendit (token top-up, test mode)
Hosted Invoice API — `POST https://api.xendit.co/v2/invoices`, called from `/api/create-payment.js` with HTTP Basic Auth (secret key as username, blank password). The client only ever sees the returned `invoice_url` (a Xendit-hosted checkout page) and redirects to it — no Xendit SDK or key of any kind on the client. See `backend.md` for the full purchase/webhook flow and `XENDIT_SECRET_KEY_TEST`/`XENDIT_WEBHOOK_VERIFICATION_TOKEN_TEST` in `environment.md`.

## One inbound webhook: Xendit's invoice-paid callback
`/api/xendit-webhook.js` is the only endpoint in this app that receives pushed data from an external service, rather than the app polling for it. Everything else that "arrives" (detected transactions, WhatsApp-originated transactions) still has to land in a Supabase table first, found by polling — this webhook is the one exception, and it's why signature verification (`x-callback-token`) matters here in a way it doesn't for anything else in this file.
