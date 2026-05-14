import {
  interpretYtdlpProbeDump,
  buildProbeApiShape
} from './probe.js';

describe('interpretYtdlpProbeDump + buildProbeApiShape', () => {
  it('single video avec métadonnées', () => {
    const p = interpretYtdlpProbeDump({
      id: 'dQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
      duration: '212',
      uploader: 'Rick Astley',
      view_count: '1400000000',
      webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      description: 'Official video\n\nLong text '.repeat(20)
    });
    expect(p.kind).toBe('single');
    expect(p.count).toBe(1);
    expect(p.title).toBe('Never Gonna Give You Up');
    expect(p.channel).toBe('Rick Astley');
    expect(p.durationLabel).toBe('3:32');
    expect(p.videoId).toBe('dQw4w9WgXcQ');
    expect(p.viewCount).toBe(1_400_000_000);
    expect(p.descriptionPreview).toBeTruthy();
    expect(String(p.descriptionPreview).length).toBeLessThanOrEqual(240);

    const withCodec = interpretYtdlpProbeDump({
      id: 'dQw4w9WgXcQ',
      title: 'T',
      vcodec: 'avc1.42E01E',
      acodec: 'mp4a.40.2'
    });
    expect(withCodec.sourceMediaKind).toBe('video');

    const api = buildProbeApiShape(p, true, 0);
    expect(api.effectiveCount).toBe(1);
    expect(api.channel).toBe('Rick Astley');
    expect(api.durationLabel).toBe('3:32');
  });

  it('playlist + effectiveCount limit', () => {
    const p = interpretYtdlpProbeDump({
      title: 'PL',
      id: 'PLlistidxx',
      uploader: 'Chaîne',
      entries: [{ id: '1' }, { id: '2' }, { id: '3' }]
    });
    expect(p.kind).toBe('playlist');
    expect(p.count).toBe(3);
    expect(p.channel).toBe('Chaîne');
    const api = buildProbeApiShape(p, false, 2);
    expect(api.effectiveCount).toBe(2);
    expect(api.videoId).toBe('PLlistidxx');
  });

  it('durée via duration_string si duration absente', () => {
    const p = interpretYtdlpProbeDump({
      id: 'abcd1234efgh',
      title: 'T',
      duration_string: '1:30:00',
      channel: 'Chaîne test'
    });
    expect(p.durationLabel).toBe('1:30:00');
    expect(p.channel).toBe('Chaîne test');
  });
});
