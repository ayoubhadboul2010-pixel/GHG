import httpx
from fastapi import HTTPException
from .config import settings

async def find_verification_payment(telegram_id: int):
    if not settings.ton_receive_address or not settings.toncenter_api_key:
        raise HTTPException(503, "TON verification is not configured yet")
    url = f"https://toncenter.com/api/v2/getTransactions"
    headers = {"X-API-Key": settings.toncenter_api_key}
    params = {"address": settings.ton_receive_address, "limit": 30, "archival": "true"}
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url, params=params, headers=headers)
    if response.status_code != 200:
        raise HTTPException(502, "Could not check TON transactions")
    payload = response.json()
    for tx in payload.get("result", []):
        in_msg = tx.get("in_msg") or {}
        value = int(in_msg.get("value") or 0)
        comment = in_msg.get("message") or ""
        if value >= settings.ton_verify_amount_nano and comment.strip() == f"GHG_VERIFY_{telegram_id}":
            tx_hash = (tx.get("transaction_id") or {}).get("hash")
            if tx_hash:
                return tx_hash, value
    return None

async def find_comment_payment(comment: str, expected_nano: int):
    """Find an exact incoming TON payment by unique comment and exact amount."""
    if not settings.ton_receive_address or not settings.toncenter_api_key:
        raise HTTPException(503, "TON payments are not configured")
    url = "https://toncenter.com/api/v2/getTransactions"
    headers = {"X-API-Key": settings.toncenter_api_key}
    params = {"address": settings.ton_receive_address, "limit": 50, "archival": "true"}
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(url, params=params, headers=headers)
    if response.status_code != 200:
        raise HTTPException(502, "Could not check TON transactions")
    for tx in response.json().get("result", []):
        msg = tx.get("in_msg") or {}
        try: value = int(msg.get("value") or 0)
        except (TypeError, ValueError): value = 0
        if value == expected_nano and (msg.get("message") or "").strip() == comment:
            tx_hash = (tx.get("transaction_id") or {}).get("hash")
            if tx_hash: return tx_hash, value
    return None
