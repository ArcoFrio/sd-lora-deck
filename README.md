# LoRA Deck

A new **Lora** tab for Stable Diffusion WebUI: a fast, good-looking LoRA browser for txt2img and img2img.

- **Cards in three shapes:** tall hexagons in a honeycomb, tall octagons, or rounded cards. A size slider sits next to
  the tab's icons, and names stay legible at every size.
- **Folders as tabs:** your top-level LoRA folders (for example SDXL, Pony, Flux) become tabs, with deeper folders as
  chips below.
- **Clicking a card** adds the LoRA. If its activation text has alternatives (outfits, poses...), it asks which one.
- **A card already in the prompt** is lit and shows its weight, which you can change in place.
- **Previews that fit:** square and wide pictures show whole instead of being cut off, and you can move and zoom each
  one in its card. A LoRA without a preview can show the first picture you made with it.
- **Edit in place:** the preview (one of your gens, or an upload), the card's texts, and a look at the file's metadata.
- **Fast:** previews are served as small thumbnails, and only the rows of cards near the view are on the page, so
  hundreds of LoRAs scroll smoothly. Cards that arrive during a fast scroll fade in.

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

**The model each LoRA is for** shows on its card, as a small square label with a coloured dot (Illustrious, Pony,
NoobAI, SDXL, SD 1.5, Anima, Flux, Qwen, Wan, Lumina...). It looks unlike the round folder badges, so the two can't be
mixed up. LoRA Deck reads it from the first of these that says:
1. its Civitai info (what its author picked);
2. its card's "sd version", if you set one;
3. its training metadata (the network module, the base model version, and the base checkpoint's name, which tells
   Illustrious, NoobAI and Pony apart within SDXL);
4. the names of its weights, for files with no metadata at all.

The details show where it was read from.

**On Forge Neo, the UI Preset picks what you see:**
- If one top-level folder is named after the preset (`Anima` for anima, `SDXL`, `Illustrious`, `Pony` or `NoobAI` for
  xl, `Flux`...), that folder opens.
- If none or several are (folders sorted another way, or both `Illustrious` and `Pony` for xl), **Made for <preset>**
  turns on instead. It shows only the LoRAs made for that preset, and the ones whose model can't be told, in every
  folder. Click it to turn it off or on; the choice is kept per preset.
- The last folder you opened for a preset is remembered too.
- Forge Neo's own setting "Filter Lora based on selected Preset" uses the detected model as well when a card has no
  "sd version".

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
  - **Edit preview**, **Edit card**, **Metadata** and **Show in Explorer** (see below), ★, and copy the path.
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
  - **⋯**: activation text under the cards, Organize tags, Gens as previews, Animations, Classic Lora tab.
- **★** marks favourites. **Favourites** and **Recent** (the last 40 added) filter the cards.
- **Right-click a card** (or press the Menu key, or Shift+F10, on a focused card) for its menu:
  - add it to the prompt or take it out;
  - Details, Edit preview, Edit card, Metadata;
  - favourite;
  - copy its tag, its activation text or its path;
  - Show in Explorer;
  - **Delete…**: after you confirm, the LoRA file and the files that belong to it alone (its card, previews,
    Civitai info, description) go to the Recycle Bin, where you can restore them. On macOS and Linux they go to
    `cache/deleted` instead. Deleting works only from the computer the WebUI runs on.
- **Animations** are short and never hold back a click. They can be turned off in **⋯**, and they also stop when your
  system asks for reduced motion.

Your choices are kept per browser: shape, size, sort, the open folder, favourites and recent.

## Previews and editing

**How a preview sits in its card.** Cards are 2:3. A preview of about that shape fills its card. Any other shape
(square, wide, very tall) shows whole over a blurred copy of itself, so nothing is cut off. **Edit preview** changes
that for one LoRA.

The details dialog changes into each tool and back. **✕ or Esc** takes you back to the details; a click outside the
dialog closes it.

**Resizing:** drag any edge of the dialog, or the grip that shows at its bottom-right corner as the mouse nears it.
Each view (details, Edit preview, Edit card, Metadata) keeps its own size, for every LoRA. In the details, the left edge,
and the grip that shows to the left of the picture as the mouse nears it, make the picture bigger or smaller. The text
beside it keeps its width. Double-click a grip to go back to the usual size.

- **Edit preview** shows the picture in a card of your shape, with the rest of the picture faintly around it.
  - Drag to move it; the mouse wheel or the slider zooms. **Fill the card**, **Whole picture** and **Automatic** are
    quick choices.
  - The three shape buttons above the card preview the other shapes. They don't change your cards' shape.
  - **Picture:** pick one of the pictures you made with this LoRA (newest first), **Upload** one, or take the one
    shown in the WebUI's **Gallery** (like the WebUI editor's Replace preview). It shows in the card straight away, to
    move and zoom.
  - Nothing is written until **Save preview**. It saves the picture as `<name>.preview.png`, next to the LoRA, with how
    it sits. A gen keeps its generation info. The old preview is moved to `cache/preview-backups` first, never deleted.
- **Gens as previews** (in **⋯**, on by default): a LoRA without a preview shows the first picture made with it. It is
  only shown, nothing is saved. Save it in Edit preview to make it the preview.
  - Gens are read from the WebUI's output folders, as **Settings > Paths for saving** names them: txt2img and img2img
    (or the one folder for all), and the Save button's folder. Grids and extras are left out.
  - A picture counts when its generation info names the LoRA: a `<lora:...>` tag, or its entry in `Lora hashes` (which
    also finds LoRAs renamed since).
  - LoRA Deck reads only the start of each file, and only new or changed files after the first look, so thousands of
    gens take about a second.
- **Edit card:** everything the WebUI's own card editor has, and a little more. It writes the same card and keeps
  every other entry in it.
  - Description, activation text (with a count of its `||` choices as you type), preferred weight (a slider and a
    number), model version, negative text and notes.
  - **Training tags:** the 24 tags most used in its captions, coloured by how often. A click puts one in the
    activation text, or takes it out; the ones already in it are lit.
  - **Random prompt:** its training tags, each picked by how often it was trained on, as the WebUI does. Generate
    another, copy it, or add it to the prompt.
  - The card, 256 pixels wide at first like the WebUI's. Drag its corner to make it bigger or smaller, for every LoRA;
    double-click the corner for the usual size. Under it: the file, size, hash, dates, model, clip skip, module, trained
    resolutions and dataset size.
- **Metadata:** what the `.safetensors` file says about its training. You get the base model, network, resolution,
  epochs, steps, images, learning rate, optimizer and dates; its dataset folders; the tags it was trained on (a click
  adds one); and every field, searchable, with **Copy all**.
- **Show in Explorer** opens the LoRA's folder with the file selected (Finder on macOS, the file manager on Linux). It
  works only from the computer the WebUI runs on.

## Organize tags

Off by default. When it's on, a click lays the prompt out one line per kind of tag:

| Line | Holds |
|---|---|
| 1 | LoRA tags (`<lora:...>`) |
| 2 | activation: trigger words, and style, quality and rating tags (`sketch`, `masterpiece`, `nsfw`) |
| 3 | participants (`1girl`, `solo`, `2boys`, `yuri`...) |
| 4 | appearance: face and head, and what's worn on the head (`blue eyes`, `twintails`, `beret`, `glasses`) |
| 5 | body, and what the clothes show of it (`large breasts`, `wide hips`, `cleavage`, `tail`) |
| 6 | outfit (`white shirt`, `pleated skirt`, `thigh boots`, `choker`) |
| 7 | pose, action, objects and expression (`sitting`, `holding sword`, `looking at viewer`, `smile`) |
| 8 | background (`white background`, `beach`, `cherry blossoms`) |
| 9 | camera (`cowboy shot`, `from above`, `close-up`) |

- **Each tag goes to the line its meaning says**, wherever it sits in the card. LoRA Deck reads a tag the way booru
  tags are built, so it also places tags it has never seen:
  - by its last word: `lavender hair`, `striped thighhighs` and `frilled apron` are hair, legwear and an apron;
  - by its verb: `holding sword`, `sitting on throne`, `looking at phone` are poses;
  - by where a body part is: `arms up` is a pose, `hair up` appearance and `breasts out` body.
  - It knows Danbooru's and e621's tags: it places about 98% of the tag uses in Danbooru's 5,000 most-used tags, and
    about 94% for e621.
- **A LoRA's own trigger words** (tags that aren't real booru tags) on its card's first line stay on line 2. On later
  lines, a tag it can't place goes with the rest of its line: an outfit trigger like `alicedress` goes with the outfit.
  LoRA Deck tells trigger words from real tags with the tag lists of
  [tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete) when it's installed; without them, a card's
  first tag counts as its trigger.
- The LoRA tag goes at the end of line 1, and each tag at the end of its line. Missing lines are added empty.
- A tag already on its line isn't added twice. Taking a LoRA out keeps the tags another LoRA in the prompt still uses
  (two characters share `1girl`).
- In the details panel, a trigger word or a training tag you click goes to its line too.

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
  - `/lora-deck/v1/card`, `/framing`, `/preview`: read and save a card, how its preview sits, a new preview.
  - `/lora-deck/v1/gens`, `/gen-thumb`, `/firsts`: the pictures made with a LoRA, a smaller copy of one, and the first
    one for each LoRA without a preview.
  - `/lora-deck/v1/metadata`: its training metadata. `/lora-deck/v1/reveal`: Show in Explorer. `/lora-deck/v1/delete`:
    a LoRA and its own files to the Recycle Bin.
- `javascript/lora_deck.js`: the tab.
- `javascript/lora_deck_tags.js`: which line a booru tag belongs on, for Organize tags.
- `style.css`: its looks. The colours come from the WebUI's theme, so it follows light and dark mode.

It writes only a LoRA's card (`<name>.json`) and its preview, when you save in the details, and deletes a LoRA only
when you confirm it (to the Recycle Bin). The output folders are only read.

## License

MIT, see [LICENSE](LICENSE).
