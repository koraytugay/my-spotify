let allArtists = [];
let filteredArtists = [];
let currentSort = 'name-asc';

async function initArtists() {
    const loadingEl = document.getElementById('loading');
    const controlsEl = document.getElementById('controls');

    try {
        let artists = await getFollowedArtists();

        // If no followed artists saved yet, fallback to top artists or liked artists
        if (!artists || artists.length === 0) {
            artists = await getTopArtists();
        }

        if (!artists || artists.length === 0) {
            const songs = await getLikedSongs();
            const artistMap = new Map();
            songs.forEach(s => {
                (s.artists || []).forEach(a => {
                    if (a.name && !artistMap.has(a.name)) {
                        artistMap.set(a.name, {
                            id: a.id,
                            name: a.name,
                            genres: [],
                            followers: 0,
                            popularity: 0,
                            imageUrl: s.coverUrl || s.thumbnailUrl || '',
                            spotifyUrl: a.id ? `https://open.spotify.com/artist/${a.id}` : `https://open.spotify.com/search/${encodeURIComponent(a.name)}`
                        });
                    }
                });
            });
            artists = Array.from(artistMap.values());
        }

        allArtists = artists || [];
        filteredArtists = [...allArtists];

        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            const toggle = document.getElementById('dark-mode-toggle');
            if (toggle) toggle.checked = true;
        }

        sortArtists(currentSort);

        loadingEl.style.display = 'none';
        controlsEl.style.display = 'flex';
    } catch (e) {
        console.error('Error loading artists:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Could not load artists: ${e.message}</p>`;
    }
}

function sortArtists(criteria) {
    currentSort = criteria;
    allArtists.sort((a, b) => {
        switch (criteria) {
            case 'name-asc':
                return (a.name || '').localeCompare(b.name || '');
            case 'popularity-desc':
                return (b.popularity || 0) - (a.popularity || 0);
            case 'followers-desc':
                return (b.followers || 0) - (a.followers || 0);
            default:
                return 0;
        }
    });
    filterArtists();
}

function filterArtists() {
    const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
    filteredArtists = allArtists.filter(a => {
        if (!search) return true;
        const matchName = (a.name || '').toLowerCase().includes(search);
        const matchGenre = (a.genres || []).some(g => g.toLowerCase().includes(search));
        return matchName || matchGenre;
    });
    renderArtists();
}

function renderArtists() {
    const grid = document.getElementById('artists-grid');
    const noResults = document.getElementById('no-results');

    if (filteredArtists.length === 0) {
        grid.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';
    grid.innerHTML = '';

    filteredArtists.forEach(art => {
        const card = document.createElement('div');
        card.className = 'song-card';
        card.style.cursor = 'pointer';
        const cover = art.imageUrl || 'https://via.placeholder.com/300x300?text=Artist';
        const artistPageUrl = `artist.html?id=${encodeURIComponent(art.id || '')}&name=${encodeURIComponent(art.name || '')}`;
        const genresText = (art.genres && art.genres.length > 0)
            ? art.genres.slice(0, 2).join(', ')
            : 'Artist';

        card.innerHTML = `
            <div class="cover-wrapper">
                <img src="${cover}" alt="${art.name}" class="cover-img" loading="lazy">
            </div>
            <div class="song-details">
                <div class="song-title">
                    <a href="${artistPageUrl}" class="song-title-link">${art.name}</a>
                </div>
                <div class="song-artist">${genresText}</div>
            </div>
            <div class="song-meta">
                <span>${art.followers ? art.followers.toLocaleString() + ' followers' : 'Followed'}</span>
            </div>
        `;

        card.onclick = (e) => {
            // Navigate to artist discography page unless specifically opening in new tab
            if (e.target.tagName !== 'A' || e.target.getAttribute('href') === artistPageUrl) {
                e.preventDefault();
                window.location.href = artistPageUrl;
            }
        };

        grid.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', initArtists);
