/**
 * Netlify Function: tracks
 * GET /api/tracks
 *
 * Lists all MP3 files in the configured Box folder.
 * Returns: [{ id, name, size, url }]
 *
 * Each track includes a direct streaming URL using Box's access_token query
 * parameter — no separate stream request needed.
 *
 * Env vars required (Cloudinary):
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 */

// Cloudinary implementation - no Box dependencies
/**
 * Netlify Function: tracks (Cloudinary)
 * GET /api/tracks
 *
 * Lists raw audio files (MP3) stored in Cloudinary and returns
 * [{ id, name, size, url }].
 *
 * Env vars required:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *   CLOUDINARY_TRACKS_FOLDER  (optional prefix)
 */

const CLOUDINARY_BASE = 'https://api.cloudinary.com/v1_1'

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const {
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    CLOUDINARY_TRACKS_FOLDER
  } = process.env

  console.debug('tracks: env loaded', {
    CLOUDINARY_CLOUD_NAME: !!CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_TRACKS_FOLDER: CLOUDINARY_TRACKS_FOLDER || null
  })

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    console.error('Missing Cloudinary configuration environment variables')
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error' }),
      headers: { 'Content-Type': 'application/json' }
    }
  }

  try {
    const auth = Buffer.from(
      `${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}`
    ).toString('base64')
    const prefix = CLOUDINARY_TRACKS_FOLDER
      ? `${encodeURIComponent(CLOUDINARY_TRACKS_FOLDER)}`
      : ''
    const url = `${CLOUDINARY_BASE}/${CLOUDINARY_CLOUD_NAME}/resources/raw/upload?max_results=500${prefix ? `&prefix=${prefix}` : ''}`

    const response = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` }
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('tracks: Cloudinary API error', response.status, text)
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Cloudinary API error', details: text }),
        headers: { 'Content-Type': 'application/json' }
      }
    }
    const data = await response.json()
    let resources = data.resources || []

    // Helper: normalize the filename for display.
    // Uses Cloudinary's `original_filename` or `filename` when present,
    // falls back to `public_id`, ensures an extension, and decodes/cleans
    // common artifacts (path segments, URL-encoding, repeated chars).
    function cleanFilename(rawName, publicId, format) {
      let name = rawName || publicId || ''
      try {
        name = decodeURIComponent(name)
      } catch (e) {
        // ignore decode errors and use raw value
      }
      // Keep only the last path segment if any
      const parts = name.split(/[\\/]/)
      name = parts[parts.length - 1].trim()
      // Replace underscores with spaces and collapse whitespace
      name = name.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
      // Collapse repeated dashes
      name = name.replace(/-+/g, '-')

      // Separate extension if present (e.g. from original_filename)
      const extMatch = name.match(/(.*?)(\.[^.]+)$/)
      let base = extMatch ? extMatch[1] : name
      let ext = extMatch ? extMatch[2] : format ? `.${format}` : ''

      // Remove last 6 characters (simple truncation as requested)
      if (base.length > 6) {
        base = base.slice(0, -6)
      } else {
        base = ''
      }

      base = base.trim()
      // Rebuild name with extension
      name = base + ext
      return name
    }

    // If no raw resources found, try the video resource type (some audio
    // files are stored under the video endpoint depending on upload settings).
    if (!resources.length) {
      const altUrl = `${CLOUDINARY_BASE}/${CLOUDINARY_CLOUD_NAME}/resources/video/upload?max_results=500${prefix ? `&prefix=${prefix}` : ''}`

      const altResp = await fetch(altUrl, {
        headers: { Authorization: `Basic ${auth}` }
      })
      if (altResp.ok) {
        const altData = await altResp.json()
        const altResources = altData.resources || []

        resources = resources.concat(altResources)
      } else {
        const text = await altResp.text()
        console.error(
          'tracks: Cloudinary alternate API error',
          altResp.status,
          text
        )
      }
    }

    // Filter to mp3 resources and map to track objects
    const tracks = resources
      .filter(
        r =>
          r.format === 'mp3' || (r.secure_url && r.secure_url.endsWith('.mp3'))
      )
      .map(r => ({
        id: r.public_id,
        // Prefer the original filename reported by Cloudinary when available
        originalFilename: r.original_filename || r.filename || null,
        // Use cleaned filename for display
        name: cleanFilename(
          r.original_filename || r.filename || r.public_id,
          r.public_id,
          r.format
        ),
        size: r.bytes,
        url: r.secure_url
      }))

    return {
      statusCode: 200,
      body: JSON.stringify(tracks),
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store'
      }
    }
  } catch (err) {
    console.error('tracks function error:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
      headers: { 'Content-Type': 'application/json' }
    }
  }
}
