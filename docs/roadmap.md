# Known Technical Debt & Roadmap

Ordered by what matters most, not by what's easiest.

## Security — mostly resolved, three items remain

The single biggest risk in this codebase was that **every RLS policy was `USING (true)`** — the public anon key (necessarily embedded in client JS) could read and write any user's data, and the Groq API key was readable directly from a public table. This has been fixed:

- ✅ Groq key moved to Vercel environment variables, proxied through `/api/ai-chat.js`/`/api/ai-scan.js` — never touches the client.
- ✅ `password_hash` no longer bulk-readable — column-level `SELECT` revoked from `anon`, all password comparisons happen inside `SECURITY DEFINER` Postgres functions.
- ✅ Forgot-password OTP now validated server-side (hashed, expiring, single-use) — previously only checked in a JS variable, trivially bypassable. (The functions doing this validation, `create_password_reset`/`confirm_password_reset`, briefly had a bug that broke the flow entirely — `SET search_path = public` didn't include the `extensions` schema where `pgcrypto`'s `digest()` lives, so calling either function errored with `function digest(text, unknown) does not exist`. Fixed in block `[17]`'s function definitions by adding `extensions` to the search path.)
- ✅ Real per-user row-level security via a custom-signed JWT (see `database.md`) — every table now checks `is_owner_or_admin(user_id)` instead of `true`.
- ✅ `admin.html` now requires a real `role='admin'` account login instead of one shared static password with no connection to real accounts.
- ✅ `login_check` now requires `status='active'`, matching `get_user_by_username`/`get_user_by_id` (block `[20]`). Previously a `pending`/`banned` account's correct password still got a validly-signed JWT back from the RPC itself — the web client discarded it via its own post-call status check, but a direct call to the RPC (granted to `anon`) bypassed that.

**Still open:**
1. **No token refresh.** Sessions just expire after 30 days and force a full re-login. Fine for now; revisit before a wider public push.
2. **Registration email verification is client-side only.** Unlike the forgot-password OTP (fixed above), the registration OTP is still just compared in a JS variable — someone could theoretically create an account without actually owning the email address. Lower severity (doesn't expose other users' data), but still a real gap.
3. **Password hashing itself** is SHA-256 with one static, shared salt across all users (not bcrypt/argon2, not per-user salt). Adequate for now given the above fixes close the actual exposure vectors, but worth upgrading before real financial data from the public is at stake.

## Data model

4. **`gas/wangku-backend.gs` does not exist in this repo** (not even in git history) — it was only ever drafted during planning conversations, as a proposal inferred from the schema, and never committed. Don't treat any reference to it as documentation of current bot behavior, and don't assume it can be picked up/deployed as-is. It's on hold pending a decision between building on Fonnte vs. switching to an Evolution API-based WhatsApp integration — see `backend.md`.
5. **`targets.terkumpul` is denormalized**, incremented by app code on each contribution, not derived from summing linked `transactions` at query time. Any bulk import/backfill with `target_id` set must also patch `terkumpul` manually.
6. **Default categories/priorities changed more than once** during development. Since seeding only fires when a user has zero `is_default` rows, users who joined under an earlier default set were never retroactively migrated. Decide if this is worth a one-time backfill script. (Separately: these constants briefly went missing from `config.js` entirely, silently breaking seeding for every new user until restored — see the "Data-accuracy audit findings" note at the bottom of this file.)
7. **Category vocabulary is kept in sync manually across three separate places, no single source of truth**: the icon/color lookup maps (`IM`/`BG`/`CL` in `transactions.js`), the receipt-scan prompt (`api/ai-scan.js`), and the AI chat system prompt (`SYS` in `chat-ai.js`, for its "catat transaksi via chat" JSON action). All three need to match `DEFAULT_CATEGORIES` in `config.js` if categories ever change again — the chat prompt currently diverges from it the most (it uses its own vocabulary — `makanan/transportasi/belanja/tagihan/hiburan/gaji/bonus/arisan/lainnya` — that doesn't match the real seeded set at all).
8. **`settings` table** is fully locked down and unused — don't build new features on it without first deciding whether it should be revived or removed from the schema.

## Known bugs / soft spots

9. **Receipt scan reliability**: addressed the reported silent-failure case (now gives explicit toast feedback on empty/cancelled capture), but if it's still flaky, the likely remaining cause is Android killing the WebView process while the native camera app is in the foreground — a native TWA/low-memory-device issue, not fixable from this web codebase. Needs native-side investigation (Bubblewrap/Android project) if it resurfaces.
10. **Android back-button** was previously exiting/restarting the app. Fixed at the web layer (`history.pushState`/`popstate` in `app-core.js`) for page navigation and modal open/close. If a new modal is added, confirm the `MutationObserver` in `app-core.js` (which auto-attaches to every `.modal-overlay` present at boot) picks it up — a modal injected into the DOM *after* boot needs manual registration.
11. **"Running on Chrome" TWA disclosure popup** was reportedly resolved directly on the Android/hosting config side (Digital Asset Links), not through this repo's code. Document exactly what was changed there so it doesn't silently regress on a future resign.

## Feature gaps / half-built by design

12. **Auto-detect transactions** has full app-side plumbing (table, poll, popup) but nothing populates `detected_transactions` — depends on the user setting up phone-side automation (Tasker/MacroDroid) themselves. A ready-to-import automation profile would make this feature actually usable, if it's worth prioritizing.
13. **Fonnte WhatsApp bot** (including the account-extraction idea — reading which account a WhatsApp-reported transaction came from, defaulting to Cash) is **on hold**, pending a decision between building on Fonnte vs. an Evolution API-based integration. Nothing's been committed yet — see item 4 above and `backend.md`.
14. **Manual/Google Drive backup was removed** from Settings (the app relies on Supabase's realtime storage instead) — if there's ever a request for exportable backups again, note this was a deliberate product decision, not an oversight.
15. **"Split Bill" on the Target page is a static marketing teaser, not a real feature.** It's a "Coming Soon" card (`index.html`, `.coming-card`) describing bill-splitting with friends — no data model, no backend, its only button just shows a toast. It is **not** the same thing as "split a single payment across multiple accounts" (a different idea the product owner has floated from a previous product) — no connection between the two exists in this codebase today. If either gets built for real, they're separate features with separate designs; don't conflate them.

## Nice-to-haves, not yet started
- Automated CI for at least a syntax/lint check on `js/*.js` and the SQL migration file before merge.
- A staging Supabase project, so schema migrations can be tested before hitting the (currently single) real project.
- Compress/resize images client-side before upload (receipt photos, avatars currently sent as full-size base64).
- Clean up genuinely dead code: `wangku_pool_key`/`getKey()`/`loadPoolKey()` in `ui-helpers.js` and `chat-ai.js` are leftovers from before the Groq-key move and do nothing anymore. Same for `collectBackupPayload()`/`backupDataManual()`/`backupToDrive()` in `settings.js` — the backup UI was removed from Settings (see item 14), but these functions are still fully implemented with no button anywhere calling them.

## Data-accuracy audit findings (fixed/documented this session)
A prior documentation-vs-implementation audit found — and this session fixed or documented — several real gaps: `DEFAULT_CATEGORIES`/`DEFAULT_PRIORITIES`/`DEFAULT_ACCOUNT_NAME` had gone missing from `config.js` entirely (restored — see item 6 above), `login_check` didn't gate on `status='active'` (fixed, see Security section), the forgot-password `digest()` search-path bug (fixed, see Security section), and several undocumented-but-real features (local PIN lock, onboarding carousel, the full post-registration payment flow, this file's items 4/7/13/15) that are now written up in `frontend.md`/`architecture.md`/`features.md`/`ai.md`/`backend.md`.
