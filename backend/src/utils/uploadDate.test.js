import { describe, it, expect } from '@jest/globals';
import { normalizeUploadDate } from './uploadDate.js';

describe('normalizeUploadDate', () => {
  it('parse YYYYMMDD', () => {
    expect(normalizeUploadDate({ upload_date: '20240315' })).toBe('2024-03-15');
  });

  it('parse timestamp', () => {
    expect(normalizeUploadDate({ timestamp: 1710460800 })).toBe('2024-03-15');
  });

  it('retourne null si absent', () => {
    expect(normalizeUploadDate({})).toBeNull();
  });
});
