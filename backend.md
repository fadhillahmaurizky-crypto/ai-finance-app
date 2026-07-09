# Backend

No traditional application server. "Backend" means three things: Supabase (Postgres + custom RPC auth), two Vercel serverless functions (AI proxy), and a draft Google Apps Script (WhatsApp bot + Drive backup, unverified).

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

## 3. Google Apps Script (`gas/wangku-backend.gs`) — DRAFT, UNVERIFIED

**This is not confirmed to match what's actually deployed and wired to Fonnte.** Apps Script projects aren't stored in this GitHub repo — they live in the Apps Script editor (script.google.com), and this project doesn't use `clasp` to sync them to git. The `.gs` file here was written from scratch based on inferring behavior from the schema, as a *proposal*, not a diff/patch of the real thing. Before deploying it over whatever's live, get the actual source and reconcile — don't assume this file is authoritative.

What it's designed to do, once verified:
- **`action:'backup'`** — receives a JSON payload from... actually, **the manual/Drive backup feature in Settings was removed** per a later product decision (the app uses realtime Supabase storage, so a separate backup mechanism was deemed unnecessary). This handler in the `.gs` draft is now vestigial — flag this if picking the Fonnte work back up, since the client-side call it used to serve no longer exists.
- **`action:'ping'`** — liveness check for `pingSheetSync()` in `settings.js` (autosync heartbeat).
- **Fonnte webhook** — receives an inbound WhatsApp message, looks up the user by `wa_number`, fetches their `accounts`/`user_categories`, asks Groq to extract a transaction (with real account/category names as context), resolves the account with a text-match fallback if the AI misses it, inserts the transaction, replies via Fonnte. **On hold** per product decision — not deployed.

## Fire-and-forget calls
`pingSheetSync()` in `settings.js` calls the Apps Script URL with `mode:'no-cors'` — genuinely fire-and-forget, the client can't read the response in that mode.

## What's NOT server-side
- No transaction validation beyond client-side checks before calling `sb()`.
- No image resizing/compression before upload (receipt photos, avatars) — sent as full-size base64.
- No rate limiting beyond the plan/token check inside the two Vercel functions.
