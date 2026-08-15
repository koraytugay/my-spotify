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

async function getLikedSongs() {
    const songs = await fetchJson(DATA_PATHS.likedSongs);
    return songs || [];
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
