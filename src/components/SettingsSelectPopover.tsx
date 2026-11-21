import type { KeyboardEventHandler, RefObject } from "react";
import { createPortal } from "react-dom";
import radioButton from "react-useanimations/lib/radioButton";
import star from "react-useanimations/lib/star";
import type { SettingsSelectOption } from "./SettingsSelect";
import { AnimatedIcon } from "./AnimatedIcon";

export function SettingsSelectPopover<Value extends string>({
  id,
  triggerId,
  name,
  value,
  options,
  labelledBy,
  container,
  popoverRef,
  isOpen,
  isClosing,
  isPortaled,
  menuPlacement,
  menuMaxHeight,
  popoverPosition,
  onKeyDown,
  onOptionClick,
  onOptionChange,
}: {
  id: string;
  triggerId: string;
  name: string;
  value: Value;
  options: readonly SettingsSelectOption<Value>[];
  labelledBy: string;
  container?: HTMLElement | null;
  popoverRef: RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  isClosing: boolean;
  isPortaled: boolean;
  menuPlacement: "top" | "bottom";
  menuMaxHeight?: number;
  popoverPosition: { top: number; left: number; width: number } | null;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onOptionClick: (value: Value) => void;
  onOptionChange: (value: Value) => void;
}) {
  const popover = (
    <div
      className={`settings-select-popover t-dropdown${isPortaled ? " is-portaled" : ""}${isOpen ? " is-open" : ""}${isClosing ? " is-closing" : ""}`}
      ref={popoverRef}
      id={id}
      data-origin={menuPlacement === "top" ? "bottom-left" : "top-left"}
      data-popover-owner={isPortaled ? "custom-settings-dialog" : undefined}
      data-trigger-id={triggerId}
      aria-hidden={!isOpen}
      inert={!isOpen}
      onKeyDown={onKeyDown}
      style={{
        ...(menuMaxHeight === undefined ? {} : { maxHeight: menuMaxHeight }),
        ...(isPortaled && popoverPosition ? popoverPosition : {}),
      }}
    >
      <div className="settings-select-options" role="radiogroup" aria-labelledby={labelledBy}>
        {options.map((option) => (
          <label
            key={option.id}
            className={`settings-select-option${value === option.id ? " is-selected" : ""}${option.disabled ? " is-disabled" : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              disabled={option.disabled}
              onClick={() => onOptionClick(option.id)}
              onChange={() => onOptionChange(option.id)}
            />
            <AnimatedIcon
              animation={radioButton}
              interaction="click-toggle"
              active={value === option.id}
              size={27}
            />
            <span className="settings-select-option-text">
              <span className="settings-select-title">
                <strong>{option.title}</strong>
                {option.badge && (
                  <RecommendationBadge
                    badge={option.badge}
                    active={option.id === value}
                  />
                )}
              </span>
              <small>{option.hint}</small>
            </span>
          </label>
        ))}
      </div>
    </div>
  );

  return container ? createPortal(popover, container) : popover;
}

export function RecommendationBadge({
  badge,
  active,
}: {
  badge: { label: string };
  active: boolean;
}) {
  return (
    <span
      className="settings-select-badge"
      role="img"
      aria-label={badge.label}
      title={badge.label}
    >
      <AnimatedIcon
        animation={star}
        interaction="click-toggle"
        active={active}
        size={24}
        aria-hidden="true"
      />
    </span>
  );
}
