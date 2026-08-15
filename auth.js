import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import crypto from 'node:crypto';

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

function updateEnv(key, value) {
    const envPath = path.resolve(process.cwd(), '.env');
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
    } else {
        content = content.trim() + `\n${key}=${value}\n`;
    }
    fs.writeFileSync(envPath, content, 'utf8');
}

const env = loadEnv();
const CLIENT_ID = env.SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = env.SPOTIFY_CLIENT_SECRET || process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = env.SPOTIFY_REDIRECT_URI || process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback';
const PORT = 8888;

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Error: SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET missing in .env file!');
    process.exit(1);
}

const SCOPES = [
    'user-library-read',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-top-read',
    'user-read-recently-played',
    'user-read-private',
    'user-read-email'
].join(' ');

const state = crypto.randomBytes(16).toString('hex');
const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state: state,
    show_dialog: 'true'
}).toString()}`;

const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
    
    if (reqUrl.pathname === '/callback') {
        const code = reqUrl.searchParams.get('code');
        const returnedState = reqUrl.searchParams.get('state');
        const error = reqUrl.searchParams.get('error');

        if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h1>Authentication Failed</h1><p>Error: ${error}</p>`);
            console.error(`❌ Spotify Auth Error: ${error}`);
            server.close();
            process.exit(1);
            return;
        }

        if (returnedState !== state) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h1>State Mismatch</h1><p>Security check failed. Please retry.</p>`);
            server.close();
            process.exit(1);
            return;
        }

        try {
            console.log('🔄 Exchanging authorization code for tokens...');
            const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
            const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${authHeader}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    redirect_uri: REDIRECT_URI
                })
            });

            if (!tokenResponse.ok) {
                const errText = await tokenResponse.text();
                throw new Error(`Token request failed: ${tokenResponse.status} ${errText}`);
            }

            const tokenData = await tokenResponse.json();
            const refreshToken = tokenData.refresh_token;

            if (!refreshToken) {
                throw new Error('No refresh token received from Spotify.');
            }

            updateEnv('SPOTIFY_REFRESH_TOKEN', refreshToken);

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Spotify Auth Success</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 50px; background: #121212; color: #fff; }
                        .card { background: #181818; max-width: 500px; margin: auto; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
                        .check { font-size: 64px; color: #1ed760; }
                        h1 { margin-top: 10px; font-size: 24px; }
                        p { color: #b3b3b3; line-height: 1.6; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="check">✓</div>
                        <h1>Spotify Authorization Successful!</h1>
                        <p>Your permanent Refresh Token has been securely saved to <code>.env</code>.</p>
                        <p>You can close this tab and return to the terminal.</p>
                    </div>
                </body>
                </html>
            `);

            console.log('\n✅ Success! SPOTIFY_REFRESH_TOKEN saved to .env.');
            console.log('🎉 You are now ready to run the data sync script (`npm run sync`).\n');
            
            setTimeout(() => {
                server.close();
                process.exit(0);
            }, 1000);

        } catch (err) {
            console.error('❌ Error getting token:', err.message);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h1>Error</h1><p>${err.message}</p>`);
            server.close();
            process.exit(1);
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🎧 Spotify Authentication Server running on port ${PORT}`);
    console.log(`======================================================\n`);
    console.log(`Opening your browser to authorize with Spotify...`);
    console.log(`If it doesn't open automatically, visit this URL:\n`);
    console.log(authUrl);
    console.log(`\nWaiting for authorization callback...\n`);

    // Automatically open in default browser on macOS
    exec(`open "${authUrl}"`, (err) => {
        if (err) {
            console.log('👉 Please copy and paste the link above into your browser.');
        }
    });
});
