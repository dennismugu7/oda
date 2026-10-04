import { describe, expect, it } from 'vitest';
import { jpeg, png, tiff, webp, xmp } from '@/test/imageFixtures';
import { hasLocationData, sniffImageType, tiffHasGps } from './imageCheck';

// Decision #52: only real JPEG/PNG/WebP are stored, and never with location data. Other EXIF
// (orientation only) must not break uploads.

const formats = { jpeg, png, webp } as const;

describe('sniffImageType', () => {
  it('reads the type from the bytes', () => {
    expect(sniffImageType(jpeg())).toBe('jpeg');
    expect(sniffImageType(png())).toBe('png');
    expect(sniffImageType(webp())).toBe('webp');
  });

  it('rejects anything else, whatever it claims to be', () => {
    for (const fake of [
      Buffer.from('<html><script>alert(1)</script></html>'),
      Buffer.from('GIF89a......'),
      Buffer.from('%PDF-1.7'),
      Buffer.from([0xff, 0xd8]), // too short
      Buffer.from('RIFF\0\0\0\0WAVEfmt '),
      Buffer.alloc(0),
    ]) {
      expect(sniffImageType(fake)).toBeNull();
    }
  });
});

describe('location data', () => {
  for (const [name, make] of Object.entries(formats)) {
    describe(name, () => {
      it('EXIF with GPS → rejected', () => {
        expect(hasLocationData(make({ exif: tiff({ gps: true }) }), name as never)).toBe(true);
      });
      it('no metadata → accepted', () => {
        expect(hasLocationData(make(), name as never)).toBe(false);
      });
      it('orientation-only EXIF → accepted', () => {
        expect(hasLocationData(make({ exif: tiff({ orientation: true }) }), name as never)).toBe(
          false,
        );
      });
      it('XMP with GPS → rejected; XMP without → accepted', () => {
        expect(hasLocationData(make({ xmp: xmp(true) }), name as never)).toBe(true);
        expect(hasLocationData(make({ xmp: xmp(false) }), name as never)).toBe(false);
      });
    });
  }

  it('a GPS pointer to an empty GPS block is not location', () => {
    const t = tiff({ gps: true });
    // Zero the GPS IFD's entry count (it sits right after IFD0).
    const gpsOffset = t.readUInt32LE(8 + 2 + 2 * 12 - 4);
    t.writeUInt16LE(0, gpsOffset);
    expect(tiffHasGps(t)).toBe(false);
  });

  it('broken TIFF blocks never throw', () => {
    expect(tiffHasGps(Buffer.from('MM\0*\xff\xff\xff\xff', 'latin1'))).toBe(false);
    expect(tiffHasGps(Buffer.from('nonsense'))).toBe(false);
  });
});
