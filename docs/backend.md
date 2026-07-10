# Backend

There is no traditional application server. "Backend" here means two things:

## 1. Supabase (primary backend)

The app talks straight to Supabase's PostgREST API from the browser, via a small wrapper in `ui-helpers.js`:

```js
async function sb(path, method='GET', body=null) {
  // fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey, Authorization }, ... })
}
```

Every query/mutation in the app is a call to `sb(...)`. There is no ORM, no server-side validation layer — filtering, sorting, and shaping all happen via PostgREST query-string syntax (`?user_id=eq.${id}&order=tanggal.desc`) written inline at each call site. See [api.md](./api.md) for the concrete endpoint patterns.

**Auth is not Supabase Auth.** `users` is a plain table; login is a `SELECT ... WHERE username=... AND status='active'` followed by a client-side password comparison, and the result is cached in `localStorage`. This is called out in detail in [roadmap.md](./roadmap.md) — treat it as a known limitation, not a template to copy for new features.

## 2. Google Apps Script (`gas/wangku-backend.gs`)

**Status: draft, unverified against the live script.** The repo does not contain the Apps Script that's actually deployed and wired to Fonnte — Apps Script projects aren't stored in this GitHub repo (they live in the Apps Script editor at script.google.com, unless pushed via `clasp`, which this project doesn't use). The `.gs` file in this repo was written from scratch based on the app's schema, as a proposal — before deploying it over the real one, diff it against whatever's actually live to make sure you don't drop working logic (e.g. admin notifications, token/usage tracking, or different message-parsing rules for the Basic-tier bot).

What it's designed to handle, once verified/merged:

- **`action:'backup'`** — receives a JSON payload from Settings → "Backup ke Google Drive" (built by `collectBackupPayload()` in `settings.js`) and writes it as a timestamped file into a `Wangku Backups` Drive folder.
- **`action:'ping'`** — answers the autosync heartbeat (`pingSheetSync()` in `settings.js`), currently just a liveness check.
- **Fonnte webhook** — receives an inbound WhatsApp message, looks up the user by `wa_number`, fetches that user's `accounts` and `user_categories` from Supabase, asks Groq to extract a transaction from the message text (with the user's real account/category names given as context so it doesn't hallucinate), resolves the account with a fallback keyword-match against the raw text, inserts into `transactions`, and replies via Fonnte's send API.

### Why the account-matching logic exists
Originally reported gap: the bot could read transaction type/category/description/amount but not which **account** the money came from. The fix has two layers so it degrades gracefully:
1. Ask the AI directly, giving it the user's real account list as context.
2. If that comes back empty, scan the raw message text for any account name as a plain substring match.
3. If both fail, fall back to the user's system `Cash` account.

## Fire-and-forget calls from the client

`settings.js`'s `pingSheetSync()` and `backupToDrive()` call the Apps Script URL with `mode:'no-cors'` — the client can't read the response in that mode, so these are genuinely fire-and-forget. Don't build a feature that depends on reading the GAS response synchronously in the browser without changing this.

## What's NOT server-side here
- No transaction validation beyond what the client does before calling `sb()`.
- No rate limiting on AI calls beyond the client checking `user.tokens_used`/`tokens_limit` before making the request (i.e., trivially bypassable by anyone calling Groq directly with a captured key — not that anyone would bother, but worth knowing).
- No image resizing/compression for receipt photos or avatar uploads — both are sent as raw base64.
