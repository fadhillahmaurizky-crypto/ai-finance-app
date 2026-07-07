// ========================
// PRIORITAS (default + custom, semua bisa dikelola di halaman penuh)
// ========================
let prioritasList=[];
async function seedDefaultPriorities(){
  try{
    const existing=await sb(`user_priorities?user_id=eq.${user.id}&is_default=eq.true&select=id&limit=1`);
    if(existing&&existing.length)return;
    const rows=DEFAULT_PRIORITIES.map(p=>({user_id:user.id,nama:p.nama,slug:p.slug,is_default:true}));
    await sb('user_priorities','POST',rows);
  }catch(e){}
}

async function loadPrioritas(){
  try{
    const data=await sb(`user_priorities?user_id=eq.${user.id}&order=nama.asc`);
    prioritasList=data||[];
    renderPrioritasSelect();
  }catch(e){prioritasList=[];}
}

function renderPrioritasSelect(){
  const sel=document.getElementById('f-pri');if(!sel)return;
  const cur=sel.value;
  if(!prioritasList.length){sel.innerHTML='<option value="penting">Penting</option><option value="tidak_penting">Tidak Penting</option>';return;}
  sel.innerHTML=prioritasList.map(p=>`<option value="${p.slug}">${p.nama}</option>`).join('');
  if(cur&&prioritasList.some(p=>p.slug===cur))sel.value=cur;
}

// Quick-add popup (dipanggil dari tombol + di form Catat)
function showAddPrioritas(){
  document.getElementById('add-pri-modal').classList.add('open');
}
function slugify(s){return s.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||('pri_'+Date.now());}
async function savePrioritasQuick(){
  const nama=document.getElementById('new-pri-nama').value.trim();
  if(!nama){showToast('Masukkan nama prioritas!','err');return;}
  try{
    await sb('user_priorities','POST',{user_id:user.id,nama,slug:slugify(nama)});
    document.getElementById('new-pri-nama').value='';
    document.getElementById('add-pri-modal').classList.remove('open');
    showToast('Prioritas ditambahkan ✓','ok');
    await loadPrioritas();
    renderPrioritasFullList();
  }catch(e){showToast(e.message.includes('unique')?'Prioritas sudah ada!':'Gagal: '+e.message,'err');}
}

// ------------------------
// Halaman penuh: Kelola Prioritas (Settings)
// ------------------------
async function renderPrioritasManageList(){renderPrioritasFullList();}
async function renderPrioritasFullList(){
  const el=document.getElementById('prioritas-full-list');if(!el)return;
  el.innerHTML='<div class="skeleton" style="height:50px;margin-bottom:6px"></div><div class="skeleton" style="height:50px"></div>';
  try{
    const data=await sb(`user_priorities?user_id=eq.${user.id}&order=nama.asc`);
    prioritasList=data||[];
    if(!data?.length){el.innerHTML='<div style="text-align:center;padding:20px;font-size:12px;color:var(--text3)">Belum ada prioritas</div>';return;}
    el.innerHTML=data.map(prioritasRowHtml).join('');
  }catch(e){el.innerHTML='<div style="text-align:center;padding:20px;font-size:12px;color:var(--text3)">Gagal memuat</div>';}
}
function prioritasRowHtml(p){
  return `<div id="pri-row-${p.id}" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:12px;margin-bottom:8px">
    <div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text)">${p.nama}${p.is_default?' <span style="font-size:9px;font-weight:600;color:var(--text3);background:var(--border2);padding:1px 6px;border-radius:6px;margin-left:4px">Default</span>':''}</div></div>
    <button onclick="editPrioritas('${p.id}','${p.nama}')" style="background:var(--blue-bg);border:1px solid var(--blue);color:var(--blue);padding:6px 11px;border-radius:8px;font-size:11px;cursor:pointer"><i class="ti ti-pencil"></i></button>
    <button onclick="delPrioritas('${p.id}')" style="background:var(--red-bg);border:1px solid var(--red);color:var(--red);padding:6px 11px;border-radius:8px;font-size:11px;cursor:pointer"><i class="ti ti-trash"></i></button>
  </div>`;
}
function editPrioritas(id,namaLama){
  const row=document.getElementById('pri-row-'+id);if(!row)return;
  row.innerHTML=`
    <input id="edit-pri-${id}" value="${namaLama}" style="flex:1;background:var(--bg3);border:1.5px solid var(--green);border-radius:8px;padding:7px 10px;font-size:13px;color:var(--text);outline:none"/>
    <button onclick="simpanEditPrioritas('${id}')" style="background:var(--green);border:none;color:#fff;padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer"><i class="ti ti-check"></i></button>
    <button onclick="renderPrioritasFullList()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text3);padding:6px 10px;border-radius:8px;font-size:11px;cursor:pointer"><i class="ti ti-x"></i></button>
  `;
  document.getElementById('edit-pri-'+id).focus();
}
async function simpanEditPrioritas(id){
  const nama=document.getElementById('edit-pri-'+id)?.value.trim();
  if(!nama){showToast('Nama tidak boleh kosong!','err');return;}
  try{
    await sb(`user_priorities?id=eq.${id}&user_id=eq.${user.id}`,'PATCH',{nama,slug:slugify(nama)});
    showToast('Prioritas diupdate ✓','ok');
    await loadPrioritas();renderPrioritasFullList();
  }catch(e){showToast(e.message.includes('unique')?'Nama sudah ada!':'Gagal: '+e.message,'err');}
}
async function savePrioritasFull(){
  const nama=document.getElementById('pri-full-nama').value.trim();
  if(!nama){showToast('Masukkan nama prioritas!','err');return;}
  try{
    await sb('user_priorities','POST',{user_id:user.id,nama,slug:slugify(nama)});
    document.getElementById('pri-full-nama').value='';
    showToast('Prioritas ditambahkan ✓','ok');
    await loadPrioritas();renderPrioritasFullList();
  }catch(e){showToast(e.message.includes('unique')?'Prioritas sudah ada!':'Gagal: '+e.message,'err');}
}
async function delPrioritas(id){
  if(!confirm('Hapus prioritas ini?'))return;
  try{
    await sb(`user_priorities?id=eq.${id}&user_id=eq.${user.id}`,'DELETE');
    await loadPrioritas();renderPrioritasFullList();
    showToast('Prioritas dihapus','ok');
  }catch(e){showToast('Gagal hapus','err');}
}
