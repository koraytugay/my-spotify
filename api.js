// Client-side Data Access Layer

const DATA_PATHS = {
    profile: 'data/profile.json',
    likedSongs: 'data/liked-songs.json',
    playlists: 'data/playlists.json',
    albums: 'data/albums.json',
    followedArtists: 'data/followed-artists.json',
    topArtists: 'data/top-artists.json',
    topTracks: 'data/top-tracks.json',
    stats: 'data/stats.json'
};

async function fetchJson(path) {
    try {
        const res = await fetch(path);
        if (!res.ok) {
            if (res.status === 404) return null;
            throw new Error(`HTTP error ${res.status} loading ${path}`);
        }
        return await res.json();
    } catch (e) {
        console.warn(`Could not load ${path}:`, e.message);
        return null;
    }
}

async function getProfile() {
    return await fetchJson(DATA_PATHS.profile) || {
        displayName: 'My Spotify Library',
        followers: 0,
        spotifyUrl: 'https://open.spotify.com'
    };
}

function getTrackDeduplicationKey(song) {
    if (!song) return '';
    const name = (song.name || '')
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
    const artist = (song.artistNames || (song.artists && song.artists[0] && song.artists[0].name) || '')
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
    return `${name}:::${artist}`;
}

function deduplicateSongs(songs) {
    if (!Array.isArray(songs)) return [];
    const seenKeys = new Set();
    const seenIds = new Set();
    const result = [];
    for (const song of songs) {
        if (!song) continue;
        const key = getTrackDeduplicationKey(song);
        const id = song.id;
        if (id && seenIds.has(id)) continue;
        if (key && seenKeys.has(key)) continue;
        if (id) seenIds.add(id);
        if (key) seenKeys.add(key);
        result.push(song);
    }
    return result;
}

async function getLikedSongs() {
    const songs = await fetchJson(DATA_PATHS.likedSongs);
    return deduplicateSongs(songs || []);
}

async function getPlaylists() {
    const playlists = await fetchJson(DATA_PATHS.playlists);
    return playlists || [];
}

async function getSavedAlbums() {
    const albums = await fetchJson(DATA_PATHS.albums);
    return albums || [];
}

async function getFollowedArtists() {
    const artists = await fetchJson(DATA_PATHS.followedArtists);
    return artists || [];
}

async function getTopArtists() {
    const artists = await fetchJson(DATA_PATHS.topArtists);
    return artists || [];
}

async function getTopTracks() {
    const tracks = await fetchJson(DATA_PATHS.topTracks);
    return tracks || [];
}

async function getStats() {
    return await fetchJson(DATA_PATHS.stats);
}

async function getPlaylistById(id) {
    if (!id) return null;
    const individual = await fetchJson(`data/playlists/${id}.json`);
    if (individual) return individual;
    const playlists = await getPlaylists();
    return playlists.find(p => p.id === id) || null;
}

async function getArtistDiscography(artistId) {
    if (!artistId) return [];
    const disco = await fetchJson(`data/artists/${artistId}.json`);
    return disco || [];
}

// Converts a Spotify item, URI, or ID into a standard web URL (open.spotify.com)
function getSpotifyUrl(itemOrUrl, type = 'track') {
    if (!itemOrUrl) return 'https://open.spotify.com';
    if (typeof itemOrUrl === 'string') {
        if (itemOrUrl.startsWith('http://') || itemOrUrl.startsWith('https://')) return itemOrUrl;
        const match = itemOrUrl.match(/spotify:(track|album|artist|playlist):([a-zA-Z0-9]+)/);
        if (match) return `https://open.spotify.com/${match[1]}/${match[2]}`;
        return itemOrUrl;
    }
    // If it's a track with an album, link to album with track highlighted (prevents auto-play)
    if (type === 'track' && itemOrUrl.album?.id && itemOrUrl.id) {
        return `https://open.spotify.com/album/${itemOrUrl.album.id}?highlight=spotify:track:${itemOrUrl.id}`;
    }
    if (itemOrUrl.spotifyUrl) {
        return itemOrUrl.spotifyUrl;
    }
    if (itemOrUrl.id) {
        return `https://open.spotify.com/${type}/${itemOrUrl.id}`;
    }
    if (itemOrUrl.uri) {
        const match = itemOrUrl.uri.match(/spotify:(track|album|artist|playlist):([a-zA-Z0-9]+)/);
        if (match) return `https://open.spotify.com/${match[1]}/${match[2]}`;
    }
    return 'https://open.spotify.com';
}

// Converts a Spotify item or web URL into a native Spotify app deep link URI
function getSpotifyUri(itemOrUrl, type = 'track') {
    if (!itemOrUrl) return '#';
    if (typeof itemOrUrl === 'string') {
        if (itemOrUrl.startsWith('spotify:')) return itemOrUrl;
        const match = itemOrUrl.match(/spotify\.com\/(track|album|artist|playlist)\/([a-zA-Z0-9]+)/);
        if (match) return `spotify:${match[1]}:${match[2]}`;
        return itemOrUrl;
    }
    if (itemOrUrl.uri && itemOrUrl.uri.startsWith('spotify:')) {
        return itemOrUrl.uri;
    }
    if (itemOrUrl.id) {
        return `spotify:${type}:${itemOrUrl.id}`;
    }
    if (itemOrUrl.spotifyUrl) {
        const match = itemOrUrl.spotifyUrl.match(/spotify\.com\/(track|album|artist|playlist)\/([a-zA-Z0-9]+)/);
        if (match) return `spotify:${match[1]}:${match[2]}`;
        return itemOrUrl.spotifyUrl;
    }
    return '#';
}

// Mobile device detection (iOS and Android mobile OS)
function isMobileDevice() {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    return /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

// Returns native spotify:... URI on mobile devices (to open app) and https://open.spotify.com on desktop
function getSpotifyLink(itemOrUrl, type = 'track') {
    if (isMobileDevice()) {
        const uri = getSpotifyUri(itemOrUrl, type);
        if (uri && uri !== '#') return uri;
    }
    return getSpotifyUrl(itemOrUrl, type);
}

// Returns href and appropriate target attributes (target=_blank on desktop web, direct navigation on mobile app)
function getSpotifyLinkAttrs(itemOrUrl, type = 'track') {
    const isMobile = isMobileDevice();
    const href = isMobile ? getSpotifyUri(itemOrUrl, type) : getSpotifyUrl(itemOrUrl, type);
    const targetAttrs = isMobile ? '' : 'target="_blank" rel="noopener noreferrer"';
    return { href, targetAttrs, isMobile };
}

// Spotify Web API Integration Helpers
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
            console.warn('Could not refresh Spotify token:', e);
        }
    }

    return token;
}

async function getOrCreateSmartMixPlaylistId(token, desc) {
    const cachedId = localStorage.getItem('smart_mix_playlist_id');
    if (cachedId) return cachedId;

    // Search user playlists to avoid duplicate "My Smart Mix"
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
            description: desc || 'Curated Smart Mix from My Spotify Archive',
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

async function syncTracksToSmartMix(tracks, mixTitle = 'Smart Mix', silent = true) {
    if (!tracks || tracks.length === 0) return null;
    const token = await getValidSpotifyToken();
    if (!token) return null;

    const uris = tracks
        .map(t => {
            if (!t) return null;
            if (typeof t.uri === 'string' && t.uri.startsWith('spotify:track:')) return t.uri;
            if (typeof t.id === 'string' && /^[a-zA-Z0-9]{15,30}$/.test(t.id)) return `spotify:track:${t.id}`;
            return null;
        })
        .filter(Boolean)
        .slice(0, 100);

    if (uris.length === 0) return null;

    const dateStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const cleanTitle = mixTitle.replace(/[^\w\s\(\)\+\-\&\.\,\:\/]/g, '').trim();
    const desc = `${cleanTitle} | Updated ${dateStr} | ${uris.length} tracks`;

    let playlistId = await getOrCreateSmartMixPlaylistId(token, desc);

    // Update metadata
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

    // Overwrite items
    let replaceRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ uris })
    });

    if (replaceRes.status === 404) {
        localStorage.removeItem('smart_mix_playlist_id');
        playlistId = await getOrCreateSmartMixPlaylistId(token, desc);
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

    return replaceRes.ok ? playlistId : null;
}

if (typeof window !== 'undefined') {
    window.isMobileDevice = isMobileDevice;
    window.getSpotifyLink = getSpotifyLink;
    window.getSpotifyLinkAttrs = getSpotifyLinkAttrs;
    window.getSpotifyUrl = getSpotifyUrl;
    window.getSpotifyUri = getSpotifyUri;
    window.fetchJson = fetchJson;
    window.getProfile = getProfile;
    window.deduplicateSongs = deduplicateSongs;
    window.getLikedSongs = getLikedSongs;
    window.getPlaylists = getPlaylists;
    window.getSavedAlbums = getSavedAlbums;
    window.getFollowedArtists = getFollowedArtists;
    window.getTopArtists = getTopArtists;
    window.getTopTracks = getTopTracks;
    window.getStats = getStats;
    window.getPlaylistById = getPlaylistById;
    window.getArtistDiscography = getArtistDiscography;
    window.getValidSpotifyToken = getValidSpotifyToken;
    window.getOrCreateSmartMixPlaylistId = getOrCreateSmartMixPlaylistId;
    window.syncTracksToSmartMix = syncTracksToSmartMix;
}
