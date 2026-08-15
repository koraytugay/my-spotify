# 🎧 My Spotify Collection & Backup

Running at: https://koraytugay.github.io/my-spotify

A static web app and automated backup archive for your personal Spotify music library, built with HTML, CSS, and Vanilla JavaScript.

Inspired by [`my-board-game-collection`](https://github.com/koraytugay/my-board-game-collection).

---

## 🌟 Features
* **💚 Complete Liked Songs Archive**: All your saved/liked tracks backed up with metadata (artist, album, release year, cover art, Spotify link).
* **📑 Playlists Explorer**: Browse all your custom and followed playlists with complete song lists and "Group by Album" mode.
* **💿 Saved Albums**: Visual grid of all saved full albums.
* **👥 Followed Artists**: Visual gallery of all your followed and favorite artists with photos and direct Spotify links.
* **📊 Deep Statistics**: Top artists by track count, release decade distribution, most popular release years, and longest epic tracks.
* **🎲 Random Song Picker**: Pick random tracks from your collection with the `r` keyboard shortcut.
* **🔍 Search & Filter**: Real-time search, decade filters, and sorting.
* **🌓 Dark & Light Mode**: Built-in theme toggle with `localStorage` persistence.
* **⚡ 100% Static & Fast**: Zero backend required for hosting on **GitHub Pages**.
* **🤖 Automated Daily Backups**: GitHub Actions workflow syncs new additions daily and commits changes to Git.

---

## 🚀 Quick Start (Local)

### 1. View the Website
You can serve the static site locally with any static web server:
```bash
npx serve .
# or
python3 -m http.server 3000
```
Then open `http://localhost:3000` in your browser.

---

## 🔄 Updating Data

### Manual Sync (Local)
To update your collection anytime:
```bash
npm run sync
```

### Automated Sync (GitHub Actions)
1. In your GitHub repository, go to **Settings > Secrets and variables > Actions**.
2. Add the following repository secrets:
   * `SPOTIFY_CLIENT_ID`
   * `SPOTIFY_CLIENT_SECRET`
   * `SPOTIFY_REFRESH_TOKEN`
3. The workflow in `.github/workflows/update-spotify-backup.yml` will automatically run daily at 18:00 UTC (and can also be triggered manually under the **Actions** tab).
