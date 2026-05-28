// Vercel Serverless Function - proxies Overpass API
// Deployed at: /api/neighborhoods?lat=XX&lng=YY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { lat, lng } = req.query
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng required' })
  }

  const query = `[out:json][timeout:30];
(
  node["place"~"^(suburb|neighbourhood|district|quarter|village)$"](around:30000,${lat},${lng});
  way["place"~"^(suburb|neighbourhood|district|quarter)$"](around:30000,${lat},${lng});
  relation["place"~"^(suburb|neighbourhood|district)$"](around:30000,${lat},${lng});
  relation["boundary"="administrative"]["admin_level"~"^[89]$"](around:20000,${lat},${lng});
);
out center tags;`

  const servers = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ]

  for (const server of servers) {
    try {
      const response = await fetch(server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(25000),
      })
      if (!response.ok) continue
      const data = await response.json()
      if (!data.elements) continue

      const parsed = parseNeighborhoods(data.elements)
      return res.status(200).json({ neighborhoods: parsed, count: parsed.length, server })
    } catch (e) {
      console.error('Server failed:', server, e.message)
    }
  }

  return res.status(500).json({ error: 'All Overpass servers failed', neighborhoods: [] })
}

function parseNeighborhoods(elements) {
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
      city: el.tags?.['addr:city'] || '',
      type,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      radius_m: type === 'AREA' ? 700 : type === 'QUARTEIRAO' ? 200 : 350,
      base_points: type === 'AREA' ? 300 : 100,
    })
  }
  return out
}
