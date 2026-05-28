// Chama nossa própria API Vercel que faz proxy do Overpass
// Isso resolve CORS e bloqueios de rede

export async function fetchNeighborhoodsByLocation(lat, lng) {
  try {
    console.log('[WarMaps] Fetching via /api/neighborhoods', lat, lng)
    const res = await fetch(`/api/neighborhoods?lat=${lat}&lng=${lng}`)
    if (!res.ok) throw new Error(`API returned ${res.status}`)
    const data = await res.json()
    console.log('[WarMaps] API returned', data.count, 'neighborhoods from', data.server)
    return data.neighborhoods || []
  } catch (e) {
    console.error('[WarMaps] fetchNeighborhoods failed:', e.message)
    return []
  }
}
