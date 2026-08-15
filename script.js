let allSongs = [];
let filteredSongs = [];
let currentSort = 'artist-asc';
let currentViewMode = 'list';
let isGroupedByAlbum = true;
let currentAudio = null;
let currentPlayingId = null;

async function init() {
    const loadingEl = document.getElementById('loading');
    const statsRibbonEl = document.getElementById('stats-ribbon');
    const controlsEl = document.getElementById('controls');

    try {
        const [profile, songs, stats] = await Promise.all([
            getProfile(),
            getLikedSongs(),
            getStats()
        ]);

        if (profile?.displayName) {
            document.getElementById('user-info').innerHTML = `
                Archived for <a href="${profile.spotifyUrl || '#'}" target="_blank">@${profile.displayName}</a>
            `;
        }

        allSongs = songs || [];
        filteredSongs = [...allSongs];

        populateDecadeFilter();
        updateRibbon(stats);
        sortSongs(currentSort);

        loadingEl.style.display = 'none';
        statsRibbonEl.style.display = 'grid';
        controlsEl.style.display = 'flex';

        loadThemePreference();
    } catch (e) {
        console.error('Error initializing:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Could not load local data. Run <code>npm run sync</code> first.</p>`;
    }
}

function updateRibbon(stats) {
    document.getElementById('total-songs').textContent = (allSongs.length).toLocaleString();
    
    if (stats) {
        document.getElementById('total-artists').textContent = (stats.uniqueArtistsCount || 0).toLocaleString();
        document.getElementById('total-albums').textContent = (stats.totalSavedAlbums || 0).toLocaleString();
        document.getElementById('top-artist-name').textContent = stats.topLikedArtists?.[0]?.name || '-';
    } else {
        const artists = new Set();
        allSongs.forEach(s => s.artists?.forEach(a => artists.add(a.name)));
        document.getElementById('total-artists').textContent = artists.size.toLocaleString();
        document.getElementById('total-albums').textContent = '0';
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
    Array.from(decades).sort((a, b) => b - a).forEach(dec => {
        const opt = document.createElement('option');
        opt.value = `${dec}`;
        opt.textContent = `${dec}s`;
        select.appendChild(opt);
    });
}

function sortSongs(criteria) {
    currentSort = criteria;

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
        // Search
        if (search) {
            const matchName = (song.name || '').toLowerCase().includes(search);
            const matchArtist = (song.artistNames || '').toLowerCase().includes(search);
            const matchAlbum = (song.album?.name || '').toLowerCase().includes(search);
            if (!matchName && !matchArtist && !matchAlbum) return false;
        }

        // Decade
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
    card.className = 'song-card';

    const cover = song.coverUrl || song.thumbnailUrl || 'https://via.placeholder.com/300x300?text=No+Cover';
    const isPlaying = currentPlayingId === song.id;

    // Build artist link(s)
    let artistsHtml = '';
    if (Array.isArray(song.artists) && song.artists.length > 0) {
        artistsHtml = song.artists.map(a => {
            const url = a.id ? `https://open.spotify.com/artist/${a.id}` : `https://open.spotify.com/search/${encodeURIComponent(a.name)}`;
            return `<a href="${url}" target="_blank" class="artist-link">${a.name}</a>`;
        }).join(', ');
    } else {
        artistsHtml = `<span class="artist-link">${song.artistNames || 'Unknown Artist'}</span>`;
    }

    // Build album link and release year next to it
    const albumName = song.album?.name || '';
    const releaseYear = song.album?.releaseYear ? ` (${song.album.releaseYear})` : '';
    let albumHtml = '';
    if (albumName) {
        const albumUrl = song.album?.id ? `https://open.spotify.com/album/${song.album.id}` : `https://open.spotify.com/search/${encodeURIComponent(albumName)}`;
        albumHtml = ` · <a href="${albumUrl}" target="_blank" class="album-link">${albumName}</a><span class="album-year">${releaseYear}</span>`;
    } else if (releaseYear) {
        albumHtml = ` · <span class="album-year">${releaseYear}</span>`;
    }

    // Track and Radio links
    const trackUrl = song.spotifyUrl || (song.id ? `https://open.spotify.com/track/${song.id}` : '#');
    const radioUrl = song.id ? `spotify:station:track:${song.id}` : `https://open.spotify.com/search/${encodeURIComponent(song.name + ' radio')}`;

    card.innerHTML = `
        <div class="cover-wrapper">
            <a href="${trackUrl}" target="_blank">
                <img src="${cover}" alt="${song.name}" class="cover-img" loading="lazy">
            </a>
            ${song.previewUrl ? `
                <button class="play-btn-overlay" onclick="togglePlayPreview('${song.id}', '${song.previewUrl}')" title="${isPlaying ? 'Pause Preview' : 'Play Preview'}">
                    ${isPlaying ? '⏸' : '▶'}
                </button>
            ` : ''}
        </div>
        <div class="song-details">
            <div class="song-title">
                <a href="${trackUrl}" target="_blank" class="song-title-link">${song.name}</a>
            </div>
            <div class="song-artist">${artistsHtml}${albumHtml}</div>
        </div>
        <div class="song-actions">
            <a href="${radioUrl}" target="_blank" class="btn-radio" title="Go to Song Radio on Spotify">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/></svg>
                <span>Radio</span>
            </a>
        </div>
    `;

    return card;
}

function togglePlayPreview(id, url) {
    if (currentAudio && currentPlayingId === id) {
        if (currentAudio.paused) {
            currentAudio.play();
        } else {
            currentAudio.pause();
            currentPlayingId = null;
        }
    } else {
        if (currentAudio) {
            currentAudio.pause();
        }
        currentAudio = new Audio(url);
        currentPlayingId = id;
        currentAudio.play();
        currentAudio.onended = () => {
            currentPlayingId = null;
            renderSongs();
        };
    }
    renderSongs();
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
    
    const linkEl = document.getElementById('random-spotify-link');
    linkEl.href = currentRandomSong.spotifyUrl || '#';

    document.getElementById('random-modal').style.display = 'flex';
}

function closeRandomModal() {
    document.getElementById('random-modal').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('random-song-btn')?.addEventListener('click', pickRandomSong);
    
    // Keyboard shortcut 'r' for random song
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
