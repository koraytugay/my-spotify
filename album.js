// Album Detail View - Authentic Personal Spotify Archive
var albumData = null;
var allAlbumTracks = [];
var filteredTracks = [];
var currentViewMode = 'list';
var currentPlayingId = null;
var likedSongIdSet = new Set();

async function initAlbumDetail() {
    const loadingEl = document.getElementById('loading');
    const viewEl = document.getElementById('album-view');

    const params = new URLSearchParams(window.location.search);
    const albumId = params.get('id') || '';
    const albumName = params.get('name') || '';

    if (!albumId && !albumName) {
        if (loadingEl) loadingEl.innerHTML = `<p style="color: #ff5555;">No album specified.</p>`;
        return;
    }

    try {
        const [savedAlbums, likedSongs] = await Promise.all([
            getSavedAlbums(),
            getLikedSongs()
        ]);

        // Build set of liked song IDs
        if (Array.isArray(likedSongs)) {
            likedSongs.forEach(s => {
                if (s && s.id) likedSongIdSet.add(s.id);
            });
        }

        // Find matching album
        let matchedAlbum = (savedAlbums || []).find(a => 
            (albumId && a.id === albumId) ||
            (albumName && a.name && a.name.toLowerCase().trim() === albumName.toLowerCase().trim())
        );

        if (!matchedAlbum) {
            if (loadingEl) loadingEl.innerHTML = `<p style="color: #ff5555;">Album not found in your saved library.</p>`;
            return;
        }

        albumData = matchedAlbum;
        loadThemePreference();

        // Populate Hero Header
        const heroTitleEl = document.getElementById('hero-title');
        if (heroTitleEl) heroTitleEl.textContent = albumData.name || 'Untitled Album';

        const heroArtistEl = document.getElementById('hero-artist');
        if (heroArtistEl) {
            if (Array.isArray(albumData.artists) && albumData.artists.length > 0) {
                heroArtistEl.innerHTML = albumData.artists.map(art => {
                    const url = art.id ? `artist.html?id=${encodeURIComponent(art.id)}&name=${encodeURIComponent(art.name)}` : `artist.html?name=${encodeURIComponent(art.name)}`;
                    return `<a href="${url}" class="artist-link" style="color: var(--text-primary); text-decoration: none; font-weight: 700;">${art.name}</a>`;
                }).join(', ');
            } else {
                const artName = albumData.artistNames || 'Artist';
                heroArtistEl.innerHTML = `<a href="artist.html?name=${encodeURIComponent(artName)}" class="artist-link" style="color: var(--text-primary); text-decoration: none; font-weight: 700;">${artName}</a>`;
            }
        }

        const heroImgEl = document.getElementById('hero-img');
        if (heroImgEl) {
            heroImgEl.src = albumData.coverUrl || 'https://via.placeholder.com/300x300?text=Album';
        }

        const heroYearEl = document.getElementById('hero-year');
        if (heroYearEl) {
            heroYearEl.textContent = albumData.releaseYear || (albumData.releaseDate ? albumData.releaseDate.split('-')[0] : '');
        }

        // Prepare tracks
        allAlbumTracks = (albumData.tracks || []).map((t, idx) => ({
            ...t,
            album: {
                id: albumData.id,
                name: albumData.name,
                coverUrl: albumData.coverUrl,
                releaseYear: albumData.releaseYear
            },
            coverUrl: t.coverUrl || albumData.coverUrl,
            thumbnailUrl: t.thumbnailUrl || albumData.coverUrl,
            trackNumber: t.trackNumber || (idx + 1)
        }));

        filteredTracks = [...allAlbumTracks];

        const heroTrackCountEl = document.getElementById('hero-track-count');
        if (heroTrackCountEl) {
            heroTrackCountEl.textContent = `${allAlbumTracks.length} ${allAlbumTracks.length === 1 ? 'track' : 'tracks'}`;
        }

        const totalMs = allAlbumTracks.reduce((acc, t) => acc + (t.durationMs || 0), 0);
        const totalMins = Math.round(totalMs / 60000);
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        const durationText = hrs > 0 ? `${hrs} hr ${mins} min` : `${mins} min`;

        const heroDurationEl = document.getElementById('hero-duration');
        if (heroDurationEl) {
            heroDurationEl.textContent = totalMs > 0 ? durationText : '';
        }

        const spotifyUrl = getSpotifyUri(albumData, 'album');
        const spotifyLinkEl = document.getElementById('hero-spotify-link');
        if (spotifyLinkEl) {
            spotifyLinkEl.href = spotifyUrl;
            spotifyLinkEl.removeAttribute('target');
        }

        renderTracks();

        if (loadingEl) loadingEl.style.display = 'none';
        if (viewEl) viewEl.style.display = 'block';

        if (window.miniPlayer) {
            window.miniPlayer.onStateChange(({ isPlaying, currentTrackId }) => {
                currentPlayingId = isPlaying ? currentTrackId : null;
                renderTracks();
            });
        }

    } catch (e) {
        console.error('Error loading album details:', e);
        if (loadingEl) loadingEl.innerHTML = `<p style="color: #ff5555;">Error loading album: ${e.message}</p>`;
    }
}

function renderTracks() {
    const grid = document.getElementById('tracks-grid');
    const noTracks = document.getElementById('no-tracks');

    if (!grid) return;

    if (filteredTracks.length === 0) {
        grid.innerHTML = '';
        if (noTracks) noTracks.style.display = 'block';
        return;
    }

    if (noTracks) noTracks.style.display = 'none';
    grid.innerHTML = '';

    filteredTracks.forEach((track, index) => {
        const isPlaying = currentPlayingId === track.id;
        const isLiked = likedSongIdSet.has(track.id);
        const trackNumber = track.trackNumber || (index + 1);

        const card = document.createElement('div');
        card.className = `song-card ${isPlaying ? 'is-playing' : ''}`;

        const cover = track.coverUrl || albumData?.coverUrl || 'https://via.placeholder.com/300x300?text=Track';
        const trackUrl = getSpotifyUri(track, 'track');

        let artistsHtml = '';
        if (Array.isArray(track.artists) && track.artists.length > 0) {
            artistsHtml = track.artists.map(a => {
                const url = a.id ? `artist.html?id=${encodeURIComponent(a.id)}&name=${encodeURIComponent(a.name)}` : `artist.html?name=${encodeURIComponent(a.name)}`;
                return `<a href="${url}" class="artist-link">${a.name}</a>`;
            }).join(', ');
        } else {
            artistsHtml = `<span class="artist-link">${track.artistNames || albumData?.artistNames || 'Artist'}</span>`;
        }

        const durationFormatted = track.durationMs ? formatDuration(track.durationMs) : '';

        card.innerHTML = `
            <div class="track-number-col" style="font-weight: 700; color: var(--text-muted); font-size: 0.88rem; min-width: 24px; text-align: center; margin-right: 8px;">
                ${trackNumber}
            </div>
            <div class="cover-wrapper">
                <img src="${cover}" alt="${track.name}" class="cover-img" loading="lazy">
                <button class="play-btn-overlay" onclick="togglePlayPreview('${track.id}')" title="Play Track">
                    ▶
                </button>
            </div>
            <div class="song-details">
                <div class="song-title">
                    <a href="${trackUrl}" class="song-title-link">${track.name}</a>
                    ${isLiked ? '<span class="liked-heart-badge" title="Liked Song" style="margin-left: 6px; font-size: 0.9rem;">💚</span>' : ''}
                </div>
                <div class="song-artist">${artistsHtml}</div>
            </div>
            <div class="song-meta" style="display: flex; align-items: center; gap: 12px;">
                ${durationFormatted ? `<span class="track-duration" style="font-size: 0.85rem; color: var(--text-secondary);">${durationFormatted}</span>` : ''}
                <a href="${trackUrl}" class="spotify-icon-btn" title="Open in Spotify" aria-label="Open in Spotify">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                </a>
            </div>
        `;

        grid.appendChild(card);
    });
}

function playCurrentAlbum() {
    if (!albumData) return;
    if (window.miniPlayer) {
        window.miniPlayer.playItem(albumData, 'album');
    }
}

function togglePlayPreview(id) {
    const track = allAlbumTracks.find(t => t.id === id);
    if (!track) return;

    if (window.miniPlayer) {
        window.miniPlayer.currentType = 'album';
        window.miniPlayer.contextTitle = albumData ? albumData.name : 'Album';
        window.miniPlayer.playTrack(track, allAlbumTracks);
    }
}

function applyFilters() {
    const searchInput = document.getElementById('search-input');
    const query = (searchInput?.value || '').trim().toLowerCase();

    if (!query) {
        filteredTracks = [...allAlbumTracks];
    } else {
        filteredTracks = allAlbumTracks.filter(t => {
            const name = (t.name || '').toLowerCase();
            const artist = (t.artistNames || '').toLowerCase();
            return name.includes(query) || artist.includes(query);
        });
    }

    renderTracks();
}

function formatDuration(ms) {
    if (!ms || isNaN(ms)) return '';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function changeViewMode(mode) {
    currentViewMode = mode;
    const grid = document.getElementById('tracks-grid');
    if (!grid) return;

    grid.className = `music-grid view-${mode}`;
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

document.addEventListener('DOMContentLoaded', () => {
    initAlbumDetail();
});
