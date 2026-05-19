import { describe, expect, it } from '@jest/globals';
import {
  buildPublicOrigin,
  isLinkPreviewBot,
  isValidYoutubeVideoId,
  renderSharePageHtml,
  shareAppDeepLinkUrl,
  shareOgThumbUrl,
  shouldRedirectShareVisitor
} from './sharePage.js';

describe('sharePage', () => {
  const saved = {
    SITE_URL: process.env.SITE_URL,
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    FB_APP_ID: process.env.FB_APP_ID,
    FORCE_HTTPS_PUBLIC_ORIGIN: process.env.FORCE_HTTPS_PUBLIC_ORIGIN
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('buildPublicOrigin: SITE_URL prime sur les en-têtes', () => {
    process.env.SITE_URL = 'https://example.com/';
    delete process.env.PUBLIC_ORIGIN;
    const req = { headers: { host: 'wrong' }, protocol: 'http' };
    expect(buildPublicOrigin(req)).toBe('https://example.com');
  });

  it('buildPublicOrigin: http interne + hôte = CORS https → https', () => {
    delete process.env.SITE_URL;
    delete process.env.PUBLIC_ORIGIN;
    process.env.CORS_ORIGIN = 'https://yt.codeurbase.fr';
    const req = {
      headers: {
        host: 'yt.codeurbase.fr',
        'x-forwarded-proto': 'http'
      },
      protocol: 'http'
    };
    expect(buildPublicOrigin(req)).toBe('https://yt.codeurbase.fr');
  });

  it('buildPublicOrigin: en-tête Forwarded proto=https', () => {
    delete process.env.SITE_URL;
    delete process.env.PUBLIC_ORIGIN;
    delete process.env.CORS_ORIGIN;
    const req = {
      headers: {
        host: 'yt.codeurbase.fr',
        forwarded: 'proto=https;host=yt.codeurbase.fr',
        'x-forwarded-proto': 'http'
      },
      protocol: 'http'
    };
    expect(buildPublicOrigin(req)).toBe('https://yt.codeurbase.fr');
  });

  it('renderSharePageHtml injecte fb:app_id si FB_APP_ID numérique', () => {
    process.env.FB_APP_ID = '1234567890123456';
    const html = renderSharePageHtml({
      origin: 'https://yt.codeurbase.fr',
      videoId: 'dQw4w9WgXcQ',
      title: 'Test'
    });
    expect(html).toContain('fb:app_id');
    expect(html).toContain('1234567890123456');
  });

  it('buildPublicOrigin: X-Forwarded-Ssl on → https', () => {
    delete process.env.SITE_URL;
    delete process.env.PUBLIC_ORIGIN;
    delete process.env.CORS_ORIGIN;
    delete process.env.FORCE_HTTPS_PUBLIC_ORIGIN;
    const req = {
      headers: {
        host: 'yt.codeurbase.fr',
        'x-forwarded-proto': 'http',
        'x-forwarded-ssl': 'on'
      },
      protocol: 'http'
    };
    expect(buildPublicOrigin(req)).toBe('https://yt.codeurbase.fr');
  });

  it('buildPublicOrigin: FORCE_HTTPS_PUBLIC_ORIGIN=1 hors localhost', () => {
    delete process.env.SITE_URL;
    delete process.env.PUBLIC_ORIGIN;
    delete process.env.CORS_ORIGIN;
    process.env.FORCE_HTTPS_PUBLIC_ORIGIN = '1';
    const req = {
      headers: {
        host: 'yt.codeurbase.fr',
        'x-forwarded-proto': 'http'
      },
      protocol: 'http'
    };
    expect(buildPublicOrigin(req)).toBe('https://yt.codeurbase.fr');
  });

  it('shareOgThumbUrl même domaine', () => {
    expect(shareOgThumbUrl('https://yt.codeurbase.fr', 'dQw4w9WgXcQ')).toBe(
      'https://yt.codeurbase.fr/share-thumb/dQw4w9WgXcQ.jpg'
    );
  });

  it('isValidYoutubeVideoId', () => {
    expect(isValidYoutubeVideoId('dQw4w9WgXcQ')).toBe(true);
    expect(isValidYoutubeVideoId('short')).toBe(false);
  });

  it('isLinkPreviewBot détecte le crawler Meta', () => {
    expect(
      isLinkPreviewBot(
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
      )
    ).toBe(true);
    expect(isLinkPreviewBot('Facebot')).toBe(true);
    expect(isLinkPreviewBot('Mozilla/5.0 (iPhone; Instagram 123)')).toBe(false);
  });

  it('shouldRedirectShareVisitor : humain oui, crawler non', () => {
    expect(
      shouldRedirectShareVisitor(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
      )
    ).toBe(true);
    expect(
      shouldRedirectShareVisitor(
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
      )
    ).toBe(false);
  });

  it('shareAppDeepLinkUrl pointe vers la SPA', () => {
    expect(shareAppDeepLinkUrl('https://yt.codeurbase.fr', 'dQw4w9WgXcQ')).toBe(
      'https://yt.codeurbase.fr/?v=dQw4w9WgXcQ'
    );
  });

  it('renderSharePageHtml : pas de redirection JS dans le HTML OG', () => {
    const html = renderSharePageHtml({
      origin: 'https://yt.codeurbase.fr',
      videoId: 'dQw4w9WgXcQ',
      title: 'Test'
    });
    expect(html).toContain('og:image');
    expect(html).toContain('/share-thumb/');
    expect(html).toContain('og:image:type');
    expect(html).toContain('og:site_name');
    expect(html).not.toContain('location.replace');
    expect(html).not.toContain('<script');
  });

  it('renderSharePageHtml : titre malveillant échappé (XSS)', () => {
    const evil = '"></title><script>alert(1)</script><img src=x onerror=alert(1) ';
    const html = renderSharePageHtml({
      origin: 'https://yt.codeurbase.fr',
      videoId: 'dQw4w9WgXcQ',
      title: evil,
    });
    expect(html).not.toMatch(/<script[\s>]/i);
    expect(html).not.toMatch(/<img src=x onerror/i);
    expect(html).toContain('&lt;script');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<title>');
    expect(html.indexOf('<title>')).toBeLessThan(html.indexOf('</title>'));
  });
});
