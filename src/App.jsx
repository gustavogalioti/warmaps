import { useState, useEffect, useRef, useCallback } from 'react'
import {
  auth, db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  onSnapshot, query, where, serverTimestamp,
} from './firebase.js'

// ============================================================
// DEMO DATA (usado antes de criar pontos no Firebase)
// ============================================================
const DEMO_POINTS = [
  { id:'p1', name:'Centro',       type:'BAIRRO',     lat:-23.550, lng:-46.633, radius_m:400, base_points:100, owner_id:null, owner_km:0 },
  { id:'p2', name:'Vila Mariana', type:'BAIRRO',     lat:-23.588, lng:-46.630, radius_m:350, base_points:100, owner_id:null, owner_km:0 },
  { id:'p3', name:'Liberdade',    type:'QUARTEIRÃO', lat:-23.558, lng:-46.637, radius_m:250, base_points:100, owner_id:null, owner_km:0 },
  { id:'p4', name:'Pinheiros',    type:'BAIRRO',     lat:-23.566, lng:-46.680, radius_m:350, base_points:100, owner_id:null, owner_km:0 },
]

// ============================================================
// HELPERS
// ============================================================
const haversine = (lat1,lng1,lat2,lng2) => {
  const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
}
const hex2rgba=(hex,a)=>{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgba(${r},${g},${b},${a})`}
const fmtDist=(m)=>m<1000?`${Math.round(m)}m`:`${(m/1000).toFixed(1)}km`
const fmtTime=(ms)=>{const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);return `${h}h ${m}m`}
const typeColor={QUARTEIRÃO:'#6366f1',BAIRRO:'#f59e0b',ÁREA:'#10b981',CIDADE:'#ef4444'}
const AVATAR_COLORS=['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#f43f5e']
const randomColor=()=>AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)]

const latLngToCanvas=(lat,lng,cLat,cLng,zoom,W,H)=>({
  x: W/2+(lng-cLng)*zoom*(W/0.08),
  y: H/2-(lat-cLat)*zoom*(W/0.08)*1.3,
})
const metersToPixels=(m,zoom,lat,W)=>(m/(111320*Math.cos(lat*Math.PI/180)))*zoom*(W/0.08)

// ============================================================
// ICONS
// ============================================================
const Icon=({name,size=18,color='currentColor'})=>{
  const p={
    map:<><circle cx="12"cy="12"r="10"/><line x1="2"y1="12"x2="22"y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
    trophy:<><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/><path d="M8.21 13.89A5 5 0 0 1 7 10V5h10v5a5 5 0 0 1-1.21 3.89"/><line x1="3"y1="5"x2="7"y2="5"/><line x1="21"y1="5"x2="17"y2="5"/></>,
    users:<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9"cy="7"r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    user:<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12"cy="7"r="4"/></>,
    forum:<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>,
    sword:<><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13"y1="19"x2="19"y2="13"/><line x1="16"y1="16"x2="20"y2="20"/><line x1="19"y1="21"x2="21"y2="19"/></>,
    shield:<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    flag:<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4"y1="22"x2="4"y2="15"/></>,
    plus:<><line x1="12"y1="5"x2="12"y2="19"/><line x1="5"y1="12"x2="19"y2="12"/></>,
    check:<><polyline points="20 6 9 17 4 12"/></>,
    x:<><line x1="18"y1="6"x2="6"y2="18"/><line x1="6"y1="6"x2="18"y2="18"/></>,
    edit:<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    mapPin:<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12"cy="10"r="3"/></>,
    locate:<><circle cx="12"cy="12"r="3"/><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/></>,
    navigation:<><polygon points="3 11 22 2 13 21 11 13 3 11"/></>,
    loader:<><line x1="12"y1="2"x2="12"y2="6"/><line x1="12"y1="18"x2="12"y2="22"/><line x1="4.93"y1="4.93"x2="7.76"y2="7.76"/><line x1="16.24"y1="16.24"x2="19.07"y2="19.07"/><line x1="2"y1="12"x2="6"y2="12"/><line x1="18"y1="12"x2="22"y2="12"/><line x1="4.93"y1="19.07"x2="7.76"y2="16.24"/><line x1="16.24"y1="7.76"x2="19.07"y2="4.93"/></>,
    alertTriangle:<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12"y1="9"x2="12"y2="13"/><line x1="12"y1="17"x2="12.01"y2="17"/></>,
    wifi:<><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12"y1="20"x2="12.01"y2="20"/></>,
    bell:<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    zap:<><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p[name]||null}</svg>
}

// ============================================================
// GEOLOCATION HOOK
// ============================================================
const useGeo=()=>{
  const[state,setState]=useState({lat:null,lng:null,accuracy:null,error:null,loading:true})
  const watchRef=useRef(null)
  useEffect(()=>{
    if(!navigator.geolocation){setState(s=>({...s,error:'GPS não suportado.',loading:false}));return}
    const ok=(pos)=>setState({lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy,error:null,loading:false})
    const fail=(err)=>setState(s=>({...s,error:err.code===1?'Permissão de localização negada.':'Não foi possível obter localização.',loading:false}))
    const opts={enableHighAccuracy:true,timeout:12000,maximumAge:4000}
    navigator.geolocation.getCurrentPosition(ok,fail,opts)
    watchRef.current=navigator.geolocation.watchPosition(ok,fail,opts)
    return()=>navigator.geolocation.clearWatch(watchRef.current)
  },[])
  return state
}

// ============================================================
// MAP CANVAS
// ============================================================
const MapCanvas=({points,userGeo,center,zoom,selectedId,battles,addMode,profiles,onSelect,onMapClick})=>{
  const canvasRef=useRef(null)
  const[pulse,setPulse]=useState(0)
  useEffect(()=>{const t=setInterval(()=>setPulse(p=>(p+1)%120),40);return()=>clearInterval(t)},[])

  const draw=useCallback(()=>{
    const canvas=canvasRef.current;if(!canvas)return
    const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height
    ctx.fillStyle='#070c1a';ctx.fillRect(0,0,W,H)
    ctx.strokeStyle='rgba(99,102,241,0.07)';ctx.lineWidth=1
    for(let x=0;x<W;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
    for(let y=0;y<H;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
    const sy=((pulse/120)*H*2)%(H+80)-40
    const sg=ctx.createLinearGradient(0,sy,0,sy+80)
    sg.addColorStop(0,'rgba(99,102,241,0)');sg.addColorStop(0.5,'rgba(99,102,241,0.03)');sg.addColorStop(1,'rgba(99,102,241,0)')
    ctx.fillStyle=sg;ctx.fillRect(0,sy,W,80)

    points.forEach(pt=>{
      const{x,y}=latLngToCanvas(pt.lat,pt.lng,center.lat,center.lng,zoom,W,H)
      const r=metersToPixels(pt.radius_m,zoom,pt.lat,W)
      const ownerProfile=pt.owner_id?profiles[pt.owner_id]:null
      const color=ownerProfile?.avatar_color||pt.owner_color||(pt.owner_id?'#6366f1':'#334155')
      const isSel=selectedId===pt.id
      const inBattle=battles.some(b=>b.conquest_point_id===pt.id)

      if(pt.owner_id){
        const gw=ctx.createRadialGradient(x,y,0,x,y,r*2.2)
        gw.addColorStop(0,hex2rgba(color,0.14));gw.addColorStop(1,'transparent')
        ctx.fillStyle=gw;ctx.beginPath();ctx.arc(x,y,r*2.2,0,Math.PI*2);ctx.fill()
      }
      const cg=ctx.createRadialGradient(x-r*0.25,y-r*0.25,0,x,y,r)
      cg.addColorStop(0,hex2rgba(color,pt.owner_id?0.42:0.12))
      cg.addColorStop(1,hex2rgba(color,pt.owner_id?0.18:0.04))
      ctx.fillStyle=cg;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()

      const bp=Math.sin(pulse*0.15)
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2)
      if(inBattle){ctx.strokeStyle=`rgba(239,68,68,${0.6+bp*0.4})`;ctx.lineWidth=2+bp*1.5;ctx.setLineDash([8,4])}
      else{ctx.strokeStyle=isSel?'#fff':hex2rgba(color,0.85);ctx.lineWidth=isSel?3:1.5;ctx.setLineDash([])}
      ctx.stroke();ctx.setLineDash([])

      const fs=Math.max(9,Math.min(13,r*0.28))
      ctx.fillStyle=typeColor[pt.type]||'#6b7280';ctx.font=`bold ${fs}px monospace`;ctx.textAlign='center'
      ctx.fillText(pt.type,x,y-r*0.42)
      ctx.fillStyle=pt.owner_id?'#e2e8f0':'#64748b';ctx.font=`bold ${Math.max(10,Math.min(14,r*0.34))}px Courier New`;ctx.textAlign='center'
      ctx.fillText(pt.name,x,y+r*0.12)
      if(pt.owner_id){
        const name=ownerProfile?.display_name||pt.owner_name||'?'
        ctx.fillStyle=color;ctx.font=`bold ${Math.max(12,r*0.38)}px monospace`
        ctx.fillText(name.charAt(0),x,y+r*0.72)
      }
      if(inBattle){ctx.font=`${Math.max(14,r*0.4)}px monospace`;ctx.fillText('⚔',x,y-r-10)}
    })

    if(userGeo.lat){
      const{x,y}=latLngToCanvas(userGeo.lat,userGeo.lng,center.lat,center.lng,zoom,W,H)
      if(userGeo.accuracy){
        const ar=Math.min(metersToPixels(userGeo.accuracy,zoom,userGeo.lat,W),150)
        ctx.beginPath();ctx.arc(x,y,ar,0,Math.PI*2)
        ctx.fillStyle='rgba(99,102,241,0.06)';ctx.strokeStyle='rgba(99,102,241,0.18)';ctx.lineWidth=1
        ctx.fill();ctx.stroke()
      }
      const pr=14+Math.abs(Math.sin(pulse*0.1))*10
      ctx.beginPath();ctx.arc(x,y,pr,0,Math.PI*2);ctx.fillStyle='rgba(99,102,241,0.14)';ctx.fill()
      ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fillStyle='#6366f1';ctx.fill()
      ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill()
    }
  },[points,userGeo,center,zoom,selectedId,battles,profiles,pulse])

  useEffect(()=>{draw()},[draw])

  const handleClick=(e)=>{
    const canvas=canvasRef.current,rect=canvas.getBoundingClientRect()
    const cx=(e.clientX-rect.left)*(canvas.width/rect.width)
    const cy=(e.clientY-rect.top)*(canvas.height/rect.height)
    const W=canvas.width,H=canvas.height
    if(addMode){onMapClick({x:cx,y:cy,W,H});return}
    for(const pt of points){
      const{x,y}=latLngToCanvas(pt.lat,pt.lng,center.lat,center.lng,zoom,W,H)
      const r=metersToPixels(pt.radius_m,zoom,pt.lat,W)
      if(Math.sqrt((cx-x)**2+(cy-y)**2)<r){onSelect(pt);return}
    }
    onSelect(null)
  }

  return(
    <canvas ref={canvasRef} width={900} height={600}
      style={{width:'100%',height:'100%',cursor:addMode?'crosshair':'pointer'}}
      onClick={handleClick}
    />
  )
}

// ============================================================
// CHECKIN BUTTON
// ============================================================
const CheckinBtn=({point,userGeo,user,onResult})=>{
  const[loading,setLoading]=useState(false)
  const[done,setDone]=useState(false)
  if(!point)return null
  const dist=userGeo.lat?haversine(userGeo.lat,userGeo.lng,point.lat,point.lng):null
  const within=dist!==null&&dist<=point.radius_m

  const doCheckin=async()=>{
    if(!within||loading||done)return
    setLoading(true)
    try{
      await addDoc(collection(db,'checkins'),{
        user_id:user.uid,point_id:point.id,
        lat:userGeo.lat,lng:userGeo.lng,
        dist_m:dist,created_at:serverTimestamp()
      })
      if(!point.owner_id){
        await updateDoc(doc(db,'conquest_points',point.id),{
          owner_id:user.uid,owner_name:user.display_name,
          owner_color:user.avatar_color,owner_km:user.km_total||0,
          conquered_at:serverTimestamp()
        })
        await updateDoc(doc(db,'profiles',user.uid),{points:(user.points||0)+100})
        onResult({ok:true,action:'conquered',dist,pts:100})
      }else{
        onResult({ok:true,action:'checkin',dist,pts:0})
      }
      setDone(true);setTimeout(()=>setDone(false),60000)
    }catch(err){onResult({ok:false,error:err.message})}
    setLoading(false)
  }

  const c=within?'#10b981':'#64748b'
  return(
    <div style={{padding:'0 20px',marginBottom:14}}>
      {dist!==null&&(
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <Icon name="mapPin" size={13} color={within?'#10b981':'#ef4444'}/>
            <span style={{fontSize:11,color:within?'#10b981':'#ef4444',fontFamily:'monospace'}}>{fmtDist(dist)} de distância</span>
          </div>
          <span style={{fontSize:10,color:'#475569'}}>raio {fmtDist(point.radius_m)}</span>
        </div>
      )}
      {dist!==null&&(
        <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,marginBottom:10,overflow:'hidden'}}>
          <div style={{height:'100%',width:`${Math.min(100,(dist/point.radius_m)*100)}%`,background:within?'#10b981':'#ef4444',transition:'width 0.4s'}}/>
        </div>
      )}
      <button onClick={doCheckin} disabled={!within||loading||done} style={{
        width:'100%',padding:'12px',borderRadius:12,border:`1px solid ${hex2rgba(c,0.4)}`,
        background:hex2rgba(c,within?0.14:0.04),color:within?c:'#475569',
        cursor:within&&!loading&&!done?'pointer':'not-allowed',
        display:'flex',alignItems:'center',justifyContent:'center',gap:8,
        fontSize:13,fontWeight:700,fontFamily:'monospace',transition:'all 0.2s',
      }}>
        {loading?<><Icon name="loader" size={14} color={c}/><span>Registrando...</span></>
        :done?<><Icon name="check" size={14}/><span>Check-in feito ✓</span></>
        :within?<><Icon name="mapPin" size={14}/><span>Fazer Check-in</span></>
        :<><Icon name="navigation" size={14}/><span>Muito longe</span></>}
      </button>
      {!within&&dist!==null&&(
        <p style={{fontSize:10,color:'#475569',textAlign:'center',marginTop:6,fontFamily:'monospace'}}>
          Chegue {fmtDist(Math.max(0,dist-point.radius_m))} mais perto
        </p>
      )}
    </div>
  )
}

// ============================================================
// TERRITORY PANEL
// ============================================================
const TerritoryPanel=({point,userGeo,user,battles,profiles,onBattle,onCheckinResult,onClose})=>{
  if(!point)return null
  const ownerProfile=point.owner_id?profiles[point.owner_id]:null
  const ownerName=ownerProfile?.display_name||point.owner_name||'?'
  const color=ownerProfile?.avatar_color||point.owner_color||(point.owner_id?'#6366f1':'#475569')
  const battle=battles.find(b=>b.conquest_point_id===point.id&&b.status==='active')
  const isOwner=user&&point.owner_id===user.uid
  return(
    <div style={{position:'absolute',top:0,right:0,width:300,height:'100%',background:'rgba(7,12,26,0.97)',borderLeft:`2px solid ${color}`,display:'flex',flexDirection:'column',zIndex:20,backdropFilter:'blur(16px)',overflowY:'auto'}}>
      <div style={{padding:'20px 20px 14px',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
        <div style={{display:'flex',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:10,fontFamily:'monospace',color:typeColor[point.type]||'#6b7280',letterSpacing:2,marginBottom:4}}>{point.type}</div>
            <div style={{fontSize:20,fontWeight:900,color:'#f1f5f9'}}>{point.name}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#64748b',cursor:'pointer'}}><Icon name="x" size={18}/></button>
        </div>
        <div style={{marginTop:14,display:'flex',alignItems:'center',gap:10}}>
          {point.owner_id?(
            <>
              <div style={{width:38,height:38,borderRadius:'50%',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:17,color:'#0a0f1e'}}>{ownerName.charAt(0)}</div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:'#e2e8f0'}}>{ownerName}</div>
                <div style={{fontSize:11,color:'#64748b'}}>{point.owner_km?.toFixed(0)||0} km acumulados</div>
              </div>
            </>
          ):(
            <div style={{display:'flex',alignItems:'center',gap:8,color:'#64748b'}}>
              <Icon name="flag" size={18}/><span style={{fontSize:13}}>Território livre — conquiste!</span>
            </div>
          )}
        </div>
      </div>
      {battle&&(
        <div style={{margin:'14px 20px 0',background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:10,padding:14}}>
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
            <Icon name="sword" size={14} color="#ef4444"/>
            <span style={{fontSize:12,fontFamily:'monospace',color:'#ef4444',fontWeight:700}}>BATALHA ATIVA</span>
          </div>
          <div style={{fontSize:12,color:'#94a3b8'}}>Termina em {fmtTime(Math.max(0,(battle.ends_at?.toDate?.()?.getTime()||battle.ends_at)-Date.now()))}</div>
        </div>
      )}
      <div style={{padding:'14px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {[['Pontos',point.base_points],['Raio',fmtDist(point.radius_m)]].map(([l,v])=>(
          <div key={l} style={{background:'rgba(99,102,241,0.07)',border:'1px solid rgba(99,102,241,0.14)',borderRadius:10,padding:'10px 12px'}}>
            <div style={{fontSize:10,fontFamily:'monospace',color:'#64748b',marginBottom:2}}>{l}</div>
            <div style={{fontSize:18,fontWeight:900,color:'#6366f1'}}>{v}</div>
          </div>
        ))}
      </div>
      <CheckinBtn point={point} userGeo={userGeo} user={user} onResult={onCheckinResult}/>
      {!isOwner&&point.owner_id&&!battle&&(
        <div style={{padding:'0 20px',marginBottom:14}}>
          <button onClick={()=>onBattle(point)} style={{width:'100%',padding:'11px',borderRadius:12,background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.35)',color:'#ef4444',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:13,fontWeight:700,fontFamily:'monospace'}}>
            <Icon name="sword" size={14}/><span>Iniciar batalha</span>
          </button>
        </div>
      )}
      {isOwner&&battle&&(
        <div style={{padding:'0 20px',marginBottom:14}}>
          <button style={{width:'100%',padding:'11px',borderRadius:12,background:'rgba(245,158,11,0.12)',border:'1px solid rgba(245,158,11,0.35)',color:'#f59e0b',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:13,fontWeight:700,fontFamily:'monospace'}}>
            <Icon name="shield" size={14}/><span>Chamar reforços</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// AUTH SCREEN
// ============================================================
const AuthScreen=({onAuth})=>{
  const[mode,setMode]=useState('login')
  const[email,setEmail]=useState('')
  const[password,setPassword]=useState('')
  const[name,setName]=useState('')
  const[loading,setLoading]=useState(false)
  const[error,setError]=useState('')
  const inp={width:'100%',padding:'12px 14px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(99,102,241,0.25)',borderRadius:10,color:'#e2e8f0',fontSize:14,outline:'none',fontFamily:'monospace'}

  const submit=async()=>{
    setLoading(true);setError('')
    try{
      if(mode==='signup'){
        const color=randomColor()
        const cred=await createUserWithEmailAndPassword(auth,email,password)
        const username=`@${name.toLowerCase().replace(/\s+/g,'')}`
        await setDoc(doc(db,'profiles',cred.user.uid),{
          uid:cred.user.uid,display_name:name,username,
          avatar_color:color,km_total:0,points:0,is_admin:false,
          created_at:serverTimestamp()
        })
        onAuth({uid:cred.user.uid,display_name:name,username,avatar_color:color,km_total:0,points:0,is_admin:false})
      }else{
        const cred=await signInWithEmailAndPassword(auth,email,password)
        const snap=await getDoc(doc(db,'profiles',cred.user.uid))
        onAuth(snap.exists()?{uid:cred.user.uid,...snap.data()}:{uid:cred.user.uid,display_name:email.split('@')[0],avatar_color:'#6366f1',km_total:0,points:0,is_admin:false})
      }
    }catch(e){
      const msgs={'auth/email-already-in-use':'Email já cadastrado.','auth/wrong-password':'Senha incorreta.','auth/user-not-found':'Usuário não encontrado.','auth/weak-password':'Senha fraca (mínimo 6 caracteres).','auth/invalid-email':'Email inválido.'}
      setError(msgs[e.code]||e.message)
    }
    setLoading(false)
  }

  return(
    <div style={{minHeight:'100vh',background:'#070c1a',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',padding:16}}>
      <div style={{width:'100%',maxWidth:360,background:'rgba(10,15,30,0.95)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:20,padding:32}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{fontSize:44,marginBottom:8}}>⚔</div>
          <div style={{fontSize:26,fontWeight:900,color:'#f1f5f9',letterSpacing:-1}}>DOMINUS</div>
          <div style={{fontSize:10,color:'#6366f1',letterSpacing:4,marginTop:4}}>CONQUISTE SEU TERRITÓRIO</div>
        </div>
        <div style={{display:'flex',gap:8,marginBottom:20}}>
          {['login','signup'].map(m=>(
            <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:'9px',borderRadius:10,border:'none',cursor:'pointer',background:mode===m?'#6366f1':'rgba(99,102,241,0.1)',color:mode===m?'#fff':'#64748b',fontSize:12,fontWeight:700}}>
              {m==='login'?'Entrar':'Criar conta'}
            </button>
          ))}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {mode==='signup'&&<input style={inp} placeholder="Seu nome" value={name} onChange={e=>setName(e.target.value)}/>}
          <input style={inp} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/>
          <input style={inp} type="password" placeholder="Senha" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/>
        </div>
        {error&&<div style={{fontSize:12,color:'#ef4444',marginTop:10,textAlign:'center'}}>{error}</div>}
        <button onClick={submit} disabled={loading} style={{width:'100%',marginTop:18,padding:'13px',borderRadius:12,border:'none',background:loading?'rgba(99,102,241,0.4)':'#6366f1',color:'#fff',fontSize:14,fontWeight:900,cursor:loading?'wait':'pointer',letterSpacing:1}}>
          {loading?'Aguarde...':mode==='login'?'ENTRAR':'CRIAR CONTA'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// ADMIN NEW POINT FORM
// ============================================================
const NewPointForm=({lat,lng,onSave,onCancel})=>{
  const[name,setName]=useState('')
  const[type,setType]=useState('BAIRRO')
  const[radius,setRadius]=useState('300')
  const inp={width:'100%',padding:'11px 14px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(99,102,241,0.25)',borderRadius:10,color:'#e2e8f0',fontSize:13,outline:'none',fontFamily:'monospace',marginBottom:10}
  return(
    <div style={{background:'rgba(10,15,30,0.98)',border:'1px solid rgba(99,102,241,0.3)',borderRadius:18,padding:28,width:320,fontFamily:'monospace'}}>
      <div style={{fontSize:10,color:'#6366f1',letterSpacing:2,marginBottom:4}}>NOVO PONTO ADM</div>
      <div style={{fontSize:16,fontWeight:900,color:'#f1f5f9',marginBottom:16}}>Configurar Ponto</div>
      <div style={{fontSize:11,color:'#64748b',marginBottom:14}}>📍 {lat?.toFixed(5)}, {lng?.toFixed(5)}</div>
      <input style={inp} placeholder="Nome (ex: Praça da Sé)" value={name} onChange={e=>setName(e.target.value)}/>
      <select style={{...inp,cursor:'pointer'}} value={type} onChange={e=>setType(e.target.value)}>
        {['QUARTEIRÃO','BAIRRO','ÁREA','CIDADE'].map(t=><option key={t} value={t}>{t}</option>)}
      </select>
      <div style={{marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#64748b',marginBottom:6}}>
          <span>Raio de conquista</span>
          <span style={{color:'#6366f1',fontWeight:700}}>{fmtDist(parseInt(radius)||0)}</span>
        </div>
        <input type="range" min="50" max="2000" step="50" value={radius} onChange={e=>setRadius(e.target.value)} style={{width:'100%',accentColor:'#6366f1'}}/>
      </div>
      <div style={{display:'flex',gap:10}}>
        <button onClick={onCancel} style={{flex:1,padding:'11px',borderRadius:10,background:'transparent',border:'1px solid rgba(255,255,255,0.1)',color:'#64748b',cursor:'pointer',fontSize:13,fontWeight:700}}>Cancelar</button>
        <button onClick={()=>name.trim()&&onSave({name,type,radius})} disabled={!name.trim()} style={{flex:1,padding:'11px',borderRadius:10,background:name.trim()?'#6366f1':'rgba(99,102,241,0.3)',border:'none',color:'#fff',cursor:name.trim()?'pointer':'not-allowed',fontSize:13,fontWeight:900}}>
          Salvar
        </button>
      </div>
    </div>
  )
}

// ============================================================
// GEO STATUS BAR
// ============================================================
const GeoBar=({geo})=>{
  const[c,label]=geo.loading?['#f59e0b','Obtendo GPS...']:geo.error?['#ef4444',geo.error]:['#10b981',`GPS ativo · ±${Math.round(geo.accuracy||0)}m`]
  return(
    <div style={{position:'absolute',bottom:16,left:'50%',transform:'translateX(-50%)',background:'rgba(7,12,26,0.94)',border:`1px solid ${hex2rgba(c,0.4)}`,borderRadius:20,padding:'7px 16px',display:'flex',alignItems:'center',gap:8,fontSize:11,fontFamily:'monospace',color:c,zIndex:10,whiteSpace:'nowrap',boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
      <Icon name={geo.loading?'loader':geo.error?'alertTriangle':'wifi'} size={13} color={c}/>
      {label}
    </div>
  )
}

// ============================================================
// MAIN APP
// ============================================================
export default function App(){
  const[user,setUser]=useState(null)
  const[authLoading,setAuthLoading]=useState(true)
  const[tab,setTab]=useState('map')
  const[points,setPoints]=useState(DEMO_POINTS)
  const[battles,setBattles]=useState([])
  const[profiles,setProfiles]=useState({})
  const[selected,setSelected]=useState(null)
  const[center,setCenter]=useState({lat:-23.575,lng:-46.650})
  const[zoom,setZoom]=useState(1.0)
  const[addMode,setAddMode]=useState(false)
  const[newPtPos,setNewPtPos]=useState(null)
  const[toast,setToast]=useState(null)
  const geo=useGeo()

  // Auth state listener
  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,async(firebaseUser)=>{
      if(firebaseUser){
        const snap=await getDoc(doc(db,'profiles',firebaseUser.uid))
        setUser(snap.exists()?{uid:firebaseUser.uid,...snap.data()}:{uid:firebaseUser.uid,display_name:firebaseUser.email?.split('@')[0],avatar_color:'#6366f1',km_total:0,points:0,is_admin:false})
      }else{
        setUser(null)
      }
      setAuthLoading(false)
    })
    return unsub
  },[])

  // Center on GPS
  useEffect(()=>{if(geo.lat&&!geo.error)setCenter({lat:geo.lat,lng:geo.lng})},[geo.lat])

  // Realtime listeners
  useEffect(()=>{
    if(!user)return
    const unsubPts=onSnapshot(collection(db,'conquest_points'),snap=>{
      const pts=snap.docs.map(d=>({id:d.id,...d.data()}))
      setPoints(pts.length>0?pts:DEMO_POINTS)
    })
    const unsubBattles=onSnapshot(query(collection(db,'battles'),where('status','==','active')),snap=>{
      setBattles(snap.docs.map(d=>({id:d.id,...d.data()})))
    })
    getDocs(collection(db,'profiles')).then(snap=>{
      const map={};snap.docs.forEach(d=>{map[d.id]=d.data()});setProfiles(map)
    })
    return()=>{unsubPts();unsubBattles()}
  },[user])

  const showToast=(msg,type='ok')=>{setToast({msg,type});setTimeout(()=>setToast(null),4000)}

  const handleCheckinResult=(r)=>{
    if(!r.ok){showToast(`❌ ${r.error}`,'err');return}
    if(r.action==='conquered'){
      showToast(`🏆 Território conquistado! +${r.pts} pts`,'ok')
    }else{
      showToast(`📍 Check-in registrado! (${fmtDist(r.dist)})`,'ok')
    }
  }

  const handleBattle=async(point)=>{
    await addDoc(collection(db,'battles'),{
      conquest_point_id:point.id,
      attacker_id:user.uid,attacker_name:user.display_name,
      defender_id:point.owner_id,defender_name:point.owner_name||'?',
      attacker_km:user.km_total||0,defender_km:point.owner_km||0,
      status:'active',ends_at:new Date(Date.now()+86400000),
      created_at:serverTimestamp()
    })
    showToast(`⚔ Batalha iniciada em ${point.name}! 24h.`,'warn')
    setTab('battles')
  }

  const handleMapClick=({x,y,W,H})=>{
    const lng=center.lng+(x-W/2)/(zoom*(W/0.08))
    const lat=center.lat-(y-H/2)/(zoom*(W/0.08)*1.3)
    setNewPtPos({lat,lng});setAddMode(false)
  }

  const handleSavePoint=async(form)=>{
    const pts=form.type==='ÁREA'?300:100
    await addDoc(collection(db,'conquest_points'),{
      name:form.name,type:form.type,
      lat:newPtPos.lat,lng:newPtPos.lng,
      radius_m:parseInt(form.radius),base_points:pts,
      owner_id:null,owner_km:0,
      created_by:user.uid,created_at:serverTimestamp()
    })
    setNewPtPos(null)
    showToast(`✅ Ponto "${form.name}" adicionado!`,'ok')
  }

  const nearbyPoints=geo.lat?points.filter(p=>haversine(geo.lat,geo.lng,p.lat,p.lng)<2000):[]

  if(authLoading)return(
    <div style={{minHeight:'100vh',background:'#070c1a',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16}}>
      <div style={{fontSize:44}}>⚔</div>
      <div style={{fontSize:11,color:'#6366f1',letterSpacing:4,fontFamily:'monospace'}}>CARREGANDO...</div>
    </div>
  )

  if(!user)return <AuthScreen onAuth={setUser}/>

  const navItems=[
    {id:'map',icon:'map',label:'Mapa'},
    {id:'nearby',icon:'mapPin',label:'Perto',badge:nearbyPoints.length},
    {id:'battles',icon:'sword',label:'Batalhas',badge:battles.length},
    {id:'ranking',icon:'trophy',label:'Ranking'},
    {id:'profile',icon:'user',label:'Perfil'},
  ]

  return(
    <div style={{display:'flex',height:'100vh',background:'#070c1a',fontFamily:'monospace',overflow:'hidden'}}>

      {/* SIDEBAR */}
      <nav style={{width:68,background:'rgba(4,7,16,0.98)',borderRight:'1px solid rgba(99,102,241,0.1)',display:'flex',flexDirection:'column',alignItems:'center',padding:'16px 0',flexShrink:0,zIndex:40}}>
        <div style={{marginBottom:24,textAlign:'center'}}>
          <div style={{fontSize:22}}>⚔</div>
          <div style={{fontSize:7,color:'#6366f1',letterSpacing:2,marginTop:2}}>DOMINUS</div>
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:2,width:'100%',padding:'0 6px'}}>
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>setTab(item.id)} title={item.label}
              style={{position:'relative',width:'100%',padding:'11px 0',borderRadius:10,border:'none',background:tab===item.id?'rgba(99,102,241,0.18)':'transparent',color:tab===item.id?'#6366f1':'#475569',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,borderLeft:tab===item.id?'2px solid #6366f1':'2px solid transparent',transition:'all 0.2s'}}>
              <Icon name={item.icon} size={19} color={tab===item.id?'#6366f1':'#475569'}/>
              <span style={{fontSize:8,letterSpacing:0.4}}>{item.label}</span>
              {item.badge>0&&<div style={{position:'absolute',top:7,right:8,width:16,height:16,borderRadius:'50%',background:'#ef4444',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:900,color:'#fff'}}>{item.badge}</div>}
            </button>
          ))}
        </div>
        <div style={{marginBottom:10,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:geo.lat?'#10b981':geo.loading?'#f59e0b':'#ef4444'}}/>
          <span style={{fontSize:7,color:'#475569'}}>GPS</span>
        </div>
        <div onClick={()=>setTab('profile')} style={{width:38,height:38,borderRadius:'50%',background:user.avatar_color||'#6366f1',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:16,color:'#0a0f1e',border:'2px solid rgba(99,102,241,0.4)',cursor:'pointer'}}>
          {user.display_name?.charAt(0)||'?'}
        </div>
      </nav>

      {/* CONTENT */}
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>

        {/* MAP */}
        {tab==='map'&&(
          <>
            <MapCanvas points={points} userGeo={geo} center={center} zoom={zoom} selectedId={selected?.id} battles={battles} addMode={addMode} profiles={profiles} onSelect={setSelected} onMapClick={handleMapClick}/>
            <GeoBar geo={geo}/>
            <div style={{position:'absolute',top:16,right:selected?316:16,display:'flex',flexDirection:'column',gap:8}}>
              {[['locate','GPS',()=>{if(geo.lat)setCenter({lat:geo.lat,lng:geo.lng})}],['+','Zoom +',()=>setZoom(z=>Math.min(z+0.3,4))],['−','Zoom -',()=>setZoom(z=>Math.max(z-0.3,0.3))]].map(([ic,t,fn])=>(
                <button key={ic} onClick={fn} title={t} style={{background:'rgba(7,12,26,0.9)',border:'1px solid rgba(99,102,241,0.25)',borderRadius:10,color:'#94a3b8',cursor:'pointer',padding:'9px 11px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>
                  {ic==='locate'?<Icon name="locate" size={16}/>:ic}
                </button>
              ))}
            </div>
            {user.is_admin&&(
              <button onClick={()=>{setAddMode(!addMode);setNewPtPos(null)}} style={{position:'absolute',top:16,left:16,background:addMode?'#6366f1':'rgba(7,12,26,0.9)',border:`1px solid ${addMode?'#6366f1':'rgba(99,102,241,0.25)'}`,borderRadius:10,color:addMode?'#fff':'#94a3b8',cursor:'pointer',padding:'9px 16px',display:'flex',alignItems:'center',gap:8,fontSize:12,fontWeight:700}}>
                <Icon name="plus" size={14}/>{addMode?'Clique no mapa...':'PONTO ADM'}
              </button>
            )}
            <TerritoryPanel point={selected} userGeo={geo} user={user} battles={battles} profiles={profiles} onBattle={handleBattle} onCheckinResult={handleCheckinResult} onClose={()=>setSelected(null)}/>
          </>
        )}

        {/* ADMIN FORM */}
        {newPtPos&&(
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
            <NewPointForm lat={newPtPos.lat} lng={newPtPos.lng} onSave={handleSavePoint} onCancel={()=>setNewPtPos(null)}/>
          </div>
        )}

        {/* NEARBY */}
        {tab==='nearby'&&(
          <div style={{padding:24,overflowY:'auto',height:'100%'}}>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:10,color:'#6366f1',letterSpacing:2,marginBottom:4}}>GEOLOCALIZAÇÃO</div>
              <div style={{fontSize:22,fontWeight:900,color:'#f1f5f9'}}>Pontos Próximos</div>
              {geo.lat&&<div style={{fontSize:12,color:'#64748b',marginTop:4}}>±{Math.round(geo.accuracy||0)}m · {nearbyPoints.length} pontos em 2km</div>}
            </div>
            {geo.loading&&<div style={{color:'#f59e0b',fontSize:13}}>⏳ Aguardando GPS...</div>}
            {geo.error&&<div style={{color:'#ef4444',fontSize:13,background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,padding:'12px 16px'}}>{geo.error}</div>}
            {[...nearbyPoints].map(p=>({...p,_dist:haversine(geo.lat,geo.lng,p.lat,p.lng)})).sort((a,b)=>a._dist-b._dist).map(p=>{
              const within=p._dist<=p.radius_m
              const op=profiles[p.owner_id]
              return(
                <div key={p.id} onClick={()=>{setSelected(p);setTab('map')}} style={{background:'rgba(255,255,255,0.03)',border:`1px solid ${within?'rgba(16,185,129,0.3)':'rgba(255,255,255,0.06)'}`,borderRadius:14,padding:16,marginBottom:12,cursor:'pointer'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                    <div>
                      <div style={{fontSize:10,color:typeColor[p.type]||'#64748b',letterSpacing:1,marginBottom:2}}>{p.type}</div>
                      <div style={{fontSize:15,fontWeight:700,color:'#e2e8f0'}}>{p.name}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:16,fontWeight:900,color:within?'#10b981':'#e2e8f0'}}>{fmtDist(p._dist)}</div>
                      <div style={{fontSize:10,color:'#64748b'}}>raio {fmtDist(p.radius_m)}</div>
                    </div>
                  </div>
                  <div style={{height:3,background:'rgba(255,255,255,0.05)',borderRadius:2,overflow:'hidden',marginBottom:8}}>
                    <div style={{height:'100%',width:`${Math.min(100,(p._dist/p.radius_m)*100)}%`,background:within?'#10b981':'#6366f1'}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#64748b'}}>
                    <span>{p.owner_id?`👤 ${op?.display_name||p.owner_name||'?'}`:' 🏳 Livre'}</span>
                    {within&&<span style={{color:'#10b981',fontWeight:700}}>✓ DENTRO DO RAIO</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* BATTLES */}
        {tab==='battles'&&(
          <div style={{padding:24,overflowY:'auto',height:'100%'}}>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:10,color:'#ef4444',letterSpacing:2,marginBottom:4}}>CONFLITOS</div>
              <div style={{fontSize:22,fontWeight:900,color:'#f1f5f9'}}>Batalhas Ativas</div>
            </div>
            {battles.length===0&&<div style={{color:'#64748b',fontSize:13,marginTop:16}}>Nenhuma batalha em andamento.</div>}
            {battles.map(b=>{
              const pt=points.find(p=>p.id===b.conquest_point_id)
              const att=profiles[b.attacker_id]
              const def=profiles[b.defender_id]
              const tl=Math.max(0,(b.ends_at?.toDate?.()?.getTime()||b.ends_at)-Date.now())
              const attW=b.attacker_km>b.defender_km
              const attColor=att?.avatar_color||'#6366f1'
              const defColor=def?.avatar_color||'#f59e0b'
              return(
                <div key={b.id} style={{background:'rgba(239,68,68,0.05)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:14,padding:18,marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
                    <div>
                      <div style={{fontSize:10,color:'#ef4444',letterSpacing:1,marginBottom:2}}>⚔ BATALHA</div>
                      <div style={{fontSize:16,fontWeight:900,color:'#f1f5f9'}}>{pt?.name||'?'}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:10,color:'#64748b'}}>TERMINA EM</div>
                      <div style={{fontSize:14,fontWeight:700,color:'#f59e0b'}}>{fmtTime(tl)}</div>
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{width:40,height:40,borderRadius:'50%',background:attColor,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,color:'#0a0f1e',fontSize:18,margin:'0 auto 4px'}}>{(att?.display_name||b.attacker_name||'?').charAt(0)}</div>
                      <div style={{fontSize:11,color:'#e2e8f0'}}>{att?.display_name||b.attacker_name}</div>
                      <div style={{fontSize:16,fontWeight:900,color:attColor}}>{b.attacker_km}km</div>
                    </div>
                    <div style={{fontSize:11,color:'#64748b',fontWeight:700}}>VS</div>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{width:40,height:40,borderRadius:'50%',background:defColor,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,color:'#0a0f1e',fontSize:18,margin:'0 auto 4px'}}>{(def?.display_name||b.defender_name||'?').charAt(0)}</div>
                      <div style={{fontSize:11,color:'#e2e8f0'}}>{def?.display_name||b.defender_name}</div>
                      <div style={{fontSize:16,fontWeight:900,color:defColor}}>{b.defender_km}km</div>
                    </div>
                  </div>
                  <div style={{height:6,background:'rgba(255,255,255,0.05)',borderRadius:3,overflow:'hidden',display:'flex',marginBottom:10}}>
                    <div style={{width:`${(b.attacker_km/(b.attacker_km+b.defender_km+0.01))*100}%`,background:attColor,transition:'width 0.5s'}}/>
                    <div style={{flex:1,background:defColor}}/>
                  </div>
                  <div style={{padding:'9px 12px',borderRadius:8,background:attW?'rgba(239,68,68,0.08)':'rgba(16,185,129,0.08)',display:'flex',alignItems:'center',gap:8}}>
                    <Icon name={attW?'sword':'shield'} size={14} color={attW?'#ef4444':'#10b981'}/>
                    <span style={{fontSize:12,color:attW?'#ef4444':'#10b981',fontWeight:700}}>
                      {attW?`${att?.display_name||b.attacker_name} está vencendo`:`${def?.display_name||b.defender_name} está defendendo`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* RANKING */}
        {tab==='ranking'&&(
          <div style={{padding:24,overflowY:'auto',height:'100%'}}>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:10,color:'#6366f1',letterSpacing:2,marginBottom:4}}>CLASSIFICAÇÃO</div>
              <div style={{fontSize:22,fontWeight:900,color:'#f1f5f9'}}>Ranking Global</div>
            </div>
            {Object.entries(profiles).sort((a,b)=>(b[1].points||0)-(a[1].points||0)).map(([id,u],i)=>(
              <div key={id} style={{background:id===user?.uid?'rgba(99,102,241,0.1)':'rgba(255,255,255,0.02)',border:`1px solid ${id===user?.uid?'rgba(99,102,241,0.35)':'rgba(255,255,255,0.05)'}`,borderRadius:12,padding:'13px 16px',display:'flex',alignItems:'center',gap:14,marginBottom:10}}>
                <div style={{width:28,fontSize:i<3?20:13,textAlign:'center',fontWeight:900,color:['#f59e0b','#94a3b8','#b45309'][i]||'#64748b'}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</div>
                <div style={{width:40,height:40,borderRadius:'50%',background:u.avatar_color||'#6366f1',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:17,color:'#0a0f1e'}}>{u.display_name?.charAt(0)||'?'}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:'#e2e8f0'}}>{u.display_name}</div>
                  <div style={{fontSize:11,color:'#64748b'}}>{u.km_total||0} km · {points.filter(p=>p.owner_id===id).length} territórios</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:18,fontWeight:900,color:'#6366f1'}}>{u.points||0}</div>
                  <div style={{fontSize:9,color:'#64748b'}}>pts</div>
                </div>
              </div>
            ))}
            {Object.keys(profiles).length===0&&<div style={{color:'#64748b',fontSize:13}}>Nenhum usuário ainda.</div>}
          </div>
        )}

        {/* PROFILE */}
        {tab==='profile'&&(
          <div style={{padding:24,overflowY:'auto',height:'100%'}}>
            <div style={{height:80,background:'linear-gradient(135deg,#1e1b4b,#312e81,#4c1d95)',borderRadius:14,marginBottom:-24,position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:56,opacity:0.15}}>⚔</div>
            </div>
            <div style={{padding:'0 4px',marginBottom:20}}>
              <div style={{width:68,height:68,borderRadius:'50%',background:user.avatar_color||'#6366f1',border:'4px solid #070c1a',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:28,color:'#0a0f1e'}}>{user.display_name?.charAt(0)||'?'}</div>
              <div style={{marginTop:8}}>
                <div style={{fontSize:20,fontWeight:900,color:'#f1f5f9'}}>{user.display_name}</div>
                <div style={{fontSize:12,color:'#64748b'}}>{user.username||''}</div>
                {user.is_admin&&<span style={{fontSize:9,color:'#6366f1',background:'rgba(99,102,241,0.15)',padding:'2px 8px',borderRadius:20,marginTop:6,display:'inline-block',letterSpacing:1}}>ADM</span>}
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:20}}>
              {[['🏃',`${user.km_total||0}km`,'KMs'],['⚑',points.filter(p=>p.owner_id===user.uid).length,'Territórios'],['⭐',user.points||0,'Pontos']].map(([ic,v,l])=>(
                <div key={l} style={{background:'rgba(99,102,241,0.07)',border:'1px solid rgba(99,102,241,0.14)',borderRadius:12,padding:'14px 10px',textAlign:'center'}}>
                  <div style={{fontSize:20,marginBottom:4}}>{ic}</div>
                  <div style={{fontSize:18,fontWeight:900,color:'#6366f1'}}>{v}</div>
                  <div style={{fontSize:9,color:'#64748b',letterSpacing:1}}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{background:'rgba(99,102,241,0.07)',border:'1px solid rgba(99,102,241,0.18)',borderRadius:14,padding:18,fontSize:12,color:'#94a3b8',lineHeight:1.8}}>
              <div style={{fontSize:13,fontWeight:700,color:'#6366f1',marginBottom:10}}>⚔ Como virar ADM</div>
              <div>1. Abra o <strong style={{color:'#e2e8f0'}}>Firestore Console</strong></div>
              <div>2. Coleção <strong style={{color:'#e2e8f0'}}>profiles</strong> → seu documento</div>
              <div>3. Edite o campo <strong style={{color:'#e2e8f0'}}>is_admin</strong> para <strong style={{color:'#10b981'}}>true</strong></div>
              <div style={{marginTop:8,color:'#6366f1',fontSize:11}}>Seu UID: {user.uid}</div>
            </div>
          </div>
        )}

        {/* TOAST */}
        {toast&&(
          <div style={{position:'absolute',bottom:20,left:'50%',transform:'translateX(-50%)',background:'rgba(7,12,26,0.98)',border:`1px solid ${toast.type==='err'?'rgba(239,68,68,0.5)':toast.type==='warn'?'rgba(245,158,11,0.5)':'rgba(99,102,241,0.4)'}`,borderRadius:12,padding:'12px 20px',zIndex:100,fontSize:13,color:'#e2e8f0',boxShadow:'0 8px 32px rgba(0,0,0,0.5)',whiteSpace:'nowrap',animation:'slideUp 0.3s ease'}}>
            {toast.msg}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(99,102,241,0.3);border-radius:2px}
        input,select{color-scheme:dark}
      `}</style>
    </div>
  )
}
