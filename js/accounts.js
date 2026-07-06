// ========================
// AKUN (default: Cash)
// ========================
let accountsList=[];
let editingAccountId=null;

async function ensureDefaultAccount(){
  try{
    const existing=await sb(`accounts?user_id=eq.${user.id}&select=id&limit=1`);
    if(existing&&existing.length)return;
    await sb('accounts','POST',{user_id:user.id,nama:DEFAULT_ACCOUNT_NAME,saldo_awal:0,is_default:true,is_system:true,icon:'cash',color:'#00B26A'});
  }catch(e){}
}

async function loadAccounts(){
  try{
    const data=await sb(`accounts?user_id=eq.${user.id}&order=is_default.desc,created_at.asc`);
    accountsList=data||[];
    renderAccountSelects();
    if(document.getElementById('page-settings')?.classList.contains('active'))renderAccountManageSection();
  }catch(e){accountsList=[];}
}

function getDefaultAccountId(){
  const def=accountsList.find(a=>a.is_default)||accountsList[0];
  return def?def.id:'';
}

function renderAccountSelects(){
  ['f-akun','f-akun-tujuan'].forEach(id=>{
    const sel=document.getElementById(id);if(!sel)return;
    const cur=sel.value;
    sel.innerHTML=accountsList.map(a=>`<option value="${a.id}">${a.nama}</option>`).join('');
    if(cur&&accountsList.some(a=>a.id===cur))sel.value=cur;
    else if(id==='f-akun')sel.value=getDefaultAccountId();
  });
}

// ------------------------
// Rincian saldo per akun (popup di Home)
// ------------------------
async function computeAccountBreakdown(){
  const month=getMonth(),nextMonth=getNextMonth();
  const data=await sb(`transactions?user_id=eq.${user.id}&tanggal=gte.${month}-01&tanggal=lt.${nextMonth}-01&select=*`);
  const map={};
  accountsList.forEach(a=>{map[a.id]={account:a,masuk:0,keluar:0,transferIn:0,transferOut:0};});
  (data||[]).forEach(t=>{
    const n=Number(t.nominal);
    if(t.jenis==='transfer'){
      if(map[t.account_id])map[t.account_id].transferOut+=n;
      if(map[t.to_account_id])map[t.to_account_id].transferIn+=n;
    }else if(t.jenis==='pemasukan'){
      if(map[t.account_id])map[t.account_id].masuk+=n;
    }else if(t.jenis==='pengeluaran'){
      if(map[t.account_id])map[t.account_id].keluar+=n;
    }
  });
  return Object.values(map).map(m=>({
    ...m,
    saldo:(Number(m.account.saldo_awal)||0)+m.masuk-m.keluar+m.transferIn-m.transferOut
  }));
}

async function showBalanceBreakdown(){
  if(!user)return;
  const modal=document.getElementById('balance-breakdown-modal');
  const body=document.getElementById('breakdown-body');
  modal.classList.add('open');
  body.innerHTML='<div class="skeleton" style="height:70px;margin-bottom:8px"></div><div class="skeleton" style="height:70px"></div>';
  try{
    if(!accountsList.length)await loadAccounts();
    const rows=await computeAccountBreakdown();
    const totalSaldo=rows.reduce((s,r)=>s+r.saldo,0);
    const totalMasuk=rows.reduce((s,r)=>s+r.masuk,0);
    const totalKeluar=rows.reduce((s,r)=>s+r.keluar,0);
    body.innerHTML=`<div style="text-align:center;padding:6px 0 18px">
        <div style="font-size:11px;color:var(--text3)">Total Saldo Semua Akun</div>
        <div style="font-size:26px;font-weight:800;color:var(--text)">${rpF(totalSaldo)}</div>
        <div style="display:flex;justify-content:center;gap:16px;margin-top:6px;font-size:11px">
          <span style="color:var(--green)">↓ ${rpF(totalMasuk)}</span>
          <span style="color:var(--red)">↑ ${rpF(totalKeluar)}</span>
        </div>
      </div>`+
      (rows.length?rows.map(r=>`<div style="background:var(--bg3);border-radius:12px;padding:12px 14px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px">
          <div style="font-size:13px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:6px"><i class="ti ti-wallet" style="color:var(--green)"></i> ${r.account.nama}${r.account.is_default?' <span style="font-size:9px;font-weight:600;color:var(--text3);background:var(--border2);padding:1px 6px;border-radius:6px">Default</span>':''}</div>
          <div style="font-size:14px;font-weight:800;color:var(--text)">${rpF(r.saldo)}</div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px">
          <span style="color:var(--green)">↓ Masuk: ${rpF(r.masuk)}</span>
          <span style="color:var(--red)">↑ Keluar: ${rpF(r.keluar)}</span>
        </div>
      </div>`).join(''):'<div style="text-align:center;padding:16px;font-size:12px;color:var(--text3)">Belum ada akun</div>')+
      `<div style="font-size:10px;color:var(--text3);text-align:center;margin-top:4px">Dihitung dari saldo awal akun + transaksi bulan ini</div>`;
  }catch(e){body.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">Gagal memuat rincian</div>';}
}

// ------------------------
// Kelola Akun (Settings)
// ------------------------
function renderAccountManageSection(){
  const el=document.getElementById('account-list');if(!el)return;
  if(!accountsList.length){el.innerHTML='<div style="text-align:center;padding:12px;font-size:12px;color:var(--text3)">Belum ada akun</div>';return;}
  el.innerHTML=accountsList.map(a=>`<div class="set-row" style="cursor:default">
      <div class="set-ico" style="background:var(--green-bg);color:var(--green)"><i class="ti ti-wallet"></i></div>
      <div style="flex:1"><div class="set-lbl">${a.nama}${a.is_default?' <span style="font-size:9px;font-weight:600;color:var(--text3);background:var(--border2);padding:1px 6px;border-radius:6px">Default</span>':''}${a.is_system?' <span style="font-size:9px;font-weight:600;color:var(--blue);background:var(--blue-bg);padding:1px 6px;border-radius:6px">Sistem</span>':''}</div><div class="set-sub">Saldo awal: ${rpF(a.saldo_awal)}</div></div>
      <button onclick="openAccountEdit('${a.id}')" style="background:var(--blue-bg);border:1px solid var(--blue);color:var(--blue);padding:5px 9px;border-radius:7px;font-size:11px;cursor:pointer;margin-right:4px"><i class="ti ti-pencil"></i></button>
      ${a.is_system?'':`<button onclick="deleteAccount('${a.id}')" style="background:var(--red-bg);border:1px solid var(--red);color:var(--red);padding:5px 9px;border-radius:7px;font-size:11px;cursor:pointer"><i class="ti ti-trash"></i></button>`}
    </div>`).join('');
}
function openAccountAdd(){
  editingAccountId=null;
  document.getElementById('acc-modal-title').textContent='Tambah Akun';
  document.getElementById('acc-nama').value='';
  document.getElementById('acc-saldo').value='0';
  document.getElementById('acc-default').checked=accountsList.length===0;
  document.getElementById('account-modal').classList.add('open');
}
function openAccountEdit(id){
  const a=accountsList.find(x=>x.id===id);if(!a)return;
  editingAccountId=id;
  document.getElementById('acc-modal-title').textContent='Edit Akun';
  document.getElementById('acc-nama').value=a.nama;
  document.getElementById('acc-saldo').value=a.saldo_awal;
  document.getElementById('acc-default').checked=!!a.is_default;
  document.getElementById('account-modal').classList.add('open');
}
async function saveAccount(){
  const nama=document.getElementById('acc-nama').value.trim();
  const saldo=parseFloat(document.getElementById('acc-saldo').value)||0;
  const wantDefault=document.getElementById('acc-default').checked;
  if(!nama){showToast('Nama akun wajib diisi!','err');return;}
  try{
    let accId=editingAccountId;
    if(accId){
      await sb(`accounts?id=eq.${accId}&user_id=eq.${user.id}`,'PATCH',{nama,saldo_awal:saldo});
    }else{
      const res=await sb('accounts','POST',{user_id:user.id,nama,saldo_awal:saldo,is_default:false});
      accId=res?.[0]?.id;
    }
    if(wantDefault&&accId){
      await sb(`accounts?user_id=eq.${user.id}`,'PATCH',{is_default:false});
      await sb(`accounts?id=eq.${accId}`,'PATCH',{is_default:true});
    }
    document.getElementById('account-modal').classList.remove('open');
    editingAccountId=null;
    await loadAccounts();
    showToast('Akun disimpan ✓','ok');
  }catch(e){showToast(e.message.includes('unique')?'Nama akun sudah ada!':'Gagal: '+e.message,'err');}
}
async function deleteAccount(id){
  const acc=accountsList.find(a=>a.id===id);
  if(acc?.is_system){showToast('Akun sistem (Cash) tidak bisa dihapus, tapi boleh diganti nama','warn');return;}
  if(accountsList.length<=1){showToast('Minimal harus ada 1 akun!','warn');return;}
  if(!confirm('Hapus akun ini? Transaksi lama yang terhubung akan kehilangan info akun.'))return;
  try{
    const wasDefault=accountsList.find(a=>a.id===id)?.is_default;
    await sb(`accounts?id=eq.${id}&user_id=eq.${user.id}`,'DELETE');
    await loadAccounts();
    if(wasDefault&&accountsList.length)await sb(`accounts?id=eq.${accountsList[0].id}`,'PATCH',{is_default:true});
    await loadAccounts();
    showToast('Akun dihapus','ok');
  }catch(e){showToast('Gagal hapus akun','err');}
}
