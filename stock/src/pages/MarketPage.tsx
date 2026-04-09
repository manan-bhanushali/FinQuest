import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, type Order } from "@/components/AuthContext";
import { toast } from "sonner";

/* ══════════════════════════════════════ TYPES ══════════════════════════════════════ */
interface Candle { ts: number; open: number; high: number; low: number; close: number; vol: number }
interface Asset  { sym: string; name: string; price: number; currency: string }
interface Pat    { i: number; name: string; sig: 'bull'|'bear'|'neut'; emoji: string; desc: string }
interface Ind    { ma40:boolean; ma50:boolean; ma200:boolean; bb:boolean; vol:boolean; rsi:boolean }
interface CrossoverPoint { index: number; sym: string; type: string; trend: string; price: number; sma50: number; sma200: number }
interface SignalModalData { type: string; trend: string; price: number; sym: string; sma50: number; sma200: number }
interface PatSet { bull:boolean; bear:boolean; neut:boolean }
type TFKey = '2m'|'5m'|'10m'|'15m'|'30m'|'1D'|'1M'|'1Y';
type CT    = 'candle'|'line'|'bar';

/* ══════════════════════════════════════ ASSETS ══════════════════════════════════════ */
const ASSETS: Record<string, Asset[]> = {
  stocks: [
    {sym:'RELIANCE',name:'Reliance Industries',price:2847,currency:'₹'},
    {sym:'TCS',name:'Tata Consultancy Svcs',price:3421,currency:'₹'},
    {sym:'INFY',name:'Infosys Ltd',price:1457,currency:'₹'},
    {sym:'HDFC',name:'HDFC Bank',price:1623,currency:'₹'},
    {sym:'WIPRO',name:'Wipro Ltd',price:524,currency:'₹'},
    {sym:'ITC',name:'ITC Ltd',price:435,currency:'₹'},
    {sym:'BAJFIN',name:'Bajaj Finance',price:7124,currency:'₹'},
    {sym:'TITAN',name:'Titan Company',price:3456,currency:'₹'},
    {sym:'MARUTI',name:'Maruti Suzuki',price:12854,currency:'₹'},
    {sym:'ZOMATO',name:'Zomato Ltd',price:187,currency:'₹'},
    {sym:'ADANI',name:'Adani Enterprises',price:2547,currency:'₹'},
    {sym:'SUNPHARMA',name:'Sun Pharma',price:1284,currency:'₹'},
    {sym:'HCLTECH',name:'HCL Technologies',price:1456,currency:'₹'},
    {sym:'POWERGRID',name:'Power Grid Corp',price:284,currency:'₹'},
    {sym:'AAPL',name:'Apple Inc',price:189.3,currency:'$'},
    {sym:'MSFT',name:'Microsoft Corp',price:415.5,currency:'$'},
    {sym:'NVDA',name:'NVIDIA Corp',price:878.4,currency:'$'},
    {sym:'AMZN',name:'Amazon.com',price:182.1,currency:'$'},
    {sym:'GOOGL',name:'Alphabet Inc',price:175.6,currency:'$'},
    {sym:'META',name:'Meta Platforms',price:505.2,currency:'$'},
    {sym:'TSLA',name:'Tesla Inc',price:176.8,currency:'$'},
    {sym:'JPM',name:'JPMorgan Chase',price:198.4,currency:'$'},
    {sym:'V',name:'Visa Inc',price:278.2,currency:'$'},
    {sym:'BABA',name:'Alibaba Group',price:79.4,currency:'$'},
    {sym:'TSMC',name:'Taiwan Semiconductor',price:142.8,currency:'$'},
  ],
  crypto: [
    {sym:'BTC',name:'Bitcoin',price:67842,currency:'$'},
    {sym:'ETH',name:'Ethereum',price:3584,currency:'$'},
    {sym:'BNB',name:'BNB',price:598,currency:'$'},
    {sym:'SOL',name:'Solana',price:172,currency:'$'},
    {sym:'ADA',name:'Cardano',price:0.52,currency:'$'},
    {sym:'XRP',name:'Ripple',price:0.54,currency:'$'},
    {sym:'DOGE',name:'Dogecoin',price:0.165,currency:'$'},
    {sym:'AVAX',name:'Avalanche',price:38.4,currency:'$'},
    {sym:'LINK',name:'Chainlink',price:18.6,currency:'$'},
    {sym:'UNI',name:'Uniswap',price:12.4,currency:'$'},
  ],
  metals: [
    {sym:'GOLD',name:'Gold (XAU)',price:2348,currency:'$'},
    {sym:'SILVER',name:'Silver (XAG)',price:28.4,currency:'$'},
    {sym:'PLATINUM',name:'Platinum',price:975,currency:'$'},
    {sym:'PALLADIUM',name:'Palladium',price:1048,currency:'$'},
    {sym:'COPPER',name:'Copper',price:4.42,currency:'$'},
  ],
  energy: [
    {sym:'CRUDE',name:'Crude Oil WTI',price:78.5,currency:'$'},
    {sym:'BRENT',name:'Brent Crude',price:82.3,currency:'$'},
    {sym:'NATGAS',name:'Natural Gas',price:2.14,currency:'$'},
    {sym:'COAL',name:'Thermal Coal',price:128.4,currency:'$'},
    {sym:'URANIUM',name:'Uranium',price:92.5,currency:'$'},
  ],
};
const ALL_ASSETS: Asset[] = Object.values(ASSETS).flat();

/* ══════════════════════════════════════ TF CONFIG ══════════════════════════════════════ */
const TF_CFG: Record<TFKey, {n:number; vlt:number; fmt:(i:number)=>string}> = {
  '2m' :{n:90,vlt:0.0035,fmt:(i)=>`${String(Math.floor((480+i*2)/60)%12||12).padStart(2,'0')}:${String((480+i*2)%60).padStart(2,'0')}`},
  '5m' :{n:78,vlt:0.005, fmt:(i)=>`${String(Math.floor((480+i*5)/60)%12||12).padStart(2,'0')}:${String((480+i*5)%60).padStart(2,'0')}`},
  '10m':{n:60,vlt:0.007, fmt:(i)=>`${String(Math.floor((480+i*10)/60)%12||12).padStart(2,'0')}:${String((480+i*10)%60).padStart(2,'0')}`},
  '15m':{n:56,vlt:0.009, fmt:(i)=>`${String(Math.floor((480+i*15)/60)%12||12).padStart(2,'0')}:${String((480+i*15)%60).padStart(2,'0')}`},
  '30m':{n:48,vlt:0.012, fmt:(i)=>{const L=['9AM','9:30','10AM','10:30','11AM','11:30','12PM','12:30','1PM','1:30','2PM','2:30','3PM','3:30','4PM'];return L[i%15]||`D${Math.floor(i/15)+1}`}},
  '1D' :{n:65,vlt:0.022, fmt:(i)=>{const d=new Date(Date.now()-((65-i)*86400000));return`${d.getDate()}/${d.getMonth()+1}`}},
  '1M' :{n:48,vlt:0.065, fmt:(i)=>{const d=new Date(Date.now()-((48-i)*30*86400000));const m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];return`${m}'${String(d.getFullYear()).slice(2)}`}},
  '1Y' :{n:14,vlt:0.18,  fmt:(i)=>`${new Date().getFullYear()-14+i}`},
};

/* ══════════════════════════════════════ CACHE & DATA GEN ══════════════════════════════════════ */
const CACHE: Record<string, Candle[]> = {};

function genOHLC(base: number, n: number, vlt: number): Candle[] {
  const out: Candle[] = [];
  let p = base * (0.55 + Math.random() * 0.25);
  const bias = (Math.random() - 0.48) * 0.001;
  let currTs = Date.now() - (n * 60 * 1000);
  
  for (let i = 0; i < n; i++) {
    const o = p, d = bias + (Math.random() - 0.48) * vlt;
    const c = Math.max(o * (1 + d), o * 0.001);
    const body = Math.abs(c - o);
    const h = Math.max(o, c) + body * (0.3 + Math.random() * 1.2);
    const l = Math.max(Math.min(o, c) - body * (0.3 + Math.random() * 1.2), o * 0.001);
    out.push({ ts: currTs, open: o, high: h, low: l, close: c, vol: Math.floor((200000 + Math.random() * 2000000) * (1 + body / o * 10)) });
    p = c;
    currTs += (60 * 1000);
  }
  const scale = base / out[out.length - 1].close;
  return out.map(c => ({ ...c, open: c.open*scale, high: c.high*scale, low: c.low*scale, close: c.close*scale }));
}

function getCandles(sym: string, tf: TFKey): Candle[] {
  const k = `${sym}_${tf}`;
  if (!CACHE[k]) {
    const a = ALL_ASSETS.find(x => x.sym === sym);
    if (!a) return [];
    CACHE[k] = genOHLC(a.price, TF_CFG[tf].n, TF_CFG[tf].vlt);
  }
  return CACHE[k];
}

// Pre-generate common assets
['RELIANCE','TCS','AAPL','NVDA','BTC','ETH','GOLD'].forEach(s =>
  (Object.keys(TF_CFG) as TFKey[]).forEach(t => getCandles(s, t))
);

/* ══════════════════════════════════════ INDICATORS ══════════════════════════════════════ */
function calcMA(cls: number[], p: number): (number|null)[] {
  return cls.map((_,i) => i < p-1 ? null : cls.slice(i-p+1,i+1).reduce((a,v)=>a+v,0)/p);
}

function calcBB(cls: number[], p=20, m=2): {upper:number|null; lower:number|null}[] {
  const ma = calcMA(cls, p);
  return cls.map((_,i) => {
    if (ma[i] === null) return { upper: null, lower: null };
    const sl = cls.slice(Math.max(0,i-p+1),i+1);
    const mn = ma[i] as number;
    const std = Math.sqrt(sl.reduce((s,v)=>s+(v-mn)**2,0)/sl.length);
    return { upper: mn+m*std, lower: mn-m*std };
  });
}

function calcRSI(cls: number[], p=14): (number|null)[] {
  return cls.map((_,i) => {
    if (i < p) return null;
    let g=0, l=0;
    for (let j=i-p+1;j<=i;j++) { const d=cls[j]-cls[j-1]; if(d>0)g+=d; else l+=Math.abs(d); }
    const rs = l===0 ? 100 : (g/p)/(l/p);
    return 100 - 100/(1+rs);
  });
}

/* ══════════════════════════════════════ PATTERN DETECTION ══════════════════════════════════════ */
function detectPatterns(candles: Candle[], ps: PatSet): Pat[] {
  const pats: Pat[] = [];
  for (let i=2; i<candles.length; i++) {
    const c=candles[i], p=candles[i-1];
    const body=Math.abs(c.close-c.open), range=c.high-c.low;
    if (range<0.0001) continue;
    const upper=c.high-Math.max(c.open,c.close), lower=Math.min(c.open,c.close)-c.low;
    const bull=c.close>c.open, pbull=p.close>p.open, pbody=Math.abs(p.close-p.open);

    const add = (name:string, sig:'bull'|'bear'|'neut', emoji:string, desc:string) => {
      if (sig==='bull'&&!ps.bull) return;
      if (sig==='bear'&&!ps.bear) return;
      if (sig==='neut'&&!ps.neut) return;
      pats.push({i,name,sig,emoji,desc});
    };

    if (body/range<0.08) { add('Doji','neut','⚖️','Indecision — trend may reverse'); continue; }
    if (body/range>0.92) add(bull?'Bullish Marubozu':'Bearish Marubozu',bull?'bull':'bear',bull?'🟩':'🟥',bull?'Strong bullish momentum':'Strong bearish momentum');
    if (lower>2*body&&upper<body*0.6&&body>0) add('Hammer','bull','🔨','Bullish reversal — buyers stepped in at lows');
    if (upper>2*body&&lower<body*0.6&&body>0) add('Shooting Star','bear','⭐','Bearish reversal — sellers rejected highs');
    if (upper>2*body&&lower<body*0.5&&bull&&body>0) add('Inv. Hammer','bull','🔃','Potential bullish reversal after downtrend');
    if (lower>2.5*body&&upper<body*0.4&&!bull&&body>0) add('Hanging Man','bear','🪝','Bearish signal after uptrend');
    if (body/range<0.25&&upper>body*0.7&&lower>body*0.7) add('Spinning Top','neut','🌀','Market indecision');
    if (!pbull&&bull&&c.open<=p.close&&c.close>=p.open&&pbody>0) add('Bullish Engulfing','bull','📈','Strong buy signal — bulls overwhelmed bears');
    if (pbull&&!bull&&c.open>=p.close&&c.close<=p.open&&pbody>0) add('Bearish Engulfing','bear','📉','Strong sell signal — bears overwhelmed bulls');
    if (i>=3&&bull&&candles[i-1].close>candles[i-1].open&&candles[i-2].close>candles[i-2].open&&c.close>p.close&&p.close>candles[i-2].close) add('Three White Soldiers','bull','🎖️','Strong bullish reversal');
    if (i>=3&&!bull&&!pbull&&candles[i-2].close<candles[i-2].open&&c.close<p.close&&p.close<candles[i-2].close) add('Three Black Crows','bear','🪦','Strong bearish continuation');
    if (i>=3) {
      const p3=candles[i-2], p2b=candles[i-1];
      const p3b=Math.abs(p3.close-p3.open), p2bb=Math.abs(p2b.close-p2b.open);
      if (p3.close<p3.open&&p2bb<p3b*0.4&&bull) add('Morning Star','bull','🌅','Bullish reversal — end of downtrend');
      if (p3.close>p3.open&&p2bb<p3b*0.4&&!bull) add('Evening Star','bear','🌆','Bearish reversal — end of uptrend');
    }
    if (!pbull&&bull&&c.open<p.low&&c.close>p.open+Math.abs(p.close-p.open)*0.5) add('Piercing Line','bull','🗡️','Bullish reversal — strong recovery');
    if (pbull&&!bull&&c.open>p.high&&c.close<p.open+Math.abs(p.close-p.open)*0.5) add('Dark Cloud Cover','bear','☁️','Bearish reversal — failed rally');
    if (pbull&&!bull&&Math.abs(p.high-c.high)/range<0.02) add('Tweezer Top','bear','🔝','Bearish reversal at resistance');
    if (!pbull&&bull&&Math.abs(p.low-c.low)/range<0.02) add('Tweezer Bottom','bull','🔻','Bullish reversal at support');
  }
  const seen=new Set<string>(), out:Pat[]=[];
  for (let i=pats.length-1;i>=0;i--) {
    if (!seen.has(pats[i].name)) { seen.add(pats[i].name); out.unshift(pats[i]); }
  }
  return out.slice(-12);
}

/* ══════════════════════════════════════ HELPERS ══════════════════════════════════════ */
const fmtP = (p:number, cur='$') => p>=1000 ? cur+p.toLocaleString('en',{maximumFractionDigits:2}) : p>=1 ? cur+p.toFixed(2) : cur+p.toFixed(4);
const fmtV = (v:number) => v>=1e6 ? (v/1e6).toFixed(2)+'M' : v>=1e3 ? (v/1e3).toFixed(0)+'K' : String(v);

/* ══════════════════════════════════════ CANVAS DRAW ══════════════════════════════════════ */
function drawChart(
  canvas: HTMLCanvasElement,
  fullCandles: Candle[],
  tf: TFKey,
  ct: CT,
  ind: Ind,
  hoverIdx: number,
  patterns: Pat[],
  slPrice: number,
  tpPrice: number,
  isFetchingLower: boolean
) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !fullCandles.length) return;
  const W=canvas.clientWidth, H=canvas.clientHeight;
  if (W===0||H===0) return;
  ctx.clearRect(0,0,W,H);

  const viewN = TF_CFG[tf].n;
  const candles = fullCandles.slice(-viewN);

  const RSI_H=ind.rsi?70:0, VOL_H=ind.vol?55:0;
  const PAD_L=72, PAD_R=14, PAD_T=24, PAD_B=22;
  const PH=H-PAD_T-PAD_B-VOL_H-RSI_H, TW=W-PAD_L-PAD_R;
  const fullCloses = fullCandles.map(c=>c.close);
  const closes=candles.map(c=>c.close);
  const bb=ind.bb?calcBB(fullCloses).slice(-viewN):null;

  const allP=[...candles.map(c=>c.high),...candles.map(c=>c.low)];
  if (bb) bb.forEach(b=>{if(b.upper!==null){allP.push(b.upper as number,b.lower as number);}});
  if (slPrice>0) allP.push(slPrice);
  if (tpPrice>0) allP.push(tpPrice);
  const maxP=Math.max(...allP), minP=Math.min(...allP);
  const pr=maxP-minP, pMax=maxP+pr*0.08, pMin=minP-pr*0.08, pSpan=pMax-pMin;
  const PY=(p:number)=>PAD_T+(pMax-p)/pSpan*PH;
  const BY=H-PAD_B-RSI_H;
  const sp=TW/candles.length, CW=Math.min(18,Math.max(1.5,sp*0.72));
  const maxVol=Math.max(...candles.map(c=>c.vol));

  // Background
  ctx.fillStyle='#020810'; ctx.fillRect(0,0,W,H);

  // Price grid
  ctx.strokeStyle='rgba(0,100,180,0.1)'; ctx.lineWidth=0.7;
  for (let i=0;i<=7;i++) {
    const y=PAD_T+i*(PH/7);
    ctx.beginPath(); ctx.moveTo(PAD_L,y); ctx.lineTo(W-PAD_R,y); ctx.stroke();
    const pv=pMax-i*(pSpan/7);
    ctx.fillStyle='#3a5f7f'; ctx.font="9px 'Share Tech Mono',monospace"; ctx.textAlign='right';
    ctx.fillText(pv>=1000?pv.toLocaleString('en',{maximumFractionDigits:0}):pv>=1?pv.toFixed(2):pv.toFixed(4), PAD_L-4, y+3);
  }

  // Vertical grid + time labels
  const lev=Math.ceil(candles.length/8);
  for (let i=0;i<candles.length;i+=lev) {
    const x=PAD_L+i*sp+sp/2;
    ctx.strokeStyle='rgba(0,100,180,0.1)'; ctx.lineWidth=0.7;
    ctx.beginPath(); ctx.moveTo(x,PAD_T); ctx.lineTo(x,BY); ctx.stroke();
    ctx.fillStyle='#3a5f7f'; ctx.font="8.5px 'Share Tech Mono',monospace"; ctx.textAlign='center';
    ctx.fillText(TF_CFG[tf].fmt(i), x, H-PAD_B-RSI_H-3);
  }

  // Bollinger Bands
  if (ind.bb&&bb) {
    (['upper','lower'] as const).forEach(k=>{
      ctx.strokeStyle='rgba(160,100,255,0.45)'; ctx.lineWidth=1; ctx.setLineDash([4,3]);
      ctx.beginPath(); let f=true;
      bb.forEach((b,i)=>{if(b[k]===null)return;const x=PAD_L+i*sp+sp/2;f?(ctx.moveTo(x,PY(b[k] as number)),f=false):ctx.lineTo(x,PY(b[k] as number));});
      ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.beginPath(); let f=true;
    bb.forEach((b,i)=>{if(b.upper===null)return;const x=PAD_L+i*sp+sp/2;f?(ctx.moveTo(x,PY(b.upper as number)),f=false):ctx.lineTo(x,PY(b.upper as number));});
    bb.slice().reverse().forEach((b,ri)=>{if(b.lower===null)return;const i=bb.length-1-ri;ctx.lineTo(PAD_L+i*sp+sp/2,PY(b.lower as number));});
    ctx.closePath(); ctx.fillStyle='rgba(160,100,255,0.04)'; ctx.fill();
  }

  // Volume bars
  if (ind.vol&&VOL_H>0) {
    ctx.fillStyle='rgba(0,100,160,0.1)'; ctx.fillRect(PAD_L,BY-VOL_H,TW,VOL_H);
    ctx.strokeStyle='rgba(0,100,180,0.1)'; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.moveTo(PAD_L,BY-VOL_H); ctx.lineTo(W-PAD_R,BY-VOL_H); ctx.stroke();
    ctx.fillStyle='rgba(0,200,255,0.45)'; ctx.font="7.5px 'Share Tech Mono',monospace"; ctx.textAlign='left'; ctx.fillText('VOL',PAD_L+2,BY-VOL_H+10);
    candles.forEach((c,i)=>{
      const up=c.close>=c.open, x=PAD_L+i*sp, vh=Math.max(1,(c.vol/maxVol)*VOL_H*0.82);
      ctx.fillStyle=up?'rgba(0,255,157,0.28)':'rgba(255,51,85,0.28)';
      ctx.fillRect(x+sp*.1, BY-vh, sp*.8, vh);
    });
  }

  // RSI panel
  if (ind.rsi&&RSI_H>0) {
    const rsi=calcRSI(fullCloses).slice(-viewN);
    ctx.fillStyle='rgba(0,10,25,0.5)'; ctx.fillRect(PAD_L,BY,TW,RSI_H);
    const RSIY=(v:number)=>BY+RSI_H*0.05+(100-v)/100*(RSI_H*0.9);
    ctx.strokeStyle='rgba(0,100,180,0.15)'; ctx.lineWidth=0.6;
    [30,50,70].forEach(level=>{
      const y=RSIY(level);
      ctx.beginPath(); ctx.moveTo(PAD_L,y); ctx.lineTo(W-PAD_R,y); ctx.stroke();
      ctx.fillStyle='rgba(0,100,180,0.6)'; ctx.font="8px 'Share Tech Mono',monospace"; ctx.textAlign='right'; ctx.fillText(String(level),PAD_L-3,y+3);
    });
    ctx.fillStyle='rgba(0,200,255,0.45)'; ctx.font="7.5px 'Share Tech Mono',monospace"; ctx.textAlign='left'; ctx.fillText('RSI(14)',PAD_L+2,BY+10);
    ctx.strokeStyle='rgba(255,51,85,0.85)'; ctx.lineWidth=1.3;
    ctx.beginPath(); let fr=true;
    rsi.forEach((v,i)=>{if(v===null)return;const x=PAD_L+i*sp+sp/2;fr?(ctx.moveTo(x,RSIY(v as number)),fr=false):ctx.lineTo(x,RSIY(v as number));});
    ctx.stroke();
  }

  // Line chart
  if (ct==='line') {
    const up=closes[closes.length-1]>=closes[0];
    const grad=ctx.createLinearGradient(0,PAD_T,0,PAD_T+PH);
    grad.addColorStop(0,up?'rgba(0,255,157,0.15)':'rgba(255,51,85,0.15)');
    grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.beginPath();
    candles.forEach((c,i)=>{const x=PAD_L+i*sp+sp/2;i===0?ctx.moveTo(x,PY(c.close)):ctx.lineTo(x,PY(c.close));});
    ctx.lineTo(PAD_L+(candles.length-1)*sp+sp/2,PAD_T+PH);
    ctx.lineTo(PAD_L+sp/2,PAD_T+PH); ctx.closePath(); ctx.fillStyle=grad; ctx.fill();
    ctx.strokeStyle=up?'#00ff9d':'#ff3355'; ctx.lineWidth=2; ctx.lineJoin='round';
    ctx.beginPath();
    candles.forEach((c,i)=>{const x=PAD_L+i*sp+sp/2;i===0?ctx.moveTo(x,PY(c.close)):ctx.lineTo(x,PY(c.close));});
    ctx.stroke();
  }

  // OHLC bar chart
  if (ct==='bar') {
    candles.forEach((c,i)=>{
      const x=PAD_L+i*sp+sp/2, up=c.close>=c.open;
      ctx.strokeStyle=up?'#00ff9d':'#ff3355'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(x,PY(c.high)); ctx.lineTo(x,PY(c.low)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x-CW/2,PY(c.open)); ctx.lineTo(x,PY(c.open)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x,PY(c.close)); ctx.lineTo(x+CW/2,PY(c.close)); ctx.stroke();
    });
  }

  // Candlestick chart
  if (ct==='candle') {
    const patMap: Record<number,Pat> = {};
    patterns.forEach(p=>{patMap[p.i]=p;});
    candles.forEach((c,i)=>{
      const x=PAD_L+i*sp+sp/2, up=c.close>=c.open;
      if (i===hoverIdx) { ctx.fillStyle='rgba(0,200,255,0.06)'; ctx.fillRect(x-sp/2,PAD_T,sp,PH); }
      ctx.strokeStyle=up?'#00ff9d':'#ff3355'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x,PY(c.high)); ctx.lineTo(x,PY(c.low)); ctx.stroke();
      const bT=PY(Math.max(c.open,c.close)), bB=PY(Math.min(c.open,c.close)), bH=Math.max(1.5,bB-bT);
      if (CW>3) {
        const bg=ctx.createLinearGradient(0,bT,0,bB);
        up?(bg.addColorStop(0,'rgba(0,255,157,0.9)'),bg.addColorStop(1,'rgba(0,180,100,0.7)'))
          :(bg.addColorStop(0,'rgba(255,51,85,0.7)'),bg.addColorStop(1,'rgba(255,51,85,0.9)'));
        ctx.fillStyle=bg; ctx.fillRect(x-CW/2,bT,CW,bH);
        ctx.strokeStyle=up?'#00ff9d':'#ff3355'; ctx.lineWidth=0.6; ctx.strokeRect(x-CW/2,bT,CW,bH);
      } else {
        ctx.fillStyle=up?'#00ff9d':'#ff3355'; ctx.fillRect(x-CW/2,bT,CW,bH);
      }
      if (patMap[i]) {
        const pt=patMap[i], b2=pt.sig==='bull', my=b2?PY(c.low)+14:PY(c.high)-14;
        ctx.font='10px sans-serif'; ctx.textAlign='center'; ctx.fillText(pt.emoji,x,my);
        ctx.strokeStyle=b2?'rgba(0,255,157,0.4)':'rgba(255,51,85,0.4)'; ctx.lineWidth=0.7; ctx.setLineDash([2,3]);
        ctx.beginPath(); ctx.moveTo(x,b2?PY(c.low):PY(c.high)); ctx.lineTo(x,my-(b2?4:-4)); ctx.stroke(); ctx.setLineDash([]);
      }
    });
  }

  // Moving Averages
  ([{p:40,col:'rgba(255,215,0,0.75)',k:'ma40'},{p:50,col:'rgba(0,200,255,0.75)',k:'ma50'},{p:200,col:'rgba(255,107,53,0.65)',k:'ma200'}] as {p:number;col:string;k:keyof Ind}[]).forEach(mc=>{
    if (!ind[mc.k]) return;
    const ma=calcMA(fullCloses,mc.p).slice(-viewN);
    
    // Robustness check for MA200
    if (mc.p === 200) {
      const isInsufficient = fullCloses.length < 200 || ma.every(v => v === null);
      if (isInsufficient) {
        ctx.fillStyle='rgba(255,107,53,0.7)'; ctx.font="bold 9px 'Share Tech Mono',monospace"; ctx.textAlign='left';
        // User requested: Use "Fetching data..." instead of "Insufficient data"
        const msg = isFetchingLower ? 'MA200: Fetching history...' : 'MA200: Data context required...';
        ctx.fillText(msg, PAD_L+5, PAD_T+15);
        return;
      }
    }

    ctx.strokeStyle=mc.col; ctx.lineWidth=1.5; ctx.lineJoin='round'; ctx.setLineDash([]);
    ctx.beginPath(); let ff=true;
    ma.forEach((v,i)=>{if(v===null)return;const x=PAD_L+i*sp+sp/2;ff?(ctx.moveTo(x,PY(v)),ff=false):ctx.lineTo(x,PY(v));});
    ctx.stroke();
  });

  // Crossover Alert Icons — Multi-Strategy (40/50 and 50/200)
  const ma40A = calcMA(fullCloses, 40).slice(-viewN);
  const ma50A = calcMA(fullCloses, 50).slice(-viewN);
  const ma200A = calcMA(fullCloses, 200).slice(-viewN);
  const latestPrice = candles[candles.length - 1].close;

  const strategyConfigs = [
    { s1: ma40A,  s2: ma50A,  label: 'ST', color: '#ffd700' }, // Short-Term 40/50
    { s1: ma50A,  s2: ma200A, label: 'LT', color: '#00c8ff' }  // Long-Term 50/200
  ];

  strategyConfigs.forEach(strat => {
    for (let i = 1; i < candles.length; i++) {
        const p1 = strat.s1[i-1], p2 = strat.s2[i-1];
        const c1 = strat.s1[i],   c2 = strat.s2[i];
        
        if (p1 !== null && p2 !== null && c1 !== null && c2 !== null) {
          let type: 'buy' | 'sell' | null = null;
          if (p1 <= p2 && c1 > c2) type = 'buy';
          if (p1 >= p2 && c1 < c2) type = 'sell';
          
          if (type) {
            const isBuy = type === 'buy';
            const x = PAD_L + i*sp + sp/2;
            const cy = PY(c1);
            const iconCol = isBuy ? '#00ff9d' : '#ff3355';
            
            ctx.save();
            ctx.shadowColor = iconCol; ctx.shadowBlur = 10;
            ctx.beginPath(); ctx.arc(x, cy, 10, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(2, 8, 16, 0.9)'; ctx.fill();
            ctx.strokeStyle = iconCol; ctx.lineWidth = 1.2; ctx.stroke();
            
            ctx.shadowBlur = 0;
            ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = iconCol; ctx.fillText(isBuy ? '⬆️' : '⬇️', x, cy);
            
            // Label (ST/LT)
            ctx.font = "bold 7px 'Share Tech Mono',monospace"; ctx.fillStyle = strat.color;
            ctx.fillText(strat.label, x, cy + (isBuy ? -16 : 16));

            // ROI Label
            const roi = ((latestPrice - c1) / c1) * 100;
            const rCol = (isBuy ? roi > 0 : roi < 0) ? '#00ff9d' : '#ff3355';
            ctx.font = "bold 8px 'Share Tech Mono',monospace"; ctx.fillStyle = rCol;
            ctx.fillText(`${roi > 0 ? '+' : ''}${roi.toFixed(1)}%`, x, cy + (isBuy ? 22 : -22));
            
            ctx.restore();
          }
        }
    }
  });

  // Current price dashed line
  const lp=closes[closes.length-1], ly=PY(lp);
  ctx.strokeStyle='rgba(0,200,255,0.5)'; ctx.lineWidth=0.8; ctx.setLineDash([5,4]);
  ctx.beginPath(); ctx.moveTo(PAD_L,ly); ctx.lineTo(W-PAD_R,ly); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='rgba(0,200,255,0.9)'; ctx.fillRect(W-PAD_R-1,ly-1,PAD_R+1,2);

  // Stop Loss line
  if (slPrice>0) {
    const sy=PY(slPrice);
    ctx.strokeStyle='rgba(255,51,85,0.7)'; ctx.lineWidth=1.2; ctx.setLineDash([6,3]);
    ctx.beginPath(); ctx.moveTo(PAD_L,sy); ctx.lineTo(W-PAD_R,sy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='rgba(255,51,85,0.9)'; ctx.font="9px 'Share Tech Mono',monospace"; ctx.textAlign='left';
    ctx.fillText(`SL ${slPrice>=1?slPrice.toFixed(2):slPrice.toFixed(4)}`, PAD_L+4, sy-3);
  }

  // Take Profit line
  if (tpPrice>0) {
    const ty=PY(tpPrice);
    ctx.strokeStyle='rgba(0,255,157,0.7)'; ctx.lineWidth=1.2; ctx.setLineDash([6,3]);
    ctx.beginPath(); ctx.moveTo(PAD_L,ty); ctx.lineTo(W-PAD_R,ty); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='rgba(0,255,157,0.9)'; ctx.font="9px 'Share Tech Mono',monospace"; ctx.textAlign='left';
    ctx.fillText(`TP ${tpPrice>=1?tpPrice.toFixed(2):tpPrice.toFixed(4)}`, PAD_L+4, ty-3);
  }

  // Chart area border
  ctx.strokeStyle='rgba(0,100,180,0.2)'; ctx.lineWidth=1; ctx.strokeRect(PAD_L,PAD_T,TW,PH);

  // Hover crosshair vertical line
  if (hoverIdx>=0&&hoverIdx<candles.length) {
    const hx=PAD_L+hoverIdx*sp+sp/2;
    ctx.strokeStyle='rgba(0,200,255,0.25)'; ctx.lineWidth=0.8; ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(hx,PAD_T); ctx.lineTo(hx,BY); ctx.stroke(); ctx.setLineDash([]);
  }

  // Disclaimer rendering inside chart area bottom
  ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.font="8px sans-serif"; ctx.textAlign='right'; 
  ctx.fillText("Signals are based on technical indicators and do not constitute guaranteed financial advice.", W - PAD_R - 5, H - PAD_B - RSI_H - VOL_H - 10);
}

/* ══════════════════════════════════════ COMPONENT ══════════════════════════════════════ */
const MarketPage = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef   = useRef<HTMLDivElement>(null);

  const [sym, setSym]       = useState<string>('RELIANCE');
  const [tf, setTf]         = useState<TFKey>('1D');
  const [ct, setCt]         = useState<CT>('candle');
  const [cat, setCat]       = useState('stocks');
  const [ind, setInd]       = useState<Ind>({ma40:true,ma50:true,ma200:true,bb:false,vol:true,rsi:false});
  const [hov, setHov]       = useState(-1);
  const [cross, setCross]   = useState<{o:number;h:number;l:number;c:number;v:number}|null>(null);
  const [search, setSearch] = useState('');
  const [tick, setTick]     = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chart' | 'trade'>('chart');
  const [fullCandles, setFullCandles] = useState<Candle[]>([]);
  const [isLowerHistoryLoading, setIsLowerHistoryLoading] = useState(false);

  // WebSocket signal state
  const wsRef = useRef<WebSocket|null>(null);
  const [wsSignals, setWsSignals] = useState<CrossoverPoint[]>([]);
  const [signalModal, setSignalModal] = useState<SignalModalData|null>(null);


  // Pattern settings
  const [patSet, setPatSet]         = useState<PatSet>({bull:true,bear:true,neut:true});
  const [showPatSet, setShowPatSet] = useState(false);

  // Auth & portfolio from context
  const { user, isLoading, balance, orders, placeOrder } = useAuth();
  const navigate = useNavigate();

  // Redirect to login if not authenticated (wait for auth state to load first)
  useEffect(() => {
    if (!isLoading && !user) navigate('/auth');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading]);

  // Trade panel
  const [tradeSide, setTradeSide] = useState<'buy'|'sell'>('buy');
  const [qty, setQty]   = useState('10');
  const [sl, setSl]     = useState('');
  const [tp, setTp]     = useState('');

  // Derived
  // Initialize data
  useEffect(() => {
    setIsLowerHistoryLoading(false); // Reset loading state on sym/tf change
    const initial = getCandles(sym, tf);
    setFullCandles(initial);
  }, [sym, tf]);

  // Hybrid History Stitching
  useEffect(() => {
    // Only fetch if MA200 is enabled AND we have less than 200 points
    if (ind.ma200 && fullCandles.length > 0 && fullCandles.length < 200 && !isLowerHistoryLoading) {
      const fetchHistory = async () => {
        setIsLowerHistoryLoading(true);
        try {
          const needed = (TF_CFG[tf].n + 215) - fullCandles.length;
          const endTs = fullCandles[0].ts;
          const res = await fetch(`http://localhost:8000/api/market/history?sym=${sym}&count=${needed}&end_ts=${endTs}&end_price=${fullCandles[0].open}`);
          const data = await res.json();
          if (data.candles && data.candles.length > 0) {
            setFullCandles(prev => [...data.candles, ...prev]);
            // toast.success(`Fetched ${data.candles.length} historical points for MA200`);
          }
        } catch (err) {
          console.error("Failed to fetch historical buffer", err);
        } finally {
          setIsLowerHistoryLoading(false);
        }
      };
      fetchHistory();
    }
  }, [ind.ma200, fullCandles.length, sym, isLowerHistoryLoading]);
  const viewN = TF_CFG[tf].n;
  const candles = useMemo(() => fullCandles.slice(-viewN), [fullCandles, viewN]);
  const asset   = useMemo(() => ALL_ASSETS.find(a => a.sym === sym), [sym]);

  const ohlc = useMemo(() => {
    if (!candles.length || !asset) return null;
    const last=candles[candles.length-1], first=candles[0];
    const chg=((last.close-first.close)/first.close)*100;
    const y52=candles.reduce((a,c)=>({h:Math.max(a.h,c.high),l:Math.min(a.l,c.low)}),{h:-Infinity,l:Infinity});
    return {...last,chg,y52,cur:asset.currency};
  }, [candles, asset]);

  const patterns = useMemo(() => ct==='candle' ? detectPatterns(candles,patSet) : [], [candles,ct,patSet]);

  // Canvas resize — guards against 0x0 initialization bug
  const resize = useCallback(() => {
    const canvas=canvasRef.current, wrap=wrapRef.current;
    if (!canvas||!wrap) return;
    // Guard: skip if container hasn't laid out yet
    if (wrap.clientWidth === 0 || wrap.clientHeight === 0) return;
    const dpr=window.devicePixelRatio||1;
    canvas.width=wrap.clientWidth*dpr;
    canvas.height=wrap.clientHeight*dpr;
    canvas.style.width=wrap.clientWidth+'px';
    canvas.style.height=wrap.clientHeight+'px';
    const ctx=canvas.getContext('2d');
    if (ctx) ctx.scale(dpr,dpr);
  }, []);

  useEffect(()=>{
    const wrap=wrapRef.current;
    if (!wrap) return;
    // Use ResizeObserver to wait until container has non-zero dimensions
    const ro=new ResizeObserver((entries)=>{
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          resize();
        }
      }
    });
    ro.observe(wrap);
    // Also attempt on window load as fallback
    const onLoad = () => resize();
    window.addEventListener('load', onLoad);
    return ()=>{ ro.disconnect(); window.removeEventListener('load', onLoad); };
  },[resize]);

  // Draw whenever relevant state changes
  useEffect(()=>{
    if (!canvasRef.current||!fullCandles.length) return;
    drawChart(canvasRef.current, fullCandles, tf, ct, ind, hov, patterns, parseFloat(sl)||0, parseFloat(tp)||0, isLowerHistoryLoading);
  },[fullCandles,tf,ct,ind,hov,patterns,sl,tp,isLowerHistoryLoading]);

  // Live tick — Update fullCandles every 2s
  useEffect(()=>{
    const id=setInterval(()=>{
      setFullCandles(prev => {
        if (!prev.length) return prev;
        const next = [...prev];
        const last = { ...next[next.length - 1] };
        
        const ktf = tf;
        const vlt = TF_CFG[ktf].vlt;
        
        const chg = (Math.random() - 0.49) * vlt * 0.6;
        last.close = Math.max(last.close * (1 + chg), 0.001);
        last.high = Math.max(last.high, last.close);
        last.low = Math.min(last.low, last.close);
        last.vol += Math.floor(Math.random() * 10000);
        
        next[next.length - 1] = last;
        
        if (Math.random() < 0.08) {
          const no = last.close, nc = Math.max(no * (1 + (Math.random() - 0.48) * vlt), 0.001);
          const nts = last.ts + (60 * 1000);
          next.push({
            ts: nts,
            open: no,
            high: Math.max(no, nc) * (1 + Math.random() * vlt * 0.4),
            low: Math.min(no, nc) * (1 - Math.random() * vlt * 0.3),
            close: nc,
            vol: Math.floor(Math.random() * 500000 + 50000)
          });
          if (next.length > 500) next.shift(); // Keep a healthy limit but don't delete the 200 buffer
        }
        return next;
      });
      setTick(t=>t+1);
    }, 2000);
    return ()=>clearInterval(id);
  }, [tf]);

  // ─── WebSocket Signal Engine ───────────────────────────────────────────
  // Connect to backend WebSocket on mount
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        ws = new WebSocket('ws://localhost:8000/ws/market');
        wsRef.current = ws;

        ws.onopen = () => console.log('[FinQuest WS] Connected to Pandas Signal Engine');

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'analysis') {
              // Store all crossover points for chart rendering
              if (data.signals) setWsSignals(data.signals);

              // Handle NEW signal alert
              if (data.new_signal) {
                const ns = data.new_signal;
                const isBuy = ns.type === 'Golden Cross';
                const msg = isBuy
                  ? `Buy Alert: ${ns.sym} 50MA crossed above 200MA!`
                  : `Sell Alert: ${ns.sym} 50MA crossed below 200MA!`;

                // In-app toast
                toast(msg, { duration: 8000 });

                // Browser notification
                if ('Notification' in window) {
                  if (Notification.permission === 'granted') {
                    new Notification('FinQuest Intelligence', { body: msg, icon: '/favicon.ico' });
                  } else if (Notification.permission !== 'denied') {
                    Notification.requestPermission().then(p => {
                      if (p === 'granted') new Notification('FinQuest Intelligence', { body: msg });
                    });
                  }
                }
              }
            }
          } catch { /* ignore parse errors */ }
        };

        ws.onclose = () => {
          console.log('[FinQuest WS] Disconnected, reconnecting in 3s...');
          reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => ws?.close();
      } catch { /* connection failed, will retry on close */ }
    };

    connect();
    // Request notification permission proactively
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  // Send price data to backend on every tick
  useEffect(() => {
    if (!fullCandles || fullCandles.length < 201) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const closes = fullCandles.map(c => c.close);
    ws.send(JSON.stringify({ sym, closes }));
  }, [tick, fullCandles, sym]);

  // Auto-fill SL/TP when symbol changes
  useEffect(()=>{
    const cs=getCandles(sym,tf);
    if (!cs.length) return;
    const p=cs[cs.length-1].close;
    const dec=p>=1?2:4;
    setSl((p*0.98).toFixed(dec));
    setTp((p*1.04).toFixed(dec));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sym]);

  const selectSym=(s:string)=>{ setSym(s); setHov(-1); setCross(null); };

  const handleMove=(e:React.MouseEvent<HTMLCanvasElement>)=>{
    const canvas=canvasRef.current;
    if (!canvas||!candles.length) return;
    const rect=canvas.getBoundingClientRect();
    const sp=(canvas.clientWidth-72-14)/candles.length;
    const idx=Math.floor((e.clientX-rect.left-72)/sp);
    if (idx>=0&&idx<candles.length) {
      setHov(idx);
      const hc=candles[idx];
      setCross({o:hc.open,h:hc.high,l:hc.low,c:hc.close,v:hc.vol});
    }
  };

  // Click handler for crossover signal markers
  const handleCanvasClick=(e:React.MouseEvent<HTMLCanvasElement>)=>{
    const canvas=canvasRef.current;
    if (!canvas||!candles.length) return;
    const rect=canvas.getBoundingClientRect();
    const PAD_L=72, PAD_R=14;
    const sp_c=(canvas.clientWidth-PAD_L-PAD_R)/candles.length;
    const clickIdx=Math.floor((e.clientX-rect.left-PAD_L)/sp_c);
    if (clickIdx<0||clickIdx>=candles.length) return;

    // Check if this index has a crossover
    const fullCloses = fullCandles.map(c=>c.close);
    const viewN_c = TF_CFG[tf].n;
    const ma50V = calcMA(fullCloses, 50).slice(-viewN_c);
    const ma200V = calcMA(fullCloses, 200).slice(-viewN_c);
    
    // Improved hit detection for the icon
    if (clickIdx > 0 && ma50V[clickIdx] !== null && ma200V[clickIdx] !== null && ma50V[clickIdx-1] !== null && ma200V[clickIdx-1] !== null) {
      const p50 = ma50V[clickIdx-1]!, p200 = ma200V[clickIdx-1]!;
      const c50 = ma50V[clickIdx]!, c200 = ma200V[clickIdx]!;
      
      const isGolden = p50 <= p200 && c50 > c200;
      const isDeath = p50 >= p200 && c50 < c200;
      
      if (isGolden || isDeath) {
        setSignalModal({
          type: isGolden ? 'Golden Cross' : 'Death Cross',
          trend: isGolden ? 'Upward' : 'Downward',
          price: candles[clickIdx].close,
          sym,
          sma50: c50,
          sma200: c200
        });
      }
    }
  };

  const filteredAssets = useMemo(()=>{
    const list=ASSETS[cat]||ASSETS.stocks;
    const q=search.toLowerCase();
    return q ? list.filter(a=>a.sym.toLowerCase().includes(q)||a.name.toLowerCase().includes(q)) : list;
  },[cat,search]);

  const submitOrder=async ()=>{
    if (!sym||!candles.length) return;
    const price=candles[candles.length-1].close;
    const q=parseFloat(qty)||1;
    const slV=parseFloat(sl)||price*(tradeSide==='buy'?0.98:1.02);
    const tpV=parseFloat(tp)||price*(tradeSide==='buy'?1.04:0.96);
    const cost=q*price;
    if (tradeSide==='buy'&&cost>balance) { toast.error('Insufficient balance!'); return; }
    try {
      await placeOrder({ sym, side: tradeSide, qty: q, entry: price, sl: slV, tp: tpV });
      toast.success(`${tradeSide==='buy'?'▲ Bought':'▼ Sold'} ${q}× ${sym} @ ${price>=1?price.toFixed(2):price.toFixed(4)}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to place order');
    }
  };

  // Colour constants
  const G='#00ff9d', R='#ff3355', A='#00c8ff', Y='#ffd700', T2='#6a9bbf', T3='#3a5f7f';

  // Show loading screen while auth state is initializing
  if (isLoading) {
    return (
      <div style={{position:'fixed',inset:0,background:'#020810',display:'flex',alignItems:'center',justifyContent:'center',color:'#00c8ff',fontFamily:"'Orbitron',sans-serif",fontSize:'1rem',letterSpacing:2}}>
        LOADING...
      </div>
    );
  }

  return (
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'#020810',color:'#cde8ff',fontFamily:"'Rajdhani',sans-serif",display:'flex',flexDirection:'column',overflow:'hidden',zIndex:50}}>

<div style={{height:50,background:'rgba(2,6,14,0.97)',borderBottom:'1px solid rgba(0,200,255,0.13)',display:'flex',alignItems:'center',padding:'0 12px',gap:8,flexShrink:0,zIndex:200,overflowX:'auto'}}>

  {/* ✅ BACK BUTTON */}
  <button
    onClick={() => window.location.href = '/'}
    style={{
      padding:'4px 8px',
      border:'1px solid rgba(0,200,255,0.2)',
      borderRadius:4,
      background:'rgba(0,200,255,0.08)',
      color:'#00c8ff',
      fontFamily:'monospace',
      fontSize:'.65rem',
      cursor:'pointer',
      whiteSpace:'nowrap'
    }}
  >
    ⬅ BACK
  </button>
  <div
  style={{
    display:'none',
  }}
  className="mobile-tabs"
>
  <button onClick={()=>setMobileTab('chart')}>📊 Chart</button>
  <button onClick={()=>setMobileTab('trade')}>💰 Trade</button>
</div>

  <button
  onClick={() => setDrawerOpen(true)}
  style={{
    padding:'4px 8px',
    border:'1px solid rgba(0,200,255,0.2)',
    borderRadius:4,
    background:'rgba(0,200,255,0.08)',
    color:A,
    fontFamily:'monospace',
    fontSize:'.65rem',
    cursor:'pointer'
  }}
>
  ☰ STOCKS
</button>
{drawerOpen && (
  <div
    onClick={() => setDrawerOpen(false)}
    style={{
      position:'fixed',
      inset:0,
      background:'rgba(0,0,0,0.5)',
      zIndex:998
    }}
  />
)}<style>
{`
@keyframes slideIn {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}
`}
</style>




  <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'.85rem',fontWeight:900,color:'#00c8ff',letterSpacing:2,whiteSpace:'nowrap'}}>
    Fin<span style={{color:'#00ff9d'}}>Quest</span>
  </span>

        <div style={{width:1,height:24,background:'rgba(9, 69, 86, 0.13)',flexShrink:0}}/>

        {/* Timeframe */}
        <div style={{display:'flex',gap:2}}>
          {(['2m','5m','10m','15m','30m','1D','1M','1Y'] as TFKey[]).map(t=>(
            <button key={t} onClick={()=>setTf(t)} style={{padding:'3px 7px',borderRadius:3,border:`1px solid ${tf===t?A:'rgba(0,200,255,0.13)'}`,background:tf===t?'rgba(0,200,255,0.12)':'none',color:tf===t?A:T2,fontFamily:'monospace',fontSize:'.63rem',cursor:'pointer',whiteSpace:'nowrap'}}>{t}</button>
          ))}
        </div>
        <div style={{width:1,height:24,background:'rgba(0,200,255,0.13)',flexShrink:0}}/>

        {/* Chart type */}
        <div style={{display:'flex',gap:2}}>
          {([['candle','🕯 C'],['line','〜 L'],['bar','Ⅲ B']] as [CT,string][]).map(([c,l])=>(
            <button key={c} onClick={()=>setCt(c)} style={{padding:'3px 8px',borderRadius:3,border:`1px solid ${ct===c?A:'rgba(0,200,255,0.13)'}`,background:ct===c?'rgba(0,200,255,0.1)':'none',color:ct===c?A:T2,fontSize:'.72rem',cursor:'pointer',whiteSpace:'nowrap'}}>{l}</button>
          ))}
        </div>
        <div style={{width:1,height:24,background:'rgba(0,200,255,0.13)',flexShrink:0}}/>

        {/* Indicators */}
        <div style={{display:'flex',gap:2}}>
          {([['ma40','MA40',Y],['ma50','MA50',A],['ma200','MA200','#ff6b35'],['bb','BB','#a064ff'],['vol','VOL',G],['rsi','RSI',R]] as [keyof Ind,string,string][]).map(([k,l,c])=>(
            <button key={k} onClick={()=>setInd(p=>({...p,[k]:!p[k]}))} style={{padding:'2px 7px',borderRadius:3,border:ind[k]?`1px solid ${c}40`:'1px solid rgba(0,200,255,0.13)',background:ind[k]?`${c}1a`:'none',color:ind[k]?c:T3,fontFamily:'monospace',fontSize:'.58rem',cursor:'pointer',fontWeight:ind[k]?700:400,whiteSpace:'nowrap'}}>{l}</button>
          ))}
        </div>

        {/* Balance */}
        <div style={{marginLeft:'auto',flexShrink:0,padding:'3px 10px',border:'1px solid rgba(0,200,255,0.2)',borderRadius:4,fontFamily:'monospace',fontSize:'.68rem',whiteSpace:'nowrap'}}>
          <span style={{color:T3}}>BAL </span>
          <span style={{color:Y}}>₹{balance.toLocaleString('en',{maximumFractionDigits:0})}</span>
        </div>
      </div>

      {/* ── BODY ── */}
      <style>{`
        .left-sidebar { width: 240px; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
        .trade-panel { width: 225px; flex-shrink: 0; background: rgba(3,10,22,0.85); border-left: 1px solid rgba(0,200,255,0.13); display: flex; flex-direction: column; overflow: hidden; }
        @media (max-width: 768px) {
          .left-sidebar {
            position: fixed; top: 0; left: 0; bottom: 0; width: 260px; z-index: 999; background: #020810;
            border-right: 1px solid rgba(0,200,255,0.2); transition: transform 0.3s;
          }
          .left-sidebar.closed { transform: translateX(-100%); }
          .trade-panel { width: 100%; border-left: none; }
          .trade-panel.hidden-tab { display: none; }
        }
      `}</style>
      <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>

        {/* ── LEFT SIDEBAR ── */}
<div className={`left-sidebar ${drawerOpen ? '' : 'closed'}`}>

          <div style={{padding:7}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{width:'100%',padding:'5px 9px',background:'rgba(0,0,0,.35)',border:'1px solid rgba(0,200,255,0.13)',borderRadius:4,color:'#cde8ff',fontFamily:'monospace',fontSize:'.7rem',outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div style={{display:'flex',borderBottom:'1px solid rgba(0,200,255,0.13)'}}>
            {(['stocks','crypto','metals','energy'] as const).map(c=>(
              <button key={c} onClick={()=>{setCat(c);setSearch('');}} style={{flex:1,padding:'4px 0',textAlign:'center',fontSize:'.56rem',fontFamily:'monospace',cursor:'pointer',background:'none',color:cat===c?A:T3,border:'none',borderBottom:`2px solid ${cat===c?A:'transparent'}`,textTransform:'capitalize'}}>
                {c.slice(0,3).toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            {filteredAssets.map(a=>{
              const ac=getCandles(a.sym,tf);
              const al=ac.length?ac[ac.length-1]:null, af=ac.length?ac[0]:null;
              const achg=al&&af?((al.close-af.close)/af.close)*100:0;
              const ap=al?(al.close>=1000?al.close.toLocaleString('en',{maximumFractionDigits:0}):al.close>=1?al.close.toFixed(2):al.close.toFixed(4)):'—';
              return (
                <div key={a.sym} onClick={()=>selectSym(a.sym)} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 9px',cursor:'pointer',borderLeft:`2px solid ${sym===a.sym?A:'transparent'}`,background:sym===a.sym?'rgba(0,200,255,0.07)':'transparent'}}>
                  <div style={{minWidth:44}}>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'.62rem',fontWeight:700,color:A}}>{a.sym}</div>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'.65rem',color:T2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.name}</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontFamily:'monospace',fontSize:'.62rem',color:'#cde8ff'}}>{a.currency}{ap}</div>
                    <div style={{fontFamily:'monospace',fontSize:'.56rem',color:achg>=0?G:R}}>{achg>=0?'+':''}{achg.toFixed(2)}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CHART AREA ── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>

          {/* OHLC info bar */}
          <div style={{height:46,background:'rgba(3,10,22,0.95)',borderBottom:'1px solid rgba(0,200,255,0.13)',display:'flex',alignItems:'center',padding:'0 12px',gap:10,flexShrink:0,overflowX:'auto'}}>
            <div style={{flexShrink:0}}>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'1rem',fontWeight:700,color:A,letterSpacing:1}}>{sym}</div>
              <div style={{fontSize:'.72rem',color:T2,whiteSpace:'nowrap'}}>{asset?.name||''}</div>
            </div>
            {ohlc && <>
              <div style={{width:1,height:24,background:'rgba(0,200,255,0.13)',flexShrink:0}}/>
              <div style={{fontFamily:'monospace',fontSize:'1.1rem',fontWeight:700,color:ohlc.chg>=0?G:R,flexShrink:0}}>{fmtP(ohlc.close,ohlc.cur)}</div>
              <div style={{fontFamily:'monospace',fontSize:'.72rem',padding:'2px 7px',borderRadius:3,color:ohlc.chg>=0?G:R,background:ohlc.chg>=0?'rgba(0,255,157,.1)':'rgba(255,51,85,.1)',flexShrink:0}}>{ohlc.chg>=0?'+':''}{ohlc.chg.toFixed(2)}%</div>
              <div style={{width:1,height:24,background:'rgba(0,200,255,0.13)',flexShrink:0}}/>
              {([['O',ohlc.open,'#cde8ff'],['H',ohlc.high,G],['L',ohlc.low,R],['C',ohlc.close,'#cde8ff']] as [string,number,string][]).map(([l,v,c])=>(
                <div key={l} style={{display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
                  <div style={{fontFamily:'monospace',fontSize:'.5rem',letterSpacing:2,color:T3}}>{l}</div>
                  <div style={{fontFamily:'monospace',fontSize:'.7rem',color:c}}>{fmtP(v,ohlc.cur)}</div>
                </div>
              ))}
              <div style={{width:1,height:24,background:'rgba(0,200,255,0.13)',flexShrink:0}}/>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
                <div style={{fontFamily:'monospace',fontSize:'.5rem',letterSpacing:2,color:T3}}>VOL</div>
                <div style={{fontFamily:'monospace',fontSize:'.66rem',color:T2}}>{fmtV(ohlc.vol)}</div>
              </div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
                <div style={{fontFamily:'monospace',fontSize:'.5rem',letterSpacing:2,color:T3}}>52H</div>
                <div style={{fontFamily:'monospace',fontSize:'.7rem',color:G}}>{fmtP(ohlc.y52.h,ohlc.cur)}</div>
              </div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0}}>
                <div style={{fontFamily:'monospace',fontSize:'.5rem',letterSpacing:2,color:T3}}>52L</div>
                <div style={{fontFamily:'monospace',fontSize:'.7rem',color:R}}>{fmtP(ohlc.y52.l,ohlc.cur)}</div>
              </div>
            </>}
          </div>

          {/* Canvas */}
          <div ref={wrapRef} style={{flex:1,position:'relative',overflow:'hidden',minHeight:0}}>
            <canvas ref={canvasRef} onMouseMove={handleMove} onClick={handleCanvasClick} onMouseLeave={()=>{setHov(-1);setCross(null);}} style={{position:'absolute',inset:0,cursor:'crosshair'}}/>

            {/* Crosshair tooltip */}
            {cross && (
              <div style={{position:'absolute',top:8,left:76,background:'rgba(2,8,18,.9)',border:'1px solid rgba(0,200,255,0.32)',borderRadius:4,padding:'4px 9px',fontFamily:'monospace',fontSize:'.6rem',pointerEvents:'none',backdropFilter:'blur(8px)',zIndex:10,display:'flex',gap:8,whiteSpace:'nowrap'}}>
                {([['O',cross.o],['H',cross.h],['L',cross.l],['C',cross.c]] as [string,number][]).map(([l,v])=>(
                  <span key={l}><span style={{color:T3}}>{l} </span><span style={{color:'#cde8ff'}}>{v>=1000?v.toLocaleString('en',{maximumFractionDigits:0}):v>=1?v.toFixed(2):v.toFixed(4)}</span></span>
                ))}
                <span><span style={{color:T3}}>V </span><span style={{color:'#cde8ff'}}>{fmtV(cross.v)}</span></span>
              </div>
            )}

            {/* MA Legend */}
            <div style={{position:'absolute',top:6,right:8,zIndex:10,display:'flex',gap:7,pointerEvents:'none',flexWrap:'wrap',justifyContent:'flex-end'}}>
              {ind.ma40  && <span style={{display:'flex',alignItems:'center',gap:3,fontFamily:'monospace',fontSize:'.56rem'}}><span style={{width:13,height:2,background:Y,display:'inline-block',borderRadius:1}}/><span style={{color:Y}}>MA40</span></span>}
              {ind.ma50 && <span style={{display:'flex',alignItems:'center',gap:3,fontFamily:'monospace',fontSize:'.56rem'}}><span style={{width:13,height:2,background:A,display:'inline-block',borderRadius:1}}/><span style={{color:A}}>MA50</span></span>}
              {ind.ma200 && <span style={{display:'flex',alignItems:'center',gap:3,fontFamily:'monospace',fontSize:'.56rem'}}><span style={{width:13,height:2,background:'#ff6b35',display:'inline-block',borderRadius:1}}/><span style={{color:'#ff6b35'}}>MA200</span></span>}
              {ind.bb   && <span style={{display:'flex',alignItems:'center',gap:3,fontFamily:'monospace',fontSize:'.56rem'}}><span style={{width:13,height:2,background:'#a064ff',display:'inline-block',borderRadius:1}}/><span style={{color:'#a064ff'}}>BB(20)</span></span>}
            </div>
          </div>

          {/* Pattern bar */}
          <div style={{height:34,background:'rgba(2,6,18,.96)',borderTop:'1px solid rgba(0,200,255,0.13)',display:'flex',alignItems:'center',padding:'0 10px',gap:5,overflowX:'auto',flexShrink:0}}>
            <span style={{fontFamily:'monospace',fontSize:'.56rem',letterSpacing:3,color:T3,whiteSpace:'nowrap'}}>PATTERNS</span>
            {patterns.length===0
              ? <span style={{fontFamily:'monospace',fontSize:'.58rem',color:T3}}>No patterns detected</span>
              : patterns.map((p,idx)=>(
                  <span key={idx} title={p.desc} style={{fontFamily:'monospace',fontSize:'.56rem',padding:'2px 6px',borderRadius:3,whiteSpace:'nowrap',cursor:'help',background:p.sig==='bull'?'rgba(0,255,157,.1)':p.sig==='bear'?'rgba(255,51,85,.1)':'rgba(0,200,255,.07)',color:p.sig==='bull'?G:p.sig==='bear'?R:A,border:p.sig==='bull'?'1px solid rgba(0,255,157,.25)':p.sig==='bear'?'1px solid rgba(255,51,85,.25)':'1px solid rgba(0,200,255,0.13)'}}>
                    {p.emoji} {p.name}
                  </span>
                ))
            }
            <button onClick={()=>setShowPatSet(true)} style={{marginLeft:'auto',padding:'2px 7px',borderRadius:3,border:'1px solid rgba(0,200,255,0.2)',background:'none',color:T2,fontSize:'.56rem',cursor:'pointer',whiteSpace:'nowrap',fontFamily:'monospace',flexShrink:0}}>
              ⚙ FILTER
            </button>
          </div>
        </div>

        {/* ── TRADE PANEL ── */}
<div className={`trade-panel ${mobileTab !== 'trade' ? 'hidden-tab' : ''}`}>

          {/* Buy / Sell tabs */}
          <div style={{display:'flex',borderBottom:'1px solid rgba(0,200,255,0.13)'}}>
            <button onClick={()=>setTradeSide('buy')} style={{flex:1,padding:'10px 0',background:tradeSide==='buy'?'rgba(0,255,157,0.07)':'none',color:tradeSide==='buy'?G:T3,fontFamily:'monospace',fontSize:'.78rem',fontWeight:700,cursor:'pointer',border:'none',borderBottom:`2px solid ${tradeSide==='buy'?G:'transparent'}`}}>▲ BUY</button>
            <button onClick={()=>setTradeSide('sell')} style={{flex:1,padding:'10px 0',background:tradeSide==='sell'?'rgba(255,51,85,0.07)':'none',color:tradeSide==='sell'?R:T3,fontFamily:'monospace',fontSize:'.78rem',fontWeight:700,cursor:'pointer',border:'none',borderBottom:`2px solid ${tradeSide==='sell'?R:'transparent'}`}}>▼ SELL</button>
          </div>

          {/* Order form */}
          <div style={{padding:10,display:'flex',flexDirection:'column',gap:8,overflowY:'auto',flex:1}}>
            <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'.78rem',fontWeight:700,color:A}}>{sym}</div>

            {ohlc && (
              <div>
                <div style={{fontFamily:'monospace',fontSize:'.52rem',letterSpacing:2,color:T3,marginBottom:2}}>CURRENT PRICE</div>
                <div style={{fontFamily:'monospace',fontSize:'1rem',fontWeight:700,color:ohlc.chg>=0?G:R}}>{fmtP(ohlc.close,ohlc.cur)}</div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label style={{display:'block',fontFamily:'monospace',fontSize:'.52rem',letterSpacing:2,color:T3,marginBottom:3}}>QUANTITY</label>
              <input type="number" value={qty} onChange={e=>setQty(e.target.value)} min="1" step="1"
                style={{width:'100%',padding:'5px 8px',background:'rgba(0,0,0,0.4)',border:'1px solid rgba(0,200,255,0.2)',borderRadius:4,color:'#cde8ff',fontFamily:'monospace',fontSize:'.76rem',outline:'none',boxSizing:'border-box'}}/>
            </div>

            {/* Stop Loss */}
            <div>
              <label style={{display:'block',fontFamily:'monospace',fontSize:'.52rem',letterSpacing:2,color:R,marginBottom:3}}>STOP LOSS</label>
              <input type="number" value={sl} onChange={e=>setSl(e.target.value)} placeholder="Price" step="any"
                style={{width:'100%',padding:'5px 8px',background:'rgba(255,51,85,0.05)',border:'1px solid rgba(255,51,85,0.3)',borderRadius:4,color:'#ffaaaa',fontFamily:'monospace',fontSize:'.76rem',outline:'none',boxSizing:'border-box'}}/>
              {ohlc && sl && parseFloat(sl)>0 && (
                <div style={{fontFamily:'monospace',fontSize:'.56rem',color:R,marginTop:2}}>
                  {((Math.abs(ohlc.close-parseFloat(sl))/ohlc.close)*100).toFixed(2)}% from price
                </div>
              )}
            </div>

            {/* Take Profit */}
            <div>
              <label style={{display:'block',fontFamily:'monospace',fontSize:'.52rem',letterSpacing:2,color:G,marginBottom:3}}>TAKE PROFIT</label>
              <input type="number" value={tp} onChange={e=>setTp(e.target.value)} placeholder="Price" step="any"
                style={{width:'100%',padding:'5px 8px',background:'rgba(0,255,157,0.05)',border:'1px solid rgba(0,255,157,0.3)',borderRadius:4,color:'#aaffcc',fontFamily:'monospace',fontSize:'.76rem',outline:'none',boxSizing:'border-box'}}/>
              {ohlc && tp && parseFloat(tp)>0 && (
                <div style={{fontFamily:'monospace',fontSize:'.56rem',color:G,marginTop:2}}>
                  {((Math.abs(ohlc.close-parseFloat(tp))/ohlc.close)*100).toFixed(2)}% from price
                </div>
              )}
            </div>

            {/* R:R & Cost */}
            {(()=>{
              if (!ohlc||!sl||!tp||parseFloat(sl)<=0||parseFloat(tp)<=0) return null;
              const risk=Math.abs(ohlc.close-parseFloat(sl)), reward=Math.abs(ohlc.close-parseFloat(tp));
              const rr=risk>0?reward/risk:0;
              const cost=(parseFloat(qty)||1)*ohlc.close;
              return (
                <div style={{padding:'6px 8px',background:'rgba(0,200,255,0.04)',border:'1px solid rgba(0,200,255,0.13)',borderRadius:4,fontFamily:'monospace',fontSize:'.6rem'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                    <span style={{color:T3}}>R:R RATIO</span>
                    <span style={{color:rr>=2?G:rr>=1?Y:R}}>1:{rr.toFixed(2)}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span style={{color:T3}}>EST. COST</span>
                    <span style={{color:'#cde8ff'}}>{ohlc.cur}{cost.toLocaleString('en',{maximumFractionDigits:0})}</span>
                  </div>
                </div>
              );
            })()}

            {/* Submit button */}
            <button onClick={submitOrder} style={{padding:'9px 0',borderRadius:4,border:`1px solid ${tradeSide==='buy'?'rgba(0,255,157,0.4)':'rgba(255,51,85,0.4)'}`,background:tradeSide==='buy'?'rgba(0,255,157,0.13)':'rgba(255,51,85,0.13)',color:tradeSide==='buy'?G:R,fontFamily:'monospace',fontSize:'.78rem',fontWeight:700,cursor:'pointer',letterSpacing:1}}>
              {tradeSide==='buy'?'▲ BUY':'▼ SELL'} {sym}
            </button>

            {/* Positions */}
            {orders.length>0 && (
              <div style={{borderTop:'1px solid rgba(0,200,255,0.1)',paddingTop:7}}>
                <div style={{fontFamily:'monospace',fontSize:'.52rem',letterSpacing:2,color:T3,marginBottom:5}}>POSITIONS ({orders.length})</div>
                {orders.slice(0,6).map(o=>{
                  const oa=ALL_ASSETS.find(a=>a.sym===o.sym);
                  const oc=oa?.currency||'₹';
                  return (
                    <div key={o.id} style={{padding:'5px 0',borderBottom:'1px solid rgba(0,200,255,0.07)',marginBottom:4}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'.58rem',color:A}}>{o.sym}</span>
                        <span style={{fontFamily:'monospace',fontSize:'.58rem',color:o.side==='buy'?G:R}}>{o.side==='buy'?'▲':'▼'} {o.side.toUpperCase()}</span>
                      </div>
                      <div style={{fontFamily:'monospace',fontSize:'.58rem',color:T2,marginTop:1}}>
                        {o.qty}× @ {oc}{o.entry>=1?o.entry.toFixed(2):o.entry.toFixed(4)}
                      </div>
                      <div style={{fontFamily:'monospace',fontSize:'.54rem',marginTop:2,display:'flex',gap:7}}>
                        <span style={{color:R}}>SL:{oc}{o.sl>=1?o.sl.toFixed(2):o.sl.toFixed(4)}</span>
                        <span style={{color:G}}>TP:{oc}{o.tp>=1?o.tp.toFixed(2):o.tp.toFixed(4)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PATTERN SETTINGS MODAL ── */}
      {showPatSet && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)setShowPatSet(false);}}>
          <div style={{background:'#071525',border:'1px solid rgba(0,200,255,0.25)',borderRadius:8,padding:22,width:290,boxShadow:'0 0 40px rgba(0,200,255,0.1)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:'.8rem',color:A,letterSpacing:1}}>PATTERN FILTER</span>
              <button onClick={()=>setShowPatSet(false)} style={{background:'none',border:'none',color:T2,cursor:'pointer',fontSize:'1.1rem',lineHeight:1}}>✕</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:11}}>
              <div style={{fontFamily:'monospace',fontSize:'.58rem',letterSpacing:2,color:T3}}>SHOW PATTERN TYPES</div>
              {([['bull','BULLISH',G],['bear','BEARISH',R],['neut','NEUTRAL',A]] as [keyof PatSet,string,string][]).map(([k,l,c])=>(
                <div key={k} onClick={()=>setPatSet(p=>({...p,[k]:!p[k]}))} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
                  <div style={{width:17,height:17,borderRadius:3,border:`1px solid ${c}60`,background:patSet[k]?`${c}20`:'transparent',display:'flex',alignItems:'center',justifyContent:'center',color:c,fontSize:'.72rem',flexShrink:0}}>
                    {patSet[k]?'✓':''}
                  </div>
                  <span style={{fontFamily:'monospace',fontSize:'.68rem',color:c}}>{l} PATTERNS</span>
                </div>
              ))}
              <div style={{marginTop:4,padding:'7px 9px',background:'rgba(0,200,255,0.04)',border:'1px solid rgba(0,200,255,0.12)',borderRadius:4,fontFamily:'monospace',fontSize:'.6rem',color:T2,lineHeight:1.5}}>
                Pattern emojis appear on candles. Hover to see description.
              </div>
              <button onClick={()=>setShowPatSet(false)} style={{padding:'7px 0',borderRadius:4,border:'1px solid rgba(0,200,255,0.3)',background:'rgba(0,200,255,0.08)',color:A,fontFamily:'monospace',fontSize:'.7rem',cursor:'pointer',marginTop:2}}>
                APPLY & CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FINQUEST INTELLIGENCE SUGGESTION MODAL ── */}
      {signalModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:1100,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(6px)'}} onClick={e=>{if(e.target===e.currentTarget)setSignalModal(null);}}>
          <div style={{background:'linear-gradient(145deg,#071828 0%,#0a1e35 50%,#061520 100%)',border:'1px solid rgba(0,200,255,0.3)',borderRadius:12,padding:0,width:420,maxWidth:'90vw',boxShadow:'0 0 60px rgba(0,200,255,0.15), 0 0 120px rgba(0,200,255,0.05)',overflow:'hidden'}}>
            {/* Header */}
            <div style={{background:signalModal.type==='Golden Cross'?'linear-gradient(135deg,rgba(0,255,157,0.15),rgba(0,200,255,0.08))':'linear-gradient(135deg,rgba(255,51,85,0.15),rgba(200,0,50,0.08))',padding:'18px 22px',borderBottom:'1px solid rgba(0,200,255,0.15)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'.65rem',letterSpacing:3,color:'rgba(0,200,255,0.7)',marginBottom:4}}>FINQUEST INTELLIGENCE</div>
                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:'1rem',fontWeight:700,color:signalModal.type==='Golden Cross'?'#00ff9d':'#ff3355',letterSpacing:1}}>
                  {signalModal.type==='Golden Cross'?'★':'✦'} {signalModal.type.toUpperCase()} DETECTED
                </div>
              </div>
              <button onClick={()=>setSignalModal(null)} style={{background:'none',border:'1px solid rgba(0,200,255,0.2)',borderRadius:6,color:'#6a9bbf',cursor:'pointer',fontSize:'1rem',width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
            </div>

            {/* Body */}
            <div style={{padding:'20px 22px'}}>
              <div style={{fontFamily:'monospace',fontSize:'.82rem',color:'#cde8ff',lineHeight:1.7,marginBottom:16}}>
                The <span style={{color:'#00c8ff',fontWeight:700}}>50-day Moving Average</span> has crossed
                {signalModal.type==='Golden Cross' ? ' above ' : ' below '}
                the <span style={{color:'#ff6b35',fontWeight:700}}>200-day Moving Average</span> for
                <span style={{color:'#ffd700',fontWeight:700}}> {signalModal.sym}</span>.
                <br/><br/>
                This historically suggests a <span style={{color:signalModal.type==='Golden Cross'?'#00ff9d':'#ff3355',fontWeight:700,fontSize:'.9rem'}}>{signalModal.type==='Golden Cross'?'Strong Buy':'Strong Sell'}</span> opportunity.
              </div>

              {/* Signal Details */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:18}}>
                <div style={{background:'rgba(0,200,255,0.04)',border:'1px solid rgba(0,200,255,0.12)',borderRadius:6,padding:'10px 12px'}}>
                  <div style={{fontFamily:'monospace',fontSize:'.5rem',letterSpacing:2,color:'#3a5f7f',marginBottom:4}}>CURRENT PRICE</div>
                  <div style={{fontFamily:'monospace',fontSize:'.9rem',fontWeight:700,color:'#cde8ff'}}>{signalModal.price>=1?signalModal.price.toFixed(2):signalModal.price.toFixed(4)}</div>
                </div>
                <div style={{background:'rgba(0,200,255,0.04)',border:'1px solid rgba(0,200,255,0.12)',borderRadius:6,padding:'10px 12px'}}>
                  <div style={{fontFamily:'monospace',fontSize:'.5rem',letterSpacing:2,color:'#3a5f7f',marginBottom:4}}>TREND</div>
                  <div style={{fontFamily:'monospace',fontSize:'.9rem',fontWeight:700,color:signalModal.trend==='Upward'?'#00ff9d':'#ff3355'}}>{signalModal.trend==='Upward'?'▲ ':'▼ '}{signalModal.trend}</div>
                </div>
                <div style={{background:'rgba(0,200,255,0.04)',border:'1px solid rgba(0,200,255,0.12)',borderRadius:6,padding:'10px 12px'}}>
                  <div style={{fontFamily:'monospace',fontSize:'.5rem',letterSpacing:2,color:'#3a5f7f',marginBottom:4}}>SMA 50</div>
                  <div style={{fontFamily:'monospace',fontSize:'.85rem',color:'#00c8ff'}}>{signalModal.sma50>=1?signalModal.sma50.toFixed(2):signalModal.sma50.toFixed(4)}</div>
                </div>
                <div style={{background:'rgba(0,200,255,0.04)',border:'1px solid rgba(0,200,255,0.12)',borderRadius:6,padding:'10px 12px'}}>
                  <div style={{fontFamily:'monospace',fontSize:'.5rem',letterSpacing:2,color:'#3a5f7f',marginBottom:4}}>SMA 200</div>
                  <div style={{fontFamily:'monospace',fontSize:'.85rem',color:'#ff6b35'}}>{signalModal.sma200>=1?signalModal.sma200.toFixed(2):signalModal.sma200.toFixed(4)}</div>
                </div>
              </div>

              {/* Disclaimer */}
              <div style={{fontFamily:'monospace',fontSize:'.55rem',color:'#3a5f7f',marginBottom:16,lineHeight:1.5,padding:'8px 10px',background:'rgba(0,0,0,0.3)',borderRadius:4,border:'1px solid rgba(0,200,255,0.08)'}}>
                ⚠ Signals are based on technical indicators and historical patterns. They do not constitute guaranteed financial advice. Trade responsibly.
              </div>

              {/* Action Buttons */}
              <div style={{display:'flex',gap:10}}>
                <button
                  onClick={()=>{
                    // Quick Buy: auto-fill trade panel
                    setTradeSide(signalModal.type==='Golden Cross'?'buy':'sell');
                    setQty('10');
                    const p = signalModal.price;
                    const dec = p>=1?2:4;
                    if (signalModal.type==='Golden Cross') {
                      setSl((p*0.97).toFixed(dec));
                      setTp((p*1.06).toFixed(dec));
                    } else {
                      setSl((p*1.03).toFixed(dec));
                      setTp((p*0.94).toFixed(dec));
                    }
                    setSignalModal(null);
                    toast.success(`Trade panel auto-filled for ${signalModal.type==='Golden Cross'?'BUY':'SELL'} ${signalModal.sym}`);
                  }}
                  style={{flex:1,padding:'12px 0',borderRadius:6,border:`1px solid ${signalModal.type==='Golden Cross'?'rgba(0,255,157,0.5)':'rgba(255,51,85,0.5)'}`,background:signalModal.type==='Golden Cross'?'linear-gradient(135deg,rgba(0,255,157,0.2),rgba(0,200,100,0.1))':'linear-gradient(135deg,rgba(255,51,85,0.2),rgba(200,30,60,0.1))',color:signalModal.type==='Golden Cross'?'#00ff9d':'#ff3355',fontFamily:"'Orbitron',sans-serif",fontSize:'.75rem',fontWeight:700,cursor:'pointer',letterSpacing:1}}
                >
                  ⚡ QUICK {signalModal.type==='Golden Cross'?'BUY':'SELL'}
                </button>
                <button
                  onClick={()=>setSignalModal(null)}
                  style={{flex:1,padding:'12px 0',borderRadius:6,border:'1px solid rgba(0,200,255,0.2)',background:'rgba(0,200,255,0.05)',color:'#6a9bbf',fontFamily:'monospace',fontSize:'.72rem',cursor:'pointer'}}
                >
                  DISMISS
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 📱 STOCK DRAWER */}
{drawerOpen && (
  <div
    style={{
      position:'fixed',
      top:0,
      left:0,
      bottom:0,
      width:260,
      background:'#050f1a',
      borderRight:'1px solid rgba(0,200,255,0.2)',
      zIndex:999,
      display:'flex',
      flexDirection:'column',
      animation:'slideIn 0.2s ease'
    }}
  >

    {/* Header */}
    <div style={{
      padding:'10px',
      borderBottom:'1px solid rgba(0,200,255,0.13)',
      display:'flex',
      justifyContent:'space-between',
      alignItems:'center'
    }}>
      <span style={{fontFamily:'monospace',fontSize:'.7rem',color:'#00c8ff'}}>STOCKS</span>

      <button
        onClick={() => setDrawerOpen(false)}
        style={{
          background:'none',
          border:'none',
          color:'#6a9bbf',
          fontSize:'1rem',
          cursor:'pointer'
        }}
      >
        ✕
      </button>
    </div>

    {/* Search */}
    <div style={{padding:8}}>
      <input
        value={search}
        onChange={e=>setSearch(e.target.value)}
        placeholder="Search..."
        style={{
          width:'100%',
          padding:'6px',
          background:'rgba(0,0,0,.4)',
          border:'1px solid rgba(0,200,255,0.2)',
          borderRadius:4,
          color:'#cde8ff',
          fontFamily:'monospace',
          fontSize:'.7rem'
        }}
      />
    </div>

    {/* Assets List */}
    <div style={{flex:1,overflowY:'auto'}}>
      {filteredAssets.map(a=>(
        <div
          key={a.sym}
          onClick={()=>{
            selectSym(a.sym);
            setDrawerOpen(false);
          }}
          style={{
            padding:'8px 10px',
            borderBottom:'1px solid rgba(0,200,255,0.07)',
            cursor:'pointer'
          }}
        >
          <div style={{color:'#00c8ff',fontSize:'.7rem'}}>{a.sym}</div>
          <div style={{color:'#6a9bbf',fontSize:'.6rem'}}>{a.name}</div>
        </div>
      ))}
    </div>

  </div>
)}
<style>
{`
@media (max-width: 768px) {

  .mobile-tabs {
    display: flex !important;
    border-bottom: 1px solid rgba(0,200,255,0.2);
  }

  .mobile-tabs button {
    flex: 1;
    padding: 10px;
    background: none;
    border: none;
    color: #6a9bbf;
    font-family: monospace;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .mobile-tabs button:first-child {
    border-right: 1px solid rgba(0,200,255,0.2);
  }

}
`}
</style>



      
    </div>
  );
};

export default MarketPage;
