// ========================
// KATEGORI (default + custom, semua bisa dikelola di halaman penuh)
// ========================
let kategoriList=[];
async function seedDefaultCategories(){
  try{
    const existing=await sb(`user_categories?user_id=eq.${user.id}&is_default=eq.true&select=id&limit=1`);
    if(existing&&existing.length)return;
    const rows=DEFAULT_CATEGORIES.map(c=>({user_id:user.id,nama:c.nama,jenis:c.jenis,is_default:true}));
    await sb('user_categories','POST',rows);
  }catch(e){/* diam-diam gagal, form tetap jalan dengan kategori yang ada */}
}

async function loadKategori(){
  try{
    const data=await sb(`user_categories?user_id=eq.${user.id}&order=jenis.asc,nama.asc`);
    kategoriList=data||[];
    renderKategoriSelect();
  }catch(e){kategoriList=[];}
}

function renderKategoriSelect(){
  const sel=document.getElementById('f-kat');if(!sel)return;
  const cur=sel.value;
  const activeJenis=(typeof jenis!=='undefined'&&(jenis==='pemasukan'||jenis==='pengeluaran'))?jenis:'pengeluaran';
  const list=kategoriList.filter(k=>k.jenis===activeJenis);
  const opt=k=>`<option value="${k.nama}">${k.nama.charAt(0).toUpperCase()+k.nama.slice(1).replace(/_/g,' ')}</option>`;
  sel.innerHTML='<option value="">-- Pilih Kategori --</option>'+list.map(opt).join('');
  if(cur&&list.some(k=>k.nama===cur))sel.value=cur;
}

// Quick-add popup (dipanggil dari tombol + di form Catat) — hanya untuk tambah cepat
function showAddKategori(){
  document.getElementById('add-kat-modal').classList.add('open');
}
async function saveKategoriQuick(){
  const nama=document.getElementById('new-kat-nama').value.trim();
  const jenis=document.getElementById('new-kat-jenis').value;
  if(!nama){showToast('Masukkan nama kategori!','err');return;}
  try{
    await sb('user_categories','POST',{user_id:user.id,nama,jenis});
    document.getElementById('new-kat-nama').value='';
    document.getElementById('add-kat-modal').classList.remove('open');
    showToast('Kategori ditambahkan ✓','ok');
    await loadKategori();
    renderKategoriFullList();
  }catch(e){showToast(isDupError(e)?`Kategori "${nama}" sudah ada di jenis ini.`:'Gagal: '+e.message,'err');}
}

// ------------------------
// Halaman penuh: Kelola Kategori (Settings)
// ------------------------
async function renderKategoriManageList(){renderKategoriFullList();}
async function renderKategoriFullList(){
  const el=document.getElementById('kategori-full-list');if(!el)return;
  el.innerHTML='<div class="skeleton" style="height:50px;margin-bottom:6px"></div><div class="skeleton" style="height:50px"></div>';
  try{
    const data=await sb(`user_categories?user_id=eq.${user.id}&order=jenis.asc,nama.asc`);
    kategoriList=data||[];
    if(!data?.length){el.innerHTML='<div style="text-align:center;padding:20px;font-size:12px;color:var(--text3)">Belum ada kategori</div>';return;}
    const pemasukan=data.filter(k=>k.jenis==='pemasukan');
    const pengeluaran=data.filter(k=>k.jenis==='pengeluaran');
    const grp=(title,rows)=>rows.length?`<div style="font-size:11px;font-weight:700;color:var(--text3);margin:14px 0 8px;text-transform:uppercase;letter-spacing:.5px">${title}</div>`+rows.map(kategoriRowHtml).join(''):'';
    el.innerHTML=grp('Pemasukan',pemasukan)+grp('Pengeluaran',pengeluaran);
  }catch(e){el.innerHTML='<div style="text-align:center;padding:20px;font-size:12px;color:var(--text3)">Gagal memuat</div>';}
}
function kategoriRowHtml(k){
  return `<div id="kat-row-${k.id}" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;margin-bottom:8px">
    <div style="flex:1">
      <div style="font-size:13px;font-weight:600;color:var(--text)">${k.nama.charAt(0).toUpperCase()+k.nama.slice(1).replace(/_/g,' ')}${k.is_default?' <span style="font-size:9px;font-weight:600;color:var(--text3);background:var(--border2);padding:1px 6px;border-radius:6px;margin-left:4px">Default</span>':''}</div>
    </div>
    <button onclick="editKategori('${k.id}','${k.nama}','${k.jenis}')" style="background:var(--blue-bg);border:1px solid var(--blue);color:var(--blue);padding:6px 11px;border-radius:8px;font-size:11px;cursor:pointer"><i class="ti ti-pencil"></i></button>
    <button onclick="delKategori('${k.id}')" style="background:var(--red-bg);border:1px solid var(--red);color:var(--red);padding:6px 11px;border-radius:8px;font-size:11px;cursor:pointer"><i class="ti ti-trash"></i></button>
  </div>`;
}
function editKategori(id, namaLama, jenis){
  const row=document.getElementById('kat-row-'+id);
  if(!row)return;
  row.innerHTML=`
    <input id="edit-kat-${id}" value="${namaLama}" style="flex:1;background:var(--bg3);border:1.5px solid var(--green);border-radius:8px;padding:7px 10px;font-size:13px;color:var(--text);outline:none"/>
    <select id="edit-jenis-${id}" style="background:var(--bg3);border:1.5px solid var(--border);border-radius:8px;padding:7px 8px;font-size:12px;color:var(--text)">
      <option value="pengeluaran" ${jenis==='pengeluaran'?'selected':''}>Pengeluaran</option>
      <option value="pemasukan" ${jenis==='pemasukan'?'selected':''}>Pemasukan</option>
    </select>
    <button onclick="simpanEditKategori('${id}')" style="background:var(--green);border:none;color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer"><i class="ti ti-check"></i></button>
    <button onclick="renderKategoriFullList()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text3);padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer"><i class="ti ti-x"></i></button>
  `;
  document.getElementById('edit-kat-'+id).focus();
}
async function simpanEditKategori(id){
  const nama=document.getElementById('edit-kat-'+id)?.value.trim();
  const jenis=document.getElementById('edit-jenis-'+id)?.value;
  if(!nama){showToast('Nama tidak boleh kosong!','err');return;}
  try{
    await sb(`user_categories?id=eq.${id}&user_id=eq.${user.id}`,'PATCH',{nama,jenis});
    showToast('Kategori diupdate ✓','ok');
    await loadKategori();
    renderKategoriFullList();
  }catch(e){showToast(isDupError(e)?`Kategori "${nama}" sudah ada di jenis ini.`:'Gagal: '+e.message,'err');}
}
async function saveKategoriFull(){
  const nama=document.getElementById('kat-full-nama').value.trim();
  const jenis=document.getElementById('kat-full-jenis').value;
  if(!nama){showToast('Masukkan nama kategori!','err');return;}
  try{
    await sb('user_categories','POST',{user_id:user.id,nama,jenis});
    document.getElementById('kat-full-nama').value='';
    showToast('Kategori ditambahkan ✓','ok');
    await loadKategori();
    renderKategoriFullList();
  }catch(e){showToast(isDupError(e)?`Kategori "${nama}" sudah ada di jenis ini.`:'Gagal: '+e.message,'err');}
}
async function delKategori(id){
  if(!confirm('Hapus kategori ini?'))return;
  try{
    await sb(`user_categories?id=eq.${id}&user_id=eq.${user.id}`,'DELETE');
    await loadKategori();
    renderKategoriFullList();
    showToast('Kategori dihapus','ok');
  }catch(e){showToast('Gagal hapus','err');}
}
