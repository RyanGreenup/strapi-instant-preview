import type { ArgsDef, CommandContext } from "citty";

/** Citty accepts undeclared flags and positional arguments by default. */
export async function checkOptions<T extends ArgsDef>({
  args,
  cmd,
}: CommandContext<T>): Promise<void> {
  const options = await (typeof cmd.args === "function"
    ? cmd.args()
    : cmd.args);
  for (const [key, value] of Object.entries(args)) {
    if (key === "_") continue;
    if (!options || !Object.hasOwn(options, key))
      throw new Error(`Unknown option '--${key}'`);
    if (typeof value !== "string" || !value)
      throw new Error(`Expected a value for '--${key}'`);
  }
  if (args._.length) throw new Error(`Unexpected argument: ${args._[0]}`);
}
