-- ============================================================
-- WANGKU — Supabase Database Setup
-- Jalankan SATU PER SATU dari atas ke bawah
-- Terakhir diupdate: Juni 2025
-- ============================================================


-- ============================================================
-- [1] TABEL USERS (Akun pengguna)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username         TEXT UNIQUE NOT NULL,
  full_name        TEXT NOT NULL,
  wa_number        TEXT UNIQUE,
  email            TEXT,
  role             TEXT DEFAULT 'user',
  status           TEXT DEFAULT 'active',
  plan             TEXT DEFAULT 'basic',
  password_hash    TEXT,
  avatar_color     TEXT DEFAULT '#00B26A',
  gas_user_id      TEXT,
  ai_chat_count    INTEGER DEFAULT 0,
  ai_scan_count    INTEGER DEFAULT 0,
  usage_month      TEXT DEFAULT '',
  tokens_limit     BIGINT DEFAULT 0,
  tokens_used      BIGINT DEFAULT 0,
  token_reset_month TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  last_login       TIMESTAMPTZ,
  last_active      TIMESTAMPTZ
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all users" ON public.users FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- [2] UPDATE CONSTRAINT STATUS & PLAN (Wajib dijalankan)
-- ============================================================

-- Hapus constraint lama
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_plan_check;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

-- Tambah constraint baru
ALTER TABLE public.users ADD CONSTRAINT users_status_check
  CHECK (status IN ('active','inactive','banned','pending'));

ALTER TABLE public.users ADD CONSTRAINT users_plan_check
  CHECK (plan IN ('free','basic','pro','unlimited'));

ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('user','admin'));


-- ============================================================
-- [3] TABEL TRANSACTIONS (Riwayat transaksi)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  jenis       TEXT NOT NULL CHECK (jenis IN ('pemasukan','pengeluaran')),
  nominal     NUMERIC NOT NULL CHECK (nominal > 0),
  kategori    TEXT NOT NULL,
  keterangan  TEXT DEFAULT '',
  prioritas   TEXT DEFAULT 'penting',
  tanggal     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trx_user    ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_trx_tanggal ON public.transactions(tanggal);
CREATE INDEX IF NOT EXISTS idx_trx_jenis   ON public.transactions(jenis);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- [4] TABEL TARGETS (Target tabungan)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.targets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nama        TEXT NOT NULL,
  nominal     NUMERIC NOT NULL CHECK (nominal > 0),
  terkumpul   NUMERIC DEFAULT 0,
  deadline    DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_targets_user ON public.targets(user_id);
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all targets" ON public.targets FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- [5] TABEL ORDERS (Bukti pembayaran user)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,
  plan        TEXT NOT NULL,
  amount      INTEGER NOT NULL,
  status      TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  bukti_url   TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- [6] TABEL SETTINGS (Konfigurasi app — API Key dll)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settings (
  key    TEXT PRIMARY KEY,
  value  TEXT
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- [7] TABEL USER_CATEGORIES (Kategori custom per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nama       TEXT NOT NULL,
  jenis      TEXT CHECK (jenis IN ('pemasukan','pengeluaran')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, nama)
);
ALTER TABLE public.user_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all categories" ON public.user_categories FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- [8] BUAT AKUN ADMIN (Jalankan sekali saja)
-- Password: wangku123
-- ============================================================
INSERT INTO public.users (
  username, full_name, wa_number, email,
  role, status, plan, password_hash,
  tokens_limit, tokens_used
)
VALUES (
  'maurizky',
  'Maurizky Fadhillah',
  '6285727318698',
  'maurizky@wangku.app',
  'admin',
  'active',
  'unlimited',
  '3f51eadf15f2eecfc643afe9c9d2198ce994b12070b3828b75357dfafc778f82',
  5000000,
  0
)
ON CONFLICT (username) DO UPDATE SET
  role          = 'admin',
  status        = 'active',
  plan          = 'unlimited',
  tokens_limit  = 5000000,
  password_hash = '3f51eadf15f2eecfc643afe9c9d2198ce994b12070b3828b75357dfafc778f82';


-- ============================================================
-- [9] SIMPAN API KEY GROQ (Opsional — bisa lewat Admin Dashboard)
-- Ganti YOUR_GROQ_API_KEY dengan key asli dari console.groq.com
-- ============================================================
-- INSERT INTO public.settings (key, value)
-- VALUES ('groq_api_key', 'YOUR_GROQ_API_KEY')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;


-- ============================================================
-- [10] TAMBAH KOLOM PROFIL & TRIAL (Wajib untuk fitur Settings baru)
-- ============================================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;


-- ============================================================
-- [11] TABEL ACCOUNTS (Akun / dompet — default: Cash)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nama        TEXT NOT NULL,
  saldo_awal  NUMERIC DEFAULT 0,
  is_default  BOOLEAN DEFAULT false,
  icon        TEXT DEFAULT 'wallet',
  color       TEXT DEFAULT '#00B26A',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, nama)
);
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all accounts" ON public.accounts FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- [12] TRANSACTIONS: dukungan akun & jenis Transfer
-- ============================================================
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_jenis_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_jenis_check CHECK (jenis IN ('pemasukan','pengeluaran','transfer'));

-- ============================================================
-- [13] KATEGORI & PRIORITAS: satukan default + custom agar semua bisa dikelola
-- ============================================================
ALTER TABLE public.user_categories ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS public.user_priorities (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nama       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);
ALTER TABLE public.user_priorities ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all priorities" ON public.user_priorities FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- [14] DETECTED TRANSACTIONS (untuk fitur deteksi otomatis)
-- Diisi oleh automation di HP (Tasker/MacroDroid) lewat POST langsung
-- ke endpoint REST Supabase memakai anon key yang sama dengan app ini.
-- Wangku akan polling tabel ini dan memunculkan popup konfirmasi.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.detected_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_app    TEXT,
  raw_text      TEXT,
  nominal_guess NUMERIC,
  jenis_guess   TEXT DEFAULT 'pengeluaran',
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','dismissed')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_detected_user_status ON public.detected_transactions(user_id, status);
ALTER TABLE public.detected_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow all detected_transactions" ON public.detected_transactions FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- [15] AKUN SISTEM (Cash) — tidak boleh dihapus, boleh diganti nama
-- ============================================================
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;
UPDATE public.accounts SET is_system=true WHERE is_default=true AND nama='Cash' AND is_system IS DISTINCT FROM true;


-- ============================================================
-- SELESAI — Cek hasil
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
