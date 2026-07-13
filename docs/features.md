# Feature Map

```
Onboarding Carousel (pre-login, first-time only)
├── 3 slides explaining the product, shown once before the login screen ever appears
├── Gated by the `sdk_ob` localStorage flag — set on skip or on reaching the last slide, never shown again after
└── Purely explainer/marketing — no auth or data implications
    Files: webapp.html (#ob-wrap), ui-helpers.js (checkOb, nextOb, skipOb)

Home (page-home)
├── Balance Card — Saldo Sekarang = Σ(account.saldo_awal) + all-time (pemasukan − pengeluaran)
│   ├── eye icon → show/hide balance (toggleBalanceVisibility)
│   ├── "Lihat Detail" pill → Balance Breakdown popup (per-account saldo/income/expense, this month's flows)
│   ├── 7-day sparkline (smooth bezier curve, upper-right corner, small) + trend badge
│   └── Pemasukan Bulan Ini / Pengeluaran Bulan Ini pills
├── Insight dari WangkuAI — rule-based observations (not a live AI call), tap or swipe to cycle, fade transition
├── Alert banner (e.g. "Saldo kamu minus!") — rule-based, conditional
├── Aksi Cepat — user-customizable via an "Edit" link next to the section title: picker over the pool (Catat, Pemasukan, Pengeluaran, Tanya AI, Target, Laporan, Pindah Saldo, Kategori) with per-row checkbox (visible/hidden, capped at 5) and ↑/↓ move buttons for reordering (not drag-and-drop), persisted as an ordered array to `wangku_aksi_cepat` localStorage. Default (nothing saved yet) = Catat/Tanya AI/Target/Laporan/Kategori — Pemasukan, Pengeluaran, and Pindah Saldo are pool-only, not shown by default
├── Kesehatan Keuangan — rule-based 0-100 health score gauge (title inside card, horizontal gauge+text layout). Shows "Belum ada data" (no number, neutral gauge) instead of a score when the account has zero pemasukan/pengeluaran this month — otherwise a savings-rate-based penalty branch would misfire on brand-new/inactive accounts (0% savings rate reads the same as a genuinely low one)
└── Target Terdekat — nearest-deadline incomplete target, progress bar, terkumpul/target amounts abbreviated with tap-to-reveal (same convention as the Target page's cards)
    Files: webapp.html (page-home), dashboard.js (loadSummary, renderBalanceSparkline, computeInsights, computeHealthScore, renderHealthAndTarget, renderAksiCepat, openAksiCepatEdit, saveAksiCepat), transactions.js (loadTrx, filterHome)

Transaksi Terakhir (bottom of Home)
├── Last 5 only
├── Filter: Semua / Pemasukan / Pengeluaran / Pindah Saldo (displayed label; stored `jenis` value is still `'transfer'`)
└── Amounts shown at full precision (`rpF()`) — **not** abbreviated; only target-card amounts (Target page + Home's Target Terdekat) use the abbreviated/tap-to-reveal treatment
    Files: transactions.js (loadTrx, filterHome, jenisLabel)

Catat (page-catat) — Add/Edit Transaction
├── Jenis: Pemasukan / Pengeluaran / Pindah Saldo (displayed label; stored `jenis` value is still `'transfer'`)
├── Akun select (source; "Ke Akun" appears only for Pindah Saldo)
├── Kategori (filtered by jenis, "+" quick-add)
├── Prioritas ("+" quick-add)
├── Keterangan
├── Balance check before submit — Pengeluaran/Pindah Saldo are blocked (inline toast) if the source account's own all-time balance can't cover the nominal, both client-side and as a server-side Postgres trigger safety net (see `database.md`)
└── Foto/Scan Struk — camera → /api/ai-scan (Groq vision, server-side) → autofills form for review
    Files: transactions.js (submitTrx, setJenis, editTrx, scanStruk), accounts.js (getAccountBalance)
    DB: transactions, accounts, user_categories, user_priorities

Transaksi (page-transaksi)
├── Filter: jenis tabs (Semua/Pemasukan/Pengeluaran/Pindah Saldo — displayed label; stored value still `'transfer'`)
├── Filter: date-range pickers (Dari / Sampai), default last 7 days — NOT preset buttons (changed from an earlier design)
├── Export Excel — client-side via SheetJS, exports whatever's currently filtered
├── Amounts shown at full precision — not abbreviated (see Transaksi Terakhir above)
├── Tap a row → detail sheet → Edit / Hapus
└── Floating "+" button → Catat
    Files: transactions.js (applyTransaksiFilter, exportToExcel, openTrxDetailById, editTrx, deleteTrx)

Target (page-target)
├── Card per target: progress bar (amounts abbreviated with tap-to-reveal), deadline, edit/delete
├── "Tambah Tabungan" per card → records a pengeluaran transaction linked via target_id, bumps terkumpul (same balance check as Catat's Pengeluaran — blocked if the source account can't cover it)
├── "Tambah Target Baru" → target-modal (add/edit, "Selesai" success screen)
└── "Split Bill" teaser card — **not a real feature**, a static "Coming Soon" placeholder (`.coming-card` in webapp.html) describing a future bill-splitting-with-friends idea. No data model, no backend, its only button just shows a "notify me" toast. Unrelated to any "split a payment across multiple accounts" concept — that would be a different feature if ever built (see `roadmap.md`). **Hidden from users** behind the `FEATURE_SPLIT_BILL` flag in `config.js` (currently `false`) — code is kept, not deleted, per product decision; flip the flag to bring it back once there's a real workflow behind it
    Files: transactions.js (renderTargets, saveTarget, openContribute, submitContribution)
    DB: targets, transactions (target_id)

Laporan (page-laporan) — Financial Report
├── Executive summary hero: saldo, income/expense with MoM trend badges, savings rate bar
├── Kategori Pengeluaran / Pemasukan donuts (moved here from Home in an earlier redesign)
├── Priority analysis (Penting vs Tidak Penting %)
├── Rule-based recommendation tips (savings rate, top category concentration, "tidak penting" ratio)
└── Per-category detail tables
    Files: dashboard.js (renderLaporan, renderPie)

Settings (page-settings)
├── Paket Saya — plan card with inline "Upgrade" pill button (hidden automatically at Ultimate/unlimited)
├── Profil — name + avatar edit; avatar also shows as the header's profile-picture button app-wide
├── Akun — list, add/edit/delete; "Tambah Akun" is a small button inline with the section title (not a full-width button below the list); Cash is undeletable but renamable
├── Kategori & Prioritas — links to full-page management (not popups)
├── Deteksi Transaksi Otomatis — toggle + explanation (needs phone-side automation; see ai.md)
├── Perhitungan Saldo — toggle: include target terkumpul in Saldo Sekarang or not
├── Sinkronisasi — autosync toggle
├── Notifikasi — reminder (+ hours interval), badge, target, overspend toggles
├── Tampilan — dark mode
├── Data — Reset Data only (multi-step confirm). Manual/Google-Drive backup was removed — the app relies on Supabase's realtime storage instead
└── Bantuan & Akun — Hubungi CS, Fingerprint setup, Logout
    Files: settings.js, accounts.js, categories.js, priorities.js

Kelola Kategori / Kelola Prioritas (page-kategori / page-prioritas)
└── Full-page CRUD with a back button, replacing the old popup-based management
    Files: categories.js (renderKategoriFullList, saveKategoriFull), priorities.js (equivalent)

Auth (pre-login)
├── Login — password verified server-side via login_check RPC (also gates on status='active'), returns a signed JWT
├── Register — name/email/password → Email OTP via EmailJS → account created (status='pending', role='user' enforced by RLS) → falls straight into the Payment/Plan-Selection flow below (registration doesn't end at "pending", it continues into plan picking)
├── Forgot Password — OTP now generated AND validated server-side (create_password_reset / confirm_password_reset), not just checked in a JS variable
└── Biometric (WebAuthn) quick-login, opt-in from Settings — also mints a fresh JWT
    Files: auth.js

Payment / Plan-Selection Flow (immediately after Register's OTP step, before the user can log in)
├── Plan picker — Free / Basic / Pro / Ultimate cards with pricing
├── Free plan → activateFreePlan() sets status='active' immediately, no admin approval needed — user can log in right away
├── Paid plan → bank-transfer instructions screen → upload bukti transfer (payment proof image) → POST to `orders` (status='pending') + PATCH user's chosen `plan`
├── WhatsApp admin notification — fires a GET to the (draft/unverified) GAS Apps Script URL with `?action=notifyAdmin&msg=...`, fire-and-forget, so an admin gets pinged to review the order in admin.html
└── Activation polling — after submitting proof, the client polls `users.status` every 5s; the moment an admin approves the order in admin.html (flipping status to 'active'), the flow auto-redirects to login with a success toast
    Files: payment.js (showPaymentFlow, activateFreePlan, submitPayment, startStatusPoll)
    DB: orders (bukti_url, status), users (status, plan)

AI Chat Assistant (chat-sheet, floating from Home's "Tanya AI")
└── Context-aware Q&A, routed through /api/ai-chat (Groq key never touches the browser)
    Files: chat-ai.js — see ai.md

Bottom Navigation
└── Beranda, Transaksi, Foto (camera, raised center FAB), Target, Laporan
    Note: Settings and a separate AI button were removed from the bottom nav — Settings is reachable via the header's profile-picture button, AI via Home's "Tanya AI" quick action. There is also no in-app Admin shortcut (even for role='admin' users) — admin.html is reached by navigating to it directly, never from inside the consumer app's nav

Admin Panel (admin.html — separate standalone app)
├── Real login (login_check RPC, requires role='admin') — replaced an earlier single shared static password with no connection to real accounts
├── Users tab — App Users only (role='admin' rows are filtered out, segregated into...). Columns: User/Username/No. WA/Email/Saldo/Plan/Status/Aksi — "Plan" and "Status" used to be mislabeled (a single "Status" header sat over a cell that actually showed the plan value, and the real status dropdown had no header of its own at all, off by one across the row)
├── Kelola Admin (in Pengaturan) — list + add admin-role accounts
├── Transactions tab — includes an Akun column (joined via the account_id foreign key)
├── Per-user Plan & Token AI management — in the Detail modal (showDetailUser()): view usage vs. limit, change plan, grant +2M/+5M tokens, reset tokens used
├── Orders/payment approval, plan/token management
├── Laporan tab — platform-wide category breakdown (Pemasukan/Pengeluaran per Kategori) and a per-user summary table (Total Masuk/Keluar/Saldo/Transaksi), computed by querying `transactions`/`accounts` directly via `sbFetch()` (the admin's own JWT satisfies `is_owner_or_admin()` for every row, not just their own). **Not** sourced from the GAS `?action=adminData` endpoint — that action was never actually implemented in any deployed or committed version of the Apps Script, so it always returned an error and left this page permanently blank regardless of how much real transaction data existed. See `backend.md` for the do-not-repeat-this-pattern note
└── Ganti Password Akun Saya — changes the logged-in admin's own real password via change_password RPC (not a shared password anymore)
```
