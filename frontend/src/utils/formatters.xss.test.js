import { describe, expect, it } from 'vitest';
import { escapeHtml } from './formatters.js';
import { XSS_PAYLOADS } from '../test/xssPayloads.js';

describe('escapeHtml (XSS)', () => {
  it.each(XSS_PAYLOADS)('neutralise les balises : %s', (payload) => {
    const out = escapeHtml(payload);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<img/i);
    expect(out).not.toMatch(/<svg/i);
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it('échappe les guillemets doubles (attributs HTML)', () => {
    expect(escapeHtml('" onclick=alert(1)')).toContain('&quot;');
    expect(escapeHtml('"')).toBe('&quot;');
  });

  it('échappe & en premier', () => {
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });
});
