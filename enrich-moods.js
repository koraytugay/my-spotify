import fs from 'node:fs';
import path from 'node:path';

const LIKED_SONGS_PATH = path.resolve('data/liked-songs.json');
const ALBUMS_PATH = path.resolve('data/albums.json');
const MOODS_PATH = path.resolve('data/song-moods.json');

// Load .env variables
function loadEnv() {
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return {};
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    const env = {};
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
            const key = trimmed.substring(0, eqIdx).trim();
            const val = trimmed.substring(eqIdx + 1).trim().replace(/^["'](.*)["']$/, '$1');
            env[key] = val;
        }
    }
    return env;
}

const env = loadEnv();
const LASTFM_API_KEY = env.LASTFM_API_KEY || process.env.LASTFM_API_KEY || '767b196b7aaafca99edce9846bea9a0e';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanArtistName(raw) {
    if (!raw) return '';
    // If multiple artists separated by comma, take primary artist for tagging
    const primary = raw.split(',')[0].split('&')[0].split(' feat.')[0].split(' ft.')[0].trim();
    return primary;
}

function cleanTrackTitle(raw) {
    if (!raw) return '';
    return raw
        .replace(/\s*-\s*Remaster(ed)?(\s*\d{4})?/gi, '')
        .replace(/\s*\(Remaster(ed)?(\s*\d{4})?\)/gi, '')
        .replace(/\s*\(Live[^\)]*\)/gi, '')
        .replace(/\s*-\s*Live[^\-]*/gi, '')
        .replace(/\s*-\s*Bonus Track/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function loadAllTracks() {
    const tracksMap = new Map();

    if (fs.existsSync(LIKED_SONGS_PATH)) {
        try {
            const liked = JSON.parse(fs.readFileSync(LIKED_SONGS_PATH, 'utf8'));
            if (Array.isArray(liked)) {
                for (const t of liked) {
                    if (t && t.id) tracksMap.set(t.id, t);
                }
            }
        } catch (e) {
            console.warn('Could not read liked-songs.json:', e.message);
        }
    }

    if (fs.existsSync(ALBUMS_PATH)) {
        try {
            const albums = JSON.parse(fs.readFileSync(ALBUMS_PATH, 'utf8'));
            if (Array.isArray(albums)) {
                for (const album of albums) {
                    if (Array.isArray(album.tracks)) {
                        for (const t of album.tracks) {
                            if (t && t.id && !tracksMap.has(t.id)) {
                                tracksMap.set(t.id, {
                                    ...t,
                                    releaseYear: t.releaseYear || album.releaseYear
                                });
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Could not read albums.json:', e.message);
        }
    }

    return Array.from(tracksMap.values());
}

const artistTagsCache = new Map();

async function getArtistTags(artist) {
    const cleanA = cleanArtistName(artist);
    if (!cleanA) return [];

    if (artistTagsCache.has(cleanA.toLowerCase())) {
        return artistTagsCache.get(cleanA.toLowerCase());
    }

    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(cleanA)}&api_key=${LASTFM_API_KEY}&format=json`;
        const res = await fetch(url);
        if (!res.ok) {
            artistTagsCache.set(cleanA.toLowerCase(), []);
            return [];
        }
        const data = await res.json();
        const tags = (data.toptags?.tag || []).slice(0, 15).map(t => (t.name || '').toLowerCase().trim());
        artistTagsCache.set(cleanA.toLowerCase(), tags);
        await sleep(150); // Polite Last.fm pacing
        return tags;
    } catch (e) {
        artistTagsCache.set(cleanA.toLowerCase(), []);
        return [];
    }
}

async function getTrackTags(artist, title) {
    const cleanA = cleanArtistName(artist);
    const cleanT = cleanTrackTitle(title);
    if (!cleanA || !cleanT) return [];

    try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=track.gettoptags&artist=${encodeURIComponent(cleanA)}&track=${encodeURIComponent(cleanT)}&api_key=${LASTFM_API_KEY}&format=json`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const tags = (data.toptags?.tag || []).slice(0, 10).map(t => (t.name || '').toLowerCase().trim());
        await sleep(150);
        return tags;
    } catch (e) {
        return [];
    }
}

const AUDIO_FEATURES_PATH = path.resolve('data/audio-features.json');
const PLAYLISTS_PATH = path.resolve('data/playlists.json');

function loadAudioFeatures() {
    if (fs.existsSync(AUDIO_FEATURES_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(AUDIO_FEATURES_PATH, 'utf8')) || {};
        } catch (e) {
            return {};
        }
    }
    return {};
}

function loadUserPlaylistSignals() {
    const balladTrackIds = new Set();
    const acousticTrackIds = new Set();
    const partyTrackIds = new Set();
    const chillTrackIds = new Set();

    if (fs.existsSync(PLAYLISTS_PATH)) {
        try {
            const playlists = JSON.parse(fs.readFileSync(PLAYLISTS_PATH, 'utf8'));
            if (Array.isArray(playlists)) {
                playlists.forEach(p => {
                    const name = (p.name || '').toLowerCase();
                    (p.tracks || []).forEach(t => {
                        if (!t || !t.id) return;
                        if (name.includes('ballad')) balladTrackIds.add(t.id);
                        if (name.includes('unplugged') || name.includes('acoustic') || name.includes('akustik')) acousticTrackIds.add(t.id);
                        if (name.includes('hareketli') || name.includes('dance') || name.includes('party')) partyTrackIds.add(t.id);
                        if (name.includes('lounge') || name.includes('chill')) chillTrackIds.add(t.id);
                    });
                });
            }
        } catch (e) {}
    }

    return { balladTrackIds, acousticTrackIds, partyTrackIds, chillTrackIds };
}

function analyzeTags(tags, track, audioFeature, playlistSignals) {
    const tagStr = tags.join(' ');
    const title = (track.name || '').toLowerCase();
    const duration = track.durationMs || (audioFeature?.duration_ms) || 0;

    const inBalladPlaylist = playlistSignals?.balladTrackIds?.has(track.id);
    const inAcousticPlaylist = playlistSignals?.acousticTrackIds?.has(track.id);
    const inPartyPlaylist = playlistSignals?.partyTrackIds?.has(track.id);
    const inChillPlaylist = playlistSignals?.chillTrackIds?.has(track.id);

    const isMetalArtist = /metal|death metal|thrash|black metal|heavy metal|hard rock|metalcore|grunge|sludge|stoner rock|nwobhm/i.test(tagStr);
    const isProgArtist = /progressive rock|prog|progressive metal|art rock|krautrock|post-rock|psychedelic rock|space rock|fusion/i.test(tagStr);
    const isTurkish = /turkish|anatolian rock|turkce|turkey|arabesk|anadolu rock/i.test(tagStr);

    const isBalladTitle = /\b(ballad|slow|tears|lonely|heart|love|heaven|forever|rain|farewell|sorrow|remember|özledim|unutamadım|ayrılık|hasret|ağla|gözyaşı|eskidendi|sevgilim|veda)\b/i.test(title);
    const isAcousticTitle = /\b(acoustic|akustik|unplugged|piano|strings|classical guitar|session)\b/i.test(title);
    const isPartyTitle = /\b(remix|club mix|extended mix|dance mix|hareketli|parti|oyna|disco)\b/i.test(title);
    const isMelancholicTitle = /\b(dark|shadow|sorrow|tears|lonely|pain|cry|grief|grave|black|death|melanchol|yalnız|hüzün|karanlık|acı|yas)\b/i.test(title);

    const isMelancholic = isMelancholicTitle ||
                          (audioFeature && audioFeature.valence <= 0.32 && (audioFeature.energy <= 0.65 || audioFeature.mode === 0)) ||
                          /melanchol|dark metal|doom|depressive|sad|gothic|atmospheric black metal|funeral doom/i.test(tagStr);

    const isAcoustic = inAcousticPlaylist || isAcousticTitle || (audioFeature && audioFeature.acousticness >= 0.55) || /acoustic|unplugged|neofolk|fingerstyle|classical guitar/i.test(tagStr);

    const isBallad = inBalladPlaylist || isBalladTitle || (audioFeature && audioFeature.acousticness >= 0.4 && audioFeature.energy <= 0.45 && audioFeature.tempo <= 100) || /ballad|power ballad|slow/i.test(tagStr) || (isMelancholic && isAcoustic);

    const isHeavy = !isBallad && (isMetalArtist || (audioFeature && audioFeature.energy >= 0.78 && audioFeature.loudness >= -7.5 && audioFeature.acousticness <= 0.18));

    const isHighEnergy = !isBallad && (isHeavy && duration > 0 && duration < 240000 || (audioFeature && (audioFeature.energy >= 0.78 || (audioFeature.tempo >= 135 && audioFeature.energy >= 0.6))) || /thrash|speed metal|power metal|heavy metal|hard rock|punk|metalcore|energetic|intense|fast/i.test(tagStr));

    const isChill = inChillPlaylist || (audioFeature && audioFeature.energy <= 0.48 && audioFeature.loudness <= -8 && audioFeature.danceability <= 0.6) || (!isHeavy && !isHighEnergy && (isAcoustic || isMelancholic)) || /chill|ambient|lounge|downtempo|lo-fi/i.test(tagStr);

    // Party: strictly true dance/club/party, NEVER ballads or acoustic slow tracks
    const isParty = !isBallad && (inPartyPlaylist || isPartyTitle || (audioFeature && audioFeature.danceability >= 0.65 && audioFeature.energy >= 0.58 && audioFeature.valence >= 0.45) || /disco|house|eurodance|club|techno|dance pop|reggaeton|funk/i.test(tagStr));

    const isProgressive = isProgArtist || (duration >= 420000);
    const isEpics = duration >= 420000;
    const isBangers = duration > 0 && duration < 210000;

    // Moods array
    const moods = [];
    if (isMelancholic) moods.push('melancholic');
    if (isHeavy) moods.push('heavy');
    if (isProgressive) moods.push('progressive');
    if (isHighEnergy) moods.push('high_energy');
    if (isBallad) moods.push('ballad');
    if (isAcoustic) moods.push('acoustic');
    if (isChill) moods.push('chill');
    if (isParty) moods.push('party');
    if (isTurkish) moods.push('turkish');
    if (isEpics) moods.push('epics');
    if (isBangers) moods.push('bangers');

    return {
        tags: Array.from(new Set(tags)),
        moods: moods.length > 0 ? moods : ['mid-tempo'],
        isMelancholic,
        isHeavy,
        isProgressive,
        isHighEnergy,
        isBallad,
        isAcoustic,
        isChill,
        isParty,
        isTurkish,
        isEpics,
        isBangers
    };
}

async function main() {
    console.log('🎵 Loading library tracks...');
    const allTracks = loadAllTracks();
    console.log(`Found ${allTracks.length} total tracks across Liked Songs and Albums.`);

    let existingMoods = {};
    if (fs.existsSync(MOODS_PATH)) {
        try {
            existingMoods = JSON.parse(fs.readFileSync(MOODS_PATH, 'utf8')) || {};
        } catch (e) {}
    }

    const isForce = process.argv.includes('--force');
    const missingTracks = isForce ? allTracks : allTracks.filter(t => !existingMoods[t.id]);
    console.log(`Found ${Object.keys(existingMoods).length} existing entries in data/song-moods.json (${missingTracks.length} to process).`);

    if (missingTracks.length === 0 && !isForce) {
        console.log('✨ All tracks are already enriched! Nothing to do.');
        return;
    }

    // Pre-cache artist tags only for the new/missing tracks
    const uniqueArtists = new Set();
    missingTracks.forEach(t => {
        const raw = t.artistNames || (t.artists && t.artists[0]?.name) || '';
        const primary = cleanArtistName(raw);
        if (primary) uniqueArtists.add(primary);
    });

    console.log(`📡 Fetching Last.fm tags for ${uniqueArtists.size} new unique artists...`);
    let artistIdx = 0;
    for (const artist of uniqueArtists) {
        artistIdx++;
        if (artistIdx % 10 === 0 || artistIdx === uniqueArtists.size) {
            console.log(`  [${artistIdx}/${uniqueArtists.size}] Cached artist tags for "${artist}"...`);
        }
        await getArtistTags(artist);
    }

    console.log(`\n🏷️ Classifying all ${allTracks.length} library tracks with Last.fm tags, Spotify Playlists & Audio Features...`);
    const audioFeatures = loadAudioFeatures();
    const playlistSignals = loadUserPlaylistSignals();
    const finalMoods = {};

    for (let i = 0; i < allTracks.length; i++) {
        const track = allTracks[i];
        if (!track || !track.id) continue;

        const rawArtist = track.artistNames || (track.artists && track.artists[0]?.name) || '';
        const artistTags = await getArtistTags(rawArtist);
        const audioFeature = audioFeatures[track.id] || null;

        const classification = analyzeTags(artistTags, track, audioFeature, playlistSignals);

        finalMoods[track.id] = {
            id: track.id,
            name: track.name,
            artist: rawArtist,
            releaseYear: track.releaseYear || (track.album && track.album.releaseYear) || null,
            durationMs: track.durationMs || (audioFeature?.duration_ms) || null,
            ...classification,
            audioFeatures: audioFeature ? {
                energy: audioFeature.energy,
                acousticness: audioFeature.acousticness,
                danceability: audioFeature.danceability,
                valence: audioFeature.valence,
                tempo: audioFeature.tempo,
                loudness: audioFeature.loudness
            } : null,
            source: audioFeature ? 'spotify_audio_features' : 'lastfm'
        };
    }

    fs.writeFileSync(MOODS_PATH, JSON.stringify(finalMoods, null, 2), 'utf8');
    console.log(`\n✅ Last.fm & Playlist Tag Enrichment Complete!`);
    console.log(`Saved ${Object.keys(finalMoods).length} total tagged tracks to ${MOODS_PATH}`);
}

main().catch(err => {
    console.error('Fatal error in enrich-moods:', err);
    process.exit(1);
});
