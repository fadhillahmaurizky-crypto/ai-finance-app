async function loadTrx(filter='semua',cid='txn-home',limit=4){
  const el=document.getElementById(cid);if(!el)return;
  el.innerHTML='<div class="skeleton" style="height:60px;margin-bottom:6px"></div><div class="skeleton" style="height:60px;margin-bottom:6px"></div><div class="skeleton" style="height:60px"></div>';
  try{
    let q=`transactions?user_id=eq.${user.id}&order=tanggal.desc,created_at.desc&limit=${limit||100}`;
    if(filter==='pemasukan')q+=`&jenis=eq.pemasukan`;
    else if(filter==='pengeluaran')q+=`&jenis=eq.pengeluaran`;
    const data=await sb(q);
    renderTxn(data,cid);
  }catch(e){el.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">Gagal memuat</div>';}
}

const IM={makanan:'tools-kitchen-2',transportasi:'motorbike',hiburan:'device-gamepad-2',tagihan:'receipt',belanja:'shopping-bag',gaji:'wallet',bonus:'gift',arisan:'users',jualan:'shopping-cart',saldo_awal:'piggy-bank'};
const BG={makanan:'#FFF0F0',transportasi:'#EBF3FF',hiburan:'#F3EEFF',tagihan:'#FEF3C7',belanja:'#FFF0FF',gaji:'var(--green-bg)',bonus:'var(--green-bg)',arisan:'var(--green-bg)',jualan:'var(--green-bg)',saldo_awal:'var(--green-bg)'};
const CL={makanan:'#EF4444',transportasi:'#2B7EF8',hiburan:'#8B5CF6',tagihan:'#F59E0B',belanja:'#EC4899',gaji:'var(--green)',bonus:'var(--green)',arisan:'var(--green)',jualan:'var(--green)',saldo_awal:'var(--green)'};

function renderTxn(txns,cid){const el=document.getElementById(cid);if(!el)return;if(!txns||!txns.length){el.innerHTML='<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px">Belum ada transaksi</div>';return;}el.innerHTML=txns.map(t=>{const k=(t.kategori||'').toLowerCase();const isI=(t.jenis||'').toLowerCase()==='pemasukan';const ico=IM[k]||'coin';const bg=BG[k]||(isI?'var(--green-bg)':'var(--red-bg)');const cl=CL[k]||(isI?'var(--green)':'var(--red)');return`<div class="txn-card"><div class="txn-ico" style="background:${bg};color:${cl}"><i class="ti ti-${ico}"></i></div><div class="txn-info"><div class="txn-name">${t.keterangan||t.kategori||'Transaksi'}</div><div class="txn-sub">${t.jenis||''} • ${t.kategori||''}</div></div><div class="txn-right"><div class="txn-amt ${isI?'inc':'exp'}">${isI?'+':'-'}${rpF(t.nominal)}</div><div class="txn-time">${t.tanggal||''}</div></div></div>`;}).join('');}

function filterHome(btn,f){document.querySelectorAll('#home-tabs .tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');loadTrx(f,'txn-home',4);}
function filterAll(btn,f){btn.closest('.tab-strip').querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');loadTrx(f,'txn-all',100);}

async function loadTargets(){try{const data=await sb(`targets?user_id=eq.${user.id}&order=created_at.asc`);targets=data||[];}catch(e){targets=[];}}
async function renderTargets(){
  const el=document.getElementById('target-list');if(!el)return;
  el.innerHTML='<div class="skeleton" style="height:80px;margin-bottom:8px"></div><div class="skeleton" style="height:80px"></div>';
  await loadTargets();
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

function setJenis(j){jenis=j;document.getElementById('btn-in').className='jenis-btn'+(j==='pemasukan'?' in':'');document.getElementById('btn-out').className='jenis-btn'+(j==='pengeluaran'?' out':'');}
async function submitTrx(){
  const nom=document.getElementById('f-nominal').value;const kat=document.getElementById('f-kat').value;const pri=document.getElementById('f-pri').value;const ket=document.getElementById('f-ket').value;
  if(!nom||nom<=0){showToast('Masukkan nominal!','err');return;}if(!kat){showToast('Pilih kategori!','err');return;}
  const btn=document.getElementById('btn-submit');btn.disabled=true;btn.innerHTML='<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Menyimpan...';
  try{
    await sb('transactions','POST',{user_id:user.id,jenis,nominal:parseFloat(nom),kategori:kat,prioritas:pri,keterangan:ket,tanggal:new Date().toISOString().substring(0,10)});
    showToast('Tersimpan ✓','ok');
    ['f-nominal','f-ket'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('f-kat').value='';
    document.getElementById('form-title').textContent='Transaksi Baru';
    document.getElementById('struk-prev-wrap').style.display='none';
    await loadSummary();await loadTrx('semua','txn-home',4);goPage('home');
  }
  catch(e){showToast('Gagal: '+e.message,'err');}
  btn.disabled=false;btn.innerHTML='<i class="ti ti-device-floppy"></i> Simpan Transaksi';
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
    const resp=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+getKey()},body:JSON.stringify({model:'meta-llama/llama-4-scout-17b-16e-instruct',max_tokens:400,messages:[{role:'user',content:[{type:'image_url',image_url:{url:`data:${file.type||'image/jpeg'};base64,${b64}`}},{type:'text',text:'Baca struk ini. Kembalikan JSON saja tanpa penjelasan: {"toko":"nama toko","total":angka,"kategori":"makanan/belanja/transportasi/tagihan/hiburan/lainnya","prioritas":"penting/tidak penting","keterangan":"deskripsi max 30 karakter"}. Jika bukan struk: {"error":"Bukan struk"}'}]}]})});
    const d=await resp.json();const m=(d.choices?.[0]?.message?.content||'').match(/\{[\s\S]*\}/);if(!m)throw new Error('Format tidak valid');
    const h=JSON.parse(m[0]);if(h.error)throw new Error(h.error);
    setJenis('pengeluaran');document.getElementById('f-nominal').value=h.total||'';document.getElementById('f-ket').value=h.keterangan||h.toko||'';
    for(let o of document.getElementById('f-kat').options)if(o.value===(h.kategori||'lainnya')){o.selected=true;break;}
    document.getElementById('struk-result').style.display='block';document.getElementById('struk-result').innerHTML=`✅ Terbaca! 🏪 ${h.toko||'—'} · 💰 ${rpF(h.total)}<br><span style="font-size:10px;opacity:.8">Form sudah terisi ↓</span>`;
    document.getElementById('form-title').textContent='✅ Dari Struk';showToast('Struk terbaca ✓','ok');
    aiScan++;user.ai_scan_count=aiScan;sb(`users?id=eq.${user.id}`,'PATCH',{ai_scan_count:aiScan}).catch(()=>{});renderPlanCard();
  }catch(e){document.getElementById('struk-result').style.cssText='display:block;background:var(--red-bg);color:var(--red);border-radius:10px;padding:10px 12px;font-size:11px;margin-top:8px';document.getElementById('struk-result').textContent='❌ Gagal: '+e.message;}
  document.getElementById('struk-loading').style.display='none';input.value='';
}

