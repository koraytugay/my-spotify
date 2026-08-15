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
            case 'artist-asc':
                return (a.artistNames || '').localeCompare(b.artistNames || '');
            case 'name-asc':
                return (a.name || '').localeCompare(b.name || '');
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

function toggleGroupByAlbum(isGrouped) {
    isGroupedByAlbum = isGrouped;
    renderSongs();
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

    if (filteredSongs.length === 0) {
        grid.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';
    grid.innerHTML = '';

    if (!isGroupedByAlbum) {
        // Flat Rendering
        if (currentViewMode === 'grid') {
            grid.className = 'music-grid';
        } else if (currentViewMode === 'compact') {
            grid.className = 'music-grid view-compact';
        } else if (currentViewMode === 'list') {
            grid.className = 'music-grid view-list';
        }

        const limit = 400;
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
    } else {
        // Grouped by Artist -> Grouped by Album (sorted by Release Date)
        grid.className = '';

        // 1. Group by Artist
        const artistGroups = new Map();
        filteredSongs.forEach(song => {
            const primaryArtist = song.artists?.[0]?.name || song.artistNames || 'Unknown Artist';
            if (!artistGroups.has(primaryArtist)) {
                artistGroups.set(primaryArtist, {
                    name: primaryArtist,
                    albums: new Map(),
                    totalTracks: 0
                });
            }

            const artistObj = artistGroups.get(primaryArtist);
            artistObj.totalTracks++;

            const albumKey = song.album?.name || 'Singles';
            if (!artistObj.albums.has(albumKey)) {
                artistObj.albums.set(albumKey, {
                    name: albumKey,
                    releaseDate: song.album?.releaseDate || '',
                    releaseYear: song.album?.releaseYear || '',
                    coverUrl: song.coverUrl || song.thumbnailUrl || '',
                    tracks: []
                });
            }

            artistObj.albums.get(albumKey).tracks.push(song);
        });

        // 2. Sort Artists
        const sortedArtists = Array.from(artistGroups.values()).sort((a, b) => a.name.localeCompare(b.name));

        // 3. Render Artist & Album Sections
        sortedArtists.forEach(artistObj => {
            const artistSection = document.createElement('div');
            artistSection.className = 'artist-group-section';

            const artistHeader = document.createElement('div');
            artistHeader.className = 'artist-group-header';
            artistHeader.innerHTML = `
                <div class="artist-group-title">${artistObj.name}</div>
                <div class="artist-group-badge">${artistObj.totalTracks} track${artistObj.totalTracks > 1 ? 's' : ''}</div>
            `;
            artistSection.appendChild(artistHeader);

            // Sort Albums by Release Date chronologically (oldest to newest)
            const sortedAlbums = Array.from(artistObj.albums.values()).sort((a, b) => {
                const yearA = parseInt(a.releaseYear) || 0;
                const yearB = parseInt(b.releaseYear) || 0;
                if (yearA !== yearB) return yearA - yearB;
                return (a.releaseDate || '').localeCompare(b.releaseDate || '');
            });

            sortedAlbums.forEach(albumObj => {
                const albumSection = document.createElement('div');
                albumSection.className = 'album-group-section';

                const albumHeader = document.createElement('div');
                albumHeader.className = 'album-group-header';
                albumHeader.innerHTML = `
                    <img src="${albumObj.coverUrl || 'https://via.placeholder.com/300x300?text=Album'}" alt="${albumObj.name}" class="album-group-thumb">
                    <div class="album-group-info">
                        <div class="album-group-name">${albumObj.name}</div>
                        <div class="album-group-artist">${artistObj.name} ${albumObj.releaseYear ? `(${albumObj.releaseYear})` : ''}</div>
                    </div>
                    <div class="album-group-badge">${albumObj.tracks.length} track${albumObj.tracks.length > 1 ? 's' : ''}</div>
                `;
                albumSection.appendChild(albumHeader);

                const tracksContainer = document.createElement('div');
                if (currentViewMode === 'grid') {
                    tracksContainer.className = 'music-grid';
                } else if (currentViewMode === 'compact') {
                    tracksContainer.className = 'music-grid view-compact';
                } else if (currentViewMode === 'list') {
                    tracksContainer.className = 'music-grid view-list';
                }

                albumObj.tracks.forEach(song => {
                    tracksContainer.appendChild(createSongCard(song));
                });

                albumSection.appendChild(tracksContainer);
                artistSection.appendChild(albumSection);
            });

            grid.appendChild(artistSection);
        });
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
