let allAlbums = [];
let filteredAlbums = [];
let currentSort = 'artist-asc';

async function initAlbums() {
    const loadingEl = document.getElementById('loading');
    const controlsEl = document.getElementById('controls');

    try {
        const albums = await getSavedAlbums();
        allAlbums = albums || [];
        filteredAlbums = [...allAlbums];

        loadThemePreference();
        sortAlbums(currentSort);

        loadingEl.style.display = 'none';
        controlsEl.style.display = 'flex';
    } catch (e) {
        console.error('Error loading albums:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Could not load albums. Run <code>npm run sync</code> first.</p>`;
    }
}

function sortAlbums(criteria) {
    currentSort = criteria;
    allAlbums.sort((a, b) => {
        switch (criteria) {
            case 'artist-asc': {
                const artistA = (a.artists?.[0]?.name || a.artistNames || '').toLowerCase();
                const artistB = (b.artists?.[0]?.name || b.artistNames || '').toLowerCase();
                const cmpArtist = artistA.localeCompare(artistB);
                if (cmpArtist !== 0) return cmpArtist;

                // Within same artist: sort by release date / year
                const yearA = parseInt(a.releaseYear) || 0;
                const yearB = parseInt(b.releaseYear) || 0;
                if (yearA !== yearB) return yearA - yearB;
                const dateA = a.releaseDate || '';
                const dateB = b.releaseDate || '';
                const cmpDate = dateA.localeCompare(dateB);
                if (cmpDate !== 0) return cmpDate;

                // Within same release date: sort by album name
                return (a.name || '').localeCompare(b.name || '');
            }
            case 'name-asc':
                return (a.name || '').localeCompare(b.name || '');
            case 'year-desc':
                return (parseInt(b.releaseYear) || 0) - (parseInt(a.releaseYear) || 0);
            case 'year-asc':
                return (parseInt(a.releaseYear) || 0) - (parseInt(b.releaseYear) || 0);
            default:
                return 0;
        }
    });
    filterAlbums();
}

function filterAlbums() {
    const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    filteredAlbums = allAlbums.filter(a => {
        if (!search) return true;
        const matchName = (a.name || '').toLowerCase().includes(search);
        const matchArtist = (a.artistNames || '').toLowerCase().includes(search);
        return matchName || matchArtist;
    });
    renderAlbums();
}

function renderAlbums() {
    const grid = document.getElementById('albums-grid');
    const noResults = document.getElementById('no-results');

    if (filteredAlbums.length === 0) {
        grid.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';
    grid.innerHTML = '';

    filteredAlbums.forEach(a => {
        const card = document.createElement('div');
        card.className = 'song-card';
        const cover = a.coverUrl || 'https://via.placeholder.com/300x300?text=Album';

        let artistsHtml = '';
        if (Array.isArray(a.artists) && a.artists.length > 0) {
            artistsHtml = a.artists.map(art => {
                const url = art.id
                    ? `artist.html?id=${encodeURIComponent(art.id)}&name=${encodeURIComponent(art.name)}`
                    : `artist.html?name=${encodeURIComponent(art.name)}`;
                return `<a href="${url}" class="artist-link">${art.name}</a>`;
            }).join(', ');
        } else {
            artistsHtml = `<span class="artist-link">${a.artistNames || 'Unknown Artist'}</span>`;
        }

        const albumUrl = a.spotifyUrl || (a.id ? `https://open.spotify.com/album/${a.id}` : '#');

        card.innerHTML = `
            <div class="cover-wrapper">
                <a href="${albumUrl}" target="_blank">
                    <img src="${cover}" alt="${a.name}" class="cover-img" loading="lazy">
                </a>
            </div>
            <div class="song-details">
                <div class="song-title">
                    <a href="${albumUrl}" target="_blank" class="song-title-link">${a.name}</a>
                </div>
                <div class="song-artist">${artistsHtml} <span class="album-year">${a.releaseYear ? `(${a.releaseYear})` : ''}</span></div>
            </div>
            <div class="song-meta">
                <span>${a.totalTracks || 0} tracks</span>
                <a href="${albumUrl}" target="_blank" class="spotify-icon-btn" title="Open in Spotify" aria-label="Open in Spotify">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                </a>
            </div>
        `;

        grid.appendChild(card);
    });
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

document.addEventListener('DOMContentLoaded', initAlbums);
