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
│   ├── "Lihat Detail" pill → Balance Breakdown popup (per-account saldo, plus one combined Masuk and one combined Keluar line per account — transfer-in is added into Masuk, transfer-out into Keluar, since a transfer is still money entering/leaving that specific account. Previously these were 4 separate lines (Masuk/Keluar/Transfer Masuk/Transfer Keluar); combined per user feedback that splitting them out was confusing. The top-of-modal aggregate totals deliberately still exclude transfers, unchanged)
│   ├── 7-day sparkline (smooth bezier curve, upper-right corner, small) + trend badge
│   └── Pemasukan Bulan Ini / Pengeluaran Bulan Ini pills
├── Insight dari WangkuAI — rule-based observations (not a live AI call), tap or swipe to cycle, fade transition
├── Trial re-engagement nudge — only while still on the Pro trial (`plan==='pro'`) with `trial_ends_at` ≤2 days away; tapping it opens the upgrade picker (plan-options-modal). Distinct from Settings' `renderTrialBanner()`, which shows for the whole trial duration, not just the last 2 days. Once not (or no longer) on trial, the same `renderTrialNudge()` falls through to a **renewal** nudge instead — same 0-2 day window, but reading `plan_expires_at` for a paid Basic/Pro subscriber, tapping goes straight to `buyPlanRenewal()` (Xendit checkout for the current plan) rather than the upgrade picker, since there's only one relevant plan here (the one already active), not a tier choice
├── Alert banner (e.g. "Saldo kamu minus!") — rule-based, conditional
├── Aksi Cepat — user-customizable via an "Edit" link next to the section title: picker over the pool (Catat, Pemasukan, Pengeluaran, Tanya AI, Target, Laporan, Pindah Saldo, Kategori) with per-row checkbox (visible/hidden, capped at 5) and ↑/↓ move buttons for reordering (not drag-and-drop), persisted as an ordered array to `wangku_aksi_cepat` localStorage. Default (nothing saved yet) = Catat/Tanya AI/Target/Laporan/Kategori — Pemasukan, Pengeluaran, and Pindah Saldo are pool-only, not shown by default
├── Kesehatan Keuangan — rule-based 0-100 health score gauge (title inside card, horizontal gauge+text layout). Shows "Belum ada data" (no number, neutral gauge) instead of a score when the account has zero pemasukan/pengeluaran this month — otherwise a savings-rate-based penalty branch would misfire on brand-new/inactive accounts (0% savings rate reads the same as a genuinely low one)
└── Target Terdekat — nearest-deadline incomplete target, progress bar, terkumpul/target amounts abbreviated with tap-to-reveal (same convention as the Target page's cards)
    Files: webapp.html (page-home), dashboard.js (loadSummary, renderBalanceSparkline, computeInsights, computeHealthScore, renderHealthAndTarget, renderAksiCepat, openAksiCepatEdit, saveAksiCepat), transactions.js (loadTrx, filterHome)

Transaksi Terakhir (bottom of Home)
├── Last 5 only
├── Filter: Semua / Pemasukan / Pengeluaran / Pindah Saldo (displayed label; stored `jenis` value is still `'transfer'`)
├── Pindah Saldo rows show "AccountFrom → AccountTo" as the row's subtitle (via `accountFlowLabel()`), instead of the generic "Pindah Saldo • transfer" every other jenis gets — falls back to "Akun terhapus" per side if that account no longer exists, and to the generic label (not a false "Akun terhapus") if `accountsList` itself hasn't loaded yet
└── Amounts shown at full precision (`rpF()`) — **not** abbreviated; only target-card amounts (Target page + Home's Target Terdekat) use the abbreviated/tap-to-reveal treatment
    Files: transactions.js (loadTrx, filterHome, jenisLabel, accountFlowLabel)

Catat (page-catat) — Add/Edit Transaction
├── Jenis: Pemasukan / Pengeluaran / Pindah Saldo (displayed label; stored `jenis` value is still `'transfer'`)
├── Akun select (source; "Ke Akun" appears only for Pindah Saldo)
├── Kategori (filtered by jenis, "+" quick-add)
├── Prioritas ("+" quick-add)
├── Keterangan
├── Balance check before submit — Pengeluaran/Pindah Saldo are blocked (inline toast) if the source account's own all-time balance can't cover the nominal, both client-side and as a server-side Postgres trigger safety net (see `database.md`)
└── "Scan Struk/Foto" card (single entry point, replaces the old "Via App" card + separate Kamera/Galeri button pair) → native file picker, no forced `capture` attribute so the OS offers both camera and gallery → /api/ai-scan (Groq vision, server-side) → autofills form for review
    Files: transactions.js (submitTrx, setJenis, editTrx, triggerCam, scanStrukNav, scanStruk), accounts.js (getAccountBalance)
    DB: transactions, accounts, user_categories, user_priorities

Transaksi (page-transaksi)
├── Filter: jenis tabs (Semua/Pemasukan/Pengeluaran/Pindah Saldo — displayed label; stored value still `'transfer'`)
├── Filter: date-range pickers (Dari / Sampai), default last 7 days — NOT preset buttons (changed from an earlier design)
├── Export Excel — client-side via SheetJS, exports whatever's currently filtered
├── Amounts shown at full precision — not abbreviated (see Transaksi Terakhir above)
├── Tap a row → detail sheet → Edit / Hapus. For Pindah Saldo, the sheet also shows a labeled "Dari" / "Ke" account pair between the amount and the action buttons (hidden for every other jenis)
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
├── Paket Saya — plan card with inline "Upgrade" pill button (hidden automatically at Ultimate/unlimited); trial banner above it shows remaining days or "trial sudah berakhir" once auto-downgraded (renderTrialBanner). Pro-plan card includes a "Beli Token Tambahan" slider (100.000-20.000.000 token, step 100.000, live price via linear interpolation rounded to the nearest Rp 100) + a confirmation popup before `buyTokenSlider()` redirects to Xendit checkout (test mode — see `backend.md` §4c) — replaces the earlier two fixed-tier buttons (+2 Juta/+5 Juta), which themselves replaced an even older single "Isi Token Lagi" WhatsApp button. Basic/Pro cards additionally show "Aktif hingga [tanggal] (N hari lagi)" + a "Perpanjang Sekarang" button (`planRenewalHtml()` in `app-core.js`) whenever `plan_expires_at` is set — a real paid period from either payment path, not an admin's permanent "Ubah Plan" override (which sets no expiry at all). Tapping it calls `buyPlanRenewal(planId)`, renewing the *current* plan specifically — switching to a different tier is the separate "Ganti Paket" flow below, which as of `wangku-spec-downgrade-payment-akun.md` **only ever offers upgrades**: `renderPlanOptions()` filters to tiers ranked above the user's current one (`free < basic < pro`), so a Pro user sees no rows at all (just "Kamu sudah di paket tertinggi 🎉") and a Basic user sees only "Upgrade to Pro" — self-service downgrade was removed from this picker entirely; the automatic lazy-expiry-to-Free mechanism (trial or paid-period lapse) is a separate, untouched code path that still fires regardless
├── Riwayat Pembayaran — row just below Paket Saya (subtitle "Lihat semua riwayat pembayaran", generic wording since it covers plan payments too, not just token top-ups), opens a modal (`showPaymentHistory()`) listing every `token_purchases` row the user owns (not just successful ones — pending/paid/expired/failed all show, each with a color-coded status badge), newest first. Package label is derived from `tokens`/`item_type`/`plan`/`restart_period` client-side, not a stored label column — token top-ups show "N Juta Token AI"; plan purchases show "Upgrade ke Paket Basic/Pro" when `restart_period=true` (a Ganti Paket tier switch, or reactivating after a lapsed period) or "Perpanjangan Paket Basic/Pro (30 Hari)" when `restart_period=false` (a same-tier renewal via `buyPlanRenewal()`) — see `wangku-spec-downgrade-payment-akun.md` §2. Tapping a row (`openPaymentHistoryRow()`): a `pending` one resumes that same payment (`resumePayment()` → `/api/create-payment` with `resume_purchase_id`, redirects to Xendit); any other status shows a read-only detail view (amount, date, payment method if captured) with a "← Kembali" link back to the list
├── Profil — name + avatar edit; avatar also shows as the header's profile-picture button app-wide
├── Kategori, Prioritas & Akun — links to full-page management (not popups/inline sections)
├── Deteksi Transaksi Otomatis — toggle + explanation (needs phone-side automation; see ai.md)
├── Perhitungan Saldo — toggle: include target terkumpul in Saldo Sekarang or not
├── Sinkronisasi — autosync toggle
├── Notifikasi — reminder (+ hours interval), badge, target, overspend toggles
├── Tampilan — dark mode
├── Data — Reset Data only (multi-step confirm). Manual/Google-Drive backup was removed — the app relies on Supabase's realtime storage instead
└── Bantuan & Akun — Hubungi CS, Fingerprint setup, Logout
    Files: settings.js, accounts.js, categories.js, priorities.js

Kelola Kategori / Kelola Prioritas / Kelola Akun (page-kategori / page-prioritas / page-akun)
└── Full-page CRUD with a back button, replacing the old popup-based (Kategori/Prioritas) or inline-section-plus-modal (Akun) management. Kelola Akun (`wangku-spec-downgrade-payment-akun.md` §3) mirrors the exact same inline-edit-in-place convention as Kategori/Prioritas — tapping the pencil icon swaps a row's own content for an inline nama/saldo/default form instead of opening a separate modal. CRUD rules unchanged from the old inline section: Cash is undeletable but renamable (`is_system`), at least 1 account must always exist, deleting the default account promotes the next one
    Files: categories.js (renderKategoriFullList, saveKategoriFull), priorities.js (equivalent), accounts.js (renderAkunFullList, akunRowHtml, editAkunFull, simpanEditAkun, saveAkunFull, deleteAccount)

Auth (pre-login)
├── Login — password verified server-side via login_check RPC (also gates on status='active'; lazily downgrades plan to 'free' if trial_ends_at has passed and the account is still on 'pro' — see database.md block [24]), returns a signed JWT
├── Register — name/email/password → Email OTP via EmailJS → account created directly as status='active', plan='pro', trial_ends_at = now + 14 days (no plan-picker, no admin approval, no orders row) → success toast, back to the login tab with username pre-filled
├── Forgot Password — OTP now generated AND validated server-side (create_password_reset / confirm_password_reset), not just checked in a JS variable
└── Biometric (WebAuthn) quick-login, opt-in from Settings — also mints a fresh JWT (same lazy trial-downgrade check as login_check, via get_user_by_username)
    Files: auth.js

Payment / Plan-Selection Flow (payment.js) — orphaned as of the trial-registration change, not reachable from any UI
├── Used to run immediately after Register's OTP step (plan picker → bank-transfer instructions → bukti-transfer upload → POST `orders` + PATCH user's plan → WhatsApp admin-notify → 5s status poll → auto-redirect to login on admin approval)
├── verifyRegOTP() no longer calls showPaymentFlow() — registration ends at an active trial account, so nothing in the app calls into payment.js anymore
├── Kept rather than deleted: not explicitly asked for by the spec that removed the registration gate, and the same bukti-upload + admin-approval mechanism may still be wanted for real post-trial paid upgrades, just wired to a different entry point. Treat as a cleanup/reintroduction candidate, not live code
└── Settings' own "Ganti Paket" upgrade picker (renderPlanOptions()/requestPlanChange() in settings.js) is unrelated to this orphaned flow, and as of `wangku-spec-token-slider-ganti-paket.md` **no longer** just opens a WhatsApp link unconditionally: target Basic/Pro shows a confirmation modal then pays via `/api/create-payment` (`item_type:'plan', restart:true`) — same Xendit path as `buyPlanRenewal()`, but always restarting the period fresh rather than extending. `renderPlanOptions()` only ever lists tiers *above* the user's current one (`wangku-spec-downgrade-payment-akun.md` — self-service downgrade was removed), so Free is never offered as a target here at all; Ultimate was never offered either (only free/basic/pro), so the WhatsApp path is now fully unused for tier changes, though the `wa.me` link-building code remains in `requestPlanChange()`'s history/git blame if ever needed again
    Files: payment.js (showPaymentFlow, activateFreePlan, submitPayment, startStatusPoll) — no callers left
    DB: orders (bukti_url, status) — no longer written to by any reachable code path

AI Chat Assistant (chat-sheet, floating from Home's "Tanya AI")
└── Context-aware Q&A, routed through /api/ai-chat (Groq key never touches the browser)
    Files: chat-ai.js — see ai.md

Bottom Navigation
└── Beranda, Transaksi, Catat (raised center FAB — navigates to page-catat via `resetTrxForm();goPage('catat')`, no longer a direct camera trigger), Target, Tanya AI (opens the chat widget directly, `openChat()` — not a page nav, so deliberately has no `ni-`/`nl-`/`nd-` active-state tracking ids, unlike every other nav item)
    Note: the center slot and the last slot were relabeled from Foto/Laporan in a later pass — Laporan is still reachable via Aksi Cepat on Home, just no longer has a dedicated bottom-nav slot. Settings is reachable via the header's profile-picture button. There is also no in-app Admin shortcut (even for role='admin' users) — admin.html is reached by navigating to it directly, never from inside the consumer app's nav

Admin Panel (admin.html — separate standalone app)
├── Real login (login_check RPC, requires role='admin') — replaced an earlier single shared static password with no connection to real accounts
├── Users tab — App Users only (role='admin' rows are filtered out, segregated into...). Columns: User/Username/No. WA/Email/Saldo/Plan/Status/Aksi — "Plan" and "Status" used to be mislabeled (a single "Status" header sat over a cell that actually showed the plan value, and the real status dropdown had no header of its own at all, off by one across the row). The Plan badge shows "pro (trial)" instead of bare "pro" for a user still inside their 14-day trial (`plan==='pro'` and `trial_ends_at` set and in the future, via `trialInfo()`) — was previously indistinguishable from a genuinely paying Pro subscriber. `supaUsers`'s fetch query needed `trial_ends_at` added to its `select=` list for this to have any data to work with; it was silently absent before
├── Kelola Admin (in Pengaturan) — list + add admin-role accounts
├── Transactions tab — includes an Akun column (joined via the account_id foreign key)
├── Per-user Plan & Token AI management — in the Detail modal (showDetailUser()): view usage vs. limit, change plan, grant +2M/+5M tokens, reset tokens used. "Plan Sekarang" shows "Trial (Pro) — berakhir 24 Jul 2026, 10 hari lagi" for a trialing user instead of bare "Pro", same `trialInfo()` helper as the table badge. Confirmed `updateUserPlan()`/`aktivasiUser()` already null out `trial_ends_at` on any manual plan change (see `database.md`'s "Critical invariant" note) — a trial label can't get stuck showing after an admin converts someone to a real subscriber. Same treatment now extends to paid (non-trial) subscribers via `planExpiryInfo(u)` (mirrors `trialInfo(u)` exactly) — shows "Pro — berakhir 20 Jul 2026, 5 hari lagi" for anyone with a real `plan_expires_at` set. `konfirmasiOrder()` (the manual transfer-proof approval flow) sets this field the same way the Xendit webhook does — extends from the existing `plan_expires_at` if still active, else fresh 30 days out — so both payment paths converge on the same result (see `database.md` block `[31]`)
├── Orders/payment approval, plan/token management
├── Laporan tab — platform-wide category breakdown (Pemasukan/Pengeluaran per Kategori) and a per-user summary table (Total Masuk/Keluar/Saldo/Transaksi), computed by querying `transactions`/`accounts` directly via `sbFetch()` (the admin's own JWT satisfies `is_owner_or_admin()` for every row, not just their own). **Not** sourced from the GAS `?action=adminData` endpoint — that action was never actually implemented in any deployed or committed version of the Apps Script, so it always returned an error and left this page permanently blank regardless of how much real transaction data existed. See `backend.md` for the do-not-repeat-this-pattern note
├── Status Infrastruktur tab — database size (`pg_database_size()`) and a 30-day active-user count (from `users.last_login`), via a new admin-only RPC (`admin_get_infra_stats()`, no external API tokens involved). Supabase egress/bandwidth and Vercel function invocations are **not** shown here — deliberately out of scope, see `roadmap.md` — the page links out to both platforms' own usage dashboards instead
└── Ganti Password Akun Saya — changes the logged-in admin's own real password via change_password RPC (not a shared password anymore)
```
