var playlistData = null;
var allTracks = [];
var filteredTracks = [];
var currentSort = 'artist-asc';
var currentViewMode = 'list';
var currentAudio = null;
var currentPlayingId = null;
var isGroupedByAlbum = false;

async function initPlaylistDetail() {
    const loadingEl = document.getElementById('loading');
    const viewEl = document.getElementById('playlist-view');

    const params = new URLSearchParams(window.location.search);
    const playlistId = params.get('id');

    if (!playlistId) {
        loadingEl.innerHTML = `<p style="color: #ff5555;">No playlist ID provided.</p>`;
        return;
    }

    try {
        playlistData = await getPlaylistById(playlistId);

        if (!playlistData) {
            loadingEl.innerHTML = `<p style="color: #ff5555;">Playlist not found.</p>`;
            return;
        }

        loadThemePreference();

        // Populate Hero Header
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
        
        const spotifyUrl = getSpotifyUri(playlistData, 'playlist');
        const spotifyLinkEl = document.getElementById('hero-spotify-link');
        if (spotifyLinkEl) {
            spotifyLinkEl.href = spotifyUrl;
            spotifyLinkEl.removeAttribute('target');
        }

        allTracks = (playlistData.tracks || []).map((t, idx) => ({ ...t, originalIndex: idx }));
        filteredTracks = [...allTracks];

        document.getElementById('hero-track-count').textContent = `${allTracks.length} tracks`;

        const sortSelect = document.getElementById('sort-select');
        currentSort = (sortSelect && sortSelect.value) || 'artist-asc';
        sortTracks(currentSort);

        loadingEl.style.display = 'none';
        viewEl.style.display = 'block';

        if (window.miniPlayer) {
            window.miniPlayer.onStateChange(({ isPlaying, currentTrackId }) => {
                currentPlayingId = isPlaying ? currentTrackId : null;
                renderTracks();
            });
        }

    } catch (e) {
        console.error('Error loading playlist:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Error loading playlist details: ${e.message}</p>`;
    }
}

function sortTracks(criteria) {
    const validSorts = ['artist-asc', 'default', 'name-asc', 'year-desc', 'year-asc'];
    if (!criteria || !validSorts.includes(criteria)) {
        const selectEl = document.getElementById('sort-select');
        criteria = (selectEl && selectEl.value && validSorts.includes(selectEl.value)) ? selectEl.value : 'artist-asc';
    }

    currentSort = criteria;
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect && sortSelect.value !== criteria) {
        sortSelect.value = criteria;
    }
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
        grid.className = '';

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
    const isPlaying = currentPlayingId === t.id;
    card.className = `song-card ${isPlaying ? 'is-playing' : ''}`;
    const cover = t.coverUrl || t.thumbnailUrl || 'https://via.placeholder.com/300x300?text=Track';

    // Build artist link(s) linking to internal artist page
    let artistsHtml = '';
    if (Array.isArray(t.artists) && t.artists.length > 0) {
        artistsHtml = t.artists.map(a => {
            const url = a.id
                ? `artist.html?id=${encodeURIComponent(a.id)}&name=${encodeURIComponent(a.name)}`
                : `artist.html?name=${encodeURIComponent(a.name)}`;
            return `<a href="${url}" class="artist-link">${a.name}</a>`;
        }).join(', ');
    } else {
        artistsHtml = `<span class="artist-link">${t.artistNames || 'Unknown Artist'}</span>`;
    }

    // Build album link and release year next to it
    const albumName = t.album?.name || '';
    const releaseYear = t.album?.releaseYear ? ` (${t.album.releaseYear})` : '';
    let albumHtml = '';
    if (albumName) {
        const albumUrl = t.album?.id ? `album.html?id=${encodeURIComponent(t.album.id)}` : `https://open.spotify.com/search/${encodeURIComponent(albumName)}`;
        albumHtml = ` · <a href="${albumUrl}" class="album-link">${albumName}</a><span class="album-year">${releaseYear}</span>`;
    } else if (releaseYear) {
        albumHtml = ` · <span class="album-year">${releaseYear}</span>`;
    }

    // Track link
    const trackUrl = getSpotifyUri(t, 'track');

    card.innerHTML = `
        <div class="cover-wrapper">
            <a href="${trackUrl}">
                <img src="${cover}" alt="${t.name}" class="cover-img" loading="lazy">
            </a>
            <button class="play-btn-overlay" onclick="togglePlayPreview('${t.id}', '${t.previewUrl || ''}')" title="${isPlaying ? 'Pause' : 'Play'}">
                ${isPlaying ? '⏸' : '▶'}
            </button>
        </div>
        <div class="song-details">
            <div class="song-title">
                <a href="${trackUrl}" class="song-title-link">${t.name}</a>
            </div>
            <div class="song-artist">${artistsHtml}${albumHtml}</div>
        </div>
        <div class="song-meta" style="justify-content: flex-end;">
            <a href="${trackUrl}" class="spotify-icon-btn" title="Open in Spotify" aria-label="Open in Spotify">
                <svg viewBox="0 0 24 24">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
            </a>
        </div>
    `;

    return card;
}

function togglePlayPreview(id, url) {
    if (window.miniPlayer) {
        const track = filteredTracks.find(t => t.id === id) || allTracks.find(t => t.id === id) || { id, previewUrl: url };
        window.miniPlayer.toggleTrack(track, filteredTracks);
        return;
    }

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

function loadThemePreference() {
    const saved = localStorage.getItem('theme') || 'light';
    const isDark = saved === 'dark';
    const toggle = document.getElementById('dark-mode-toggle');
    if (toggle) toggle.checked = isDark;
    if (isDark) document.body.classList.add('dark-mode');
}

document.addEventListener('DOMContentLoaded', initPlaylistDetail);
