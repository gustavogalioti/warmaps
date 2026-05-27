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
// GOOGLE MAPS API KEY
// Obtenha em: console.cloud.google.com → APIs → Maps JavaScript API
// ============================================================
const GMAPS_KEY = AIzaSyB9oA-kZadFpaiZp5n84EstVWlYS8hQ5GQ

// ============================================================
// HELPERS
// ============================================================
const haversine=(lat1,lng1,lat2,lng2)=>{const R=6371000,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
const hex2rgba=(hex,a)=>{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgba(${r},${g},${b},${a})`}
const fmtDist=(m)=>m<1000?`${Math.round(m)}m`:`${(m/1000).toFixed(1)}km`
const fmtTime=(ms)=>{const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);return `${h}h ${m}m`}
const typeColor={QUARTEIRÃO:'#4f46e5',BAIRRO:'#d97706',ÁREA:'#059669',CIDADE:'#dc2626'}
const typeBg={QUARTEIRÃO:'#eef2ff',BAIRRO:'#fffbeb',ÁREA:'#ecfdf5',CIDADE:'#fef2f2'}
const AVATAR_COLORS=['#4f46e5','#d97706','#059669','#dc2626','#7c3aed','#0284c7','#be185d']
const randomColor=()=>AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)]

// ============================================================
// LOAD GOOGLE MAPS SDK
// ============================================================
let gmapsLoaded = false
let gmapsCallbacks = []
const loadGoogleMaps = () => new Promise((resolve) => {
  if (window.google?.maps) { resolve(window.google.maps); return }
  if (gmapsLoaded) { gmapsCallbacks.push(resolve); return }
  gmapsLoaded = true
  gmapsCallbacks.push(resolve)
  window.__gmapsReady = () => {
    gmapsCallbacks.forEach(cb => cb(window.google.maps))
    gmapsCallbacks = []
  }
  const script = document.createElement('script')
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&callback=__gmapsReady&libraries=geometry`
  script.async = true
  document.head.appendChild(script)
})

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
    mapPin:<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12"cy="10"r="3"/></>,
    locate:<><circle cx="12"cy="12"r="3"/><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/></>,
    navigation:<><polygon points="3 11 22 2 13 21 11 13 3 11"/></>,
    loader:<><line x1="12"y1="2"x2="12"y2="6"/><line x1="12"y1="18"x2="12"y2="22"/><line x1="4.93"y1="4.93"x2="7.76"y2="7.76"/><line x1="16.24"y1="16.24"x2="19.07"y2="19.07"/><line x1="2"y1="12"x2="6"y2="12"/><line x1="18"y1="12"x2="22"y2="12"/><line x1="4.93"y1="19.07"x2="7.76"y2="16.24"/><line x1="16.24"y1="7.76"x2="19.07"y2="4.93"/></>,
    alertTriangle:<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12"y1="9"x2="12"y2="13"/><line x1="12"y1="17"x2="12.01"y2="17"/></>,
    wifi:<><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12"y1="20"x2="12.01"y2="20"/></>,
    zap:<><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
    edit:<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
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
    const fail=(err)=>setState(s=>({...s,error:err.code===1?'Permissão de GPS negada.':'Não foi possível obter localização.',loading:false}))
    const opts={enableHighAccuracy:true,timeout:12000,maximumAge:4000}
    navigator.geolocation.getCurrentPosition(ok,fail,opts)
    watchRef.current=navigator.geolocation.watchPosition(ok,fail,opts)
    return()=>navigator.geolocation.clearWatch(watchRef.current)
  },[])
  return state
}

// ============================================================
// GOOGLE MAPS VIEW
// ============================================================
const GoogleMapView = ({ points, userGeo, profiles, selectedId, battles, addMode, onSelect, onMapClick, onMapReady }) => {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const circlesRef = useRef({})
  const labelsRef = useRef({})
  const userMarkerRef = useRef(null)
  const accuracyCircleRef = useRef(null)

  // Init map
  useEffect(() => {
    loadGoogleMaps().then((gmaps) => {
      if (mapInstanceRef.current) return
      const map = new gmaps.Map(mapRef.current, {
        center: { lat: userGeo.lat || -23.575, lng: userGeo.lng || -46.650 },
        zoom: 15,
        mapTypeId: 'roadmap',
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        styles: [
          { featureType:'poi', elementType:'labels', stylers:[{visibility:'off'}] },
          { featureType:'transit', stylers:[{visibility:'off'}] },
        ],
      })
      mapInstanceRef.current = map
      if (onMapReady) onMapReady(map)

      map.addListener('click', (e) => {
        if (addMode) {
          onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() })
        }
      })
    })
  }, [])

  // Update add mode click handler
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    window.__warMapsAddMode = addMode
    window.__warMapsOnMapClick = onMapClick
  }, [addMode, onMapClick])

  // Center on user GPS
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !userGeo.lat) return
    loadGoogleMaps().then((gmaps) => {
      // User dot
      if (!userMarkerRef.current) {
        userMarkerRef.current = new gmaps.Marker({
          map,
          icon: {
            path: gmaps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#4f46e5',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 3,
          },
          zIndex: 999,
        })
      }
      userMarkerRef.current.setPosition({ lat: userGeo.lat, lng: userGeo.lng })

      // Accuracy circle
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = new gmaps.Circle({
          map,
          fillColor: '#4f46e5',
          fillOpacity: 0.08,
          strokeColor: '#4f46e5',
          strokeOpacity: 0.25,
          strokeWeight: 1,
        })
      }
      accuracyCircleRef.current.setCenter({ lat: userGeo.lat, lng: userGeo.lng })
      accuracyCircleRef.current.setRadius(userGeo.accuracy || 20)
    })
  }, [userGeo.lat, userGeo.lng, userGeo.accuracy])

  // Draw conquest circles
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    loadGoogleMaps().then((gmaps) => {
      // Remove old circles/labels
      Object.values(circlesRef.current).forEach(c => c.setMap(null))
      Object.values(labelsRef.current).forEach(l => l.setMap(null))
      circlesRef.current = {}
      labelsRef.current = {}

      points.forEach(pt => {
        const ownerProfile = pt.owner_id ? profiles[pt.owner_id] : null
        const color = ownerProfile?.avatar_color || pt.owner_color || (pt.owner_id ? '#4f46e5' : '#94a3b8')
        const inBattle = battles.some(b => b.conquest_point_id === pt.id)
        const isSelected = selectedId === pt.id

        const circle = new gmaps.Circle({
          map,
          center: { lat: pt.lat, lng: pt.lng },
          radius: pt.radius_m,
          fillColor: pt.owner_id ? color : '#94a3b8',
          fillOpacity: pt.owner_id ? 0.2 : 0.08,
          strokeColor: inBattle ? '#dc2626' : isSelected ? '#1d4ed8' : (pt.owner_id ? color : '#94a3b8'),
          strokeOpacity: 0.9,
          strokeWeight: isSelected ? 3 : inBattle ? 2.5 : 1.5,
        })

        circle.addListener('click', () => onSelect(pt))
        circlesRef.current[pt.id] = circle

        // Custom overlay label
        const ownerName = ownerProfile?.display_name || pt.owner_name || ''
        const label = new gmaps.Marker({
          map,
          position: { lat: pt.lat, lng: pt.lng },
          icon: { path: 'M 0,0', scale: 0 },
          label: {
            text: `${pt.name}${ownerName ? '\n' + ownerName.charAt(0) : ''}`,
            color: pt.owner_id ? color : '#64748b',
            fontWeight: 'bold',
            fontSize: '12px',
            fontFamily: 'monospace',
          },
          zIndex: 10,
        })
        label.addListener('click', () => onSelect(pt))
        labelsRef.current[pt.id] = label
      })
    })
  }, [points, profiles, selectedId, battles])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {addMode && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none', background: 'rgba(79,70,229,0.9)', color: '#fff', padding: '10px 18px', borderRadius: 12, fontSize: 13, fontWeight: 700, fontFamily: 'monospace', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          📍 Toque no mapa para posicionar o ponto
        </div>
      )}
    </div>
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
      await addDoc(collection(db,'checkins'),{user_id:user.uid,point_id:point.id,lat:userGeo.lat,lng:userGeo.lng,dist_m:dist,created_at:serverTimestamp()})
      if(!point.owner_id){
        await updateDoc(doc(db,'conquest_points',point.id),{owner_id:user.uid,owner_name:user.display_name,owner_color:user.avatar_color,owner_km:user.km_total||0,conquered_at:serverTimestamp()})
        await updateDoc(doc(db,'profiles',user.uid),{points:(user.points||0)+100})
        onResult({ok:true,action:'conquered',dist,pts:100})
      }else{
        onResult({ok:true,action:'checkin',dist,pts:0})
      }
      setDone(true);setTimeout(()=>setDone(false),60000)
    }catch(err){onResult({ok:false,error:err.message})}
    setLoading(false)
  }

  const c=within?'#059669':'#94a3b8'
  return(
    <div style={{padding:'0 20px',marginBottom:14}}>
      {dist!==null&&(
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <Icon name="mapPin" size={13} color={within?'#059669':'#dc2626'}/>
            <span style={{fontSize:11,color:within?'#059669':'#dc2626',fontFamily:'monospace'}}>{fmtDist(dist)} de distância</span>
          </div>
          <span style={{fontSize:10,color:'#94a3b8'}}>raio {fmtDist(point.radius_m)}</span>
        </div>
      )}
      {dist!==null&&(
        <div style={{height:4,background:'#f1f5f9',borderRadius:2,marginBottom:10,overflow:'hidden'}}>
          <div style={{height:'100%',width:`${Math.min(100,(dist/point.radius_m)*100)}%`,background:within?'#059669':'#dc2626',transition:'width 0.4s'}}/>
        </div>
      )}
      <button onClick={doCheckin} disabled={!within||loading||done} style={{
        width:'100%',padding:'12px',borderRadius:12,
        border:`2px solid ${within?'#059669':'#e2e8f0'}`,
        background:within?'#059669':'#f8fafc',
        color:within?'#fff':'#94a3b8',
        cursor:within&&!loading&&!done?'pointer':'not-allowed',
        display:'flex',alignItems:'center',justifyContent:'center',gap:8,
        fontSize:13,fontWeight:700,transition:'all 0.2s',
      }}>
        {loading?<><Icon name="loader" size={14} color={within?'#fff':c}/><span>Registrando...</span></>
        :done?<><Icon name="check" size={14}/><span>Check-in feito ✓</span></>
        :within?<><Icon name="mapPin" size={14}/><span>Fazer Check-in</span></>
        :<><Icon name="navigation" size={14}/><span>Muito longe para check-in</span></>}
      </button>
      {!within&&dist!==null&&(
        <p style={{fontSize:11,color:'#94a3b8',textAlign:'center',marginTop:6}}>
          Chegue {fmtDist(Math.max(0,dist-point.radius_m))} mais perto
        </p>
      )}
    </div>
  )
}

// ============================================================
// TERRITORY PANEL (light theme)
// ============================================================
const TerritoryPanel=({point,userGeo,user,battles,profiles,onBattle,onCheckinResult,onClose})=>{
  if(!point)return null
  const ownerProfile=point.owner_id?profiles[point.owner_id]:null
  const ownerName=ownerProfile?.display_name||point.owner_name||'?'
  const color=ownerProfile?.avatar_color||point.owner_color||(point.owner_id?'#4f46e5':'#94a3b8')
  const battle=battles.find(b=>b.conquest_point_id===point.id&&b.status==='active')
  const isOwner=user&&point.owner_id===user.uid
  const tc=typeColor[point.type]||'#64748b'
  const tb=typeBg[point.type]||'#f8fafc'
  return(
    <div style={{position:'absolute',top:0,right:0,width:300,height:'100%',background:'#fff',borderLeft:'1px solid #e2e8f0',display:'flex',flexDirection:'column',zIndex:20,overflowY:'auto',boxShadow:'-4px 0 20px rgba(0,0,0,0.08)'}}>
      {/* Header */}
      <div style={{padding:'20px 20px 14px',borderBottom:'1px solid #f1f5f9'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <span style={{fontSize:10,fontWeight:700,color:tc,background:tb,padding:'3px 8px',borderRadius:20,letterSpacing:1}}>{point.type}</span>
            <div style={{fontSize:20,fontWeight:900,color:'#0f172a',marginTop:8}}>{point.name}</div>
          </div>
          <button onClick={onClose} style={{background:'#f1f5f9',border:'none',borderRadius:8,color:'#64748b',cursor:'pointer',padding:8,marginTop:-4}}>
            <Icon name="x" size={16}/>
          </button>
        </div>
        <div style={{marginTop:14,display:'flex',alignItems:'center',gap:10}}>
          {point.owner_id?(
            <>
              <div style={{width:40,height:40,borderRadius:'50%',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:18,color:'#fff',flexShrink:0}}>{ownerName.charAt(0)}</div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>{ownerName}</div>
                <div style={{fontSize:11,color:'#64748b'}}>{point.owner_km?.toFixed(0)||0} km acumulados</div>
              </div>
            </>
          ):(
            <div style={{display:'flex',alignItems:'center',gap:8,color:'#64748b',background:'#f8fafc',borderRadius:10,padding:'10px 14px',width:'100%'}}>
              <Icon name="flag" size={18}/><span style={{fontSize:13,fontWeight:600}}>Território livre — conquiste!</span>
            </div>
          )}
        </div>
      </div>

      {/* Battle */}
      {battle&&(
        <div style={{margin:'14px 20px 0',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:14}}>
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
            <Icon name="sword" size={14} color="#dc2626"/>
            <span style={{fontSize:12,color:'#dc2626',fontWeight:700}}>BATALHA ATIVA</span>
          </div>
          <div style={{fontSize:12,color:'#64748b'}}>Termina em {fmtTime(Math.max(0,(battle.ends_at?.toDate?.()?.getTime()||battle.ends_at)-Date.now()))}</div>
        </div>
      )}

      {/* Stats */}
      <div style={{padding:'14px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {[['Pontos',point.base_points],['Raio',fmtDist(point.radius_m)]].map(([l,v])=>(
          <div key={l} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:'10px 12px'}}>
            <div style={{fontSize:10,color:'#94a3b8',marginBottom:2,fontWeight:600}}>{l}</div>
            <div style={{fontSize:18,fontWeight:900,color:'#4f46e5'}}>{v}</div>
          </div>
        ))}
      </div>

      <CheckinBtn point={point} userGeo={userGeo} user={user} onResult={onCheckinResult}/>

      {!isOwner&&point.owner_id&&!battle&&(
        <div style={{padding:'0 20px',marginBottom:14}}>
          <button onClick={()=>onBattle(point)} style={{width:'100%',padding:'12px',borderRadius:12,background:'#dc2626',border:'none',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:13,fontWeight:700}}>
            <Icon name="sword" size={14} color="#fff"/><span>Iniciar batalha</span>
          </button>
        </div>
      )}
      {isOwner&&battle&&(
        <div style={{padding:'0 20px',marginBottom:14}}>
          <button style={{width:'100%',padding:'12px',borderRadius:12,background:'#d97706',border:'none',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,fontSize:13,fontWeight:700}}>
            <Icon name="shield" size={14} color="#fff"/><span>Chamar reforços</span>
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
  const inp={width:'100%',padding:'12px 14px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,color:'#0f172a',fontSize:14,outline:'none',fontFamily:'inherit'}

  const submit=async()=>{
    setLoading(true);setError('')
    try{
      if(mode==='signup'){
        const color=randomColor()
        const cred=await createUserWithEmailAndPassword(auth,email,password)
        const username=`@${name.toLowerCase().replace(/\s+/g,'')}`
        await setDoc(doc(db,'profiles',cred.user.uid),{uid:cred.user.uid,display_name:name,username,avatar_color:color,km_total:0,points:0,is_admin:false,created_at:serverTimestamp()})
        onAuth({uid:cred.user.uid,display_name:name,username,avatar_color:color,km_total:0,points:0,is_admin:false})
      }else{
        const cred=await signInWithEmailAndPassword(auth,email,password)
        const snap=await getDoc(doc(db,'profiles',cred.user.uid))
        onAuth(snap.exists()?{uid:cred.user.uid,...snap.data()}:{uid:cred.user.uid,display_name:email.split('@')[0],avatar_color:'#4f46e5',km_total:0,points:0,is_admin:false})
      }
    }catch(e){
      const msgs={'auth/email-already-in-use':'Email já cadastrado.','auth/wrong-password':'Senha incorreta.','auth/user-not-found':'Usuário não encontrado.','auth/weak-password':'Senha fraca (mín. 6 caracteres).','auth/invalid-email':'Email inválido.','auth/invalid-credential':'Email ou senha incorretos.'}
      setError(msgs[e.code]||e.message)
    }
    setLoading(false)
  }

  return(
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#eef2ff 0%,#f0fdf4 50%,#fef9c3 100%)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{width:'100%',maxWidth:360,background:'#fff',border:'1px solid #e2e8f0',borderRadius:24,padding:32,boxShadow:'0 20px 60px rgba(0,0,0,0.1)'}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{width:64,height:64,background:'linear-gradient(135deg,#4f46e5,#7c3aed)',borderRadius:20,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px',fontSize:30}}>⚔️</div>
          <div style={{fontSize:26,fontWeight:900,color:'#0f172a',letterSpacing:-0.5}}>War Maps</div>
          <div style={{fontSize:12,color:'#64748b',marginTop:4}}>Conquiste seu território</div>
        </div>
        <div style={{display:'flex',gap:8,marginBottom:20,background:'#f1f5f9',borderRadius:12,padding:4}}>
          {['login','signup'].map(m=>(
            <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:'9px',borderRadius:9,border:'none',cursor:'pointer',background:mode===m?'#fff':'transparent',color:mode===m?'#0f172a':'#64748b',fontSize:13,fontWeight:700,boxShadow:mode===m?'0 1px 4px rgba(0,0,0,0.1)':'none',transition:'all 0.2s'}}>
              {m==='login'?'Entrar':'Criar conta'}
            </button>
          ))}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {mode==='signup'&&<input style={inp} placeholder="Seu nome" value={name} onChange={e=>setName(e.target.value)}/>}
          <input style={inp} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/>
          <input style={inp} type="password" placeholder="Senha" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/>
        </div>
        {error&&<div style={{fontSize:12,color:'#dc2626',marginTop:10,textAlign:'center',background:'#fef2f2',padding:'8px 12px',borderRadius:8}}>{error}</div>}
        <button onClick={submit} disabled={loading} style={{width:'100%',marginTop:16,padding:'13px',borderRadius:12,border:'none',background:loading?'#c7d2fe':'linear-gradient(135deg,#4f46e5,#7c3aed)',color:'#fff',fontSize:14,fontWeight:900,cursor:loading?'wait':'pointer',boxShadow:'0 4px 14px rgba(79,70,229,0.4)'}}>
          {loading?'Aguarde...':mode==='login'?'Entrar':'Criar conta'}
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
  const inp={width:'100%',padding:'11px 14px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,color:'#0f172a',fontSize:13,outline:'none',marginBottom:10}
  return(
    <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:20,padding:28,width:320,boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
      <div style={{fontSize:11,fontWeight:700,color:'#4f46e5',letterSpacing:2,marginBottom:4}}>NOVO PONTO</div>
      <div style={{fontSize:18,fontWeight:900,color:'#0f172a',marginBottom:16}}>Adicionar Conquista</div>
      <div style={{fontSize:11,color:'#94a3b8',marginBottom:14,background:'#f8fafc',padding:'8px 12px',borderRadius:8}}>📍 {lat?.toFixed(5)}, {lng?.toFixed(5)}</div>
      <input style={inp} placeholder="Nome (ex: Praça da Sé)" value={name} onChange={e=>setName(e.target.value)}/>
      <select style={{...inp,cursor:'pointer',appearance:'none'}} value={type} onChange={e=>setType(e.target.value)}>
        {['QUARTEIRÃO','BAIRRO','ÁREA','CIDADE'].map(t=><option key={t} value={t}>{t}</option>)}
      </select>
      <div style={{marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#64748b',marginBottom:8}}>
          <span>Raio de conquista</span>
          <span style={{color:'#4f46e5',fontWeight:700}}>{fmtDist(parseInt(radius)||0)}</span>
        </div>
        <input type="range" min="50" max="2000" step="50" value={radius} onChange={e=>setRadius(e.target.value)} style={{width:'100%',accentColor:'#4f46e5'}}/>
      </div>
      <div style={{display:'flex',gap:10}}>
        <button onClick={onCancel} style={{flex:1,padding:'11px',borderRadius:10,background:'#f1f5f9',border:'none',color:'#64748b',cursor:'pointer',fontSize:13,fontWeight:700}}>Cancelar</button>
        <button onClick={()=>name.trim()&&onSave({name,type,radius})} disabled={!name.trim()} style={{flex:1,padding:'11px',borderRadius:10,background:name.trim()?'#4f46e5':'#c7d2fe',border:'none',color:'#fff',cursor:name.trim()?'pointer':'not-allowed',fontSize:13,fontWeight:900}}>
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
  const[c,bg,label]=geo.loading?['#d97706','#fffbeb','Obtendo GPS...']:geo.error?['#dc2626','#fef2f2',geo.error]:['#059669','#f0fdf4',`GPS ativo · ±${Math.round(geo.accuracy||0)}m`]
  return(
    <div style={{position:'absolute',bottom:20,left:'50%',transform:'translateX(-50%)',background:bg,border:`1px solid ${c}30`,borderRadius:20,padding:'7px 16px',display:'flex',alignItems:'center',gap:8,fontSize:11,fontWeight:600,color:c,zIndex:10,whiteSpace:'nowrap',boxShadow:'0 4px 20px rgba(0,0,0,0.12)'}}>
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
  const[points,setPoints]=useState([])
  const[battles,setBattles]=useState([])
  const[profiles,setProfiles]=useState({})
  const[selected,setSelected]=useState(null)
  const[addMode,setAddMode]=useState(false)
  const[newPtPos,setNewPtPos]=useState(null)
  const[toast,setToast]=useState(null)
  const geo=useGeo()

  useEffect(()=>{
    const unsub=onAuthStateChanged(auth,async(fbUser)=>{
      if(fbUser){
        const snap=await getDoc(doc(db,'profiles',fbUser.uid))
        setUser(snap.exists()?{uid:fbUser.uid,...snap.data()}:{uid:fbUser.uid,display_name:fbUser.email?.split('@')[0],avatar_color:'#4f46e5',km_total:0,points:0,is_admin:false})
      }else{setUser(null)}
      setAuthLoading(false)
    })
    return unsub
  },[])

  useEffect(()=>{
    if(!user)return
    const unsubPts=onSnapshot(collection(db,'conquest_points'),snap=>{
      setPoints(snap.docs.map(d=>({id:d.id,...d.data()})))
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
    showToast(r.action==='conquered'?`🏆 Território conquistado! +${r.pts} pts`:`📍 Check-in registrado! (${fmtDist(r.dist)})`,'ok')
  }

  const handleBattle=async(point)=>{
    await addDoc(collection(db,'battles'),{conquest_point_id:point.id,attacker_id:user.uid,attacker_name:user.display_name,defender_id:point.owner_id,defender_name:point.owner_name||'?',attacker_km:user.km_total||0,defender_km:point.owner_km||0,status:'active',ends_at:new Date(Date.now()+86400000),created_at:serverTimestamp()})
    showToast(`⚔️ Batalha iniciada em ${point.name}!`,'warn')
    setTab('battles')
  }

  const handleSavePoint=async(form)=>{
    await addDoc(collection(db,'conquest_points'),{name:form.name,type:form.type,lat:newPtPos.lat,lng:newPtPos.lng,radius_m:parseInt(form.radius),base_points:form.type==='ÁREA'?300:100,owner_id:null,owner_km:0,created_by:user.uid,created_at:serverTimestamp()})
    setNewPtPos(null)
    showToast(`✅ "${form.name}" adicionado!`,'ok')
  }

  const nearbyPoints=geo.lat?points.filter(p=>haversine(geo.lat,geo.lng,p.lat,p.lng)<2000):[]

  if(authLoading)return(
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#eef2ff,#f0fdf4)',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16}}>
      <div style={{width:64,height:64,background:'linear-gradient(135deg,#4f46e5,#7c3aed)',borderRadius:20,display:'flex',alignItems:'center',justifyContent:'center',fontSize:30}}>⚔️</div>
      <div style={{fontSize:14,color:'#64748b',fontWeight:600}}>Carregando War Maps...</div>
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

  const toastColors={ok:{bg:'#f0fdf4',border:'#86efac',text:'#166534'},err:{bg:'#fef2f2',border:'#fca5a5',text:'#991b1b'},warn:{bg:'#fffbeb',border:'#fcd34d',text:'#92400e'}}
  const tc=toastColors[toast?.type]||toastColors.ok

  return(
    <div style={{display:'flex',height:'100vh',background:'#f8fafc',overflow:'hidden'}}>

      {/* SIDEBAR */}
      <nav style={{width:70,background:'#fff',borderRight:'1px solid #e2e8f0',display:'flex',flexDirection:'column',alignItems:'center',padding:'16px 0',flexShrink:0,zIndex:40,boxShadow:'2px 0 8px rgba(0,0,0,0.04)'}}>
        <div style={{marginBottom:24,textAlign:'center'}}>
          <div style={{width:40,height:40,background:'linear-gradient(135deg,#4f46e5,#7c3aed)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,margin:'0 auto'}}>⚔️</div>
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:2,width:'100%',padding:'0 8px'}}>
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>setTab(item.id)} title={item.label}
              style={{position:'relative',width:'100%',padding:'10px 0',borderRadius:10,border:'none',background:tab===item.id?'#eef2ff':'transparent',color:tab===item.id?'#4f46e5':'#94a3b8',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:3,transition:'all 0.2s'}}>
              <Icon name={item.icon} size={20} color={tab===item.id?'#4f46e5':'#94a3b8'}/>
              <span style={{fontSize:8,fontWeight:600,letterSpacing:0.3}}>{item.label}</span>
              {item.badge>0&&<div style={{position:'absolute',top:6,right:8,width:16,height:16,borderRadius:'50%',background:'#dc2626',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:900,color:'#fff'}}>{item.badge}</div>}
            </button>
          ))}
        </div>
        <div style={{marginBottom:10,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:geo.lat?'#10b981':geo.loading?'#f59e0b':'#ef4444'}}/>
          <span style={{fontSize:7,color:'#94a3b8',fontWeight:600}}>GPS</span>
        </div>
        <div onClick={()=>setTab('profile')} style={{width:40,height:40,borderRadius:'50%',background:user.avatar_color||'#4f46e5',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:17,color:'#fff',cursor:'pointer',border:'2px solid #e2e8f0'}}>
          {user.display_name?.charAt(0)||'?'}
        </div>
      </nav>

      {/* CONTENT */}
      <div style={{flex:1,position:'relative',overflow:'hidden'}}>

        {/* MAP */}
        {tab==='map'&&(
          <>
            <GoogleMapView
              points={points} userGeo={geo} profiles={profiles}
              selectedId={selected?.id} battles={battles}
              addMode={addMode}
              onSelect={setSelected}
              onMapClick={({lat,lng})=>setNewPtPos({lat,lng})}
            />
            <GeoBar geo={geo}/>

            {/* ADM button */}
            {user.is_admin&&(
              <button onClick={()=>{setAddMode(!addMode);setNewPtPos(null)}} style={{position:'absolute',top:16,left:16,background:addMode?'#4f46e5':'#fff',border:`2px solid ${addMode?'#4f46e5':'#e2e8f0'}`,borderRadius:12,color:addMode?'#fff':'#64748b',cursor:'pointer',padding:'9px 16px',display:'flex',alignItems:'center',gap:8,fontSize:12,fontWeight:700,boxShadow:'0 2px 8px rgba(0,0,0,0.1)',zIndex:10}}>
                <Icon name="plus" size={14} color={addMode?'#fff':'#64748b'}/>{addMode?'Clique no mapa...':'Adicionar Ponto'}
              </button>
            )}

            <TerritoryPanel point={selected} userGeo={geo} user={user} battles={battles} profiles={profiles} onBattle={handleBattle} onCheckinResult={handleCheckinResult} onClose={()=>setSelected(null)}/>
          </>
        )}

        {/* ADMIN FORM */}
        {newPtPos&&(
          <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50}}>
            <NewPointForm lat={newPtPos.lat} lng={newPtPos.lng} onSave={handleSavePoint} onCancel={()=>setNewPtPos(null)}/>
          </div>
        )}

        {/* NEARBY */}
        {tab==='nearby'&&(
          <div style={{padding:24,overflowY:'auto',height:'100%',background:'#f8fafc'}}>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:'#4f46e5',letterSpacing:2,marginBottom:4}}>GEOLOCALIZAÇÃO</div>
              <div style={{fontSize:22,fontWeight:900,color:'#0f172a'}}>Pontos Próximos</div>
              {geo.lat&&<div style={{fontSize:12,color:'#64748b',marginTop:4}}>±{Math.round(geo.accuracy||0)}m · {nearbyPoints.length} pontos em 2km</div>}
            </div>
            {geo.loading&&<div style={{color:'#d97706',fontSize:13,background:'#fffbeb',padding:'12px 16px',borderRadius:10}}>⏳ Aguardando GPS...</div>}
            {geo.error&&<div style={{color:'#dc2626',fontSize:13,background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'12px 16px'}}>{geo.error}</div>}
            {[...nearbyPoints].map(p=>({...p,_dist:haversine(geo.lat,geo.lng,p.lat,p.lng)})).sort((a,b)=>a._dist-b._dist).map(p=>{
              const within=p._dist<=p.radius_m
              const op=profiles[p.owner_id]
              const oc=op?.avatar_color||p.owner_color||'#4f46e5'
              return(
                <div key={p.id} onClick={()=>{setSelected(p);setTab('map')}} style={{background:'#fff',border:`1px solid ${within?'#86efac':'#e2e8f0'}`,borderRadius:14,padding:16,marginBottom:12,cursor:'pointer',boxShadow:'0 1px 4px rgba(0,0,0,0.05)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                    <div>
                      <span style={{fontSize:10,fontWeight:700,color:typeColor[p.type]||'#64748b',background:typeBg[p.type]||'#f8fafc',padding:'2px 8px',borderRadius:20}}>{p.type}</span>
                      <div style={{fontSize:15,fontWeight:700,color:'#0f172a',marginTop:6}}>{p.name}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:16,fontWeight:900,color:within?'#059669':'#0f172a'}}>{fmtDist(p._dist)}</div>
                      <div style={{fontSize:10,color:'#94a3b8'}}>raio {fmtDist(p.radius_m)}</div>
                    </div>
                  </div>
                  <div style={{height:3,background:'#f1f5f9',borderRadius:2,overflow:'hidden',marginBottom:8}}>
                    <div style={{height:'100%',width:`${Math.min(100,(p._dist/p.radius_m)*100)}%`,background:within?'#059669':'#4f46e5'}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11}}>
                    {p.owner_id?<span style={{color:'#64748b',display:'flex',alignItems:'center',gap:6}}><div style={{width:16,height:16,borderRadius:'50%',background:oc,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#fff',fontWeight:900}}>{(op?.display_name||p.owner_name||'?').charAt(0)}</div>{op?.display_name||p.owner_name}</span>:<span style={{color:'#94a3b8'}}>🏳️ Livre</span>}
                    {within&&<span style={{color:'#059669',fontWeight:700}}>✓ DENTRO DO RAIO</span>}
                  </div>
                </div>
              )
            })}
            {!geo.loading&&!geo.error&&nearbyPoints.length===0&&<div style={{color:'#94a3b8',fontSize:13,textAlign:'center',marginTop:40}}>Nenhum ponto de conquista em 2km.</div>}
          </div>
        )}

        {/* BATTLES */}
        {tab==='battles'&&(
          <div style={{padding:24,overflowY:'auto',height:'100%',background:'#f8fafc'}}>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:'#dc2626',letterSpacing:2,marginBottom:4}}>CONFLITOS</div>
              <div style={{fontSize:22,fontWeight:900,color:'#0f172a'}}>Batalhas Ativas</div>
            </div>
            {battles.length===0&&<div style={{color:'#94a3b8',fontSize:13,textAlign:'center',marginTop:40}}>Nenhuma batalha em andamento.</div>}
            {battles.map(b=>{
              const pt=points.find(p=>p.id===b.conquest_point_id)
              const att=profiles[b.attacker_id]
              const def=profiles[b.defender_id]
              const tl=Math.max(0,(b.ends_at?.toDate?.()?.getTime()||b.ends_at)-Date.now())
              const attW=b.attacker_km>b.defender_km
              const ac=att?.avatar_color||'#4f46e5',dc=def?.avatar_color||'#d97706'
              return(
                <div key={b.id} style={{background:'#fff',border:'1px solid #fecaca',borderRadius:16,padding:18,marginBottom:14,boxShadow:'0 1px 4px rgba(0,0,0,0.05)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:'#dc2626',letterSpacing:1,marginBottom:4}}>⚔️ BATALHA</div>
                      <div style={{fontSize:16,fontWeight:900,color:'#0f172a'}}>{pt?.name||'?'}</div>
                    </div>
                    <div style={{textAlign:'right',background:'#fffbeb',padding:'8px 12px',borderRadius:10}}>
                      <div style={{fontSize:10,color:'#94a3b8',fontWeight:600}}>TERMINA EM</div>
                      <div style={{fontSize:14,fontWeight:700,color:'#d97706'}}>{fmtTime(tl)}</div>
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{width:44,height:44,borderRadius:'50%',background:ac,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,color:'#fff',fontSize:20,margin:'0 auto 6px'}}>{(att?.display_name||b.attacker_name||'?').charAt(0)}</div>
                      <div style={{fontSize:12,color:'#0f172a',fontWeight:600}}>{att?.display_name||b.attacker_name}</div>
                      <div style={{fontSize:16,fontWeight:900,color:ac}}>{b.attacker_km}km</div>
                    </div>
                    <div style={{background:'#f1f5f9',borderRadius:8,padding:'6px 10px',fontSize:11,fontWeight:700,color:'#64748b'}}>VS</div>
                    <div style={{flex:1,textAlign:'center'}}>
                      <div style={{width:44,height:44,borderRadius:'50%',background:dc,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,color:'#fff',fontSize:20,margin:'0 auto 6px'}}>{(def?.display_name||b.defender_name||'?').charAt(0)}</div>
                      <div style={{fontSize:12,color:'#0f172a',fontWeight:600}}>{def?.display_name||b.defender_name}</div>
                      <div style={{fontSize:16,fontWeight:900,color:dc}}>{b.defender_km}km</div>
                    </div>
                  </div>
                  <div style={{height:8,background:'#f1f5f9',borderRadius:4,overflow:'hidden',display:'flex',marginBottom:12}}>
                    <div style={{width:`${(b.attacker_km/(b.attacker_km+b.defender_km+0.01))*100}%`,background:ac}}/>
                    <div style={{flex:1,background:dc}}/>
                  </div>
                  <div style={{padding:'10px 14px',borderRadius:10,background:attW?'#fef2f2':'#f0fdf4',display:'flex',alignItems:'center',gap:8}}>
                    <Icon name={attW?'sword':'shield'} size={14} color={attW?'#dc2626':'#059669'}/>
                    <span style={{fontSize:12,color:attW?'#dc2626':'#059669',fontWeight:700}}>
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
          <div style={{padding:24,overflowY:'auto',height:'100%',background:'#f8fafc'}}>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,fontWeight:700,color:'#4f46e5',letterSpacing:2,marginBottom:4}}>CLASSIFICAÇÃO</div>
              <div style={{fontSize:22,fontWeight:900,color:'#0f172a'}}>Ranking Global</div>
            </div>
            {Object.entries(profiles).sort((a,b)=>(b[1].points||0)-(a[1].points||0)).map(([id,u],i)=>(
              <div key={id} style={{background:id===user?.uid?'#eef2ff':'#fff',border:`1px solid ${id===user?.uid?'#c7d2fe':'#e2e8f0'}`,borderRadius:14,padding:'14px 16px',display:'flex',alignItems:'center',gap:14,marginBottom:10,boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
                <div style={{width:30,fontSize:i<3?22:14,textAlign:'center',fontWeight:900}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</div>
                <div style={{width:44,height:44,borderRadius:'50%',background:u.avatar_color||'#4f46e5',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:19,color:'#fff'}}>{u.display_name?.charAt(0)||'?'}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>{u.display_name}</div>
                  <div style={{fontSize:11,color:'#64748b'}}>{u.km_total||0} km · {points.filter(p=>p.owner_id===id).length} territórios</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:20,fontWeight:900,color:'#4f46e5'}}>{u.points||0}</div>
                  <div style={{fontSize:10,color:'#94a3b8',fontWeight:600}}>pts</div>
                </div>
              </div>
            ))}
            {Object.keys(profiles).length===0&&<div style={{color:'#94a3b8',fontSize:13,textAlign:'center',marginTop:40}}>Nenhum jogador ainda.</div>}
          </div>
        )}

        {/* PROFILE */}
        {tab==='profile'&&(
          <div style={{padding:24,overflowY:'auto',height:'100%',background:'#f8fafc'}}>
            <div style={{height:90,background:`linear-gradient(135deg,${user.avatar_color||'#4f46e5'},${user.avatar_color||'#7c3aed'}aa)`,borderRadius:16,marginBottom:-30,position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:60,opacity:0.15}}>⚔️</div>
            </div>
            <div style={{padding:'0 4px',marginBottom:20}}>
              <div style={{width:72,height:72,borderRadius:'50%',background:user.avatar_color||'#4f46e5',border:'4px solid #f8fafc',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:30,color:'#fff',boxShadow:'0 4px 12px rgba(0,0,0,0.15)'}}>{user.display_name?.charAt(0)||'?'}</div>
              <div style={{marginTop:10}}>
                <div style={{fontSize:22,fontWeight:900,color:'#0f172a'}}>{user.display_name}</div>
                <div style={{fontSize:13,color:'#64748b'}}>{user.username||''}</div>
                {user.is_admin&&<span style={{fontSize:10,fontWeight:700,color:'#4f46e5',background:'#eef2ff',padding:'3px 10px',borderRadius:20,marginTop:6,display:'inline-block',letterSpacing:1}}>ADM</span>}
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:20}}>
              {[['🏃',`${user.km_total||0}km`,'KMs'],['⚑',points.filter(p=>p.owner_id===user.uid).length,'Territórios'],['⭐',user.points||0,'Pontos']].map(([ic,v,l])=>(
                <div key={l} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:'16px 10px',textAlign:'center',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
                  <div style={{fontSize:22,marginBottom:4}}>{ic}</div>
                  <div style={{fontSize:20,fontWeight:900,color:'#4f46e5'}}>{v}</div>
                  <div style={{fontSize:10,color:'#94a3b8',fontWeight:600,letterSpacing:1}}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:18,fontSize:12,color:'#64748b',lineHeight:1.8,boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
              <div style={{fontSize:13,fontWeight:700,color:'#4f46e5',marginBottom:10}}>🗺️ Ativar Google Maps real</div>
              <div>1. Acesse <strong style={{color:'#0f172a'}}>console.cloud.google.com</strong></div>
              <div>2. APIs → <strong style={{color:'#0f172a'}}>Maps JavaScript API</strong> → Ativar</div>
              <div>3. Credenciais → criar chave → copiar</div>
              <div>4. Cole em <strong style={{color:'#0f172a'}}>GMAPS_KEY</strong> no App.jsx</div>
              <div style={{marginTop:8,fontSize:11,color:'#94a3b8'}}>Seu UID: {user.uid}</div>
            </div>
          </div>
        )}

        {/* TOAST */}
        {toast&&(
          <div style={{position:'absolute',bottom:20,left:'50%',transform:'translateX(-50%)',background:tc.bg,border:`1px solid ${tc.border}`,borderRadius:12,padding:'12px 20px',zIndex:100,fontSize:13,fontWeight:600,color:tc.text,boxShadow:'0 8px 32px rgba(0,0,0,0.12)',whiteSpace:'nowrap',animation:'slideUp 0.3s ease'}}>
            {toast.msg}
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:2px}
        input,select{color-scheme:light}
      `}</style>
    </div>
  )
}
