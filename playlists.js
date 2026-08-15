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

        loadThemePreference();
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
        const playlistUrl = `playlist.html?id=${encodeURIComponent(p.id)}`;
        const spotifyUrl = p.spotifyUrl || (p.id ? `https://open.spotify.com/playlist/${p.id}` : '#');

        card.innerHTML = `
            <div class="cover-wrapper">
                <a href="${playlistUrl}">
                    <img src="${cover}" alt="${p.name}" class="cover-img" loading="lazy">
                </a>
            </div>
            <div class="song-details">
                <div class="song-title">
                    <a href="${playlistUrl}" class="song-title-link">${p.name}</a>
                </div>
                <div class="song-artist">By ${p.owner || 'Spotify'}</div>
            </div>
            <div class="song-meta">
                <span>${trackCount} tracks</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${p.owner === 'koraytugay' ? '<span class="badge" style="background: var(--accent-light); color: var(--accent);">Your Playlist</span>' : '<span class="badge">Followed</span>'}
                    <a href="${spotifyUrl}" target="_blank" class="spotify-icon-btn" title="Open in Spotify" aria-label="Open in Spotify">
                        <svg viewBox="0 0 24 24">
                            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                        </svg>
                    </a>
                </div>
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

document.addEventListener('DOMContentLoaded', initPlaylists);
