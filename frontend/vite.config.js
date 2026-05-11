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

  return {
    plugins: [
      {
        name: 'html-site-url',
        transformIndexHtml(html) {
          return html.replaceAll('%SITE_URL%', siteUrl);
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
        }
      }
    }
  };
});
