# Backend

No traditional application server. "Backend" means two things that actually exist — Supabase (Postgres + custom RPC auth) and two Vercel serverless functions (AI proxy) — plus a Google Apps Script (WhatsApp bot + Drive backup) that was only ever drafted during planning conversations and was **never committed to this repo** (see §3).

## 1. Supabase — primary backend

The app talks to PostgREST via a small wrapper in `ui-helpers.js`:

```js
function authToken(){ return localStorage.getItem('sdk_token') || SB_KEY; }
async function sb(path, method='GET', body=null){ /* Authorization: Bearer authToken() */ }
async function rpc(fnName, params={}){ /* POST /rest/v1/rpc/fnName, same auth */ }
```

After login, `authToken()` returns the custom-signed JWT (not the bare anon key) — this is what RLS policies actually check. Before login (or for a logged-out visitor), it falls back to the anon key, which is fine since the only things reachable pre-login are `login_check`, `create_password_reset`, `confirm_password_reset`, and self-registration (all `SECURITY DEFINER` or explicitly anon-scoped).

**Auth is not Supabase Auth.** See `database.md`'s "Custom auth & RLS" section for the full design and the reasoning behind it (short version: it was cheaper to hand-roll a JWT than migrate the whole user model, and it reuses the existing `users` table, EmailJS OTP flow, and admin tooling unchanged).

`sb()`/`rpc()` both handle `401` by calling `handleAuthExpired()` (in `app-core.js`), which clears the session and redirects to login with a toast — this fires if the JWT is invalid/expired (30-day expiry, no refresh flow yet — see `roadmap.md`).

## 2. Vercel serverless functions (`/api`) — this is where the Groq key lives now

`/api/ai-chat.js` and `/api/ai-scan.js` are the **only** things that ever see `GROQ_API_KEY` (a Vercel environment variable, never in any file in this repo). Both:
1. Take a `user_id` from the request body.
2. Look up that user's `plan`/`role`/`tokens_used`/`tokens_limit` **server-side** via Supabase, using `SUPABASE_SERVICE_ROLE_KEY` (so plan/limit gating can't be bypassed by a modified client).
3. Call Groq with the server-side key.
4. Return just the result (`reply`/`tokensUsed` for chat, `content`/`tokensUsed` for scan).

**Why service role, specifically, for step 2**: after the RLS migration (`database.md` block `[18]`), every table's policy requires `is_owner_or_admin(user_id)` — a claim proven by a real signed JWT. These two functions never receive a user's JWT, only a plain `user_id` string in the request body, so an anon-key-authenticated lookup here satisfies no RLS policy and silently returns zero rows — **this broke both AI features completely** (`"User tidak ditemukan"` for every user, every request) from the moment that RLS migration shipped until this was caught and fixed. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS by design, which is exactly appropriate here: the Vercel function itself is the trusted party doing a legitimate server-side authorization check, not relaying a user's own request. Its use is deliberately scoped to just this one lookup in each file — not a general-purpose shortcut, and it must never reach client-facing code.

Same-origin (both the static site and `/api` are on the same Vercel deployment), so there's no CORS complexity — this was a deliberate choice over routing AI calls through Google Apps Script, which has real, well-documented CORS/response-readability problems for this kind of browser-facing call.

**Before this existed**, the Groq key was fetched by the client from a `settings` table row using the public anon key — which meant *anyone* who opened devtools on the live site could read it directly from the database, no login required. That table is now fully locked down (`FOR ALL USING (false)`) and nothing reads it anymore.

## 3. Google Apps Script (`gs/fonnte.gs`) — real now, but unverified and known-buggy

**`gs/fonnte.gs` exists in this repo as of the Part A / routing-restructure merge** — earlier drafts of these docs said no `.gs` file existed anywhere in the repo (not even in git history); that's no longer true, don't rely on that older claim. It implements the Fonnte WhatsApp webhook: inbound message → look up user by `wa_number` (`getUserIdByWA()`) → ask Groq to extract a transaction → insert into `transactions` (`saveTrxToSupabase()`) → compute saldo/laporan replies → reply via Fonnte. `doGet()` also handles OTP delivery.

**Known bugs, not yet fixed (no dedicated pass has happened yet)**:
- `SB_KEY` is the anon key, not a service role key — same class of RLS breakage the `/api/ai-chat.js`/`ai-scan.js` functions hit before their fix, since GAS never carries a user's JWT either.
- `saveTrxToSupabase()`'s insert payload never sets `account_id` — every WhatsApp-logged transaction is orphaned from the per-account balance model.
- `getSaldoSupabase()`/`getLaporanSupabase()` compute month-only totals, not the app's actual all-time balance model (`Σ(account.saldo_awal) + all-time pemasukan − pengeluaran`).
- Its keyword-based category matcher uses a vocabulary (`makanan`/`transportasi`/`hiburan`/`tagihan`/`belanja`) that doesn't match the app's real `DEFAULT_CATEGORIES` (`makan`/`belanja`/`elektronik`/`pulsa`/`paket_data`) or a user's actual custom categories.
- `parseNominal()` doesn't understand "k" shorthand (e.g. "50k" for 50000).

Treat this file as a known-incomplete integration, not production-solid, until each of the above is addressed in its own pass.

The client (`js/config.js`'s `GAS` constant, a real deployed Apps Script Web App URL — **not necessarily running `gs/fonnte.gs`'s exact current content**, since deploying to Apps Script is a manual copy-paste step, not tied to this repo's git history) calls it for:
- **`?action=ping`** — liveness check, `pingSheetSync()` in `settings.js` (autosync heartbeat), fire-and-forget (`mode:'no-cors'`, the client can't read the response).
- **`?action=notifyAdmin&msg=...`** — called from `payment.js`'s `submitPayment()`, which is itself orphaned as of the trial-registration change (see `features.md`'s "Payment / Plan-Selection Flow" entry) — not reachable from any current UI.

## What's NOT server-side
- No image resizing/compression before upload (receipt photos, avatars) — sent as full-size base64.
- No rate limiting beyond the plan/token check inside the two Vercel functions.

## What IS server-side (beyond auth/RLS)
- **Per-account balance enforcement** — a Postgres trigger (`wangku_check_account_balance()`, block `[21]`) blocks a `pengeluaran`/`transfer` from pushing its source account negative, as a safety net behind the client-side check in `js/transactions.js`/`js/accounts.js`. See `database.md`.
