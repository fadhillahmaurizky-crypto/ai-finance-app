// /api/ai-scan.js
// Vercel serverless function — proxies receipt-scan (vision) requests to Groq
// so the API key never touches the client. Set GROQ_API_KEY as a Vercel
// environment variable (Project Settings -> Environment Variables).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mchuhgihywnyamurbetz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHVoZ2loeXdueWFtdXJiZXR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTIyNDIsImV4cCI6MjA5NzcyODI0Mn0.z1ildAJY--ErFoom2d7GIF1TCr3fmaBkCWtwGz4QstI';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!GROQ_API_KEY) return res.status(500).json({ error: 'Server belum dikonfigurasi (GROQ_API_KEY kosong)' });

    const { user_id, image_base64, mime_type } = req.body || {};
    if (!user_id || !image_base64) {
      return res.status(400).json({ error: 'user_id dan image_base64 wajib diisi' });
    }

    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(user_id)}&select=plan,role,tokens_used,tokens_limit`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const rows = await userRes.json();
    const u = Array.isArray(rows) ? rows[0] : null;
    if (!u) return res.status(403).json({ error: 'User tidak ditemukan' });

    const isMaster = u.role === 'admin';
    const plan = isMaster ? 'unlimited' : (u.plan || 'free');
    if (!isMaster) {
      if (plan === 'free' || plan === 'basic') {
        return res.status(403).json({ error: 'Scan struk belum termasuk paketmu. Upgrade ke Pro/Ultimate ya 🚀' });
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
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mime_type || 'image/jpeg'};base64,${image_base64}` } },
            { type: 'text', text: 'Baca struk ini. Kembalikan JSON saja tanpa penjelasan: {"toko":"nama toko","total":angka,"kategori":"makan/belanja/elektronik/pulsa/paket_data","prioritas":"penting/tidak_penting","keterangan":"deskripsi max 30 karakter"}. Jika bukan struk: {"error":"Bukan struk"}' }
          ]
        }]
      })
    });
    const data = await groqRes.json();
    if (data.error) return res.status(502).json({ error: 'Groq error: ' + data.error.message });

    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '{}';
    const tokensUsed = (data.usage && data.usage.total_tokens) || 0;

    return res.status(200).json({ content, tokensUsed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
