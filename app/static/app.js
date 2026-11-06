const tg = window.Telegram?.WebApp;
tg?.ready(); tg?.expand();
const auth = tg?.initData || "";
let state = null, tickTimer = null;
const $ = id => document.getElementById(id);
function toast(msg){const el=$("toast");el.textContent=msg;el.style.display="block";setTimeout(()=>el.style.display="none",2600)}
async function api(path, method="GET", body=null){
 const r=await fetch(path,{method,headers:{"Authorization":"tma "+auth,"Content-Type":"application/json"},body:body===null?undefined:JSON.stringify(body)});
 const data=await r.json().catch(()=>({}));
 if(!r.ok) throw new Error(data.detail||"حدث خطأ");
 return data;
}
function showTab(id){
 document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
 $(id).classList.add("active");
 document.querySelectorAll(".nav-btn").forEach(x=>x.classList.toggle("selected",x.dataset.tab===id));
}
function render(u){
 state=u;
 $("balance").textContent=u.balance.toFixed(3)+" GHG";
 $("topBalance").textContent=u.balance.toFixed(2);
 $("pending").textContent=u.pending.toFixed(6)+" GHG";
 $("level").textContent=u.level; $("levelTop").textContent=u.level;
 $("rate").textContent=u.rate.toFixed(2)+" GHG/s";
 $("heroRate").textContent=u.rate.toFixed(2)+" GHG/s";
 $("topRate").textContent=(u.rate*86400).toFixed(1)+"/d";
 $("verified").textContent=u.verified?"موثق ✓":"غير موثق";
 $("xpText").textContent=`${u.xp} / ${u.level*100}`;
 $("xpBar").style.width=Math.min(100,u.xp/(u.level*100)*100)+"%";
 $("profileName").textContent=u.first_name+(u.username?" (@"+u.username+")":"");
 $("profileId").textContent=u.telegram_id;
 $("verifyBtn").textContent=u.verified?"تم توثيق الحساب ✓":"توثيق الحساب الآن 🔐";
 $("verifyBtn").disabled=u.verified;
 $("upgradeInfo").textContent="التكلفة: 0.01 TON • الزيادة: +0.01 GHG/s • السرعة بعد الترقية: "+(u.rate+0.01).toFixed(2)+" GHG/s";
 if($("profileBalance")) $("profileBalance").textContent=u.balance.toFixed(2)+" GHG";
 if($("profileRate")) $("profileRate").textContent=u.rate.toFixed(2)+"/s";
 if($("profileFriends")) $("profileFriends").textContent=$("friendsCount")?.textContent||"0";
 if($("profileVerifyBtn")){ $("profileVerifyBtn").textContent=u.verified?"تم توثيق الحساب ✓":"توثيق الحساب — 0.05 TON"; $("profileVerifyBtn").disabled=u.verified; }
}
async function refresh(){
 if(!auth){toast("افتح البوت من Telegram لاستخدام حسابك");return}
 try{
  const d=await api("/api/me");render(d.user);$("friendsCount").textContent=d.friends;$("walletStatus").textContent=d.user.wallet_address||"لا توجد محفظة مربوطة";$("refRewards").textContent=Number(d.referral_rewards ?? (d.friends*500)).toLocaleString()+" GHG";renderWithdrawals(d.withdrawals);
  const link=`https://t.me/${window.BOT_USERNAME||"YourBotUsername"}?startapp=ref_${d.user.telegram_id}`;
  $("refLink").textContent=link;
  if(!tickTimer) tickTimer=setInterval(()=>{if(state){state.pending+=state.rate; $("pending").textContent=state.pending.toFixed(6)+" GHG"}},1000);
 }catch(e){toast(e.message)}
}
async function claim(){try{const d=await api("/api/claim","POST");render(d.user);toast("تم جمع "+d.claimed.toFixed(6)+" GHG")}catch(e){toast(e.message)}}
async function upgrade(){
 try{
  if(!tonUI?.connected){await connectWallet(); if(!tonUI?.connected)return;}
  const intent=await api("/api/upgrade/intent","POST");
  const payload=commentPayload(intent.comment);
  await tonUI.sendTransaction({validUntil:Math.floor(Date.now()/1000)+300,messages:[{address:intent.destination,amount:String(intent.amount_nano),payload}]});
  toast("تم إرسال الدفع، جارٍ التحقق...");
  setTimeout(async()=>{try{const d=await api("/api/upgrade/confirm","POST");render(d.user);toast(d.message)}catch(e){toast(e.message)}},12000);
 }catch(e){toast(e.message||"تعذر إكمال الترقية")}
}
async function completeTask(key){try{const d=await api("/api/task/"+key,"POST");render(d.user);toast("حصلت على "+d.reward+" GHG")}catch(e){toast(e.message)}}
function copyRef(){const t=$("refLink").textContent;navigator.clipboard?.writeText(t).then(()=>toast("تم نسخ رابط الدعوة")).catch(()=>toast(t))}
let tonUI=null;
function commentPayload(comment){
 const bytes=new Uint8Array(4+new TextEncoder().encode(comment).length);
 const encoded=new TextEncoder().encode(comment); bytes.set(encoded,4);
 let binary="";bytes.forEach(b=>binary+=String.fromCharCode(b));
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
async function ensureTon(){
 if(!window.TON_CONNECT_UI)throw new Error("تعذر تحميل TON Connect");
 if(!tonUI)tonUI=new TON_CONNECT_UI.TonConnectUI({manifestUrl:location.origin+"/tonconnect-manifest.json"});
 if(!tonUI.connected)await tonUI.openModal();
 if(!tonUI.connected)throw new Error("لم يتم ربط المحفظة");
 return tonUI;
}
async function connectWallet(){try{await ensureTon();const address=tonUI.wallet?.account?.address;if(!address)throw new Error("لم نحصل على عنوان المحفظة");await api("/api/wallet/connect","POST",{address});$("walletStatus").textContent=address;toast("تم ربط المحفظة")}catch(e){toast(e.message)}}
async function disconnectWallet(){try{await api("/api/wallet/disconnect","POST");if(tonUI?.connected)await tonUI.disconnect();$("walletStatus").textContent="لا توجد محفظة مربوطة";toast("تم فصل المحفظة من الحساب")}catch(e){toast(e.message)}}
async function requestWithdrawal(){try{if(!state?.verified){throw new Error("يجب توثيق الحساب بدفع 0.05 TON أولًا")};if(!state?.wallet_address){throw new Error("اربط محفظة TON أولًا")};const amount=Number($("withdrawAmount").value);if(!Number.isFinite(amount)||amount<2000){throw new Error("الحد الأدنى للسحب هو 2,000 GHG")};const d=await api("/api/withdrawals","POST",{amount});render(d.user);toast("تم تسجيل طلب السحب رقم "+d.withdrawal.id);await refresh()}catch(e){toast(e.message)}}
function renderWithdrawals(rows){const el=$("withdrawHistory");if(!el)return;if(!rows?.length){el.textContent="لا توجد طلبات بعد";return;}el.innerHTML=rows.map(w=>`<div class="task-row"><span>#${w.id} — ${Number(w.ghg_amount).toLocaleString()} GHG → ${Number(w.ton_amount).toFixed(2)} TON<br><small>${({pending:"قيد المراجعة",approved:"تمت الموافقة",rejected:"مرفوض — أُعيد الرصيد",paid:"تم الدفع"}[w.status]||w.status)} · ${new Date(w.created_at).toLocaleString()}</small>${w.tx_hash?`<br><small>${w.tx_hash}</small>`:""}</span></div>`).join("")}
async function payVerify(){
 if(!auth||!tg?.initDataUnsafe?.user?.id){toast("افتح اللعبة من Telegram أولًا");return}
 if(!window.TON_CONNECT_UI){toast("تعذر تحميل TON Connect؛ أعد المحاولة");return}
 try{
  if(!tonUI){
   tonUI=new TON_CONNECT_UI.TonConnectUI({manifestUrl:location.origin+"/tonconnect-manifest.json"});
   await tonUI.openModal();
  } else if(!tonUI.connected) await tonUI.openModal();
  if(!tonUI.connected){toast("اربط محفظة TON أولًا");return}
  const uid=tg.initDataUnsafe.user.id;
  const comment=new TextEncoder().encode("GHG_VERIFY_"+uid);
  const bytes=Uint8Array.from(comment);
  let binary="";bytes.forEach(b=>binary+=String.fromCharCode(b));
  const payload=btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const destination=window.TON_RECEIVE_ADDRESS;
  if(!destination){toast("عنوان الاستقبال غير مضبوط في إعدادات الخادم");return}
  await tonUI.sendTransaction({validUntil:Math.floor(Date.now()/1000)+300,messages:[{address:destination,amount:"50000000",payload}]});
  toast("تم إرسال الدفع. جارٍ التحقق...");
  setTimeout(async()=>{try{const d=await api("/api/verify-ton","POST");toast(d.message);await refresh()}catch(e){toast(e.message)}},12000);
 }catch(e){toast(e.message||"لم تكتمل عملية الدفع")}
}
// The HTML uses inline onclick="..." handlers. ES modules do not expose
// their declarations on window, so explicitly publish the functions used there.
function updateWithdrawEstimate(){const el=$("withdrawEstimate"),input=$("withdrawAmount");if(el&&input){const n=Math.max(0,Number(input.value)||0);el.textContent=(n/20000).toFixed(2)+" TON";}}
$("withdrawAmount")?.addEventListener("input",updateWithdrawEstimate);
Object.assign(window, { showTab, claim, upgrade, completeTask, copyRef, payVerify, connectWallet, disconnectWallet, requestWithdrawal });

refresh();
