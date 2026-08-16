import fs from 'node:fs';
import path from 'node:path';

const LIKED_SONGS_PATH = path.resolve('data/liked-songs.json');
const ALBUMS_PATH = path.resolve('data/albums.json');
const MOODS_PATH = path.resolve('data/song-moods.json');

const USER_AGENT = 'MySpotifyApp/1.0.0 ( koraytugay@icloud.com )';
const DELAY_MS = 1050; // MusicBrainz polite rate limit: 1 request per second

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanString(str) {
    if (!str) return '';
    return str
        .replace(/\s*-\s*Remaster(ed)?(\s*\d{4})?/gi, '')
        .replace(/\s*\(Remaster(ed)?(\s*\d{4})?\)/gi, '')
        .replace(/\s*\(Live[^\)]*\)/gi, '')
        .replace(/\s*-\s*Live[^\-]*/gi, '')
        .replace(/[^\w\s\u00C0-\u017F\u0100-\u024F]/gi, ' ')
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
                                tracksMap.set(t.id, t);
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

function loadExistingMoods() {
    if (fs.existsSync(MOODS_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(MOODS_PATH, 'utf8')) || {};
        } catch (e) {
            return {};
        }
    }
    return {};
}

function saveMoods(moodsObj) {
    fs.writeFileSync(MOODS_PATH, JSON.stringify(moodsObj, null, 2), 'utf8');
}

async function queryMusicBrainz(title, artist) {
    const cleanT = cleanString(title);
    const cleanA = cleanString(artist);
    if (!cleanT || !cleanA) return null;

    const q = `"${cleanT}" AND artist:"${cleanA}"`;
    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=3`;

    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT }
        });
        if (!res.ok) return null;
        const data = await res.json();
        const recordings = data.recordings || [];
        if (recordings.length === 0) return null;
        return recordings[0].id;
    } catch (e) {
        return null;
    }
}

async function queryAcousticBrainz(mbid) {
    if (!mbid) return null;
    let highlevel = null;
    let lowlevel = null;

    try {
        const hlRes = await fetch(`https://acousticbrainz.org/api/v1/${mbid}/high-level`);
        if (hlRes.ok) {
            const hlData = await hlRes.json();
            highlevel = hlData.highlevel || null;
        }
    } catch (e) {}

    try {
        const llRes = await fetch(`https://acousticbrainz.org/api/v1/${mbid}/low-level`);
        if (llRes.ok) {
            const llData = await llRes.json();
            lowlevel = {
                bpm: llData.rhythm?.bpm ? Math.round(llData.rhythm.bpm) : null,
                danceability: llData.rhythm?.danceability ?? null,
                key: llData.tonal?.key_key ? `${llData.tonal.key_key} ${llData.tonal.key_scale || ''}`.trim() : null
            };
        }
    } catch (e) {}

    if (!highlevel && !lowlevel) return null;

    return { highlevel, lowlevel };
}

function classifyMoodAndTempo(track, abData) {
    let bpm = abData?.lowlevel?.bpm || null;
    let acousticVal = abData?.highlevel?.mood_acoustic?.value;
    let aggressiveVal = abData?.highlevel?.mood_aggressive?.value;
    let relaxedVal = abData?.highlevel?.mood_relaxed?.value;
    let partyVal = abData?.highlevel?.mood_party?.value;
    let sadVal = abData?.highlevel?.mood_sad?.value;
    let happyVal = abData?.highlevel?.mood_happy?.value;

    const isAcoustic = acousticVal === 'acoustic' || /\b(acoustic|unplugged|piano|strings)\b/i.test(track.name || '');
    const isAggressive = aggressiveVal === 'aggressive' || (bpm && bpm > 145);
    const isRelaxed = relaxedVal === 'relaxed' || (bpm && bpm < 95);
    const isParty = partyVal === 'party' || (bpm && bpm >= 115 && bpm <= 135);
    const isSad = sadVal === 'sad';
    const isHappy = happyVal === 'happy';

    // Tempo categorization
    let tempoCategory = 'mid-tempo';
    if (bpm) {
        if (bpm < 95) tempoCategory = 'slow';
        else if (bpm > 135) tempoCategory = 'fast';
        else tempoCategory = 'mid-tempo';
    }

    // Ballad detection: slow tempo + acoustic/relaxed/sad, or keyword in title
    const isBallad = (tempoCategory === 'slow' && (isAcoustic || isRelaxed || isSad)) || /\b(ballad|slow|lullaby)\b/i.test(track.name || '');
    const isHighEnergy = isAggressive || tempoCategory === 'fast' || partyVal === 'party';
    const isChill = isRelaxed || isAcoustic || (tempoCategory === 'slow' && !isAggressive);

    const moods = [];
    if (isBallad) moods.push('ballad');
    if (isHighEnergy) moods.push('high_energy');
    if (isChill) moods.push('chill');
    if (isAcoustic) moods.push('acoustic');
    if (isParty) moods.push('party');
    if (isHappy) moods.push('happy');
    if (isSad) moods.push('sad');
    if (moods.length === 0) moods.push('mid-tempo');

    return {
        bpm,
        tempoCategory,
        isBallad,
        isHighEnergy,
        isAcoustic,
        isChill,
        isParty,
        moods,
        source: abData ? 'acousticbrainz' : 'heuristic'
    };
}

async function main() {
    console.log('🎵 Loading library tracks...');
    const allTracks = loadAllTracks();
    console.log(`Found ${allTracks.length} total tracks.`);

    const moodsMap = loadExistingMoods();
    console.log(`Loaded ${Object.keys(moodsMap).length} previously enriched tracks from data/song-moods.json.`);

    let enrichedCount = 0;
    let abHitCount = 0;

    for (let i = 0; i < allTracks.length; i++) {
        const track = allTracks[i];
        if (!track || !track.id) continue;

        // Skip if already enriched
        if (moodsMap[track.id]) continue;

        const artist = track.artistNames || (track.artists && track.artists[0]?.name) || '';
        const title = track.name || '';

        console.log(`[${i + 1}/${allTracks.length}] Querying MusicBrainz for: "${title}" by "${artist}"...`);

        let mbid = null;
        let abData = null;

        try {
            mbid = await queryMusicBrainz(title, artist);
            if (mbid) {
                abData = await queryAcousticBrainz(mbid);
                if (abData) {
                    abHitCount++;
                    console.log(`  ✨ AcousticBrainz match found! (BPM: ${abData.lowlevel?.bpm || 'N/A'})`);
                }
            }
        } catch (e) {
            console.warn(`  Warning querying MB for ${title}:`, e.message);
        }

        const classification = classifyMoodAndTempo(track, abData);
        moodsMap[track.id] = {
            id: track.id,
            name: title,
            artist: artist,
            mbid: mbid || null,
            ...classification
        };

        enrichedCount++;

        // Periodic save every 15 tracks
        if (enrichedCount % 15 === 0) {
            saveMoods(moodsMap);
            console.log(`  💾 Saved checkpoint (${Object.keys(moodsMap).length} tracks tagged).`);
        }

        await sleep(DELAY_MS);
    }

    saveMoods(moodsMap);
    console.log(`\n✅ Enrichment complete! Tagged ${enrichedCount} new tracks (${abHitCount} via AcousticBrainz).`);
    console.log(`Saved full mood dataset to ${MOODS_PATH}`);
}

main().catch(err => {
    console.error('Fatal error in enrich-moods:', err);
    process.exit(1);
});
