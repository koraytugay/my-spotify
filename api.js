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
}
