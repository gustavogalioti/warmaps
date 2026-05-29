import { useState, useEffect, useRef, useCallback } from 'react'
import { initializeApp } from 'firebase/app'
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut
} from 'firebase/auth'
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, increment, writeBatch, Timestamp
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDM-f0GLqTZjRmEbil33uVwSAAtqMtCeVc",
  authDomain: "war-maps-5e8cf.firebaseapp.com",
  projectId: "war-maps-5e8cf",
  storageBucket: "war-maps-5e8cf.firebasestorage.app",
  messagingSenderId: "233503419698",
  appId: "1:233503419698:web:1b1d6dd3d8caf46d537b2b"
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

const CHECKIN_RADIUS_M = 300
const DECAY_DAYS = 5
const DECAY_RATE = 10
const SEASON_DURATION_DAYS = 30

const LEVEL_THRESHOLDS = [0,1,2,3,4,5,6,7,8,9,10,30,50,70,90,110,130,150,180,210,250]
const LEVEL_TITLES = ['Recruta','Iniciante','Explorador','Guerreiro','Veterano','Elite',
  'Mestre','Grão-Mestre','Lendário','Mítico','Imortal','Supremo','Titan','Warlord',
  'Conquistador','Dominador','Imperador','Semideus','Deus da Guerra','Supremo Eterno','IMORTAL']
const LEVEL_BADGES = ['🥚','🐣','🐥','🐓','🦅','⚔️','👑','💎','🏆','🔱','⚡','🌟','🔥','💀','🗡️','🛡️','🏰','🌍','🌌','☄️','🚀']
const CLAN_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#6366f1','#a855f7','#ec4899','#14b8a6','#f43f5e']
const CLAN_EMOJIS = ['⚔️','🐺','🦁','🐉','🦅','💀','🔥','⚡','🛡️','👑']

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function getLevel(km) {
  let level = 0
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (km >= LEVEL_THRESHOLDS[i]) level = i
    else break
  }
  return Math.min(level, LEVEL_THRESHOLDS.length - 1)
}

function getStrength(point) {
  if (!point.last_checkin) return 100
  const days = (Date.now() - point.last_checkin.toDate().getTime()) / 86400000
  if (days <= DECAY_DAYS) return 100
  return Math.max(0, Math.round(100 - (days - DECAY_DAYS) * DECAY_RATE))
}

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts.toDate().getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// ── LEAFLET MAP (loaded via CDN, no npm package) ─────────────────────────────
function LeafletMap({ points, warZones, battles, userPos, profiles, clans, onPointClick, onZoneClick, onMapClick, admMode, admForm, wzForm, profile }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef([])
  const zonesRef = useRef([])
  const userMarkerRef = useRef(null)
  const previewRef = useRef(null)

  // Load Leaflet CSS + JS once
  useEffect(() => {
    if (document.getElementById('leaflet-css')) return
    const link = document.createElement('link')
    link.id = 'leaflet-css'
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => initMap()
    document.head.appendChild(script)
  }, [])

  function initMap() {
    if (mapInstanceRef.current || !mapRef.current) return
    const L = window.L
    const map = L.map(mapRef.current, { zoomControl: true }).setView([-23.5505, -46.6333], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map)
    map.on('click', (e) => onMapClick(e.latlng))
    mapInstanceRef.current = map
  }

  // Wait for L to be ready then init
  useEffect(() => {
    if (window.L && !mapInstanceRef.current) initMap()
  })

  // Update markers when data changes
  useEffect(() => {
    const L = window.L
    const map = mapInstanceRef.current
    if (!L || !map) return

    // Clear old markers
    markersRef.current.forEach(m => map.removeLayer(m))
    markersRef.current = []
    zonesRef.current.forEach(z => map.removeLayer(z))
    zonesRef.current = []

    // War zones
    warZones.forEach(zone => {
      const daysLeft = zone.ends_at ? Math.ceil((zone.ends_at.toDate() - Date.now()) / 86400000) : '?'
      const circle = L.circle([zone.lat, zone.lng], {
        radius: zone.radius,
        color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.08, weight: 2, dashArray: '6 4'
      }).addTo(map)

      const icon = L.divIcon({
        html: `<div style="background:#ef4444;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(239,68,68,0.5)">⚔️</div>`,
        className: '', iconSize: [32,32], iconAnchor: [16,16]
      })
      const marker = L.marker([zone.lat, zone.lng], { icon }).addTo(map)
      marker.on('click', () => onZoneClick(zone))
      marker.bindTooltip(`⚔️ ${zone.name} (${daysLeft}d)`, { permanent: false })

      zonesRef.current.push(circle, marker)
    })

    // Conquest points
    points.forEach(point => {
      const strength = getStrength(point)
      const ownerProfile = point.owner_id ? profiles[point.owner_id] : null
      const ownerClan = ownerProfile?.clan_id ? clans.find(c => c.id === ownerProfile.clan_id) : null
      const color = ownerClan?.color || (point.owner_id ? '#6366f1' : '#94a3b8')
      const hasBattle = battles.some(b => b.point_id === point.id)
      const alpha = 0.4 + (strength / 100) * 0.6

      const icon = L.divIcon({
        html: `<div style="position:relative;width:28px;height:28px">
          <div style="width:28px;height:28px;border-radius:50%;background:${hasBattle?'#ef4444':color};opacity:${alpha};border:2.5px solid ${hasBattle?'#ef4444':color};box-shadow:0 2px 8px ${color}44"></div>
          ${strength < 70 ? `<div style="position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:${color};color:#fff;font-size:8px;font-weight:700;border-radius:6px;padding:1px 4px;white-space:nowrap">${strength}%</div>` : ''}
          ${hasBattle ? `<div style="position:absolute;top:-6px;right:-6px;font-size:10px">⚔️</div>` : ''}
        </div>`,
        className: '', iconSize: [28,28], iconAnchor: [14,14]
      })

      const marker = L.marker([point.lat, point.lng], { icon }).addTo(map)
      marker.on('click', () => onPointClick(point))
      marker.bindTooltip(`${point.name}${point.owner_name ? ` · ${point.owner_name}` : ' · Livre'} · ${strength}%`, { permanent: false })
      markersRef.current.push(marker)
    })
  }, [points, warZones, battles, profiles, clans])

  // User position
  useEffect(() => {
    const L = window.L
    const map = mapInstanceRef.current
    if (!L || !map || !userPos) return

    if (userMarkerRef.current) map.removeLayer(userMarkerRef.current)
    const icon = L.divIcon({
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,0.3)"></div>`,
      className: '', iconSize: [16,16], iconAnchor: [8,8]
    })
    userMarkerRef.current = L.marker([userPos.lat, userPos.lng], { icon }).addTo(map)
    if (!mapInstanceRef.current._hasCentered) {
      map.setView([userPos.lat, userPos.lng], 15)
      mapInstanceRef.current._hasCentered = true
    }
  }, [userPos])

  // ADM preview marker
  useEffect(() => {
    const L = window.L
    const map = mapInstanceRef.current
    if (!L || !map) return
    if (previewRef.current) { map.removeLayer(previewRef.current); previewRef.current = null }

    if (admMode === 'point' && admForm.lat) {
      const icon = L.divIcon({
        html: `<div style="width:24px;height:24px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 2px 8px rgba(16,185,129,0.5)"></div>`,
        className: '', iconSize: [24,24], iconAnchor: [12,12]
      })
      previewRef.current = L.marker([admForm.lat, admForm.lng], { icon }).addTo(map)
    } else if (admMode === 'warzone' && wzForm.lat) {
      previewRef.current = L.circle([wzForm.lat, wzForm.lng], {
        radius: Number(wzForm.radius),
        color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.15
      }).addTo(map)
    }
  }, [admMode, admForm.lat, admForm.lng, wzForm.lat, wzForm.lng, wzForm.radius])

  return <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
}

// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [tab, setTab] = useState('map')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const [points, setPoints] = useState([])
  const [warZones, setWarZones] = useState([])
  const [battles, setBattles] = useState([])
  const [profiles, setProfiles] = useState({})
  const [clans, setClans] = useState([])
  const [notifications, setNotifications] = useState([])
  const [season, setSeason] = useState(null)
  const [userPos, setUserPos] = useState(null)
  const [selectedPoint, setSelectedPoint] = useState(null)
  const [selectedZone, setSelectedZone] = useState(null)

  const [admMode, setAdmMode] = useState(null)
  const [admForm, setAdmForm] = useState({ name: '', type: 'neighborhood', lat: null, lng: null })
  const [wzForm, setWzForm] = useState({ name: '', days: 7, lat: null, lng: null, radius: 500 })

  const [myClan, setMyClan] = useState(null)
  const [clanInvites, setClanInvites] = useState([])
  const [rivalries, setRivalries] = useState([])
  const [showCreateClan, setShowCreateClan] = useState(false)
  const [clanForm, setClanForm] = useState({ name: '', description: '', color: CLAN_COLORS[0], emoji: CLAN_EMOJIS[0] })

  const showToast = useCallback((msg, type = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const snap = await getDoc(doc(db, 'profiles', u.uid))
        if (snap.exists()) setProfile(snap.data())
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const watcher = navigator.geolocation.watchPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watcher)
  }, [])

  useEffect(() => {
    const unsubs = []
    unsubs.push(onSnapshot(collection(db, 'conquest_points'), snap => {
      setPoints(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }))
    unsubs.push(onSnapshot(collection(db, 'war_zones'), snap => {
      const now = Date.now()
      setWarZones(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(z => !z.ends_at || z.ends_at.toDate().getTime() > now))
    }))
    unsubs.push(onSnapshot(query(collection(db, 'battles'), where('status', '==', 'active')), snap => {
      setBattles(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }))
    unsubs.push(onSnapshot(collection(db, 'profiles'), snap => {
      const map = {}
      snap.docs.forEach(d => { map[d.id] = d.data() })
      setProfiles(map)
    }))
    unsubs.push(onSnapshot(collection(db, 'clans'), snap => {
      setClans(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }))
    unsubs.push(onSnapshot(query(collection(db, 'seasons'), orderBy('created_at', 'desc'), limit(1)), snap => {
      if (!snap.empty) setSeason({ id: snap.docs[0].id, ...snap.docs[0].data() })
    }))
    return () => unsubs.forEach(u => u())
  }, [])

  useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, 'notifications'), where('to_uid', '==', user.uid), where('read', '==', false), limit(20)),
      snap => setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [user])

  useEffect(() => {
    if (!profile?.clan_id) { setMyClan(null); return }
    setMyClan(clans.find(c => c.id === profile.clan_id) || null)
  }, [profile, clans])

  useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, 'clan_invites'), where('to_uid', '==', user.uid), where('status', '==', 'pending')),
      snap => setClanInvites(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [user])

  useEffect(() => {
    if (!user) return
    return onSnapshot(
      query(collection(db, 'rivalries'), where('players', 'array-contains', user.uid)),
      snap => setRivalries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
  }, [user])

  const handleMapClick = useCallback((latlng) => {
    if (!profile?.is_admin) return
    if (admMode === 'point') setAdmForm(f => ({ ...f, lat: latlng.lat, lng: latlng.lng }))
    else if (admMode === 'warzone') setWzForm(f => ({ ...f, lat: latlng.lat, lng: latlng.lng }))
  }, [profile, admMode])

  const createPoint = async () => {
    if (!admForm.name || !admForm.lat) return showToast('Clique no mapa primeiro', 'err')
    await addDoc(collection(db, 'conquest_points'), {
      name: admForm.name, type: admForm.type,
      lat: admForm.lat, lng: admForm.lng,
      owner_id: null, owner_name: null, clan_id: null,
      last_checkin: null, checkin_count: 0, created_at: serverTimestamp()
    })
    setAdmForm({ name: '', type: 'neighborhood', lat: null, lng: null })
    setAdmMode(null)
    showToast('Ponto criado!', 'ok')
  }

  const createWarZone = async () => {
    if (!wzForm.name || !wzForm.lat) return showToast('Clique no mapa para posicionar', 'err')
    const endsAt = new Date(Date.now() + wzForm.days * 86400000)
    await addDoc(collection(db, 'war_zones'), {
      name: wzForm.name, lat: wzForm.lat, lng: wzForm.lng,
      radius: Number(wzForm.radius), days: Number(wzForm.days),
      ends_at: Timestamp.fromDate(endsAt),
      created_by: user.uid, created_at: serverTimestamp(),
      winner_uid: null, winner_name: null
    })
    setWzForm({ name: '', days: 7, lat: null, lng: null, radius: 500 })
    setAdmMode(null)
    showToast('Zona de Guerra criada!', 'ok')
  }

  const doCheckin = async (point) => {
    if (!user || !userPos) return showToast('GPS necessário', 'err')
    const dist = calcDistance(userPos.lat, userPos.lng, point.lat, point.lng)
    if (dist > CHECKIN_RADIUS_M) return showToast(`Você está a ${Math.round(dist)}m. Precisa estar a ${CHECKIN_RADIUS_M}m`, 'warn')

    const prevOwner = point.owner_id
    const batch = writeBatch(db)
    batch.update(doc(db, 'conquest_points', point.id), {
      owner_id: user.uid, owner_name: profile.display_name,
      clan_id: profile.clan_id || null,
      last_checkin: serverTimestamp(), checkin_count: increment(1)
    })
    batch.set(doc(collection(db, 'checkins')), {
      user_id: user.uid, point_id: point.id, point_name: point.name,
      lat: userPos.lat, lng: userPos.lng, created_at: serverTimestamp()
    })
    batch.update(doc(db, 'profiles', user.uid), {
      points: increment(prevOwner === user.uid ? 10 : 25)
    })
    await batch.commit()

    if (prevOwner && prevOwner !== user.uid) {
      await addDoc(collection(db, 'notifications'), {
        to_uid: prevOwner, from_uid: user.uid, from_name: profile.display_name,
        type: 'conquest', point_name: point.name,
        message: `${profile.display_name} tomou seu território: ${point.name}!`,
        read: false, created_at: serverTimestamp()
      })
      const key = [user.uid, prevOwner].sort().join('_')
      const rRef = doc(db, 'rivalries', key)
      const rSnap = await getDoc(rRef)
      if (rSnap.exists()) {
        await updateDoc(rRef, { count: increment(1), last_event: serverTimestamp(), [`score_${user.uid}`]: increment(1) })
      } else {
        await setDoc(rRef, { players: [user.uid, prevOwner], count: 1, last_event: serverTimestamp(), [`score_${user.uid}`]: 1, [`score_${prevOwner}`]: 0, created_at: serverTimestamp() })
      }
    }

    for (const zone of warZones) {
      if (calcDistance(userPos.lat, userPos.lng, zone.lat, zone.lng) <= zone.radius) {
        await addDoc(collection(db, 'wz_checkins'), {
          zone_id: zone.id, user_id: user.uid, user_name: profile.display_name,
          clan_id: profile.clan_id || null, created_at: serverTimestamp()
        })
      }
    }

    setSelectedPoint(null)
    showToast(`${point.name} conquistado!`, 'ok')
    const snap = await getDoc(doc(db, 'profiles', user.uid))
    if (snap.exists()) setProfile(snap.data())
  }

  const createClan = async () => {
    if (!clanForm.name.trim()) return showToast('Nome obrigatório', 'err')
    if (profile?.clan_id) return showToast('Saia do seu clan primeiro', 'err')
    const clanRef = await addDoc(collection(db, 'clans'), {
      name: clanForm.name.trim(), description: clanForm.description,
      color: clanForm.color, emoji: clanForm.emoji,
      owner_id: user.uid, owner_name: profile.display_name,
      members: [user.uid], member_count: 1, created_at: serverTimestamp()
    })
    await updateDoc(doc(db, 'profiles', user.uid), { clan_id: clanRef.id })
    const snap = await getDoc(doc(db, 'profiles', user.uid))
    if (snap.exists()) setProfile(snap.data())
    setShowCreateClan(false)
    setClanForm({ name: '', description: '', color: CLAN_COLORS[0], emoji: CLAN_EMOJIS[0] })
    showToast(`Clan ${clanForm.name} criado!`, 'ok')
  }

  const leaveClan = async () => {
    if (!profile?.clan_id) return
    const clanRef = doc(db, 'clans', profile.clan_id)
    const clanSnap = await getDoc(clanRef)
    if (!clanSnap.exists()) return
    const clanData = clanSnap.data()
    const newMembers = (clanData.members || []).filter(m => m !== user.uid)
    if (newMembers.length === 0) await deleteDoc(clanRef)
    else await updateDoc(clanRef, { members: newMembers, member_count: newMembers.length, ...(clanData.owner_id === user.uid ? { owner_id: newMembers[0] } : {}) })
    await updateDoc(doc(db, 'profiles', user.uid), { clan_id: null })
    const snap = await getDoc(doc(db, 'profiles', user.uid))
    if (snap.exists()) setProfile(snap.data())
    showToast('Você saiu do clan', 'info')
  }

  const respondInvite = async (invite, accept) => {
    if (accept) {
      const clanSnap = await getDoc(doc(db, 'clans', invite.clan_id))
      if (!clanSnap.exists()) return showToast('Clan não existe mais', 'err')
      if (profile?.clan_id) await leaveClan()
      await updateDoc(doc(db, 'clans', invite.clan_id), { members: [...(clanSnap.data().members || []), user.uid], member_count: increment(1) })
      await updateDoc(doc(db, 'profiles', user.uid), { clan_id: invite.clan_id })
      const snap = await getDoc(doc(db, 'profiles', user.uid))
      if (snap.exists()) setProfile(snap.data())
      showToast(`Entrou no clan ${invite.clan_name}!`, 'ok')
    }
    await deleteDoc(doc(db, 'clan_invites', invite.id))
  }

  const inviteToClan = async (targetUid) => {
    if (!profile?.clan_id) return showToast('Você não está em nenhum clan', 'err')
    await addDoc(collection(db, 'clan_invites'), {
      clan_id: profile.clan_id, clan_name: myClan?.name,
      from_uid: user.uid, from_name: profile.display_name,
      to_uid: targetUid, status: 'pending', created_at: serverTimestamp()
    })
    showToast('Convite enviado!', 'ok')
  }

  const createSeason = async () => {
    await addDoc(collection(db, 'seasons'), {
      name: `Temporada ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
      ends_at: Timestamp.fromDate(new Date(Date.now() + SEASON_DURATION_DAYS * 86400000)),
      created_at: serverTimestamp(), active: true
    })
    showToast('Nova temporada iniciada!', 'ok')
  }

  if (!user && !loading) return <AuthScreen auth={auth} db={db} showToast={showToast} />
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0f172a', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:48 }}>⚔️</div>
      <div style={{ color:'#94a3b8', fontSize:14 }}>Carregando War Maps...</div>
    </div>
  )

  const level = getLevel(profile?.km_total || 0)
  const myPoints = points.filter(p => p.owner_id === user?.uid)
  const myRivalry = rivalries.reduce((best, r) => (!best || r.count > best.count) ? r : best, null)

  return (
    <div style={{ height:'100dvh', display:'flex', flexDirection:'column', background:'#f1f5f9', fontFamily:"'Inter',system-ui,sans-serif", overflow:'hidden' }}>

      {/* HEADER */}
      <header style={{ background:'#fff', borderBottom:'1px solid #e2e8f0', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', zIndex:10, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:20, fontWeight:900, background:'linear-gradient(135deg,#ef4444,#f97316)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>⚔ WAR MAPS</span>
          {season && <span style={{ fontSize:10, background:'#fef3c7', color:'#92400e', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>🏆 {season.name}</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {notifications.length > 0 && (
            <button onClick={() => setTab('notifications')} style={{ position:'relative', background:'none', border:'none', cursor:'pointer', fontSize:20, padding:4 }}>
              🔔
              <span style={{ position:'absolute', top:0, right:0, background:'#ef4444', color:'#fff', fontSize:9, fontWeight:700, borderRadius:'50%', width:14, height:14, display:'flex', alignItems:'center', justifyContent:'center' }}>{notifications.length}</span>
            </button>
          )}
          {clanInvites.length > 0 && (
            <button onClick={() => setTab('clan')} style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:700, color:'#92400e', cursor:'pointer' }}>
              ⚔️ {clanInvites.length} convite{clanInvites.length > 1 ? 's' : ''}
            </button>
          )}
          <div style={{ background:'#f8fafc', borderRadius:20, padding:'4px 10px', border:'1px solid #e2e8f0', fontSize:12, fontWeight:700, color:'#0f172a' }}>
            {LEVEL_BADGES[level]} {LEVEL_TITLES[level]}
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <div style={{ flex:1, overflow:'hidden', position:'relative' }}>

        {tab === 'map' && (
          <div style={{ height:'100%', position:'relative' }}>
            <LeafletMap
              points={points} warZones={warZones} battles={battles}
              userPos={userPos} profiles={profiles} clans={clans}
              onPointClick={setSelectedPoint} onZoneClick={setSelectedZone}
              onMapClick={handleMapClick} admMode={admMode}
              admForm={admForm} wzForm={wzForm} profile={profile}
            />

            {userPos && (
              <div style={{ position:'absolute', bottom:80, left:16, background:'rgba(255,255,255,0.95)', borderRadius:10, padding:'6px 12px', fontSize:11, color:'#64748b', boxShadow:'0 2px 8px rgba(0,0,0,0.1)', zIndex:1000 }}>
                📍 GPS ±{Math.round(userPos.acc||0)}m
              </div>
            )}

            {profile?.is_admin && (
              <div style={{ position:'absolute', top:12, right:12, zIndex:1000, display:'flex', flexDirection:'column', gap:6 }}>
                <button onClick={() => setAdmMode(admMode==='point'?null:'point')} style={{ padding:'8px 14px', background:admMode==='point'?'#10b981':'#fff', color:admMode==='point'?'#fff':'#0f172a', border:'1px solid #e2e8f0', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.1)' }}>
                  {admMode==='point'?'✕ Cancelar':'📍 Add Ponto'}
                </button>
                <button onClick={() => setAdmMode(admMode==='warzone'?null:'warzone')} style={{ padding:'8px 14px', background:admMode==='warzone'?'#ef4444':'#fff', color:admMode==='warzone'?'#fff':'#0f172a', border:'1px solid #e2e8f0', borderRadius:10, fontSize:12, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.1)' }}>
                  {admMode==='warzone'?'✕ Cancelar':'⚔️ Zona de Guerra'}
                </button>
              </div>
            )}

            {admMode==='point' && (
              <div style={{ position:'absolute', bottom:80, right:12, background:'#fff', borderRadius:14, padding:16, boxShadow:'0 4px 24px rgba(0,0,0,0.15)', zIndex:1000, width:240 }}>
                <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>{admForm.lat?`${admForm.lat.toFixed(4)}, ${admForm.lng.toFixed(4)}`:'Clique no mapa...'}</div>
                <input value={admForm.name} onChange={e=>setAdmForm(f=>({...f,name:e.target.value}))} placeholder="Nome do bairro" style={{ width:'100%', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, marginBottom:8, boxSizing:'border-box' }}/>
                <select value={admForm.type} onChange={e=>setAdmForm(f=>({...f,type:e.target.value}))} style={{ width:'100%', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, marginBottom:10, boxSizing:'border-box' }}>
                  <option value="neighborhood">Bairro</option>
                  <option value="district">Distrito</option>
                  <option value="area">Área</option>
                  <option value="landmark">Ponto turístico</option>
                </select>
                <button onClick={createPoint} disabled={!admForm.lat||!admForm.name} style={{ width:'100%', padding:'9px', background:'#10b981', color:'#fff', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer' }}>Criar ponto</button>
              </div>
            )}

            {admMode==='warzone' && (
              <div style={{ position:'absolute', bottom:80, right:12, background:'#fff', borderRadius:14, padding:16, boxShadow:'0 4px 24px rgba(0,0,0,0.15)', zIndex:1000, width:260 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#ef4444', marginBottom:8 }}>⚔️ Nova Zona de Guerra</div>
                <div style={{ fontSize:11, color:'#94a3b8', marginBottom:8 }}>{wzForm.lat?`${wzForm.lat.toFixed(4)}, ${wzForm.lng.toFixed(4)}`:'Clique no mapa...'}</div>
                <input value={wzForm.name} onChange={e=>setWzForm(f=>({...f,name:e.target.value}))} placeholder="Nome da zona" style={{ width:'100%', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, marginBottom:8, boxSizing:'border-box' }}/>
                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:'#64748b', marginBottom:3 }}>Dias</div>
                    <input type="number" value={wzForm.days} onChange={e=>setWzForm(f=>({...f,days:e.target.value}))} min="1" max="30" style={{ width:'100%', padding:'6px 8px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, boxSizing:'border-box' }}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:'#64748b', marginBottom:3 }}>Raio (m)</div>
                    <input type="number" value={wzForm.radius} onChange={e=>setWzForm(f=>({...f,radius:e.target.value}))} min="100" max="5000" style={{ width:'100%', padding:'6px 8px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, boxSizing:'border-box' }}/>
                  </div>
                </div>
                <button onClick={createWarZone} disabled={!wzForm.lat||!wzForm.name} style={{ width:'100%', padding:'9px', background:'#ef4444', color:'#fff', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer' }}>⚔️ Criar Zona de Guerra</button>
              </div>
            )}

            {selectedPoint && (
              <PointPanel point={selectedPoint} onClose={()=>setSelectedPoint(null)} onCheckin={()=>doCheckin(selectedPoint)}
                user={user} userPos={userPos} profiles={profiles} clans={clans} battles={battles} profile={profile} onInvite={inviteToClan}/>
            )}
            {selectedZone && (
              <WarZonePanel zone={selectedZone} onClose={()=>setSelectedZone(null)} user={user} userPos={userPos} db={db} profiles={profiles} clans={clans}/>
            )}
          </div>
        )}

        {tab==='ranking' && <RankingView profiles={profiles} points={points} clans={clans} season={season} user={user}/>}
        {tab==='clan' && <ClanView user={user} profile={profile} clans={clans} myClan={myClan} profiles={profiles} clanInvites={clanInvites} clanForm={clanForm} setClanForm={setClanForm} showCreateClan={showCreateClan} setShowCreateClan={setShowCreateClan} onCreateClan={createClan} onLeaveClan={leaveClan} onRespondInvite={respondInvite} onInvite={inviteToClan} points={points}/>}
        {tab==='notifications' && <NotificationsView notifications={notifications} onMarkRead={id=>updateDoc(doc(db,'notifications',id),{read:true})} onMarkAll={()=>notifications.forEach(n=>updateDoc(doc(db,'notifications',n.id),{read:true}))}/>}
        {tab==='profile' && <ProfileView user={user} profile={profile} setProfile={setProfile} db={db} myPoints={myPoints} level={level} myClan={myClan} myRivalry={myRivalry} profiles={profiles} rivalries={rivalries} onSignOut={()=>signOut(auth)} season={season} onCreateSeason={createSeason}/>}
      </div>

      {/* BOTTOM NAV */}
      <nav style={{ background:'#fff', borderTop:'1px solid #e2e8f0', display:'flex', flexShrink:0 }}>
        {[{id:'map',icon:'🗺',label:'Mapa'},{id:'ranking',icon:'🏆',label:'Ranking'},{id:'clan',icon:'⚔️',label:'Clans'},{id:'notifications',icon:'🔔',label:'Alertas',badge:notifications.length},{id:'profile',icon:'👤',label:'Perfil'}].map(item=>(
          <button key={item.id} onClick={()=>setTab(item.id)} style={{ flex:1, padding:'10px 4px 6px', background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:2, position:'relative' }}>
            <span style={{ fontSize:20 }}>{item.icon}</span>
            <span style={{ fontSize:9, color:tab===item.id?'#ef4444':'#94a3b8', fontWeight:tab===item.id?700:400 }}>{item.label}</span>
            {tab===item.id && <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:24, height:2, background:'#ef4444', borderRadius:1 }}/>}
            {item.badge>0 && <div style={{ position:'absolute', top:6, right:'50%', marginRight:-18, background:'#ef4444', color:'#fff', fontSize:8, fontWeight:700, borderRadius:'50%', width:13, height:13, display:'flex', alignItems:'center', justifyContent:'center' }}>{item.badge}</div>}
          </button>
        ))}
      </nav>

      {toast && (
        <div style={{ position:'fixed', bottom:80, left:'50%', transform:'translateX(-50%)', background:toast.type==='err'?'#fee2e2':toast.type==='ok'?'#dcfce7':'#f0f9ff', border:`1px solid ${toast.type==='err'?'#fca5a5':toast.type==='ok'?'#86efac':'#bae6fd'}`, color:toast.type==='err'?'#991b1b':toast.type==='ok'?'#166534':'#0c4a6e', borderRadius:12, padding:'10px 20px', zIndex:9999, fontSize:13, fontWeight:600, boxShadow:'0 4px 16px rgba(0,0,0,0.12)', whiteSpace:'nowrap' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── POINT PANEL ───────────────────────────────────────────────────────────────
function PointPanel({ point, onClose, onCheckin, user, userPos, profiles, clans, battles, profile, onInvite }) {
  const strength = getStrength(point)
  const dist = userPos ? Math.round(calcDistance(userPos.lat, userPos.lng, point.lat, point.lng)) : null
  const inRange = dist !== null && dist <= CHECKIN_RADIUS_M
  const ownerProfile = point.owner_id ? profiles[point.owner_id] : null
  const ownerClan = ownerProfile?.clan_id ? clans.find(c => c.id === ownerProfile.clan_id) : null
  const battle = battles.find(b => b.point_id === point.id)
  const daysAgo = point.last_checkin ? Math.round((Date.now() - point.last_checkin.toDate().getTime()) / 86400000) : null

  return (
    <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'#fff', borderRadius:'20px 20px 0 0', padding:20, boxShadow:'0 -4px 32px rgba(0,0,0,0.15)', zIndex:1000, maxHeight:'60vh', overflowY:'auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:900, color:'#0f172a' }}>{point.name}</div>
          <div style={{ fontSize:12, color:'#94a3b8' }}>{point.type==='neighborhood'?'Bairro':point.type}</div>
        </div>
        <button onClick={onClose} style={{ background:'#f1f5f9', border:'none', borderRadius:'50%', width:30, height:30, cursor:'pointer', fontSize:16 }}>✕</button>
      </div>

      <div style={{ marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <span style={{ fontSize:11, color:'#64748b', fontWeight:600 }}>FORÇA DO TERRITÓRIO</span>
          <span style={{ fontSize:11, fontWeight:700, color:strength>60?'#22c55e':strength>30?'#f97316':'#ef4444' }}>{strength}%</span>
        </div>
        <div style={{ background:'#f1f5f9', borderRadius:4, height:6 }}>
          <div style={{ height:'100%', width:`${strength}%`, background:strength>60?'#22c55e':strength>30?'#f97316':'#ef4444', borderRadius:4 }}/>
        </div>
        {daysAgo!==null && <div style={{ fontSize:10, color:'#94a3b8', marginTop:3 }}>Último check-in: {daysAgo===0?'hoje':`${daysAgo}d atrás`}</div>}
      </div>

      {point.owner_id ? (
        <div style={{ background:'#f8fafc', borderRadius:12, padding:'10px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:ownerClan?.color||'#6366f1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
            {ownerClan?.emoji||'👤'}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{point.owner_name}</div>
            {ownerClan && <div style={{ fontSize:11, color:ownerClan.color, fontWeight:600 }}>⚔️ {ownerClan.name}</div>}
          </div>
          {point.owner_id!==user?.uid && profile?.clan_id && (
            <button onClick={()=>onInvite(point.owner_id)} style={{ padding:'5px 10px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, fontSize:11, color:'#166534', cursor:'pointer' }}>Convidar</button>
          )}
        </div>
      ) : (
        <div style={{ background:'#f0fdf4', borderRadius:12, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#166534', fontWeight:600 }}>
          🟢 Território livre — seja o primeiro!
        </div>
      )}

      {battle && (
        <div style={{ background:'#fef2f2', borderRadius:12, padding:'10px 14px', marginBottom:12, border:'1px solid #fecaca' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#ef4444' }}>⚔️ BATALHA EM ANDAMENTO</div>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:inRange?'#22c55e':'#f97316' }}/>
        <span style={{ fontSize:12, color:inRange?'#166534':'#9a3412' }}>
          {dist!==null?`${dist}m`:'...'} {inRange?'— No raio!':`— Precisa de ${CHECKIN_RADIUS_M}m`}
        </span>
      </div>

      <button onClick={onCheckin} disabled={!inRange||!user} style={{ width:'100%', padding:'13px', background:inRange?'linear-gradient(135deg,#ef4444,#f97316)':'#e2e8f0', color:inRange?'#fff':'#94a3b8', border:'none', borderRadius:12, fontWeight:800, fontSize:15, cursor:inRange?'pointer':'not-allowed' }}>
        {inRange?'⚑ CONQUISTAR':'📍 Chegue mais perto'}
      </button>
    </div>
  )
}

// ── WAR ZONE PANEL ────────────────────────────────────────────────────────────
function WarZonePanel({ zone, onClose, user, userPos, db, profiles, clans }) {
  const [leaderboard, setLeaderboard] = useState([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'wz_checkins'), where('zone_id', '==', zone.id), orderBy('created_at', 'desc'), limit(100)),
      snap => {
        const data = snap.docs.map(d => d.data())
        setTotal(data.length)
        const scores = {}
        data.forEach(c => {
          if (!scores[c.user_id]) scores[c.user_id] = { user_id:c.user_id, user_name:c.user_name, clan_id:c.clan_id, count:0 }
          scores[c.user_id].count++
        })
        setLeaderboard(Object.values(scores).sort((a,b)=>b.count-a.count).slice(0,10))
      }
    )
  }, [zone.id, db])

  const daysLeft = zone.ends_at ? Math.ceil((zone.ends_at.toDate()-Date.now())/86400000) : '?'
  const dist = userPos ? Math.round(calcDistance(userPos.lat, userPos.lng, zone.lat, zone.lng)) : null
  const inZone = dist !== null && dist <= zone.radius

  return (
    <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'#fff', borderRadius:'20px 20px 0 0', padding:20, boxShadow:'0 -4px 32px rgba(0,0,0,0.15)', zIndex:1000, maxHeight:'70vh', overflowY:'auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div>
          <div style={{ fontSize:18, fontWeight:900, color:'#ef4444' }}>⚔️ {zone.name}</div>
          <div style={{ fontSize:11, color:'#94a3b8' }}>Zona de Guerra · {daysLeft}d restantes · raio {zone.radius}m</div>
        </div>
        <button onClick={onClose} style={{ background:'#f1f5f9', border:'none', borderRadius:'50%', width:30, height:30, cursor:'pointer', fontSize:16 }}>✕</button>
      </div>
      <div style={{ background:'#fef2f2', borderRadius:12, padding:'10px 14px', marginBottom:14, border:'1px solid #fecaca', fontSize:12, color:'#991b1b' }}>
        🏆 Mais check-ins ao final = troféu permanente no mapa!
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:inZone?'#22c55e':'#f97316' }}/>
        <span style={{ fontSize:12, color:inZone?'#166534':'#9a3412' }}>{dist!==null?`${dist}m do centro`:'...'} {inZone?'— Você está na zona!':''}</span>
      </div>
      <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:10 }}>PLACAR ({total} check-ins)</div>
      {leaderboard.length===0 ? (
        <div style={{ textAlign:'center', color:'#94a3b8', fontSize:13, padding:20 }}>Nenhum check-in ainda. Seja o primeiro!</div>
      ) : leaderboard.map((entry, i) => {
        const clan = entry.clan_id ? clans.find(c=>c.id===entry.clan_id) : null
        const isMe = entry.user_id===user?.uid
        return (
          <div key={entry.user_id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:10, background:isMe?'#fef2f2':i===0?'#fffbeb':'#f8fafc', marginBottom:6, border:isMe?'1px solid #fecaca':'1px solid transparent' }}>
            <span style={{ fontSize:16, width:24, textAlign:'center' }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700 }}>{entry.user_name}{isMe?' (você)':''}</div>
              {clan && <div style={{ fontSize:10, color:clan.color, fontWeight:600 }}>{clan.emoji} {clan.name}</div>}
            </div>
            <span style={{ fontSize:14, fontWeight:800, color:'#ef4444' }}>{entry.count}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── RANKING VIEW ──────────────────────────────────────────────────────────────
function RankingView({ profiles, points, clans, season, user }) {
  const [rankTab, setRankTab] = useState('players')

  const playerRanking = Object.entries(profiles)
    .map(([id,p]) => ({ id, ...p, territories: points.filter(pt=>pt.owner_id===id).length }))
    .sort((a,b) => (b.points||0)-(a.points||0)).slice(0,50)

  const clanRanking = clans.map(c => {
    const members = Object.entries(profiles).filter(([,p])=>p.clan_id===c.id)
    return { ...c, totalPts: members.reduce((s,[,p])=>s+(p.points||0),0), totalTerr: points.filter(p=>p.clan_id===c.id).length, memberCount: members.length }
  }).sort((a,b)=>b.totalPts-a.totalPts)

  return (
    <div style={{ height:'100%', overflowY:'auto', background:'#f8fafc' }}>
      <div style={{ padding:'16px 16px 0' }}>
        {season && (
          <div style={{ background:'linear-gradient(135deg,#fbbf24,#f59e0b)', borderRadius:14, padding:'12px 16px', marginBottom:14, color:'#78350f' }}>
            <div style={{ fontSize:13, fontWeight:800 }}>🏆 {season.name}</div>
            <div style={{ fontSize:11, marginTop:2 }}>Encerra em {season.ends_at?Math.ceil((season.ends_at.toDate()-Date.now())/86400000):'?'}d</div>
          </div>
        )}
        <div style={{ display:'flex', background:'#fff', borderRadius:12, padding:4, marginBottom:14, border:'1px solid #e2e8f0' }}>
          {[{id:'players',label:'👤 Jogadores'},{id:'clans',label:'⚔️ Clans'}].map(t=>(
            <button key={t.id} onClick={()=>setRankTab(t.id)} style={{ flex:1, padding:'8px', background:rankTab===t.id?'#ef4444':'none', color:rankTab===t.id?'#fff':'#64748b', border:'none', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer' }}>{t.label}</button>
          ))}
        </div>
      </div>
      <div style={{ padding:'0 16px 16px' }}>
        {rankTab==='players' ? playerRanking.map((p,i) => {
          const level = getLevel(p.km_total||0)
          const clan = p.clan_id ? clans.find(c=>c.id===p.clan_id) : null
          const isMe = p.id===user?.uid
          return (
            <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, background:isMe?'#fef2f2':'#fff', borderRadius:12, padding:'12px 14px', marginBottom:8, border:isMe?'1px solid #fecaca':'1px solid #f1f5f9' }}>
              <span style={{ fontSize:16, width:28, textAlign:'center' }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{p.display_name}{isMe?' (você)':''}</div>
                <div style={{ fontSize:11, color:'#64748b' }}>{LEVEL_BADGES[level]} {LEVEL_TITLES[level]} · {(p.km_total||0).toFixed(1)}km · {p.territories}🚩</div>
                {clan && <div style={{ fontSize:10, color:clan.color, fontWeight:600 }}>{clan.emoji} {clan.name}</div>}
              </div>
              <span style={{ fontSize:16, fontWeight:800, color:'#ef4444' }}>{p.points||0}</span>
            </div>
          )
        }) : clanRanking.map((c,i) => (
          <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, background:'#fff', borderRadius:12, padding:'12px 14px', marginBottom:8, border:'1px solid #f1f5f9' }}>
            <span style={{ fontSize:16, width:28, textAlign:'center' }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}º`}</span>
            <div style={{ width:36, height:36, borderRadius:'50%', background:c.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{c.emoji}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700 }}>{c.name}</div>
              <div style={{ fontSize:11, color:'#64748b' }}>{c.memberCount} membros · {c.totalTerr}🚩</div>
            </div>
            <span style={{ fontSize:16, fontWeight:800, color:c.color }}>{c.totalPts}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── CLAN VIEW ─────────────────────────────────────────────────────────────────
function ClanView({ user, profile, clans, myClan, profiles, clanInvites, clanForm, setClanForm, showCreateClan, setShowCreateClan, onCreateClan, onLeaveClan, onRespondInvite, onInvite, points }) {
  const [search, setSearch] = useState('')
  const [viewClan, setViewClan] = useState(null)

  if (showCreateClan) return (
    <div style={{ height:'100%', overflowY:'auto', padding:20, background:'#f8fafc' }}>
      <button onClick={()=>setShowCreateClan(false)} style={{ background:'none', border:'none', color:'#6366f1', fontSize:14, cursor:'pointer', marginBottom:16 }}>← Voltar</button>
      <div style={{ fontSize:20, fontWeight:900, marginBottom:20 }}>⚔️ Criar Clan</div>
      <input value={clanForm.name} onChange={e=>setClanForm(f=>({...f,name:e.target.value}))} placeholder="Nome do clan" style={{ width:'100%', padding:'12px 14px', border:'1px solid #e2e8f0', borderRadius:12, fontSize:14, marginBottom:10, boxSizing:'border-box' }}/>
      <textarea value={clanForm.description} onChange={e=>setClanForm(f=>({...f,description:e.target.value}))} placeholder="Descrição (opcional)" rows={3} style={{ width:'100%', padding:'12px 14px', border:'1px solid #e2e8f0', borderRadius:12, fontSize:14, marginBottom:14, resize:'none', boxSizing:'border-box' }}/>
      <div style={{ fontSize:13, fontWeight:700, color:'#64748b', marginBottom:8 }}>COR</div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        {CLAN_COLORS.map(c=>(
          <div key={c} onClick={()=>setClanForm(f=>({...f,color:c}))} style={{ width:32, height:32, borderRadius:'50%', background:c, cursor:'pointer', border:clanForm.color===c?'3px solid #0f172a':'2px solid transparent', transform:clanForm.color===c?'scale(1.2)':'scale(1)' }}/>
        ))}
      </div>
      <div style={{ fontSize:13, fontWeight:700, color:'#64748b', marginBottom:8 }}>EMBLEMA</div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
        {CLAN_EMOJIS.map(e=>(
          <div key={e} onClick={()=>setClanForm(f=>({...f,emoji:e}))} style={{ width:40, height:40, borderRadius:10, background:clanForm.emoji===e?clanForm.color:'#f1f5f9', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, cursor:'pointer' }}>{e}</div>
        ))}
      </div>
      <div style={{ background:'#fff', borderRadius:14, padding:16, marginBottom:20, display:'flex', alignItems:'center', gap:14, border:'1px solid #e2e8f0' }}>
        <div style={{ width:50, height:50, borderRadius:'50%', background:clanForm.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>{clanForm.emoji}</div>
        <div>
          <div style={{ fontSize:16, fontWeight:800 }}>{clanForm.name||'Nome do clan'}</div>
          <div style={{ fontSize:11, color:'#94a3b8' }}>{clanForm.description||'Descrição'}</div>
        </div>
      </div>
      <button onClick={onCreateClan} style={{ width:'100%', padding:14, background:clanForm.color, color:'#fff', border:'none', borderRadius:12, fontWeight:800, fontSize:15, cursor:'pointer' }}>⚔️ CRIAR CLAN</button>
    </div>
  )

  if (viewClan) {
    const members = Object.entries(profiles).filter(([,p])=>p.clan_id===viewClan.id)
    const clanPoints = points.filter(p=>p.clan_id===viewClan.id)
    return (
      <div style={{ height:'100%', overflowY:'auto', background:'#f8fafc' }}>
        <div style={{ background:`linear-gradient(135deg,${viewClan.color}22,${viewClan.color}11)`, padding:20, borderBottom:`3px solid ${viewClan.color}` }}>
          <button onClick={()=>setViewClan(null)} style={{ background:'none', border:'none', color:viewClan.color, fontSize:14, cursor:'pointer', marginBottom:10 }}>← Voltar</button>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:60, height:60, borderRadius:'50%', background:viewClan.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:30 }}>{viewClan.emoji}</div>
            <div>
              <div style={{ fontSize:22, fontWeight:900 }}>{viewClan.name}</div>
              <div style={{ fontSize:12, color:'#64748b' }}>{viewClan.description}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:14 }}>
            {[['👥',members.length,'Membros'],['🚩',clanPoints.length,'Territórios']].map(([ic,v,l])=>(
              <div key={l} style={{ flex:1, background:'#fff', borderRadius:10, padding:'8px 12px', textAlign:'center', border:`1px solid ${viewClan.color}44` }}>
                <div style={{ fontSize:16 }}>{ic}</div>
                <div style={{ fontSize:18, fontWeight:900, color:viewClan.color }}>{v}</div>
                <div style={{ fontSize:10, color:'#94a3b8' }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding:16 }}>
          {members.map(([id,p])=>(
            <div key={id} style={{ display:'flex', alignItems:'center', gap:10, background:'#fff', borderRadius:10, padding:'10px 14px', marginBottom:8 }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:viewClan.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>{viewClan.emoji}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{p.display_name}{viewClan.owner_id===id?' 👑':''}</div>
                <div style={{ fontSize:11, color:'#94a3b8' }}>{(p.km_total||0).toFixed(1)}km · {p.points||0}pts</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const filtered = clans.filter(c=>c.name.toLowerCase().includes(search.toLowerCase()))
  return (
    <div style={{ height:'100%', overflowY:'auto', background:'#f8fafc' }}>
      <div style={{ padding:'16px 16px 0' }}>
        {clanInvites.map(invite=>(
          <div key={invite.id} style={{ background:'#fffbeb', borderRadius:12, padding:'12px 14px', marginBottom:10, border:'1px solid #fde68a' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#92400e', marginBottom:4 }}>⚔️ Convite: <b>{invite.clan_name}</b></div>
            <div style={{ fontSize:12, color:'#78350f', marginBottom:10 }}>De {invite.from_name}</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>onRespondInvite(invite,true)} style={{ flex:1, padding:'8px', background:'#22c55e', color:'#fff', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer' }}>Aceitar</button>
              <button onClick={()=>onRespondInvite(invite,false)} style={{ flex:1, padding:'8px', background:'#f1f5f9', color:'#64748b', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer' }}>Recusar</button>
            </div>
          </div>
        ))}
        {myClan ? (
          <div style={{ background:`linear-gradient(135deg,${myClan.color}22,${myClan.color}11)`, borderRadius:14, padding:16, marginBottom:14, border:`1px solid ${myClan.color}44` }}>
            <div style={{ fontSize:11, color:'#94a3b8', marginBottom:6 }}>SEU CLAN</div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:44, height:44, borderRadius:'50%', background:myClan.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>{myClan.emoji}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:16, fontWeight:800 }}>{myClan.name}</div>
                <div style={{ fontSize:12, color:'#64748b' }}>{myClan.member_count} membros</div>
              </div>
              <button onClick={()=>setViewClan(myClan)} style={{ padding:'6px 12px', background:myClan.color, color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' }}>Ver</button>
            </div>
            <button onClick={onLeaveClan} style={{ marginTop:10, width:'100%', padding:'8px', background:'rgba(239,68,68,0.08)', color:'#ef4444', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, fontSize:12, cursor:'pointer' }}>Sair do clan</button>
          </div>
        ) : (
          <button onClick={()=>setShowCreateClan(true)} style={{ width:'100%', padding:14, background:'linear-gradient(135deg,#ef4444,#f97316)', color:'#fff', border:'none', borderRadius:12, fontWeight:800, fontSize:15, cursor:'pointer', marginBottom:14 }}>⚔️ CRIAR MEU CLAN</button>
        )}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar clans..." style={{ width:'100%', padding:'10px 14px', border:'1px solid #e2e8f0', borderRadius:12, fontSize:14, marginBottom:12, boxSizing:'border-box', background:'#fff' }}/>
      </div>
      <div style={{ padding:'0 16px 16px' }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:10 }}>TODOS OS CLANS ({filtered.length})</div>
        {filtered.map(c=>{
          const members = Object.entries(profiles).filter(([,p])=>p.clan_id===c.id)
          const clanPoints = points.filter(p=>p.clan_id===c.id)
          return (
            <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, background:'#fff', borderRadius:12, padding:'12px 14px', marginBottom:8, border:'1px solid #f1f5f9' }}>
              <div style={{ width:42, height:42, borderRadius:'50%', background:c.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{c.emoji}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700 }}>{c.name}</div>
                <div style={{ fontSize:11, color:'#64748b' }}>{members.length} membros · {clanPoints.length}🚩</div>
              </div>
              <button onClick={()=>setViewClan(c)} style={{ padding:'6px 12px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, fontSize:12, cursor:'pointer' }}>Ver</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── NOTIFICATIONS VIEW ────────────────────────────────────────────────────────
function NotificationsView({ notifications, onMarkRead, onMarkAll }) {
  return (
    <div style={{ height:'100%', overflowY:'auto', background:'#f8fafc' }}>
      <div style={{ padding:'16px 16px 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:18, fontWeight:900 }}>🔔 Notificações</div>
        {notifications.length>0 && <button onClick={onMarkAll} style={{ background:'none', border:'none', color:'#6366f1', fontSize:12, cursor:'pointer', fontWeight:700 }}>Marcar todas</button>}
      </div>
      <div style={{ padding:16 }}>
        {notifications.length===0 ? (
          <div style={{ textAlign:'center', color:'#94a3b8', fontSize:14, padding:40 }}>Nenhuma notificação</div>
        ) : notifications.map(n=>(
          <div key={n.id} onClick={()=>onMarkRead(n.id)} style={{ background:'#fff', borderRadius:12, padding:'12px 14px', marginBottom:8, border:'1px solid #fecaca', cursor:'pointer' }}>
            <div style={{ fontSize:13, fontWeight:700 }}>{n.message}</div>
            <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>{timeAgo(n.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PROFILE VIEW ──────────────────────────────────────────────────────────────
function ProfileView({ user, profile, setProfile, db, myPoints, level, myClan, myRivalry, profiles, rivalries, onSignOut, season, onCreateSeason }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ display_name: profile?.display_name||'', bio:'', city:'' })

  const saveProfile = async () => {
    await updateDoc(doc(db,'profiles',user.uid), { display_name:form.display_name, bio:form.bio, city:form.city, updated_at:serverTimestamp() })
    const snap = await getDoc(doc(db,'profiles',user.uid))
    if (snap.exists()) setProfile(snap.data())
    setEditing(false)
  }

  const km = profile?.km_total||0
  const nextLevel = level < LEVEL_THRESHOLDS.length-1 ? LEVEL_THRESHOLDS[level+1] : null
  const progress = nextLevel ? Math.min(100,((km-LEVEL_THRESHOLDS[level])/(nextLevel-LEVEL_THRESHOLDS[level]))*100) : 100
  const rivalUser = myRivalry ? Object.entries(profiles).find(([id])=>id!==user.uid&&myRivalry.players.includes(id)) : null

  return (
    <div style={{ height:'100%', overflowY:'auto', background:'#f8fafc' }}>
      <div style={{ background:'linear-gradient(135deg,#1e293b,#0f172a)', padding:'20px 20px 30px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:myClan?.color||'#6366f1', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26 }}>{myClan?.emoji||LEVEL_BADGES[level]}</div>
          <div style={{ flex:1 }}>
            {editing ? (
              <input value={form.display_name} onChange={e=>setForm(f=>({...f,display_name:e.target.value}))} style={{ fontSize:18, fontWeight:900, background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:8, padding:'4px 10px', color:'#fff', width:'100%' }}/>
            ) : (
              <div style={{ fontSize:20, fontWeight:900, color:'#f1f5f9' }}>{profile?.display_name}</div>
            )}
            <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>{LEVEL_BADGES[level]} {LEVEL_TITLES[level]}</div>
          </div>
          <button onClick={()=>setEditing(!editing)} style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:8, padding:'6px 12px', color:'#e2e8f0', fontSize:12, cursor:'pointer' }}>{editing?'Cancelar':'✏️ Editar'}</button>
        </div>
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <span style={{ fontSize:11, color:'#94a3b8' }}>Nível {level}</span>
            <span style={{ fontSize:11, color:'#94a3b8' }}>{nextLevel?`${km.toFixed(1)} / ${nextLevel} km`:'Nível máximo!'}</span>
          </div>
          <div style={{ background:'rgba(255,255,255,0.1)', borderRadius:4, height:6 }}>
            <div style={{ height:'100%', width:`${progress}%`, background:'linear-gradient(90deg,#ef4444,#f97316)', borderRadius:4 }}/>
          </div>
        </div>
      </div>

      <div style={{ padding:16 }}>
        {editing && (
          <div style={{ background:'#fff', borderRadius:14, padding:16, marginBottom:14, border:'1px solid #e2e8f0' }}>
            <input value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))} placeholder="Cidade" style={{ width:'100%', padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, marginBottom:8, boxSizing:'border-box' }}/>
            <textarea value={form.bio} onChange={e=>setForm(f=>({...f,bio:e.target.value}))} placeholder="Bio" rows={3} style={{ width:'100%', padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:8, fontSize:13, resize:'none', marginBottom:10, boxSizing:'border-box' }}/>
            <button onClick={saveProfile} style={{ width:'100%', padding:'10px', background:'#6366f1', color:'#fff', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer' }}>Salvar</button>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:14 }}>
          {[['🏃',`${km.toFixed(1)}km`,'KMs'],['🚩',myPoints.length,'Territórios'],['⭐',profile?.points||0,'Pontos']].map(([ic,v,l])=>(
            <div key={l} style={{ background:'#fff', borderRadius:12, padding:'12px 8px', textAlign:'center', border:'1px solid #f1f5f9' }}>
              <div style={{ fontSize:18, marginBottom:4 }}>{ic}</div>
              <div style={{ fontSize:16, fontWeight:900, color:'#0f172a' }}>{v}</div>
              <div style={{ fontSize:10, color:'#94a3b8' }}>{l}</div>
            </div>
          ))}
        </div>

        {myClan && (
          <div style={{ background:`linear-gradient(135deg,${myClan.color}18,${myClan.color}08)`, borderRadius:12, padding:'12px 14px', marginBottom:14, border:`1px solid ${myClan.color}33`, display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:'50%', background:myClan.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{myClan.emoji}</div>
            <div>
              <div style={{ fontSize:13, fontWeight:700 }}>{myClan.name}</div>
              <div style={{ fontSize:11, color:'#64748b' }}>{myClan.member_count} membros</div>
            </div>
          </div>
        )}

        {myRivalry && rivalUser && (
          <div style={{ background:'#fef2f2', borderRadius:12, padding:'12px 14px', marginBottom:14, border:'1px solid #fecaca' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#991b1b', marginBottom:6 }}>⚔️ MAIOR RIVALIDADE</div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>vs. {rivalUser[1].display_name}</div>
                <div style={{ fontSize:11, color:'#94a3b8' }}>{myRivalry.count} confrontos</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:16, fontWeight:900, color:'#ef4444' }}>{myRivalry[`score_${user.uid}`]||0} - {myRivalry[`score_${rivalUser[0]}`]||0}</div>
                <div style={{ fontSize:10, color:'#94a3b8' }}>vitórias</div>
              </div>
            </div>
          </div>
        )}

        {profile?.is_admin && (
          <div style={{ background:'#fef3c7', borderRadius:12, padding:'12px 14px', marginBottom:14, border:'1px solid #fde68a' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#92400e', marginBottom:8 }}>🔴 PAINEL ADM</div>
            {!season ? (
              <button onClick={onCreateSeason} style={{ width:'100%', padding:'8px', background:'#f59e0b', color:'#fff', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer' }}>🏆 Iniciar Temporada</button>
            ) : (
              <div style={{ fontSize:12, color:'#92400e' }}>Temporada ativa: {season.name}</div>
            )}
          </div>
        )}

        {myPoints.length>0 && (
          <>
            <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:8 }}>MEUS TERRITÓRIOS</div>
            {myPoints.map(p=>{
              const str = getStrength(p)
              return (
                <div key={p.id} style={{ background:'#fff', borderRadius:10, padding:'10px 14px', marginBottom:6, border:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:16 }}>🚩</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>{p.name}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                      <div style={{ flex:1, background:'#f1f5f9', borderRadius:3, height:4 }}>
                        <div style={{ width:`${str}%`, height:'100%', background:str>60?'#22c55e':str>30?'#f97316':'#ef4444', borderRadius:3 }}/>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, color:str>60?'#166534':'#9a3412' }}>{str}%</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}

        <button onClick={onSignOut} style={{ width:'100%', padding:'12px', background:'#f8fafc', color:'#64748b', border:'1px solid #e2e8f0', borderRadius:12, fontWeight:600, fontSize:14, cursor:'pointer', marginTop:8 }}>
          Sair da conta
        </button>
      </div>
    </div>
  )
}

// ── AUTH SCREEN ───────────────────────────────────────────────────────────────
function AuthScreen({ auth, db, showToast }) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!email||!password) return showToast('Preencha todos os campos','err')
    setLoading(true)
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password)
      } else {
        if (!name) return showToast('Nome obrigatório','err')
        const { user } = await createUserWithEmailAndPassword(auth, email, password)
        await setDoc(doc(db,'profiles',user.uid), {
          display_name:name, username:email.split('@')[0], email,
          km_total:0, points:0, clan_id:null, is_admin:false, created_at:serverTimestamp()
        })
      }
    } catch(err) {
      showToast(err.code==='auth/wrong-password'?'Senha incorreta':err.code==='auth/user-not-found'?'Usuário não encontrado':err.message,'err')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#1e293b,#0f172a)', padding:24 }}>
      <div style={{ marginBottom:32, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:8 }}>⚔️</div>
        <div style={{ fontSize:32, fontWeight:900, background:'linear-gradient(135deg,#ef4444,#f97316)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>WAR MAPS</div>
        <div style={{ fontSize:13, color:'#64748b', marginTop:6 }}>Conquiste sua cidade. Domine o mapa.</div>
      </div>
      <div style={{ background:'#fff', borderRadius:20, padding:28, width:'100%', maxWidth:360, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', background:'#f8fafc', borderRadius:12, padding:4, marginBottom:20 }}>
          {['Entrar','Cadastrar'].map((t,i)=>(
            <button key={t} onClick={()=>setIsLogin(i===0)} style={{ flex:1, padding:'8px', background:isLogin===(i===0)?'#ef4444':'none', color:isLogin===(i===0)?'#fff':'#64748b', border:'none', borderRadius:8, fontWeight:700, fontSize:14, cursor:'pointer' }}>{t}</button>
          ))}
        </div>
        {!isLogin && <input value={name} onChange={e=>setName(e.target.value)} placeholder="Seu nome de guerra" style={{ width:'100%', padding:'12px 14px', border:'1px solid #e2e8f0', borderRadius:10, fontSize:14, marginBottom:10, boxSizing:'border-box' }}/>}
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" type="email" style={{ width:'100%', padding:'12px 14px', border:'1px solid #e2e8f0', borderRadius:10, fontSize:14, marginBottom:10, boxSizing:'border-box' }}/>
        <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Senha" type="password" onKeyDown={e=>e.key==='Enter'&&submit()} style={{ width:'100%', padding:'12px 14px', border:'1px solid #e2e8f0', borderRadius:10, fontSize:14, marginBottom:16, boxSizing:'border-box' }}/>
        <button onClick={submit} disabled={loading} style={{ width:'100%', padding:14, background:loading?'#e2e8f0':'linear-gradient(135deg,#ef4444,#f97316)', color:loading?'#94a3b8':'#fff', border:'none', borderRadius:12, fontWeight:800, fontSize:16, cursor:loading?'not-allowed':'pointer' }}>
          {loading?'...':isLogin?'⚔️ ENTRAR NA GUERRA':'🚀 COMEÇAR A DOMINAR'}
        </button>
      </div>
    </div>
  )
}
