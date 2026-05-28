// Vercel Serverless Function
// Route: GET /api/neighborhoods?lat=-23.18&lng=-46.88

export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=3600')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const lat = parseFloat(req.query.lat)
  const lng = parseFloat(req.query.lng)

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'Invalid lat/lng', neighborhoods: [] })
  }

  const q = `[out:json][timeout:30];(node["place"~"^(suburb|neighbourhood|district|quarter|village)$"](around:25000,${lat},${lng});way["place"~"^(suburb|neighbourhood|district|quarter)$"](around:25000,${lat},${lng});relation["place"~"^(suburb|neighbourhood|district)$"](around:25000,${lat},${lng});relation["boundary"="administrative"]["admin_level"~"^[89]$"](around:20000,${lat},${lng}););out center tags;`

  const servers = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ]

  let lastError = null

  for (const server of servers) {
    try {
      console.log(`[api/neighborhoods] Trying ${server}`)
      const r = await fetch(server, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'WarMapsApp/1.0 (contact@warmaps.app)',
        },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(28000),
      })

      if (!r.ok) {
        lastError = `${server} returned ${r.status}`
        console.warn(lastError)
        continue
      }

      const data = await r.json()
      if (!Array.isArray(data.elements)) {
        lastError = `${server} returned no elements`
        continue
      }

      const neighborhoods = parse(data.elements)
      console.log(`[api/neighborhoods] Success: ${neighborhoods.length} from ${server}`)
      return res.status(200).json({
        neighborhoods,
        count: neighborhoods.length,
        server,
        lat,
        lng,
      })
    } catch (e) {
      lastError = e.message
      console.error(`[api/neighborhoods] ${server} error:`, e.message)
    }
  }

  console.error('[api/neighborhoods] All servers failed:', lastError)
  return res.status(200).json({
    neighborhoods: [],
    count: 0,
    error: lastError,
    message: 'All Overpass servers failed',
  })
}

function parse(elements) {
  const seen = new Set()
  const out = []
  for (const el of elements) {
    const name = el.tags?.name || el.tags?.['name:pt']
    if (!name || name.length < 2) continue
    const key = name.toLowerCase().trim()
    if (seen.has(key)) continue
    seen.add(key)
    const lat = parseFloat(el.center?.lat ?? el.lat ?? 0)
    const lng = parseFloat(el.center?.lon ?? el.lon ?? 0)
    if (!lat || !lng || Math.abs(lat) < 0.001) continue
    const place = el.tags?.place || ''
    const adminLevel = parseInt(el.tags?.admin_level || '99')
    let type = 'BAIRRO'
    if (place === 'village' || adminLevel === 8) type = 'AREA'
    else if (place === 'quarter') type = 'QUARTEIRAO'
    out.push({
      osm_id: `osm_${el.type}_${el.id}`,
      name: name.trim(),
      city: el.tags?.['addr:city'] || el.tags?.['is_in:city'] || '',
      type,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      radius_m: type === 'AREA' ? 700 : type === 'QUARTEIRAO' ? 200 : 350,
      base_points: type === 'AREA' ? 300 : 100,
    })
  }
  return out
}
