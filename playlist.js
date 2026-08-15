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

        document.getElementById('hero-track-count').textContent = `${allTracks.length} tracks`;

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

let isGroupedByAlbum = false;

function toggleGroupByAlbum(isGrouped) {
    isGroupedByAlbum = isGrouped;
    renderTracks();
}

function renderTracks() {
    const grid = document.getElementById('tracks-grid');
    const noResults = document.getElementById('no-results');

    if (filteredTracks.length === 0) {
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

        filteredTracks.forEach(t => {
            grid.appendChild(createTrackCard(t));
        });
    } else {
        // Grouped by Album Rendering
        grid.className = '';

        // Group tracks by album
        const albumGroups = new Map();
        filteredTracks.forEach(t => {
            const albumKey = t.album?.name || 'Unknown Album';
            if (!albumGroups.has(albumKey)) {
                albumGroups.set(albumKey, {
                    name: albumKey,
                    artist: t.artistNames || '',
                    releaseYear: t.album?.releaseYear || '',
                    coverUrl: t.coverUrl || t.thumbnailUrl || '',
                    tracks: []
                });
            }
            albumGroups.get(albumKey).tracks.push(t);
        });

        albumGroups.forEach(group => {
            const section = document.createElement('div');
            section.className = 'album-group-section';

            const header = document.createElement('div');
            header.className = 'album-group-header';
            header.innerHTML = `
                <img src="${group.coverUrl || 'https://via.placeholder.com/300x300?text=Album'}" alt="${group.name}" class="album-group-thumb">
                <div class="album-group-info">
                    <div class="album-group-name">${group.name}</div>
                    <div class="album-group-artist">${group.artist} ${group.releaseYear ? `(${group.releaseYear})` : ''}</div>
                </div>
                <div class="album-group-badge">${group.tracks.length} track${group.tracks.length > 1 ? 's' : ''}</div>
            `;
            section.appendChild(header);

            const tracksContainer = document.createElement('div');
            if (currentViewMode === 'grid') {
                tracksContainer.className = 'music-grid';
            } else if (currentViewMode === 'compact') {
                tracksContainer.className = 'music-grid view-compact';
            } else if (currentViewMode === 'list') {
                tracksContainer.className = 'music-grid view-list';
            }

            group.tracks.forEach(t => {
                tracksContainer.appendChild(createTrackCard(t));
            });

            section.appendChild(tracksContainer);
            grid.appendChild(section);
        });
    }
}

function createTrackCard(t) {
    const card = document.createElement('div');
    card.className = 'song-card';
    const cover = t.coverUrl || t.thumbnailUrl || 'https://via.placeholder.com/300x300?text=Track';
    const isPlaying = currentPlayingId === t.id;

    // Build artist link(s)
    let artistsHtml = '';
    if (Array.isArray(t.artists) && t.artists.length > 0) {
        artistsHtml = t.artists.map(a => {
            const url = a.id ? `https://open.spotify.com/artist/${a.id}` : `https://open.spotify.com/search/${encodeURIComponent(a.name)}`;
            return `<a href="${url}" target="_blank" class="artist-link">${a.name}</a>`;
        }).join(', ');
    } else {
        artistsHtml = `<span class="artist-link">${t.artistNames || 'Unknown Artist'}</span>`;
    }

    // Build album link and release year next to it
    const albumName = t.album?.name || '';
    const releaseYear = t.album?.releaseYear ? ` (${t.album.releaseYear})` : '';
    let albumHtml = '';
    if (albumName) {
        const albumUrl = t.album?.id ? `https://open.spotify.com/album/${t.album.id}` : `https://open.spotify.com/search/${encodeURIComponent(albumName)}`;
        albumHtml = ` · <a href="${albumUrl}" target="_blank" class="album-link">${albumName}</a><span class="album-year">${releaseYear}</span>`;
    } else if (releaseYear) {
        albumHtml = ` · <span class="album-year">${releaseYear}</span>`;
    }

    // Track link
    const trackUrl = t.spotifyUrl || (t.id ? `https://open.spotify.com/track/${t.id}` : '#');

    card.innerHTML = `
        <div class="cover-wrapper">
            <img src="${cover}" alt="${t.name}" class="cover-img" loading="lazy">
            ${t.previewUrl ? `
                <button class="play-btn-overlay" onclick="togglePlayPreview('${t.id}', '${t.previewUrl}')" title="${isPlaying ? 'Pause' : 'Play'}">
                    ${isPlaying ? '⏸' : '▶'}
                </button>
            ` : ''}
        </div>
        <div class="song-details">
            <div class="song-title">
                <a href="${trackUrl}" target="_blank" class="song-title-link">${t.name}</a>
            </div>
            <div class="song-artist">${artistsHtml}${albumHtml}</div>
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
