import type { JSX } from "react";

import { Main } from "@strapi/design-system";
import { useIntl } from "react-intl";

import { getTranslation } from "../utils/getTranslation";

/** Renders the plugin's localized welcome page. */
function HomePage(): JSX.Element {
  const { formatMessage } = useIntl();

  return (
    <Main>
      <h1>Welcome to {formatMessage({ id: getTranslation("plugin.name") })}</h1>
    </Main>
  );
}

export { HomePage };
