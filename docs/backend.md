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
2. Look up that user's `plan`/`role`/`tokens_used`/`tokens_limit` **server-side** via Supabase (so plan/limit gating can't be bypassed by a modified client).
3. Call Groq with the server-side key.
4. Return just the result (`reply`/`tokensUsed` for chat, `content`/`tokensUsed` for scan).

Same-origin (both the static site and `/api` are on the same Vercel deployment), so there's no CORS complexity — this was a deliberate choice over routing AI calls through Google Apps Script, which has real, well-documented CORS/response-readability problems for this kind of browser-facing call.

**Before this existed**, the Groq key was fetched by the client from a `settings` table row using the public anon key — which meant *anyone* who opened devtools on the live site could read it directly from the database, no login required. That table is now fully locked down (`FOR ALL USING (false)`) and nothing reads it anymore.

## 3. Google Apps Script — PLANNING-STAGE DRAFT, NOT IN THIS REPO

**`gas/wangku-backend.gs` does not exist in this repository — not in the working tree, not anywhere in git history.** It was described in earlier drafts of these docs as if it were a real (if unverified) file sitting in the repo; that was wrong. What actually happened: a Google Apps Script backend was drafted during planning conversations as a *proposal*, inferred from the schema, and was never committed here — it's on hold pending a decision between building on Fonnte vs. switching to an Evolution API-based WhatsApp integration. If that decision resolves, the actual script needs to be written (or fetched from wherever it was drafted) and committed for real — don't assume any `.gs` file is sitting in this repo, and don't write speculative code against an unresolved architecture question.

The client (`js/config.js`'s `GAS` constant, a real deployed Apps Script Web App URL) still calls it for two things that **are** live today:
- **`?action=ping`** — liveness check, `pingSheetSync()` in `settings.js` (autosync heartbeat), fire-and-forget (`mode:'no-cors'`, the client can't read the response).
- **`?action=notifyAdmin&msg=...`** — fired by `payment.js`'s `submitPayment()` after a paid-plan order is submitted, to ping an admin on WhatsApp to review it in `admin.html`. Also fire-and-forget (plain `fetch(...).catch(()=>{})`, response ignored either way).

Whatever handles those two actions server-side today is whatever's actually deployed at that URL — not `gas/wangku-backend.gs`, since that file doesn't exist. The **planned** design (once/if the Fonnte-vs-Evolution-API decision resolves and this actually gets built) was:
- A backup handler (`action:'backup'`) — now moot regardless of that decision, since the manual/Drive backup feature in Settings was removed per a later product decision (the app relies on realtime Supabase storage instead).
- A Fonnte webhook — inbound WhatsApp message → look up user by `wa_number` → fetch their `accounts`/`user_categories` → ask Groq to extract a transaction (real account/category names as context) → resolve the account with a text-match fallback → insert the transaction → reply via Fonnte. **On hold**, not built.

## What's NOT server-side
- No image resizing/compression before upload (receipt photos, avatars) — sent as full-size base64.
- No rate limiting beyond the plan/token check inside the two Vercel functions.

## What IS server-side (beyond auth/RLS)
- **Per-account balance enforcement** — a Postgres trigger (`wangku_check_account_balance()`, block `[21]`) blocks a `pengeluaran`/`transfer` from pushing its source account negative, as a safety net behind the client-side check in `js/transactions.js`/`js/accounts.js`. See `database.md`.
