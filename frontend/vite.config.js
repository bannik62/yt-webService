import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

/**
 * Uniquement pour `npm run dev` **sans** Docker (proxy vers l’API locale).
 * Avec Docker, nginx proxifie /api (voir frontend/nginx.conf + docker-compose).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget =
    env.VITE_DEV_API_TARGET || 'http://127.0.0.1:4000';
  const siteUrl = (env.VITE_SITE_URL || 'https://yt.codeurbase.fr').replace(
    /\/$/,
    ''
  );
  const fbAppId = (env.VITE_FB_APP_ID || '').trim();
  const fbAppIdMeta =
    /^[0-9]+$/.test(fbAppId) ?
      `    <meta property="fb:app_id" content="${fbAppId}" />`
    : '';

  return {
    plugins: [
      {
        name: 'html-site-url',
        enforce: 'post',
        transformIndexHtml(html) {
          const withSite = html.replaceAll('%SITE_URL%', siteUrl);
          return withSite.replace(
            /[ \t]*%FB_APP_ID_META%[ \t]*\r?\n?/,
            fbAppIdMeta ? `${fbAppIdMeta}\n` : ''
          );
        },
        writeBundle(options) {
          const dir = options.dir;
          if (!dir) return;

          const robots = [
            'User-agent: *',
            'Allow: /',
            '',
            `Sitemap: ${siteUrl}/sitemap.xml`,
            ''
          ].join('\n');
          fs.writeFileSync(path.join(dir, 'robots.txt'), robots, 'utf8');

          const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;
          fs.writeFileSync(path.join(dir, 'sitemap.xml'), sitemap, 'utf8');
        }
      }
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true
        },
        '/health': {
          target: apiTarget,
          changeOrigin: true
        },
        '/v': {
          target: apiTarget,
          changeOrigin: true
        }
      }
    }
  };
});
