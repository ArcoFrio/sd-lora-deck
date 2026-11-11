// LoRA Deck: a new Lora tab for txt2img and img2img (Stable Diffusion WebUI Forge Neo, Forge and AUTOMATIC1111).
// The WebUI's own Lora tab stays underneath (the ⋯ menu's "Classic Lora tab" brings it back); its card editor and
// metadata viewer are reused. The data comes from scripts/lora_deck.py (/lora-deck/v1/...).
//
// Clicking a card adds <lora:name:weight> (its preferred weight, else the default weight) and its activation text to
// the prompt, and its negative text to the negative prompt, as the WebUI does. Unlike it, a card with "||" alternatives
// in its activation text (outfits, positions, grades) asks which one, and a card already in the prompt opens its
// details instead of taking it out (the ✕ on it, or Take out in its details, does that). Its weight is changed in place.
(function () {
    "use strict";

    const TABS = ["txt2img", "img2img"];
    const API = "./lora-deck/v1";
    const KEY = "loraDeck.";
    const SIZE_MIN = 104, SIZE_MAX = 360, SIZE_DEFAULT = 176;
    const WIDTHS = [160, 240, 320, 480, 640, 960];
    const OTHER = "\u0001top";  // the path of the LoRAs at the top of models/Lora (no folder)

    const store = {
        get(k, d) {
            try {
                const v = localStorage.getItem(KEY + k);
                return v == null ? d : JSON.parse(v);
            } catch (e) {
                return d;
            }
        },
        set(k, v) {
            try {
                localStorage.setItem(KEY + k, JSON.stringify(v));
            } catch (e) { /* private window: the choice lasts this visit */ }
        },
    };
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const prefs = {
        size: clamp(Number(store.get("size", SIZE_DEFAULT)) || SIZE_DEFAULT, SIZE_MIN, SIZE_MAX),
        sort: store.get("sort", "name"),
        desc: !!store.get("desc", false),
        blur: !!store.get("blur", false),
        classic: !!store.get("classic", false),
        act: store.get("act", true) !== false,
        lines: !!store.get("lines", false),  // Organize tags (off: a click adds at the end of the prompt, as the WebUI does)
        motion: store.get("motion", true) !== false,  // the short animations (Windows' "reduce motion" also stops them)
        gens: store.get("gens", true) !== false,
        cardPic: clamp(Number(store.get("cardPic", 256)) || 256, 140, 520),
        dlg: (() => { const v = store.get("dlg", {}); return v && typeof v === "object" ? v : {}; })(),  // the details' sizes, per view  // the card in Edit card, px wide (the WebUI's is 256)  // a LoRA without a preview shows the first picture made with it (nothing saved)
        shape: ["hex", "octa", "card"].includes(store.get("shape", "hex")) ? store.get("shape", "hex") : "hex",
    };
    const savePref = (k, v) => { prefs[k] = v; store.set(k, v); };
    const favs = new Set(store.get("favs", []));
    let recent = store.get("recent", []);

    const data = { items: [], by: new Map(), meta: { default_weight: 1, separator: " ", preset: "", preset_filter: false }, ready: false, error: "", loading: null };
    const decks = {};

    // --- small helpers ------------------------------------------------------------------------------------------
    const app = () => (typeof gradioApp === "function" ? gradioApp() : document);
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const compact = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const fmtW = (w) => String(Math.round(Number(w) * 100) / 100);
    function el(tag, cls, htmlText) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (htmlText != null) e.innerHTML = htmlText;
        return e;
    }

    const ICONS = {
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
        x: '<path d="M18 6 6 18M6 6l12 12"/>',
        star: '<path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.8L12 16.9l-5.2 2.75 1-5.8-4.2-4.1 5.8-.85z"/>',
        info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6h.01"/>',
        refresh: '<path d="M20 11.5A8 8 0 0 0 5.6 6.4L4 8"/><path d="M4 3.8V8h4.2"/><path d="M4 12.5a8 8 0 0 0 14.4 5.1L20 16"/><path d="M20 20.2V16h-4.2"/>',
        eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
        eyeOff: '<path d="M3 3l18 18"/><path d="M10.4 5.6A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.5 6.6C4 8.2 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
        sort: '<path d="M11 6h9M11 12h6.5M11 18h4"/><path d="M4.5 15.5 7 18l2.5-2.5M7 6v12"/>',
        gridSmall: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4"/>',
        gridLarge: '<rect x="4.5" y="4.5" width="15" height="15" rx="2.4"/>',
        more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
        check: '<path d="M5 12.6l4.4 4.4L19 7.4"/>',
        checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8.2 12.4l2.6 2.6 5-5.4"/>',
        minus: '<path d="M6 12h12"/>',
        plus: '<path d="M12 6v12M6 12h12"/>',
        copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M5 15V6.2C5 5.5 5.5 5 6.2 5H15"/>',
        edit: '<path d="M4 20h4.2L19 9.2 14.8 5 4 15.8z"/><path d="M13.6 6.2l4.2 4.2"/>',
        code: '<path d="M8.5 4.5H7.6a2 2 0 0 0-2 2v3.3L4 12l1.6 2.2v3.3a2 2 0 0 0 2 2h.9M15.5 4.5h.9a2 2 0 0 1 2 2v3.3L20 12l-1.6 2.2v3.3a2 2 0 0 1-2 2h-.9"/>',
        folder: '<path d="M3.5 7.2c0-1 .8-1.7 1.7-1.7h4l2 2h7.6c1 0 1.7.8 1.7 1.7v7.6c0 1-.8 1.7-1.7 1.7H5.2c-1 0-1.7-.8-1.7-1.7z"/>',
        classic: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><path d="M3.5 9.5h17M9.5 9.5v10"/>',
        deck: '<rect x="3.5" y="5" width="7.5" height="10.5" rx="1.6"/><rect x="13" y="5" width="7.5" height="10.5" rx="1.6"/><path d="M3.5 19h17"/>',
        clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.5V12l3 2"/>',
        image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 15.5 15.5 11 6 19.5"/>',
        list: '<path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10"/><circle cx="5" cy="6.5" r="1.1"/><circle cx="5" cy="12" r="1.1"/><circle cx="5" cy="17.5" r="1.1"/>',
        chevron: '<path d="m9.5 6 6 6-6 6"/>',
        left: '<path d="m14.5 6-6 6 6 6"/>',
        warn: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 16.9h.01"/>',
        lines: '<path d="M4 7h16M4 12h10M4 17h13"/>',
        spark: '<path d="M12 3.5v3.2M12 17.3v3.2M3.5 12h3.2M17.3 12h3.2M6 6l2.2 2.2M15.8 15.8 18 18M6 18l2.2-2.2M15.8 8.2 18 6"/>',
        hex: '<path d="M12 2.8l7.2 4.3v9.8L12 21.2l-7.2-4.3V7.1z"/>',
        octa: '<path d="M8.6 2.8h6.8L19 6.4v11.2l-3.6 3.6H8.6L5 17.6V6.4z"/>',
        rect: '<rect x="5" y="3.5" width="14" height="17" rx="3"/>',
        cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
        trash: '<path d="M4.5 7h15M10 7V4.8h4V7M6.5 7l.9 12.2c.1.9.8 1.6 1.7 1.6h5.8c.9 0 1.6-.7 1.7-1.6L17.5 7"/><path d="M10 11v6M14 11v6"/>',
        move: '<path d="M12 3.5v17M3.5 12h17M12 3.5 9.5 6M12 3.5 14.5 6M12 20.5 9.5 18M12 20.5l2.5-2.5M3.5 12 6 9.5M3.5 12 6 14.5M20.5 12 18 9.5M20.5 12 18 14.5"/>',
    };
    const ic = (name, cls) => `<svg class="ld-i${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

    let toastTimer = null;
    function toast(text) {
        let t = document.querySelector(".ld-toast");
        if (!t) {
            t = el("div", "ld-toast");
            t.setAttribute("role", "status");
            document.body.appendChild(t);
        }
        t.textContent = text;
        t.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
    }
    function copyText(text, what) {
        const done = () => toast(`Copied ${what || "to the clipboard"}`);
        if (navigator.clipboard && window.isSecureContext !== false) {
            navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
        } else fallbackCopy(text, done);
    }
    function fallbackCopy(text, done) {
        const ta = el("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px";
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand("copy");
            done();
        } catch (e) {
            toast("Could not copy");
        }
        ta.remove();
    }

    // --- motion: short (under 0.3 s), transform and opacity only, only the cards in view, never waiting on it ------
    const EASE = "cubic-bezier(.2,.8,.2,1)";
    const reduceMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const motionOn = () => prefs.motion && !(reduceMotion && reduceMotion.matches);
    const inView = (r, g, pad) => r.width > 0 && r.bottom > g.top - pad && r.top < g.bottom + pad;
    // Where the cards in view are now (null: don't animate); play() then moves the ones that stay from there to their
    // new place and fades the new ones in, so a search, folder, sort or shape change shows where things went.
    function snapshot(d) {
        if (!motionOn() || !d.grid.offsetParent || !d.list) return null;
        const g = d.grid.getBoundingClientRect();
        const map = new Map();
        for (const c of d.list.children) {
            if (!c.dataset.name) continue;
            const r = c.getBoundingClientRect();
            if (r.width && r.top > g.bottom + 80) break;  // the cards go row by row: the rest are further down
            if (inView(r, g, 80)) map.set(c.dataset.name, r);
        }
        return map;
    }
    function play(d, before) {
        if (!before) return;
        // the moves still running stop first (their transform would skew the reading), then every position is read
        // before any animation starts, so the page is laid out once, not once per card
        (d.moving || []).forEach((a) => a.cancel());
        d.moving = [];
        if (!d.list) return;
        const g = d.grid.getBoundingClientRect();
        const todo = [];
        for (const c of d.list.children) {
            if (!c.dataset.name) continue;
            const r = c.getBoundingClientRect();
            if (r.width && r.top > g.bottom) break;
            if (inView(r, g, 0)) todo.push([c, r]);
        }
        let k = 0;
        for (const [c, r] of todo) {
            const old = before.get(c.dataset.name);
            let a;
            if (old) {
                const dx = old.left - r.left, dy = old.top - r.top, s = old.width / r.width;
                if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(s - 1) < 0.01) continue;
                a = c.animate([{ transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${s})` },
                    { transformOrigin: "0 0", transform: "none" }], { duration: 240, easing: EASE });
            } else {
                a = c.animate([{ opacity: 0, transform: "translateY(10px) scale(.97)" }, { opacity: 1, transform: "none" }],
                    { duration: 200, easing: EASE, delay: Math.min(k++ * 10, 120), fill: "backwards" });
            }
            a.id = "ld-move";
            d.moving.push(a);
        }
    }
    // A number that counts to its new value (the "24 of 352" line).
    function countTo(node, from, to, fmt) {
        cancelAnimationFrame(node._ldRaf);
        if (!motionOn() || from == null || from === to || !node.offsetParent) {
            node.textContent = fmt(to);
            return;
        }
        const t0 = performance.now();
        const step = (now) => {
            const k = Math.min(1, (now - t0) / 260);
            node.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
            if (k < 1) node._ldRaf = requestAnimationFrame(step);
        };
        node._ldRaf = requestAnimationFrame(step);
    }
    function pop(node) {
        if (motionOn() && node && node.animate) node.animate([{ transform: "scale(.8)", opacity: 0.3 }, { transform: "scale(1.08)", opacity: 1, offset: 0.6 }, { transform: "none", opacity: 1 }], { duration: 240, easing: EASE });
    }
    // a changed weight rolls in from the side it moved to
    function roll(node, up) {
        if (motionOn() && node && node.animate) node.animate([{ transform: `translateY(${up ? 7 : -7}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 170, easing: EASE });
    }
    function burst(node) {
        if (!motionOn() || !node) return;
        node.classList.remove("ld-burst");
        void node.offsetWidth;
        node.classList.add("ld-burst");
        setTimeout(() => node.classList.remove("ld-burst"), 520);
    }
    // Adding a LoRA: the card gives a small bump and its picture flies into the prompt box, which glows, so it's clear
    // where it went (skipped when the prompt box is out of sight: the lit card and the row above the cards say it).
    function added(d, it, card) {
        if (!motionOn() || !card) return;
        const media = card.querySelector(".ld-media");
        if (media) media.animate([{ scale: 1 }, { scale: 1.045, offset: 0.35 }, { scale: 1 }], { duration: 280, easing: EASE });
        const box = promptBox(d.tab);
        const src = (media || card).getBoundingClientRect();
        if (!box || !src.width) return;
        const dst = box.getBoundingClientRect();
        if (!dst.width || dst.bottom < 0 || dst.top > window.innerHeight) return;
        const size = 52;
        const fly = el("div", "ld-fly" + (prefs.blur ? " ld-blurred" : ""));
        fly.innerHTML = it.preview && !isVideo(it) ? `<img src="${thumbUrl(it, 160)}" alt="">` : `<span>${esc(it._title.slice(0, 2))}</span>`;
        document.body.appendChild(fly);
        const p0 = [src.left + src.width / 2 - size / 2, src.top + src.height * 0.38 - size / 2];
        const p2 = [Math.min(dst.right - 60, dst.left + dst.width * 0.9) - size / 2, dst.bottom - 30 - size / 2];
        const p1 = [(p0[0] + p2[0]) / 2, Math.min(p0[1], p2[1]) - 80];
        const at = (k) => {  // a point on the curve from the card to the prompt box
            const u = 1 - k;
            return [u * u * p0[0] + 2 * u * k * p1[0] + k * k * p2[0], u * u * p0[1] + 2 * u * k * p1[1] + k * k * p2[1]];
        };
        const frames = [0, 0.25, 0.5, 0.75, 1].map((k) => {
            const [x, y] = at(k);
            return { transform: `translate(${x}px, ${y}px) scale(${1 - 0.6 * k * k})`, opacity: k < 0.85 ? 1 : 0.2 };
        });
        frames[0].opacity = 0.6;
        const a = fly.animate(frames, { duration: 440, easing: "cubic-bezier(.45,0,.25,1)" });
        a.onfinish = () => {
            fly.remove();
            box.animate([{ boxShadow: "0 0 0 0 color-mix(in srgb, var(--color-accent, #f97316) 65%, transparent)" },
                { boxShadow: "0 0 0 8px color-mix(in srgb, var(--color-accent, #f97316) 0%, transparent)" }], { duration: 520, easing: "ease-out" });
        };
        a.oncancel = () => fly.remove();
    }

    // --- names, folders, activation choices ------------------------------------------------------------------------
    function pretty(s) {
        s = String(s || "").replace(/_/g, " ").trim();
        if (/[\s-]/.test(s)) return s;
        return s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([a-z]{2,})(\d)/g, "$1 $2");
    }
    // A short, readable name: the card's description names it ("Alice (Wonderland, SDXL), ..."), else the file name
    // without its "[XL]_" tag and a first word that only repeats its folder ("Wonderland_Alice" in .../Wonderland).
    function titleOf(it) {
        const d = (it.description || "").match(/^([^()\n,]{2,48}?)\s*\(/);
        if (d && compact(it.name).includes(compact(d[1]))) return pretty(d[1]);
        const parts = it.name.replace(/^\[[^\]]*\]_?/, "").split("_").filter(Boolean);
        const segs = it.folder.split("/").map(compact);
        if (parts.length > 1 && (segs.includes(compact(parts[0])) || compact(parts[0]) === "concept")) parts.shift();
        return pretty(parts.join(" ") || it.name);
    }
    const tagOf = (it) => (it.name.match(/^\[([^\]]+)\]/) || [])[1] || "";
    const familyOf = (it) => (it.folder ? it.folder.split("/")[0] : OTHER);

    // "||" alternatives: the line that has them is the choice, the lines around it always go in. On a first line, the
    // first alternative's extra leading tags are shared ("paper hat, red || blue || green": "paper hat" always goes in).
    function parseChoices(act) {
        const text = String(act || "").replace(/\r/g, "");
        if (!text.includes("||")) return null;
        const lines = text.split("\n");
        const li = lines.findIndex((l) => l.includes("||"));
        const before = lines.slice(0, li), after = lines.slice(li + 1);
        const comma = /,\s*$/.test(lines[li]) || after.length > 0;
        const options = lines[li].split("||").map((s) => s.trim().replace(/,\s*$/, "").trim()).filter(Boolean);
        let prefix = "";
        const tags = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
        if (li === 0 && options.length > 1) {
            const first = tags(options[0]);
            const k = Math.max(...options.slice(1).map((o) => tags(o).length));
            if (first.length > k) {
                prefix = first.slice(0, first.length - k).join(", ");
                options[0] = first.slice(first.length - k).join(", ");
            }
        }
        const compose = (i) => {
            const mid = [prefix, i >= 0 ? options[i] : ""].filter(Boolean).join(", ");
            return [...before, ...(mid ? [mid + (comma ? "," : "")] : []), ...after].join("\n").trim();
        };
        const shared = [...before.map((l) => l.trim().replace(/,\s*$/, "")), prefix, ...after.map((l) => l.trim().replace(/,\s*$/, ""))].filter(Boolean).join(", ");
        return { options, prefix, compose, shared };
    }
    // Every text this card's activation can have put in the prompt, longest first (to take out the right one).
    function variants(it) {
        const ch = it._choices;
        const all = new Set([it.activation.trim()]);
        if (ch) {
            ch.options.forEach((_, i) => all.add(ch.compose(i)));
            all.add(ch.compose(-1));
        }
        const out = [];
        all.forEach((v) => {
            if (!v) return;
            out.push(v);
            if (/,$/.test(v)) out.push(v.replace(/,$/, ""));
        });
        return out.sort((a, b) => b.length - a.length);
    }
    function activeChoice(prompt, it) {
        const ch = it._choices;
        if (!ch) return null;
        const order = ch.options.map((_, i) => i).sort((a, b) => ch.compose(b).length - ch.compose(a).length);
        for (const i of order) if (hasText(prompt, ch.compose(i), it)) return i;
        const none = ch.compose(-1);
        return none && hasText(prompt, none, it) ? -1 : null;
    }

    // --- the prompt ---------------------------------------------------------------------------------------------
    const promptBox = (tab, neg) => app().querySelector(`#${tab}_${neg ? "neg_" : ""}prompt textarea`);
    function write(box, value) {
        if (!box || box.value === value) return;
        const h0 = motionOn() && box.offsetParent ? box.getBoundingClientRect().height : 0;
        box.value = value;
        if (typeof updateInput === "function") updateInput(box);
        else box.dispatchEvent(new Event("input", { bubbles: true }));
        // Gradio sets the new height before the next frame: grow (or shrink) to it from the old one
        if (h0) requestAnimationFrame(() => {
            const h1 = box.getBoundingClientRect().height;
            if (Math.abs(h1 - h0) > 1) box.animate([{ height: h0 + "px" }, { height: h1 + "px" }], { duration: 220, easing: EASE });
        });
    }
    const sepText = () => (data.meta.separator == null ? " " : data.meta.separator);
    const loraRe = (alias) => new RegExp(`<lora:${escRe(alias)}:([^>]*)>`);
    function findTag(prompt, it) {
        for (const a of new Set([it.alias, it.name])) {
            const m = prompt.match(loraRe(a));
            if (m) return m;
        }
        return null;
    }
    // {name: weight text} for the deck's LoRAs in the prompt, and the <lora:...> names it doesn't know
    function inPrompt(prompt) {
        const on = new Map(), unknown = [];
        for (const m of prompt.matchAll(/<lora:([^:>]+):([^>]*)>/g)) {
            const it = data.byAlias.get(m[1]) || data.by.get(m[1]);
            if (it) on.set(it.name, m[2].split(":")[0]);
            else unknown.push(m[1]);
        }
        return { on, unknown };
    }
    function append(text, piece) {
        if (!text.trim()) return piece;
        if (/\n$/.test(text)) return text + piece;
        return text.replace(/[ \t]+$/, "") + sepText() + piece;
    }
    // Takes out one piece of text and the comma that closed it, keeping the words around it apart.
    function cutOnce(text, piece) {
        if (!piece) return null;
        const i = text.indexOf(piece);
        if (i < 0) return null;
        let a = text.slice(0, i).replace(/[ \t]+$/, "");
        let b = text.slice(i + piece.length).replace(/^[ \t]*,?[ \t]*/, /,\s*$/.test(piece) ? "" : "");
        if (/\n$/.test(a) && /^\n/.test(b)) b = b.slice(1);
        if (a && b && !/\n$/.test(a) && !/^\n/.test(b)) a += " ";
        return a + b;
    }
    // Organize tags: one line per kind of tag: 1 LoRAs, 2 activation (triggers, style and quality), 3 participants,
    // 4 appearance, 5 body, 6 outfit, 7 pose, objects and expression, 8 background, 9 camera; every line ends with a comma.
    // Each tag goes to the line its meaning says (lora_deck_tags.js). A LoRA's own made-up tags on its card's first line
    // are its triggers (the backend marks which tags of a card aren't real booru tags) and stay on the activation line;
    // on later card lines a tag the meaning can't place goes with the rest of its line ("anisdefault" among outfit tags
    // is the outfit).
    // Tags go at the end of their line, lines that don't exist yet are added empty, and a tag already on its line isn't
    // added twice (two characters both bring "1girl").
    const LINE_LORA = 0, LINE_ACT = 1;
    const normTag = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
    const tagsOf = (line) => String(line || "").split(",").map((s) => s.trim()).filter(Boolean);
    function lineAdd(lines, n, tags) {
        while (lines.length <= n) lines.push("");
        const have = new Set(tagsOf(lines[n]).map(normTag));
        const add = [];
        for (const tg of tags) {
            if (have.has(normTag(tg))) continue;
            have.add(normTag(tg));
            add.push(tg);
        }
        if (!add.length) return;
        const line = lines[n].replace(/[\s,]+$/, "");
        lines[n] = (line ? line + ", " : "") + add.join(", ") + ",";
    }
    function lineRemove(lines, n, tags, keep) {
        if (n >= lines.length) return;
        const drop = new Set(tags.map(normTag).filter((tg) => !(keep && keep.has(tg))));
        const before = tagsOf(lines[n]);
        const rest = before.filter((tg) => !drop.has(normTag(tg)));
        if (rest.length !== before.length) lines[n] = rest.length ? rest.join(", ") + "," : "";
    }
    const joinLines = (lines) => (lines.every((l) => !l.trim()) ? "" : lines.join("\n"));
    // [[line, tag], ...]: where each tag of an activation text goes
    function placed(text, it) {
        const T = window.LoraDeckTags;
        const made = it && Array.isArray(it.made_up) ? new Set(it.made_up) : null;
        const out = [];
        String(text || "").trim().split("\n").forEach((seg, k) => {
            const tags = tagsOf(seg);
            if (!T) return tags.forEach((tg) => out.push([LINE_ACT + k, tg]));  // the classifier didn't load: card order
            const lines = tags.map((tg, i) => {
                // a card's own triggers: its made-up tags on its first line (without the tag lists: its first tag).
                // On later lines the meaning decides, and only a tag it can't place goes with its line.
                const own = k === 0 && (made ? made.has(T.clean(tg)) : i === 0);
                const n = own ? -1 : T.lineOf(tg);
                return n === LINE_LORA ? LINE_ACT : n;
            });
            let major = LINE_ACT;
            if (k > 0) {
                const count = {};
                lines.forEach((n) => { if (n > LINE_ACT) count[n] = (count[n] || 0) + 1; });
                const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
                if (best != null) major = Number(best);
            }
            tags.forEach((tg, i) => out.push([lines[i] >= 0 ? lines[i] : major, tg]));
        });
        return out;
    }
    // Is this activation text in the prompt with each tag on its line?
    function onLines(prompt, text, it) {
        const pl = prompt.split("\n");
        const pairs = placed(text, it);
        return pairs.length > 0 && pairs.every(([n, tg]) => tagsOf(pl[n]).some((x) => normTag(x) === normTag(tg)));
    }
    // ...or as one piece (added at the end)?
    function hasText(prompt, text, it) {
        text = String(text || "").trim();
        return !!text && (prompt.includes(text.replace(/,$/, "")) || onLines(prompt, text, it));
    }
    const hasNeg = (neg, text) => {
        const have = new Set(tagsOf(neg.replace(/\n/g, ",")).map(normTag));
        const want = tagsOf(String(text || "").replace(/\n/g, ","));
        return want.length > 0 && (neg.includes(String(text).trim()) || want.every((tg) => have.has(normTag(tg))));
    };
    // The tags the other LoRAs in the prompt brought to each line (the choice of theirs that is there): taking one
    // LoRA out leaves those ("1girl").
    function keptTags(prompt, except) {
        const sets = [];
        inPrompt(prompt).on.forEach((_, name) => {
            const o = data.by.get(name);
            if (!o || o.name === except.name || !o.activation) return;
            const v = variants(o).find((x) => hasText(prompt, x, o));
            if (!v) return;
            placed(v, o).forEach(([n, tg]) => (sets[n] || (sets[n] = new Set())).add(normTag(tg)));
        });
        return sets;
    }
    // Takes one activation text out: tag by tag from its lines when it sits on them (the lines stay, even if empty),
    // else as one piece.
    function cutText(prompt, text, it) {
        text = String(text || "").trim();
        if (onLines(prompt, text, it)) {
            const lines = prompt.split("\n");
            const keep = keptTags(prompt, it);
            placed(text, it).forEach(([n, tg]) => lineRemove(lines, n, [tg], keep[n]));
            return joinLines(lines);
        }
        for (const v of [text, text.replace(/,$/, "")]) {
            const r = cutOnce(prompt, v);
            if (v && r != null) return r;
        }
        return prompt;
    }
    function putText(prompt, text, it) {
        const lines = prompt.split("\n");
        placed(text, it).forEach(([n, tg]) => lineAdd(lines, n, [tg]));
        return lines.join("\n");
    }
    const weightOf = (it) => (it.weight ? it.weight : data.meta.default_weight || 1);
    function addLora(tab, it, actText) {
        const box = promptBox(tab);
        if (!box) return;
        const tag = `<lora:${it.alias}:${fmtW(weightOf(it))}>`;
        let p = box.value;
        if (prefs.lines) {
            const lines = p.split("\n");
            lineAdd(lines, LINE_LORA, [tag]);
            p = lines.join("\n");
            if (actText) p = putText(p, actText, it);
        } else {
            p = append(p, actText ? `${tag} ${actText}` : tag);
        }
        write(box, p);
        const neg = (it.negative || "").trim();
        if (neg) {
            const nb = promptBox(tab, true);
            if (nb && !hasNeg(nb.value, neg)) {
                if (prefs.lines) {
                    const lines = nb.value.split("\n");
                    lineAdd(lines, Math.max(0, lines.length - 1), tagsOf(neg.replace(/\n/g, ",")));
                    write(nb, lines.join("\n"));
                } else write(nb, append(nb.value, neg));
            }
        }
        recent = [it.name, ...recent.filter((n) => n !== it.name)].slice(0, 40);
        store.set("recent", recent);
        refreshAll();
    }
    function removeLora(tab, it) {
        const box = promptBox(tab);
        if (!box) return;
        let p = box.value;
        const m = findTag(p, it);
        const v = variants(it).find((x) => hasText(p, x, it));
        if (v) p = cutText(p, v, it);  // before the tag goes, so the other LoRAs' tags are still known
        if (m) {
            const lines = p.split("\n");
            const n = lines.findIndex((l) => tagsOf(l).includes(m[0]));
            if (n >= 0) {
                lineRemove(lines, n, [m[0]]);
                p = joinLines(lines);
            } else p = cutOnce(p, m[0]) ?? p;
        }
        write(box, p);
        const neg = (it.negative || "").trim();
        const nb = promptBox(tab, true);
        if (neg && nb && hasNeg(nb.value, neg)) {
            const r = cutOnce(nb.value, neg);
            if (r != null) write(nb, r);
            else {
                const lines = nb.value.split("\n");
                lines.forEach((_, n) => lineRemove(lines, n, tagsOf(neg.replace(/\n/g, ","))));
                write(nb, joinLines(lines));
            }
        }
        refreshAll();
    }
    function setWeight(tab, it, w) {
        const box = promptBox(tab);
        const m = box && findTag(box.value, it);
        if (!m) return;
        const rest = m[1].split(":");
        rest[0] = fmtW(clamp(w, -4, 4));
        const name = m[0].slice(6, m[0].length - m[1].length - 2);
        write(box, box.value.replace(m[0], `<lora:${name}:${rest.join(":")}>`));
        refreshAll();
    }
    function useChoice(tab, it, i) {
        const ch = it._choices;
        const next = ch.compose(i);
        const box = promptBox(tab);
        if (!box) return;
        const m = findTag(box.value, it);
        if (!m) return addLora(tab, it, next);
        let p = box.value;
        const v = variants(it).find((x) => hasText(p, x, it));
        if (v && p.includes(v) && !onLines(p, v, it)) p = p.replace(v, next);  // added as one piece: swap it in place
        else {
            if (v) p = cutText(p, v, it);
            p = prefs.lines ? putText(p, next, it) : p.replace(m[0], `${m[0]} ${next}`);
        }
        write(box, p);
        refreshAll();
    }
    // With Organize tags, a word goes to the line its meaning says (a made-up word to the activation line);
    // otherwise at the end of the prompt.
    function addWords(tab, words) {
        const box = promptBox(tab);
        if (!box) return;
        const w = words.trim().replace(/,$/, "");
        if (tagsOf(box.value.replace(/\n/g, ",")).some((tg) => normTag(tg) === normTag(w))) return toast("Already in the prompt");
        if (prefs.lines) {
            const lines = box.value.split("\n");
            const T = window.LoraDeckTags;
            const n = T ? T.lineOf(w) : -1;
            lineAdd(lines, n > LINE_LORA ? n : LINE_ACT, [w]);
            write(box, lines.join("\n"));
        } else write(box, append(box.value, w + ","));
        toast(`Added: ${w}`);
    }

    // --- data ---------------------------------------------------------------------------------------------------
    function prepare(it) {
        it._title = titleOf(it);
        it._tag = tagOf(it);
        it._family = familyOf(it);
        it._choices = parseChoices(it.activation);
        it._hay = [it.name, it._title, it.alias, it.folder, it.activation, it.notes, it.description.slice(0, 400), it.base_model,
            ...(it.trained_words || []), ...(it.tags || []).slice(0, 15).map((t) => t[0])].join(" \n").toLowerCase();
        return withGen(it);
    }
    // "Gens as previews": a LoRA without a preview shows the first picture made with it (only shown, never saved)
    function withGen(it) {
        const g = prefs.gens && !it.preview && data.firsts ? data.firsts[it.name] : null;
        if (g) Object.assign(it, { preview: "gen", gen: g, pw: g.w, ph: g.h });
        return it;
    }
    function applyGens(fetchAgain) {
        const paint = () => {
            const changed = [];
            for (const it of data.items) {
                const was = it.preview === "gen" ? it.gen.id : "";
                if (was) Object.assign(it, { preview: null, gen: null, pw: 0, ph: 0 });
                withGen(it);
                if (was !== (it.preview === "gen" ? it.gen.id : "")) changed.push(it.name);
            }
            if (!changed.length) return;
            everyDeck((d) => {
                changed.forEach((n) => d.cards.delete(n));
                renderAll(d);
            });
        };
        if (!prefs.gens || (data.firsts && !fetchAgain)) return Promise.resolve(paint());
        return api("firsts").then((r) => {
            data.firsts = r.firsts || {};
            data.genDirs = r.dirs || [];
            paint();
        }, (e) => console.warn("[LoRA Deck] could not look through the gens:", e.message));
    }
    function load(refresh) {
        if (data.loading && !refresh) return data.loading;
        data.loading = fetch(`${API}/list${refresh ? "?refresh=1" : ""}`, { cache: "no-store" })
            .then((r) => {
                if (!r.ok) throw new Error(`the WebUI answered ${r.status}`);
                return r.json();
            })
            .then((res) => {
                data.items = (res.items || []).map(prepare);
                data.by = new Map(data.items.map((it) => [it.name, it]));
                data.byAlias = new Map(data.items.map((it) => [it.alias, it]));
                data.meta = res;
                data.ready = true;
                data.error = "";
                Object.values(decks).forEach((d) => { d.cards.clear(); });
                buildTree();
                if (prefs.gens) setTimeout(() => applyGens(true));  // after the cards are up: it reads the output folders
            })
            .catch((e) => {
                data.error = `The LoRA list could not be read (${e.message}). Restart the WebUI if the extension was just added.`;
            })
            .finally(() => {
                data.loading = null;
                Object.values(decks).forEach((d) => {
                    if (!d.path) d.path = startPath(d);
                    renderAll(d);
                });
            });
        return data.loading;
    }
    function refreshItem(name) {
        fetch(`${API}/item?name=${encodeURIComponent(name)}`, { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : null))
            .then((it) => {
                if (!it) return;
                prepare(it);
                const i = data.items.findIndex((x) => x.name === it.name);
                if (i >= 0) data.items[i] = it;
                else data.items.push(it);
                data.by.set(it.name, it);
                data.byAlias.set(it.alias, it);
                Object.values(decks).forEach((d) => {
                    d.cards.delete(it.name);
                    renderAll(d);
                });
                if (infoState && infoState.it.name === it.name) openInfo(infoState.tab, it);
            });
    }

    // the folder tree: {count, kids: Map}
    let tree = { count: 0, kids: new Map() };
    function buildTree() {
        tree = { count: 0, kids: new Map() };
        for (const it of data.items) {
            if (hiddenByPreset(it)) continue;
            tree.count++;
            const segs = it.folder ? it.folder.split("/") : [OTHER];
            let node = tree;
            for (const s of segs) {
                if (!node.kids.has(s)) node.kids.set(s, { count: 0, kids: new Map() });
                node = node.kids.get(s);
                node.count++;
            }
        }
    }
    const nodeAt = (path) => path.reduce((n, s) => (n && n.kids.get(s)) || null, tree);
    const sortedKids = (node) => [...node.kids.keys()].sort((a, b) => (a === OTHER) - (b === OTHER) || a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
    const segLabel = (s) => (s === OTHER ? "Loose files" : s);

    // the UI Preset (anima, xl, wan...) and the top folders it fits
    const PRESET_WORDS = { sd: ["sd", "sd1", "sd15", "sd1.5"], xl: ["sdxl", "xl", "illustrious", "pony", "noobai", "noob"], flux: ["flux"], qwen: ["qwen", "qwenimage"], wan: ["wan"], anima: ["anima"], lumina: ["lumina"], chroma: ["chroma"] };
    function currentPreset() {
        const box = app().querySelector("#forge_ui_preset input");
        return String((box && box.value) || (window.opts && opts.forge_preset) || data.meta.preset || "").toLowerCase();
    }
    function familiesFor(preset) {
        const words = (PRESET_WORDS[preset] || [preset]).map(compact);
        return sortedKids(tree).filter((f) => f !== OTHER && words.some((w) => w && (compact(f) === w || compact(f).startsWith(w))));
    }
    // the preset a LoRA is for: its card's "sd version" when set, else the model LoRA Deck read from the file
    const PRESET_LABEL = { sd: "SD 1.5", xl: "SDXL", flux: "Flux", klein: "Flux.2", qwen: "Qwen", qwen21: "Qwen 2.1", qwenedit: "Qwen Edit",
        lumina: "Lumina", zit: "Z-Image", wan: "Wan", anima: "Anima", ernie: "Ernie", pid: "PiD", krea: "Krea" };
    const QWEN = ["qwen", "qwen21", "qwenedit"];
    function archOf(it) {
        const v = compact(it.sd_version);
        if (v && v !== "unknown") return v;
        return (it.model && it.model.arch) || "";
    }
    // unknown fits everything (it can't be told); the Qwen presets share their LoRAs
    function fitsPreset(it, preset) {
        const a = archOf(it), p = compact(preset);
        if (!a || !p) return true;
        return a === p || (QWEN.includes(a) && QWEN.includes(p));
    }
    function hiddenByPreset(it) {
        return !!data.meta.preset_filter && !fitsPreset(it, currentPreset());
    }
    // "Made for <preset>": on by itself when the folders don't say (no folder, or several, match the preset), so a
    // collection not sorted by model still shows what fits; a click on it is remembered for that preset
    function fitFor(d) {
        const preset = currentPreset();
        if (d.fitPreset === preset) return;
        d.fitPreset = preset;
        const saved = store.get(`fit.${preset}`, null);
        d.fit = typeof saved === "boolean" ? saved
            : !!PRESET_LABEL[preset] && familiesFor(preset).length !== 1 && data.items.some((it) => it.model && it.model.arch);
    }
    const MODEL_HUE = { "Anima": "#2dd4bf", "Illustrious": "#a78bfa", "Pony": "#f472b6", "NoobAI": "#fb923c", "SDXL": "#60a5fa",
        "SD 1.5": "#94a3b8", "SD 2": "#94a3b8", "Flux": "#fbbf24", "Flux.2": "#facc15", "Chroma": "#a3e635", "Qwen": "#c084fc",
        "Qwen Edit": "#c084fc", "Wan": "#4ade80", "Lumina": "#22d3ee", "Z-Image": "#22d3ee", "SD 3": "#818cf8" };
    const modelChip = (it) => (it.model ? `<span class="ld-model" style="--m:${MODEL_HUE[it.model.name] || "#9ca3af"}">${esc(it.model.name)}</span>` : "");
    const MODEL_FROM = { civitai: "its Civitai info", card: "its card", metadata: "its training metadata", weights: "its weights" };
    function startPath(d) {
        const preset = currentPreset();
        const saved = store.get(`path.${d.tab}.${preset}`, null);
        if (Array.isArray(saved) && nodeAt(saved)) return saved;
        const fams = familiesFor(preset);
        return fams.length === 1 ? [fams[0]] : [];
    }
    function setPath(d, path) {
        d.path = path;
        store.set(`path.${d.tab}.${currentPreset()}`, path);
        renderAll(d);
        d.grid.scrollTop = 0;
    }

    // --- the deck: toolbar (in the WebUI's row of Lora icons), folders, cards ----------------------------------------
    function thumbWidth() {
        const px = prefs.size * 1.35 * (window.devicePixelRatio || 1);
        return WIDTHS.find((w) => w >= px) || WIDTHS[WIDTHS.length - 1];
    }
    const isVideo = (it) => it.preview === "moving" && it.pext !== "gif";
    // its preview; a gen (preview "gen") when it has none; a picture picked in Edit preview and not saved yet (_src)
    const genThumb = (g, w) => `${API}/gen-thumb?id=${encodeURIComponent(g.id)}&w=${w}&v=${g.t}`;
    const thumbUrl = (it, w) => it._src || (it.preview === "gen" ? genThumb(it.gen, w)
        : `${API}/thumb?name=${encodeURIComponent(it.name)}&w=${w}&v=${it.pv || it.mtime}`);

    function mount(tab) {
        const host = app().querySelector(`#${tab}_lora_controls`);
        const cardsHtml = app().querySelector(`#${tab}_lora_cards_html`);
        if (!host || !cardsHtml || !host.closest(".extra-networks-controls-div") || decks[tab]) return !!decks[tab];

        const d = { tab, host, cardsHtml, path: null, q: "", mode: "all", cards: new Map(), on: new Map(), unknown: [], lastPrompt: null, lastPreset: null };
        decks[tab] = d;

        // toolbar
        const bar = el("div", "ld-toolbar");
        bar.innerHTML = `
          <label class="ld-search" title="Search names, folders, activation text, trigger words and notes (press / to jump here)">
            ${ic("search")}<input type="search" placeholder="Search LoRAs" spellcheck="false" autocomplete="off" aria-label="Search LoRAs">
            <button type="button" class="ld-btn ld-clear" title="Clear the search" aria-label="Clear the search">${ic("x")}</button>
          </label>
          <div class="ld-seg ld-sortgroup" role="group" aria-label="Sort">
            <select class="ld-sort" title="Sort by" aria-label="Sort by">
              <option value="name">Name</option><option value="newest">Newest</option><option value="folder">Folder</option>
            </select>
            <button type="button" class="ld-btn ld-icon ld-dir" title="Reverse the order" aria-label="Reverse the order">${ic("sort")}</button>
          </div>
          <div class="ld-seg ld-shape" role="radiogroup" aria-label="Card shape">
            <button type="button" class="ld-btn ld-icon" role="radio" data-shape="hex" title="Hexagon cards (honeycomb)" aria-label="Hexagon cards">${ic("hex")}</button>
            <button type="button" class="ld-btn ld-icon" role="radio" data-shape="octa" title="Octagon cards (small cut corners)" aria-label="Octagon cards">${ic("octa")}</button>
            <button type="button" class="ld-btn ld-icon" role="radio" data-shape="card" title="Rounded cards" aria-label="Rounded cards">${ic("rect")}</button>
          </div>
          <div class="ld-size" title="Card size (Ctrl + mouse wheel over the cards does it too)">
            <button type="button" class="ld-btn ld-icon ld-smaller" aria-label="Smaller cards">${ic("gridSmall")}</button>
            <input type="range" min="${SIZE_MIN}" max="${SIZE_MAX}" step="2" aria-label="Card size">
            <button type="button" class="ld-btn ld-icon ld-bigger" aria-label="Bigger cards">${ic("gridLarge")}</button>
          </div>
          <button type="button" class="ld-btn ld-icon ld-linesbtn" aria-label="Organize tags">${ic("lines")}</button>
          <button type="button" class="ld-btn ld-icon ld-blurbtn" aria-label="Blur the previews"></button>
          <button type="button" class="ld-btn ld-icon ld-reload" title="Rescan the LoRA folders" aria-label="Rescan the LoRA folders">${ic("refresh")}</button>
          <button type="button" class="ld-btn ld-icon ld-morebtn" title="More" aria-label="More options" aria-haspopup="menu">${ic("more")}</button>
          <button type="button" class="ld-btn ld-pill ld-backbtn" title="Back to the new Lora tab">${ic("deck")}<span>LoRA Deck</span></button>`;
        host.appendChild(bar);
        host.classList.add("ld-host");
        d.bar = bar;
        d.search = bar.querySelector(".ld-search input");
        d.range = bar.querySelector(".ld-size input");

        // pane
        const root = el("div", "ld-root");
        root.innerHTML = `
          <div class="ld-nav">
            <div class="ld-families" role="tablist" aria-label="Folders"><span class="ld-ind" aria-hidden="true"></span><div class="ld-famlist"></div></div>
            <div class="ld-modes" role="group" aria-label="Show"></div>
          </div>
          <div class="ld-sub"><div class="ld-path"></div><div class="ld-status" aria-live="polite"></div></div>
          <div class="ld-tray" aria-label="In the prompt"></div>
          <div class="ld-grid" role="list"></div>
          <div class="ld-empty" hidden></div>`;
        cardsHtml.parentElement.insertBefore(root, cardsHtml);
        d.root = root;
        d.families = root.querySelector(".ld-families");
        d.famList = root.querySelector(".ld-famlist");
        d.ind = root.querySelector(".ld-ind");
        d.modes = root.querySelector(".ld-modes");
        d.pathEl = root.querySelector(".ld-path");
        d.status = root.querySelector(".ld-status");
        d.tray = root.querySelector(".ld-tray");
        d.grid = root.querySelector(".ld-grid");
        d.empty = root.querySelector(".ld-empty");
        root.style.setProperty("--ld-size", prefs.size + "px");

        wireToolbar(d);
        wirePane(d);
        if (window.ResizeObserver) {
            let last = 0;
            new ResizeObserver(() => {
                if (d.grid.clientWidth !== last) {
                    last = d.grid.clientWidth;
                    layout(d);
                } else fillWindow(d);
                placeIndicator(d);
            }).observe(d.root);
        }
        d.grid.addEventListener("scroll", () => fillWindow(d), { passive: true });
        applyClassic(d);
        if (data.ready) {
            d.path = startPath(d);
            renderAll(d);
        } else {
            renderSkeleton(d);
            load();
        }
        return true;
    }

    function wireToolbar(d) {
        const { bar } = d;
        let qTimer = null;
        d.search.addEventListener("input", () => {
            clearTimeout(qTimer);
            qTimer = setTimeout(() => {
                d.q = d.search.value;
                renderAll(d);
                d.grid.scrollTop = 0;
            }, 90);
        });
        d.search.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                d.search.value = "";
                d.q = "";
                renderAll(d);
            } else if (e.key === "Enter") {
                if (d.shown && d.shown.length) revealIndex(d, 0);
            }
        });
        bar.querySelector(".ld-clear").addEventListener("click", () => {
            d.search.value = "";
            d.q = "";
            renderAll(d);
            d.search.focus();
        });
        const sort = bar.querySelector(".ld-sort");
        sort.value = prefs.sort;
        sort.addEventListener("change", () => {
            savePref("sort", sort.value);
            everyDeck(renderAll);
        });
        bar.querySelector(".ld-dir").addEventListener("click", () => {
            savePref("desc", !prefs.desc);
            everyDeck(renderAll);
        });
        d.range.value = prefs.size;
        d.range.addEventListener("input", () => setSize(Number(d.range.value)));
        bar.querySelector(".ld-shape").addEventListener("click", (e) => {
            const b = e.target.closest("[data-shape]");
            if (!b || b.dataset.shape === prefs.shape) return;
            savePref("shape", b.dataset.shape);
            everyDeck((x) => {
                const before = snapshot(x);
                paintToolbar(x);
                layout(x);
                play(x, before);
            });
        });
        bar.querySelector(".ld-smaller").addEventListener("click", () => setSize(prefs.size - 24, true));
        bar.querySelector(".ld-bigger").addEventListener("click", () => setSize(prefs.size + 24, true));
        bar.querySelector(".ld-linesbtn").addEventListener("click", () => {
            savePref("lines", !prefs.lines);
            everyDeck(paintToolbar);
            toast(prefs.lines ? "Organize tags: on (one line per kind of tag)" : "Organize tags: off (added at the end of the prompt)");
        });
        bar.querySelector(".ld-blurbtn").addEventListener("click", () => {
            savePref("blur", !prefs.blur);
            everyDeck(paintToolbar);
            toast(prefs.blur ? "Previews blurred" : "Previews shown");
        });
        const reload = bar.querySelector(".ld-reload");
        reload.addEventListener("click", () => {
            reload.classList.add("spin");
            load(true).finally(() => {
                reload.classList.remove("spin");
                toast(data.error ? "Rescan failed" : `${data.items.length} LoRAs`);
            });
        });
        bar.querySelector(".ld-morebtn").addEventListener("click", (e) => openMenu(d, e.currentTarget));
        bar.querySelector(".ld-backbtn").addEventListener("click", () => {
            savePref("classic", false);
            everyDeck(applyClassic);
        });
        paintToolbar(d);
    }
    // Organize tags' table of known tags (data/tagmap.json, ~110 KB): fetched once, the first time it's switched on
    let tagMapLoad = null;
    function loadTagMap() {
        const T = window.LoraDeckTags;
        if (tagMapLoad || !T || !T.useMap || T.hasMap()) return;
        tagMapLoad = fetch(`${API}/tagmap`).then((r) => (r.ok ? r.json() : null)).then((m) => { if (m) T.useMap(m); })
            .catch((e) => console.warn("[LoRA Deck] Organize tags works with its rules alone:", e.message));
    }
    function paintToolbar(d) {
        if (prefs.lines) loadTagMap();
        const lb = d.bar.querySelector(".ld-linesbtn");
        lb.classList.toggle("on", prefs.lines);
        lb.setAttribute("aria-pressed", String(prefs.lines));
        lb.title = prefs.lines
            ? "Organize tags is on: the LoRA tag goes at the end of line 1 and each line of its activation text on its own line (2 activation, 3 who, 4 looks, 5 body, 6 outfit), adding empty lines when needed. Click to turn it off."
            : "Organize tags is off: a click adds the LoRA tag and activation text at the end of the prompt. Click to put each kind of tag on its own line.";
        const b = d.bar.querySelector(".ld-blurbtn");
        b.innerHTML = ic(prefs.blur ? "eyeOff" : "eye");
        b.title = prefs.blur ? "Previews are blurred: click to show them" : "Blur the previews";
        b.classList.toggle("on", prefs.blur);
        d.bar.querySelector(".ld-dir").classList.toggle("flip", prefs.desc);
        d.bar.querySelector(".ld-dir").title = prefs.desc ? "Order: reversed (click for the usual order)" : "Reverse the order";
        d.bar.querySelector(".ld-sort").value = prefs.sort;
        d.range.value = prefs.size;
        d.range.style.setProperty("--ld-fill", ((prefs.size - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)) * 100 + "%");
        d.root.classList.toggle("ld-blur", prefs.blur);
        d.root.classList.toggle("ld-noact", !prefs.act);
        d.root.classList.toggle("ld-hexmode", prefs.shape === "hex");
        d.root.classList.toggle("ld-octmode", prefs.shape === "octa");
        d.bar.querySelectorAll("[data-shape]").forEach((b) => {
            const on = b.dataset.shape === prefs.shape;
            b.classList.toggle("on", on);
            b.setAttribute("aria-checked", String(on));
        });
        d.root.style.setProperty("--ld-size", prefs.size + "px");
        document.documentElement.classList.toggle("ld-still", !motionOn());
    }
    // Hexagons sit in a honeycomb of long and short rows: a row of N, then a row of N-1 sitting in its gaps (half a card
    // in), each tucked into the tips of the row above, so both edges stay straight. The other shapes sit in a plain grid
    // that fills the width.
    //
    // Every card's place is worked out here, but only the rows in view and a few around them are on the page (a few
    // dozen cards instead of hundreds), so scrolling a long list stays smooth. Scrolling brings the next rows in and
    // drops the ones far away; a card that only arrives once it's already in sight (a fast scroll) fades in.
    const HEX_TIP = 0.27;  // the height of a hexagon's top (and bottom) point, as a share of its width
    const GAP = 12;
    const ROW_GAP = 16;
    const ACT_H = 11.5 * 1.38 * 2;  // the activation text under a card: two lines of it
    function ensureList(d) {
        if (d.list && d.list.parentNode === d.grid) return;
        d.list = el("div", "ld-vlist");
        d.grid.replaceChildren(d.list);
        d.grid.classList.add("ld-virtual");
        d.lo = 0;
        d.hi = -1;
    }
    function layout(d) {
        if (!d.list || d.list.parentNode !== d.grid) return;
        const n = (d.shown || []).length;
        const cs = getComputedStyle(d.grid);
        const padT = parseFloat(cs.paddingTop) || 0;
        const room = Math.max(60, d.grid.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
        const hex = prefs.shape === "hex";
        let cols, colW, rowH, step, x0 = 0;
        if (hex) {
            colW = prefs.size;
            cols = Math.max(1, Math.floor((room + GAP) / (colW + GAP)));
            rowH = (colW - 5) * 1.5 + 5;  // the picture (2.5px in from the frame) and its frame
            step = rowH - (colW * HEX_TIP - GAP * 0.55);  // the next row tucks into this one's points
            x0 = Math.max(0, (room - (cols * colW + (cols - 1) * GAP)) / 2);
        } else {
            cols = Math.max(1, Math.floor((room + GAP) / (prefs.size + GAP)));
            colW = (room - (cols - 1) * GAP) / cols;
            const act = prefs.act && colW > 150;
            const key = `${prefs.shape}|${colW.toFixed(2)}|${act}`;
            rowH = d.rowHKey === key ? d.rowH
                : prefs.shape === "octa" ? (colW - 5) * 1.5 + 2.5 + (act ? 9 + ACT_H : 0) : colW * 1.5 + (act ? 7 + ACT_H : 0);
            d.rowKey = key;
            step = rowH + ROW_GAP;
        }
        const xs = new Float64Array(n), rows = new Int32Array(n), rowStart = [];
        const short = cols > 1 ? cols - 1 : 1;
        let row = 0, col = 0;
        for (let i = 0; i < n; i++) {
            if (col >= (hex && row % 2 ? short : cols)) {
                row++;
                col = 0;
            }
            if (!col) rowStart.push(i);
            xs[i] = x0 + col * (colW + GAP) + (hex && row % 2 && cols > 1 ? (colW + GAP) / 2 : 0);
            rows[i] = row;
            col++;
        }
        const nrows = n ? row + 1 : 0;
        rowStart.push(n);
        d.geo = { hex, cols, colW, rowH, step, padT, xs, rows, rowStart, nrows };
        d.list.style.height = (nrows ? (nrows - 1) * step + rowH : 0) + "px";
        d.list.style.setProperty("--ld-colw", colW + "px");
        for (const c of d.list.children) place(d, c);
        fillWindow(d);
        // the cards' real height (their text, the theme's fonts) once one is on the page: placed again if it differs
        const c0 = !hex && d.list.firstElementChild;
        if (c0 && c0.offsetHeight && Math.abs(c0.offsetHeight - rowH) > 0.5 && d.rowHKey !== d.rowKey) {
            d.rowH = c0.offsetHeight;
            d.rowHKey = d.rowKey;
            layout(d);
        }
    }
    function place(d, c) {
        const g = d.geo;
        if (!g || c._i == null || c._i >= g.xs.length) return;
        c.style.left = g.xs[c._i] + "px";
        c.style.top = g.rows[c._i] * g.step + "px";
    }
    // the cards from a few rows above the view to a few below it; fresh: start over (a new list of cards)
    function fillWindow(d, fresh) {
        const g = d.geo;
        if (!g || !d.list) return;
        const n = d.shown.length;
        if (fresh || !n) {
            d.list.replaceChildren();
            d.lo = 0;
            d.hi = -1;
        }
        if (!n) return;
        const top = d.grid.scrollTop - g.padT, h = d.grid.clientHeight || 800;
        const buf = Math.max(h * 0.75, g.step * 2);
        const last = g.nrows - 1;
        const r0 = clamp(Math.floor((top - buf) / g.step), 0, last), r1 = clamp(Math.floor((top + h + buf) / g.step), 0, last);
        const lo = g.rowStart[r0], hi = g.rowStart[r1 + 1] - 1;
        if (hi < d.lo || lo > d.hi) {  // no card in common (a jump): start over
            d.list.replaceChildren();
            d.lo = lo;
            d.hi = lo - 1;
        }
        while (d.lo < lo && d.list.firstElementChild) {
            d.list.firstElementChild.remove();
            d.lo++;
        }
        while (d.hi > hi && d.list.lastElementChild) {
            d.list.lastElementChild.remove();
            d.hi--;
        }
        const make = (i) => {
            const c = cardFor(d, d.shown[i], d.w);
            c._i = i;
            place(d, c);
            paintCard(d, c);
            return c;
        };
        const added = [];
        if (d.lo > lo) {
            const head = [];
            for (let i = lo; i < d.lo; i++) head.push(make(i));
            d.list.prepend(...head);
            added.push(...head);
            d.lo = lo;
        }
        if (d.hi < hi) {
            const tail = [];
            for (let i = d.hi + 1; i <= hi; i++) tail.push(make(i));
            d.list.append(...tail);
            added.push(...tail);
            d.hi = hi;
        }
        // a card that arrives already in sight (the scroll outran the rows kept ready) fades in instead of popping
        if (fresh || !added.length || !motionOn()) return;
        const v0 = Math.floor(top / g.step) - 1, v1 = Math.floor((top + h) / g.step);
        let k = 0;
        for (const c of added) {
            const r = g.rows[c._i];
            if (r < v0 || r > v1) continue;
            c.animate([{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "none" }],
                { duration: 220, easing: EASE, delay: Math.min(k++ * 12, 96), fill: "backwards" });
        }
    }
    // make card i visible (scrolling to it if needed) and focus it
    function revealIndex(d, j) {
        const g = d.geo;
        if (!g || !d.shown || !d.shown[j]) return;
        const y = g.padT + g.rows[j] * g.step, h = d.grid.clientHeight;
        if (y < d.grid.scrollTop + 8) d.grid.scrollTop = y - 8;
        else if (y + g.rowH > d.grid.scrollTop + h - 8) d.grid.scrollTop = y + g.rowH - h + 8;
        fillWindow(d);
        const c = d.cards.get(d.shown[j].name);
        if (c) c.focus({ preventScroll: true });
    }
    let sizeTimer = null;
    function setSize(px, animate) {  // animated for the two buttons; the slider and the wheel follow the hand instead
        savePref("size", clamp(Math.round(px), SIZE_MIN, SIZE_MAX));
        everyDeck((d) => {
            const before = animate ? snapshot(d) : null;
            paintToolbar(d);
            layout(d);
            play(d, before);
        });
        clearTimeout(sizeTimer);
        sizeTimer = setTimeout(() => everyDeck(updateThumbs), 160);
    }
    function applyClassic(d) {
        d.host.classList.toggle("ld-on", !prefs.classic);
        d.root.hidden = prefs.classic;
        d.cardsHtml.classList.toggle("ld-hidden", !prefs.classic);
    }
    const everyDeck = (fn) => Object.values(decks).forEach(fn);

    function openMenu(d, anchor) {
        closeFloating();
        const m = el("div", "ld-menu ld-floating");
        m.setAttribute("role", "menu");
        const row = (key, label, hint, icon) => `<button type="button" role="menuitemcheckbox" class="ld-menuitem" data-k="${key}" aria-checked="${!!prefs[key]}">
            ${ic(icon)}<span><b>${esc(label)}</b><small>${esc(hint)}</small></span><span class="ld-check">${ic("check")}</span></button>`;
        m.innerHTML = `
          ${row("act", "Activation text under the cards", "A line of what a click adds", "lines")}
          ${row("lines", "Organize tags", "One line per kind of tag: LoRA tags on line 1, activation text on lines 2 to 6, empty lines added", "list")}
          ${row("gens", "Gens as previews", "A LoRA without a preview shows the first picture made with it, from the WebUI's output folders (nothing is saved)", "image")}
          <div class="ld-sep"></div>
          ${row("motion", "Animations", "Short moves when the cards change, a LoRA is added or a weight changes", "spark")}
          <div class="ld-sep"></div>
          ${row("classic", "Classic Lora tab", "The WebUI's own cards, with any buttons other extensions add to them", "classic")}`;
        m.querySelectorAll(".ld-menuitem").forEach((b, i) => b.style.setProperty("--i", i));
        m.addEventListener("click", (e) => {
            const b = e.target.closest(".ld-menuitem");
            if (!b) return;
            const k = b.dataset.k;
            savePref(k, !prefs[k]);
            b.setAttribute("aria-checked", String(prefs[k]));
            if (k === "classic") {
                closeFloating();
                everyDeck(applyClassic);
            } else if (k === "gens") {
                applyGens();
                toast(prefs.gens ? "LoRAs without a preview show their first gen" : "Gens as previews: off");
            } else everyDeck(paintToolbar);
        });
        placeFloating(m, anchor, "end");
    }

    function wirePane(d) {
        d.grid.addEventListener("click", (e) => {
            const card = e.target.closest(".ld-card");
            if (!card) return;
            const it = data.by.get(card.dataset.name);
            if (!it) return;
            const act = e.target.closest("[data-act]");
            const what = act ? act.dataset.act : "";
            e.preventDefault();
            if (what === "fav") return toggleFav(it);
            if (what === "info") return openInfo(d.tab, it);
            if (what === "remove") return removeLora(d.tab, it);
            if (what === "minus" || what === "plus") {
                const now = Number(d.on.get(it.name)) || weightOf(it);
                return setWeight(d.tab, it, now + (what === "plus" ? 0.05 : -0.05) * (e.shiftKey ? 4 : 1));
            }
            primary(d, it, card);
        });
        d.grid.addEventListener("keydown", (e) => {
            const card = e.target.closest(".ld-card");
            if (!card || e.target !== card) return;
            const it = data.by.get(card.dataset.name);
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                primary(d, it, card);
            } else if (e.key === "i") openInfo(d.tab, it);
            else if (e.key === "f") toggleFav(it);
            else if (e.key === "Delete" && d.on.has(it.name)) removeLora(d.tab, it);
            else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
                e.preventDefault();
                const r = card.getBoundingClientRect();
                openCardMenu(d, it, card, r.left + r.width / 2, r.top + r.height / 3);
            }
            else if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) {
                e.preventDefault();
                moveFocus(d, card, e.key);
            }
        });
        d.grid.addEventListener("contextmenu", (e) => {
            const card = e.target.closest(".ld-card[data-name]");
            const it = card && data.by.get(card.dataset.name);
            if (!it) return;
            e.preventDefault();
            openCardMenu(d, it, card, e.clientX, e.clientY);
        });
        d.grid.addEventListener("wheel", (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            setSize(prefs.size - Math.sign(e.deltaY) * 12);
        }, { passive: false });
        d.grid.addEventListener("pointerover", (e) => {
            const v = e.target.closest(".ld-card video");
            if (v) v.play().catch(() => {});
        });
        d.grid.addEventListener("pointerout", (e) => {
            const v = e.target.closest(".ld-card video");
            if (v && !v.contains(e.relatedTarget)) v.pause();
        });
        d.tray.addEventListener("click", (e) => {
            const chip = e.target.closest("[data-name]");
            if (!chip) return;
            const it = data.by.get(chip.dataset.name);
            const act = (e.target.closest("[data-act]") || {}).dataset;
            if (!it) return;
            if (act && act.act === "remove") return removeLora(d.tab, it);
            if (act && (act.act === "minus" || act.act === "plus")) {
                const now = Number(d.on.get(it.name)) || weightOf(it);
                return setWeight(d.tab, it, now + (act.act === "plus" ? 0.05 : -0.05) * (e.shiftKey ? 4 : 1));
            }
            openInfo(d.tab, it);
        });
        d.tray.addEventListener("wheel", (e) => {
            const w = e.target.closest(".ld-tw");
            const chip = e.target.closest("[data-name]");
            if (!w || !chip) return;
            e.preventDefault();
            const it = data.by.get(chip.dataset.name);
            const now = Number(d.on.get(it.name)) || weightOf(it);
            setWeight(d.tab, it, now - Math.sign(e.deltaY) * 0.05);
        }, { passive: false });
    }
    function moveFocus(d, card, key) {
        const g = d.geo;
        const i = card._i;
        if (!g || i == null) return;
        let j = i + (key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0);
        if (key === "ArrowDown" || key === "ArrowUp") {  // the nearest card in the next row up or down
            const r = g.rows[i] + (key === "ArrowDown" ? 1 : -1);
            if (r < 0 || r >= g.nrows) return;
            let best = Infinity;
            for (let k = g.rowStart[r]; k < g.rowStart[r + 1]; k++) {
                const dx = Math.abs(g.xs[k] - g.xs[i]);
                if (dx < best) {
                    best = dx;
                    j = k;
                }
            }
        }
        revealIndex(d, clamp(j, 0, d.shown.length - 1));
    }
    function primary(d, it, card) {
        if (d.on.has(it.name)) return openInfo(d.tab, it);
        if (it._choices) return openChooser(d, it, card);
        addLora(d.tab, it, it.activation.trim());
        added(d, it, card);
        toast(`Added ${it._title}`);
    }
    function toggleFav(it) {
        if (favs.has(it.name)) favs.delete(it.name);
        else favs.add(it.name);
        store.set("favs", [...favs]);
        everyDeck((d) => {
            const c = d.cards.get(it.name);
            if (c) c.classList.toggle("fav", favs.has(it.name));
            if (d.mode === "fav") renderAll(d);
            else renderNav(d);
        });
        if (infoState && infoState.it.name === it.name) paintInfoFav();
        if (favs.has(it.name)) {
            everyDeck((d) => {
                const c = d.cards.get(it.name);
                burst(c && c.querySelector(".ld-favbtn"));
            });
            burst(document.querySelector('.ld-modal-wrap [data-do="fav"]'));
        }
    }

    // --- rendering ----------------------------------------------------------------------------------------------
    function placeIndicator(d) {
        const ind = d.ind;
        const on = ind && d.famList.querySelector(".ld-fam.on");
        if (!on || !on.offsetWidth) {
            if (ind) ind.style.opacity = "0";
            return;
        }
        const jump = !ind.dataset.ready || !motionOn();
        if (jump) ind.style.transition = "none";
        ind.style.opacity = "1";
        ind.style.width = on.offsetWidth + "px";
        ind.style.height = on.offsetHeight + "px";
        ind.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
        if (jump) {
            void ind.offsetWidth;
            ind.style.transition = "";
            ind.dataset.ready = "1";
        }
    }
    function renderSkeleton(d) {
        d.grid.classList.remove("ld-virtual");
        d.grid.innerHTML = Array.from({ length: 12 }, () => '<div class="ld-card ld-ghost"><div class="ld-media"></div><div class="ld-act"></div></div>').join("");
    }
    function visible(d) {
        const words = d.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const path = d.path || [];
        const inPath = (it) => {
            if (!path.length) return true;
            if (path[0] === OTHER) return !it.folder;
            const p = path.join("/");
            return it.folder === p || it.folder.startsWith(p + "/");
        };
        const recentSet = new Set(recent);
        fitFor(d);
        const preset = currentPreset();
        const base = data.items.filter((it) => !hiddenByPreset(it) && (!d.fit || fitsPreset(it, preset))
            && (d.mode !== "fav" || favs.has(it.name))
            && (d.mode !== "recent" || recentSet.has(it.name))
            && (d.mode !== "on" || d.on.has(it.name)));
        const hit = (it) => words.every((w) => it._hay.includes(w));
        const shown = base.filter((it) => inPath(it) && hit(it));
        const elsewhere = words.length && path.length ? base.filter((it) => !inPath(it) && hit(it)).length : 0;
        const by = {
            name: (a, b) => a._title.localeCompare(b._title, undefined, { sensitivity: "base", numeric: true }),
            newest: (a, b) => b.mtime - a.mtime,
            folder: (a, b) => a.folder.localeCompare(b.folder, undefined, { sensitivity: "base", numeric: true }) || a._title.localeCompare(b._title, undefined, { numeric: true }),
        };
        if (d.mode === "recent") shown.sort((a, b) => recent.indexOf(a.name) - recent.indexOf(b.name));
        else {
            shown.sort(by[prefs.sort] || by.name);
            if (prefs.desc) shown.reverse();
        }
        return { shown, elsewhere, total: base.length };
    }
    function renderAll(d) {
        if (!d.root) return;
        if (!data.ready) {
            if (data.error) {
                d.grid.classList.remove("ld-virtual");
                d.grid.innerHTML = "";
                d.empty.hidden = false;
                d.empty.innerHTML = `<div class="ld-empty-art">${ic("warn")}</div><b>LoRA Deck could not load</b><span>${esc(data.error)}</span>
                  <div class="ld-empty-actions"><button type="button" class="ld-btn ld-pill" data-do="retry">${ic("refresh")}<span>Try again</span></button></div>`;
                d.empty.querySelector('[data-do="retry"]').onclick = () => load(true);
            }
            return;
        }
        if (!d.path || !nodeAt(d.path)) d.path = [];
        readPrompt(d);
        renderNav(d);
        const { shown, elsewhere, total } = visible(d);
        const before = snapshot(d);
        ensureList(d);
        d.shown = shown;
        d.w = thumbWidth();
        d.list.replaceChildren();
        d.lo = 0;
        d.hi = -1;
        layout(d);
        paintOn(d);
        play(d, before);
        const n = shown.length;
        countTo(d.status, d.lastCount, n, (x) => (n === total ? `${x} LoRA${x === 1 ? "" : "s"}` : `${x} of ${total}`));
        d.lastCount = n;
        d.empty.hidden = n > 0;
        if (!n) {
            const q = d.q.trim();
            const what = d.mode === "fav" ? "No favourites here yet. The ☆ on a card adds it."
                : d.mode === "recent" ? "Nothing added recently in this folder."
                    : d.mode === "on" ? "No LoRA of this folder is in the prompt."
                        : q ? `No LoRA matches “${esc(q)}” here.` : "This folder has no LoRAs.";
            d.empty.innerHTML = `<div class="ld-empty-art">${ic(d.mode === "fav" ? "star" : "search")}</div><b>${what}</b>
              <div class="ld-empty-actions">
                ${elsewhere ? `<button type="button" class="ld-btn ld-pill ld-primary" data-do="all">${ic("folder")}<span>Show ${elsewhere} in other folders</span></button>` : ""}
                ${q ? '<button type="button" class="ld-btn ld-pill" data-do="clear">Clear the search</button>' : ""}
                ${d.mode !== "all" ? '<button type="button" class="ld-btn ld-pill" data-do="mode">Show all LoRAs</button>' : ""}
              </div>`;
            d.empty.onclick = (e) => {
                const b = e.target.closest("[data-do]");
                if (!b) return;
                if (b.dataset.do === "all") setPath(d, []);
                if (b.dataset.do === "clear") {
                    d.search.value = "";
                    d.q = "";
                    renderAll(d);
                }
                if (b.dataset.do === "mode") {
                    d.mode = "all";
                    renderAll(d);
                }
            };
        }
    }
    function renderNav(d) {
        fitFor(d);
        const path = d.path || [];
        const preset = currentPreset();
        const fits = new Set(familiesFor(preset));
        const fam = sortedKids(tree).map((f) => {
            const on = path[0] === f;
            return `<button type="button" role="tab" class="ld-fam${on ? " on" : ""}${fits.has(f) ? " fits" : ""}" aria-selected="${on}" data-seg="${esc(f)}"
              title="${fits.has(f) ? `Fits the ${esc(preset)} preset` : esc(segLabel(f))}"><span>${esc(segLabel(f))}</span><small>${tree.kids.get(f).count}</small></button>`;
        }).join("");
        d.famList.innerHTML = `<button type="button" role="tab" class="ld-fam${!path.length ? " on" : ""}" aria-selected="${!path.length}" data-seg=""><span>All</span><small>${tree.count}</small></button>${fam}`;
        placeIndicator(d);
        d.families.onclick = (e) => {
            const b = e.target.closest(".ld-fam");
            if (!b) return;
            const seg = b.dataset.seg;
            setPath(d, seg ? [seg] : []);
        };
        // deeper folders: one group per level, the picked one lit (click it again to go back up)
        let html = "";
        for (let L = 1; L <= path.length; L++) {
            const node = nodeAt(path.slice(0, L));
            if (!node || !node.kids.size) break;
            html += `${L > 1 ? `<span class="ld-crumb">${ic("chevron")}</span>` : `<span class="ld-crumb">${ic("folder")}</span>`}<div class="ld-level">${
                sortedKids(node).map((k) => `<button type="button" class="ld-chip${path[L] === k ? " on" : ""}" data-l="${L}" data-seg="${esc(k)}">${esc(segLabel(k))}<small>${node.kids.get(k).count}</small></button>`).join("")}</div>`;
        }
        d.pathEl.innerHTML = html;
        d.pathEl.onclick = (e) => {
            const b = e.target.closest(".ld-chip");
            if (!b) return;
            const L = Number(b.dataset.l);
            const seg = b.dataset.seg;
            setPath(d, path[L] === seg ? path.slice(0, L) : [...path.slice(0, L), seg]);
        };
        d.root.querySelector(".ld-sub").classList.toggle("ld-sub-flat", !html);
        const count = (fn) => data.items.filter((it) => !hiddenByPreset(it) && fn(it)).length;
        const mode = (m, icon, label, n) => `<button type="button" class="ld-mode${d.mode === m ? " on" : ""}" data-m="${m}" aria-pressed="${d.mode === m}">${ic(icon)}<span>${label}</span>${n != null ? `<small>${n}</small>` : ""}</button>`;
        const recentSet = new Set(recent);
        const pre = currentPreset();
        const fit = PRESET_LABEL[pre] && data.items.some((it) => it.model && it.model.arch)
            ? `<button type="button" class="ld-mode ld-fit${d.fit ? " on" : ""}" data-fit="1" aria-pressed="${!!d.fit}" title="${d.fit ? `Showing the LoRAs made for ${PRESET_LABEL[pre]} (and the ones it can't tell). Click to show every model's.` : `Show only the LoRAs made for ${PRESET_LABEL[pre]}`}">${ic("cube")}<span>Made for ${esc(PRESET_LABEL[pre])}</span><small>${count((it) => fitsPreset(it, pre))}</small></button>`
            : "";
        d.modes.innerHTML = fit + mode("on", "checkCircle", "In prompt", d.on.size) + mode("fav", "star", "Favourites", count((it) => favs.has(it.name)))
            + mode("recent", "clock", "Recent", count((it) => recentSet.has(it.name)));
        d.modes.onclick = (e) => {
            const b = e.target.closest(".ld-mode");
            if (!b) return;
            if (b.dataset.fit) {
                d.fit = !d.fit;
                store.set(`fit.${currentPreset()}`, d.fit);
            } else d.mode = d.mode === b.dataset.m ? "all" : b.dataset.m;
            renderAll(d);
        };
    }
    // --- the picture in its card -----------------------------------------------------------------------------------
    // A framing is {x, y, z}: the point of the picture (as a share of its width and height) at the card's centre, and
    // the zoom (1: the picture just covers the card; less shows more of it over a blurred copy, more zooms in). Without
    // one saved, a picture of about the card's shape fills it, and any other shows whole, so square or wide previews
    // aren't trimmed.
    const CARD_RATIO = 2 / 3;
    const tierFor = (px) => WIDTHS.find((x) => x >= px) || WIDTHS[WIDTHS.length - 1];
    const ratioOf = (it) => (it.pw && it.ph ? it.pw / it.ph : CARD_RATIO);
    function wholeZoom(it) {
        const k = ratioOf(it) / CARD_RATIO;
        return k > 1 ? 1 / k : k;
    }
    function framingOf(it) {
        if (it.framing) return it.framing;
        const k = ratioOf(it) / CARD_RATIO;
        if (k > 0.86 && k < 1.16) return { x: 0.5, y: 0.42, z: 1, auto: true };
        return { x: 0.5, y: 0.5, z: wholeZoom(it), auto: true };
    }
    // where the picture goes, in % of the card's picture box; kept from leaving it (raw: as given)
    function placePic(it, fr, raw) {
        const k = ratioOf(it) / CARD_RATIO;
        const w = (k > 1 ? k * 100 : 100) * fr.z, h = (k > 1 ? 100 : 100 / k) * fr.z;
        let left = 50 - fr.x * w, top = 50 - fr.y * h;
        if (!raw) {
            left = w >= 100 ? clamp(left, 100 - w, 0) : clamp(left, 0, 100 - w);
            top = h >= 100 ? clamp(top, 100 - h, 0) : clamp(top, 0, 100 - h);
        }
        return { left, top, w, h, gaps: w < 99.5 || h < 99.5 };
    }
    function clampFraming(it, fr) {
        const p = placePic(it, fr);
        const out = { x: (50 - p.left) / p.w, y: (50 - p.top) / p.h, z: fr.z };
        if (fr.auto) out.auto = true;  // still the automatic one (saved as none, so it follows the picture)
        return out;
    }
    const picStyle = (p) => `left:${p.left.toFixed(3)}%;top:${p.top.toFixed(3)}%;width:${p.w.toFixed(3)}%;height:${p.h.toFixed(3)}%`;
    // a zoomed-in or wide picture needs more pixels than the card is wide
    const picTier = (it, w) => tierFor(w * Math.max(1, placePic(it, framingOf(it)).w / 100));

    function cardFor(d, it, w) {
        let c = d.cards.get(it.name);
        if (c && c.dataset.w === String(w)) {
            c.querySelector(".ld-badge").hidden = !!(d.path && d.path.length);
            return c;
        }
        if (c) {
            updateThumb(c, it, w);
            return c;
        }
        c = el("div", "ld-card");
        c.dataset.name = it.name;
        c.dataset.w = String(w);
        c.tabIndex = 0;
        c.setAttribute("role", "listitem");
        c.setAttribute("aria-label", it._title);
        const sub = [it.folder ? segLabel(it.folder.split("/").pop()) : "", it._choices ? `${it._choices.options.length} choices` : ""].filter(Boolean).join(" · ");
        const media = isVideo(it)
            ? `<video class="ld-pic" src="${thumbUrl(it, w)}" muted loop playsinline preload="metadata"></video>`
            : it.preview ? framedPic(it, w)
                : `<div class="ld-nopic"><span>${esc(it._title.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "?")}</span></div>`;
        c.innerHTML = `
          <div class="ld-frame" aria-hidden="true"></div>
          <div class="ld-media">
            ${media}
            <div class="ld-shade"></div>
            <div class="ld-top">
              <span class="ld-badge"${d.path && d.path.length ? " hidden" : ""}>${esc(it._tag || segLabel(it._family))}</span>
              <span class="ld-grow"></span>
              <button type="button" class="ld-btn ld-mini ld-favbtn" data-act="fav" title="Favourite (f)" aria-label="Favourite">${ic("star")}</button>
              <button type="button" class="ld-btn ld-mini" data-act="info" title="Details (i)" aria-label="Details">${ic("info")}</button>
            </div>
            <div class="ld-onmark" aria-hidden="true">${ic("check")}<span class="ld-w"></span></div>
            <div class="ld-cap">
              <div class="ld-title">${esc(it._title)}</div>
              ${sub || it.model ? `<div class="ld-subt">${modelChip(it)}${esc(sub)}</div>` : ""}
            </div>
            <div class="ld-weight">
              <button type="button" class="ld-btn ld-mini" data-act="minus" title="Weight −0.05 (Shift: −0.2)" aria-label="Lower the weight">${ic("minus")}</button>
              <span class="ld-w"></span>
              <button type="button" class="ld-btn ld-mini" data-act="plus" title="Weight +0.05 (Shift: +0.2)" aria-label="Raise the weight">${ic("plus")}</button>
              <button type="button" class="ld-btn ld-mini ld-rm" data-act="remove" title="Take it out of the prompt (Delete)" aria-label="Take it out of the prompt">${ic("x")}</button>
            </div>
          </div>
          <div class="ld-act" title="${esc(it.activation)}">${it.activation ? esc(it.activation.replace(/\s*\n\s*/g, " ").replace(/\s*\|\|\s*/g, "  |  ")) : '<i>no activation text</i>'}</div>`;
        c.title = `${it.file}${it.folder ? `\n${it.folder}` : ""}${it.model ? `\nMade for ${it.model.name} (from ${MODEL_FROM[it.model.from] || it.model.from})` : ""}\n${it._choices ? "Click to pick one of its choices" : "Click to add it to the prompt"} · right-click for more`;
        c.classList.toggle("fav", favs.has(it.name));
        const pic = c.querySelector("img.ld-pic");
        if (pic) {
            pic.addEventListener("load", () => c.classList.add("loaded"), { once: true });
            pic.addEventListener("error", () => c.classList.add("loaded", "broken"), { once: true });
        } else c.classList.add("loaded");
        d.cards.set(it.name, c);
        return c;
    }
    function framedPic(it, w) {
        const p = placePic(it, framingOf(it));
        return `${p.gaps ? `<img class="ld-pic-bg" src="${thumbUrl(it, 160)}" alt="" aria-hidden="true" loading="lazy" decoding="async">` : ""}`
            + `<img class="ld-pic ld-framed" style="${picStyle(p)}" src="${thumbUrl(it, picTier(it, w))}" alt="" loading="lazy" decoding="async" draggable="false">`;
    }
    function updateThumb(c, it, w) {
        const pic = c.querySelector(".ld-pic");
        c.dataset.w = String(w);
        if (pic && pic.tagName === "IMG") pic.src = thumbUrl(it, picTier(it, w));
    }
    function updateThumbs(d) {
        const w = thumbWidth();
        d.w = w;  // the cards that come onto the page later get it then (cardFor)
        d.grid.querySelectorAll(".ld-card[data-name]").forEach((c) => {
            const it = data.by.get(c.dataset.name);
            if (it && c.dataset.w !== String(w) && Number(c.dataset.w) < w) updateThumb(c, it, w);
        });
    }

    // what's in the prompt: lit cards, their weights, and the tray above the cards
    function readPrompt(d) {
        const box = promptBox(d.tab);
        const p = box ? box.value : "";
        d.lastPrompt = p;
        const { on, unknown } = inPrompt(p);
        d.on = on;
        d.unknown = unknown;
    }
    function paintCard(d, c, prev) {
        const name = c.dataset.name;
        const w = d.on.get(name);
        const on = w != null;
        c.classList.toggle("on", on);
        c.setAttribute("aria-current", on ? "true" : "false");
        if (on) {
            c.querySelectorAll(".ld-w").forEach((s) => {
                if (s.textContent === w) return;
                s.textContent = w;
                if (prev && prev.has(name) && prev.get(name) !== w && c.isConnected) roll(s, Number(w) > Number(prev.get(name)));
            });
        }
    }
    function paintOn(d) {
        const prev = d.prevW || new Map();
        d.cards.forEach((c) => paintCard(d, c, prev));
        const chips = [...d.on.entries()].map(([name, w]) => {
            const it = data.by.get(name);
            const pic = it.preview && !isVideo(it) ? `<img src="${thumbUrl(it, 160)}" alt="" loading="lazy">` : `<span>${esc(it._title.slice(0, 1))}</span>`;
            return `<div class="ld-tchip" data-name="${esc(name)}" title="${esc(it.file)}: click for its details">
              <span class="ld-tpic">${pic}</span><span class="ld-tname">${esc(it._title)}</span>
              <span class="ld-tw" title="Weight (mouse wheel changes it)"><button type="button" class="ld-btn" data-act="minus" aria-label="Lower the weight">${ic("minus")}</button><b>${esc(w)}</b><button type="button" class="ld-btn" data-act="plus" aria-label="Raise the weight">${ic("plus")}</button></span>
              <button type="button" class="ld-btn ld-tx" data-act="remove" title="Take it out" aria-label="Take it out">${ic("x")}</button></div>`;
        });
        const missing = d.unknown.map((n) => `<div class="ld-tchip ld-missing" title="The prompt names this LoRA, but there is no LoRA by that name">${ic("warn")}<span class="ld-tname">${esc(n)}</span><small>not found</small></div>`);
        const html = chips.length || missing.length ? `<span class="ld-traylabel">${ic("checkCircle")}In the prompt</span>${chips.join("")}${missing.join("")}` : "";
        if (html !== d.trayHtml) {
            const animate = motionOn() && d.prevW && d.root.offsetParent;
            const old = animate ? trayState(d) : null;
            d.trayHtml = html;
            d.tray.getAnimations().forEach((a) => { if (a.id === "ld-tray") a.cancel(); });
            d.tray.style.pointerEvents = "";
            if (!html && old && old.h > 0) collapseTray(d, old);  // the old chips stay in sight while it closes
            else {
                d.tray.innerHTML = html;
                d.tray.hidden = !html;
                if (old) animateTray(d, old, prev);
            }
        }
        d.prevW = new Map(d.on);
        const n = d.modes.querySelector('[data-m="on"] small');
        if (n && n.textContent !== String(d.on.size)) {
            n.textContent = d.on.size;
            pop(n);
        }
    }
    function trayState(d) {
        const tray = d.tray;
        const chips = new Map();
        if (!tray.hidden) {
            tray.querySelectorAll(".ld-tchip[data-name]").forEach((chip) => chips.set(chip.dataset.name, { el: chip, r: chip.getBoundingClientRect() }));
        }
        return { h: tray.hidden ? 0 : tray.getBoundingClientRect().height, chips };
    }
    // the row's own box, open (as it is now) or shut (no height, padding or border, and the gap above it taken back)
    const SHUT = { height: "0px", paddingTop: "0px", paddingBottom: "0px", borderTopWidth: "0px", borderBottomWidth: "0px", marginTop: "-10px", opacity: 0 };
    function trayOpen(tray, h) {
        const cs = getComputedStyle(tray);
        return { height: h + "px", paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, borderTopWidth: cs.borderTopWidth, borderBottomWidth: cs.borderBottomWidth, marginTop: "0px", opacity: 1 };
    }
    function trayAnim(tray, frames, dur) {
        tray.style.overflow = "hidden";
        const a = tray.animate(frames, { duration: dur, easing: EASE });
        a.id = "ld-tray";
        const done = () => { tray.style.overflow = ""; };
        a.addEventListener("finish", done);
        a.addEventListener("cancel", done);
        return a;
    }
    function animateTray(d, old, prev) {
        const tray = d.tray;
        const h1 = tray.hidden ? 0 : tray.getBoundingClientRect().height;
        if (Math.abs(h1 - old.h) > 0.5) {
            const open = trayOpen(tray, h1);
            trayAnim(tray, [old.h ? { ...open, height: old.h + "px" } : SHUT, open], 240);
        }
        tray.querySelectorAll(".ld-tchip[data-name]").forEach((chip) => {
            const name = chip.dataset.name, w = d.on.get(name);
            const o = old.chips.get(name);
            if (!o) return pop(chip);
            const r = chip.getBoundingClientRect();
            const dx = o.r.left - r.left, dy = o.r.top - r.top;
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) chip.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 240, easing: EASE });
            if (prev.has(name) && prev.get(name) !== w) roll(chip.querySelector(".ld-tw b"), Number(w) > Number(prev.get(name)));
        });
        old.chips.forEach((o, name) => {
            if (!tray.querySelector(`.ld-tchip[data-name="${CSS.escape(name)}"]`)) fadeAway(d, o.el, o.r);
        });
    }
    function collapseTray(d, old) {
        const tray = d.tray;
        tray.style.pointerEvents = "none";  // the chips on their way out can't be clicked
        const a = trayAnim(tray, [trayOpen(tray, old.h), SHUT], 220);
        a.addEventListener("finish", () => {
            if (d.trayHtml) return;  // something was added meanwhile
            tray.hidden = true;
            tray.innerHTML = "";
            tray.style.pointerEvents = "";
        });
    }
    // a chip that left: a copy of it fades and shrinks where it was, over the row
    function fadeAway(d, node, r) {
        const g = node.cloneNode(true);
        Object.assign(g.style, { position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px",
            margin: "0", zIndex: "6", pointerEvents: "none", boxSizing: "border-box" });
        d.root.appendChild(g);
        const a = g.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.82)" }], { duration: 180, easing: EASE });
        a.addEventListener("finish", () => g.remove());
        a.addEventListener("cancel", () => g.remove());
    }
    function refreshAll() {
        everyDeck((d) => {
            readPrompt(d);
            if (d.mode !== "all") renderAll(d);
            else paintOn(d);
        });
        if (infoState) paintInfoState();
    }

    // --- floating things: menu, chooser -------------------------------------------------------------------------
    function closeFloating() {
        document.querySelectorAll(".ld-floating").forEach((f) => f.remove());
    }
    function placeFloating(node, anchor, align) {
        document.body.appendChild(node);
        const r = anchor.getBoundingClientRect();
        const w = node.offsetWidth, h = node.offsetHeight;
        let left = clamp(align === "end" ? r.right - w : r.left, 8, window.innerWidth - w - 8);
        let top = r.bottom + 6;
        if (top + h > window.innerHeight - 8) {
            if (r.top - h - 6 >= 8) top = r.top - h - 6;
            else {
                // no room above or below: beside it, on the side with more room
                top = clamp(r.top + r.height / 2 - h / 2, 8, Math.max(8, window.innerHeight - h - 8));
                left = window.innerWidth - r.right >= r.left ? Math.min(r.right + 8, window.innerWidth - w - 8) : Math.max(8, r.left - w - 8);
            }
        }
        node.style.left = left + "px";
        node.style.top = clamp(top, 8, Math.max(8, window.innerHeight - h - 8)) + "px";  // never outside the window
        requestAnimationFrame(() => node.classList.add("show"));
        const away = (e) => {
            if (!node.isConnected) return document.removeEventListener("pointerdown", away, true);
            if (!node.contains(e.target) && !anchor.contains(e.target)) {
                node.remove();
                document.removeEventListener("pointerdown", away, true);
            }
        };
        setTimeout(() => document.addEventListener("pointerdown", away, true));
    }
    // right-click on a card: what the details have, one click away
    function openCardMenu(d, it, card, x, y) {
        closeFloating();
        const on = d.on.has(it.name);
        const m = el("div", "ld-menu ld-floating ld-cardmenu");
        m.setAttribute("role", "menu");
        const item = (key, icon, label, extra) => `<button type="button" role="menuitem" class="ld-menuitem ld-mi${extra || ""}" data-k="${key}">${ic(icon)}<span><b>${label}</b></span></button>`;
        m.innerHTML = `<div class="ld-menu-head"><b>${esc(it._title)}</b>${modelChip(it)}</div>
          ${on ? item("toggle", "x", "Take it out of the prompt") : item("toggle", "plus", it._choices ? "Add to the prompt…" : "Add to the prompt")}
          ${item("info", "info", "Details")}
          ${item("frame", "image", "Edit preview")}
          ${item("card", "edit", "Edit card")}
          ${item("meta", "code", "Metadata")}
          <div class="ld-sep"></div>
          ${item("fav", "star", favs.has(it.name) ? "Remove from favourites" : "Add to favourites")}
          ${item("copytag", "copy", "Copy its tag")}
          ${it.activation ? item("copyact", "lines", "Copy its activation text") : ""}
          ${item("copypath", "copy", "Copy the file's path")}
          ${item("explore", "folder", `Show in ${REVEAL_IN}`)}
          <div class="ld-sep"></div>
          ${item("delete", "trash", "Delete…", " ld-danger")}`;
        m.querySelectorAll(".ld-menuitem").forEach((b, i) => b.style.setProperty("--i", i));
        m.addEventListener("click", (e) => {
            const b = e.target.closest(".ld-menuitem");
            if (!b) return;
            const k = b.dataset.k;
            closeFloating();
            if (k === "toggle") {
                if (on) removeLora(d.tab, it);
                else primary(d, it, card.isConnected ? card : d.cards.get(it.name));
            } else if (k === "info") openInfo(d.tab, it);
            else if (k === "frame" || k === "card" || k === "meta") {
                openInfo(d.tab, it);
                setMode(k);
            } else if (k === "fav") toggleFav(it);
            else if (k === "copytag") copyText(`<lora:${it.alias}:${fmtW(on ? d.on.get(it.name) : weightOf(it))}>`, "the tag");
            else if (k === "copyact") copyText(it.activation, "the activation text");
            else if (k === "copypath") copyText(it.path, "the path");
            else if (k === "explore") api("reveal", { name: it.name }).then(() => toast(`Shown in ${REVEAL_IN}`), (err) => toast(`Couldn't open it: ${err.message}`));
            else if (k === "delete") confirmDelete(it);
        });
        m.addEventListener("keydown", (e) => {
            const items = [...m.querySelectorAll(".ld-menuitem")];
            const i = items.indexOf(document.activeElement);
            if (e.key === "Escape") {
                closeFloating();
                card.focus?.();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
            }
        });
        // at the pointer, kept inside the window
        const at = { getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }), contains: () => false };
        placeFloating(m, at, "start");
        const first = m.querySelector(".ld-menuitem");
        if (first) first.focus({ preventScroll: true });
    }
    // deleting: asked first; the files go to the Recycle Bin (LoRA Deck's own folder elsewhere), so it can be undone there
    function confirmDelete(it) {
        document.querySelectorAll(".ld-confirm-wrap").forEach((w) => w.remove());
        const wrap = el("div", "ld-confirm-wrap");
        wrap.innerHTML = `<div class="ld-confirm" role="alertdialog" aria-modal="true" aria-labelledby="ld-confirm-t">
            <div class="ld-confirm-icon">${ic("trash")}</div>
            <h3 id="ld-confirm-t">Delete “${esc(it._title)}”?</h3>
            <p>Its file <code>${esc(it.file)}</code> and the files that belong to it (card, previews, Civitai info) go to the
            Recycle Bin, where you can restore them.</p>
            <div class="ld-confirm-btns"><button type="button" class="ld-btn ld-pill" data-do="no">Cancel</button>
              <button type="button" class="ld-btn ld-pill ld-danger-solid" data-do="yes">${ic("trash")}<span>Delete</span></button></div></div>`;
        document.body.appendChild(wrap);
        requestAnimationFrame(() => wrap.classList.add("show"));
        const close = () => {
            wrap.remove();
            document.removeEventListener("keydown", keys, true);
        };
        const keys = (e) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                close();
            }
        };
        document.addEventListener("keydown", keys, true);
        wrap.addEventListener("pointerdown", (e) => { if (e.target === wrap) close(); });
        wrap.addEventListener("click", (e) => {
            const b = e.target.closest("[data-do]");
            if (!b) return;
            if (b.dataset.do === "no") return close();
            b.disabled = true;
            api("delete", { name: it.name }).then((r) => {
                close();
                forget(it);
                toast(`Deleted ${it._title} (${r.files.length} file${r.files.length === 1 ? "" : "s"}, in ${r.where})`);
            }, (err) => {
                b.disabled = false;
                toast(`Couldn't delete it: ${err.message}`);
            });
        });
        wrap.querySelector('[data-do="no"]').focus();
    }
    // a deleted LoRA leaves the deck (its tag stays in the prompt, shown as not found there)
    function forget(it) {
        if (infoState && infoState.it.name === it.name) closeInfo();
        data.items = data.items.filter((x) => x.name !== it.name);
        data.by.delete(it.name);
        if (data.byAlias) data.byAlias.delete(it.alias);
        favs.delete(it.name);
        store.set("favs", [...favs]);
        buildTree();
        everyDeck((d) => {
            const c = d.cards.get(it.name);
            d.cards.delete(it.name);
            if (c && c.isConnected && motionOn()) {
                c.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.9)" }], { duration: 180, easing: EASE }).onfinish = () => renderAll(d);
            } else renderAll(d);
        });
    }
    function openChooser(d, it, card) {
        closeFloating();
        const ch = it._choices;
        const box = el("div", "ld-chooser ld-floating");
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-label", `Pick one for ${it._title}`);
        const label = (o) => {
            const [first, ...rest] = o.split(",").map((s) => s.trim());
            return `<b>${esc(first)}</b>${rest.length ? `<small>${esc(rest.join(", "))}</small>` : ""}`;
        };
        box.innerHTML = `
          <div class="ld-ch-head"><span>${esc(it._title)}</span><small>pick one</small></div>
          <div class="ld-ch-list">${ch.options.map((o, i) => `<button type="button" class="ld-ch-opt" data-i="${i}"><kbd>${i < 9 ? i + 1 : ""}</kbd><span>${label(o)}</span></button>`).join("")}
            <button type="button" class="ld-ch-opt ld-ch-none" data-i="-1"><kbd>0</kbd><span><b>None of these</b><small>only what always goes in</small></span></button></div>
          ${ch.shared ? `<div class="ld-ch-foot" title="${esc(ch.shared)}">Always added: <span>${esc(ch.shared)}</span></div>` : ""}`;
        const pick = (i) => {
            box.remove();
            addLora(d.tab, it, ch.compose(i));
            added(d, it, card);
            toast(i >= 0 ? `Added ${it._title}: ${ch.options[i].split(",")[0]}` : `Added ${it._title}`);
            card.focus();
        };
        box.addEventListener("click", (e) => {
            const b = e.target.closest(".ld-ch-opt");
            if (b) pick(Number(b.dataset.i));
        });
        box.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                box.remove();
                card.focus();
            } else if (/^[0-9]$/.test(e.key)) {
                const i = e.key === "0" ? -1 : Number(e.key) - 1;
                if (i < ch.options.length) pick(i);
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const opts = [...box.querySelectorAll(".ld-ch-opt")];
                const i = opts.indexOf(document.activeElement);
                opts[clamp(i + (e.key === "ArrowDown" ? 1 : -1), 0, opts.length - 1)].focus();
            }
        });
        box.querySelectorAll(".ld-ch-opt").forEach((b, i) => b.style.setProperty("--i", Math.min(i, 10)));
        placeFloating(box, card, "start");
        const first = box.querySelector(".ld-ch-opt");
        if (first) first.focus();
    }

    // --- details: one dialog with four views that morph into each other ---------------------------------------------
    //   info    the card's details (the picture whole on the left)
    //   frame   Edit preview: the picture in a card-shaped frame, dragged and zoomed; other shapes to try; upload
    //   card    Edit card: the card's texts (the picture moves to the top right)
    //   meta    Metadata: what the file says about its training (the same)
    // ✕ (or Esc) goes back to the details from the other three; a click outside closes the dialog.
    let infoState = null;
    // the reveal runs on the WebUI's computer, and it only answers this computer, so the browser's system names it
    const REVEAL_IN = /Windows/i.test(navigator.userAgent) ? "Explorer" : /Mac/i.test(navigator.userAgent) ? "Finder" : "file manager";
    // a picture can be moved and zoomed in its card; a video shows whole, and no preview has nothing to move
    const framable = (it) => !!it.preview && !isVideo(it);
    // the picture Edit preview shows: one picked there (a gen or an upload, not saved yet), or the LoRA's own
    const fit = (st) => (st.pick ? st.pick.it : st.it);
    const api = (path, body) => fetch(`${API}/${path}`, body === undefined ? { cache: "no-store" } : {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.detail || `the WebUI answered ${r.status}`);
        return j;
    });
    function closeInfo() {
        const w = document.querySelector(".ld-modal-wrap");
        if (w) w.remove();
        document.removeEventListener("keydown", infoKeys, true);
        if (infoState && infoState.back) infoState.back.focus?.();
        infoState = null;
    }
    function infoKeys(e) {
        const st = infoState;
        if (!st) return;
        if (e.key === "Escape") {
            e.stopPropagation();
            if (st.mode !== "info") setMode("info");
            else closeInfo();
        } else if (st.mode === "info" && (e.key === "ArrowRight" || e.key === "ArrowLeft") && !/input|textarea|select/i.test(e.target.tagName)) {
            const d = decks[st.tab];
            const list = (d.shown || []).map((x) => x.name);
            const next = list[list.indexOf(st.it.name) + (e.key === "ArrowRight" ? 1 : -1)];
            if (next) openInfo(st.tab, data.by.get(next), true);
        }
    }
    // a LoRA's card as the deck shows it, for the editor and the small card: [shape wrapper > card]
    function cardView(it, fr, shape, size, cssSize) {
        const p = placePic(it, fr);
        const src = thumbUrl(it, tierFor(size * 1.6 * Math.max(1, p.w / 100)));
        const pic = !it.preview ? `<div class="ld-nopic"><span>${esc(it._title.slice(0, 2))}</span></div>`
            : isVideo(it) ? `<video class="ld-pic" src="${thumbUrl(it, 480)}" muted loop playsinline autoplay></video>`
                : `<img class="ld-pic-bg" src="${src}" alt="" aria-hidden="true"${p.gaps ? "" : " hidden"}><img class="ld-pic ld-framed" src="${src}" alt="" draggable="false" style="${picStyle(p)}">`;
        return `<div class="ld-cardview ld-${shape === "hex" ? "hex" : shape === "octa" ? "oct" : "card"}mode" style="--ld-size:${cssSize || size + "px"}">
          <div class="ld-card loaded">
            <div class="ld-frame" aria-hidden="true"></div>
            <div class="ld-media">${pic}<div class="ld-shade"></div>
              <div class="ld-cap"><div class="ld-title">${esc(it._title)}</div>${it.folder ? `<div class="ld-subt">${esc(segLabel(it.folder.split("/").pop()))}</div>` : ""}</div>
            </div>
          </div></div>`;
    }
    function infoMedia(it) {
        const big = tierFor(560 * (window.devicePixelRatio || 1));
        const reveal = `<button type="button" class="ld-btn ld-reveal" data-do="reveal" title="Show this preview">${ic("eye")}<span>Show</span></button>`;
        if (isVideo(it)) return `<video class="ld-m-pic" src="${thumbUrl(it, big)}" muted loop playsinline autoplay></video>${reveal}`;
        if (!it.preview) return `<div class="ld-nopic"><span>${esc(it._title.slice(0, 2))}</span></div>`;
        return `<img class="ld-m-bg" src="${thumbUrl(it, 240)}" alt="" aria-hidden="true"><img class="ld-m-pic" src="${thumbUrl(it, big)}" alt="">${reveal}`;
    }
    function renderMedia(st) {
        const m = st.media;
        if (st.mode === "info") m.innerHTML = infoMedia(st.it);
        else if (st.mode === "frame") {
            const still = framable(fit(st));
            // the card is as big as the stage allows (up to 290px wide)
            m.innerHTML = `<div class="ld-stage${still ? "" : " ld-still-stage"}">
                <div class="ld-stage-card">${still ? `<img class="ld-stage-ghost" src="${thumbUrl(fit(st), tierFor(800))}" alt="" aria-hidden="true" draggable="false">` : ""}${cardView(fit(st), st.fr, st.shape, 290, "min(290px, calc((100cqh - 130px) / 1.5), calc(100cqw - 80px))")}</div>
                <div class="ld-stage-shapes" role="radiogroup" aria-label="See it in another card shape">
                  ${["hex", "octa", "card"].map((s) => `<button type="button" class="ld-btn ld-icon${s === st.shape ? " on" : ""}" data-shape="${s}" role="radio" aria-checked="${s === st.shape}" title="${s === "hex" ? "Hexagon" : s === "octa" ? "Octagon" : "Rounded"}${s === prefs.shape ? " (your cards)" : ""}">${ic(s === "card" ? "rect" : s)}</button>`).join("")}
                </div>
                ${still ? `<div class="ld-stage-hint">${ic("move")}Drag to move · wheel to zoom</div>` : ""}
                ${fit(st).preview ? `<button type="button" class="ld-btn ld-reveal" data-do="reveal" title="Show this preview">${ic("eye")}<span>Show</span></button>` : ""}
              </div>`;
            paintStage(st);
        } else m.innerHTML = cardView(st.it, framingOf(st.it), prefs.shape, st.mode === "card" ? prefs.cardPic : 96);
    }
    // the editor: the card's picture where the framing puts it, and the rest of the picture faintly around it
    function paintStage(st) {
        const stage = st.media.querySelector(".ld-stage");
        if (!stage) return;
        const p = placePic(fit(st), st.fr);
        const pic = stage.querySelector(".ld-pic.ld-framed");
        const bg = stage.querySelector(".ld-pic-bg");
        if (pic) pic.setAttribute("style", picStyle(p));
        if (bg) bg.hidden = !p.gaps;
        // from layout offsets, not screen boxes, so it's right while the dialog is still morphing
        const card = stage.querySelector(".ld-stage-card .ld-card");
        const media = card && card.querySelector(".ld-media");
        const ghost = stage.querySelector(".ld-stage-ghost");
        if (media && ghost) {
            const x0 = card.offsetLeft + media.offsetLeft, y0 = card.offsetTop + media.offsetTop;
            Object.assign(ghost.style, {
                left: (x0 + (p.left / 100) * media.offsetWidth) + "px", top: (y0 + (p.top / 100) * media.offsetHeight) + "px",
                width: (p.w / 100) * media.offsetWidth + "px", height: (p.h / 100) * media.offsetHeight + "px",
            });
        }
        const panel = st.wrap.querySelector('[data-panel="frame"]');
        if (panel) {
            const z = panel.querySelector(".ld-zoom");
            if (z && document.activeElement !== z) z.value = zoomToSlider(st.fr.z);
            const out = panel.querySelector(".ld-zoom-val");
            if (out) out.textContent = Math.round(st.fr.z * 100) + "%";
        }
    }
    const ZMIN = 0.2, ZMAX = 5;
    const zoomToSlider = (z) => Math.round((Math.log(z / ZMIN) / Math.log(ZMAX / ZMIN)) * 1000);
    const sliderToZoom = (v) => ZMIN * Math.pow(ZMAX / ZMIN, v / 1000);
    // zoom around a point of the frame (cx, cy in % of the frame), keeping that point of the picture under it
    function zoomAt(st, z, cx, cy) {
        const p = placePic(fit(st), st.fr, true);
        const ux = (cx - p.left) / p.w, uy = (cy - p.top) / p.h;
        const nz = clamp(z, ZMIN, ZMAX);
        const k = nz / st.fr.z;
        const nw = p.w * k, nh = p.h * k;
        st.fr = { x: (50 - (cx - ux * nw)) / nw, y: (50 - (cy - uy * nh)) / nh, z: nz };
        st.fr = clampFraming(fit(st), st.fr);
        paintStage(st);
    }
    function wireStage(st) {
        const m = st.media;
        let drag = null;
        m.addEventListener("pointerdown", (e) => {
            if (st.mode !== "frame" || !framable(fit(st)) || e.button !== 0 || e.target.closest("button")) return;
            const media = m.querySelector(".ld-stage-card .ld-media");
            if (!media) return;
            const r = media.getBoundingClientRect();
            drag = { x: e.clientX, y: e.clientY, fr: { ...st.fr }, w: r.width, h: r.height };
            m.setPointerCapture(e.pointerId);
            m.classList.add("dragging");
        });
        m.addEventListener("pointermove", (e) => {
            if (!drag) return;
            const p = placePic(fit(st), drag.fr, true);
            const dl = ((e.clientX - drag.x) / drag.w) * 100, dt = ((e.clientY - drag.y) / drag.h) * 100;
            st.fr = clampFraming(fit(st), { x: drag.fr.x - dl / p.w, y: drag.fr.y - dt / p.h, z: drag.fr.z });
            paintStage(st);
        });
        const end = () => {
            drag = null;
            m.classList.remove("dragging");
        };
        m.addEventListener("pointerup", end);
        m.addEventListener("pointercancel", end);
        m.addEventListener("wheel", (e) => {
            if (st.mode !== "frame" || !framable(fit(st))) return;
            const media = m.querySelector(".ld-stage-card .ld-media");
            if (!media) return;
            e.preventDefault();
            const r = media.getBoundingClientRect();
            zoomAt(st, st.fr.z * Math.exp(-e.deltaY * 0.0015), ((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
        }, { passive: false });
    }

    // --- the details dialog's size: drag its edges or corner (kept per view, for every LoRA) ----------------------
    // The dialog stays centred, so an edge moves half as far as the size changes: the side you hold follows the mouse.
    // In the details, the left edge (and the grip that shows to the left of the picture as the mouse comes near) makes
    // the picture bigger or smaller instead: the dialog widens by as much, and the text beside it keeps its width.
    const DLG_MIN = { info: [600, 420], frame: [700, 460], card: [760, 460], meta: [560, 380] };
    const PIC_MIN = 220;
    function applySize(st) {
        const modal = st.wrap.querySelector(".ld-modal");
        const s = prefs.dlg[st.mode] || {};
        modal.style.width = s.w ? `min(${s.w}px, calc(100vw - 48px))` : "";
        modal.style.height = s.h ? `min(${s.h}px, calc(100vh - 48px))` : "";
        modal.style.maxHeight = s.h ? "calc(100vh - 48px)" : "";
        modal.classList.toggle("ld-sized", !!s.h);
        const pic = st.mode === "info" ? s.pic : 0;
        modal.style.gridTemplateColumns = pic ? `${pic}px minmax(0, 1fr)` : "";
        // a bigger picture asks for a taller dialog too (as tall as the picture's shape wants, up to the window)
        st.media.style.minHeight = pic ? `min(${Math.round(pic / ratioOf(st.it))}px, calc(100vh - 48px))` : "";
    }
    // which edge or corner of the dialog the mouse is on ("l", "br"...), within a few pixels outside it
    function zoneAt(st, x, y) {
        const r = st.wrap.querySelector(".ld-modal").getBoundingClientRect();
        const out = 12, inn = 2;
        if (x < r.left - out || x > r.right + out || y < r.top - out || y > r.bottom + out) return null;
        const h = x < r.left + inn ? "l" : x > r.right - inn ? "r" : "";
        const v = y < r.top + inn ? "t" : y > r.bottom - inn ? "b" : "";
        return v + h || null;
    }
    const ZONE_CURSOR = { l: "ew-resize", r: "ew-resize", t: "ns-resize", b: "ns-resize", tl: "nwse-resize", br: "nwse-resize", tr: "nesw-resize", bl: "nesw-resize" };
    // a size change shown as a quick move from the old size (a double-click back to the usual one)
    function morphSize(st, change) {
        const modal = st.wrap.querySelector(".ld-modal");
        const m0 = modal.getBoundingClientRect();
        change();
        applySize(st);
        store.set("dlg", prefs.dlg);
        if (!motionOn()) return;
        const m1 = modal.getBoundingClientRect();
        modal.animate([{ width: m0.width + "px", height: m0.height + "px" }, { width: m1.width + "px", height: m1.height + "px" }], { duration: 300, easing: EASE });
    }
    function wireResize(st) {
        const wrap = st.wrap;
        const modal = wrap.querySelector(".ld-modal");
        wrap.insertAdjacentHTML("beforeend", `<div class="ld-grip ld-pgrip" title="Drag to make the picture bigger or smaller (double-click: the usual size)" aria-hidden="true"><i></i></div>
            <div class="ld-grip ld-cgrip" title="Drag to resize (double-click: the usual size)" aria-hidden="true"></div>`);
        const pg = wrap.querySelector(".ld-pgrip"), cg = wrap.querySelector(".ld-cgrip");
        let drag = null, raf = 0, last = null;
        // the grips sit just outside the dialog, and show more the nearer the mouse is
        const paintGrips = () => {
            raf = 0;
            if (!last || !wrap.isConnected) return;
            const r = modal.getBoundingClientRect();
            const vw = window.innerWidth, vh = window.innerHeight;
            const info = st.mode === "info";
            pg.hidden = !info;
            const px = Math.max(2, r.left - 26), py = clamp(r.top + r.height / 2 - 48, 2, vh - 98);
            pg.style.transform = `translate(${px}px, ${py}px)`;
            cg.style.transform = `translate(${Math.min(vw - 24, r.right + 2)}px, ${Math.min(vh - 24, r.bottom + 2)}px)`;
            const near = (d) => String(drag ? 1 : clamp(1 - d / 170, 0, 1).toFixed(2));
            const dl = Math.hypot(Math.max(0, Math.abs(last.x - (px + 14)) - 10), Math.max(0, Math.abs(last.y - (py + 48)) - 48));
            pg.style.opacity = near(dl);
            cg.style.opacity = near(Math.hypot(last.x - r.right, last.y - r.bottom));
        };
        const ask = () => { if (!raf) raf = requestAnimationFrame(paintGrips); };
        wrap.addEventListener("pointermove", (e) => {
            last = { x: e.clientX, y: e.clientY };
            if (drag) return onDrag(e);
            ask();
            const z = e.target.closest(".ld-grip") ? null : zoneAt(st, e.clientX, e.clientY);
            wrap.style.cursor = z ? ZONE_CURSOR[z] : "";
        });
        wrap.addEventListener("pointerleave", () => {
            last = { x: -9999, y: -9999 };
            ask();
        });
        const start = (e, zone) => {
            const s = prefs.dlg[st.mode] || {};
            // inside the border, as the width and height styles count
            drag = { zone, x: e.clientX, y: e.clientY, w: modal.clientWidth, h: modal.clientHeight, pic: st.mode === "info" ? st.media.offsetWidth : 0, s: { ...s } };
            try {
                wrap.setPointerCapture(e.pointerId);
            } catch (err) { /* the drag still follows the mouse over the dialog */ }
            wrap.classList.add("ld-resizing");
            wrap.style.setProperty("--ld-cursor", ZONE_CURSOR[zone === "pic" ? "l" : zone]);
            e.preventDefault();
        };
        const onDrag = (e) => {
            const { zone } = drag;
            const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            const [minW, minH] = DLG_MIN[st.mode] || [560, 380];
            const maxW = window.innerWidth - 48, maxH = window.innerHeight - 48;
            const s = { ...drag.s };
            if (zone === "pic") {  // the picture's own grip, or the left edge of the details
                const pic = clamp(drag.pic - 2 * dx, PIC_MIN, Math.max(PIC_MIN, maxW - (drag.w - drag.pic)));
                s.pic = Math.round(pic);
                s.w = Math.round(drag.w + (pic - drag.pic));
            } else {
                if (zone.includes("r")) s.w = Math.round(clamp(drag.w + 2 * dx, minW, maxW));
                if (zone.includes("l")) s.w = Math.round(clamp(drag.w - 2 * dx, minW, maxW));
                if (zone.includes("b")) s.h = Math.round(clamp(drag.h + 2 * dy, minH, maxH));
                if (zone.includes("t")) s.h = Math.round(clamp(drag.h - 2 * dy, minH, maxH));
                if (s.pic && s.w) s.pic = Math.min(s.pic, s.w - 420);  // the text keeps some room
            }
            prefs.dlg[st.mode] = s;
            applySize(st);
            ask();
        };
        const end = () => {
            if (!drag) return;
            drag = null;
            wrap.classList.remove("ld-resizing");
            store.set("dlg", prefs.dlg);
            if (st.mode === "info") renderMedia(st);  // a sharper picture if it grew
            if (st.mode === "frame") paintStage(st);
            ask();
        };
        wrap.addEventListener("pointerup", end);
        wrap.addEventListener("pointercancel", end);
        // a click outside closes the dialog; on its edge (or a grip) it starts a resize instead
        wrap.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            if (e.target === pg || pg.contains(e.target)) return start(e, "pic");
            if (e.target === cg) return start(e, "br");
            const z = zoneAt(st, e.clientX, e.clientY);
            if (z) return start(e, st.mode === "info" && z === "l" ? "pic" : z);
            if (e.target === wrap) closeInfo();
        });
        pg.addEventListener("dblclick", () => morphSize(st, () => {
            const s = { ...(prefs.dlg.info || {}) };
            if (s.pic && s.w) s.w -= s.pic - 380;
            delete s.pic;
            prefs.dlg.info = s;
        }));
        cg.addEventListener("dblclick", () => morphSize(st, () => { delete prefs.dlg[st.mode]; }));
    }

    function setMode(mode) {
        const st = infoState;
        if (!st || st.mode === mode) return;
        const modal = st.wrap.querySelector(".ld-modal");
        const anim = motionOn();
        const r0 = anim ? st.media.getBoundingClientRect() : null;
        const m0 = anim ? modal.getBoundingClientRect() : null;
        if (mode === "frame") {
            st.pick = null;
            st.upload = null;
            st.fr = clampFraming(st.it, { ...framingOf(st.it) });
            st.shape = prefs.shape;
        }
        st.mode = mode;
        modal.dataset.mode = mode;
        applySize(st);
        const panel = ensurePanel(st, mode);
        if (mode === "card") panel.querySelector(".ld-ce-pic").prepend(st.media);
        else if (mode === "meta") st.wrap.querySelector(".ld-m-mini").appendChild(st.media);
        else modal.insertBefore(st.media, modal.firstChild);
        renderMedia(st);
        st.wrap.querySelectorAll(".ld-m-panel").forEach((p) => { p.hidden = p !== panel; });
        // the same ✕ everywhere: it closes the details, and from the other views it goes back to them
        const close = st.wrap.querySelector(".ld-m-close");
        close.title = mode === "info" ? "Close (Esc)" : "Back to the details (Esc)";
        close.setAttribute("aria-label", mode === "info" ? "Close" : "Back to the details");
        if (!anim) return;
        const r1 = st.media.getBoundingClientRect(), m1 = modal.getBoundingClientRect();
        modal.animate([{ width: m0.width + "px", height: m0.height + "px" }, { width: m1.width + "px", height: m1.height + "px" }],
            { duration: 340, easing: EASE });
        if (r1.width && r1.height) {
            // from where the picture was, scaled evenly (the card keeps its shape on the way) around its centre
            const s = Math.min(r0.width / r1.width, r0.height / r1.height);
            const dx = r0.left + r0.width / 2 - (r1.left + r1.width / 2), dy = r0.top + r0.height / 2 - (r1.top + r1.height / 2);
            st.media.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: "none" }], { duration: 380, easing: EASE });
        }
        panel.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
            { duration: 260, delay: 90, easing: EASE, fill: "backwards" });
        if (mode === "frame") setTimeout(() => paintStage(st), 400);  // the ghost follows the card once it has settled
    }
    function ensurePanel(st, mode) {
        let panel = st.wrap.querySelector(`[data-panel="${mode}"]`);
        if (panel && mode === "info") return panel;
        if (panel) panel.remove();
        panel = el("div", "ld-m-panel");
        panel.dataset.panel = mode;
        st.wrap.querySelector(".ld-m-body").appendChild(panel);
        if (mode === "frame") buildFramePanel(st, panel);
        else if (mode === "card") buildCardPanel(st, panel);
        else if (mode === "meta") buildMetaPanel(st, panel);
        return panel;
    }
    // after a save: the new card everywhere
    function takeItem(it) {
        prepare(it);
        const i = data.items.findIndex((x) => x.name === it.name);
        if (i >= 0) data.items[i] = it;
        else data.items.push(it);
        data.by.set(it.name, it);
        data.byAlias.set(it.alias, it);
        everyDeck((d) => {
            d.cards.delete(it.name);
            renderAll(d);
        });
        if (infoState && infoState.it.name === it.name) {
            infoState.it = it;
            const old = infoState.wrap.querySelector('[data-panel="info"]');
            if (old) old.replaceWith(buildInfoPanel(infoState));
            infoState.wrap.querySelector(".ld-m-head h3").textContent = it._title;
        }
        return it;
    }

    // Edit preview's panel: how the picture sits (zoom, fill, whole, automatic), and which picture it is: its preview
    // now, an upload, or one of its gens. A picture picked here is only shown until Save preview.
    function frameNote(st) {
        const it = fit(st);
        if (!it.pw) return "";
        return `${it.pw} × ${it.ph}${st.pick ? " · not saved yet" : it.preview === "gen" ? " · its first gen, not saved yet" : it.framing ? " · framed by hand" : ""}`;
    }
    function buildFramePanel(st, panel) {
        const it = fit(st);
        const still = framable(it);
        panel.innerHTML = `
          <div class="ld-m-scroll">
            ${still ? `<section><h4>${ic("image")}Preview <small class="ld-frame-note">${esc(frameNote(st))}</small></h4>
              <p class="ld-hint">Drag the picture to move it, and use the mouse wheel or the slider to zoom. The faint part
              around the card is what the card doesn't show. The shape buttons above it only preview: your cards keep their shape.</p></section>
            <section><h4>${ic("gridLarge")}Zoom <small class="ld-zoom-val"></small></h4>
              <div class="ld-zoomrow"><button type="button" class="ld-btn ld-icon" data-do="zout" title="Zoom out" aria-label="Zoom out">${ic("minus")}</button>
                <input type="range" class="ld-zoom" min="0" max="1000" step="1" aria-label="Zoom">
                <button type="button" class="ld-btn ld-icon" data-do="zin" title="Zoom in" aria-label="Zoom in">${ic("plus")}</button></div>
              <div class="ld-chips">
                <button type="button" class="ld-chip" data-do="fill" title="The picture covers the whole card">Fill the card</button>
                <button type="button" class="ld-chip" data-do="whole" title="All of the picture shows, with a soft blur around it">Whole picture</button>
                <button type="button" class="ld-chip" data-do="reset" title="How LoRA Deck places it by itself: pictures of the card's shape fill it, others show whole">Automatic</button>
              </div></section>`
            : `<section><h4>${ic("image")}Preview</h4><p class="ld-hint">${it.preview ? "Its preview is a video, which always shows whole in its card. Pick one of its gens or upload a picture to take its place."
                : "This LoRA has no preview yet. Pick one of its gens or upload a picture, then move and zoom it here."}</p></section>`}
            <section><h4>${ic("gridSmall")}Picture <small class="ld-pics-note"></small></h4>
              <div class="ld-pics" role="listbox" aria-label="Pictures for its card"></div>
              <button type="button" class="ld-btn ld-link ld-pics-more" data-do="moregens" hidden></button>
              <p class="ld-hint ld-pics-from"></p>
              <input type="file" class="ld-file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" hidden></section>
          </div>
          <div class="ld-m-foot"><button type="button" class="ld-btn ld-pill" data-do="back" title="Leave it as it was">${ic("x")}<span>Cancel</span></button><span class="ld-grow"></span>
            ${still ? `<button type="button" class="ld-btn ld-pill ld-main ld-primary" data-do="saveframe">${ic("check")}<span>Save preview</span></button>` : ""}</div>`;
        const zoom = panel.querySelector(".ld-zoom");
        if (zoom) zoom.addEventListener("input", (e) => zoomAt(st, sliderToZoom(Number(e.target.value)), 50, 50));
        panel.querySelector(".ld-file").addEventListener("change", (e) => {
            const f = e.target.files && e.target.files[0];
            e.target.value = "";
            if (!f) return;
            if (f.size > 60 * 1024 * 1024) return toast("That picture is too big (60 MB at most)");
            const url = URL.createObjectURL(f);
            const im = new Image();
            im.onload = () => {
                if (st.upload) URL.revokeObjectURL(st.upload.it._src);
                st.upload = { kind: "data", file: f, it: { ...st.it, preview: "still", gen: null, pw: im.naturalWidth, ph: im.naturalHeight, framing: null, _src: url } };
                pickPicture(st, st.upload);
            };
            im.onerror = () => {
                URL.revokeObjectURL(url);
                toast("That file isn't a picture this browser can show");
            };
            im.src = url;
        });
        paintPics(st, panel);
        if (!st.gens) loadGens(st, 0);
        setTimeout(() => paintStage(st));
    }
    // the pictures to pick from: its preview now, an upload, then its gens (newest first)
    function paintPics(st, panel) {
        const box = panel.querySelector(".ld-pics");
        if (!box) return;
        const it = st.it;
        const g = st.gens;
        const sel = !st.pick ? "now" : st.pick.kind === "gen" ? "g:" + st.pick.id : "up";
        const img = (src) => `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" draggable="false">`;
        const tile = (key, inner, title, label) => `<button type="button" class="ld-btn ld-pt${key === sel ? " on" : ""}" data-pick="${esc(key)}" role="option"
            aria-selected="${key === sel}" title="${esc(title)}">${inner}${label ? `<span class="ld-pt-label">${esc(label)}</span>` : ""}</button>`;
        const shownGen = it.preview === "gen" ? it.gen.id : "";
        let html = "";
        if (it.preview) {
            html += tile("now", isVideo(it) ? `<span class="ld-pt-icon">${ic("image")}</span>` : img(thumbUrl(it, 160)),
                shownGen ? `Its first gen (${it.gen.file}), shown because it has no preview` : "Its preview now", shownGen ? "First gen" : "Now");
        }
        if (st.upload) html += tile("up", img(st.upload.it._src), st.upload.file.name, st.upload.label || "Upload");
        const gal = galleryPic(st.tab);
        if (gal && !(st.upload && st.upload.from === gal)) {
            html += `<button type="button" class="ld-btn ld-pt" data-do="gallery" title="The picture shown in the WebUI's gallery now">${img(gal)}<span class="ld-pt-label">Gallery</span></button>`;
        }
        html += `<button type="button" class="ld-btn ld-pt ld-pt-add" data-do="upload" title="Upload a picture from this computer">${ic("plus")}<span class="ld-pt-label">Upload</span></button>`;
        if (!g || (g.loading && !g.items.length)) html += `<span class="ld-pt ld-pt-wait" aria-hidden="true"></span>`.repeat(4);
        else {
            html += g.items.filter((x) => x.id !== shownGen).map((x) => tile("g:" + x.id, img(genThumb(x, 160)),
                `${x.file} · ${new Date(x.t * 1000).toLocaleString()}${x.w ? ` · ${x.w} × ${x.h}` : ""}`, "")).join("");
        }
        const top = box.scrollTop;
        box.innerHTML = html;
        box.scrollTop = top;
        const note = panel.querySelector(".ld-pics-note");
        const more = panel.querySelector(".ld-pics-more");
        const from = panel.querySelector(".ld-pics-from");
        const dirs = (g && g.dirs) || data.genDirs || [];
        const names = dirs.map((d) => d.split(/[\\/]/).filter(Boolean).pop()).join(", ");
        note.textContent = !g || (g.loading && !g.items.length) ? "looking through your gens…"
            : g.error ? `couldn't read your gens (${g.error})`
                : g.total ? `${g.total} gen${g.total === 1 ? "" : "s"} made with it, newest first` : "no gens made with it yet";
        more.hidden = !g || g.items.length >= g.total;
        if (g && !more.hidden) more.textContent = g.loading ? "Loading…" : `Show more (${g.total - g.items.length} left)`;
        from.textContent = `${names ? `Gens from ${names} (the WebUI's output folders, in Settings › Paths for saving). ` : ""}Saving copies the picture you pick as its preview${it.preview && it.preview !== "gen" ? "; the old one goes to LoRA Deck's backups" : ""}.`;
    }
    function loadGens(st, offset) {
        const g = st.gens || (st.gens = { items: [], total: 0, dirs: [], loading: false, error: "" });
        if (g.loading) return;
        g.loading = true;
        const name = st.it.name;
        const repaint = () => {
            const panel = st.wrap.querySelector('[data-panel="frame"]');
            if (panel && st.mode === "frame") paintPics(st, panel);
        };
        if (offset) repaint();
        api(`gens?name=${encodeURIComponent(name)}&offset=${offset}&limit=60`).then((r) => {
            g.items = offset ? g.items.concat(r.items || []) : r.items || [];
            g.total = r.total || 0;
            g.dirs = r.dirs || [];
            g.error = "";
        }, (e) => { g.error = e.message; }).finally(() => {
            g.loading = false;
            if (infoState === st && st.it.name === name) repaint();
        });
    }
    // show another picture in the editor (not saved until Save preview), placed the automatic way
    function pickPicture(st, pick) {
        const before = framable(fit(st));
        st.pick = pick;
        st.fr = clampFraming(fit(st), { ...framingOf(fit(st)) });
        renderMedia(st);
        const panel = st.wrap.querySelector('[data-panel="frame"]');
        if (!panel) return;
        if (framable(fit(st)) !== before) {  // the zoom controls come (or go): the panel anew, where it was scrolled to
            const sc = panel.querySelector(".ld-m-scroll"), pics = panel.querySelector(".ld-pics");
            const a = sc ? sc.scrollTop : 0, b = pics ? pics.scrollTop : 0;
            buildFramePanel(st, panel);
            panel.querySelector(".ld-m-scroll").scrollTop = a;
            panel.querySelector(".ld-pics").scrollTop = b;
        } else {
            paintPics(st, panel);
            const n = panel.querySelector(".ld-frame-note");
            if (n) n.textContent = frameNote(st);
        }
        paintStage(st);
    }
    // the picture the WebUI's gallery shows (the one picked there, else the first)
    function galleryPic(tab) {
        const g = app().querySelector(`#${tab}_gallery`);
        if (!g) return null;
        const im = g.querySelector(".preview img") || g.querySelector(".thumbnail-item.selected img") || g.querySelector(".thumbnail-item img, img");
        return im && im.src && !/\.(mp4|webm)(\?|$)/i.test(im.src) ? im.src : null;
    }
    // a picture from a URL (the gallery's) taken in as if uploaded
    function pickFromUrl(st, src, label) {
        fetch(src).then((r) => {
            if (!r.ok) throw new Error(`the WebUI answered ${r.status}`);
            return r.blob();
        }).then((blob) => {
            const f = new File([blob], `${label.toLowerCase()}.${(blob.type.split("/")[1] || "png").replace("jpeg", "jpg")}`, { type: blob.type || "image/png" });
            const url = URL.createObjectURL(f);
            const im = new Image();
            im.onload = () => {
                if (st.upload) URL.revokeObjectURL(st.upload.it._src);
                st.upload = { kind: "data", file: f, label, from: src, it: { ...st.it, preview: "still", gen: null, pw: im.naturalWidth, ph: im.naturalHeight, framing: null, _src: url } };
                pickPicture(st, st.upload);
            };
            im.src = url;
        }).catch((e) => toast(`Couldn't take the gallery's picture: ${e.message}`));
    }
    const readData = (file) => new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error("the file couldn't be read"));
        r.readAsDataURL(file);
    });

    // Edit card: the WebUI's card editor and more. Its texts on the left; on the right the card (256px wide at first,
    // like the WebUI's, and as big as you drag its corner, for every LoRA) with the file's facts under it.
    const TAG_HUES = ["#f97316", "#f59e0b", "#84cc16", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
    const hueFor = (n, max) => {
        const r = n / (max || 1);
        return TAG_HUES[r >= 0.8 ? 0 : r >= 0.6 ? 1 : r >= 0.45 ? 2 : r >= 0.3 ? 3 : r >= 0.2 ? 4 : r >= 0.12 ? 5 : r >= 0.06 ? 6 : 7];
    };
    // the tags of its captions, most used first (as the WebUI counts them)
    function trainedTags(st) {
        const m = st.meta;
        const freq = m && m.ss_tag_frequency && typeof m.ss_tag_frequency === "object" ? m.ss_tag_frequency : null;
        if (!freq) return (st.it.tags || []).map(([t, n]) => [t, Number(n)]);
        const tags = {};
        for (const set of Object.values(freq)) for (const [t, n] of Object.entries(set || {})) tags[t.trim()] = (tags[t.trim()] || 0) + Number(n || 0);
        return Object.entries(tags).filter(([t]) => t).sort((a, b) => b[1] - a[1]);
    }
    // the WebUI's random prompt: each tag with a chance of its count over the top tag's
    function randomPrompt(tags) {
        const max = tags.length ? tags[0][1] : 0;
        return tags.filter(([, n]) => n > Math.random() * max).map(([t]) => t.replace(/([({[\]})])/g, "\\$1")).sort().join(", ");
    }
    const splitTags = (line) => line.split(/\s*,\s*/).map((x) => x.trim());
    const hasTag = (text, tag) => text.split(/\n|\|\|/).some((part) => splitTags(part).includes(tag));
    // a tag in or out of the activation text: out wherever it is; in at the end of the last line without choices
    function toggleTag(text, tag) {
        if (hasTag(text, tag)) {  // only the lines that have it change; one left empty goes
            const out = [];
            for (const line of text.split("\n")) {
                if (!line.split("||").some((part) => splitTags(part).includes(tag))) {
                    out.push(line);
                    continue;
                }
                const next = line.split(/(\s*\|\|\s*)/).map((part, i) => {
                    if (i % 2) return part;
                    const kept = splitTags(part).filter((x) => x && x !== tag);
                    return kept.join(", ") + (kept.length && /,\s*$/.test(part) ? "," : "");
                }).join("");
                if (next.replace(/\|\|/g, "").trim()) out.push(next);
            }
            return out.join("\n");
        }
        const lines = text.split("\n");
        let at = -1;
        for (let i = lines.length - 1; i >= 0; i--) if (!lines[i].includes("||") && lines[i].trim()) { at = i; break; }
        if (at < 0) return text.trim() ? `${text.replace(/\s+$/, "")}\n${tag},` : `${tag},`;
        lines[at] = /,\s*$/.test(lines[at]) ? `${lines[at].replace(/\s+$/, "")} ${tag},` : `${lines[at].replace(/\s+$/, "")}, ${tag},`;
        return lines.join("\n");
    }
    function buildCardPanel(st, panel) {
        const it = st.it;
        const versions = (data.meta.sd_versions || ["Unknown"]);
        panel.innerHTML = `<div class="ld-m-scroll"><div class="ld-cardedit">
            <form class="ld-form ld-ce-main" autocomplete="off">
              <label class="ld-field"><span>Description <small>shown under its name in the WebUI's own tab</small></span><textarea name="description" rows="2"></textarea></label>
              <section class="ld-ce-tags" hidden><h4>${ic("code")}Training tags <small>the most used in its captions; a click puts one in the activation text, or takes it out</small></h4>
                <div class="ld-tagcloud"></div></section>
              <label class="ld-field"><span>Activation text <small>what a click adds to the prompt; <code>||</code> separates choices on one line</small></span>
                <textarea name="activation text" rows="6" class="ld-monofield"></textarea><span class="ld-field-note" data-note="choices"></span></label>
              <div class="ld-field-row">
                <label class="ld-field"><span>Preferred weight <small>0: the WebUI's default</small></span>
                  <span class="ld-weightrow"><input type="range" class="ld-wslider" min="0" max="2" step="0.05" aria-label="Preferred weight"><input type="number" name="preferred weight" step="0.05" min="-4" max="4"></span></label>
                <label class="ld-field"><span>Model version</span><select name="sd version">${versions.map((v) => `<option>${esc(v)}</option>`).join("")}</select></label>
              </div>
              <label class="ld-field"><span>Negative text <small>goes in the negative prompt with it</small></span><textarea name="negative text" rows="2" class="ld-monofield"></textarea></label>
              <section class="ld-ce-random" hidden><h4>${ic("spark")}Random prompt <small>its training tags, each picked by how often it was trained on</small></h4>
                <div class="ld-random"><textarea class="ld-monofield" rows="3" readonly aria-label="Random prompt"></textarea>
                  <div class="ld-random-btns"><button type="button" class="ld-btn ld-pill ld-sm" data-do="rnd">${ic("refresh")}<span>Generate</span></button>
                    <button type="button" class="ld-btn ld-pill ld-sm" data-do="rndcopy">${ic("copy")}<span>Copy</span></button>
                    <button type="button" class="ld-btn ld-pill ld-sm" data-do="rndadd">${ic("plus")}<span>Add to prompt</span></button></div></div></section>
              <label class="ld-field"><span>Notes</span><textarea name="notes" rows="4"></textarea></label>
            </form>
            <aside class="ld-ce-side">
              <div class="ld-ce-pic"><span class="ld-ce-grip" title="Drag to make the preview bigger or smaller (for every LoRA)" aria-hidden="true"></span></div>
              <table class="ld-ce-file"></table>
            </aside>
          </div></div>
          <div class="ld-m-foot"><button type="button" class="ld-btn ld-pill" data-do="back" title="Leave it as it was">${ic("x")}<span>Cancel</span></button><span class="ld-grow"></span>
            <button type="button" class="ld-btn ld-pill ld-main ld-primary" data-do="savecard" disabled>${ic("check")}<span>Save card</span></button></div>`;
        const form = panel.querySelector("form");
        const act = form.elements["activation text"];
        const note = panel.querySelector('[data-note="choices"]');
        const paintNote = () => {
            const ch = parseChoices(act.value);
            note.innerHTML = ch ? `${ic("list")}${ch.options.length} choices: ${ch.options.map((o) => `<b>${esc(o.split(",")[0])}</b>`).join(" · ")}${ch.shared ? ` · always: ${esc(ch.shared)}` : ""}` : "";
            panel.querySelectorAll(".ld-tag").forEach((b) => b.classList.toggle("on", hasTag(act.value, b.dataset.tag)));
        };
        const slider = panel.querySelector(".ld-wslider"), weight = form.elements["preferred weight"];
        slider.addEventListener("input", () => { weight.value = slider.value; });
        weight.addEventListener("input", () => { slider.value = weight.value; });
        form.addEventListener("input", paintNote);
        form.addEventListener("submit", (e) => e.preventDefault());
        panel.querySelector(".ld-tagcloud").addEventListener("click", (e) => {
            const b = e.target.closest(".ld-tag");
            if (!b) return;
            act.value = toggleTag(act.value, b.dataset.tag);
            paintNote();
            pop(b);
        });
        wireCardGrip(st, panel);
        paintCardSide(st, panel);
        api(`card?name=${encodeURIComponent(it.name)}`).then((card) => {
            for (const [k, v] of Object.entries(card)) {
                const f = form.elements[k];
                if (!f) continue;
                if (f.tagName === "SELECT" && v && ![...f.options].some((o) => o.value === v)) f.add(new Option(v));
                f.value = k === "sd version" ? (v || "Unknown") : v ?? "";
            }
            slider.value = weight.value;
            paintNote();
            panel.querySelector('[data-do="savecard"]').disabled = false;
            act.focus();
        }, (err) => toast(`Could not read the card: ${err.message}`));
        // the file's own facts, its full tag counts (the list has its top 40)
        const fill = () => {
            paintCardSide(st, panel);
            paintNote();
        };
        if (st.meta) fill();
        else api(`metadata?name=${encodeURIComponent(it.name)}`).then(({ metadata }) => {
            st.meta = metadata || {};
            if (panel.isConnected) fill();
        }, () => {});
    }
    // the colourful tags, the random prompt and the file table (again once the metadata is in)
    function paintCardSide(st, panel) {
        const it = st.it;
        const tags = trainedTags(st);
        const top = tags.slice(0, 24);
        const max = top.length ? top[0][1] : 1;
        const cloud = panel.querySelector(".ld-tagcloud");
        cloud.innerHTML = top.map(([t, n]) => `<button type="button" class="ld-btn ld-tag" data-tag="${esc(t)}" style="--c:${hueFor(n, max)}"
            title="${esc(t)}: in ${n} caption${n === 1 ? "" : "s"}. Click to add it to the activation text, or take it out">${ic("check")}<span>${esc(t)}</span><small>${n}</small></button>`).join("");
        panel.querySelector(".ld-ce-tags").hidden = !top.length;
        const rnd = panel.querySelector(".ld-ce-random");
        rnd.hidden = !tags.length;
        const box = rnd.querySelector("textarea");
        if (tags.length && (!box.value || st.meta)) box.value = randomPrompt(tags);
        const m = st.meta || {};
        const g = (k) => (m[k] == null || m[k] === "" || m[k] === "None" ? null : m[k]);
        let res = null;
        const buckets = g("ss_bucket_info") && m.ss_bucket_info.buckets;
        if (buckets && typeof buckets === "object") {
            const count = {};
            for (const b of Object.values(buckets)) {
                const r = b && b.resolution;
                if (r) count[`${r[1]}×${r[0]}`] = (count[`${r[1]}×${r[0]}`] || 0) + Number(b.count || 0);
            }
            const list = Object.keys(count).sort((a, b) => count[b] - count[a]);
            res = list.slice(0, 4).join(", ") + (list.length > 4 ? ", …" : "");
        }
        const dirs = g("ss_dataset_dirs") && typeof m.ss_dataset_dirs === "object" ? Object.values(m.ss_dataset_dirs) : [];
        const images = dirs.reduce((a, v) => a + Number((v && v.img_count) || 0), 0);
        const started = Number(g("ss_training_started_at")) || 0;
        const rows = [
            ["File", it.file], ["Size", it.size ? (it.size / 1048576).toFixed(1) + " MB" : ""], ["Hash", it.hash],
            ["Modified", it.mtime ? new Date(it.mtime * 1000).toLocaleString() : ""],
            ["Output name", g("ss_output_name")], ["Model", g("ss_sd_model_name") || g("modelspec.architecture")], ["Clip skip", g("ss_clip_skip")],
            ["Module", g("ss_network_module") && String(m.ss_network_module).replace(/^.*\./, "")],
            ["Trained", started ? new Date(started * 1000).toLocaleString() : ""], [res && res.includes(",") ? "Resolutions" : "Resolution", res],
            ["Dataset", images ? `${images} images` : ""],
        ].filter(([, v]) => v != null && v !== "");
        panel.querySelector(".ld-ce-file").innerHTML = rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
    }
    // the preview's corner: drag it out or in; the size is kept for every LoRA
    const CARDPIC_MIN = 140, CARDPIC_MAX = 520;
    function wireCardGrip(st, panel) {
        const grip = panel.querySelector(".ld-ce-grip");
        let drag = null;
        grip.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            try {
                grip.setPointerCapture(e.pointerId);
            } catch (err) { /* some pens: the drag still follows the grip */ }
            drag = { x: e.clientX, y: e.clientY, w: prefs.cardPic };
            panel.classList.add("ld-sizing");
        });
        grip.addEventListener("pointermove", (e) => {
            if (!drag) return;
            // the card grows from its top right: the corner moves left 1 and down 1.5 for each pixel of width
            const a = (-(e.clientX - drag.x) + (e.clientY - drag.y) * 1.5) / 3.25;
            const max = Math.min(CARDPIC_MAX, Math.max(CARDPIC_MIN, panel.clientWidth - 360));
            setCardPic(st, clamp(Math.round(drag.w + a), CARDPIC_MIN, max));
        });
        const end = () => {
            if (!drag) return;
            drag = null;
            panel.classList.remove("ld-sizing");
            savePref("cardPic", prefs.cardPic);
            if (st.mode === "card") renderMedia(st);  // a sharper picture for a bigger card
        };
        grip.addEventListener("pointerup", end);
        grip.addEventListener("pointercancel", end);
        grip.addEventListener("dblclick", () => {
            setCardPic(st, 256);
            savePref("cardPic", 256);
            renderMedia(st);
        });
    }
    function setCardPic(st, px) {
        prefs.cardPic = px;
        const v = st.media.querySelector(".ld-cardview");
        if (v) v.style.setProperty("--ld-size", px + "px");
    }

    function buildMetaPanel(st, panel) {
        panel.innerHTML = `<div class="ld-m-scroll ld-meta"><p class="ld-hint">Reading the file…</p></div>
          <div class="ld-m-foot"><span class="ld-m-foot-note">${ic("info")}Read from the file; nothing here changes it</span><span class="ld-grow"></span>
            <button type="button" class="ld-btn ld-pill" data-do="copymeta" disabled>${ic("copy")}<span>Copy all</span></button></div>`;
        api(`metadata?name=${encodeURIComponent(st.it.name)}`).then(({ metadata }) => {
            st.meta = metadata || {};
            renderMeta(panel.querySelector(".ld-meta"), st.meta);
            panel.querySelector('[data-do="copymeta"]').disabled = !Object.keys(st.meta).length;
        }, (err) => {
            panel.querySelector(".ld-meta").innerHTML = `<p class="ld-hint">Could not read it: ${esc(err.message)}</p>`;
        });
    }
    function renderMeta(box, m) {
        const keys = Object.keys(m);
        if (!keys.length) {
            box.innerHTML = `<div class="ld-empty-art">${ic("code")}</div><p class="ld-hint">This file says nothing about its training (it has no metadata).</p>`;
            return;
        }
        const g = (...names) => names.map((n) => m[n]).find((v) => v !== undefined && v !== null && v !== "" && v !== "None");
        const num = (v) => (v === undefined ? undefined : Number(v));
        const date = (v) => (v ? new Date(Number(v) * 1000).toLocaleString() : undefined);
        const started = num(g("ss_training_started_at")), ended = num(g("ss_training_finished_at"));
        const dur = started && ended && ended > started ? ended - started : 0;
        const short = (v) => String(v).replace(/^.*\./, "").replace(/'>?$/, "");
        const facts = [
            ["Base model", g("modelspec.architecture", "ss_base_model_version", "ss_sd_model_name")],
            ["Network", [g("ss_network_module") && short(g("ss_network_module")), g("ss_network_dim") && `dim ${g("ss_network_dim")}`, g("ss_network_alpha") && `alpha ${g("ss_network_alpha")}`].filter(Boolean).join(" · ")],
            ["Resolution", g("modelspec.resolution", "ss_resolution")],
            ["Epochs", g("ss_num_epochs")], ["Steps", g("ss_steps", "ss_max_train_steps")],
            ["Images", g("ss_num_train_images")], ["Batch size", g("ss_batch_size_per_device", "ss_total_batch_size")],
            ["Learning rate", [g("ss_learning_rate"), g("ss_unet_lr") && `unet ${g("ss_unet_lr")}`, g("ss_text_encoder_lr") && `text ${g("ss_text_encoder_lr")}`].filter(Boolean).join(" · ")],
            ["Optimizer", g("ss_optimizer") && short(String(g("ss_optimizer")).split("(")[0])], ["Scheduler", g("ss_lr_scheduler")],
            ["Precision", g("ss_mixed_precision")], ["Seed", g("ss_seed")], ["Clip skip", g("ss_clip_skip")],
            ["Trained", started ? `${date(started)}${dur ? ` · ${dur >= 3600 ? Math.floor(dur / 3600) + " h " : ""}${Math.round((dur % 3600) / 60)} min` : ""}` : undefined],
            ["Output name", g("ss_output_name", "modelspec.title")],
        ].filter(([, v]) => v !== undefined && v !== "" && v !== null);
        // the tags it was trained on, summed over its folders
        const freq = m.ss_tag_frequency && typeof m.ss_tag_frequency === "object" ? m.ss_tag_frequency : null;
        const tags = {};
        if (freq) for (const set of Object.values(freq)) for (const [t, n] of Object.entries(set || {})) tags[t.trim()] = (tags[t.trim()] || 0) + Number(n || 0);
        const top = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 40);
        const max = top.length ? top[0][1] : 1;
        const dirs = m.ss_dataset_dirs && typeof m.ss_dataset_dirs === "object" ? Object.entries(m.ss_dataset_dirs) : [];
        const val = (v) => (typeof v === "object" ? JSON.stringify(v) : String(v));
        box.innerHTML = `
          <div class="ld-meta-grid">${facts.map(([k, v]) => `<div class="ld-meta-fact"><small>${esc(k)}</small><b title="${esc(v)}">${esc(v)}</b></div>`).join("")}</div>
          ${dirs.length ? `<section><h4>${ic("folder")}Dataset <small>${dirs.length} folder${dirs.length === 1 ? "" : "s"}</small></h4>
            <div class="ld-meta-dirs">${dirs.map(([n, v]) => `<div><span>${esc(n)}</span><small>${esc(v && v.img_count != null ? `${v.img_count} images × ${v.n_repeats || 1}` : val(v))}</small></div>`).join("")}</div></section>` : ""}
          ${top.length ? `<section><h4>${ic("code")}Trained on <small>how many captions had each tag; click to add it</small></h4>
            <div class="ld-bars">${top.map(([t, n]) => `<button type="button" class="ld-bar" data-words="${esc(t)}" title="Add “${esc(t)}” to the prompt"><span class="ld-bar-fill" style="width:${((n / max) * 100).toFixed(1)}%"></span><span class="ld-bar-name">${esc(t)}</span><span class="ld-bar-n">${n}</span></button>`).join("")}</div></section>` : ""}
          <section><h4>${ic("list")}Every field <small>${keys.length}</small></h4>
            <label class="ld-search ld-meta-find">${ic("search")}<input type="search" placeholder="Find a field or value" aria-label="Find a field"></label>
            <dl class="ld-meta-all">${keys.sort().map((k) => `<div class="ld-meta-row"><dt>${esc(k)}</dt><dd>${esc(val(m[k]).slice(0, 600))}${val(m[k]).length > 600 ? "…" : ""}</dd></div>`).join("")}</dl></section>`;
        const find = box.querySelector(".ld-meta-find input");
        find.addEventListener("input", () => {
            const q = find.value.trim().toLowerCase();
            box.querySelectorAll(".ld-meta-row").forEach((r) => { r.hidden = !!q && !r.textContent.toLowerCase().includes(q); });
        });
    }

    function buildInfoPanel(st) {
        const { it } = st;
        const ch = it._choices;
        const panel = el("div", "ld-m-panel");
        panel.dataset.panel = "info";
        const chips = (list, cls) => list.map(([t, n]) => `<button type="button" class="ld-chip ${cls || ""}" data-words="${esc(t)}" title="Add “${esc(t)}” to the prompt">${esc(t)}${n ? `<small>${n}</small>` : ""}</button>`).join("");
        const facts = [
            ["File", it.file], ["Folder", it.folder || "models/Lora"],
            ["Made for", it.model ? `${it.model.name}${PRESET_LABEL[it.model.arch] && PRESET_LABEL[it.model.arch] !== it.model.name ? ` (the ${PRESET_LABEL[it.model.arch]} preset)` : ""}, read from ${MODEL_FROM[it.model.from] || it.model.from}` : ""],
            ["Base model", it.base_model], ["SD version", it.sd_version && it.sd_version !== "Unknown" ? it.sd_version : ""],
            ["Preview", it.preview === "gen" ? `its first gen, ${it.gen.file} (${new Date(it.gen.t * 1000).toLocaleDateString()}), shown until it has a preview of its own`
                : it.pw ? `${it.pw} × ${it.ph}${it.framing ? " · framed by hand" : ""}` : ""],
            ["Modified", it.mtime ? new Date(it.mtime * 1000).toLocaleString() : ""], ["Size", it.size ? (it.size / 1048576).toFixed(1) + " MB" : ""], ["Hash", it.hash],
        ].filter(([, v]) => v);
        panel.innerHTML = `
              <div class="ld-m-scroll">
                <div class="ld-m-tag"><code>&lt;lora:${esc(it.alias)}:${esc(fmtW(weightOf(it)))}&gt;</code>
                  <button type="button" class="ld-btn ld-pill ld-sm" data-do="copytag">${ic("copy")}<span>Copy</span></button>
                  <span class="ld-m-w" hidden><span>weight</span><button type="button" class="ld-btn ld-icon ld-sm" data-do="wminus" aria-label="Lower the weight">${ic("minus")}</button><b></b><button type="button" class="ld-btn ld-icon ld-sm" data-do="wplus" aria-label="Raise the weight">${ic("plus")}</button></span></div>
                ${ch ? `<section><h4>${ic("list")}Choose one <small>its activation text has ${ch.options.length} choices; a click puts this one in the prompt (or swaps it)</small></h4>
                  <div class="ld-m-choices">${ch.options.map((o, i) => `<button type="button" class="ld-ch-opt" data-i="${i}"><kbd>${i + 1}</kbd><span><b>${esc(o.split(",")[0])}</b><small>${esc(o.split(",").slice(1).join(",").trim())}</small></span><span class="ld-check">${ic("check")}</span></button>`).join("")}
                    <button type="button" class="ld-ch-opt ld-ch-none" data-i="-1"><kbd>0</kbd><span><b>None of these</b><small>${esc(ch.shared || "nothing else")}</small></span><span class="ld-check">${ic("check")}</span></button></div></section>` : ""}
                ${it.activation ? `<section><h4>${ic("lines")}Activation text <button type="button" class="ld-btn ld-link" data-do="copyact">Copy</button></h4><pre class="ld-pre">${esc(it.activation)}</pre></section>` : ""}
                ${it.negative ? `<section><h4>${ic("minus")}Negative text <small>goes in the negative prompt with it</small></h4><pre class="ld-pre">${esc(it.negative)}</pre></section>` : ""}
                ${it.notes ? `<section><h4>${ic("info")}Notes</h4><p class="ld-notes">${esc(it.notes)}</p></section>` : ""}
                ${(it.trained_words || []).length ? `<section><h4>${ic("star")}Trigger words <small>from Civitai; click to add</small></h4><div class="ld-chips">${chips(it.trained_words.map((t) => [t]), "")}</div></section>` : ""}
                ${(it.tags || []).length ? `<section><h4>${ic("code")}Trained on <small>how often each tag was in its captions; click to add</small></h4><div class="ld-chips">${chips(it.tags.slice(0, 40), "ld-soft")}</div></section>` : ""}
                ${it.description && !it.description.startsWith(it._title + " (") ? `<section><h4>${ic("info")}Description</h4><p class="ld-notes">${esc(it.description)}</p></section>` : ""}
                ${!it.activation && !(it.trained_words || []).length && !(it.tags || []).length ? `<p class="ld-hint">This LoRA has no suggested prompts (no activation text, trigger words or training tags). <b>Edit card</b> can give it activation text.</p>` : ""}
                <dl class="ld-facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
              </div>
              <div class="ld-m-foot">
                <div class="ld-m-tools" role="group" aria-label="This LoRA">
                  <button type="button" class="ld-btn ld-tool" data-do="frame" title="${framable(it) ? "Move and zoom the picture in its card, or pick another: one of its gens, or an upload" : "Pick one of its gens or upload a picture for its card"}">${ic("image")}<span>Edit preview</span></button>
                  <button type="button" class="ld-btn ld-tool" data-do="card" title="Description, activation and negative text, weight, notes">${ic("edit")}<span>Edit card</span></button>
                  <button type="button" class="ld-btn ld-tool" data-do="meta" title="What the .safetensors file says about its training">${ic("code")}<span>Metadata</span></button>
                  <button type="button" class="ld-btn ld-tool" data-do="explore" title="Show the file in ${REVEAL_IN}">${ic("folder")}<span>Show in ${REVEAL_IN}</span></button>
                </div>
                <button type="button" class="ld-btn ld-icon ld-favbig" data-do="fav" aria-label="Favourite">${ic("star")}</button>
                <button type="button" class="ld-btn ld-icon ld-favbig" data-do="copypath" title="Copy the path: ${esc(it.path)}" aria-label="Copy the path">${ic("copy")}</button>
                <span class="ld-grow"></span>
                <button type="button" class="ld-btn ld-pill ld-main" data-do="toggle"></button>
              </div>`;
        panel.querySelectorAll(".ld-m-scroll > *").forEach((s, i) => s.style.setProperty("--i", Math.min(i, 8)));
        setTimeout(() => {
            paintInfoState();
            paintInfoFav();
        });
        return panel;
    }

    function openInfo(tab, it, keep) {
        closeFloating();
        const back = keep && infoState ? infoState.back : document.activeElement;
        const prev = document.querySelector(".ld-modal-wrap");
        if (prev) prev.remove();
        const wrap = el("div", "ld-modal-wrap" + (prefs.blur ? " ld-blur" : ""));
        wrap.innerHTML = `
          <div class="ld-modal" role="dialog" aria-modal="true" aria-label="${esc(it._title)}" data-mode="info">
            <div class="ld-m-media"></div>
            <div class="ld-m-body">
              <div class="ld-m-head">
                <div class="ld-m-titles"><h3>${esc(it._title)}</h3><div class="ld-m-path">${it._tag ? `<span class="ld-badge">${esc(it._tag)}</span>` : ""}${esc(it.folder || "models/Lora")}</div></div>
                <div class="ld-m-mini"></div>
                <button type="button" class="ld-btn ld-icon ld-m-close" title="Close (Esc)" aria-label="Close">${ic("x")}</button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(wrap);
        const st = infoState = { tab, it, back, wrap, mode: "info", media: wrap.querySelector(".ld-m-media"), shape: prefs.shape, fr: null };
        document.addEventListener("keydown", infoKeys, true);
        renderMedia(st);
        wrap.querySelector(".ld-m-body").appendChild(buildInfoPanel(st));
        wireStage(st);
        applySize(st);
        wireResize(st);
        // the faint rest of the picture follows the card when the window (and so the stage) changes size
        if (window.ResizeObserver) new ResizeObserver(() => { if (st.mode === "frame") paintStage(st); }).observe(st.media);
        wrap.addEventListener("click", (e) => onInfoClick(st, e));
        requestAnimationFrame(() => wrap.classList.add("show"));
        wrap.querySelector(".ld-m-close").focus();
    }
    function onInfoClick(st, e) {
        const b = e.target.closest("[data-do], .ld-ch-opt, [data-words], .ld-m-close, [data-shape], [data-pick]");
        if (!b || b.disabled) return;
        const { tab, wrap } = st;
        const it = st.it;
        const ch = it._choices;
        if (b.classList.contains("ld-m-close")) return st.mode === "info" ? closeInfo() : setMode("info");
        if (b.dataset.shape) {
            st.shape = b.dataset.shape;
            renderMedia(st);
            return;
        }
        if (b.dataset.pick) {
            const k = b.dataset.pick;
            const g = k.startsWith("g:") && st.gens ? st.gens.items.find((x) => "g:" + x.id === k) : null;
            if (k === "now") pickPicture(st, null);
            else if (k === "up" && st.upload) pickPicture(st, st.upload);
            else if (g) pickPicture(st, { kind: "gen", id: g.id, it: { ...it, preview: "gen", gen: g, pw: g.w, ph: g.h, framing: null, _src: "" } });
            return;
        }
        if (b.classList.contains("ld-ch-opt")) {
            useChoice(tab, it, Number(b.dataset.i));
            return toast(Number(b.dataset.i) >= 0 ? `${it._title}: ${ch.options[Number(b.dataset.i)].split(",")[0]}` : `${it._title}: none of its choices`);
        }
        if (b.dataset.words) return addWords(tab, b.dataset.words);
        const what = b.dataset.do;
        const now = () => Number(decks[tab].on.get(it.name)) || weightOf(it);
        if (what === "reveal") wrap.classList.remove("ld-blur");
        else if (what === "back") setMode("info");
        else if (what === "frame" || what === "card" || what === "meta") setMode(what);
        else if (what === "copytag") copyText(`<lora:${it.alias}:${fmtW(decks[tab].on.has(it.name) ? now() : weightOf(it))}>`, "the tag");
        else if (what === "copyact") copyText(it.activation, "the activation text");
        else if (what === "copypath") copyText(it.path, "the path");
        else if (what === "copymeta") copyText(JSON.stringify(st.meta || {}, null, 2), "the metadata");
        else if (what === "rnd") {
            const box = wrap.querySelector(".ld-ce-random textarea");
            box.value = randomPrompt(trainedTags(st));
            roll(box, true);
        } else if (what === "rndcopy") copyText(wrap.querySelector(".ld-ce-random textarea").value, "the random prompt");
        else if (what === "rndadd") {
            const text = wrap.querySelector(".ld-ce-random textarea").value.trim();
            if (text) {
                addWords(tab, text);
                toast("Random prompt added");
            }
        }
        else if (what === "fav") toggleFav(it);
        else if (what === "explore") api("reveal", { name: it.name }).then(() => toast(`Shown in ${REVEAL_IN}`), (err) => toast(`Couldn't open it: ${err.message}`));
        else if (what === "wminus" || what === "wplus") setWeight(tab, it, now() + (what === "wplus" ? 0.05 : -0.05) * (e.shiftKey ? 4 : 1));
        else if (what === "zin" || what === "zout") zoomAt(st, st.fr.z * (what === "zin" ? 1.15 : 1 / 1.15), 50, 50);
        else if (what === "fill") {
            st.fr = clampFraming(fit(st), { x: st.fr.x, y: st.fr.y, z: 1 });
            paintStage(st);
        } else if (what === "whole") {
            st.fr = clampFraming(fit(st), { x: 0.5, y: 0.5, z: wholeZoom(fit(st)) });
            paintStage(st);
        } else if (what === "reset") {
            st.fr = clampFraming(fit(st), { ...framingOf({ ...fit(st), framing: null }) });
            st.fr.auto = true;
            paintStage(st);
        } else if (what === "upload") wrap.querySelector(".ld-file").click();
        else if (what === "moregens") loadGens(st, st.gens ? st.gens.items.length : 0);
        else if (what === "gallery") {
            const src = galleryPic(tab);
            if (src) pickFromUrl(st, src, "Gallery");
        }
        else if (what === "saveframe") {
            // a picture picked here (or the first gen it shows) becomes its preview, with this framing; else just the framing
            const fr = st.fr.auto ? null : { x: st.fr.x, y: st.fr.y, z: st.fr.z };
            const pick = st.pick || (it.preview === "gen" ? { kind: "gen", id: it.gen.id } : null);
            const hadOne = !!it.preview && it.preview !== "gen";
            b.disabled = true;
            const body = !pick ? Promise.resolve(null) : pick.kind === "data"
                ? readData(pick.file).then((d) => ({ name: it.name, data: d, framing: fr })) : Promise.resolve({ name: it.name, gen: pick.id, framing: fr });
            body.then((nb) => {
                if (nb) toast("Saving the new preview…");
                return nb ? api("preview", nb) : api("framing", { name: it.name, framing: fr });
            }).then((saved) => {
                takeItem(saved);
                toast(pick ? `New preview saved${hadOne ? " (the old one is in LoRA Deck's backups)" : ""}` : fr ? "Preview framing saved" : "Back to the automatic framing");
                setMode("info");
            }, (err) => {
                b.disabled = false;
                toast(`Couldn't save it: ${err.message}`);
            });
        } else if (what === "savecard") {
            const form = wrap.querySelector('[data-panel="card"] form');
            const card = {};
            for (const f of form.elements) if (f.name) card[f.name] = f.name === "preferred weight" ? Number(f.value || 0) : f.value;
            b.disabled = true;
            api("card", { name: it.name, card }).then((saved) => {
                takeItem(saved);
                toast("Card saved");
                setMode("info");
            }, (err) => {
                b.disabled = false;
                toast(`Couldn't save the card: ${err.message}`);
            });
        } else if (what === "toggle") {
            if (decks[tab].on.has(it.name)) {
                removeLora(tab, it);
                toast(`Took out ${it._title}`);
            } else if (ch) {
                useChoice(tab, it, 0);
                toast(`Added ${it._title}: ${ch.options[0].split(",")[0]} (pick another above)`);
            } else {
                addLora(tab, it, it.activation.trim());
                toast(`Added ${it._title}`);
            }
            pop(b);
        }
    }
    function paintInfoState() {
        const st = infoState;
        if (!st) return;
        const { tab, it, wrap } = st;
        const d = decks[tab];
        const on = d.on.has(it.name);
        const main = wrap.querySelector('[data-panel="info"] [data-do="toggle"]');
        if (!main) return;
        main.innerHTML = on ? `${ic("x")}<span>Take out</span>` : `${ic("plus")}<span>Add to prompt</span>`;
        main.classList.toggle("ld-primary", !on);
        main.classList.toggle("ld-danger", on);
        const w = wrap.querySelector(".ld-m-w");
        if (w) {
            w.hidden = !on;
            if (on) w.querySelector("b").textContent = d.on.get(it.name);
        }
        const box = promptBox(tab);
        const cur = on && box ? activeChoice(box.value, it) : null;
        wrap.querySelectorAll(".ld-m-choices .ld-ch-opt").forEach((b) => b.classList.toggle("on", cur != null && Number(b.dataset.i) === cur));
    }
    function paintInfoFav() {
        const b = document.querySelector('.ld-modal-wrap [data-panel="info"] [data-do="fav"]');
        if (!b || !infoState) return;
        const on = favs.has(infoState.it.name);
        b.classList.toggle("on", on);
        b.title = on ? "Favourite (click to remove)" : "Add to favourites";
    }

    // --- start --------------------------------------------------------------------------------------------------
    function tick() {
        everyDeck((d) => {
            if (!d.root || d.root.hidden || !d.root.offsetParent) return;
            const box = promptBox(d.tab);
            const p = box ? box.value : "";
            if (p !== d.lastPrompt && data.ready) {
                readPrompt(d);
                if (d.mode === "on") renderAll(d);
                else paintOn(d);
                if (infoState && infoState.tab === d.tab) paintInfoState();
            }
            const preset = currentPreset();
            if (preset !== d.lastPreset) {
                const first = d.lastPreset == null;
                d.lastPreset = preset;
                if (!first && data.ready) {
                    if (data.meta.preset_filter) buildTree();
                    d.path = startPath(d);
                    renderAll(d);
                }
            }
        });
    }
    function hookWebUI() {
        // The WebUI's card editor ends with extraNetworksRefreshSingleCard(page, tabname, name): read that card again too
        const orig = window.extraNetworksRefreshSingleCard;
        if (typeof orig !== "function" || orig.__loraDeck) return;
        const wrapped = function (page, tabname, name) {
            try {
                orig.apply(this, arguments);
            } catch (e) { /* the WebUI's own card may be missing; the deck's is what shows */ }
            if (page === "lora") refreshItem(name);
        };
        wrapped.__loraDeck = true;
        window.extraNetworksRefreshSingleCard = wrapped;
    }
    document.addEventListener("keydown", (e) => {
        if (e.key !== "/" || e.ctrlKey || e.altKey || e.metaKey || /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable) return;
        const d = Object.values(decks).find((x) => x.root && !x.root.hidden && x.root.offsetParent);
        if (!d) return;
        e.preventDefault();
        d.search.focus();
        d.search.select();
    });
    window.addEventListener("resize", closeFloating);
    document.addEventListener("scroll", (e) => {
        if (!(e.target instanceof Element && e.target.closest && e.target.closest(".ld-floating"))) closeFloating();
    }, true);

    function start() {
        let tries = 0;
        const timer = setInterval(() => {
            tries++;
            const done = TABS.map(mount).every(Boolean);
            if (done || tries > 600) {
                clearInterval(timer);
                hookWebUI();
                setInterval(tick, 350);
            }
        }, 250);
    }
    if (typeof onUiLoaded === "function") onUiLoaded(start);
    else document.addEventListener("DOMContentLoaded", start);
})();
