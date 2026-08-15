let allAlbums = [];
let filteredAlbums = [];
let currentSort = 'name-asc';

async function initAlbums() {
    const loadingEl = document.getElementById('loading');
    const controlsEl = document.getElementById('controls');

    try {
        const albums = await getSavedAlbums();
        allAlbums = albums || [];
        filteredAlbums = [...allAlbums];

        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') document.body.classList.add('dark-mode');

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
        if (criteria === 'name-asc') return (a.name || '').localeCompare(b.name || '');
        if (criteria === 'artist-asc') return (a.artistNames || '').localeCompare(b.artistNames || '');
        if (criteria === 'year-desc') return (parseInt(b.releaseYear) || 0) - (parseInt(a.releaseYear) || 0);
        if (criteria === 'year-asc') return (parseInt(a.releaseYear) || 0) - (parseInt(b.releaseYear) || 0);
        return 0;
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

        card.innerHTML = `
            <div class="cover-wrapper">
                <img src="${cover}" alt="${a.name}" class="cover-img" loading="lazy">
            </div>
            <div class="song-details">
                <div class="song-title">${a.name}</div>
                <div class="song-artist">${a.artistNames}</div>
            </div>
            <div class="song-meta">
                <span>${a.releaseYear || ''}</span>
                <span>${a.totalTracks || 0} tracks</span>
            </div>
        `;

        card.onclick = () => {
            if (a.spotifyUrl) window.open(a.spotifyUrl, '_blank');
        };

        grid.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', initAlbums);
