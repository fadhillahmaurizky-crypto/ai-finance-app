# Environment & Configuration

There is no `.env` file and no build-time environment injection — this is a static site with hardcoded JS constants, all of which are necessarily **public/client-visible** (anyone can view-source them). This is normal for a Supabase-anon-key architecture, but it does mean these values are not secrets in the traditional sense, *except* where noted.

## `js/config.js` — client-side constants

| Constant | Purpose |
|---|---|
| `SB_URL` | Supabase project URL |
| `SB_KEY` | Supabase anon key — public by design, but see [database.md](./database.md)'s RLS warning: with the current "allow all" policies, this key alone grants full read/write to every user's data |
| `MASTER` | Username that gets treated as admin/unlimited plan |
| `CS` | WhatsApp number for "Hubungi CS" links |
| `GAS` | Google Apps Script Web App URL |
| `LIMITS` | Per-plan AI token/scan limits |
| `DEFAULT_CATEGORIES` | Seeded on first load per user (block 13 migration) |
| `DEFAULT_PRIORITIES` | Same, for priorities |
| `DEFAULT_ACCOUNT_NAME` | `'Cash'` — must match the Apps Script's `DEFAULT_ACCOUNT_NAME` constant if you touch either |

Groq's API key is **not** in `config.js` — it's entered by the user/admin at runtime (Settings → API key input, `saveApiKey()` in `chat-ai.js`) and stored in `localStorage['wangku_pool_key']`. This was presumably done so the key isn't baked into a public repo, though it does mean the key lives in `localStorage`, readable by anything with JS execution on the page.

## `gas/wangku-backend.gs` — Apps Script constants

These are separate from the web app's config, live only inside the Apps Script project (or in the draft file in this repo, which currently has real values filled in — **do not commit that file with real keys to the public repo**):

| Constant | Purpose |
|---|---|
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Same Supabase project as the web app |
| `GROQ_API_KEY` | Groq key used for WhatsApp message parsing — **this one genuinely is a secret** and should live in Apps Script's Script Properties, not hardcoded, if you want it out of any repo entirely |
| `FONNTE_TOKEN` | Fonnte device token — also a real secret |
| `BACKUP_FOLDER_NAME` | Drive folder name for backups |

## `localStorage` keys used across the app

| Key | Set by | Purpose |
|---|---|---|
| `sdk_session` | `auth.js` | Cached logged-in user row |
| `sdk_bio_user`, `sdk_bio_cred` | `auth.js` | WebAuthn biometric binding |
| `wangku_pool_key` | `chat-ai.js` | Groq API key |
| `wangku_autosync` | `settings.js` | Toggle: refresh data on open + after transactions |
| `wangku_notif` | `settings.js` | JSON blob: reminder/badge/target/overspend notification prefs |
| `wangku_autodetect` | `settings.js` | Toggle: poll `detected_transactions` |
| `wangku_count_target_balance` | `settings.js` | Toggle: include target `terkumpul` in Saldo Sekarang |
| `wangku_last_trx_date` | `settings.js` | Used to compute the "badge" reminder dot and reminder notifications |
| `wangku_overspend_notif_<month>`, `wangku_target_notif_<id>` | `settings.js` | De-dupe flags so the same notification doesn't repeat |
| `theme` (or similar, in `ui-helpers.js`) | `toggleTheme()` | Light/dark preference |

## Twa-manifest.json (Android)

`packageId`, `host`, signing key path/alias, theme colors, `startUrl` — see [deployment.md](./deployment.md) for how this feeds into the Bubblewrap build.
