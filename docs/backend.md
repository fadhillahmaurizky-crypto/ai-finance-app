# Backend

No traditional application server. "Backend" means three things: Supabase (Postgres + custom RPC auth), two Vercel serverless functions (AI proxy), and a Google Apps Script Fonnte WhatsApp webhook (see §3).

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

## 3. Google Apps Script (`gs/fonnte.gs`) — real, committed, Fonnte WhatsApp webhook

**`gs/fonnte.gs` exists in this repo.** Earlier drafts of these docs said no `.gs` file existed anywhere in the repo (not even in git history) — that was true once, but is no longer the case; don't rely on that older claim. Deployment to the live Apps Script editor is a manual copy-paste step the product owner does themselves — committing the file here keeps it in version control and reviewable, but doesn't itself push anything live. **Not necessarily running the exact version committed here** at any given moment, for that reason.

**What it does**: inbound WhatsApp message (via Fonnte's webhook, `doPost`) → look up the user by `wa_number` (`getUserIdByWA()`) → fetch that user's real `accounts` and `user_categories` once per message → for each line: extract the amount (`extractNominal()` — understands `rb`/`ribu`/`jt`/`juta`/`k` suffixes), match an account name mentioned anywhere in the line as a whole word (`matchFromText()`, falls back to the user's default account if none mentioned), classify `jenis`/`kategori` against the user's *real* categories first, a keyword heuristic second (`analisaDenganAI()`), build a clean `keterangan` with the matched amount/account text stripped out (`buildKeterangan()`) → insert the transaction (now correctly attributed to `account_id`) → reply with the updated all-time Saldo.

**Fixed this session** (previously real, tracked bugs — see git history / the fix's PR for the full before/after):
- **Auth**: was using the public anon key for every Supabase call (`SB_KEY`, hardcoded) — since the RLS migration, that satisfies no table's `is_owner_or_admin(user_id)` policy for any row, so `getUserIdByWA()`/`saveTrxToSupabase()` almost certainly failed silently for every real user. Now uses a Supabase **service role** key (bypasses RLS by design, same reasoning as `/api/ai-chat.js`/`/api/ai-scan.js`), stored as a Script Property (`SUPABASE_SERVICE_ROLE_KEY`) — never hardcoded, matching how `FONNTE_TOKEN` was already handled.
- **`account_id`**: transactions logged via WhatsApp never set it, breaking per-account balance tracking. Now resolved per-line (matched account name in the message, or the user's default account) and always set.
- **Balance model**: `getSaldoSupabase()`/`getLaporanSupabase()` computed "saldo" as the current month's transactions only, while the app itself uses an all-time model (`Σ(account.saldo_awal)` + all-time pemasukan − all-time pengeluaran, transfers excluded) — a user could get a different "saldo" answer from the bot than from the app for the same account. Both now compute the same all-time formula; `getLaporanSupabase()` keeps a month-scoped income/expense breakdown as a clearly-separate section, not labeled "Saldo."
- **Category vocabulary**: `analisaDenganAI()` used the *original* category set from early in the project (`makanan`/`transportasi`/`hiburan`/`tagihan`) instead of the app's current defaults (`makan`/`belanja`/`elektronik`/`pulsa`/`paket_data`) — WhatsApp-logged transactions created duplicate, differently-named categories from the app's own. Now matches the user's actual `user_categories` (default *and* custom) directly first, falling back to an updated keyword heuristic mapped to real default category names only if no direct match — not a hardcoded list disconnected from what the app actually seeds.
- **Account-name extraction** (addendum spec): a message like `"makan bubur 10rb BCA"` now resolves to `keterangan:"makan bubur"`, `account: BCA` (matched by name, whole-word, case-insensitive, longest match wins if ambiguous) instead of storing the whole raw line as `keterangan` and always defaulting to the user's default account.
- Left as **not urgent**, per the spec's own call: OTP delivery is still GET-based (`doGet` → `sendOTPLogin`) — no client code currently calls this action at all (registration/forgot-password OTP both go through EmailJS instead), so this is genuinely dead code right now, not worth changing until something actually calls it.

The client (`js/config.js`'s `GAS` constant, a real deployed Apps Script Web App URL — **not necessarily running `gs/fonnte.gs`'s exact current content**, since deploying to Apps Script is a manual copy-paste step, not tied to this repo's git history) also calls it for:
- **`?action=ping`** — liveness check, `pingSheetSync()` in `settings.js` (autosync heartbeat), fire-and-forget (`mode:'no-cors'`, the client can't read the response).
- **`?action=notifyAdmin&msg=...`** — called from `payment.js`'s `submitPayment()`, which is itself orphaned as of the trial-registration change (see `features.md`'s "Payment / Plan-Selection Flow" entry) — not reachable from any current UI.

**`admin.html` used to also call `?action=adminData`** (a supposed Google-Sheets-backed platform-wide transaction summary for the Laporan tab) — this action was never actually implemented anywhere, live-deployed or committed, so it always returned `{"error":"Action tidak dikenal"}` and the Laporan tab was permanently blank, confirmed by testing the live endpoint directly while real transaction data existed in Supabase the whole time. Fixed by having `renderLaporan()` query `transactions`/`accounts` directly instead — Supabase is already the authoritative datastore for this data, so routing it through Apps Script/Sheets was an unnecessary extra hop that quietly broke. **If a future feature is tempted to add a new GAS action that mirrors data Supabase already owns, query Supabase directly instead** — this is the second time in this project a GAS/Sheets-mediated copy of live Supabase data has turned out to be the actual bug (see the `gas.saldo`/`gas.totalTrx` fields still used elsewhere in `admin.html`'s Manajemen User table and Detail modal, which have the same latent risk if that Sheets sync isn't actually running).

## What's NOT server-side
- No image resizing/compression before upload (receipt photos, avatars) — sent as full-size base64.
- No rate limiting beyond the plan/token check inside the two Vercel functions.

## What IS server-side (beyond auth/RLS)
- **Per-account balance enforcement** — a Postgres trigger (`wangku_check_account_balance()`, block `[21]`) blocks a `pengeluaran`/`transfer` from pushing its source account negative, as a safety net behind the client-side check in `js/transactions.js`/`js/accounts.js`. See `database.md`.
