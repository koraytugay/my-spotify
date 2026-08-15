async function initTimeline() {
    const loadingEl = document.getElementById('loading');
    const container = document.getElementById('timeline-container');

    try {
        const songs = await getLikedSongs();
        if (!songs || songs.length === 0) {
            loadingEl.innerHTML = `<p style="color: #ff5555;">No tracks found. Run <code>npm run sync</code> first.</p>`;
            return;
        }

        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') document.body.classList.add('dark-mode');

        // Group tracks by Month Year (e.g. August 2026)
        const groups = {};
        songs.forEach(song => {
            if (!song.addedAt) return;
            const date = new Date(song.addedAt);
            const key = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            const sortKey = song.addedAt.substring(0, 7);
            if (!groups[sortKey]) {
                groups[sortKey] = { label: key, songs: [] };
            }
            groups[sortKey].songs.push(song);
        });

        // Sort descending by month
        const sortedMonthKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

        container.innerHTML = '';
        sortedMonthKeys.forEach(key => {
            const group = groups[key];
            const section = document.createElement('div');
            section.className = 'timeline-section';

            const header = document.createElement('div');
            header.className = 'timeline-header';
            header.innerHTML = `
                <span>${group.label}</span>
                <span class="timeline-count">${group.songs.length} tracks added</span>
            `;
            section.appendChild(header);

            const grid = document.createElement('div');
            grid.className = 'music-grid view-compact';

            group.songs.slice(0, 24).forEach(song => {
                const card = document.createElement('div');
                card.className = 'song-card';
                const cover = song.coverUrl || song.thumbnailUrl || 'https://via.placeholder.com/300x300?text=No+Cover';
                
                card.innerHTML = `
                    <div class="cover-wrapper">
                        <img src="${cover}" alt="${song.name}" class="cover-img" loading="lazy">
                    </div>
                    <div class="song-details">
                        <div class="song-title">${song.name}</div>
                        <div class="song-artist">${song.artistNames}</div>
                    </div>
                `;

                card.onclick = () => {
                    if (song.spotifyUrl) window.open(song.spotifyUrl, '_blank');
                };

                grid.appendChild(card);
            });

            if (group.songs.length > 24) {
                const moreNote = document.createElement('div');
                moreNote.style.padding = '8px';
                moreNote.style.color = 'var(--text-muted)';
                moreNote.style.fontSize = '0.8rem';
                moreNote.textContent = `+ ${group.songs.length - 24} more tracks in ${group.label}`;
                grid.appendChild(moreNote);
            }

            section.appendChild(grid);
            container.appendChild(section);
        });

        loadingEl.style.display = 'none';

    } catch (e) {
        console.error('Error in timeline:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Error loading timeline: ${e.message}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', initTimeline);
