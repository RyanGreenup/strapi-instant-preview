import type { JSX } from "react";

import { PuzzlePiece } from "@strapi/icons";

/** Renders the icon used by the plugin's admin menu link. */
function PluginIcon(): JSX.Element {
  return <PuzzlePiece />;
}

export { PluginIcon };
