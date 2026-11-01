/** Tiny argv parser for the `activate` CLI: `<command> [positional…] [--flags]`. */
export function parseArgs(argv: string[]): {
  command: string;
  flags: Set<string>;
  rest: string[];
} {
  const [command = 'help', ...others] = argv;
  const flags = new Set(others.filter((a) => a.startsWith('--')));
  const rest = others.filter((a) => !a.startsWith('--'));
  return { command, flags, rest };
}
