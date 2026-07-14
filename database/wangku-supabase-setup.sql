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
DROP POLICY IF EXISTS "Allow all users" ON public.users;
CREATE POLICY "Allow all users" ON public.users FOR ALL USING (true) WITH CHECK (true);


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
DROP POLICY IF EXISTS "Allow all transactions" ON public.transactions;
CREATE POLICY "Allow all transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);


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
DROP POLICY IF EXISTS "Allow all targets" ON public.targets;
CREATE POLICY "Allow all targets" ON public.targets FOR ALL USING (true) WITH CHECK (true);


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
DROP POLICY IF EXISTS "Allow all orders" ON public.orders;
CREATE POLICY "Allow all orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- [6] TABEL SETTINGS (Konfigurasi app — API Key dll)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settings (
  key    TEXT PRIMARY KEY,
  value  TEXT
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all settings" ON public.settings;
CREATE POLICY "Allow all settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);


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
DROP POLICY IF EXISTS "Allow all categories" ON public.user_categories;
CREATE POLICY "Allow all categories" ON public.user_categories FOR ALL USING (true) WITH CHECK (true);


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
DROP POLICY IF EXISTS "Allow all accounts" ON public.accounts;
CREATE POLICY "Allow all accounts" ON public.accounts FOR ALL USING (true) WITH CHECK (true);

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
DROP POLICY IF EXISTS "Allow all priorities" ON public.user_priorities;
CREATE POLICY "Allow all priorities" ON public.user_priorities FOR ALL USING (true) WITH CHECK (true);

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
DROP POLICY IF EXISTS "Allow all detected_transactions" ON public.detected_transactions;
CREATE POLICY "Allow all detected_transactions" ON public.detected_transactions FOR ALL USING (true) WITH CHECK (true);


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
-- (DROP dulu — kalau script ini pernah dijalankan sampai blok [18], fungsi ini
-- sudah berubah jadi RETURNS JSONB tunggal, jadi re-run dari sini akan gagal
-- ganti tipe balik ke SETOF JSONB tanpa di-drop dulu)
DROP FUNCTION IF EXISTS public.login_check(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.login_check(p_username TEXT, p_password_hash TEXT)
RETURNS SETOF JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(u) - 'password_hash'
  FROM public.users u
  WHERE u.username = p_username AND u.password_hash = p_password_hash
  LIMIT 1;
$$;

-- --- Ambil profil (tanpa password_hash) berdasarkan username — dipakai login biometrik ---
DROP FUNCTION IF EXISTS public.get_user_by_username(TEXT);
CREATE OR REPLACE FUNCTION public.get_user_by_username(p_username TEXT)
RETURNS SETOF JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(u) - 'password_hash'
  FROM public.users u
  WHERE u.username = p_username AND u.status = 'active'
  LIMIT 1;
$$;

-- --- Ambil profil (tanpa password_hash) berdasarkan id — dipakai refresh sesi ---
DROP FUNCTION IF EXISTS public.get_user_by_id(UUID);
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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

-- --- Extension untuk tanda tangan HMAC (dipakai untuk membuat JWT manual) ---
-- CATATAN: awalnya blok ini memakai sign() dari extension `pgjwt`, tapi fungsi
-- itu punya search_path internal sendiri yang tidak bisa dioverride dari sini,
-- jadi gagal menemukan hmac() di setup Supabase ini. Diganti dengan fungsi
-- tanda-tangan JWT manual di bawah, yang search_path-nya kita kontrol sendiri.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Base64url encode (tanpa padding, tanpa newline) — dipakai untuk bagian JWT.
CREATE OR REPLACE FUNCTION public.wangku_b64url(data BYTEA)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT rtrim(replace(replace(replace(encode(data,'base64'), E'\n', ''), '+','-'), '/','_'), '=');
$$;

-- Tanda tangani JWT HS256 secara manual pakai hmac() dari pgcrypto.
CREATE OR REPLACE FUNCTION public.wangku_sign_jwt(p_payload JSON, p_secret TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  header_b64 TEXT;
  payload_b64 TEXT;
  signature BYTEA;
BEGIN
  header_b64 := public.wangku_b64url(convert_to('{"alg":"HS256","typ":"JWT"}','utf8'));
  payload_b64 := public.wangku_b64url(convert_to(p_payload::text,'utf8'));
  signature := hmac(header_b64 || '.' || payload_b64, p_secret, 'sha256');
  RETURN header_b64 || '.' || payload_b64 || '.' || public.wangku_b64url(signature);
END;
$$;

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
  v_token := public.wangku_sign_jwt(
    json_build_object(
      'role','authenticated',
      'sub', v_user.id::text,
      'user_id', v_user.id::text,
      'app_role', COALESCE(v_user.role,'user'),
      'exp', extract(epoch from (now() + interval '30 days'))::integer
    ),
    -- GANTI dengan JWT Secret asli project ini: Supabase Dashboard ->
    -- Project Settings -> Data API -> JWT Settings -> "JWT Secret"
    'OSQwxt5/y6oM9vZKo7IMU5uvikX3sZt9T2OUGfkgH85oSM+askL2e+W6f0z3uIerHuPhRj4OIeEkKbg4Atu/AA=='
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
  v_token := public.wangku_sign_jwt(
    json_build_object('role','authenticated','sub', v_user.id::text,'user_id', v_user.id::text,
      'app_role', COALESCE(v_user.role,'user'),'exp', extract(epoch from (now() + interval '30 days'))::integer),
    'OSQwxt5/y6oM9vZKo7IMU5uvikX3sZt9T2OUGfkgH85oSM+askL2e+W6f0z3uIerHuPhRj4OIeEkKbg4Atu/AA=='
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
  v_token := public.wangku_sign_jwt(
    json_build_object('role','authenticated','sub', v_user.id::text,'user_id', v_user.id::text,
      'app_role', COALESCE(v_user.role,'user'),'exp', extract(epoch from (now() + interval '30 days'))::integer),
    'OSQwxt5/y6oM9vZKo7IMU5uvikX3sZt9T2OUGfkgH85oSM+askL2e+W6f0z3uIerHuPhRj4OIeEkKbg4Atu/AA=='
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
-- [19] KATEGORI: izinkan nama sama dipakai di jenis berbeda
-- (mis. "Arisan" sebagai kategori Pemasukan sekaligus Pengeluaran).
-- UNIQUE(user_id, nama) sebelumnya memblokir ini — dan juga menyebabkan
-- gagal tambah kategori baru kalau namanya kebetulan sama dengan kategori
-- default di jenis lain.
-- ============================================================
ALTER TABLE public.user_categories DROP CONSTRAINT IF EXISTS user_categories_user_id_nama_key;
ALTER TABLE public.user_categories ADD CONSTRAINT user_categories_user_id_nama_jenis_key UNIQUE (user_id, nama, jenis);


-- ============================================================
-- [20] LOGIN_CHECK: samakan gerbang status='active' dengan
-- get_user_by_username/get_user_by_id — sebelumnya login_check tidak
-- mengecek status sama sekali, jadi akun pending/banned yang tahu password
-- yang benar tetap mendapat JWT bertanda tangan valid dari RPC ini
-- (klien memang membuang token itu setelah mengecek status, tapi
-- panggilan API langsung ke RPC tidak melewati pengecekan klien itu).
-- ============================================================
DROP FUNCTION IF EXISTS public.login_check(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.login_check(p_username TEXT, p_password_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user RECORD;
  v_token TEXT;
BEGIN
  SELECT * INTO v_user FROM public.users u
    WHERE u.username = p_username AND u.password_hash = p_password_hash AND u.status = 'active' LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_token := public.wangku_sign_jwt(
    json_build_object(
      'role','authenticated',
      'sub', v_user.id::text,
      'user_id', v_user.id::text,
      'app_role', COALESCE(v_user.role,'user'),
      'exp', extract(epoch from (now() + interval '30 days'))::integer
    ),
    -- GANTI dengan JWT Secret asli project ini: Supabase Dashboard ->
    -- Project Settings -> Data API -> JWT Settings -> "JWT Secret"
    'OSQwxt5/y6oM9vZKo7IMU5uvikX3sZt9T2OUGfkgH85oSM+askL2e+W6f0z3uIerHuPhRj4OIeEkKbg4Atu/AA=='
  );
  RETURN jsonb_build_object('user', to_jsonb(v_user) - 'password_hash', 'token', v_token);
END;
$$;
GRANT EXECUTE ON FUNCTION public.login_check(TEXT, TEXT) TO anon;


-- ============================================================
-- [21] SALDO PER-AKUN: cegah pengeluaran/transfer yang membuat saldo akun
-- sumber jadi minus. Dicek server-side sebagai jaring pengaman di belakang
-- pengecekan client-side (js/transactions.js) — bukan pengganti UX utama.
-- Model saldo sama dengan Saldo Sekarang di database.md: saldo_awal akun +
-- seluruh riwayat transaksi akun itu (all-time, bukan bulan berjalan).
-- Hanya membatasi pengeluaran & transfer (sisi account_id/sumber);
-- pemasukan tidak dibatasi.
-- ============================================================
CREATE OR REPLACE FUNCTION public.wangku_check_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_saldo_awal NUMERIC;
  v_masuk NUMERIC;
  v_keluar NUMERIC;
  v_transfer_in NUMERIC;
  v_transfer_out NUMERIC;
  v_saldo_akun NUMERIC;
  v_exclude_id UUID;
BEGIN
  IF NEW.jenis NOT IN ('pengeluaran','transfer') OR NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Saat UPDATE, jangan hitung baris lama itu sendiri dua kali
  v_exclude_id := CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END;

  SELECT COALESCE(saldo_awal,0) INTO v_saldo_awal FROM public.accounts WHERE id = NEW.account_id;
  IF NOT FOUND THEN
    RETURN NEW; -- akun tidak ditemukan, biarkan FK constraint yang menangani
  END IF;

  SELECT
    COALESCE(SUM(nominal) FILTER (WHERE jenis='pemasukan' AND account_id=NEW.account_id), 0),
    COALESCE(SUM(nominal) FILTER (WHERE jenis='pengeluaran' AND account_id=NEW.account_id), 0),
    COALESCE(SUM(nominal) FILTER (WHERE jenis='transfer' AND to_account_id=NEW.account_id), 0),
    COALESCE(SUM(nominal) FILTER (WHERE jenis='transfer' AND account_id=NEW.account_id), 0)
  INTO v_masuk, v_keluar, v_transfer_in, v_transfer_out
  FROM public.transactions
  WHERE user_id = NEW.user_id AND (v_exclude_id IS NULL OR id <> v_exclude_id);

  v_saldo_akun := v_saldo_awal + v_masuk - v_keluar + v_transfer_in - v_transfer_out;

  IF (v_saldo_akun - NEW.nominal) < 0 THEN
    RAISE EXCEPTION 'Saldo akun tidak cukup untuk transaksi ini (saldo saat ini: %, nominal: %)', v_saldo_akun, NEW.nominal;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_account_balance ON public.transactions;
CREATE TRIGGER trg_check_account_balance
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.wangku_check_account_balance();


-- ============================================================
-- [22] REGISTRASI: cek ketersediaan username/email tanpa butuh SELECT
-- langsung ke tabel users sebagai anon.
--
-- Root cause asli dari "new row violates row-level security policy for
-- table users" (BUKAN token sdk_token basi seperti dugaan awal — itu
-- ternyata cuma perbaikan yang tidak salah tapi juga tidak cukup):
-- sb()/sbAnon() selalu mengirim header `Prefer: return=representation`
-- untuk setiap POST, supaya baris yang baru dibuat bisa langsung dibaca
-- balik oleh client. Itu artinya Postgres juga harus mengevaluasi policy
-- SELECT terhadap baris yang baru di-insert itu — dan tidak ada satupun
-- policy SELECT di tabel users yang mengizinkan role anon melihat baris
-- APAPUN (cuma "Own row or admin - select", yang butuh user_id di JWT
-- cocok dengan baris itu — mustahil untuk request yang belum pernah login).
-- Akibatnya INSERT-nya sendiri sebenarnya sah (lolos policy "Public
-- registration"), tapi seluruh statement digagalkan Postgres karena tidak
-- bisa memenuhi permintaan baca-balik itu. Ini dikonfirmasi langsung lewat
-- MCP Supabase: INSERT identik TANPA klausa RETURNING berhasil; DENGAN
-- RETURNING selalu gagal dengan pesan RLS yang sama persis dengan yang
-- dilaporkan dari aplikasi.
--
-- Fix di sisi client (lihat auth.js): id di-generate di client
-- (crypto.randomUUID()) lalu dikirim eksplisit di payload INSERT, dan POST
-- registrasi memakai `Prefer: return=minimal` — jadi tidak pernah butuh
-- policy SELECT sama sekali. Pre-check "username/email sudah dipakai?" di
-- doRegister() punya masalah yang SAMA (SELECT langsung ke users sebagai
-- anon selalu kosong, jadi tidak pernah benar-benar mendeteksi duplikat) —
-- diganti dengan fungsi RPC SECURITY DEFINER di bawah ini, yang hanya
-- mengembalikan boolean (bukan baris aslinya), supaya tidak perlu bikin
-- policy SELECT baru yang membuka data pending-registration ke siapa saja
-- yang punya anon key.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_registration_available(p_username TEXT, p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS(
    SELECT 1 FROM public.users u WHERE u.username = p_username OR u.email = p_email
  );
$$;
GRANT EXECUTE ON FUNCTION public.check_registration_available(TEXT, TEXT) TO anon;


-- ============================================================
-- [23] KATEGORI: uniqueness case-insensitive
-- ============================================================
-- Bug: menambah kategori dengan nama yang sama persis (case-insensitive)
-- dengan yang sudah ada TIDAK selalu ditolak. UNIQUE(user_id, nama, jenis)
-- dari block [19] itu sendiri sudah benar SESUAI DEFINISINYA — tapi
-- perbandingan Postgres itu case-SENSITIVE by default. DEFAULT_CATEGORIES
-- di-seed lowercase ('bonus'), sementara UI menampilkannya dengan huruf
-- pertama besar ('Bonus') murni untuk tampilan (charAt(0).toUpperCase()),
-- tanpa pernah mengubah nilai yang tersimpan. User yang mengira "Bonus"
-- adalah kategori yang sama dan mengetiknya manual lewat form tambah
-- kategori sebenarnya membuat STRING YANG BERBEDA secara harfiah, yang
-- lolos dari constraint lama tanpa terdeteksi -- baru terdeteksi kalau
-- ada percobaan KEDUA dengan ejaan (termasuk kapitalisasi) yang sama
-- persis dengan baris "duplikat" yang sudah lolos itu.
--
-- Dikonfirmasi lewat query langsung ke produksi: 3 pasang duplikat
-- ditemukan ('gaji'/'Gaji', 'bonus'/'Bonus' x2), semuanya identik byte-
-- per-byte kecuali huruf pertama -- bukan whitespace/karakter tersembunyi.
-- Baris is_default=false (versi kapital, buatan user) dihapus manual
-- sekali di produksi setelah dikonfirmasi tidak ada transaksi yang
-- mereferensikan nama itu persis.
--
-- Fix: ganti constraint exact-match dengan unique index case-insensitive.
-- Client (categories.js) juga di-lowercase-kan sebelum insert/update
-- sebagai lapisan kedua, supaya nama yang tersimpan konsisten dan tampilan
-- "Judul Kasus" tetap benar dari charAt(0).toUpperCase() yang sudah ada.
-- ============================================================
ALTER TABLE public.user_categories DROP CONSTRAINT IF EXISTS user_categories_user_id_nama_jenis_key;
DROP INDEX IF EXISTS public.user_categories_user_id_nama_ci_jenis_key;
CREATE UNIQUE INDEX user_categories_user_id_nama_ci_jenis_key
  ON public.user_categories (user_id, lower(nama), jenis);


-- ============================================================
-- [24] SUBSCRIPTION: registrasi langsung aktif + trial Pro 14 hari,
-- bukan pending + plan-picker manual.
--
-- 1) "Public registration" tadinya WITH CHECK status='pending' -- klien
--    sekarang mengirim status='active' sejak awal (verifyRegOTP di
--    auth.js), jadi policy-nya harus disamakan atau INSERT registrasi
--    baru akan gagal RLS persis seperti bug D1 dulu.
--
-- 2) login_check/get_user_by_username/get_user_by_id ditambah
--    pengecekan trial lazy: kalau trial_ends_at sudah lewat DAN user
--    masih di plan 'pro', turunkan ke 'free' saat itu juga (tidak
--    pernah mengunci akun -- cuma AI Chat/Scan/bot WA yang hilang).
--    Sengaja hanya menurunkan saat plan masih persis 'pro', BUKAN
--    setiap kali trial_ends_at lewat begitu saja -- supaya admin yang
--    sudah meng-upgrade user itu ke paket berbayar asli (lewat
--    admin.html) tidak ketiban turun lagi di login berikutnya.
--    Prasyarat: admin.html WAJIB ikut mengosongkan trial_ends_at
--    setiap kali plan diubah manual (lihat updateUserPlan/aktivasiUser
--    di admin.html) -- tanpa itu, trial_ends_at yang basi tetap ada di
--    baris user itu dan bisa memicu turun-plan yang salah di masa depan.
-- ============================================================
DROP POLICY IF EXISTS "Public registration" ON public.users;
CREATE POLICY "Public registration" ON public.users FOR INSERT TO anon
  WITH CHECK (status = 'active' AND role = 'user');

DROP FUNCTION IF EXISTS public.login_check(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.login_check(p_username TEXT, p_password_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user RECORD;
  v_token TEXT;
BEGIN
  SELECT * INTO v_user FROM public.users u
    WHERE u.username = p_username AND u.password_hash = p_password_hash AND u.status = 'active' LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_user.trial_ends_at IS NOT NULL AND v_user.trial_ends_at < now() AND v_user.plan = 'pro' THEN
    UPDATE public.users SET plan = 'free' WHERE id = v_user.id;
    v_user.plan := 'free';
  END IF;
  v_token := public.wangku_sign_jwt(
    json_build_object(
      'role','authenticated',
      'sub', v_user.id::text,
      'user_id', v_user.id::text,
      'app_role', COALESCE(v_user.role,'user'),
      'exp', extract(epoch from (now() + interval '30 days'))::integer
    ),
    'OSQwxt5/y6oM9vZKo7IMU5uvikX3sZt9T2OUGfkgH85oSM+askL2e+W6f0z3uIerHuPhRj4OIeEkKbg4Atu/AA=='
  );
  RETURN jsonb_build_object('user', to_jsonb(v_user) - 'password_hash', 'token', v_token);
END;
$$;
GRANT EXECUTE ON FUNCTION public.login_check(TEXT, TEXT) TO anon;

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
  IF v_user.trial_ends_at IS NOT NULL AND v_user.trial_ends_at < now() AND v_user.plan = 'pro' THEN
    UPDATE public.users SET plan = 'free' WHERE id = v_user.id;
    v_user.plan := 'free';
  END IF;
  v_token := public.wangku_sign_jwt(
    json_build_object('role','authenticated','sub', v_user.id::text,'user_id', v_user.id::text,
      'app_role', COALESCE(v_user.role,'user'),'exp', extract(epoch from (now() + interval '30 days'))::integer),
    'OSQwxt5/y6oM9vZKo7IMU5uvikX3sZt9T2OUGfkgH85oSM+askL2e+W6f0z3uIerHuPhRj4OIeEkKbg4Atu/AA=='
  );
  RETURN jsonb_build_object('user', to_jsonb(v_user) - 'password_hash', 'token', v_token);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_by_username(TEXT) TO anon;

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
  IF v_user.trial_ends_at IS NOT NULL AND v_user.trial_ends_at < now() AND v_user.plan = 'pro' THEN
    UPDATE public.users SET plan = 'free' WHERE id = v_user.id;
    v_user.plan := 'free';
  END IF;
  v_token := public.wangku_sign_jwt(
    json_build_object('role','authenticated','sub', v_user.id::text,'user_id', v_user.id::text,
      'app_role', COALESCE(v_user.role,'user'),'exp', extract(epoch from (now() + interval '30 days'))::integer),
    'OSQwxt5/y6oM9vZKo7IMU5uvikX3sZt9T2OUGfkgH85oSM+askL2e+W6f0z3uIerHuPhRj4OIeEkKbg4Atu/AA=='
  );
  RETURN jsonb_build_object('user', to_jsonb(v_user) - 'password_hash', 'token', v_token);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_by_id(UUID) TO anon;


-- ============================================================
-- [25] REGISTRASI: check_registration_available() dulu cuma cek
-- username/email -- wa_number (yang juga UNIQUE di tabel users, block [1])
-- tidak pernah ikut dicek. Akibatnya nomor WA yang sudah dipakai lolos
-- pre-check di doRegister(), OTP terkirim & diverifikasi seolah semua
-- baik-baik saja, dan baru gagal di langkah paling akhir (INSERT di
-- verifyRegOTP()) dengan pesan generik "Username/email sudah terdaftar!"
-- yang salah -- constraint yang sebenarnya kena adalah users_wa_number_key,
-- bukan username atau email. Ditemukan oleh product owner saat mendaftar
-- ulang pakai nomor WA akun admin yang sudah ada.
--
-- Fix: tambah parameter p_wa_number, sertakan wa_number di pengecekan,
-- supaya duplikat nomor WA ketahuan di doRegister() (sebelum OTP dikirim
-- sama sekali), bukan menunggu sampai langkah terakhir. Pesan error di
-- js/auth.js juga disamakan untuk menyebut ketiga kemungkinan field --
-- tetap tidak menyebut yang MANA persis yang bentrok (RPC ini sengaja
-- cuma mengembalikan boolean, bukan baris aslinya -- lihat catatan di
-- blok [22] soal risiko enumerasi data pending-registration).
-- ============================================================
DROP FUNCTION IF EXISTS public.check_registration_available(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.check_registration_available(p_username TEXT, p_email TEXT, p_wa_number TEXT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS(
    SELECT 1 FROM public.users u WHERE u.username = p_username OR u.email = p_email OR u.wa_number = p_wa_number
  );
$$;
GRANT EXECUTE ON FUNCTION public.check_registration_available(TEXT, TEXT, TEXT) TO anon;


-- ============================================================
-- [26] SECURITY FIX (CRITICAL): mitigate leaked JWT signing secret --
-- token_version binds every issued token to a live, per-user random
-- nonce checked against the real users row, so a forged token (signed
-- with the leaked secret, but without the correct nonce) is rejected.
--
-- Context: the HS256 secret passed to wangku_sign_jwt() below is
-- committed in this file, which lives in a PUBLIC GitHub repo --
-- confirmed fetchable by anyone via a plain unauthenticated
-- raw.githubusercontent.com request. Since Postgres/PostgREST's JWT
-- verification only proves "signed by someone who knows the secret,"
-- anyone who reads this file can construct a validly-signed token
-- claiming ANY user_id and app_role:'admin', bypassing every RLS
-- policy in this schema (is_owner_or_admin() previously trusted the
-- JWT's self-asserted user_id/app_role claims at face value, with no
-- way to distinguish a genuine token minted by login_check() after a
-- real password check from a forged one -- both are just "correctly
-- signed with a known secret," which is exactly what JWT verification
-- checks and nothing more).
--
-- Rotating the underlying Supabase-managed secret was investigated
-- first and hits a real platform limitation: Supabase's newer JWT
-- Signing Keys system does not expose the raw secret value for
-- auto-generated/rotated keys (by design, since it's meant for
-- Supabase Auth's own SDK to use internally) -- but wangku_sign_jwt()
-- hand-signs tokens itself and must know the exact secret string, so
-- there was no way to get a fresh, known, Supabase-verified secret
-- through the dashboard. This fix closes the practical exploit a
-- different way, entirely within our own SQL, independent of whatever
-- Supabase's key management does or doesn't expose.
--
-- Mechanism: a random token_version UUID is generated per user
-- (unguessable without already having legitimate access). Every token
-- minted by login_check/get_user_by_username/get_user_by_id embeds
-- the user's current token_version as a claim. is_owner_or_admin() no
-- longer trusts auth.jwt()->>'user_id'/'app_role' directly -- it looks
-- up the real row by the claimed user_id, requires the token's
-- token_version to match what's CURRENTLY stored for that exact row,
-- and checks the real role column instead of the self-asserted
-- app_role claim. An attacker with the leaked secret can still
-- construct a validly-signed token, but can't satisfy the
-- token_version match without already knowing a specific user's
-- private random nonce -- closing both the "impersonate any user" and
-- "self-escalate to fake admin" paths.
--
-- Verified directly against the live production REST API (not just
-- locally): reproduced wangku_sign_jwt()'s exact signing procedure
-- byte-for-byte (cross-checked against a real call to the function --
-- identical output confirms the reproduction is correct, not an
-- artifact of a scripting mistake), forged a token with a real user's
-- id + app_role:'admin' + a wrong/guessed token_version, and confirmed
-- it returns HTTP 200 with zero rows (correctly blocked by RLS) against
-- both `users` and `transactions`. A genuine token from a real
-- login_check() call (correct token_version) was confirmed to still
-- work normally over the same REST API.
--
-- Side effect (expected, unavoidable): every currently-active session
-- is invalidated the moment this deploys, since existing tokens don't
-- carry a token_version claim at all -- same disruption a real secret
-- rotation would have caused. Everyone needs to log in again.
--
-- This does NOT make the leaked secret itself safe to leave public --
-- it only closes the practical exploit path it enabled. Getting a
-- genuinely fresh, non-public secret in place (or moving off hand-
-- rolled JWT signing entirely) remains worth pursuing separately; see
-- roadmap.md.
-- ============================================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS token_version UUID DEFAULT gen_random_uuid() NOT NULL;

CREATE OR REPLACE FUNCTION public.is_owner_or_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.users u
    WHERE u.id = (auth.jwt()->>'user_id')::uuid
      AND u.token_version::text = auth.jwt()->>'token_version'
      AND (u.id = p_user_id OR u.role = 'admin')
  );
$$;

DROP FUNCTION IF EXISTS public.login_check(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.login_check(p_username TEXT, p_password_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user RECORD;
  v_token TEXT;
BEGIN
  SELECT * INTO v_user FROM public.users u
    WHERE u.username = p_username AND u.password_hash = p_password_hash AND u.status = 'active' LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_user.trial_ends_at IS NOT NULL AND v_user.trial_ends_at < now() AND v_user.plan = 'pro' THEN
    UPDATE public.users SET plan = 'free' WHERE id = v_user.id;
    v_user.plan := 'free';
  END IF;
  v_token := public.wangku_sign_jwt(
    json_build_object(
      'role','authenticated',
      'sub', v_user.id::text,
      'user_id', v_user.id::text,
      'app_role', COALESCE(v_user.role,'user'),
      'token_version', v_user.token_version::text,
      'exp', extract(epoch from (now() + interval '30 days'))::integer
    ),
    'OSQwxt5/y6oM9vZKo7IMU5uvikX3sZt9T2OUGfkgH85oSM+askL2e+W6f0z3uIerHuPhRj4OIeEkKbg4Atu/AA=='
  );
  RETURN jsonb_build_object('user', to_jsonb(v_user) - 'password_hash', 'token', v_token);
END;
$$;
GRANT EXECUTE ON FUNCTION public.login_check(TEXT, TEXT) TO anon;

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
  IF v_user.trial_ends_at IS NOT NULL AND v_user.trial_ends_at < now() AND v_user.plan = 'pro' THEN
    UPDATE public.users SET plan = 'free' WHERE id = v_user.id;
    v_user.plan := 'free';
  END IF;
  v_token := public.wangku_sign_jwt(
    json_build_object('role','authenticated','sub', v_user.id::text,'user_id', v_user.id::text,
      'app_role', COALESCE(v_user.role,'user'),'token_version', v_user.token_version::text,
      'exp', extract(epoch from (now() + interval '30 days'))::integer),
    'OSQwxt5/y6oM9vZKo7IMU5uvikX3sZt9T2OUGfkgH85oSM+askL2e+W6f0z3uIerHuPhRj4OIeEkKbg4Atu/AA=='
  );
  RETURN jsonb_build_object('user', to_jsonb(v_user) - 'password_hash', 'token', v_token);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_by_username(TEXT) TO anon;

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
  IF v_user.trial_ends_at IS NOT NULL AND v_user.trial_ends_at < now() AND v_user.plan = 'pro' THEN
    UPDATE public.users SET plan = 'free' WHERE id = v_user.id;
    v_user.plan := 'free';
  END IF;
  v_token := public.wangku_sign_jwt(
    json_build_object('role','authenticated','sub', v_user.id::text,'user_id', v_user.id::text,
      'app_role', COALESCE(v_user.role,'user'),'token_version', v_user.token_version::text,
      'exp', extract(epoch from (now() + interval '30 days'))::integer),
    'OSQwxt5/y6oM9vZKo7IMU5uvikX3sZt9T2OUGfkgH85oSM+askL2e+W6f0z3uIerHuPhRj4OIeEkKbg4Atu/AA=='
  );
  RETURN jsonb_build_object('user', to_jsonb(v_user) - 'password_hash', 'token', v_token);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_by_id(UUID) TO anon;


-- ============================================================
-- SELESAI — Cek hasil
-- ============================================================
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
