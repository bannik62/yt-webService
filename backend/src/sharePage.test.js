import { describe, expect, it } from '@jest/globals';
import {
  buildPublicOrigin,
  isLinkPreviewBot,
  isValidYoutubeVideoId,
  renderSharePageHtml,
  shareOgThumbUrl
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

  it('renderSharePageHtml : pas de redirection JS (anti-cloaking)', () => {
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
});
