const tg=window.Telegram?.WebApp;tg?.ready();tg?.expand();
const auth="tma "+(tg?.initData||"");
async function req(url,method="GET",body){const r=await fetch(url,{method,headers:{"Authorization":auth,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.detail||"خطأ");return d}
async function load(){try{const d=await req("/api/admin/stats");document.getElementById("stats").innerHTML=`<p>المستخدمون: <b>${d.users}</b></p><p>الحسابات الموثقة: <b>${d.verified}</b></p><p>إجمالي الرصيد: <b>${Number(d.total_balance).toFixed(3)} GHG</b></p>`}catch(e){document.getElementById("stats").textContent=e.message}}
async function adjust(){try{const d=await req("/api/admin/adjust","POST",{telegram_id:Number(document.getElementById("uid").value),amount:Number(document.getElementById("amount").value)});document.getElementById("msg").textContent="الرصيد الجديد: "+d.user.balance+" GHG"}catch(e){document.getElementById("msg").textContent=e.message}}
load();
