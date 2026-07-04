let newUser=null,selectedPlan=null,selectedAmount=0,buktiBase64='';

function showPaymentFlow(){
  document.getElementById('login-wrap').style.display='none';
  document.getElementById('payment-wrap').style.display='block';
  showPayStep(1);
}
function hidePaymentFlow(){
  document.getElementById('payment-wrap').style.display='none';
  document.getElementById('login-wrap').style.display='flex';
  switchTab('login');
}
function showPayStep(n){
  [1,2,3].forEach(i=>{
    const el=document.getElementById('pay-step'+i);
    if(el)el.style.display=i===n?(i===3?'flex':'block'):'none';
  });
  document.getElementById('payment-wrap').scrollTop=0;
}
async function lanjutkanPembayaran(){
  if(!selectedPlan){showToast('Pilih paket dulu!','err');return;}
  if(selectedPlan==='free'){await activateFreePlan();return;}
  const names={basic:'Basic',pro:'Pro',unlimited:'Ultimate'};
  const amounts={basic:19000,pro:34000,unlimited:49000};
  selectedAmount=amounts[selectedPlan];
  document.getElementById('pay-plan-title').textContent=names[selectedPlan];
  document.getElementById('pay-amount-title').textContent='Rp '+selectedAmount.toLocaleString('id-ID')+' /bulan';
  showPayStep(2);
}
async function activateFreePlan(){
  if(!newUser?.id){showToast('Error: data user hilang','err');return;}
  try{
    await sb(`users?id=eq.${newUser.id}`,'PATCH',{plan:'free',status:'active',tokens_limit:0,tokens_used:0});
    showToast('Paket Free aktif ✓ Silakan login','ok');
    hidePaymentFlow();
    switchTab('login');
  }catch(e){showToast('Gagal mengaktifkan akun: '+e.message,'err');}
}
function highlightPlan(plan,amount){
  selectedPlan=plan;selectedAmount=amount;
  // Reset semua card
  ['free','basic','pro','unlimited'].forEach(p=>{
    const el=document.getElementById('plan-card-'+p);
    if(!el)return;
    el.style.border=p===plan?'2px solid var(--green)':'1.5px solid var(--border)';
    el.style.background=p===plan?'var(--green-bg)':'var(--bg2)';
  });
  showToast('Paket '+plan+' dipilih ✓','ok');
}
function selectPlan(plan,amount){
  selectedPlan=plan;selectedAmount=amount;
  const names={basic:'Basic',pro:'Pro',unlimited:'Ultimate'};
  document.getElementById('pay-plan-title').textContent=names[plan];
  document.getElementById('pay-amount-title').textContent='Rp '+amount.toLocaleString('id-ID')+' /bulan';
  showPayStep(2);
}
function copyRek(no){
  navigator.clipboard?.writeText(no).then(()=>showToast('Nomor rekening disalin ✓','ok')).catch(()=>{});
}
function previewBukti(input){
  if(!input.files||!input.files[0])return;
  const file=input.files[0];
  if(file.size>5*1024*1024){showToast('File terlalu besar! Maks 5MB','err');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    buktiBase64=e.target.result;
    document.getElementById('bukti-prev').src=e.target.result;
    document.getElementById('bukti-prev-wrap').style.display='block';
  };
  reader.readAsDataURL(file);
}
function removeBukti(){
  buktiBase64='';
  document.getElementById('bukti-input').value='';
  document.getElementById('bukti-prev-wrap').style.display='none';
}
async function submitPayment(){
  if(!selectedPlan){showToast('Pilih paket dulu!','err');return;}
  if(!buktiBase64){showToast('Upload bukti transfer dulu!','err');return;}
  if(!newUser?.id){showToast('Error: data user hilang','err');return;}
  const btn=document.getElementById('pay-submit-btn');
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Mengirim...';
  try{
    // Simpan order ke Supabase
    await sb('orders','POST',{
      user_id:newUser.id,
      plan:selectedPlan,
      amount:selectedAmount,
      bukti_url:buktiBase64,
      status:'pending'
    });
    // Update selected_plan di user
    await sb(`users?id=eq.${newUser.id}`,'PATCH',{plan:selectedPlan});
    // Notif WA admin via GAS
    const waMsg=encodeURIComponent(
      '🔔 *ORDER BARU WANGKU*\n\n'+
      '👤 Nama: '+newUser.full_name+'\n'+
      '📱 WA: '+newUser.wa_number+'\n'+
      '📦 Paket: '+selectedPlan.toUpperCase()+'\n'+
      '💰 Total: Rp '+selectedAmount.toLocaleString('id-ID')+'\n\n'+
      'Cek dashboard admin untuk validasi.'
    );
    fetch(GAS+'?action=notifyAdmin&msg='+waMsg).catch(()=>{});
    // Update UI
    const planDisplayNames={basic:'Basic',pro:'Pro',unlimited:'Ultimate'};
    document.getElementById('pay-done-plan').textContent=planDisplayNames[selectedPlan]||selectedPlan;
    document.getElementById('pay-done-amount').textContent='Rp '+selectedAmount.toLocaleString('id-ID')+' /bulan';
    document.getElementById('wa-konfirm-link').href='https://wa.me/'+CS+'?text='+encodeURIComponent('Halo Admin Wangku, saya '+newUser.full_name+' sudah transfer untuk paket '+selectedPlan+' dan sudah upload bukti di app. Mohon diverifikasi ya 🙏');
    showPayStep(3);
    if(newUser?.id)startStatusPoll(newUser.id);
  }catch(e){showToast('Gagal: '+e.message,'err');}
  btn.disabled=false;btn.innerHTML='<i class="ti ti-send"></i> Kirim Bukti Pembayaran';
}

// ========================
// CUSTOM KATEGORI
// ========================
let statusPollInterval=null;
function startStatusPoll(userId){
  if(statusPollInterval)clearInterval(statusPollInterval);
  document.getElementById('pay-step3').style.display='flex';
  statusPollInterval=setInterval(async()=>{
    try{
      const u=await sb(`users?id=eq.${userId}&select=status,plan`);
      if(u?.[0]?.status==='active'){
        clearInterval(statusPollInterval);
        // Reset semua form
        document.getElementById('payment-wrap').style.display='none';
        document.getElementById('reg-s1').style.display='block';
        document.getElementById('reg-s2').style.display='none';
        newUser=null;
        showToast('Akun kamu sudah aktif! Silakan login 🎉','ok');
        switchTab('login');
        showLoginPage();
      }
    }catch(e){console.log('Poll error:',e);}
  },5000); // cek tiap 5 detik
}

