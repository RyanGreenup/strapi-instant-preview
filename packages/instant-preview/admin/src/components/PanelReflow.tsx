import type { JSX } from "react";

import { useLayoutEffect, useRef } from "react";
import { createGlobalStyle } from "styled-components";

import { getAdminRoot } from "../hooks/useDockAnimation";
import { warnOnce } from "../utils/warnOnce";

/**
 * Minimum width for the side-column layout.
 *
 * Below Strapi's narrowest side-column width panels (such as the one containing
 * Publish/Save button) move above the form.
 */
const MIN_GRID_WIDTH = 680;
const ATTRIBUTE = "data-preview-reflow";

/**
 * CSS to reflow the side panels
 *
 * The side panels, such as the Publish/Save Button, take up room required by the
 * preview and don't flow well. This improves there flex structure to allow a side
 * preview on a screen that isn't wider than 4K.
 *
 * Strapi's generated classes follow these styles, so overrides need `!important`.
 *
 * The horizontal layout expects the Strapi 5.x panel wrapper shape which is
 * covered by the `e2e/` tests.
 */
const ReflowStyle = createGlobalStyle`
  [${ATTRIBUTE}='grid'] > * {
    grid-column: 1 / -1 !important;
  }

  [${ATTRIBUTE}='grid'] > [${ATTRIBUTE}='panels'] {
    order: -1 !important;
  }

  [${ATTRIBUTE}='grid'] > [${ATTRIBUTE}='panels'] > * {
    flex-direction: row !important;
    flex-wrap: wrap !important;
  }

  [${ATTRIBUTE}='grid'] > [${ATTRIBUTE}='panels'] > * > * {
    flex: 1 1 160px !important;
  }
`;

interface EditLayout {
  grid: HTMLElement;
  panels: HTMLElement;
}

/**
 * Find the nearest ancestor grid within the admin root.
 *
 * Require two children, with the panels last, to match the reflow styles.
 */
const findEditLayout = (anchor: HTMLElement | null): EditLayout | undefined => {
  const root = getAdminRoot();
  let panels = anchor;
  while (
    panels?.parentElement &&
    panels !== root &&
    getComputedStyle(panels.parentElement).display !== "grid"
  ) {
    panels = panels.parentElement;
  }
  const grid = panels?.parentElement;
  return panels &&
    grid &&
    panels !== root &&
    grid.children.length === 2 &&
    grid.lastElementChild === panels
    ? { grid, panels }
    : undefined;
};

/** Mark the layout for the reflow styles while the grid is narrow. */
const reflowWhenNarrow = ({ grid, panels }: EditLayout): (() => void) => {
  panels.setAttribute(ATTRIBUTE, "panels");

  // Column changes cannot affect the grid width that triggers this reflow.
  const observer = new ResizeObserver(([entry]) => {
    if (entry === undefined) {
      return;
    }
    if (entry.contentRect.width < MIN_GRID_WIDTH) {
      grid.setAttribute(ATTRIBUTE, "grid");
    } else {
      grid.removeAttribute(ATTRIBUTE);
    }
  });
  observer.observe(grid);

  return () => {
    observer.disconnect();
    grid.removeAttribute(ATTRIBUTE);
    panels.removeAttribute(ATTRIBUTE);
  };
};

/** Reflow panels when the dock narrows the editor without changing the viewport. */
const PanelReflow = (): JSX.Element => {
  // React DOM refs require null before the element mounts.
  // oxlint-disable-next-line unicorn/no-null
  const anchor = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const layout = findEditLayout(anchor.current);
    if (layout === undefined) {
      warnOnce("the edit view grid was not recognised; side panels stay beside the form");
    }
    return layout && reflowWhenNarrow(layout);
  }, []);

  return (
    <>
      <ReflowStyle />
      <span ref={anchor} hidden />
    </>
  );
};

export { PanelReflow };
