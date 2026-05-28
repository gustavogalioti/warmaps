// Solução definitiva: usa CSV de municípios brasileiros via GitHub raw
// Funciona para todo o Brasil, sem depender do Overpass!

export const config = { runtime: 'nodejs' }

const MUNICIPIOS_URL = 'https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv'

// Cache em memória (persiste entre chamadas na mesma instância Vercel)
let cachedMunicipios = null

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=3600')

  const lat = parseFloat(req.query.lat)
  const lng = parseFloat(req.query.lng)
  const radiusKm = parseFloat(req.query.radius || '30')

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ neighborhoods: [], error: 'lat/lng required' })
  }

  try {
    // Load municipios (cached after first call)
    if (!cachedMunicipios) {
      console.log('[api] Loading municipios CSV...')
      const r = await fetch(MUNICIPIOS_URL, {
        headers: { 'User-Agent': 'WarMapsGame/1.0' },
        signal: AbortSignal.timeout(15000),
      })
      if (!r.ok) throw new Error(`CSV fetch failed: ${r.status}`)
      const text = await r.text()
      cachedMunicipios = parseCSV(text)
      console.log('[api] Loaded', cachedMunicipios.length, 'municipios')
    }

    // Find nearby municipios
    const nearby = findNearby(cachedMunicipios, lat, lng, radiusKm)
    console.log('[api] Nearby:', nearby.length, 'within', radiusKm, 'km')

    return res.status(200).json({
      neighborhoods: nearby,
      count: nearby.length,
      source: 'municipios-br',
    })
  } catch (e) {
    console.error('[api] Error:', e.message)
    return res.status(200).json({ neighborhoods: [], count: 0, error: e.message })
  }
}

function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',')
  const result = []
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',')
    const obj = {}
    headers.forEach((h, idx) => obj[h.trim()] = (parts[idx] || '').trim())
    const lat = parseFloat(obj.latitude)
    const lng = parseFloat(obj.longitude)
    if (!isNaN(lat) && !isNaN(lng) && obj.nome) {
      result.push({ nome: obj.nome, lat, lng, codigo_uf: obj.codigo_uf, capital: obj.capital === '1' })
    }
  }
  return result
}

function findNearby(municipios, centerLat, centerLng, maxKm) {
  const R = 111.32 // km per degree
  const results = []

  for (const m of municipios) {
    const dlat = (m.lat - centerLat) * R
    const dlng = (m.lng - centerLng) * R * Math.cos(centerLat * Math.PI / 180)
    const dist = Math.sqrt(dlat * dlat + dlng * dlng)

    if (dist <= maxKm) {
      // Determine type based on distance from center
      let type = 'BAIRRO'
      let radius_m = 350
      let base_points = 100

      if (dist < 2) {
        // Very close = central area
        type = 'AREA'
        radius_m = 800
        base_points = 300
      } else if (dist < 8) {
        type = 'BAIRRO'
        radius_m = 500
        base_points = 100
      } else {
        type = 'BAIRRO'
        radius_m = 400
        base_points = 100
      }

      results.push({
        osm_id: `muni_${m.nome.toLowerCase().replace(/\s+/g, '_')}_${m.lat.toFixed(3)}`,
        name: m.nome,
        city: m.nome,
        type,
        lat: m.lat,
        lng: m.lng,
        radius_m,
        base_points,
        dist_km: parseFloat(dist.toFixed(1)),
      })
    }
  }

  results.sort((a, b) => a.dist_km - b.dist_km)
  return results
}
