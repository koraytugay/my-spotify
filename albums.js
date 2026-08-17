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

var allAlbums = [];
var filteredAlbums = [];
var currentSort = 'artist-asc';
var currentPlayingAlbumId = null;

async function initAlbums() {
    const loadingEl = document.getElementById('loading');
    const controlsEl = document.getElementById('controls');

    try {
        const albums = await getSavedAlbums();
        allAlbums = albums || [];
        filteredAlbums = [...allAlbums];

        loadThemePreference();
        populateArtistFilter();

        const sortSelect = document.getElementById('sort-select');
        currentSort = (sortSelect && sortSelect.value) || 'artist-asc';
        sortAlbums(currentSort);

        loadingEl.style.display = 'none';
        controlsEl.style.display = 'flex';

        if (window.miniPlayer) {
            window.miniPlayer.onStateChange(({ isPlaying, currentTrackId }) => {
                currentPlayingAlbumId = isPlaying ? currentTrackId : null;
                renderAlbums();
            });
        }
    } catch (e) {
        console.error('Error loading albums:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Could not load albums. Run <code>npm run sync</code> first.</p>`;
    }
}

function populateArtistFilter() {
    const artistFilterEl = document.getElementById('artist-filter');
    if (!artistFilterEl) return;

    const artistSet = new Set();
    allAlbums.forEach(a => {
        if (Array.isArray(a.artists) && a.artists.length > 0) {
            a.artists.forEach(art => {
                if (art && art.name && art.name.trim()) artistSet.add(art.name.trim());
            });
        } else if (a.artistNames && a.artistNames.trim()) {
            artistSet.add(a.artistNames.trim());
        }
    });

    const sortedArtists = Array.from(artistSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    const currentVal = artistFilterEl.value || 'all';
    artistFilterEl.innerHTML = '<option value="all">All Artists</option>';
    sortedArtists.forEach(artistName => {
        const option = document.createElement('option');
        option.value = artistName;
        option.textContent = artistName;
        artistFilterEl.appendChild(option);
    });

    if (artistSet.has(currentVal)) {
        artistFilterEl.value = currentVal;
    } else {
        artistFilterEl.value = 'all';
    }
}

function sortAlbums(criteria) {
    const validSorts = ['artist-asc', 'name-asc', 'year-desc', 'year-asc'];
    if (!criteria || !validSorts.includes(criteria)) {
        const selectEl = document.getElementById('sort-select');
        criteria = (selectEl && selectEl.value && validSorts.includes(selectEl.value)) ? selectEl.value : 'artist-asc';
    }

    currentSort = criteria;
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect && sortSelect.value !== criteria) {
        sortSelect.value = criteria;
    }
    allAlbums.sort((a, b) => {
        switch (criteria) {
            case 'artist-asc': {
                const artistA = (a.artists?.[0]?.name || a.artistNames || '').toLowerCase();
                const artistB = (b.artists?.[0]?.name || b.artistNames || '').toLowerCase();
                const cmpArtist = artistA.localeCompare(artistB);
                if (cmpArtist !== 0) return cmpArtist;

                // Within same artist: sort by release date / year
                const yearA = parseInt(a.releaseYear) || 0;
                const yearB = parseInt(b.releaseYear) || 0;
                if (yearA !== yearB) return yearA - yearB;
                const dateA = a.releaseDate || '';
                const dateB = b.releaseDate || '';
                const cmpDate = dateA.localeCompare(dateB);
                if (cmpDate !== 0) return cmpDate;

                // Within same release date: sort by album name
                return (a.name || '').localeCompare(b.name || '');
            }
            case 'name-asc':
                return (a.name || '').localeCompare(b.name || '');
            case 'year-desc':
                return (parseInt(b.releaseYear) || 0) - (parseInt(a.releaseYear) || 0);
            case 'year-asc':
                return (parseInt(a.releaseYear) || 0) - (parseInt(b.releaseYear) || 0);
            default:
                return 0;
        }
    });
    filterAlbums();
}

function filterAlbums() {
    const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    const selectedArtist = document.getElementById('artist-filter')?.value || 'all';

    filteredAlbums = allAlbums.filter(a => {
        // Filter by artist dropdown
        if (selectedArtist !== 'all') {
            const hasArtist = (Array.isArray(a.artists) && a.artists.some(art => art.name === selectedArtist))
                || a.artistNames === selectedArtist
                || (a.artistNames && a.artistNames.includes(selectedArtist));
            if (!hasArtist) return false;
        }

        // Filter by search input
        if (search) {
            const matchName = (a.name || '').toLowerCase().includes(search);
            const matchArtist = (a.artistNames || '').toLowerCase().includes(search) ||
                (Array.isArray(a.artists) && a.artists.some(art => (art.name || '').toLowerCase().includes(search)));
            if (!matchName && !matchArtist) return false;
        }

        return true;
    });
    renderAlbums();
}

function renderAlbums() {
    const grid = document.getElementById('albums-grid');
    const noResults = document.getElementById('no-results');
    if (!grid || !noResults) return;

    if (filteredAlbums.length === 0) {
        grid.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';
    grid.innerHTML = '';

    filteredAlbums.forEach(a => {
        const card = document.createElement('div');
        const isPlaying = currentPlayingAlbumId === a.id;
        card.className = `song-card ${isPlaying ? 'is-playing' : ''}`;
        const cover = a.coverUrl || 'https://via.placeholder.com/300x300?text=Album';

        let artistsHtml = '';
        if (Array.isArray(a.artists) && a.artists.length > 0) {
            artistsHtml = a.artists.map(art => {
                const { href: artUrl, targetAttrs: artTarget } = getSpotifyLinkAttrs(art, 'artist');
                return `<a href="${artUrl}" ${artTarget} class="artist-link">${art.name}</a>`;
            }).join(', ');
        } else if (a.artistNames) {
            const fallbackArt = { name: a.artistNames, spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(a.artistNames)}` };
            const { href: artUrl, targetAttrs: artTarget } = getSpotifyLinkAttrs(fallbackArt, 'artist');
            artistsHtml = `<a href="${artUrl}" ${artTarget} class="artist-link">${a.artistNames}</a>`;
        } else {
            artistsHtml = 'Unknown Artist';
        }
        const releaseYear = a.releaseYear ? ` (${a.releaseYear})` : '';

        const { href: albumUrl, targetAttrs: albumTarget } = getSpotifyLinkAttrs(a, 'album');

        card.innerHTML = `
            <div class="cover-wrapper">
                <img src="${cover}" alt="${a.name}" class="cover-img" loading="lazy">
            </div>
            <div class="song-details">
                <div class="song-title"><a href="album.html?id=${encodeURIComponent(a.id)}" class="song-title-link">${a.name}</a></div>
                <div class="song-artist">${artistsHtml}<span class="album-year">${releaseYear}</span></div>
            </div>
            <div class="song-meta" style="justify-content: space-between; align-items: center;">
                <button class="album-card-btn album-card-play-btn" onclick="togglePlayAlbum('${a.id}')" title="Play Album" aria-label="Play Album">
                    ▶
                </button>
                <a href="${albumUrl}" ${albumTarget} class="album-card-btn album-card-spotify-btn" title="Open in Spotify" aria-label="Open in Spotify">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                </a>
            </div>
        `;

        grid.appendChild(card);
    });
}

function togglePlayAlbum(id) {
    console.log('[Albums Page] 🔘 togglePlayAlbum clicked for ID:', id, 'window.miniPlayer:', !!window.miniPlayer);
    if (window.miniPlayer) {
        const album = (filteredAlbums || []).find(a => a.id === id) || (allAlbums || []).find(a => a.id === id) || { id };
        window.miniPlayer.playItem(album, 'album');
    } else {
        console.warn('[Albums Page] ⚠️ window.miniPlayer is NOT defined!');
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

document.addEventListener('DOMContentLoaded', initAlbums);
