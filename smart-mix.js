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
var allSongMoods = {};
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
        const [songs, albums, artists, moods] = await Promise.all([
            getLikedSongs(),
            getSavedAlbums(),
            getFollowedArtists(),
            typeof getSongMoods === 'function' ? getSongMoods() : Promise.resolve({})
        ]);

        allLikedSongs = songs || [];
        allAlbums = albums || [];
        allArtists = artists || [];
        allSongMoods = moods || {};

        renderMoodChips();
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

/* ----------------------------------------------------
   MOOD & TAG MULTI-BLENDER
   ---------------------------------------------------- */
var selectedMoodTags = new Set();

const MOOD_TAG_DEFINITIONS = [
    // Moods & Energy
    { id: 'melancholic', label: '🌧️ Dark & Melancholic', test: (s, m) => m?.isMelancholic },
    { id: 'heavy', label: '🛡️ Heavy Riffs & Metal', test: (s, m) => m?.isHeavy },
    { id: 'high_energy', label: '⚡ High Energy & Workout', test: (s, m) => m?.isHighEnergy },
    { id: 'ballad', label: '🕯️ Ballads & Slow Jams', test: (s, m) => m?.isBallad },
    { id: 'chill', label: '☕ Chill & Relaxed', test: (s, m) => m?.isChill },
    { id: 'acoustic', label: '🎸 Acoustic & Unplugged', test: (s, m) => m?.isAcoustic },
    { id: 'progressive', label: '🎼 Progressive & Psychedelic', test: (s, m) => m?.isProgressive },
    { id: 'party', label: '🎉 Party & Danceable', test: (s, m) => m?.isParty },
    { id: 'turkish', label: '🇹🇷 Turkish & Anatolian Rock', test: (s, m) => m?.isTurkish },

    // Forms & Eras
    { id: 'epics', label: '⏳ Epics & Prog (7+ Min)', test: (s) => (s.durationMs || 0) >= 420000 },
    { id: 'bangers', label: '⚡ Short Bangers (< 3.5 Min)', test: (s) => (s.durationMs || 0) > 0 && (s.durationMs || 0) < 210000 },
    { id: 'era_60s_70s', label: '📻 60s & 70s Era', test: (s) => { const y = s.releaseYear || s.album?.releaseYear; return y && y >= 1960 && y <= 1979; } },
    { id: 'era_80s', label: '📼 80s Rock Era', test: (s) => { const y = s.releaseYear || s.album?.releaseYear; return y && y >= 1980 && y <= 1989; } },
    { id: 'era_90s_00s', label: '💿 90s & 2000s Era', test: (s) => { const y = s.releaseYear || s.album?.releaseYear; return y && y >= 1990 && y <= 2009; } },
    { id: 'era_2010s', label: '✨ 2010s+ Era', test: (s) => { const y = s.releaseYear || s.album?.releaseYear; return y && y >= 2010; } },
    { id: 'mega', label: '🎲 Mega Shuffle', test: () => true }
];

function renderMoodChips() {
    const container = document.getElementById('mood-chips-container');
    if (!container) return;

    const allTracks = getAllLibraryTracks();
    updateMoodSelectionUI();

    container.innerHTML = '';

    MOOD_TAG_DEFINITIONS.forEach(def => {
        const count = allTracks.filter(s => def.test(s, allSongMoods[s.id])).length;
        if (count === 0) return;

        const isSelected = selectedMoodTags.has(def.id);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'artist-chip' + (isSelected ? ' selected' : '');
        chip.innerHTML = `
            <span class="chip-name">${def.label}</span>
            <span class="chip-count">${count}</span>
        `;
        chip.onclick = function() {
            toggleMoodChip(def.id, chip);
        };
        container.appendChild(chip);
    });
}

function updateMoodSelectionUI() {
    const clearBtn = document.getElementById('clear-moods-btn');
    const genBtn = document.getElementById('generate-mood-mix-btn');
    const statusEl = document.getElementById('mood-selection-status');

    const count = selectedMoodTags.size;
    if (clearBtn) clearBtn.disabled = count === 0;
    if (genBtn) genBtn.disabled = count === 0;

    if (statusEl) {
        if (count === 0) {
            statusEl.textContent = 'Select 1 or more pills to filter and blend your library';
        } else if (count === 1) {
            const def = MOOD_TAG_DEFINITIONS.find(d => selectedMoodTags.has(d.id));
            statusEl.textContent = `1 tag selected: "${def?.label || ''}"`;
        } else {
            statusEl.textContent = `${count} tags selected for a blended mix`;
        }
    }
}

function toggleMoodChip(tagId, chipBtn) {
    if (selectedMoodTags.has(tagId)) {
        selectedMoodTags.delete(tagId);
    } else {
        selectedMoodTags.add(tagId);
    }

    if (chipBtn) {
        chipBtn.classList.toggle('selected', selectedMoodTags.has(tagId));
    }

    updateMoodSelectionUI();

    // Instant mix generation on click
    if (selectedMoodTags.size > 0) {
        generateMoodTagBlend(true);
    }
}

function clearSelectedMoods() {
    selectedMoodTags.clear();
    renderMoodChips();
}

function generateMoodTagBlend(autoScroll = true) {
    if (selectedMoodTags.size === 0) return;

    currentMixType = 'mood_tag';

    const allTracks = getAllLibraryTracks();
    const selectedDefs = MOOD_TAG_DEFINITIONS.filter(d => selectedMoodTags.has(d.id));

    if (selectedDefs.length === 1) {
        const def = selectedDefs[0];
        const matching = allTracks.filter(s => def.test(s, allSongMoods[s.id]));
        currentMixTracks = shuffleArray(matching).slice(0, 35);
        currentMixTitle = `🎭 ${def.label} Mix`;
    } else {
        // Multi-tag: Group by tag definition and interleave
        const groups = {};
        selectedDefs.forEach(def => {
            groups[def.id] = shuffleArray(allTracks.filter(s => def.test(s, allSongMoods[s.id])));
        });

        const blended = smartInterleave(groups, 7200000); // Up to 2 hours
        const labels = selectedDefs.map(d => d.label.split(' ')[0] + ' ' + (d.label.split(' ')[1] || '')).join(' + ');
        currentMixTracks = blended;
        currentMixTitle = `🎭 ${labels} Blend`;
    }

    renderMixResult(autoScroll);
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

function getAllLibraryTracks() {
    const albumTracks = [];
    allAlbums.forEach(album => {
        if (Array.isArray(album.tracks)) {
            album.tracks.forEach(t => {
                albumTracks.push({
                    ...t,
                    coverUrl: album.coverUrl,
                    thumbnailUrl: album.coverUrl,
                    releaseYear: t.releaseYear || album.releaseYear,
                    album: {
                        name: album.name,
                        id: album.id,
                        releaseYear: album.releaseYear,
                        coverUrl: album.coverUrl
                    }
                });
            });
        }
    });
    return deduplicateSongs([...allLikedSongs, ...albumTracks]);
}

function triggerPresetMix(key, autoScroll = true) {
    currentMixType = 'preset';
    currentPresetKey = key;

    const allTracks = getAllLibraryTracks();
    let tracks = [];
    let title = '';

    if (key === 'epics') {
        title = '⏳ Epics & Prog Masterpieces (7+ Min)';
        // Tracks 7+ minutes (>= 420,000 ms) from both liked songs and saved albums
        const epics = allTracks.filter(s => s.durationMs && s.durationMs >= 420000);
        tracks = shuffleArray(epics).slice(0, 20);
    } else if (key === 'bangers') {
        title = '⚡ Short Bangers (< 3.5 Min)';
        // Fast, high-impact punchy tracks under 3.5 minutes (< 210,000 ms) from entire library
        const bangers = allTracks.filter(s => s.durationMs && s.durationMs > 0 && s.durationMs < 210000);
        tracks = shuffleArray(bangers).slice(0, 25);
    } else if (key === 'classic-era') {
        title = '📻 60s & 70s Classic Era';
        // Tracks released between 1960 and 1979 from both Liked Songs and Saved Albums
        const classicTracks = allTracks.filter(s => {
            const year = s.releaseYear || (s.album && s.album.releaseYear);
            return year && year >= 1960 && year <= 1979;
        });
        tracks = shuffleArray(classicTracks).slice(0, 25);
    } else if (key === 'eighties') {
        title = '🎸 80s Rock & Metal Era';
        // Tracks released between 1980 and 1989 from both Liked Songs and Saved Albums
        const eightiesTracks = allTracks.filter(s => {
            const year = s.releaseYear || (s.album && s.album.releaseYear);
            return year && year >= 1980 && year <= 1989;
        });
        tracks = shuffleArray(eightiesTracks).slice(0, 25);
    } else if (key === 'nineties-twothousands') {
        title = '⚡ 90s & 2000s Era';
        // Tracks released between 1990 and 2009 from both Liked Songs and Saved Albums
        const modernTracks = allTracks.filter(s => {
            const year = s.releaseYear || (s.album && s.album.releaseYear);
            return year && year >= 1990 && year <= 2009;
        });
        tracks = shuffleArray(modernTracks).slice(0, 25);
    } else if (key === 'ballads') {
        title = '🕯️ Ballads & Slow Jams';
        const ballads = allTracks.filter(s => {
            const m = allSongMoods[s.id];
            if (m && (m.isBallad || m.tempoCategory === 'slow')) return true;
            return /\b(ballad|slow|tears|lonely|heart|love|acoustic|unplugged|heaven|forever|rain|farewell|sorrow|remember)\b/i.test(s.name || '');
        });
        tracks = shuffleArray(ballads).slice(0, 25);
    } else if (key === 'high-energy') {
        title = '⚡ High Energy & Workout';
        const highEnergy = allTracks.filter(s => {
            const m = allSongMoods[s.id];
            if (m && (m.isHighEnergy || m.tempoCategory === 'fast' || (m.bpm && m.bpm > 135))) return true;
            return s.durationMs && s.durationMs > 0 && s.durationMs < 240000;
        });
        tracks = shuffleArray(highEnergy).slice(0, 25);
    } else if (key === 'acoustic') {
        title = '🎸 Acoustic & Unplugged';
        const acousticTracks = allTracks.filter(s => {
            const m = allSongMoods[s.id];
            if (m && m.isAcoustic) return true;
            return /\b(acoustic|unplugged|piano|strings|instrumental|session)\b/i.test(s.name || '');
        });
        tracks = shuffleArray(acousticTracks).slice(0, 25);
    } else if (key === 'chill') {
        title = '☕ Chill & Relaxed';
        const chillTracks = allTracks.filter(s => {
            const m = allSongMoods[s.id];
            if (m && (m.isChill || m.tempoCategory === 'slow' || m.tempoCategory === 'mid-tempo')) return true;
            return true;
        });
        tracks = shuffleArray(chillTracks).slice(0, 25);
    } else if (key === 'mega') {
        title = '🎲 Mega 50 Library Shuffle';
        // Group entire library by primary artist for maximum diversity
        const byArtist = {};
        allTracks.forEach(s => {
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

    const allTracks = getAllLibraryTracks();

    allTracks.forEach(song => {
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
    } else if (currentMixType === 'mood_tag') {
        generateMoodTagBlend(true);
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

/* ----------------------------------------------------
   SPOTIFY PKCE OAUTH & SINGLE-PLAYLIST SYNC
   ---------------------------------------------------- */
function getRedirectUri() {
    return window.location.origin + window.location.pathname;
}

function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let res = '';
    const values = new Uint8Array(length);
    window.crypto.getRandomValues(values);
    for (let i = 0; i < length; i++) {
        res += chars[values[i] % chars.length];
    }
    return res;
}

async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function extractPlaylistId(input) {
    if (!input) return '';
    const clean = input.trim();
    const urlMatch = clean.match(/playlist\/([a-zA-Z0-9]+)/);
    if (urlMatch) return urlMatch[1];
    const uriMatch = clean.match(/spotify:playlist:([a-zA-Z0-9]+)/);
    if (uriMatch) return uriMatch[1];
    return clean;
}

function saveCustomPlaylistId(val) {
    const id = extractPlaylistId(val);
    if (id) {
        localStorage.setItem('smart_mix_playlist_id', id);
    } else {
        localStorage.removeItem('smart_mix_playlist_id');
    }
}

function openSpotifyAuthModal() {
    const redirectDisplay = document.getElementById('spotify-redirect-uri-display');
    const clientIdInput = document.getElementById('spotify-client-id-input');
    const customPlaylistInput = document.getElementById('custom-playlist-id-input');
    const savedClientId = localStorage.getItem('spotify_client_id') || '';
    const savedPlaylistId = localStorage.getItem('smart_mix_playlist_id') || '';

    if (redirectDisplay) redirectDisplay.textContent = getRedirectUri();
    if (clientIdInput) clientIdInput.value = savedClientId;
    if (customPlaylistInput) customPlaylistInput.value = savedPlaylistId;

    const authModal = document.getElementById('spotify-auth-modal');
    if (authModal) authModal.style.display = 'flex';
}

function closeSpotifyAuthModal() {
    const modal = document.getElementById('spotify-auth-modal');
    if (modal) modal.style.display = 'none';
}

function disconnectSpotify() {
    localStorage.removeItem('spotify_user_access_token');
    localStorage.removeItem('spotify_user_refresh_token');
    localStorage.removeItem('spotify_token_expires_at');
    localStorage.removeItem('smart_mix_playlist_id');
    localStorage.removeItem('spotify_client_id');
    closeSpotifyAuthModal();
    alert('Disconnected from Spotify. You can reconnect anytime.');
}

async function startSpotifyOAuth() {
    const input = document.getElementById('spotify-client-id-input');
    const clientId = (input?.value || localStorage.getItem('spotify_client_id') || '').trim();

    if (!clientId) {
        openSpotifyAuthModal();
        return;
    }

    closeSpotifyAuthModal();
    localStorage.setItem('spotify_client_id', clientId);
    localStorage.setItem('pending_mix_sync', JSON.stringify({
        tracks: currentMixTracks,
        title: currentMixTitle
    }));

    const verifier = generateRandomString(64);
    const challenge = await generateCodeChallenge(verifier);
    localStorage.setItem('spotify_pkce_verifier', verifier);

    const redirectUri = getRedirectUri();
    const scopesList = [
        'playlist-modify-public',
        'playlist-modify-private',
        'playlist-read-private',
        'playlist-read-collaborative',
        'user-read-private',
        'user-read-email',
        'user-library-read',
        'user-library-modify',
        'user-top-read',
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-currently-playing',
        'user-read-recently-played',
        'user-follow-read',
        'user-follow-modify',
        'ugc-image-upload'
    ];
    const scope = scopesList.join(' ');
    const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge_method=S256&code_challenge=${encodeURIComponent(challenge)}&show_dialog=true`;

    window.location.href = authUrl;
}

async function handleSpotifyAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (!code && !error) return;

    // Immediately clean the address bar to prevent expired one-time code re-evaluation loops
    window.history.replaceState({}, document.title, getRedirectUri());

    if (error) {
        console.warn('Spotify OAuth denied or error:', error);
        alert(`Spotify Login was cancelled or returned an error: ${error}`);
        return;
    }

    const verifier = localStorage.getItem('spotify_pkce_verifier');
    const clientId = localStorage.getItem('spotify_client_id');
    const redirectUri = getRedirectUri();

    if (!verifier || !clientId) {
        console.warn('Missing PKCE verifier or client ID');
        return;
    }

    try {
        const body = new URLSearchParams({
            client_id: clientId,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri,
            code_verifier: verifier
        });

        const res = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });

        if (res.ok) {
            const data = await res.json();
            console.log('Spotify Auth successful! Granted scopes:', data.scope);
            localStorage.setItem('spotify_user_access_token', data.access_token);
            if (data.scope) localStorage.setItem('spotify_granted_scopes', data.scope);
            if (data.refresh_token) localStorage.setItem('spotify_user_refresh_token', data.refresh_token);
            localStorage.setItem('spotify_token_expires_at', Date.now() + (data.expires_in * 1000));
            localStorage.removeItem('spotify_pkce_verifier');

            // Check if a mix was waiting to sync
            const pending = localStorage.getItem('pending_mix_sync');
            if (pending) {
                localStorage.removeItem('pending_mix_sync');
                try {
                    const parsed = JSON.parse(pending);
                    currentMixTracks = parsed.tracks || [];
                    currentMixTitle = parsed.title || 'Curated Smart Mix';
                    setTimeout(() => syncCurrentMixToSpotify(), 300);
                } catch (e) {}
            }
        } else {
            const errText = await res.text();
            console.error('Failed to exchange Spotify token:', res.status, errText);
            alert(`Spotify token exchange failed (${res.status}): ${errText}`);
        }
    } catch (e) {
        console.error('Spotify token exchange network error:', e);
        alert(`Spotify connection network error: ${e.message}`);
    }
}

async function getValidSpotifyToken() {
    const token = localStorage.getItem('spotify_user_access_token');
    const expiresAt = parseInt(localStorage.getItem('spotify_token_expires_at') || '0', 10);
    const refreshToken = localStorage.getItem('spotify_user_refresh_token');
    const clientId = localStorage.getItem('spotify_client_id');

    if (!token) return null;

    // Refresh if within 2 minutes of expiry
    if (Date.now() > expiresAt - 120000 && refreshToken && clientId) {
        try {
            const body = new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId
            });
            const res = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });
            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('spotify_user_access_token', data.access_token);
                if (data.scope) localStorage.setItem('spotify_granted_scopes', data.scope);
                if (data.refresh_token) localStorage.setItem('spotify_user_refresh_token', data.refresh_token);
                localStorage.setItem('spotify_token_expires_at', Date.now() + (data.expires_in * 1000));
                return data.access_token;
            }
        } catch (e) {
            console.warn('Could not refresh token:', e);
        }
    }

    return token;
}

function copyMixTrackLinks() {
    if (!currentMixTracks || currentMixTracks.length === 0) {
        alert('Generate a mix first!');
        return;
    }

    const links = currentMixTracks.map(t => {
        const url = getSpotifyUrl(t, 'track');
        const artist = t.artistNames || (t.artists && t.artists[0]?.name) || 'Unknown Artist';
        return `${t.name} - ${artist}: ${url}`;
    }).join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(links).then(() => {
            alert(`📋 Copied ${currentMixTracks.length} Spotify track links to your clipboard!`);
        }).catch(() => {
            prompt('Copy track links below:', links);
        });
    } else {
        prompt('Copy track links below:', links);
    }
}

async function getOrCreateSmartMixPlaylistId(token, userId, desc) {
    let playlistId = localStorage.getItem('smart_mix_playlist_id');
    if (playlistId) {
        return playlistId; // Trust the saved ID, don't run brittle pre-checks
    }

    // Search existing playlists across multiple pages (up to 200 playlists)
    try {
        let offset = 0;
        while (offset < 200) {
            const res = await fetch(`https://api.spotify.com/v1/me/playlists?limit=50&offset=${offset}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) break;
            const data = await res.json();
            const items = data.items || [];
            if (items.length === 0) break;

            const found = items.find(p => p && p.name && p.name.trim().toLowerCase() === 'my smart mix');
            if (found) {
                localStorage.setItem('smart_mix_playlist_id', found.id);
                return found.id;
            }

            if (items.length < 50) break;
            offset += 50;
        }
    } catch (e) {
        console.warn('Error searching user playlists:', e);
    }

    // Only create a new playlist if none was found anywhere in library
    const createRes = await fetch(`https://api.spotify.com/v1/me/playlists`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: 'My Smart Mix',
            description: desc || 'Curated Smart Mix',
            public: true
        })
    });

    if (createRes.ok) {
        const createdData = await createRes.json();
        localStorage.setItem('smart_mix_playlist_id', createdData.id);
        return createdData.id;
    }

    const errText = await createRes.text();
    throw new Error(`Failed to create playlist (${createRes.status}): ${errText}`);
}

async function syncCurrentMixToSpotify() {
    if (!currentMixTracks || currentMixTracks.length === 0) {
        alert('Generate a mix first before syncing!');
        return;
    }

    const token = await getValidSpotifyToken();

    if (!token) {
        // Prompt user to connect with Client ID
        const redirectDisplay = document.getElementById('spotify-redirect-uri-display');
        const clientIdInput = document.getElementById('spotify-client-id-input');
        const savedClientId = localStorage.getItem('spotify_client_id') || '';

        if (redirectDisplay) redirectDisplay.textContent = getRedirectUri();
        if (clientIdInput) clientIdInput.value = savedClientId;

        const authModal = document.getElementById('spotify-auth-modal');
        if (authModal) authModal.style.display = 'flex';
        return;
    }

    const syncBtn = document.getElementById('sync-spotify-btn');
    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerHTML = `⏳ Syncing...`;
    }

    try {
        // 1. Get current user profile (with 401 token expiry handling)
        const userRes = await fetch('https://api.spotify.com/v1/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (userRes.status === 401) {
            localStorage.removeItem('spotify_user_access_token');
            localStorage.removeItem('spotify_user_refresh_token');
            openSpotifyAuthModal();
            return;
        }

        let userId = null;
        let userEmail = null;
        if (userRes.ok) {
            const userData = await userRes.json();
            userId = userData.id;
            userEmail = userData.email;
        }

        const dateStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const cleanTitle = (currentMixTitle || 'Smart Mix').replace(/[^\w\s\(\)\+\-\&\.\,\:\/]/g, '').trim();
        const desc = `Smart Mix: ${cleanTitle} | Updated ${dateStr} | ${currentMixTracks.length} tracks`;

        const uris = currentMixTracks
            .map(t => {
                if (!t) return null;
                if (typeof t.uri === 'string' && t.uri.startsWith('spotify:track:')) return t.uri;
                if (typeof t.id === 'string' && /^[a-zA-Z0-9]{15,30}$/.test(t.id)) return `spotify:track:${t.id}`;
                return null;
            })
            .filter(Boolean)
            .slice(0, 100);

        if (uris.length === 0) {
            throw new Error('No valid Spotify track IDs found in current mix.');
        }

        // 2. Lock onto or find single dedicated "My Smart Mix" playlist
        let playlistId = await getOrCreateSmartMixPlaylistId(token, userId, desc);

        // Update playlist metadata to public and updated description
        await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'My Smart Mix',
                description: desc,
                public: true
            })
        }).catch(() => {});

        // 3. Overwrite tracks in the single playlist
        let replaceRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uris })
        });

        // If the playlist was deleted by user on Spotify (404), create a fresh one and retry once
        if (replaceRes.status === 404) {
            localStorage.removeItem('smart_mix_playlist_id');
            playlistId = await getOrCreateSmartMixPlaylistId(token, userId, desc);
            replaceRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris })
            });
        }

        if (!replaceRes.ok) {
            replaceRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris })
            });
        }

        if (!replaceRes.ok) {
            const errText = await replaceRes.text();
            throw new Error(`Failed to populate playlist tracks (${replaceRes.status}): ${errText}`);
        }

        // 5. Show success modal
        const successModal = document.getElementById('sync-success-modal');
        const descEl = document.getElementById('sync-success-desc');
        const appBtn = document.getElementById('open-spotify-app-btn');

        if (descEl) {
            descEl.textContent = `Updated "My Smart Mix" with ${uris.length} tracks (${currentMixTitle}).`;
        }

        if (appBtn) {
            const isMobile = window.isMobileDevice ? window.isMobileDevice() : false;
            appBtn.href = isMobile ? `spotify:playlist:${playlistId}` : `https://open.spotify.com/playlist/${playlistId}`;
        }

        if (successModal) successModal.style.display = 'flex';
    } catch (e) {
        console.error('Error syncing to Spotify:', e);
        alert(`Could not sync to Spotify: ${e.message}`);
    } finally {
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = `📤 Sync to "My Smart Mix"`;
        }
    }
}

function closeSyncSuccessModal() {
    const modal = document.getElementById('sync-success-modal');
    if (modal) modal.style.display = 'none';
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
    document.addEventListener('DOMContentLoaded', () => {
        handleSpotifyAuthCallback();
        initSmartMix();
    });
} else {
    handleSpotifyAuthCallback();
    initSmartMix();
}
