// Artist Detail View - Pure Authentic Personal Spotify Archive
var artistInfo = null;
var allArtistAlbums = [];
var filteredAlbums = [];
var allArtistSongs = [];
var filteredSongs = [];
var allSavedAlbumsData = [];
var allLikedSongsData = [];
var currentAudio = null;
var currentPlayingId = null;

async function initArtistDetail() {
    const loadingEl = document.getElementById('loading');
    const viewEl = document.getElementById('artist-view');

    const params = new URLSearchParams(window.location.search);
    const artistId = params.get('id') || '';
    const artistName = params.get('name') || '';

    if (!artistId && !artistName) {
        loadingEl.innerHTML = `<p style="color: #ff5555;">No artist specified.</p>`;
        return;
    }

    try {
        const [followedArtists, topArtists, savedAlbums, likedSongs] = await Promise.all([
            getFollowedArtists(),
            getTopArtists(),
            getSavedAlbums(),
            getLikedSongs()
        ]);

        const allArtistsList = [...followedArtists, ...topArtists];
        
        // Find artist profile
        let matchedArtist = allArtistsList.find(a => 
            (artistId && a.id === artistId) || 
            (artistName && a.name && a.name.toLowerCase().trim() === artistName.toLowerCase().trim())
        );

        if (!matchedArtist) {
            matchedArtist = {
                id: artistId,
                name: artistName || 'Artist',
                genres: [],
                imageUrl: '',
                spotifyUrl: artistId ? `https://open.spotify.com/artist/${artistId}` : `https://open.spotify.com/search/${encodeURIComponent(artistName)}`
            };
        }

        artistInfo = matchedArtist;
        const canonicalName = (artistInfo.name || '').toLowerCase().trim();

        const isMatchingArtist = (artistsArr, artistNamesStr) => {
            if (artistId && Array.isArray(artistsArr) && artistsArr.some(a => a.id === artistId)) return true;
            if (Array.isArray(artistsArr) && artistsArr.some(a => a.name && a.name.toLowerCase().trim() === canonicalName)) return true;
            if (artistNamesStr) {
                const names = artistNamesStr.toLowerCase().split(/,\s*|\s*&\s*|\s*feat\.?\s*/);
                if (names.some(n => n.trim() === canonicalName)) return true;
            }
            return false;
        };

        allSavedAlbumsData = savedAlbums || [];
        allLikedSongsData = likedSongs || [];

        const albumMap = new Map();

        (savedAlbums || []).forEach(a => {
            if (isMatchingArtist(a.artists, a.artistNames)) {
                const normName = (a.name || '').toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
                const key = a.id || normName;
                if (!albumMap.has(key)) {
                    albumMap.set(key, {
                        id: a.id,
                        name: a.name,
                        artists: a.artists || [],
                        artistNames: a.artistNames || artistInfo.name,
                        coverUrl: a.coverUrl,
                        releaseYear: a.releaseYear,
                        releaseDate: a.releaseDate || (a.releaseYear ? `${a.releaseYear}-01-01` : ''),
                        totalTracks: a.totalTracks || (a.tracks ? a.tracks.length : 0),
                        tracks: a.tracks || [],
                        spotifyUrl: a.spotifyUrl || `https://open.spotify.com/album/${a.id}`,
                        isSaved: true
                    });
                }
            }
        });

        allArtistSongs = (likedSongs || []).filter(s => isMatchingArtist(s.artists, s.artistNames));

        allArtistAlbums = Array.from(albumMap.values());
        filteredAlbums = [...allArtistAlbums];
        filteredSongs = [...allArtistSongs];

        if (!artistInfo.imageUrl && allArtistAlbums.length > 0) {
            artistInfo.imageUrl = allArtistAlbums[0].coverUrl;
        }

        // Populate Hero Header
        const spotifyUrl = getSpotifyUri(artistInfo, 'artist');

        const heroTitleEl = document.getElementById('hero-title');
        if (heroTitleEl) heroTitleEl.textContent = artistInfo.name;

        const heroImgEl = document.getElementById('hero-img');
        if (heroImgEl) heroImgEl.src = artistInfo.imageUrl || 'https://via.placeholder.com/300x300?text=Artist';
        
        const genresText = (artistInfo.genres && artistInfo.genres.length > 0) 
            ? artistInfo.genres.join(' · ') 
            : '';
        const heroGenresEl = document.getElementById('hero-genres');
        if (heroGenresEl) heroGenresEl.textContent = genresText;

        document.getElementById('hero-album-count').textContent = `${allArtistAlbums.length} saved ${allArtistAlbums.length === 1 ? 'album' : 'albums'}`;
        document.getElementById('hero-track-count').textContent = `${allArtistSongs.length} liked ${allArtistSongs.length === 1 ? 'song' : 'songs'}`;

        const heroLinkEl = document.getElementById('hero-spotify-link');
        if (heroLinkEl) {
            heroLinkEl.href = spotifyUrl;
            heroLinkEl.removeAttribute('target');
        }

        // Default sort chronologically (Oldest to Newest)
        allArtistAlbums.sort((a, b) => {
            const yearA = parseInt(a.releaseYear) || 0;
            const yearB = parseInt(b.releaseYear) || 0;
            if (yearA !== yearB) return yearA - yearB;
            const dateA = a.releaseDate || '';
            const dateB = b.releaseDate || '';
            const cmpDate = dateA.localeCompare(dateB);
            if (cmpDate !== 0) return cmpDate;
            return (a.name || '').localeCompare(b.name || '');
        });

        allArtistSongs.sort((a, b) => {
            const yearA = parseInt(a.album?.releaseYear) || 0;
            const yearB = parseInt(b.album?.releaseYear) || 0;
            if (yearA !== yearB) return yearA - yearB;
            const dateA = a.album?.releaseDate || '';
            const dateB = b.album?.releaseDate || '';
            const cmpDate = dateA.localeCompare(dateB);
            if (cmpDate !== 0) return cmpDate;
            return (a.name || '').localeCompare(b.name || '');
        });

        filteredAlbums = [...allArtistAlbums];
        filteredSongs = [...allArtistSongs];

        renderArtistAlbums();
        renderArtistSongs();

        loadingEl.style.display = 'none';
        viewEl.style.display = 'block';

    } catch (e) {
        console.error('Error loading artist details:', e);
        loadingEl.innerHTML = `<p style="color: #ff5555;">Error loading artist content: ${e.message}</p>`;
    }
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function renderArtistAlbums() {
    const grid = document.getElementById('albums-grid');
    const noAlbums = document.getElementById('no-albums');
    const mixBtn = document.getElementById('mix-all-albums-btn');

    if (filteredAlbums.length === 0) {
        grid.innerHTML = '';
        if (noAlbums) noAlbums.style.display = 'block';
        if (mixBtn) mixBtn.style.display = 'none';
        return;
    }

    if (noAlbums) noAlbums.style.display = 'none';
    if (mixBtn) mixBtn.style.display = 'inline-flex';
    grid.innerHTML = '';

    filteredAlbums.forEach(a => {
        const card = document.createElement('div');
        card.className = 'song-card';
        const cover = a.coverUrl || 'https://via.placeholder.com/300x300?text=Album';
        const albumDetailUrl = `album.html?id=${encodeURIComponent(a.id)}`;

        let artistsHtml = '';
        if (Array.isArray(a.artists) && a.artists.length > 0) {
            artistsHtml = a.artists.map(art => {
                const url = art.id ? `artist.html?id=${encodeURIComponent(art.id)}&name=${encodeURIComponent(art.name)}` : `artist.html?name=${encodeURIComponent(art.name)}`;
                return `<a href="${url}" class="artist-link">${art.name}</a>`;
            }).join(', ');
        } else if (a.artistNames) {
            artistsHtml = `<a href="artist.html?name=${encodeURIComponent(a.artistNames)}" class="artist-link">${a.artistNames}</a>`;
        } else {
            artistsHtml = `<span class="artist-link">${artistInfo ? artistInfo.name : 'Artist'}</span>`;
        }
        const releaseYear = a.releaseYear ? ` (${a.releaseYear})` : '';

        card.innerHTML = `
            <a href="${albumDetailUrl}" class="cover-wrapper" style="display: block; text-decoration: none;">
                <img src="${cover}" alt="${a.name}" class="cover-img" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/300x300?text=Album';">
            </a>
            <div class="song-details">
                <div class="song-title">
                    <a href="${albumDetailUrl}" class="song-title-link">${a.name}</a>
                </div>
                <div class="song-artist">${artistsHtml}<span class="album-year">${releaseYear}</span></div>
            </div>
        `;

        grid.appendChild(card);
    });
}

function togglePlayAlbum(id) {
    if (window.miniPlayer) {
        const album = (filteredAlbums || []).find(a => a.id === id) || (allArtistAlbums || []).find(a => a.id === id) || { id };
        window.miniPlayer.playItem(album, 'album');
    }
}

async function mixAllArtistAlbums() {
    const albums = allArtistAlbums || filteredAlbums || [];
    if (!albums || albums.length === 0) {
        alert('No saved albums found for this artist.');
        return;
    }

    const playBtn = document.getElementById('mix-all-albums-btn');
    const origText = playBtn ? playBtn.innerHTML : 'Mix All Album Tracks';
    const artistName = (artistInfo && artistInfo.name) ? artistInfo.name : 'Artist';
    const mixTitle = `${artistName} - Albums Mix`;

    // 1. Collect all tracks across all saved albums
    let combinedTracks = [];
    const seenTrackKeys = new Set();

    albums.forEach(album => {
        let albumTracks = (Array.isArray(album.tracks) && album.tracks.length > 0) ? album.tracks : [];

        // Fallback: look up in raw allSavedAlbumsData
        if (albumTracks.length === 0 && Array.isArray(allSavedAlbumsData)) {
            const raw = allSavedAlbumsData.find(sa => sa && (sa.id === album.id || (sa.name && album.name && sa.name.toLowerCase().trim() === album.name.toLowerCase().trim())));
            if (raw && Array.isArray(raw.tracks) && raw.tracks.length > 0) {
                albumTracks = raw.tracks;
            }
        }

        // Fallback: look up in allLikedSongsData for matching album tracks
        if (albumTracks.length === 0 && Array.isArray(allLikedSongsData)) {
            albumTracks = allLikedSongsData.filter(s => s && ((s.album && s.album.id === album.id) || (s.album && s.album.name && album.name && s.album.name.toLowerCase().trim() === album.name.toLowerCase().trim())));
        }

        albumTracks.forEach(t => {
            if (!t) return;
            const key = t.id || `${(t.name || '').toLowerCase()}:::${(album.name || '').toLowerCase()}`;
            if (!seenTrackKeys.has(key)) {
                seenTrackKeys.add(key);
                combinedTracks.push({
                    ...t,
                    artistNames: t.artistNames || (t.artists && t.artists.map(art => art.name).join(', ')) || album.artistNames || artistName,
                    album: {
                        id: album.id,
                        name: album.name,
                        coverUrl: album.coverUrl,
                        releaseYear: album.releaseYear
                    },
                    coverUrl: t.coverUrl || album.coverUrl
                });
            }
        });
    });

    if (combinedTracks.length === 0) {
        alert('No tracks found in the saved albums.');
        return;
    }

    // 2. Shuffle tracks
    const shuffledTracks = shuffleArray(combinedTracks);

    const token = typeof getValidSpotifyToken === 'function' ? await getValidSpotifyToken().catch(() => null) : null;

    if (token && typeof syncTracksToSmartMix === 'function') {
        if (playBtn) {
            playBtn.disabled = true;
            playBtn.innerHTML = `Creating Playlist...`;
        }

        try {
            const playlistId = await syncTracksToSmartMix(
                shuffledTracks, 
                mixTitle, 
                true
            );

            if (playlistId && window.miniPlayer) {
                if (playBtn) playBtn.innerHTML = `Loading Music...`;
                await new Promise(resolve => setTimeout(resolve, 1600));
                window.miniPlayer.playItem({ id: playlistId, name: mixTitle, tracks: shuffledTracks }, 'playlist');
                return;
            }
        } catch (e) {
            console.error('Error creating album mix playlist:', e);
        } finally {
            if (playBtn) {
                playBtn.disabled = false;
                playBtn.innerHTML = origText;
            }
        }
    }

    // Fallback: If not logged in via Spotify OAuth, play the tracks queue directly in collection mode
    if (window.miniPlayer) {
        window.miniPlayer.playlist = shuffledTracks;
        window.miniPlayer.currentType = 'playlist';
        window.miniPlayer.contextTitle = mixTitle;
        window.miniPlayer.playTrack(shuffledTracks[0], shuffledTracks);
    }
}
window.mixAllArtistAlbums = mixAllArtistAlbums;

async function playAllArtistLikedSongs() {
    if (!allArtistSongs || allArtistSongs.length === 0) return;

    const playBtn = document.getElementById('play-all-liked-btn');
    const origText = playBtn ? playBtn.innerHTML : 'Play All Liked Songs';
    const artistName = (artistInfo && artistInfo.name) ? artistInfo.name : 'Artist';
    const playlistTitle = `${artistName} Liked Songs`;

    const token = typeof getValidSpotifyToken === 'function' ? await getValidSpotifyToken().catch(() => null) : null;

    if (token && typeof syncTracksToSmartMix === 'function') {
        if (playBtn) {
            playBtn.disabled = true;
            playBtn.innerHTML = `Creating Playlist...`;
        }

        try {
            const playlistId = await syncTracksToSmartMix(
                allArtistSongs, 
                playlistTitle, 
                true
            );

            if (playlistId && window.miniPlayer) {
                if (playBtn) playBtn.innerHTML = `Loading Music...`;
                await new Promise(resolve => setTimeout(resolve, 1600));
                window.miniPlayer.playItem({ id: playlistId, name: playlistTitle, tracks: allArtistSongs }, 'playlist');
                return;
            }
        } catch (e) {
            console.error('Error generating artist liked playlist:', e);
        } finally {
            if (playBtn) {
                playBtn.disabled = false;
                playBtn.innerHTML = origText;
            }
        }
    }

    // Fallback: If not logged in via Spotify OAuth, play the tracks queue directly in collection mode
    if (window.miniPlayer) {
        window.miniPlayer.playlist = allArtistSongs;
        window.miniPlayer.currentType = 'playlist';
        window.miniPlayer.contextTitle = playlistTitle;
        window.miniPlayer.playTrack(allArtistSongs[0], allArtistSongs);
    }
}
window.playAllArtistLikedSongs = playAllArtistLikedSongs;

function renderArtistSongs() {
    const grid = document.getElementById('songs-grid');
    const noSongs = document.getElementById('no-songs');

    if (filteredSongs.length === 0) {
        grid.innerHTML = '';
        if (noSongs) noSongs.style.display = 'block';
        return;
    }

    if (noSongs) noSongs.style.display = 'none';
    grid.innerHTML = '';

    const currentArtName = (artistInfo ? artistInfo.name : '').toLowerCase().trim();

    filteredSongs.forEach(song => {
        const card = document.createElement('div');
        card.className = 'song-card';

        const cover = song.coverUrl || song.thumbnailUrl || 'https://via.placeholder.com/300x300?text=No+Cover';

        // Featured artists (excluding current artist)
        let featuredArtistsHtml = '';
        if (Array.isArray(song.artists) && song.artists.length > 1) {
            const featArtists = song.artists.filter(a => (a.name || '').toLowerCase().trim() !== currentArtName);
            if (featArtists.length > 0) {
                featuredArtistsHtml = `feat. ` + featArtists.map(a => {
                    const url = a.id ? `artist.html?id=${encodeURIComponent(a.id)}&name=${encodeURIComponent(a.name)}` : `artist.html?name=${encodeURIComponent(a.name)}`;
                    return `<a href="${url}" class="artist-link">${a.name}</a>`;
                }).join(', ');
            }
        }

        // Album link opening directly in Spotify
        const albumName = song.album?.name || '';
        const releaseYear = song.album?.releaseYear ? ` (${song.album.releaseYear})` : '';
        let albumHtml = '';
        if (albumName) {
            const { href: albumSpotifyUrl, targetAttrs } = getSpotifyLinkAttrs(song.album || { id: song.album?.id }, 'album');
            albumHtml = `<a href="${albumSpotifyUrl}" ${targetAttrs} class="album-link" title="Open Album in Spotify">${albumName}</a><span class="album-year">${releaseYear}</span>`;
        } else if (releaseYear) {
            albumHtml = `<span class="album-year">${releaseYear}</span>`;
        }

        // Track link
        const { href: trackSpotifyUrl, targetAttrs: trackTarget } = getSpotifyLinkAttrs(song, 'track');

        let metaSubtext = '';
        if (featuredArtistsHtml && albumHtml) {
            metaSubtext = `${featuredArtistsHtml} · ${albumHtml}`;
        } else if (featuredArtistsHtml) {
            metaSubtext = featuredArtistsHtml;
        } else if (albumHtml) {
            metaSubtext = albumHtml;
        }

        card.innerHTML = `
            <div class="cover-wrapper">
                <img src="${cover}" alt="${song.name}" class="cover-img" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/300x300?text=No+Cover';">
            </div>
            <div class="song-details">
                <div class="song-title">${song.name}</div>
                ${metaSubtext ? `<div class="song-artist">${metaSubtext}</div>` : ''}
            </div>
            <div class="song-meta" style="display: flex; align-items: center; gap: 16px; margin-left: auto;">
                <button class="album-card-btn album-card-play-btn" onclick="togglePlayPreview('${song.id}')" title="Play Track" aria-label="Play Track">
                    ▶
                </button>
                <a href="${trackSpotifyUrl}" ${trackTarget} class="album-card-btn album-card-spotify-btn" title="Open in Spotify" aria-label="Open in Spotify">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                </a>
            </div>
        `;

        grid.appendChild(card);
    });
}

function togglePlayPreview(id) {
    if (window.miniPlayer) {
        const song = (allArtistSongs || []).find(s => s.id === id) || { id };
        window.miniPlayer.currentType = 'track';
        window.miniPlayer.contextTitle = (typeof artistInfo !== 'undefined' && artistInfo?.name) ? artistInfo.name : 'Artist';
        window.miniPlayer.playTrack(song, allArtistSongs);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initArtistDetail);
} else {
    initArtistDetail();
}
