import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Icon } from "./Icon";
import { RecommendationBadge, SettingsSelectPopover } from "./SettingsSelectPopover";

type SettingsSelectBadge = {
  label: string;
};

export type SettingsSelectOption<Value extends string> = {
  id: Value;
  title: string;
  hint: string;
  disabled?: boolean;
  badge?: SettingsSelectBadge;
};

type SettingsSelectProps<Value extends string> = {
  name: string;
  value: Value;
  options: readonly SettingsSelectOption<Value>[];
  labelledBy: string;
  popoverContainer?: HTMLElement | null;
  onChange: (value: Value) => void;
};

type MenuState = "closed" | "open" | "closing";
type PopoverPosition = { top: number; left: number; width: number };
const DIALOG_FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function SettingsSelect<Value extends string>({
  name,
  value,
  options,
  labelledBy,
  popoverContainer,
  onChange,
}: SettingsSelectProps<Value>) {
  const [menuState, setMenuState] = useState<MenuState>("closed");
  const [menuPlacement, setMenuPlacement] = useState<"top" | "bottom">("bottom");
  const [menuMaxHeight, setMenuMaxHeight] = useState<number>();
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const instanceId = useId();
  const selectedOption = options.find((option) => option.id === value) ?? options[0];
  const isOpen = menuState === "open";
  const menuId = `settings-select-menu-${instanceId}`;
  const valueId = `settings-select-value-${instanceId}`;
  const triggerId = `settings-select-trigger-${instanceId}`;

  const closeMenu = useCallback((restoreFocus: boolean) => {
    if (menuState !== "open") return;

    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    setMenuState("closing");
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });

    const duration =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--dropdown-close-dur"),
      ) || 150;
    closeTimerRef.current = window.setTimeout(() => {
      setMenuState("closed");
      closeTimerRef.current = null;
    }, duration);
  }, [menuState]);

  const updatePopoverPosition = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) return;

    const rootStyles = getComputedStyle(document.documentElement);
    const safeSpace = Number.parseFloat(rootStyles.getPropertyValue("--space-lg")) || 24;
    const menuGap = Number.parseFloat(rootStyles.getPropertyValue("--space-xs")) || 8;
    const above = Math.max(0, triggerRect.top - safeSpace);
    const below = Math.max(0, window.innerHeight - triggerRect.bottom - safeSpace);
    const menuHeight = popoverRef.current?.scrollHeight ?? 0;
    const fitsAbove = above >= menuHeight;
    const fitsBelow = below >= menuHeight;
    const placement =
      fitsAbove && !fitsBelow || (!fitsBelow && above > below) ? "top" : "bottom";
    const availableSpace = placement === "top" ? above : below;
    const visibleHeight = fitsAbove || fitsBelow
      ? menuHeight
      : Math.max(0, Math.min(menuHeight, availableSpace - menuGap));

    setMenuPlacement(placement);
    setMenuMaxHeight(fitsAbove || fitsBelow ? undefined : visibleHeight);
    if (popoverContainer) {
      const containerRect = popoverContainer.getBoundingClientRect();
      setPopoverPosition({
        top: (placement === "top"
          ? triggerRect.top - visibleHeight - menuGap
          : triggerRect.bottom + menuGap) - containerRect.top + popoverContainer.scrollTop,
        left: triggerRect.left - containerRect.left + popoverContainer.scrollLeft,
        width: triggerRect.width,
      });
    }
  }, [popoverContainer]);

  const openMenu = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    updatePopoverPosition();
    setMenuState("open");
  };

  useEffect(() => {
    if (!isOpen) return;

    const dismissOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        closeMenu(false);
      }
    };

    document.addEventListener("pointerdown", dismissOutside);
    popoverRef.current
      ?.querySelector<HTMLInputElement>('input[type="radio"]:checked:not(:disabled)')
      ?.focus({ preventScroll: true });
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [isOpen, closeMenu]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => updatePopoverPosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const frame = window.requestAnimationFrame(updatePosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (isOpen && event.target instanceof HTMLInputElement) {
      const availableOptions = options.filter((option) => !option.disabled);
      if (availableOptions.length === 0) return;

      const foundIndex = availableOptions.findIndex((option) => option.id === value);
      const currentIndex = Math.max(0, foundIndex);
      let nextIndex = currentIndex;

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % availableOptions.length;
      } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + availableOptions.length) % availableOptions.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = availableOptions.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      const nextOption = availableOptions[nextIndex];
      onChange(nextOption.id);
      rootRef.current
        ?.querySelector<HTMLInputElement>(`input[value="${nextOption.id}"]`)
        ?.focus({ preventScroll: true });
      return;
    }

    if (
      !isOpen &&
      event.target === triggerRef.current &&
      (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      openMenu();
    }
  };

  const handlePopoverKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !popoverContainer) return;

    const dialog = popoverContainer.closest<HTMLElement>('[role="dialog"]');
    const focusable = Array.from(
      dialog?.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR) ?? [],
    ).filter((element) => !element.closest("[inert]") && element.getClientRects().length > 0);
    const triggerIndex = focusable.findIndex((element) => element.id === triggerId);
    if (triggerIndex === -1) return;

    const nextIndex = triggerIndex + (event.shiftKey ? -1 : 1);
    event.preventDefault();
    closeMenu(false);
    (focusable[nextIndex] ?? focusable[event.shiftKey ? focusable.length - 1 : 0]).focus();
  };

  if (!selectedOption) return null;

  return (
    <div
      className="settings-select"
      ref={rootRef}
      data-open={menuState !== "closed"}
      data-placement={menuPlacement}
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        if (isOpen && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
          const nextTarget = event.relatedTarget as Node | null;
          if (!nextTarget || !popoverRef.current?.contains(nextTarget)) closeMenu(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        className="settings-select-trigger"
        type="button"
        aria-labelledby={`${labelledBy} ${valueId}`}
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => (isOpen ? closeMenu(false) : openMenu())}
      >
        <span className="settings-select-mark" aria-hidden="true"><span /></span>
        <span className="settings-select-copy" id={valueId}>
          <span className="settings-select-title">
            <strong>{selectedOption.title}</strong>
            {selectedOption.badge && (
              <RecommendationBadge
                badge={selectedOption.badge}
                active={selectedOption.id === value}
              />
            )}
          </span>
          <small>{selectedOption.hint}</small>
        </span>
        <Icon name="chevron" size={16} className="settings-select-chevron" />
      </button>

      <SettingsSelectPopover
        id={menuId}
        triggerId={triggerId}
        name={name}
        value={value}
        options={options}
        labelledBy={labelledBy}
        container={popoverContainer}
        popoverRef={popoverRef}
        isOpen={isOpen}
        isClosing={menuState === "closing"}
        isPortaled={Boolean(popoverContainer)}
        menuPlacement={menuPlacement}
        menuMaxHeight={menuMaxHeight}
        popoverPosition={popoverPosition}
        onKeyDown={handlePopoverKeyDown}
        onOptionClick={(optionValue) => {
          if (value === optionValue) closeMenu(true);
        }}
        onOptionChange={(optionValue) => {
          onChange(optionValue);
          closeMenu(true);
        }}
      />
    </div>
  );
}
