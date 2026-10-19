import { AsyncLocalStorage } from 'node:async_hooks';

export interface CommandEvidence {
  commands: string[][];
  withheld: number;
}
export const commandScope = new AsyncLocalStorage<CommandEvidence>();
export const commandEvidenceText = (evidence: CommandEvidence) =>
  `Executed Salesforce CLI argv (JSON):\n${JSON.stringify(evidence)}`;

/** Record an invocation at the executor boundary, never from inferred tool parameters. */
export function recordSalesforceCommand(args: readonly string[]): void {
  const evidence = commandScope.getStore();
  if (!evidence) return;
  // Passthrough commands can carry credential flags or HTTP headers. Withhold the
  // complete invocation rather than describing a redacted command as exact.
  if (
    args.some((arg) =>
      /(?:access[-_]?token|refresh[-_]?token|auth[-_]?url|client[-_]?secret|password|authorization|--header|^-h(?:$|[^a-z])|force:\/\/)/i.test(
        arg,
      ),
    )
  ) {
    evidence.withheld++;
    return;
  }
  evidence.commands.push(['sf', ...args]);
}
