import { useState, useEffect, useRef } from 'react'
import {
  auth, db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  onSnapshot, query, where, serverTimestamp,
} from './firebase.js'

// ── helpers ──────────────────────────────────────────────────
const haversine = (a,b,c,d) => { const R=6371000,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180; return R*2*Math.atan2(Math.sqrt(Math.sin(x/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2),Math.sqrt(1-Math.sin(x/2)**2-Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2)) }
const fmtDist = m => m < 1000 ? `${Math.round(m)}m` : `${(m/1000).toFixed(1)}km`
const fmtTime = ms => { const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000); return `${h}h ${m}m` }
const COLORS = ['#4f46e5','#d97706','#059669','#dc2626','#7c3aed','#0284c7','#be185d']
const randomColor = () => COLORS[Math.floor(Math.random()*COLORS.length)]
const typeColor = {QUARTEIRAO:'#4f46e5',BAIRRO:'#d97706',AREA:'#059669',CIDADE:'#dc2626'}
const typeBg = {QUARTEIRAO:'#eef2ff',BAIRRO:'#fffbeb',AREA:'#ecfdf5',CIDADE:'#fef2f2'}
const typeLabel = {QUARTEIRAO:'QUARTEIRÃO',BAIRRO:'BAIRRO',AREA:'ÁREA',CIDADE:'CIDADE'}

// ── icons ─────────────────────────────────────────────────────
const I = ({n,s=18,c='currentColor'}) => {
  const d = {
    map:<><circle cx="12"cy="12"r="10"/><line x1="2"y1="12"x2="22"y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
    trophy:<><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/><path d="M8.21 13.89A5 5 0 0 1 7 10V5h10v5a5 5 0 0 1-1.21 3.89"/><line x1="3"y1="5"x2="7"y2="5"/><line x1="21"y1="5"x2="17"y2="5"/></>,
    users:<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9"cy="7"r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    user:<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12"cy="7"r="4"/></>,
    sword:<><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13"y1="19"x2="19"y2="13"/><line x1="16"y1="16"x2="20"y2="20"/><line x1="19"y1="21"x2="21"y2="19"/></>,
    shield:<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    flag:<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4"y1="22"x2="4"y2="15"/></>,
    plus:<><line x1="12"y1="5"x2="12"y2="19"/><line x1="5"y1="12"x2="19"y2="12"/></>,
    check:<><polyline points="20 6 9 17 4 12"/></>,
    x:<><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></>,
    pin:<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12"cy="10"r="3"/></>,
    nav:<><polygon points="3 11 22 2 13 21 11 13 3 11"/></>,
    wifi:<><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12"y1="20"x2="12.01"y2="20"/></>,
    warn:<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12"y1="9"x2="12"y2="13"/><line x1="12"y1="17"x2="12.01"y2="17"/></>,
    zap:<><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
  }
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d[n]}</svg>
}

// ── GPS hook ──────────────────────────────────────────────────
const useGeo = () => {
  const [g, setG] = useState({lat:null,lng:null,acc:null,err:null,loading:true})
  useEffect(() => {
    if (!navigator.geolocation) { setG(s=>({...s,err:'GPS não suportado.',loading:false})); return }
    const ok = p => setG({lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy,err:null,loading:false})
    const fail = e => setG(s=>({...s,err:e.code===1?'Permissão de GPS negada.':'Não foi possível obter localização.',loading:false}))
    const opts = {enableHighAccuracy:true,timeout:12000,maximumAge:4000}
    navigator.geolocation.getCurrentPosition(ok, fail, opts)
    const id = navigator.geolocation.watchPosition(ok, fail, opts)
    return () => navigator.geolocation.clearWatch(id)
  }, [])
  return g
}

// ── Leaflet Map ───────────────────────────────────────────────
const LeafletMap = ({ points, geo, profiles, selectedId, battles, addMode, onSelect, onMapClick }) => {
  const ref = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef({})
  const userRef = useRef(null)

  useEffect(() => {
    if (mapRef.current) return
    const L = window.L
    if (!L) return
    const map = L.map(ref.current, { zoomControl: false, attributionControl: false }).setView(
      [geo.lat || -23.575, geo.lng || -46.650], 15
    )
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    map.on('click', e => {
      if (window.__wmAddMode) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng })
    })
    mapRef.current = map
  }, [])

  // sync addMode
  useEffect(() => { window.__wmAddMode = addMode }, [addMode])

  // user marker
  useEffect(() => {
    const L = window.L; const map = mapRef.current
    if (!L || !map || !geo.lat) return
    if (userRef.current) userRef.current.setLatLng([geo.lat, geo.lng])
    else {
      userRef.current = L.circleMarker([geo.lat, geo.lng], {
        radius: 10, fillColor: '#4f46e5', fillOpacity: 1,
        color: '#fff', weight: 3
      }).addTo(map)
      map.setView([geo.lat, geo.lng], 15)
    }
  }, [geo.lat, geo.lng])

  // draw circles
  useEffect(() => {
    const L = window.L; const map = mapRef.current
    if (!L || !map) return
    Object.values(layersRef.current).forEach(l => l.remove())
    layersRef.current = {}
    points.forEach(pt => {
      const p = profiles[pt.owner_id]
      const color = p?.avatar_color || pt.owner_color || (pt.owner_id ? '#4f46e5' : '#94a3b8')
      const inBattle = battles.some(b => b.conquest_point_id === pt.id)
      const isSel = selectedId === pt.id
      const g = L.layerGroup().addTo(map)
      L.circle([pt.lat, pt.lng], {
        radius: pt.radius_m,
        fillColor: pt.owner_id ? color : '#94a3b8',
        fillOpacity: pt.owner_id ? 0.18 : 0.07,
        color: inBattle ? '#dc2626' : isSel ? '#1d4ed8' : (pt.owner_id ? color : '#94a3b8'),
        weight: isSel ? 3 : inBattle ? 2.5 : 1.5,
        dashArray: inBattle ? '6 4' : null,
      }).on('click', () => onSelect(pt)).addTo(g)
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${pt.owner_id?color:'#94a3b8'};color:#fff;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.2);font-family:monospace">${inBattle?'⚔ ':''}${pt.name}${pt.owner_id?(' · '+(p?.display_name||pt.owner_name||'?').charAt(0)):''}${!pt.owner_id?' 🏳':''}</div>`,
        iconAnchor: [0, 0],
      })
      L.marker([pt.lat, pt.lng], { icon }).on('click', () => onSelect(pt)).addTo(g)
      layersRef.current[pt.id] = g
    })
  }, [points, profiles, selectedId, battles])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={ref} style={{ width: '100%', height: '100%' }} />
      {addMode && (
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-120%)', background:'#4f46e5', color:'#fff', padding:'10px 18px', borderRadius:12, fontSize:13, fontWeight:700, pointerEvents:'none', boxShadow:'0 4px 20px rgba(79,70,229,0.4)', zIndex:1000 }}>
          📍 Toque no mapa para posicionar o ponto
        </div>
      )}
    </div>
  )
}

// ── Checkin ───────────────────────────────────────────────────
const Checkin = ({ point, geo, user, onResult }) => {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  if (!point) return null
  const dist = geo.lat ? haversine(geo.lat, geo.lng, point.lat, point.lng) : null
  const within = dist !== null && dist <= point.radius_m
  const run = async () => {
    if (!within || loading || done) return
    setLoading(true)
    try {
      await addDoc(collection(db,'checkins'), { user_id:user.uid, point_id:point.id, lat:geo.lat, lng:geo.lng, dist_m:dist, created_at:serverTimestamp() })
      if (!point.owner_id) {
        await updateDoc(doc(db,'conquest_points',point.id), { owner_id:user.uid, owner_name:user.display_name, owner_color:user.avatar_color, owner_km:user.km_total||0, conquered_at:serverTimestamp() })
        await updateDoc(doc(db,'profiles',user.uid), { points:(user.points||0)+100 })
        onResult({ ok:true, action:'conquered', dist, pts:100 })
      } else {
        onResult({ ok:true, action:'checkin', dist, pts:0 })
      }
      setDone(true); setTimeout(() => setDone(false), 60000)
    } catch(e) { onResult({ ok:false, error:e.message }) }
    setLoading(false)
  }
  const c = within ? '#059669' : '#94a3b8'
  return (
    <div style={{ padding:'0 20px', marginBottom:14 }}>
      {dist !== null && <>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
          <span style={{ fontSize:11, color:within?'#059669':'#dc2626', fontWeight:600 }}><I n="pin" s={12} c={within?'#059669':'#dc2626'}/> {fmtDist(dist)} de distância</span>
          <span style={{ fontSize:10, color:'#94a3b8' }}>raio {fmtDist(point.radius_m)}</span>
        </div>
        <div style={{ height:4, background:'#f1f5f9', borderRadius:2, marginBottom:10, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${Math.min(100,(dist/point.radius_m)*100)}%`, background:within?'#059669':'#dc2626', transition:'width 0.4s' }}/>
        </div>
      </>}
      <button onClick={run} disabled={!within||loading||done} style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:within?'#059669':'#f1f5f9', color:within?'#fff':'#94a3b8', cursor:within&&!loading&&!done?'pointer':'not-allowed', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        {loading ? 'Registrando...' : done ? '✓ Check-in feito' : within ? <><I n="pin" s={14} c="#fff"/> Fazer Check-in</> : <><I n="nav" s={14}/> Muito longe</>}
      </button>
      {!within && dist !== null && <p style={{ fontSize:11, color:'#94a3b8', textAlign:'center', marginTop:6 }}>Chegue {fmtDist(Math.max(0,dist-point.radius_m))} mais perto</p>}
    </div>
  )
}

// ── Territory Panel ───────────────────────────────────────────
const Panel = ({ point, geo, user, battles, profiles, onBattle, onCheckin, onClose }) => {
  if (!point) return null
  const p = point.owner_id ? profiles[point.owner_id] : null
  const name = p?.display_name || point.owner_name || '?'
  const color = p?.avatar_color || point.owner_color || (point.owner_id ? '#4f46e5' : '#94a3b8')
  const battle = battles.find(b => b.conquest_point_id === point.id && b.status === 'active')
  const isOwner = user && point.owner_id === user.uid
  const tc = typeColor[point.type] || '#64748b'
  const tb = typeBg[point.type] || '#f8fafc'
  return (
    <div style={{ position:'absolute', top:0, right:0, width:290, height:'100%', background:'#fff', borderLeft:'1px solid #e2e8f0', display:'flex', flexDirection:'column', zIndex:1000, overflowY:'auto', boxShadow:'-4px 0 20px rgba(0,0,0,0.08)' }}>
      <div style={{ padding:'18px 18px 12px', borderBottom:'1px solid #f1f5f9' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <span style={{ fontSize:10, fontWeight:700, color:tc, background:tb, padding:'3px 8px', borderRadius:20 }}>{typeLabel[point.type]||point.type}</span>
            <div style={{ fontSize:20, fontWeight:900, color:'#0f172a', marginTop:8 }}>{point.name}</div>
          </div>
          <button onClick={onClose} style={{ background:'#f1f5f9', border:'none', borderRadius:8, padding:8, cursor:'pointer' }}><I n="x" s={16} c="#64748b"/></button>
        </div>
        <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:10 }}>
          {point.owner_id ? <>
            <div style={{ width:40,height:40,borderRadius:'50%',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:18,color:'#fff' }}>{name.charAt(0)}</div>
            <div><div style={{ fontSize:14,fontWeight:700,color:'#0f172a' }}>{name}</div><div style={{ fontSize:11,color:'#64748b' }}>{point.owner_km?.toFixed(0)||0} km</div></div>
          </> : <div style={{ display:'flex',alignItems:'center',gap:8,color:'#64748b',background:'#f8fafc',borderRadius:10,padding:'10px 14px',width:'100%' }}><I n="flag" s={18}/><span style={{ fontSize:13,fontWeight:600 }}>Território livre!</span></div>}
        </div>
      </div>

      {battle && <div style={{ margin:'12px 18px 0',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:12 }}>
        <div style={{ display:'flex',gap:8,alignItems:'center',marginBottom:4 }}><I n="sword" s={14} c="#dc2626"/><span style={{ fontSize:12,color:'#dc2626',fontWeight:700 }}>BATALHA ATIVA</span></div>
        <div style={{ fontSize:12,color:'#64748b' }}>Termina em {fmtTime(Math.max(0,(battle.ends_at?.toDate?.()?.getTime()||battle.ends_at)-Date.now()))}</div>
      </div>}

      <div style={{ padding:'12px 18px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
        {[['Pontos',point.base_points],['Raio',fmtDist(point.radius_m)]].map(([l,v])=>(
          <div key={l} style={{ background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:'10px 12px' }}>
            <div style={{ fontSize:10,color:'#94a3b8',marginBottom:2,fontWeight:600 }}>{l}</div>
            <div style={{ fontSize:18,fontWeight:900,color:'#4f46e5' }}>{v}</div>
          </div>
        ))}
      </div>

      <Checkin point={point} geo={geo} user={user} onResult={onCheckin}/>

      {!isOwner && point.owner_id && !battle && (
        <div style={{ padding:'0 18px',marginBottom:12 }}>
          <button onClick={()=>onBattle(point)} style={{ width:'100%',padding:'12px',borderRadius:12,border:'none',background:'#dc2626',color:'#fff',cursor:'pointer',fontWeight:700,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
            <I n="sword" s={14} c="#fff"/> Iniciar batalha
          </button>
        </div>
      )}
      {isOwner && battle && (
        <div style={{ padding:'0 18px',marginBottom:12 }}>
          <button style={{ width:'100%',padding:'12px',borderRadius:12,border:'none',background:'#d97706',color:'#fff',cursor:'pointer',fontWeight:700,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
            <I n="shield" s={14} c="#fff"/> Chamar reforços
          </button>
        </div>
      )}
    </div>
  )
}

// ── New Point Form ────────────────────────────────────────────
const NewPointForm = ({ lat, lng, onSave, onCancel }) => {
  const [name, setName] = useState('')
  const [type, setType] = useState('BAIRRO')
  const [radius, setRadius] = useState('300')
  const s = { width:'100%',padding:'11px 14px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,color:'#0f172a',fontSize:13,outline:'none',marginBottom:10 }
  return (
    <div style={{ background:'#fff',borderRadius:20,padding:28,width:300,boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>
      <div style={{ fontSize:11,fontWeight:700,color:'#4f46e5',letterSpacing:2,marginBottom:4 }}>NOVO PONTO</div>
      <div style={{ fontSize:18,fontWeight:900,color:'#0f172a',marginBottom:16 }}>Adicionar Conquista</div>
      <div style={{ fontSize:11,color:'#94a3b8',marginBottom:14,background:'#f8fafc',padding:'8px 12px',borderRadius:8 }}>📍 {lat?.toFixed(5)}, {lng?.toFixed(5)}</div>
      <input style={s} placeholder="Nome do ponto" value={name} onChange={e=>setName(e.target.value)}/>
      <select style={{...s,cursor:'pointer'}} value={type} onChange={e=>setType(e.target.value)}>
        {[['QUARTEIRAO','QUARTEIRÃO'],['BAIRRO','BAIRRO'],['AREA','ÁREA'],['CIDADE','CIDADE']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
      </select>
      <div style={{ marginBottom:16 }}>
        <div style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'#64748b',marginBottom:8 }}>
          <span>Raio</span><span style={{ color:'#4f46e5',fontWeight:700 }}>{fmtDist(parseInt(radius)||0)}</span>
        </div>
        <input type="range" min="50" max="2000" step="50" value={radius} onChange={e=>setRadius(e.target.value)} style={{ width:'100%',accentColor:'#4f46e5' }}/>
      </div>
      <div style={{ display:'flex',gap:10 }}>
        <button onClick={onCancel} style={{ flex:1,padding:'11px',borderRadius:10,background:'#f1f5f9',border:'none',color:'#64748b',cursor:'pointer',fontWeight:700 }}>Cancelar</button>
        <button onClick={()=>name.trim()&&onSave({name,type,radius})} disabled={!name.trim()} style={{ flex:1,padding:'11px',borderRadius:10,background:name.trim()?'#4f46e5':'#c7d2fe',border:'none',color:'#fff',cursor:name.trim()?'pointer':'not-allowed',fontWeight:900 }}>Salvar</button>
      </div>
    </div>
  )
}

// ── Auth ──────────────────────────────────────────────────────
const Auth = ({ onAuth }) => {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const s = { width:'100%',padding:'12px 14px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,color:'#0f172a',fontSize:14,outline:'none' }
  const msgs = {'auth/email-already-in-use':'Email já cadastrado.','auth/wrong-password':'Senha incorreta.','auth/user-not-found':'Usuário não encontrado.','auth/weak-password':'Senha fraca (mín. 6 chars).','auth/invalid-email':'Email inválido.','auth/invalid-credential':'Email ou senha incorretos.'}
  const submit = async () => {
    setLoading(true); setErr('')
    try {
      if (mode === 'signup') {
        const color = randomColor()
        const c = await createUserWithEmailAndPassword(auth, email, pass)
        await setDoc(doc(db,'profiles',c.user.uid), { uid:c.user.uid, display_name:name, username:`@${name.toLowerCase().replace(/\s+/g,'')}`, avatar_color:color, km_total:0, points:0, is_admin:false, created_at:serverTimestamp() })
        onAuth({ uid:c.user.uid, display_name:name, avatar_color:color, km_total:0, points:0, is_admin:false })
      } else {
        const c = await signInWithEmailAndPassword(auth, email, pass)
        const snap = await getDoc(doc(db,'profiles',c.user.uid))
        onAuth(snap.exists() ? { uid:c.user.uid, ...snap.data() } : { uid:c.user.uid, display_name:email.split('@')[0], avatar_color:'#4f46e5', km_total:0, points:0, is_admin:false })
      }
    } catch(e) { setErr(msgs[e.code]||e.message) }
    setLoading(false)
  }
  return (
    <div style={{ minHeight:'100vh',background:'linear-gradient(135deg,#eef2ff 0%,#f0fdf4 100%)',display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
      <div style={{ width:'100%',maxWidth:360,background:'#fff',borderRadius:24,padding:32,boxShadow:'0 20px 60px rgba(0,0,0,0.1)' }}>
        <div style={{ textAlign:'center',marginBottom:28 }}>
          <div style={{ width:64,height:64,background:'linear-gradient(135deg,#4f46e5,#7c3aed)',borderRadius:20,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px',fontSize:30 }}>⚔️</div>
          <div style={{ fontSize:26,fontWeight:900,color:'#0f172a' }}>War Maps</div>
          <div style={{ fontSize:12,color:'#64748b',marginTop:4 }}>Conquiste seu território</div>
        </div>
        <div style={{ display:'flex',gap:8,marginBottom:20,background:'#f1f5f9',borderRadius:12,padding:4 }}>
          {['login','signup'].map(m=>(
            <button key={m} onClick={()=>setMode(m)} style={{ flex:1,padding:'9px',borderRadius:9,border:'none',cursor:'pointer',background:mode===m?'#fff':'transparent',color:mode===m?'#0f172a':'#64748b',fontSize:13,fontWeight:700,boxShadow:mode===m?'0 1px 4px rgba(0,0,0,0.1)':'none',transition:'all 0.2s' }}>
              {m==='login'?'Entrar':'Criar conta'}
            </button>
          ))}
        </div>
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          {mode==='signup'&&<input style={s} placeholder="Seu nome" value={name} onChange={e=>setName(e.target.value)}/>}
          <input style={s} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/>
          <input style={s} type="password" placeholder="Senha" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/>
        </div>
        {err&&<div style={{ fontSize:12,color:'#dc2626',marginTop:10,textAlign:'center',background:'#fef2f2',padding:'8px 12px',borderRadius:8 }}>{err}</div>}
        <button onClick={submit} disabled={loading} style={{ width:'100%',marginTop:16,padding:'13px',borderRadius:12,border:'none',background:loading?'#c7d2fe':'linear-gradient(135deg,#4f46e5,#7c3aed)',color:'#fff',fontSize:14,fontWeight:900,cursor:loading?'wait':'pointer',boxShadow:'0 4px 14px rgba(79,70,229,0.4)' }}>
          {loading?'Aguarde...':mode==='login'?'Entrar':'Criar conta'}
        </button>
      </div>
    </div>
  )
}

// ── GeoBar ────────────────────────────────────────────────────
const GeoBar = ({ geo }) => {
  const [c,bg,txt] = geo.loading?['#d97706','#fffbeb','Obtendo GPS...']:geo.err?['#dc2626','#fef2f2',geo.err]:['#059669','#f0fdf4',`GPS ✓ ±${Math.round(geo.acc||0)}m`]
  return <div style={{ position:'absolute',bottom:20,left:'50%',transform:'translateX(-50%)',background:bg,border:`1px solid ${c}40`,borderRadius:20,padding:'7px 16px',display:'flex',alignItems:'center',gap:8,fontSize:11,fontWeight:600,color:c,zIndex:1000,whiteSpace:'nowrap',boxShadow:'0 4px 20px rgba(0,0,0,0.12)' }}><I n={geo.loading?'zap':geo.err?'warn':'wifi'} s={13} c={c}/>{txt}</div>
}

// ── Main App ──────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('map')
  const [points, setPoints] = useState([])
  const [battles, setBattles] = useState([])
  const [profiles, setProfiles] = useState({})
  const [selected, setSelected] = useState(null)
  const [addMode, setAddMode] = useState(false)
  const [newPt, setNewPt] = useState(null)
  const [toast, setToast] = useState(null)
  const [leafletReady, setLeafletReady] = useState(!!window.L)
  const geo = useGeo()

  // Load Leaflet
  useEffect(() => {
    if (window.L) { setLeafletReady(true); return }
    const s = document.createElement('script')
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    s.onload = () => setLeafletReady(true)
    document.head.appendChild(s)
  }, [])

  // Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, async fbUser => {
      if (fbUser) {
        const snap = await getDoc(doc(db,'profiles',fbUser.uid))
        setUser(snap.exists() ? { uid:fbUser.uid, ...snap.data() } : { uid:fbUser.uid, display_name:fbUser.email?.split('@')[0], avatar_color:'#4f46e5', km_total:0, points:0, is_admin:false })
      } else setUser(null)
      setLoading(false)
    })
  }, [])

  // Realtime data
  useEffect(() => {
    if (!user) return
    const u1 = onSnapshot(collection(db,'conquest_points'), s => setPoints(s.docs.map(d=>({id:d.id,...d.data()}))))
    const u2 = onSnapshot(query(collection(db,'battles'),where('status','==','active')), s => setBattles(s.docs.map(d=>({id:d.id,...d.data()}))))
    getDocs(collection(db,'profiles')).then(s => { const m={}; s.docs.forEach(d=>m[d.id]=d.data()); setProfiles(m) })
    return () => { u1(); u2() }
  }, [user])

  const toast$ = (msg,type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),4000) }

  const handleCheckin = r => {
    if (!r.ok) { toast$(`❌ ${r.error}`,'err'); return }
    toast$(r.action==='conquered'?`🏆 Território conquistado! +${r.pts} pts`:`📍 Check-in registrado! (${fmtDist(r.dist)})`,'ok')
  }

  const handleBattle = async pt => {
    await addDoc(collection(db,'battles'), { conquest_point_id:pt.id, attacker_id:user.uid, attacker_name:user.display_name, defender_id:pt.owner_id, defender_name:pt.owner_name||'?', attacker_km:user.km_total||0, defender_km:pt.owner_km||0, status:'active', ends_at:new Date(Date.now()+86400000), created_at:serverTimestamp() })
    toast$(`⚔️ Batalha iniciada em ${pt.name}!`,'warn')
    setTab('battles')
  }

  const handleSavePoint = async form => {
    await addDoc(collection(db,'conquest_points'), { name:form.name, type:form.type, lat:newPt.lat, lng:newPt.lng, radius_m:parseInt(form.radius), base_points:form.type==='AREA'?300:100, owner_id:null, owner_km:0, created_by:user.uid, created_at:serverTimestamp() })
    setNewPt(null); toast$(`✅ "${form.name}" adicionado!`,'ok')
  }

  const nearby = geo.lat ? points.filter(p=>haversine(geo.lat,geo.lng,p.lat,p.lng)<2000) : []

  const tc = {ok:{bg:'#f0fdf4',bo:'#86efac',tx:'#166534'},err:{bg:'#fef2f2',bo:'#fca5a5',tx:'#991b1b'},warn:{bg:'#fffbeb',bo:'#fcd34d',tx:'#92400e'}}
  const t = tc[toast?.type]||tc.ok

  if (loading) return (
    <div style={{ minHeight:'100vh',background:'linear-gradient(135deg,#eef2ff,#f0fdf4)',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16 }}>
      <div style={{ width:64,height:64,background:'linear-gradient(135deg,#4f46e5,#7c3aed)',borderRadius:20,display:'flex',alignItems:'center',justifyContent:'center',fontSize:30 }}>⚔️</div>
      <div style={{ fontSize:14,color:'#64748b',fontWeight:600 }}>Carregando War Maps...</div>
    </div>
  )

  if (!user) return <Auth onAuth={setUser}/>

  const nav = [
    {id:'map',n:'map',l:'Mapa'},
    {id:'nearby',n:'pin',l:'Perto',b:nearby.length},
    {id:'battles',n:'sword',l:'Batalhas',b:battles.length},
    {id:'ranking',n:'trophy',l:'Ranking'},
    {id:'profile',n:'user',l:'Perfil'},
  ]

  return (
    <div style={{ display:'flex',height:'100vh',background:'#f8fafc',overflow:'hidden' }}>
      {/* Sidebar */}
      <nav style={{ width:68,background:'#fff',borderRight:'1px solid #e2e8f0',display:'flex',flexDirection:'column',alignItems:'center',padding:'14px 0',flexShrink:0,zIndex:40,boxShadow:'2px 0 8px rgba(0,0,0,0.04)' }}>
        <div style={{ marginBottom:20,width:40,height:40,background:'linear-gradient(135deg,#4f46e5,#7c3aed)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20 }}>⚔️</div>
        <div style={{ flex:1,display:'flex',flexDirection:'column',gap:2,width:'100%',padding:'0 6px' }}>
          {nav.map(item=>(
            <button key={item.id} onClick={()=>setTab(item.id)} style={{ position:'relative',width:'100%',padding:'10px 0',borderRadius:10,border:'none',background:tab===item.id?'#eef2ff':'transparent',color:tab===item.id?'#4f46e5':'#94a3b8',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,transition:'all 0.2s' }}>
              <I n={item.n} s={20} c={tab===item.id?'#4f46e5':'#94a3b8'}/>
              <span style={{ fontSize:8,fontWeight:600 }}>{item.l}</span>
              {item.b>0&&<div style={{ position:'absolute',top:6,right:8,width:16,height:16,borderRadius:'50%',background:'#dc2626',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:900,color:'#fff' }}>{item.b}</div>}
            </button>
          ))}
        </div>
        <div style={{ marginBottom:10,textAlign:'center' }}>
          <div style={{ width:8,height:8,borderRadius:'50%',background:geo.lat?'#10b981':geo.loading?'#f59e0b':'#ef4444',margin:'0 auto 3px' }}/>
          <span style={{ fontSize:7,color:'#94a3b8',fontWeight:600 }}>GPS</span>
        </div>
        <div onClick={()=>setTab('profile')} style={{ width:40,height:40,borderRadius:'50%',background:user.avatar_color||'#4f46e5',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:17,color:'#fff',cursor:'pointer',border:'2px solid #e2e8f0' }}>
          {user.display_name?.charAt(0)||'?'}
        </div>
      </nav>

      {/* Content */}
      <div style={{ flex:1,position:'relative',overflow:'hidden' }}>

        {tab==='map'&&(
          <>
            {leafletReady ? (
              <LeafletMap points={points} geo={geo} profiles={profiles} selectedId={selected?.id} battles={battles} addMode={addMode} onSelect={setSelected} onMapClick={({lat,lng})=>setNewPt({lat,lng})}/>
            ) : (
              <div style={{ flex:1,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:'#94a3b8' }}>Carregando mapa...</div>
            )}
            <GeoBar geo={geo}/>
            {user.is_admin&&(
              <button onClick={()=>{setAddMode(!addMode);setNewPt(null)}} style={{ position:'absolute',top:16,left:16,background:addMode?'#4f46e5':'#fff',border:`2px solid ${addMode?'#4f46e5':'#e2e8f0'}`,borderRadius:12,color:addMode?'#fff':'#64748b',cursor:'pointer',padding:'9px 16px',display:'flex',alignItems:'center',gap:8,fontSize:12,fontWeight:700,boxShadow:'0 2px 8px rgba(0,0,0,0.1)',zIndex:1000 }}>
                <I n="plus" s={14} c={addMode?'#fff':'#64748b'}/>{addMode?'Clique no mapa...':'Adicionar Ponto'}
              </button>
            )}
            <Panel point={selected} geo={geo} user={user} battles={battles} profiles={profiles} onBattle={handleBattle} onCheckin={handleCheckin} onClose={()=>setSelected(null)}/>
          </>
        )}

        {newPt&&(
          <div style={{ position:'absolute',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2000 }}>
            <NewPointForm lat={newPt.lat} lng={newPt.lng} onSave={handleSavePoint} onCancel={()=>setNewPt(null)}/>
          </div>
        )}

        {tab==='nearby'&&(
          <div style={{ padding:24,overflowY:'auto',height:'100%',background:'#f8fafc' }}>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'#4f46e5',letterSpacing:2,marginBottom:4 }}>GEOLOCALIZAÇÃO</div>
              <div style={{ fontSize:22,fontWeight:900,color:'#0f172a' }}>Pontos Próximos</div>
              {geo.lat&&<div style={{ fontSize:12,color:'#64748b',marginTop:4 }}>±{Math.round(geo.acc||0)}m · {nearby.length} em 2km</div>}
            </div>
            {geo.loading&&<div style={{ color:'#d97706',background:'#fffbeb',padding:'12px 16px',borderRadius:10,fontSize:13 }}>⏳ Aguardando GPS...</div>}
            {geo.err&&<div style={{ color:'#dc2626',background:'#fef2f2',padding:'12px 16px',borderRadius:10,fontSize:13 }}>{geo.err}</div>}
            {[...nearby].map(p=>({...p,_d:haversine(geo.lat,geo.lng,p.lat,p.lng)})).sort((a,b)=>a._d-b._d).map(p=>{
              const w=p._d<=p.radius_m, op=profiles[p.owner_id], oc=op?.avatar_color||p.owner_color||'#4f46e5'
              return (
                <div key={p.id} onClick={()=>{setSelected(p);setTab('map')}} style={{ background:'#fff',border:`1px solid ${w?'#86efac':'#e2e8f0'}`,borderRadius:14,padding:16,marginBottom:12,cursor:'pointer',boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ display:'flex',justifyContent:'space-between',marginBottom:8 }}>
                    <div>
                      <span style={{ fontSize:10,fontWeight:700,color:typeColor[p.type]||'#64748b',background:typeBg[p.type]||'#f8fafc',padding:'2px 8px',borderRadius:20 }}>{typeLabel[p.type]||p.type}</span>
                      <div style={{ fontSize:15,fontWeight:700,color:'#0f172a',marginTop:6 }}>{p.name}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:16,fontWeight:900,color:w?'#059669':'#0f172a' }}>{fmtDist(p._d)}</div>
                      <div style={{ fontSize:10,color:'#94a3b8' }}>raio {fmtDist(p.radius_m)}</div>
                    </div>
                  </div>
                  <div style={{ height:3,background:'#f1f5f9',borderRadius:2,overflow:'hidden',marginBottom:8 }}>
                    <div style={{ height:'100%',width:`${Math.min(100,(p._d/p.radius_m)*100)}%`,background:w?'#059669':'#4f46e5' }}/>
                  </div>
                  <div style={{ display:'flex',justifyContent:'space-between',fontSize:11 }}>
                    {p.owner_id?<span style={{ color:'#64748b',display:'flex',alignItems:'center',gap:6 }}><div style={{ width:16,height:16,borderRadius:'50%',background:oc,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#fff',fontWeight:900 }}>{(op?.display_name||p.owner_name||'?').charAt(0)}</div>{op?.display_name||p.owner_name}</span>:<span style={{ color:'#94a3b8' }}>🏳️ Livre</span>}
                    {w&&<span style={{ color:'#059669',fontWeight:700 }}>✓ DENTRO DO RAIO</span>}
                  </div>
                </div>
              )
            })}
            {!geo.loading&&!geo.err&&nearby.length===0&&<div style={{ color:'#94a3b8',fontSize:13,textAlign:'center',marginTop:40 }}>Nenhum ponto em 2km.</div>}
          </div>
        )}

        {tab==='battles'&&(
          <div style={{ padding:24,overflowY:'auto',height:'100%',background:'#f8fafc' }}>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'#dc2626',letterSpacing:2,marginBottom:4 }}>CONFLITOS</div>
              <div style={{ fontSize:22,fontWeight:900,color:'#0f172a' }}>Batalhas Ativas</div>
            </div>
            {battles.length===0&&<div style={{ color:'#94a3b8',fontSize:13,textAlign:'center',marginTop:40 }}>Nenhuma batalha em andamento.</div>}
            {battles.map(b=>{
              const pt=points.find(p=>p.id===b.conquest_point_id)
              const att=profiles[b.attacker_id], def=profiles[b.defender_id]
              const tl=Math.max(0,(b.ends_at?.toDate?.()?.getTime()||b.ends_at)-Date.now())
              const attW=b.attacker_km>b.defender_km
              const ac=att?.avatar_color||'#4f46e5', dc=def?.avatar_color||'#d97706'
              return (
                <div key={b.id} style={{ background:'#fff',border:'1px solid #fecaca',borderRadius:16,padding:18,marginBottom:14,boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
                  <div style={{ display:'flex',justifyContent:'space-between',marginBottom:14 }}>
                    <div><div style={{ fontSize:11,fontWeight:700,color:'#dc2626',marginBottom:4 }}>⚔️ BATALHA</div><div style={{ fontSize:16,fontWeight:900,color:'#0f172a' }}>{pt?.name||'?'}</div></div>
                    <div style={{ background:'#fffbeb',padding:'8px 12px',borderRadius:10,textAlign:'right' }}><div style={{ fontSize:10,color:'#94a3b8',fontWeight:600 }}>TERMINA EM</div><div style={{ fontSize:14,fontWeight:700,color:'#d97706' }}>{fmtTime(tl)}</div></div>
                  </div>
                  <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:12 }}>
                    {[{u:att,name:b.attacker_name,km:b.attacker_km,c:ac},{u:def,name:b.defender_name,km:b.defender_km,c:dc}].map((x,i)=>(
                      <div key={i} style={{ flex:1,textAlign:'center' }}>
                        <div style={{ width:44,height:44,borderRadius:'50%',background:x.c,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,color:'#fff',fontSize:20,margin:'0 auto 6px' }}>{(x.u?.display_name||x.name||'?').charAt(0)}</div>
                        <div style={{ fontSize:12,color:'#0f172a',fontWeight:600 }}>{x.u?.display_name||x.name}</div>
                        <div style={{ fontSize:16,fontWeight:900,color:x.c }}>{x.km}km</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ height:8,background:'#f1f5f9',borderRadius:4,overflow:'hidden',display:'flex',marginBottom:12 }}>
                    <div style={{ width:`${(b.attacker_km/(b.attacker_km+b.defender_km+0.01))*100}%`,background:ac }}/><div style={{ flex:1,background:dc }}/>
                  </div>
                  <div style={{ padding:'10px 14px',borderRadius:10,background:attW?'#fef2f2':'#f0fdf4',display:'flex',alignItems:'center',gap:8 }}>
                    <I n={attW?'sword':'shield'} s={14} c={attW?'#dc2626':'#059669'}/>
                    <span style={{ fontSize:12,color:attW?'#dc2626':'#059669',fontWeight:700 }}>{attW?`${att?.display_name||b.attacker_name} está vencendo`:`${def?.display_name||b.defender_name} está defendendo`}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab==='ranking'&&(
          <div style={{ padding:24,overflowY:'auto',height:'100%',background:'#f8fafc' }}>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'#4f46e5',letterSpacing:2,marginBottom:4 }}>CLASSIFICAÇÃO</div>
              <div style={{ fontSize:22,fontWeight:900,color:'#0f172a' }}>Ranking Global</div>
            </div>
            {Object.entries(profiles).sort((a,b)=>(b[1].points||0)-(a[1].points||0)).map(([id,u],i)=>(
              <div key={id} style={{ background:id===user?.uid?'#eef2ff':'#fff',border:`1px solid ${id===user?.uid?'#c7d2fe':'#e2e8f0'}`,borderRadius:14,padding:'14px 16px',display:'flex',alignItems:'center',gap:14,marginBottom:10,boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ width:30,fontSize:i<3?22:14,textAlign:'center',fontWeight:900 }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</div>
                <div style={{ width:44,height:44,borderRadius:'50%',background:u.avatar_color||'#4f46e5',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:19,color:'#fff' }}>{u.display_name?.charAt(0)||'?'}</div>
                <div style={{ flex:1 }}><div style={{ fontSize:14,fontWeight:700,color:'#0f172a' }}>{u.display_name}</div><div style={{ fontSize:11,color:'#64748b' }}>{u.km_total||0} km · {points.filter(p=>p.owner_id===id).length} territórios</div></div>
                <div style={{ textAlign:'right' }}><div style={{ fontSize:20,fontWeight:900,color:'#4f46e5' }}>{u.points||0}</div><div style={{ fontSize:10,color:'#94a3b8',fontWeight:600 }}>pts</div></div>
              </div>
            ))}
            {Object.keys(profiles).length===0&&<div style={{ color:'#94a3b8',fontSize:13,textAlign:'center',marginTop:40 }}>Nenhum jogador ainda.</div>}
          </div>
        )}

        {tab==='profile'&&(
          <div style={{ padding:24,overflowY:'auto',height:'100%',background:'#f8fafc' }}>
            <div style={{ height:90,background:`linear-gradient(135deg,${user.avatar_color||'#4f46e5'},${user.avatar_color||'#7c3aed'})`,borderRadius:16,marginBottom:-30,position:'relative',overflow:'hidden' }}>
              <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:60,opacity:0.15 }}>⚔️</div>
            </div>
            <div style={{ padding:'0 4px',marginBottom:20 }}>
              <div style={{ width:72,height:72,borderRadius:'50%',background:user.avatar_color||'#4f46e5',border:'4px solid #f8fafc',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:30,color:'#fff',boxShadow:'0 4px 12px rgba(0,0,0,0.15)' }}>{user.display_name?.charAt(0)||'?'}</div>
              <div style={{ marginTop:10 }}>
                <div style={{ fontSize:22,fontWeight:900,color:'#0f172a' }}>{user.display_name}</div>
                <div style={{ fontSize:13,color:'#64748b' }}>{user.username||''}</div>
                {user.is_admin&&<span style={{ fontSize:10,fontWeight:700,color:'#4f46e5',background:'#eef2ff',padding:'3px 10px',borderRadius:20,marginTop:6,display:'inline-block' }}>ADM</span>}
              </div>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:20 }}>
              {[['🏃',`${user.km_total||0}km`,'KMs'],['⚑',points.filter(p=>p.owner_id===user.uid).length,'Territórios'],['⭐',user.points||0,'Pontos']].map(([ic,v,l])=>(
                <div key={l} style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:'16px 10px',textAlign:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ fontSize:22,marginBottom:4 }}>{ic}</div>
                  <div style={{ fontSize:20,fontWeight:900,color:'#4f46e5' }}>{v}</div>
                  <div style={{ fontSize:10,color:'#94a3b8',fontWeight:600 }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{ background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:18,fontSize:12,color:'#64748b',lineHeight:1.8 }}>
              <div style={{ fontSize:13,fontWeight:700,color:'#4f46e5',marginBottom:8 }}>ℹ️ Seu UID (para virar ADM)</div>
              <div style={{ fontSize:11,background:'#f8fafc',padding:'8px 12px',borderRadius:8,wordBreak:'break-all',color:'#0f172a' }}>{user.uid}</div>
            </div>
          </div>
        )}

        {toast&&(
          <div style={{ position:'absolute',bottom:20,left:'50%',transform:'translateX(-50%)',background:t.bg,border:`1px solid ${t.bo}`,borderRadius:12,padding:'12px 20px',zIndex:2000,fontSize:13,fontWeight:600,color:t.tx,boxShadow:'0 8px 32px rgba(0,0,0,0.12)',whiteSpace:'nowrap',animation:'su 0.3s ease' }}>
            {toast.msg}
          </div>
        )}
      </div>
      <style>{`@keyframes su{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:2px}input,select{color-scheme:light}`}</style>
    </div>
  )
}
