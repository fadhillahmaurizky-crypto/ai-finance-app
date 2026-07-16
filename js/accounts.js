// ========================
// AKUN (default: Cash)
// ========================
let accountsList=[];

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
    if(document.getElementById('page-akun')?.classList.contains('active'))renderAkunFullList();
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
// Saldo akun tunggal, all-time (dipakai untuk cek saldo cukup sebelum
// pengeluaran/transfer disubmit) — sama modelnya dengan Saldo Sekarang
// di database.md: saldo_awal + seluruh riwayat transaksi akun itu.
// excludeTrxId dipakai saat edit transaksi, supaya nominal transaksi lama
// tidak ikut terhitung dua kali.
// ------------------------
async function getAccountBalance(accountId,excludeTrxId){
  if(!accountId)return 0;
  const acc=(accountsList||[]).find(a=>a.id===accountId);
  const saldoAwal=Number(acc?.saldo_awal)||0;
  try{
    const rows=await sb(`transactions?user_id=eq.${user.id}&or=(account_id.eq.${accountId},to_account_id.eq.${accountId})&select=id,jenis,nominal,account_id,to_account_id`);
    let masuk=0,keluar=0,transferIn=0,transferOut=0;
    (rows||[]).forEach(t=>{
      if(excludeTrxId&&t.id===excludeTrxId)return;
      const n=Number(t.nominal);
      if(t.jenis==='transfer'){
        if(t.account_id===accountId)transferOut+=n;
        if(t.to_account_id===accountId)transferIn+=n;
      }else if(t.jenis==='pemasukan'&&t.account_id===accountId){masuk+=n;}
      else if(t.jenis==='pengeluaran'&&t.account_id===accountId){keluar+=n;}
    });
    return saldoAwal+masuk-keluar+transferIn-transferOut;
  }catch(e){return saldoAwal;}
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
          <span style="color:var(--green)">↓ Masuk: ${rpF(r.masuk+r.transferIn)}</span>
          <span style="color:var(--red)">↑ Keluar: ${rpF(r.keluar+r.transferOut)}</span>
        </div>
      </div>`).join(''):'<div style="text-align:center;padding:16px;font-size:12px;color:var(--text3)">Belum ada akun</div>')+
      `<div style="font-size:10px;color:var(--text3);text-align:center;margin-top:4px">Dihitung dari saldo awal akun + transaksi bulan ini</div>`;
  }catch(e){body.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">Gagal memuat rincian</div>';}
}

// ------------------------
// Kelola Akun (page-akun, halaman penuh) -- lihat
// wangku-spec-downgrade-payment-akun.md #3. Dulu section inline di
// Settings + popup (account-modal, dua langkah form->success). Sekarang
// dipindah ke halaman penuh tersendiri, pola edit-inline yang SAMA
// dengan Kelola Kategori/Kelola Prioritas (categories.js/priorities.js)
// -- tap pensil menukar isi baris jadi form inline, bukan modal terpisah.
// Aturan is_system/is_default/minimal-1-akun di bawah TIDAK berubah,
// cuma tempat renderingnya yang pindah.
// ------------------------
async function renderAkunFullList(){
  const el=document.getElementById('akun-full-list');if(!el)return;
  if(!accountsList.length){el.innerHTML='<div style="text-align:center;padding:20px;font-size:12px;color:var(--text3)">Belum ada akun</div>';return;}
  el.innerHTML=accountsList.map(akunRowHtml).join('');
}
function akunRowHtml(a){
  return `<div id="akun-row-${a.id}" style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;margin-bottom:8px">
    <div class="set-ico" style="background:var(--green-bg);color:var(--green)"><i class="ti ti-wallet"></i></div>
    <div style="flex:1">
      <div style="font-size:13px;font-weight:600;color:var(--text)">${a.nama}${a.is_default?' <span style="font-size:9px;font-weight:600;color:var(--text3);background:var(--border2);padding:1px 6px;border-radius:6px">Default</span>':''}${a.is_system?' <span style="font-size:9px;font-weight:600;color:var(--blue);background:var(--blue-bg);padding:1px 6px;border-radius:6px">Sistem</span>':''}</div>
      <div style="font-size:11px;color:var(--text3)">Saldo awal: ${rpF(a.saldo_awal)}</div>
    </div>
    <button onclick="editAkunFull('${a.id}')" style="background:var(--blue-bg);border:1px solid var(--blue);color:var(--blue);padding:6px 11px;border-radius:8px;font-size:11px;cursor:pointer"><i class="ti ti-pencil"></i></button>
    ${a.is_system?'':`<button onclick="deleteAccount('${a.id}')" style="background:var(--red-bg);border:1px solid var(--red);color:var(--red);padding:6px 11px;border-radius:8px;font-size:11px;cursor:pointer"><i class="ti ti-trash"></i></button>`}
  </div>`;
}
function editAkunFull(id){
  const a=accountsList.find(x=>x.id===id);if(!a)return;
  const row=document.getElementById('akun-row-'+id);if(!row)return;
  row.innerHTML=`
    <div style="flex:1;display:flex;flex-direction:column;gap:6px">
      <input id="edit-akun-nama-${id}" value="${a.nama}" placeholder="Nama akun" style="background:var(--bg3);border:1.5px solid var(--green);border-radius:8px;padding:7px 10px;font-size:13px;color:var(--text);outline:none"/>
      <input id="edit-akun-saldo-${id}" type="number" value="${a.saldo_awal}" placeholder="Saldo awal" style="background:var(--bg3);border:1.5px solid var(--border);border-radius:8px;padding:7px 10px;font-size:12px;color:var(--text);outline:none"/>
      <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text2)"><input type="checkbox" id="edit-akun-default-${id}" ${a.is_default?'checked':''} style="width:15px;height:15px;accent-color:var(--green)"/> Jadikan default</label>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <button onclick="simpanEditAkun('${id}')" style="background:var(--green);border:none;color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer"><i class="ti ti-check"></i></button>
      <button onclick="renderAkunFullList()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text3);padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer"><i class="ti ti-x"></i></button>
    </div>
  `;
  document.getElementById('edit-akun-nama-'+id).focus();
}
async function simpanEditAkun(id){
  const nama=document.getElementById('edit-akun-nama-'+id)?.value.trim();
  const saldo=parseFloat(document.getElementById('edit-akun-saldo-'+id)?.value)||0;
  const wantDefault=document.getElementById('edit-akun-default-'+id)?.checked;
  if(!nama){showToast('Nama akun wajib diisi!','err');return;}
  try{
    await sb(`accounts?id=eq.${id}&user_id=eq.${user.id}`,'PATCH',{nama,saldo_awal:saldo});
    if(wantDefault){
      await sb(`accounts?user_id=eq.${user.id}`,'PATCH',{is_default:false});
      await sb(`accounts?id=eq.${id}`,'PATCH',{is_default:true});
    }
    await loadAccounts();
    if(typeof loadSummary==='function')await loadSummary();
    renderAkunFullList();
    showToast('Akun diupdate ✓','ok');
  }catch(e){showToast(e.message.includes('unique')?'Nama akun sudah ada!':'Gagal: '+e.message,'err');}
}
async function saveAkunFull(){
  const nama=document.getElementById('akun-full-nama').value.trim();
  const saldo=parseFloat(document.getElementById('akun-full-saldo').value)||0;
  const wantDefault=document.getElementById('akun-full-default').checked;
  if(!nama){showToast('Nama akun wajib diisi!','err');return;}
  try{
    const res=await sb('accounts','POST',{user_id:user.id,nama,saldo_awal:saldo,is_default:accountsList.length===0});
    const accId=res?.[0]?.id;
    if(wantDefault&&accId&&accountsList.length>0){
      await sb(`accounts?user_id=eq.${user.id}`,'PATCH',{is_default:false});
      await sb(`accounts?id=eq.${accId}`,'PATCH',{is_default:true});
    }
    document.getElementById('akun-full-nama').value='';
    document.getElementById('akun-full-saldo').value='0';
    document.getElementById('akun-full-default').checked=false;
    await loadAccounts();
    if(typeof loadSummary==='function')await loadSummary();
    renderAkunFullList();
    showToast('Akun ditambahkan ✓','ok');
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
    renderAkunFullList();
    showToast('Akun dihapus','ok');
  }catch(e){showToast('Gagal hapus akun','err');}
}
