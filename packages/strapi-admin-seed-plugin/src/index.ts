import { config } from "./config";
import { seed } from "./services/seed";

const adminSeed: { config: typeof config; services: { seed: typeof seed } } = {
  config,
  services: { seed },
};

export default adminSeed;
