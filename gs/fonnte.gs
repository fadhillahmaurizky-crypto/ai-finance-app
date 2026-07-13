// ================================
// Wangku — Google Apps Script
// Versi: Supabase Edition
// ================================

const SB_URL = 'https://mchuhgihywnyamurbetz.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHVoZ2loeXdueWFtdXJiZXR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTIyNDIsImV4cCI6MjA5NzcyODI0Mn0.z1ildAJY--ErFoom2d7GIF1TCr3fmaBkCWtwGz4QstI';
const APP_URL = 'https://ai-finance-app-murex.vercel.app/app';

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

    // Split multiline
    const daftarPesan = rawPesan.split('\n').map(s => s.trim()).filter(s => s !== '');
    const balasan = [];

    for (const pesan of daftarPesan) {
      if (!/\d/.test(pesan)) continue;

      const nominal = parseNominal(pesan);
      if (nominal < 100) continue;

      const ai = analisaDenganAI(pesan);

      // Simpan ke Supabase
      const ok = saveTrxToSupabase(userId, {
        jenis: ai.jenis,
        nominal: nominal,
        kategori: ai.kategori,
        keterangan: pesan,
        prioritas: ai.prioritas,
        tanggal: new Date().toISOString().substring(0, 10)
      });

      if (ok) {
        const saldo = getSaldoSupabase(userId);
        balasan.push(
          '✅ ' + ai.jenis.toUpperCase() + '\n' +
          '🏷️ ' + ai.kategori + '\n' +
          '🧠 ' + ai.prioritas.toUpperCase() + '\n\n' +
          '💰 Rp' + nominal.toLocaleString('id-ID') + '\n\n' +
          '🏦 Saldo Bulan Ini:\n' +
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
  const res = UrlFetchApp.fetch(SB_URL + '/rest/v1/' + path, {
    method: 'get',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText());
}

function sbPost(path, body) {
  const res = UrlFetchApp.fetch(SB_URL + '/rest/v1/' + path, {
    method: 'post',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
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
      tanggal: trx.tanggal
    });
    return true;
  } catch(e) {
    Logger.log('saveTrx error: ' + e);
    return false;
  }
}

// Hitung saldo bulan ini dari Supabase
function getSaldoSupabase(userId) {
  const month = new Date().toISOString().substring(0, 7);
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  const nextMonth = d.toISOString().substring(0, 7);

  const res = sbGet(
    'transactions?user_id=eq.' + userId +
    '&tanggal=gte.' + month + '-01' +
    '&tanggal=lt.' + nextMonth + '-01' +
    '&select=jenis,nominal'
  );

  let saldo = 0;
  (res || []).forEach(function(t) {
    saldo += t.jenis === 'pemasukan' ? Number(t.nominal) : -Number(t.nominal);
  });
  return saldo;
}

// Laporan bulan ini dari Supabase
function getLaporanSupabase(waNumber) {
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
    '&select=jenis,nominal,kategori'
  );

  let masuk = 0, keluar = 0;
  (res || []).forEach(function(t) {
    if (t.jenis === 'pemasukan') masuk += Number(t.nominal);
    else keluar += Number(t.nominal);
  });
  const saldo = masuk - keluar;

  return '📊 *LAPORAN BULAN INI*\n\n' +
    '💰 Pemasukan\nRp' + masuk.toLocaleString('id-ID') + '\n\n' +
    '💸 Pengeluaran\nRp' + keluar.toLocaleString('id-ID') + '\n\n' +
    '🏦 Saldo\nRp' + saldo.toLocaleString('id-ID') + '\n\n' +
    '📱 Detail: ' + APP_URL;
}

// Analisa kategori dari Supabase
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

function parseNominal(text) {
  text = text.toLowerCase();
  let nominal = 0;

  if (text.includes('jt') || text.includes('juta')) {
    const match = text.match(/\d+([.,]\d+)?/);
    if (!match) return 0;
    nominal = parseFloat(match[0].replace(',', '.')) * 1000000;
  } else if (text.includes('rb') || text.includes('ribu')) {
    const match = text.match(/\d+([.,]\d+)?/);
    if (!match) return 0;
    nominal = parseFloat(match[0].replace(',', '.')) * 1000;
  } else {
    const angka = text.replace(/[^\d]/g, '');
    nominal = angka ? parseInt(angka) : 0;
  }

  return nominal;
}

// =========================
// AI CLASSIFIER
// =========================

function analisaDenganAI(pesan) {
  const lower = pesan.toLowerCase();

  // Pemasukan
  if (lower.includes('gaji') || lower.includes('dapat') || lower.includes('dapet') ||
      lower.includes('bonus') || lower.includes('jualan') || lower.includes('transfer masuk') ||
      lower.includes('terima')) {

    if (lower.includes('buat arisan') || lower.includes('bayar arisan')) {
      return { jenis: 'pengeluaran', kategori: 'arisan', prioritas: 'penting' };
    }

    return {
      jenis: 'pemasukan',
      kategori: lower.includes('gaji') ? 'gaji' : lower.includes('jualan') ? 'jualan' :
                lower.includes('bonus') ? 'bonus' : lower.includes('arisan') ? 'arisan' : 'lainnya',
      prioritas: 'penting'
    };
  }

  // Pengeluaran
  const kategori =
    lower.includes('makan') || lower.includes('kopi') || lower.includes('minum') || lower.includes('batagor') ? 'makanan' :
    lower.includes('gojek') || lower.includes('grab') || lower.includes('bensin') || lower.includes('parkir') ? 'transportasi' :
    lower.includes('netflix') || lower.includes('spotify') || lower.includes('bioskop') ? 'hiburan' :
    lower.includes('listrik') || lower.includes('air') || lower.includes('internet') || lower.includes('pulsa') ? 'tagihan' :
    lower.includes('belanja') || lower.includes('shopee') || lower.includes('tokopedia') ? 'belanja' :
    lower.includes('arisan') ? 'arisan' : 'lainnya';

  const tidakPenting = ['netflix','spotify','hiburan','bioskop'].some(k => lower.includes(k));

  return {
    jenis: 'pengeluaran',
    kategori: kategori,
    prioritas: tidakPenting ? 'tidak_penting' : 'penting'
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