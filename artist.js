// Artist Detail View - Pure Authentic Personal Spotify Archive
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

        // 2. Count Liked Songs by this artist for hero metrics
        let likedTrackCount = 0;
        (likedSongs || []).forEach(s => {
            if (isMatchingArtist(s.artists, s.artistNames)) {
                likedTrackCount++;
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
        document.getElementById('hero-track-count').textContent = `${likedTrackCount} liked ${likedTrackCount === 1 ? 'song' : 'songs'}`;

        document.getElementById('hero-spotify-link').href = spotifyUrl;

        sortAlbums(currentSort);

        loadingEl.style.display = 'none';
        viewEl.style.display = 'block';

    } catch (e) {
        console.error('Error loading artist details:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Error loading artist albums: ${e.message}</p>`;
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
        if (search) {
            const matchName = (a.name || '').toLowerCase().includes(search);
            const matchYear = (a.releaseYear || '').toString().includes(search);
            if (!matchName && !matchYear) return false;
        }
        return true;
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

document.addEventListener('DOMContentLoaded', initArtistDetail);
