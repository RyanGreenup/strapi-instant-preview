import { isRecord, isUnknownArray } from "../guards.ts";
import { normalizeLevel } from "./normalize-level.ts";

/** Flattens a flat-config array (or single object) into one merged rules map. */
export function collectRules(config: unknown): Record<string, unknown> {
  const blocks = isUnknownArray(config) ? config : [config];
  const rules: Record<string, unknown> = {};

  for (const block of blocks) {
    if (isRecord(block) && isRecord(block["rules"])) {
      for (const [name, entry] of Object.entries(block["rules"])) {
        rules[name] = normalizeLevel(entry);
      }
    }
  }

  return rules;
}
