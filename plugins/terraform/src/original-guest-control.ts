import { decodeEvidenceObject } from './evidence-json';

type Message = Record<string, unknown>;
const maximumFrame = 65_536;
const maximumSequence = 2 ** 31 - 1;
const object = (value: unknown): value is Message => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maximumSequence;

function jsonValue(value: unknown, depth = 0, ancestors = new Set<object>()): void {
  if (depth >= 64) throw new Error('Original guest control JSON nesting exceeds bound');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object') throw new Error('Original guest control JSON cannot discard evidence');
  if (ancestors.has(value)) throw new Error('Original guest control JSON cycle refused');
  if (!Array.isArray(value) && ![null, Object.prototype].includes(Object.getPrototypeOf(value)))
    throw new Error('Original guest control plain JSON required');
  ancestors.add(value);
  for (const item of Array.isArray(value) ? value : Object.values(value)) jsonValue(item, depth + 1, ancestors);
  ancestors.delete(value);
}

/** Require lossless finite JSON before original control evidence is used. */
export function assertOriginalGuestJson(value: unknown): void {
  jsonValue(value);
}

/** JSON.parse normalizes 1.0 and 1e0 to 1. Preserve the Python peer's integer-token checks. */
function wireIntegers(source: string): void {
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const character = source[i];
    if (character === '{' || character === '[') depth++;
    else if (character === '}' || character === ']') depth--;
    else if (character === '"') {
      const start = i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') i++;
        i++;
      }
      let next = i + 1;
      while (next < source.length && /\s/.test(source[next])) next++;
      if (source[next] !== ':') continue;
      const key: string = JSON.parse(source.slice(start, i + 1));
      if ((depth === 1 && ['schemaVersion', 'sequence'].includes(key)) || (depth === 2 && key === 'id')) {
        const token = source.slice(next + 1).trimStart();
        if (!/^(?:0|[1-9][0-9]*)(?=\s*[,}])/.test(token))
          throw new Error('Original guest control integer wire identity required');
      }
    }
  }
}

/** Native framing for the original pipe/socket peer. Frames alone grant no cloud or guest authority. */
export class OriginalGuestControlFrames {
  private pending: Buffer = Buffer.alloc(0);
  private received = 0;
  private sent = 0;
  private retired = false;
  constructor(private readonly session: string) {
    if (typeof session !== 'string' || !/^[a-f0-9]{64}$/.test(session))
      throw new Error('Original guest control nonce required');
  }
  private active() {
    if (this.retired) throw new Error('Original guest control port retired');
  }
  encode(message: Message): Buffer {
    this.active();
    try {
      if (!object(message) || !integer(this.sent + 1)) throw new Error('Original guest control message required');
      jsonValue(message);
      const raw = Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          kind: 'original-guest-control',
          session: this.session,
          sequence: this.sent + 1,
          message,
        }),
      );
      wireIntegers(raw.toString('utf8'));
      if (!raw.length || raw.length > maximumFrame) throw new Error('Original guest control frame exceeds bound');
      const header = Buffer.alloc(4);
      header.writeUInt32BE(raw.length);
      this.sent++;
      return Buffer.concat([header, raw]);
    } catch (error) {
      this.retired = true;
      throw error;
    }
  }
  push(chunk: Uint8Array): Message[] {
    this.active();
    try {
      if (!(chunk instanceof Uint8Array) || chunk.length > maximumFrame + 4)
        throw new Error('Original guest control receive chunk exceeds bound');
      this.pending = Buffer.concat([this.pending, chunk]);
      const messages: Message[] = [];
      while (this.pending.length >= 4) {
        const size = this.pending.readUInt32BE(0);
        if (!size || size > maximumFrame) throw new Error('Original guest control frame exceeds bound');
        if (this.pending.length < size + 4) break;
        if (messages.length >= 32) throw new Error('Original guest control batch exceeds bound');
        const raw = this.pending.subarray(4, size + 4);
        const value = decodeEvidenceObject(raw);
        jsonValue(value);
        wireIntegers(new TextDecoder('utf8', { fatal: true }).decode(raw));
        if (
          Object.keys(value).sort().join(',') !== 'kind,message,schemaVersion,sequence,session' ||
          value.schemaVersion !== 1 ||
          value.kind !== 'original-guest-control' ||
          value.session !== this.session ||
          !integer(value.sequence) ||
          value.sequence !== this.received + 1 ||
          !object(value.message)
        )
          throw new Error('Original guest control attribution differs');
        this.received++;
        messages.push(value.message);
        this.pending = this.pending.subarray(size + 4);
      }
      return messages;
    } catch (error) {
      this.retired = true;
      throw error;
    }
  }
  end(): void {
    this.active();
    this.retired = true;
    if (this.pending.length) throw new Error('Original guest control frame interrupted');
  }
}
