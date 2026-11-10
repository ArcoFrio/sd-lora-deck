# LoRA Deck

A new **Lora** tab for Stable Diffusion WebUI: a fast, good-looking LoRA browser for txt2img and img2img.

- **Cards in three shapes:** tall hexagons in a honeycomb, tall octagons, or rounded cards. A size slider sits next to
  the tab's icons, and names stay legible at every size.
- **Folders as tabs:** your top-level LoRA folders (for example SDXL, Pony, Flux) become tabs, with deeper folders as
  chips below.
- **Clicking a card** adds the LoRA. If its activation text has alternatives (outfits, poses...), it asks which one.
- **A card already in the prompt** is lit and shows its weight, which you can change in place.
- **Fast:** previews are served as small thumbnails, so hundreds of cards load quickly.

The WebUI's own Lora tab is still there underneath: **⋯ > Classic Lora tab** switches back to it (with any buttons
other extensions add to its cards), and **LoRA Deck** in the same row switches forward again.

## Install

1. In the WebUI, open **Extensions > Install from URL**.
2. Paste `https://github.com/ArcoFrio/sd-lora-deck` and press **Install**.
3. Go to **Extensions > Installed** and press **Apply and restart UI** (or restart the WebUI).

To update it later: **Extensions > Installed > Check for updates**.

**Works with:**
- Stable Diffusion WebUI Forge Neo (Gradio 4), where it was made and tested;
- Forge and AUTOMATIC1111 1.10, which have the same Lora tab inside. Their code was checked against everything LoRA
  Deck uses, but they haven't been tested live yet: please open an issue if something is off.
- A recent browser (Chrome, Edge or Firefox from 2024 on).

On Forge Neo, the folder that matches the **UI Preset** opens by itself.

## Using it

- **Click a card** to add `<lora:name:weight>` and its activation text to the prompt, and its negative text to the
  negative prompt, as the WebUI does.
  - The weight is the card's preferred weight, or the WebUI's default weight.
  - Cards whose activation text has `||` alternatives ask which one to use. Pick with the mouse, or with the number
    keys 1 to 9; 0 is **None of these**, only the part that always goes in. See the activation text format below.
- **A card already in the prompt** shows a tick and its weight. Hover over it for − / + (0.05, or 0.2 with Shift) and
  ✕ to take it out. Clicking it opens its details instead of adding it twice.
- **In the prompt**, the row above the cards, lists every LoRA in the prompt with its weight. The mouse wheel over a
  weight changes it, and ✕ takes it out. A LoRA the prompt names but that isn't installed shows as *not found*.
- **ⓘ, or `i` on a focused card,** opens its details:
  - its choices: a click puts one in the prompt, or swaps it for the one already there;
  - activation and negative text, notes;
  - Civitai trigger words and the tags it was trained on: a click adds one;
  - file facts;
  - **Edit card** (the WebUI's own editor), **Metadata** and **Path**.
  - ← / → step through the cards on screen.
- **Folders:** the top row is the folders directly in `models/Lora`, plus **Loose files** for the LoRAs at the top.
  Deeper folders show as chips below. Click the lit chip again to go back up.
- **Search** covers names, folders, activation text, notes, trigger words and training tags. Press `/` to jump to it.
  It searches the open folder; when other folders also match, a button offers them.
- **Toolbar**, in the row of Lora icons:
  - card shape;
  - card size: the slider, its two buttons, or Ctrl + mouse wheel over the cards;
  - **Organize tags**;
  - blur the previews;
  - rescan the LoRA folders;
  - **⋯**: activation text under the cards, Organize tags, Animations, Classic Lora tab.
- **★** marks favourites. **Favourites** and **Recent** (the last 40 added) filter the cards.
- **Animations** are short and never hold back a click. They can be turned off in **⋯**, and they also stop when your
  system asks for reduced motion.

Your choices are kept per browser: shape, size, sort, the open folder, favourites and recent.

## Organize tags

Off by default. When it's on, a click lays the prompt out one line per kind of tag:

| Line | Holds |
|---|---|
| 1 | LoRA tags (`<lora:...>`) |
| 2 | activation (trigger words) |
| 3 | participants (`1girl`, `solo`...) |
| 4 | appearance (eyes, hair) |
| 5 | body |
| 6 | outfit |
| 7 | pose and expression |
| 8 | background |
| 9 | camera |

- The LoRA tag goes at the end of line 1.
- A one-line activation text goes at the end of line 2. An activation text written one kind per line, in the order of
  lines 2 to 6, has each of its lines go to the end of its own line.
- Missing lines are added empty.
- A tag already on its line isn't added twice. Taking a LoRA out keeps the tags another LoRA in the prompt still uses
  (two characters share `1girl`).

When it's off, a click adds everything at the end of the prompt, as the WebUI does.

## Activation text format

LoRA Deck reads the card the WebUI keeps next to each LoRA (`<name>.json`, made by the card editor). In its activation
text, `||` separates alternatives on one line; the lines around it always go in. For example:

```
alice,
1girl,
blue eyes, blonde hair, long hair,
alicedress, blue dress, white apron || aliceswim, striped swimsuit || alicepajamas, pink pajamas,
```

Clicking that card asks for one of the three outfits. On a single line, extra tags in front of the first alternative
are shared: `paper hat, red || blue || green` always adds `paper hat`, then the colour you pick.

## Files

- `scripts/lora_deck.py`: the data the tab reads.
  - `/lora-deck/v1/list`: every LoRA with its card, Civitai info, training tags, folder and preview. Add `?refresh=1`
    to rescan first.
  - `/lora-deck/v1/item`: one LoRA, read again after its card is edited.
  - `/lora-deck/v1/thumb`: previews shrunk to WebP. They're kept in `cache/thumbs` and made again when missing.
- `javascript/lora_deck.js`: the tab.
- `style.css`: its looks. The colours come from the WebUI's theme, so it follows light and dark mode.

It only reads; cards are still edited with the WebUI's editor.

## License

MIT, see [LICENSE](LICENSE).
