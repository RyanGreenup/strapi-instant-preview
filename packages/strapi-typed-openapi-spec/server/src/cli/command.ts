/* oxlint-disable no-console -- This module owns the CLI's terminal output. */
import { defineCommand } from "citty";
import { resolve } from "node:path";

import {
  auditContract,
  checkClient,
  checkContract,
  generateClient,
  loadContract,
  probeContract,
  writeContract,
} from "../tooling";
import { checkOptions } from "./options";

const app = {
  type: "string",
  description: "Strapi project directory",
  default: ".",
} as const;
const config = {
  type: "string",
  description: "Contract configuration overrides (JSON)",
} as const;

const generate = defineCommand({
  meta: { name: "generate", description: "Write the app's OpenAPI contract" },
  args: {
    app,
    config,
    out: {
      type: "string",
      description:
        "Output file (default: specification.json or specification.yaml)",
    },
    format: {
      type: "enum",
      options: ["json", "yaml"],
      description: "Output format (default: infer from filename)",
    },
    coverage: {
      type: "string",
      description: "Write route coverage to this JSON file",
    },
  },
  setup: checkOptions,
  async run({ args }) {
    const result = await loadContract({
      appDir: args.app,
      config: args.config,
    });
    const output = await writeContract(result, {
      out: args.out,
      format: args.format,
      coverage: args.coverage,
    });
    console.table(result.coverage.routes);
    for (const warning of result.coverage.warnings) console.warn(warning);
    for (const notice of result.coverage.notices)
      console.warn(`Notice: ${notice}`);
    console.log(`Wrote ${output}`);
  },
});

const check = defineCommand({
  meta: {
    name: "check",
    description:
      "Compare the app's contract with a saved JSON or YAML specification",
  },
  args: {
    app,
    config,
    against: {
      type: "string",
      default: "specification.json",
      description: "Expected specification",
    },
  },
  setup: checkOptions,
  async run({ args }) {
    const { document } = await loadContract({
      appDir: args.app,
      config: args.config,
    });
    await checkContract(document, args.against);
    console.log(`Contract matches ${args.against}`);
  },
});

const client = defineCommand({
  meta: {
    name: "client",
    description: "Generate a typed fetch client for this app",
  },
  args: {
    app,
    config,
    out: {
      type: "string",
      default: "cms-client",
      description: "Client output directory",
    },
    check: {
      type: "boolean",
      default: false,
      description:
        "Compare the client in --out with a fresh generation, and change nothing",
    },
  },
  setup: checkOptions,
  async run({ args }) {
    const { document } = await loadContract({
      appDir: args.app,
      config: args.config,
    });
    const output = resolve(args.out);
    if (args.check) {
      const stale = await checkClient(document, output);
      if (stale.length > 0) {
        throw new Error(
          `Client in ${output} is out of date: ${stale.join(", ")}`,
        );
      }
      console.log(`Client in ${output} matches the contract`);
      return;
    }
    const warnings = await generateClient(document, output);
    for (const warning of warnings) console.warn(warning);
    console.log(`Wrote client to ${output}`);
  },
});

const probe = defineCommand({
  meta: {
    name: "probe",
    description: "Inspect the app's route catalog and compatibility checks",
  },
  args: { app },
  setup: checkOptions,
  async run({ args }) {
    const result = await probeContract(args.app);
    console.table(result.checks, ["name", "status", "detail"]);
    console.table(result.routes);
    if (!result.ok) process.exitCode = 1;
  },
});

const audit = defineCommand({
  meta: {
    name: "audit",
    description: "Audit installed controller status codes against a baseline",
  },
  args: {
    app,
    baseline: {
      type: "string",
      description: "Expected controller hits (JSON string array)",
    },
  },
  setup: checkOptions,
  async run({ args }) {
    const result = await auditContract(args.app, args.baseline);
    console.log(JSON.stringify(result, null, 2));
    if (result.added.length) process.exitCode = 1;
  },
});

export const openapiContractCommand = defineCommand({
  meta: {
    name: "openapi-contract",
    description: "Generate and inspect contracts for a Strapi app",
  },
  subCommands: { generate, client, check, probe, audit },
});
