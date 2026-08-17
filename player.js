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
            playerEl.style.display = 'none'; // Hidden by default until playback starts
            playerEl.innerHTML = `
                <!-- Tall Sidebar Dock on Right -->
                <div class="mini-player-dock" id="mini-player-dock">
                    <!-- Top Status Bar -->
                    <div class="mini-player-topbar" id="mini-player-topbar">
                        <button type="button" class="mini-player-liked-badge" id="mini-player-liked-badge" title="Click to Like / Unlike on Spotify" style="display: none;">
                            <span class="liked-heart-icon" id="mini-player-liked-icon">💚</span>
                        </button>
                        <button type="button" class="mini-player-close-btn" id="mini-player-close-btn" title="Minimize to Bottom Bar">✕</button>
                    </div>

                    <!-- Spotify Interactive Embed Container Slot -->
                    <div class="mini-player-embed-wrap" id="mini-embed-wrap">
                        <div id="mini-spotify-embed-slot"></div>
                    </div>
                </div>

                <!-- Floating Island Bottom Audio Dock (Visible when Minimized) -->
                <div class="mini-player-bottom-bar" id="mini-player-bottom-bar">
                    <div class="bottom-bar-inner">
                        <!-- Left: Track info -->
                        <div class="bottom-bar-track-info" id="bottom-bar-track-info">
                            <img id="bottom-bar-thumb" class="bottom-bar-thumb" src="" alt="" style="display: none;">
                            <div class="bottom-bar-text">
                                <div class="bottom-bar-title" id="bottom-bar-title">Spotify Player</div>
                                <div class="bottom-bar-artist" id="bottom-bar-artist">Click Expand to view full player</div>
                            </div>
                        </div>

                        <!-- Center: Playback Controls -->
                        <div class="bottom-bar-controls" id="bottom-bar-controls">
                            <button type="button" class="bottom-ctrl-btn prev-btn" id="bottom-bar-prev-btn" title="Previous Song (P)">⏮</button>
                            <button type="button" class="bottom-ctrl-btn play-pause-btn" id="bottom-bar-play-btn" title="Play / Pause (Space)">
                                <span id="bottom-bar-play-icon">▶</span>
                            </button>
                            <button type="button" class="bottom-ctrl-btn next-btn" id="bottom-bar-next-btn" title="Next Song (N)">⏭</button>
                        </div>

                        <!-- Right: Like first, Expand next -->
                        <div class="bottom-bar-actions">
                            <button type="button" class="mini-player-liked-badge bottom-bar-liked-badge" id="bottom-bar-liked-badge" title="Click to Like / Unlike on Spotify" style="display: none;">
                                <span class="liked-heart-icon" id="bottom-bar-liked-icon">💚</span>
                            </button>
                            <button type="button" class="bottom-bar-expand-btn" id="bottom-bar-expand-btn" title="Expand to Sidebar">⤢</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(playerEl);
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
                        this.isCollapsed = !!state.isCollapsed;

                        const playerEl = document.getElementById('spotify-mini-player');
                        if (playerEl) playerEl.style.display = '';
                        document.body.classList.add('has-mini-player');
                        document.body.classList.toggle('player-collapsed', this.isCollapsed);

                        this.updateEmbedMode(state.type || 'track');
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
                if (!element) {
                    console.warn('[Spotify Player] ⚠️ #mini-spotify-embed-slot element not found in DOM.');
                    return;
                }

                let defaultUri = 'spotify:track:2hnPh9dWcu0RVdMitsSukF';
                if (this.currentTrack) {
                    defaultUri = this.currentTrack.uri || `spotify:${this.currentType || 'track'}:${this.currentTrack.id}`;
                }

                console.log('[Spotify Player] 🔌 Spotify IFrame API ready. Creating EmbedController with URI:', defaultUri);

                const isSingleTrack = (!this.currentType || this.currentType === 'track');
                this.updateEmbedMode(this.currentType || 'track');

                const options = {
                    width: '100%',
                    height: isSingleTrack ? '352' : '100%',
                    uri: defaultUri
                };

                let maxPositionSeen = 0;
                let lastActiveTrackId = null;

                IFrameAPI.createController(element, options, (EmbedController) => {
                    this.embedController = EmbedController;
                    console.log('[Spotify Player] ✅ EmbedController created successfully!');

                    EmbedController.addListener('playback_update', e => {
                        const isPaused = e.data.isPaused;
                        this.isPlaying = !isPaused;
                        this.saveState();
                        this.updateUIState();
                        this.notifyStateChange();

                        const pos = e.data.position || 0;
                        const dur = e.data.duration || 0;
                        const newTrackId = e.data.track?.id || (e.data.track?.uri ? e.data.track.uri.split(':')[2] : null) || (e.data.uri ? e.data.uri.split(':')[2] : null);
                        const trackName = e.data.track?.name || e.data.track?.title;

                        console.log('[Spotify Player] 🔄 playback_update:', {
                            isPaused,
                            positionMs: Math.round(pos),
                            durationMs: Math.round(dur),
                            trackName: trackName || '(none)',
                            trackId: newTrackId || '(none)'
                        });

                        const currentId = this.currentTrack?.id;
                        if (currentId !== lastActiveTrackId) {
                            lastActiveTrackId = currentId;
                            maxPositionSeen = 0;
                        }

                        // If a new item was loaded in the last 1.5s, ignore stale track sync events from previous audio
                        if (Date.now() - (this.lastLoadTime || 0) < 1500) {
                            return;
                        }

                        // Synchronize track info if Spotify advanced internally inside album or playlist
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
                                console.log('[Spotify Player] 🔀 Track synchronized from embed:', found.name);
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

                        // Auto-advance when playback finishes and pauses
                        if (isPaused && dur > 0) {
                            const isFullTrackEnd = (pos >= dur) || (dur > 5000 && maxPositionSeen >= (dur - 2500));
                            const isPreviewEnd = (maxPositionSeen >= 20000);

                            if (isFullTrackEnd || isPreviewEnd) {
                                if (currentId && currentId !== this.lastEndedTrackId) {
                                    this.lastEndedTrackId = currentId;
                                    maxPositionSeen = 0;
                                    console.log('[Spotify Player] ⏭ Song finished naturally. Advancing to next track in queue...');
                                    setTimeout(() => {
                                        this.playNext();
                                    }, 300);
                                }
                            }
                        }
                    });

                    EmbedController.addListener('ready', () => {
                        console.log('[Spotify Player] 🟢 EmbedController "ready" event fired.');
                        if (this.pendingPlayUri) {
                            const uriToPlay = this.pendingPlayUri;
                            this.pendingPlayUri = null;
                            console.log('[Spotify Player] 🚀 Playing pending URI:', uriToPlay);
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
            document.body.classList.toggle('player-collapsed', this.isCollapsed);
        }

        expand() {
            const playerEl = document.getElementById('spotify-mini-player');
            if (playerEl) playerEl.style.display = '';
            document.body.classList.add('has-mini-player');
            if (this.isCollapsed) {
                this.toggleCollapse();
            }
        }

        collapse() {
            if (!this.isCollapsed) {
                this.toggleCollapse();
            }
        }

        hidePlayerCompletely() {
            this.isCollapsed = true;
            localStorage.setItem('mini_player_collapsed', 'true');
            this.saveState();
            const playerEl = document.getElementById('spotify-mini-player');
            if (playerEl) {
                playerEl.classList.add('collapsed');
                playerEl.style.display = 'none';
            }
            document.body.classList.remove('has-mini-player');
            document.body.classList.remove('player-collapsed');
            if (this.embedController) {
                try { this.embedController.pause(); } catch(e) {}
            }
            this.isPlaying = false;
            this.notifyStateChange();
        }

        async loadLikedSongsCache() {
            try {
                if (typeof getLikedSongs === 'function') {
                    const liked = await getLikedSongs();
                    if (Array.isArray(liked)) {
                        this.likedSongIds = new Set(liked.map(s => s && s.id).filter(Boolean));
                        this.updateLikedStatusUI();
                    }
                }
            } catch (e) {
                console.error('Error loading liked songs cache in player:', e);
            }
        }

        checkIsLiked(track) {
            if (!track) return false;
            if (track.isLiked !== undefined) return !!track.isLiked;
            if (track.id && this.likedSongIds && this.likedSongIds.has(track.id)) return true;
            return false;
        }

        updateLikedStatusUI() {
            const track = this.currentTrack;
            const badgeEl = document.getElementById('mini-player-liked-badge');
            const iconEl = document.getElementById('mini-player-liked-icon');
            const bottomBadgeEl = document.getElementById('bottom-bar-liked-badge');
            const bottomIconEl = document.getElementById('bottom-bar-liked-icon');

            const isLiked = this.checkIsLiked(track);

            if (badgeEl) {
                badgeEl.style.display = track ? 'inline-flex' : 'none';
                badgeEl.classList.toggle('is-liked', isLiked);
                badgeEl.classList.toggle('not-liked', !isLiked);
                badgeEl.title = isLiked ? 'Liked on Spotify (Click to Unlike)' : 'Not in Liked (Click to Like)';
            }
            if (iconEl) {
                iconEl.textContent = isLiked ? '💚' : '🤍';
            }

            if (bottomBadgeEl) {
                bottomBadgeEl.style.display = track ? 'inline-flex' : 'none';
                bottomBadgeEl.classList.toggle('is-liked', isLiked);
                bottomBadgeEl.classList.toggle('not-liked', !isLiked);
                bottomBadgeEl.title = isLiked ? 'Liked on Spotify (Click to Unlike)' : 'Not in Liked (Click to Like)';
            }
            if (bottomIconEl) {
                bottomIconEl.textContent = isLiked ? '💚' : '🤍';
            }

            const bottomTitle = document.getElementById('bottom-bar-title');
            const bottomArtist = document.getElementById('bottom-bar-artist');
            const bottomThumb = document.getElementById('bottom-bar-thumb');

            if (track) {
                if (bottomTitle) bottomTitle.textContent = track.name || 'Playing Song';
                const artistStr = track.artistNames || (track.artists && track.artists[0]?.name) || '';
                if (bottomArtist) bottomArtist.textContent = artistStr || this.contextTitle || '';
                if (bottomThumb) {
                    const imgUrl = track.thumbnailUrl || track.coverUrl || track.album?.coverUrl || '';
                    if (imgUrl) {
                        bottomThumb.src = imgUrl;
                        bottomThumb.style.display = 'block';
                    } else {
                        bottomThumb.style.display = 'none';
                    }
                }
            }
        }

        async getValidSpotifyToken() {
            const token = localStorage.getItem('spotify_user_access_token');
            const expiresAt = parseInt(localStorage.getItem('spotify_token_expires_at') || '0', 10);
            const refreshToken = localStorage.getItem('spotify_user_refresh_token');
            const clientId = localStorage.getItem('spotify_client_id');

            if (!token) return null;

            // Refresh if within 2 minutes of expiry
            if (Date.now() > expiresAt - 120000 && refreshToken && clientId) {
                try {
                    const body = new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: refreshToken,
                        client_id: clientId
                    });
                    const res = await fetch('https://accounts.spotify.com/api/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: body.toString()
                    });
                    if (res.ok) {
                        const data = await res.json();
                        localStorage.setItem('spotify_user_access_token', data.access_token);
                        if (data.scope) localStorage.setItem('spotify_granted_scopes', data.scope);
                        if (data.refresh_token) localStorage.setItem('spotify_user_refresh_token', data.refresh_token);
                        localStorage.setItem('spotify_token_expires_at', Date.now() + (data.expires_in * 1000));
                        return data.access_token;
                    }
                } catch (e) {
                    console.warn('Could not refresh token in player:', e);
                }
            }

            return token;
        }

        async toggleLikeTrack(track) {
            if (!track || !track.id) return false;

            const token = await this.getValidSpotifyToken();
            if (!token) {
                if (typeof openSpotifyAuthModal === 'function') {
                    openSpotifyAuthModal();
                } else {
                    const confirmed = confirm('To save songs to your Spotify Liked Songs, please connect your Spotify account in Smart Mix. Go to Smart Mix now?');
                    if (confirmed) {
                        window.location.href = 'smart-mix.html';
                    }
                }
                return false;
            }

            const wasLiked = this.checkIsLiked(track);
            const nextLiked = !wasLiked;

            // Optimistic instant UI update
            track.isLiked = nextLiked;
            if (nextLiked) {
                this.likedSongIds.add(track.id);
            } else {
                this.likedSongIds.delete(track.id);
            }
            this.updateLikedStatusUI();

            try {
                const method = nextLiked ? 'PUT' : 'DELETE';
                // Spotify's standard library endpoint: /v1/me/library?uris=spotify:track:...
                const trackUri = `spotify:track:${track.id}`;
                let res = await fetch(`https://api.spotify.com/v1/me/library?uris=${encodeURIComponent(trackUri)}`, {
                    method: method,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                // Fallback to legacy endpoint if /v1/me/library returns 404
                if (!res.ok && res.status === 404) {
                    res = await fetch(`https://api.spotify.com/v1/me/tracks?ids=${encodeURIComponent(track.id)}`, {
                        method: method,
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: method === 'PUT' ? JSON.stringify({ ids: [track.id] }) : undefined
                    });
                }

                if (!res.ok) {
                    // Revert on failure
                    track.isLiked = wasLiked;
                    if (wasLiked) {
                        this.likedSongIds.add(track.id);
                    } else {
                        this.likedSongIds.delete(track.id);
                    }
                    this.updateLikedStatusUI();

                    if (res.status === 403) {
                        const confirmAuth = confirm(
                            'Spotify returned 403 Forbidden: Your Spotify login token was issued before the library modify permission was added.\n\nClick OK to re-connect Spotify and grant permission.'
                        );
                        if (confirmAuth) {
                            if (typeof openSpotifyAuthModal === 'function') {
                                openSpotifyAuthModal();
                            } else {
                                window.location.href = 'smart-mix.html';
                            }
                        }
                    } else {
                        console.error(`Failed to update like status (${res.status})`);
                    }
                    return wasLiked;
                }
                return nextLiked;
            } catch (e) {
                // Revert on network error
                track.isLiked = wasLiked;
                if (wasLiked) {
                    this.likedSongIds.add(track.id);
                } else {
                    this.likedSongIds.delete(track.id);
                }
                this.updateLikedStatusUI();
                console.error('Network error updating liked track:', e);
                return wasLiked;
            }
        }

        async toggleLikeCurrentTrack() {
            return this.toggleLikeTrack(this.currentTrack);
        }

        bindEvents() {
            const likedBadge = document.getElementById('mini-player-liked-badge');
            if (likedBadge) {
                likedBadge.addEventListener('click', () => this.toggleLikeCurrentTrack());
            }

            const bottomLikedBadge = document.getElementById('bottom-bar-liked-badge');
            if (bottomLikedBadge) {
                bottomLikedBadge.addEventListener('click', () => this.toggleLikeCurrentTrack());
            }

            const bottomPrevBtn = document.getElementById('bottom-bar-prev-btn');
            if (bottomPrevBtn) {
                bottomPrevBtn.addEventListener('click', () => this.playPrevious());
            }

            const bottomPlayBtn = document.getElementById('bottom-bar-play-btn');
            if (bottomPlayBtn) {
                bottomPlayBtn.addEventListener('click', () => this.togglePlayPause());
            }

            const bottomNextBtn = document.getElementById('bottom-bar-next-btn');
            if (bottomNextBtn) {
                bottomNextBtn.addEventListener('click', () => this.playNext());
            }

            const closeBtn = document.getElementById('mini-player-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.collapse());
            }

            const expandBtn = document.getElementById('bottom-bar-expand-btn');
            if (expandBtn) {
                expandBtn.addEventListener('click', () => this.expand());
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

        updateEmbedMode(type = 'track') {
            const isSingleTrack = (type === 'track');
            const playerEl = document.getElementById('spotify-mini-player');
            const wrapEl = document.getElementById('mini-embed-wrap');

            if (playerEl) {
                playerEl.classList.toggle('track-mode', isSingleTrack);
                playerEl.classList.toggle('collection-mode', !isSingleTrack);
            }
            if (wrapEl) {
                wrapEl.style.height = isSingleTrack ? '352px' : '100%';
                wrapEl.style.flex = isSingleTrack ? '0 0 auto' : '1 1 auto';
                const iframe = wrapEl.querySelector('iframe');
                if (iframe) {
                    iframe.setAttribute('height', isSingleTrack ? '352' : '100%');
                    iframe.style.height = isSingleTrack ? '352px' : '100%';
                }
            }
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

            this.updateEmbedMode(type);
            this.updateLikedStatusUI();
        }

        loadItem(item, type = 'track', playlist = null) {
            if (!item) return;
            this.lastLoadTime = Date.now();

            // Reset queue for playlist or album playback
            if (type === 'playlist') {
                let tracks = item.tracks;
                if ((!tracks || tracks.length === 0) && typeof allPlaylists !== 'undefined') {
                    const found = allPlaylists.find(p => p.id === item.id);
                    if (found && found.tracks) tracks = found.tracks;
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
            this.updateEmbedMode(type);

            const playerEl = document.getElementById('spotify-mini-player');
            if (playerEl) {
                playerEl.style.display = '';
                playerEl.classList.toggle('collapsed', this.isCollapsed);
            }
            document.body.classList.add('has-mini-player');
            document.body.classList.toggle('player-collapsed', this.isCollapsed);

            // For Albums and Playlists, pass the container URI so Spotify natively streams all tracks in background!
            let uri;
            if (type === 'album' && item.id) {
                uri = `spotify:album:${item.id}`;
            } else if (type === 'playlist' && item.id) {
                uri = `spotify:playlist:${item.id}`;
            } else {
                uri = activeTrack.uri || `spotify:track:${activeTrack.id}`;
            }

            this.isPlaying = false;
            console.log('[Spotify Player] 📂 loadItem:', { name: item.name || item.id, type, uri, hasController: !!this.embedController });

            if (this.embedController) {
                try {
                    console.log('[Spotify Player] ⏸ Calling pause() before loading new URI');
                    this.embedController.pause();
                } catch(e) {
                    console.warn('[Spotify Player] ⚠️ pause() threw error:', e);
                }
                console.log('[Spotify Player] 💿 Calling loadUri(' + uri + ')');
                this.embedController.loadUri(uri);
                this.saveState();
            } else {
                console.log('[Spotify Player] ⏳ EmbedController not ready yet, queuing pending URI:', uri);
                this.pendingPlayUri = uri;
                const slot = document.getElementById('mini-spotify-embed-slot');
                if (slot) {
                    const embedHeight = (type === 'track' ? '352' : '100%');
                    slot.innerHTML = `
                        <iframe 
                            src="https://open.spotify.com/embed/${type}/${item.id || activeTrack.id}?utm_source=generator&theme=0" 
                            width="100%" 
                            height="${embedHeight}" 
                            frameBorder="0" 
                            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                            loading="lazy">
                        </iframe>
                    `;
                }
                this.saveState();
            }

            this.updateUIState();
            this.notifyStateChange();
        }

        playItem(item, type = 'track', playlist = null) {
            console.log('[Spotify Player] ▶ playItem called synchronously for:', { name: item?.name || item?.id, type });
            this.loadItem(item, type, playlist);
            if (this.embedController) {
                console.log('[Spotify Player] ▶ Calling play() for item:', item?.name);
                this.embedController.play();
                this.isPlaying = true;
                this.saveState();
                this.updateUIState();
                this.notifyStateChange();
            }
        }

        playTrack(track, playlist = null) {
            if (!track) return;
            this.lastLoadTime = Date.now();
            if (playlist && Array.isArray(playlist)) {
                this.playlist = playlist;
            }
            this.currentTrack = track;
            this.lastEndedTrackId = null;

            this.displayTrackInfo(track, this.currentType || 'track');

            const playerEl = document.getElementById('spotify-mini-player');
            if (playerEl) {
                playerEl.style.display = '';
                playerEl.classList.toggle('collapsed', this.isCollapsed);
            }
            document.body.classList.add('has-mini-player');
            document.body.classList.toggle('player-collapsed', this.isCollapsed);

            const uri = track.uri || `spotify:track:${track.id}`;
            console.log('[Spotify Player] ▶ playTrack called:', { name: track.name, uri, hasController: !!this.embedController });

            if (this.embedController) {
                try {
                    console.log('[Spotify Player] ⏸ Calling pause() before loading new track');
                    this.embedController.pause();
                } catch(e) {
                    console.warn('[Spotify Player] ⚠️ pause() threw error:', e);
                }
                console.log('[Spotify Player] 💿 Calling loadUri(' + uri + ')');
                this.embedController.loadUri(uri);
                console.log('[Spotify Player] ▶ Calling play() for track:', track.name);
                this.embedController.play();
                this.isPlaying = true;
                this.saveState();
            } else {
                console.log('[Spotify Player] ⏳ EmbedController not ready yet, queuing pending track URI:', uri);
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
            console.log('[Spotify Player] ⏯ togglePlayPause called. Current isPlaying:', this.isPlaying, 'hasController:', !!this.embedController);
            if (this.embedController) {
                if (this.isPlaying) {
                    this.desiredPlayUri = null;
                }
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
            const bottomPlayIcon = document.getElementById('bottom-bar-play-icon');
            const eq = document.getElementById('mini-player-eq');
            const iconText = this.isPlaying ? '⏸' : '▶';
            if (playIcon) {
                playIcon.textContent = iconText;
            }
            if (bottomPlayIcon) {
                bottomPlayIcon.textContent = iconText;
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

    document.addEventListener('visibilitychange', () => {
        console.log('[Spotify Player] 👁 Tab visibility changed to:', document.visibilityState, '| isPlaying:', window.miniPlayer?.isPlaying);
    });

    window.addEventListener('focus', () => {
        console.log('[Spotify Player] 🎯 Window gained focus | isPlaying:', window.miniPlayer?.isPlaying);
    });

    window.addEventListener('blur', () => {
        console.log('[Spotify Player] 💨 Window lost focus | isPlaying:', window.miniPlayer?.isPlaying);
    });

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
