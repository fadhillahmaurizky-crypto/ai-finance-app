# Frontend

No framework, no build step. `index.html` is the entire app shell; `js/*.js` files are loaded via plain `<script src>` tags in a specific order (order matters — later files assume earlier ones already ran).

## Script load order (from `index.html`)

```
config.js → state.js → ui-helpers.js → auth.js → app-core.js → dashboard.js →
transactions.js → chat-ai.js → payment.js → categories.js → priorities.js →
accounts.js → settings.js → boot.js
```

`boot.js` runs last and kicks things off (registers the service worker, shows the splash screen). Nothing in `boot.js` calls `showApp()` directly — that happens from `auth.js` after a successful login/session restore.

## Pages (all siblings inside `.pages`, toggled via `.active`)

| id | Purpose | Key JS |
|---|---|---|
| `page-home` | Dashboard: balance card, quick actions, recent transactions | `dashboard.js`, `transactions.js` |
| `page-catat` | Add/edit transaction form (Pemasukan / Pengeluaran / Transfer) | `transactions.js` |
| `page-transaksi` | Full transaction list with jenis + date-range filters, FAB to add | `transactions.js` |
| `page-target` | Savings targets: cards with progress bars, edit/delete/contribute | `transactions.js` |
| `page-laporan` | Financial report: hero balance, trends, donuts, priority analysis, tips, category tables | `dashboard.js` |
| `page-settings` | Everything: plan, profile, accounts, categories/priorities entry points, notifications, sync, data, help | `settings.js`, `accounts.js` |
| `page-kategori` | Full-page category management (moved out of a popup) | `categories.js` |
| `page-prioritas` | Full-page priority management (moved out of a popup) | `priorities.js` |

Routing is handled by `goPage(name)` in `app-core.js`. It does four things every call: (1) toggle `.active`/`.show` classes for the target page + its nav item, (2) toggle `.compact` on `.header` (collapses the big balance card to a mini balance readout on every page except Home), (3) run any page-specific refresh logic (e.g. `renderLaporan()`, `applyTransaksiFilter()`), (4) push a `history` state so the Android back button steps back through pages instead of exiting the app.

## Modals (all siblings near the bottom of `<body>`, toggled via `.open`)

| id | Purpose |
|---|---|
| `add-kat-modal` / `add-pri-modal` | Quick-add category/priority from the Catat form's "+" button (lightweight; full management is the dedicated pages above) |
| `account-modal` | Add/edit account, with a "Selesai" success state instead of auto-closing |
| `target-modal` | Add/edit target, same success-state pattern |
| `target-contribute-modal` | "Tambah Tabungan" — record a savings contribution against a target |
| `balance-breakdown-modal` | Per-account balance/income/expense breakdown, opened by tapping the balance card |
| `trx-detail-modal` | Transaction detail sheet with Edit/Delete |
| `profile-edit-modal` | Name + avatar upload, success-state pattern |
| `plan-options-modal` | Upgrade/downgrade plan picker (opened from a button in Settings) |
| `reset-data-modal` | Multi-step verification (checkbox + typed phrase) before wiping transactions/targets |
| `detected-trx-modal` | Confirm/dismiss popup for the auto-detect-transactions feature |
| `chpass-modal`, `wa-modal`, etc. | Password change, WhatsApp bot setup guide |

Every `.modal-overlay` is watched by a `MutationObserver` (installed in `app-core.js`) that pushes a `history` state when it opens, so the back button closes the topmost open modal instead of navigating away or exiting.

## CSS conventions (`css/app.css`)

- Theming is done via CSS variables (`--bg`, `--text`, `--green`, `--red-bg`, etc.), redefined under `[data-theme="dark"]` for dark mode (`toggleTheme()` in `ui-helpers.js`).
- Layout is a single centered column, `max-width: 430px`, mimicking a phone screen even on desktop — several elements (`.fab-wrap`, `#splash-screen`, `#pin-screen`) use a "fixed + centered via `left:50%; transform:translateX(-50%)`" trick to stay aligned with that column instead of the full browser viewport, with a `@media(max-width:480px)` override that removes the centering (since on an actual phone, the app *is* the viewport width).
- No CSS classes are scoped/module-based — it's one global stylesheet, organized roughly by feature area in the order features were added.

## Naming patterns worth knowing before you add code

- Selects/inputs in the Catat form are `f-*` (`f-nominal`, `f-kat`, `f-pri`, `f-akun`...).
- Settings toggle switches follow `<name>-track` id + a shared `.toggle-track`/`.toggle-thumb` CSS pattern, flipped with a plain `classList.toggle('on', ...)`.
- "Full page management with inline add form + list" (Kategori, Prioritas) follows the same three-part pattern: `<name>-full-nama` input(s) → `save<Name>Full()` → `render<Name>FullList()` re-render. Copy this pattern if you add another manageable list.
- Success-state modals (Account, Target, Profile) follow: `<modal>-form-view` / `<modal>-success-view` sibling divs, toggled via inline `style.display`, reset to form view every time the modal is opened via its `open*()` function.
