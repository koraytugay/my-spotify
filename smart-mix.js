// Smart Mix & Playlist Blender Logic

if (typeof isMobileDevice === 'undefined') {
    window.isMobileDevice = function() {
        if (typeof window === 'undefined') return false;
        const ua = navigator.userAgent || navigator.vendor || window.opera || '';
        return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    };
}

if (typeof getSpotifyUrl === 'undefined') {
    window.getSpotifyUrl = function(itemOrUrl, type = 'track') {
        if (!itemOrUrl) return 'https://open.spotify.com';
        if (typeof itemOrUrl === 'string') {
            if (itemOrUrl.startsWith('http://') || itemOrUrl.startsWith('https://')) return itemOrUrl;
            const match = itemOrUrl.match(/spotify:(track|album|artist|playlist):([a-zA-Z0-9]+)/);
            if (match) return `https://open.spotify.com/${match[1]}/${match[2]}`;
            return itemOrUrl;
        }
        if (type === 'track' && itemOrUrl.album?.id && itemOrUrl.id) {
            return `https://open.spotify.com/album/${itemOrUrl.album.id}?highlight=spotify:track:${itemOrUrl.id}`;
        }
        if (itemOrUrl.spotifyUrl) return itemOrUrl.spotifyUrl;
        if (itemOrUrl.id) return `https://open.spotify.com/${type}/${itemOrUrl.id}`;
        if (itemOrUrl.uri) {
            const match = itemOrUrl.uri.match(/spotify:(track|album|artist|playlist):([a-zA-Z0-9]+)/);
            if (match) return `https://open.spotify.com/${match[1]}/${match[2]}`;
        }
        return 'https://open.spotify.com';
    };
}

if (typeof getSpotifyUri === 'undefined') {
    window.getSpotifyUri = function(itemOrUrl, type = 'track') {
        if (!itemOrUrl) return 'spotify:';
        if (typeof itemOrUrl === 'string') {
            if (itemOrUrl.startsWith('spotify:')) return itemOrUrl;
            const match = itemOrUrl.match(/(?:track|album|artist|playlist)\/([a-zA-Z0-9]+)/);
            if (match) return `spotify:${type}:${match[1]}`;
            return itemOrUrl;
        }
        if (itemOrUrl.uri) return itemOrUrl.uri;
        if (itemOrUrl.id) return `spotify:${type}:${itemOrUrl.id}`;
        return 'spotify:';
    };
}

if (typeof getSpotifyLinkAttrs === 'undefined') {
    window.getSpotifyLinkAttrs = function(itemOrUrl, type = 'track') {
        const isMobile = window.isMobileDevice ? window.isMobileDevice() : false;
        const href = isMobile 
            ? (window.getSpotifyUri ? window.getSpotifyUri(itemOrUrl, type) : '#')
            : (window.getSpotifyUrl ? window.getSpotifyUrl(itemOrUrl, type) : 'https://open.spotify.com');
        const targetAttrs = isMobile ? '' : 'target="_blank" rel="noopener noreferrer"';
        return { href, targetAttrs, isMobile };
    };
}

var allLikedSongs = [];
var allAlbums = [];
var allArtists = [];
var selectedArtistNames = new Set();
var currentMixTracks = [];
var currentMixTitle = 'Curated Smart Mix';
var currentMixType = 'preset';
var currentPresetKey = 'mega';

async function initSmartMix() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('smart-mix-content');

    if (loadingEl) loadingEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';

    try {
        const [songs, albums, artists] = await Promise.all([
            getLikedSongs(),
            getSavedAlbums(),
            getFollowedArtists()
        ]);

        allLikedSongs = songs || [];
        allAlbums = albums || [];
        allArtists = artists || [];

        renderArtistChips();

        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';

        loadThemePreference();

        // If a mix was already generated in this session, restore it seamlessly
        if (currentMixTracks && currentMixTracks.length > 0) {
            renderMixResult(false);
        } else {
            // First time load only: generate initial mix without auto-scrolling
            triggerPresetMix('mega', false);
        }
    } catch (e) {
        console.error('Error loading Smart Mix data:', e);
        if (loadingEl) {
            loadingEl.innerHTML = `<p style="color: #ff5555;">Could not load Smart Mix data (${e.message}).</p>`;
        }
    }
}

var artistSearchQuery = '';
var showAllArtists = false;

function getArtistTrackCounts() {
    const counts = {};

    // 1. Count from Liked Songs
    allLikedSongs.forEach(song => {
        const names = [];
        if (Array.isArray(song.artists)) {
            song.artists.forEach(a => { if (a && a.name) names.push(a.name); });
        } else if (song.artistNames) {
            names.push(song.artistNames);
        }
        names.forEach(name => {
            const clean = name.trim();
            if (clean) counts[clean] = (counts[clean] || 0) + 1;
        });
    });

    // 2. Count from Saved Albums
    allAlbums.forEach(album => {
        if (Array.isArray(album.tracks)) {
            album.tracks.forEach(t => {
                const names = [];
                if (Array.isArray(t.artists)) {
                    t.artists.forEach(a => { if (a && a.name) names.push(a.name); });
                } else if (t.artistNames) {
                    names.push(t.artistNames);
                } else if (album.artistNames) {
                    names.push(album.artistNames);
                }
                names.forEach(name => {
                    const clean = name.trim();
                    if (clean) counts[clean] = (counts[clean] || 0) + 1;
                });
            });
        }
    });

    // 3. Ensure followed artists are present
    allArtists.forEach(artist => {
        if (artist && artist.name) {
            const clean = artist.name.trim();
            if (!counts[clean]) counts[clean] = 1;
        }
    });

    return counts;
}

function handleArtistSearch(query) {
    artistSearchQuery = (query || '').trim().toLowerCase();
    renderArtistChips();
}

function toggleShowAllArtists() {
    showAllArtists = !showAllArtists;
    renderArtistChips();
}

function clearSelectedArtists() {
    selectedArtistNames.clear();
    renderArtistChips();
}

function renderArtistChips() {
    const container = document.getElementById('artist-chips-container');
    if (!container) return;

    const toggleBtn = document.getElementById('toggle-all-artists-btn');
    const counts = getArtistTrackCounts();
    const allNames = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const totalCount = allNames.length;

    if (toggleBtn) {
        toggleBtn.textContent = showAllArtists ? 'Show Top 32' : `Show All (${totalCount})`;
    }

    updateClearBtnState();
    updateGenerateBlendBtnState();

    let filteredNames = allNames;

    if (artistSearchQuery) {
        filteredNames = allNames.filter(name => name.toLowerCase().includes(artistSearchQuery));
    } else if (!showAllArtists) {
        filteredNames = allNames.slice(0, 32);
    }

    container.innerHTML = '';

    if (filteredNames.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 12px 6px;">No artists found matching "${artistSearchQuery}".</div>`;
        return;
    }

    filteredNames.forEach(artistName => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'artist-chip' + (selectedArtistNames.has(artistName) ? ' selected' : '');
        chip.innerHTML = `
            <span class="chip-name">${artistName}</span>
            <span class="chip-count">${counts[artistName]}</span>
        `;
        chip.onclick = function() {
            toggleArtistChip(artistName, chip);
        };
        container.appendChild(chip);
    });
}

function toggleArtistChip(artistName, chipBtn) {
    if (selectedArtistNames.has(artistName)) {
        selectedArtistNames.delete(artistName);
        if (chipBtn) chipBtn.classList.remove('selected');
    } else {
        selectedArtistNames.add(artistName);
        if (chipBtn) chipBtn.classList.add('selected');
    }
    updateClearBtnState();
    updateGenerateBlendBtnState();
}

function updateClearBtnState() {
    const clearBtn = document.getElementById('clear-selected-artists-btn');
    if (clearBtn) {
        const count = selectedArtistNames.size;
        clearBtn.style.display = count > 0 ? 'inline-block' : 'none';
        clearBtn.textContent = `Clear Selection (${count})`;
    }
}

function updateGenerateBlendBtnState() {
    const btn = document.getElementById('generate-blend-btn');
    if (btn) {
        const count = selectedArtistNames.size;
        btn.disabled = count < 2;
        btn.textContent = count >= 2 ? `Blend ${count} Artists (~2 hrs)` : `Select 2+ Artists`;
    }
}

// Utility: Shuffle array with Fisher-Yates
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Smart Interleaving: Distributes tracks evenly avoiding back-to-back tracks from same artist
function smartInterleave(tracksByGroup, limitOrMaxMs = 7200000) {
    const groups = Object.values(tracksByGroup)
        .map(list => shuffleArray(list))
        .filter(list => list.length > 0);

    if (groups.length === 0) return [];

    const result = [];
    let totalDurationMs = 0;
    let groupIndex = 0;

    // If limitOrMaxMs > 1000, treat as duration in ms (default 2 hours = 7,200,000 ms), otherwise as track count
    const isDurationLimit = limitOrMaxMs > 1000;
    const maxMs = isDurationLimit ? limitOrMaxMs : Infinity;
    const maxCount = isDurationLimit ? 60 : limitOrMaxMs;

    while (result.length < maxCount && groups.some(g => g.length > 0)) {
        const currentGroup = groups[groupIndex % groups.length];
        if (currentGroup.length > 0) {
            const track = currentGroup.shift();
            // Avoid exact duplicate
            if (!result.find(t => t.id === track.id)) {
                result.push(track);
                totalDurationMs += (track.durationMs || 240000);
                if (isDurationLimit && totalDurationMs >= maxMs) {
                    break;
                }
            }
        }
        groupIndex++;
    }

    return result;
}

function triggerPresetMix(key, autoScroll = true) {
    currentMixType = 'preset';
    currentPresetKey = key;

    let tracks = [];
    let title = '';

    if (key === 'epics') {
        title = '⏳ Epics & Prog Masterpieces (7+ Min)';
        // Tracks 7+ minutes (>= 420,000 ms)
        const likedEpics = allLikedSongs.filter(s => s.durationMs && s.durationMs >= 420000);
        
        // Also check albums for long-form epic masterworks
        const albumEpics = [];
        allAlbums.forEach(album => {
            if (Array.isArray(album.tracks)) {
                album.tracks.forEach(t => {
                    if (t.durationMs && t.durationMs >= 420000) {
                        albumEpics.push({
                            ...t,
                            coverUrl: album.coverUrl,
                            thumbnailUrl: album.coverUrl,
                            album: {
                                name: album.name,
                                id: album.id,
                                releaseYear: album.releaseYear,
                                coverUrl: album.coverUrl
                            }
                        });
                    }
                });
            }
        });

        const combined = deduplicateSongs([...likedEpics, ...albumEpics]);
        tracks = shuffleArray(combined).slice(0, 20);
    } else if (key === 'bangers') {
        title = '⚡ Short Bangers (< 3.5 Min)';
        // Fast, high-energy punchy tracks under 3.5 minutes (< 210,000 ms)
        const bangers = allLikedSongs.filter(s => s.durationMs && s.durationMs > 0 && s.durationMs < 210000);
        tracks = shuffleArray(bangers).slice(0, 25);
    } else if (key === 'classic-era') {
        title = '📻 60s & 70s Classic Era';
        // Tracks released between 1960 and 1979
        const classicTracks = allLikedSongs.filter(s => {
            const year = s.releaseYear || (s.album && s.album.releaseYear);
            return year && year >= 1960 && year <= 1979;
        });
        tracks = shuffleArray(classicTracks).slice(0, 25);
    } else if (key === 'eighties') {
        title = '🎸 80s Rock & Metal Era';
        // Tracks released between 1980 and 1989
        const eightiesTracks = allLikedSongs.filter(s => {
            const year = s.releaseYear || (s.album && s.album.releaseYear);
            return year && year >= 1980 && year <= 1989;
        });
        tracks = shuffleArray(eightiesTracks).slice(0, 25);
    } else if (key === 'nineties-twothousands') {
        title = '⚡ 90s & 2000s Era';
        // Tracks released between 1990 and 2009
        const modernTracks = allLikedSongs.filter(s => {
            const year = s.releaseYear || (s.album && s.album.releaseYear);
            return year && year >= 1990 && year <= 2009;
        });
        tracks = shuffleArray(modernTracks).slice(0, 25);
    } else if (key === 'mega') {
        title = '🎲 Mega 50 Library Shuffle';
        // Group by primary artist for maximum diversity
        const byArtist = {};
        allLikedSongs.forEach(s => {
            const artist = s.artistNames || (s.artists && s.artists[0] && s.artists[0].name) || 'Other';
            if (!byArtist[artist]) byArtist[artist] = [];
            byArtist[artist].push(s);
        });
        tracks = smartInterleave(byArtist, 50);
    }

    currentMixTracks = tracks;
    currentMixTitle = title;
    renderMixResult(autoScroll);
}

function generateCustomArtistBlend(autoScroll = true) {
    if (selectedArtistNames.size < 2) return;

    currentMixType = 'blend';

    const tracksByArtist = {};
    selectedArtistNames.forEach(name => {
        tracksByArtist[name] = [];
    });

    // 1. Gather from Liked Songs
    allLikedSongs.forEach(song => {
        const names = [];
        if (Array.isArray(song.artists)) {
            song.artists.forEach(a => { if (a && a.name) names.push(a.name); });
        } else if (song.artistNames) {
            names.push(song.artistNames);
        }

        names.forEach(name => {
            if (selectedArtistNames.has(name)) {
                tracksByArtist[name].push(song);
            }
        });
    });

    // 2. Gather from Albums if available
    allAlbums.forEach(album => {
        if (Array.isArray(album.tracks)) {
            album.tracks.forEach(track => {
                const trackArtists = [];
                if (Array.isArray(track.artists)) {
                    track.artists.forEach(a => { if (a && a.name) trackArtists.push(a.name); });
                } else if (track.artistNames) {
                    trackArtists.push(track.artistNames);
                } else if (album.artistNames) {
                    trackArtists.push(album.artistNames);
                }

                trackArtists.forEach(name => {
                    if (selectedArtistNames.has(name)) {
                        tracksByArtist[name].push({
                            ...track,
                            coverUrl: album.coverUrl,
                            thumbnailUrl: album.coverUrl,
                            album: {
                                name: album.name,
                                id: album.id,
                                releaseYear: album.releaseYear,
                                coverUrl: album.coverUrl
                            }
                        });
                    }
                });
            });
        }
    });

    // Generate up to 2 hours (~7,200,000 ms) of interleaved music
    const blended = smartInterleave(tracksByArtist, 7200000);
    const namesList = Array.from(selectedArtistNames).join(' + ');

    currentMixTracks = blended;
    currentMixTitle = `🎪 ${namesList} Lineup`;
    renderMixResult(autoScroll);
}

function rerollCurrentMix() {
    if (currentMixType === 'blend') {
        generateCustomArtistBlend(true);
    } else {
        triggerPresetMix(currentPresetKey, true);
    }
}

function renderMixResult(autoScroll = false) {
    const resultSection = document.getElementById('mix-result-section');
    const titleEl = document.getElementById('mix-result-title');
    const metaEl = document.getElementById('mix-result-meta');
    const gridEl = document.getElementById('mix-tracks-grid');

    if (!resultSection || !gridEl) return;

    resultSection.style.display = 'block';

    if (titleEl) titleEl.textContent = currentMixTitle;

    const count = currentMixTracks.length;
    const totalMs = currentMixTracks.reduce((acc, t) => acc + (t.durationMs || 210000), 0);
    const totalMins = Math.round(totalMs / 60000);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const durationStr = hrs > 0 ? `~${hrs} hr ${mins} min` : `~${mins} min`;

    if (metaEl) {
        metaEl.textContent = `${count} tracks • ${durationStr}`;
    }

    gridEl.innerHTML = '';

    currentMixTracks.forEach((song, index) => {
        const card = document.createElement('div');
        card.className = 'song-card';
        card.id = `mix-card-${song.id || index}`;

        const isPlaying = window.miniPlayer && window.miniPlayer.currentTrack?.id === song.id && window.miniPlayer.isPlaying;
        if (isPlaying) card.classList.add('is-playing');

        const cover = song.coverUrl || song.thumbnailUrl || (song.album && song.album.coverUrl) || 'https://via.placeholder.com/300x300?text=Spotify';

        // Artists HTML
        let artistsHtml = '';
        if (Array.isArray(song.artists) && song.artists.length > 0) {
            artistsHtml = song.artists.map(a => `<a href="artist.html?name=${encodeURIComponent(a.name)}" class="artist-link">${a.name}</a>`).join(', ');
        } else if (song.artistNames) {
            artistsHtml = `<a href="artist.html?name=${encodeURIComponent(song.artistNames)}" class="artist-link">${song.artistNames}</a>`;
        } else {
            artistsHtml = 'Unknown Artist';
        }

        // Album HTML
        let albumHtml = '';
        if (song.album && song.album.name) {
            albumHtml = ` • <span class="album-year">${song.album.name}</span>`;
        }

        const trackUrl = getSpotifyUrl(song, 'track');

        card.innerHTML = `
            <div class="cover-wrapper">
                <a href="${trackUrl}">
                    <img src="${cover}" alt="${song.name}" class="cover-img" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/300x300?text=No+Cover';">
                </a>
                <button class="play-btn-overlay" onclick="togglePlayPreview('${song.id}', '${song.previewUrl || ''}')" title="${isPlaying ? 'Pause' : 'Play'}">
                    ${isPlaying ? '⏸' : '▶'}
                </button>
            </div>
            <div class="song-details">
                <div class="song-title">
                    <span style="color: var(--text-muted); font-size: 0.8rem; margin-right: 6px;">#${index + 1}</span>
                    <a href="${trackUrl}" class="song-title-link">${song.name}</a>
                </div>
                <div class="song-artist">${artistsHtml}${albumHtml}</div>
            </div>
            <div class="song-meta" style="justify-content: flex-end;">
                <a href="${trackUrl}" class="spotify-icon-btn" title="Open in Spotify" aria-label="Open in Spotify">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                </a>
            </div>
        `;

        gridEl.appendChild(card);
    });

    if (autoScroll) {
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function playCurrentMix() {
    if (!currentMixTracks || currentMixTracks.length === 0) return;

    if (window.miniPlayer) {
        window.miniPlayer.playlist = currentMixTracks;
        window.miniPlayer.currentType = 'playlist';
        window.miniPlayer.contextTitle = currentMixTitle;
        window.miniPlayer.playItem(currentMixTracks[0], currentMixTracks, 'playlist', currentMixTitle);
    }
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSmartMix);
} else {
    initSmartMix();
}
