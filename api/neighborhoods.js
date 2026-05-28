// Busca bairros reais com coordenadas usando múltiplas fontes
// 1. Nominatim bbox search (retorna subúrbios com lat/lng reais)
// 2. Brasil Aberto (nomes dos bairros) + distribuição ao redor do centro

export const config = { runtime: 'nodejs' }

const MUNICIPIOS_URL = 'https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv'
let cachedMunicipios = null

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=7200')

  const lat = parseFloat(req.query.lat)
  const lng = parseFloat(req.query.lng)
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ neighborhoods: [], error: 'lat/lng required' })

  try {
    // 1. Load municipios CSV
    if (!cachedMunicipios) {
      const r = await fetch(MUNICIPIOS_URL, {
        headers: { 'User-Agent': 'WarMapsGame/1.0' },
        signal: AbortSignal.timeout(15000),
      })
      cachedMunicipios = parseCSV(await r.text())
      console.log('[api] Loaded', cachedMunicipios.length, 'municipios')
    }

    // 2. Find nearest city
    const nearbyMunicipios = findNearby(cachedMunicipios, lat, lng, 30)
    const mainCity = nearbyMunicipios[0]
    console.log('[api] Main city:', mainCity?.nome)

    // 3. Search bairros via Nominatim bbox - returns real coordinates!
    const nominatimBairros = await searchNominatimBairros(lat, lng)
    console.log('[api] Nominatim bairros:', nominatimBairros.length)

    if (nominatimBairros.length > 0) {
      return res.status(200).json({
        neighborhoods: nominatimBairros,
        count: nominatimBairros.length,
        source: 'nominatim',
        city: mainCity?.nome,
      })
    }

    // 4. Fallback: Brasil Aberto names + smart coordinate distribution
    if (mainCity) {
      const bairros = await getBairrosFromBrasilAberto(mainCity.codigo_ibge, mainCity.nome, mainCity.lat, mainCity.lng)
      if (bairros.length > 0) {
        return res.status(200).json({ neighborhoods: bairros, count: bairros.length, source: 'brasil-aberto', city: mainCity.nome })
      }
    }

    // 5. Last fallback: nearby municipios as points
    const fallback = nearbyMunicipios.slice(0, 20).map(m => ({
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

  } catch (e) {
    console.error('[api] Error:', e.message)
    return res.status(200).json({ neighborhoods: [], count: 0, error: e.message })
  }
}

// Nominatim bbox search for suburbs/neighbourhoods with REAL coordinates
async function searchNominatimBairros(lat, lng) {
  // Create bounding box ~25km around the point
  const delta = 0.22 // ~25km
  const viewbox = `${lng-delta},${lat-delta},${lng+delta},${lat+delta}`
  
  const params = new URLSearchParams({
    q: 'suburb',
    format: 'json',
    viewbox,
    bounded: '1',
    limit: '50',
    addressdetails: '1',
    'accept-language': 'pt-BR,pt',
  })

  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'WarMapsGame/1.0 (educational project)' },
      signal: AbortSignal.timeout(12000),
    })
    if (!r.ok) throw new Error(`Nominatim ${r.status}`)
    const data = await r.json()
    
    const seen = new Set()
    const results = []
    
    for (const item of data) {
      const name = item.display_name?.split(',')?.[0]?.trim()
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      
      const ilat = parseFloat(item.lat)
      const ilng = parseFloat(item.lon)
      if (isNaN(ilat) || isNaN(ilng)) continue
      
      results.push({
        osm_id: `osm_${item.osm_type}_${item.osm_id}`,
        name,
        city: item.address?.city || item.address?.town || '',
        type: 'BAIRRO',
        lat: parseFloat(ilat.toFixed(6)),
        lng: parseFloat(ilng.toFixed(6)),
        radius_m: 400,
        base_points: 100,
      })
    }
    
    return results
  } catch (e) {
    console.warn('[api] Nominatim failed:', e.message)
    return []
  }
}

// Brasil Aberto: get bairro names + distribute with real-looking coordinates
async function getBairrosFromBrasilAberto(ibgeCode, cityName, cityLat, cityLng) {
  try {
    const url = `https://api.brasilaberto.com/v1/districts-by-ibge-code/${ibgeCode}?limit=200`
    const r = await fetch(url, {
      headers: { 'User-Agent': 'WarMapsGame/1.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return []
    const data = await r.json()
    const items = data.result || []
    if (!items.length) return []

    // Use golden ratio spiral for natural-looking distribution
    const PHI = (1 + Math.sqrt(5)) / 2
    const cityRadiusKm = 0.15 // ~15km radius spread

    return items.map((b, i) => {
      const r = cityRadiusKm * Math.sqrt(i + 1) / Math.sqrt(items.length)
      const theta = 2 * Math.PI * i / PHI
      return {
        osm_id: `ba_${b.id}`,
        name: b.name,
        city: cityName,
        type: 'BAIRRO',
        lat: parseFloat((cityLat + r * Math.sin(theta)).toFixed(6)),
        lng: parseFloat((cityLng + r * Math.cos(theta) / Math.cos(cityLat * Math.PI / 180)).toFixed(6)),
        radius_m: 400,
        base_points: 100,
      }
    })
  } catch (e) {
    console.warn('[api] Brasil Aberto failed:', e.message)
    return []
  }
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
      result.push({ nome: obj.nome, lat, lng, codigo_ibge: obj.codigo_ibge })
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
      return { ...m, dist_km: Math.sqrt(dlat*dlat + dlng*dlng) }
    })
    .filter(m => m.dist_km <= maxKm)
    .sort((a, b) => a.dist_km - b.dist_km)
}
