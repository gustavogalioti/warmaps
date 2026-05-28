// Solução definitiva: Brasil Aberto API (bairros reais) + municipios CSV (coordenadas)
// Fluxo: GPS → código IBGE da cidade → bairros da cidade → distribui no mapa

export const config = { runtime: 'nodejs' }

const MUNICIPIOS_URL = 'https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv'
const BRASIL_ABERTO = 'https://api.brasilaberto.com'

let cachedMunicipios = null

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=3600')

  const lat = parseFloat(req.query.lat)
  const lng = parseFloat(req.query.lng)
  const radiusKm = parseFloat(req.query.radius || '25')
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ neighborhoods: [], error: 'lat/lng required' })

  try {
    // 1. Load all municipios CSV (cached)
    if (!cachedMunicipios) {
      console.log('[api] Loading municipios CSV...')
      const r = await fetch(MUNICIPIOS_URL, {
        headers: { 'User-Agent': 'WarMapsGame/1.0' },
        signal: AbortSignal.timeout(15000),
      })
      const text = await r.text()
      cachedMunicipios = parseCSV(text)
      console.log('[api] Loaded', cachedMunicipios.length, 'municipios')
    }

    // 2. Find nearby municipios within radius
    const nearbyMunicipios = findNearby(cachedMunicipios, lat, lng, radiusKm)
    console.log('[api] Nearby municipios:', nearbyMunicipios.length)

    // 3. For each nearby municipio, fetch its bairros from Brasil Aberto
    const allNeighborhoods = []
    const seen = new Set()

    for (const muni of nearbyMunicipios.slice(0, 5)) { // max 5 cidades por chamada
      try {
        const bairros = await getBairrosByIbge(muni.codigo_ibge, muni.nome, muni.lat, muni.lng)
        for (const b of bairros) {
          if (!seen.has(b.osm_id)) {
            seen.add(b.osm_id)
            allNeighborhoods.push(b)
          }
        }
        console.log(`[api] ${muni.nome}: ${bairros.length} bairros`)
      } catch (e) {
        console.warn(`[api] Failed bairros for ${muni.nome}:`, e.message)
      }
    }

    // 4. Fallback: if no bairros found, use municipios themselves as points
    if (allNeighborhoods.length === 0) {
      const fallback = nearbyMunicipios.map(m => ({
        osm_id: `muni_${m.codigo_ibge}`,
        name: m.nome,
        city: m.nome,
        type: 'BAIRRO',
        lat: m.lat,
        lng: m.lng,
        radius_m: 500,
        base_points: 100,
      }))
      return res.status(200).json({ neighborhoods: fallback, count: fallback.length, source: 'municipios-fallback' })
    }

    return res.status(200).json({
      neighborhoods: allNeighborhoods,
      count: allNeighborhoods.length,
      source: 'brasil-aberto',
    })
  } catch (e) {
    console.error('[api] Error:', e.message)
    return res.status(200).json({ neighborhoods: [], count: 0, error: e.message })
  }
}

async function getBairrosByIbge(ibgeCode, cityName, cityLat, cityLng) {
  const url = `${BRASIL_ABERTO}/v1/districts-by-ibge-code/${ibgeCode}?limit=200`
  const r = await fetch(url, {
    headers: { 'User-Agent': 'WarMapsGame/1.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!r.ok) throw new Error(`Brasil Aberto ${r.status}`)
  const data = await r.json()
  const items = data.result || []
  if (!items.length) return []

  // Distribute bairros in a spiral around city center
  // Each bairro gets unique coordinates based on its position in the list
  return items.map((b, i) => {
    const total = items.length
    const angle = (i / total) * 2 * Math.PI * 3 // 3 rotations
    const ring = Math.floor(i / 12) // rings of 12
    const radius = (ring + 1) * 0.008 // ~900m between rings
    return {
      osm_id: `ba_${b.id}`,
      name: b.name,
      city: cityName,
      type: 'BAIRRO',
      lat: parseFloat((cityLat + Math.sin(angle) * radius).toFixed(6)),
      lng: parseFloat((cityLng + Math.cos(angle) * radius).toFixed(6)),
      radius_m: 400,
      base_points: 100,
    }
  })
}

function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  const result = []
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',')
    const obj = {}
    headers.forEach((h, idx) => obj[h] = (parts[idx] || '').trim())
    const lat = parseFloat(obj.latitude)
    const lng = parseFloat(obj.longitude)
    if (!isNaN(lat) && !isNaN(lng) && obj.nome) {
      result.push({ nome: obj.nome, lat, lng, codigo_ibge: obj.codigo_ibge, codigo_uf: obj.codigo_uf })
    }
  }
  return result
}

function findNearby(municipios, centerLat, centerLng, maxKm) {
  const R = 111.32
  return municipios
    .map(m => {
      const dlat = (m.lat - centerLat) * R
      const dlng = (m.lng - centerLng) * R * Math.cos(centerLat * Math.PI / 180)
      const dist = Math.sqrt(dlat * dlat + dlng * dlng)
      return { ...m, dist_km: dist }
    })
    .filter(m => m.dist_km <= maxKm)
    .sort((a, b) => a.dist_km - b.dist_km)
}
