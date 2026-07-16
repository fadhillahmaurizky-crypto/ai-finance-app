function showSplash(){
  const splash=document.getElementById('splash-screen');
  splash.style.display='flex';
  setTimeout(()=>{document.getElementById('splash-bar').style.width='100%';},100);
  setTimeout(()=>{
    splash.style.opacity='0';
    splash.style.transition='opacity .4s';
    setTimeout(()=>{splash.style.display='none';checkSession();},400);
  },2200);
}

// ========================
// PIN SECURITY
// ========================
async function checkSession(){
  const saved=localStorage.getItem('sdk_session');
  if(!saved){if(!checkOb())showLoginPage();return;}
  try{
    user=JSON.parse(saved);
    const result=await rpc('get_user_by_id',{p_user_id:user.id});
    if(!result||!result.user){localStorage.removeItem('sdk_session');localStorage.removeItem('sdk_token');showLoginPage();return;}
    user=result.user;localStorage.setItem('sdk_token',result.token);localStorage.setItem('sdk_session',JSON.stringify(user));
    checkPinGate();
  }catch(e){showLoginPage();}
}

function showLoginPage(){document.getElementById('login-wrap').style.display='flex';document.getElementById('main-app').style.display='none';try{PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(av=>{const btn=document.getElementById('bio-btn');if(av&&localStorage.getItem('sdk_bio_cred'))btn.style.display='flex';});}catch(e){}}

function showApp(){
  document.getElementById('login-wrap').style.display='none';document.getElementById('main-app').style.display='flex';
  if(user){
    document.getElementById('uname').textContent=user.full_name||user.username;
    document.getElementById('set-nama').textContent=user.full_name;
    document.getElementById('set-sub').textContent='@'+user.username+(user.email?' · '+user.email:'');
    renderSetAvatar();
    const isMaster=user.role==='admin'||user.username===MASTER;
    document.getElementById('master-section').style.display=isMaster?'block':'none';
    if(isMaster)updateApiStatus();
    const currentMonth=getMonth();
    if(user.usage_month!==currentMonth){
      sb(`users?id=eq.${user.id}`,'PATCH',{ai_chat_count:0,ai_scan_count:0,usage_month:currentMonth}).catch(()=>{});
      user.ai_chat_count=0;user.ai_scan_count=0;user.usage_month=currentMonth;
    }
    aiChat=user.ai_chat_count||0;aiScan=user.ai_scan_count||0;
    renderPlanCard();
    if(typeof checkXenditReturn==='function')checkXenditReturn();
    if(typeof renderTrialNudge==='function')renderTrialNudge();
    if(typeof renderHeaderAvatar==='function')renderHeaderAvatar();
    if(typeof renderSettingsExtras==='function')renderSettingsExtras();
    try{PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(av=>{const row=document.getElementById('bio-row');if(row)row.style.display=av?'flex':'none';if(av&&localStorage.getItem('sdk_bio_cred')){const bs=document.getElementById('bio-status');if(bs)bs.textContent='Fingerprint aktif ✓';}});}catch(e){}
  }
  loadSummary();loadTrx('semua','txn-home',5);
  if(typeof renderAksiCepat==='function')renderAksiCepat();
  (async()=>{
    if(typeof ensureDefaultAccount==='function')await ensureDefaultAccount();
    if(typeof loadAccounts==='function')await loadAccounts();
    // loadTrx('semua','txn-home',5) di atas start bersamaan (bukan nunggu)
    // loadAccounts -- kalau transaksi kebetulan selesai duluan, baris
    // transfer sempat ke-render pakai fallback jenisLabel (lihat
    // accountFlowLabel di transactions.js) karena accountsList masih
    // kosong. Re-render sekali di sini supaya label "Akun → Akun" yang
    // benar tetap muncul begitu accountsList sudah ada, tanpa nunda
    // render pertama Home.
    if(typeof loadTrx==='function')loadTrx('semua','txn-home',5);
    if(typeof seedDefaultCategories==='function')await seedDefaultCategories();
    loadKategori();
    if(typeof seedDefaultPriorities==='function')await seedDefaultPriorities();
    if(typeof loadPrioritas==='function')loadPrioritas();
  })();
  if(typeof initNotifSettings==='function')initNotifSettings();
  if(typeof initAutosync==='function')initAutosync();
  if(typeof initAutoDetect==='function')initAutoDetect();
  if(typeof refreshBadge==='function')refreshBadge();
}

// Bersihkan semua cache in-memory milik user sebelumnya. Dipanggil di logout()
// dan lagi di awal login sukses (doLogin()/doBiometric()) sebagai jaring
// pengaman kedua — supaya data user lama tidak pernah kepakai/kerender
// sesaat untuk user baru di device/tab yang sama tanpa reload halaman.
function resetSessionState(){
  sumData=null;targets=[];chatHist=[];
  if(typeof ctx!=='undefined')ctx='';
  if(typeof accountsList!=='undefined')accountsList=[];
  if(typeof editingAccountId!=='undefined')editingAccountId=null;
  if(typeof kategoriList!=='undefined')kategoriList=[];
  if(typeof prioritasList!=='undefined')prioritasList=[];
  if(typeof txnCache!=='undefined')txnCache={};
  if(typeof txAllList!=='undefined')txAllList=[];
  if(typeof txAllFilter!=='undefined')txAllFilter={jenis:'semua'};
  if(typeof editingTrxId!=='undefined')editingTrxId=null;
  if(typeof editingTargetId!=='undefined')editingTargetId=null;
  if(typeof contributingTargetId!=='undefined')contributingTargetId=null;
  if(typeof insightList!=='undefined'){insightList=[];insightIdx=0;}
}

function logout(){resetSessionState();localStorage.removeItem('sdk_session');localStorage.removeItem('sdk_token');user=null;showLoginPage();}
let authExpiredHandled=false;
function handleAuthExpired(){
  if(authExpiredHandled)return;authExpiredHandled=true;
  resetSessionState();
  localStorage.removeItem('sdk_session');localStorage.removeItem('sdk_token');user=null;
  showLoginPage();
  if(typeof showToast==='function')showToast('Sesi kamu berakhir, silakan login lagi','warn');
  setTimeout(()=>{authExpiredHandled=false;},2000);
}

async function changePW(){
  const op=document.getElementById('cp-old').value,np=document.getElementById('cp-new').value,cp=document.getElementById('cp-conf').value;
  const err=document.getElementById('cp-err');err.style.display='none';
  if(!op||!np||!cp){err.textContent='Isi semua field!';err.style.display='block';return;}
  if(np!==cp){err.textContent='Password tidak cocok!';err.style.display='block';return;}
  if(np.length<6){err.textContent='Password min. 6 karakter!';err.style.display='block';return;}
  try{
    const oh=await hp(op);const nh=await hp(np);
    const ok=await rpc('change_password',{p_user_id:user.id,p_old_hash:oh,p_new_hash:nh});
    if(!ok)throw new Error('Password lama salah!');
    document.getElementById('chpass-modal').classList.remove('open');['cp-old','cp-new','cp-conf'].forEach(id=>document.getElementById(id).value='');showToast('Password diubah ✓','ok');
  }
  catch(e){err.textContent=e.message;err.style.display='block';}
}

// Baris "Aktif hingga X, N hari lagi" + tombol Perpanjang Sekarang --
// cuma tampil kalau plan_expires_at benar-benar ada (periode berbayar
// nyata lewat Xendit/approval manual, bukan admin override permanen
// lewat "Ubah Plan" yang sengaja tidak set tanggal ini) dan masih di
// masa depan. Dipakai ulang untuk Basic & Pro, tidak untuk Ultimate
// (belum ada jalur perpanjangan mandiri lewat Xendit untuk tier itu --
// lihat wangku-spec-subscription-renewal.md §4).
function planRenewalHtml(planId){
  if(!user?.plan_expires_at)return'';
  const end=new Date(user.plan_expires_at);
  if(isNaN(end.getTime()))return'';
  const daysLeft=Math.ceil((end-new Date())/86400000);
  if(daysLeft<=0)return'';
  const tgl=end.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
  return`<div style="margin-top:12px;padding:10px 12px;background:var(--bg3);border-radius:10px"><div style="font-size:11px;color:var(--text3);margin-bottom:8px">Aktif hingga ${tgl} (${daysLeft} hari lagi)</div><button class="upgrade-btn" style="width:100%;background:var(--green);padding:9px;font-size:12px" onclick="buyPlanRenewal('${planId}')">Perpanjang Sekarang</button></div>`;
}
function renderPlanCard(){
  const plan=getPlan();const el=document.getElementById('plan-card');if(!el)return;
  const tokenLimit=user?.tokens_limit||0;const tokenUsed=user?.tokens_used||0;const tokenSisa=Math.max(0,tokenLimit-tokenUsed);const tokenPct=tokenLimit>0?Math.min(100,Math.round((tokenSisa/tokenLimit)*100)):0;
  const upgradeBtn=plan==='unlimited'?'':'<button class="plan-upgrade-pill" onclick="openPlanOptions()">Upgrade</button>';
  if(plan==='unlimited'&&user?.username===MASTER){
    el.innerHTML=`<div class="plan-card pro" style="margin:0 16px 16px"><div class="plan-badge" style="background:var(--green);color:#fff">SUPER ADMIN</div><div class="plan-name" style="color:#fff">Ultimate Access 🚀</div><div class="plan-feature" style="color:rgba(255,255,255,.8)">AI Chat & Scan unlimited</div></div>`;
  } else if(plan==='free'){
    el.innerHTML=`<div class="plan-card" style="margin:0 16px 16px">${upgradeBtn}<div class="plan-badge" style="background:var(--border2);color:var(--text3)">FREE</div><div class="plan-name">Paket Free</div><div class="plan-feature">Catat transaksi manual ✓</div><div class="plan-feature">Dashboard & Laporan ✓</div><div class="plan-feature" style="opacity:.5">Integrasi WhatsApp ✗</div><div style="margin-top:12px;padding:10px 12px;background:var(--amber-bg);border-radius:10px;font-size:12px;color:var(--amber)">⬆️ Upgrade ke Basic mulai Rp 19.000/bln</div></div>`;
  } else if(plan==='basic'){
    el.innerHTML=`<div class="plan-card" style="margin:0 16px 16px">${upgradeBtn}<div class="plan-badge" style="background:var(--border2);color:var(--text3)">BASIC · Rp 19.000/bln</div><div class="plan-name">Paket Basic</div><div class="plan-feature">Catat transaksi manual ✓</div><div class="plan-feature">Dashboard & Laporan ✓</div><div class="plan-feature">Integrasi WhatsApp ✓</div><div style="margin-top:12px;padding:10px 12px;background:var(--amber-bg);border-radius:10px;font-size:12px;color:var(--amber)">🤖 Upgrade ke Pro untuk AI mulai Rp 39.000/bln</div>${planRenewalHtml('basic')}</div>`;
  } else {
    const planInfo=PLANS[plan]||PLANS['pro'];
    // Slider (100rb-20jt token, kelipatan 100rb) menggantikan dua tombol
    // tetap (+2 Juta/+5 Juta) lama -- lihat
    // wangku-spec-token-slider-ganti-paket.md Part 1. tokenSliderValue
    // (js/settings.js) persisten lintas render ulang plan-card ini,
    // supaya posisi slider yang sudah digeser user tidak reset diam-diam
    // tiap kali renderPlanCard() dipanggil ulang (mis. setelah showApp()).
    const sliderVal=typeof tokenSliderValue!=='undefined'?tokenSliderValue:2000000;
    const sliderCountLabel=formatTokenCountClient(sliderVal);
    const sliderPriceLabel=rpF(computeTokenPriceClient(sliderVal));
    el.innerHTML=`<div class="plan-card" style="margin:0 16px 16px;border-color:var(--green)">${upgradeBtn}<div class="plan-badge" style="background:var(--green);color:#fff">${planInfo.label.toUpperCase()} · ${planInfo.price}</div><div class="plan-name">${planInfo.label}</div><div class="plan-feature">Semua fitur Basic ✓</div><div class="plan-feature">AI Chat & Scan Struk ✓</div><div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px"><span style="color:var(--text3)">Token AI bulan ini</span><span style="color:var(--green);font-weight:600">${(tokenSisa/1000).toFixed(0)}K / ${(tokenLimit/1000).toFixed(0)}K</span></div><div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden"><div style="width:${tokenPct}%;height:100%;background:var(--green);border-radius:3px;transition:width .5s"></div></div></div><div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-bottom:6px"><span>Beli Token Tambahan</span><span id="token-slider-count" style="font-weight:600;color:var(--text)">${sliderCountLabel}</span></div><input type="range" id="token-slider" min="100000" max="20000000" step="100000" value="${sliderVal}" oninput="updateTokenSliderPrice()" style="width:100%;accent-color:var(--green)"><div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><span id="token-slider-price" style="font-size:15px;font-weight:800;color:var(--green)">${sliderPriceLabel}</span><button class="upgrade-btn" style="background:var(--blue);padding:8px 16px;font-size:12px" onclick="confirmTokenSliderPurchase()">Beli Token</button></div></div>${plan==='pro'?planRenewalHtml('pro'):''}</div>`;
  }
}

const PAGES=['home','catat','transaksi','target','laporan','settings','kategori','prioritas'];
function goPage(n){PAGES.forEach(p=>{document.getElementById('page-'+p)?.classList.remove('active');document.getElementById('ni-'+p)?.classList.remove('active');document.getElementById('nl-'+p)?.classList.remove('active');document.getElementById('nd-'+p)?.classList.remove('show');});document.getElementById('page-'+n)?.classList.add('active');document.getElementById('ni-'+n)?.classList.add('active');document.getElementById('nl-'+n)?.classList.add('active');document.getElementById('nd-'+n)?.classList.add('show');document.querySelector('.header')?.classList.toggle('compact',n!=='home');if(n==='transaksi'){renderTransaksiFilters();applyTransaksiFilter();}if(n==='laporan')renderLaporan();if(n==='target')renderTargets();if(n==='settings')renderSettingsExtras();if(n==='kategori')renderKategoriManageList();if(n==='prioritas')renderPrioritasManageList();if(n==='catat'){if(typeof renderAccountSelects==='function')renderAccountSelects();if(typeof renderKategoriSelect==='function')renderKategoriSelect();if(typeof renderPrioritasSelect==='function')renderPrioritasSelect();}if(!window.__wangkuHandlingPop&&history.state?.wangkuPage!==n){try{history.pushState({wangkuPage:n},'');}catch(e){}}}


// ========================
// NAVIGASI BACK BUTTON (Android/TWA) — cegah keluar/restart app saat tombol back ditekan
// ========================
(function(){
  let modalOpenStack=[];
  function attachModalObserver(m){
    const obs=new MutationObserver(()=>{
      const isOpen=m.classList.contains('open');
      const idx=modalOpenStack.indexOf(m.id);
      if(isOpen&&idx===-1){
        modalOpenStack.push(m.id);
        if(!window.__wangkuHandlingPop){try{history.pushState({wangkuModal:m.id},'');}catch(e){}}
      }else if(!isOpen&&idx!==-1){
        modalOpenStack.splice(idx,1);
      }
    });
    obs.observe(m,{attributes:true,attributeFilter:['class']});
  }
  function initNavHistory(){
    document.querySelectorAll('.modal-overlay').forEach(attachModalObserver);
    try{history.replaceState({wangkuPage:'home'},'');}catch(e){}
  }
  window.addEventListener('popstate',(e)=>{
    if(modalOpenStack.length){
      const topId=modalOpenStack[modalOpenStack.length-1];
      window.__wangkuHandlingPop=true;
      document.getElementById(topId)?.classList.remove('open');
      modalOpenStack.pop();
      window.__wangkuHandlingPop=false;
      return;
    }
    const state=e.state;
    window.__wangkuHandlingPop=true;
    if(state&&state.wangkuPage){
      goPage(state.wangkuPage);
    }else{
      goPage('home');
      try{history.pushState({wangkuPage:'home'},'');}catch(err){}
    }
    window.__wangkuHandlingPop=false;
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initNavHistory);
  else initNavHistory();
})();
