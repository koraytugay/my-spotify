import fs from 'node:fs';
import path from 'node:path';

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
const CLIENT_ID = env.SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = env.SPOTIFY_CLIENT_SECRET || process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = env.SPOTIFY_REFRESH_TOKEN || process.env.SPOTIFY_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error('❌ Missing credentials! Make sure SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN are present in .env');
    console.error('👉 Run `npm run auth` first to authorize.');
    process.exit(1);
}

// 1. Get Fresh Access Token using Refresh Token
async function getAccessToken() {
    const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: REFRESH_TOKEN
        })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to refresh token (${res.status}): ${text}`);
    }

    const data = await res.json();
    return data.access_token;
}

// Helper to make authenticated GET requests with rate-limit retry
async function spotifyFetch(url, token, retries = 3) {
    for (let i = 0; i < retries; i++) {
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (res.status === 429) {
            const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
            console.warn(`⏳ Rate limited. Waiting ${retryAfter}s before retrying...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
        }

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Spotify API error ${res.status} on ${url}: ${text}`);
        }

        return await res.json();
    }
    throw new Error(`Max retries reached for ${url}`);
}

// Helper to paginate through all items from an endpoint
async function fetchAllPages(initialUrl, token, label) {
    let items = [];
    let nextUrl = initialUrl;
    let page = 1;

    process.stdout.write(`📥 Fetching ${label}... `);

    while (nextUrl) {
        const data = await spotifyFetch(nextUrl, token);
        if (data.items) {
            items = items.concat(data.items);
            process.stdout.write(`[${items.length} items] `);
        }
        nextUrl = data.next;
        page++;
        // Small delay to be polite to Spotify API
        if (nextUrl) await new Promise(r => setTimeout(r, 100));
    }
    console.log(`✅ Total: ${items.length}`);
    return items;
}

// Fallback to fetch public playlist tracklists if API returns 403
async function fetchPlaylistTracksFromEmbed(playlistId) {
    try {
        const res = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`);
        if (!res.ok) return [];
        const html = await res.text();
        const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (!match) return [];
        const json = JSON.parse(match[1]);
        const entity = json.props?.pageProps?.state?.data?.entity;
        if (!entity || !entity.trackList) return [];

        return entity.trackList.map((t, idx) => {
            const trackId = t.uri ? t.uri.replace('spotify:track:', '') : `embed_${idx}`;
            return {
                id: trackId,
                name: t.title || 'Unknown Track',
                artists: [{ name: t.subtitle || '' }],
                artistNames: t.subtitle || '',
                album: {
                    name: entity.name || '',
                    releaseYear: ''
                },
                coverUrl: entity.coverArt?.sources?.[0]?.url || '',
                thumbnailUrl: entity.coverArt?.sources?.[entity.coverArt.sources.length - 1]?.url || entity.coverArt?.sources?.[0]?.url || '',
                durationMs: t.duration || 0,
                durationFormatted: formatDuration(t.duration || 0),
                previewUrl: t.audioPreview?.url || null,
                spotifyUrl: `https://open.spotify.com/track/${trackId}`,
                uri: t.uri
            };
        });
    } catch (e) {
        return [];
    }
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function main() {
    console.log('🚀 Starting Spotify Collection Sync & Backup...\n');
    
    const token = await getAccessToken();
    console.log('🔑 Fresh access token acquired.\n');

    const dataDir = path.resolve(process.cwd(), 'data');
    ensureDir(dataDir);

    // 1. User Profile
    console.log('👤 Fetching user profile...');
    const profile = await spotifyFetch('https://api.spotify.com/v1/me', token);
    const profileData = {
        id: profile.id,
        displayName: profile.display_name,
        email: profile.email,
        country: profile.country,
        product: profile.product,
        followers: profile.followers?.total || 0,
        images: profile.images || [],
        spotifyUrl: profile.external_urls?.spotify,
        lastSynced: new Date().toISOString()
    };
    writeJson(path.join(dataDir, 'profile.json'), profileData);
    console.log(`✅ Profile saved for ${profileData.displayName} (@${profileData.id})\n`);

    // 2. Liked Songs (Saved Tracks)
    const rawTracks = await fetchAllPages('https://api.spotify.com/v1/me/tracks?limit=50', token, 'Liked Songs');
    
    const likedSongs = rawTracks.map(item => {
        const t = item.track;
        if (!t) return null;
        
        const images = t.album?.images || [];
        const coverUrl = images[0]?.url || '';
        const thumbnailUrl = images[images.length - 1]?.url || coverUrl;

        const releaseDate = t.album?.release_date || '';
        const releaseYear = releaseDate.length >= 4 ? releaseDate.substring(0, 4) : 'Unknown';

        return {
            id: t.id,
            name: t.name,
            artists: (t.artists || []).map(a => ({ id: a.id, name: a.name })),
            artistNames: (t.artists || []).map(a => a.name).join(', '),
            album: {
                id: t.album?.id,
                name: t.album?.name,
                releaseDate: releaseDate,
                releaseYear: releaseYear,
                totalTracks: t.album?.total_tracks
            },
            coverUrl: coverUrl,
            thumbnailUrl: thumbnailUrl,
            durationMs: t.duration_ms,
            durationFormatted: formatDuration(t.duration_ms),
            explicit: t.explicit,
            popularity: t.popularity,
            previewUrl: t.preview_url,
            spotifyUrl: t.external_urls?.spotify,
            uri: t.uri,
            addedAt: item.added_at,
            addedDate: item.added_at ? item.added_at.substring(0, 10) : ''
        };
    }).filter(Boolean);

    writeJson(path.join(dataDir, 'liked-songs.json'), likedSongs);
    console.log(`💾 Saved ${likedSongs.length} Liked Songs to data/liked-songs.json\n`);

    // 3. Playlists & Full Tracklists Backup
    const rawPlaylists = await fetchAllPages('https://api.spotify.com/v1/me/playlists?limit=50', token, 'Playlists');
    console.log(`\n📑 Fetching complete tracklists for ${rawPlaylists.length} playlists...`);
    
    const playlistsDir = path.join(dataDir, 'playlists');
    ensureDir(playlistsDir);

    const playlists = [];
    for (const p of rawPlaylists) {
        let tracks = [];
        let rawTracks = [];
        try {
            rawTracks = await fetchAllPages(`https://api.spotify.com/v1/playlists/${p.id}/items?limit=100`, token, `"${p.name}"`);
        } catch (err) {
            // If Spotify API restricts followed playlist, fallback to embed endpoint
        }

        if (rawTracks && rawTracks.length > 0) {
            tracks = rawTracks.map(item => {
                const t = item.track || item.item;
                if (!t) return null;
                const images = t.album?.images || [];
                const releaseDate = t.album?.release_date || '';
                return {
                    id: t.id,
                    name: t.name,
                    artists: (t.artists || []).map(a => ({ id: a.id, name: a.name })),
                    artistNames: (t.artists || []).map(a => a.name).join(', '),
                    album: {
                        id: t.album?.id,
                        name: t.album?.name,
                        releaseDate: releaseDate,
                        releaseYear: releaseDate.length >= 4 ? releaseDate.substring(0, 4) : ''
                    },
                    coverUrl: images[0]?.url || '',
                    thumbnailUrl: images[images.length - 1]?.url || images[0]?.url || '',
                    durationMs: t.duration_ms,
                    durationFormatted: formatDuration(t.duration_ms),
                    previewUrl: t.preview_url,
                    spotifyUrl: t.external_urls?.spotify,
                    uri: t.uri,
                    addedAt: item.added_at,
                    addedDate: item.added_at ? item.added_at.substring(0, 10) : ''
                };
            }).filter(Boolean);
        }

        // If tracks still empty, fetch from public embed extractor
        if (tracks.length === 0) {
            process.stdout.write(`  🌐 Extracting "${p.name}" from public playlist data... `);
            const embedTracks = await fetchPlaylistTracksFromEmbed(p.id);
            if (embedTracks && embedTracks.length > 0) {
                tracks = embedTracks;
                console.log(`[${tracks.length} tracks extracted]`);
            } else {
                console.log(`[0 tracks]`);
            }
        }

        const playlistObj = {
            id: p.id,
            name: p.name,
            description: p.description || '',
            public: p.public,
            collaborative: p.collaborative,
            tracksTotal: tracks.length,
            images: p.images || [],
            coverUrl: p.images?.[0]?.url || (tracks[0]?.coverUrl || ''),
            owner: p.owner?.display_name || '',
            spotifyUrl: p.external_urls?.spotify,
            uri: p.uri,
            tracks: tracks
        };

        // Write individual playlist backup JSON file
        writeJson(path.join(playlistsDir, `${p.id}.json`), playlistObj);
        playlists.push(playlistObj);
    }

    writeJson(path.join(dataDir, 'playlists.json'), playlists);
    console.log(`💾 Saved ${playlists.length} Playlists with all tracklists to data/playlists.json and data/playlists/\n`);

    // 4. Saved Albums
    const rawAlbums = await fetchAllPages('https://api.spotify.com/v1/me/albums?limit=50', token, 'Saved Albums');
    const albums = rawAlbums.map(item => {
        const a = item.album;
        if (!a) return null;
        return {
            id: a.id,
            name: a.name,
            artists: (a.artists || []).map(art => ({ id: art.id, name: art.name })),
            artistNames: (a.artists || []).map(art => art.name).join(', '),
            releaseDate: a.release_date,
            releaseYear: a.release_date ? a.release_date.substring(0, 4) : 'Unknown',
            totalTracks: a.total_tracks,
            coverUrl: a.images?.[0]?.url || '',
            spotifyUrl: a.external_urls?.spotify,
            addedAt: item.added_at
        };
    }).filter(Boolean);
    writeJson(path.join(dataDir, 'albums.json'), albums);
    console.log(`💾 Saved ${albums.length} Saved Albums to data/albums.json\n`);

    // 5. Top Artists & Top Tracks (Long Term)
    console.log('🌟 Fetching Top Artists & Tracks...');
    let topArtists = [];
    let topTracks = [];
    try {
        const topArtistsData = await spotifyFetch('https://api.spotify.com/v1/me/top/artists?limit=50&time_range=long_term', token);
        topArtists = (topArtistsData.items || []).map((art, idx) => ({
            rank: idx + 1,
            id: art.id,
            name: art.name,
            genres: art.genres || [],
            popularity: art.popularity,
            imageUrl: art.images?.[0]?.url || '',
            followers: art.followers?.total || 0,
            spotifyUrl: art.external_urls?.spotify
        }));
        writeJson(path.join(dataDir, 'top-artists.json'), topArtists);

        const topTracksData = await spotifyFetch('https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=long_term', token);
        topTracks = (topTracksData.items || []).map((t, idx) => ({
            rank: idx + 1,
            id: t.id,
            name: t.name,
            artistNames: (t.artists || []).map(a => a.name).join(', '),
            albumName: t.album?.name || '',
            coverUrl: t.album?.images?.[0]?.url || '',
            previewUrl: t.preview_url,
            durationFormatted: formatDuration(t.duration_ms),
            spotifyUrl: t.external_urls?.spotify
        }));
        writeJson(path.join(dataDir, 'top-tracks.json'), topTracks);
        console.log(`✅ Saved Top Artists & Top Tracks\n`);
    } catch (e) {
        console.warn('⚠️ Could not fetch top artists/tracks:', e.message);
    }

    // 5.1 Fetch Artist Genres for Most Frequent Artists in Liked Songs (if permitted by Spotify)
    let artistGenresMap = {};
    try {
        const artistIdCount = {};
        likedSongs.forEach(song => {
            (song.artists || []).forEach(a => {
                if (a.id) artistIdCount[a.id] = (artistIdCount[a.id] || 0) + 1;
            });
        });
        const topArtistIds = Object.keys(artistIdCount).slice(0, 50);
        if (topArtistIds.length > 0) {
            const artistsData = await spotifyFetch(`https://api.spotify.com/v1/artists?ids=${topArtistIds.join(',')}`, token);
            (artistsData.artists || []).forEach(art => {
                if (art && art.genres) {
                    art.genres.forEach(g => {
                        artistGenresMap[g] = (artistGenresMap[g] || 0) + (artistIdCount[art.id] || 1);
                    });
                }
            });
        }
    } catch (e) {
        // Ignored if Spotify restricts bulk artist catalog endpoint
    }

    // 6. Generate Analytics & Stats Summary
    console.log('📊 Computing statistics & collection insights...');
    const stats = generateStats(likedSongs, playlists, albums, topArtists, artistGenresMap);
    writeJson(path.join(dataDir, 'stats.json'), stats);
    console.log('💾 Saved Stats to data/stats.json\n');

    console.log('🎉 Full Sync & Backup Complete!');
    console.log(`📈 Summary:`);
    console.log(`   - Liked Songs: ${likedSongs.length}`);
    console.log(`   - Total Playlists: ${playlists.length}`);
    console.log(`   - Saved Albums: ${albums.length}`);
    console.log(`   - Total Playtime: ${stats.totalDurationFormatted}`);
    console.log(`   - Unique Artists: ${stats.uniqueArtistsCount}\n`);
}

function formatDuration(ms) {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function generateStats(likedSongs, playlists, albums, topArtists, artistGenresMap = {}) {
    const totalMs = likedSongs.reduce((acc, s) => acc + (s.durationMs || 0), 0);
    const totalHours = (totalMs / (1000 * 60 * 60)).toFixed(1);
    const totalDays = (totalMs / (1000 * 60 * 60 * 24)).toFixed(1);

    // Artist frequency in liked songs
    const artistCounts = {};
    likedSongs.forEach(song => {
        (song.artists || []).forEach(a => {
            artistCounts[a.name] = (artistCounts[a.name] || 0) + 1;
        });
    });

    const topLikedArtists = Object.entries(artistCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);

    // Release Decade distribution
    const decadeCounts = {};
    const yearCounts = {};
    likedSongs.forEach(song => {
        const year = parseInt(song.album?.releaseYear, 10);
        if (!isNaN(year) && year > 1900 && year < 2100) {
            yearCounts[year] = (yearCounts[year] || 0) + 1;
            const decade = Math.floor(year / 10) * 10;
            decadeCounts[`${decade}s`] = (decadeCounts[`${decade}s`] || 0) + 1;
        }
    });

    // Added by Year / Month Timeline
    const addedByMonth = {};
    const addedByYear = {};
    likedSongs.forEach(song => {
        if (song.addedAt) {
            const yearMonth = song.addedAt.substring(0, 7); // YYYY-MM
            const year = song.addedAt.substring(0, 4);
            addedByMonth[yearMonth] = (addedByMonth[yearMonth] || 0) + 1;
            addedByYear[year] = (addedByYear[year] || 0) + 1;
        }
    });

    // Top Genres from Top Artists & Liked Artists
    const genreCounts = { ...artistGenresMap };
    topArtists.forEach(art => {
        (art.genres || []).forEach(g => {
            genreCounts[g] = (genreCounts[g] || 0) + 1;
        });
    });
    const topGenres = Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

    return {
        totalLikedSongs: likedSongs.length,
        totalPlaylists: playlists.length,
        totalSavedAlbums: albums.length,
        totalDurationMs: totalMs,
        totalDurationHours: parseFloat(totalHours),
        totalDurationDays: parseFloat(totalDays),
        totalDurationFormatted: `${Math.floor(totalMs / (1000 * 60 * 60))} hrs ${Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60))} mins`,
        uniqueArtistsCount: Object.keys(artistCounts).length,
        topLikedArtists,
        topGenres,
        decadeDistribution: decadeCounts,
        yearDistribution: yearCounts,
        addedByMonthTimeline: addedByMonth,
        addedByYearTimeline: addedByYear,
        lastUpdated: new Date().toISOString()
    };
}

main().catch(err => {
    console.error('❌ Sync failed:', err);
    process.exit(1);
});
