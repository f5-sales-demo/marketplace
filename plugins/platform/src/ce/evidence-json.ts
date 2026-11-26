type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed original JSON object');
  return value as Json;
};

export function decodeEvidenceObject(raw: Uint8Array): Json {
  const source = new TextDecoder('utf8', { fatal: true }).decode(raw);
  const value = object(JSON.parse(source));
  // JSON.parse discards duplicate keys. Check even escaped/nested identities
  // before using its projection; never select the last ambiguous identity.
  const scopes: Array<Set<string> | null> = [];
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '{' || char === '[') {
      if (scopes.length >= 64) throw new Error('Original JSON nesting exceeded');
      scopes.push(char === '{' ? new Set() : null);
    } else if (char === '}' || char === ']') scopes.pop();
    else if (char === '"') {
      const start = i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') i++;
        i++;
      }
      let next = i + 1;
      while (/\s/.test(source[next] ?? '') && next < source.length) next++;
      if (source[next] === ':') {
        const key: string = JSON.parse(source.slice(start, i + 1));
        const keys = scopes.at(-1);
        if (!keys || keys.has(key)) throw new Error('Duplicate original JSON identity');
        keys.add(key);
      }
    }
  }
  return value;
}
