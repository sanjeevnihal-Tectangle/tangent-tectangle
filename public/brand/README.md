# Tangent brand assets

The files in this folder are **placeholders** until the official Tangent logo is supplied.

| File | Use |
| --- | --- |
| `tangent-mark.svg` | Black symbol for light backgrounds (primary treatment) |
| `tangent-mark-white.svg` | White symbol for dark backgrounds |

To install the official logo:

1. Replace both SVG files with the official artwork (keep the file names).
2. Copy the official symbol paths into `src/components/brand/tangent-logo.tsx`
   (`SILHOUETTE` / `INNER_EDGES`, or replace the `<path>` elements). The in-app
   component uses `currentColor`, so it automatically renders black on light
   surfaces and white on dark surfaces.
3. Replace `src/app/icon.svg` with the official symbol.

Do not redesign, recolour or distort the official geometry.
