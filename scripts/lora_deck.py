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
  GET /lora-deck/v1/card?name=       its card as written (for the card editor)
  POST /lora-deck/v1/card            save its card (description, activation and negative text, weight, notes, version);
                                     every other key in the .json is kept
  POST /lora-deck/v1/framing         save how its preview sits in a card (position and zoom), or forget it
  POST /lora-deck/v1/preview         a new preview (an uploaded picture or one of its gens), with its framing; the old
                                     one is moved to cache/preview-backups first
  GET /lora-deck/v1/gens?name=       the pictures made with it in the WebUI's output folders (as its settings name
                                     them), newest first, read from their infotext
  GET /lora-deck/v1/gen-thumb?id=&w= one of those, made smaller
  GET /lora-deck/v1/firsts           for each LoRA without a preview, the first picture made with it
  GET /lora-deck/v1/metadata?name=   what its .safetensors says about its training
  POST /lora-deck/v1/reveal          show the file in Explorer (Finder, the file manager); only from this computer

It writes only the LoRA's card (.json) and preview, and only when asked from the page. The output folders are only read.
"""
import base64
import hashlib
import html
import io
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import threading
import time
import zlib

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from modules import script_callbacks, shared

EXT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THUMBS = os.path.join(EXT_DIR, "cache", "thumbs")
BACKUPS = os.path.join(EXT_DIR, "cache", "preview-backups")
CARD_KEYS = ("description", "activation text", "negative text", "preferred weight", "notes", "sd version")
OWN_KEY = "lora deck"  # LoRA Deck's own entry in a card: {"framing": {"x": .5, "y": .4, "z": 1}}
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


_REAL = {}


def _real_tags():
    """Every real booru tag (Danbooru general and meta, e621 general and species, the quality tags) from
    a1111-sd-webui-tagcomplete's lists, if it is installed: the page tells a card's made-up tags (its triggers) from
    real ones by it. None without them."""
    if "set" not in _REAL:
        names = set()
        root = os.path.dirname(EXT_DIR)
        keep = {"danbooru.csv": {"0", "5"}, "e621.csv": {"0", "5", "7"}, "extra-quality-tags.csv": None}
        try:
            dirs = [d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d, "tags"))]
        except OSError:
            dirs = []
        for d in dirs:
            for fname, cats in keep.items():
                p = os.path.join(root, d, "tags", fname)
                if not os.path.isfile(p):
                    continue
                try:
                    with open(p, encoding="utf-8", errors="replace") as f:
                        for line in f:
                            parts = line.split(",", 2)
                            if parts and parts[0] and (cats is None or (len(parts) > 1 and parts[1].strip() in cats)):
                                names.add(parts[0].strip().strip('"').replace("_", " ").lower())
                except OSError:
                    pass
        _REAL["set"] = names or None
        if names:
            print(f"[LoRA Deck] {len(names)} booru tags known (from tagcomplete), to tell LoRA triggers from real tags")
    return _REAL["set"]


def _clean_tag(tag):
    """As the page writes a tag (lora_deck_tags.js clean()): lower case, spaces, no weight or brackets around it."""
    t = tag.strip().lower().replace("\\(", "(").replace("\\)", ")")
    while True:
        m = re.match(r"^[(\[{]+(.*?)(?::[\d.]+)?[)\]}]+$", t)
        if not m or m.group(1) == t:
            break
        t = m.group(1).strip()
    return re.sub(r"\s+", " ", t.replace("_", " ")).strip()


def _made_up(activation):
    """The tags of an activation text that aren't real booru tags (its triggers), or None without the tag lists."""
    real = _real_tags()
    if real is None:
        return None
    out = set()
    for part in re.split(r"[,\n]|\|\|", activation or ""):
        t = _clean_tag(part)
        if t and t not in real:
            out.add(t)
    return sorted(out)


_DIMS = {}


def _dims(path):
    """A preview's size in pixels (read from its header once per change)."""
    if not path:
        return 0, 0
    key = (path, _stamp(path))
    if key not in _DIMS:
        try:
            from PIL import Image
            with Image.open(path) as im:
                _DIMS[key] = im.size
        except Exception:
            _DIMS[key] = (0, 0)
    return _DIMS[key]


def _framing(user):
    own = user.get(OWN_KEY)
    fr = own.get("framing") if isinstance(own, dict) else None
    if not isinstance(fr, dict):
        return None
    try:
        return {"x": float(fr["x"]), "y": float(fr["y"]), "z": float(fr["z"])}
    except (KeyError, TypeError, ValueError):
        return None


def _write_card(obj, change):
    """Change a LoRA's card (.json next to it) in place, keeping every other key; written whole or not at all."""
    path = os.path.splitext(obj.filename)[0] + ".json"
    card = _json_file(path)
    change(card)
    part = path + ".part"
    with open(part, "w", encoding="utf-8", newline="\n") as f:
        json.dump(card, f, indent=4, ensure_ascii=False)
        f.write("\n")
    os.replace(part, path)
    _sync_one(obj.name)


def _sync_one(name):
    """The WebUI's Lora page keeps its cards' data: read this one again so its own tab and editor see the change."""
    try:
        from modules import ui_extra_networks
        page = next((p for p in ui_extra_networks.extra_pages if p.name == "lora"), None)
        if page is not None and name in page.items:
            page.read_user_metadata(page.items[name], use_cache=False)
    except Exception:
        pass


def _local(request):
    host = (request.client.host if request.client else "") or ""
    return host in ("127.0.0.1", "::1", "localhost") or host.startswith("127.")


class CardIn(BaseModel):
    name: str
    card: dict


class FramingIn(BaseModel):
    name: str
    framing: dict | None = None


class PreviewIn(BaseModel):
    name: str
    data: str | None = None  # an uploaded picture: a data: URL or plain base64
    gen: str | None = None  # or one of its gens (an id from /gens)
    framing: dict | None = None  # how it sits in the card; none: the automatic framing


class NameIn(BaseModel):
    name: str


def _mtime(path):
    try:
        return int(os.path.getmtime(path))
    except OSError:
        return 0


def _stamp(path):
    """Changes whenever the file does, even twice in one second (for caches and preview URLs)."""
    try:
        st = os.stat(path)
        return f"{st.st_mtime_ns}-{st.st_size}"
    except OSError:
        return "0"


def _version(path):
    try:
        st = os.stat(path)
        return (st.st_mtime_ns // 1_000_000) * 7 + st.st_size % 7
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
        "pv": _version(pv) if pv else 0,
        "pext": os.path.splitext(pv)[1][1:].lower() if pv else "",
        "pw": _dims(pv)[0] if kind == "still" else 0,
        "ph": _dims(pv)[1] if kind == "still" else 0,
        "framing": _framing(user),
        "activation": str(user.get("activation text") or ""),
        "made_up": _made_up(str(user.get("activation text") or "")),
        "negative": str(user.get("negative text") or ""),
        "weight": weight,
        "notes": _plain(user.get("notes") or "", 4000),
        "description": _plain(user.get("description") or _text_file(base)),
        "sd_version": str(user.get("sd version") or ""),
        "base_model": str(civ.get("baseModel") or ""),
        "trained_words": [str(w).strip() for w in civ.get("trainedWords") or [] if str(w).strip()][:30],
        "tags": _tag_counts(meta),
    }


# --- the gens: pictures in the WebUI's output folders, and the LoRAs their infotext names -------------------------
GEN_EXT = (".png", ".jpg", ".jpeg", ".webp", ".avif")
LORA_TAG = re.compile(r"<lora:([^:>]+)(?::[^>]*)?>", re.I)
LORA_HASHES = re.compile(r'Lora hashes: "([^"]*)"')
_GENS = {"files": {}, "ids": {}, "at": 0.0, "dirs": []}
_GENS_LOCK = threading.Lock()


def _gen_dirs():
    """The folders the WebUI saves its pictures in, as its settings name them (Settings > Paths for saving): one folder
    for all of them, or txt2img's and img2img's; and the one the Save button uses. Grids and extras are left out."""
    o = shared.opts
    one = str(getattr(o, "outdir_samples", "") or "")
    dirs = [one] if one else [str(getattr(o, "outdir_txt2img_samples", "") or ""), str(getattr(o, "outdir_img2img_samples", "") or "")]
    dirs.append(str(getattr(o, "outdir_save", "") or ""))
    out = []
    for d in dirs:
        d = os.path.abspath(d) if d else ""
        if d and os.path.isdir(d) and d not in out and not any(d.startswith(x + os.sep) for x in out):
            out.append(d)
    return out


def _png_head(path):
    """(width, height, infotext) from a PNG's first chunks, without decoding the picture."""
    w = h = 0
    with open(path, "rb") as f:
        if f.read(8) != b"\x89PNG\r\n\x1a\n":
            return 0, 0, None
        while True:
            head = f.read(8)
            if len(head) < 8:
                return w, h, None
            n, kind = struct.unpack(">I4s", head)
            if kind in (b"IDAT", b"IEND") or n > 16 * 1024 * 1024:
                return w, h, None
            data = f.read(n)
            f.seek(4, 1)
            if kind == b"IHDR":
                w, h = struct.unpack(">II", data[:8])
            elif kind in (b"tEXt", b"zTXt", b"iTXt"):
                key, _, rest = data.partition(b"\0")
                if key != b"parameters":
                    continue
                if kind == b"tEXt":
                    return w, h, rest.decode("latin-1", "replace")
                if kind == b"zTXt":
                    return w, h, zlib.decompress(rest[1:]).decode("latin-1", "replace")
                packed = rest[0]
                rest = rest[2:].split(b"\0", 2)[-1]
                return w, h, (zlib.decompress(rest) if packed else rest).decode("utf-8", "replace")


def _gen_head(path):
    if path.lower().endswith(".png"):
        return _png_head(path)
    from PIL import Image
    with Image.open(path) as im:
        try:
            from modules import images
            text = images.read_info_from_image(im)[0]
        except Exception:
            text = im.info.get("parameters")
        return im.width, im.height, text


def _gen_loras(text):
    """The LoRAs an infotext used: the names in its <lora:...> tags and its "Lora hashes" (lower case), and the hashes."""
    names, hashes = set(), set()
    for m in LORA_TAG.finditer(text or ""):
        names.add(m.group(1).strip().lower())
    h = LORA_HASHES.search(text or "")
    for pair in (h.group(1).split(",") if h else []):
        n, _, v = pair.rpartition(":")
        if n.strip():
            names.add(n.strip().lower())
        if v.strip():
            hashes.add(v.strip().lower())
    return sorted(names), sorted(hashes)


def _gens(max_age=10.0):
    """Every gen that names a LoRA: {path: entry}. Read again at most every few seconds, and then only the pictures
    that are new or changed, so it stays quick with thousands of them."""
    with _GENS_LOCK:
        dirs = _gen_dirs()
        if time.time() - _GENS["at"] < max_age and dirs == _GENS["dirs"]:
            return _GENS["files"]
        old, new = _GENS["files"], {}
        for root in dirs:
            for dp, _dns, fns in os.walk(root):
                for fn in fns:
                    if not fn.lower().endswith(GEN_EXT):
                        continue
                    path = os.path.join(dp, fn)
                    try:
                        st = os.stat(path)
                    except OSError:
                        continue
                    key = (st.st_mtime_ns, st.st_size)
                    e = old.get(path)
                    if e is None or e["key"] != key:
                        try:
                            w, h, text = _gen_head(path)
                        except Exception:
                            w, h, text = 0, 0, None
                        names, hashes = _gen_loras(text)
                        e = {"key": key, "t": st.st_mtime, "w": w, "h": h, "names": names, "hashes": hashes,
                             "id": hashlib.sha1(path.encode("utf-8")).hexdigest()[:16]}
                    if e["names"] or e["hashes"]:
                        new[path] = e
        _GENS.update(files=new, ids={e["id"]: p for p, e in new.items()}, at=time.time(), dirs=dirs)
        return new


def _gens_of(obj):
    """(path, entry) of the gens made with this LoRA, oldest first: its name or alias in their tags, or its hash."""
    keys = {obj.name.lower(), str(obj.get_alias()).lower()}
    short = str(obj.shorthash or "").lower()
    got = [(p, e) for p, e in _gens().items() if keys.intersection(e["names"]) or (short and short in e["hashes"])]
    return sorted(got, key=lambda pe: pe[1]["t"])


def _gen_out(path, e):
    return {"id": e["id"], "w": e["w"], "h": e["h"], "t": int(e["t"]), "file": os.path.basename(path)}


def _gen_path(gid):
    _gens()
    path = _GENS["ids"].get(gid)
    if not path or not os.path.isfile(path):
        raise HTTPException(404, "That picture isn't in the output folders any more.")
    return path


def _small(path, w, load, label):
    """A thumbnail of a picture (WebP, cached in cache/thumbs by the file's stamp and the width)."""
    cache = {"Cache-Control": "public, max-age=31536000, immutable"}  # the page adds the picture's date to the URL
    w = next((x for x in WIDTHS if x >= w), WIDTHS[-1])
    stamp = f"{path}|{_stamp(path)}|{w}"
    out = os.path.join(THUMBS, hashlib.sha1(stamp.encode("utf-8")).hexdigest() + ".webp")
    if not os.path.isfile(out):
        try:
            img = load()
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
            if os.path.isfile(path):  # can't shrink it: send the picture itself
                print(f"[LoRA Deck] thumbnail for {label} failed ({e}); sending the full picture")
                return FileResponse(path, headers=cache)
            raise HTTPException(500, f"Could not read the picture: {e}")
    return FileResponse(out, media_type="image/webp", headers=cache)


def _clean_framing(given):
    if not given:
        return None
    try:
        fr = {k: round(float(given[k]), 4) for k in ("x", "y", "z")}
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, "The framing needs x, y and z numbers.")
    fr["z"] = min(8.0, max(0.1, fr["z"]))
    return fr


def _set_framing(card, fr):
    own = card.get(OWN_KEY) if isinstance(card.get(OWN_KEY), dict) else {}
    if fr:
        own["framing"] = fr
    else:
        own.pop("framing", None)
    if own:
        card[OWN_KEY] = own
    else:
        card.pop(OWN_KEY, None)


def _find(name):
    nets = _networks()
    obj = nets.get(name) or next((o for o in nets.values() if o.get_alias() == name), None)
    if obj is None:
        raise HTTPException(404, f"No LoRA named {name!r}.")
    return obj


def _sd_versions():
    try:
        import network
        if hasattr(network, "SD_VERSION"):
            return [str(v) for v in network.SD_VERSION]
        if hasattr(network, "SdVersion"):
            return [v.name for v in network.SdVersion]
    except Exception:
        pass
    return ["Unknown"]


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
                "sd_versions": _sd_versions(),
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
        if kind == "moving":
            return FileResponse(path, headers={"Cache-Control": "public, max-age=31536000, immutable"})
        return _small(path or obj.filename, w, lambda: _thumb_bytes(obj, kind, path), obj.name)

    @app.get("/lora-deck/v1/gens")
    def deck_gens(name: str, offset: int = 0, limit: int = 60):
        got = _gens_of(_find(name))[::-1]
        offset, limit = max(0, offset), min(200, max(1, limit))
        return {"total": len(got), "items": [_gen_out(p, e) for p, e in got[offset:offset + limit]],
                "dirs": _gen_dirs()}

    @app.get("/lora-deck/v1/gen-thumb")
    def deck_gen_thumb(id: str, w: int = 160):
        from PIL import Image
        path = _gen_path(id)
        return _small(path, w, lambda: Image.open(path), os.path.basename(path))

    @app.get("/lora-deck/v1/firsts")
    def deck_firsts():
        gens = sorted(_gens().items(), key=lambda pe: pe[1]["t"])
        first = {}
        for p, e in gens:
            for k in e["names"] + ["#" + h for h in e["hashes"]]:
                first.setdefault(k, (p, e))
        out = {}
        for obj in list(_networks().values()):
            try:
                if _preview(os.path.splitext(obj.filename)[0], getattr(obj, "metadata", None) or {})[0]:
                    continue
                short = str(obj.shorthash or "").lower()
                hits = [first[k] for k in (obj.name.lower(), str(obj.get_alias()).lower(), "#" + short if short else "") if k in first]
                if hits:
                    out[obj.name] = _gen_out(*min(hits, key=lambda pe: pe[1]["t"]))
            except Exception as e:
                print(f"[LoRA Deck] skipped {getattr(obj, 'name', '?')} looking for its gens: {e}")
        return {"firsts": out, "dirs": _gen_dirs()}

    @app.get("/lora-deck/v1/card")
    def deck_card(name: str):
        obj = _find(name)
        card = _json_file(os.path.splitext(obj.filename)[0] + ".json")
        return {k: card.get(k, 0 if k == "preferred weight" else "") for k in CARD_KEYS}

    @app.post("/lora-deck/v1/card")
    def deck_card_save(req: CardIn):
        obj = _find(req.name)
        given = {k: v for k, v in req.card.items() if k in CARD_KEYS}
        if "preferred weight" in given:
            try:
                given["preferred weight"] = round(float(given["preferred weight"] or 0), 3)
            except (TypeError, ValueError):
                raise HTTPException(400, "The weight must be a number.")
        for k in CARD_KEYS:
            if k in given and k != "preferred weight":
                given[k] = str(given[k] if given[k] is not None else "")
        _write_card(obj, lambda card: card.update(given))
        return _item(obj)

    @app.post("/lora-deck/v1/framing")
    def deck_framing(req: FramingIn):
        obj = _find(req.name)
        fr = _clean_framing(req.framing)
        _write_card(obj, lambda card: _set_framing(card, fr))
        return _item(obj)

    @app.post("/lora-deck/v1/preview")
    def deck_preview(req: PreviewIn):
        from PIL import Image
        obj = _find(req.name)
        fr = _clean_framing(req.framing)
        src = None
        if req.gen:
            src = _gen_path(req.gen)
            try:
                img = Image.open(src)
                img.load()
            except Exception:
                raise HTTPException(400, "That gen can't be read.")
        elif req.data:
            raw = req.data.split(",", 1)[1] if req.data.startswith("data:") else req.data
            try:
                blob = base64.b64decode(raw)
                img = Image.open(io.BytesIO(blob))
                img.load()
            except Exception:
                raise HTTPException(400, "That file isn't a picture this can read.")
            if len(blob) > 60 * 1024 * 1024:
                raise HTTPException(413, "That picture is too big (60 MB at most).")
        else:
            raise HTTPException(400, "Send a picture (data) or one of its gens (gen).")
        base = os.path.splitext(obj.filename)[0]
        # every file the WebUI could take as its preview goes to the backups first, so the new one is the one shown
        stamp = time.strftime("%Y%m%d-%H%M%S")
        moved = 0
        for ext in STILL + MOVING:
            for old in (f"{base}.{ext}", f"{base}.preview.{ext}"):
                if os.path.isfile(old):
                    dest = os.path.join(BACKUPS, obj.name, f"{stamp}-{os.path.basename(old)}")
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    os.replace(old, dest)
                    moved += 1
        out = base + ".preview.png"
        if src and src.lower().endswith(".png"):
            shutil.copyfile(src, out + ".part")  # a PNG gen as it is, its infotext too
        else:
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "A" in img.getbands() or img.mode == "P" else "RGB")
            img.save(out + ".part", "PNG")
        os.replace(out + ".part", out)
        _write_card(obj, lambda card: _set_framing(card, fr))
        print(f"[LoRA Deck] new preview for {obj.name} ({img.width}x{img.height}{', from ' + os.path.basename(src) if src else ''});"
              f" {moved} old file(s) in {BACKUPS}")
        return _item(obj)

    @app.get("/lora-deck/v1/metadata")
    def deck_metadata(name: str):
        obj = _find(name)
        meta = {}
        for k, v in (getattr(obj, "metadata", None) or {}).items():
            if k == "ssmd_cover_images":
                continue
            if isinstance(v, str) and v[:1] in "{[":
                try:
                    v = json.loads(v)
                except ValueError:
                    pass
            meta[k] = v
        return {"metadata": meta, "file": os.path.basename(obj.filename)}

    @app.post("/lora-deck/v1/reveal")
    def deck_reveal(req: NameIn, request: Request):
        if not _local(request):
            raise HTTPException(403, "Only from the computer the WebUI runs on.")
        path = os.path.normpath(_find(req.name).filename)
        try:
            if sys.platform.startswith("win"):
                subprocess.Popen(["explorer", "/select,", path])
            elif sys.platform == "darwin":
                subprocess.Popen(["open", "-R", path])
            else:
                subprocess.Popen(["xdg-open", os.path.dirname(path)])
        except OSError as e:
            raise HTTPException(500, f"Could not open the folder: {e}")
        return {"ok": True}



script_callbacks.on_app_started(deck_api)
