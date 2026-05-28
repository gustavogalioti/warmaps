export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  
  // Test connectivity to Overpass
  const results = {}
  const servers = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]
  
  for (const server of servers) {
    try {
      const r = await fetch(server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent('[out:json];node(1);out;'),
        signal: AbortSignal.timeout(5000),
      })
      results[server] = { status: r.status, ok: r.ok }
    } catch (e) {
      results[server] = { error: e.message }
    }
  }
  
  return res.status(200).json({ results, timestamp: new Date().toISOString() })
}
