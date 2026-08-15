let playlistData = null;
let allTracks = [];
let filteredTracks = [];
let currentSort = 'default';
let currentViewMode = 'list';
let currentAudio = null;
let currentPlayingId = null;

async function initPlaylistDetail() {
    const loadingEl = document.getElementById('loading');
    const viewEl = document.getElementById('playlist-view');

    const params = new URLSearchParams(window.location.search);
    const playlistId = params.get('id');

    if (!playlistId) {
        loadingEl.innerHTML = `<p style="color: #ff5555;">No playlist ID provided. <a href="playlists.html">Back to playlists</a></p>`;
        return;
    }

    try {
        playlistData = await getPlaylistById(playlistId);

        if (!playlistData) {
            loadingEl.innerHTML = `<p style="color: #ff5555;">Playlist not found. <a href="playlists.html">Back to playlists</a></p>`;
            return;
        }

        // Apply theme
        const savedTheme = localStorage.getItem('theme') || 'light';
        const isDark = savedTheme === 'dark';
        const toggle = document.getElementById('dark-mode-toggle');
        if (toggle) toggle.checked = isDark;
        if (isDark) document.body.classList.add('dark-mode');

        // Hero Info
        document.getElementById('page-heading').textContent = playlistData.name;
        document.getElementById('hero-title').textContent = playlistData.name;
        document.getElementById('hero-desc').textContent = playlistData.description || 'Archived Playlist';
        document.getElementById('hero-owner').textContent = `Created by ${playlistData.owner || 'You'}`;
        document.getElementById('hero-img').src = playlistData.coverUrl || 'https://via.placeholder.com/300x300?text=Playlist';
        
        const spotifyLink = document.getElementById('hero-spotify-link');
        if (playlistData.spotifyUrl) {
            spotifyLink.href = playlistData.spotifyUrl;
        } else {
            spotifyLink.style.display = 'none';
        }

        allTracks = (playlistData.tracks || []).map((t, idx) => ({ ...t, originalIndex: idx }));
        filteredTracks = [...allTracks];

        const totalMs = allTracks.reduce((acc, t) => acc + (t.durationMs || 0), 0);
        const totalMinutes = Math.floor(totalMs / 60000);
        const totalHours = Math.floor(totalMinutes / 60);
        const remMins = totalMinutes % 60;
        const durationFormatted = totalHours > 0 ? `${totalHours} hr ${remMins} min` : `${totalMinutes} min`;

        document.getElementById('hero-track-count').textContent = `${allTracks.length} tracks`;
        document.getElementById('hero-duration').textContent = durationFormatted;

        sortTracks(currentSort);

        loadingEl.style.display = 'none';
        viewEl.style.display = 'block';

    } catch (e) {
        console.error('Error loading playlist:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Error loading playlist details: ${e.message}</p>`;
    }
}

function sortTracks(criteria) {
    currentSort = criteria;
    allTracks.sort((a, b) => {
        switch (criteria) {
            case 'default':
                return (a.originalIndex || 0) - (b.originalIndex || 0);
            case 'name-asc':
                return (a.name || '').localeCompare(b.name || '');
            case 'artist-asc':
                return (a.artistNames || '').localeCompare(b.artistNames || '');
            case 'year-desc':
                return (parseInt(b.album?.releaseYear) || 0) - (parseInt(a.album?.releaseYear) || 0);
            case 'duration-desc':
                return (b.durationMs || 0) - (a.durationMs || 0);
            default:
                return 0;
        }
    });
    applyFilters();
}

function applyFilters() {
    const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    filteredTracks = allTracks.filter(t => {
        if (!search) return true;
        const matchName = (t.name || '').toLowerCase().includes(search);
        const matchArtist = (t.artistNames || '').toLowerCase().includes(search);
        const matchAlbum = (t.album?.name || '').toLowerCase().includes(search);
        return matchName || matchArtist || matchAlbum;
    });
    renderTracks();
}

function renderTracks() {
    const grid = document.getElementById('tracks-grid');
    const noResults = document.getElementById('no-results');

    if (currentViewMode === 'grid') {
        grid.className = 'music-grid';
    } else if (currentViewMode === 'compact') {
        grid.className = 'music-grid view-compact';
    } else if (currentViewMode === 'list') {
        grid.className = 'music-grid view-list';
    }

    if (filteredTracks.length === 0) {
        grid.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';
    grid.innerHTML = '';

    filteredTracks.forEach(t => {
        const card = document.createElement('div');
        card.className = 'song-card';
        const cover = t.coverUrl || t.thumbnailUrl || 'https://via.placeholder.com/300x300?text=Track';
        const isPlaying = currentPlayingId === t.id;

        card.innerHTML = `
            <div class="cover-wrapper">
                <img src="${cover}" alt="${t.name}" class="cover-img" loading="lazy">
                ${t.previewUrl ? `
                    <button class="play-btn-overlay" onclick="event.stopPropagation(); togglePlayPreview('${t.id}', '${t.previewUrl}')" title="${isPlaying ? 'Pause' : 'Play'}">
                        ${isPlaying ? '⏸' : '▶'}
                    </button>
                ` : ''}
            </div>
            <div class="song-details">
                <div class="song-title">${t.name}</div>
                <div class="song-artist">${t.artistNames} · <span style="color: var(--text-muted);">${t.album?.name || ''}</span></div>
            </div>
            <div class="song-meta">
                <span>${t.album?.releaseYear || ''}</span>
                <span>${t.durationFormatted || ''}</span>
            </div>
        `;

        card.onclick = () => {
            if (t.spotifyUrl) window.open(t.spotifyUrl, '_blank');
        };

        grid.appendChild(card);
    });
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
        if (currentAudio) currentAudio.pause();
        currentAudio = new Audio(url);
        currentPlayingId = id;
        currentAudio.play();
        currentAudio.onended = () => {
            currentPlayingId = null;
            renderTracks();
        };
    }
    renderTracks();
}

function changeViewMode(mode) {
    currentViewMode = mode;
    renderTracks();
}

function toggleDarkMode(isDark) {
    if (isDark) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

document.addEventListener('DOMContentLoaded', initPlaylistDetail);
