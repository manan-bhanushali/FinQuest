from pydantic import BaseModel, EmailStr
from typing import List, Optional

class UserSignup(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class OrderAction(BaseModel):
    sym: str
    side: str # "buy" or "sell"
    qty: float
    entry: float # The current stock price at entry
    sl: float # stop loss
    tp: float # take profit

class OrderRecord(BaseModel):
    id: float
    sym: str
    side: str
    qty: float
    entry: float
    sl: float
    tp: float
    ts: float # timestamp

class PortfolioResponse(BaseModel):
    balance: float
    orders: List[OrderRecord]

class SignalTrigger(BaseModel):
    sym: str
    type: str # "Golden Cross", "Death Cross", "Scalp"
    trend: str # "Upward", "Downward"
    price: float
    
class SignalRecord(BaseModel):
    id: float
    sym: str
    type: str
    trend: str
    price: float
    ts: float
