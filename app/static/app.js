import { beginCell } from "https://esm.sh/@ton/core@0.59.0";
const tg = window.Telegram?.WebApp;
tg?.ready(); tg?.expand();
const auth = tg?.initData || "";
let state = null, tickTimer = null;
const $ = id => document.getElementById(id);
function toast(msg){const el=$("toast");el.textContent=msg;el.style.display="block";setTimeout(()=>el.style.display="none",2600)}
async function api(path, method="GET"){
 const r=await fetch(path,{method,headers:{"Authorization":"tma "+auth,"Content-Type":"application/json"}});
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
 $("upgradeInfo").textContent="تكلفة الترقية التالية: "+(25*(1.65**(u.level-1))).toFixed(2)+" GHG";
}
async function refresh(){
 if(!auth){toast("افتح البوت من Telegram لاستخدام حسابك");return}
 try{
  const d=await api("/api/me");render(d.user);$("friendsCount").textContent=d.friends;
  const link=`https://t.me/${window.BOT_USERNAME||"YourBotUsername"}?startapp=ref_${d.user.telegram_id}`;
  $("refLink").textContent=link;
  if(!tickTimer) tickTimer=setInterval(()=>{if(state){state.pending+=state.rate; $("pending").textContent=state.pending.toFixed(6)+" GHG"}},1000);
 }catch(e){toast(e.message)}
}
async function claim(){try{const d=await api("/api/claim","POST");render(d.user);toast("تم جمع "+d.claimed.toFixed(6)+" GHG")}catch(e){toast(e.message)}}
async function upgrade(){try{const d=await api("/api/upgrade","POST");render(d.user);toast("تمت الترقية بنجاح")}catch(e){toast(e.message)}}
async function completeTask(key){try{const d=await api("/api/task/"+key,"POST");render(d.user);toast("حصلت على "+d.reward+" GHG")}catch(e){toast(e.message)}}
function copyRef(){const t=$("refLink").textContent;navigator.clipboard?.writeText(t).then(()=>toast("تم نسخ رابط الدعوة")).catch(()=>toast(t))}
let tonUI=null;
async function payVerify(){
 if(!auth||!tg?.initDataUnsafe?.user?.id){toast("افتح اللعبة من Telegram أولًا");return}
 if(!window.TON_CONNECT_UI){toast("تعذر تحميل TON Connect؛ أعد المحاولة");return}
 try{
  if(!tonUI){
   tonUI=new TON_CONNECT_UI.TonConnectUI({manifestUrl:location.origin+"/static/tonconnect-manifest.json"});
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
refresh();
