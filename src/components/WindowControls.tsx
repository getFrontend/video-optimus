import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "./Icon";

export function WindowControls() {
  const [currentWindow] = useState(() => getCurrentWindow());
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(true);
  const [maximizeHovered, setMaximizeHovered] = useState(false);

  useEffect(() => {
    let active = true;
    const unlisteners: Array<() => void> = [];
    const registerListener = (listener: Promise<() => void>) => {
      void listener.then((unlisten) => {
        if (active) unlisteners.push(unlisten);
        else unlisten();
      });
    };

    const syncMaximized = () => {
      void currentWindow.isMaximized().then((value) => {
        if (active) setMaximized(value);
      });
    };

    void currentWindow.isFocused().then((value) => {
      if (active) setFocused(value);
    });
    syncMaximized();
    registerListener(currentWindow.onResized(syncMaximized));
    registerListener(
      currentWindow.onFocusChanged(({ payload }) => {
        if (active) setFocused(payload);
      }),
    );
    registerListener(
      listen("tauri-snap://snap/mouseenter", () => setMaximizeHovered(true)),
    );
    registerListener(
      listen("tauri-snap://snap/mouseleave", () => setMaximizeHovered(false)),
    );

    return () => {
      active = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [currentWindow]);

  const toggleMaximize = async () => {
    await currentWindow.toggleMaximize();
    setMaximized(await currentWindow.isMaximized());
  };

  return (
    <div
      className={`window-controls${focused ? " is-focused" : ""}`}
      role="group"
      aria-label="Керування вікном"
    >
      <button
        className="window-control"
        type="button"
        aria-label="Згорнути вікно"
        title="Згорнути"
        onClick={() => void currentWindow.minimize()}
      >
        <Icon name="minimize" size={28} />
      </button>
      <button
        id="maximize-window-button"
        className={`window-control${maximizeHovered ? " is-native-hovered" : ""}`}
        type="button"
        aria-label={maximized ? "Відновити вікно" : "Розгорнути вікно"}
        title={maximized ? "Відновити" : "Розгорнути"}
        onClick={() => void toggleMaximize()}
      >
        <Icon name={maximized ? "restore" : "maximize"} size={28} />
      </button>
      <button
        className="window-control window-control-close"
        type="button"
        aria-label="Закрити вікно"
        title="Закрити"
        onClick={() => void currentWindow.close()}
      >
        <Icon name="close" size={28} />
      </button>
    </div>
  );
}
