/**
 * A minimal ZIP reader/writer — the container half of reading and writing an `.xlsx`.
 *
 * `writeZip` builds the archive the generator emits, and `readZip` opens the one the reader
 * parses. Both directions of the workbook go through here.
 *
 * An entry may also be copied **verbatim**, as its original compressed bytes: never inflated,
 * never re-deflated. That makes it possible to rewrite one part of an archive and leave every
 * other byte alone, which is a property of the algorithm rather than a hope about deflate being
 * deterministic. `zip.test.ts` asserts it.
 *
 * Written rather than taken off the shelf because the alternatives each cost something real:
 * openpyxl silently drops `x14` data validation on save, and shelling out to `zip`/`unzip` adds
 * a runtime dependency the plugin does not otherwise have.
 *
 * Scope, deliberately: STORE (0) and DEFLATE (8), no ZIP64, no encryption, no data
 * descriptors. Office writes plain deflated entries, and `readZip` throws on anything else
 * instead of guessing.
 */
import { deflateRawSync, inflateRawSync } from 'node:zlib';

/** One archive member, with its compressed form retained for verbatim copying. */
export interface ZipEntry {
  name: string;
  /** Decompressed contents. */
  data: Uint8Array;
  /** Exactly the bytes stored in the archive — reused when the entry is copied. */
  compressed: Uint8Array;
  /** 0 = stored, 8 = deflated. */
  method: number;
  crc32: number;
}

/** An entry to write: either fresh `data`, or `raw` to copy a read entry untouched. */
export type ZipInput = { name: string; data: Uint8Array } | { name: string; raw: ZipEntry };

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const EOCD_MIN_SIZE = 22;
const ZIP64_SENTINEL = 0xffffffff;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Read every member of a ZIP, driven by the central directory (authoritative — local
 * headers may carry zeroed sizes when a data descriptor was used).
 */
export function readZip(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // The EOCD sits at the end, after a comment of unknown length; scan backwards for it.
  let eocd = -1;
  for (let i = bytes.length - EOCD_MIN_SIZE; i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive: no end-of-central-directory record');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (offset === ZIP64_SENTINEL) throw new Error('ZIP64 archives are not supported');

  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_SIG) {
      throw new Error(`Corrupt central directory at entry ${i}`);
    }
    const method = view.getUint16(offset + 10, true);
    const storedCrc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen));

    // The local header's own name/extra lengths locate the payload; they can differ
    // from the central directory's extra field, so re-read them here.
    if (view.getUint32(localOffset, true) !== LOCAL_SIG) {
      throw new Error(`Corrupt local header for "${name}"`);
    }
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);

    let data: Uint8Array;
    if (method === 0) data = compressed;
    else if (method === 8) data = new Uint8Array(inflateRawSync(compressed));
    else throw new Error(`Unsupported compression method ${method} for "${name}"`);

    entries.set(name, { name, data, compressed: new Uint8Array(compressed), method, crc32: storedCrc });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Write a ZIP. Entries given as `raw` keep their original compressed bytes, CRC and
 * method; entries given as `data` are deflated fresh.
 *
 * Member order is preserved as given — Office does not require a particular order, but
 * keeping the template's makes a diff of two archives readable.
 */
export function writeZip(inputs: readonly ZipInput[]): Uint8Array {
  interface Staged {
    nameBytes: Uint8Array;
    body: Uint8Array;
    method: number;
    crc: number;
    uncompressedSize: number;
    localOffset: number;
  }

  const staged: Staged[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (const input of inputs) {
    const nameBytes = new TextEncoder().encode(input.name);
    let body: Uint8Array;
    let method: number;
    let crc: number;
    let uncompressedSize: number;

    if ('raw' in input) {
      body = input.raw.compressed;
      method = input.raw.method;
      crc = input.raw.crc32;
      uncompressedSize = input.raw.data.length;
    } else {
      // An empty member cannot be deflated to anything useful; store it.
      if (input.data.length === 0) {
        body = input.data;
        method = 0;
      } else {
        body = new Uint8Array(deflateRawSync(input.data));
        method = 8;
      }
      crc = crc32(input.data);
      uncompressedSize = input.data.length;
    }

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL_SIG, true);
    lv.setUint16(4, 20, true); // version needed: 2.0 (deflate)
    lv.setUint16(6, 0x0800, true); // flag bit 11: names are UTF-8
    lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true); // mod time — fixed, so a fill is reproducible
    lv.setUint16(12, 0x0021, true); // mod date — 1980-01-01, the DOS epoch
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, uncompressedSize, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    staged.push({ nameBytes, body, method, crc, uncompressedSize, localOffset: offset });
    chunks.push(local, body);
    offset += local.length + body.length;
  }

  const centralStart = offset;
  for (const s of staged) {
    const central = new Uint8Array(46 + s.nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, CENTRAL_SIG, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, s.method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x0021, true);
    cv.setUint32(16, s.crc, true);
    cv.setUint32(20, s.body.length, true);
    cv.setUint32(24, s.uncompressedSize, true);
    cv.setUint16(28, s.nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comment
    cv.setUint16(34, 0, true); // disk number
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, s.localOffset, true);
    central.set(s.nameBytes, 46);
    chunks.push(central);
    offset += central.length;
  }

  const eocd = new Uint8Array(EOCD_MIN_SIZE);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, EOCD_SIG, true);
  ev.setUint16(8, staged.length, true);
  ev.setUint16(10, staged.length, true);
  ev.setUint32(12, offset - centralStart, true);
  ev.setUint32(16, centralStart, true);
  chunks.push(eocd);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
