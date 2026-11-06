from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from datetime import datetime, timezone
from pathlib import Path
from pydantic import BaseModel
from .db import Base, engine, get_db
from .models import User, Payment, TaskCompletion
from .security import validate_telegram_init_data
from .config import settings
from .ton import find_verification_payment

Base.metadata.create_all(bind=engine)
app = FastAPI(title="GHG Empire API", version="1.0.0")
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
                    first_name=tg.get("first_name", "Miner"), referrer_id=referrer)
        db.add(user); db.commit(); db.refresh(user)
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
            "rate": user.rate, "verified": user.verified}

@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")

@app.get("/api/me")
def me(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = get_user(authorization, db); accrue(user); db.commit()
    friends = db.scalar(select(func.count()).select_from(User).where(User.referrer_id == user.telegram_id)) or 0
    return {"user": serialize(user), "friends": friends, "tasks": [
        {"key":"daily_visit","title":"زيارة المنجم","reward":1.0,"done":False},
        {"key":"invite_friend","title":"دعوة صديق","reward":5.0,"done":False}
    ]}

@app.post("/api/claim")
def claim(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = get_user(authorization, db); accrue(user)
    amount = user.pending
    if amount < 0.001:
        raise HTTPException(400, "لا توجد أرباح كافية للجمع بعد")
    user.balance += amount; user.pending = 0; user.xp += int(amount * 10)
    while user.xp >= user.level * 100:
        user.xp -= user.level * 100; user.level += 1; user.rate = round(user.rate * 1.12, 6)
    db.commit()
    return {"claimed": round(amount, 6), "user": serialize(user)}

@app.post("/api/upgrade")
def upgrade(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = get_user(authorization, db); accrue(user)
    cost = round(25 * (1.65 ** (user.level - 1)), 4)
    if user.balance < cost:
        raise HTTPException(400, f"تحتاج {cost} GHG للترقية")
    user.balance -= cost; user.rate = round(user.rate * 1.25, 6); user.level += 1
    db.commit()
    return {"cost": cost, "user": serialize(user)}

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
