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

function analyzeTags(tags, track) {
    const tagStr = tags.join(' ');
    const title = (track.name || '').toLowerCase();
    const duration = track.durationMs || 0;
    const year = track.releaseYear || (track.album && track.album.releaseYear) || 0;

    // Classification Flags
    const isMelancholic = /melanchol|dark metal|doom|depressive|sad|gothic|atmospheric black metal|funeral doom|ambient|post-rock|neofolk/i.test(tagStr) ||
                          /\b(dark|shadow|sorrow|tears|lonely|pain|cry|grief|grave|black|death|melanchol)\b/i.test(title);

    const isHeavy = /metal|death metal|thrash|black metal|heavy metal|hard rock|metalcore|grunge|sludge|stoner rock|nwobhm/i.test(tagStr);

    const isProgressive = /progressive rock|prog|progressive metal|art rock|krautrock|post-rock|psychedelic rock|space rock|fusion/i.test(tagStr) ||
                          (duration >= 420000);

    const isHighEnergy = /thrash|speed metal|power metal|heavy metal|hard rock|punk|metalcore|energetic|intense|fast/i.test(tagStr) ||
                         (isHeavy && duration > 0 && duration < 240000);

    const isAcoustic = /acoustic|unplugged|folk|neofolk|fingerstyle|classical guitar|singer-songwriter/i.test(tagStr) ||
                       /\b(acoustic|unplugged|piano|strings|instrumental|session)\b/i.test(title);

    const isBallad = /ballad|power ballad|slow|love songs/i.test(tagStr) ||
                     /\b(ballad|slow|farewell|remember|heaven|forever|rain|heart|love)\b/i.test(title) ||
                     (isMelancholic && isAcoustic);

    const isChill = /chill|chillout|relaxed|ambient|lounge|downtempo|lo-fi|trip hop|mellow|easy listening|calm/i.test(tagStr) ||
                    (!isHeavy && !isHighEnergy && (isAcoustic || isMelancholic));

    const isParty = /dance|party|disco|pop|funk|electronic|synthpop|house|eurodance|club/i.test(tagStr);

    const isTurkish = /turkish|anatolian rock|turkce|turkey|arabesk|anadolu rock/i.test(tagStr);

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

    console.log(`Found ${Object.keys(existingMoods).length} existing entries in data/song-moods.json.`);

    // Pre-cache artist tags first for massive speedup
    const uniqueArtists = new Set();
    allTracks.forEach(t => {
        const raw = t.artistNames || (t.artists && t.artists[0]?.name) || '';
        const primary = cleanArtistName(raw);
        if (primary) uniqueArtists.add(primary);
    });

    console.log(`📡 Fetching Last.fm tags for ${uniqueArtists.size} unique artists...`);
    let artistIdx = 0;
    for (const artist of uniqueArtists) {
        artistIdx++;
        if (artistIdx % 20 === 0 || artistIdx === uniqueArtists.size) {
            console.log(`  [${artistIdx}/${uniqueArtists.size}] Cached artist tags...`);
        }
        await getArtistTags(artist);
    }

    console.log(`\n🏷️ Classifying all ${allTracks.length} tracks with rich Last.fm tags...`);
    const finalMoodsMap = {};

    for (let i = 0; i < allTracks.length; i++) {
        const track = allTracks[i];
        if (!track || !track.id) continue;

        const rawArtist = track.artistNames || (track.artists && track.artists[0]?.name) || '';
        const artistTags = await getArtistTags(rawArtist);

        const classification = analyzeTags(artistTags, track);

        finalMoodsMap[track.id] = {
            id: track.id,
            name: track.name,
            artist: rawArtist,
            releaseYear: track.releaseYear || (track.album && track.album.releaseYear) || null,
            durationMs: track.durationMs || null,
            ...classification,
            source: 'lastfm'
        };
    }

    fs.writeFileSync(MOODS_PATH, JSON.stringify(finalMoodsMap, null, 2), 'utf8');
    console.log(`\n✅ Last.fm Tag Enrichment Complete!`);
    console.log(`Saved ${Object.keys(finalMoodsMap).length} tagged tracks to ${MOODS_PATH}`);
}

main().catch(err => {
    console.error('Fatal error in enrich-moods:', err);
    process.exit(1);
});
