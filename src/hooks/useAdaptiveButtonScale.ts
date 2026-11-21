import { useLayoutEffect, useState, type RefObject } from "react";

const MIN_BUTTON_SCALE = 0.5;
const MIN_CONTENT_SCALE = 0.9;

interface AdaptiveDropZoneScale {
  button: number;
  content: number;
}

export function useAdaptiveButtonScale(
  contentRef: RefObject<HTMLElement | null>,
  actionsRef: RefObject<HTMLElement | null>,
  defaultButtonHeightRem = 5.5,
) {
  const [scale, setScale] = useState<AdaptiveDropZoneScale>({
    button: 1,
    content: 1,
  });

  useLayoutEffect(() => {
    const content = contentRef.current;
    const actions = actionsRef.current;
    if (!content || !actions) return;

    const measure = () => {
      const styles = window.getComputedStyle(content);
      const verticalInsets =
        parseFloat(styles.paddingTop) +
        parseFloat(styles.paddingBottom) +
        parseFloat(styles.borderTopWidth) +
        parseFloat(styles.borderBottomWidth);
      const rowGap = parseFloat(styles.rowGap) || 0;
      const otherRowsHeight = Array.from(content.children)
        .filter((child) => child !== actions)
        .reduce((height, child) => height + child.getBoundingClientRect().height, 0);
      const availableActionsHeight =
        content.clientHeight -
        verticalInsets -
        otherRowsHeight -
        rowGap * (content.children.length - 1);
      const actionStyles = window.getComputedStyle(actions);
      const actionRowGap = parseFloat(actionStyles.rowGap) || 0;
      const actionTops = Array.from(actions.children)
        .map((button) => button.getBoundingClientRect().top)
        .sort((first, second) => first - second);
      const actionRows = Math.max(
        1,
        actionTops.filter(
          (top, index) => index === 0 || top - actionTops[index - 1] > 2,
        ).length,
      );
      const availableButtonHeight =
        (availableActionsHeight - actionRowGap * (actionRows - 1)) / actionRows;
      const defaultButtonHeight =
        parseFloat(window.getComputedStyle(document.documentElement).fontSize) *
        defaultButtonHeightRem;
const buttonScale = Math.min(
        1,
        Math.max(MIN_BUTTON_SCALE, availableButtonHeight / defaultButtonHeight),
      );
      const contentScale = Math.max(
        MIN_CONTENT_SCALE,
        Math.min(1, Math.sqrt(Math.max(0, availableButtonHeight / defaultButtonHeight))),
      );

      setScale((currentScale) => {
        if (
          Math.abs(currentScale.button - buttonScale) < 0.01 &&
          Math.abs(currentScale.content - contentScale) < 0.01
        ) {
          return currentScale;
        }

        return { button: buttonScale, content: contentScale };
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(content);
    Array.from(content.children).forEach((child) => observer.observe(child));
    Array.from(actions.children).forEach((button) => observer.observe(button));
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [actionsRef, contentRef, defaultButtonHeightRem]);

  return scale;
}
