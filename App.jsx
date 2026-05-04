import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const POLL_MS = 3000;

const STATUS_COLOR = {
  HEALTHY: '#00ff9d',
  WARNING: '#ffe600',
  CRITICAL: '#ff3d3d',
};

const MACHINE_ICONS = {
  compressor: (
    <g stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round">
      <rect x="-9" y="-9" width="18" height="18" rx="2"/>
      <rect x="-4" y="-4" width="8" height="8" rx="1"/>
    </g>
  ),
  motor: (
    <g stroke="currentColor" fill="none" strokeWidth="1.5">
      <circle cx="0" cy="0" r="11"/>
      <circle cx="0" cy="0" r="5"/>
      <line x1="0" y1="-11" x2="0" y2="-16"/>
    </g>
  ),
  pump: (
    <g stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round">
      <polygon points="0,-11 10,6 -10,6"/>
      <line x1="0" y1="6" x2="0" y2="11"/>
    </g>
  ),
  conveyor: (
    <g stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round">
      <rect x="-13" y="-5" width="26" height="10" rx="5"/>
      <line x1="-6" y1="-5" x2="-6" y2="5"/>
      <line x1="6" y1="-5" x2="6" y2="5"/>
    </g>
  ),
  robot: (
    <g stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round">
      <rect x="-4" y="-12" width="8" height="7" rx="1"/>
      <rect x="-7" y="-5" width="14" height="7" rx="1"/>
      <rect x="-5" y="2" width="10" height="7" rx="1"/>
    </g>
  ),
  turbine: (
    <g stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round">
      <polygon points="0,-13 4,-4 13,0 4,4 0,13 -4,4 -13,0 -4,-4"/>
    </g>
  ),
};

const MACHINE_CONFIG = [
  { id:'M001', name:'COMPRESSOR A', type:'Centrifugal Compressor', icon:'compressor', x:'15%', y:'25%' },
  { id:'M002', name:'MOTOR DRIVE B', type:'AC Induction Motor',    icon:'motor',      x:'45%', y:'25%' },
  { id:'M003', name:'PUMP UNIT C',   type:'Centrifugal Pump',      icon:'pump',       x:'75%', y:'25%' },
  { id:'M004', name:'CONVEYOR D',    type:'Belt Conveyor System',  icon:'conveyor',   x:'15%', y:'70%' },
  { id:'M005', name:'ROBOT ARM E',   type:'6-DOF Industrial Robot',icon:'robot',      x:'45%', y:'70%' },
  { id:'M006', name:'TURBINE F',     type:'Steam Turbine Gen.',    icon:'turbine',    x:'75%', y:'70%' },
];

// ─── Custom Tooltip for charts ───────────────────────────────────────────────
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background:'#111d35', border:'1px solid #1e3050', borderRadius:6,
      padding:'6px 10px', fontSize:11, fontFamily:'monospace'
    }}>
      {payload.map((p,i) => (
        <div key={i} style={{color:p.color}}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
        </div>
      ))}
    </div>
  );
};

// ─── Machine Node ────────────────────────────────────────────────────────────
const MachineNode = ({ machine, data, isSelected, onHover, onLeave, onClick }) => {
  const status = data?.status || 'HEALTHY';
  const health = data?.health_score ?? 100;
  const color = STATUS_COLOR[status] || STATUS_COLOR.HEALTHY;
  const isCritical = status === 'CRITICAL';

  return (
    <div
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        position:'absolute',
        left: machine.x,
        top: machine.y,
        transform:'translate(-50%,-50%)',
        display:'flex', flexDirection:'column', alignItems:'center',
        cursor:'pointer',
        userSelect:'none',
      }}
    >
      {/* Pulse ring for critical */}
      {isCritical && (
        <div style={{
          position:'absolute',
          width:72, height:72,
          borderRadius:'50%',
          border:`2px solid ${color}`,
          animation:'critPulse 1.4s ease-out infinite',
          opacity:0,
          top:'50%', left:'50%',
          transform:'translate(-50%,-50%)',
        }}/>
      )}
      {/* Node body */}
      <svg
        width="56" height="56"
        viewBox="-28 -28 56 56"
        style={{
          filter: isSelected ? `drop-shadow(0 0 12px ${color})` : `drop-shadow(0 0 6px ${color}40)`,
          transition:'filter .3s',
        }}
      >
        {/* Outer ring */}
        <circle cx="0" cy="0" r="26"
          fill="none" stroke={color}
          strokeWidth={isSelected ? 2.5 : 1.5}
          opacity={isSelected ? 1 : 0.7}
        />
        {/* Body */}
        <circle cx="0" cy="0" r="20"
          fill="#0d1526" stroke={color} strokeWidth="1" strokeOpacity="0.4"
        />
        {/* Icon */}
        <g color={color}>
          {MACHINE_ICONS[machine.icon]}
        </g>
        {/* Score */}
        <text
          x="0" y="0"
          textAnchor="middle" dominantBaseline="central"
          fill={color}
          fontSize="9"
          fontFamily="'Share Tech Mono',monospace"
          fontWeight="700"
          dy="12"
        >
          {data ? Math.round(health) : '—'}
        </text>
      </svg>
      {/* Name label */}
      <div style={{
        fontSize:9, letterSpacing:1.5, color:'#7a9cc0',
        fontFamily:"'Barlow Condensed',sans-serif",
        marginTop:4, whiteSpace:'nowrap',
      }}>
        {machine.name}
      </div>
    </div>
  );
};

// ─── Tooltip ─────────────────────────────────────────────────────────────────
const HoverTip = ({ machine, data, pos }) => {
  if (!data || !machine) return null;
  const color = STATUS_COLOR[data.status] || STATUS_COLOR.HEALTHY;
  return (
    <div style={{
      position:'fixed',
      left: pos.x + 16,
      top: pos.y - 10,
      background:'#111d35',
      border:`1px solid ${color}50`,
      borderRadius:6,
      padding:'10px 14px',
      pointerEvents:'none',
      zIndex:1000,
      minWidth:160,
    }}>
      <div style={{fontFamily:"'Barlow Condensed'",fontSize:14,fontWeight:700,letterSpacing:1,color:'#c8d8f0'}}>
        {machine.name}
      </div>
      <div style={{fontSize:10,fontFamily:'monospace',letterSpacing:2,color,marginTop:3}}>
        ● {data.status}
      </div>
      <div style={{fontSize:24,fontWeight:700,fontFamily:'monospace',color,lineHeight:1.2,marginTop:6}}>
        {Math.round(data.health_score)}
      </div>
      <div style={{fontSize:9,color:'#3a5a80',letterSpacing:1}}>HEALTH SCORE</div>
      <div style={{marginTop:6,fontSize:11,color:'#7a9cc0'}}>
        Fail Prob: <span style={{color}}>{Math.round(data.failure_probability)}%</span>
      </div>
    </div>
  );
};

// ─── Side Panel ──────────────────────────────────────────────────────────────
const SidePanel = ({ machine, data, history }) => {
  const [activeChart, setActiveChart] = useState('health');

  const chartDatasets = {
    health: { key:'health_score',   color:'#00e5ff', label:'Health Score' },
    temp:   { key:'MotorTemp_C',    color:'#ff6b35', label:'Motor Temp (°C)' },
    vib:    { key:'VibMagnitude_ms2',color:'#ffe600',label:'Vibration (m/s²)' },
    freq:   { key:'DominantFreq_Hz',color:'#a855f7', label:'Freq (Hz)' },
  };
  const ds = chartDatasets[activeChart];
  const chartData = history.map((h,i) => ({ i, v: h[ds.key] }));

  if (!machine || !data) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',color:'#3a5a80',gap:8}}>
        <div style={{fontSize:32,opacity:.3}}>⬡</div>
        <div style={{fontSize:11,letterSpacing:3,fontFamily:'monospace'}}>NO MACHINE SELECTED</div>
        <div style={{fontSize:10,color:'#1e3050'}}>Click a node on the floor plan</div>
      </div>
    );
  }

  const color = STATUS_COLOR[data.status] || STATUS_COLOR.HEALTHY;
  const rul = data.rul_hours >= 9999 ? '∞' : data.rul_hours + 'h';

  const PARAMS = [
    { label:'Motor Temp', val:`${data.MotorTemp_C?.toFixed(1)} °C`, warn: data.MotorTemp_C > 80 ? 'red' : data.MotorTemp_C > 70 ? 'yellow' : null },
    { label:'Ambient Temp', val:`${data.AmbientTemp_C?.toFixed(1)} °C` },
    { label:'Humidity', val:`${data['AmbientHum_%']?.toFixed(1)} %` },
    { label:'Vibration Mag', val:`${data.VibMagnitude_ms2?.toFixed(3)} m/s²`, warn: data.VibMagnitude_ms2 > 0.8 ? 'red' : data.VibMagnitude_ms2 > 0.4 ? 'yellow' : null },
    { label:'Dominant Freq', val:`${data.DominantFreq_Hz?.toFixed(1)} Hz`, warn: data.DominantFreq_Hz > 35 ? 'red' : data.DominantFreq_Hz > 28 ? 'yellow' : null },
    { label:'Accel X/Y/Z', val:`${data.RawAccel_X_ms2?.toFixed(2)} / ${data.RawAccel_Y_ms2?.toFixed(2)} / ${data.RawAccel_Z_ms2?.toFixed(2)}` },
  ];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14,padding:16,overflowY:'auto',height:'100%'}}>
      {/* AI Block */}
      <div style={{background:'#111d35',border:'1px solid #1e3050',borderRadius:8,padding:14}}>
        <div style={{fontSize:10,letterSpacing:3,color:'#3a5a80',fontFamily:"'Barlow Condensed'",marginBottom:12}}>◈ AI PREDICTIONS</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,textAlign:'center'}}>
          {[
            { v: Math.round(data.health_score), label:'Health Score', c:color },
            { v: `${Math.round(data.failure_probability)}%`, label:'Fail Prob', c: data.failure_probability>50?'#ff3d3d':data.failure_probability>25?'#ffe600':'#00ff9d' },
            { v: rul, label:'RUL Est.', c:'#00e5ff' },
          ].map((m,i) => (
            <div key={i}>
              <div style={{fontFamily:'monospace',fontSize:22,fontWeight:700,color:m.c}}>{m.v}</div>
              <div style={{fontSize:9,color:'#3a5a80',letterSpacing:1,textTransform:'uppercase',marginTop:2}}>{m.label}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:12}}>
          <div style={{height:6,background:'#162040',borderRadius:3,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${data.health_score}%`,background:color,borderRadius:3,transition:'width .8s ease'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#3a5a80',marginTop:4,fontFamily:'monospace'}}>
            <span>CRITICAL</span><span>WARNING</span><span>HEALTHY</span>
          </div>
        </div>
      </div>

      {/* Params */}
      <div style={{background:'#111d35',border:'1px solid #1e3050',borderRadius:8,padding:14}}>
        <div style={{fontSize:10,letterSpacing:3,color:'#3a5a80',fontFamily:"'Barlow Condensed'",marginBottom:10}}>◈ LIVE TELEMETRY</div>
        {PARAMS.map((p,i) => (
          <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:i<PARAMS.length-1?'1px solid #162040':'none'}}>
            <span style={{fontSize:11,color:'#7a9cc0'}}>{p.label}</span>
            <span style={{fontFamily:'monospace',fontSize:12,fontWeight:600,color:p.warn==='red'?'#ff3d3d':p.warn==='yellow'?'#ffe600':'#c8d8f0'}}>{p.val}</span>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{background:'#111d35',border:'1px solid #1e3050',borderRadius:8,padding:14}}>
        <div style={{fontSize:10,letterSpacing:3,color:'#3a5a80',fontFamily:"'Barlow Condensed'",marginBottom:10}}>◈ HISTORICAL TRENDS</div>
        <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap'}}>
          {Object.entries(chartDatasets).map(([k,v]) => (
            <button key={k} onClick={()=>setActiveChart(k)} style={{
              fontSize:10,padding:'2px 8px',borderRadius:3,cursor:'pointer',
              fontFamily:'monospace',border:'1px solid',
              borderColor: activeChart===k ? v.color : '#1e3050',
              color: activeChart===k ? '#fff' : '#7a9cc0',
              background: activeChart===k ? v.color+'33' : 'transparent',
              transition:'all .15s',
            }}>{k}</button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData} margin={{top:4,right:4,bottom:0,left:-20}}>
            <CartesianGrid stroke="#1e3050" strokeDasharray="3 3" vertical={false}/>
            <XAxis dataKey="i" hide/>
            <YAxis tick={{fill:'#3a5a80',fontSize:9,fontFamily:'monospace'}} tickLine={false} axisLine={false}/>
            <Tooltip content={<ChartTip/>}/>
            {activeChart==='health' && <ReferenceLine y={70} stroke="#00ff9d" strokeDasharray="4 2" strokeWidth={0.8}/>}
            {activeChart==='health' && <ReferenceLine y={40} stroke="#ffe600" strokeDasharray="4 2" strokeWidth={0.8}/>}
            <Line dataKey="v" stroke={ds.color} strokeWidth={1.5} dot={false} name={ds.label} isAnimationActive={false}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [allData, setAllData] = useState({});
  const [history, setHistory] = useState({});
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [hoverPos, setHoverPos] = useState({x:0,y:0});
  const simRef = useRef({});

  // Simulate data locally (fallback when no backend)
  const simulateTick = useCallback(() => {
    const now = {};
    MACHINE_CONFIG.forEach((m, i) => {
      if (!simRef.current[m.id]) simRef.current[m.id] = { tick: i * 80, phase: i * 0.8 };
      const s = simRef.current[m.id];
      s.tick++;
      const t = s.tick / 300;
      const degradeStart = 0.55 + i * 0.07;
      const degrade = Math.max(0, (t - degradeStart) / (1 - degradeStart));
      const n = () => (Math.random() - 0.5) * 0.4;
      const motorTemp = 65 + 5 * Math.sin(t*8+s.phase) + 28*degrade + n();
      const ambTemp = 28 + 2*Math.sin(t*2) + n()*0.5;
      const ambHum = 55 + 8*Math.sin(t*1.5+s.phase) + n();
      const accelX = 0.5 + 0.6*degrade + Math.abs(n())*0.3;
      const accelY = 0.4 + 0.5*degrade + Math.abs(n())*0.25;
      const accelZ = 9.81 + 0.15*degrade + n()*0.05;
      const vib = Math.sqrt(accelX**2 + accelY**2 + (accelZ-9.81)**2);
      const freq = 25 + 18*degrade + n();
      const baseHealth = 95 - 75*degrade;
      const health_score = Math.max(5, Math.min(99, baseHealth + (Math.random()-.5)*8));
      const failure_probability = Math.max(0,Math.min(99,(1/(1+Math.exp((health_score-40)/10)))*100));
      const rul_hours = health_score > 70 ? Math.round(200+(health_score-70)*15) : health_score > 40 ? Math.round(20+(health_score-40)*6) : Math.round(health_score*.8);
      const status = health_score >= 70 ? 'HEALTHY' : health_score >= 40 ? 'WARNING' : 'CRITICAL';
      now[m.id] = { machine_id:m.id, timestamp:new Date().toISOString(), MotorTemp_C:motorTemp, AmbientTemp_C:ambTemp, 'AmbientHum_%':ambHum, RawAccel_X_ms2:accelX, RawAccel_Y_ms2:accelY, RawAccel_Z_ms2:accelZ, VibMagnitude_ms2:vib, DominantFreq_Hz:freq, health_score, failure_probability, rul_hours, status };
    });
    setAllData(prev => ({...prev,...now}));
    setHistory(prev => {
      const next = {...prev};
      Object.entries(now).forEach(([id,d]) => {
        next[id] = [...(prev[id]||[]).slice(-149), d];
      });
      return next;
    });
  }, []);

  useEffect(() => {
    simulateTick();
    const id = setInterval(simulateTick, POLL_MS);
    return () => clearInterval(id);
  }, [simulateTick]);

  const avgHealth = Object.values(allData).length
    ? Object.values(allData).reduce((a,v)=>a+v.health_score,0)/Object.values(allData).length
    : 100;
  const critCount = Object.values(allData).filter(v=>v.status==='CRITICAL').length;

  const selectedMachine = MACHINE_CONFIG.find(m=>m.id===selected);
  const selectedData = allData[selected];
  const selectedHistory = history[selected] || [];

  return (
    <div style={{
      background:'#070b14', color:'#c8d8f0', fontFamily:"'Barlow',sans-serif",
      minHeight:'100vh', display:'grid', gridTemplateRows:'52px 1fr',
      height:'100vh', overflow:'hidden',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow:wght@300;400;500;600;700&family=Barlow+Condensed:wght@400;600;700&display=swap');
        @keyframes critPulse { 0% { transform:translate(-50%,-50%) scale(1); opacity:.7 } 100% { transform:translate(-50%,-50%) scale(2); opacity:0 } }
        @keyframes dot-blink { 0%,100%{opacity:1}50%{opacity:.3} }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#1e3050;border-radius:2px}
      `}</style>

      {/* Header */}
      <header style={{
        background:'#0d1526', borderBottom:'1px solid #1e3050',
        display:'flex', alignItems:'center', padding:'0 20px', gap:16, zIndex:100,
      }}>
        <div style={{width:8,height:8,borderRadius:'50%',background:'#00ff9d',boxShadow:'0 0 8px #00ff9d',animation:'dot-blink 2s infinite'}}/>
        <div>
          <div style={{fontFamily:"'Barlow Condensed'",fontSize:18,fontWeight:700,letterSpacing:3,color:'#00e5ff',textTransform:'uppercase'}}>NEXUS FACTORY OS</div>
          <div style={{fontSize:9,color:'#7a9cc0',fontFamily:'monospace',letterSpacing:2}}>PREDICTIVE MAINTENANCE SYSTEM v2.4 · LIVE</div>
        </div>
        <div style={{flex:1}}/>
        {[
          { label:'MACHINES ONLINE', val:`${Object.keys(allData).length} / ${MACHINE_CONFIG.length}`, c:'#00ff9d' },
          { label:'AVG HEALTH', val:Math.round(avgHealth), c: avgHealth>=70?'#00ff9d':avgHealth>=40?'#ffe600':'#ff3d3d' },
          { label:'CRITICAL ALERTS', val:critCount, c:critCount?'#ff3d3d':'#3a5a80' },
          { label:'SYS TIME', val:new Date().toLocaleTimeString(), c:'#7a9cc0' },
        ].map((s,i) => (
          <div key={i} style={{textAlign:'right',padding:'0 12px',borderLeft:'1px solid #1e3050'}}>
            <div style={{fontSize:9,color:'#3a5a80',fontFamily:'monospace',letterSpacing:2}}>{s.label}</div>
            <div style={{fontSize:14,fontWeight:600,fontFamily:'monospace',color:s.c}}>{s.val}</div>
          </div>
        ))}
      </header>

      {/* Main */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 360px',overflow:'hidden'}}>
        {/* Floor */}
        <div style={{position:'relative',overflow:'hidden',padding:20}}>
          <div style={{
            position:'absolute',inset:0,
            backgroundImage:'linear-gradient(rgba(0,229,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.04) 1px,transparent 1px)',
            backgroundSize:'40px 40px',pointerEvents:'none',
          }}/>
          <div style={{fontSize:11,letterSpacing:4,color:'#1e3050',fontFamily:"'Barlow Condensed'",marginBottom:8,textTransform:'uppercase',fontWeight:600}}>
            ◈ FACTORY FLOOR — ZONE A / LEVEL 1
          </div>
          {/* Zone labels */}
          <div style={{position:'absolute',top:56,left:32,fontSize:10,letterSpacing:3,color:'#1a2a45',fontFamily:"'Barlow Condensed'",fontWeight:600}}>PRODUCTION LINE ALPHA</div>
          <div style={{position:'absolute',top:'51%',left:32,fontSize:10,letterSpacing:3,color:'#1a2a45',fontFamily:"'Barlow Condensed'",fontWeight:600}}>PRODUCTION LINE BETA</div>

          {/* Zone borders */}
          <div style={{position:'absolute',top:68,left:16,right:16,height:'38%',border:'1px dashed #1a2a45',borderRadius:12,pointerEvents:'none'}}/>
          <div style={{position:'absolute',top:'54%',left:16,right:16,height:'38%',border:'1px dashed #1a2a45',borderRadius:12,pointerEvents:'none'}}/>

          {/* Machines */}
          {MACHINE_CONFIG.map(m => (
            <MachineNode
              key={m.id}
              machine={m}
              data={allData[m.id]}
              isSelected={selected===m.id}
              onHover={e => { setHovered(m.id); setHoverPos({x:e.clientX,y:e.clientY}); }}
              onLeave={() => setHovered(null)}
              onClick={() => setSelected(selected===m.id ? null : m.id)}
            />
          ))}

          {/* Legend */}
          <div style={{position:'absolute',bottom:16,left:20,display:'flex',gap:14,alignItems:'center'}}>
            {Object.entries(STATUS_COLOR).map(([s,c])=>(
              <div key={s} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'#3a5a80',fontFamily:'monospace'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:c}}/>
                {s}
              </div>
            ))}
          </div>
        </div>

        {/* Side panel */}
        <div style={{background:'#0d1526',borderLeft:'1px solid #1e3050',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid #1e3050',flexShrink:0}}>
            <div style={{fontSize:10,letterSpacing:4,color:'#3a5a80',fontFamily:"'Barlow Condensed'",marginBottom:8,textTransform:'uppercase'}}>◈ MACHINE DETAIL</div>
            {selectedMachine ? (
              <>
                <div style={{fontFamily:"'Barlow Condensed'",fontSize:20,fontWeight:700,letterSpacing:1,color: STATUS_COLOR[selectedData?.status||'HEALTHY']}}>
                  {selectedMachine.name}
                </div>
                <div style={{fontSize:11,color:'#7a9cc0',fontFamily:'monospace',marginTop:2}}>{selectedMachine.type}</div>
              </>
            ) : (
              <>
                <div style={{fontFamily:"'Barlow Condensed'",fontSize:14,fontWeight:700,color:'#3a5a80'}}>SELECT A MACHINE</div>
                <div style={{fontSize:11,color:'#1e3050',marginTop:2}}>Click any node on the floor plan</div>
              </>
            )}
          </div>
          <div style={{flex:1,overflow:'hidden'}}>
            <SidePanel machine={selectedMachine} data={selectedData} history={selectedHistory}/>
          </div>
        </div>
      </div>

      {/* Hover tooltip */}
      <HoverTip
        machine={hovered ? MACHINE_CONFIG.find(m=>m.id===hovered) : null}
        data={allData[hovered]}
        pos={hoverPos}
      />
    </div>
  );
}
