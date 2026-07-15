// ========================
// SETTINGS PAGE ORCHESTRATOR
// ========================
function renderSettingsExtras(){
  if(!user)return;
  renderTrialBanner();
  renderPlanOptions();
  renderSetAvatar();renderHeaderAvatar();
  syncNotifToggleUI();
  syncAutoDetectUI();
  syncCountTargetUI();
  syncPinToggleUI();
  if(typeof renderAccountManageSection==='function')renderAccountManageSection();
  const track=document.getElementById('autosync-track');
  if(track)track.className='toggle-track'+(autosyncEnabled()?' on':'');
}

// ========================
// TOKEN TOP-UP (Xendit, test mode) — lihat backend.md
// ========================
async function buyTokenPackage(packageId){
  try{
    const resp=await fetch('/api/create-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:user.id,package:packageId,item_type:'tokens'})});
    const d=await resp.json();
    if(!resp.ok||d.error)throw new Error(d.error||'Gagal membuat pembayaran');
    window.location.href=d.checkout_url;
  }catch(e){showToast('Gagal: '+e.message,'err');}
}
// Perpanjangan plan yang SEDANG aktif (Basic/Pro), bukan ganti tier --
// lihat wangku-spec-subscription-renewal.md §4. Ganti/downgrade tier
// tetap lewat requestPlanChange() (WhatsApp+approval manual), tidak
// disentuh di sini -- dua hal yang sengaja dipisah.
async function buyPlanRenewal(planId){
  try{
    const resp=await fetch('/api/create-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:user.id,package:planId,item_type:'plan'})});
    const d=await resp.json();
    if(!resp.ok||d.error)throw new Error(d.error||'Gagal membuat pembayaran');
    window.location.href=d.checkout_url;
  }catch(e){showToast('Gagal: '+e.message,'err');}
}
// Dipanggil sekali tiap showApp() -- cek apakah kita baru kembali dari
// redirect Xendit (?xendit_return=success|failed di URL). Webhook Xendit
// (sumber kebenaran sebenarnya, lihat api/xendit-webhook.js) bisa baru
// sampai beberapa detik SETELAH redirect balik ini terjadi -- jangan
// anggap token sudah ter-update cuma karena user sudah kembali ke app,
// makanya di-poll beberapa kali alih-alih langsung dipercaya.
async function checkXenditReturn(){
  const params=new URLSearchParams(window.location.search);
  const xr=params.get('xendit_return');
  if(!xr)return;
  history.replaceState(null,'',window.location.pathname);
  if(xr==='failed'){showToast('Pembayaran dibatalkan atau gagal','warn');return;}
  showToast('Memproses pembayaran...','ok');
  const beforeLimit=user?.tokens_limit||0;
  // Perpanjangan plan tidak selalu menaikkan tokens_limit (mis. Basic
  // selalu 0, atau Pro yang di-reset ke angka bulanan yang KEBETULAN sama
  // dengan sebelumnya) -- jadi "berhasil" juga dideteksi dari
  // plan_expires_at maju, bukan cuma tokens_limit naik. Lihat
  // wangku-spec-subscription-renewal.md §4.
  const beforeExpiry=user?.plan_expires_at?new Date(user.plan_expires_at).getTime():0;
  for(let i=0;i<6;i++){
    await new Promise(r=>setTimeout(r,3000));
    try{
      const result=await rpc('get_user_by_id',{p_user_id:user.id});
      if(result?.user){
        user=result.user;localStorage.setItem('sdk_token',result.token);localStorage.setItem('sdk_session',JSON.stringify(user));
        const afterExpiry=user.plan_expires_at?new Date(user.plan_expires_at).getTime():0;
        if(user.tokens_limit>beforeLimit||afterExpiry>beforeExpiry){
          renderPlanCard();
          showToast(afterExpiry>beforeExpiry?'Langganan berhasil diperpanjang ✓':'Token berhasil ditambahkan ✓','ok');
          return;
        }
      }
    }catch(e){}
  }
  showToast('Pembayaran masih diproses, cek lagi sebentar lagi ya','warn');
}

// Label paket diturunkan dari jumlah token / item_type+plan, bukan
// kolom label terpisah -- tier cuma ada segelintir (lihat
// TOKEN_PACKAGES/PLAN_PACKAGES di create-payment.js), jadi tidak perlu
// simpan label mentah per baris di DB. item_type/plan ditambahkan block
// [31] khusus buat membedakan baris top-up token vs perpanjangan plan
// (wangku-spec-subscription-renewal.md §4).
function tokenPurchaseLabel(r){
  if(r.item_type==='plan'){
    const planNames={basic:'Basic',pro:'Pro',unlimited:'Ultimate'};
    return'Perpanjangan Paket '+(planNames[r.plan]||r.plan)+' (30 Hari)';
  }
  if(r.tokens===2000000)return'2 Juta Token AI';
  if(r.tokens===5000000)return'5 Juta Token AI';
  return(r.tokens/1000000).toFixed(1)+' Juta Token AI';
}
const PURCHASE_STATUS_UI={
  pending:{label:'Menunggu Pembayaran',color:'var(--amber)',bg:'var(--amber-bg)'},
  paid:{label:'Berhasil',color:'var(--green)',bg:'var(--green-bg)'},
  expired:{label:'Kedaluwarsa',color:'var(--text3)',bg:'var(--border2)'},
  failed:{label:'Gagal',color:'var(--red)',bg:'var(--red-bg)'},
};
async function showPaymentHistory(){
  if(!user)return;
  const modal=document.getElementById('payment-history-modal');
  const body=document.getElementById('payment-history-body');
  modal.classList.add('open');
  body.innerHTML='<div class="skeleton" style="height:60px;margin-bottom:8px"></div><div class="skeleton" style="height:60px"></div>';
  try{
    const rows=await sb(`token_purchases?user_id=eq.${user.id}&order=created_at.desc&select=id,tokens,amount,status,created_at,item_type,plan`);
    if(!rows||!rows.length){body.innerHTML='<div style="text-align:center;padding:20px;font-size:12px;color:var(--text3)">Belum ada riwayat pembelian</div>';return;}
    body.innerHTML=rows.map(r=>{
      const st=PURCHASE_STATUS_UI[r.status]||{label:r.status,color:'var(--text3)',bg:'var(--border2)'};
      const tgl=new Date(r.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
      return`<div style="background:var(--bg3);border-radius:12px;padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${tokenPurchaseLabel(r)}</div>
          <div style="font-size:9px;font-weight:600;color:${st.color};background:${st.bg};padding:2px 8px;border-radius:6px;white-space:nowrap">${st.label}</div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3)">
          <span>${tgl}</span>
          <span style="font-weight:600;color:var(--text)">${rpF(r.amount)}</span>
        </div>
      </div>`;
    }).join('');
  }catch(e){body.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">Gagal memuat riwayat pembayaran</div>';}
}

// ========================
// TRIAL BANNER
// ========================
function renderTrialBanner(){
  const wrap=document.getElementById('trial-banner-wrap');if(!wrap)return;
  const isMaster=user&&(user.role==='admin'||user.username===MASTER);
  if(isMaster||!user?.trial_ends_at){wrap.innerHTML='';return;}
  const end=new Date(user.trial_ends_at);const now=new Date();
  const daysLeft=Math.ceil((end-now)/86400000);
  if(isNaN(daysLeft)){wrap.innerHTML='';return;}
  if(daysLeft<=0){
    wrap.innerHTML=`<div class="trial-banner" style="background:var(--red-bg);border-color:var(--red);color:var(--red)"><i class="ti ti-clock-x"></i> Masa trial kamu sudah berakhir. Hubungi CS untuk lanjut berlangganan.</div>`;
    return;
  }
  wrap.innerHTML=`<div class="trial-banner"><i class="ti ti-hourglass"></i> Kamu sedang trial paket ${PLANS[user.plan]?.label||user.plan} — sisa ${daysLeft} hari lagi.</div>`;
}

// ========================
// UPGRADE / DOWNGRADE PLAN
// ========================
function openPlanOptions(){
  renderPlanOptions();
  document.getElementById('plan-options-modal').classList.add('open');
}
function renderPlanOptions(){
  const el=document.getElementById('plan-options');if(!el)return;
  const isMaster=user&&(user.role==='admin'||user.username===MASTER);
  if(isMaster)return;
  const current=user?.plan||'free';
  const order=['free','basic','pro'];
  const rank={free:0,basic:1,pro:2,unlimited:3};
  el.innerHTML=order.map(p=>{
    const info=PLANS[p];const isCurrent=p===current;let btn;
    if(isCurrent)btn=`<button class="plan-opt-btn current-tag" disabled>Aktif</button>`;
    else if(rank[p]>rank[current])btn=`<button class="plan-opt-btn" onclick="requestPlanChange('${p}')">Upgrade</button>`;
    else btn=`<button class="plan-opt-btn down" onclick="requestPlanChange('${p}')">Downgrade</button>`;
    return `<div class="plan-opt-row${isCurrent?' current':''}"><div class="plan-opt-info"><div class="plan-opt-name">${info.label}</div><div class="plan-opt-price">${info.price}</div></div>${btn}</div>`;
  }).join('');
}
function requestPlanChange(plan){
  if(!user)return;
  const info=PLANS[plan];const current=user.plan||'free';
  const rank={free:0,basic:1,pro:2,unlimited:3};
  const action=rank[plan]>rank[current]?'upgrade':'downgrade';
  const msg='Halo Admin Wangku, saya '+(user.full_name||user.username)+' (@'+user.username+') ingin '+action+' paket dari '+(PLANS[current]?.label||current)+' ke '+info.label+' ('+info.price+'). Mohon dibantu ya 🙏';
  window.open('https://wa.me/'+CS+'?text='+encodeURIComponent(msg),'_blank');
}

// ========================
// PROFILE EDIT (nama & foto)
// ========================
let pendingAvatarBase64=null;
function renderHeaderAvatar(){
  const btn=document.getElementById('hdr-avatar-btn');if(!btn||!user)return;
  btn.innerHTML=user.avatar_url
    ?`<img src="${user.avatar_url}" alt="Profil"/>`
    :`<i class="ti ti-settings"></i>`;
}
function renderSetAvatar(){
  const wrap=document.getElementById('set-avatar-wrap');if(!wrap||!user)return;
  wrap.innerHTML=user.avatar_url
    ?`<img src="${user.avatar_url}" class="avatar-circle-sm"/>`
    :`<div class="set-ico" style="background:var(--green-bg);color:var(--green)"><i class="ti ti-user"></i></div>`;
}
function openProfileEdit(){
  if(!user)return;
  pendingAvatarBase64=null;
  document.getElementById('pe-form-view').style.display='block';
  document.getElementById('pe-success-view').style.display='none';
  document.getElementById('pe-nama').value=user.full_name||'';
  document.getElementById('pe-username').value=user.username||'';
  renderAvatarEditPreview(user.avatar_url);
  document.getElementById('profile-edit-modal').classList.add('open');
}
function renderAvatarEditPreview(url){
  const el=document.getElementById('avatar-edit-preview');if(!el)return;
  if(url){el.innerHTML=`<img src="${url}" class="avatar-lg"/>`;return;}
  const initial=(user?.full_name||user?.username||'?').trim().charAt(0).toUpperCase()||'?';
  el.innerHTML=`<div class="avatar-lg-fallback">${initial}</div>`;
}
function previewAvatar(input){
  if(!input.files||!input.files[0])return;
  const file=input.files[0];
  if(file.size>3*1024*1024){showToast('Ukuran foto maks 3MB','err');return;}
  const reader=new FileReader();
  reader.onload=e=>{pendingAvatarBase64=e.target.result;renderAvatarEditPreview(pendingAvatarBase64);};
  reader.readAsDataURL(file);
}
async function saveProfile(){
  const nama=document.getElementById('pe-nama').value.trim();
  if(!nama){showToast('Nama tidak boleh kosong!','err');return;}
  const btn=document.getElementById('pe-save-btn');btn.disabled=true;btn.innerHTML='<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Menyimpan...';
  try{
    const patch={full_name:nama};
    if(pendingAvatarBase64)patch.avatar_url=pendingAvatarBase64;
    await sb(`users?id=eq.${user.id}`,'PATCH',patch);
    user.full_name=nama;
    if(pendingAvatarBase64)user.avatar_url=pendingAvatarBase64;
    document.getElementById('uname').textContent=user.full_name;
    document.getElementById('set-nama').textContent=user.full_name;
    renderSetAvatar();renderHeaderAvatar();
    localStorage.setItem('sdk_session',JSON.stringify(user));
    document.getElementById('pe-form-view').style.display='none';
    document.getElementById('pe-success-view').style.display='block';
    showToast('Profil diperbarui ✓','ok');
  }catch(e){showToast('Gagal: '+e.message,'err');}
  btn.disabled=false;btn.innerHTML='<i class="ti ti-device-floppy"></i> Simpan Profil';
}

// ========================
// PERHITUNGAN SALDO (apakah saldo target ikut dihitung ke Saldo Sekarang)
// ========================
function syncCountTargetUI(){
  const t=document.getElementById('count-target-track');
  if(t)t.className='toggle-track'+(countTargetInBalance()?' on':'');
}
async function toggleCountTargetBalance(){
  const enabled=!countTargetInBalance();
  localStorage.setItem('wangku_count_target_balance',enabled?'1':'0');
  syncCountTargetUI();
  showToast(enabled?'Saldo target ikut dihitung ✓':'Saldo target tidak dihitung','ok');
  if(typeof loadSummary==='function')await loadSummary();
}

// ========================
// AUTOSYNC (buka app & tiap transaksi baru)
// ========================
async function manualSync(){
  const ico=document.getElementById('sync-ico');
  if(ico)ico.style.animation='spin 1s linear infinite';
  try{
    await Promise.all([loadSummary(),loadTrx(document.getElementById('page-home')?.classList.contains('active')?'semua':'semua','txn-home',5),typeof loadAccounts==='function'?loadAccounts():null]);
    pingSheetSync();
    showToast('Sinkronisasi selesai ✓','ok');
  }catch(e){showToast('Gagal sync','err');}
  if(ico)setTimeout(()=>{ico.style.animation='';},500);
}
function autosyncEnabled(){return localStorage.getItem('wangku_autosync')!=='0';}
function initAutosync(){
  const track=document.getElementById('autosync-track');
  if(track)track.className='toggle-track'+(autosyncEnabled()?' on':'');
  if(autosyncEnabled())pingSheetSync();
}
function toggleAutosync(){
  const enabled=!autosyncEnabled();
  localStorage.setItem('wangku_autosync',enabled?'1':'0');
  const track=document.getElementById('autosync-track');
  if(track)track.className='toggle-track'+(enabled?' on':'');
  showToast(enabled?'Sinkronisasi otomatis diaktifkan ✓':'Sinkronisasi otomatis dimatikan','ok');
  if(enabled)pingSheetSync();
}
function pingSheetSync(){try{fetch(GAS+'?action=ping').catch(()=>{});}catch(e){}}
// ========================
// PIN LOCK TOGGLE (Settings) — nyalakan/matikan lewat set_pin_hash RPC,
// bukan localStorage langsung. Lihat ui-helpers.js untuk showPinScreen/
// pinSubmit yang benar-benar mengurus alur input+verifikasi PIN-nya.
// ========================
function syncPinToggleUI(){
  const track=document.getElementById('pin-lock-track');
  if(track)track.className='toggle-track'+(user?.pin_enabled?' on':'');
}
function togglePinLock(){
  if(user?.pin_enabled){
    disablePinLock();
  }else{
    // Minta bikin PIN baru dulu -- toggle-nya baru ikut menyala setelah
    // set_pin_hash sukses (lihat finishPinSet() di ui-helpers.js), bukan
    // optimistic, supaya tidak salah tampil "aktif" kalau gagal simpan.
    showPinScreen('set','settings');
  }
}
async function disablePinLock(){
  try{
    await rpc('set_pin_hash',{p_pin_hash:null});
    user.pin_enabled=false;
    localStorage.setItem('sdk_session',JSON.stringify(user));
    syncPinToggleUI();
    showToast('Kunci PIN dimatikan','ok');
  }catch(e){showToast('Gagal: '+e.message,'err');}
}
async function runAutosync(){
  await loadSummary();await loadTrx('semua','txn-home',5);
  if(typeof loadAccounts==='function')await loadAccounts();
  if(autosyncEnabled())pingSheetSync();
}

// ========================
// NOTIFICATION SETTINGS
// ========================
function getNotifPrefs(){try{return JSON.parse(localStorage.getItem('wangku_notif')||'{}');}catch(e){return{};}}
function setNotifPrefs(p){localStorage.setItem('wangku_notif',JSON.stringify(p));}
let reminderTimer=null;
function initNotifSettings(){
  const p=getNotifPrefs();
  syncNotifToggleUI(p);
  const hEl=document.getElementById('reminder-hours');
  if(hEl)hEl.value=p.reminderHours||4;
  if(p.reminder)startReminderTimer(p.reminderHours||4);
  refreshBadge();
}
function syncNotifToggleUI(p){
  p=p||getNotifPrefs();
  ['reminder','badge','target','overspend'].forEach(k=>{
    const t=document.getElementById('notif-'+k+'-track');
    if(t)t.className='toggle-track'+(p[k]?' on':'');
  });
  const row=document.getElementById('reminder-hours-row');
  if(row)row.style.display=p.reminder?'flex':'none';
}
async function toggleNotif(key){
  const p=getNotifPrefs();
  const newVal=!p[key];
  if(newVal&&(key==='reminder'||key==='target'||key==='overspend')){
    const ok=await requestNotifPermission();
    if(!ok){showToast('Izin notifikasi ditolak/tidak didukung browser','warn');return;}
  }
  p[key]=newVal;setNotifPrefs(p);syncNotifToggleUI(p);
  if(key==='reminder'){if(newVal)startReminderTimer(p.reminderHours||4);else stopReminderTimer();}
  if(key==='badge')refreshBadge();
  showToast(newVal?'Notifikasi diaktifkan ✓':'Notifikasi dimatikan','ok');
}
function setReminderHours(v){
  const h=Math.max(1,Math.min(24,parseInt(v)||4));
  const p=getNotifPrefs();p.reminderHours=h;setNotifPrefs(p);
  const hEl=document.getElementById('reminder-hours');if(hEl)hEl.value=h;
  if(p.reminder)startReminderTimer(h);
}
function startReminderTimer(hours){
  stopReminderTimer();
  reminderTimer=setInterval(()=>{
    if(!hasTransactedToday())sendLocalNotif('Wangku','Belum catat transaksi hari ini nih. Yuk catat sekarang 📝');
  },hours*3600*1000);
}
function stopReminderTimer(){if(reminderTimer){clearInterval(reminderTimer);reminderTimer=null;}}
async function requestNotifPermission(){
  if(!('Notification' in window))return false;
  if(Notification.permission==='granted')return true;
  if(Notification.permission==='denied')return false;
  try{const res=await Notification.requestPermission();return res==='granted';}catch(e){return false;}
}
function sendLocalNotif(title,body){
  try{if('Notification' in window&&Notification.permission==='granted')new Notification(title,{body,icon:'logo.png'});}catch(e){}
}
function hasTransactedToday(){return localStorage.getItem('wangku_last_trx_date')===new Date().toISOString().substring(0,10);}
function markTransactedToday(){localStorage.setItem('wangku_last_trx_date',new Date().toISOString().substring(0,10));refreshBadge();}
function refreshBadge(){
  const p=getNotifPrefs();
  const show=!!p.badge&&!hasTransactedToday();
  const el=document.getElementById('foto-badge');
  if(el)el.className='nav-badge-dot'+(show?' show':'');
  try{if(show&&navigator.setAppBadge)navigator.setAppBadge(1);else if(navigator.clearAppBadge)navigator.clearAppBadge();}catch(e){}
}
function checkOverspendNotif(totalMasuk,totalKeluar){
  const p=getNotifPrefs();if(!p.overspend)return;
  if(totalKeluar>totalMasuk){
    const key='wangku_overspend_notif_'+getMonth();
    if(localStorage.getItem(key))return;
    localStorage.setItem(key,'1');
    sendLocalNotif('Wangku ⚠️','Pengeluaran bulan ini sudah lebih besar dari pemasukan. Yuk cek lagi!');
    showToast('⚠️ Pengeluaran melebihi pemasukan bulan ini','warn');
  }
}
function checkTargetNotif(list){
  const p=getNotifPrefs();if(!p.target||!list)return;
  list.forEach(t=>{
    const pct=t.nominal>0?Math.round((t.terkumpul/t.nominal)*100):0;
    const key='wangku_target_notif_'+t.id;
    if(pct>=100&&localStorage.getItem(key)!=='done'){
      localStorage.setItem(key,'done');
      sendLocalNotif('Target Tercapai 🎉','Target "'+t.nama+'" sudah tercapai!');
    }
  });
}

// ========================
// DETEKSI TRANSAKSI OTOMATIS
// (butuh automation di HP — lihat catatan di panel Settings)
// ========================
function detectionEnabled(){return localStorage.getItem('wangku_autodetect')==='1';}
function syncAutoDetectUI(){
  const t=document.getElementById('autodetect-track');
  if(t)t.className='toggle-track'+(detectionEnabled()?' on':'');
}
async function toggleAutoDetect(){
  const enabled=!detectionEnabled();
  localStorage.setItem('wangku_autodetect',enabled?'1':'0');
  syncAutoDetectUI();
  showToast(enabled?'Deteksi transaksi otomatis diaktifkan ✓':'Deteksi transaksi otomatis dimatikan','ok');
  if(enabled)startDetectionPoll();else stopDetectionPoll();
}
function initAutoDetect(){
  syncAutoDetectUI();
  if(detectionEnabled())startDetectionPoll();
}
let detectPollTimer=null;
function startDetectionPoll(){
  stopDetectionPoll();
  pollDetectedTransactions();
  detectPollTimer=setInterval(pollDetectedTransactions,15000);
}
function stopDetectionPoll(){if(detectPollTimer){clearInterval(detectPollTimer);detectPollTimer=null;}}
async function pollDetectedTransactions(){
  if(!user||!detectionEnabled())return;
  try{
    const rows=await sb(`detected_transactions?user_id=eq.${user.id}&status=eq.pending&order=created_at.asc&limit=1`);
    if(rows&&rows.length)showDetectedPopup(rows[0]);
  }catch(e){/* tabel mungkin belum di-migrate, diamkan */}
}
let currentDetected=null;
function showDetectedPopup(row){
  if(document.getElementById('detected-trx-modal').classList.contains('open'))return;
  currentDetected=row;
  document.getElementById('detect-source').textContent=row.source_app||'Aplikasi lain';
  document.getElementById('detect-text').textContent=row.raw_text||'—';
  document.getElementById('detect-nominal').value=row.nominal_guess||'';
  document.getElementById('detect-jenis').value=row.jenis_guess||'pengeluaran';
  document.getElementById('detected-trx-modal').classList.add('open');
}
async function confirmDetected(){
  if(!currentDetected||!user)return;
  const nominal=parseFloat(document.getElementById('detect-nominal').value);
  const jenis=document.getElementById('detect-jenis').value;
  if(!nominal||nominal<=0){showToast('Nominal tidak valid!','err');return;}
  try{
    await sb('transactions','POST',{user_id:user.id,jenis,nominal,kategori:'lainnya',keterangan:currentDetected.source_app||'Deteksi otomatis',prioritas:'penting',account_id:(typeof getDefaultAccountId==='function'?getDefaultAccountId():null),tanggal:new Date().toISOString().substring(0,10)});
    await sb(`detected_transactions?id=eq.${currentDetected.id}`,'PATCH',{status:'confirmed'});
    document.getElementById('detected-trx-modal').classList.remove('open');
    showToast('Transaksi ditambahkan ✓','ok');
    if(typeof markTransactedToday==='function')markTransactedToday();
    if(typeof runAutosync==='function')await runAutosync();
  }catch(e){showToast('Gagal: '+e.message,'err');}
  currentDetected=null;
}
async function dismissDetected(){
  if(!currentDetected){document.getElementById('detected-trx-modal').classList.remove('open');return;}
  try{await sb(`detected_transactions?id=eq.${currentDetected.id}`,'PATCH',{status:'dismissed'});}catch(e){}
  document.getElementById('detected-trx-modal').classList.remove('open');
  currentDetected=null;
}

// ========================
// BACKUP DATA (manual JSON + Google Drive via GAS)
// ========================
async function collectBackupPayload(){
  const [trx,acc,kat,pri,tgt]=await Promise.all([
    sb(`transactions?user_id=eq.${user.id}`),
    sb(`accounts?user_id=eq.${user.id}`),
    sb(`user_categories?user_id=eq.${user.id}`),
    sb(`user_priorities?user_id=eq.${user.id}`),
    sb(`targets?user_id=eq.${user.id}`)
  ]);
  return{exported_at:new Date().toISOString(),user:{username:user.username,full_name:user.full_name},transactions:trx||[],accounts:acc||[],categories:kat||[],priorities:pri||[],targets:tgt||[]};
}
async function backupDataManual(){
  showToast('Menyiapkan backup...','ok');
  try{
    const payload=await collectBackupPayload();
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`wangku-backup-${new Date().toISOString().substring(0,10)}.json`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Backup berhasil diunduh ✓','ok');
  }catch(e){showToast('Gagal backup: '+e.message,'err');}
}
async function backupToDrive(){
  if(typeof GAS==='undefined'||!GAS){showToast('Google Apps Script belum dikonfigurasi','err');return;}
  showToast('Mengirim backup ke Google Drive...','ok');
  try{
    const payload=await collectBackupPayload();
    payload.action='backup';
    await fetch(GAS,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload)});
    showToast('Backup terkirim ✓ Cek folder Google Drive kamu (butuh Apps Script action=backup)','ok');
  }catch(e){showToast('Gagal kirim backup: '+e.message,'err');}
}

// ========================
// RESET DATA (verifikasi berlapis)
// ========================
function openResetModal(){
  document.getElementById('reset-confirm-check').checked=false;
  document.getElementById('reset-confirm-text').value='';
  updateResetBtnState();
  document.getElementById('reset-data-modal').classList.add('open');
}
function closeResetModal(){document.getElementById('reset-data-modal').classList.remove('open');}
function updateResetBtnState(){
  const checked=document.getElementById('reset-confirm-check').checked;
  const text=document.getElementById('reset-confirm-text').value.trim().toUpperCase();
  document.getElementById('reset-confirm-btn').disabled=!(checked&&text==='HAPUS DATA');
}
async function doResetData(){
  const btn=document.getElementById('reset-confirm-btn');
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Menghapus...';
  try{
    await sb(`transactions?user_id=eq.${user.id}`,'DELETE');
    await sb(`targets?user_id=eq.${user.id}`,'DELETE');
    await sb(`detected_transactions?user_id=eq.${user.id}`,'DELETE');
    closeResetModal();
    showToast('Semua data berhasil direset ✓','ok');
    if(typeof runAutosync==='function')await runAutosync();
    if(typeof renderTargets==='function')await renderTargets();
  }catch(e){showToast('Gagal reset: '+e.message,'err');}
  btn.disabled=false;btn.innerHTML='<i class="ti ti-trash"></i> Hapus Semua Data';
}
