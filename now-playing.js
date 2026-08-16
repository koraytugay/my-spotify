// Currently Playing View - High-Res Artwork Showcase, Liked Status & Up Next Queue

var currentQueueTracks = [];
var currentActiveTrack = null;
var likedSongsIdSet = new Set();
var likedSongsKeySet = new Set();

function getNormalizedKey(name, artist) {
    const cleanName = (name || '').toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
    const cleanArtist = (artist || '').toLowerCase().trim();
    return `${cleanName}:::${cleanArtist}`;
}

async function loadLikedSongsSet() {
    try {
        const likedSongs = await getLikedSongs();
        if (Array.isArray(likedSongs)) {
            likedSongs.forEach(s => {
                if (s.id) likedSongsIdSet.add(s.id);
                likedSongsKeySet.add(getNormalizedKey(s.name, s.artistNames || (s.artists ? s.artists.map(a => a.name).join(', ') : '')));
            });
        }

        // Also load any locally marked likes
        try {
            const localLikes = JSON.parse(localStorage.getItem('my_local_liked_songs') || '[]');
            if (Array.isArray(localLikes)) {
                localLikes.forEach(s => {
                    if (s.id) likedSongsIdSet.add(s.id);
                    likedSongsKeySet.add(getNormalizedKey(s.name, s.artistNames));
                });
            }
        } catch (e) {}
    } catch (e) {
        console.error('Error loading liked songs set:', e);
    }
}

function isTrackInLikedSongs(track) {
    if (!track) return false;
    if (track.id && likedSongsIdSet.has(track.id)) return true;
    const artist = track.artistNames || (track.artists ? track.artists.map(a => a.name).join(', ') : '');
    const key = getNormalizedKey(track.name, artist);
    return likedSongsKeySet.has(key);
}

async function initNowPlaying() {
    const loadingEl = document.getElementById('loading');
    const contentEl = document.getElementById('now-playing-content');

    loadThemePreference();

    try {
        await loadLikedSongsSet();

        const urlParams = new URLSearchParams(window.location.search);
        const albumIdParam = urlParams.get('albumId') || urlParams.get('album');
        const playlistIdParam = urlParams.get('playlistId') || urlParams.get('playlist');
        const trackIdParam = urlParams.get('trackId') || urlParams.get('track');

        let handledByParam = false;

        if (albumIdParam) {
            try {
                const albums = await getSavedAlbums();
                const foundAlbum = (albums || []).find(a => a.id === albumIdParam);
                if (foundAlbum && Array.isArray(foundAlbum.tracks) && foundAlbum.tracks.length > 0) {
                    currentQueueTracks = foundAlbum.tracks;
                    const trackIdx = trackIdParam ? foundAlbum.tracks.findIndex(t => t.id === trackIdParam) : 0;
                    currentActiveTrack = trackIdx !== -1 ? foundAlbum.tracks[trackIdx] : foundAlbum.tracks[0];
                    if (window.miniPlayer) {
                        window.miniPlayer.playlist = foundAlbum.tracks;
                        window.miniPlayer.currentTrack = currentActiveTrack;
                        window.miniPlayer.currentType = 'album';
                        window.miniPlayer.contextTitle = foundAlbum.name || 'Album';
                        window.miniPlayer.playTrack(currentActiveTrack, foundAlbum.tracks);
                    }
                    handledByParam = true;
                }
            } catch (e) {
                console.error('Error loading album by query param:', e);
            }
        } else if (playlistIdParam) {
            try {
                const fullPlaylist = await getPlaylistById(playlistIdParam);
                if (fullPlaylist && Array.isArray(fullPlaylist.tracks) && fullPlaylist.tracks.length > 0) {
                    currentQueueTracks = fullPlaylist.tracks;
                    const trackIdx = trackIdParam ? fullPlaylist.tracks.findIndex(t => t.id === trackIdParam) : 0;
                    currentActiveTrack = trackIdx !== -1 ? fullPlaylist.tracks[trackIdx] : fullPlaylist.tracks[0];
                    if (window.miniPlayer) {
                        window.miniPlayer.playlist = fullPlaylist.tracks;
                        window.miniPlayer.currentTrack = currentActiveTrack;
                        window.miniPlayer.currentType = 'playlist';
                        window.miniPlayer.contextTitle = fullPlaylist.name || 'Playlist';
                        window.miniPlayer.playTrack(currentActiveTrack, fullPlaylist.tracks);
                    }
                    handledByParam = true;
                }
            } catch (e) {
                console.error('Error loading playlist by query param:', e);
            }
        }

        if (!handledByParam) {
            // Ensure we have an active queue from player or fallback to Liked Songs
            if (window.miniPlayer && window.miniPlayer.playlist && window.miniPlayer.playlist.length > 0) {
                currentQueueTracks = window.miniPlayer.playlist;
                currentActiveTrack = window.miniPlayer.currentTrack || currentQueueTracks[0];
            } else {
                const likedSongs = await getLikedSongs();
                currentQueueTracks = Array.isArray(likedSongs)
                    ? (typeof deduplicateSongs === 'function' ? deduplicateSongs(likedSongs) : likedSongs)
                    : [];
                
                if (trackIdParam) {
                    const foundTrack = currentQueueTracks.find(t => t.id === trackIdParam);
                    if (foundTrack) currentActiveTrack = foundTrack;
                }

                if (!currentActiveTrack && currentQueueTracks.length > 0) {
                    currentActiveTrack = currentQueueTracks[0];
                }
            }
        }

        renderNowPlayingHero(currentActiveTrack, window.miniPlayer?.isPlaying || false);
        renderQueueList(currentActiveTrack, currentQueueTracks);

        // Bind Hero Controls
        bindHeroControls();

        // Real-time state subscription
        if (window.miniPlayer) {
            window.miniPlayer.onStateChange(({ isPlaying, currentTrack, currentTrackId }) => {
                const track = currentTrack || currentQueueTracks.find(t => t.id === currentTrackId) || currentActiveTrack;
                currentActiveTrack = track;
                if (window.miniPlayer.playlist && window.miniPlayer.playlist.length > 0) {
                    currentQueueTracks = window.miniPlayer.playlist;
                }
                renderNowPlayingHero(track, isPlaying);
                renderQueueList(track, currentQueueTracks);
            });
        }

        // Periodic state verification (every 1 second) to keep UI 100% in sync
        setInterval(() => {
            if (window.miniPlayer && window.miniPlayer.currentTrack) {
                const track = window.miniPlayer.currentTrack;
                const isPlaying = window.miniPlayer.isPlaying;
                if (track && (track.id !== currentActiveTrack?.id || track.name !== currentActiveTrack?.name)) {
                    currentActiveTrack = track;
                    if (window.miniPlayer.playlist && window.miniPlayer.playlist.length > 0) {
                        currentQueueTracks = window.miniPlayer.playlist;
                    }
                    renderNowPlayingHero(track, isPlaying);
                    renderQueueList(track, currentQueueTracks);
                }
            }
        }, 1000);

        if (loadingEl) loadingEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';
    } catch (e) {
        console.error('Error loading Now Playing view:', e);
        if (loadingEl) {
            loadingEl.innerHTML = `<p style="color: #ff5555;">Could not load Now Playing (${e.message}).</p>`;
        }
    }
}

function renderNowPlayingHero(track, isPlaying) {
    if (!track) return;

    const coverEl = document.getElementById('np-hero-cover');
    const titleEl = document.getElementById('np-hero-title');
    const artistEl = document.getElementById('np-hero-artist');
    const albumEl = document.getElementById('np-hero-album');
    const eqEl = document.getElementById('np-hero-eq');
    const playIconEl = document.getElementById('np-hero-play-icon');
    const spotifyLinkEl = document.getElementById('np-hero-spotify-link');

    const coverUrl = track.coverUrl || track.thumbnailUrl || (track.images && track.images[0]?.url) || 'https://via.placeholder.com/400x400?text=Spotify';
    if (coverEl) {
        coverEl.src = coverUrl;
        coverEl.alt = track.name || 'Cover';
    }

    const backdropEl = document.getElementById('np-backdrop-aura');
    if (backdropEl && coverUrl) {
        backdropEl.style.backgroundImage = `url("${coverUrl}")`;
    }

    if (titleEl) {
        titleEl.textContent = track.name || 'Untitled';
        titleEl.title = track.name || '';
    }

    if (artistEl) {
        let artistHtml = '';
        if (Array.isArray(track.artists) && track.artists.length > 0) {
            artistHtml = track.artists.map(a => {
                return `<a href="artist.html?name=${encodeURIComponent(a.name)}" class="hero-artist-link">${a.name}</a>`;
            }).join(', ');
        } else if (track.artistNames) {
            artistHtml = `<a href="artist.html?name=${encodeURIComponent(track.artistNames)}" class="hero-artist-link">${track.artistNames}</a>`;
        } else {
            artistHtml = 'Unknown Artist';
        }
        artistEl.innerHTML = artistHtml;
    }

    const badgeEl = document.getElementById('queue-context-badge');
    if (badgeEl) {
        const type = window.miniPlayer?.currentType || 'track';
        const contextTitle = window.miniPlayer?.contextTitle;
        if (type === 'playlist') {
            badgeEl.textContent = contextTitle ? `Playing Playlist: ${contextTitle}` : `Playing from Playlist`;
        } else if (type === 'album') {
            badgeEl.textContent = contextTitle ? `Playing Album: ${contextTitle}` : `Playing from Album`;
        } else {
            badgeEl.textContent = `Playing from Liked Songs`;
        }
    }

    if (albumEl) {
        const albumName = track.album?.name || '';
        const releaseYear = track.album?.releaseYear ? ` (${track.album.releaseYear})` : (track.releaseYear ? ` (${track.releaseYear})` : '');
        const durationText = track.durationFormatted ? ` • ⏱ ${track.durationFormatted}` : '';
        albumEl.textContent = `${albumName}${releaseYear}${durationText}`;
    }

    if (eqEl) {
        eqEl.classList.toggle('playing', !!isPlaying);
    }

    if (playIconEl) {
        playIconEl.textContent = isPlaying ? '⏸' : '▶';
    }

    if (spotifyLinkEl) {
        const type = window.miniPlayer?.currentType || 'track';
        if (typeof getSpotifyLinkAttrs === 'function') {
            const { href, targetAttrs } = getSpotifyLinkAttrs(track, type);
            spotifyLinkEl.href = href;
            if (targetAttrs && targetAttrs.includes('_blank')) {
                spotifyLinkEl.target = '_blank';
                spotifyLinkEl.rel = 'noopener noreferrer';
            } else {
                spotifyLinkEl.removeAttribute('target');
                spotifyLinkEl.removeAttribute('rel');
            }
        } else {
            spotifyLinkEl.href = track.spotifyUrl || `https://open.spotify.com/${type}/${track.id}`;
            spotifyLinkEl.target = '_blank';
        }
    }
}

var renderedQueueKey = '';
var lastRenderedTrackId = null;

function updateQueueItemClasses(activeIdx, queueList) {
    const listEl = document.getElementById('queue-track-list');
    if (!listEl) return;
    const items = listEl.querySelectorAll('.queue-track-item');
    items.forEach((el, idx) => {
        const isCurrent = idx === activeIdx;
        const isPlayed = idx < activeIdx;
        el.className = `queue-track-item ${isCurrent ? 'is-current' : (isPlayed ? 'is-played' : 'is-upcoming')}`;
        const numEl = el.querySelector('.queue-track-num');
        if (numEl) {
            numEl.innerHTML = isCurrent ? '<span class="queue-current-indicator">▶</span>' : (queueList[idx]?.trackNumber || (idx + 1));
        }
    });

    const badgeEl = document.getElementById('queue-count-badge');
    if (badgeEl) {
        badgeEl.textContent = `${activeIdx + 1} of ${queueList.length} tracks`;
    }
}

function renderQueueList(activeTrack, queueList) {
    const listEl = document.getElementById('queue-track-list');
    const badgeEl = document.getElementById('queue-count-badge');
    if (!listEl) return;

    if (!Array.isArray(queueList) || queueList.length === 0) {
        listEl.innerHTML = `<div class="empty-queue-msg">Queue is empty. Select any track to start.</div>`;
        if (badgeEl) badgeEl.textContent = '0 tracks';
        renderedQueueKey = '';
        return;
    }

    const currentIndex = queueList.findIndex(t => t.id === activeTrack?.id);
    const activeIdx = currentIndex !== -1 ? currentIndex : 0;
    const queueKey = queueList.map(t => t.id).join(',');

    // If the queue list is already rendered in the DOM, update classes in place to preserve scroll position!
    if (renderedQueueKey === queueKey && listEl.children.length === queueList.length) {
        if (lastRenderedTrackId !== activeTrack?.id) {
            updateQueueItemClasses(activeIdx, queueList);
            lastRenderedTrackId = activeTrack?.id;
        }
        return;
    }

    renderedQueueKey = queueKey;
    lastRenderedTrackId = activeTrack?.id;

    if (badgeEl) {
        badgeEl.textContent = `${activeIdx + 1} of ${queueList.length} tracks`;
    }

    listEl.innerHTML = '';

    queueList.forEach((track, idx) => {
        const isCurrent = idx === activeIdx;
        const isPlayed = idx < activeIdx;

        const itemEl = document.createElement('div');
        itemEl.className = `queue-track-item ${isCurrent ? 'is-current' : (isPlayed ? 'is-played' : 'is-upcoming')}`;
        itemEl.onclick = () => {
            if (window.miniPlayer) {
                window.miniPlayer.playTrack(track, queueList);
            }
        };

        const cover = track.coverUrl || track.thumbnailUrl || 'https://via.placeholder.com/48x48?text=Song';
        const artistText = track.artistNames || (track.artists ? track.artists.map(a => a.name).join(', ') : 'Unknown Artist');
        const durationText = track.durationFormatted || '';
        const isLiked = isTrackInLikedSongs(track);
        const likedHtml = isLiked ? `<span class="queue-liked-icon" title="In your Liked Songs collection">💚</span>` : '';
        const trackNumDisplay = isCurrent ? `<span class="queue-current-indicator">▶</span>` : (track.trackNumber || (idx + 1));

        itemEl.innerHTML = `
            <div class="queue-track-num">${trackNumDisplay}</div>
            <div class="queue-cover-wrap">
                <img src="${cover}" alt="${track.name}" class="queue-cover-img" loading="lazy">
                <div class="queue-play-hover">▶</div>
            </div>
            <div class="queue-track-meta">
                <div class="queue-track-title">${track.name || 'Untitled'}</div>
                <div class="queue-track-artist">${artistText}</div>
            </div>
            <div class="queue-track-liked">${likedHtml}</div>
            <div class="queue-track-duration">${durationText}</div>
        `;

        listEl.appendChild(itemEl);
    });
}

function bindHeroControls() {
    const playBtn = document.getElementById('np-hero-play');
    const prevBtn = document.getElementById('np-hero-prev');
    const nextBtn = document.getElementById('np-hero-next');

    if (playBtn) {
        playBtn.onclick = () => {
            if (window.miniPlayer) {
                window.miniPlayer.togglePlayPause();
            }
        };
    }

    if (prevBtn) {
        prevBtn.onclick = () => {
            if (window.miniPlayer) {
                window.miniPlayer.playPrevious();
            }
        };
    }

    if (nextBtn) {
        nextBtn.onclick = () => {
            if (window.miniPlayer) {
                window.miniPlayer.playNext();
            }
        };
    }
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
    document.addEventListener('DOMContentLoaded', initNowPlaying);
} else {
    initNowPlaying();
}
