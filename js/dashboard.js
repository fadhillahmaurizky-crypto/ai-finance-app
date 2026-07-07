function checkAlerts(data){
  const el=document.getElementById('alert-section');if(!el||!data)return;
  const kat=data.kategoriPengeluaran||{};const total=data.summary?.totalMasuk||0;
  const alerts=[];
  if(data.summary?.saldo<0)alerts.push({type:'danger',ico:'🔴',title:'Saldo kamu minus!',desc:'Segera tambah pemasukan atau kurangi pengeluaran'});
  if(total>0)Object.entries(kat).forEach(([k,v])=>{const p=(v/total)*100;if(p>=80&&p<100)alerts.push({type:'warn',ico:'⚠️',title:`${k} sudah ${p.toFixed(0)}% dari pemasukan`,desc:`Pengeluaran ${k}: ${rpF(v)}. Hati-hati!`});});
  el.innerHTML=alerts.slice(0,2).map(a=>`<div class="alert-card ${a.type==='danger'?'danger':''}" style="margin-bottom:8px"><div class="alert-ico">${a.ico}</div><div><div class="alert-title">${a.title}</div><div class="alert-desc">${a.desc}</div></div></div>`).join('');
}

function countTargetInBalance(){return localStorage.getItem('wangku_count_target_balance')==='1';}

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

    // RINGKASAN BULAN INI (untuk kartu statistik + kategori breakdown di Laporan)
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
    sumData={summary:{saldo,totalMasuk,totalKeluar,tidakPenting,totalMasukAll,totalKeluarAll,saldoAwalTotal},kategoriPengeluaran,kategoriPemasukan};

    const sEl=document.getElementById('saldo');
    sEl.innerHTML=rpF(saldo);
    sEl.className='bal-amount'+(saldo<0?' neg':'');
    const mEl=document.getElementById('mini-bal');
    if(mEl){mEl.textContent=rpF(saldo);mEl.className='mini-bal-amt'+(saldo<0?' neg':'');}
    document.getElementById('tot-masuk').textContent=rpF(totalMasukAll);
    document.getElementById('tot-keluar').textContent=rpF(totalKeluarAll);
    document.getElementById('stat-masuk').textContent=rp(totalMasuk);
    document.getElementById('stat-keluar').textContent=rp(totalKeluar);
    const p=totalMasuk>0?((totalKeluar/totalMasuk)*100).toFixed(1):0;
    document.getElementById('stat-masuk-b').textContent='Total pemasukan';
    document.getElementById('stat-keluar-b').textContent=p+'% dari pemasukan';
    updateCtx(sumData);checkAlerts(sumData);
    if(typeof checkOverspendNotif==='function')checkOverspendNotif(totalMasuk,totalKeluar);
    if(document.getElementById('page-laporan')?.classList.contains('active'))renderLaporan();
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
  let prevMasuk=0,prevKeluar=0;
  try{
    const d=new Date();d.setMonth(d.getMonth()-1);
    const prevMonth=d.toISOString().substring(0,7);
    const curMonthStart=getMonth();
    const prevData=await sb(`transactions?user_id=eq.${user.id}&tanggal=gte.${prevMonth}-01&tanggal=lt.${curMonthStart}-01&select=jenis,nominal`);
    (prevData||[]).forEach(t=>{const n=Number(t.nominal);if(t.jenis==='pemasukan')prevMasuk+=n;else if(t.jenis==='pengeluaran')prevKeluar+=n;});
  }catch(e){}
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
