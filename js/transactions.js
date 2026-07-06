async function loadTrx(filter='semua',cid='txn-home',limit=5){
  const el=document.getElementById(cid);if(!el)return;
  el.innerHTML='<div class="skeleton" style="height:60px;margin-bottom:6px"></div><div class="skeleton" style="height:60px;margin-bottom:6px"></div><div class="skeleton" style="height:60px"></div>';
  try{
    let q=`transactions?user_id=eq.${user.id}&order=tanggal.desc,created_at.desc&limit=${limit||100}`;
    if(filter==='pemasukan'||filter==='pengeluaran'||filter==='transfer')q+=`&jenis=eq.${filter}`;
    const data=await sb(q);
    renderTxn(data,cid);
  }catch(e){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">Gagal memuat</div>';}
}

const IM={makan:'tools-kitchen-2',makanan:'tools-kitchen-2',belanja:'shopping-bag',elektronik:'device-laptop',pulsa:'device-mobile',paket_data:'wifi',transportasi:'motorbike',hiburan:'device-gamepad-2',tagihan:'receipt',gaji:'wallet',bonus:'gift',arisan:'users',jualan:'shopping-cart',saldo_awal:'piggy-bank',lainnya:'coin'};
const BG={makan:'#FFF0F0',makanan:'#FFF0F0',belanja:'#FFF0FF',elektronik:'#EBF3FF',pulsa:'#F3EEFF',paket_data:'#EBF9FF',transportasi:'#EBF3FF',hiburan:'#F3EEFF',tagihan:'#FEF3C7',gaji:'var(--green-bg)',bonus:'var(--green-bg)',arisan:'var(--green-bg)',jualan:'var(--green-bg)',saldo_awal:'var(--green-bg)'};
const CL={makan:'#EF4444',makanan:'#EF4444',belanja:'#EC4899',elektronik:'#2B7EF8',pulsa:'#8B5CF6',paket_data:'#06B6D4',transportasi:'#2B7EF8',hiburan:'#8B5CF6',tagihan:'#F59E0B',gaji:'var(--green)',bonus:'var(--green)',arisan:'var(--green)',jualan:'var(--green)',saldo_awal:'var(--green)'};

let txnCache={};
function renderTxn(txns,cid){
  const el=document.getElementById(cid);if(!el)return;
  if(!txns||!txns.length){el.innerHTML='<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">Belum ada transaksi</div>';return;}
  txns.forEach(t=>{txnCache[t.id]=t;});
  el.innerHTML=txns.map(t=>{
    const k=(t.kategori||'').toLowerCase();
    const isI=(t.jenis||'').toLowerCase()==='pemasukan';
    const isT=(t.jenis||'').toLowerCase()==='transfer';
    const ico=isT?'arrows-left-right':(IM[k]||'coin');
    const bg=isT?'var(--blue-bg)':(BG[k]||(isI?'var(--green-bg)':'var(--red-bg)'));
    const cl=isT?'var(--blue)':(CL[k]||(isI?'var(--green)':'var(--red)'));
    return`<div class="txn-card" onclick="openTrxDetailById('${t.id}')"><div class="txn-ico" style="background:${bg};color:${cl}"><i class="ti ti-${ico}"></i></div><div class="txn-info"><div class="txn-name">${t.keterangan||t.kategori||'Transaksi'}</div><div class="txn-sub">${t.jenis||''} • ${t.kategori||''}</div></div><div class="txn-right"><div class="txn-amt ${isI?'inc':isT?'':'exp'}">${isI?'+':isT?'⇄ ':'-'}${rpF(t.nominal)}</div><div class="txn-time">${t.tanggal||''}</div></div></div>`;
  }).join('');
}

function filterHome(btn,f){document.querySelectorAll('#home-tabs .tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');loadTrx(f,'txn-home',5);}

let txAllFilter={jenis:'semua',range:'7d'};
function setTxFilterJenis(btn,f){document.querySelectorAll('#txn-jenis-filter .tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');txAllFilter.jenis=f;applyTransaksiFilter();}
function setTxFilterRange(btn,r){document.querySelectorAll('#txn-range-filter .tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');txAllFilter.range=r;applyTransaksiFilter();}
function renderTransaksiFilters(){
  document.querySelectorAll('#txn-jenis-filter .tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.f===txAllFilter.jenis));
  document.querySelectorAll('#txn-range-filter .tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.r===txAllFilter.range));
}
async function applyTransaksiFilter(){
  const el=document.getElementById('txn-all');if(!el)return;
  el.innerHTML='<div class="skeleton" style="height:60px;margin-bottom:6px"></div><div class="skeleton" style="height:60px;margin-bottom:6px"></div><div class="skeleton" style="height:60px"></div>';
  try{
    let q=`transactions?user_id=eq.${user.id}&order=tanggal.desc,created_at.desc&limit=300`;
    if(txAllFilter.jenis!=='semua')q+=`&jenis=eq.${txAllFilter.jenis}`;
    if(txAllFilter.range==='7d'){const d=new Date();d.setDate(d.getDate()-6);q+=`&tanggal=gte.${d.toISOString().substring(0,10)}`;}
    else if(txAllFilter.range==='30d'){const d=new Date();d.setDate(d.getDate()-29);q+=`&tanggal=gte.${d.toISOString().substring(0,10)}`;}
    else if(txAllFilter.range==='bulan'){const month=getMonth(),nextMonth=getNextMonth();q+=`&tanggal=gte.${month}-01&tanggal=lt.${nextMonth}-01`;}
    const data=await sb(q);
    renderTxn(data,'txn-all');
  }catch(e){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">Gagal memuat</div>';}
}

async function loadTargets(){try{const data=await sb(`targets?user_id=eq.${user.id}&order=created_at.asc`);targets=data||[];}catch(e){targets=[];}}
async function renderTargets(){
  const el=document.getElementById('target-list');if(!el)return;
  el.innerHTML='<div class="skeleton" style="height:80px;margin-bottom:8px"></div><div class="skeleton" style="height:80px"></div>';
  await loadTargets();
  if(typeof checkTargetNotif==='function')checkTargetNotif(targets);
  if(!targets.length){el.innerHTML='<div style="text-align:center;padding:24px 0;color:var(--text3);font-size:13px">Belum ada target. Buat yang pertama! 🎯</div>';return;}
  const IC=['🏠','✈️','📱','🚗','💍','💻','🎓','💰'];const CO=['var(--green)','var(--blue)','var(--amber)','#8B5CF6','#EC4899'];
  el.innerHTML=targets.map((t,i)=>{const pct=Math.min(100,Math.round((t.terkumpul/t.nominal)*100));const col=CO[i%CO.length];const dl=t.deadline?new Date(t.deadline).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}):'Tanpa deadline';return`<div class="target-card"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="width:38px;height:38px;border-radius:12px;background:${col}20;color:${col};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${IC[i%IC.length]}</div><div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text)">${t.nama}</div><div style="font-size:10px;color:var(--text3)">🗓️ ${dl}</div></div><div style="font-size:12px;font-weight:700;color:${col}">${pct}%</div><button onclick="delTarget('${t.id}')" style="background:none;border:none;color:var(--text3);font-size:16px;cursor:pointer;padding:4px"><i class="ti ti-trash"></i></button></div><div class="target-progress"><div class="target-fill" style="width:${pct}%;background:${col}"></div></div><div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:${col};font-weight:600">${rpF(t.terkumpul)}</span><span style="color:var(--text3)">Target: ${rpF(t.nominal)}</span></div>${pct>=100?'<div style="margin-top:6px;font-size:11px;color:var(--green);font-weight:600">🎉 Target tercapai!</div>':'<div style="margin-top:6px;font-size:11px;color:var(--text3)">Sisa: '+rpF(t.nominal-t.terkumpul)+'</div>'}</div>`;}).join('');
}
async function saveTarget(){
  const n=document.getElementById('t-nama').value.trim();const nom=parseFloat(document.getElementById('t-nominal').value);const terk=parseFloat(document.getElementById('t-terkumpul').value)||0;const dl=document.getElementById('t-deadline').value;
  if(!n){showToast('Masukkan nama!','err');return;}if(!nom||nom<=0){showToast('Masukkan nominal!','err');return;}
  try{
    await sb('targets','POST',{user_id:user.id,nama:n,nominal:nom,terkumpul:terk,deadline:dl||null});
    await renderTargets();document.getElementById('target-modal').classList.remove('open');
    ['t-nama','t-nominal','t-terkumpul','t-deadline'].forEach(id=>document.getElementById(id).value='');
    showToast('Target ditambahkan 🎯','ok');
  }catch(e){showToast('Gagal: '+e.message,'err');}
}
async function delTarget(id){
  if(confirm('Hapus target ini?')){
    try{await sb(`targets?id=eq.${id}&user_id=eq.${user.id}`,'DELETE');await renderTargets();}
    catch(e){showToast('Gagal hapus','err');}
  }
}

let editingTrxId=null;
function goCatatTransfer(){resetTrxForm();goPage('catat');setJenis('transfer');}
function setJenis(j){
  jenis=j;
  document.getElementById('btn-in').className='jenis-btn'+(j==='pemasukan'?' in':'');
  document.getElementById('btn-out').className='jenis-btn'+(j==='pengeluaran'?' out':'');
  const btnT=document.getElementById('btn-transfer');
  if(btnT)btnT.className='jenis-btn'+(j==='transfer'?' transfer':'');
  const isTransfer=j==='transfer';
  const katPri=document.getElementById('kat-pri-wrap');if(katPri)katPri.style.display=isTransfer?'none':'block';
  const trWrap=document.getElementById('transfer-wrap');if(trWrap)trWrap.style.display=isTransfer?'block':'none';
  if(!isTransfer&&typeof renderKategoriSelect==='function')renderKategoriSelect();
  const akunLbl=document.getElementById('akun-label');if(akunLbl)akunLbl.textContent=isTransfer?'Dari Akun':'Akun';
}
function resetTrxForm(){
  ['f-nominal','f-ket'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const katEl=document.getElementById('f-kat');if(katEl)katEl.value='';
  document.getElementById('form-title').textContent='Transaksi Baru';
  document.getElementById('struk-prev-wrap').style.display='none';
  const akunEl=document.getElementById('f-akun');if(akunEl&&typeof getDefaultAccountId==='function')akunEl.value=getDefaultAccountId();
  document.getElementById('btn-submit').innerHTML='<i class="ti ti-device-floppy"></i> Simpan Transaksi';
  editingTrxId=null;
  setJenis('pemasukan');
}
async function submitTrx(){
  const nom=document.getElementById('f-nominal').value;
  const btn=document.getElementById('btn-submit');
  if(!nom||nom<=0){showToast('Masukkan nominal!','err');return;}
  const payload={user_id:user.id,jenis,nominal:parseFloat(nom),tanggal:new Date().toISOString().substring(0,10)};
  if(jenis==='transfer'){
    const dari=document.getElementById('f-akun')?.value;
    const tujuan=document.getElementById('f-akun-tujuan')?.value;
    if(!dari||!tujuan){showToast('Pilih akun asal dan tujuan!','err');return;}
    if(dari===tujuan){showToast('Akun asal dan tujuan harus berbeda!','err');return;}
    payload.account_id=dari;payload.to_account_id=tujuan;payload.kategori='transfer';payload.prioritas='penting';
    payload.keterangan=document.getElementById('f-ket').value||'Transfer antar akun';
  }else{
    const akun=document.getElementById('f-akun')?.value;
    const kat=document.getElementById('f-kat').value;const pri=document.getElementById('f-pri').value;const ket=document.getElementById('f-ket').value;
    if(!akun){showToast('Pilih akun!','err');return;}
    if(!kat){showToast('Pilih kategori!','err');return;}
    payload.account_id=akun;payload.kategori=kat;payload.prioritas=pri;payload.keterangan=ket;
  }
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Menyimpan...';
  try{
    if(editingTrxId){
      await sb(`transactions?id=eq.${editingTrxId}&user_id=eq.${user.id}`,'PATCH',payload);
      showToast('Transaksi diperbarui ✓','ok');
    }else{
      await sb('transactions','POST',payload);
      showToast('Tersimpan ✓','ok');
    }
    const wasEdit=!!editingTrxId;
    resetTrxForm();
    if(typeof markTransactedToday==='function')markTransactedToday();
    if(typeof runAutosync==='function')await runAutosync();
    else{await loadSummary();await loadTrx('semua','txn-home',5);}
    if(document.getElementById('page-transaksi')?.classList.contains('active'))await applyTransaksiFilter();
    goPage(wasEdit?'transaksi':'home');
  }
  catch(e){showToast('Gagal: '+e.message,'err');}
  btn.disabled=false;
}

async function editTrx(id){
  try{
    const rows=await sb(`transactions?id=eq.${id}&user_id=eq.${user.id}&select=*`);
    const t=rows?.[0];if(!t){showToast('Transaksi tidak ditemukan','err');return;}
    editingTrxId=id;
    document.getElementById('trx-detail-modal').classList.remove('open');
    goPage('catat');
    setJenis(t.jenis);
    document.getElementById('f-nominal').value=t.nominal;
    document.getElementById('f-ket').value=t.keterangan||'';
    if(t.jenis==='transfer'){
      if(document.getElementById('f-akun'))document.getElementById('f-akun').value=t.account_id||'';
      if(document.getElementById('f-akun-tujuan'))document.getElementById('f-akun-tujuan').value=t.to_account_id||'';
    }else{
      if(document.getElementById('f-akun'))document.getElementById('f-akun').value=t.account_id||(typeof getDefaultAccountId==='function'?getDefaultAccountId():'');
      document.getElementById('f-kat').value=t.kategori||'';
      document.getElementById('f-pri').value=t.prioritas||'penting';
    }
    document.getElementById('form-title').textContent='Edit Transaksi';
    document.getElementById('btn-submit').innerHTML='<i class="ti ti-device-floppy"></i> Update Transaksi';
  }catch(e){showToast('Gagal memuat transaksi','err');}
}
async function deleteTrx(id){
  if(!confirm('Hapus transaksi ini?'))return;
  try{
    await sb(`transactions?id=eq.${id}&user_id=eq.${user.id}`,'DELETE');
    document.getElementById('trx-detail-modal').classList.remove('open');
    showToast('Transaksi dihapus','ok');
    if(typeof runAutosync==='function')await runAutosync();
    if(document.getElementById('page-transaksi')?.classList.contains('active'))await applyTransaksiFilter();
  }catch(e){showToast('Gagal hapus','err');}
}
function openTrxDetailById(id){
  const t=txnCache[id];if(!t)return;
  document.getElementById('trx-detail-title').textContent=t.keterangan||t.kategori||'Transaksi';
  document.getElementById('trx-detail-sub').textContent=(t.jenis||'')+' • '+(t.kategori||'')+' • '+(t.tanggal||'');
  const amtEl=document.getElementById('trx-detail-amt');
  const isI=t.jenis==='pemasukan',isT=t.jenis==='transfer';
  amtEl.textContent=(isI?'+':isT?'⇄ ':'-')+rpF(t.nominal);
  amtEl.className='txn-amt '+(isI?'inc':isT?'':'exp');
  document.getElementById('trx-edit-btn').onclick=()=>editTrx(id);
  document.getElementById('trx-del-btn').onclick=()=>deleteTrx(id);
  document.getElementById('trx-detail-modal').classList.add('open');
}

function triggerCam(){if(!canScan()){const plan=getPlan();showToast(plan==='free'?'Scan struk tersedia di paket Pro! Upgrade sekarang 🚀':'Limit scan habis bulan ini','warn');return;}if(!getKey()){showToast('AI belum aktif. Hubungi admin','err');return;}document.getElementById('nav-cam').click();}
async function scanStrukNav(input){if(!input.files||!input.files[0])return;goPage('catat');await new Promise(r=>setTimeout(r,150));await scanStruk(input);}
async function scanStruk(input){
  if(!input.files||!input.files[0])return;
  if(!canScan()){showToast('Limit scan habis atau upgrade ke Pro!','warn');return;}
  if(!getKey()){await loadPoolKey();}
  if(!getKey()){showToast('AI belum aktif','err');return;}
  const file=input.files[0];const reader=new FileReader();reader.onload=e=>{document.getElementById('struk-prev').src=e.target.result;document.getElementById('struk-prev-wrap').style.display='block';};reader.readAsDataURL(file);
  document.getElementById('struk-loading').style.display='block';document.getElementById('struk-result').style.display='none';
  try{
    const b64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=()=>rej(new Error('Gagal'));r.readAsDataURL(file);});
    const resp=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+getKey()},body:JSON.stringify({model:'meta-llama/llama-4-scout-17b-16e-instruct',max_tokens:400,messages:[{role:'user',content:[{type:'image_url',image_url:{url:`data:${file.type||'image/jpeg'};base64,${b64}`}},{type:'text',text:'Baca struk ini. Kembalikan JSON saja tanpa penjelasan: {"toko":"nama toko","total":angka,"kategori":"makan/belanja/elektronik/pulsa/paket_data","prioritas":"penting/tidak_penting","keterangan":"deskripsi max 30 karakter"}. Jika bukan struk: {"error":"Bukan struk"}'}]}]})});
    const d=await resp.json();const m=(d.choices?.[0]?.message?.content||'').match(/\{[\s\S]*\}/);if(!m)throw new Error('Format tidak valid');
    const h=JSON.parse(m[0]);if(h.error)throw new Error(h.error);
    setJenis('pengeluaran');document.getElementById('f-nominal').value=h.total||'';document.getElementById('f-ket').value=h.keterangan||h.toko||'';
    if(document.getElementById('f-akun')&&typeof getDefaultAccountId==='function')document.getElementById('f-akun').value=getDefaultAccountId();
    for(let o of document.getElementById('f-kat').options)if(o.value===(h.kategori||'lainnya')){o.selected=true;break;}
    document.getElementById('struk-result').style.display='block';document.getElementById('struk-result').innerHTML=`✅ Terbaca! 🏪 ${h.toko||'—'} · 💰 ${rpF(h.total)}<br><span style="font-size:10px;opacity:.8">Form sudah terisi ↓</span>`;
    document.getElementById('form-title').textContent='✅ Dari Struk';showToast('Struk terbaca ✓','ok');
    aiScan++;user.ai_scan_count=aiScan;sb(`users?id=eq.${user.id}`,'PATCH',{ai_scan_count:aiScan}).catch(()=>{});renderPlanCard();
  }catch(e){document.getElementById('struk-result').style.cssText='display:block;background:var(--red-bg);color:var(--red);border-radius:10px;padding:10px 12px;font-size:11px;margin-top:8px';document.getElementById('struk-result').textContent='❌ Gagal: '+e.message;}
  document.getElementById('struk-loading').style.display='none';input.value='';
}

