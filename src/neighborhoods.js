// ── Neighborhood loader via OpenStreetMap Overpass ────────────

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

async function runQuery(q) {
  for (const url of SERVERS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(25000),
      })
      if (!res.ok) { console.warn('[OSM] Server', url, 'returned', res.status); continue }
      const data = await res.json()
      if (Array.isArray(data.elements)) return data.elements
    } catch (e) {
      console.warn('[OSM] Server failed:', url, e.message)
    }
  }
  return []
}

export async function fetchNeighborhoodsByLocation(lat, lng) {
  // Query tuned for Brazilian cities - uses suburb/neighbourhood/district tags
  const q = `[out:json][timeout:30];
(
  node["place"~"^(suburb|neighbourhood|district|quarter|village|town)$"](around:30000,${lat},${lng});
  way["place"~"^(suburb|neighbourhood|district|quarter)$"](around:30000,${lat},${lng});
  relation["place"~"^(suburb|neighbourhood|district)$"](around:30000,${lat},${lng});
  relation["boundary"="administrative"]["admin_level"~"^[89]$"](around:20000,${lat},${lng});
);
out center tags;`

  console.log('[OSM] Querying neighborhoods around', lat, lng)
  const elements = await runQuery(q)
  console.log('[OSM] Raw elements:', elements.length)

  const result = parse(elements)
  console.log('[OSM] Parsed neighborhoods:', result.length)
  return result
}

function parse(elements) {
  const seen = new Set()
  const out = []

  for (const el of elements) {
    const name =
      el.tags?.name ||
      el.tags?.['name:pt'] ||
      el.tags?.['addr:suburb']
    if (!name || name.length < 2) continue

    const key = name.toLowerCase().trim()
    if (seen.has(key)) continue
    seen.add(key)

    const lat = parseFloat(el.center?.lat ?? el.lat ?? 0)
    const lng = parseFloat(el.center?.lon ?? el.lon ?? 0)
    if (!lat || !lng) continue
    if (Math.abs(lat) < 0.001) continue

    const place = el.tags?.place || ''
    const adminLevel = parseInt(el.tags?.admin_level || '99')

    let type = 'BAIRRO'
    if (place === 'village' || place === 'town' || adminLevel === 8) type = 'AREA'
    else if (place === 'quarter') type = 'QUARTEIRAO'

    const radius = type === 'AREA' ? 700 : type === 'QUARTEIRAO' ? 200 : 350

    out.push({
      osm_id: `osm_${el.type}_${el.id}`,
      name: name.trim(),
      city: el.tags?.['addr:city'] || el.tags?.['is_in:city'] || '',
      type,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      radius_m: radius,
      base_points: type === 'AREA' ? 300 : 100,
    })
  }

  return out
}
