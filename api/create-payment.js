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
const PACKAGES = {
  '2jt': { tokens: 2000000, amount: 35000, label: '2 Juta Token AI' },
  '5jt': { tokens: 5000000, amount: 59000, label: '5 Juta Token AI' },
};

// Panggil Xendit Invoice API -- dipakai baik untuk pembelian baru maupun
// resume (baris token_purchases yang sama, invoice baru karena yang lama
// sudah kedaluwarsa di sisi Xendit). external_id SELALU purchase.id --
// Xendit tidak mewajibkan external_id unik antar invoice, jadi aman
// dipakai ulang untuk invoice kedua/ketiga pada baris yang sama.
async function createXenditInvoice({ purchaseId, amount, label, email, resume }) {
  const res = await fetch('https://api.xendit.co/v2/invoices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(XENDIT_SECRET_KEY + ':').toString('base64'),
    },
    body: JSON.stringify({
      external_id: purchaseId,
      amount,
      payer_email: email || undefined,
      description: `${label} - Wangku`,
      success_redirect_url: `${APP_URL}/app?xendit_return=success${resume ? '&resume=1' : ''}`,
      failure_redirect_url: `${APP_URL}/app?xendit_return=failed${resume ? '&resume=1' : ''}`,
    }),
  });
  const invoice = await res.json();
  return { ok: res.ok && !!invoice.invoice_url, invoice };
}

// Lanjutkan pembayaran 'pending' yang ditinggalkan -- lihat
// wangku-fixes-pr25-26-27.md #2b. Sengaja HANYA untuk baris yang masih
// 'pending' di DB kita: kalau webhook EXPIRED sudah keburu datang dan
// baris ini sudah 'expired', itu bukan lagi kasus resume -- user tinggal
// mulai pembelian baru lewat buyTokenPackage()/buyPlanRenewal() biasa,
// sama seperti keputusan di spec payment-history awal ("no special
// resume flow needed" untuk itu). Dicek dulu status invoice yang SEBENARNYA
// di sisi Xendit (bukan cuma percaya baris kita) -- kalau masih PENDING di
// sana, checkout_url lama dipakai lagi (tidak perlu invoice baru); kalau
// sudah EXPIRED di Xendit tapi baris kita belum sempat di-update webhook
// (race, jarang tapi mungkin), invoice baru dibuat untuk baris yang SAMA.
async function handleResume(req, res, purchaseId, userId) {
  const rowRes = await fetch(
    `${SUPABASE_URL}/rest/v1/token_purchases?id=eq.${encodeURIComponent(purchaseId)}&select=*`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const rows = await rowRes.json();
  const purchase = Array.isArray(rows) ? rows[0] : null;
  if (!purchase) return res.status(404).json({ error: 'Pembelian tidak ditemukan' });
  if (userId && purchase.user_id !== userId) return res.status(403).json({ error: 'Bukan pembelian milik user ini' });
  if (purchase.status !== 'pending') {
    return res.status(400).json({ error: 'Pembelian ini sudah tidak bisa dilanjutkan (status: ' + purchase.status + ')' });
  }

  if (purchase.xendit_invoice_id) {
    const xRes = await fetch(`https://api.xendit.co/v2/invoices/${purchase.xendit_invoice_id}`, {
      headers: { Authorization: 'Basic ' + Buffer.from(XENDIT_SECRET_KEY + ':').toString('base64') },
    });
    if (xRes.ok) {
      const xInvoice = await xRes.json();
      if (xInvoice.status === 'PENDING' && xInvoice.invoice_url) {
        return res.status(200).json({ checkout_url: xInvoice.invoice_url });
      }
      if (xInvoice.status === 'PAID') {
        return res.status(409).json({ error: 'Pembayaran ini sudah berhasil diproses, coba muat ulang halaman' });
      }
      // xInvoice.status === 'EXPIRED' (atau lainnya) -- lanjut buat invoice baru di bawah.
    }
  }

  const userRes = await fetch(
    `${SUPABASE_URL}/rest/v1/users?id=eq.${purchase.user_id}&select=email`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const userRows = await userRes.json();
  const email = userRows?.[0]?.email;
  const label = purchase.item_type === 'plan'
    ? `Perpanjangan Paket ${purchase.plan === 'pro' ? 'Pro' : 'Basic'} (30 Hari)`
    : `${(purchase.tokens / 1000000).toFixed(purchase.tokens % 1000000 ? 1 : 0)} Juta Token AI`;

  const { ok, invoice } = await createXenditInvoice({ purchaseId: purchase.id, amount: purchase.amount, label, email, resume: true });
  if (!ok) return res.status(502).json({ error: invoice.message || 'Gagal membuat invoice Xendit' });

  await fetch(`${SUPABASE_URL}/rest/v1/token_purchases?id=eq.${purchase.id}`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ xendit_invoice_id: invoice.id }),
  }).catch(() => {});

  return res.status(200).json({ checkout_url: invoice.invoice_url });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!XENDIT_SECRET_KEY) return res.status(500).json({ error: 'Server belum dikonfigurasi (XENDIT_SECRET_KEY_TEST kosong)' });
    if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY kosong)' });

    const { user_id, package: packageId, resume_purchase_id } = req.body || {};
    if (resume_purchase_id) return await handleResume(req, res, resume_purchase_id, user_id);

    const pkg = PACKAGES[packageId];
    if (!user_id || !pkg) return res.status(400).json({ error: 'user_id dan package (2jt/5jt) wajib diisi' });

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
      body: JSON.stringify({ user_id: u.id, tokens: pkg.tokens, amount: pkg.amount, status: 'pending' }),
    });
    if (!insertRes.ok) return res.status(500).json({ error: 'Gagal membuat catatan pembelian' });
    const [purchase] = await insertRes.json();

    const { ok, invoice } = await createXenditInvoice({ purchaseId: purchase.id, amount: pkg.amount, label: pkg.label, email: u.email });
    if (!ok) {
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
