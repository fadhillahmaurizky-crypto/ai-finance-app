# Database

Postgres via Supabase. Schema lives entirely in `database/wangku-supabase-setup.sql`, applied as **additive, numbered migration blocks** (`[1]` through `[24]` as of this writing). The file is designed to be re-run safely from the top at any time — every block uses `IF NOT EXISTS`/`DROP ... IF EXISTS` guards. That property was hard-won (see "Migration history & lessons" below) and must be preserved in any future block.

## ERD

```mermaid
erDiagram
    users ||--o{ accounts : owns
    users ||--o{ transactions : owns
    users ||--o{ targets : owns
    users ||--o{ user_categories : owns
    users ||--o{ user_priorities : owns
    users ||--o{ orders : owns
    users ||--o{ detected_transactions : owns
    users ||--o{ password_reset_tokens : owns
    users ||--o{ token_purchases : owns
    accounts ||--o{ transactions : "account_id (source)"
    accounts ||--o{ transactions : "to_account_id (transfer dest)"
    targets ||--o{ transactions : "target_id (contribution)"

    users {
        uuid id PK
        text username
        text full_name
        text email
        text wa_number "WhatsApp number, used by Fonnte bot lookup (draft)"
        text password_hash "SHA-256 + static salt — NOT selectable by anon (see RLS notes)"
        text plan "free | basic | pro | unlimited"
        text status "pending | active | banned"
        text role "'user' or 'admin' — admin bypasses row ownership in RLS"
        text gas_user_id "WhatsApp number in GAS/Fonnte-friendly form, set at registration"
        text avatar_color "fallback avatar color, unused now that avatar_url exists"
        int tokens_limit
        int tokens_used
        text token_reset_month "reserved for a future token-reset-per-month flow, not currently read/written by the app"
        int ai_chat_count
        int ai_scan_count
        text usage_month "month key ai_chat_count/ai_scan_count were last reset for, checked in showApp()"
        text avatar_url "base64 image"
        timestamptz trial_ends_at
        timestamptz last_login "set on every successful doLogin()"
        timestamptz last_active "column exists, currently unused by app code"
        uuid token_version "random nonce embedded in every JWT, checked by is_owner_or_admin() — block [26]"
        text pin_hash "SHA-256 + static salt, NULL = PIN lock off — NOT selectable by anon, see block [29]"
    }

    accounts {
        uuid id PK
        uuid user_id FK
        text nama
        numeric saldo_awal
        bool is_default "which account pre-fills the transaction form"
        bool is_system "true only for the auto-created Cash account — blocks deletion, renaming still allowed"
        text icon
        text color
    }

    transactions {
        uuid id PK
        uuid user_id FK
        text jenis "pemasukan | pengeluaran | transfer"
        numeric nominal
        text kategori
        text prioritas "penting | tidak_penting"
        text keterangan
        date tanggal
        uuid account_id FK "source account"
        uuid to_account_id FK "destination account, transfer only"
        uuid target_id FK "set when this row is a savings contribution"
    }

    targets {
        uuid id PK
        uuid user_id FK
        text nama
        numeric nominal "goal amount"
        numeric terkumpul "amount saved so far — denormalized, see notes"
        date deadline
    }

    user_categories {
        uuid id PK
        uuid user_id FK
        text nama
        text jenis "pemasukan | pengeluaran"
        bool is_default "seeded default vs user-created — both editable/deletable identically"
    }

    user_priorities {
        uuid id PK
        uuid user_id FK
        text nama
        text slug
        bool is_default
    }

    orders {
        uuid id PK
        uuid user_id FK
        text plan
        numeric amount
        text bukti_url "base64 payment proof image"
        text status "pending | approved | rejected"
    }

    detected_transactions {
        uuid id PK
        uuid user_id FK
        text source_app
        text raw_text
        numeric nominal_guess
        text jenis_guess
        text status "pending | confirmed | dismissed"
    }

    password_reset_tokens {
        uuid id PK
        uuid user_id FK
        text otp_hash "hashed, never stores the raw OTP"
        timestamptz expires_at "10 minutes"
        bool used "single-use"
    }

    token_purchases {
        uuid id PK "also sent to Xendit as external_id"
        uuid user_id FK
        int tokens "tier size, e.g. 2000000"
        numeric amount "Rp, e.g. 35000"
        text status "pending | paid — the UPDATE...WHERE status='pending' IS the webhook idempotency check"
        text xendit_invoice_id "Xendit's own id, for dashboard cross-reference only — not the idempotency key"
        timestamptz paid_at
    }

    settings {
        text key PK
        text value
    }
```

## Table notes

### `users`
Root of everything. `role='admin'` (or `username = MASTER` constant) grants unlimited plan + admin panel access. **Not** Supabase Auth — this is a plain table, and login is entirely custom (see the RLS/auth section below).

### `accounts`
Every user gets exactly one auto-created **Cash** account (`is_system=true`) on first load. It can be renamed but never deleted — enforced in `accounts.js` client-side (`deleteAccount()` checks `is_system` before allowing the call) — there's no database-level constraint blocking the delete, so don't rely on this being unbreakable from a raw API call. `is_default` is separate from `is_system`: the user can change which account is their default; the system account flag never changes.

### `transactions`
The core ledger. `jenis='transfer'` rows move money between two of the user's own accounts and are excluded from all income/expense totals. `target_id` is set when a row represents a savings contribution — it's still a normal `pengeluaran` row (money leaves the source account) but also increments the linked target's `terkumpul`.

**Balance model**: "Saldo Sekarang" on Home = `SUM(account.saldo_awal)` + all-time `pemasukan` − all-time `pengeluaran` (transfers excluded, since they're internal). This was changed partway through the project from a "current month only" model — if you see old code or docs describing a monthly-reset balance, that's stale. Optionally, target `terkumpul` totals are added on top if the user has enabled "Hitung Saldo Target" in Settings (`countTargetInBalance()` in `settings.js`).

### `targets`
`terkumpul` is a denormalized running total, incremented directly by app code (`submitContribution()` in `transactions.js`) whenever a contribution transaction is saved — **it is not computed by summing linked transactions at query time.** Any bulk import/backfill of transactions with `target_id` set must also patch `terkumpul` manually.

### `user_categories` / `user_priorities`
Defaults are seeded as real rows (`is_default=true`) once per user, the first time they load the app with none present (`seedDefaultCategories()`/`seedDefaultPriorities()`), reading from `DEFAULT_CATEGORIES`/`DEFAULT_PRIORITIES` in `js/config.js`. Every category/priority — default or custom — lives in one table and is editable/deletable through the same full-page UI (Settings → Kelola Kategori / Kelola Prioritas). Current default set: Pemasukan = Gaji, Bonus; Pengeluaran = Makan, Belanja, Elektronik, Pulsa, Paket Data. **This changed more than once during development** — users who signed up under an earlier default set were not retroactively migrated, since seeding only fires when zero `is_default` rows exist yet.

`user_categories` is unique on `(user_id, nama, jenis)` (block `[19]`) — not just `(user_id, nama)`. The narrower constraint used to block adding a category name that already existed under the other `jenis` (e.g. couldn't add "Arisan" as a Pengeluaran category if "Arisan" already existed as Pemasukan), which was both a bug report and a blocker for the same-name-different-jenis use case. Fixed once, for both.

**As of block `[23]`, uniqueness is case-insensitive** — enforced via a `UNIQUE INDEX ... (user_id, lower(nama), jenis)` rather than a plain column-list constraint (Postgres unique constraints can't reference expressions like `lower(...)`, only unique indexes can). This replaced the block-`[19]` constraint, not stacked alongside it. Root cause it fixes: `DEFAULT_CATEGORIES` seeds lowercase (`'bonus'`), the UI displays categories with the first letter capitalized purely for readability (`charAt(0).toUpperCase()`) without ever touching the stored value, and Postgres's default text comparison is case-*sensitive* — so a user manually typing "Bonus" (believing it's the same category as the default they see displayed as "Bonus") was creating a byte-different row that the old exact-match constraint couldn't catch. It only caught a *second* identical-case attempt against that new row, which read as "inconsistent" duplicate detection until traced to the byte level. `categories.js` also lowercases `nama` client-side before every insert/update now, so stored values stay consistently lowercase (matching the existing capitalize-on-display convention) — the DB index is the authoritative backstop, the client-side lowercasing is just for data hygiene.

### `orders`
Payment proof submissions for plan upgrades, reviewed manually via `admin.html`. **Not** used for token top-ups — see `token_purchases` below; the two purchase flows are deliberately kept separate.

### `token_purchases`
Xendit token top-up tracking (block `[28]`, test mode — see `backend.md` §4). **Fully locked down** (`FOR ALL USING (false)`), same as `password_reset_tokens` — the client never reads or writes this table; only `/api/create-payment.js`/`/api/xendit-webhook.js` touch it, via the service role key. `id` doubles as the `external_id` sent to Xendit, so the webhook can `UPDATE ... WHERE id=<external_id> AND status='pending'` directly instead of needing a separate lookup — and that same `WHERE status='pending'` clause is the entire idempotency mechanism for handling Xendit's webhook retries.

### `detected_transactions`
Support table for "auto-detect transactions." **Nothing in this codebase writes to it.** It's designed so a phone-side automation tool (Tasker/MacroDroid) posts directly to Supabase's REST API on notification-received, and the app polls + shows a confirm/dismiss popup. See `ai.md` and `roadmap.md`.

### `password_reset_tokens`
Backs the forgot-password flow. The OTP itself is generated inside Postgres (`create_password_reset`), returned once as plaintext so the client can email it via EmailJS, but only its **hash** is stored, with a 10-minute expiry and single-use flag, checked inside `confirm_password_reset`. This replaced an earlier version where the OTP was only ever checked in a JavaScript variable client-side — a real bypassable gap that's now closed.

Both `create_password_reset` and `confirm_password_reset` call `digest()` from `pgcrypto`. They originally had `SET search_path = public` (no `extensions` schema), which made forgot-password fail end-to-end with `function digest(text, unknown) does not exist` — the same class of bug the `[18]` JWT-signing functions had already hit and fixed for themselves, just missed on these two. Both now use `SET search_path = public, extensions`.

### `settings`
Generic key-value table. **Fully locked down** (`FOR ALL USING (false)`) — nothing reads or writes it anymore since the Groq key moved to a Vercel environment variable. If you're tempted to use this table for new config, reconsider; it has no access path left by design.

## Custom auth & RLS — read this before touching any table's policy

This is the single most important thing to understand about this schema. It replaced an earlier state where **every table had `USING (true)`** — meaning the public Supabase anon key alone (necessarily embedded in client JS) could read and write *any* user's data. That's fixed now, via a from-scratch custom-auth layer (blocks `[17]` and `[18]`):

1. **`login_check(username, password_hash)`** verifies the password inside a `SECURITY DEFINER` function (so the client never queries `password_hash` directly — that column's `SELECT` privilege is revoked from `anon` entirely) and returns `{user, token}`, where `token` is a JWT signed with the project's real JWT secret. As of block `[20]`, it also requires `status = 'active'`, matching `get_user_by_username`/`get_user_by_id`. Before that fix, a `pending`/`banned` account's correct password still got a validly-signed 30-day JWT back from the RPC itself — the web client discarded it (it checks `result.user.status` before persisting the token), but a direct call to the RPC (it's `GRANT`ed to `anon`) bypassed that client-side gate entirely.
2. **The signing is hand-rolled**, not via the `pgjwt` extension — `pgjwt`'s `sign()` has its own fixed internal search path that can't be overridden by a caller, which caused real failures in practice (see migration history below). Instead, `wangku_sign_jwt()` builds the JWT manually (base64url header + payload + HMAC-SHA256 signature via `pgcrypto`'s `hmac()`), inside a function where the search path is fully controlled.
3. **Every data table's policy** is `is_owner_or_admin(user_id)`. As of block `[26]`, this is **not** a pure JWT-claims comparison anymore — it looks up the real row by the claimed `user_id` and additionally requires the JWT's `token_version` claim to match what's currently stored for that row, checking the real `role` column rather than trusting the JWT's self-asserted `app_role`. See "JWT signing secret exposure & mitigation" below before assuming this predicate is a simple claims check.
4. **Registration** (no token exists yet) is allowed via a separate `anon`-scoped `INSERT` policy on `users`. As of block `[24]`, `WITH CHECK (status = 'active' AND role = 'user')` — registration creates an immediately-active trial account, not a `pending` one waiting on admin approval (see "Subscription trial mechanics" below). **Read the "Registration and `Prefer: return=representation`" section below before touching this policy or the registration flow** — the interaction between this policy and the client's request headers is subtler than it looks.
5. **`admin.html`** goes through the exact same `login_check` RPC (just checking `role='admin'` client-side after success) — it no longer has its own separate shared-password gate.

### Functions involved (all in `public` schema)
| Function | Purpose |
|---|---|
| `wangku_b64url(bytea)` | Base64url encode, no padding, no newlines |
| `wangku_sign_jwt(payload json, secret text)` | Manual HS256 JWT signing |
| `is_owner_or_admin(user_id uuid)` | The RLS predicate used everywhere — as of block `[26]`, also verifies the JWT's `token_version` claim against the live `users` row, see below |
| `login_check(username, password_hash)` | Password verify + mint token (requires `status='active'`, block `[20]`; lazy trial-expiry downgrade, block `[24]`; embeds `token_version`, block `[26]`; returned user object includes a computed `pin_enabled` boolean instead of the raw `pin_hash`, block `[29]`) |
| `get_user_by_username(username)` | Biometric login — mints a fresh token (same lazy trial-expiry downgrade, `token_version` embedding, and `pin_enabled` computation as `login_check`) |
| `get_user_by_id(user_id)` | Session restore — mints a fresh token (also silently upgrades pre-migration sessions; same lazy trial-expiry downgrade, `token_version` embedding, and `pin_enabled` computation as `login_check`) |
| `change_password(user_id, old_hash, new_hash)` | Requires proof of the old password. Was silently broken since block `[17]` — see block `[29]`'s note below, fixed incidentally while building `set_pin_hash` |
| `create_password_reset(email)` | Step 1 of forgot-password — generates + stores hashed OTP |
| `confirm_password_reset(user_id, otp, new_hash)` | Step 2 — validates OTP server-side, then resets |
| `wangku_check_account_balance()` | Trigger function, block `[21]` — see "Per-account balance enforcement" below |
| `check_registration_available(username, email, wa_number)` | Block `[22]`, extended in block `[25]` to also check `wa_number` — SECURITY DEFINER boolean check, see "Registration and `Prefer: return=representation`" below |
| `set_pin_hash(pin_hash)` | Block `[28]` — sets/clears the caller's own `pin_hash`. Identity comes from the caller's JWT (`user_id` + `token_version`), not a parameter, so it can't touch another user's row |
| `verify_pin(pin_hash)` | Block `[28]` — checks the caller's own `pin_hash`, same JWT-derived identity as `set_pin_hash` |

## JWT signing secret exposure & mitigation (block `[26]`) — CRITICAL, read this before touching auth

**The HS256 secret passed to `wangku_sign_jwt()` throughout this file is committed to a public GitHub repo** — confirmed fetchable by anyone, unauthenticated, via a plain `raw.githubusercontent.com` request. Since JWT signature verification only proves "signed by someone who knows this secret," anyone who reads this file could construct a validly-signed token claiming any `user_id` and `app_role: 'admin'`, defeating every RLS policy in this schema — `is_owner_or_admin()` previously trusted a JWT's self-asserted `user_id`/`app_role` claims at face value, with no way to distinguish a genuine token from a forged one signed with the same known secret.

**Rotating the actual secret was investigated and hit a real platform limitation.** Supabase's newer JWT Signing Keys system (Project Settings → JWT Keys) does not expose the raw secret value for auto-generated or rotated keys — by design, since it's meant for Supabase Auth's own SDK to use internally without a developer ever needing to know it. `wangku_sign_jwt()` hand-signs tokens itself and must know the exact secret string, so there was no way to get a fresh, Supabase-verified secret through the dashboard. (Supabase's separate publishable/secret API key system — Settings → API Keys — is unrelated to this problem: it replaces `anon`/`service_role` key management independently of the JWT signing key, and remains a reasonable follow-up, but doesn't touch custom-signed session tokens at all.)

**The fix (block `[26]`) closes the practical exploit a different way, entirely within this schema, independent of Supabase's key management:**
- Added `users.token_version` (`UUID DEFAULT gen_random_uuid()`) — a random per-user nonce, unguessable without already having legitimate access to that account.
- `login_check`/`get_user_by_username`/`get_user_by_id` all now embed the user's current `token_version` as a JWT claim.
- `is_owner_or_admin(user_id)` no longer trusts `auth.jwt()->>'user_id'`/`app_role` directly. It now looks up the real row by the claimed `user_id`, requires the JWT's `token_version` claim to match what's *currently* stored for that exact row, and checks the real `role` column — not the self-asserted `app_role` claim. Marked `SECURITY DEFINER` (it wasn't before) since it now queries `users`, which has its own RLS policies that would otherwise recurse into this same function.

An attacker with the leaked secret can still construct a validly-signed token — the secret being public is unavoidable without a real rotation — but they can't satisfy the `token_version` match without already knowing a specific user's private random nonce. This closes both the "impersonate any user" and "self-escalate to fake admin" paths.

**Verified directly against the live production REST API**, not just locally: reproduced `wangku_sign_jwt()`'s exact signing procedure byte-for-byte in a separate script (cross-checked against a real call to the function — identical output confirmed the reproduction wasn't an artifact of a scripting mistake, since an earlier naive attempt using a different key-derivation method produced a *different*, incorrectly-failing signature that would have given a false sense of security). Forged a token with a real user's `id` + `app_role:'admin'` + a wrong/guessed `token_version`, and confirmed it returns HTTP 200 with zero rows against both `users` and `transactions` — accepted as a validly-signed token, then correctly blocked by RLS. A genuine token from a real `login_check()` call (correct `token_version`) was confirmed to still work normally over the same REST API.

**Side effect (expected, unavoidable):** every currently-active session was invalidated the moment this deployed — existing tokens don't carry a `token_version` claim at all, so they fail the new check. Same disruption a real secret rotation would have caused. Everyone needed to log in again.

**This does not make the leaked secret itself safe to leave public.** It only closes the practical exploit path that leak enabled. Getting a genuinely fresh, non-public secret in place — or moving off hand-rolled Postgres-side JWT signing entirely (e.g. minting tokens from a Vercel function instead, matching the `/api/ai-chat.js` pattern of keeping trust-sensitive material in env vars, never in a committed file) — remains worth pursuing separately. See `roadmap.md`.

## Registration and `Prefer: return=representation` (block `[22]`) — read before touching registration or the `users` SELECT policy

Registration threw `new row violates row-level security policy for table "users"` in production, and the first-pass fix (forcing the anon key explicitly, in case a stale `sdk_token` from a prior session was leaking into the request) was **wrong** — plausible-looking, shipped, and didn't fix it, confirmed by testing the raw Supabase REST API directly with nothing but the genuine anon key.

**Actual root cause**: `sb()`/`sbAnon()` send `Prefer: return=representation` on every `POST`, so the client can read the row back immediately. That means Postgres also has to evaluate the **SELECT** policy against the newly-inserted row before it can return it — and no SELECT policy on `users` permits `anon` to see *any* row, including one it just created itself (`"Own row or admin - select"` requires a JWT `user_id` matching the row, which an anonymous pre-login request can never have). The `INSERT` itself is perfectly valid and passes `"Public registration"` — but Postgres fails the *entire statement* because it cannot satisfy the implicit read-back `return=representation` demands. Confirmed directly (via the Supabase MCP, live against this project): the identical `INSERT` succeeds with no `RETURNING`/representation requested, and fails identically whether or not a stale token is involved.

This also means `doRegister()`'s original duplicate-check (a plain `SELECT ... WHERE username=... OR email=...` as anon) was **separately, always broken** — it can never see an existing row as `anon` either, so it silently reported "available" even for a taken username/email.

**Fix**: don't ask Postgres to read anything back for anon writes to `users`.
- `verifyRegOTP()` (`auth.js`) now generates the new row's `id` client-side (`crypto.randomUUID()`), sends it explicitly in the `INSERT` payload, and uses `Prefer: return=minimal` (`sbAnon(path, method, body, minimal=true)` in `ui-helpers.js`) — so no SELECT policy is ever needed.
- The duplicate-check is now `check_registration_available(p_username, p_email)` — a `SECURITY DEFINER` RPC that returns **only a boolean**, not the matching row. This was deliberately chosen over adding a broader `anon`-scoped SELECT policy (e.g. `USING (status='pending' AND role='user')`), which would let anyone with the public anon key enumerate every pending registrant's email/WhatsApp number/full name indefinitely — a real information-disclosure risk not worth taking just to make a pre-check work.

**If a future flow needs to write to `users` (or any other table) as `anon` and also read the result back, it will hit this same wall** — either give it a real, narrowly-scoped SELECT policy, or (preferred, as done here) avoid needing the read-back at all.

## Subscription trial mechanics (block `[24]`)

Registration (`verifyRegOTP()` in `auth.js`) sets `plan='pro'`, `trial_ends_at = now() + 14 days`, `tokens_limit=2000000` directly in the `INSERT` payload — same pattern as the existing client-set `plan`/`tokens_limit` fields, not a new trust boundary (the `Public registration` RLS policy still only constrains `status`/`role`, not these values; a malicious client could in principle self-assign an inflated `trial_ends_at` or `tokens_limit` today, same as it already could with `plan` before this change — a pre-existing gap, not introduced or closed here).

**No distinct `'trial'` plan value.** A trialing user is simply `plan='pro'` with a non-null `trial_ends_at` — chosen over adding a separate marker because it's less disruptive to every existing `plan==='pro'` check across the codebase (`getPlan()`, `canAI()`, `PLANS`/`LIMITS` lookups, `renderPlanCard()`, etc.), none of which needed to change. `trial_ends_at` doubles as the "is/was this a trial" marker.

**Lazy downgrade, checked in `login_check`/`get_user_by_username`/`get_user_by_id`** (all three — login, biometric, session-restore): if `trial_ends_at IS NOT NULL AND trial_ends_at < now() AND plan = 'pro'`, the function `UPDATE`s the row to `plan='free'` before returning the user object. No cron/scheduled job. **Never locks the account out** — `status` stays `'active'`, the user keeps using everything Free includes, only AI Chat/Scan/WhatsApp-bot access goes away.

**Critical invariant admin.html must preserve**: the downgrade only fires when `plan` is *still* exactly `'pro'` — deliberately, so that if an admin manually upgrades a user to a real paid plan via `admin.html` (`updateUserPlan()`/`aktivasiUser()`) *after* their trial's `trial_ends_at` has already passed, the next login doesn't immediately clobber that back down to `'free'`. Both of those functions now also set `trial_ends_at = null` whenever they PATCH `plan` — nulling it is what permanently takes a user out of reach of the lazy-downgrade check. **If a future admin-side flow sets `plan` directly without also clearing `trial_ends_at`, a user who paid for a real upgrade after their trial lapsed can silently get auto-downgraded on their very next login** — any new plan-assignment path must clear `trial_ends_at` too, or reintroduce a different way to distinguish "still trialing" from "really on this plan."

## PIN lock mechanics (block `[29]`)

`users.pin_hash` (nullable `TEXT`) replaces what used to be a purely local, device-side `localStorage['wangku_pin']` value — see `frontend.md` for the full before/after and the client-side migration logic. `NULL` means PIN lock is off (the default; opt-in via a Settings toggle, not forced).

**Never directly selectable by `anon`**, same reasoning and same mechanism as `password_hash` (`REVOKE SELECT (pin_hash) ON public.users FROM anon`) — arguably more important here, since a 6-digit PIN has only 1,000,000 possible values, making a leaked hash far cheaper to brute-force offline than a leaked `password_hash`. `login_check`/`get_user_by_username`/`get_user_by_id` all exclude `pin_hash` from the returned user object and instead inject a computed `pin_enabled` boolean (`pin_hash IS NOT NULL`) — that's the only PIN-related signal the client ever receives.

**`set_pin_hash(pin_hash)` and `verify_pin(pin_hash)` both derive identity from the caller's own JWT** (`auth.jwt()->>'user_id'` matched against `token_version`, same pattern as `is_owner_or_admin()`/`admin_get_infra_stats()`, blocks `[26]`/`[27]`) rather than trusting a client-supplied `user_id` parameter — deliberately not reusing `change_password`'s older pattern (block `[17]`, which trusts a raw `p_user_id` param and relies on requiring the correct old-password hash as its only real safeguard). Since PIN verification happens right after `get_user_by_id`/`login_check` already returned a fresh, valid JWT, the caller always has one available by the time either PIN RPC is reachable.

## Per-account balance enforcement (block `[21]`)

A `BEFORE INSERT OR UPDATE ON transactions` trigger (`trg_check_account_balance` → `wangku_check_account_balance()`) blocks a `pengeluaran` or `transfer` row from pushing its source account (`account_id`) negative. The balance it checks is **per-account, all-time** — `accounts.saldo_awal` plus that one account's own transaction history (not the aggregate Saldo Sekarang) — so a transfer/expense is only blocked if *its own* account can't cover it, even if another of the user's accounts has plenty. `pemasukan` rows are never restricted. On `UPDATE` (editing an existing transaction), the row being edited is excluded from its own balance recalculation so it doesn't double-count against itself.

This is a safety net behind the primary UX, which is a client-side check in `js/transactions.js`/`js/accounts.js` (`getAccountBalance()`) that blocks submission with an inline toast before the request is even sent. Both layers use the same all-time balance model as Saldo Sekarang, deliberately, for consistency.

**Note for future split-payment work:** this trigger and the client check both assume one transaction has exactly one source `account_id`. If a "split a single payment across multiple accounts" feature is ever built (see `roadmap.md`), this logic will need revisiting — it wasn't written to accommodate multiple source accounts per transaction.

## Migration history & lessons (worth reading before writing new migrations)

This took three rounds to get right on the actual live Supabase project, each surfacing a genuine Postgres/Supabase behavior worth knowing:

1. **`CREATE POLICY IF NOT EXISTS` is not valid syntax** — Postgres's `CREATE POLICY` has no `IF NOT EXISTS` clause at all (unlike `CREATE TABLE`/`CREATE INDEX`). Every policy in this file now uses `DROP POLICY IF EXISTS "name" ON table; CREATE POLICY "name" ON table ...` instead. This was a latent bug sitting in the schema from very early on that only surfaced once the file was run start-to-finish instead of block-by-block.
2. **`CREATE OR REPLACE FUNCTION` cannot change a function's return type.** Several functions changed shape across blocks (`SETOF JSONB` → `JSONB`) as the auth design evolved. Every such redefinition needs an explicit `DROP FUNCTION IF EXISTS name(arg_types)` immediately before it — in **both** directions, since the file can be re-run on a database that's already at either end state.
3. **`pgjwt`'s `sign()` has a search path you cannot override from your own function** — Postgres resolves names inside a *called* function using that function's own configured search path, not the caller's. No amount of `SET search_path` on our own functions fixed `sign()` failing to find `hmac()`. The actual fix was to stop depending on `pgjwt` and hand-roll the signing using `pgcrypto`'s `hmac()` directly inside a function we fully control.
4. **The `extensions` search-path lesson from #3 doesn't automatically propagate to every function that calls a `pgcrypto` function.** `wangku_sign_jwt`/`wangku_b64url` got `SET search_path = public, extensions` when they were written (block `[18]`), but `create_password_reset`/`confirm_password_reset` (block `[17]`, calling `digest()`) were left with just `SET search_path = public` — which broke forgot-password in production with `function digest(text, unknown) does not exist`. Fixed by adding `extensions` to their search path too. **Any function that calls a `pgcrypto` function (`digest`, `hmac`, `crypt`, etc.) needs `extensions` in its `search_path`, full stop** — don't assume it's only relevant to the JWT-signing functions.
5. **Postgres combines multiple *permissive* RLS policies on the same table/command with OR — a new restrictive policy existing does not disable an old permissive one sitting next to it.** This bit in practice: after block `[18]` should have replaced every table's `"Allow all ..."` (`USING (true)`) policy with `"Own data or admin"`, a live check of `pg_policies` found **both policies present simultaneously on every single data table** (plus `settings`) — meaning the `USING (true)` policy was still winning via OR, and RLS was providing *zero* actual isolation despite the correct policy also existing. This most likely happened because an early re-run only touched blocks that create the `"Allow all ..."` policies (blocks `[1]`–`[14]`, which are also `DROP POLICY IF EXISTS`+`CREATE POLICY`, so they're idempotent but will happily recreate the permissive policy if run again after block `[18]` already removed it) without also re-running block `[18]`'s drops. **Whenever verifying RLS on this schema, don't just confirm the intended policy exists — run `SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;` and confirm no stray `"Allow all ..."` policy is sitting alongside it on any table.** A restrictive-looking policy existing is not proof that access is actually restricted.
6. **`INSERT ... RETURNING` (or PostgREST's `Prefer: return=representation`, which is `RETURNING`-equivalent) requires the SELECT policy to permit reading the newly-inserted row — a valid INSERT policy is not enough on its own.** This cost real time chasing the wrong root cause for the registration RLS error (see "Registration and `Prefer: return=representation`" above): the actual `INSERT` was valid and passing its own policy the entire time; the request failed because it *also* implicitly needed a SELECT policy that plainly didn't and couldn't exist for an anonymous pre-login request. **If a write-as-`anon`-or-similarly-restricted-role flow fails with an RLS error, check whether the request is asking for the row back (`RETURNING`, or PostgREST's default `return=representation` on POST) before assuming the write policy itself is wrong** — test the identical statement with and without a returning clause to tell the two apart. Confirmed for this exact case by testing directly against the live database via the Supabase MCP: identical INSERT, no RETURNING → succeeds; with RETURNING → fails with the RLS error every time.
7. **A `UNIQUE(a, b, c)` constraint can be working *exactly* as defined and still fail to catch what a user would call a duplicate, if the app displays a transformed version of a value without ever normalizing the stored value to match.** `user_categories`' unique constraint was never broken — Postgres text comparison is case-sensitive by design, `DEFAULT_CATEGORIES` seeds lowercase, and the UI capitalizes the first letter for display only (`charAt(0).toUpperCase()`), never touching what's stored. A user typing "Bonus" into the add-category form — reasonably believing it's the same category shown on screen — created a byte-different row the constraint had no way to flag. **Before assuming a unique constraint is buggy or misapplied, check `pg_get_constraintdef()` (confirm it's exactly what you think) and diff the actual byte content of the "duplicate" rows (`encode(col::bytea,'hex')`)** — don't assume "duplicate" means byte-identical just because two rows look the same on screen. Fixed by switching to a `UNIQUE INDEX` on `lower(nama)` instead of `nama` directly (plain unique constraints can't reference expressions, only unique indexes can), plus lowercasing client-side before insert as a second layer of hygiene.

8. **`GET DIAGNOSTICS var = ROW_COUNT` needs `var` declared `INTEGER`, not `BOOLEAN` — PL/pgSQL will let you declare it `BOOLEAN` without erroring at the `GET DIAGNOSTICS` line itself, but then any comparison like `RETURN var > 0` fails at call time with `operator does not exist: boolean > integer`.** `change_password` (block `[17]`) was written with exactly this pattern and has been silently broken in production since it was written — confirmed live via a direct RPC call, which 42883'd instead of returning a real result. Found while writing `set_pin_hash` for block `[29]`, which copied the same (broken) pattern from `change_password` as its template; both are fixed as of block `[29]`. **If you see `DECLARE v_ok BOOLEAN; ... GET DIAGNOSTICS v_ok = ROW_COUNT; RETURN v_ok > 0;` anywhere, it's broken — rename the variable to something like `v_rows`, declare it `INTEGER`, and only compare `> 0` against that.**

If a future migration hits `cannot change return type` or a `function ... does not exist` error from inside a third-party extension function, these are the first things to check. And if anything about per-user isolation seems off, check `pg_policies` directly rather than trusting that the last migration you ran did what it said.
