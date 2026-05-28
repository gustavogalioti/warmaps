// ── Neighborhood loader via OpenStreetMap Overpass API ────────
// Busca bairros de uma cidade e sincroniza com o Firestore

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

// Determina raio baseado no tipo do bairro
const radiusForType = (type) => {
  if (type === 'CIDADE') return 2000
  if (type === 'AREA')   return 1000
  if (type === 'BAIRRO') return 400
  return 250 // QUARTEIRAO
}

// Busca bairros pelo nome da cidade usando Overpass QL
export async function fetchNeighborhoodsByCity(cityName) {
  const query = `
    [out:json][timeout:25];
    area["name"="${cityName}"]["boundary"="administrative"]->.city;
    (
      relation["boundary"="administrative"]["admin_level"~"^(8|9|10)$"](area.city);
      way["place"~"^(suburb|neighbourhood|quarter|borough)$"](area.city);
      node["place"~"^(suburb|neighbourhood|quarter|borough)$"](area.city);
    );
    out center;
  `
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const data = await res.json()
    return parseOverpassElements(data.elements, cityName)
  } catch (e) {
    console.warn('Overpass error:', e)
    return []
  }
}

// Busca bairros pela localização GPS (raio de 30km)
export async function fetchNeighborhoodsByLocation(lat, lng) {
  const query = `
    [out:json][timeout:25];
    (
      relation["boundary"="administrative"]["admin_level"~"^(8|9|10)$"](around:30000,${lat},${lng});
      way["place"~"^(suburb|neighbourhood|quarter|borough)$"](around:20000,${lat},${lng});
      node["place"~"^(suburb|neighbourhood|quarter|borough)$"](around:20000,${lat},${lng});
    );
    out center;
  `
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const data = await res.json()
    return parseOverpassElements(data.elements, null)
  } catch (e) {
    console.warn('Overpass location error:', e)
    return []
  }
}

function parseOverpassElements(elements, cityName) {
  const seen = new Set()
  const result = []

  for (const el of elements) {
    const name = el.tags?.name || el.tags?.['name:pt']
    if (!name) continue
    if (seen.has(name)) continue
    seen.add(name)

    // Centro do elemento
    const lat = el.center?.lat ?? el.lat
    const lng = el.center?.lon ?? el.lon
    if (!lat || !lng) continue

    // Determina tipo
    const adminLevel = parseInt(el.tags?.admin_level || '10')
    let type = 'BAIRRO'
    if (adminLevel <= 7) type = 'CIDADE'
    else if (adminLevel === 8) type = 'AREA'
    else if (adminLevel >= 9) type = 'BAIRRO'
    if (el.tags?.place === 'quarter') type = 'QUARTEIRAO'

    result.push({
      osm_id: `osm_${el.type}_${el.id}`,
      name,
      city: cityName || el.tags?.['addr:city'] || '',
      type,
      lat,
      lng,
      radius_m: radiusForType(type),
      base_points: type === 'CIDADE' ? 500 : type === 'AREA' ? 300 : 100,
    })
  }

  return result
}

// Geocodifica cidade para obter lat/lng
export async function geocodeCity(cityName) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1&countrycodes=br`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    )
    const data = await res.json()
    if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), name: data[0].display_name }
    return null
  } catch { return null }
}

// Detecta cidade pelo GPS usando reverse geocoding
export async function detectCityByGPS(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    )
    const data = await res.json()
    return data.address?.city || data.address?.town || data.address?.municipality || null
  } catch { return null }
}
