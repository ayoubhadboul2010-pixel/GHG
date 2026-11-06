import hashlib, hmac, json
from urllib.parse import parse_qsl
from fastapi import HTTPException
from .config import settings

def validate_telegram_init_data(init_data: str) -> dict:
    if not settings.bot_token:
        raise HTTPException(503, "Bot token is not configured")
    try:
        data = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = data.pop("hash")
    except Exception:
        raise HTTPException(401, "Invalid Telegram initData")
    pairs = "\n".join(f"{k}={v}" for k, v in sorted(data.items()))
    secret = hmac.new(b"WebAppData", settings.bot_token.encode(), hashlib.sha256).digest()
    calculated = hmac.new(secret, pairs.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calculated, received_hash):
        raise HTTPException(401, "Telegram authentication failed")
    import time
    auth_date = int(data.get("auth_date", "0"))
    if abs(int(time.time()) - auth_date) > 86400:
        raise HTTPException(401, "Telegram session expired")
    try:
        return json.loads(data["user"])
    except Exception:
        raise HTTPException(401, "Telegram user data missing")
