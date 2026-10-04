import { inflateSync } from 'node:zlib';

// Checks a stored upload from its bytes (decision #52): the real file type (never the
// declared one) and whether it still carries location data. Location = an EXIF GPS block
// (JPEG APP1 "Exif", PNG eXIf chunk, WebP EXIF chunk) or GPS fields in embedded XMP.
// Other EXIF (e.g. orientation only) is fine. Pure: no I/O.

export type ImageType = 'jpeg' | 'png' | 'webp';

export const IMAGE_CONTENT_TYPES: Record<ImageType, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const ascii = (b: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...b.subarray(start, start + length));

/** The image type from the file's first bytes, or null when it isn't JPEG/PNG/WebP. */
export function sniffImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 8 && png.every((v, i) => b[i] === v)) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  return null;
}

/** True when a TIFF/EXIF block points at a GPS IFD with at least one entry. */
export function tiffHasGps(t: Uint8Array): boolean {
  if (t.length < 8) return false;
  const order = ascii(t, 0, 2);
  if (order !== 'II' && order !== 'MM') return false;
  const view = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const little = order === 'II';
  const u16 = (at: number) => (at + 2 <= t.length ? view.getUint16(at, little) : -1);
  const u32 = (at: number) => (at + 4 <= t.length ? view.getUint32(at, little) : -1);
  if (u16(2) !== 42) return false;
  const ifd0 = u32(4);
  const entries = u16(ifd0);
  if (ifd0 < 0 || entries < 0) return false;
  for (let i = 0; i < entries; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > t.length) break;
    if (u16(entry) === 0x8825) {
      const gps = u32(entry + 8);
      return gps > 0 && u16(gps) > 0;
    }
  }
  return false;
}

/** XMP (RDF/XML) with GPS fields, e.g. exif:GPSLatitude. */
export function xmpHasGps(xml: string): boolean {
  return /GPS(Latitude|Longitude|Altitude|Position)/i.test(xml);
}

const EXIF_HEADER = 'Exif\0\0';
const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0';

function jpegHasLocation(b: Uint8Array): boolean {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return false; // not a marker: stop (no metadata after the image data)
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return false; // EOI / start of scan
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const length = (b[i + 2]! << 8) | b[i + 3]!;
    const start = i + 4;
    const end = Math.min(b.length, i + 2 + length);
    if (marker === 0xe1) {
      const data = b.subarray(start, end);
      if (ascii(data, 0, 6) === EXIF_HEADER && tiffHasGps(data.subarray(6))) return true;
      if (ascii(data, 0, XMP_HEADER.length) === XMP_HEADER) {
        if (xmpHasGps(new TextDecoder().decode(data.subarray(XMP_HEADER.length)))) return true;
      }
    }
    i += 2 + length;
  }
  return false;
}

function pngHasLocation(b: Uint8Array): boolean {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 8;
  while (i + 8 <= b.length) {
    const length = view.getUint32(i);
    const type = ascii(b, i + 4, 4);
    const data = b.subarray(i + 8, Math.min(b.length, i + 8 + length));
    if (type === 'eXIf') {
      const tiff = ascii(data, 0, 6) === EXIF_HEADER ? data.subarray(6) : data;
      if (tiffHasGps(tiff)) return true;
    } else if (type === 'iTXt') {
      // keyword\0 compressionFlag compressionMethod languageTag\0 translatedKeyword\0 text
      const keywordEnd = data.indexOf(0);
      if (keywordEnd > 0 && ascii(data, 0, keywordEnd) === 'XML:com.adobe.xmp') {
        const compressed = data[keywordEnd + 1] === 1;
        let at = keywordEnd + 3;
        at = data.indexOf(0, at) + 1; // language tag
        at = data.indexOf(0, at) + 1; // translated keyword
        if (at > 0) {
          const text = data.subarray(at);
          const xml = new TextDecoder().decode(compressed ? inflateSync(text) : text);
          if (xmpHasGps(xml)) return true;
        }
      }
    } else if (type === 'IEND') {
      return false;
    }
    i += 12 + length; // length + type + data + CRC
  }
  return false;
}

function webpHasLocation(b: Uint8Array): boolean {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 12;
  while (i + 8 <= b.length) {
    const fourcc = ascii(b, i, 4);
    const size = view.getUint32(i + 4, true);
    const data = b.subarray(i + 8, Math.min(b.length, i + 8 + size));
    if (fourcc === 'EXIF') {
      const tiff = ascii(data, 0, 6) === EXIF_HEADER ? data.subarray(6) : data;
      if (tiffHasGps(tiff)) return true;
    } else if (fourcc === 'XMP ') {
      if (xmpHasGps(new TextDecoder().decode(data))) return true;
    }
    i += 8 + size + (size % 2); // chunks are padded to an even size
  }
  return false;
}

/** True when the image still carries GPS/location metadata. */
export function hasLocationData(b: Uint8Array, type: ImageType): boolean {
  try {
    if (type === 'jpeg') return jpegHasLocation(b);
    if (type === 'png') return pngHasLocation(b);
    return webpHasLocation(b);
  } catch {
    // A file we can't walk is treated as unsafe.
    return true;
  }
}
