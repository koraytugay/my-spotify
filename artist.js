// Artist Detail View - Pure Authentic Personal Spotify Archive
var artistInfo = null;
var allArtistAlbums = [];
var filteredAlbums = [];
var allArtistSongs = [];
var filteredSongs = [];
var currentAudio = null;
var currentPlayingId = null;

async function initArtistDetail() {
    const loadingEl = document.getElementById('loading');
    const viewEl = document.getElementById('artist-view');

    const params = new URLSearchParams(window.location.search);
    const artistId = params.get('id') || '';
    const artistName = params.get('name') || '';

    if (!artistId && !artistName) {
        loadingEl.innerHTML = `<p style="color: #ff5555;">No artist specified.</p>`;
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

        allArtistSongs = (likedSongs || []).filter(s => isMatchingArtist(s.artists, s.artistNames));

        allArtistAlbums = Array.from(albumMap.values());
        filteredAlbums = [...allArtistAlbums];
        filteredSongs = [...allArtistSongs];

        if (!artistInfo.imageUrl && allArtistAlbums.length > 0) {
            artistInfo.imageUrl = allArtistAlbums[0].coverUrl;
        }

        loadThemePreference();

        // Populate Hero Header
        const spotifyUrl = getSpotifyUri(artistInfo, 'artist');

        const heroTitleEl = document.getElementById('hero-title');
        if (heroTitleEl) heroTitleEl.textContent = artistInfo.name;

        const heroImgEl = document.getElementById('hero-img');
        if (heroImgEl) heroImgEl.src = artistInfo.imageUrl || 'https://via.placeholder.com/300x300?text=Artist';
        
        const genresText = (artistInfo.genres && artistInfo.genres.length > 0) 
            ? artistInfo.genres.join(' · ') 
            : '';
        const heroGenresEl = document.getElementById('hero-genres');
        if (heroGenresEl) heroGenresEl.textContent = genresText;

        document.getElementById('hero-album-count').textContent = `${allArtistAlbums.length} saved ${allArtistAlbums.length === 1 ? 'album' : 'albums'}`;
        document.getElementById('hero-track-count').textContent = `${allArtistSongs.length} liked ${allArtistSongs.length === 1 ? 'song' : 'songs'}`;

        if (window.miniPlayer) {
            window.miniPlayer.onStateChange(({ isPlaying, currentTrackId }) => {
                currentPlayingId = isPlaying ? currentTrackId : null;
                renderArtistSongs();
            });
        }

        const heroLinkEl = document.getElementById('hero-spotify-link');
        if (heroLinkEl) {
            heroLinkEl.href = spotifyUrl;
            heroLinkEl.removeAttribute('target');
        }

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
        const albumUrl = getSpotifyUri(a, 'album');
        const releaseYear = a.releaseYear ? ` (${a.releaseYear})` : '';

        let artistsHtml = '';
        if (Array.isArray(a.artists) && a.artists.length > 0) {
            artistsHtml = a.artists.map(art => {
                const url = art.id ? `artist.html?id=${encodeURIComponent(art.id)}&name=${encodeURIComponent(art.name)}` : `artist.html?name=${encodeURIComponent(art.name)}`;
                return `<a href="${url}" class="artist-link">${art.name}</a>`;
            }).join(', ');
        } else {
            const artName = artistInfo ? artistInfo.name : (a.artistNames || 'Artist');
            artistsHtml = `<span class="artist-link">${artName}</span>`;
        }

        card.innerHTML = `
            <div class="cover-wrapper">
                <img src="${cover}" alt="${a.name}" class="cover-img" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/300x300?text=Album';">
                <button class="play-btn-overlay" onclick="togglePlayAlbum('${a.id}')" title="Play Album">
                    ▶
                </button>
            </div>
            <div class="song-details">
                <div class="song-title">
                    <a href="album.html?id=${encodeURIComponent(a.id)}" class="song-title-link">${a.name}</a>
                </div>
                <div class="song-artist">${artistsHtml}<span class="album-year">${releaseYear}</span></div>
            </div>
            <div class="song-meta">
                ${a.totalTracks ? `<span>${a.totalTracks} tracks</span>` : '<span>Album</span>'}
                <a href="${albumUrl}" class="spotify-icon-btn" title="Open in Spotify" aria-label="Open in Spotify">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                </a>
            </div>
        `;

        grid.appendChild(card);
    });
}

function togglePlayAlbum(id) {
    if (window.miniPlayer) {
        const album = (filteredAlbums || []).find(a => a.id === id) || (allArtistAlbums || []).find(a => a.id === id) || { id };
        window.miniPlayer.playItem(album, 'album');
    }
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
        const isPlaying = currentPlayingId === song.id;
        card.className = `song-card ${isPlaying ? 'is-playing' : ''}`;

        const cover = song.coverUrl || song.thumbnailUrl || 'https://via.placeholder.com/300x300?text=No+Cover';

        // Build artist link(s)
        let artistsHtml = '';
        if (Array.isArray(song.artists) && song.artists.length > 0) {
            artistsHtml = song.artists.map(a => {
                const url = a.id ? `artist.html?id=${encodeURIComponent(a.id)}&name=${encodeURIComponent(a.name)}` : `artist.html?name=${encodeURIComponent(a.name)}`;
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
            const albumUrl = song.album?.id ? `album.html?id=${encodeURIComponent(song.album.id)}` : `https://open.spotify.com/search/${encodeURIComponent(albumName)}`;
            albumHtml = ` · <a href="${albumUrl}" class="album-link">${albumName}</a><span class="album-year">${releaseYear}</span>`;
        } else if (releaseYear) {
            albumHtml = ` · <span class="album-year">${releaseYear}</span>`;
        }

        // Track link
        const trackUrl = getSpotifyUri(song, 'track');

        card.innerHTML = `
            <div class="cover-wrapper">
                <a href="${trackUrl}">
                    <img src="${cover}" alt="${song.name}" class="cover-img" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/300x300?text=No+Cover';">
                </a>
                <button class="play-btn-overlay" onclick="togglePlayPreview('${song.id}', '${song.previewUrl || ''}')" title="${isPlaying ? 'Pause' : 'Play'}">
                    ${isPlaying ? '⏸' : '▶'}
                </button>
            </div>
            <div class="song-details">
                <div class="song-title">
                    <a href="${trackUrl}" class="song-title-link">${song.name}</a>
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

        grid.appendChild(card);
    });
}

function togglePlayPreview(id, previewUrl) {
    if (window.miniPlayer) {
        const song = (allArtistSongs || []).find(s => s.id === id) || { id, previewUrl };
        window.miniPlayer.toggleTrack(song, allArtistSongs);
        return;
    }

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

document.addEventListener('DOMContentLoaded', initArtistDetail);
