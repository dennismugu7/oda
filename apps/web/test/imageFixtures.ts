import { crc32, deflateSync } from 'node:zlib';

// Byte-level image fixtures for the upload checks (decision #52): JPEG, PNG and WebP with or
// without EXIF GPS, orientation-only EXIF and XMP location. Structure is real (markers,
// chunks, TIFF IFDs); pixel data is a placeholder, which the checks never decode.

const bytes = (...parts: (Uint8Array | number[] | string)[]) =>
  Buffer.concat(
    parts.map((p) =>
      typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p as ArrayLike<number>),
    ),
  );

const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u32le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

/** A little-endian TIFF block: IFD0 with orientation and/or a pointer to a GPS IFD. */
export function tiff({
  orientation = true,
  gps = false,
}: {
  orientation?: boolean;
  gps?: boolean;
}) {
  const entries: number[][] = [];
  if (orientation) entries.push([...u16le(0x0112), ...u16le(3), ...u32le(1), ...u16le(6), 0, 0]);
  const ifd0Size = 2 + (entries.length + (gps ? 1 : 0)) * 12 + 4;
  const gpsOffset = 8 + ifd0Size;
  if (gps) entries.push([...u16le(0x8825), ...u16le(4), ...u32le(1), ...u32le(gpsOffset)]);
  const gpsIfd = gps
    ? [
        ...u16le(2),
        // GPSVersionID 2.3.0.0, GPSLatitudeRef "N"
        ...u16le(0x0000),
        ...u16le(1),
        ...u32le(4),
        2,
        3,
        0,
        0,
        ...u16le(0x0001),
        ...u16le(2),
        ...u32le(2),
        0x4e,
        0,
        0,
        0,
        ...u32le(0),
      ]
    : [];
  return bytes('II', u16le(42), u32le(8), u16le(entries.length), entries.flat(), u32le(0), gpsIfd);
}

export const xmp = (gps: boolean) =>
  `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description${
    gps ? ' exif:GPSLatitude="1,17.2N" exif:GPSLongitude="36,49.0E"' : ' tiff:Orientation="1"'
  }/></rdf:RDF></x:xmpmeta>`;

export interface Meta {
  exif?: Uint8Array;
  xmp?: string;
}

export function jpeg({ exif, xmp: xml }: Meta = {}) {
  const segment = (marker: number, data: Uint8Array) =>
    bytes([0xff, marker], u16be(data.length + 2), data);
  return bytes(
    [0xff, 0xd8],
    segment(0xe0, bytes('JFIF\0', [1, 1, 0, 0, 1, 0, 1, 0, 0])),
    exif ? segment(0xe1, bytes('Exif\0\0', exif)) : [],
    xml ? segment(0xe1, bytes('http://ns.adobe.com/xap/1.0/\0', xml)) : [],
    segment(0xda, bytes([1, 1, 0, 0, 0x3f, 0])),
    [0x12, 0x34, 0x56],
    [0xff, 0xd9],
  );
}

export function png({ exif, xmp: xml }: Meta = {}) {
  const chunk = (type: string, data: Uint8Array) => {
    const body = bytes(type, data);
    return bytes(u32be(data.length), body, u32be(crc32(body)));
  };
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    chunk('IHDR', bytes(u32be(1), u32be(1), [8, 2, 0, 0, 0])),
    exif ? chunk('eXIf', exif) : [],
    xml
      ? chunk('iTXt', bytes('XML:com.adobe.xmp\0', [1, 0], '\0\0', deflateSync(Buffer.from(xml))))
      : [],
    chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0]))),
    chunk('IEND', bytes()),
  );
}

export function webp({ exif, xmp: xml }: Meta = {}) {
  const chunk = (fourcc: string, data: Uint8Array) =>
    bytes(fourcc, u32le(data.length), data, data.length % 2 ? [0] : []);
  const body = bytes(
    'WEBP',
    chunk('VP8X', bytes([0x0c, 0, 0, 0], [0, 0, 0], [0, 0, 0])),
    chunk('VP8 ', bytes([0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a])),
    exif ? chunk('EXIF', exif) : [],
    xml ? chunk('XMP ', bytes(xml)) : [],
  );
  return bytes('RIFF', u32le(body.length), body);
}
