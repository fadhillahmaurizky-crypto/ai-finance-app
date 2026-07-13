# Environment & Configuration

No `.env` for the static site — everything's a hardcoded JS constant in `js/config.js`, necessarily client-visible (view-source). This is normal for a Supabase-anon-key architecture. The **Vercel serverless functions are different** — they use real environment variables, which is exactly why the Groq key moved there.

## `js/config.js` — client-side constants

| Constant | Purpose |
|---|---|
| `SB_URL` | Supabase project URL |
| `SB_KEY` | Supabase anon key — public by design. Used as a fallback before login; after login the real per-user JWT (`sdk_token`) is used instead for anything that matters |
| `MASTER` | Username treated as admin/unlimited plan |
| `CS` | WhatsApp number for "Hubungi CS" links |
| `GAS` | Google Apps Script Web App URL (draft — see `backend.md`) |
| `LIMITS` | Per-plan AI token/scan limits (also re-checked server-side in `/api/ai-chat.js` and `/api/ai-scan.js` — don't rely on the client-side copy for actual enforcement) |
| `DEFAULT_CATEGORIES` / `DEFAULT_PRIORITIES` | Seeded once per user on first load |
| `DEFAULT_ACCOUNT_NAME` | `'Cash'` — must match `DEFAULT_ACCOUNT_NAME` in the (draft) Apps Script if that's ever revived |

**Groq's API key is not here anymore.** It lives only in Vercel's environment variables (`GROQ_API_KEY`), read by `/api/ai-chat.js` and `/api/ai-scan.js` server-side. It used to be fetched by the client from a Supabase `settings` table row — that was a real, live exposure (anyone could read it from the public database with just the anon key) and is now closed: the table is fully locked down and nothing reads it.

## Vercel environment variables (server-side only)

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Required for both `/api/ai-chat.js` and `/api/ai-scan.js` to function at all |
| `SUPABASE_URL` | Optional override — both functions have the real value hardcoded as a fallback, so this isn't strictly required, but prefer setting it if you want one place to update if the project ever changes |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** for both functions — used *only* for the internal plan/token lookup query (see `backend.md`). Get the real value from Supabase Dashboard → Project Settings → API → `service_role` secret, and set it directly in Vercel's environment variables. **Never hardcode this one** (unlike the anon key, which is public by design) and never let it reach any client-facing code path. |

## Postgres-side secret (lives in the SQL, not in this repo's client code)

The **Supabase JWT secret** (Dashboard → Project Settings → Data API → JWT Settings) is embedded directly inside three `SECURITY DEFINER` Postgres functions (`login_check`, `get_user_by_username`, `get_user_by_id`) that sign tokens. This is safe from remote exposure — PostgREST only exposes the `public` schema's tables/views/functions through its REST API, not function *source code* (`pg_proc`/`information_schema` aren't reachable via the anon key). Anyone with dashboard/SQL-editor access to the project can see it, which is expected (that's already a trusted level of access). If this secret is ever rotated in Supabase, **all three functions must be updated to match**, or every login will fail.

## `localStorage` keys

| Key | Set by | Purpose |
|---|---|---|
| `sdk_session` | `auth.js` | Cached logged-in user row (no `password_hash` — that column isn't even returned anymore) |
| `sdk_token` | `auth.js` | The custom-signed JWT — this is what actually authorizes requests now |
| `sdk_bio_user`, `sdk_bio_cred` | `auth.js` | WebAuthn biometric binding |
| `sdk_ob` | `ui-helpers.js` (`checkOb`/`skipOb`) | Whether the first-time onboarding carousel has been shown/skipped already — see `features.md` |
| `wangku_pin` (`PIN_KEY`) | `ui-helpers.js` (`showPinScreen`/`pinSubmit`) | The local PIN-lock code — a device-side gate shown after login/session-restore, before `showApp()`. See `frontend.md`'s "Local PIN lock" section |
| `wangku_balance_hidden` | `dashboard.js` | Saldo show/hide toggle preference |
| `wangku_aksi_cepat` | `dashboard.js` (`getAksiCepatSelection`/`saveAksiCepat`) | JSON array of up to 5 shortcut ids shown in Home's Aksi Cepat row (user-editable via the "Edit" link) |
| `wangku_autosync` | `settings.js` | Refresh-on-open + after-transaction toggle |
| `wangku_notif` | `settings.js` | JSON blob: reminder/badge/target/overspend notification prefs |
| `wangku_autodetect` | `settings.js` | Toggle: poll `detected_transactions` (see `ai.md` — the table itself is never populated by this codebase) |
| `wangku_count_target_balance` | `settings.js` | Whether target `terkumpul` counts toward Saldo Sekarang |
| `wangku_last_trx_date` | `settings.js` | Drives the reminder badge/notification de-dupe logic |
| `wangku_pool_key` | `chat-ai.js` | **Dead code** — leftover from before the Groq-key move to Vercel; nothing reads this to make real API calls anymore, safe to remove entirely in a future cleanup |
| theme preference | `ui-helpers.js` (`toggleTheme()`) | Light/dark |

## Admin panel (`admin.html`) — separate token, separate storage keys

| Key | Purpose |
|---|---|
| `wangku_admin_token` | The admin's own JWT (from the same `login_check` RPC, requiring `role='admin'`) |
| `wangku_admin_user` | Cached admin user object |

There is **no more shared static admin password** (`wangku_admin_pass`/`admin123` are gone) — every admin panel session now requires a real `role='admin'` account. See `database.md` for how new admin accounts get created (Settings → Kelola Admin, inserting a `role='admin'` row).

## `twa-manifest.json` (Android)
`packageId`, `host`, signing key path/alias, theme colors, `startUrl`. See `deployment.md`.
