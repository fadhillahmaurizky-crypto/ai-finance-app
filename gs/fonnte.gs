// ================================
// Wangku — Google Apps Script
// Versi: Supabase Edition
// ================================

const SB_URL = 'https://mchuhgihywnyamurbetz.supabase.co';
const APP_URL = 'https://ai-finance-app-murex.vercel.app/app';

// SB_KEY (anon key) dulu dipakai di sini -- sejak migrasi RLS, setiap tabel
// mewajibkan is_owner_or_admin(user_id), yang butuh JWT ber-klaim user_id
// asli. Permintaan pakai anon key polos tidak memenuhi itu untuk baris
// manapun, jadi getUserIdByWA()/saveTrxToSupabase() dkk selalu gagal diam-
// diam. Diganti service role key (bypass RLS by design, sama seperti
// /api/ai-chat.js & /api/ai-scan.js) -- disimpan di Script Property, BUKAN
// di-hardcode sebagai konstanta seperti SB_KEY dulu. Set sekali lewat
// Project Settings -> Script Properties: SUPABASE_SERVICE_ROLE_KEY.
function getServiceRoleKey() {
  const key = PropertiesService.getScriptProperties().getProperty('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY belum diset di Script Properties');
  return key;
}

// =========================
// GET — OTP & Webhook Test
// =========================

function doGet(e) {
  if (!e || !e.parameter || !e.parameter.action) {
    return ContentService.createTextOutput('Wangku Webhook Aktif ✅');
  }

  const action = e.parameter.action;

  try {
    if (action === 'sendOTP') {
      return ContentService
        .createTextOutput(JSON.stringify(sendOTPLogin(e.parameter)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (action === 'notifyAdmin') {
      const msg = decodeURIComponent(e.parameter.msg || '');
      kirimWhatsApp('6285727318698', msg);
      return ContentService
        .createTextOutput(JSON.stringify({status:'ok'}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Action tidak dikenal' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// =========================
// POST — WhatsApp Webhook
// =========================

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    if (!e.postData || !e.postData.contents) {
      return ContentService.createTextOutput('No data');
    }

    const data = JSON.parse(e.postData.contents);

    // Abaikan pesan bot
    const rawPesan = data.message || data.text || '';
    if (rawPesan.includes('Sent via fonnte.com')) {
      return ContentService.createTextOutput('Bot diabaikan');
    }

    const pengirim = data.sender || '';
    if (!pengirim) return ContentService.createTextOutput('No sender');

    // Abaikan grup & status
    if (pengirim.includes('@g.us') || pengirim.includes('status')) {
      return ContentService.createTextOutput('Group/status diabaikan');
    }

    if (!rawPesan) return ContentService.createTextOutput('Pesan kosong');

    const waNumber = pengirim.replace(/\D/g, '');
    const pesanLower = rawPesan.toLowerCase().trim();

    // =========================
    // Command: laporan / saldo
    // =========================
    if (pesanLower === 'laporan' || pesanLower === 'saldo') {
      const laporan = getLaporanSupabase(waNumber);
      kirimWhatsApp(pengirim, laporan);
      return ContentService.createTextOutput('Laporan dikirim');
    }

    // =========================
    // Command: analisa
    // =========================
    if (pesanLower === 'analisa' || pesanLower === 'analisa bulan ini') {
      const analisa = getAnalisaSupabase(waNumber);
      kirimWhatsApp(pengirim, analisa);
      return ContentService.createTextOutput('Analisa dikirim');
    }

    // =========================
    // Catat Transaksi
    // =========================

    // Cek user di Supabase
    const userId = getUserIdByWA(waNumber);
    if (!userId) {
      kirimWhatsApp(pengirim,
        '❌ Nomor kamu belum terdaftar di Wangku.\n\n' +
        'Daftar dulu di:\n' + APP_URL
      );
      return ContentService.createTextOutput('User tidak ditemukan');
    }

    // Ambil akun & kategori user SEKALI per pesan masuk (bukan per baris) --
    // dipakai untuk cocokkan nama akun/kategori di tiap baris, dan sebagai
    // fallback akun default kalau tidak ada nama akun yang disebut.
    const accounts = getAccountsSupabase(userId);
    const categories = getCategoriesSupabase(userId);
    const defaultAccount = accounts.find(a => a.is_default) || accounts[0] || null;

    // Split multiline
    const daftarPesan = rawPesan.split('\n').map(s => s.trim()).filter(s => s !== '');
    const balasan = [];

    for (const pesan of daftarPesan) {
      if (!/\d/.test(pesan)) continue;

      const nominalInfo = extractNominal(pesan);
      if (nominalInfo.value < 100) continue;

      // Cari nama akun yang disebut di baris ini (whole-word, case-insensitive,
      // yang paling panjang/spesifik menang kalau ada beberapa cocok) --
      // fallback ke akun default kalau tidak ada yang cocok sama sekali.
      const accountMatch = matchFromText(pesan, accounts);
      const accountId = accountMatch ? accountMatch.id : (defaultAccount ? defaultAccount.id : null);

      // Buang bagian nominal & nama akun dari teks SEBELUM deteksi kategori,
      // supaya nama akun yang kebetulan mirip nama kategori (mis. akun
      // "Belanja") tidak salah memicu kategori itu hanya karena disebut
      // sebagai akun, bukan konteks belanja yang sebenarnya.
      let textUntukKategori = pesan;
      if (nominalInfo.matched) textUntukKategori = removeFirstOccurrence(textUntukKategori, nominalInfo.matched);
      if (accountMatch) textUntukKategori = removeFirstOccurrence(textUntukKategori, accountMatch.nama);

      const ai = analisaDenganAI(textUntukKategori, categories);
      const keterangan = buildKeterangan(textUntukKategori, ai.kategori);

      // Simpan ke Supabase
      const ok = saveTrxToSupabase(userId, {
        jenis: ai.jenis,
        nominal: nominalInfo.value,
        kategori: ai.kategori,
        keterangan: keterangan,
        prioritas: ai.prioritas,
        tanggal: new Date().toISOString().substring(0, 10),
        account_id: accountId
      });

      if (ok) {
        const saldo = getSaldoSupabase(userId);
        balasan.push(
          '✅ ' + ai.jenis.toUpperCase() + '\n' +
          '🏷️ ' + ai.kategori + '\n' +
          (accountMatch ? '🏦 ' + accountMatch.nama + '\n' : '') +
          '📝 ' + keterangan + '\n' +
          '🧠 ' + ai.prioritas.toUpperCase() + '\n\n' +
          '💰 Rp' + nominalInfo.value.toLocaleString('id-ID') + '\n\n' +
          '🏦 Saldo Sekarang:\n' +
          'Rp' + saldo.toLocaleString('id-ID')
        );
      }
    }

    if (balasan.length > 0) {
      kirimWhatsApp(pengirim, balasan.join('\n\n---\n\n'));
    }

    return ContentService.createTextOutput('OK');

  } catch(err) {
    Logger.log('doPost error: ' + err.toString());
    return ContentService.createTextOutput(err.toString());
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

// =========================
// SUPABASE HELPERS
// =========================

function sbGet(path) {
  const key = getServiceRoleKey();
  const res = UrlFetchApp.fetch(SB_URL + '/rest/v1/' + path, {
    method: 'get',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

function sbPost(path, body) {
  const key = getServiceRoleKey();
  const res = UrlFetchApp.fetch(SB_URL + '/rest/v1/' + path, {
    method: 'post',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

// Cari user_id (UUID) berdasarkan nomor WA
function getUserIdByWA(waNumber) {
  const waFull = waNumber.startsWith('62') ? waNumber : '62' + (waNumber.startsWith('0') ? waNumber.substring(1) : waNumber);
  const res = sbGet('users?wa_number=eq.' + waFull + '&status=eq.active&select=id');
  if (res && res.length > 0) return res[0].id;
  return null;
}

// Akun user ini (id, nama, is_default) -- dipakai untuk pencocokan nama akun
// di teks pesan, dan sebagai sumber akun default (account_id) fallback.
function getAccountsSupabase(userId) {
  const res = sbGet('accounts?user_id=eq.' + userId + '&select=id,nama,is_default');
  return res || [];
}

// Kategori nyata milik user (default + custom) -- dipakai untuk mencocokkan
// kategori transaksi dari teks pesan, bukan daftar kata kunci statis yang
// bisa basi kalau vocabulary default app berubah lagi di masa depan.
function getCategoriesSupabase(userId) {
  const res = sbGet('user_categories?user_id=eq.' + userId + '&select=nama,jenis');
  return res || [];
}

// Simpan transaksi ke Supabase
function saveTrxToSupabase(userId, trx) {
  try {
    sbPost('transactions', {
      user_id: userId,
      jenis: trx.jenis,
      nominal: trx.nominal,
      kategori: trx.kategori,
      keterangan: trx.keterangan,
      prioritas: trx.prioritas,
      tanggal: trx.tanggal,
      account_id: trx.account_id
    });
    return true;
  } catch(e) {
    Logger.log('saveTrx error: ' + e);
    return false;
  }
}

// Saldo Sekarang, ALL-TIME -- sama persis modelnya dengan app (lihat
// docs/database.md): Σ(account.saldo_awal) + seluruh riwayat pemasukan −
// seluruh riwayat pengeluaran, transfer antar-akun sendiri dikecualikan
// (tidak menambah/mengurangi kekayaan total, cuma pindah antar akun sendiri).
// Sebelumnya cuma menjumlah transaksi BULAN INI -- user bisa dapat angka
// "saldo" berbeda dari bot vs dari app untuk akun yang sama.
function getSaldoSupabase(userId) {
  const akun = sbGet('accounts?user_id=eq.' + userId + '&select=saldo_awal');
  const saldoAwal = (akun || []).reduce((sum, a) => sum + Number(a.saldo_awal || 0), 0);

  const trx = sbGet('transactions?user_id=eq.' + userId + '&select=jenis,nominal');
  let arus = 0;
  (trx || []).forEach(function(t) {
    if (t.jenis === 'pemasukan') arus += Number(t.nominal);
    else if (t.jenis === 'pengeluaran') arus -= Number(t.nominal);
    // jenis === 'transfer': sengaja diabaikan, lihat komentar di atas
  });
  return saldoAwal + arus;
}

// Laporan: Saldo Sekarang (all-time, sama seperti getSaldoSupabase) +
// ringkasan pemasukan/pengeluaran BULAN INI sebagai info terpisah --
// jangan disebut "Saldo" karena angka itu cuma pemasukan-dikurangi-
// pengeluaran sebulan, bukan Saldo Sekarang yang sesungguhnya all-time.
function getLaporanSupabase(waNumber) {
  const userId = getUserIdByWA(waNumber);
  if (!userId) return '❌ Nomor tidak terdaftar. Daftar di: ' + APP_URL;

  const saldoSekarang = getSaldoSupabase(userId);

  const month = new Date().toISOString().substring(0, 7);
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  const nextMonth = d.toISOString().substring(0, 7);

  const res = sbGet(
    'transactions?user_id=eq.' + userId +
    '&tanggal=gte.' + month + '-01' +
    '&tanggal=lt.' + nextMonth + '-01' +
    '&select=jenis,nominal,kategori'
  );

  let masuk = 0, keluar = 0;
  (res || []).forEach(function(t) {
    if (t.jenis === 'pemasukan') masuk += Number(t.nominal);
    else if (t.jenis === 'pengeluaran') keluar += Number(t.nominal);
  });

  return '📊 *LAPORAN*\n\n' +
    '🏦 Saldo Sekarang\nRp' + saldoSekarang.toLocaleString('id-ID') + '\n\n' +
    '📅 Bulan Ini\n' +
    '💰 Pemasukan: Rp' + masuk.toLocaleString('id-ID') + '\n' +
    '💸 Pengeluaran: Rp' + keluar.toLocaleString('id-ID') + '\n\n' +
    '📱 Detail: ' + APP_URL;
}

// Analisa kategori dari Supabase (bulan ini, pengeluaran saja -- ini memang
// selalu dimaksudkan sebagai ringkasan bulanan, bukan angka Saldo, jadi
// tidak kena catatan all-time di atas)
function getAnalisaSupabase(waNumber) {
  const userId = getUserIdByWA(waNumber);
  if (!userId) return '❌ Nomor tidak terdaftar. Daftar di: ' + APP_URL;

  const month = new Date().toISOString().substring(0, 7);
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  const nextMonth = d.toISOString().substring(0, 7);

  const res = sbGet(
    'transactions?user_id=eq.' + userId +
    '&tanggal=gte.' + month + '-01' +
    '&tanggal=lt.' + nextMonth + '-01' +
    '&jenis=eq.pengeluaran' +
    '&select=nominal,kategori'
  );

  const katMap = {};
  let total = 0;
  (res || []).forEach(function(t) {
    const n = Number(t.nominal);
    total += n;
    katMap[t.kategori] = (katMap[t.kategori] || 0) + n;
  });

  const sorted = Object.entries(katMap).sort((a, b) => b[1] - a[1]);
  const katLines = sorted.slice(0, 5).map(function(e) {
    const pct = total > 0 ? ((e[1]/total)*100).toFixed(0) : 0;
    return '• ' + e[0] + ': Rp' + e[1].toLocaleString('id-ID') + ' (' + pct + '%)';
  }).join('\n');

  return '📊 *ANALISA BULAN INI*\n\n' +
    '💸 Total Pengeluaran\nRp' + total.toLocaleString('id-ID') + '\n\n' +
    '🏆 Kategori Terbesar:\n' + (katLines || 'Belum ada data') + '\n\n' +
    '📱 Detail lengkap: ' + APP_URL;
}

// =========================
// PARSE NOMINAL
// =========================

// Mengembalikan {value, matched} -- matched dipakai pemanggil untuk membuang
// bagian nominal dari teks saat membangun keterangan/mendeteksi kategori.
// Sekarang juga mengerti singkatan "k" (mis. "50k"), selain rb/ribu/jt/juta
// yang sudah ada.
function extractNominal(text) {
  const lower = text.toLowerCase();
  const re = /\d+([.,]\d+)?\s*(jt|juta|rb|ribu|k)?/i;
  const m = lower.match(re);
  if (!m) return { value: 0, matched: '' };

  const angka = parseFloat(m[0].replace(/[^\d.,]/g, '').replace(',', '.'));
  const suffix = (m[2] || '').toLowerCase();
  let value = angka;
  if (suffix === 'jt' || suffix === 'juta') value = angka * 1000000;
  else if (suffix === 'rb' || suffix === 'ribu' || suffix === 'k') value = angka * 1000;

  return { value: Math.round(value), matched: m[0] };
}

// Dipertahankan untuk kompatibilitas kalau ada kode lain yang masih
// memanggil parseNominal(text) langsung dan cuma butuh angkanya.
function parseNominal(text) {
  return extractNominal(text).value;
}

// =========================
// PENCOCOKAN AKUN & KATEGORI
// =========================

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Cari item (akun ATAU kategori -- keduanya punya field .nama) yang namanya
// muncul sebagai WHOLE WORD di teks, case-insensitive. Kalau lebih dari satu
// yang cocok, menangkan yang namanya paling panjang/spesifik.
function matchFromText(text, items) {
  const lower = text.toLowerCase();
  let best = null;
  for (const item of items) {
    const nama = (item.nama || '').toLowerCase();
    if (!nama) continue;
    const re = new RegExp('\\b' + escapeRegex(nama) + '\\b', 'i');
    if (re.test(lower)) {
      if (!best || nama.length > (best.nama || '').length) best = item;
    }
  }
  return best;
}

// Hapus SATU kemunculan pertama sebuah substring dari teks, case-insensitive
// dalam pencarian tapi mempertahankan huruf besar/kecil asli di sisa teks.
function removeFirstOccurrence(text, needle) {
  if (!needle) return text;
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return text;
  return text.slice(0, idx) + text.slice(idx + needle.length);
}

// Bangun keterangan bersih dari teks yang nominal & nama akunnya sudah
// dibuang oleh pemanggil -- tinggal rapikan sisa tanda baca/spasi. Kalau
// hasilnya kosong (mis. pesan cuma "10rb BCA" tanpa deskripsi apa pun),
// pakai nama kategori yang sudah ketebak, dikapitalkan, sebagai fallback.
function buildKeterangan(textTanpaNominalDanAkun, kategoriNama) {
  const sisa = textTanpaNominalDanAkun.replace(/[-,.:;]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (sisa) return sisa;
  if (kategoriNama) return kategoriNama.charAt(0).toUpperCase() + kategoriNama.slice(1);
  return 'Transaksi';
}

// =========================
// KLASIFIKASI JENIS & KATEGORI
// =========================

const KATA_PEMASUKAN = ['gaji','dapat','dapet','bonus','jualan','transfer masuk','terima'];

// Heuristik fallback: kata kunci umum -> nama kategori DEFAULT yang BENERAN
// dipakai app sekarang (makan/belanja/elektronik/pulsa/paket_data), dipakai
// hanya kalau tidak ada nama kategori asli milik user yang cocok langsung
// di teks (lihat matchFromText). Sebelumnya vocabulary di sini
// (makanan/transportasi/hiburan/tagihan) sudah lama tidak match kategori
// mana pun yang benar-benar ada di app, jadi transaksi dari WhatsApp
// membuat kategori duplikat/terpisah dari yang dipakai lewat app.
const HEURISTIK_PENGELUARAN = [
  { kata: ['makan','kopi','minum','batagor','sarapan','jajan','warung'], kategori: 'makan' },
  { kata: ['belanja','shopee','tokopedia','beli baju','beli'], kategori: 'belanja' },
  { kata: ['elektronik','gadget','charger','kabel data'], kategori: 'elektronik' },
  { kata: ['pulsa'], kategori: 'pulsa' },
  { kata: ['paket data','kuota','internet','wifi'], kategori: 'paket_data' }
];

function isTidakPenting(lower) {
  return ['netflix','spotify','hiburan','bioskop','game','judi'].some(k => lower.includes(k));
}

// categories: hasil getCategoriesSupabase(userId) -- [{nama, jenis}, ...]
function analisaDenganAI(pesan, categories) {
  const lower = pesan.toLowerCase();

  // "buat/bayar arisan" tetap dianggap pengeluaran walau kalimatnya
  // mengandung kata yang biasanya menandakan pemasukan ("dapat duit buat
  // arisan") -- ini memang uang keluar (setoran), bukan uang masuk.
  const isArisanSetoran = lower.includes('buat arisan') || lower.includes('bayar arisan');
  const isPemasukan = !isArisanSetoran && KATA_PEMASUKAN.some(k => lower.includes(k));
  const jenisTarget = isPemasukan ? 'pemasukan' : 'pengeluaran';

  // Layer 1 (terbaik): kategori NYATA milik user (default maupun custom)
  // yang namanya muncul sebagai whole word di teks.
  const kandidat = categories.filter(c => c.jenis === jenisTarget);
  const match = matchFromText(pesan, kandidat);
  if (match) {
    return { jenis: jenisTarget, kategori: match.nama, prioritas: jenisTarget === 'pemasukan' ? 'penting' : (isTidakPenting(lower) ? 'tidak_penting' : 'penting') };
  }

  // Layer 2 (fallback heuristik): kata kunci sinonim umum -> nama kategori
  // default, tapi HANYA dipakai kalau kategori itu beneran ada di daftar
  // milik user (harusnya selalu ada untuk kategori default yang di-seed).
  if (jenisTarget === 'pengeluaran') {
    for (const h of HEURISTIK_PENGELUARAN) {
      if (h.kata.some(k => lower.includes(k))) {
        const ada = categories.find(c => c.jenis === 'pengeluaran' && (c.nama || '').toLowerCase() === h.kategori);
        if (ada) return { jenis: 'pengeluaran', kategori: ada.nama, prioritas: isTidakPenting(lower) ? 'tidak_penting' : 'penting' };
      }
    }
  } else {
    const gaji = categories.find(c => c.jenis === 'pemasukan' && (c.nama || '').toLowerCase() === 'gaji');
    if (lower.includes('gaji') && gaji) return { jenis: 'pemasukan', kategori: gaji.nama, prioritas: 'penting' };
    const bonus = categories.find(c => c.jenis === 'pemasukan' && (c.nama || '').toLowerCase() === 'bonus');
    if (lower.includes('bonus') && bonus) return { jenis: 'pemasukan', kategori: bonus.nama, prioritas: 'penting' };
  }

  // Layer 3 (fallback terakhir): kategori pertama milik user untuk jenis
  // ini (harusnya selalu ada, kategori default di-seed otomatis), atau
  // 'lainnya' kalau entah bagaimana user tidak punya kategori sama sekali.
  const fallback = categories.find(c => c.jenis === jenisTarget);
  return {
    jenis: jenisTarget,
    kategori: fallback ? fallback.nama : 'lainnya',
    prioritas: jenisTarget === 'pemasukan' ? 'penting' : (isTidakPenting(lower) ? 'tidak_penting' : 'penting')
  };
}

// =========================
// KIRIM WHATSAPP
// =========================

function kirimWhatsApp(nomor, pesan) {
  const token = PropertiesService.getScriptProperties().getProperty('FONNTE_TOKEN');
  if (!token) throw new Error('FONNTE_TOKEN belum diset di Script Properties');

  UrlFetchApp.fetch('https://api.fonnte.com/send', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: token },
    payload: JSON.stringify({
      target: nomor,
      message: pesan,
      countryCode: '62'
    }),
    muteHttpExceptions: true
  });
}

// =========================
// KIRIM OTP
// =========================

function sendOTPLogin(params) {
  const wa = params.wa || '';
  const otp = params.otp || '';
  const nama = params.nama || 'Pengguna';

  if (!wa || !otp) return { error: 'Parameter tidak lengkap' };

  let nomorWA = wa.replace(/\D/g, '');
  if (!nomorWA.startsWith('62')) nomorWA = '62' + nomorWA;

  const pesan =
    'Halo ' + nama + '! 👋\n\n' +
    'Kode OTP Wangku kamu:\n\n' +
    '*' + otp + '*\n\n' +
    'Masukkan kode ini di aplikasi.\n' +
    'Berlaku 5 menit ya!\n\n' +
    'Jangan kasih ke siapapun 🔒\n' +
    '_Wangku — AI Finance Tracker_';

  try {
    kirimWhatsApp(nomorWA, pesan);
    return { status: 'ok', message: 'OTP terkirim ke ' + nomorWA };
  } catch(err) {
    Logger.log('sendOTP error: ' + err.toString());
    return { error: err.message };
  }
}
