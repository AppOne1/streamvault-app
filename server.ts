import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { Readable, pipeline } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const SAVEVIDEO_BASE = 'https://savevideo.uz';

function isSafeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === 'metadata.google.internal' ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // CORS headers for all API requests
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  /**
   * 1. Probe Media Endpoint (Extracts accurate title, duration, resolutions, file size estimates)
   */
  app.post('/api/media/probe', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url);
      const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
      const ytId = ytMatch ? ytMatch[1] : null;

      if (isYouTube) {
        const probeRes = await fetch(`${SAVEVIDEO_BASE}/api/yt/probe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Referer': `${SAVEVIDEO_BASE}/`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: JSON.stringify({ url })
        });

        if (probeRes.ok) {
          const data = await probeRes.json();
          const cleanTitle = data.title || (data.is_shorts ? `YouTube Shorts (${ytId || ''})` : (ytId ? `YouTube Video (${ytId})` : 'YouTube Media'));
          return res.json({
            success: true,
            platform: 'YouTube',
            title: cleanTitle,
            duration: data.duration || (data.is_shorts ? 45 : 0),
            max_height: data.max_height,
            heights: data.heights || [720, 1080],
            est: data.est || {},
            audio_est: data.audio_est,
            is_shorts: !!data.is_shorts,
            thumbnail: ytId ? `/api/media/thumbnail?yt=${ytId}` : ''
          });
        }
      }

      // Default probe fallback
      return res.json({
        success: true,
        platform: isYouTube ? 'YouTube' : 'Media',
        title: 'Media Stream',
        duration: 0,
        heights: [720, 1080],
        est: {}
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Probe failed';
      console.error('Probe error:', message);
      return res.status(500).json({ error: message });
    }
  });

  /**
   * 2. Start Download Endpoint (Initiates real stream resolution on backend)
   */
  app.post('/api/media/start', async (req, res) => {
    try {
      const { url, height, audio } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url);
      const isShorts = isYouTube && url.includes('/shorts/');

      if (isYouTube && !isShorts && height) {
        // YouTube specific quality resolution
        const startRes = await fetch(`${SAVEVIDEO_BASE}/api/yt/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Referer': `${SAVEVIDEO_BASE}/`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: JSON.stringify({
            url,
            height: height || 720,
            audio: !!audio
          })
        });

        const data = await startRes.json();
        return res.json(data);
      } else {
        // Universal downloader for TikTok, Instagram, Twitter, YouTube Shorts, etc.
        const dlRes = await fetch(`${SAVEVIDEO_BASE}/api/download`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Referer': `${SAVEVIDEO_BASE}/`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: JSON.stringify({ url })
        });

        const data = await dlRes.json();
        return res.json(data);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Start download failed';
      console.error('Start error:', message);
      return res.status(500).json({ error: message });
    }
  });

  /**
   * 3. Poll Download Status Endpoint
   */
  app.get('/api/media/status/:taskId', async (req, res) => {
    try {
      const { taskId } = req.params;
      const statusRes = await fetch(`${SAVEVIDEO_BASE}/api/status/${taskId}`, {
        headers: {
          'Referer': `${SAVEVIDEO_BASE}/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!statusRes.ok) {
        return res.status(statusRes.status).json({ error: 'Status fetch failed' });
      }

      const data = await statusRes.json();

      if (data.status === 'done') {
        const fileToken = data.file_token || '';
        const ext = data.ext || 'mp4';
        return res.json({
          ...data,
          file_url: `/api/media/file/${taskId}?t=${encodeURIComponent(fileToken)}&ext=${ext}`,
          audio_url: `/api/media/audio/${taskId}?t=${encodeURIComponent(fileToken)}`
        });
      }

      return res.json(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Status poll failed';
      return res.status(500).json({ error: message });
    }
  });

  /**
   * 4. Stream and Deliver Real Media File (Zero-VPN server pipeline)
   */
  app.get('/api/media/file/:taskId', async (req, res) => {
    try {
      const { taskId } = req.params;
      const token = req.query.t as string;
      const ext = (req.query.ext as string) || 'mp4';
      const isDownload = req.query.download === '1' || req.query.dl === '1';

      const targetUrl = `${SAVEVIDEO_BASE}/api/file/${taskId}?t=${encodeURIComponent(token || '')}`;

      const headers: Record<string, string> = {
        'Referer': `${SAVEVIDEO_BASE}/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range as string;
      }

      const remoteRes = await fetch(targetUrl, {
        headers,
        redirect: 'follow'
      });

      if (!remoteRes.ok && remoteRes.status >= 400) {
        return res.status(remoteRes.status).json({ error: `Remote error: ${remoteRes.statusText}` });
      }

      const mimeType = ext === 'mp3' ? 'audio/mpeg' : 'video/mp4';
      res.status(remoteRes.status);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const contentRange = remoteRes.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
      const contentLength = remoteRes.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const dispositionType = isDownload ? 'attachment' : 'inline';
      const rawTitle = (req.query.title as string) || `media_${taskId}`;
      const safeName = rawTitle.replace(/[\/\\?%*:|"<>]/g, '_').substring(0, 100);
      res.setHeader(
        'Content-Disposition',
        `${dispositionType}; filename="media_${taskId}.${ext}"; filename*=UTF-8''${encodeURIComponent(safeName)}.${ext}`
      );

      if (remoteRes.body) {
        const nodeStream = Readable.fromWeb(remoteRes.body as any);
        req.on('close', () => {
          nodeStream.destroy();
        });
        pipeline(nodeStream, res, (err) => {
          if (err && (err as any).code !== 'ERR_STREAM_PREMATURE_CLOSE') {
            console.warn('File stream notice:', err.message);
          }
        });
      } else {
        res.end();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'File proxy stream failed';
      console.error('File proxy stream error:', message);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  });

  /**
   * 5. Stream and Deliver Audio File (Zero-VPN audio pipeline)
   */
  app.get('/api/media/audio/:taskId', async (req, res) => {
    try {
      const { taskId } = req.params;
      const token = req.query.t as string;
      const isDownload = req.query.download === '1' || req.query.dl === '1';

      const targetUrl = `${SAVEVIDEO_BASE}/api/audio/${taskId}?t=${encodeURIComponent(token || '')}`;

      const headers: Record<string, string> = {
        'Referer': `${SAVEVIDEO_BASE}/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range as string;
      }

      const remoteRes = await fetch(targetUrl, {
        headers,
        redirect: 'follow'
      });

      if (!remoteRes.ok && remoteRes.status >= 400) {
        return res.status(remoteRes.status).json({ error: `Audio error: ${remoteRes.statusText}` });
      }

      res.status(remoteRes.status);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const contentRange = remoteRes.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
      const contentLength = remoteRes.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const dispositionType = isDownload ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${dispositionType}; filename="audio_${taskId}.mp3"`);

      if (remoteRes.body) {
        const nodeStream = Readable.fromWeb(remoteRes.body as any);
        req.on('close', () => {
          nodeStream.destroy();
        });
        pipeline(nodeStream, res, (err) => {
          if (err && (err as any).code !== 'ERR_STREAM_PREMATURE_CLOSE') {
            console.warn('Audio stream notice:', err.message);
          }
        });
      } else {
        res.end();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Audio proxy stream failed';
      console.error('Audio proxy stream error:', message);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  });

  /**
   * 6. Universal Direct Stream & Attachment Proxy (Follows all redirects server-side, 100% zero-VPN for users)
   */
  app.get('/api/media/proxy-stream', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).json({ error: 'URL parameter is required' });
      }

      // Security: SSRF Protection
      if (!isSafeUrl(targetUrl)) {
        return res.status(403).json({ error: 'Access to internal or private addresses is forbidden.' });
      }

      const rawTitle = (req.query.title as string) || 'download';
      const ext = (req.query.ext as string) || (targetUrl.includes('.mp3') ? 'mp3' : 'mp4');
      const isDownload = req.query.download === '1' || req.query.dl === '1';
      const safeName = rawTitle.replace(/[\/\\?%*:|"<>]/g, '_').substring(0, 100);

      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range as string;
      }

      const remoteRes = await fetch(targetUrl, {
        headers,
        redirect: 'follow'
      });

      if (!remoteRes.ok && remoteRes.status >= 400) {
        return res.status(remoteRes.status).json({ error: `Remote error: ${remoteRes.statusText}` });
      }

      const mimeType = ext === 'mp3' ? 'audio/mpeg' : 'video/mp4';
      res.status(remoteRes.status);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const contentRange = remoteRes.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }
      const contentLength = remoteRes.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const dispositionType = isDownload ? 'attachment' : 'inline';
      res.setHeader(
        'Content-Disposition',
        `${dispositionType}; filename="media_${Date.now()}.${ext}"; filename*=UTF-8''${encodeURIComponent(safeName)}.${ext}`
      );

      if (remoteRes.body) {
        const nodeStream = Readable.fromWeb(remoteRes.body as any);
        req.on('close', () => {
          nodeStream.destroy();
        });
        pipeline(nodeStream, res, (err) => {
          if (err && (err as any).code !== 'ERR_STREAM_PREMATURE_CLOSE') {
            console.warn('Proxy stream notice:', err.message);
          }
        });
      } else {
        res.end();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Proxy stream error';
      console.error('Proxy stream error:', message);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  });

  /**
   * 7. Thumbnail Proxy (Zero-VPN authentic cover photo for YouTube, Shorts, TikTok, Instagram, Twitter)
   */
  app.get('/api/media/thumbnail', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      const ytId = req.query.yt as string;

      if (ytId && /^[\w-]{11}$/.test(ytId)) {
        const qualityVariants = [
          `https://i.ytimg.com/vi/${ytId}/maxresdefault.jpg`,
          `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
          `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`,
          `https://i.ytimg.com/vi/${ytId}/sddefault.jpg`,
          `https://i.ytimg.com/vi/${ytId}/default.jpg`
        ];

        for (const variant of qualityVariants) {
          try {
            const imgRes = await fetch(variant, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            if (imgRes.ok && imgRes.body) {
              res.setHeader('Content-Type', 'image/jpeg');
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.setHeader('Access-Control-Allow-Origin', '*');
              const nodeStream = Readable.fromWeb(imgRes.body as any);
              return pipeline(nodeStream, res, () => {});
            }
          } catch {
            // continue next variant
          }
        }
        return res.status(404).end();
      }

      if (targetUrl && isSafeUrl(targetUrl)) {
        const headers: Record<string, string> = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
        if (targetUrl.includes('instagram')) headers['Referer'] = 'https://www.instagram.com/';
        if (targetUrl.includes('tiktok')) headers['Referer'] = 'https://www.tiktok.com/';

        const imgRes = await fetch(targetUrl, { headers });
        if (imgRes.ok && imgRes.body) {
          res.setHeader('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('Access-Control-Allow-Origin', '*');
          const nodeStream = Readable.fromWeb(imgRes.body as any);
          return pipeline(nodeStream, res, () => {});
        }
      }

      return res.status(400).json({ error: 'Valid thumbnail URL or YouTube ID required' });
    } catch {
      if (!res.headersSent) res.status(500).end();
    }
  });

  // Deliver /manifest.json directly
  app.get('/manifest.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.sendFile(path.resolve(__dirname, 'public', 'manifest.json'));
  });

  // Frontend integration: Vite middleware in development, static in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`StreamVault Full-Stack Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
