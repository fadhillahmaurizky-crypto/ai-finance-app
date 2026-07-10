# Known Technical Debt & Roadmap

Ordered roughly by how much it matters, not by how easy it is to fix.

## Security

1. **RLS policies are `USING (true)`/`WITH CHECK (true)` on every table.** The anon key — which is public by necessity in a client-side Supabase app — currently grants full read/write access to *all* users' data, not just the caller's own. This is the highest-priority fix before this app handles real users' financial data at any scale. Proper fix requires either adopting Supabase Auth (so `auth.uid()` exists and policies can check `auth.uid() = user_id`), or at minimum a Postgres function/policy that validates against the custom `users` table via a passed token.
2. **Auth is homegrown, not Supabase Auth.** Passwords are checked client-side against a plaintext-or-lightly-hashed column (verify which — this wasn't confirmed during this session) fetched via a `SELECT`. This is both a security concern (password comparison logic and any hashing happens in the browser, and the query itself returns the password field to the client) and a missed opportunity (Supabase Auth would give RLS integration for free).
3. **API keys have leaked into chat at least once** (Groq key, Fonnte token, both pasted in plaintext during a support session). Both should be rotated periodically regardless of whether the specific ones were "used" anywhere sensitive. Longer-term: move server-side secrets (Groq key, Fonnte token used by Apps Script) into Apps Script's Script Properties instead of hardcoded constants, so they're never in a file that could accidentally get committed.
4. Groq API key on the web app side lives in `localStorage`, readable by any script running on the page (XSS risk, however small the attack surface currently is).

## Data model

5. **`gas/wangku-backend.gs` is unverified against the actual live Apps Script.** It's a fresh rewrite based on inferring behavior from the schema, not a diff/merge of the real thing. Before deploying it, get the real script's source (from script.google.com, or via `clasp` if ever set up) and reconcile — otherwise you risk silently dropping working logic (admin alerts? usage tracking? different Basic-tier bot rules?).
6. `targets.terkumpul` is a denormalized counter, incremented by app code on each contribution — it is not derived from summing linked `transactions`. Any bulk import/backfill of transactions with `target_id` set must also patch `terkumpul` manually, or progress bars will be wrong.
7. `settings` table exists in the schema but isn't clearly wired up to a specific feature — audit before building on it.
8. Category/priority defaults were redefined at least twice during development (`makanan/transportasi/...` → `makan/belanja/elektronik/pulsa/paket_data`). Since defaults are only seeded once per user (on first load, if no `is_default` rows exist), users who signed up under an earlier default set are **not** retroactively migrated — they keep whatever was seeded when they joined. Decide if this matters enough to write a one-time migration script.
9. Icon/color lookup maps (`IM`/`BG`/`CL` in `transactions.js`) are keyed by category slug and manually kept in sync with `DEFAULT_CATEGORIES` in `config.js` — there's no single source of truth. If you rename a default category, update both places (and the receipt-scan prompt in `scanStruk()`, a third place).

## Known bugs / soft spots

10. **"Foto" (receipt scan) unreliability** was reported and partially addressed: `scanStrukNav` now gives explicit feedback on an empty/cancelled capture instead of failing silently, and `triggerCam()` is wrapped in try/catch. If it's still flaky, the likely remaining cause is Android killing the WebView process while the native camera app is in the foreground (a known TWA/low-memory-device issue) — that requires native-side investigation (Bubblewrap/Android project config), not a web-layer fix.
11. **Android back button** previously exited/restarted the app instead of navigating back. Fixed at the web layer via `history.pushState`/`popstate` in `app-core.js` for both page navigation and modal open/close. Not battle-tested across every modal — if you add a new modal, confirm the `MutationObserver` in `app-core.js` picks it up (it auto-attaches to every `.modal-overlay` present at boot; a modal injected into the DOM *after* boot would need manual registration).
12. The "Chrome disclosure" TWA snackbar was reportedly fixed by the user directly (Digital Asset Links / hosting-side) — not something addressed in this repo's code; worth documenting what was actually changed so it doesn't regress on a future resign/redeploy.

## Feature gaps / half-built by design

13. **Auto-detect transactions** has full app-side plumbing (table, poll, popup) but nothing populates `detected_transactions` — it depends on the user setting up phone-side automation (Tasker/MacroDroid) themselves. Consider writing a ready-to-import Tasker/MacroDroid profile as a companion doc if this feature should actually see use.
14. **Google Drive backup** depends on the unverified Apps Script (#5) actually being deployed with a working `doPost` handler for `action:'backup'`. Until confirmed, treat this feature as non-functional in production even though the client-side call exists.
15. **Fonnte account-extraction improvement** (reading which account a WhatsApp-reported transaction came from, defaulting to Cash) is drafted in `gas/wangku-backend.gs` but explicitly **on hold** — was not deployed, pending the real script being made available for a proper merge.

## Nice-to-haves, not yet started
- Automated CI for at least a syntax/lint check on `js/*.js` before merge.
- A staging Supabase project, so schema migrations can be tested before hitting production data.
- Compress/resize images client-side before upload (receipt photos and avatars are currently sent as full-size base64).
- Revisit whether `.env`-style config (even just for the Apps Script secrets) is worth the added complexity for a project this size.
