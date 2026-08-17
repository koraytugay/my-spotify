if (typeof isMobileDevice === 'undefined') {
    window.isMobileDevice = function() {
        if (typeof window === 'undefined') return false;
        const ua = navigator.userAgent || navigator.vendor || window.opera || '';
        const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        const isTouchMobile = (navigator.maxTouchPoints > 1 && window.innerWidth <= 768);
        return isMobileUa || isTouchMobile;
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

if (typeof getSpotifyLink === 'undefined') {
    window.getSpotifyLink = function(itemOrUrl, type = 'track') {
        return window.getSpotifyLinkAttrs(itemOrUrl, type).href;
    };
}

var allSongs = [];
var filteredSongs = [];
var currentSort = 'artist-asc';
var currentViewMode = 'compact';
var currentAudio = null;
var currentPlayingId = null;

async function init() {
    const loadingEl = document.getElementById('loading');
    const controlsEl = document.getElementById('controls');

    try {
        const songs = await getLikedSongs();

        allSongs = Array.isArray(songs) 
            ? (typeof deduplicateSongs === 'function' ? deduplicateSongs(songs) : songs)
            : [];
        filteredSongs = [...allSongs];

        populateDecadeFilter();

        const sortSelect = document.getElementById('sort-select');
        currentSort = (sortSelect && sortSelect.value) || 'artist-asc';
        sortSongs(currentSort);

        if (loadingEl) loadingEl.style.display = 'none';
        if (controlsEl) controlsEl.style.display = 'flex';

        loadThemePreference();

        if (window.miniPlayer) {
            window.miniPlayer.onStateChange(({ isPlaying, currentTrackId }) => {
                currentPlayingId = isPlaying ? currentTrackId : null;
                renderSongs();
            });
        }
    } catch (e) {
        console.error('Error initializing:', e);
        if (loadingEl) {
            loadingEl.innerHTML = `<p style="color: #ff5555;">Could not load local data (${e.message}). Run <code>npm run sync</code> first.</p>`;
        }
    }
}

function populateDecadeFilter() {
    const decades = new Set();
    allSongs.forEach(s => {
        const year = parseInt(s.album?.releaseYear, 10);
        if (!isNaN(year) && year > 1900 && year < 2100) {
            decades.add(Math.floor(year / 10) * 10);
        }
    });

    const select = document.getElementById('decade-filter');
    if (!select) return;
    select.innerHTML = '<option value="all">All Decades</option>';
    Array.from(decades).sort((a, b) => b - a).forEach(dec => {
        const opt = document.createElement('option');
        opt.value = `${dec}`;
        opt.textContent = `${dec}s`;
        select.appendChild(opt);
    });
}

function sortSongs(criteria) {
    const validSorts = ['artist-asc', 'name-asc', 'year-desc', 'year-asc', 'popularity-desc'];
    if (!criteria || !validSorts.includes(criteria)) {
        const selectEl = document.getElementById('sort-select');
        criteria = (selectEl && selectEl.value && validSorts.includes(selectEl.value)) ? selectEl.value : 'artist-asc';
    }

    currentSort = criteria;
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect && sortSelect.value !== criteria) {
        sortSelect.value = criteria;
    }

    allSongs.sort((a, b) => {
        switch (criteria) {
            case 'artist-asc': {
                const artistA = (a.artists?.[0]?.name || a.artistNames || '').toLowerCase();
                const artistB = (b.artists?.[0]?.name || b.artistNames || '').toLowerCase();
                const cmpArtist = artistA.localeCompare(artistB);
                if (cmpArtist !== 0) return cmpArtist;

                // Within same artist: sort by release date / year
                const yearA = parseInt(a.album?.releaseYear) || 0;
                const yearB = parseInt(b.album?.releaseYear) || 0;
                if (yearA !== yearB) return yearA - yearB;
                const dateA = a.album?.releaseDate || '';
                const dateB = b.album?.releaseDate || '';
                const cmpDate = dateA.localeCompare(dateB);
                if (cmpDate !== 0) return cmpDate;

                // Within same album / release date: sort by song title
                return (a.name || '').localeCompare(b.name || '');
            }
            case 'name-asc':
                return (a.name || '').localeCompare(b.name || '');
            case 'year-desc':
                return (parseInt(b.album?.releaseYear) || 0) - (parseInt(a.album?.releaseYear) || 0);
            case 'year-asc':
                return (parseInt(a.album?.releaseYear) || 0) - (parseInt(b.album?.releaseYear) || 0);
            case 'popularity-desc':
                return (b.popularity || 0) - (a.popularity || 0);
            default:
                return 0;
        }
    });

    applyFilters();
}

function applyFilters() {
    const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    const decade = document.getElementById('decade-filter')?.value || 'all';

    filteredSongs = allSongs.filter(song => {
        if (search) {
            const matchName = (song.name || '').toLowerCase().includes(search);
            const matchArtist = (song.artistNames || '').toLowerCase().includes(search);
            const matchAlbum = (song.album?.name || '').toLowerCase().includes(search);
            if (!matchName && !matchArtist && !matchAlbum) return false;
        }

        if (decade !== 'all') {
            const decNum = parseInt(decade, 10);
            const year = parseInt(song.album?.releaseYear, 10);
            if (isNaN(year) || Math.floor(year / 10) * 10 !== decNum) return false;
        }

        return true;
    });

    renderSongs();
}

function renderSongs() {
    const grid = document.getElementById('music-grid');
    const noResults = document.getElementById('no-results');
    if (!grid || !noResults) return;

    if (currentViewMode === 'grid') {
        grid.className = 'music-grid';
    } else if (currentViewMode === 'compact') {
        grid.className = 'music-grid view-compact';
    } else if (currentViewMode === 'list') {
        grid.className = 'music-grid view-list';
    }

    if (filteredSongs.length === 0) {
        grid.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';
    grid.innerHTML = '';

    filteredSongs.forEach(song => {
        grid.appendChild(createSongCard(song));
    });
}

function createSongCard(song) {
    const card = document.createElement('div');
    const isPlaying = currentPlayingId === song.id;
    card.className = `song-card ${isPlaying ? 'is-playing' : ''}`;

    const cover = song.coverUrl || song.thumbnailUrl || 'https://via.placeholder.com/300x300?text=No+Cover';

    // Artists HTML
    let artistsHtml = '';
    if (Array.isArray(song.artists) && song.artists.length > 0) {
        artistsHtml = song.artists.map(a => {
            const url = a.id ? `artist.html?id=${encodeURIComponent(a.id)}&name=${encodeURIComponent(a.name)}` : `artist.html?name=${encodeURIComponent(a.name)}`;
            return `<a href="${url}" class="artist-link">${a.name}</a>`;
        }).join(', ');
    } else {
        artistsHtml = `<a href="artist.html?name=${encodeURIComponent(song.artistNames || 'Artist')}" class="artist-link">${song.artistNames || 'Unknown Artist'}</a>`;
    }

    // Album name and release year (plain text)
    const albumName = song.album?.name || '';
    const releaseYear = song.album?.releaseYear ? ` (${song.album.releaseYear})` : '';
    const albumText = albumName ? ` · ${albumName}${releaseYear}` : (releaseYear ? ` · ${releaseYear}` : '');

    // Track link for the Spotify icon button
    const { href: trackUrl, targetAttrs: trackTarget } = getSpotifyLinkAttrs(song, 'track');

    card.innerHTML = `
        <div class="cover-wrapper">
            <img src="${cover}" alt="${song.name}" class="cover-img" loading="lazy">
        </div>
        <div class="song-details">
            <div class="song-title">${song.name}</div>
            <div class="song-artist">${artistsHtml}${albumText}</div>
        </div>
        <div class="song-meta" style="justify-content: space-between; align-items: center;">
            <button class="album-card-btn album-card-play-btn" onclick="togglePlayPreview('${song.id}')" title="Play Track" aria-label="Play Track">
                ▶
            </button>
            <a href="${trackUrl}" ${trackTarget} class="album-card-btn album-card-spotify-btn" title="Open in Spotify" aria-label="Open in Spotify">
                <svg viewBox="0 0 24 24">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
            </a>
        </div>
    `;

    return card;
}

function togglePlayPreview(id) {
    console.log('[Liked Songs] 🔘 togglePlayPreview clicked for ID:', id);
    if (window.miniPlayer) {
        const song = (filteredSongs || []).find(s => s.id === id) || (allSongs || []).find(s => s.id === id) || { id };
        window.miniPlayer.currentType = 'track';
        window.miniPlayer.contextTitle = 'Liked Songs';
        window.miniPlayer.playTrack(song, filteredSongs);
    }
}

function changeViewMode(mode) {
    currentViewMode = mode;
    renderSongs();
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

// Random Song Modal
let currentRandomSong = null;

function pickRandomSong() {
    if (filteredSongs.length === 0) return;
    const randomIdx = Math.floor(Math.random() * filteredSongs.length);
    currentRandomSong = filteredSongs[randomIdx];

    document.getElementById('random-cover').src = currentRandomSong.coverUrl || currentRandomSong.thumbnailUrl || '';
    document.getElementById('random-title').textContent = currentRandomSong.name;
    document.getElementById('random-artist').textContent = currentRandomSong.artistNames;
    document.getElementById('random-meta').textContent = `${currentRandomSong.album?.name || ''} · ${currentRandomSong.album?.releaseYear || ''} · ${currentRandomSong.durationFormatted || ''}`;
    
    const { href: randomTrackUrl, isMobile } = getSpotifyLinkAttrs(currentRandomSong, 'track');
    const linkEl = document.getElementById('random-spotify-link');
    linkEl.href = randomTrackUrl;
    if (isMobile) {
        linkEl.removeAttribute('target');
        linkEl.removeAttribute('rel');
    } else {
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';
    }

    document.getElementById('random-modal').style.display = 'flex';
}

function closeRandomModal() {
    document.getElementById('random-modal').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('random-song-btn')?.addEventListener('click', pickRandomSong);
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'r' && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
            pickRandomSong();
        }
        if (e.key === 'Escape') {
            closeRandomModal();
        }
    });

    init();
});
