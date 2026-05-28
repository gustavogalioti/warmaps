export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const results = {}

  // Test GitHub raw (the solution)
  try {
    const r = await fetch('https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv', {
      headers: { 'User-Agent': 'WarMapsGame/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    const text = await r.text()
    const lines = text.split('\n').length
    results['github_raw_municipios'] = { status: r.status, ok: r.ok, lines }
  } catch(e) { results['github_raw_municipios'] = { error: e.message } }

  // Test the actual neighborhoods endpoint  
  try {
    const r = await fetch(`https://${req.headers.host}/api/neighborhoods?lat=-23.18&lng=-46.88&radius=20`)
    const data = await r.json()
    results['neighborhoods_api'] = { status: r.status, count: data.count, error: data.error }
  } catch(e) { results['neighborhoods_api'] = { error: e.message } }

  return res.status(200).json({ results, timestamp: new Date().toISOString() })
}
