export type OptionKind = 'value' | 'boolean';

export interface PositionalDeclaration {
  name: string;
  label: string;
  required: boolean;
}

export interface OptionDeclaration {
  name: string;
  flag: `--${string}`;
  kind: OptionKind;
  required?: boolean;
}

export interface CommandDeclaration {
  usage: string;
  positionals: readonly PositionalDeclaration[];
  options: readonly OptionDeclaration[];
}

/**
 * The single argument contract for every command.
 *
 * The parser derives both validation and the named result from this declaration. Adding an option here
 * cannot merely allowlist it: the same entry necessarily creates the property the command reads.
 */
export const COMMAND_SPECS = {
  validate: {
    usage: 'Usage: cli.ts validate <deal.json>',
    positionals: [{ name: 'dealPath', label: '<deal.json>', required: true }],
    options: [],
  },
  next: {
    usage: 'Usage: cli.ts next <deal.json>',
    positionals: [{ name: 'dealPath', label: '<deal.json>', required: true }],
    options: [],
  },
  score: {
    usage: 'Usage: cli.ts score <deal.json>',
    positionals: [{ name: 'dealPath', label: '<deal.json>', required: true }],
    options: [],
  },
  hint: {
    usage: 'Usage: cli.ts hint [element]',
    positionals: [{ name: 'element', label: '[element]', required: false }],
    options: [],
  },
  'check-sfdc': {
    usage: 'Usage: cli.ts check-sfdc [--schema <schema.json>] [--sfdc <mapping.json>]',
    positionals: [],
    options: [
      { name: 'schemaPath', flag: '--schema', kind: 'value' },
      { name: 'sfdcPath', flag: '--sfdc', kind: 'value' },
    ],
  },
  generate: {
    usage:
      'Usage: cli.ts generate <deal.json> [--out <file.xlsx>] [--plan] [--prose-heights] [--spec <workbook-spec.json>] [--locale <slug>]',
    positionals: [{ name: 'dealPath', label: '<deal.json>', required: true }],
    options: [
      { name: 'outPath', flag: '--out', kind: 'value' },
      { name: 'specPath', flag: '--spec', kind: 'value' },
      { name: 'locale', flag: '--locale', kind: 'value' },
      { name: 'plan', flag: '--plan', kind: 'boolean' },
      { name: 'proseHeights', flag: '--prose-heights', kind: 'boolean' },
    ],
  },
  read: {
    usage: 'Usage: cli.ts read <workbook.xlsx> --deal <deal.json> [--apply] [--spec <workbook-spec.json>]',
    positionals: [{ name: 'workbookPath', label: '<workbook.xlsx>', required: true }],
    options: [
      { name: 'dealPath', flag: '--deal', kind: 'value', required: true },
      { name: 'specPath', flag: '--spec', kind: 'value' },
      { name: 'apply', flag: '--apply', kind: 'boolean' },
    ],
  },
  migrate: {
    usage: 'Usage: cli.ts migrate <deal.json> [--apply]',
    positionals: [{ name: 'dealPath', label: '<deal.json>', required: true }],
    options: [{ name: 'apply', flag: '--apply', kind: 'boolean' }],
  },
  'check-spec': {
    usage: 'Usage: cli.ts check-spec [--spec <workbook-spec.json>] [--schema <schema.json>]',
    positionals: [],
    options: [
      { name: 'specPath', flag: '--spec', kind: 'value' },
      { name: 'schemaPath', flag: '--schema', kind: 'value' },
    ],
  },
} as const satisfies Record<string, CommandDeclaration>;

export type CommandName = keyof typeof COMMAND_SPECS;

export interface ParsedCommandArguments {
  positionals: Record<string, string | undefined>;
  options: Record<string, string | boolean | undefined>;
}

export function isCommandName(value: string | undefined): value is CommandName {
  return value !== undefined && Object.hasOwn(COMMAND_SPECS, value);
}

function positionalExpectation(spec: CommandDeclaration): string {
  if (spec.positionals.length === 0) return 'no positional arguments';
  return spec.positionals.map(({ label }) => label).join(' ');
}

export function parseCommandArguments(command: string, args: string[]): ParsedCommandArguments {
  if (!isCommandName(command)) throw new Error(`Unknown command: ${command}`);
  const spec: CommandDeclaration = COMMAND_SPECS[command];
  const byFlag = new Map(spec.options.map((option) => [option.flag, option]));
  const options: Record<string, string | boolean | undefined> = Object.fromEntries(
    spec.options.map((option) => [option.name, option.kind === 'boolean' ? false : undefined]),
  );
  const positionalValues: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] as string;
    if (!argument.startsWith('-')) {
      positionalValues.push(argument);
      continue;
    }

    const equals = argument.indexOf('=');
    const flag = (equals === -1 ? argument : argument.slice(0, equals)) as `--${string}`;
    const declaration = byFlag.get(flag);
    if (!declaration) {
      const expected = spec.options.length === 0 ? 'no options' : spec.options.map((option) => option.flag).join(', ');
      throw new Error(`${spec.usage}\nUnknown option ${argument}. ${command} takes ${expected}.`);
    }
    if (seen.has(declaration.name)) {
      throw new Error(`${spec.usage}\n${declaration.flag} was given more than once. Pass it once.`);
    }
    seen.add(declaration.name);

    if (declaration.kind === 'boolean') {
      if (equals !== -1) {
        throw new Error(`${spec.usage}\n${declaration.flag} is a switch and takes no value.`);
      }
      options[declaration.name] = true;
      continue;
    }

    const value = equals === -1 ? args[index + 1] : argument.slice(equals + 1);
    if (equals === -1 && value !== undefined && !value.startsWith('-')) index += 1;
    if (value === undefined || value.startsWith('-')) {
      throw new Error(`${spec.usage}\n${declaration.flag} was given with no value. Pass one, or leave it off.`);
    }
    if (value.trim() === '') {
      throw new Error(`${spec.usage}\n${declaration.flag} was given an empty value. Pass a value, or leave it off.`);
    }
    options[declaration.name] = value;
  }

  const requiredPositionals = spec.positionals.filter(({ required }) => required).length;
  if (positionalValues.length < requiredPositionals || positionalValues.length > spec.positionals.length) {
    throw new Error(
      `${spec.usage}\n${command} expects ${positionalExpectation(spec)}; received ${positionalValues.length} positional argument(s).`,
    );
  }

  for (const option of spec.options) {
    if (option.required && !seen.has(option.name)) {
      throw new Error(`${spec.usage}\n${command} requires ${option.flag}.`);
    }
  }

  return {
    positionals: Object.fromEntries(
      spec.positionals.map((positional, index) => [positional.name, positionalValues[index]]),
    ),
    options,
  };
}
