-- ================================================
-- SALDOKU — Supabase Setup (Jalankan di SQL Editor)
-- ================================================

-- 1. Tabel users
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  wa_number TEXT UNIQUE,
  email TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user','admin')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','banned')),
  password_hash TEXT,
  avatar_color TEXT DEFAULT '#00B26A',
  gas_user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  last_active TIMESTAMPTZ
);

-- 2. Index
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
CREATE INDEX IF NOT EXISTS idx_users_wa ON public.users(wa_number);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_users_created ON public.users(created_at);

-- 3. RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON public.users;
CREATE POLICY "Allow all" ON public.users FOR ALL USING (true) WITH CHECK (true);

-- 4. Auto update timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Insert admin default
-- Password: maurizky123 (bisa direset dari dashboard)
INSERT INTO public.users (username, full_name, wa_number, email, role, status, gas_user_id, password_hash)
VALUES (
  'maurizky',
  'Maurizky Fadhillah',
  '6285727318698',
  'maurizky@finly.app',
  'admin',
  'active',
  '6285727318698',
  '5e8ff9bf55ba3508199d22e984129be6698d2d42a9c43000e5e69e63e79c22f4'
)
ON CONFLICT (username) DO UPDATE SET
  role = 'admin',
  status = 'active',
  gas_user_id = '6285727318698';

-- Cek hasil
SELECT id, username, full_name, wa_number, email, role, status FROM public.users;
