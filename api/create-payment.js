// /api/create-payment.js
// Vercel serverless function — creates a Xendit-hosted invoice for a token
// top-up purchase. XENDIT_SECRET_KEY_TEST never reaches the client, same
// reasoning as GROQ_API_KEY in ai-chat.js/ai-scan.js. Set it as a Vercel
// environment variable (Project Settings -> Environment Variables), NOT in
// this file.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mchuhgihywnyamurbetz.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY_TEST;
const APP_URL = process.env.APP_URL || 'https://ai-finance-app-murex.vercel.app';

// Tier definitions sengaja hardcode di server, BUKAN dipercaya dari body
// request client -- sama alasan dengan plan/limit gating di ai-chat.js:
// client yang dimodifikasi tidak boleh bisa minta invoice murah untuk
// token banyak. Nominal & jumlah token harus sama persis dengan tier
// manual admin.html (setUserTokens) supaya tidak ada dua sumber kebenaran
// untuk paket yang sama.
const TOKEN_PACKAGES = {
  '2jt': { tokens: 2000000, amount: 35000, label: '2 Juta Token AI' },
  '5jt': { tokens: 5000000, amount: 59000, label: '5 Juta Token AI' },
};
// Perpanjangan plan (bukan top-up token) -- harga & token bundel harus
// sama persis dengan tier manual admin.html (konfirmasiOrder) dan
// PLANS di config.js, supaya tidak ada dua sumber kebenaran untuk plan
// yang sama. Hanya Basic/Pro yang punya jalur perpanjangan mandiri lewat
// Xendit -- Ultimate tetap lewat WhatsApp+approval manual saja, sesuai
// scope spec ini.
const PLAN_PACKAGES = {
  basic: { amount: 19000, tokens: 0, label: 'Paket Basic (30 Hari)' },
  pro: { amount: 39000, tokens: 2000000, label: 'Paket Pro (30 Hari)' },
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!XENDIT_SECRET_KEY) return res.status(500).json({ error: 'Server belum dikonfigurasi (XENDIT_SECRET_KEY_TEST kosong)' });
    if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY kosong)' });

    const { user_id, package: packageId, item_type } = req.body || {};
    // item_type default 'tokens' -- request lama (buyTokenPackage(), belum
    // pernah kirim item_type sama sekali) tetap jalan tanpa perubahan.
    const itemType = item_type === 'plan' ? 'plan' : 'tokens';
    const pkg = itemType === 'plan' ? PLAN_PACKAGES[packageId] : TOKEN_PACKAGES[packageId];
    if (!user_id || !pkg) {
      return res.status(400).json({
        error: itemType === 'plan' ? 'user_id dan package (basic/pro) wajib diisi' : 'user_id dan package (2jt/5jt) wajib diisi',
      });
    }

    // Sama seperti ai-chat.js: fungsi ini tidak pernah membawa JWT milik
    // user (cuma user_id polos), jadi service role dipakai untuk lookup
    // tepercaya server-side ini.
    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(user_id)}&select=id,email,username`,
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
    );
    const userRows = await userRes.json();
    const u = Array.isArray(userRows) ? userRows[0] : null;
    if (!u) return res.status(403).json({ error: 'User tidak ditemukan' });

    // Baris 'pending' dibuat DULU -- id-nya sendiri dipakai sebagai
    // external_id yang dikirim ke Xendit, supaya webhook nanti tinggal
    // UPDATE baris yang sudah ada (bukan insert-or-update), dan supaya
    // idempotensi cukup lewat "WHERE status='pending'" di UPDATE itu.
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/token_purchases`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        user_id: u.id,
        tokens: pkg.tokens,
        amount: pkg.amount,
        status: 'pending',
        item_type: itemType,
        plan: itemType === 'plan' ? packageId : null,
      }),
    });
    if (!insertRes.ok) return res.status(500).json({ error: 'Gagal membuat catatan pembelian' });
    const [purchase] = await insertRes.json();

    const invoiceRes = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Xendit pakai HTTP Basic Auth: secret key sebagai username, password kosong.
        Authorization: 'Basic ' + Buffer.from(XENDIT_SECRET_KEY + ':').toString('base64'),
      },
      body: JSON.stringify({
        external_id: purchase.id,
        amount: pkg.amount,
        payer_email: u.email || undefined,
        description: `${pkg.label} - Wangku`,
        success_redirect_url: `${APP_URL}/app?xendit_return=success`,
        failure_redirect_url: `${APP_URL}/app?xendit_return=failed`,
      }),
    });
    const invoice = await invoiceRes.json();
    if (!invoiceRes.ok || !invoice.invoice_url) {
      // Baris 'pending' sudah kadung dibuat di atas -- kalau dibiarkan,
      // baris ini nyangkut 'pending' selamanya di Riwayat Pembayaran
      // padahal invoice-nya sendiri tidak pernah benar-benar dibuat.
      // Ditandai 'failed' di sini juga, bukan cuma via webhook EXPIRED
      // (kasus ini beda: gagal SEBELUM sempat jadi invoice Xendit sama
      // sekali, jadi tidak akan pernah ada webhook yang datang untuknya).
      await fetch(`${SUPABASE_URL}/rest/v1/token_purchases?id=eq.${purchase.id}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'failed' }),
      }).catch(() => {});
      return res.status(502).json({ error: invoice.message || 'Gagal membuat invoice Xendit' });
    }

    // Simpan id invoice Xendit di baris yang sama untuk ketertelusuran --
    // bukan kunci idempotensi (external_id/purchase.id itu yang dipakai
    // webhook), cuma memudahkan debugging lewat dashboard Xendit.
    await fetch(`${SUPABASE_URL}/rest/v1/token_purchases?id=eq.${purchase.id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ xendit_invoice_id: invoice.id }),
    }).catch(() => {});

    return res.status(200).json({ checkout_url: invoice.invoice_url });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Terjadi kesalahan' });
  }
};
