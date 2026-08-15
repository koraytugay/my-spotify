let allPlaylists = [];
let filteredPlaylists = [];
let currentSort = 'name-asc';

async function initPlaylists() {
    const loadingEl = document.getElementById('loading');
    const controlsEl = document.getElementById('controls');

    try {
        const playlists = await getPlaylists();
        allPlaylists = playlists || [];
        filteredPlaylists = [...allPlaylists];

        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') document.body.classList.add('dark-mode');

        sortPlaylists(currentSort);

        loadingEl.style.display = 'none';
        controlsEl.style.display = 'flex';
    } catch (e) {
        console.error('Error loading playlists:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Could not load playlists. Run <code>npm run sync</code> first.</p>`;
    }
}

function sortPlaylists(criteria) {
    currentSort = criteria;
    allPlaylists.sort((a, b) => {
        if (criteria === 'tracks-desc') return (b.tracksTotal || 0) - (a.tracksTotal || 0);
        if (criteria === 'name-asc') return (a.name || '').localeCompare(b.name || '');
        return 0;
    });
    filterPlaylists();
}

function filterPlaylists() {
    const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    filteredPlaylists = allPlaylists.filter(p => {
        if (!search) return true;
        const matchName = (p.name || '').toLowerCase().includes(search);
        const matchOwner = (p.owner || '').toLowerCase().includes(search);
        const matchDesc = (p.description || '').toLowerCase().includes(search);
        return matchName || matchOwner || matchDesc;
    });
    renderPlaylists();
}

function renderPlaylists() {
    const grid = document.getElementById('playlists-grid');
    const noResults = document.getElementById('no-results');

    if (filteredPlaylists.length === 0) {
        grid.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';
    grid.innerHTML = '';

    filteredPlaylists.forEach(p => {
        const card = document.createElement('div');
        card.className = 'song-card';
        const cover = p.coverUrl || 'https://via.placeholder.com/300x300?text=Playlist';
        const trackCount = p.tracks?.length || p.tracksTotal || 0;

        card.innerHTML = `
            <div class="cover-wrapper">
                <img src="${cover}" alt="${p.name}" class="cover-img" loading="lazy">
            </div>
            <div class="song-details">
                <div class="song-title">${p.name}</div>
                <div class="song-artist">By ${p.owner || 'Spotify'}</div>
            </div>
            <div class="song-meta">
                <span>${trackCount} tracks</span>
                ${p.owner === 'koraytugay' ? '<span class="badge" style="background: var(--accent-light); color: var(--accent);">Your Playlist</span>' : '<span class="badge">Followed</span>'}
            </div>
        `;

        card.onclick = () => {
            window.location.href = `playlist.html?id=${p.id}`;
        };

        grid.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', initPlaylists);
