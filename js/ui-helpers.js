async function sb(path,method='GET',body=null){const o={method,headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json','Prefer':method==='POST'?'return=representation':''}};if(body)o.body=JSON.stringify(body);const r=await fetch(SB_URL+'/rest/v1/'+path,o);if(!r.ok){const e=await r.json();throw new Error(e.message||'Error');}return r.status===204?null:r.json();}
async function rpc(fnName,params={}){const r=await fetch(SB_URL+'/rest/v1/rpc/'+fnName,{method:'POST',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json'},body:JSON.stringify(params)});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||'Error');}return r.status===204?null:r.json();}
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
// SPLASH SCREEN
// ========================
let pinInput='',pinMode='verify',pinFirst='';
const PIN_KEY='wangku_pin';

function showPinScreen(mode='verify'){
  pinMode=mode;pinInput='';pinFirst='';
  updatePinDots();
  const title=document.getElementById('pin-title');
  const sub=document.getElementById('pin-sub');
  if(mode==='set'){title.textContent='Buat PIN Baru';sub.textContent='Masukkan 6 digit PIN baru kamu';}
  else if(mode==='confirm'){title.textContent='Konfirmasi PIN';sub.textContent='Masukkan ulang PIN kamu';}
  else{title.textContent='Masukkan PIN';sub.textContent='Selamat datang kembali 👋';}
  document.getElementById('pin-screen').style.display='flex';
}
function hidePinScreen(){document.getElementById('pin-screen').style.display='none';}

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
function pinSubmit(){
  if(pinMode==='verify'){
    const saved=localStorage.getItem(PIN_KEY);
    if(pinInput===saved){hidePinScreen();showApp();}
    else{showToast('PIN salah!','err');pinError();}
  } else if(pinMode==='set'){
    pinFirst=pinInput;pinInput='';updatePinDots();
    pinMode='confirm';
    document.getElementById('pin-title').textContent='Konfirmasi PIN';
    document.getElementById('pin-sub').textContent='Masukkan ulang PIN kamu';
  } else if(pinMode==='confirm'){
    if(pinInput===pinFirst){
      localStorage.setItem(PIN_KEY,pinInput);
      hidePinScreen();showApp();showToast('PIN berhasil dibuat ✓','ok');
    } else {
      showToast('PIN tidak cocok!','err');pinError();
      setTimeout(()=>{pinMode='set';pinFirst='';document.getElementById('pin-title').textContent='Buat PIN Baru';document.getElementById('pin-sub').textContent='Masukkan 6 digit PIN baru kamu';},700);
    }
  }
}
function pinForgot(){
  hidePinScreen();
  localStorage.removeItem(PIN_KEY);
  showLoginPage();
  showToast('Silakan login ulang untuk reset PIN','warn');
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

function rp(n){if(!n&&n!==0)return'—';const a=Math.abs(n);const s=a>=1e9?(a/1e9).toFixed(1)+'M':a>=1e6?(a/1e6).toFixed(1)+'jt':a>=1e3?(a/1e3).toFixed(0)+'rb':a.toString();return(n<0?'-':'')+'Rp '+s;}
function rpF(n){return'Rp '+Number(n||0).toLocaleString('id-ID');}

function installPWA(){if(dP){dP.prompt();dP.userChoice.then(()=>{dP=null;});}else showToast('Di Chrome: ⋮ → Add to homescreen');}

// ========================
// PAYMENT FLOW
// ========================
