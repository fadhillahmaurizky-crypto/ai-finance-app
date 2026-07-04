let ctx='';
function updateCtx(data){if(!data)return;const s=data.summary;ctx=`Data keuangan ${user?.full_name||'user'}:\n- Saldo: ${rpF(s.saldo)}\n- Pemasukan: ${rpF(s.totalMasuk)}\n- Pengeluaran: ${rpF(s.totalKeluar)}\n- Tidak Penting: ${rpF(s.tidakPenting)}\n- Pengeluaran per kategori: ${JSON.stringify(data.kategoriPengeluaran)}\n- Pemasukan per kategori: ${JSON.stringify(data.kategoriPemasukan)}`;}
const SYS=`Kamu adalah Wangku AI, asisten keuangan pribadi dari aplikasi Wangku. Jawab Bahasa Indonesia, singkat dan ramah. Panggil user dengan nama depannya.

FOKUS: Kamu HANYA membantu topik yang berkaitan dengan keuangan — mencatat transaksi, analisa pengeluaran, tips hemat, budgeting, perencanaan keuangan, investasi, saran keuangan pernikahan/pendidikan/bisnis, dll.

TOLAK dengan ramah jika pertanyaan TIDAK ada hubungannya sama sekali dengan keuangan (contoh: resep masakan, berita politik, hiburan, olahraga). Katakan: "Maaf [nama], saya hanya bisa bantu soal keuangan ya! 😊"

ATURAN KLASIFIKASI TRANSAKSI (WAJIB DIIKUTI):
- PENGELUARAN: makan, beli, jajan, bayar, transportasi, belanja, tagihan, buat arisan, bayar arisan, setoran arisan, iuran, ngeluarin, keluar uang
- PEMASUKAN: gaji, dapat, terima, dapet, bonus, jualan, arisan masuk, dapat arisan, dapet arisan, transfer masuk
CATATAN: "buat arisan"/"setoran arisan"/"bayar arisan" = PENGELUARAN. "dapat arisan"/"dapet arisan" = PEMASUKAN.

JIKA USER MINTA CATAT TRANSAKSI (ada angka + kata keuangan):
Balas HANYA dengan JSON ini:
{"action":"catat","jenis":"pengeluaran_atau_pemasukan","nominal":angka_saja,"kategori":"makanan/transportasi/belanja/tagihan/hiburan/gaji/bonus/arisan/lainnya","keterangan":"deskripsi singkat","konfirmasi":"✅ [keterangan] Rp[nominal] berhasil dicatat!"}

Untuk pertanyaan keuangan biasa, jawab teks normal (maks 4 kalimat).`;

function openChat(){document.getElementById('chat-sheet').classList.add('open');renderAINotice();document.getElementById('chat-input').focus();}
function closeChat(){document.getElementById('chat-sheet').classList.remove('open');}
function renderAINotice(){const el=document.getElementById('ai-notice');if(!el)return;const plan=getPlan();if(plan==='basic'||plan==='free'){el.innerHTML=`<div class="plan-notice">🔒 AI tersedia di paket Pro/Ultimate. <span style="text-decoration:underline;cursor:pointer;font-weight:700" onclick="hubungiCS()">Hubungi admin</span></div>`;}else{const tokenSisa=Math.max(0,(user?.tokens_limit||0)-(user?.tokens_used||0));if(tokenSisa<=0){el.innerHTML=`<div class="plan-notice">⚠️ Token AI habis. <span style="text-decoration:underline;cursor:pointer;font-weight:700" onclick="hubungiCS()">Isi token lagi</span></div>`;}else{el.innerHTML=`<div class="plan-notice pro">✨ ${(tokenSisa/1000).toFixed(0)}K token tersisa bulan ini</div>`;}}}
function addMsg(text,role){const msgs=document.getElementById('chat-msgs');const row=document.createElement('div');row.className='msg-row'+(role==='user'?' user':'');row.innerHTML=role==='ai'?`<div class="msg-av"><i class="ti ti-robot"></i></div><div class="bubble ai">${text}</div>`:`<div class="bubble user">${text}</div>`;msgs.appendChild(row);msgs.scrollTop=msgs.scrollHeight;}
function addTyping(){const m=document.getElementById('chat-msgs');const r=document.createElement('div');r.className='msg-row';r.id='typing';r.innerHTML='<div class="msg-av"><i class="ti ti-robot"></i></div><div class="bubble ai"><div class="typing-dots"><span></span><span></span><span></span></div></div>';m.appendChild(r);m.scrollTop=m.scrollHeight;}
function removeTyping(){document.getElementById('typing')?.remove();}
async function sendChip(t){document.getElementById('chips').style.display='none';await sendMsg(t);}
async function handleSend(){const inp=document.getElementById('chat-input');const text=inp.value.trim();if(!text||loading)return;inp.value='';document.getElementById('chips').style.display='none';await sendMsg(text);}
document.getElementById('chat-input').addEventListener('keydown',e=>{if(e.key==='Enter')handleSend();});
async function sendMsg(text){
  if(loading)return;
  if(!canAI()){addMsg(text,'user');const p=getPlan();addMsg((p==='basic'||p==='free')?'🔒 AI tersedia di paket Pro/Ultimate. Hubungi admin untuk upgrade!':'⚠️ Token AI bulan ini habis. Hubungi admin untuk isi ulang!','ai');return;}
  if(!getKey()){await loadPoolKey();}
  if(!getKey()){addMsg(text,'user');addMsg('Wangku AI belum aktif. Hubungi admin untuk aktivasi.','ai');return;}
  loading=true;document.getElementById('send-btn').disabled=true;addMsg(text,'user');chatHist.push({role:'user',content:text});addTyping();
  try{
    const messages=[{role:'system',content:SYS+'\n\n'+(ctx||'')},...chatHist];
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+getKey()},body:JSON.stringify({model:'llama-3.1-8b-instant',max_tokens:400,messages})});
    const d=await r.json();
    console.log('Groq response status:',r.status,d);
    if(d.error){throw new Error('Groq error: '+d.error.message);}
    let reply=d.choices?.[0]?.message?.content||'Maaf ada gangguan.';
    const tokensUsed=d.usage?.total_tokens||0;
    if(tokensUsed>0&&user.username!==MASTER){user.tokens_used=(user.tokens_used||0)+tokensUsed;sb(`users?id=eq.${user.id}`,'PATCH',{tokens_used:user.tokens_used}).catch(()=>{});}
    removeTyping();
    const jsonMatch=reply.match(/\{[\s\S]*"action"\s*:\s*"catat"[\s\S]*\}/);
    if(jsonMatch){
      try{
        const trx=JSON.parse(jsonMatch[0]);
        await sb('transactions','POST',{user_id:user.id,jenis:trx.jenis,nominal:parseFloat(trx.nominal),kategori:trx.kategori,keterangan:trx.keterangan,prioritas:'penting',tanggal:new Date().toISOString().substring(0,10)});
        reply=trx.konfirmasi||'Transaksi berhasil dicatat ✓';
        loadSummary();loadTrx('semua','txn-home',4);
      }catch(e){reply='Gagal menyimpan transaksi: '+e.message;}
    }
    chatHist.push({role:'assistant',content:reply});addMsg(reply,'ai');
    aiChat++;user.ai_chat_count=aiChat;sb(`users?id=eq.${user.id}`,'PATCH',{ai_chat_count:aiChat}).catch(()=>{});renderAINotice();renderPlanCard();
  }catch(e){removeTyping();console.error('AI error:',e);addMsg('Gagal: '+e.message,'ai');}
  loading=false;document.getElementById('send-btn').disabled=false;
}

function updateApiStatus(){const key=localStorage.getItem('wangku_pool_key')||'';const pill=document.getElementById('api-pill');if(pill){pill.textContent=key?'Tersimpan ✓':'Belum diisi';pill.className='pill '+(key?'ok':'no');}const inp=document.getElementById('api-key-input');if(inp&&key)inp.value=key;}
function saveApiKey(){const v=document.getElementById('api-key-input')?.value.trim();if(!v){showToast('Masukkan API key!','err');return;}localStorage.setItem('wangku_pool_key',v);updateApiStatus();showToast('API key pool tersimpan ✓','ok');}
function showWAGuide(){document.getElementById('wa-modal').classList.add('open');}
function hubungiCS(){window.open('https://wa.me/'+CS+'?text='+encodeURIComponent('Hallo Admin Wangku, saya mau tanya tentang paket Wangku'),'_blank');}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();dP=e;});
