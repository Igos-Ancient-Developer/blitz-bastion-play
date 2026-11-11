# UI kit (9-slice frames)

These are transparent WebP files in the Clash Royale / Clash of Clans style. They contain no text.
Each file is a true 9-slice:
- **Corners** hold everything that must not stretch: rounding, rivets, gold brackets, filigree and gems.
- **Edges** between the corners are identical along their length, so they stretch cleanly.
- **Centre** is plain:
  - On frames and plates it is one colour. The parchment fades smoothly into its edge colour, with no pattern.
  - On buttons each row is a single colour, keeping the soft vertical sheen of the face.

**Slice values** were measured on the files at the sizes listed below. They are also stored in
`assets/kit_slices.json`. Order is `top right bottom left`, in image pixels.

**Border width.** The art is drawn at roughly 2× phone size. Set `border-width` (or `border-image-width`)
to about **half the slice** for normal UI sizes, and scale it further to fit smaller elements. The element
must be at least as tall as `top + bottom` of the border width.

| File | Size (px) | `border-image-slice` | Suggested `border-width` | Notes |
|---|---|---|---|---|
| `btn_green.webp` | 600×130 | `54 58 60 58 fill` | `27px 29px 30px 29px` (min height ≈ 57px) | Main / confirm button. Gold corner brackets with rivets; a darker 3D lip at the bottom. |
| `btn_blue.webp` | 600×129 | `54 58 60 58 fill` | same as above | Secondary button. |
| `btn_red.webp` | 600×130 | `54 58 60 58 fill` | same as above | Danger / sell. |
| `btn_gold.webp` | 600×130 | `54 58 60 58 fill` | same as above | Premium / buy. |
| `btn_gray.webp` | 600×132 | `54 58 60 58 fill` | same as above | Disabled. |
| `panel.webp` | 640×492 | `124 fill` | `62px` (or `48px` on small screens) | Dark navy window, gold border, filigree corners with blue gems. |
| `parchment.webp` | 640×497 | `96 fill` | `48px` | Cream paper plate on a navy backing, wooden pegs, inked inner line. |
| `ribbon.webp` | 900×123 | `18 140 35 140 fill` | `9px 70px 18px 70px` (height ≈ 62px) | Red title ribbon with swallow-tail ends. Put the title text in the central band. The bottom 35px is the fold under the band. |
| `tabbar.webp` | 1024×151 | `86 60 31 60 fill` | `43px 30px 16px 30px` (height ≥ 59px) | Bottom navigation bar: gold top edge and rivets at both ends. |
| `slot.webp` | 256×252 | `62 fill` | `31px` (or `24px` for 80px slots) | Square inventory / deck slot with gold corner caps. |
| `pill.webp` | 512×141 | `70 72 70 72 fill` | `H/2` all round, e.g. `20px` for a 40px-tall pill | Capsule counter (coins, gems). It stretches only in width; the centre is 0px tall by design. |
| `round.webp` | 256×256 | `50% fill` | `50%` | Round icon-button bezel with four rivets. Scale it uniformly (square element); do not stretch it. |

## Example

```css
.btn {
  border-style: solid;
  border-width: 27px 29px 30px 29px;
  border-image: url(img/ui/kit/btn_green.webp) 54 58 60 58 fill / 27px 29px 30px 29px stretch;
  background: none;
}
.btn:active { filter: brightness(.92); transform: translateY(2px); }

.panel {
  border: 62px solid transparent;
  border-image: url(img/ui/kit/panel.webp) 124 fill / 62px stretch;
}

.pill {
  height: 40px;
  border: 20px solid transparent;
  border-image: url(img/ui/kit/pill.webp) 70 72 70 72 fill / 20px stretch;
  padding: 0 4px;
}
```

**Content spacing.** Because the borders are thick, pull content into them with a negative margin, or set a
smaller `border-image-width` than `border-width`. Example: `border-width: 10px 14px 14px` together with
`border-image-width: 27px 29px 30px 29px` and `border-image-outset: 17px 15px 16px 15px`.

## Sources and rebuilding

The art was generated in Scenario (GPT Image 2.5 Flare, transparent background) as three sheets:
- buttons;
- panel, parchment, ribbon and tab bar;
- round, slot and pill.

The sheets were split into `assets/raw/kit_*.png`.

To rebuild, run these two commands in order:
1. `python3 tools/cut.py kit_` crops each raw image and sizes it (the `size` values in `tools/asset_spec.mjs`).
2. `python3 tools/kit9.py` forces the 9-slice, flattening the centre and making the edges uniform, then writes `assets/kit_slices.json`.
