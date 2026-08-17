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

        populateArtistFilter();

        const sortSelect = document.getElementById('sort-select');
        currentSort = (sortSelect && sortSelect.value) || 'artist-asc';
        sortAlbums(currentSort);

        loadingEl.style.display = 'none';
        controlsEl.style.display = 'flex';
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
        card.className = 'song-card';
        const cover = a.coverUrl || 'https://via.placeholder.com/300x300?text=Album';

        const albumDetailUrl = `album.html?id=${encodeURIComponent(a.id)}`;

        let artistsHtml = '';
        if (Array.isArray(a.artists) && a.artists.length > 0) {
            artistsHtml = a.artists.map(art => {
                const url = art.id ? `artist.html?id=${encodeURIComponent(art.id)}&name=${encodeURIComponent(art.name)}` : `artist.html?name=${encodeURIComponent(art.name)}`;
                return `<a href="${url}" class="artist-link">${art.name}</a>`;
            }).join(', ');
        } else if (a.artistNames) {
            artistsHtml = `<a href="artist.html?name=${encodeURIComponent(a.artistNames)}" class="artist-link">${a.artistNames}</a>`;
        } else {
            artistsHtml = 'Unknown Artist';
        }
        const releaseYear = a.releaseYear ? ` (${a.releaseYear})` : '';

        card.innerHTML = `
            <a href="${albumDetailUrl}" class="cover-wrapper" style="display: block; text-decoration: none;">
                <img src="${cover}" alt="${a.name}" class="cover-img" loading="lazy">
            </a>
            <div class="song-details">
                <div class="song-title">
                    <a href="${albumDetailUrl}" class="song-title-link">${a.name}</a>
                </div>
                <div class="song-artist">${artistsHtml}<span class="album-year">${releaseYear}</span></div>
            </div>
        `;

        grid.appendChild(card);
    });
}

function togglePlayAlbum(id) {
    if (window.miniPlayer) {
        const album = (filteredAlbums || []).find(a => a.id === id) || (allAlbums || []).find(a => a.id === id) || { id };
        window.miniPlayer.playItem(album, 'album');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAlbums);
} else {
    initAlbums();
}
