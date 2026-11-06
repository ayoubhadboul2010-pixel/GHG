from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from datetime import datetime, timezone
from pathlib import Path
import secrets
from pydantic import BaseModel
from .db import Base, engine, get_db
from .models import User, Payment, TaskCompletion, Withdrawal, UpgradeIntent
from .security import validate_telegram_init_data
from .config import settings
from .ton import find_verification_payment, find_comment_payment

Base.metadata.create_all(bind=engine)
app = FastAPI(title="GHG Empire API", version="1.1.0")
STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC), name="static")

def get_user(authorization: str | None, db: Session):
    if not authorization or not authorization.startswith("tma "):
        raise HTTPException(401, "Open this app from Telegram")
    tg = validate_telegram_init_data(authorization[4:])
    uid = int(tg["id"])
    user = db.scalar(select(User).where(User.telegram_id == uid))
    if not user:
        start = tg.get("start_param", "")
        referrer = int(start[4:]) if start.startswith("ref_") and start[4:].isdigit() else None
        user = User(telegram_id=uid, username=tg.get("username", ""),
                    first_name=tg.get("first_name", "Miner"), referrer_id=referrer if referrer != uid else None,
                    rate=0.01)
        db.add(user); db.commit(); db.refresh(user)
        # One-time referral reward for a newly created Telegram account.
        if user.referrer_id:
            inviter = db.scalar(select(User).where(User.telegram_id == user.referrer_id))
            if inviter and inviter.telegram_id != uid:
                inviter.balance += 500.0
                db.commit()
    return user

def accrue(user: User):
    now = datetime.now(timezone.utc)
    last = user.last_tick
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    seconds = max(0, min((now - last).total_seconds(), 60 * 60 * 24 * 7))
    user.pending += seconds * user.rate
    user.last_tick = now

def serialize(user: User):
    return {"telegram_id": user.telegram_id, "username": user.username,
            "first_name": user.first_name, "balance": round(user.balance, 6),
            "pending": round(user.pending, 6), "level": user.level, "xp": user.xp,
            "rate": user.rate, "verified": user.verified, "wallet_address": user.wallet_address}

@app.get("/")
def index():
    html = (STATIC / "index.html").read_text(encoding="utf-8")
    config_script = f'<script>window.BOT_USERNAME={settings.bot_username!r};window.TON_RECEIVE_ADDRESS={settings.ton_receive_address!r};</script>'
    html = html.replace('<script type="module" src="/static/app.js"></script>', config_script + '<script type="module" src="/static/app.js"></script>')
    return HTMLResponse(html)

@app.get("/tonconnect-manifest.json")
def tonconnect_manifest():
    base = settings.webapp_url.rstrip("/")
    if not base:
        raise HTTPException(503, "WEBAPP_URL is not configured")
    return JSONResponse({"url": base, "name": "GHG Empire", "iconUrl": base + "/static/assets/mine-hero.jpg"})

@app.get("/api/me")
def me(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = get_user(authorization, db); accrue(user); db.commit()
    friends = db.scalar(select(func.count()).select_from(User).where(User.referrer_id == user.telegram_id)) or 0
    withdrawals = db.scalars(select(Withdrawal).where(Withdrawal.user_id == user.telegram_id).order_by(Withdrawal.created_at.desc()).limit(30)).all()
    return {"user": serialize(user), "friends": friends, "referral_rewards": friends * 500, "withdrawals": [serialize_withdrawal(w) for w in withdrawals], "tasks": [
        {"key":"daily_visit","title":"زيارة المنجم","reward":1.0,"done":False},
        {"key":"invite_friend","title":"دعوة صديق جديد","reward":500.0,"done":False}
    ]}

@app.post("/api/claim")
def claim(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = get_user(authorization, db); accrue(user)
    amount = user.pending
    if amount < 0.001:
        raise HTTPException(400, "لا توجد أرباح كافية للجمع بعد")
    user.balance += amount; user.pending = 0; user.xp += int(amount * 10)
    while user.xp >= user.level * 100:
        user.xp -= user.level * 100; user.level += 1
    db.commit()
    return {"claimed": round(amount, 6), "user": serialize(user)}

@app.post("/api/upgrade")
def upgrade(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = get_user(authorization, db); accrue(user)
    raise HTTPException(400, "الترقية تتم بدفع 0.01 TON والتحقق من وصول المعاملة أولًا")

@app.post("/api/verify-ton")
async def verify_ton(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = get_user(authorization, db)
    if user.verified:
        return {"verified": True, "message": "الحساب موثق بالفعل"}
    found = await find_verification_payment(user.telegram_id)
    if not found:
        raise HTTPException(404, "لم نعثر على دفعة مطابقة بعد. تأكد من التعليق والمبلغ ثم أعد المحاولة.")
    tx_hash, amount = found
    if db.scalar(select(Payment).where(Payment.tx_hash == tx_hash)):
        raise HTTPException(409, "هذه المعاملة مستخدمة مسبقًا")
    db.add(Payment(user_id=user.telegram_id, tx_hash=tx_hash, amount_nano=amount))
    user.verified = True
    db.commit()
    return {"verified": True, "message": "تم توثيق الحساب بنجاح"}

@app.post("/api/task/{task_key}")
def complete_task(task_key: str, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = get_user(authorization, db)
    rewards = {"daily_visit": 1.0}
    if task_key not in rewards:
        raise HTTPException(400, "المهمة غير متاحة أو تتطلب تحققًا إضافيًا")
    exists = db.scalar(select(TaskCompletion).where(TaskCompletion.user_id == user.telegram_id,
                                                     TaskCompletion.task_key == task_key))
    if exists: raise HTTPException(409, "أكملت هذه المهمة مسبقًا")
    user.balance += rewards[task_key]
    db.add(TaskCompletion(user_id=user.telegram_id, task_key=task_key)); db.commit()
    return {"reward": rewards[task_key], "user": serialize(user)}


class WalletBody(BaseModel):
    address: str

class WithdrawalRequest(BaseModel):
    amount: float

def serialize_withdrawal(w):
    return {"id": w.id, "ghg_amount": w.ghg_amount, "ton_amount": w.ton_amount, "wallet_address": w.wallet_address, "status": w.status, "tx_hash": w.tx_hash, "admin_note": w.admin_note, "created_at": w.created_at.isoformat()}

@app.post("/api/wallet/connect")
def connect_wallet(body: WalletBody, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = get_user(authorization, db)
    address = body.address.strip()
    if not ((address.startswith(("UQ", "EQ")) and len(address) == 48 and all(c.isalnum() or c in "-_" for c in address)) or (address.startswith("0:") and len(address) == 66 and all(c in "0123456789abcdefABCDEF" for c in address[2:]))):
        raise HTTPException(400, "عنوان TON غير صالح")
    user.wallet_address = address; db.commit()
    return {"wallet_address": user.wallet_address}

@app.post("/api/wallet/disconnect")
def disconnect_wallet(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = get_user(authorization, db); user.wallet_address = ""; db.commit()
    return {"disconnected": True}

@app.post("/api/withdrawals")
def request_withdrawal(body: WithdrawalRequest, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = get_user(authorization, db); accrue(user)
    if not user.verified: raise HTTPException(403, "توثيق الحساب إلزامي قبل السحب")
    if not user.wallet_address: raise HTTPException(403, "اربط محفظة TON أولًا")
    amount = round(float(body.amount), 6)
    if amount < 2000 or amount > user.balance: raise HTTPException(400, "الحد الأدنى 2,000 GHG ولا يمكن سحب أكثر من رصيدك")
    if user.balance < amount: raise HTTPException(400, "الحد الأدنى للسحب 2,000 GHG")
    user.balance -= amount
    w = Withdrawal(user_id=user.telegram_id, wallet_address=user.wallet_address, ghg_amount=amount, ton_amount=amount/20000.0, status="pending")
    db.add(w); db.commit(); db.refresh(w)
    return {"withdrawal": serialize_withdrawal(w), "user": serialize(user)}

@app.get("/api/admin/withdrawals")
def admin_withdrawals(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    require_admin(authorization)
    rows = db.scalars(select(Withdrawal).order_by(Withdrawal.created_at.desc()).limit(200)).all()
    return {"withdrawals": [serialize_withdrawal(w) for w in rows]}

class WithdrawalDecision(BaseModel):
    action: str
    tx_hash: str = ""
    note: str = ""

@app.post("/api/admin/withdrawals/{withdrawal_id}")
def decide_withdrawal(withdrawal_id: int, body: WithdrawalDecision, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    require_admin(authorization)
    w = db.get(Withdrawal, withdrawal_id)
    if not w: raise HTTPException(404, "طلب السحب غير موجود")
    if body.action == "reject" and w.status not in {"pending", "approved"}: raise HTTPException(409, "لا يمكن رفض هذا الطلب الآن")
    if body.action == "approve" and w.status != "pending": raise HTTPException(409, "هذا الطلب ليس بانتظار الموافقة")
    if body.action == "paid" and w.status != "approved": raise HTTPException(409, "وافق على الطلب أولًا قبل تسجيل الدفع")
    if body.action == "reject":
        user = db.scalar(select(User).where(User.telegram_id == w.user_id))
        if user: user.balance += w.ghg_amount
        w.status = "rejected"; w.admin_note = body.note[:500]
    elif body.action == "approve":
        w.status = "approved"; w.admin_note = body.note[:500]
    elif body.action == "paid":
        tx_value = body.tx_hash.strip()
        if not (40 <= len(tx_value) <= 100 and all(c.isalnum() or c in "-_" for c in tx_value)): raise HTTPException(400, "رقم معاملة TON غير صالح")
        if db.scalar(select(Withdrawal).where(Withdrawal.tx_hash == body.tx_hash.strip())): raise HTTPException(409, "رقم المعاملة مستخدم سابقًا")
        w.status = "paid"; w.tx_hash = tx_value; w.admin_note = body.note[:500]
    else: raise HTTPException(400, "إجراء غير معروف")
    w.updated_at = datetime.now(timezone.utc); db.commit()
    return {"withdrawal": serialize_withdrawal(w)}

@app.post("/api/upgrade/intent")
def create_upgrade_intent(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = get_user(authorization, db)
    comment = f"GHG_UP_{user.telegram_id}_{secrets.token_hex(5)}"
    intent = UpgradeIntent(user_id=user.telegram_id, comment=comment)
    db.add(intent); db.commit()
    return {"comment": comment, "amount_nano": 10_000_000, "destination": settings.ton_receive_address}

@app.post("/api/upgrade/confirm")
async def confirm_upgrade(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = get_user(authorization, db)
    intent = db.scalar(select(UpgradeIntent).where(UpgradeIntent.user_id == user.telegram_id, UpgradeIntent.status == "pending").order_by(UpgradeIntent.created_at.desc()))
    if not intent: raise HTTPException(404, "لا يوجد طلب ترقية بانتظار التحقق")
    found = await find_comment_payment(intent.comment, 10_000_000)
    if not found: raise HTTPException(404, "لم يتم العثور على دفع 0.01 TON بعد")
    tx_hash, amount = found
    if db.scalar(select(Payment).where(Payment.tx_hash == tx_hash)): raise HTTPException(409, "المعاملة مستخدمة مسبقًا")
    db.add(Payment(user_id=user.telegram_id, tx_hash=tx_hash, amount_nano=amount))
    intent.tx_hash = tx_hash; intent.status = "paid"
    user.rate = round(user.rate + 0.01, 8); user.level += 1
    db.commit()
    return {"user": serialize(user), "message": "تم تأكيد الدفع وتفعيل الترقية"}

def require_admin(authorization: str | None):
    if not authorization or not authorization.startswith("tma "):
        raise HTTPException(401, "Open admin from Telegram")
    tg = validate_telegram_init_data(authorization[4:])
    if int(tg["id"]) not in settings.admins:
        raise HTTPException(403, "Admin only")

@app.get("/api/admin/stats")
def admin_stats(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    require_admin(authorization)
    return {"users": db.scalar(select(func.count()).select_from(User)) or 0,
            "verified": db.scalar(select(func.count()).select_from(User).where(User.verified == True)) or 0,
            "total_balance": db.scalar(select(func.sum(User.balance)).select_from(User)) or 0}

class AdminAdjust(BaseModel):
    telegram_id: int
    amount: float

@app.post("/api/admin/adjust")
def admin_adjust(body: AdminAdjust, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    require_admin(authorization)
    if abs(body.amount) > 1_000_000: raise HTTPException(400, "Adjustment too large")
    user = db.scalar(select(User).where(User.telegram_id == body.telegram_id))
    if not user: raise HTTPException(404, "User not found")
    user.balance = max(0, user.balance + body.amount); db.commit()
    return {"user": serialize(user)}

@app.get("/admin")
def admin_page():
    return FileResponse(STATIC / "admin.html")

@app.get("/health")
def health():
    return {"ok": True}
