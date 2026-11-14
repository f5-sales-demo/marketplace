/** Resolve generated argv identities without interpreting a verified literal EC2 key name. */
export function resolveAwsCeActionArgs(
  args: string[],
  values: Record<string, string>,
  bootstrapKeyPairName?: string,
  allowedUnresolved: string[] = [],
): string[] {
  return args.map((arg) => {
    const literalKey = bootstrapKeyPairName !== undefined && arg === `--key-name=${bootstrapKeyPairName}`;
    const result = literalKey ? arg : arg.replace(/__[A-Z0-9_]+__/g, (key) => values[key] ?? key);
    if (Array.from(result).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
      throw new Error('AWS action argv contains a control character');
    if (!literalKey && [...result.matchAll(/__[A-Z0-9_]+__/g)].some(([key]) => !allowedUnresolved.includes(key)))
      throw new Error('AWS action has an unresolved runtime identity');
    return result;
  });
}
