import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";

export const SignalsPage = () => {
  const [signals, setSignals] = useState<any[]>([]);

  useEffect(() => {
    fetch('http://localhost:8000/api/signals')
      .then(r => r.json())
      .then(data => setSignals(data || []))
      .catch(e => console.error(e));
  }, []);

  return (
    <div style={{minHeight:'100vh', background:'#020810', color:'#cde8ff', fontFamily:"'Rajdhani',sans-serif", display:'flex', flexDirection:'column'}}>
      <Navbar />
      <div style={{flex:1, padding: 20, maxWidth: 800, margin: '0 auto', width: '100%'}}>
        <h1 style={{color:'#00c8ff', fontFamily:"'Orbitron',sans-serif", letterSpacing: 2, borderBottom:'1px solid rgba(0,200,255,0.2)', paddingBottom: 10}}>MARKET SIGNALS</h1>
        <p style={{fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: 20}}>
          Disclaimer: Signals are based on technical indicators and do not constitute guaranteed financial advice.
        </p>

        {signals.length === 0 ? (
          <div style={{textAlign:'center', color:'rgba(0,200,255,0.5)', marginTop: 50}}>No automated signals detected yet. (Wait for crossovers on market charts)</div>
        ) : (
          <div style={{display:'flex', flexDirection:'column', gap: 10}}>
            {signals.map((s, i) => (
              <div key={i} style={{background:'rgba(2,10,22,0.8)', border:'1px solid rgba(0,200,255,0.15)', borderRadius: 6, padding: '12px 18px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontFamily:"'Orbitron',sans-serif", color: s.trend === 'Upward' ? '#00ff9d' : '#ff3355', fontSize: '1.1rem', fontWeight: 'bold'}}>{s.sym}</div>
                  <div style={{fontSize: '0.85rem', color: '#6a9bbf', marginTop: 4}}>{s.type} • {s.trend} Trend</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontFamily:'monospace', fontSize: '1rem'}}>${s.price?.toFixed(2)}</div>
                  <div style={{fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: 4}}>{new Date(s.ts).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SignalsPage;
