# Database

Postgres via Supabase. Schema lives entirely in `database/wangku-supabase-setup.sql`, applied as **additive, numbered migration blocks** (`[1]` through `[16]` at last count) — this file is meant to be re-run safely (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, etc.), not a one-shot script.

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
    accounts ||--o{ transactions : "account_id (from/source)"
    accounts ||--o{ transactions : "to_account_id (transfer dest)"
    targets ||--o{ transactions : "target_id (contribution)"

    users {
        uuid id PK
        text username
        text full_name
        text email
        text wa_number "WhatsApp number, used by Fonnte bot lookup"
        text password
        text plan "free | basic | pro | unlimited"
        text status "active | pending | ..."
        text role "admin for master account"
        int tokens_limit
        int tokens_used
        int ai_chat_count
        int ai_scan_count
        text avatar_url "base64 image, added block 10"
        timestamptz trial_ends_at "added block 10"
    }

    accounts {
        uuid id PK
        uuid user_id FK
        text nama
        numeric saldo_awal
        bool is_default
        bool is_system "true only for the auto-created Cash account — blocks deletion"
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
        numeric terkumpul "amount saved so far"
        date deadline
    }

    user_categories {
        uuid id PK
        uuid user_id FK
        text nama
        text jenis "pemasukan | pengeluaran"
        bool is_default "seeded default vs user-created — both are editable/deletable"
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

    settings {
        text key PK
        text value
    }
```

## Table notes

### `users`
Root of everything. Also doubles as the auth table — see [roadmap.md](./roadmap.md) for why that's flagged as debt. `role='admin'` or `username===MASTER` (a constant in `config.js`) grants unlimited plan + admin UI access (see `admin.html`).

### `accounts`
Added mid-project (block 11) to support multiple wallets. Every user gets exactly one auto-created **Cash** account (`is_system=true`) on first load — it can be renamed but never deleted (enforced in `accounts.js`, not at the DB level). `is_default` marks which account pre-fills the transaction form; it's a separate flag from `is_system` because the user can change their default account, but the system account is permanent.

### `transactions`
The core ledger. `jenis='transfer'` rows move money between two of the user's own `accounts` and are **excluded** from all income/expense totals (they're an internal shuffle, not real income or spending). `target_id` is set when a transaction represents a savings contribution (see `submitContribution()` in `transactions.js`) — it's still a normal `pengeluaran` row (money leaves the source account) but also increments the linked target's `terkumpul`.

### `targets`
Savings goals. `terkumpul` is a denormalized running total, incremented directly by app code whenever a contribution transaction is saved — it is **not** computed by summing linked transactions at query time. Keep this in mind if you ever backfill/import transactions with `target_id` set; you must also update `terkumpul` yourself.

### `user_categories` / `user_priorities`
Originally these only held user-created custom entries, with a separate hardcoded list in the HTML for defaults. As of block 13, **defaults are seeded as real rows** (`is_default=true`) on first load, so every category/priority — default or custom — lives in one table and is editable/deletable through the same UI (Settings → Kelola Kategori / Kelola Prioritas, both full pages, not modals).

### `orders`
Payment proof submissions for plan upgrades. Reviewed manually via `admin.html`, not automated.

### `detected_transactions`
Support table for the "auto-detect transactions" feature. **Nothing in this repo writes to it automatically** — it's designed to be populated by a phone-side automation tool (Tasker/MacroDroid) posting directly to Supabase's REST API with the anon key, reading it via a webhook trigger on notification received. The web app only polls and reads/updates status. See [ai.md](./ai.md) and [roadmap.md](./roadmap.md).

### `settings`
Generic key-value table, present in the schema but not clearly wired to a specific feature at time of writing — worth checking before building on it (see [roadmap.md](./roadmap.md)).

## RLS policy status — READ THIS

Every table's Row Level Security policy in the current schema is:
```sql
CREATE POLICY "Allow all X" ON public.X FOR ALL USING (true) WITH CHECK (true);
```
This means **the anon key (which is public, embedded in client JS) can read and write every row in every table, for every user** — there is no per-user isolation enforced by the database. The app relies entirely on client-side `user_id=eq....` filters in its own queries to behave correctly; nothing stops a modified client (or anyone with devtools) from querying another user's data directly. This is flagged in detail in [roadmap.md](./roadmap.md) — it's the single biggest thing to fix before this app handles real money data at scale.
