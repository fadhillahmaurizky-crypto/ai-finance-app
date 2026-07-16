function authToken(){return localStorage.getItem('sdk_token')||SB_KEY;}
function throwSbError(e){const err=new Error(e.message||'Error');err.code=e.code;err.details=e.details;throw err;}
// 23505 = kode SQLSTATE Postgres untuk unique_violation — lebih andal daripada
// mencocokkan kata "unique" di teks pesan error (bisa berubah/berbeda format).
function isDupError(e){return e&&(e.code==='23505'||(e.message||'').toLowerCase().includes('duplicate key')||(e.message||'').toLowerCase().includes('unique'));}
async function sb(path,method='GET',body=null){const o={method,headers:{'apikey':SB_KEY,'Authorization':'Bearer '+authToken(),'Content-Type':'application/json','Prefer':method==='POST'?'return=representation':''}};if(body)o.body=JSON.stringify(body);const r=await fetch(SB_URL+'/rest/v1/'+path,o);if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401&&typeof handleAuthExpired==='function')handleAuthExpired();throwSbError(e);}return r.status===204?null:r.json();}
async function rpc(fnName,params={}){const r=await fetch(SB_URL+'/rest/v1/rpc/'+fnName,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+authToken(),'Content-Type':'application/json'},body:JSON.stringify(params)});if(!r.ok){const e=await r.json().catch(()=>({}));if(r.status===401&&typeof handleAuthExpired==='function')handleAuthExpired();throwSbError(e);}return r.status===204?null:r.json();}
// Varian yang SELALU pakai anon key, tidak pernah authToken() — dipakai di alur
// yang memang harus jalan sebagai anon (registrasi, forgot-password) supaya
// sdk_token basi dari sesi sebelumnya (akun lain/sudah dihapus/kedaluwarsa)
// tidak ikut terkirim dan bikin request itu dievaluasi sebagai role 'authenticated'
// alih-alih 'anon' oleh RLS. Ini perbaikan yang tetap benar untuk dilakukan,
// tapi TERNYATA BUKAN penyebab utama error "new row violates row-level
// security policy" saat registrasi — root cause aslinya ada di parameter
// minimal di bawah, lihat database.md block [22].
//
// minimal=true mengirim `Prefer: return=minimal` alih-alih 'return=representation'
// (default untuk POST). WAJIB dipakai untuk INSERT ke `users` sebagai anon:
// return=representation minta Postgres membaca balik baris yang baru dibuat,
// yang berarti policy SELECT ikut dievaluasi — dan tidak ada policy SELECT
// yang mengizinkan anon melihat baris APAPUN di users (termasuk yang baru saja
// dibuatnya sendiri), jadi seluruh INSERT digagalkan meski datanya sah.
// Caller yang butuh id baris yang baru dibuat harus generate id-nya sendiri
// (crypto.randomUUID()) dan kirim eksplisit di payload, bukan mengandalkan
// baca-balik dari server.
async function sbAnon(path,method='GET',body=null,minimal){const o={method,headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':method==='POST'?(minimal?'return=minimal':'return=representation'):''}};if(body)o.body=JSON.stringify(body);const r=await fetch(SB_URL+'/rest/v1/'+path,o);if(!r.ok){const e=await r.json().catch(()=>({}));throwSbError(e);}if(r.status===204)return null;const t=await r.text().catch(()=>'');return t?JSON.parse(t):null;}
async function rpcAnon(fnName,params={}){const r=await fetch(SB_URL+'/rest/v1/rpc/'+fnName,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json'},body:JSON.stringify(params)});if(!r.ok){const e=await r.json().catch(()=>({}));throwSbError(e);}return r.status===204?null:r.json();}
async function hp(p){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p+'finly_salt_2024'));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');}
let poolKey='';
async function loadPoolKey(){
  try{
    const res=await sb('settings?key=eq.groq_api_key&select=value');
    poolKey=res?.[0]?.value||localStorage.getItem('wangku_pool_key')||'';
  }catch(e){poolKey=localStorage.getItem('wangku_pool_key')||'';}
}
function getKey(){return poolKey||localStorage.getItem('wangku_pool_key')||'';}
function getPlan(){if(!user)return'free';if(user.role==='admin'||user.username===MASTER)return'unlimited';return user.plan||'free';}
function canAI(){
  const p=getPlan();
  if(p==='basic'||p==='free')return false;
  if(user.username===MASTER)return true;
  const limit=user.tokens_limit||0;
  const used=user.tokens_used||0;
  return limit>0&&limit>used;
}
function canScan(){return canAI();}
function getMonth(){return new Date().toISOString().substring(0,7);}
function getNextMonth(){const d=new Date();d.setMonth(d.getMonth()+1);return d.toISOString().substring(0,7);}

// ========================
// PIN LOCK — server-side, per-user (bukan localStorage lagi, lihat
// database.md block [28]). PIN_KEY masih dipakai, tapi cuma untuk migrasi
// satu kali dari skema lama: kalau kolomnya null di server TAPI key lama
// ini masih ada, berarti user ini dulu pernah aktifkan PIN lokal sebelum
// migrasi ini — bukan berarti PIN lock harus otomatis nyala lagi begitu
// saja (nilai lama tidak pernah ada di database), tapi mereka diminta
// bikin PIN baru sekali, bukan diam-diam dianggap opt-out. Lihat
// checkSession() di app-core.js untuk logika pemilihan mode ini.
// ========================
let pinInput='',pinMode='verify',pinFirst='';
const PIN_KEY='wangku_pin';
// 'boot' = dipanggil dari checkSession() sebelum showApp() -- submit yang
// berhasil harus lanjut ke showApp(). 'settings' = dipanggil dari toggle
// PIN di Settings saat app sudah terbuka -- submit yang berhasil cuma
// perlu menutup layar PIN dan sinkron ulang toggle-nya, TIDAK boleh
// panggil showApp() lagi (itu akan mengulang seluruh boot sequence).
let pinScreenContext='boot';

function showPinScreen(mode='verify',context='boot'){
  pinMode=mode;pinInput='';pinFirst='';pinScreenContext=context;
  updatePinDots();
  const title=document.getElementById('pin-title');
  const sub=document.getElementById('pin-sub');
  const forgotBtn=document.getElementById('pin-forgot-btn');
  if(mode==='set'){title.textContent='Buat PIN Baru';sub.textContent='Masukkan 6 digit PIN baru kamu';}
  else if(mode==='confirm'){title.textContent='Konfirmasi PIN';sub.textContent='Masukkan ulang PIN kamu';}
  else{title.textContent='Masukkan PIN';sub.textContent='Selamat datang kembali 👋';}
  // "Lupa" cuma masuk akal kalau memang sedang verifikasi PIN yang sudah
  // ada -- di mode set/confirm belum ada apa-apa untuk dilupakan, jadi
  // tombol yang sama berfungsi sebagai "Batal" (lihat pinForgot()).
  if(forgotBtn)forgotBtn.textContent=mode==='verify'?'Lupa':'Batal';
  document.getElementById('pin-screen').style.display='flex';
}
function hidePinScreen(){document.getElementById('pin-screen').style.display='none';}
// Dipanggil setelah login/session-restore berhasil (checkSession() di
// app-core.js, doLogin() di auth.js) -- satu pintu keputusan biar
// logikanya tidak dobel di dua tempat dan gampang mencong.
function checkPinGate(){
  if(user.pin_enabled){showPinScreen('verify');}
  else if(localStorage.getItem(PIN_KEY)){showPinScreen('set');}
  else{showApp();}
}

function pinPress(n){
  if(pinInput.length>=6)return;
  pinInput+=n;updatePinDots();
  if(pinInput.length===6)setTimeout(pinSubmit,200);
}
function pinDelete(){pinInput=pinInput.slice(0,-1);updatePinDots();}
function updatePinDots(){
  for(let i=1;i<=6;i++){
    const d=document.getElementById('pd'+i);
    d.className='pin-dot'+(i<=pinInput.length?' filled':'');
  }
}
function pinError(){
  for(let i=1;i<=6;i++)document.getElementById('pd'+i).className='pin-dot error';
  setTimeout(()=>{pinInput='';updatePinDots();},600);
}
function finishPinSet(){
  hidePinScreen();
  localStorage.removeItem(PIN_KEY); // bersihkan sisa skema lama, kalau ada
  if(typeof syncPinToggleUI==='function')syncPinToggleUI();
  if(pinScreenContext==='boot'){showApp();}
  showToast('PIN berhasil dibuat ✓','ok');
}
async function pinSubmit(){
  if(pinMode==='verify'){
    try{
      const hash=await hp(pinInput);
      const ok=await rpc('verify_pin',{p_pin_hash:hash});
      if(ok){hidePinScreen();showApp();}
      else{showToast('PIN salah!','err');pinError();}
    }catch(e){showToast('Gagal verifikasi PIN, coba lagi','err');pinError();}
  } else if(pinMode==='set'){
    pinFirst=pinInput;pinInput='';updatePinDots();
    pinMode='confirm';
    document.getElementById('pin-title').textContent='Konfirmasi PIN';
    document.getElementById('pin-sub').textContent='Masukkan ulang PIN kamu';
  } else if(pinMode==='confirm'){
    if(pinInput===pinFirst){
      try{
        const hash=await hp(pinInput);
        const ok=await rpc('set_pin_hash',{p_pin_hash:hash});
        if(!ok)throw new Error('RPC menolak');
        if(user){user.pin_enabled=true;localStorage.setItem('sdk_session',JSON.stringify(user));}
        finishPinSet();
      }catch(e){showToast('Gagal menyimpan PIN, coba lagi','err');pinError();}
    } else {
      showToast('PIN tidak cocok!','err');pinError();
      setTimeout(()=>{pinMode='set';pinFirst='';document.getElementById('pin-title').textContent='Buat PIN Baru';document.getElementById('pin-sub').textContent='Masukkan 6 digit PIN baru kamu';},700);
    }
  }
}
// Tombol yang sama ("Lupa"/"Batal") punya dua arti tergantung pinMode:
// - mode 'verify' (PIN yang sudah ada, sungguhan lupa): matikan PIN lock
//   di server (konsisten dengan set_pin_hash yang otorisasinya dari JWT
//   yang masih valid saat ini, bukan dari membuktikan tahu PIN lama),
//   lalu paksa login ulang. Mau PIN lock lagi, nyalakan ulang lewat
//   toggle di Settings setelah login, yang akan minta PIN baru.
// - mode 'set'/'confirm' (belum ada PIN yang tersimpan sama sekali --
//   migrasi user lama saat boot, atau lagi nyalakan toggle di Settings):
//   tidak ada apapun untuk dimatikan, jadi ini murni batal. Konteks
//   'boot' lanjut ke showApp() dengan PIN lock tetap mati (opt-out);
//   konteks 'settings' cuma menutup layarnya, sesi yang sedang berjalan
//   tidak disentuh sama sekali. PIN_KEY lama (kalau ada, dari migrasi)
//   tetap dibersihkan di sini juga -- kalau tidak, prompt migrasi akan
//   terus muncul lagi setiap login berikutnya meski user sudah jelas
//   memilih batal, bukan cuma sekali seperti seharusnya.
async function pinForgot(){
  hidePinScreen();
  if(pinMode!=='verify'){
    localStorage.removeItem(PIN_KEY);
    if(pinScreenContext==='boot')showApp();
    return;
  }
  try{await rpc('set_pin_hash',{p_pin_hash:null});}catch(e){}
  localStorage.removeItem(PIN_KEY);
  if(user){user.pin_enabled=false;}
  showLoginPage();
  showToast('Kunci PIN dimatikan. Login ulang untuk lanjut','warn');
}

function initTheme(){applyTheme(localStorage.getItem('theme')||'light');}
function applyTheme(t){document.documentElement.setAttribute('data-theme',t);const tr=document.getElementById('toggle-track'),ic=document.getElementById('theme-ico');if(tr)tr.className='toggle-track'+(t==='dark'?' on':'');if(ic)ic.className=t==='dark'?'ti ti-sun':'ti ti-moon';localStorage.setItem('theme',t);}
function toggleTheme(){applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark');}
initTheme();

function updateClock(){const n=new Date();const el=document.getElementById('clock');if(el)el.textContent=String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');const gr=document.getElementById('greeting');const h=n.getHours();if(gr)gr.textContent=h<12?'Selamat pagi 👋':h<15?'Selamat siang 🌤️':h<18?'Selamat sore 🌅':'Selamat malam 🌙';}
updateClock();setInterval(updateClock,30000);

let toastTimer;
function showToast(m,t=''){const el=document.getElementById('toast');el.textContent=m;el.className='toast show'+(t?' '+t:'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='toast',2500);}

function checkOb(){if(localStorage.getItem('sdk_ob'))return false;document.getElementById('ob-wrap').style.display='flex';return true;}
function nextOb(n){document.querySelectorAll('.ob-slide').forEach(s=>s.classList.remove('active'));document.getElementById('ob-'+n)?.classList.add('active');}
function skipOb(){localStorage.setItem('sdk_ob','1');document.getElementById('ob-wrap').style.display='none';showLoginPage();}

function rpFmt1(v){const r=Math.round(v*10)/10;return r%1===0?r.toFixed(0):r.toFixed(1);}
function rp(n){if(!n&&n!==0)return'—';const a=Math.abs(n);const s=a>=1e9?rpFmt1(a/1e9)+'M':a>=1e6?rpFmt1(a/1e6)+'jt':a>=1e3?rpFmt1(a/1e3)+'rb':a.toString();return(n<0?'-':'')+'Rp '+s;}
function rpF(n){return'Rp '+Number(n||0).toLocaleString('id-ID');}

// ========================
// JUMLAH DISINGKAT + TAP-UNTUK-LIHAT (transaksi list, kartu target — BUKAN Saldo Sekarang di Home)
// ========================
let qaRevealSeq=0,revealTimers={};
function abbrAmountHtml(value,cls){
  const id='amt-rv-'+(qaRevealSeq++);
  const abbr=rp(value),full=rpF(value);
  return `<span id="${id}" class="${cls||''}" data-full="${full.replace(/"/g,'&quot;')}" data-abbr="${abbr.replace(/"/g,'&quot;')}" data-revealed="0" onclick="event.stopPropagation();revealAmount(this,'${id}')" style="cursor:pointer">${abbr}</span>`;
}
function revealAmount(el,id){
  clearTimeout(revealTimers[id]);
  if(el.dataset.revealed==='1'){
    el.textContent=el.dataset.abbr;el.dataset.revealed='0';
    return;
  }
  el.textContent=el.dataset.full;el.dataset.revealed='1';
  revealTimers[id]=setTimeout(()=>{el.textContent=el.dataset.abbr;el.dataset.revealed='0';},3000);
}

function installPWA(){if(dP){dP.prompt();dP.userChoice.then(()=>{dP=null;});}else showToast('Di Chrome: ⋮ → Add to homescreen');}

// ========================
// PAYMENT FLOW
// ========================
