
import { beginCell } from "https://esm.sh/@ton/core@0.59.1";

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const auth = tg?.initData || "";

let state = null;
let tickTimer = null;

const $ = id => document.getElementById(id);

const CHANNEL_URL = "https://t.me/atlantsmtrva";
const CHANNEL_TASK_KEY = "channel_subscribe";
const CHANNEL_REWARD = 1500;


// =====================================
// TOAST
// =====================================

function toast(msg) {
 const el = $("toast");

 if (!el) {
  alert(msg);
  return;
 }

 el.textContent = msg;
 el.style.display = "block";

 setTimeout(() => {
  el.style.display = "none";
 }, 2600);
}


// =====================================
// API
// =====================================

async function api(path, method = "GET", body = null) {

 const r = await fetch(path, {
  method,

  headers: {
   "Authorization": "tma " + auth,
   "Content-Type": "application/json"
  },

  body: body === null ? undefined : JSON.stringify(body)
 });

 const data = await r.json().catch(() => ({}));

 if (!r.ok) {
  throw new Error(data.detail || "حدث خطأ");
 }

 return data;
}


// =====================================
// TABS
// =====================================

function showTab(id) {

 document.querySelectorAll(".tab").forEach(x => {
  x.classList.remove("active");
 });

 $(id)?.classList.add("active");

 document.querySelectorAll(".nav-btn").forEach(x => {
  x.classList.toggle(
   "selected",
   x.dataset.tab === id
  );
 });
}


// =====================================
// USER RENDER
// =====================================

function render(u) {

 state = u;

 $("balance").textContent =
  u.balance.toFixed(3) + " GHG";

 $("topBalance").textContent =
  u.balance.toFixed(2);

 $("pending").textContent =
  u.pending.toFixed(6) + " GHG";

 $("level").textContent = u.level;
 $("levelTop").textContent = u.level;

 $("rate").textContent =
  u.rate.toFixed(2) + " GHG/s";

 $("heroRate").textContent =
  u.rate.toFixed(2) + " GHG/s";

 $("topRate").textContent =
  (u.rate * 86400).toFixed(1) + "/d";

 $("verified").textContent =
  u.verified ? "موثق ✓" : "غير موثق";

 $("xpText").textContent =
  `${u.xp} / ${u.level * 100}`;

 $("xpBar").style.width =
  Math.min(
   100,
   u.xp / (u.level * 100) * 100
  ) + "%";

 $("profileName").textContent =
  u.first_name +
  (u.username ? " (@" + u.username + ")" : "");

 $("profileId").textContent =
  u.telegram_id;

 $("verifyBtn").textContent =
  u.verified
   ? "تم توثيق الحساب ✓"
   : "توثيق الحساب الآن 🔐";

 $("verifyBtn").disabled = u.verified;

 $("upgradeInfo").textContent =
  "التكلفة: 0.01 TON • الزيادة: +0.01 GHG/s • السرعة بعد الترقية: " +
  (u.rate + 0.01).toFixed(2) +
  " GHG/s";

 if ($("profileBalance")) {
  $("profileBalance").textContent =
   u.balance.toFixed(2) + " GHG";
 }

 if ($("profileRate")) {
  $("profileRate").textContent =
   u.rate.toFixed(2) + "/s";
 }

 if ($("profileFriends")) {
  $("profileFriends").textContent =
   $("friendsCount")?.textContent || "0";
 }

 if ($("profileVerifyBtn")) {

  $("profileVerifyBtn").textContent =
   u.verified
    ? "تم توثيق الحساب ✓"
    : "توثيق الحساب — 0.05 TON";

  $("profileVerifyBtn").disabled =
   u.verified;
 }
}


// =====================================
// TASK DISPLAY
// =====================================

function getTasksHost() {

 const existing =
  $("ghgTasksList") ||
  $("tasksList") ||
  $("taskList") ||
  $("tasksContainer") ||
  $("tasksGrid") ||
  document.querySelector("[data-task-list]");

 if (existing) {
  return existing;
 }

 let parent = Array.from(
  document.querySelectorAll(".tab")
 ).find(el => /task|mission/i.test(el.id));

 if (!parent) {
  parent =
   document.querySelector(".tab.active") ||
   document.querySelector("main") ||
   document.body;
 }

 const host = document.createElement("section");

 host.id = "ghgTasksList";
 host.style.cssText = `
  display:block;
  width:100%;
  box-sizing:border-box;
  margin:18px 0;
  padding:16px;
  border-radius:16px;
  background:rgba(30,35,48,0.95);
  color:white;
 `;

 parent.prepend(host);

 return host;
}


function renderTasks(tasks) {

 const host = getTasksHost();

 const task = Array.isArray(tasks)
  ? tasks.find(x => x.key === CHANNEL_TASK_KEY)
  : null;

 const done = Boolean(task?.done);

 host.innerHTML = `
  <div style="
   display:flex;
   align-items:center;
   justify-content:space-between;
   gap:10px;
   margin-bottom:15px;
  ">
   <strong style="font-size:18px">
    🎯 المهام والمكافآت
   </strong>

   <span style="
    background:#234d37;
    color:#78efa7;
    padding:5px 10px;
    border-radius:20px;
    font-size:12px;
   ">
    +${CHANNEL_REWARD} GHG
   </span>
  </div>

  <div style="
   padding:15px;
   border-radius:13px;
   background:rgba(255,255,255,0.06);
   border:1px solid rgba(255,255,255,0.12);
  ">

   <div style="
    font-size:16px;
    font-weight:bold;
    margin-bottom:8px;
   ">
    📢 الاشتراك في قناة Atlantis
   </div>

   <div style="
    color:#b8bdca;
    font-size:13px;
    margin-bottom:15px;
   ">
    اشترك في قناتنا واحصل على 1500 نقطة GHG.
   </div>

   <div style="
    color:#77e6a0;
    font-weight:bold;
    margin-bottom:14px;
   ">
    المكافأة: 1500 GHG
   </div>

   <button
    id="ghgJoinChannel"
    type="button"
    style="
     width:100%;
     padding:12px;
     border:0;
     border-radius:10px;
     background:#2498db;
     color:white;
     font-weight:bold;
     font-size:14px;
     margin-bottom:10px;
     cursor:pointer;
    "
    ${done ? "disabled" : ""}
   >
    ${done ? "تم الاشتراك وإكمال المهمة ✓" : "اشترك في القناة"}
   </button>

   <button
    id="ghgCheckChannel"
    type="button"
    style="
     width:100%;
     padding:12px;
     border:0;
     border-radius:10px;
     background:${done ? "#39764d" : "#258b4c"};
     color:white;
     font-weight:bold;
     font-size:14px;
     cursor:pointer;
    "
    ${done ? "disabled" : ""}
   >
    ${done ? "تم استلام 1500 GHG ✓" : "تحقق من الاشتراك واحصل على المكافأة"}
   </button>

   <div style="
    margin-top:12px;
    color:#aeb5c2;
    font-size:11px;
    text-align:center;
   ">
    ${done
     ? "حصلت على المكافأة بالفعل."
     : "المكافأة متاحة مرة واحدة لكل حساب."}
   </div>

  </div>
 `;

 const joinButton = $("ghgJoinChannel");
 const checkButton = $("ghgCheckChannel");

 joinButton?.addEventListener("click", openChannel);

 checkButton?.addEventListener("click", async () => {
  await completeTask(CHANNEL_TASK_KEY);
 });
}


// =====================================
// OPEN CHANNEL
// =====================================

function openChannel() {

 try {

  if (tg?.openTelegramLink) {
   tg.openTelegramLink(CHANNEL_URL);
  } else {
   window.open(CHANNEL_URL, "_blank");
  }

 } catch (e) {
  toast("تعذر فتح القناة");
 }
}


// =====================================
// REFRESH
// =====================================

async function refresh() {

 if (!auth) {
  toast("افتح البوت من Telegram لاستخدام حسابك");
  return;
 }

 try {

  const d = await api("/api/me");

  render(d.user);

  $("friendsCount").textContent =
   d.friends;

  $("walletStatus").textContent =
   d.user.wallet_address || "لا توجد محفظة مربوطة";

  $("refRewards").textContent =
   Number(
    d.referral_rewards ?? (d.friends * 500)
   ).toLocaleString() + " GHG";

  renderWithdrawals(d.withdrawals);

  // Display channel subscription task.
  renderTasks(d.tasks);

  const link =
   `https://t.me/${window.BOT_USERNAME || "YourBotUsername"}?startapp=ref_${d.user.telegram_id}`;

  $("refLink").textContent = link;

  if (!tickTimer) {

   tickTimer = setInterval(() => {

    if (state) {

     state.pending += state.rate;

     $("pending").textContent =
      state.pending.toFixed(6) + " GHG";
    }

   }, 1000);
  }

 } catch (e) {
  toast(e.message);
 }
}


// =====================================
// CLAIM
// =====================================

async function claim() {

 try {

  const d = await api("/api/claim", "POST");

  render(d.user);

  toast(
   "تم جمع " + d.claimed.toFixed(6) + " GHG"
  );

 } catch (e) {
  toast(e.message);
 }
}


// =====================================
// UPGRADE
// =====================================

async function upgrade() {

 try {

  if (!tonUI?.connected) {

   await connectWallet();

   if (!tonUI?.connected) return;
  }

  const intent = await api(
   "/api/upgrade/intent",
   "POST"
  );

  const payload =
   commentPayload(intent.comment);

  await tonUI.sendTransaction({

   validUntil:
    Math.floor(Date.now() / 1000) + 300,

   messages: [{
    address: intent.destination,
    amount: String(intent.amount_nano),
    payload
   }]

  });

  toast("تم إرسال الدفع، جارٍ التحقق...");

  setTimeout(async () => {

   try {

    const d = await api(
     "/api/upgrade/confirm",
     "POST"
    );

    render(d.user);

    toast(d.message);

   } catch (e) {
    toast(e.message);
   }

  }, 12000);

 } catch (e) {
  toast(e.message || "تعذر إكمال الترقية");
 }
}


// =====================================
// COMPLETE TASK
// =====================================

async function completeTask(key) {

 try {

  const button = $("ghgCheckChannel");

  if (button) {
   button.disabled = true;
   button.textContent = "جارٍ التحقق...";
  }

  const d = await api(
   "/api/task/" + encodeURIComponent(key),
   "POST"
  );

  render(d.user);

  toast(
   "مبروك! حصلت على " +
   d.reward +
   " GHG 🎉"
  );

  await refresh();

 } catch (e) {

  toast(e.message);

  if (key === CHANNEL_TASK_KEY) {

   const button = $("ghgCheckChannel");

   if (button) {
    button.disabled = false;
    button.textContent =
     "تحقق من الاشتراك واحصل على المكافأة";
   }
  }
 }
}


// =====================================
// COPY REFERRAL
// =====================================

function copyRef() {

 const t = $("refLink").textContent;

 navigator.clipboard?.writeText(t)
  .then(() => toast("تم نسخ رابط الدعوة"))
  .catch(() => toast(t));
}


// =====================================
// TON CONNECT
// =====================================

let tonUI = null;


// Convert TON comment to BOC Base64.
function commentPayload(comment) {

 const cell = beginCell()
  .storeUint(0, 32)
  .storeStringTail(comment)
  .endCell();

 const boc = cell.toBoc();

 let binary = "";

 for (const byte of boc) {
  binary += String.fromCharCode(byte);
 }

 return btoa(binary);
}


// =====================================
// ENSURE TON
// =====================================

async function ensureTon() {

 if (!window.TON_CONNECT_UI) {
  throw new Error("تعذر تحميل TON Connect");
 }

 if (!tonUI) {

  tonUI = new TON_CONNECT_UI.TonConnectUI({

   manifestUrl:
    location.origin +
    "/static/tonconnect-manifest.json"

  });
 }

 if (!tonUI.connected) {
  await tonUI.openModal();
 }

 if (!tonUI.connected) {
  throw new Error("لم يتم ربط المحفظة");
 }

 return tonUI;
}


// =====================================
// CONNECT WALLET
// =====================================

async function connectWallet() {

 try {

  await ensureTon();

  const address =
   tonUI.wallet?.account?.address;

  if (!address) {
   throw new Error("لم نحصل على عنوان المحفظة");
  }

  await api(
   "/api/wallet/connect",
   "POST",
   { address }
  );

  $("walletStatus").textContent =
   address;

  toast("تم ربط المحفظة");

 } catch (e) {
  toast(e.message);
 }
}


// =====================================
// DISCONNECT WALLET
// =====================================

async function disconnectWallet() {

 try {

  await api(
   "/api/wallet/disconnect",
   "POST"
  );

  if (tonUI?.connected) {
   await tonUI.disconnect();
  }

  $("walletStatus").textContent =
   "لا توجد محفظة مربوطة";

  toast("تم فصل المحفظة من الحساب");

 } catch (e) {
  toast(e.message);
 }
}


// =====================================
// WITHDRAWAL
// =====================================

async function requestWithdrawal() {

 try {

  if (!state?.verified) {
   throw new Error(
    "يجب توثيق الحساب بدفع 0.05 TON أولًا"
   );
  }

  if (!state?.wallet_address) {
   throw new Error("اربط محفظة TON أولًا");
  }

  const amount =
   Number($("withdrawAmount").value);

  if (!Number.isFinite(amount) || amount < 2000) {
   throw new Error(
    "الحد الأدنى للسحب هو 2,000 GHG"
   );
  }

  const d = await api(
   "/api/withdrawals",
   "POST",
   { amount }
  );

  render(d.user);

  toast(
   "تم تسجيل طلب السحب رقم " +
   d.withdrawal.id
  );

  await refresh();

 } catch (e) {
  toast(e.message);
 }
}


// =====================================
// WITHDRAWAL HISTORY
// =====================================

function renderWithdrawals(rows) {

 const el = $("withdrawHistory");

 if (!el) return;

 if (!rows?.length) {
  el.textContent = "لا توجد طلبات بعد";
  return;
 }

 el.innerHTML = rows.map(w =>

  `<div class="task-row">
   <span>
    #${w.id} —
    ${Number(w.ghg_amount).toLocaleString()} GHG
    →
    ${Number(w.ton_amount).toFixed(2)} TON

    <br>

    <small>
     ${({
      pending: "قيد المراجعة",
      approved: "تمت الموافقة",
      rejected: "مرفوض — أُعيد الرصيد",
      paid: "تم الدفع"
     }[w.status] || w.status)}

     ·
     ${new Date(w.created_at).toLocaleString()}
    </small>

    ${w.tx_hash
     ? `<br><small>${w.tx_hash}</small>`
     : ""
    }

   </span>
  </div>`

 ).join("");
}


// =====================================
// VERIFY TON
// =====================================

async function payVerify() {

 if (!auth || !tg?.initDataUnsafe?.user?.id) {

  toast("افتح اللعبة من Telegram أولًا");

  return;
 }

 if (!window.TON_CONNECT_UI) {

  toast("تعذر تحميل TON Connect؛ أعد المحاولة");

  return;
 }

 try {

  if (!tonUI) {

   tonUI = new TON_CONNECT_UI.TonConnectUI({

    manifestUrl:
     location.origin +
     "/static/tonconnect-manifest.json"

   });

   await tonUI.openModal();

  } else if (!tonUI.connected) {

   await tonUI.openModal();
  }

  if (!tonUI.connected) {

   toast("اربط محفظة TON أولًا");

   return;
  }

  const uid = tg.initDataUnsafe.user.id;

  const payload =
   commentPayload("GHG_VERIFY_" + uid);

  const destination =
   window.TON_RECEIVE_ADDRESS;

  if (!destination) {

   toast(
    "عنوان الاستقبال غير مضبوط في إعدادات الخادم"
   );

   return;
  }

  await tonUI.sendTransaction({

   validUntil:
    Math.floor(Date.now() / 1000) + 300,

   messages: [{
    address: destination,
    amount: "50000000",
    payload
   }]

  });

  toast("تم إرسال الدفع. جارٍ التحقق...");

  setTimeout(async () => {

   try {

    const d = await api(
     "/api/verify-ton",
     "POST"
    );

    toast(d.message);

    await refresh();

   } catch (e) {
    toast(e.message);
   }

  }, 12000);

 } catch (e) {

  toast(
   e.message || "لم تكتمل عملية الدفع"
  );
 }
}


// =====================================
// WITHDRAW ESTIMATE
// =====================================

function updateWithdrawEstimate() {

 const el = $("withdrawEstimate");
 const input = $("withdrawAmount");

 if (el && input) {

  const n = Math.max(
   0,
   Number(input.value) || 0
  );

  el.textContent =
   (n / 20000).toFixed(2) + " TON";
 }
}


$("withdrawAmount")?.addEventListener(
 "input",
 updateWithdrawEstimate
);


// =====================================
// GLOBAL FUNCTIONS
// =====================================

Object.assign(window, {

 showTab,
 claim,
 upgrade,
 completeTask,
 copyRef,

 payVerify,

 connectWallet,
 disconnectWallet,

 requestWithdrawal,

 refresh,

 openChannel

});


// =====================================
// START APP
// =====================================

refresh();
