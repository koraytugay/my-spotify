// Album Detail View - Authentic Personal Spotify Archive
var albumData = null;
var allAlbumTracks = [];
var filteredTracks = [];
var currentViewMode = 'list';
var currentPlayingId = null;
var likedSongIdSet = new Set();
var likedSongKeySet = new Set();

function getTrackKey(track) {
    if (!track) return '';
    if (typeof getTrackDeduplicationKey === 'function') {
        const k = getTrackDeduplicationKey(track);
        if (k) return k;
    }
    const name = (track.name || '')
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
    const artist = (track.artistNames || (track.artists && track.artists[0]?.name) || (albumData ? albumData.artistNames || (albumData.artists && albumData.artists[0]?.name) : '') || '')
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
    return `${name}:::${artist}`;
}

function isSongLiked(track) {
    if (!track) return false;
    if (track.id && likedSongIdSet.has(track.id)) return true;
    const key = getTrackKey(track);
    if (key && likedSongKeySet.has(key)) return true;
    return false;
}

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

        // Build set of liked song IDs and normalized track keys
        if (Array.isArray(likedSongs)) {
            likedSongs.forEach(s => {
                if (s) {
                    if (s.id) likedSongIdSet.add(s.id);
                    const k = getTrackKey(s);
                    if (k) likedSongKeySet.add(k);
                }
            });
        }

        // Find matching album
        let matchedAlbum = (savedAlbums || []).find(a => 
            (albumId && a.id === albumId) ||
            (albumName && a.name && a.name.toLowerCase().trim() === albumName.toLowerCase().trim())
        );

        // Fallback: If not in Saved Albums, search Liked Songs for matching album tracks
        if (!matchedAlbum && Array.isArray(likedSongs)) {
            const matchingSongs = likedSongs.filter(s => 
                (albumId && s.album?.id === albumId) ||
                (albumName && s.album?.name && s.album.name.toLowerCase().trim() === albumName.toLowerCase().trim())
            );

            if (matchingSongs.length > 0) {
                const sample = matchingSongs[0];
                matchedAlbum = {
                    id: sample.album?.id || albumId,
                    name: sample.album?.name || albumName,
                    artistNames: sample.artistNames || (sample.artists && sample.artists[0]?.name) || 'Artist',
                    coverUrl: sample.coverUrl || sample.album?.coverUrl || '',
                    releaseYear: sample.album?.releaseYear || sample.releaseYear || '',
                    totalTracks: matchingSongs.length,
                    tracks: matchingSongs.map((s, idx) => ({
                        ...s,
                        trackNumber: s.trackNumber || (idx + 1)
                    }))
                };
            }
        }

        if (!matchedAlbum) {
            if (loadingEl) loadingEl.innerHTML = `<p style="color: #ff5555;">Album not found in your collection.</p>`;
            return;
        }

        albumData = matchedAlbum;

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

    } catch (e) {
        console.error('Error loading album details:', e);
        if (loadingEl) loadingEl.innerHTML = `<p style="color: #ff5555;">Error loading album: ${e.message}</p>`;
    }
}

function renderTracks() {
    const listContainer = document.getElementById('tracks-list-container');
    const noTracks = document.getElementById('no-tracks');

    if (!listContainer) return;

    if (filteredTracks.length === 0) {
        listContainer.innerHTML = '';
        if (noTracks) noTracks.style.display = 'block';
        return;
    }

    if (noTracks) noTracks.style.display = 'none';
    listContainer.innerHTML = '';

    filteredTracks.forEach((track, index) => {
        const isLiked = isSongLiked(track);
        const trackNumber = track.trackNumber || (index + 1);

        const row = document.createElement('div');
        row.className = 'album-track-row';
        row.onclick = (e) => {
            if (e.target.closest('a')) return;
            togglePlayPreview(track.id);
        };

        const trackUrl = getSpotifyUri(track, 'track');

        let featuredArtistsHtml = '';
        if (Array.isArray(track.artists) && track.artists.length > 1) {
            const extraArtists = track.artists.slice(1);
            featuredArtistsHtml = `<span class="album-track-feat">feat. ${extraArtists.map(a => a.name).join(', ')}</span>`;
        }

        const durationFormatted = track.durationMs ? formatDuration(track.durationMs) : '';

        row.innerHTML = `
            <div class="album-track-col-num">
                <span class="album-track-num-text">${trackNumber}</span>
                <button class="album-track-play-btn" title="Play Track" onclick="event.stopPropagation(); togglePlayPreview('${track.id}')">
                    ▶
                </button>
            </div>
            <div class="album-track-col-main">
                <div class="album-track-title-wrap">
                    <span class="album-track-title">${track.name}</span>
                    ${featuredArtistsHtml}
                </div>
            </div>
            <div class="album-track-col-liked">
                <button type="button" class="album-track-like-btn ${isLiked ? '' : 'not-liked'}" title="${isLiked ? 'Liked on Spotify (Click to Unlike)' : 'Click to Like on Spotify'}" onclick="event.stopPropagation(); toggleLikeTrackInAlbum('${track.id}')">
                    ${isLiked ? '💚' : '🩶'}
                </button>
            </div>
            <div class="album-track-col-dur">
                ${durationFormatted}
            </div>
        `;

        listContainer.appendChild(row);
    });
}

async function toggleLikeTrackInAlbum(id) {
    const track = (allAlbumTracks || []).find(t => t.id === id);
    if (!track) return;

    if (window.miniPlayer) {
        const nextLiked = await window.miniPlayer.toggleLikeTrack(track);
        const k = getTrackKey(track);
        if (nextLiked) {
            if (track.id) likedSongIdSet.add(track.id);
            if (k) likedSongKeySet.add(k);
        } else {
            if (track.id) likedSongIdSet.delete(track.id);
            if (k) likedSongKeySet.delete(k);
        }
        renderTracks();
    }
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAlbumDetail);
} else {
    initAlbumDetail();
}
