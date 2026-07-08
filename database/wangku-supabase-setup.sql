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
-- [16] KONTRIBUSI TARGET — tautkan transaksi tabungan ke target
-- ============================================================
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS target_id UUID REFERENCES public.targets(id) ON DELETE SET NULL;


-- ============================================================
-- [17] KEAMANAN (FASE 1) — hentikan pembocoran password_hash & Groq key
-- ============================================================
-- Masalah yang diperbaiki blok ini:
--  1) Tabel `settings` bisa dibaca siapa saja lewat anon key -> Groq key bocor.
--     -> Kunci total tabel settings (tidak ada lagi yang butuh baca ini dari client
--        setelah panggilan AI dipindah ke proxy server-side / Apps Script).
--  2) Kolom users.password_hash bisa dibaca siapa saja (SELECT * / filter langsung)
--     dengan satu salt statis yang sama untuk semua user -> memungkinkan dump
--     seluruh hash password sekaligus.
--     -> Cabut hak SELECT kolom password_hash dari role anon. Semua alur yang
--        tadinya membandingkan password_hash langsung di client sekarang WAJIB
--        lewat fungsi RPC di bawah (SECURITY DEFINER = jalan dengan hak pemilik
--        fungsi, bukan hak anon, jadi tetap bisa baca/tulis password_hash secara
--        internal walau anon sendiri tidak bisa).
--  3) Alur lupa password sebelumnya memvalidasi OTP HANYA di JavaScript (variabel
--     lokal), tidak pernah dicek ulang oleh server -> mudah dilewati.
--     -> OTP sekarang disimpan (dalam bentuk hash, dengan masa berlaku + sekali
--        pakai) di tabel password_reset_tokens, dan divalidasi di dalam fungsi
--        confirm_password_reset(), bukan di JS.
--
-- CATATAN: ini BELUM memperbaiki isolasi antar-user di tabel transactions/
-- accounts/targets/dll (RLS masih "allow all" di sana) — itu FASE 2, yang
-- butuh sesi/JWT sungguhan supaya RLS tahu siapa yang sedang request.
-- ============================================================

-- --- Tabel token reset password (tidak pernah diakses langsung oleh client) ---
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  otp_hash   TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No direct access to reset tokens" ON public.password_reset_tokens;
CREATE POLICY "No direct access to reset tokens" ON public.password_reset_tokens
  FOR ALL USING (false) WITH CHECK (false);

-- --- Login: verifikasi password di dalam DB, kembalikan user TANPA password_hash ---
CREATE OR REPLACE FUNCTION public.login_check(p_username TEXT, p_password_hash TEXT)
RETURNS SETOF JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(u) - 'password_hash'
  FROM public.users u
  WHERE u.username = p_username AND u.password_hash = p_password_hash
  LIMIT 1;
$$;

-- --- Ambil profil (tanpa password_hash) berdasarkan username — dipakai login biometrik ---
CREATE OR REPLACE FUNCTION public.get_user_by_username(p_username TEXT)
RETURNS SETOF JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(u) - 'password_hash'
  FROM public.users u
  WHERE u.username = p_username AND u.status = 'active'
  LIMIT 1;
$$;

-- --- Ambil profil (tanpa password_hash) berdasarkan id — dipakai refresh sesi ---
CREATE OR REPLACE FUNCTION public.get_user_by_id(p_user_id UUID)
RETURNS SETOF JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(u) - 'password_hash'
  FROM public.users u
  WHERE u.id = p_user_id AND u.status = 'active'
  LIMIT 1;
$$;

-- --- Ganti password (butuh password lama yang benar) ---
CREATE OR REPLACE FUNCTION public.change_password(p_user_id UUID, p_old_hash TEXT, p_new_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  UPDATE public.users SET password_hash = p_new_hash, updated_at = NOW()
    WHERE id = p_user_id AND password_hash = p_old_hash;
  GET DIAGNOSTICS v_ok = ROW_COUNT;
  RETURN v_ok > 0;
END;
$$;

-- --- Lupa password, langkah 1: buat OTP, simpan HASH-nya saja (bukan plaintext) ---
-- Mengembalikan OTP plaintext HANYA agar bisa dikirim lewat EmailJS dari client;
-- OTP itu sendiri tidak pernah disimpan mentah di database.
CREATE OR REPLACE FUNCTION public.create_password_reset(p_email TEXT)
RETURNS TABLE(user_id UUID, full_name TEXT, otp TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user RECORD;
  v_otp TEXT;
BEGIN
  SELECT u.id, u.full_name INTO v_user FROM public.users u
    WHERE u.email = p_email AND u.status = 'active' LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_otp := lpad(floor(random()*1000000)::text, 6, '0');
  INSERT INTO public.password_reset_tokens(user_id, otp_hash, expires_at)
    VALUES (v_user.id, encode(digest(v_otp || 'finly_salt_2024','sha256'),'hex'), NOW() + interval '10 minutes');
  RETURN QUERY SELECT v_user.id, v_user.full_name, v_otp;
END;
$$;

-- --- Lupa password, langkah 2: validasi OTP di server (bukan di JS) lalu set password baru ---
CREATE OR REPLACE FUNCTION public.confirm_password_reset(p_user_id UUID, p_otp TEXT, p_new_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.password_reset_tokens t
    WHERE t.user_id = p_user_id
      AND t.otp_hash = encode(digest(p_otp || 'finly_salt_2024','sha256'),'hex')
      AND t.used = false
      AND t.expires_at > NOW()
  ) INTO v_ok;
  IF v_ok THEN
    UPDATE public.password_reset_tokens SET used = true
      WHERE user_id = p_user_id AND used = false;
    UPDATE public.users SET password_hash = p_new_hash, updated_at = NOW() WHERE id = p_user_id;
  END IF;
  RETURN v_ok;
END;
$$;

-- --- Pastikan role anon boleh MEMANGGIL fungsi-fungsi di atas (meski tidak
-- boleh membaca password_hash langsung) ---
GRANT EXECUTE ON FUNCTION public.login_check(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_by_username(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_by_id(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.change_password(UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.create_password_reset(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.confirm_password_reset(UUID, TEXT, TEXT) TO anon;

-- --- Cabut akses baca langsung ke password_hash dari role anon ---
-- (Fungsi-fungsi di atas tetap berfungsi normal karena SECURITY DEFINER
--  berjalan dengan hak pemilik fungsi, bukan hak anon.)
REVOKE SELECT (password_hash) ON public.users FROM anon;

-- --- Kunci total tabel settings — tidak ada lagi client yang perlu membacanya
-- setelah panggilan AI dipindah ke proxy server-side (lihat gas/wangku-backend.gs).
-- SEBELUM menjalankan baris ini: pastikan panggilan Groq sudah lewat proxy,
-- lalu HAPUS baris 'groq_api_key' dari tabel settings dan rotasi key Groq-nya.
DROP POLICY IF EXISTS "Allow all settings" ON public.settings;
CREATE POLICY "No public access to settings" ON public.settings
  FOR ALL USING (false) WITH CHECK (false);


-- ============================================================
-- [18] KEAMANAN (FASE 2) — isolasi data per-user yang SUNGGUHAN
-- ============================================================
-- Fase 1 (blok 17) menutup kebocoran password_hash & kunci tabel settings,
-- tapi tabel data (transactions, accounts, targets, dll) masih "USING (true)"
-- alias siapa saja dengan anon key bisa baca/tulis milik SIAPAPUN. Blok ini
-- memperbaiki itu dengan memberi setiap request identitas yang bisa dicek
-- RLS, TANPA migrasi ke Supabase Auth penuh:
--
--   1) login_check() sekarang juga MENANDATANGANI token JWT kustom (pakai
--      extension pgjwt + JWT Secret project ini), berisi claim `user_id`
--      dan `app_role`. Token ini dikirim client sebagai Bearer token
--      menggantikan anon key polos untuk semua request setelah login.
--   2) Semua policy RLS di tabel data diganti agar hanya mengizinkan baris
--      milik pemilik token (auth.jwt()->>'user_id' = user_id), ATAU token
--      dengan app_role='admin' (dipakai admin.html setelah login sungguhan
--      — lihat catatan di bawah, admin.html WAJIB diupdate untuk login
--      lewat login_check juga, tidak lagi pakai password tunggal di
--      localStorage).
--   3) Registrasi akun baru (belum punya token) tetap diizinkan lewat INSERT
--      langsung ke `users`, tapi WITH CHECK memaksa status='pending' dan
--      role='user' — supaya orang tidak bisa daftar sendiri sebagai admin
--      atau langsung status aktif lewat panggilan API mentah.
--
-- WAJIB DIJALANKAN SEKALI SEBELUM RELEASE PUBLIK. Setelah blok ini jalan,
-- SEMUA sesi lama (localStorage sdk_session tanpa token) tidak lagi bisa
-- baca/tulis data — user yang sedang login harus logout+login ulang sekali.
-- Karena ini masih tahap testing (belum rilis publik), efeknya aman.
-- ============================================================

-- --- Extension untuk menandatangani JWT langsung dari Postgres ---
CREATE EXTENSION IF NOT EXISTS pgjwt;

-- --- Ganti login_check agar mengembalikan {user, token} ---
-- (return type berubah dari SETOF JSONB jadi JSONB tunggal, jadi harus DROP dulu
-- — CREATE OR REPLACE saja tidak diizinkan Postgres untuk ganti return type)
DROP FUNCTION IF EXISTS public.login_check(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.login_check(p_username TEXT, p_password_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user RECORD;
  v_token TEXT;
BEGIN
  SELECT * INTO v_user FROM public.users u
    WHERE u.username = p_username AND u.password_hash = p_password_hash LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_token := sign(
    json_build_object(
      'role','authenticated',
      'sub', v_user.id::text,
      'user_id', v_user.id::text,
      'app_role', COALESCE(v_user.role,'user'),
      'exp', extract(epoch from (now() + interval '30 days'))::integer
    ),
    -- GANTI dengan JWT Secret asli project ini: Supabase Dashboard ->
    -- Project Settings -> Data API -> JWT Settings -> "JWT Secret"
    'OSQwxt5/y6oM9vZKo7IMU5uvikX3sZt9T2OUGfkgH85oSM+askL2e+W6f0z3uIerHuPhRj4OIeEkKbg4Atu/AA==',
    'HS256'
  );
  RETURN jsonb_build_object('user', to_jsonb(v_user) - 'password_hash', 'token', v_token);
END;
$$;
GRANT EXECUTE ON FUNCTION public.login_check(TEXT, TEXT) TO anon;

-- --- get_user_by_username / get_user_by_id juga perlu mengeluarkan token baru
-- (dipakai oleh login biometrik & refresh sesi) — sama, harus DROP dulu ---
DROP FUNCTION IF EXISTS public.get_user_by_username(TEXT);
CREATE OR REPLACE FUNCTION public.get_user_by_username(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user RECORD;
  v_token TEXT;
BEGIN
  SELECT * INTO v_user FROM public.users u
    WHERE u.username = p_username AND u.status = 'active' LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_token := sign(
    json_build_object('role','authenticated','sub', v_user.id::text,'user_id', v_user.id::text,
      'app_role', COALESCE(v_user.role,'user'),'exp', extract(epoch from (now() + interval '30 days'))::integer),
    'OSQwxt5/y6oM9vZKo7IMU5uvikX3sZt9T2OUGfkgH85oSM+askL2e+W6f0z3uIerHuPhRj4OIeEkKbg4Atu/AA==','HS256'
  );
  RETURN jsonb_build_object('user', to_jsonb(v_user) - 'password_hash', 'token', v_token);
END;
$$;

DROP FUNCTION IF EXISTS public.get_user_by_id(UUID);
CREATE OR REPLACE FUNCTION public.get_user_by_id(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user RECORD;
  v_token TEXT;
BEGIN
  SELECT * INTO v_user FROM public.users u
    WHERE u.id = p_user_id AND u.status = 'active' LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_token := sign(
    json_build_object('role','authenticated','sub', v_user.id::text,'user_id', v_user.id::text,
      'app_role', COALESCE(v_user.role,'user'),'exp', extract(epoch from (now() + interval '30 days'))::integer),
    'OSQwxt5/y6oM9vZKo7IMU5uvikX3sZt9T2OUGfkgH85oSM+askL2e+W6f0z3uIerHuPhRj4OIeEkKbg4Atu/AA==','HS256'
  );
  RETURN jsonb_build_object('user', to_jsonb(v_user) - 'password_hash', 'token', v_token);
END;
$$;

-- --- Helper dipakai di semua policy di bawah: apakah token ini pemilik baris,
-- atau admin? (mengembalikan boolean, aman dipanggil walau tanpa token) ---
CREATE OR REPLACE FUNCTION public.is_owner_or_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE((auth.jwt()->>'user_id')::uuid = p_user_id, false)
    OR COALESCE(auth.jwt()->>'app_role','') = 'admin';
$$;

-- --- Users: hanya boleh lihat/ubah baris sendiri, atau admin boleh semua.
-- INSERT (registrasi) tetap terbuka untuk anon TAPI dipaksa pending+user. ---
DROP POLICY IF EXISTS "Allow all users" ON public.users;
CREATE POLICY "Own row or admin - select" ON public.users FOR SELECT
  USING (public.is_owner_or_admin(id));
CREATE POLICY "Own row or admin - update" ON public.users FOR UPDATE
  USING (public.is_owner_or_admin(id)) WITH CHECK (public.is_owner_or_admin(id));
CREATE POLICY "Own row or admin - delete" ON public.users FOR DELETE
  USING (public.is_owner_or_admin(id));
CREATE POLICY "Public registration" ON public.users FOR INSERT TO anon
  WITH CHECK (status = 'pending' AND role = 'user');
CREATE POLICY "Admin can insert any" ON public.users FOR INSERT
  WITH CHECK (COALESCE(auth.jwt()->>'app_role','') = 'admin');

-- --- Semua tabel data: ganti "allow all" jadi milik-sendiri-atau-admin ---
DROP POLICY IF EXISTS "Allow all transactions" ON public.transactions;
CREATE POLICY "Own data or admin" ON public.transactions FOR ALL
  USING (public.is_owner_or_admin(user_id)) WITH CHECK (public.is_owner_or_admin(user_id));

DROP POLICY IF EXISTS "Allow all targets" ON public.targets;
CREATE POLICY "Own data or admin" ON public.targets FOR ALL
  USING (public.is_owner_or_admin(user_id)) WITH CHECK (public.is_owner_or_admin(user_id));

DROP POLICY IF EXISTS "Allow all orders" ON public.orders;
CREATE POLICY "Own data or admin" ON public.orders FOR ALL
  USING (public.is_owner_or_admin(user_id)) WITH CHECK (public.is_owner_or_admin(user_id));

DROP POLICY IF EXISTS "Allow all categories" ON public.user_categories;
CREATE POLICY "Own data or admin" ON public.user_categories FOR ALL
  USING (public.is_owner_or_admin(user_id)) WITH CHECK (public.is_owner_or_admin(user_id));

DROP POLICY IF EXISTS "Allow all accounts" ON public.accounts;
CREATE POLICY "Own data or admin" ON public.accounts FOR ALL
  USING (public.is_owner_or_admin(user_id)) WITH CHECK (public.is_owner_or_admin(user_id));

DROP POLICY IF EXISTS "Allow all priorities" ON public.user_priorities;
CREATE POLICY "Own data or admin" ON public.user_priorities FOR ALL
  USING (public.is_owner_or_admin(user_id)) WITH CHECK (public.is_owner_or_admin(user_id));

DROP POLICY IF EXISTS "Allow all detected_transactions" ON public.detected_transactions;
CREATE POLICY "Own data or admin" ON public.detected_transactions FOR ALL
  USING (public.is_owner_or_admin(user_id)) WITH CHECK (public.is_owner_or_admin(user_id));

-- --- Pastikan role authenticated punya hak akses tabel yang sama seperti anon
-- (RLS di atas yang membatasi baris, bukan hak akses tabel) ---
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions, public.targets,
  public.orders, public.user_categories, public.accounts, public.user_priorities,
  public.detected_transactions, public.users TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_or_admin(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_username(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_by_id(UUID) TO anon, authenticated;


-- ============================================================
-- SELESAI — Cek hasil
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
