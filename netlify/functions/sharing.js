/**
 * Netlify Function: sharing
 * GET /api/sharing
 *
 * Lists MP3 files from the sharing folder in Cloudinary and returns
 * [{ id, name, size, downloadUrl }].
 * downloadUrl uses Cloudinary's fl_attachment flag so the browser
 * saves the file rather than streaming it.
 *
 * Env vars required:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *   CLOUDINARY_SHARING_TRACKS_FOLDER  (optional prefix)
 */

const CLOUDINARY_BASE = 'https://api.cloudinary.com/v1_1'

function cleanFilename(rawName, publicId, format) {
  let name = rawName || publicId || ''
  try { name = decodeURIComponent(name) } catch (e) { /* ignore */ }
  const parts = name.split(/[\\/]/)
  name = parts[parts.length - 1].trim()
  name = name.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
  name = name.replace(/-+/g, '-')
  const extMatch = name.match(/(.*?)(\.[^.]+)$/)
  let base = extMatch ? extMatch[1] : name
  let ext  = extMatch ? extMatch[2] : format ? `.${format}` : ''
  if (base.length > 6) base = base.slice(0, -6)
  else base = ''
  return base.trim() + ext
}

function toDownloadUrl(secureUrl) {
  // Insert fl_attachment flag so the browser downloads instead of streaming
  return secureUrl.replace('/upload/', '/upload/fl_attachment/')
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const {
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    CLOUDINARY_SHARING_TRACKS_FOLDER
  } = process.env

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error' }),
      headers: { 'Content-Type': 'application/json' }
    }
  }

  if (!CLOUDINARY_SHARING_TRACKS_FOLDER) {
    return {
      statusCode: 200,
      body: JSON.stringify([]),
      headers: { 'Content-Type': 'application/json' }
    }
  }

  try {
    const auth   = Buffer.from(`${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}`).toString('base64')
    const prefix = CLOUDINARY_SHARING_TRACKS_FOLDER
      ? encodeURIComponent(CLOUDINARY_SHARING_TRACKS_FOLDER.replace(/\/$/, '')) + '/'
      : ''
    const qs = `max_results=500${prefix ? `&prefix=${prefix}` : ''}`

    let resources = []

    for (const type of ['raw', 'video']) {
      const res = await fetch(
        `${CLOUDINARY_BASE}/${CLOUDINARY_CLOUD_NAME}/resources/${type}/upload?${qs}`,
        { headers: { Authorization: `Basic ${auth}` } }
      )
      if (res.ok) {
        const data = await res.json()
        resources = resources.concat(data.resources || [])
      } else {
        console.error(`sharing: ${type} endpoint error`, res.status)
      }
    }

    const tracks = resources
      .filter(r => r.bytes > 0 && (r.format === 'mp3' || (r.secure_url && r.secure_url.endsWith('.mp3'))))
      .map(r => ({
        id:          r.public_id,
        name:        cleanFilename(r.original_filename || r.filename || r.public_id, r.public_id, r.format),
        size:        r.bytes,
        downloadUrl: toDownloadUrl(r.secure_url)
      }))

    return {
      statusCode: 200,
      body: JSON.stringify(tracks),
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }
    }
  } catch (err) {
    console.error('sharing function error:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
      headers: { 'Content-Type': 'application/json' }
    }
  }
}
