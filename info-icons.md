# Icon Inventory

| Icon | Location | Purpose |
| --- | --- | --- |
| `trash2` (`react-useanimations`) | Completed-tab navigation action | Animated affordance for clearing successfully processed videos; plays on hover or focus and reverses when interaction ends. |
| `folder` (`react-useanimations`) | Queue row "show in folder" action | Replaces the static folder glyph; opens/animates on hover. |
| `refresh` (`react-useanimations`) | Queue row "retry" action | Changed from click-replay to hover so the retry arrow animates on hover like the other row actions. |
| `github` (`react-useanimations`) | Header social link | Continuously loops beside the brand; the library respects reduced-motion preferences. |
| `linkedin` (`react-useanimations`) | Header social link | Loops only while hovered; the library respects reduced-motion preferences. |
| `compare` (`src/components/Icon.tsx`) | Successful queue row comparison action | Opens the synchronized original-versus-optimized wipe viewer. |
| `volume` / `volumeOff` (`src/components/Icon.tsx`) | Comparison player audio toggle | Controls original audio while the optimized track stays muted to prevent overlap. |
