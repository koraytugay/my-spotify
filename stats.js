async function initStats() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('stats-content');
    const controlsEl = document.getElementById('controls');

    try {
        const stats = await getStats();
        if (!stats) {
            loadingEl.innerHTML = `<p style="color: #ff5555;">No stats found. Run <code>npm run sync</code> to generate statistics.</p>`;
            return;
        }

        loadThemePreference();

        // Top Metrics
        document.getElementById('stat-total-songs').textContent = (stats.totalLikedSongs || 0).toLocaleString();
        document.getElementById('stat-playtime').textContent = stats.totalDurationFormatted || `${stats.totalDurationHours} hrs`;
        document.getElementById('stat-artists').textContent = (stats.uniqueArtistsCount || 0).toLocaleString();
        document.getElementById('stat-playlists').textContent = (stats.totalPlaylists || 0).toLocaleString();
        document.getElementById('stat-albums').textContent = (stats.totalSavedAlbums || 0).toLocaleString();

        // 1. Render Top Artists Bar Chart with links to internal artist profile
        renderBarChart('top-artists-chart', stats.topLikedArtists?.slice(0, 10).map(a => ({
            label: a.name,
            link: `artist.html?name=${encodeURIComponent(a.name)}`,
            value: a.count,
            formattedValue: `${a.count} tracks`
        })) || []);

        // 2. Render Decades Chart
        const decadeData = Object.entries(stats.decadeDistribution || {})
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([decade, count]) => ({
                label: decade,
                value: count,
                formattedValue: `${count} tracks`
            }));
        renderBarChart('decades-chart', decadeData);

        // 3. Render Top Release Years
        const topReleaseYears = Object.entries(stats.yearDistribution || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([year, count]) => ({
                label: year,
                value: count,
                formattedValue: `${count} tracks`
            }));
        renderBarChart('years-chart', topReleaseYears);

        // 4. Render Longest Epic Tracks
        const songs = await getLikedSongs();
        const longestTracks = (songs || [])
            .filter(s => s.durationMs > 0)
            .sort((a, b) => b.durationMs - a.durationMs)
            .slice(0, 10)
            .map(s => ({
                label: `${s.name} (${s.artistNames})`,
                link: getSpotifyUri(s, 'track'),
                value: Math.round(s.durationMs / 1000),
                formattedValue: s.durationFormatted || ''
            }));
        renderBarChart('longest-tracks-chart', longestTracks);

        loadingEl.style.display = 'none';
        controlsEl.style.display = 'flex';
        contentEl.style.display = 'block';

    } catch (e) {
        console.error('Error rendering stats:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Error loading stats: ${e.message}</p>`;
    }
}

function renderBarChart(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container || !items || items.length === 0) {
        if (container) container.innerHTML = '<p style="color: var(--text-muted);">No data available</p>';
        return;
    }

    const maxValue = Math.max(...items.map(i => i.value), 1);
    container.innerHTML = '';

    items.forEach(item => {
        const percent = ((item.value / maxValue) * 100).toFixed(1);
        const row = document.createElement('div');
        row.className = 'bar-row';
        
        const labelHtml = item.link 
            ? `<a href="${item.link}" ${item.link.includes('spotify.com') ? 'target="_blank"' : ''}>${item.label}</a>`
            : item.label;

        row.innerHTML = `
            <div class="bar-label" title="${item.label}">${labelHtml}</div>
            <div class="bar-track">
                <div class="bar-fill" style="width: ${percent}%"></div>
            </div>
            <div class="bar-value">${item.formattedValue || item.value}</div>
        `;
        container.appendChild(row);
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

document.addEventListener('DOMContentLoaded', initStats);
