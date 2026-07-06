// ========================
// KATEGORI (default + custom, semua bisa dikelola)
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
  const pemasukan=kategoriList.filter(k=>k.jenis==='pemasukan');
  const pengeluaran=kategoriList.filter(k=>k.jenis==='pengeluaran');
  const opt=k=>`<option value="${k.nama}">${k.nama.charAt(0).toUpperCase()+k.nama.slice(1).replace(/_/g,' ')}</option>`;
  sel.innerHTML='<option value="">-- Pilih Kategori --</option>'+
    (pemasukan.length?`<optgroup label="Pemasukan">${pemasukan.map(opt).join('')}</optgroup>`:'')+
    (pengeluaran.length?`<optgroup label="Pengeluaran">${pengeluaran.map(opt).join('')}</optgroup>`:'');
  if(cur&&kategoriList.some(k=>k.nama===cur))sel.value=cur;
}

async function showAddKategori(){
  document.getElementById('add-kat-modal').classList.add('open');
  await renderKategoriManageList();
}

async function renderKategoriManageList(){
  const el=document.getElementById('custom-kat-list');if(!el)return;
  try{
    const data=await sb(`user_categories?user_id=eq.${user.id}&order=jenis.asc,nama.asc`);
    kategoriList=data||[];
    if(!data?.length){el.innerHTML='<div style="text-align:center;padding:12px;font-size:12px;color:var(--text3)">Belum ada kategori</div>';return;}
    el.innerHTML='<div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Semua Kategori</div>'+
      data.map(k=>`<div id="kat-row-${k.id}" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg3);border-radius:10px;margin-bottom:6px">
        <div style="flex:1">
          <div id="kat-label-${k.id}" style="font-size:13px;font-weight:600">${k.nama}${k.is_default?' <span style="font-size:9px;font-weight:600;color:var(--text3);background:var(--border2);padding:1px 6px;border-radius:6px;margin-left:4px">Default</span>':''}</div>
          <div style="font-size:10px;color:var(--text3)">${k.jenis}</div>
        </div>
        <button onclick="editKategori('${k.id}','${k.nama}','${k.jenis}')" style="background:var(--blue-bg);border:1px solid var(--blue);color:var(--blue);padding:4px 10px;border-radius:7px;font-size:11px;cursor:pointer"><i class="ti ti-pencil"></i></button>
        <button onclick="delKategori('${k.id}')" style="background:var(--red-bg);border:1px solid var(--red);color:var(--red);padding:4px 10px;border-radius:7px;font-size:11px;cursor:pointer"><i class="ti ti-trash"></i></button>
      </div>`).join('');
  }catch(e){el.innerHTML='';}
}

function editKategori(id, namaLama, jenis){
  const row=document.getElementById('kat-row-'+id);
  if(!row)return;
  row.innerHTML=`
    <input id="edit-kat-${id}" value="${namaLama}" style="flex:1;background:var(--bg2);border:1.5px solid var(--green);border-radius:8px;padding:6px 10px;font-size:13px;color:var(--text);outline:none"/>
    <select id="edit-jenis-${id}" style="background:var(--bg3);border:1.5px solid var(--border);border-radius:8px;padding:6px 8px;font-size:12px;color:var(--text)">
      <option value="pengeluaran" ${jenis==='pengeluaran'?'selected':''}>Pengeluaran</option>
      <option value="pemasukan" ${jenis==='pemasukan'?'selected':''}>Pemasukan</option>
    </select>
    <button onclick="simpanEditKategori('${id}')" style="background:var(--green);border:none;color:#fff;padding:5px 10px;border-radius:7px;font-size:11px;cursor:pointer"><i class="ti ti-check"></i></button>
    <button onclick="renderKategoriManageList()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text3);padding:5px 10px;border-radius:7px;font-size:11px;cursor:pointer"><i class="ti ti-x"></i></button>
  `;
  row.style.display='flex';
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
    await renderKategoriManageList();
  }catch(e){showToast(e.message.includes('unique')?'Nama sudah ada!':'Gagal: '+e.message,'err');}
}
async function saveKategori(){
  const nama=document.getElementById('new-kat-nama').value.trim();
  const jenis=document.getElementById('new-kat-jenis').value;
  if(!nama){showToast('Masukkan nama kategori!','err');return;}
  try{
    await sb('user_categories','POST',{user_id:user.id,nama,jenis});
    document.getElementById('new-kat-nama').value='';
    showToast('Kategori ditambahkan ✓','ok');
    await loadKategori();
    await renderKategoriManageList();
  }catch(e){showToast(e.message.includes('unique')?'Kategori sudah ada!':'Gagal: '+e.message,'err');}
}
async function delKategori(id){
  try{
    await sb(`user_categories?id=eq.${id}&user_id=eq.${user.id}`,'DELETE');
    await loadKategori();
    await renderKategoriManageList();
    showToast('Kategori dihapus','ok');
  }catch(e){showToast('Gagal hapus','err');}
}
