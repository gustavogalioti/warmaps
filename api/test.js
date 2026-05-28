export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const results = {}

  // Test Nominatim - key for bairros
  try {
    const params = new URLSearchParams({
      q: 'suburb', format: 'json',
      viewbox: '-47.1,-23.3,-46.7,-23.0',
      bounded: '1', limit: '5',
      'accept-language': 'pt-BR'
    })
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'WarMapsGame/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    const data = await r.json()
    results['nominatim_bairros'] = {
      status: r.status,
      ok: r.ok,
      count: data.length,
      sample: data.slice(0,3).map(d => d.display_name?.split(',')?.[0])
    }
  } catch(e) { results['nominatim_bairros'] = { error: e.message } }

  // Test Brasil Aberto for Jundiai (IBGE 3525904)
  try {
    const r = await fetch('https://api.brasilaberto.com/v1/districts-by-ibge-code/3525904?limit=5', {
      headers: { 'User-Agent': 'WarMapsGame/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    const data = await r.json()
    results['brasil_aberto_jundiai'] = {
      status: r.status,
      ok: r.ok,
      total: data.meta?.totalOfItems,
      sample: (data.result || []).slice(0,3).map(b => b.name)
    }
  } catch(e) { results['brasil_aberto_jundiai'] = { error: e.message } }

  // Test GitHub raw
  try {
    const r = await fetch('https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv', {
      headers: { 'User-Agent': 'WarMapsGame/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    const text = await r.text()
    results['github_raw'] = { status: r.status, ok: r.ok, lines: text.split('\n').length }
  } catch(e) { results['github_raw'] = { error: e.message } }

  return res.status(200).json({ results, timestamp: new Date().toISOString() })
}
