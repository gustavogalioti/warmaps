// Client-side: calls our Vercel API proxy
export async function fetchNeighborhoodsByLocation(lat, lng) {
  try {
    const res = await fetch(`/api/neighborhoods?lat=${lat}&lng=${lng}`)
    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = await res.json()
    console.log('[WarMaps] Neighborhoods:', data.count, 'source:', data.source)
    return data.neighborhoods || []
  } catch (e) {
    console.error('[WarMaps] fetchNeighborhoods failed:', e.message)
    return []
  }
}
