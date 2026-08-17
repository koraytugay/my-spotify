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

var allArtists = [];
var filteredArtists = [];
var currentSort = 'name-asc';

async function initArtists() {
    const loadingEl = document.getElementById('loading');
    const controlsEl = document.getElementById('controls');

    try {
        let artists = await getFollowedArtists();

        if (!artists || artists.length === 0) {
            artists = await getTopArtists();
        }

        if (!artists || artists.length === 0) {
            const songs = await getLikedSongs();
            const artistMap = new Map();
            songs.forEach(s => {
                (s.artists || []).forEach(a => {
                    if (a.name && !artistMap.has(a.name)) {
                        artistMap.set(a.name, {
                            id: a.id,
                            name: a.name,
                            genres: [],
                            followers: 0,
                            popularity: 0,
                            imageUrl: s.coverUrl || s.thumbnailUrl || '',
                            spotifyUrl: a.id ? `https://open.spotify.com/artist/${a.id}` : `https://open.spotify.com/search/${encodeURIComponent(a.name)}`
                        });
                    }
                });
            });
            artists = Array.from(artistMap.values());
        }

        allArtists = artists || [];
        filteredArtists = [...allArtists];

        loadThemePreference();

        const sortSelect = document.getElementById('sort-select');
        currentSort = (sortSelect && sortSelect.value) || 'name-asc';
        sortArtists(currentSort);

        loadingEl.style.display = 'none';
        controlsEl.style.display = 'flex';
    } catch (e) {
        console.error('Error loading artists:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Could not load artists: ${e.message}</p>`;
    }
}

function sortArtists(criteria) {
    const validSorts = ['name-asc', 'popularity-desc', 'followers-desc'];
    if (!criteria || !validSorts.includes(criteria)) {
        const selectEl = document.getElementById('sort-select');
        criteria = (selectEl && selectEl.value && validSorts.includes(selectEl.value)) ? selectEl.value : 'name-asc';
    }

    currentSort = criteria;
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect && sortSelect.value !== criteria) {
        sortSelect.value = criteria;
    }
    allArtists.sort((a, b) => {
        switch (criteria) {
            case 'name-asc':
                return (a.name || '').localeCompare(b.name || '');
            case 'popularity-desc':
                return (b.popularity || 0) - (a.popularity || 0);
            case 'followers-desc':
                return (b.followers || 0) - (a.followers || 0);
            default:
                return 0;
        }
    });
    filterArtists();
}

function filterArtists() {
    const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    filteredArtists = allArtists.filter(a => {
        if (!search) return true;
        const matchName = (a.name || '').toLowerCase().includes(search);
        const matchGenre = (a.genres || []).some(g => g.toLowerCase().includes(search));
        return matchName || matchGenre;
    });
    renderArtists();
}

function renderArtists() {
    const grid = document.getElementById('artists-grid');
    const noResults = document.getElementById('no-results');
    if (!grid || !noResults) return;

    if (filteredArtists.length === 0) {
        grid.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';
    grid.innerHTML = '';

    filteredArtists.forEach(art => {
        const card = document.createElement('div');
        card.className = 'song-card';
        const cover = art.imageUrl || 'https://via.placeholder.com/300x300?text=Artist';
        const artistPageUrl = `artist.html?id=${encodeURIComponent(art.id || '')}&name=${encodeURIComponent(art.name || '')}`;
        const { href: spotifyUrl, targetAttrs: spotifyTarget } = getSpotifyLinkAttrs(art, 'artist');
        const genresText = (art.genres && art.genres.length > 0)
            ? art.genres.slice(0, 2).join(', ')
            : '';

        card.innerHTML = `
            <div class="cover-wrapper">
                <a href="${artistPageUrl}">
                    <img src="${cover}" alt="${art.name}" class="cover-img" loading="lazy">
                </a>
            </div>
            <div class="song-details">
                <div class="song-title">
                    <a href="${artistPageUrl}" class="song-title-link">${art.name}</a>
                </div>
                ${genresText ? `<div class="song-artist">${genresText}</div>` : ''}
            </div>
            <div class="song-meta" style="justify-content: flex-end;">
                <a href="${spotifyUrl}" ${spotifyTarget} class="spotify-icon-btn" title="Open in Spotify" aria-label="Open in Spotify">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                </a>
            </div>
        `;

        grid.appendChild(card);
    });
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initArtists);
} else {
    initArtists();
}
