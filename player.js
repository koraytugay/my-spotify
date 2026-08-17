// Global Sticky Bottom Mini-Player with Spotify IFrame API & Uninterrupted SPA Navigation

(function() {
    class MiniAudioPlayer {
        constructor() {
            this.currentTrack = null;
            this.currentType = 'track';
            this.playlist = [];
            this.isPlaying = false;
            this.isCollapsed = localStorage.getItem('mini_player_collapsed') !== 'false';
            this.embedController = null;
            this.pendingPlayUri = null;
            this.onStateChangeCallbacks = new Set();
            this.lastEndedTrackId = null;
            this.likedSongIds = new Set();
            this.likedSongKeys = new Set();

            this.initDOM();
            this.restoreState();
            this.loadLikedSongsCache();
            this.initSpotifyIFrameAPI();
            this.bindEvents();
        }

        initDOM() {
            if (document.getElementById('spotify-mini-player')) return;

            const playerEl = document.createElement('div');
            playerEl.id = 'spotify-mini-player';
            playerEl.className = `mini-player-container ${this.isCollapsed ? 'collapsed' : ''}`;
            playerEl.innerHTML = `
                <!-- Minimalist Left Drawer Pull Tab -->
                <div class="mini-player-handle" id="mini-player-handle" title="Toggle Spotify Player Drawer">
                    <div class="handle-drawer-tab">
                        <svg class="handle-spotify-svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                        </svg>
                        <span class="handle-liked-dot" id="handle-liked-dot" style="display: none;">💚</span>
                    </div>
                </div>

                <div class="mini-player-dock">
                    <!-- Top Status Bar for Liked Songs and Track Meta -->
                    <div class="mini-player-topbar" id="mini-player-topbar">
                        <div class="mini-player-liked-badge" id="mini-player-liked-badge" style="display: none;">
                            <span class="liked-heart-icon" id="mini-player-liked-icon">💚</span>
                            <span class="liked-status-text" id="mini-player-liked-text">Liked Song</span>
                        </div>
                        <div class="mini-player-top-track" id="mini-player-top-track"></div>
                        <button type="button" class="mini-player-close-btn" id="mini-player-close-btn" title="Collapse Player">✕</button>
                    </div>

                    <!-- Spotify Interactive Embed Container Slot -->
                    <div class="mini-player-embed-wrap" id="mini-embed-wrap">
                        <div id="mini-spotify-embed-slot"></div>
                    </div>
                </div>
            `;

            document.body.appendChild(playerEl);
            document.body.classList.add('has-mini-player');
        }

        saveState() {
            if (!this.currentTrack) return;
            const state = {
                item: this.currentTrack,
                type: this.currentType || 'track',
                playlist: this.playlist || [],
                contextTitle: this.contextTitle || '',
                isPlaying: this.isPlaying,
                isCollapsed: this.isCollapsed
            };
            try {
                sessionStorage.setItem('mini_player_state', JSON.stringify(state));
            } catch (e) {}
        }

        restoreState() {
            try {
                const saved = sessionStorage.getItem('mini_player_state');
                if (saved) {
                    const state = JSON.parse(saved);
                    if (state && state.item) {
                        this.currentTrack = state.item;
                        this.currentType = state.type || 'track';
                        this.playlist = Array.isArray(state.playlist) ? state.playlist : [];
                        this.contextTitle = state.contextTitle || '';
                        this.displayTrackInfo(state.item, state.type);
                        if (state.isCollapsed) {
                            this.collapse();
                        }
                        return state.item;
                    }
                }
            } catch (e) {}
            return null;
        }

        initSpotifyIFrameAPI() {
            window.onSpotifyIframeApiReady = (IFrameAPI) => {
                const element = document.getElementById('mini-spotify-embed-slot');
                if (!element) return;

                let defaultUri = 'spotify:track:2hnPh9dWcu0RVdMitsSukF';
                if (this.currentTrack) {
                    defaultUri = this.currentTrack.uri || `spotify:${this.currentType || 'track'}:${this.currentTrack.id}`;
                }

                const options = {
                    width: '100%',
                    height: '500',
                    uri: defaultUri
                };

                let maxPositionSeen = 0;
                let lastActiveTrackId = null;

                IFrameAPI.createController(element, options, (EmbedController) => {
                    this.embedController = EmbedController;

                    EmbedController.addListener('playback_update', e => {
                        const isPaused = e.data.isPaused;
                        this.isPlaying = !isPaused;
                        this.saveState();
                        this.updateUIState();
                        this.notifyStateChange();

                        const currentId = this.currentTrack?.id;
                        if (currentId !== lastActiveTrackId) {
                            lastActiveTrackId = currentId;
                            maxPositionSeen = 0;
                        }

                        const pos = e.data.position || 0;
                        const dur = e.data.duration || 0;

                        // Synchronize track info if Spotify advanced internally inside album or playlist
                        const newTrackId = e.data.track?.id || (e.data.track?.uri ? e.data.track.uri.split(':')[2] : null) || (e.data.uri ? e.data.uri.split(':')[2] : null);
                        const trackName = e.data.track?.name || e.data.track?.title;

                        if (newTrackId || trackName) {
                            let found = (this.playlist || []).find(t => (newTrackId && t.id === newTrackId) || (trackName && t.name && t.name.toLowerCase() === trackName.toLowerCase()));
                            
                            if (!found && (newTrackId || trackName)) {
                                found = {
                                    id: newTrackId,
                                    name: trackName || 'Playing Song',
                                    artistNames: (e.data.track?.artists && Array.isArray(e.data.track.artists)) ? e.data.track.artists.map(a => a.name).join(', ') : '',
                                    artists: e.data.track?.artists || [],
                                    album: { name: this.contextTitle || '' }
                                };
                            }

                            if (found && (this.currentTrack?.id !== found.id || this.currentTrack?.name !== found.name)) {
                                this.currentTrack = found;
                                maxPositionSeen = pos;
                                this.displayTrackInfo(found, this.currentType || 'track');
                                this.updateUIState();
                                this.notifyStateChange();
                            }
                        } else if (dur > 0 && Array.isArray(this.playlist) && this.playlist.length > 1) {
                            // Check if current stream duration matches a different track in this album/playlist
                            const currentDur = this.currentTrack?.durationMs || 0;
                            if (Math.abs(dur - currentDur) > 2500) {
                                const matchingTrack = this.playlist.find(t => t.durationMs && Math.abs(t.durationMs - dur) < 2000);
                                if (matchingTrack && matchingTrack.id !== this.currentTrack?.id) {
                                    this.currentTrack = matchingTrack;
                                    maxPositionSeen = pos;
                                    this.displayTrackInfo(matchingTrack, this.currentType || 'track');
                                    this.updateUIState();
                                    this.notifyStateChange();
                                }
                            }
                        }

                        // Advance when position drops back to start after playing
                        if (this.isPlaying && maxPositionSeen > 10000 && pos < 2500) {
                            const currentIndex = (this.playlist || []).findIndex(t => t.id === this.currentTrack?.id);
                            if (currentIndex !== -1 && currentIndex + 1 < this.playlist.length) {
                                const nextTrack = this.playlist[currentIndex + 1];
                                this.currentTrack = nextTrack;
                                maxPositionSeen = pos;
                                this.displayTrackInfo(nextTrack, this.currentType || 'track');
                                this.updateUIState();
                                this.notifyStateChange();
                            }
                        }

                        // Auto-advance when playback finishes and pauses:
                        // 1. Full track finished: position reached near duration (dur - 2500ms) or reached duration
                        // 2. 30s Preview finished: position reached preview cutoff (>= 20000ms)
                        if (isPaused && dur > 0) {
                            const isFullTrackEnd = (pos >= dur) || (dur > 5000 && maxPositionSeen >= (dur - 2500));
                            const isPreviewEnd = (maxPositionSeen >= 20000);

                            if (isFullTrackEnd || isPreviewEnd) {
                                if (currentId && currentId !== this.lastEndedTrackId) {
                                    this.lastEndedTrackId = currentId;
                                    maxPositionSeen = 0;
                                    console.log('Song finished naturally. Advancing to next track in queue...');
                                    setTimeout(() => {
                                        this.playNext();
                                    }, 300);
                                }
                            }
                        }
                    });

                    EmbedController.addListener('ready', () => {
                        if (this.pendingPlayUri) {
                            const uriToPlay = this.pendingPlayUri;
                            this.pendingPlayUri = null;
                            EmbedController.loadUri(uriToPlay);
                            EmbedController.play();
                            this.isPlaying = true;
                            this.saveState();
                            this.updateUIState();
                            this.notifyStateChange();
                        }
                    });
                });
            };

            // Inject script if not already present
            if (!document.getElementById('spotify-iframe-api-script')) {
                const script = document.createElement('script');
                script.id = 'spotify-iframe-api-script';
                script.src = 'https://open.spotify.com/embed/iframe-api/v1';
                script.async = true;
                document.head.appendChild(script);
            }
        }

        toggleCollapse() {
            this.isCollapsed = !this.isCollapsed;
            localStorage.setItem('mini_player_collapsed', this.isCollapsed);
            this.saveState();
            const playerEl = document.getElementById('spotify-mini-player');
            if (playerEl) playerEl.classList.toggle('collapsed', this.isCollapsed);
        }

        expand() {
            if (this.isCollapsed) {
                this.toggleCollapse();
            }
        }

        collapse() {
            if (!this.isCollapsed) {
                this.toggleCollapse();
            }
        }

        async loadLikedSongsCache() {
            try {
                if (typeof getLikedSongs === 'function') {
                    const liked = await getLikedSongs();
                    if (Array.isArray(liked)) {
                        this.likedSongIds = new Set();
                        this.likedSongKeySet = new Set();

                        liked.forEach(s => {
                            if (!s) return;
                            if (s.id) this.likedSongIds.add(s.id);

                            const sName = this.normalizeTrackName(s.name);
                            if (sName) {
                                if (s.artistNames) {
                                    this.likedSongKeySet.add(`${sName}:::${this.normalizeArtistName(s.artistNames)}`);
                                }
                                if (Array.isArray(s.artists)) {
                                    s.artists.forEach(a => {
                                        if (a && a.name) {
                                            this.likedSongKeySet.add(`${sName}:::${this.normalizeArtistName(a.name)}`);
                                        }
                                    });
                                }
                            }
                        });
                        this.updateLikedStatusUI();
                    }
                }
            } catch (e) {
                console.error('Error loading liked songs cache in player:', e);
            }
        }

        normalizeTrackName(str) {
            return (str || '')
                .toLowerCase()
                .replace(/\s*\(.*?\)\s*/g, ' ')
                .replace(/\s*-\s*.*$/g, '')
                .replace(/[\u2018\u2019]/g, "'")
                .replace(/[\u201C\u201D]/g, '"')
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        normalizeArtistName(str) {
            return (str || '')
                .toLowerCase()
                .replace(/[\u2018\u2019]/g, "'")
                .replace(/[\u201C\u201D]/g, '"')
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        checkIsLiked(track) {
            if (!track) return false;
            if (track.isLiked !== undefined) return !!track.isLiked;
            if (track.id && this.likedSongIds && this.likedSongIds.has(track.id)) return true;

            if (this.likedSongKeySet && track.name) {
                const normTitle = this.normalizeTrackName(track.name);
                if (normTitle) {
                    if (track.artistNames) {
                        const normArtist = this.normalizeArtistName(track.artistNames);
                        if (this.likedSongKeySet.has(`${normTitle}:::${normArtist}`)) return true;
                    }
                    if (Array.isArray(track.artists)) {
                        for (const a of track.artists) {
                            if (a && a.name) {
                                const normA = this.normalizeArtistName(a.name);
                                if (this.likedSongKeySet.has(`${normTitle}:::${normA}`)) return true;
                            }
                        }
                    }
                }
            }
            return false;
        }

        updateLikedStatusUI() {
            const track = this.currentTrack;
            const badgeEl = document.getElementById('mini-player-liked-badge');
            const iconEl = document.getElementById('mini-player-liked-icon');
            const textEl = document.getElementById('mini-player-liked-text');
            const handleTitle = document.getElementById('handle-title');
            const topTrack = document.getElementById('mini-player-top-track');

            const isLiked = this.checkIsLiked(track);

            if (badgeEl) {
                badgeEl.style.display = track ? 'inline-flex' : 'none';
                badgeEl.classList.toggle('is-liked', isLiked);
                badgeEl.classList.toggle('not-liked', !isLiked);
            }
            if (iconEl) {
                iconEl.textContent = isLiked ? '💚' : '🤍';
            }
            if (textEl) {
                textEl.textContent = isLiked ? 'Liked Song' : 'Not in Liked';
            }
            const handleLikedDot = document.getElementById('handle-liked-dot');
            if (handleLikedDot) {
                handleLikedDot.style.display = (track && isLiked) ? 'inline-block' : 'none';
            }
            if (topTrack && track) {
                const artistName = track.artistNames || (track.artists && track.artists[0]?.name) || '';
                topTrack.textContent = track.name ? `${track.name}${artistName ? ' • ' + artistName : ''}` : '';
                topTrack.title = topTrack.textContent;
            }
        }

        bindEvents() {
            const handleEl = document.getElementById('mini-player-handle');
            if (handleEl) {
                handleEl.addEventListener('click', () => this.toggleCollapse());
            }

            const closeBtn = document.getElementById('mini-player-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.collapse());
            }

            // Global Keyboard Shortcuts (Space: Play/Pause, N/Shift+Right: Next, P/Shift+Left: Prev, R: Random)
            document.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }

                if (e.code === 'Space') {
                    e.preventDefault();
                    this.togglePlayPause();
                } else if (e.key === 'n' || e.key === 'N' || (e.shiftKey && e.key === 'ArrowRight')) {
                    e.preventDefault();
                    this.playNext();
                } else if (e.key === 'p' || e.key === 'P' || (e.shiftKey && e.key === 'ArrowLeft')) {
                    e.preventDefault();
                    this.playPrevious();
                } else if (e.key === 'r' || e.key === 'R') {
                    if (this.playlist.length > 0) {
                        this.playRandom();
                    }
                }
            });
        }

        setPlaylist(tracks, type = 'track') {
            if (Array.isArray(tracks) && tracks.length > 0) {
                this.playlist = tracks;
                if (!this.currentTrack && tracks.length > 0) {
                    this.displayTrackInfo(tracks[0], type);
                }
            }
        }

        displayTrackInfo(item, type = 'track') {
            if (!item) return;
            this.currentTrack = item;
            this.currentType = type;

            this.updateLikedStatusUI();
        }

        async playItem(item, type = 'track', playlist = null) {
            if (!item) return;

            // Reset queue for playlist or album playback
            if (type === 'playlist') {
                let tracks = item.tracks;
                if ((!tracks || tracks.length === 0) && typeof allPlaylists !== 'undefined') {
                    const found = allPlaylists.find(p => p.id === item.id);
                    if (found && found.tracks) tracks = found.tracks;
                }

                if ((!tracks || tracks.length === 0) && typeof getPlaylistById === 'function') {
                    try {
                        const fullData = await getPlaylistById(item.id);
                        if (fullData && fullData.tracks) tracks = fullData.tracks;
                    } catch (e) {}
                }

                if (tracks && Array.isArray(tracks) && tracks.length > 0) {
                    this.playlist = tracks;
                    this.currentTrack = tracks[0]; // Start from Song 1
                } else {
                    this.playlist = [item];
                    this.currentTrack = item;
                }
                this.currentType = 'playlist';
                this.contextTitle = item.name || 'Playlist';
            } else if (type === 'album') {
                let tracks = item.tracks;
                if ((!tracks || tracks.length === 0) && typeof allAlbums !== 'undefined') {
                    const found = allAlbums.find(a => a.id === item.id);
                    if (found && found.tracks) tracks = found.tracks;
                }

                if ((!tracks || tracks.length === 0) && typeof getSavedAlbums === 'function') {
                    try {
                        const albums = await getSavedAlbums();
                        const found = (albums || []).find(a => a.id === item.id);
                        if (found && found.tracks) tracks = found.tracks;
                    } catch (e) {}
                }

                if (tracks && Array.isArray(tracks) && tracks.length > 0) {
                    this.playlist = tracks;
                    this.currentTrack = tracks[0]; // Start from Song 1
                } else {
                    this.playlist = [item];
                    this.currentTrack = item;
                }
                this.currentType = 'album';
                this.contextTitle = item.name || 'Album';
            } else {
                this.currentType = 'track';
                this.currentTrack = item;
                this.contextTitle = this.contextTitle || 'Liked Songs';
                if (playlist && Array.isArray(playlist)) {
                    this.setPlaylist(playlist, 'track');
                } else if (this.playlist.length === 0) {
                    this.tryDetectPagePlaylist();
                }
            }

            const activeTrack = this.currentTrack || item;
            this.displayTrackInfo(activeTrack, type);

            // Automatically expand the Spotify Player dock in the bottom-right corner
            this.expand();

            // For Albums and Playlists, pass the container URI so Spotify natively streams all tracks in background!
            let uri;
            if (type === 'album' && item.id) {
                uri = `spotify:album:${item.id}`;
            } else if (type === 'playlist' && item.id) {
                uri = `spotify:playlist:${item.id}`;
            } else {
                uri = activeTrack.uri || `spotify:track:${activeTrack.id}`;
            }

            if (this.embedController) {
                this.embedController.loadUri(uri);
                this.embedController.play();
                this.isPlaying = true;
                this.saveState();
            } else {
                this.pendingPlayUri = uri;
                const slot = document.getElementById('mini-spotify-embed-slot');
                if (slot) {
                    slot.innerHTML = `
                        <iframe 
                            src="https://open.spotify.com/embed/${type}/${item.id || activeTrack.id}?utm_source=generator&theme=0&autoplay=1" 
                            width="100%" 
                            height="500" 
                            frameBorder="0" 
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                            loading="lazy">
                        </iframe>
                    `;
                }
                this.isPlaying = true;
                this.saveState();
            }

            this.updateUIState();
            this.notifyStateChange();
        }

        playTrack(track, playlist = null) {
            if (!track) return;
            if (playlist && Array.isArray(playlist)) {
                this.playlist = playlist;
            }
            this.currentTrack = track;
            this.lastEndedTrackId = null;

            this.displayTrackInfo(track, this.currentType || 'track');

            // Automatically expand the Spotify Player dock in the bottom-right corner
            this.expand();

            const uri = track.uri || `spotify:track:${track.id}`;

            if (this.embedController) {
                this.embedController.loadUri(uri);
                this.isPlaying = true;
                this.saveState();

                setTimeout(() => {
                    if (this.embedController && this.isPlaying) {
                        this.embedController.play();
                    }
                }, 300);
                setTimeout(() => {
                    if (this.embedController && this.isPlaying) {
                        this.embedController.play();
                    }
                }, 800);
            } else {
                this.pendingPlayUri = uri;
                const slot = document.getElementById('mini-spotify-embed-slot');
                if (slot) {
                    slot.innerHTML = `
                        <iframe 
                            src="https://open.spotify.com/embed/track/${track.id}?utm_source=generator&theme=0&autoplay=1" 
                            width="100%" 
                            height="500" 
                            frameBorder="0" 
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                            loading="lazy">
                        </iframe>
                    `;
                }
                this.isPlaying = true;
                this.saveState();
            }

            this.updateUIState();
            this.notifyStateChange();
        }

        toggleTrack(track, playlist = null) {
            if (!track) return;
            if (this.currentTrack && this.currentTrack.id === track.id) {
                this.togglePlayPause();
            } else {
                this.playTrack(track, playlist);
            }
        }

        togglePlayPause() {
            if (this.embedController) {
                this.embedController.togglePlay();
            } else if (this.currentTrack) {
                this.playTrack(this.currentTrack);
            } else {
                this.playNext();
            }
        }

        playNext() {
            if (!Array.isArray(this.playlist) || this.playlist.length === 0) {
                this.tryDetectPagePlaylist();
            }
            if (!Array.isArray(this.playlist) || this.playlist.length === 0) return;

            const currentIndex = this.playlist.findIndex(t => t.id === this.currentTrack?.id);
            const nextIndex = currentIndex !== -1 ? currentIndex + 1 : 0;

            // When the queue ends, stop playing (do not loop back to 0)
            if (nextIndex >= this.playlist.length) {
                this.isPlaying = false;
                if (this.embedController) {
                    this.embedController.pause();
                }
                this.saveState();
                this.updateUIState();
                this.notifyStateChange();
                return;
            }

            this.playTrack(this.playlist[nextIndex]);
        }

        playPrevious() {
            if (!Array.isArray(this.playlist) || this.playlist.length === 0) {
                this.tryDetectPagePlaylist();
            }
            if (!Array.isArray(this.playlist) || this.playlist.length === 0) return;

            const currentIndex = this.playlist.findIndex(t => t.id === this.currentTrack?.id);
            const prevIndex = currentIndex !== -1 ? Math.max(0, currentIndex - 1) : 0;
            this.playTrack(this.playlist[prevIndex]);
        }

        playRandom() {
            if (!Array.isArray(this.playlist) || this.playlist.length === 0) {
                this.tryDetectPagePlaylist();
            }
            if (!Array.isArray(this.playlist) || this.playlist.length === 0) return;

            const randomIdx = Math.floor(Math.random() * this.playlist.length);
            this.playTrack(this.playlist[randomIdx]);
        }

        tryDetectPagePlaylist() {
            if (this.playlist && this.playlist.length > 0) return;

            let foundTracks = [];
            let detectedType = 'track';

            if (typeof filteredSongs !== 'undefined' && Array.isArray(filteredSongs) && filteredSongs.length > 0) {
                foundTracks = filteredSongs;
            } else if (typeof allSongs !== 'undefined' && Array.isArray(allSongs) && allSongs.length > 0) {
                foundTracks = allSongs;
            } else if (typeof filteredTracks !== 'undefined' && Array.isArray(filteredTracks) && filteredTracks.length > 0) {
                foundTracks = filteredTracks;
            } else if (typeof allArtistSongs !== 'undefined' && Array.isArray(allArtistSongs) && allArtistSongs.length > 0) {
                foundTracks = allArtistSongs;
            }

            if (foundTracks.length > 0) {
                this.playlist = foundTracks;
                this.currentType = detectedType;
            }
        }

        updateUIState() {
            const playIcon = document.getElementById('mini-player-play-icon');
            const eq = document.getElementById('mini-player-eq');
            if (playIcon) {
                playIcon.textContent = this.isPlaying ? '⏸' : '▶';
            }
            if (eq) {
                eq.classList.toggle('playing', !!this.isPlaying);
            }
        }

        onStateChange(cb) {
            if (typeof cb === 'function') {
                this.onStateChangeCallbacks.add(cb);
            }
        }

        notifyStateChange() {
            this.onStateChangeCallbacks.forEach(cb => {
                try {
                    cb({
                        isPlaying: this.isPlaying,
                        currentTrackId: this.currentTrack?.id || null,
                        currentTrack: this.currentTrack,
                        type: this.currentType || 'track'
                    });
                } catch (e) {
                    console.error('Error in onStateChange callback:', e);
                }
            });
        }
    }

    let playerInstance = null;
    function getPlayer() {
        if (!playerInstance) {
            playerInstance = new MiniAudioPlayer();
        }
        return playerInstance;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.miniPlayer = getPlayer();
        });
    } else {
        window.miniPlayer = getPlayer();
    }

    // Seamless SPA Client-Side Routing
    function getCleanPageName(pathname = window.location.pathname) {
        const seg = pathname.split('/').filter(Boolean).pop() || 'index.html';
        if (!seg.includes('.html')) {
            return 'index.html';
        }
        return seg.split('?')[0];
    }
    window.getCleanPageName = getCleanPageName;

    async function loadScriptIfNeeded(src) {
        const filename = src.split('/').pop().split('?')[0];
        const existing = Array.from(document.querySelectorAll('script')).find(s => {
            const sSrc = s.getAttribute('src') || '';
            return sSrc.endsWith(filename);
        });
        if (existing) return Promise.resolve();

        return new Promise((resolve) => {
            const s = document.createElement('script');
            const url = new URL(src, window.location.href);
            s.src = url.href;
            s.onload = resolve;
            s.onerror = (err) => {
                console.warn(`Could not dynamically load script ${src}:`, err);
                resolve();
            };
            document.body.appendChild(s);
        });
    }

    async function spaNavigate(targetUrl, pushState = true) {
        try {
            // Resolve target URL relative to current location (works on localhost and GitHub Pages subfolders)
            const urlObj = new URL(targetUrl, window.location.href);
            const targetCleanPath = getCleanPageName(urlObj.pathname);

            const response = await fetch(urlObj.href);
            if (!response.ok) {
                console.warn(`SPA fetch failed (${response.status}) for ${urlObj.href}, falling back to direct navigation.`);
                window.location.href = urlObj.href;
                return;
            }

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const newContainer = doc.querySelector('.container');
            const currentContainer = document.querySelector('.container');

            if (!newContainer || !currentContainer) {
                window.location.href = urlObj.href;
                return;
            }

            if (pushState) {
                history.pushState({}, '', urlObj.href);
            }

            document.title = doc.title;
            currentContainer.innerHTML = newContainer.innerHTML;
            window.scrollTo(0, 0);

            // Update active state on nav-links
            document.querySelectorAll('.nav-link').forEach(link => {
                const linkHref = link.getAttribute('href')?.split('?')[0];
                const isMatch = linkHref === targetCleanPath || (targetCleanPath === 'index.html' && linkHref === 'index.html');
                link.classList.toggle('active', isMatch);
            });

            // Initialize target page module
            if (targetCleanPath === 'index.html') {
                await loadScriptIfNeeded('script.js');
                if (typeof init === 'function') init();
            } else if (targetCleanPath === 'playlists.html') {
                await loadScriptIfNeeded('playlists.js');
                if (typeof initPlaylists === 'function') initPlaylists();
            } else if (targetCleanPath === 'albums.html') {
                await loadScriptIfNeeded('albums.js');
                if (typeof initAlbums === 'function') initAlbums();
            } else if (targetCleanPath === 'artists.html') {
                await loadScriptIfNeeded('artists.js');
                if (typeof initArtists === 'function') initArtists();
            } else if (targetCleanPath === 'smart-mix.html') {
                await loadScriptIfNeeded('smart-mix.js');
                if (typeof initSmartMix === 'function') initSmartMix();
            } else if (targetCleanPath === 'stats.html') {
                await loadScriptIfNeeded('stats.js');
                if (typeof initStats === 'function') initStats();
            } else if (targetCleanPath === 'playlist.html') {
                await loadScriptIfNeeded('playlist.js');
                if (typeof initPlaylistDetail === 'function') initPlaylistDetail();
            } else if (targetCleanPath === 'album.html') {
                await loadScriptIfNeeded('album.js');
                if (typeof initAlbumDetail === 'function') initAlbumDetail();
            } else if (targetCleanPath === 'artist.html') {
                await loadScriptIfNeeded('artist.js');
                if (typeof initArtistDetail === 'function') initArtistDetail();
            }

            // Sync player with new view
            if (window.miniPlayer) {
                window.miniPlayer.updateUIState();
            }
        } catch (e) {
            console.error('SPA navigation failed, falling back to direct navigation:', e);
            window.location.href = targetUrl;
        }
    }

    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href) return;

        if (
            href.startsWith('http://') || 
            href.startsWith('https://') || 
            href.startsWith('spotify:') || 
            href.startsWith('mailto:') || 
            href.startsWith('#') ||
            link.target === '_blank' ||
            link.hasAttribute('download') ||
            e.ctrlKey || e.metaKey || e.shiftKey || e.altKey
        ) {
            return;
        }

        e.preventDefault();
        spaNavigate(href, true);
    });

    window.addEventListener('popstate', () => {
        spaNavigate(window.location.href, false);
    });

    window.spaNavigate = spaNavigate;

    window.togglePlayPreview = function(id, previewUrl) {
        const player = window.miniPlayer || getPlayer();
        let trackObj = null;

        const lists = [
            typeof filteredSongs !== 'undefined' ? filteredSongs : [],
            typeof allSongs !== 'undefined' ? allSongs : [],
            typeof filteredTracks !== 'undefined' ? filteredTracks : [],
            typeof allArtistSongs !== 'undefined' ? allArtistSongs : []
        ];

        for (const list of lists) {
            if (Array.isArray(list)) {
                const match = list.find(t => t.id === id);
                if (match) {
                    trackObj = match;
                    break;
                }
            }
        }

        if (!trackObj) {
            trackObj = { id, previewUrl };
        }

        player.toggleTrack(trackObj);
    };

    window.togglePlayAlbum = function(id) {
        const player = window.miniPlayer || getPlayer();
        if (!player) return;

        let albumObj = null;
        if (typeof filteredAlbums !== 'undefined') {
            albumObj = filteredAlbums.find(a => a.id === id);
        }
        if (!albumObj && typeof allArtistAlbums !== 'undefined') {
            albumObj = allArtistAlbums.find(a => a.id === id);
        }
        if (!albumObj && typeof allAlbums !== 'undefined') {
            albumObj = allAlbums.find(a => a.id === id);
        }
        if (!albumObj) {
            albumObj = { id };
        }
        player.playItem(albumObj, 'album');
    };

    window.togglePlayPlaylist = function(id) {
        const player = window.miniPlayer || getPlayer();
        if (!player) return;

        let playlistObj = null;
        if (typeof filteredPlaylists !== 'undefined') {
            playlistObj = filteredPlaylists.find(p => p.id === id);
        }
        if (!playlistObj && typeof allPlaylists !== 'undefined') {
            playlistObj = allPlaylists.find(p => p.id === id);
        }

        if (playlistObj && player.contextTitle === playlistObj.name) {
            player.togglePlayPause();
            return;
        }

        if (!playlistObj) {
            playlistObj = { id };
        }
        player.playItem(playlistObj, 'playlist');
    };
})();
