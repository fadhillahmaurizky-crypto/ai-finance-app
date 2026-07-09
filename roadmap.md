# Known Technical Debt & Roadmap

Ordered by what matters most, not by what's easiest.

## Security — mostly resolved, two items remain

The single biggest risk in this codebase was that **every RLS policy was `USING (true)`** — the public anon key (necessarily embedded in client JS) could read and write any user's data, and the Groq API key was readable directly from a public table. This has been fixed:

- ✅ Groq key moved to Vercel environment variables, proxied through `/api/ai-chat.js`/`/api/ai-scan.js` — never touches the client.
- ✅ `password_hash` no longer bulk-readable — column-level `SELECT` revoked from `anon`, all password comparisons happen inside `SECURITY DEFINER` Postgres functions.
- ✅ Forgot-password OTP now validated server-side (hashed, expiring, single-use) — previously only checked in a JS variable, trivially bypassable.
- ✅ Real per-user row-level security via a custom-signed JWT (see `database.md`) — every table now checks `is_owner_or_admin(user_id)` instead of `true`.
- ✅ `admin.html` now requires a real `role='admin'` account login instead of one shared static password with no connection to real accounts.

**Still open:**
1. **No token refresh.** Sessions just expire after 30 days and force a full re-login. Fine for now; revisit before a wider public push.
2. **Registration email verification is client-side only.** Unlike the forgot-password OTP (fixed above), the registration OTP is still just compared in a JS variable — someone could theoretically create an account without actually owning the email address. Lower severity (doesn't expose other users' data), but still a real gap.
3. **Password hashing itself** is SHA-256 with one static, shared salt across all users (not bcrypt/argon2, not per-user salt). Adequate for now given the above fixes close the actual exposure vectors, but worth upgrading before real financial data from the public is at stake.

## Data model

4. **`gas/wangku-backend.gs` is an unverified draft**, not a confirmed match for whatever's actually deployed to Fonnte. Don't treat it as documentation of current bot behavior. The backup-related handler in it is now doubly stale since the client-side backup feature was removed from Settings entirely.
5. **`targets.terkumpul` is denormalized**, incremented by app code on each contribution, not derived from summing linked `transactions` at query time. Any bulk import/backfill with `target_id` set must also patch `terkumpul` manually.
6. **Default categories/priorities changed more than once** during development. Since seeding only fires when a user has zero `is_default` rows, users who joined under an earlier default set were never retroactively migrated. Decide if this is worth a one-time backfill script.
7. **Icon/color lookup maps** (`IM`/`BG`/`CL` in `transactions.js`) are manually kept in sync with `DEFAULT_CATEGORIES` in `config.js` — no single source of truth. A third place, the receipt-scan prompt in `scanStruk()`/`api/ai-scan.js`, also needs to match if categories change again.
8. **`settings` table** is fully locked down and unused — don't build new features on it without first deciding whether it should be revived or removed from the schema.

## Known bugs / soft spots

9. **Receipt scan reliability**: addressed the reported silent-failure case (now gives explicit toast feedback on empty/cancelled capture), but if it's still flaky, the likely remaining cause is Android killing the WebView process while the native camera app is in the foreground — a native TWA/low-memory-device issue, not fixable from this web codebase. Needs native-side investigation (Bubblewrap/Android project) if it resurfaces.
10. **Android back-button** was previously exiting/restarting the app. Fixed at the web layer (`history.pushState`/`popstate` in `app-core.js`) for page navigation and modal open/close. If a new modal is added, confirm the `MutationObserver` in `app-core.js` (which auto-attaches to every `.modal-overlay` present at boot) picks it up — a modal injected into the DOM *after* boot needs manual registration.
11. **"Running on Chrome" TWA disclosure popup** was reportedly resolved directly on the Android/hosting config side (Digital Asset Links), not through this repo's code. Document exactly what was changed there so it doesn't silently regress on a future resign.

## Feature gaps / half-built by design

12. **Auto-detect transactions** has full app-side plumbing (table, poll, popup) but nothing populates `detected_transactions` — depends on the user setting up phone-side automation (Tasker/MacroDroid) themselves. A ready-to-import automation profile would make this feature actually usable, if it's worth prioritizing.
13. **Fonnte account-extraction improvement** (reading which account a WhatsApp-reported transaction came from, defaulting to Cash) is drafted but **on hold**, pending the real live Apps Script being made available for a proper merge — see `backend.md`.
14. **Manual/Google Drive backup was removed** from Settings (the app relies on Supabase's realtime storage instead) — if there's ever a request for exportable backups again, note this was a deliberate product decision, not an oversight.

## Nice-to-haves, not yet started
- Automated CI for at least a syntax/lint check on `js/*.js` and the SQL migration file before merge.
- A staging Supabase project, so schema migrations can be tested before hitting the (currently single) real project.
- Compress/resize images client-side before upload (receipt photos, avatars currently sent as full-size base64).
- Clean up genuinely dead code: `wangku_pool_key`/`getKey()`/`loadPoolKey()` in `ui-helpers.js` and `chat-ai.js` are leftovers from before the Groq-key move and do nothing anymore.
