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
| `orders` | `POST` on payment submission |
| `detected_transactions` | `SELECT status=eq.pending`, `PATCH status` (never `INSERT`ed by this codebase) |

### RPC functions (`rpc()`)
| Function | Purpose |
|---|---|
| `login_check(username, password_hash)` | Login — returns `{user, token}`, requires `status='active'` |
| `get_user_by_username(username)` | Biometric login |
| `get_user_by_id(user_id)` | Session restore |
| `change_password(user_id, old_hash, new_hash)` | Requires proof of old password |
| `create_password_reset(email)` | Forgot-password step 1 |
| `confirm_password_reset(user_id, otp, new_hash)` | Forgot-password step 2 |

## Vercel serverless functions (`/api`)

| Endpoint | Purpose |
|---|---|
| `POST /api/ai-chat` | Chat completion, server-side plan/token check, Groq key never leaves the server |
| `POST /api/ai-scan` | Receipt vision parsing, same server-side gating |

Both same-origin with the static site (no CORS handling needed).

## Groq API
`https://api.groq.com/openai/v1/chat/completions` — called **only** from the two Vercel functions above. The browser never has a Groq key.

## Google Apps Script Web App
One deployed URL (`GAS` constant in `config.js`). Two actions are actually called from the client today: `?action=ping` (liveness, `pingSheetSync()` in `settings.js`) and `?action=notifyAdmin&msg=...` (`submitPayment()` in `payment.js`, pings an admin on WhatsApp after a paid-plan order is submitted). Both are fire-and-forget. The backup and Fonnte-webhook ideas were only ever drafted during planning, never committed to this repo as real code — see `backend.md`.

## Fonnte
WhatsApp Business API. The web app itself only links out to `wa.me/<CS number>` for "Hubungi CS" — it doesn't call Fonnte's API directly; that would only happen from the (on-hold) Apps Script side.

## EmailJS
Used in `auth.js` for OTP delivery (registration and password reset). Client-side call, key in `config.js`.

## SheetJS (xlsx), via CDN
Loaded in `webapp.html` (`cdnjs.cloudflare.com/ajax/libs/xlsx/...`), used client-side only for the Transaksi page's "Export Excel" button — no server involvement.

## No inbound webhooks into the web app
The app never receives pushed data — anything that needs to reach it (detected transactions, WhatsApp-originated transactions) has to land in a Supabase table first; the app finds out by polling.
