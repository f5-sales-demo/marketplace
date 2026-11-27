const secretKey =
  /^(?:access[-_]?token|refresh[-_]?token|id[-_]?token|client[-_]?secret|password|authorization|sfdxAuthUrl|authUrl|session[-_]?id|private[-_]?key|cookie|set-cookie)$/i;

/** Sanitize at the transport boundary, before errors, evidence or presentation exist. */
export function sanitize<T>(input: T): T {
  if (typeof input === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      /* Plain CLI output. */
    }
    if (parsed && typeof parsed === 'object') return JSON.stringify(sanitize(parsed)) as T;
    return input
      .replace(/force:\/\/[^\s"'<>]+/gi, '[REDACTED AUTH URL]')
      .replace(
        /(["']?(?:access[-_]?token|refresh[-_]?token|id[-_]?token|client[-_]?secret|password|session[-_]?id)["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s&,;}]+)/gi,
        '$1"[REDACTED]"',
      )
      .replace(/(bearer\s+)[^\s"',;]+/gi, '$1[REDACTED]')
      .replace(/((?:authorization|cookie|set-cookie)\s*:\s*)[^\r\n]+/gi, '$1[REDACTED]')
      .replace(
        /((?:access[ _-]?token|refresh[ _-]?token|id[ _-]?token|client[ _-]?secret|password|session[ _-]?id)\s*[=:|│]\s*)[^\s|│]+/gi,
        '$1[REDACTED]',
      )
      .replace(
        /((?:access[-_]?token|refresh[-_]?token|client[-_]?secret|password|session[-_]?id)\s*[=:]\s*)[^\s&,;"']+/gi,
        '$1[REDACTED]',
      )
      .replace(/([?&](?:access_token|refresh_token|token|code|client_secret)=)[^&#\s]+/gi, '$1[REDACTED]') as T;
  }
  if (Array.isArray(input)) return input.map(sanitize) as T;
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, secretKey.test(key) ? '[REDACTED]' : sanitize(value)]),
    ) as T;
  }
  return input;
}
