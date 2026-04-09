from fastapi import FastAPI, HTTPException, Depends, Header, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from database import client, db
from auth import get_password_hash, verify_password, create_access_token, decode_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from datetime import timedelta
import time
import json
import pandas as pd
from models import UserSignup, UserLogin, OrderAction, PortfolioResponse, SignalTrigger

app = FastAPI(title="FinQuest Backend", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pandas Signal Engine ───────────────────────────────────────────────────
def detect_crossovers(closes: list[float], sym: str) -> list[dict]:
    """
    Accepts a list of close prices, builds a Pandas DataFrame,
    computes SMA50 & SMA200 via rolling(), and detects crossover intersections.
    Returns a list of signal dicts with index, type, trend, and price.
    """
    if len(closes) < 200:
        return []

    df = pd.DataFrame({"close": closes})
    df["SMA50"]  = df["close"].rolling(window=50).mean()
    df["SMA200"] = df["close"].rolling(window=200).mean()

    # Vectorised crossover detection
    df["prev_50"]  = df["SMA50"].shift(1)
    df["prev_200"] = df["SMA200"].shift(1)

    signals = []

    # Drop NaNs for boolean masking to avoid any ambiguity
    # But we want to preserve indices, so we just use pd.notna in the mask
    mask_common = pd.notna(df["prev_50"]) & pd.notna(df["prev_200"]) & pd.notna(df["SMA50"]) & pd.notna(df["SMA200"])

    # Golden Cross: SMA50 was below or equal to SMA200, now above
    golden = mask_common & (df["prev_50"] <= df["prev_200"]) & (df["SMA50"] > df["SMA200"])
    # Death Cross: SMA50 was above or equal to SMA200, now below
    death  = mask_common & (df["prev_50"] >= df["prev_200"]) & (df["SMA50"] < df["SMA200"])

    for idx in df.index[golden]:
        signals.append({
            "index": int(idx),
            "sym": sym,
            "type": "Golden Cross",
            "trend": "Upward",
            "price": float(df.loc[idx, "close"]),
            "sma50": float(df.loc[idx, "SMA50"]),
            "sma200": float(df.loc[idx, "SMA200"]),
        })

    for idx in df.index[death]:
        signals.append({
            "index": int(idx),
            "sym": sym,
            "type": "Death Cross",
            "trend": "Downward",
            "price": float(df.loc[idx, "close"]),
            "sma50": float(df.loc[idx, "SMA50"]),
            "sma200": float(df.loc[idx, "SMA200"]),
        })

    signals.sort(key=lambda s: s["index"])
    return signals


# Track previous signal state per-websocket to avoid duplicate alerts
ws_signal_state: dict[int, dict] = {}


@app.websocket("/ws/market")
async def websocket_market(websocket: WebSocket):
    """
    Bidirectional WebSocket endpoint.
    Frontend sends: { "sym": "RELIANCE", "closes": [p1, p2, ...] }
    Backend responds with crossover signals detected via Pandas.
    """
    await websocket.accept()
    ws_id = id(websocket)
    ws_signal_state[ws_id] = {"last_key": ""}
    
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON"})
                continue

            sym = data.get("sym", "UNKNOWN")
            closes = data.get("closes", [])

            if not closes or len(closes) < 200:
                await websocket.send_json({
                    "type": "no_data",
                    "message": f"Insufficient data for {sym} SMA analysis (need 200, got {len(closes)})"
                })
                continue

            # Run Pandas crossover detection (historical + potential live)
            all_signals = detect_crossovers(closes, sym)

            # ── Check for Live Signal ──
            # A live signal is a crossover that happened exactly on the last bar
            live_signal = None
            if all_signals:
                last_sig = all_signals[-1]
                if last_sig["index"] == len(closes) - 1:
                    live_signal = last_sig

            # Only emit alert if this is genuinely new (not already sent for this candle)
            state = ws_signal_state[ws_id]
            new_alert = None
            if live_signal:
                # Key includes signal type and index to ensure uniqueness per candle
                sig_key = f"{live_signal['type']}_{live_signal['index']}"
                if sig_key != state.get("last_key", ""):
                    new_alert = live_signal
                    state["last_key"] = sig_key

                    # Persist to DB
                    signal_record = {
                        "id": time.time(),
                        "sym": sym,
                        "type": live_signal["type"],
                        "trend": live_signal["trend"],
                        "price": live_signal["price"],
                        "ts": time.time() * 1000
                    }
                    try:
                        db["signals"].insert_one(signal_record)
                    except Exception:
                        pass  # Don't crash the socket if DB write fails

            # Send response
            response = {
                "type": "analysis",
                "sym": sym,
                "total_signals": len(all_signals),
                "signals": all_signals,  # All crossover points for chart rendering
            }
            if new_alert:
                response["new_signal"] = {
                    "type": new_alert["type"],
                    "trend": new_alert["trend"],
                    "price": new_alert["price"],
                    "sym": sym,
                }
            await websocket.send_json(response)

    except WebSocketDisconnect:
        ws_signal_state.pop(ws_id, None)
    except Exception:
        ws_signal_state.pop(ws_id, None)


# ─── REST Endpoints ─────────────────────────────────────────────────────────

def get_current_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization.split("Bearer ")[1]
    decoded = decode_access_token(token)
    if not decoded or "email" not in decoded:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    user = db["users"].find_one({"email": decoded["email"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.get("/")
def read_root():
    return {"message": "Welcome to the FinQuest API"}

@app.get("/ping-db")
def ping_database():
    try:
        client.admin.command('ping')
        return {"status": "success", "message": "Successfully connected to MongoDB Atlas"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auth/signup")
def signup(data: UserSignup):
    if db["users"].find_one({"email": data.email}):
        raise HTTPException(status_code=400, detail="User with this email already exists")
    
    hashed_password = get_password_hash(data.password)
    user_record = {
        "name": data.name,
        "email": data.email,
        "password": hashed_password,
        "balance": 500000.0,
        "orders": []
    }
    db["users"].insert_one(user_record)
    
    token = create_access_token(
        data={"email": data.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"token": token, "user": {"name": data.name, "email": data.email}}

@app.post("/api/auth/login")
def login(data: UserLogin):
    user = db["users"].find_one({"email": data.email})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_access_token(
        data={"email": user["email"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"token": token, "user": {"name": user["name"], "email": user["email"]}}

@app.get("/api/portfolio/me", response_model=PortfolioResponse)
def get_portfolio(user=Depends(get_current_user)):
    return {
        "balance": user.get("balance", 500000.0),
        "orders": user.get("orders", [])
    }

@app.post("/api/portfolio/order", response_model=PortfolioResponse)
def place_order(order: OrderAction, user=Depends(get_current_user)):
    cost = order.qty * order.entry
    new_balance = user.get("balance", 500000.0)
    
    if order.side == "buy":
        if cost > new_balance:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        new_balance -= cost
    elif order.side == "sell":
        new_balance += cost
        
    order_record = {
        "id": time.time(),
        "sym": order.sym,
        "side": order.side,
        "qty": order.qty,
        "entry": order.entry,
        "sl": order.sl,
        "tp": order.tp,
        "ts": time.time() * 1000
    }
    
    db["users"].update_one(
        {"_id": user["_id"]},
        {
            "$set": {"balance": new_balance},
            "$push": {"orders": {"$each": [order_record], "$position": 0}}
        }
    )
    
    return {
        "balance": new_balance,
        "orders": [order_record] + user.get("orders", [])
    }

@app.post("/api/signals/trigger")
def trigger_signal(data: SignalTrigger):
    signal_record = {
        "id": time.time(),
        "sym": data.sym,
        "type": data.type,
        "trend": data.trend,
        "price": data.price,
        "ts": time.time() * 1000
    }
    db["signals"].insert_one(signal_record)
    return {"message": "Signal triggered successfully", "signal": signal_record}

@app.get("/api/signals")
def get_signals():
    sig_docs = db["signals"].find().sort("ts", -1).limit(50)
    signals = []
    for sig in sig_docs:
        sig.pop("_id", None)
        signals.append(sig)
    return signals

@app.get("/get-signals")
def get_signals_crossovers(sym: str = "RELIANCE"):
    """
    REST endpoint that accepts a symbol and returns historical crossover signals
    from the database for that symbol.
    """
    sig_docs = db["signals"].find({"sym": sym}).sort("ts", -1).limit(100)
    signals = []
    for sig in sig_docs:
        sig.pop("_id", None)
        signals.append(sig)
    return {"sym": sym, "crossovers": signals}

@app.get("/api/market/history")
def get_market_history(sym: str, count: int = 200, end_ts: float = None, end_price: float = None):
    """
    Returns historical mock candles for a symbol, walking BACKWARDS from end_price
    to ensure 100% seamless stitching with the current session.
    """
    if end_ts is None:
        end_ts = time.time() * 1000
    
    # Use provided end_price or fallback to a default
    curr_p = end_price
    if curr_p is None:
        stocks = [
            {'sym':'RELIANCE','price':2847}, {'sym':'TCS','price':3421},
            {'sym':'AAPL','price':189.3}, {'sym':'BTC','price':67842}
        ]
        curr_p = 100.0
        for s in stocks:
            if s['sym'] == sym:
                curr_p = s['price']
                break

    vlt = 0.012
    candles = []
    
    # Walk backwards from end_ts
    for i in range(count):
        # To generate 'o,h,l,c' such that 'c' of this candle roughly matches 'o' of next candle
        # We walk backwards: curr_p is the "end" of this candle
        c = curr_p
        change = (c * vlt * (abs(c % 10) / 10.0))
        o = c - (change if i % 2 == 0 else -change)
        h = max(o, c) + (abs(o-c) * 0.4)
        l = min(o, c) - (abs(o-c) * 0.4)
        
        # timestamp goes back by 1m per candle
        ts = end_ts - ((i + 1) * 60 * 1000)
        
        candles.append({
            "ts": ts,
            "open": float(o),
            "high": float(h),
            "low": float(l),
            "close": float(c),
            "vol": int(100000 + (i * 100))
        })
        curr_p = o # Next historical candle (going back) ends where this one starts
        
    # Return in chronological order (oldest first)
    return {"sym": sym, "count": len(candles), "candles": candles[::-1]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
