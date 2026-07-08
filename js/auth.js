function switchTab(t){['login','register','forgot'].forEach(x=>{const el=document.getElementById('form-'+x);if(el)el.style.display=x===t?'block':'none';const btn=document.getElementById('tab-'+x);if(btn)btn.classList.toggle('active',x===t);});const row=document.querySelector('.login-tab-row');if(row)row.style.display=t==='forgot'?'none':'flex';}
function togglePwd(id,btn){const i=document.getElementById(id);const s=i.type==='password';i.type=s?'text':'password';btn.innerHTML=s?'<i class="ti ti-eye-off"></i>':'<i class="ti ti-eye"></i>';}

async function doLogin(){
  const un=document.getElementById('l-un').value.trim().toLowerCase();const pw=document.getElementById('l-pw').value;
  const err=document.getElementById('err-login');const btn=document.getElementById('btn-login');
  if(!un||!pw){err.textContent='Isi username dan password!';err.style.display='block';return;}
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Memverifikasi...';err.style.display='none';
  try{
    const h=await hp(pw);
    const u=await rpc('login_check',{p_username:un,p_password_hash:h});
    if(!u||!u.length)throw new Error('Username atau password salah');
    if(u[0].status==='pending')throw new Error('Akun menunggu aktivasi admin. Hubungi admin via WhatsApp 😊');
    if(u[0].status==='banned')throw new Error('Akun kamu dinonaktifkan. Hubungi admin.');
    if(u[0].status!=='active')throw new Error('Akun tidak aktif. Hubungi admin.');
    user=u[0];await sb(`users?id=eq.${user.id}`,'PATCH',{last_login:new Date().toISOString()});
    localStorage.setItem('sdk_session',JSON.stringify(user));
    if(window.PublicKeyCredential)localStorage.setItem('sdk_bio_user',un);
    // Cek PIN
    const hasPIN=localStorage.getItem(PIN_KEY);
    if(hasPIN){showPinScreen('verify');}
    else{showPinScreen('set');}// Buat PIN baru
  }catch(e){err.textContent=e.message;err.style.display='block';}
  btn.disabled=false;btn.innerHTML='<i class="ti ti-login"></i> Masuk ke Wangku';
}

let regOTP=null,regData=null;
function showRegS1(){document.getElementById('reg-s1').style.display='block';document.getElementById('reg-s2').style.display='none';}
function initRegOTP(){for(let i=1;i<=6;i++){const el=document.getElementById('ro'+i);if(!el)continue;const nel=el.cloneNode(true);el.parentNode.replaceChild(nel,el);nel.addEventListener('input',function(){this.value=this.value.replace(/[^0-9]/g,'').slice(-1);if(this.value&&i<6)document.getElementById('ro'+(i+1)).focus();if(getRegOTP().length===6)verifyRegOTP();});nel.addEventListener('keydown',function(e){if(e.key==='Backspace'){if(this.value)this.value='';else if(i>1){document.getElementById('ro'+(i-1)).value='';document.getElementById('ro'+(i-1)).focus();}e.preventDefault();}});}}
function getRegOTP(){let o='';for(let i=1;i<=6;i++)o+=document.getElementById('ro'+i)?.value||'';return o;}
async function resendRegOTP(){if(!regData?.email)return;regOTP=String(Math.floor(100000+Math.random()*900000));try{await sendEmailOTP(regData.email,regData.name,regOTP);showToast('OTP dikirim ulang ✓','ok');}catch(e){showToast('Gagal: '+e.message,'err');}}

async function doRegister(){
  const name=document.getElementById('r-name').value.trim();
  const un=document.getElementById('r-un').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
  const email=document.getElementById('r-email').value.trim();
  const wa=document.getElementById('r-wa').value.trim().replace(/\D/g,'');
  const pw=document.getElementById('r-pw').value;
  const err=document.getElementById('err-register');const btn=document.getElementById('btn-register');
  err.style.display='none';
  if(!name){err.textContent='Masukkan nama!';err.style.display='block';return;}
  if(!un||un.length<3){err.textContent='Username min. 3 karakter!';err.style.display='block';return;}
  if(!email||!email.includes('@')){err.textContent='Email tidak valid!';err.style.display='block';return;}
  if(!wa||wa.length<9){err.textContent='Nomor WA tidak valid!';err.style.display='block';return;}
  if(!pw||pw.length<6){err.textContent='Password min. 6 karakter!';err.style.display='block';return;}
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Mengirim OTP...';
  try{
    const ex=await sb(`users?or=(username.eq.${un},email.eq.${email})&select=id`);
    if(ex?.length){err.textContent='Username atau email sudah terdaftar!';err.style.display='block';btn.disabled=false;btn.innerHTML='<i class="ti ti-user-plus"></i> Buat Akun Gratis';return;}
    regOTP=String(Math.floor(100000+Math.random()*900000));
    regData={name,un,email,wa,pw};
    await sendEmailOTP(email,name,regOTP);
    document.getElementById('reg-otp-hint').textContent='OTP dikirim ke '+email.replace(/(.{2}).*(@.*)/,'$1***$2');
    document.getElementById('reg-s1').style.display='none';
    document.getElementById('reg-s2').style.display='block';
    initRegOTP();document.getElementById('ro1').focus();
    showToast('OTP terkirim ke email ✓','ok');
  }catch(e){err.textContent='Gagal kirim OTP: '+e.message;err.style.display='block';}
  btn.disabled=false;btn.innerHTML='<i class="ti ti-user-plus"></i> Buat Akun Gratis';
}

async function verifyRegOTP(){
  const input=getRegOTP();const err=document.getElementById('err-reg-otp');err.style.display='none';
  if(input.length!==6){err.textContent='Masukkan 6 digit OTP!';err.style.display='block';return;}
  if(input!==regOTP){err.textContent='OTP salah! Coba lagi.';err.style.display='block';for(let i=1;i<=6;i++)document.getElementById('ro'+i).value='';document.getElementById('ro1').focus();return;}
  try{
    const h=await hp(regData.pw);
    const waFull=regData.wa.startsWith('62')?regData.wa:'62'+(regData.wa.startsWith('0')?regData.wa.substring(1):regData.wa);
    const r=await sb('users?select=id,username,full_name,email,wa_number','POST',{username:regData.un,full_name:regData.name,email:regData.email,wa_number:waFull,password_hash:h,role:'user',status:'pending',gas_user_id:waFull,plan:'free',tokens_limit:0,tokens_used:0});
    if(!r||!r.length)throw new Error('Gagal membuat akun');
    newUser={id:r[0].id,full_name:regData.name,username:regData.un,email:regData.email,wa_number:waFull};
    regOTP=null;regData=null;
    showPaymentFlow();
  }catch(e){err.textContent=e.message.includes('duplicate')?'Username/email sudah terdaftar!':e.message;err.style.display='block';}
}

async function sendEmailOTP(toEmail, nama, otp){
  try{
    // Pastikan EmailJS terinit
    if(typeof emailjs==='undefined') throw new Error('EmailJS belum dimuat');
    emailjs.init({publicKey:EJS_KEY});
    const result = await emailjs.send(EJS_SVC, EJS_TPL, {
      email: toEmail,
      to_email: toEmail,
      nama: nama,
      name: nama,
      otp: String(otp),
      otp_code: String(otp),
      message: 'Kode OTP kamu: '+otp
    });
    console.log('EmailJS success:', result.status, result.text);
    return result;
  }catch(e){
    console.error('EmailJS error:', e);
    throw new Error('Gagal kirim email OTP. Coba lagi atau hubungi admin.');
  }
}

async function sendForgotOTP(){
  const email=document.getElementById('fp-email').value.trim();
  const err=document.getElementById('err-fp');const btn=document.getElementById('btn-fp');
  err.style.display='none';
  if(!email||!email.includes('@')){err.textContent='Email tidak valid!';err.style.display='block';return;}
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Mencari...';
  try{
    const rows=await rpc('create_password_reset',{p_email:email});
    if(!rows||!rows.length)throw new Error('Email tidak terdaftar atau akun belum aktif!');
    fpUser={id:rows[0].user_id,full_name:rows[0].full_name};fpOTP=rows[0].otp;
    await sendEmailOTP(email,fpUser.full_name,fpOTP);
    document.getElementById('fp-s1').style.display='none';document.getElementById('fp-s2').style.display='block';
    document.getElementById('fp-hint').textContent='OTP dikirim ke '+email.replace(/(.{2}).*(@.*)/,'$1***$2');
    initFPOTP();document.getElementById('fp-o1').focus();
    showToast('OTP terkirim ke email ✓','ok');
  }catch(e){err.textContent=e.message;err.style.display='block';}
  btn.disabled=false;btn.innerHTML='<i class="ti ti-mail"></i> Kirim OTP ke Email';
}

function initFPOTP(){for(let i=1;i<=6;i++){const el=document.getElementById('fp-o'+i);if(!el)continue;const nel=el.cloneNode(true);el.parentNode.replaceChild(nel,el);nel.addEventListener('input',function(){this.value=this.value.replace(/[^0-9]/g,'').slice(-1);if(this.value&&i<6)document.getElementById('fp-o'+(i+1)).focus();if(getFPOTP().length===6)verifyFP();});nel.addEventListener('keydown',function(e){if(e.key==='Backspace'){if(this.value)this.value='';else if(i>1){document.getElementById('fp-o'+(i-1)).value='';document.getElementById('fp-o'+(i-1)).focus();}e.preventDefault();}});}}
function getFPOTP(){let o='';for(let i=1;i<=6;i++)o+=document.getElementById('fp-o'+i)?.value||'';return o;}
async function verifyFP(){const input=getFPOTP();const err=document.getElementById('err-fp-otp');err.style.display='none';if(input.length!==6){err.textContent='Masukkan 6 digit OTP!';err.style.display='block';return;}if(input!==fpOTP){err.textContent='OTP salah!';err.style.display='block';for(let i=1;i<=6;i++)document.getElementById('fp-o'+i).value='';document.getElementById('fp-o1').focus();return;}document.getElementById('fp-s2').style.display='none';document.getElementById('fp-s3').style.display='block';showToast('OTP terverifikasi ✓','ok');}
async function resetPW(){
  const np=document.getElementById('fp-np').value,cp=document.getElementById('fp-cp').value;
  const err=document.getElementById('err-fp-pass');err.style.display='none';
  if(!np||np.length<6){err.textContent='Password min. 6 karakter!';err.style.display='block';return;}
  if(np!==cp){err.textContent='Password tidak cocok!';err.style.display='block';return;}
  try{
    const ok=await rpc('confirm_password_reset',{p_user_id:fpUser.id,p_otp:fpOTP,p_new_hash:await hp(np)});
    if(!ok)throw new Error('Kode OTP sudah kedaluwarsa atau tidak valid. Minta OTP baru.');
    showToast('Password direset! 🎉','ok');fpUser=null;fpOTP=null;['fp-s2','fp-s3'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});document.getElementById('fp-s1').style.display='block';['fp-phone','fp-np','fp-cp'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});switchTab('login');}
  catch(e){err.textContent='Gagal: '+e.message;err.style.display='block';}
}

async function doBiometric(){const su=localStorage.getItem('sdk_bio_user');if(!su){showToast('Login manual dulu!','err');return;}try{const a=await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rpId:window.location.hostname,userVerification:'required',timeout:60000}});if(a){const u=await rpc('get_user_by_username',{p_username:su});if(!u||!u.length)throw new Error('User tidak ditemukan');user=u[0];localStorage.setItem('sdk_session',JSON.stringify(user));showApp();}}catch(e){if(e.name!=='NotAllowedError')showToast('Fingerprint gagal','err');}}

async function setupBiometric(){if(!user)return;try{const av=await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();if(!av){showToast('Perangkat tidak mendukung','err');return;}const c=await navigator.credentials.create({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:'Wangku',id:window.location.hostname},user:{id:new TextEncoder().encode(user.id),name:user.username,displayName:user.full_name},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required'},timeout:60000}});if(c){localStorage.setItem('sdk_bio_user',user.username);localStorage.setItem('sdk_bio_cred',c.id);document.getElementById('bio-status').textContent='Fingerprint aktif ✓';showToast('Fingerprint aktif! 👆','ok');}}catch(e){if(e.name!=='NotAllowedError')showToast('Gagal setup fingerprint','err');}}

