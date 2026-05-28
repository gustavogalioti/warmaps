export const config = { runtime: 'nodejs' }

const MUNICIPIOS_URL = 'https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv'
let cachedMunicipios = null

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=3600')

  const lat = parseFloat(req.query.lat)
  const lng = parseFloat(req.query.lng)
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ neighborhoods: [], error: 'lat/lng required' })

  try {
    // Search bairros via Nominatim - confirmed working from Vercel!
    const bairros = await searchBairros(lat, lng)
    console.log('[api] Found', bairros.length, 'bairros via Nominatim')

    if (bairros.length > 0) {
      return res.status(200).json({ neighborhoods: bairros, count: bairros.length, source: 'nominatim' })
    }

    // Fallback: municipios CSV
    if (!cachedMunicipios) {
      const r = await fetch(MUNICIPIOS_URL, {
        headers: { 'User-Agent': 'WarMapsGame/1.0' },
        signal: AbortSignal.timeout(15000),
      })
      cachedMunicipios = parseCSV(await r.text())
    }
    const nearby = findNearby(cachedMunicipios, lat, lng, 30).slice(0, 20).map(m => ({
      osm_id: `muni_${m.codigo_ibge}`,
      name: m.nome, city: m.nome, type: 'BAIRRO',
      lat: m.lat, lng: m.lng, radius_m: 500, base_points: 100,
    }))
    return res.status(200).json({ neighborhoods: nearby, count: nearby.length, source: 'municipios-fallback' })

  } catch (e) {
    console.error('[api] Error:', e.message)
    return res.status(200).json({ neighborhoods: [], count: 0, error: e.message })
  }
}

async function searchBairros(lat, lng) {
  const delta = 0.25 // ~28km bounding box
  const viewbox = `${lng-delta},${lat-delta},${lng+delta},${lat+delta}`
  const seen = new Set()
  const results = []

  // Search multiple place types that represent bairros in Brazil
  const queries = ['suburb', 'neighbourhood', 'quarter', 'village', 'hamlet']

  for (const q of queries) {
    try {
      const params = new URLSearchParams({
        q, format: 'json', viewbox, bounded: '1',
        limit: '50', addressdetails: '1', 'accept-language': 'pt-BR,pt',
      })
      const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'User-Agent': 'WarMapsGame/1.0 (educational game project)' },
        signal: AbortSignal.timeout(10000),
      })
      if (!r.ok) continue
      const data = await r.json()

      for (const item of data) {
        const name = item.display_name?.split(',')?.[0]?.trim()
        if (!name || name.length < 2) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)

        const ilat = parseFloat(item.lat)
        const ilng = parseFloat(item.lon)
        if (isNaN(ilat) || isNaN(ilng)) continue

        results.push({
          osm_id: `osm_${item.osm_type}_${item.osm_id}`,
          name,
          city: item.address?.city || item.address?.town || item.address?.municipality || '',
          type: 'BAIRRO',
          lat: parseFloat(ilat.toFixed(6)),
          lng: parseFloat(ilng.toFixed(6)),
          radius_m: 350,
          base_points: 100,
        })
      }

      // Rate limit respect
      await new Promise(r => setTimeout(r, 300))
    } catch (e) {
      console.warn('[api] Query', q, 'failed:', e.message)
    }
  }

  return results
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
