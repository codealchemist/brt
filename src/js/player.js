/**
 * AudioPlayer
 * Wraps the native HTML5 <audio> element with a custom UI.
 * Fetches track list from /api/tracks and stream URLs from /api/stream.
 */
export class AudioPlayer {
  constructor() {
    this.audio = document.getElementById('audioEl')
    this.tracks = []
    this.currentIndex = -1

    // DOM refs
    this.btnPlay = document.getElementById('btnPlay')
    this.btnPrev = document.getElementById('btnPrev')
    this.btnNext = document.getElementById('btnNext')
    this.volumeSlider = document.getElementById('volumeSlider')
    this.progressBar = document.getElementById('progressBar')
    this.progressFill = document.getElementById('progressFill')
    this.currentTimeEl = document.getElementById('currentTime')
    this.totalTimeEl = document.getElementById('totalTime')
    this.trackNameEl = document.getElementById('playerTrackName')
    this.trackIndexEl = document.getElementById('playerTrackIndex')
    this.tracklistEl = document.getElementById('tracklist')
    this.tracklistEmptyEl = document.getElementById('tracklistEmpty')
    this.loadingEl = document.getElementById('playerLoading')
    this.errorEl = document.getElementById('playerError')
    this.artworkInner = document.querySelector('.player__artwork-inner')

    this.audio.volume = parseFloat(this.volumeSlider.value)

    this._bindEvents()
  }

  async init() {
    this._showLoading(true)
    this._showError(false)
    try {
      const res = await fetch('/api/tracks')
      const data = await res.json()
      if (!res.ok) throw new Error(data.details || data.error || `HTTP ${res.status}`)
      this.tracks = data
      this._renderTracklist()
    } catch (err) {
      console.error('Failed to load tracks:', err)
      this._showError(true, err.message)
    } finally {
      this._showLoading(false)
    }
  }

  async playTrack(index) {
    if (index < 0 || index >= this.tracks.length) return

    const track = this.tracks[index]
    this.currentIndex = index
    this._updateActiveTrack()
    this._updateInfo(track.name, index)

    this.audio.pause()
    this.audio.src = track.url
    try {
      await this.audio.play()
      this._setPlayingState(true)
    } catch (err) {
      console.error('Failed to play track:', err)
    }
  }

  // ─── Private ──────────────────────────────────────────────

  _bindEvents() {
    this.btnPlay.addEventListener('click', () => this._togglePlay())
    this.btnPrev.addEventListener('click', () => this._prevTrack())
    this.btnNext.addEventListener('click', () => this._nextTrack())

    this.volumeSlider.addEventListener('input', () => {
      this.audio.volume = parseFloat(this.volumeSlider.value)
    })

    this.progressBar.addEventListener('click', (e) => {
      if (!this.audio.duration) return
      const rect = this.progressBar.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      this.audio.currentTime = ratio * this.audio.duration
    })

    this.audio.addEventListener('timeupdate', () => this._onTimeUpdate())
    this.audio.addEventListener('ended', () => this._nextTrack())
    this.audio.addEventListener('play', () => this._setPlayingState(true))
    this.audio.addEventListener('pause', () => this._setPlayingState(false))
    this.audio.addEventListener('durationchange', () => {
      this.totalTimeEl.textContent = this._formatTime(this.audio.duration)
    })
  }

  _togglePlay() {
    if (!this.audio.src) {
      if (this.tracks.length > 0) this.playTrack(0)
      return
    }
    if (this.audio.paused) {
      this.audio.play()
    } else {
      this.audio.pause()
    }
  }

  _prevTrack() {
    const idx = this.currentIndex > 0 ? this.currentIndex - 1 : this.tracks.length - 1
    this.playTrack(idx)
  }

  _nextTrack() {
    const idx = (this.currentIndex + 1) % this.tracks.length
    this.playTrack(idx)
  }

  _onTimeUpdate() {
    const { currentTime, duration } = this.audio
    this.currentTimeEl.textContent = this._formatTime(currentTime)
    if (duration) {
      this.progressFill.style.width = `${(currentTime / duration) * 100}%`
    }
  }

  _setPlayingState(playing) {
    const iconPlay = this.btnPlay.querySelector('.icon-play')
    const iconPause = this.btnPlay.querySelector('.icon-pause')
    iconPlay.style.display = playing ? 'none' : ''
    iconPause.style.display = playing ? '' : 'none'
    if (this.artworkInner) {
      this.artworkInner.classList.toggle('is-playing', playing)
    }
  }

  _renderTracklist() {
    if (this.tracks.length === 0) {
      this.tracklistEmptyEl.textContent = 'No MP3 files found in the configured Box folder.'
      return
    }
    this.tracklistEmptyEl.remove()

    this.tracks.forEach((track, i) => {
      const item = document.createElement('div')
      item.className = 'tracklist__item'
      item.dataset.index = i
      item.innerHTML = `
        <span class="tracklist__num">${i + 1}</span>
        <span class="tracklist__name">${this._cleanName(track.name)}</span>
        <span class="tracklist__size">${this._formatSize(track.size)}</span>
      `
      item.addEventListener('click', () => this.playTrack(i))
      this.tracklistEl.appendChild(item)
    })
  }

  _updateActiveTrack() {
    this.tracklistEl.querySelectorAll('.tracklist__item').forEach((el, i) => {
      el.classList.toggle('is-active', i === this.currentIndex)
    })
  }

  _updateInfo(name, index) {
    this.trackNameEl.textContent = this._cleanName(name)
    this.trackIndexEl.textContent = `${index + 1} / ${this.tracks.length}`
  }

  _showLoading(show) {
    this.loadingEl.hidden = !show
  }

  _showError(show, message) {
    this.errorEl.hidden = !show
    if (show && message) this.errorEl.querySelector('span').textContent = message
  }

  _formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  _formatSize(bytes) {
    if (!bytes) return ''
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  _cleanName(filename) {
    return filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
  }
}
