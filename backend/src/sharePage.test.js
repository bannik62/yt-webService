import { describe, expect, it } from '@jest/globals';
import {
  isLinkPreviewBot,
  isValidYoutubeVideoId,
  renderSharePageHtml
} from './sharePage.js';

describe('sharePage', () => {
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

  it('renderSharePageHtml sans script si autoRedirect false', () => {
    const html = renderSharePageHtml({
      origin: 'https://yt.codeurbase.fr',
      videoId: 'dQw4w9WgXcQ',
      title: 'Test',
      autoRedirect: false
    });
    expect(html).toContain('og:image');
    expect(html).toContain('i.ytimg.com');
    expect(html).not.toContain('location.replace');
  });

  it('renderSharePageHtml avec script si autoRedirect true', () => {
    const html = renderSharePageHtml({
      origin: 'https://yt.codeurbase.fr',
      videoId: 'dQw4w9WgXcQ',
      title: 'Test',
      autoRedirect: true
    });
    expect(html).toContain('location.replace');
  });
});
