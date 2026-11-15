import tab from "@bomb.sh/tab/citty";
import { createMain } from "citty";
import { mainCommand } from "./cli.ts";

await tab(mainCommand);
await createMain(mainCommand)();
