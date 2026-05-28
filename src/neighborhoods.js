// ── Neighborhood loader ───────────────────────────────────────
// Usa múltiplos servidores Overpass como fallback

const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

const radiusForType = (type) => {
  if (type === 'CIDADE') return 1500
  if (type === 'AREA')   return 800
  if (type === 'BAIRRO') return 350
  return 200
}

async function overpassQuery(queryStr) {
  for (const server of OVERPASS_SERVERS) {
    try {
      const res = await fetch(server, {
        method: 'POST',
        body: `data=${encodeURIComponent(queryStr)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) continue
      const data = await res.json()
      if (data.elements) return data.elements
    } catch (e) {
      console.warn(`Overpass ${server} failed:`, e.message)
    }
  }
  return []
}

// Busca bairros por GPS (raio de 25km)
export async function fetchNeighborhoodsByLocation(lat, lng) {
  const query = `
[out:json][timeout:30];
(
  node["place"~"^(suburb|neighbourhood|quarter)$"](around:25000,${lat},${lng});
  way["place"~"^(suburb|neighbourhood|quarter)$"](around:25000,${lat},${lng});
  relation["boundary"="administrative"]["admin_level"~"^(9|10)$"](around:25000,${lat},${lng});
);
out center tags;`

  const elements = await overpassQuery(query)
  return parseElements(elements)
}

function parseElements(elements) {
  const seen = new Set()
  const result = []

  for (const el of elements) {
    const name = el.tags?.name || el.tags?.['name:pt']
    if (!name || name.length < 2) continue
    if (seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())

    const lat = el.center?.lat ?? el.lat
    const lng = el.center?.lon ?? el.lon
    if (!lat || !lng) continue

    // Skip if coords are 0,0 or clearly wrong
    if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) continue

    const place = el.tags?.place || ''
    const adminLevel = parseInt(el.tags?.admin_level || '10')

    let type = 'BAIRRO'
    if (place === 'quarter') type = 'QUARTEIRAO'
    else if (adminLevel <= 8) type = 'AREA'
    else type = 'BAIRRO'

    result.push({
      osm_id: `osm_${el.type}_${el.id}`,
      name,
      city: el.tags?.['addr:city'] || '',
      type,
      lat: parseFloat(lat.toFixed(6)),
      lng: parseFloat(lng.toFixed(6)),
      radius_m: radiusForType(type),
      base_points: type === 'AREA' ? 300 : 100,
    })
  }

  return result
}
