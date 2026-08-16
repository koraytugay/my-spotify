// Currently Playing View - High-Res Artwork Showcase, Liked Status & Up Next Queue

var currentQueueTracks = [];
var currentActiveTrack = null;
var likedSongsIdSet = new Set();
var likedSongsKeySet = new Set();

function getNormalizedKey(name, artist) {
    const cleanName = (name || '').toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
    const cleanArtist = (artist || '').toLowerCase().trim();
    return `${cleanName}:::${cleanArtist}`;
}

async function loadLikedSongsSet() {
    try {
        const likedSongs = await getLikedSongs();
        if (Array.isArray(likedSongs)) {
            likedSongs.forEach(s => {
                if (s.id) likedSongsIdSet.add(s.id);
                likedSongsKeySet.add(getNormalizedKey(s.name, s.artistNames || (s.artists ? s.artists.map(a => a.name).join(', ') : '')));
            });
        }

        // Also load any locally marked likes
        try {
            const localLikes = JSON.parse(localStorage.getItem('my_local_liked_songs') || '[]');
            if (Array.isArray(localLikes)) {
                localLikes.forEach(s => {
                    if (s.id) likedSongsIdSet.add(s.id);
                    likedSongsKeySet.add(getNormalizedKey(s.name, s.artistNames));
                });
            }
        } catch (e) {}
    } catch (e) {
        console.error('Error loading liked songs set:', e);
    }
}

function isTrackInLikedSongs(track) {
    if (!track) return false;
    if (track.id && likedSongsIdSet.has(track.id)) return true;
    const artist = track.artistNames || (track.artists ? track.artists.map(a => a.name).join(', ') : '');
    const key = getNormalizedKey(track.name, artist);
    return likedSongsKeySet.has(key);
}

async function initNowPlaying() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('now-playing-content');

    loadThemePreference();

    try {
        await loadLikedSongsSet();

        const urlParams = new URLSearchParams(window.location.search);
        const albumIdParam = urlParams.get('albumId') || urlParams.get('album');
        const playlistIdParam = urlParams.get('playlistId') || urlParams.get('playlist');
        const trackIdParam = urlParams.get('trackId') || urlParams.get('track');

        let handledByParam = false;

        if (albumIdParam) {
            try {
                const albums = await getSavedAlbums();
                const foundAlbum = (albums || []).find(a => a.id === albumIdParam);
                if (foundAlbum && Array.isArray(foundAlbum.tracks) && foundAlbum.tracks.length > 0) {
                    currentQueueTracks = foundAlbum.tracks;
                    const trackIdx = trackIdParam ? foundAlbum.tracks.findIndex(t => t.id === trackIdParam) : 0;
                    currentActiveTrack = trackIdx !== -1 ? foundAlbum.tracks[trackIdx] : foundAlbum.tracks[0];
                    if (window.miniPlayer) {
                        window.miniPlayer.playlist = foundAlbum.tracks;
                        window.miniPlayer.currentTrack = currentActiveTrack;
                        window.miniPlayer.currentType = 'album';
                        window.miniPlayer.contextTitle = foundAlbum.name || 'Album';
                        window.miniPlayer.playTrack(currentActiveTrack, foundAlbum.tracks);
                    }
                    handledByParam = true;
                }
            } catch (e) {
                console.error('Error loading album by query param:', e);
            }
        } else if (playlistIdParam) {
            try {
                const fullPlaylist = await getPlaylistById(playlistIdParam);
                if (fullPlaylist && Array.isArray(fullPlaylist.tracks) && fullPlaylist.tracks.length > 0) {
                    currentQueueTracks = fullPlaylist.tracks;
                    const trackIdx = trackIdParam ? fullPlaylist.tracks.findIndex(t => t.id === trackIdParam) : 0;
                    currentActiveTrack = trackIdx !== -1 ? fullPlaylist.tracks[trackIdx] : fullPlaylist.tracks[0];
                    if (window.miniPlayer) {
                        window.miniPlayer.playlist = fullPlaylist.tracks;
                        window.miniPlayer.currentTrack = currentActiveTrack;
                        window.miniPlayer.currentType = 'playlist';
                        window.miniPlayer.contextTitle = fullPlaylist.name || 'Playlist';
                        window.miniPlayer.playTrack(currentActiveTrack, fullPlaylist.tracks);
                    }
                    handledByParam = true;
                }
            } catch (e) {
                console.error('Error loading playlist by query param:', e);
            }
        }

        if (!handledByParam) {
            // Ensure we have an active queue from player or fallback to Liked Songs
            if (window.miniPlayer && window.miniPlayer.playlist && window.miniPlayer.playlist.length > 0) {
                currentQueueTracks = window.miniPlayer.playlist;
                currentActiveTrack = window.miniPlayer.currentTrack || currentQueueTracks[0];
            } else {
                const likedSongs = await getLikedSongs();
                currentQueueTracks = Array.isArray(likedSongs)
                    ? (typeof deduplicateSongs === 'function' ? deduplicateSongs(likedSongs) : likedSongs)
                    : [];
                
                if (trackIdParam) {
                    const foundTrack = currentQueueTracks.find(t => t.id === trackIdParam);
                    if (foundTrack) currentActiveTrack = foundTrack;
                }

                if (!currentActiveTrack && currentQueueTracks.length > 0) {
                    currentActiveTrack = currentQueueTracks[0];
                }
            }
        }

        renderNowPlayingHero(currentActiveTrack, window.miniPlayer?.isPlaying || false);
        renderQueueList(currentActiveTrack, currentQueueTracks);

        // Bind Hero Controls
        bindHeroControls();

        // Real-time state subscription
        if (window.miniPlayer) {
            window.miniPlayer.onStateChange(({ isPlaying, currentTrack, currentTrackId }) => {
                const track = currentTrack || currentQueueTracks.find(t => t.id === currentTrackId) || currentActiveTrack;
                currentActiveTrack = track;
                if (window.miniPlayer.playlist && window.miniPlayer.playlist.length > 0) {
                    currentQueueTracks = window.miniPlayer.playlist;
                }
                renderNowPlayingHero(track, isPlaying);
                renderQueueList(track, currentQueueTracks);
            });
        }

        // Periodic state verification (every 1 second) to keep UI 100% in sync
        setInterval(() => {
            if (window.miniPlayer && window.miniPlayer.currentTrack) {
                const track = window.miniPlayer.currentTrack;
                const isPlaying = window.miniPlayer.isPlaying;
                if (track && (track.id !== currentActiveTrack?.id || track.name !== currentActiveTrack?.name)) {
                    currentActiveTrack = track;
                    if (window.miniPlayer.playlist && window.miniPlayer.playlist.length > 0) {
                        currentQueueTracks = window.miniPlayer.playlist;
                    }
                    renderNowPlayingHero(track, isPlaying);
                    renderQueueList(track, currentQueueTracks);
                }
            }
        }, 1000);

        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
    } catch (e) {
        console.error('Error loading Now Playing view:', e);
        if (loadingEl) {
            loadingEl.innerHTML = `<p style="color: #ff5555;">Could not load Now Playing (${e.message}).</p>`;
        }
    }
}

function renderNowPlayingHero(track, isPlaying) {
    if (!track) return;

    const coverEl = document.getElementById('np-hero-cover');
    const titleEl = document.getElementById('np-hero-title');
    const artistEl = document.getElementById('np-hero-artist');
    const albumEl = document.getElementById('np-hero-album');
    const eqEl = document.getElementById('np-hero-eq');
    const playIconEl = document.getElementById('np-hero-play-icon');
    const spotifyLinkEl = document.getElementById('np-hero-spotify-link');

    const coverUrl = track.coverUrl || track.thumbnailUrl || (track.images && track.images[0]?.url) || 'https://via.placeholder.com/400x400?text=Spotify';
    if (coverEl) {
        coverEl.src = coverUrl;
        coverEl.alt = track.name || 'Cover';
    }

    let backdropEl = document.getElementById('np-backdrop-aura');
    if (!backdropEl) {
        backdropEl = document.createElement('div');
        backdropEl.id = 'np-backdrop-aura';
        backdropEl.className = 'np-backdrop-aura';
        document.body.prepend(backdropEl);
    }
    if (backdropEl && coverUrl) {
        backdropEl.style.backgroundImage = `url("${coverUrl}")`;
        backdropEl.style.display = 'block';
    }

    if (titleEl) {
        titleEl.textContent = track.name || 'Untitled';
        titleEl.title = track.name || '';
    }

    if (artistEl) {
        let artistHtml = '';
        if (Array.isArray(track.artists) && track.artists.length > 0) {
            artistHtml = track.artists.map(a => {
                return `<a href="artist.html?name=${encodeURIComponent(a.name)}" class="hero-artist-link">${a.name}</a>`;
            }).join(', ');
        } else if (track.artistNames) {
            artistHtml = `<a href="artist.html?name=${encodeURIComponent(track.artistNames)}" class="hero-artist-link">${track.artistNames}</a>`;
        } else {
            artistHtml = 'Unknown Artist';
        }
        artistEl.innerHTML = artistHtml;
    }

    if (albumEl) {
        const albumName = track.album?.name || '';
        const releaseYear = track.album?.releaseYear ? ` (${track.album.releaseYear})` : (track.releaseYear ? ` (${track.releaseYear})` : '');
        const durationText = track.durationFormatted ? ` • ⏱ ${track.durationFormatted}` : '';
        albumEl.textContent = `${albumName}${releaseYear}${durationText}`;
    }

    if (eqEl) {
        eqEl.classList.toggle('playing', !!isPlaying);
    }

    if (playIconEl) {
        playIconEl.textContent = isPlaying ? '⏸' : '▶';
    }

    if (spotifyLinkEl) {
        const type = window.miniPlayer?.currentType || 'track';
        if (typeof getSpotifyLinkAttrs === 'function') {
            const { href, targetAttrs } = getSpotifyLinkAttrs(track, type);
            spotifyLinkEl.href = href;
            if (targetAttrs && targetAttrs.includes('_blank')) {
                spotifyLinkEl.target = '_blank';
                spotifyLinkEl.rel = 'noopener noreferrer';
            } else {
                spotifyLinkEl.removeAttribute('target');
                spotifyLinkEl.removeAttribute('rel');
            }
        } else {
            spotifyLinkEl.href = track.spotifyUrl || `https://open.spotify.com/${type}/${track.id}`;
            spotifyLinkEl.target = '_blank';
        }
    }
}

var renderedQueueKey = '';
var lastRenderedTrackId = null;

function updateQueueItemClasses(activeIdx, queueList) {
    const listEl = document.getElementById('queue-track-list');
    if (!listEl) return;
    const items = listEl.querySelectorAll('.queue-track-item');
    items.forEach((el, idx) => {
        const isCurrent = idx === activeIdx;
        const isPlayed = idx < activeIdx;
        el.className = `queue-track-item ${isCurrent ? 'is-current' : (isPlayed ? 'is-played' : 'is-upcoming')}`;
        const numEl = el.querySelector('.queue-track-num');
        if (numEl) {
            numEl.innerHTML = isCurrent ? '<span class="queue-current-indicator">▶</span>' : (idx + 1);
        }
    });

    const badgeEl = document.getElementById('queue-count-badge');
    if (badgeEl) {
        badgeEl.textContent = `${activeIdx + 1} of ${queueList.length} tracks`;
    }
}

function renderQueueList(activeTrack, queueList) {
    const listEl = document.getElementById('queue-track-list');
    const badgeEl = document.getElementById('queue-count-badge');
    if (!listEl) return;

    if (!Array.isArray(queueList) || queueList.length === 0) {
        listEl.innerHTML = `<div class="empty-queue-msg">Queue is empty. Select any track to start.</div>`;
        if (badgeEl) badgeEl.textContent = '0 tracks';
        renderedQueueKey = '';
        return;
    }

    const currentIndex = queueList.findIndex(t => t.id === activeTrack?.id);
    const activeIdx = currentIndex !== -1 ? currentIndex : 0;
    const queueKey = queueList.map(t => t.id).join(',');

    // If the queue list is already rendered in the DOM, update classes in place to preserve scroll position!
    if (renderedQueueKey === queueKey && listEl.children.length === queueList.length) {
        if (lastRenderedTrackId !== activeTrack?.id) {
            updateQueueItemClasses(activeIdx, queueList);
            lastRenderedTrackId = activeTrack?.id;
        }
        return;
    }

    renderedQueueKey = queueKey;
    lastRenderedTrackId = activeTrack?.id;

    if (badgeEl) {
        badgeEl.textContent = `${activeIdx + 1} of ${queueList.length} tracks`;
    }

    listEl.innerHTML = '';

    queueList.forEach((track, idx) => {
        const isCurrent = idx === activeIdx;
        const isPlayed = idx < activeIdx;

        const itemEl = document.createElement('div');
        itemEl.className = `queue-track-item ${isCurrent ? 'is-current' : (isPlayed ? 'is-played' : 'is-upcoming')}`;
        itemEl.onclick = () => {
            if (window.miniPlayer) {
                window.miniPlayer.playTrack(track, queueList);
            }
        };

        const cover = track.coverUrl || track.thumbnailUrl || 'https://via.placeholder.com/48x48?text=Song';
        const artistText = track.artistNames || (track.artists ? track.artists.map(a => a.name).join(', ') : 'Unknown Artist');
        const durationText = track.durationFormatted || '';
        const isLiked = isTrackInLikedSongs(track);
        const likedHtml = isLiked ? `<span class="queue-liked-icon" title="In your Liked Songs collection">💚</span>` : '';
        const trackNumDisplay = isCurrent ? `<span class="queue-current-indicator">▶</span>` : (idx + 1);

        itemEl.innerHTML = `
            <div class="queue-track-num">${trackNumDisplay}</div>
            <div class="queue-cover-wrap">
                <img src="${cover}" alt="${track.name}" class="queue-cover-img" loading="lazy">
                <div class="queue-play-hover">▶</div>
            </div>
            <div class="queue-track-meta">
                <div class="queue-track-title">${track.name || 'Untitled'}</div>
                <div class="queue-track-artist">${artistText}</div>
            </div>
            <div class="queue-track-liked">${likedHtml}</div>
            <div class="queue-track-duration">${durationText}</div>
        `;

        listEl.appendChild(itemEl);
    });
}

function bindHeroControls() {
    const playBtn = document.getElementById('np-hero-play');
    const prevBtn = document.getElementById('np-hero-prev');
    const nextBtn = document.getElementById('np-hero-next');

    if (playBtn) {
        playBtn.onclick = () => {
            if (window.miniPlayer) {
                window.miniPlayer.togglePlayPause();
            }
        };
    }

    if (prevBtn) {
        prevBtn.onclick = () => {
            if (window.miniPlayer) {
                window.miniPlayer.playPrevious();
            }
        };
    }

    if (nextBtn) {
        nextBtn.onclick = () => {
            if (window.miniPlayer) {
                window.miniPlayer.playNext();
            }
        };
    }
}

function toggleDarkMode(isDark) {
    if (isDark) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function loadThemePreference() {
    const saved = localStorage.getItem('theme') || 'light';
    const isDark = saved === 'dark';
    const toggle = document.getElementById('dark-mode-toggle');
    if (toggle) toggle.checked = isDark;
    if (isDark) document.body.classList.add('dark-mode');
}

/* ----------------------------------------------------
   SPOTIFY PKCE OAUTH & QUEUE SYNC
   ---------------------------------------------------- */
function getRedirectUri() {
    return window.location.origin + window.location.pathname;
}

function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let res = '';
    const values = new Uint8Array(length);
    window.crypto.getRandomValues(values);
    for (let i = 0; i < length; i++) {
        res += chars[values[i] % chars.length];
    }
    return res;
}

async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function openSpotifyAuthModal() {
    const redirectDisplay = document.getElementById('spotify-redirect-uri-display');
    const clientIdInput = document.getElementById('spotify-client-id-input');
    const savedClientId = localStorage.getItem('spotify_client_id') || '';

    if (redirectDisplay) redirectDisplay.textContent = getRedirectUri();
    if (clientIdInput) clientIdInput.value = savedClientId;

    const authModal = document.getElementById('spotify-auth-modal');
    if (authModal) authModal.style.display = 'flex';
}

function closeSpotifyAuthModal() {
    const modal = document.getElementById('spotify-auth-modal');
    if (modal) modal.style.display = 'none';
}

function closeSyncSuccessModal() {
    const modal = document.getElementById('sync-success-modal');
    if (modal) modal.style.display = 'none';
}

function disconnectSpotify() {
    localStorage.removeItem('spotify_user_access_token');
    localStorage.removeItem('spotify_user_refresh_token');
    localStorage.removeItem('spotify_token_expires_at');
    localStorage.removeItem('smart_mix_playlist_id');
    localStorage.removeItem('spotify_client_id');
    closeSpotifyAuthModal();
    alert('Disconnected from Spotify. You can reconnect anytime.');
}

async function startSpotifyOAuth() {
    const input = document.getElementById('spotify-client-id-input');
    const clientId = (input?.value || localStorage.getItem('spotify_client_id') || '').trim();

    if (!clientId) {
        openSpotifyAuthModal();
        return;
    }

    closeSpotifyAuthModal();
    localStorage.setItem('spotify_client_id', clientId);

    const queue = (window.miniPlayer && window.miniPlayer.playlist && window.miniPlayer.playlist.length > 0)
        ? window.miniPlayer.playlist
        : (currentQueueTracks || []);
    const title = (window.miniPlayer && window.miniPlayer.contextTitle) ? window.miniPlayer.contextTitle : 'Player Queue';

    localStorage.setItem('pending_mix_sync', JSON.stringify({
        tracks: queue,
        title: title
    }));

    const verifier = generateRandomString(64);
    const challenge = await generateCodeChallenge(verifier);
    localStorage.setItem('spotify_pkce_verifier', verifier);

    const redirectUri = getRedirectUri();
    const scopesList = [
        'playlist-modify-public',
        'playlist-modify-private',
        'playlist-read-private',
        'playlist-read-collaborative',
        'user-read-private',
        'user-read-email',
        'user-library-read',
        'user-library-modify',
        'user-top-read',
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-currently-playing',
        'user-read-recently-played',
        'user-follow-read',
        'user-follow-modify',
        'ugc-image-upload'
    ];
    const scope = scopesList.join(' ');
    const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge_method=S256&code_challenge=${encodeURIComponent(challenge)}&show_dialog=true`;

    window.location.href = authUrl;
}

async function handleSpotifyAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (!code && !error) return;

    window.history.replaceState({}, document.title, getRedirectUri());

    if (error) {
        console.warn('Spotify OAuth denied or error:', error);
        alert(`Spotify Login was cancelled or returned an error: ${error}`);
        return;
    }

    const verifier = localStorage.getItem('spotify_pkce_verifier');
    const clientId = localStorage.getItem('spotify_client_id');
    const redirectUri = getRedirectUri();

    if (!verifier || !clientId) return;

    try {
        const body = new URLSearchParams({
            client_id: clientId,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri,
            code_verifier: verifier
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
            localStorage.removeItem('spotify_pkce_verifier');

            const pending = localStorage.getItem('pending_mix_sync');
            if (pending) {
                localStorage.removeItem('pending_mix_sync');
                setTimeout(() => syncNowPlayingQueueToSpotify(), 300);
            }
        }
    } catch (e) {
        console.error('Spotify token exchange error:', e);
    }
}

async function getValidSpotifyToken() {
    const token = localStorage.getItem('spotify_user_access_token');
    const expiresAt = parseInt(localStorage.getItem('spotify_token_expires_at') || '0', 10);
    const refreshToken = localStorage.getItem('spotify_user_refresh_token');
    const clientId = localStorage.getItem('spotify_client_id');

    if (!token) return null;

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
        } catch (e) {}
    }

    return token;
}

async function getOrCreateSmartMixPlaylistId(token, userId, desc) {
    let playlistId = localStorage.getItem('smart_mix_playlist_id');
    if (playlistId) {
        return playlistId; // Trust the saved ID, don't run brittle pre-checks
    }

    // Search existing playlists across multiple pages (up to 200 playlists)
    try {
        let offset = 0;
        while (offset < 200) {
            const res = await fetch(`https://api.spotify.com/v1/me/playlists?limit=50&offset=${offset}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) break;
            const data = await res.json();
            const items = data.items || [];
            if (items.length === 0) break;

            const found = items.find(p => p && p.name && p.name.trim().toLowerCase() === 'my smart mix');
            if (found) {
                localStorage.setItem('smart_mix_playlist_id', found.id);
                return found.id;
            }

            if (items.length < 50) break;
            offset += 50;
        }
    } catch (e) {
        console.warn('Error searching user playlists:', e);
    }

    // Only create a new playlist if none was found anywhere in library
    const createRes = await fetch(`https://api.spotify.com/v1/me/playlists`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: 'My Smart Mix',
            description: desc || 'Curated Smart Mix',
            public: true
        })
    });

    if (createRes.ok) {
        const createdData = await createRes.json();
        localStorage.setItem('smart_mix_playlist_id', createdData.id);
        return createdData.id;
    }

    const errText = await createRes.text();
    throw new Error(`Failed to create playlist (${createRes.status}): ${errText}`);
}

async function syncNowPlayingQueueToSpotify() {
    const queue = (window.miniPlayer && window.miniPlayer.playlist && window.miniPlayer.playlist.length > 0)
        ? window.miniPlayer.playlist
        : (currentQueueTracks || []);

    if (!queue || queue.length === 0) {
        alert('No tracks currently in the player queue!');
        return;
    }

    const contextTitle = (window.miniPlayer && window.miniPlayer.contextTitle)
        ? window.miniPlayer.contextTitle
        : (document.getElementById('np-hero-title')?.textContent || 'Current Queue');

    const token = await getValidSpotifyToken();

    if (!token) {
        openSpotifyAuthModal();
        return;
    }

    const btn = document.getElementById('np-sync-spotify-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `⏳ Syncing...`;
    }

    try {
        const userRes = await fetch('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (userRes.status === 401) {
            localStorage.removeItem('spotify_user_access_token');
            localStorage.removeItem('spotify_user_refresh_token');
            openSpotifyAuthModal();
            return;
        }

        let userId = null;
        if (userRes.ok) {
            const userData = await userRes.json();
            userId = userData.id;
        }

        const dateStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const cleanTitle = (contextTitle || 'Queue Mix').replace(/[^\w\s\(\)\+\-\&\.\,\:\/]/g, '').trim();
        const desc = `Smart Mix: ${cleanTitle} | Updated ${dateStr} | ${queue.length} tracks`;

        const uris = queue
            .map(t => {
                if (!t) return null;
                if (typeof t.uri === 'string' && t.uri.startsWith('spotify:track:')) return t.uri;
                if (typeof t.id === 'string' && /^[a-zA-Z0-9]{15,30}$/.test(t.id)) return `spotify:track:${t.id}`;
                return null;
            })
            .filter(Boolean)
            .slice(0, 100);

        if (uris.length === 0) {
            throw new Error('No valid Spotify track IDs found in current queue.');
        }

        // Lock onto single dedicated "My Smart Mix" playlist
        let playlistId = await getOrCreateSmartMixPlaylistId(token, userId, desc);

        // Update playlist metadata to public and updated description
        await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'My Smart Mix',
                description: desc,
                public: true
            })
        }).catch(() => {});

        // Overwrite tracks in the single playlist
        let replaceRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uris })
        });

        // If the playlist was deleted by user on Spotify (404), create a fresh one and retry once
        if (replaceRes.status === 404) {
            localStorage.removeItem('smart_mix_playlist_id');
            playlistId = await getOrCreateSmartMixPlaylistId(token, userId, desc);
            replaceRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris })
            });
        }

        if (!replaceRes.ok) {
            replaceRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris })
            });
        }

        if (!replaceRes.ok) {
            const errText = await replaceRes.text();
            throw new Error(`Failed to populate playlist (${replaceRes.status}): ${errText}`);
        }

        const successModal = document.getElementById('sync-success-modal');
        const descEl = document.getElementById('sync-success-desc');
        const appBtn = document.getElementById('open-spotify-app-btn');

        if (descEl) {
            descEl.textContent = `Updated "My Smart Mix" with ${uris.length} tracks from ${contextTitle}.`;
        }

        if (appBtn) {
            const isMobile = window.isMobileDevice ? window.isMobileDevice() : false;
            appBtn.href = isMobile ? `spotify:playlist:${playlistId}` : `https://open.spotify.com/playlist/${playlistId}`;
        }

        if (successModal) successModal.style.display = 'flex';
    } catch (e) {
        console.error('Error syncing queue to Spotify:', e);
        alert(`Could not sync to Spotify: ${e.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `Sync to Spotify`;
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        handleSpotifyAuthCallback();
        initNowPlaying();
    });
} else {
    handleSpotifyAuthCallback();
    initNowPlaying();
}
