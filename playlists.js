if (typeof isMobileDevice === 'undefined') {
    window.isMobileDevice = function() {
        if (typeof window === 'undefined') return false;
        const ua = navigator.userAgent || navigator.vendor || window.opera || '';
        return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    };
}

if (typeof getSpotifyUrl === 'undefined') {
    window.getSpotifyUrl = function(itemOrUrl, type = 'track') {
        if (!itemOrUrl) return 'https://open.spotify.com';
        if (typeof itemOrUrl === 'string') {
            if (itemOrUrl.startsWith('http://') || itemOrUrl.startsWith('https://')) return itemOrUrl;
            const match = itemOrUrl.match(/spotify:(track|album|artist|playlist):([a-zA-Z0-9]+)/);
            if (match) return `https://open.spotify.com/${match[1]}/${match[2]}`;
            return itemOrUrl;
        }
        if (type === 'track' && itemOrUrl.album?.id && itemOrUrl.id) {
            return `https://open.spotify.com/album/${itemOrUrl.album.id}?highlight=spotify:track:${itemOrUrl.id}`;
        }
        if (itemOrUrl.spotifyUrl) return itemOrUrl.spotifyUrl;
        if (itemOrUrl.id) return `https://open.spotify.com/${type}/${itemOrUrl.id}`;
        if (itemOrUrl.uri) {
            const match = itemOrUrl.uri.match(/spotify:(track|album|artist|playlist):([a-zA-Z0-9]+)/);
            if (match) return `https://open.spotify.com/${match[1]}/${match[2]}`;
        }
        return 'https://open.spotify.com';
    };
}

if (typeof getSpotifyLinkAttrs === 'undefined') {
    window.getSpotifyLinkAttrs = function(itemOrUrl, type = 'track') {
        const isMobile = window.isMobileDevice ? window.isMobileDevice() : false;
        const href = isMobile 
            ? (window.getSpotifyUri ? window.getSpotifyUri(itemOrUrl, type) : '#')
            : (window.getSpotifyUrl ? window.getSpotifyUrl(itemOrUrl, type) : 'https://open.spotify.com');
        const targetAttrs = isMobile ? '' : 'target="_blank" rel="noopener noreferrer"';
        return { href, targetAttrs, isMobile };
    };
}

var allPlaylists = [];
var filteredPlaylists = [];
var currentSort = 'name-asc';
var currentPlayingPlaylistId = null;

async function initPlaylists() {
    const loadingEl = document.getElementById('loading');
    const controlsEl = document.getElementById('controls');

    try {
        const playlists = await getPlaylists();
        allPlaylists = playlists || [];
        filteredPlaylists = [...allPlaylists];

        loadThemePreference();

        const sortSelect = document.getElementById('sort-select');
        currentSort = (sortSelect && sortSelect.value) || 'name-asc';
        sortPlaylists(currentSort);

        loadingEl.style.display = 'none';
        controlsEl.style.display = 'flex';

        if (window.miniPlayer) {
            window.miniPlayer.onStateChange(({ isPlaying, currentTrackId }) => {
                currentPlayingPlaylistId = isPlaying ? currentTrackId : null;
                renderPlaylists();
            });
        }
    } catch (e) {
        console.error('Error loading playlists:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Could not load playlists. Run <code>npm run sync</code> first.</p>`;
    }
}

function sortPlaylists(criteria) {
    const validSorts = ['name-asc', 'tracks-desc'];
    if (!criteria || !validSorts.includes(criteria)) {
        const selectEl = document.getElementById('sort-select');
        criteria = (selectEl && selectEl.value && validSorts.includes(selectEl.value)) ? selectEl.value : 'name-asc';
    }

    currentSort = criteria;
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect && sortSelect.value !== criteria) {
        sortSelect.value = criteria;
    }
    allPlaylists.sort((a, b) => {
        if (criteria === 'tracks-desc') return (b.tracksTotal || 0) - (a.tracksTotal || 0);
        if (criteria === 'name-asc') return (a.name || '').localeCompare(b.name || '');
        return 0;
    });
    filterPlaylists();
}

function filterPlaylists() {
    const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    filteredPlaylists = allPlaylists.filter(p => {
        if (!search) return true;
        const matchName = (p.name || '').toLowerCase().includes(search);
        const matchOwner = (p.owner || '').toLowerCase().includes(search);
        const matchDesc = (p.description || '').toLowerCase().includes(search);
        return matchName || matchOwner || matchDesc;
    });
    renderPlaylists();
}

function renderPlaylists() {
    const grid = document.getElementById('playlists-grid');
    const noResults = document.getElementById('no-results');
    if (!grid || !noResults) return;

    if (filteredPlaylists.length === 0) {
        grid.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';
    grid.innerHTML = '';

    filteredPlaylists.forEach(p => {
        const card = document.createElement('div');
        const isPlaying = currentPlayingPlaylistId === p.id;
        card.className = `song-card ${isPlaying ? 'is-playing' : ''}`;
        const cover = p.coverUrl || 'https://via.placeholder.com/300x300?text=Playlist';
        const trackCount = p.tracks?.length || p.tracksTotal || 0;
        const playlistUrl = `playlist.html?id=${encodeURIComponent(p.id)}`;
        const { href: spotifyUrl, targetAttrs: spotifyTarget } = getSpotifyLinkAttrs(p, 'playlist');

        card.innerHTML = `
            <div class="cover-wrapper">
                <a href="${playlistUrl}">
                    <img src="${cover}" alt="${p.name}" class="cover-img" loading="lazy">
                </a>
            </div>
            <div class="song-details">
                <div class="song-title">
                    <a href="${playlistUrl}" class="song-title-link">${p.name}</a>
                </div>
                <div class="song-artist">by ${p.owner || 'Spotify'}</div>
            </div>
            <div class="song-meta" style="justify-content: space-between; align-items: center;">
                <button class="album-card-btn album-card-play-btn" onclick="togglePlayPlaylist('${p.id}')" title="${isPlaying ? 'Pause' : 'Play Playlist'}" aria-label="Play Playlist">
                    ${isPlaying ? '⏸' : '▶'}
                </button>
                <a href="${spotifyUrl}" ${spotifyTarget} class="album-card-btn album-card-spotify-btn" title="Open in Spotify" aria-label="Open in Spotify">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                </a>
            </div>
        `;

        grid.appendChild(card);
    });
}

function togglePlayPlaylist(id) {
    console.log('[Playlists Page] 🔘 togglePlayPlaylist clicked for ID:', id);
    const playlist = (filteredPlaylists || []).find(p => p.id === id) || (allPlaylists || []).find(p => p.id === id) || { id };
    if (window.miniPlayer) {
        window.miniPlayer.playItem(playlist, 'playlist');
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

document.addEventListener('DOMContentLoaded', initPlaylists);
