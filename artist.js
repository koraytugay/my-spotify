// Artist Detail View - Pure Authentic Personal Spotify Archive
let artistInfo = null;
let allArtistAlbums = [];
let filteredAlbums = [];
let allArtistSongs = [];
let filteredSongs = [];
let currentSort = 'year-asc';

let currentAudio = null;
let currentPlayingId = null;

async function initArtistDetail() {
    const loadingEl = document.getElementById('loading');
    const viewEl = document.getElementById('artist-view');

    const params = new URLSearchParams(window.location.search);
    const artistId = params.get('id') || '';
    const artistName = params.get('name') || '';

    if (!artistId && !artistName) {
        loadingEl.innerHTML = `<p style="color: #ff5555;">No artist specified. <a href="artists.html">Back to Artists</a></p>`;
        return;
    }

    try {
        const [followedArtists, topArtists, savedAlbums, likedSongs] = await Promise.all([
            getFollowedArtists(),
            getTopArtists(),
            getSavedAlbums(),
            getLikedSongs()
        ]);

        const allArtistsList = [...followedArtists, ...topArtists];
        
        // Find artist profile
        let matchedArtist = allArtistsList.find(a => 
            (artistId && a.id === artistId) || 
            (artistName && a.name && a.name.toLowerCase().trim() === artistName.toLowerCase().trim())
        );

        if (!matchedArtist) {
            matchedArtist = {
                id: artistId,
                name: artistName || 'Artist',
                genres: [],
                imageUrl: '',
                spotifyUrl: artistId ? `https://open.spotify.com/artist/${artistId}` : `https://open.spotify.com/search/${encodeURIComponent(artistName)}`
            };
        }

        artistInfo = matchedArtist;
        const canonicalName = (artistInfo.name || '').toLowerCase().trim();

        // Exact artist matching to avoid false positive substring bleed
        const isMatchingArtist = (artistsArr, artistNamesStr) => {
            if (artistId && Array.isArray(artistsArr) && artistsArr.some(a => a.id === artistId)) return true;
            if (Array.isArray(artistsArr) && artistsArr.some(a => a.name && a.name.toLowerCase().trim() === canonicalName)) return true;
            if (artistNamesStr) {
                const names = artistNamesStr.toLowerCase().split(/,\s*|\s*&\s*|\s*feat\.?\s*/);
                if (names.some(n => n.trim() === canonicalName)) return true;
            }
            return false;
        };

        const albumMap = new Map();

        // 1. Gather ONLY Saved Albums from Spotify Library
        (savedAlbums || []).forEach(a => {
            if (isMatchingArtist(a.artists, a.artistNames)) {
                const normName = (a.name || '').toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
                const key = a.id || normName;
                if (!albumMap.has(key)) {
                    albumMap.set(key, {
                        id: a.id,
                        name: a.name,
                        artistNames: a.artistNames || artistInfo.name,
                        coverUrl: a.coverUrl,
                        releaseYear: a.releaseYear,
                        releaseDate: a.releaseDate || (a.releaseYear ? `${a.releaseYear}-01-01` : ''),
                        totalTracks: a.totalTracks || 0,
                        spotifyUrl: a.spotifyUrl || `https://open.spotify.com/album/${a.id}`,
                        isSaved: true
                    });
                }
            }
        });

        // 2. Gather Liked Songs by this artist
        allArtistSongs = (likedSongs || []).filter(s => isMatchingArtist(s.artists, s.artistNames));

        allArtistAlbums = Array.from(albumMap.values());
        filteredAlbums = [...allArtistAlbums];
        filteredSongs = [...allArtistSongs];

        // If artist avatar is missing, use first available album cover
        if (!artistInfo.imageUrl && allArtistAlbums.length > 0) {
            artistInfo.imageUrl = allArtistAlbums[0].coverUrl;
        }

        // Apply theme
        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') document.body.classList.add('dark-mode');

        // Populate Hero Header
        const pageHeadingEl = document.getElementById('page-heading');
        if (pageHeadingEl) pageHeadingEl.textContent = artistInfo.name;

        const spotifyUrl = artistInfo.spotifyUrl || (artistInfo.id ? `https://open.spotify.com/artist/${artistInfo.id}` : `https://open.spotify.com/search/${encodeURIComponent(artistInfo.name)}`);

        const heroTitleEl = document.getElementById('hero-title');
        if (heroTitleEl) heroTitleEl.textContent = artistInfo.name;

        const heroImgEl = document.getElementById('hero-img');
        if (heroImgEl) heroImgEl.src = artistInfo.imageUrl || 'https://via.placeholder.com/300x300?text=Artist';
        
        const genresText = (artistInfo.genres && artistInfo.genres.length > 0) 
            ? artistInfo.genres.join(' · ') 
            : 'Artist';
        const heroGenresEl = document.getElementById('hero-genres');
        if (heroGenresEl) heroGenresEl.textContent = genresText;

        document.getElementById('hero-album-count').textContent = `${allArtistAlbums.length} saved ${allArtistAlbums.length === 1 ? 'album' : 'albums'}`;
        document.getElementById('hero-track-count').textContent = `${allArtistSongs.length} liked ${allArtistSongs.length === 1 ? 'song' : 'songs'}`;

        document.getElementById('hero-spotify-link').href = spotifyUrl;

        // Default sort chronologically (Oldest to Newest)
        allArtistAlbums.sort((a, b) => {
            const yearA = parseInt(a.releaseYear) || 0;
            const yearB = parseInt(b.releaseYear) || 0;
            if (yearA !== yearB) return yearA - yearB;
            const dateA = a.releaseDate || '';
            const dateB = b.releaseDate || '';
            const cmpDate = dateA.localeCompare(dateB);
            if (cmpDate !== 0) return cmpDate;
            return (a.name || '').localeCompare(b.name || '');
        });

        allArtistSongs.sort((a, b) => {
            const yearA = parseInt(a.album?.releaseYear) || 0;
            const yearB = parseInt(b.album?.releaseYear) || 0;
            if (yearA !== yearB) return yearA - yearB;
            const dateA = a.album?.releaseDate || '';
            const dateB = b.album?.releaseDate || '';
            const cmpDate = dateA.localeCompare(dateB);
            if (cmpDate !== 0) return cmpDate;
            return (a.name || '').localeCompare(b.name || '');
        });

        filteredAlbums = [...allArtistAlbums];
        filteredSongs = [...allArtistSongs];

        renderArtistAlbums();
        renderArtistSongs();

        loadingEl.style.display = 'none';
        viewEl.style.display = 'block';

    } catch (e) {
        console.error('Error loading artist details:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Error loading artist content: ${e.message}</p>`;
    }
}

function renderArtistAlbums() {
    const grid = document.getElementById('albums-grid');
    const noAlbums = document.getElementById('no-albums');
    const countBadge = document.getElementById('albums-count-badge');

    if (countBadge) countBadge.textContent = filteredAlbums.length;

    if (filteredAlbums.length === 0) {
        grid.innerHTML = '';
        noAlbums.style.display = 'block';
        return;
    }

    noAlbums.style.display = 'none';
    grid.innerHTML = '';

    filteredAlbums.forEach(a => {
        const card = document.createElement('div');
        card.className = 'song-card';
        const cover = a.coverUrl || 'https://via.placeholder.com/300x300?text=Album';
        const albumUrl = a.spotifyUrl || (a.id ? `https://open.spotify.com/album/${a.id}` : '#');
        const releaseYear = a.releaseYear ? ` (${a.releaseYear})` : '';

        let artistsHtml = '';
        if (Array.isArray(a.artists) && a.artists.length > 0) {
            artistsHtml = a.artists.map(art => {
                const url = art.id ? `https://open.spotify.com/artist/${art.id}` : `https://open.spotify.com/search/${encodeURIComponent(art.name)}`;
                return `<a href="${url}" target="_blank" class="artist-link">${art.name}</a>`;
            }).join(', ');
        } else {
            const artUrl = artistInfo?.spotifyUrl || (artistInfo?.id ? `https://open.spotify.com/artist/${artistInfo.id}` : `https://open.spotify.com/search/${encodeURIComponent(artistInfo?.name || a.artistNames || 'Artist')}`);
            const artName = artistInfo ? artistInfo.name : (a.artistNames || 'Artist');
            artistsHtml = `<a href="${artUrl}" target="_blank" class="artist-link">${artName}</a>`;
        }

        card.innerHTML = `
            <div class="cover-wrapper">
                <a href="${albumUrl}" target="_blank">
                    <img src="${cover}" alt="${a.name}" class="cover-img" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/300x300?text=Album';">
                </a>
            </div>
            <div class="song-details">
                <div class="song-title">
                    <a href="${albumUrl}" target="_blank" class="song-title-link">${a.name}</a>
                </div>
                <div class="song-artist">${artistsHtml}<span class="album-year">${releaseYear}</span></div>
            </div>
            <div class="song-meta">
                ${a.totalTracks ? `<span>${a.totalTracks} tracks</span>` : '<span>Album</span>'}
            </div>
        `;

        grid.appendChild(card);
    });
}

function renderArtistSongs() {
    const grid = document.getElementById('songs-grid');
    const noSongs = document.getElementById('no-songs');
    const countBadge = document.getElementById('songs-count-badge');

    if (countBadge) countBadge.textContent = filteredSongs.length;

    if (filteredSongs.length === 0) {
        grid.innerHTML = '';
        noSongs.style.display = 'block';
        return;
    }

    noSongs.style.display = 'none';
    grid.innerHTML = '';

    filteredSongs.forEach(song => {
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
                    <img src="${cover}" alt="${song.name}" class="cover-img" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/300x300?text=No+Cover';">
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

        grid.appendChild(card);
    });
}

function togglePlayPreview(id, previewUrl) {
    if (currentPlayingId === id && currentAudio) {
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
        currentAudio = new Audio(previewUrl);
        currentPlayingId = id;
        currentAudio.play();

        currentAudio.onended = () => {
            currentPlayingId = null;
            renderArtistSongs();
        };
    }
    renderArtistSongs();
}

document.addEventListener('DOMContentLoaded', initArtistDetail);
