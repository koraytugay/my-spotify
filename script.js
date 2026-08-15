let allSongs = [];
let filteredSongs = [];
let currentSort = 'artist-asc';
let currentViewMode = 'list';
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

    // Build artist link(s) linking to internal artist page
    let artistsHtml = '';
    if (Array.isArray(song.artists) && song.artists.length > 0) {
        artistsHtml = song.artists.map(a => {
            const url = a.id
                ? `artist.html?id=${encodeURIComponent(a.id)}&name=${encodeURIComponent(a.name)}`
                : `artist.html?name=${encodeURIComponent(a.name)}`;
            return `<a href="${url}" class="artist-link">${a.name}</a>`;
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

    // Track link
    const trackUrl = song.spotifyUrl || (song.id ? `https://open.spotify.com/track/${song.id}` : '#');

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
        <div class="song-meta" style="justify-content: flex-end;">
            <a href="${trackUrl}" target="_blank" class="spotify-icon-btn" title="Open in Spotify" aria-label="Open in Spotify">
                <svg viewBox="0 0 24 24">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
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
