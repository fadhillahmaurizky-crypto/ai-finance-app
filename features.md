# Feature Map

```
Home (page-home)
├── Balance Card — Saldo Sekarang = Σ(account.saldo_awal) + all-time (pemasukan − pengeluaran)
│   ├── tap → Balance Breakdown popup (per-account saldo/income/expense, this month's flows)
│   └── header Sync button (visible only on Home; swaps for a mini-balance readout on other pages)
├── Quick Actions — Catat, Transfer, Tanya AI, Target, Laporan
├── Ringkasan Bulan Ini — this-month income/expense stat cards
└── Transaksi Terakhir — last 5, filterable by Semua/Pemasukan/Pengeluaran/Transfer
    Files: index.html (page-home), dashboard.js (loadSummary), transactions.js (loadTrx, filterHome)

Catat (page-catat) — Add/Edit Transaction
├── Jenis: Pemasukan / Pengeluaran / Transfer
├── Akun select (from-account; "Ke Akun" appears only for Transfer)
├── Kategori (filtered by jenis, "+" quick-add)
├── Prioritas ("+" quick-add)
├── Keterangan
└── Foto/Scan Struk — camera → Groq vision → autofills form
    Files: transactions.js (submitTrx, setJenis, editTrx, scanStruk)
    DB: transactions, accounts, user_categories, user_priorities

Transaksi (page-transaksi)
├── Filter: jenis (Semua/Pemasukan/Pengeluaran/Transfer)
├── Filter: date range (7 Hari default / 30 Hari / Bulan Ini / Semua)
├── Tap a row → detail sheet → Edit / Hapus
└── Floating "+" button → Catat
    Files: transactions.js (applyTransaksiFilter, openTrxDetailById, editTrx, deleteTrx)

Target (page-target)
├── Card per target: progress bar, deadline, edit/delete
├── "Tambah Tabungan" per card → records a pengeluaran transaction linked via target_id, bumps terkumpul
└── "Tambah Target Baru" → target-modal (add/edit, success-state UI)
    Files: transactions.js (renderTargets, saveTarget, openContribute, submitContribution)
    DB: targets, transactions (target_id)

Laporan (page-laporan) — Financial Report
├── Executive summary hero: saldo, income/expense with MoM trend badges, savings rate bar
├── Kategori Pengeluaran / Pemasukan donuts (moved here from Home)
├── Priority analysis (Penting vs Tidak Penting %)
├── Rule-based recommendation tips (savings rate, top category concentration, "tidak penting" ratio)
└── Per-category detail tables
    Files: dashboard.js (renderLaporan, renderPie)

Settings (page-settings)
├── Paket Saya — current plan card, trial banner
├── Ganti Paket — button → popup with upgrade/downgrade options (WA handoff to CS)
├── Profil — name + avatar edit (profile-edit-modal)
├── Akun — list, add/edit/delete (Cash is undeletable, renamable)
├── Kategori & Prioritas — links to full management pages
├── Deteksi Transaksi Otomatis — toggle + explanation (needs phone-side automation, see ai.md)
├── Perhitungan Saldo — toggle: include target terkumpul in Saldo Sekarang or not
├── Sinkronisasi — autosync toggle
├── Notifikasi — reminder (+ hours interval), badge, target, overspend toggles
├── Tampilan — dark mode
├── Data — Backup Manual (JSON download), Backup ke Google Drive, Reset Data (multi-step confirm)
└── Bantuan & Akun — Hubungi CS, Fingerprint setup, Logout
    Files: settings.js, accounts.js, categories.js, priorities.js

Kelola Kategori / Kelola Prioritas (page-kategori / page-prioritas)
└── Full-page CRUD, replacing the old popup-based management
    Files: categories.js (renderKategoriFullList, saveKategoriFull), priorities.js (equivalent)

Auth (pre-login)
├── Login (username/password)
├── Register (name/email/password → Email OTP via EmailJS → account created)
├── Forgot Password (Email OTP → reset)
└── Biometric (WebAuthn) quick-login, opt-in from Settings
    Files: auth.js

AI Chat Assistant (chat-sheet, floating from bottom nav)
└── Context-aware Q&A over the user's current financial summary
    Files: chat-ai.js — see ai.md

Admin Panel (admin.html — separate standalone page)
└── Order/payment approval, user & plan management (not part of the main SPA)
```
