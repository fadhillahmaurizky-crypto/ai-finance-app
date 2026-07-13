function checkAlerts(data){
  const el=document.getElementById('alert-section');if(!el||!data)return;
  const kat=data.kategoriPengeluaran||{};const total=data.summary?.totalMasuk||0;
  const alerts=[];
  if(data.summary?.saldo<0)alerts.push({type:'danger',ico:'🔴',title:'Saldo kamu minus!',desc:'Segera tambah pemasukan atau kurangi pengeluaran'});
  if(total>0)Object.entries(kat).forEach(([k,v])=>{const p=(v/total)*100;if(p>=80&&p<100)alerts.push({type:'warn',ico:'⚠️',title:`${k} sudah ${p.toFixed(0)}% dari pemasukan`,desc:`Pengeluaran ${k}: ${rpF(v)}. Hati-hati!`});});
  el.innerHTML=alerts.slice(0,2).map(a=>`<div class="alert-card ${a.type==='danger'?'danger':''}" style="margin-bottom:8px"><div class="alert-ico">${a.ico}</div><div><div class="alert-title">${a.title}</div><div class="alert-desc">${a.desc}</div></div></div>`).join('');
}

// ========================
// TRIAL RE-ENGAGEMENT NUDGE (Home) — cuma muncul 2 hari terakhir trial,
// beda dari renderTrialBanner() di Settings yang tampil sepanjang trial
// ========================
function renderTrialNudge(){
  const wrap=document.getElementById('trial-nudge-wrap');if(!wrap)return;
  const isMaster=user&&(user.role==='admin'||user.username===MASTER);
  if(isMaster||user?.plan!=='pro'||!user?.trial_ends_at){wrap.innerHTML='';return;}
  const end=new Date(user.trial_ends_at);const now=new Date();
  const daysLeft=Math.ceil((end-now)/86400000);
  if(isNaN(daysLeft)||daysLeft<0||daysLeft>2){wrap.innerHTML='';return;}
  const sisa=daysLeft===0?'hari ini':`dalam ${daysLeft} hari`;
  wrap.innerHTML=`<div class="trial-banner" style="cursor:pointer" onclick="openPlanOptions()"><i class="ti ti-hourglass-low"></i><span style="flex:1">Trial-mu berakhir ${sisa}. Upgrade sekarang untuk lanjut pakai AI Chat & WhatsApp bot</span><i class="ti ti-chevron-right"></i></div>`;
}

function countTargetInBalance(){return localStorage.getItem('wangku_count_target_balance')==='1';}

// ========================
// AKSI CEPAT — shortcut pool bisa dikustom lewat "Edit" (localStorage, maks 5 slot)
// ========================
const QA_POOL=[
  {id:'catat',label:'Catat',icon:'plus',bg:'var(--green-bg)',color:'var(--green)',action:"resetTrxForm();goPage('catat')"},
  {id:'pemasukan',label:'Pemasukan',icon:'arrow-down-circle',bg:'var(--green-bg)',color:'var(--green)',action:'goCatatPemasukan()'},
  {id:'pengeluaran',label:'Pengeluaran',icon:'arrow-up-circle',bg:'var(--red-bg)',color:'var(--red)',action:'goCatatPengeluaran()'},
  {id:'tanya-ai',label:'Tanya AI',icon:'robot',bg:'var(--blue-bg)',color:'var(--blue)',action:'openChat()'},
  {id:'target',label:'Target',icon:'target',bg:'var(--amber-bg)',color:'var(--amber)',action:"goPage('target')"},
  {id:'laporan',label:'Laporan',icon:'chart-bar',bg:'#F3EEFF',color:'#7C3AED',action:"goPage('laporan')"},
  {id:'pindah-saldo',label:'Pindah Saldo',icon:'arrows-left-right',bg:'var(--blue-bg)',color:'var(--blue)',action:'goCatatTransfer()'},
  {id:'kategori',label:'Kategori',icon:'tag',bg:'var(--green-bg)',color:'var(--green)',action:"goPage('kategori')"}
];
const QA_DEFAULT=['catat','tanya-ai','target','laporan','kategori'];
function getAksiCepatSelection(){
  try{
    const saved=JSON.parse(localStorage.getItem('wangku_aksi_cepat')||'null');
    if(Array.isArray(saved)&&saved.length)return saved.filter(id=>QA_POOL.some(q=>q.id===id)).slice(0,5);
  }catch(e){}
  return QA_DEFAULT.slice();
}
function setAksiCepatSelection(ids){localStorage.setItem('wangku_aksi_cepat',JSON.stringify(ids.slice(0,5)));}
function renderAksiCepat(){
  const el=document.getElementById('qa-row');if(!el)return;
  const sel=getAksiCepatSelection();
  el.innerHTML=sel.map(id=>{
    const q=QA_POOL.find(x=>x.id===id);if(!q)return'';
    return `<div class="qa-item" onclick="${q.action}"><div class="qa-ico" style="background:${q.bg};color:${q.color}"><i class="ti ti-${q.icon}"></i></div><div class="qa-lbl">${q.label}</div></div>`;
  }).join('');
}

// Urutan kerja saat modal edit terbuka: item terpilih (sesuai urutan tersimpan)
// duluan, baru sisa pool yang belum dipilih. Tombol naik/turun (bukan drag-and-drop —
// drag native HTML5 tidak reliable di touch/TWA tanpa polyfill tambahan) menggeser
// posisi di array ini; checkbox hanya menentukan ikut tampil atau tidak.
let qaEditOrder=[];
function openAksiCepatEdit(){
  const sel=getAksiCepatSelection();
  const remaining=QA_POOL.map(q=>q.id).filter(id=>!sel.includes(id));
  qaEditOrder=[...sel,...remaining];
  renderAksiCepatEditList();
  document.getElementById('aksi-cepat-modal').classList.add('open');
}
function renderAksiCepatEditList(){
  const el=document.getElementById('qa-edit-list');if(!el)return;
  const existing=el.querySelectorAll('input[type=checkbox]');
  const sel=existing.length
    ? new Set(Array.from(existing).filter(c=>c.checked).map(c=>c.dataset.qaId))
    : new Set(getAksiCepatSelection());
  el.innerHTML=qaEditOrder.map((id,i)=>{
    const q=QA_POOL.find(x=>x.id===id);if(!q)return'';
    const checked=sel.has(id);
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 4px">
      <input type="checkbox" data-qa-id="${q.id}" ${checked?'checked':''} onchange="onQaCheckChange(this)" style="width:18px;height:18px;accent-color:var(--green);flex-shrink:0"/>
      <div class="qa-ico" style="background:${q.bg};color:${q.color};width:32px;height:32px;font-size:14px;flex-shrink:0"><i class="ti ti-${q.icon}"></i></div>
      <span style="font-size:13px;color:var(--text);flex:1">${q.label}</span>
      <button onclick="moveQaItem('${q.id}',-1)" ${i===0?'disabled':''} style="background:none;border:none;color:${i===0?'var(--border)':'var(--text3)'};font-size:16px;cursor:pointer;padding:4px"><i class="ti ti-chevron-up"></i></button>
      <button onclick="moveQaItem('${q.id}',1)" ${i===qaEditOrder.length-1?'disabled':''} style="background:none;border:none;color:${i===qaEditOrder.length-1?'var(--border)':'var(--text3)'};font-size:16px;cursor:pointer;padding:4px"><i class="ti ti-chevron-down"></i></button>
    </div>`;
  }).join('');
}
function moveQaItem(id,dir){
  const idx=qaEditOrder.indexOf(id);
  const newIdx=idx+dir;
  if(newIdx<0||newIdx>=qaEditOrder.length)return;
  [qaEditOrder[idx],qaEditOrder[newIdx]]=[qaEditOrder[newIdx],qaEditOrder[idx]];
  renderAksiCepatEditList();
}
function onQaCheckChange(cb){
  const checked=document.querySelectorAll('#qa-edit-list input[type=checkbox]:checked');
  if(checked.length>5){cb.checked=false;showToast('Maksimal 5 shortcut aktif','warn');return;}
  renderAksiCepatEditList();
}
function saveAksiCepat(){
  const checkedIds=new Set(Array.from(document.querySelectorAll('#qa-edit-list input[type=checkbox]:checked')).map(c=>c.dataset.qaId));
  const ids=qaEditOrder.filter(id=>checkedIds.has(id));
  if(!ids.length){showToast('Pilih minimal 1 shortcut!','err');return;}
  setAksiCepatSelection(ids);
  renderAksiCepat();
  document.getElementById('aksi-cepat-modal').classList.remove('open');
  showToast('Aksi Cepat diperbarui ✓','ok');
}

async function loadSummary(){
  document.getElementById('saldo').innerHTML='Memuat...';
  try{
    if(typeof loadAccounts==='function'&&(!accountsList||!accountsList.length))await loadAccounts();
    if(typeof loadTargets==='function'&&(!targets||!targets.length))await loadTargets();

    // SALDO SEKARANG = saldo awal semua akun + SEMUA transaksi (all-time), transfer dilewati (internal antar akun)
    const allData=await sb(`transactions?user_id=eq.${user.id}&select=jenis,nominal`);
    let totalMasukAll=0,totalKeluarAll=0;
    (allData||[]).forEach(t=>{
      const n=Number(t.nominal);
      if(t.jenis==='pemasukan')totalMasukAll+=n;
      else if(t.jenis==='pengeluaran')totalKeluarAll+=n;
    });
    const saldoAwalTotal=(accountsList||[]).reduce((s,a)=>s+(Number(a.saldo_awal)||0),0);
    let saldo=saldoAwalTotal+totalMasukAll-totalKeluarAll;
    if(countTargetInBalance()){
      const targetTotal=(targets||[]).reduce((s,t)=>s+(Number(t.terkumpul)||0),0);
      saldo+=targetTotal;
    }

    // RINGKASAN BULAN INI (untuk insight, kesehatan keuangan, kategori breakdown di Laporan)
    const month=getMonth(),nextMonth=getNextMonth();
    const data=await sb(`transactions?user_id=eq.${user.id}&tanggal=gte.${month}-01&tanggal=lt.${nextMonth}-01&select=*&order=tanggal.desc`);
    let totalMasuk=0,totalKeluar=0,tidakPenting=0;
    const kategoriPengeluaran={},kategoriPemasukan={};
    (data||[]).forEach(t=>{
      const n=Number(t.nominal);
      if(t.jenis==='pemasukan'){totalMasuk+=n;kategoriPemasukan[t.kategori]=(kategoriPemasukan[t.kategori]||0)+n;}
      else if(t.jenis==='pengeluaran'){totalKeluar+=n;kategoriPengeluaran[t.kategori]=(kategoriPengeluaran[t.kategori]||0)+n;if(t.prioritas==='tidak_penting')tidakPenting+=n;}
      // jenis 'transfer' dilewati — perpindahan antar akun, bukan pemasukan/pengeluaran riil
    });

    // Bulan lalu (untuk insight & tren)
    let prevMasuk=0,prevKeluar=0;const prevKat={};
    try{
      const d=new Date();d.setMonth(d.getMonth()-1);
      const prevMonth=d.toISOString().substring(0,7);
      const prevData=await sb(`transactions?user_id=eq.${user.id}&tanggal=gte.${prevMonth}-01&tanggal=lt.${month}-01&select=jenis,nominal,kategori`);
      (prevData||[]).forEach(t=>{const n=Number(t.nominal);if(t.jenis==='pemasukan')prevMasuk+=n;else if(t.jenis==='pengeluaran'){prevKeluar+=n;prevKat[t.kategori]=(prevKat[t.kategori]||0)+n;}});
    }catch(e){}

    sumData={summary:{saldo,totalMasuk,totalKeluar,tidakPenting,totalMasukAll,totalKeluarAll,saldoAwalTotal,prevMasuk,prevKeluar},kategoriPengeluaran,kategoriPemasukan,prevKategoriPengeluaran:prevKat};

    const sEl=document.getElementById('saldo');
    sEl.innerHTML=rpF(saldo);
    sEl.className='bal-amount'+(saldo<0?' neg':'');
    const mEl=document.getElementById('mini-bal');
    if(mEl){mEl.textContent=rpF(saldo);mEl.className='mini-bal-amt'+(saldo<0?' neg':'');}
    document.getElementById('tot-masuk').textContent=rpF(totalMasukAll);
    document.getElementById('tot-keluar').textContent=rpF(totalKeluarAll);
    updateCtx(sumData);checkAlerts(sumData);
    if(typeof checkOverspendNotif==='function')checkOverspendNotif(totalMasuk,totalKeluar);
    if(document.getElementById('page-laporan')?.classList.contains('active'))renderLaporan();
    if(typeof renderHealthAndTarget==='function')renderHealthAndTarget();
    if(typeof renderInsightBox==='function')renderInsightBox();
    if(typeof renderBalanceSparkline==='function')renderBalanceSparkline();
    if(typeof applyBalanceVisibility==='function')applyBalanceVisibility();
  }catch(e){document.getElementById('saldo').innerHTML='Gagal memuat';}
}

const PC=['#00B26A','#2B7EF8','#F59E0B','#EF4444','#8B5CF6','#EC4899'];
function renderPie(kat,svgId,legendId,emptyId){
  const svg=document.getElementById(svgId);const legend=document.getElementById(legendId);const emptyEl=emptyId?document.getElementById(emptyId):null;
  if(!svg||!legend)return;
  const e=kat?Object.entries(kat).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]):[];
  if(!e.length){
    svg.innerHTML='<circle cx="40" cy="40" r="30" fill="none" stroke="var(--bg3)" stroke-width="14"/>';
    legend.innerHTML='';
    if(emptyEl)emptyEl.style.display='block';
    return;
  }
  if(emptyEl)emptyEl.style.display='none';
  const tot=e.reduce((s,[,v])=>s+v,0);let off=0;const c=2*Math.PI*30;
  svg.innerHTML='<circle cx="40" cy="40" r="30" fill="none" stroke="var(--bg3)" stroke-width="14"/>';
  e.forEach(([k,v],i)=>{const d=(v/tot)*c;const col=PC[i%PC.length];svg.innerHTML+=`<circle cx="40" cy="40" r="30" fill="none" stroke="${col}" stroke-width="14" stroke-dasharray="${d.toFixed(1)} ${(c-d).toFixed(1)}" stroke-dashoffset="${-off.toFixed(1)}" transform="rotate(-90 40 40)"/>`;off+=d;});
  svg.innerHTML+=`<text x="40" y="44" text-anchor="middle" font-size="11" fill="var(--text)" font-weight="700">${((e[0][1]/tot)*100).toFixed(0)}%</text>`;
  legend.innerHTML=e.slice(0,5).map(([k,v],i)=>`<div class="leg-item"><div class="leg-dot" style="background:${PC[i%PC.length]}"></div><span style="flex:1">${k.charAt(0).toUpperCase()+k.slice(1).replace(/_/g,' ')}</span><span style="color:var(--text3);margin-right:6px">${rpF(v)}</span><span class="leg-pct">${((v/tot)*100).toFixed(1)}%</span></div>`).join('');
}

// ========================
// LAPORAN — Laporan Keuangan (gaya professional financial advisor)
// ========================
async function renderLaporan(){
  if(!sumData)return;
  const s=sumData.summary;
  const pM=sumData.kategoriPemasukan||{},pK=sumData.kategoriPengeluaran||{};
  const tM=s.totalMasuk||0,tK=s.totalKeluar||0;
  const net=tM-tK;
  const savingsRate=tM>0?(net/tM)*100:0;

  // Bandingkan dengan bulan lalu
  const prevMasuk=s.prevMasuk||0,prevKeluar=s.prevKeluar||0;
  const masukTrend=prevMasuk>0?((tM-prevMasuk)/prevMasuk)*100:null;
  const keluarTrend=prevKeluar>0?((tK-prevKeluar)/prevKeluar)*100:null;

  // ---- Ringkasan Eksekutif ----
  const trendBadge=(v)=>v===null?'':`<span style="font-size:10px;font-weight:700;color:${v<=0?'var(--green)':'var(--red)'};margin-left:4px">${v>0?'↑':'↓'}${Math.abs(v).toFixed(0)}% vs bulan lalu</span>`;
  document.getElementById('lap-exec').innerHTML=`
    <div class="lap-hero">
      <div class="lap-hero-lbl">Saldo Sekarang</div>
      <div class="lap-hero-val ${s.saldo<0?'neg':''}">${rpF(s.saldo)}</div>
      <div class="lap-hero-sub">Saldo awal akun ${rpF(s.saldoAwalTotal||0)} + seluruh riwayat transaksi</div>
    </div>
    <div class="lap-grid3">
      <div class="lap-mini"><div class="lap-mini-lbl">Pemasukan</div><div class="lap-mini-val" style="color:var(--green)">${rpF(tM)}</div>${trendBadge(masukTrend!==null?-masukTrend:null)}</div>
      <div class="lap-mini"><div class="lap-mini-lbl">Pengeluaran</div><div class="lap-mini-val" style="color:var(--red)">${rpF(tK)}</div>${trendBadge(keluarTrend)}</div>
      <div class="lap-mini"><div class="lap-mini-lbl">Net Bulan Ini</div><div class="lap-mini-val" style="color:${net>=0?'var(--green)':'var(--red)'}">${net>=0?'+':''}${rpF(net)}</div></div>
    </div>
    <div class="lap-savings">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="font-size:12px;font-weight:700;color:var(--text)">Savings Rate</span><span style="font-size:14px;font-weight:800;color:${savingsRate>=20?'var(--green)':savingsRate>=0?'var(--amber)':'var(--red)'}">${savingsRate.toFixed(1)}%</span></div>
      <div class="target-progress"><div class="target-fill" style="width:${Math.max(0,Math.min(100,savingsRate))}%;background:${savingsRate>=20?'var(--green)':savingsRate>=0?'var(--amber)':'var(--red)'}"></div></div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">Idealnya minimal 20% dari pemasukan disisihkan sebagai tabungan/investasi</div>
    </div>`;

  // ---- Donut kategori (dipindah dari Home) ----
  renderPie(pK,'pie-svg','pie-legend','pie-empty');
  renderPie(pM,'pie-svg-in','pie-legend-in','pie-empty-in');

  // ---- Analisis Prioritas ----
  const tidakPenting=s.tidakPenting||0;
  const pentingPct=tK>0?100-((tidakPenting/tK)*100):100;
  document.getElementById('lap-prioritas').innerHTML=`
    <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:6px"><span style="color:var(--green)">Penting: ${rpF(tK-tidakPenting)}</span><span style="color:var(--amber)">Tidak Penting: ${rpF(tidakPenting)}</span></div>
    <div class="target-progress"><div class="target-fill" style="width:${Math.max(0,Math.min(100,pentingPct))}%;background:var(--green)"></div></div>
    <div style="font-size:10px;color:var(--text3);margin-top:6px">${pentingPct.toFixed(0)}% pengeluaran bulan ini masuk kategori prioritas "Penting"</div>`;

  // ---- Rekomendasi Keuangan (rule-based advisor tips) ----
  const tips=[];
  if(s.saldo<0)tips.push({ico:'🔴',text:'Saldo kamu negatif. Prioritaskan menutup kekurangan sebelum pengeluaran baru.'});
  if(savingsRate<0)tips.push({ico:'⚠️',text:'Pengeluaran bulan ini melebihi pemasukan. Coba tinjau ulang pos pengeluaran terbesar.'});
  else if(savingsRate<10)tips.push({ico:'💡',text:'Savings rate di bawah 10%. Coba target sisihkan minimal 20% dari pemasukan tiap bulan.'});
  else if(savingsRate>=20)tips.push({ico:'✅',text:'Savings rate kamu sudah sehat (≥20%). Pertahankan kebiasaan ini!'});
  const topKat=Object.entries(pK).sort((a,b)=>b[1]-a[1])[0];
  if(topKat&&tK>0){
    const topPct=(topKat[1]/tK)*100;
    if(topPct>=40)tips.push({ico:'📊',text:`Kategori "${topKat[0]}" menyerap ${topPct.toFixed(0)}% dari total pengeluaranmu bulan ini. Pertimbangkan untuk dievaluasi.`});
  }
  if(tidakPenting>0&&tK>0){
    const tpPct=(tidakPenting/tK)*100;
    if(tpPct>=25)tips.push({ico:'✂️',text:`${tpPct.toFixed(0)}% pengeluaranmu masuk kategori "Tidak Penting" — ada peluang hemat di sini.`});
  }
  if(!tips.length)tips.push({ico:'👍',text:'Kondisi keuanganmu terlihat stabil bulan ini. Terus pantau secara berkala.'});
  document.getElementById('lap-tips').innerHTML=tips.slice(0,4).map(t=>`<div class="lap-tip"><span style="font-size:16px">${t.ico}</span><span style="font-size:12px;color:var(--text2);line-height:1.5">${t.text}</span></div>`).join('');

  // ---- Rincian tabel per kategori ----
  document.getElementById('rin-masuk').innerHTML=`<div class="rin-hdr"><i class="ti ti-arrow-down-circle" style="font-size:17px;color:var(--green)"></i><span style="font-size:13px;font-weight:700;color:var(--green)">Rincian Pemasukan</span></div><div class="tbl-hdr"><span>Kategori</span><span>Jumlah</span></div>${Object.entries(pM).map(([k,v])=>`<div class="tbl-row"><span class="tc">${k}</span><span class="tv">${rpF(v)}</span></div>`).join('')}<div class="tbl-row tot"><span class="tc g">Total</span><span class="tv g">${rpF(tM)}</span></div>`;
  document.getElementById('rin-keluar').innerHTML=`<div class="rin-hdr"><i class="ti ti-arrow-up-circle" style="font-size:17px;color:var(--red)"></i><span style="font-size:13px;font-weight:700;color:var(--red)">Rincian Pengeluaran</span></div><div class="tbl-hdr"><span>Kategori</span><span>Jumlah</span></div>${Object.entries(pK).map(([k,v])=>`<div class="tbl-row"><span class="tc">${k}</span><span class="tv">${rpF(v)}</span></div>`).join('')}<div class="tbl-row tot"><span class="tc r">Total</span><span class="tv r">${rpF(tK)}</span></div>`;
}

// ========================
// SALDO: toggle sembunyikan, sparkline 7 hari terakhir
// ========================
let balanceHidden=localStorage.getItem('wangku_balance_hidden')==='1';
function toggleBalanceVisibility(){
  balanceHidden=!balanceHidden;
  localStorage.setItem('wangku_balance_hidden',balanceHidden?'1':'0');
  applyBalanceVisibility();
}
function applyBalanceVisibility(){
  const ico=document.getElementById('bal-eye-ico');
  if(ico)ico.className='ti '+(balanceHidden?'ti-eye-off':'ti-eye');
  const sEl=document.getElementById('saldo');
  const mEl=document.getElementById('mini-bal');
  if(sEl&&sumData){sEl.innerHTML=balanceHidden?'Rp ••••••':rpF(sumData.summary.saldo);}
  if(mEl&&sumData){mEl.textContent=balanceHidden?'••••':rpF(sumData.summary.saldo);}
}

async function renderBalanceSparkline(){
  const svg=document.getElementById('bal-spark');const trendEl=document.getElementById('bal-trend');
  if(!svg||!sumData)return;
  try{
    const d=new Date();d.setDate(d.getDate()-6);
    const startStr=d.toISOString().substring(0,10);
    const rows=await sb(`transactions?user_id=eq.${user.id}&tanggal=gte.${startStr}&select=jenis,nominal,tanggal&order=tanggal.asc`);
    const days=[];for(let i=6;i>=0;i--){const dt=new Date();dt.setDate(dt.getDate()-i);days.push(dt.toISOString().substring(0,10));}
    const netByDay={};days.forEach(x=>netByDay[x]=0);
    (rows||[]).forEach(t=>{
      if(t.jenis==='transfer')return;
      const n=Number(t.nominal);
      if(netByDay[t.tanggal]===undefined)return;
      netByDay[t.tanggal]+=(t.jenis==='pemasukan'?n:-n);
    });
    const weekNet=days.reduce((s,x)=>s+netByDay[x],0);
    const baseline=sumData.summary.saldo-weekNet;
    let running=baseline;const points=[running];
    days.forEach(x=>{running+=netByDay[x];points.push(running);});

    const w=300,h=60,padY=8;
    const min=Math.min(...points),max=Math.max(...points);
    const range=(max-min)||(Math.abs(points[0])*0.1)||1;
    const stepX=w/(points.length-1);
    const xy=points.map((p,i)=>[i*stepX, h-padY-((p-min)/range)*(h-padY*2)]);

    // Kurva halus (smooth curve) lewat cubic-bezier antar titik, bukan garis patah-patah
    let linePath=`M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`;
    for(let i=0;i<xy.length-1;i++){
      const[x0,y0]=xy[i],[x1,y1]=xy[i+1];
      const cx=(x0+x1)/2;
      linePath+=` C${cx.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    const areaPath=`${linePath} L${w.toFixed(1)},${h} L0,${h} Z`;
    const last=xy[xy.length-1];

    svg.innerHTML=`<defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity="0.28"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <path d="${areaPath}" fill="url(#sparkGrad)" stroke="none"/>
      <path d="${linePath}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="#fff"/>`;
    if(trendEl){
      const diff=weekNet;
      trendEl.innerHTML=(diff>=0?'<i class="ti ti-triangle-filled" style="font-size:8px"></i> +':'<i class="ti ti-triangle-inverted-filled" style="font-size:8px"></i> -')+rpF(Math.abs(diff))+' dari minggu lalu';
    }
  }catch(e){if(trendEl)trendEl.innerHTML='';}
}

// ========================
// KESEHATAN KEUANGAN + TARGET TERDEKAT
// ========================
function computeHealthScore(s){
  const tM=s.totalMasuk||0,tK=s.totalKeluar||0;
  // Belum ada transaksi bulan ini sama sekali — jangan hitung skor, savingsRate=0
  // akan jatuh ke bracket "rendah" dan salah menandai akun baru sebagai kurang sehat.
  if(tM===0&&tK===0)return{score:null,label:'Belum ada data',color:'var(--text3)',savingsRate:0,noData:true};
  let score=100;
  const savingsRate=tM>0?((tM-tK)/tM)*100:(tK>0?-100:0);
  if(s.saldo<0)score-=30;
  if(savingsRate<0)score-=30;else if(savingsRate<10)score-=15;else if(savingsRate<20)score-=5;
  const tidakPentingRatio=tK>0?(s.tidakPenting||0)/tK*100:0;
  if(tidakPentingRatio>=40)score-=15;else if(tidakPentingRatio>=25)score-=8;
  score=Math.max(0,Math.min(100,Math.round(score)));
  let label,color;
  if(score>=80){label='Sehat 😄';color='var(--green)';}
  else if(score>=60){label='Cukup Baik 🙂';color='var(--amber)';}
  else if(score>=40){label='Perlu Perhatian 😐';color='#F97316';}
  else{label='Waspada 😟';color='var(--red)';}
  return{score,label,color,savingsRate,noData:false};
}

function renderHealthAndTarget(){
  if(!sumData)return;
  const h=computeHealthScore(sumData.summary);
  const scoreEl=document.getElementById('health-score');const maxEl=document.querySelector('.health-max');const labelEl=document.getElementById('health-label');const subEl=document.getElementById('health-sub');const arc=document.getElementById('health-arc');
  if(h.noData){
    if(scoreEl)scoreEl.textContent='—';
    if(maxEl)maxEl.style.display='none';
    if(labelEl){labelEl.textContent=h.label;labelEl.style.color=h.color;}
    if(subEl)subEl.textContent='Catat transaksi pertamamu bulan ini untuk melihat skor kesehatan keuangan.';
    if(arc){arc.setAttribute('stroke-dasharray','0 264');arc.setAttribute('stroke','var(--border2)');}
  }else{
    if(scoreEl)scoreEl.textContent=h.score;
    if(maxEl)maxEl.style.display='';
    if(labelEl){labelEl.textContent=h.label;labelEl.style.color=h.color;}
    if(subEl)subEl.textContent=h.score>=80?'Pertahankan terus kebiasaan baikmu!':h.score>=60?'Sudah baik, masih ada ruang perbaikan.':h.score>=40?'Coba kurangi pengeluaran tidak penting.':'Segera evaluasi ulang pengeluaranmu.';
    if(arc){const circumference=2*Math.PI*42;const filled=(h.score/100)*circumference;arc.setAttribute('stroke-dasharray',`${filled.toFixed(1)} ${circumference.toFixed(1)}`);arc.setAttribute('stroke',h.color);}
  }

  const nameEl=document.getElementById('nt-name'),fillEl=document.getElementById('nt-fill'),pctEl=document.getElementById('nt-pct'),tkEl=document.getElementById('nt-terkumpul'),tgEl=document.getElementById('nt-target');
  if(!nameEl)return;
  const incomplete=(targets||[]).filter(t=>Number(t.terkumpul)<Number(t.nominal));
  const withDeadline=incomplete.filter(t=>t.deadline).sort((a,b)=>new Date(a.deadline)-new Date(b.deadline));
  const nearest=withDeadline[0]||incomplete[0];
  if(!nearest){
    nameEl.textContent='Belum ada target aktif';
    if(fillEl)fillEl.style.width='0%';
    if(pctEl)pctEl.textContent='';
    if(tkEl)tkEl.textContent='—';if(tgEl)tgEl.textContent='—';
    return;
  }
  const pct=Math.min(100,Math.round((Number(nearest.terkumpul)/Number(nearest.nominal))*100));
  nameEl.textContent=nearest.nama;
  if(fillEl)fillEl.style.width=pct+'%';
  if(pctEl)pctEl.textContent=pct+'%';
  if(tkEl)tkEl.innerHTML=abbrAmountHtml(nearest.terkumpul);
  if(tgEl)tgEl.innerHTML=abbrAmountHtml(nearest.nominal);
}

// ========================
// INSIGHT DARI WANGKU AI (rule-based, dari data asli, siklus tiap tap)
// ========================
let insightList=[],insightIdx=0;
function computeInsights(){
  if(!sumData)return['Belum ada cukup data bulan ini untuk dianalisis.'];
  const s=sumData.summary;const tips=[];
  const kat=sumData.kategoriPengeluaran||{},prevKat=sumData.prevKategoriPengeluaran||{};
  Object.entries(kat).forEach(([k,v])=>{
    const prev=prevKat[k]||0;
    if(prev>0){
      const diff=((v-prev)/prev)*100;
      if(diff>=20)tips.push(`Pengeluaran ${k} lebih tinggi ${diff.toFixed(0)}% dari biasanya. Yuk, atur budget minggu ini!`);
    }
  });
  const tM=s.totalMasuk||0,tK=s.totalKeluar||0;
  const savingsRate=tM>0?((tM-tK)/tM)*100:0;
  if(s.saldo<0)tips.push('Saldo kamu sedang minus. Prioritaskan menutup kekurangan sebelum pengeluaran baru ya.');
  if(tK>tM&&tM>0)tips.push('Pengeluaran bulan ini sudah melebihi pemasukan. Waktunya evaluasi pos pengeluaran terbesar.');
  if(savingsRate>=20)tips.push(`Savings rate kamu ${savingsRate.toFixed(0)}% bulan ini — sudah sehat, pertahankan! 🎉`);
  const tidakPenting=s.tidakPenting||0;
  if(tK>0&&(tidakPenting/tK)>=0.3)tips.push(`${((tidakPenting/tK)*100).toFixed(0)}% pengeluaranmu masuk kategori "Tidak Penting" — ada peluang hemat di sana.`);
  const topKat=Object.entries(kat).sort((a,b)=>b[1]-a[1])[0];
  if(topKat)tips.push(`Kategori terbesar bulan ini adalah "${topKat[0]}" senilai ${rpF(topKat[1])}.`);
  if(!tips.length)tips.push('Kondisi keuanganmu terlihat stabil bulan ini. Terus pantau secara berkala ya!');
  return tips.slice(0,4);
}
function renderInsightBox(){
  insightList=computeInsights();insightIdx=0;
  showInsight();
}
function showInsight(){
  const el=document.getElementById('insight-text');if(!el)return;
  el.style.opacity='0';
  setTimeout(()=>{
    el.textContent=insightList[insightIdx]||'—';
    el.style.opacity='1';
  },160);
  const dotsEl=document.getElementById('insight-dots');
  if(dotsEl)dotsEl.innerHTML=insightList.map((_,i)=>`<span class="${i===insightIdx?'act':''}"></span>`).join('');
}
function cycleInsight(){
  if(!insightList.length)return;
  insightIdx=(insightIdx+1)%insightList.length;
  showInsight();
}
function prevInsight(){
  if(!insightList.length)return;
  insightIdx=(insightIdx-1+insightList.length)%insightList.length;
  showInsight();
}
(function initInsightSwipe(){
  let startX=null,startY=null,moved=false;
  document.addEventListener('DOMContentLoaded',bind);
  if(document.readyState!=='loading')bind();
  function bind(){
    const el=document.getElementById('insight-card');if(!el||el.dataset.swipeBound)return;
    el.dataset.swipeBound='1';
    el.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;startY=e.touches[0].clientY;moved=false;},{passive:true});
    el.addEventListener('touchmove',e=>{
      if(startX===null)return;
      const dx=e.touches[0].clientX-startX,dy=e.touches[0].clientY-startY;
      if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy))moved=true;
    },{passive:true});
    el.addEventListener('touchend',e=>{
      if(startX===null)return;
      const dx=e.changedTouches[0].clientX-startX;
      if(moved&&Math.abs(dx)>40){dx<0?cycleInsight():prevInsight();}
      startX=null;startY=null;
    });
  }
})();
