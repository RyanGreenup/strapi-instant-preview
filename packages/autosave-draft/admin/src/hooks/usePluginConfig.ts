import { useFetchClient } from "@strapi/strapi/admin";
import { useEffect, useState } from "react";

import { PLUGIN_ID } from "../pluginId";

interface PluginConfig {
  /** Quiet time in milliseconds after the last form change. */
  debounceMs: number;
}

/** Match the server default until the request succeeds. */
const FALLBACK: PluginConfig = { debounceMs: 500 };

/** Share one request across panel mounts per page load. */
let cached: Promise<PluginConfig> | null = null;
const fetchConfig = async (
  request: () => Promise<{ data: Partial<PluginConfig> }>,
): Promise<PluginConfig> => {
  try {
    const { data } = await request();

    return typeof data?.debounceMs === "number" && data.debounceMs > 0
      ? { debounceMs: data.debounceMs }
      : FALLBACK;
  } catch {
    return FALLBACK;
  }
};

/** Read the draft-autosave server options from GET /draft-autosave/config. */
const usePluginConfig = (): PluginConfig => {
  const { get } = useFetchClient();
  const [config, setConfig] = useState(FALLBACK);

  useEffect(() => {
    let isStale = false;

    cached ??= fetchConfig(() =>
      get<Partial<PluginConfig>>(`/${PLUGIN_ID}/config`),
    );
    const request = cached;
    const applyConfig = async (): Promise<void> => {
      const value = await request;

      if (!isStale) {
        setConfig(value);
      }
    };
    void applyConfig();

    return () => {
      isStale = true;
    };
  }, [get]);

  return config;
};

export { usePluginConfig };
export type { PluginConfig };
