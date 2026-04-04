from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from database import client, db
from auth import get_password_hash, verify_password, create_access_token, decode_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from datetime import timedelta
import time
from models import UserSignup, UserLogin, OrderAction, PortfolioResponse

app = FastAPI(title="FinQuest Backend", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        # Pinging database to verify connection instance
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
        "ts": time.time() * 1000 # ms timestamp matching frontend formatting
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
