// Client-side Data Access Layer

const DATA_PATHS = {
    profile: 'data/profile.json',
    likedSongs: 'data/liked-songs.json',
    playlists: 'data/playlists.json',
    albums: 'data/albums.json',
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
