# Feature Map

```
Home (page-home)
├── Balance Card — Saldo Sekarang = Σ(account.saldo_awal) + all-time (pemasukan − pengeluaran)
│   ├── eye icon → show/hide balance (toggleBalanceVisibility)
│   ├── "Lihat Detail" pill → Balance Breakdown popup (per-account saldo/income/expense, this month's flows)
│   ├── 7-day sparkline (smooth bezier curve, upper-right corner, small) + trend badge
│   └── Pemasukan Bulan Ini / Pengeluaran Bulan Ini pills
├── Insight dari WangkuAI — rule-based observations (not a live AI call), tap or swipe to cycle, fade transition
├── Alert banner (e.g. "Saldo kamu minus!") — rule-based, conditional
├── Aksi Cepat — Catat, Transfer, Tanya AI, Target, Laporan
├── Kesehatan Keuangan — rule-based 0-100 health score gauge (title inside card, horizontal gauge+text layout)
└── Target Terdekat — nearest-deadline incomplete target, progress bar
    Files: index.html (page-home), dashboard.js (loadSummary, renderBalanceSparkline, computeInsights, computeHealthScore, renderHealthAndTarget), transactions.js (loadTrx, filterHome)

Transaksi Terakhir (bottom of Home)
├── Last 5 only
└── Filter: Semua / Pemasukan / Pengeluaran / Transfer
    Files: transactions.js (loadTrx, filterHome)

Catat (page-catat) — Add/Edit Transaction
├── Jenis: Pemasukan / Pengeluaran / Transfer
├── Akun select (source; "Ke Akun" appears only for Transfer)
├── Kategori (filtered by jenis, "+" quick-add)
├── Prioritas ("+" quick-add)
├── Keterangan
└── Foto/Scan Struk — camera → /api/ai-scan (Groq vision, server-side) → autofills form for review
    Files: transactions.js (submitTrx, setJenis, editTrx, scanStruk)
    DB: transactions, accounts, user_categories, user_priorities

Transaksi (page-transaksi)
├── Filter: jenis tabs (Semua/Pemasukan/Pengeluaran/Transfer)
├── Filter: date-range pickers (Dari / Sampai), default last 7 days — NOT preset buttons (changed from an earlier design)
├── Export Excel — client-side via SheetJS, exports whatever's currently filtered
├── Tap a row → detail sheet → Edit / Hapus
└── Floating "+" button → Catat
    Files: transactions.js (applyTransaksiFilter, exportToExcel, openTrxDetailById, editTrx, deleteTrx)

Target (page-target)
├── Card per target: progress bar, deadline, edit/delete
├── "Tambah Tabungan" per card → records a pengeluaran transaction linked via target_id, bumps terkumpul
└── "Tambah Target Baru" → target-modal (add/edit, "Selesai" success screen)
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
├── Login — password verified server-side via login_check RPC, returns a signed JWT
├── Register — name/email/password → Email OTP via EmailJS → account created (status='pending', role='user' enforced by RLS)
├── Forgot Password — OTP now generated AND validated server-side (create_password_reset / confirm_password_reset), not just checked in a JS variable
└── Biometric (WebAuthn) quick-login, opt-in from Settings — also mints a fresh JWT
    Files: auth.js

AI Chat Assistant (chat-sheet, floating from Home's "Tanya AI")
└── Context-aware Q&A, routed through /api/ai-chat (Groq key never touches the browser)
    Files: chat-ai.js — see ai.md

Bottom Navigation
└── Beranda, Transaksi, Foto (camera, raised center FAB), Target, Laporan
    Note: Settings and a separate AI button were removed from the bottom nav — Settings is reachable via the header's profile-picture button, AI via Home's "Tanya AI" quick action

Admin Panel (admin.html — separate standalone app)
├── Real login (login_check RPC, requires role='admin') — replaced an earlier single shared static password with no connection to real accounts
├── Users tab — App Users only (role='admin' rows are filtered out, segregated into...)
├── Kelola Admin (in Pengaturan) — list + add admin-role accounts
├── Transactions tab — includes an Akun column (joined via the account_id foreign key)
├── Orders/payment approval, plan/token management
└── Ganti Password Akun Saya — changes the logged-in admin's own real password via change_password RPC (not a shared password anymore)
```
