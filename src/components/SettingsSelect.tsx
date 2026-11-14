import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Icon } from "./Icon";

export type SettingsSelectOption<Value extends string> = {
  id: Value;
  title: string;
  hint: string;
  disabled?: boolean;
  badge?: string;
};

type SettingsSelectProps<Value extends string> = {
  name: string;
  value: Value;
  options: readonly SettingsSelectOption<Value>[];
  labelledBy: string;
  onChange: (value: Value) => void;
};

type MenuState = "closed" | "open" | "closing";

export function SettingsSelect<Value extends string>({
  name,
  value,
  options,
  labelledBy,
  onChange,
}: SettingsSelectProps<Value>) {
  const [menuState, setMenuState] = useState<MenuState>("closed");
  const [menuPlacement, setMenuPlacement] = useState<"top" | "bottom">("bottom");
  const [menuMaxHeight, setMenuMaxHeight] = useState<number>();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const instanceId = useId();
  const selectedOption = options.find((option) => option.id === value) ?? options[0];
  const isOpen = menuState === "open";
  const menuId = `settings-select-menu-${instanceId}`;
  const valueId = `settings-select-value-${instanceId}`;

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

  const openMenu = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (triggerRect) {
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

      setMenuPlacement(placement);
      setMenuMaxHeight(
        fitsAbove || fitsBelow
          ? undefined
          : Math.max(0, Math.min(menuHeight, availableSpace - menuGap)),
      );
    }
    setMenuState("open");
  };

  useEffect(() => {
    if (!isOpen) return;

    const dismissOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu(false);
    };

    document.addEventListener("pointerdown", dismissOutside);
    selectedRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [isOpen, closeMenu]);

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
          closeMenu(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        className="settings-select-trigger"
        type="button"
        aria-labelledby={`${labelledBy} ${valueId}`}
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => (isOpen ? closeMenu(false) : openMenu())}
      >
        <span className="settings-select-mark" aria-hidden="true"><span /></span>
        <span className="settings-select-copy" id={valueId}>
          <strong>{selectedOption.title}</strong>
          <small>{selectedOption.hint}</small>
        </span>
        <Icon name="chevron" size={16} className="settings-select-chevron" />
      </button>

      <div
        className={`settings-select-popover t-dropdown${isOpen ? " is-open" : ""}${menuState === "closing" ? " is-closing" : ""}`}
        ref={popoverRef}
        id={menuId}
        data-origin={menuPlacement === "top" ? "bottom-left" : "top-left"}
        aria-hidden={!isOpen}
        inert={!isOpen}
        style={menuMaxHeight === undefined ? undefined : { maxHeight: menuMaxHeight }}
      >
        <div className="settings-select-options" role="radiogroup" aria-labelledby={labelledBy}>
          {options.map((option) => (
            <label
              key={option.id}
              className={`settings-select-option${value === option.id ? " is-selected" : ""}${option.disabled ? " is-disabled" : ""}`}
              onClick={() => closeMenu(true)}
            >
              <input
                ref={option.id === value ? selectedRef : undefined}
                type="radio"
                name={name}
                value={option.id}
                checked={value === option.id}
                disabled={option.disabled}
                onChange={() => onChange(option.id)}
              />
              <span className="radio-mark" aria-hidden="true" />
              <span className="settings-select-option-text">
                <strong>{option.title}</strong>
                <small>{option.hint}</small>
              </span>
              {option.badge && <span className="settings-select-badge">{option.badge}</span>}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
