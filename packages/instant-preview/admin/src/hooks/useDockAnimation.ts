/**
 * Animations for the Preview panel
 *
 * Slides into and out of the right hand side, animating the Strapi content
 * consistently. The resize handle stays attached to the incoming preview panel.
 */

import type { RefCallback } from "react";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

const DURATION_MS = 250;
const reducedMotion = (): boolean =>
  globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Find the admin root whose inline width reserves space for the dock. */
const getAdminRoot = (): HTMLElement | null =>
  document.querySelector("#strapi");

interface SlideOptions {
  from: Keyframe;
  to: Keyframe;
  fill?: FillMode;
}
const slide = (element: Element, { from, to, fill }: SlideOptions): Animation =>
  element.animate([from, to], {
    duration: DURATION_MS,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    ...(fill === undefined ? {} : { fill }),
  });

interface Animations {
  editor: Animation | undefined;
  pane: Animation[];
}
interface MoveOptions {
  to: string;
  from?: string;
  fill?: FillMode;
}

const slidePane = (
  animations: Animations,
  element: HTMLDivElement,
  { to, from, fill }: MoveOptions,
): Animation[] => {
  const handle = element
    .closest('[data-scope="splitter"][data-part="root"]')
    ?.querySelector('[data-part="resize-trigger"]');
  const targets = handle ? [element, handle] : [element];
  const starts = targets.map(
    (target) => from ?? getComputedStyle(target).transform,
  );
  for (const animation of animations.pane) {
    animation.cancel();
  }
  animations.pane = targets.map((target, index) =>
    slide(target, {
      from: { transform: starts[index] ?? "none" },
      to: { transform: to },
      ...(fill === undefined ? {} : { fill }),
    }),
  );
  return animations.pane;
};

const slideEditor = (
  animations: Animations,
  root: HTMLElement,
  { to, from, fill }: MoveOptions,
): Animation => {
  const start = from ?? `${root.getBoundingClientRect().width}px`;
  animations.editor?.cancel();
  animations.editor = slide(root, {
    from: { width: start },
    to: { width: to },
    ...(fill === undefined ? {} : { fill }),
  });
  return animations.editor;
};

const cancelAnimations = (animations: Animations): void => {
  animations.editor?.cancel();
  for (const animation of animations.pane) {
    animation.cancel();
  }
  animations.pane = [];
};

/**
 * Keep a closing dialog present until its exit finishes.
 *
 * Layout switches do not animate.
 */
const useExitState = (
  isOpen: boolean,
  isDesktop: boolean,
): { isExiting: boolean; endExit: () => void } => {
  const [isExiting, setIsExiting] = useState(false);
  const [previous, setPrevious] = useState({ isOpen, isDesktop });

  if (previous.isOpen !== isOpen || previous.isDesktop !== isDesktop) {
    setPrevious({ isOpen, isDesktop });
    setIsExiting(
      previous.isOpen && !isOpen && previous.isDesktop === isDesktop,
    );
  }

  return {
    isExiting,
    endExit: useCallback(() => {
      setIsExiting(false);
    }, []),
  };
};

interface DockAnimationOptions {
  open: boolean;
  isExiting: boolean;
  isOverlay: boolean;
  onExitComplete: () => void;
}
interface AnimationState {
  animations: Animations;
  node: HTMLDivElement | undefined;
  hasClosed: boolean;
  exitDone: () => void;
}

const openDock = (state: AnimationState, isOverlay: boolean): void => {
  if (!state.hasClosed || reducedMotion()) {
    return;
  }
  const root = getAdminRoot();
  if (root && !isOverlay) {
    const isReversing = state.animations.editor?.playState === "running";
    slideEditor(state.animations, root, {
      to: root.style.width,
      ...(isReversing ? {} : { from: "100vw" }),
    });
  }
  if (state.node?.isConnected === true) {
    slidePane(state.animations, state.node, { to: "translateX(0)" });
  }
};

const closeDock = async (
  state: AnimationState,
  isOverlay: boolean,
): Promise<void> => {
  if (reducedMotion()) {
    state.exitDone();
    return;
  }
  const root = getAdminRoot();
  const element = state.node?.isConnected === true ? state.node : undefined;
  const animations = [
    ...(root && !isOverlay
      ? [slideEditor(state.animations, root, { to: "100vw", fill: "forwards" })]
      : []),
    ...(element
      ? slidePane(state.animations, element, {
          to: `translateX(${element.offsetWidth}px)`,
          fill: "forwards",
        })
      : []),
  ];
  await Promise.all(animations.map((animation) => animation.finished));
  state.exitDone();
};

const synchronizeStart = async (
  animation: Animation,
  lead: Animation,
): Promise<void> => {
  await lead.ready;
  if (animation.playState === "running") {
    animation.startTime = lead.startTime;
  }
};

const mountPane = (
  state: AnimationState,
  element: HTMLDivElement | null,
): void => {
  // Ark composes a new ref on each render; do not restart an existing pane.
  if (!element || element === state.node) {
    return;
  }
  state.node = element;
  if (!state.hasClosed || reducedMotion()) {
    return;
  }
  const lead = state.animations.editor;
  const animations = slidePane(state.animations, element, {
    to: "translateX(0)",
    from: `translateX(${element.offsetWidth}px)`,
  });
  // The portal mounts a frame later. Share the editor's start time.
  for (const animation of animations) {
    if (lead?.playState === "running") {
      // oxlint-disable-next-line promise/prefer-await-to-then -- An effect cannot await, and no-void forbids `void`.
      synchronizeStart(animation, lead).catch(() => {
        // A cancelled lead no longer needs synchronization.
      });
    }
  }
};

/**
 * Animate the pane and editor together, reversing from their current positions.
 *
 * Call after the dock width effect: opening reads that inline target width.
 */
const useDockAnimation = ({
  open,
  isExiting,
  isOverlay,
  onExitComplete,
}: DockAnimationOptions): {
  contentRef: RefCallback<HTMLDivElement>;
  finishAnimations: () => void;
} => {
  const state = useRef<AnimationState>({
    animations: { editor: undefined, pane: [] },
    node: undefined,
    hasClosed: !open,
    exitDone: onExitComplete,
  }).current;
  state.hasClosed ||= !open;
  state.exitDone = onExitComplete;
  const isVisible = open || isExiting;

  useLayoutEffect(() => {
    if (!isVisible) {
      cancelAnimations(state.animations);
    }
  }, [isVisible, state]);

  useLayoutEffect(() => {
    if (open) {
      openDock(state, isOverlay);
    }
  }, [open, isOverlay, state]);

  useLayoutEffect(() => {
    if (isExiting) {
      // oxlint-disable-next-line promise/prefer-await-to-then -- An effect cannot await, and no-void forbids `void`.
      closeDock(state, isOverlay).catch(() => {
        // Reopening cancels the exit animations.
      });
    }
  }, [isExiting, isOverlay, state]);

  const contentRef = useCallback(
    (element: HTMLDivElement | null) => {
      mountPane(state, element);
    },
    [state],
  );
  const finishAnimations = (): void => {
    state.animations.editor?.finish();
    for (const animation of state.animations.pane) {
      animation.finish();
    }
  };

  return { contentRef, finishAnimations };
};

export { getAdminRoot, useDockAnimation, useExitState };
