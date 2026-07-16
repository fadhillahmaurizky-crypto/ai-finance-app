// /api/xendit-webhook.js
// Vercel serverless function — receives Xendit's invoice-paid callback.
// This is the SOURCE OF TRUTH for granting tokens, not the client returning
// from checkout (that redirect can be skipped, retried, or forged by
// anyone who guesses the URL). XENDIT_WEBHOOK_VERIFICATION_TOKEN_TEST never
// reaches the client. Set both it and XENDIT_SECRET_KEY_TEST as Vercel
// environment variables (Project Settings -> Environment Variables), NOT in
// this file.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mchuhgihywnyamurbetz.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const XENDIT_WEBHOOK_TOKEN = process.env.XENDIT_WEBHOOK_VERIFICATION_TOKEN_TEST;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Server belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY kosong)' });
    if (!XENDIT_WEBHOOK_TOKEN) return res.status(500).json({ error: 'Server belum dikonfigurasi (XENDIT_WEBHOOK_VERIFICATION_TOKEN_TEST kosong)' });

    // Xendit mengirim token verifikasi di header x-callback-token, HARUS
    // dicocokkan dulu sebelum payload dipercaya sama sekali -- ini yang
    // membuktikan callback ini benar-benar dari Xendit, bukan orang lain
    // yang menebak URL endpoint ini dan mengirim payload PAID palsu untuk
    // menggratiskan token.
    const receivedToken = req.headers['x-callback-token'];
    if (!receivedToken || receivedToken !== XENDIT_WEBHOOK_TOKEN) {
      return res.status(401).json({ error: 'Token verifikasi tidak valid' });
    }

    const { external_id, status, payment_channel, payment_method } = req.body || {};
    if (!external_id) return res.status(400).json({ error: 'external_id kosong' });
    // payment_channel = channel spesifik (mis. "BCA", "GOPAY"), lebih
    // berguna ditampilkan ke user daripada payment_method (kategori umum,
    // mis. "BANK_TRANSFER") -- dipakai sebagai fallback kalau
    // payment_channel tidak ada di payload untuk metode tertentu.
    const paidChannel = payment_channel || payment_method || null;

    // EXPIRED: invoice Xendit kedaluwarsa otomatis kalau tidak dibayar
    // dalam window waktu tertentu -- ini yang bikin baris 'pending' tidak
    // nyangkut selamanya di Riwayat Pembayaran kalau user membatalkan/
    // meninggalkan checkout. Sama seperti PAID, WHERE status='pending' di
    // sini yang menjaga idempotensi (delivery kedua mengenai nol baris).
    if (status === 'EXPIRED') {
      await fetch(
        `${SUPABASE_URL}/rest/v1/token_purchases?id=eq.${encodeURIComponent(external_id)}&status=eq.pending`,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'expired' }),
        }
      );
      return res.status(200).json({ ok: true });
    }

    // Selain PAID/EXPIRED (mis. PENDING) sengaja diabaikan -- tidak ada
    // token yang perlu digrant maupun status yang perlu diupdate, cukup
    // 200 supaya Xendit tidak retry terus.
    if (status !== 'PAID') return res.status(200).json({ ok: true, ignored: status });

    // Idempotensi: UPDATE ini hanya mengenai baris yang MASIH 'pending'.
    // Kalau delivery webhook yang sama datang dua kali (Xendit memang bisa
    // retry), percobaan kedua akan mengenai nol baris di sini -- karena
    // baris itu sudah 'paid' dari percobaan pertama -- dan token TIDAK
    // digrant dua kali. Tidak butuh locking terpisah, WHERE ini sendiri
    // yang jadi penjaganya.
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/token_purchases?id=eq.${encodeURIComponent(external_id)}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString(), payment_channel: paidChannel }),
      }
    );
    const updated = await updateRes.json();
    const purchase = Array.isArray(updated) ? updated[0] : null;
    if (!purchase) {
      // Baris tidak ada sama sekali, atau sudah 'paid' dari delivery
      // sebelumnya -- keduanya sama-sama "tidak ada yang perlu dilakukan
      // lagi", bukan error, supaya Xendit tidak retry sia-sia.
      return res.status(200).json({ ok: true, already_processed: true });
    }

    // ADDITIF, bukan replace: tokens_limit user ditambah sejumlah token
    // yang dibeli, tokens_used TIDAK disentuh -- "Beli Token Tambahan" di
    // Settings menjanjikan penambahan, dan itu yang harus benar-benar
    // terjadi. Sengaja BEDA dari admin.html setUserTokens() (yang me-SET
    // tokens_limit ke nilai paket dan reset tokens_used ke 0) -- grant
    // manual admin itu tindakan override/koreksi yang disengaja, beda
    // konteks dari top-up self-service ini. Ditemukan lewat pengetesan
    // pembelian sungguhan: token yang sudah ada malah tertimpa ke nilai
    // paket alih-alih bertambah -- PATCH langsung tanpa baca tokens_limit
    // saat ini dulu tidak mungkin additif, makanya perlu GET dulu di sini.
    const userRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${purchase.user_id}&select=tokens_limit`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    const userRows = await userRes.json();
    const currentLimit = Number(userRows?.[0]?.tokens_limit) || 0;

    await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${purchase.user_id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tokens_limit: currentLimit + purchase.tokens }),
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Terjadi kesalahan' });
  }
};
