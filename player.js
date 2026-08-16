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

            this.initDOM();
            this.restoreState();
            this.initSpotifyIFrameAPI();
            this.bindEvents();
        }

        initDOM() {
            if (document.getElementById('spotify-mini-player')) return;

            const playerEl = document.createElement('div');
            playerEl.id = 'spotify-mini-player';
            playerEl.className = `mini-player-container ${this.isCollapsed ? 'collapsed' : ''}`;
            
            playerEl.innerHTML = `
                <!-- Floating Top Handle when collapsed -->
                <div class="mini-player-handle" id="mini-player-handle" title="Click to Expand / Collapse Spotify Player">
                    <span class="handle-pill">
                        <span class="handle-icon">🎵</span>
                        <span id="handle-title" class="handle-text">Spotify Player</span>
                        <span class="handle-arrow" id="handle-arrow">${this.isCollapsed ? '▲' : '▼'}</span>
                    </span>
                </div>

                <div class="mini-player-dock">
                    <!-- Spotify Interactive Square Embed Container Slot -->
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
                    height: '352',
                    uri: defaultUri
                };

                let lastEndedTrackId = null;
                let maxPositionSeen = 0;
                let lastActiveTrackId = null;

                IFrameAPI.createController(element, options, (EmbedController) => {
                    this.embedController = EmbedController;

                    EmbedController.addListener('playback_update', e => {
                        this.isPlaying = !e.data.isPaused;
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

                        if (pos > maxPositionSeen) {
                            maxPositionSeen = pos;
                        }

                        // Auto-advance to next track when playback finishes
                        if (dur > 0 && e.data.isPaused) {
                            const isNearEnd = (pos >= dur) || (maxPositionSeen > 5000 && maxPositionSeen >= (dur - 2500)) || (maxPositionSeen >= 28500);
                            if (isNearEnd) {
                                if (currentId && currentId !== lastEndedTrackId) {
                                    lastEndedTrackId = currentId;
                                    maxPositionSeen = 0;
                                    console.log('🎵 Track finished. Auto-playing next track...');
                                    setTimeout(() => {
                                        this.playNext();
                                    }, 350);
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
            const iconEl = document.getElementById('mini-collapse-icon');
            const handleArrow = document.getElementById('handle-arrow');
            if (playerEl) playerEl.classList.toggle('collapsed', this.isCollapsed);
            if (iconEl) iconEl.textContent = this.isCollapsed ? '▲' : '▼';
            if (handleArrow) handleArrow.textContent = this.isCollapsed ? '▲' : '▼';
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

        bindEvents() {
            const handleEl = document.getElementById('mini-player-handle');
            if (handleEl) {
                handleEl.addEventListener('click', () => this.toggleCollapse());
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

            const coverEl = document.getElementById('mini-player-cover');
            const titleEl = document.getElementById('mini-player-title');
            const artistEl = document.getElementById('mini-player-artist');
            const spotifyBtn = document.getElementById('mini-player-spotify');
            const handleTitle = document.getElementById('handle-title');

            const coverUrl = item.coverUrl || item.thumbnailUrl || (item.images && item.images[0]?.url) || 'https://via.placeholder.com/60x60?text=Spotify';
            if (coverEl) coverEl.src = coverUrl;

            let titleText = item.name || 'Untitled';
            let artistText = '';

            if (type === 'playlist') {
                artistText = `Playlist by ${item.owner || 'You'} (${item.tracks?.length || item.tracksTotal || 0} tracks)`;
            } else if (type === 'album') {
                artistText = item.artistNames || (item.artists ? item.artists.map(a => a.name).join(', ') : 'Album');
                if (item.releaseYear) artistText += ` (${item.releaseYear})`;
            } else {
                artistText = item.artistNames || (item.artists ? item.artists.map(a => a.name).join(', ') : 'Unknown Artist');
                if (item.album?.name) artistText += ` • ${item.album.name}`;
            }

            if (titleEl) {
                titleEl.textContent = titleText;
                titleEl.title = titleText;
            }
            if (artistEl) {
                artistEl.textContent = artistText;
                artistEl.title = artistText;
            }

            if (spotifyBtn) {
                if (typeof getSpotifyLinkAttrs === 'function') {
                    const { href, targetAttrs } = getSpotifyLinkAttrs(item, type);
                    spotifyBtn.href = href;
                    if (targetAttrs && targetAttrs.includes('_blank')) {
                        spotifyBtn.target = '_blank';
                        spotifyBtn.rel = 'noopener noreferrer';
                    } else {
                        spotifyBtn.removeAttribute('target');
                        spotifyBtn.removeAttribute('rel');
                    }
                } else {
                    spotifyBtn.href = item.spotifyUrl || `https://open.spotify.com/${type}/${item.id}`;
                    spotifyBtn.target = '_blank';
                }
            }
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

            // Navigate to Currently Playing view with context query params
            let targetNavUrl = 'now-playing.html';
            if (type === 'album' && item.id) {
                targetNavUrl = `now-playing.html?albumId=${encodeURIComponent(item.id)}`;
            } else if (type === 'playlist' && item.id) {
                targetNavUrl = `now-playing.html?playlistId=${encodeURIComponent(item.id)}`;
            }

            const currentPath = (typeof getCleanPageName === 'function') ? getCleanPageName(window.location.pathname) : (window.location.pathname.split('/').pop() || 'index.html');
            if (currentPath !== 'now-playing.html' && typeof spaNavigate === 'function') {
                spaNavigate(targetNavUrl, true);
            }

            // Always send Spotify the specific track URI so queue remains in sync
            const uri = activeTrack.uri || `spotify:track:${activeTrack.id}`;

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
                            src="https://open.spotify.com/embed/track/${activeTrack.id}?utm_source=generator&theme=0&autoplay=1" 
                            width="100%" 
                            height="352" 
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
            this.displayTrackInfo(track, this.currentType || 'track');

            // Navigate to Currently Playing view instead of popping up mini player
            const currentPath = (typeof getCleanPageName === 'function') ? getCleanPageName(window.location.pathname) : (window.location.pathname.split('/').pop() || 'index.html');
            if (currentPath !== 'now-playing.html' && typeof spaNavigate === 'function') {
                spaNavigate('now-playing.html', true);
            }

            const uri = track.uri || `spotify:track:${track.id}`;

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
                            src="https://open.spotify.com/embed/track/${track.id}?utm_source=generator&theme=0&autoplay=1" 
                            width="100%" 
                            height="352" 
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

            // Green background on Currently Playing nav pill when music is playing
            const npLinks = document.querySelectorAll('a[href*="now-playing.html"]');
            npLinks.forEach(link => {
                link.classList.toggle('is-playing-now', !!this.isPlaying);
            });
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
            } else if (targetCleanPath === 'artist.html') {
                await loadScriptIfNeeded('artist.js');
                if (typeof initArtistDetail === 'function') initArtistDetail();
            } else if (targetCleanPath === 'now-playing.html') {
                await loadScriptIfNeeded('now-playing.js');
                if (typeof initNowPlaying === 'function') initNowPlaying();
            }

            // Manage backdrop aura visibility
            const backdropEl = document.getElementById('np-backdrop-aura');
            if (backdropEl) {
                backdropEl.style.display = (targetCleanPath === 'now-playing.html') ? 'block' : 'none';
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
        let albumObj = null;
        if (typeof filteredAlbums !== 'undefined') {
            albumObj = filteredAlbums.find(a => a.id === id);
        }
        if (!albumObj && typeof allAlbums !== 'undefined') {
            albumObj = allAlbums.find(a => a.id === id);
        }
        if (!albumObj) {
            albumObj = { id };
        }
        player.playItem(albumObj, 'album', typeof filteredAlbums !== 'undefined' ? filteredAlbums : null);
    };

    window.togglePlayPlaylist = function(id) {
        const player = window.miniPlayer || getPlayer();
        let playlistObj = null;
        if (typeof filteredPlaylists !== 'undefined') {
            playlistObj = filteredPlaylists.find(p => p.id === id);
        }
        if (!playlistObj && typeof allPlaylists !== 'undefined') {
            playlistObj = allPlaylists.find(p => p.id === id);
        }
        if (!playlistObj) {
            playlistObj = { id };
        }
        player.playItem(playlistObj, 'playlist', typeof filteredPlaylists !== 'undefined' ? filteredPlaylists : null);
    };
})();
