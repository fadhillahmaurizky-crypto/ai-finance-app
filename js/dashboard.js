function checkAlerts(data){
  const el=document.getElementById('alert-section');if(!el||!data)return;
  const kat=data.kategoriPengeluaran||{};const total=data.summary?.totalMasuk||0;
  const alerts=[];
  if(data.summary?.saldo<0)alerts.push({type:'danger',ico:'🔴',title:'Saldo kamu minus!',desc:'Segera tambah pemasukan atau kurangi pengeluaran'});
  if(total>0)Object.entries(kat).forEach(([k,v])=>{const p=(v/total)*100;if(p>=80&&p<100)alerts.push({type:'warn',ico:'⚠️',title:`${k} sudah ${p.toFixed(0)}% dari pemasukan`,desc:`Pengeluaran ${k}: ${rpF(v)}. Hati-hati!`});});
  el.innerHTML=alerts.slice(0,2).map(a=>`<div class="alert-card ${a.type==='danger'?'danger':''}" style="margin-bottom:8px"><div class="alert-ico">${a.ico}</div><div><div class="alert-title">${a.title}</div><div class="alert-desc">${a.desc}</div></div></div>`).join('');
}

async function loadSummary(){
  document.getElementById('saldo').innerHTML='Memuat...';
  try{
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
    const saldo=totalMasuk-totalKeluar;
    sumData={summary:{saldo,totalMasuk,totalKeluar,tidakPenting},kategoriPengeluaran,kategoriPemasukan};
    const sEl=document.getElementById('saldo');
    sEl.innerHTML=rpF(saldo);
    sEl.className='bal-amount'+(saldo<0?' neg':'');
    const mEl=document.getElementById('mini-bal');
    if(mEl){mEl.textContent=rpF(saldo);mEl.className='mini-bal-amt'+(saldo<0?' neg':'');}
    document.getElementById('tot-masuk').textContent=rpF(totalMasuk);
    document.getElementById('tot-keluar').textContent=rpF(totalKeluar);
    document.getElementById('stat-masuk').textContent=rp(totalMasuk);
    document.getElementById('stat-keluar').textContent=rp(totalKeluar);
    const p=totalMasuk>0?((totalKeluar/totalMasuk)*100).toFixed(1):0;
    document.getElementById('stat-masuk-b').textContent='Total pemasukan';
    document.getElementById('stat-keluar-b').textContent=p+'% dari pemasukan';
    renderPie(kategoriPengeluaran);updateCtx(sumData);checkAlerts(sumData);
    if(typeof checkOverspendNotif==='function')checkOverspendNotif(totalMasuk,totalKeluar);
  }catch(e){document.getElementById('saldo').innerHTML='Gagal memuat';}
}

const PC=['#00B26A','#2B7EF8','#F59E0B','#EF4444','#8B5CF6','#EC4899'];
function renderPie(kat){if(!kat||!Object.keys(kat).length)return;const e=Object.entries(kat).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);const tot=e.reduce((s,[,v])=>s+v,0);let off=0;const c=2*Math.PI*30;const svg=document.getElementById('pie-svg');svg.innerHTML='<circle cx="40" cy="40" r="30" fill="none" stroke="var(--bg3)" stroke-width="14"/>';e.forEach(([k,v],i)=>{const d=(v/tot)*c;const col=PC[i%PC.length];svg.innerHTML+=`<circle cx="40" cy="40" r="30" fill="none" stroke="${col}" stroke-width="14" stroke-dasharray="${d.toFixed(1)} ${(c-d).toFixed(1)}" stroke-dashoffset="${-off.toFixed(1)}" transform="rotate(-90 40 40)"/>`;off+=d;});svg.innerHTML+=`<text x="40" y="44" text-anchor="middle" font-size="11" fill="var(--text)" font-weight="700">${((e[0][1]/tot)*100).toFixed(0)}%</text>`;document.getElementById('pie-legend').innerHTML=e.slice(0,5).map(([k,v],i)=>`<div class="leg-item"><div class="leg-dot" style="background:${PC[i%PC.length]}"></div>${k.charAt(0).toUpperCase()+k.slice(1)}<span class="leg-pct">${((v/tot)*100).toFixed(1)}%</span></div>`).join('');}

function renderLaporan(){if(!sumData)return;const pM=sumData.kategoriPemasukan||{},pK=sumData.kategoriPengeluaran||{};const tM=Object.values(pM).reduce((a,b)=>a+b,0),tK=Object.values(pK).reduce((a,b)=>a+b,0);document.getElementById('rin-masuk').innerHTML=`<div class="rin-hdr"><i class="ti ti-arrow-down-circle" style="font-size:17px;color:var(--green)"></i><span style="font-size:13px;font-weight:700;color:var(--green)">Rincian Pemasukan</span></div><div class="tbl-hdr"><span>Kategori</span><span>Jumlah</span></div>${Object.entries(pM).map(([k,v])=>`<div class="tbl-row"><span class="tc">${k}</span><span class="tv">${rpF(v)}</span></div>`).join('')}<div class="tbl-row tot"><span class="tc g">Total</span><span class="tv g">${rpF(tM)}</span></div>`;document.getElementById('rin-keluar').innerHTML=`<div class="rin-hdr"><i class="ti ti-arrow-up-circle" style="font-size:17px;color:var(--red)"></i><span style="font-size:13px;font-weight:700;color:var(--red)">Rincian Pengeluaran</span></div><div class="tbl-hdr"><span>Kategori</span><span>Jumlah</span></div>${Object.entries(pK).map(([k,v])=>`<div class="tbl-row"><span class="tc">${k}</span><span class="tv">${rpF(v)}</span></div>`).join('')}<div class="tbl-row tot"><span class="tc r">Total</span><span class="tv r">${rpF(tK)}</span></div>`;}

