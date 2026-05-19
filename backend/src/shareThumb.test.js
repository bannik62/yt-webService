import { describe, expect, it } from '@jest/globals';
import { parseJpegDimensions } from './shareThumb.js';

describe('shareThumb', () => {
  it('parseJpegDimensions lit largeur/hauteur SOF', () => {
    const buf = Buffer.alloc(24);
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0xff;
    buf[3] = 0xc0;
    buf[4] = 0x00;
    buf[5] = 0x11;
    buf[6] = 0x08;
    buf[7] = 0x02;
    buf[8] = 0xd0;
    buf[9] = 0x05;
    buf[10] = 0x00;
    expect(parseJpegDimensions(buf)).toEqual({ width: 1280, height: 720 });
  });
});
