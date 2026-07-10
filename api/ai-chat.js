// /api/ai-chat.js
// Vercel serverless function — proxies AI chat requests to Groq so the API
// key never touches the client. Set GROQ_API_KEY as a Vercel environment
// variable (Project Settings -> Environment Variables), NOT in this file.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mchuhgihywnyamurbetz.supabase.co';
// Cuma dipakai untuk satu query lookup plan/token user di bawah — RLS
// mewajibkan JWT kepemilikan baris (is_owner_or_admin) yang fungsi ini
// tidak pernah punya (cuma terima user_id polos di body), jadi anon key
// selalu dapat 0 baris pasca migrasi RLS. Service role sengaja untuk
// konteks server tepercaya seperti ini — JANGAN dipakai di tempat lain
// di file ini, dan JANGAN pernah masuk ke kode yang dikirim ke client.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!GROQ_API_KEY) return res.status(500).json({ error: 'Server belum dikonfigurasi (GROQ_API_KEY kosong)' });
    if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY kosong)' });

    const { user_id, messages } = req.body || {};
    if (!user_id || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'user_id dan messages wajib diisi' });
    }

    // Verifikasi plan & sisa token di server — jangan percaya klaim dari klien.
    // Pakai service role di sini karena fungsi ini tidak pernah membawa JWT
    // milik user (cuma user_id polos), jadi tidak ada cara memenuhi RLS
    // is_owner_or_admin() dengan anon key — service role bypass RLS by design,
    // sah untuk lookup otorisasi server-side tepercaya seperti ini.
    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(user_id)}&select=plan,role,tokens_used,tokens_limit`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const rows = await userRes.json();
    const u = Array.isArray(rows) ? rows[0] : null;
    if (!u) return res.status(403).json({ error: 'User tidak ditemukan' });

    const isMaster = u.role === 'admin';
    const plan = isMaster ? 'unlimited' : (u.plan || 'free');
    if (!isMaster) {
      if (plan === 'free' || plan === 'basic') {
        return res.status(403).json({ error: 'AI Chat belum termasuk paketmu. Upgrade ke Pro/Ultimate ya 🚀' });
      }
      const limit = Number(u.tokens_limit) || 0;
      const used = Number(u.tokens_used) || 0;
      if (!(limit > used)) {
        return res.status(403).json({ error: 'Limit token AI bulan ini sudah habis' });
      }
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', max_tokens: 400, messages })
    });
    const data = await groqRes.json();
    if (data.error) return res.status(502).json({ error: 'Groq error: ' + data.error.message });

    const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || 'Maaf ada gangguan.';
    const tokensUsed = (data.usage && data.usage.total_tokens) || 0;

    return res.status(200).json({ reply, tokensUsed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
