"""
LoRA Deck: a new Lora tab for txt2img and img2img (Stable Diffusion WebUI Forge Neo, Forge and AUTOMATIC1111).
The page itself is javascript/lora_deck.js and style.css; this file gives it what it reads:

  GET /lora-deck/v1/list?refresh=0   every LoRA as the Lora tab has it: the name its <lora:...> tag uses, its card
                                     (activation and negative text, preferred weight, notes, description, SD version),
                                     Civitai Helper's trained words and base model, the tags it was trained on, its
                                     folder below models/Lora, its preview's kind; refresh=1 rescans the folders first
  GET /lora-deck/v1/item?name=       the same for one LoRA (after its card was edited)
  GET /lora-deck/v1/thumb?name=&w=   its preview, made smaller (WebP, kept in cache/thumbs) so 300+ cards load fast;
                                     GIF and video previews are sent as they are

It only reads (the thumbnails are its own cache); editing a card still goes through the WebUI's own editor.
"""
import base64
import hashlib
import html
import io
import json
import os
import re

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from modules import script_callbacks, shared

EXT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THUMBS = os.path.join(EXT_DIR, "cache", "thumbs")
# The order the WebUI's Lora tab looks for a preview in: <name>.<ext>, then <name>.preview.<ext>, for each kind.
STILL = ("png", "jpg", "jpeg", "webp", "avif", "jxl", "heif")
MOVING = ("gif", "mp4", "webm")
WIDTHS = (160, 240, 320, 480, 640, 960)


def _networks(refresh=False):
    try:
        import networks  # sd_forge_lora's module
    except ImportError:
        return {}
    if refresh or not networks.available_networks:
        networks.list_available_networks()
        _sync_forge_page()
    return networks.available_networks


def _sync_forge_page():
    """The WebUI's card editor looks LoRAs up in its Lora page's items: rebuild them after a rescan, so a LoRA added
    since the WebUI started can be edited too."""
    try:
        from modules import ui_extra_networks
        page = next((p for p in ui_extra_networks.extra_pages if p.name == "lora"), None)
        if page is not None:
            page.lister.reset()
            page.items = {x["name"]: x for x in page.list_items()}
    except Exception as e:  # the deck still works without it; only editing a brand-new LoRA would need the WebUI's refresh
        print(f"[LoRA Deck] could not update the WebUI's Lora page: {e}")


def _json_file(path):
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            got = json.load(f)
        return got if isinstance(got, dict) else {}
    except (OSError, ValueError):
        return {}


def _text_file(base):
    for p in (base + ".txt", base + ".description.txt"):
        if os.path.isfile(p):
            try:
                with open(p, encoding="utf-8", errors="replace") as f:
                    return f.read()
            except OSError:
                pass
    return ""


def _plain(text, limit=1500):
    """Civitai descriptions are HTML: keep the words, one paragraph per line."""
    text = re.sub(r"(?i)<\s*(br|/p|/li|/h\d)\s*/?>", "\n", str(text or ""))
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    text = "\n".join(re.sub(r"[ \t]+", " ", line).strip() for line in text.splitlines())
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:limit] + ("…" if len(text) > limit else "")


def _tag_counts(metadata, n=40):
    try:
        freq = json.loads(metadata.get("ss_tag_frequency") or "{}")
    except (TypeError, ValueError):
        return []
    counts = {}
    for tags in freq.values() if isinstance(freq, dict) else []:
        for tag, count in (tags or {}).items() if isinstance(tags, dict) else []:
            t = str(tag).strip()
            if t:
                counts[t] = counts.get(t, 0) + int(count or 0)
    return [[t, c] for t, c in sorted(counts.items(), key=lambda kv: -kv[1])[:n]]


def _preview(base, metadata):
    """(kind, path): "still" or "moving" with the file the WebUI would show, "embedded" for a cover image inside the
    .safetensors, or (None, None)."""
    for ext in STILL + MOVING:
        for p in (f"{base}.{ext}", f"{base}.preview.{ext}"):
            if os.path.isfile(p):
                return ("moving" if ext in MOVING else "still"), p
    if metadata.get("ssmd_cover_images"):
        try:
            if any(json.loads(metadata["ssmd_cover_images"])):
                return "embedded", None
        except (TypeError, ValueError):
            pass
    return None, None


def _roots():
    roots = [shared.cmd_opts.lora_dir, *(getattr(shared.cmd_opts, "lora_dirs", None) or [])]
    return [os.path.abspath(r) for r in roots if r]


def _folder(filename):
    """Its folder below models/Lora (or the --lora-dirs folder it is in), "/"-separated; "" for one at the top."""
    d = os.path.dirname(os.path.abspath(filename))
    for root in _roots():
        if d == root or d.startswith(root + os.sep):
            rel = os.path.relpath(d, root)
            return "" if rel == "." else rel.replace(os.sep, "/")
    return os.path.basename(d)


def _mtime(path):
    try:
        return int(os.path.getmtime(path))
    except OSError:
        return 0


def _item(obj):
    base = os.path.splitext(obj.filename)[0]
    meta = getattr(obj, "metadata", None) or {}
    user = _json_file(base + ".json")
    civ = _json_file(base + ".civitai.info")
    kind, pv = _preview(base, meta)
    try:
        weight = float(user.get("preferred weight") or 0)
    except (TypeError, ValueError):
        weight = 0.0
    return {
        "name": obj.name,
        "alias": obj.get_alias(),
        "path": obj.filename,
        "file": os.path.basename(obj.filename),
        "folder": _folder(obj.filename),
        "mtime": _mtime(obj.filename),
        "size": os.path.getsize(obj.filename) if os.path.isfile(obj.filename) else 0,
        "hash": obj.shorthash or "",
        "preview": kind,
        "pv": _mtime(pv) if pv else 0,
        "pext": os.path.splitext(pv)[1][1:].lower() if pv else "",
        "activation": str(user.get("activation text") or ""),
        "negative": str(user.get("negative text") or ""),
        "weight": weight,
        "notes": _plain(user.get("notes") or "", 4000),
        "description": _plain(user.get("description") or _text_file(base)),
        "sd_version": str(user.get("sd version") or ""),
        "base_model": str(civ.get("baseModel") or ""),
        "trained_words": [str(w).strip() for w in civ.get("trainedWords") or [] if str(w).strip()][:30],
        "tags": _tag_counts(meta),
    }


def _find(name):
    nets = _networks()
    obj = nets.get(name) or next((o for o in nets.values() if o.get_alias() == name), None)
    if obj is None:
        raise HTTPException(404, f"No LoRA named {name!r}.")
    return obj


def _lanczos():
    from PIL import Image
    return getattr(Image, "Resampling", Image).LANCZOS


def _thumb_bytes(obj, kind, path):
    from PIL import Image
    if kind == "embedded":
        covers = json.loads((getattr(obj, "metadata", None) or {}).get("ssmd_cover_images") or "[]")
        return Image.open(io.BytesIO(base64.b64decode(next(c for c in covers if c))))
    return Image.open(path)


def deck_api(_, app: FastAPI):
    @app.get("/lora-deck/v1/list")
    def deck_list(refresh: int = 0):
        nets = _networks(bool(refresh))
        items = []
        for obj in list(nets.values()):
            try:
                items.append(_item(obj))
            except Exception as e:
                print(f"[LoRA Deck] skipped {getattr(obj, 'name', '?')}: {e}")
        opts = shared.opts
        return {"items": items,
                "default_weight": float(getattr(opts, "extra_networks_default_multiplier", 1.0) or 1.0),
                "separator": getattr(opts, "extra_networks_add_text_separator", " "),
                "preset": getattr(opts, "forge_preset", ""),
                "preset_filter": bool(getattr(opts, "lora_preset_filter", False))}

    @app.get("/lora-deck/v1/item")
    def deck_item(name: str):
        return _item(_find(name))

    @app.get("/lora-deck/v1/thumb")
    def deck_thumb(name: str, w: int = 320):
        obj = _find(name)
        kind, path = _preview(os.path.splitext(obj.filename)[0], getattr(obj, "metadata", None) or {})
        if kind is None:
            raise HTTPException(404, "This LoRA has no preview.")
        cache = {"Cache-Control": "public, max-age=31536000, immutable"}  # the page adds the preview's date to the URL
        if kind == "moving":
            return FileResponse(path, headers=cache)
        w = next((x for x in WIDTHS if x >= w), WIDTHS[-1])
        stamp = f"{path or obj.filename}|{_mtime(path) if path else _mtime(obj.filename)}|{w}"
        out = os.path.join(THUMBS, hashlib.sha1(stamp.encode("utf-8")).hexdigest() + ".webp")
        if not os.path.isfile(out):
            try:
                img = _thumb_bytes(obj, kind, path)
                img.load()
                if img.mode not in ("RGB", "RGBA"):
                    img = img.convert("RGBA" if "A" in img.getbands() or img.mode == "P" else "RGB")
                if img.width > w:
                    img = img.resize((w, max(1, round(img.height * w / img.width))), _lanczos())
                os.makedirs(THUMBS, exist_ok=True)
                part = out + ".part"
                img.save(part, "WEBP", quality=86, method=4)
                os.replace(part, out)
            except Exception as e:
                if path:  # can't shrink it: send the picture itself
                    print(f"[LoRA Deck] thumbnail for {obj.name} failed ({e}); sending the full picture")
                    return FileResponse(path, headers=cache)
                raise HTTPException(500, f"Could not read the preview: {e}")
        return FileResponse(out, media_type="image/webp", headers=cache)



script_callbacks.on_app_started(deck_api)
