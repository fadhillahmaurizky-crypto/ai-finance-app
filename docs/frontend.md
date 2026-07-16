# Frontend

No framework, no build step. `webapp.html` is the entire consumer-app shell; `js/*.js` files load via plain `<script src>` tags in a specific order — later files assume earlier ones already ran.

## Script load order (from `webapp.html`)

```
xlsx (CDN, SheetJS) → config.js → state.js → ui-helpers.js → auth.js → app-core.js →
dashboard.js → transactions.js → chat-ai.js → payment.js → categories.js →
priorities.js → accounts.js → settings.js → boot.js
```

`boot.js` runs last and kicks things off (service worker registration, splash screen). `showApp()` (in `app-core.js`) is what actually enters the app, called from `auth.js` after a successful login/session restore.

## Onboarding carousel (first-time visitors)

`#ob-wrap` in `webapp.html` is a 3-slide onboarding carousel (`checkOb()`/`nextOb()`/`skipOb()` in `ui-helpers.js`) shown before the login screen the very first time the app loads on a device — gated by the `sdk_ob` localStorage flag (`checkOb()` returns early and shows it if that key isn't set yet; `skipOb()`/reaching the last slide's "Mulai Sekarang" button sets it and reveals the login page). Purely a marketing/explainer screen — no auth or data implications, and it never reappears once `sdk_ob` is set.

## PIN lock (server-side, per-user, opt-in second auth layer)

After a successful `login_check`/`get_user_by_id` (fresh login **or** silent session restore), `checkPinGate()` (`ui-helpers.js`) decides what happens next, based on the `pin_enabled` boolean the RPC response now includes (derived server-side from whether `users.pin_hash` is set — the raw hash itself is never returned to the client, see `database.md` block `[29]`):
- `pin_enabled === true` → shows `#pin-screen` in `verify` mode; `showApp()` only runs after `verify_pin()` (RPC) confirms the entered PIN's hash matches.
- `pin_enabled === false` but the legacy `localStorage['wangku_pin']` key is still present (a one-time migration case, for accounts that had a PIN under the old local-only design below) → shows `#pin-screen` in `set` mode, asking them to create a real server-side PIN once. The legacy key is cleared either way once they respond, whether they complete the new PIN or cancel — so this prompt is genuinely one-time, not a recurring nag.
- Neither → `showApp()` runs directly, no PIN screen at all. This is the default for every new/never-opted-in account.

PIN lock is opt-in via a "Kunci dengan PIN" toggle in Settings (`togglePinLock()`/`syncPinToggleUI()` in `settings.js`), off by default — it is **not** forced on first login the way the old design (below) was.

Unlike the old design, this is genuinely tied to the *account*, not the device: `set_pin_hash()`/`verify_pin()` (both `SECURITY DEFINER` RPCs) derive identity from the caller's own JWT (`auth.jwt()->>'user_id'` + `token_version`), never from anything the client claims about which user it is. That's what fixes the two real bugs the old design had: a second account logging in on the same device no longer inherits the first account's PIN (there was nothing distinguishing whose PIN a bare `localStorage` key belonged to before), and the same account's PIN now works across devices (previously it never left `localStorage`, so a second device had no way to know it).

The "Lupa"/"Batal" button on `#pin-screen` means two different things depending on `pinMode` (`pinForgot()` in `ui-helpers.js`), retexted dynamically by `showPinScreen()`:
- `verify` mode (an existing PIN, genuinely forgotten) — labeled "Lupa": disables PIN lock server-side (`set_pin_hash(null)`) and forces a full re-login. There's no separate PIN-reset flow; logging in again *is* the reset, and PIN lock stays off until re-enabled via Settings.
- `set`/`confirm` mode (creating a PIN for the first time — either the migration case above, or the Settings toggle) — labeled "Batal": nothing has been saved yet, so this is purely a cancel, not a reset. It proceeds into the app (migration case, PIN lock stays off) or just closes back to Settings (toggle case, session untouched).

**Superseded local-only design** (kept here for context, since the migration path above only makes sense against it): PINs used to live entirely in `localStorage['wangku_pin']`, generic and not tied to any account — a second user on the same device inherited the first user's PIN, and a PIN never worked on a second device since it never left local storage. See `wangku-spec-pin-redesign.md` for the full rationale.

## Layout structure — read this before adding anything to the header or Home page

```
.app (fixed-height flex column)
├── .header (fixed, does NOT scroll)
│   └── .header-top: greeting/name (left) + sync button, mini-balance, dark-mode toggle, profile-picture/settings button (right)
├── .pages (flex:1, scrollable area)
│   └── .page-home, .page-catat, .page-transaksi, .page-target, .page-laporan,
│       .page-settings, .page-kategori, .page-prioritas, .page-akun (siblings, toggled via .active)
└── .bottom-nav (fixed): Beranda, Transaksi, Catat (raised FAB, center, navigates to page-catat), Target, Tanya AI (opens chat, no page nav)
```

**Important**: the big green balance card (`.bal-card`) lives **inside** `#page-home`'s scrollable content now, not in the fixed `.header` — it scrolls away like any other content on Home. This was a deliberate late change; earlier in the project it lived in the header and stayed pinned across all pages, which turned out to be the wrong call once collapsed to a mini-balance readout on other pages was already handling that need. If you see references to the balance card being "sticky," that's the old behavior — it isn't anymore.

The header's right-side "settings" button now doubles as a **profile picture** button: it shows `user.avatar_url` as a circular photo when set (`renderHeaderAvatar()` in `settings.js`), falling back to a plain gear icon otherwise. Same click target (`goPage('settings')`) either way.

`goPage(name)` (in `app-core.js`) on every call: toggles `.active`/`.show` classes for the page + its nav item, toggles `.compact` on `.header` (collapses to mini-balance on every page except Home), runs page-specific refresh logic, and pushes/consumes `history` state for Android back-button support (see `architecture.md` §11).

## Pages

| id | Purpose | Key JS |
|---|---|---|
| `page-home` | Balance card (with 7-day sparkline), AI insight card, alert banner, quick actions, Kesehatan Keuangan + Target Terdekat cards, recent transactions | `dashboard.js`, `transactions.js` |
| `page-catat` | Add/edit transaction (Pemasukan / Pengeluaran / Pindah Saldo — displayed label; stored `jenis` value is still `'transfer'`) | `transactions.js` |
| `page-transaksi` | Full transaction list — jenis filter tabs + **date-range pickers** (not preset buttons), Excel export button, FAB to add | `transactions.js` |
| `page-target` | Target cards: progress, edit/delete, "Tambah Tabungan" contribution button per card | `transactions.js` |
| `page-laporan` | Financial report: hero summary w/ MoM trend, savings-rate bar, category donuts, priority analysis, rule-based tips, per-category tables | `dashboard.js` |
| `page-settings` | Plan card (with inline "Upgrade" pill, hidden at highest plan), profile, category/priority/account entry points (Kategori, Prioritas & Akun), notifications, sync, reset-data, help | `settings.js`, `accounts.js` |
| `page-kategori` / `page-prioritas` / `page-akun` | Full-page CRUD (not popups) | `categories.js` / `priorities.js` / `accounts.js` |

## Home page specifics (this area has had the most iteration — read carefully)

- **Balance card**: "Saldo" label + eye icon (show/hide toggle, `toggleBalanceVisibility()`), a "Lihat Detail" pill button (opens the per-account breakdown modal), the amount, a trend badge ("+/-Rp X dari minggu lalu"), a **7-day sparkline** (smooth bezier curve, positioned absolutely in the upper-right corner of the card, ~40% width/64px tall — deliberately small and corner-positioned so it can never collide with the pemasukan/pengeluaran pills below it, which sit in normal document flow), then the two pills.
- **Insight card** ("Insight dari WangkuAI"): rule-based (not a live AI call) — `computeInsights()` in `dashboard.js` compares this month's category spend to last month, checks savings rate, overspend, and "tidak penting" ratio, and produces up to 4 short observations. Cycles on tap **and** swipe (touch events bound in `dashboard.js`), with a fade transition and dot indicators. This card lives inside `#page-home`'s scrollable content — it must never be moved to be a sibling of `.header`/`.pages`, because that previously caused it to render pinned on every page (a real bug, since fixed).
- **Aksi Cepat** is user-customizable: an "Edit" link next to the section title (`openAksiCepatEdit()` in `dashboard.js`) opens a picker over the shortcut pool (Catat, Pemasukan, Pengeluaran, Tanya AI, Target, Laporan, Pindah Saldo, Kategori) with a checkbox (visible/hidden, capped at 5) and ↑/↓ move buttons per row (reorder), persisted to the `wangku_aksi_cepat` localStorage key (see `environment.md`) as an ordered array. Default (no saved selection yet) is Catat/Tanya AI/Target/Laporan/Kategori — Pemasukan, Pengeluaran, and Pindah Saldo are all in the pool but not shown out of the box. Reordering uses move buttons, not native drag-and-drop — HTML5 drag events aren't reliable on touch/TWA without a polyfill this codebase doesn't carry. `renderAksiCepat()` renders the `#qa-row` container from the saved/default selection (in saved order) on every `showApp()`.
- **Kesehatan Keuangan / Target Terdekat**: two-column card row. Kesehatan Keuangan's title sits inside the card (same pattern as Target Terdekat), with a small horizontal layout — gauge on the left, label/subtext on the right (not stacked/centered).
- **Header background** matches the body background (`var(--bg)`), not a distinct white card color.
- **Target-card amounts only** (Target page's cards, and Home's Target Terdekat card) are abbreviated (`rp()` in `ui-helpers.js` → `150rb`/`2.5jt`/`1.2M`) with tap-to-reveal (`abbrAmountHtml()`/`revealAmount()`): tapping shows the full `rpF()`-formatted value, which auto-reverts after ~3s or on a second tap. **Transaction list rows (both Transaksi Terakhir on Home and the full Transaksi page) and the Home Saldo Sekarang hero number are deliberately excluded from this** — they always show full precision via `rpF()` directly. (An earlier version of this also abbreviated transaction rows; that was reverted after product feedback — abbreviation is target-cards-only.)

## Modals

| id | Purpose |
|---|---|
| `add-kat-modal` / `add-pri-modal` | Quick-add only (from the Catat form's "+"); full management is the dedicated pages |
| `aksi-cepat-modal` | Picker for which Aksi Cepat shortcuts show on Home (max 5, checkbox) and in what order (↑/↓ move buttons), opened via the "Edit" link next to the section title |
| `target-modal` | Add/edit target, same success-screen pattern |
| `target-contribute-modal` | "Tambah Tabungan" |
| `balance-breakdown-modal` | Per-account balance/income/expense, opened from "Lihat Detail" |
| `trx-detail-modal` | Transaction detail sheet — Edit/Hapus |
| `profile-edit-modal` | Name + avatar upload, success-screen pattern |
| `plan-options-modal` | Upgrade-only picker (Ganti Paket) — target list is filtered to tiers above the user's current one; empty means a "sudah di paket tertinggi" message instead, see `wangku-spec-downgrade-payment-akun.md` |
| `reset-data-modal` | Multi-step verification (checkbox + typed phrase) before wiping transactions/targets |
| `detected-trx-modal` | Confirm/dismiss for the auto-detect-transactions stub |
| `chpass-modal` | Change password (now via `change_password` RPC) |

Every `.modal-overlay` is watched by a `MutationObserver` (in `app-core.js`) that pushes a `history` state on open, so Android back closes the topmost open modal instead of navigating away or exiting the app.

## CSS conventions (`css/app.css`)

- Theming via CSS variables, redefined under `[data-theme="dark"]`.
- Single centered column, `max-width: 430px`, mimicking a phone even on desktop. Fixed/floating elements that need to stay aligned with that column (not the full browser viewport) use the `left:50%; transform:translateX(-50%); max-width:430px` trick, with a `@media(max-width:480px)` override removing the centering on actual phones.
- **No fake status bar** — the mocked clock/wifi/battery bar that used to sit above the greeting was removed entirely (it was decorative, not functional, and cluttered the real header).

## Naming patterns worth knowing before adding code

- Catat-form inputs: `f-*` (`f-nominal`, `f-kat`, `f-pri`, `f-akun`...).
- Settings toggles: `<name>-track` id + shared `.toggle-track`/`.toggle-thumb` CSS, flipped via `classList.toggle('on', ...)`.
- Full-page CRUD (Kategori, Prioritas): inline add form (`<name>-full-nama` etc.) → `save<Name>Full()` → `render<Name>FullList()` re-render. Copy this pattern for any future manageable list.
- Success-state modals (Account, Target, Profile): `<modal>-form-view` / `<modal>-success-view` sibling divs, toggled via inline `style.display`, reset to form view every time the modal's `open*()` function runs.
