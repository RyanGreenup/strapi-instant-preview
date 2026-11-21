#!/usr/bin/env node
import { runMain } from "citty";

import { openapiContractCommand } from "./command";

// oxlint-disable-next-line no-void -- Citty handles errors and exit status at the CommonJS entry point.
void runMain(openapiContractCommand, {
  rawArgs: process.argv.length > 2 ? process.argv.slice(2) : ["--help"],
});
