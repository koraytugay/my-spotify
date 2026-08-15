async function initStats() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('stats-content');

    try {
        const stats = await getStats();
        if (!stats) {
            loadingEl.innerHTML = `<p style="color: #ff5555;">No stats found. Run <code>npm run sync</code> to generate statistics.</p>`;
            return;
        }

        // Apply saved theme
        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') document.body.classList.add('dark-mode');

        // Top Metrics
        document.getElementById('stat-total-songs').textContent = (stats.totalLikedSongs || 0).toLocaleString();
        document.getElementById('stat-playtime').textContent = stats.totalDurationFormatted || `${stats.totalDurationHours} hrs`;
        document.getElementById('stat-artists').textContent = (stats.uniqueArtistsCount || 0).toLocaleString();
        document.getElementById('stat-playlists').textContent = (stats.totalPlaylists || 0).toLocaleString();
        document.getElementById('stat-albums').textContent = (stats.totalSavedAlbums || 0).toLocaleString();

        // 1. Render Top Artists Bar Chart
        renderBarChart('top-artists-chart', stats.topLikedArtists?.slice(0, 10).map(a => ({
            label: a.name,
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
                value: Math.round(s.durationMs / 1000),
                formattedValue: s.durationFormatted || ''
            }));
        renderBarChart('longest-tracks-chart', longestTracks);

        loadingEl.style.display = 'none';
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
        row.innerHTML = `
            <div class="bar-label" title="${item.label}">${item.label}</div>
            <div class="bar-track">
                <div class="bar-fill" style="width: ${percent}%"></div>
            </div>
            <div class="bar-value">${item.formattedValue || item.value}</div>
        `;
        container.appendChild(row);
    });
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

document.addEventListener('DOMContentLoaded', initStats);
