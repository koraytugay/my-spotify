let artistInfo = null;
let allArtistAlbums = [];
let filteredAlbums = [];
let currentSort = 'year-asc';

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
            (artistName && a.name && a.name.toLowerCase() === artistName.toLowerCase())
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

        const canonicalName = artistInfo.name.toLowerCase();

        // Helper to check if artist is in artist array or string
        const isMatchingArtist = (artistsArr, artistNamesStr) => {
            if (artistId && Array.isArray(artistsArr) && artistsArr.some(a => a.id === artistId)) return true;
            if (Array.isArray(artistsArr) && artistsArr.some(a => a.name && a.name.toLowerCase() === canonicalName)) return true;
            if (artistNamesStr && artistNamesStr.toLowerCase().includes(canonicalName)) return true;
            return false;
        };

        // 1. Gather albums from Saved Albums
        const albumMap = new Map();

        (savedAlbums || []).forEach(a => {
            if (isMatchingArtist(a.artists, a.artistNames)) {
                const key = a.id || a.name.toLowerCase();
                albumMap.set(key, {
                    id: a.id,
                    name: a.name,
                    artists: a.artists,
                    artistNames: a.artistNames || artistInfo.name,
                    coverUrl: a.coverUrl,
                    releaseYear: a.releaseYear,
                    releaseDate: a.releaseDate,
                    totalTracks: a.totalTracks || 0,
                    spotifyUrl: a.spotifyUrl,
                    source: 'saved_album'
                });
            }
        });

        // 2. Gather additional albums from Liked Songs
        let likedTrackCount = 0;
        (likedSongs || []).forEach(s => {
            if (isMatchingArtist(s.artists, s.artistNames)) {
                likedTrackCount++;
                if (s.album && s.album.name) {
                    const key = s.album.id || s.album.name.toLowerCase();
                    if (!albumMap.has(key)) {
                        albumMap.set(key, {
                            id: s.album.id,
                            name: s.album.name,
                            artists: s.artists,
                            artistNames: s.artistNames || artistInfo.name,
                            coverUrl: s.album.coverUrl || s.coverUrl,
                            releaseYear: s.album.releaseYear,
                            releaseDate: s.album.releaseDate,
                            totalTracks: s.album.totalTracks || 0,
                            spotifyUrl: s.album.id ? `https://open.spotify.com/album/${s.album.id}` : `https://open.spotify.com/search/${encodeURIComponent(s.album.name)}`,
                            source: 'liked_songs'
                        });
                    }
                }
            }
        });

        allArtistAlbums = Array.from(albumMap.values());
        filteredAlbums = [...allArtistAlbums];

        // If artist avatar is missing, use first available album cover
        if (!artistInfo.imageUrl && allArtistAlbums.length > 0) {
            artistInfo.imageUrl = allArtistAlbums[0].coverUrl;
        }

        // Apply theme
        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') document.body.classList.add('dark-mode');

        // Populate Hero Header
        document.getElementById('page-heading').textContent = artistInfo.name;
        document.getElementById('hero-title').textContent = artistInfo.name;
        document.getElementById('hero-img').src = artistInfo.imageUrl || 'https://via.placeholder.com/300x300?text=Artist';
        
        const genresText = (artistInfo.genres && artistInfo.genres.length > 0) 
            ? artistInfo.genres.join(' · ') 
            : 'Artist';
        document.getElementById('hero-genres').textContent = genresText;

        document.getElementById('hero-album-count').textContent = `${allArtistAlbums.length} ${allArtistAlbums.length === 1 ? 'album' : 'albums'}`;
        document.getElementById('hero-track-count').textContent = `${likedTrackCount} liked ${likedTrackCount === 1 ? 'song' : 'songs'}`;

        const spotifyUrl = artistInfo.spotifyUrl || (artistInfo.id ? `https://open.spotify.com/artist/${artistInfo.id}` : `https://open.spotify.com/search/${encodeURIComponent(artistInfo.name)}`);
        document.getElementById('hero-spotify-link').href = spotifyUrl;

        sortAlbums(currentSort);

        loadingEl.style.display = 'none';
        viewEl.style.display = 'block';

    } catch (e) {
        console.error('Error loading artist details:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Error loading artist discography: ${e.message}</p>`;
    }
}

function sortAlbums(criteria) {
    currentSort = criteria;
    allArtistAlbums.sort((a, b) => {
        switch (criteria) {
            case 'year-asc': {
                const yearA = parseInt(a.releaseYear) || 0;
                const yearB = parseInt(b.releaseYear) || 0;
                if (yearA !== yearB) return yearA - yearB;
                const dateA = a.releaseDate || '';
                const dateB = b.releaseDate || '';
                const cmpDate = dateA.localeCompare(dateB);
                if (cmpDate !== 0) return cmpDate;
                return (a.name || '').localeCompare(b.name || '');
            }
            case 'year-desc': {
                const yearA = parseInt(a.releaseYear) || 0;
                const yearB = parseInt(b.releaseYear) || 0;
                if (yearA !== yearB) return yearB - yearA;
                const dateA = a.releaseDate || '';
                const dateB = b.releaseDate || '';
                return dateB.localeCompare(dateA);
            }
            case 'name-asc':
                return (a.name || '').localeCompare(b.name || '');
            default:
                return 0;
        }
    });
    filterArtistContent();
}

function filterArtistContent() {
    const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    filteredAlbums = allArtistAlbums.filter(a => {
        if (!search) return true;
        const matchName = (a.name || '').toLowerCase().includes(search);
        const matchYear = (a.releaseYear || '').toString().includes(search);
        return matchName || matchYear;
    });
    renderArtistAlbums();
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
        const artistName = artistInfo ? artistInfo.name : (a.artistNames || 'Artist');
        const releaseYear = a.releaseYear ? ` (${a.releaseYear})` : '';

        card.innerHTML = `
            <div class="cover-wrapper">
                <img src="${cover}" alt="${a.name}" class="cover-img" loading="lazy">
            </div>
            <div class="song-details">
                <div class="song-title">
                    <a href="${albumUrl}" target="_blank" class="song-title-link">${a.name}</a>
                </div>
                <div class="song-artist">${artistName}<span class="album-year">${releaseYear}</span></div>
            </div>
            <div class="song-meta">
                ${a.totalTracks ? `<span>${a.totalTracks} tracks</span>` : ''}
            </div>
        `;

        grid.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', initArtistDetail);
