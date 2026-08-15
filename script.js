let allSongs = [];
let filteredSongs = [];
let currentSort = 'added-desc';
let currentViewMode = 'grid';
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
                Archived for <a href="${profile.spotifyUrl || '#'}" target="_blank">@${profile.displayName}</a> · Last synced: ${stats?.lastUpdated ? new Date(stats.lastUpdated).toLocaleDateString() : 'Ready'}
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
        document.getElementById('total-duration').textContent = `${Math.round(stats.totalDurationHours || 0)}h`;
        document.getElementById('top-artist-name').textContent = stats.topLikedArtists?.[0]?.name || '-';
    } else {
        const artists = new Set();
        allSongs.forEach(s => s.artists?.forEach(a => artists.add(a.name)));
        document.getElementById('total-artists').textContent = artists.size.toLocaleString();
        const totalMs = allSongs.reduce((acc, s) => acc + (s.durationMs || 0), 0);
        document.getElementById('total-duration').textContent = `${Math.round(totalMs / (1000 * 60 * 60))}h`;
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
            case 'added-desc':
                return (b.addedAt || '').localeCompare(a.addedAt || '');
            case 'added-asc':
                return (a.addedAt || '').localeCompare(b.addedAt || '');
            case 'name-asc':
                return (a.name || '').localeCompare(b.name || '');
            case 'artist-asc':
                return (a.artistNames || '').localeCompare(b.artistNames || '');
            case 'year-desc':
                return (parseInt(b.album?.releaseYear) || 0) - (parseInt(a.album?.releaseYear) || 0);
            case 'year-asc':
                return (parseInt(a.album?.releaseYear) || 0) - (parseInt(b.album?.releaseYear) || 0);
            case 'duration-desc':
                return (b.durationMs || 0) - (a.durationMs || 0);
            case 'duration-asc':
                return (a.durationMs || 0) - (b.durationMs || 0);
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
    const duration = document.getElementById('duration-filter')?.value || 'all';
    const previewsOnly = document.getElementById('previews-only')?.checked || false;

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

        // Duration
        if (duration !== 'all') {
            const mins = (song.durationMs || 0) / (1000 * 60);
            if (duration === 'short' && mins >= 3) return false;
            if (duration === 'medium' && (mins < 3 || mins > 5)) return false;
            if (duration === 'long' && mins <= 5) return false;
        }

        // Previews only
        if (previewsOnly && !song.previewUrl) return false;

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

    // Render in chunks for silky performance on large collections
    const limit = 300;
    const toRender = filteredSongs.slice(0, limit);

    toRender.forEach(song => {
        grid.appendChild(createSongCard(song));
    });

    if (filteredSongs.length > limit) {
        const loadMoreBox = document.createElement('div');
        loadMoreBox.className = 'empty-box';
        loadMoreBox.innerHTML = `<p>Showing first ${limit} of ${filteredSongs.length} tracks. Use search/filters to narrow down.</p>`;
        grid.appendChild(loadMoreBox);
    }
}

function createSongCard(song) {
    const card = document.createElement('div');
    card.className = 'song-card';
    card.title = `${song.name} by ${song.artistNames}`;

    const cover = song.coverUrl || song.thumbnailUrl || 'https://via.placeholder.com/300x300?text=No+Cover';
    const isPlaying = currentPlayingId === song.id;

    card.innerHTML = `
        <div class="cover-wrapper">
            <img src="${cover}" alt="${song.name}" class="cover-img" loading="lazy">
            ${song.previewUrl ? `
                <button class="play-btn-overlay" onclick="event.stopPropagation(); togglePlayPreview('${song.id}', '${song.previewUrl}')" title="${isPlaying ? 'Pause Preview' : 'Play Preview'}">
                    ${isPlaying ? '⏸' : '▶'}
                </button>
            ` : ''}
        </div>
        <div class="song-details">
            <div class="song-title">${song.name}</div>
            <div class="song-artist">${song.artistNames}</div>
        </div>
        <div class="song-meta">
            <span>${song.album?.releaseYear || ''}</span>
            <span>${song.durationFormatted || ''}</span>
            ${song.addedDate ? `<span class="badge">Liked ${song.addedDate}</span>` : ''}
        </div>
    `;

    card.onclick = () => {
        if (song.spotifyUrl) {
            window.open(song.spotifyUrl, '_blank');
        }
    };

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
