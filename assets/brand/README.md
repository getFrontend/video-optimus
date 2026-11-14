# Video Optimus Logo

## Files

- `videooptimus-logo.svg` is the animated primary horizontal logo.
- `videooptimus-logo-static.svg` is the still primary logo.
- `videooptimus-symbol.svg` is the standalone mark for compact placements.
- `videooptimus-logo-dark.svg` is tuned for dark surfaces.
- `videooptimus-logo-monochrome.svg` uses one solid ink color.
- `videooptimus-logo-preview.png` is a transparent raster preview of the static logo.

## Motion

The intro runs once on load and settles in about 2.5 seconds: three fine frame
traces converge, the folded aperture resolves, then the wordmark appears. The
static symbol remains visible after the intro. To enable a very quiet optional
idle loop, add `idle-enabled` to the root SVG class. Hover feedback is gated to
fine pointers. Reduced-motion preferences disable all movement and show the
finished logo immediately.

For the intro alone, use the animated SVG as an image:

```html
<img src="./assets/brand/videooptimus-logo.svg" alt="Video Optimus">
```

For hover and the optional idle class, inline the SVG markup in the page; CSS
inside an SVG loaded through `<img>` cannot respond to the embedding page's
hover state. The symbol and wordmark remain editable vector geometry and SVG
text. All assets have transparent backgrounds and no external dependencies.

## Palette

- Graphite: `#25242D`
- Indigo: `#5846C8`
- Dark-surface indigo: `#8C91FF`
- Near-white: `#F5F4FB`
