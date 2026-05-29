const CLOUDINARY_BASE = 'https://api.cloudinary.com/v1_1'

function buildAuth(apiKey, apiSecret) {
  return Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
}

function buildPrefix(folder) {
  if (!folder) return ''
  return encodeURIComponent(folder.replace(/\/$/, '')) + '/'
}

async function fetchMp3Resources(cloudName, auth, prefix) {
  const qs  = `max_results=500${prefix ? `&prefix=${prefix}` : ''}`
  const url = `${CLOUDINARY_BASE}/${cloudName}/resources/raw/upload?${qs}`

  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } })
  if (!res.ok) {
    const body = await res.text()
    throw Object.assign(new Error(`Cloudinary API error`), { status: res.status, body })
  }

  const { resources = [] } = await res.json()
  return resources.filter(
    r => r.bytes > 0 && (r.format === 'mp3' || r.secure_url?.endsWith('.mp3'))
  )
}

function cleanFilename(rawName, publicId, format) {
  let name = rawName || publicId || ''
  try { name = decodeURIComponent(name) } catch { /* ignore */ }

  // Keep only the last path segment
  name = name.split(/[\\/]/).pop().trim()
  // Normalise separators
  name = name.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
  name = name.replace(/-+/g, '-')

  const extMatch = name.match(/(.*?)(\.[^.]+)$/)
  let base = extMatch ? extMatch[1] : name
  const ext = extMatch ? extMatch[2] : format ? `.${format}` : ''

  // Strip the Cloudinary-appended 6-char public-id suffix
  base = base.length > 6 ? base.slice(0, -6).trim() : ''
  return base + ext
}

module.exports = { buildAuth, buildPrefix, fetchMp3Resources, cleanFilename }
