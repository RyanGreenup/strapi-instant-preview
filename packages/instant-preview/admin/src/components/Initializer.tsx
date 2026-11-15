import { useEffect, useRef } from "react";

import { PLUGIN_ID } from "../pluginId";

interface InitializerProps {
  setPlugin: (id: string) => void;
}

/** Marks the plugin ready after its initializer mounts. */
function Initializer({ setPlugin }: InitializerProps): null {
  const ref = useRef(setPlugin);

  useEffect(() => {
    ref.current(PLUGIN_ID);
  }, []);

  return null;
}

export { Initializer };
