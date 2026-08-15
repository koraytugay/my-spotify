let playlistData = null;
let allTracks = [];
let filteredTracks = [];
let currentSort = 'artist-asc';
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

        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') document.body.classList.add('dark-mode');

        // Populate Hero Header
        const pageHeadingEl = document.getElementById('page-heading');
        if (pageHeadingEl) pageHeadingEl.textContent = playlistData.name || 'Playlist Details';

        const heroTitleEl = document.getElementById('hero-title');
        if (heroTitleEl) heroTitleEl.textContent = playlistData.name || 'Untitled Playlist';

        const descEl = document.getElementById('hero-desc');
        if (descEl) {
            if (playlistData.description && playlistData.description.trim()) {
                descEl.textContent = playlistData.description;
                descEl.style.display = 'block';
            } else {
                descEl.textContent = '';
                descEl.style.display = 'none';
            }
        }

        const heroOwnerEl = document.getElementById('hero-owner');
        if (heroOwnerEl) heroOwnerEl.textContent = `By ${playlistData.owner || 'Spotify'}`;

        const heroImgEl = document.getElementById('hero-img');
        if (heroImgEl) heroImgEl.src = playlistData.coverUrl || 'https://via.placeholder.com/300x300?text=Playlist';
        
        const spotifyUrl = playlistData.spotifyUrl || (playlistData.id ? `https://open.spotify.com/playlist/${playlistData.id}` : '#');
        const spotifyLinkEl = document.getElementById('hero-spotify-link');
        if (spotifyLinkEl) spotifyLinkEl.href = spotifyUrl;

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

                // Within same release date: sort by song title
                return (a.name || '').localeCompare(b.name || '');
            }
            case 'year-desc':
                return (parseInt(b.album?.releaseYear) || 0) - (parseInt(a.album?.releaseYear) || 0);
            case 'year-asc':
                return (parseInt(a.album?.releaseYear) || 0) - (parseInt(b.album?.releaseYear) || 0);
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
