import { existsSync, accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

/** Resolve executable on PATH without shell. */
export function which(cmd: string): string | undefined {
  if (cmd.includes("/") || cmd.includes("\\")) {
    try {
      accessSync(cmd, constants.X_OK);
      return cmd;
    } catch {
      return existsSync(cmd) ? cmd : undefined;
    }
  }
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, cmd);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* continue */
    }
  }
  return undefined;
}
