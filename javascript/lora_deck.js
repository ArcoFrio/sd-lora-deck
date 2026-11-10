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
        if (!motionOn() || !d.grid.offsetParent) return null;
        const g = d.grid.getBoundingClientRect();
        const map = new Map();
        for (const c of d.grid.children) {
            if (!c.dataset.name) continue;
            const r = c.getBoundingClientRect();
            if (inView(r, g, 80)) map.set(c.dataset.name, r);
        }
        return map;
    }
    function play(d, before) {
        if (!before) return;
        const g = d.grid.getBoundingClientRect();
        let k = 0;
        for (const c of d.grid.children) {
            if (!c.dataset.name) continue;
            c.getAnimations().forEach((a) => { if (a.id === "ld-move") a.cancel(); });
            const r = c.getBoundingClientRect();
            if (!inView(r, g, 0)) continue;
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
        for (const i of order) if (hasText(prompt, ch.compose(i))) return i;
        const none = ch.compose(-1);
        return none && hasText(prompt, none) ? -1 : null;
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
    // Organize tags: one line per kind of tag: 1 LoRAs, 2 activation, 3 participants, 4 appearance, 5 body,
    // 6 outfit, 7 pose and expression, 8 background, 9 camera; every line ends with a comma. An activation text written
    // one kind per line in that order from line 2 (trigger, 1girl, looks, body, outfit) has each of its lines go to its
    // own line; a one-line activation text goes to line 2. Tags go at the end of their line, lines that don't exist yet are added empty, and a tag already on its line
    // isn't added twice (two characters both bring "1girl").
    const LINE_LORA = 0, LINE_ACT = 1, LINE_LOOKS = 3;
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
    // Is this activation text in the prompt line by line (each of its lines' tags on its own line)?
    function onLines(prompt, text) {
        const pl = prompt.split("\n");
        const segs = String(text || "").trim().split("\n");
        return segs.some((seg) => tagsOf(seg).length) && segs.every((seg, k) => {
            const want = tagsOf(seg);
            if (!want.length) return true;
            const have = new Set(tagsOf(pl[LINE_ACT + k]).map(normTag));
            return want.every((tg) => have.has(normTag(tg)));
        });
    }
    // ...or as one piece (added at the end)?
    function hasText(prompt, text) {
        text = String(text || "").trim();
        return !!text && (prompt.includes(text.replace(/,$/, "")) || onLines(prompt, text));
    }
    // The tags the other LoRAs in the prompt brought to each line (the choice of theirs that is there): taking one
    // LoRA out leaves those ("1girl").
    function keptTags(prompt, except) {
        const sets = [];
        inPrompt(prompt).on.forEach((_, name) => {
            const o = data.by.get(name);
            if (!o || o.name === except.name || !o.activation) return;
            const v = variants(o).find((x) => hasText(prompt, x));
            if (!v) return;
            v.split("\n").forEach((seg, k) => {
                const s = sets[LINE_ACT + k] || (sets[LINE_ACT + k] = new Set());
                tagsOf(seg).forEach((tg) => s.add(normTag(tg)));
            });
        });
        return sets;
    }
    // Takes one activation text out: tag by tag from its lines when it sits on them (the lines stay, even if empty),
    // else as one piece.
    function cutText(prompt, text, it) {
        text = String(text || "").trim();
        if (onLines(prompt, text)) {
            const lines = prompt.split("\n");
            const keep = keptTags(prompt, it);
            text.split("\n").forEach((seg, k) => lineRemove(lines, LINE_ACT + k, tagsOf(seg), keep[LINE_ACT + k]));
            return joinLines(lines);
        }
        for (const v of [text, text.replace(/,$/, "")]) {
            const r = cutOnce(prompt, v);
            if (v && r != null) return r;
        }
        return prompt;
    }
    function putText(prompt, text) {
        const lines = prompt.split("\n");
        String(text || "").trim().split("\n").forEach((seg, k) => lineAdd(lines, LINE_ACT + k, tagsOf(seg)));
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
            if (actText) p = putText(p, actText);
        } else {
            p = append(p, actText ? `${tag} ${actText}` : tag);
        }
        write(box, p);
        const neg = (it.negative || "").trim();
        if (neg) {
            const nb = promptBox(tab, true);
            if (nb && !hasText(nb.value, neg)) {
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
        const v = variants(it).find((x) => hasText(p, x));
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
        if (neg && nb && hasText(nb.value, neg)) {
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
        const v = variants(it).find((x) => hasText(p, x));
        if (v && p.includes(v) && !onLines(p, v)) p = p.replace(v, next);  // added as one piece: swap it in place
        else {
            if (v) p = cutText(p, v, it);
            p = prefs.lines ? putText(p, next) : p.replace(m[0], `${m[0]} ${next}`);
        }
        write(box, p);
        refreshAll();
    }
    // With Organize tags, a trigger word goes on the activation line and a training tag on the appearance line
    // (otherwise at the end of the prompt).
    function addWords(tab, words, line) {
        const box = promptBox(tab);
        if (!box) return;
        const w = words.trim().replace(/,$/, "");
        if (tagsOf(box.value.replace(/\n/g, ",")).some((tg) => normTag(tg) === normTag(w))) return toast("Already in the prompt");
        if (prefs.lines) {
            const lines = box.value.split("\n");
            lineAdd(lines, Number.isFinite(line) ? line : LINE_ACT, [w]);
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
        return it;
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
    function hiddenByPreset(it) {
        if (!data.meta.preset_filter) return false;
        const v = compact(it.sd_version);
        return !!v && v !== "unknown" && v !== compact(currentPreset());
    }
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
    const thumbUrl = (it, w) => `${API}/thumb?name=${encodeURIComponent(it.name)}&w=${w}&v=${it.pv || it.mtime}`;

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
                }
                placeIndicator(d);
            }).observe(d.root);
        }
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
                const first = d.grid.querySelector(".ld-card");
                if (first) first.focus();
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
    function paintToolbar(d) {
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
    // in), each tucked into the tips of the row above, so both edges stay straight. CSS grid can't make rows of two
    // lengths, so every card is placed here (again on every resize).
    const HEX_TIP = 0.27;  // the height of a hexagon's top (and bottom) point, as a share of its width
    const GAP = 12;
    function layout(d) {
        const cards = [...d.grid.children].filter((c) => c.classList.contains("ld-card"));
        if (prefs.shape !== "hex") {
            d.grid.style.removeProperty("--ld-cols");
            cards.forEach((c) => {
                for (const k of ["translate", "margin-top", "grid-row", "grid-column"]) c.style.removeProperty(k);
            });
            return;
        }
        const w = prefs.size;
        const room = d.grid.clientWidth - 16;
        const cols = Math.max(1, Math.floor((room + GAP) / (w + GAP)));
        d.grid.style.setProperty("--ld-cols", cols);
        const tuck = -(w * HEX_TIP - GAP * 0.55);
        const short = cols > 1 ? cols - 1 : 1;
        let row = 0, col = 0;
        cards.forEach((c) => {
            const len = row % 2 ? short : cols;
            if (col >= len) {
                row++;
                col = 0;
            }
            const half = row % 2 && cols > 1;
            c.style.gridRow = String(row + 1);
            c.style.gridColumn = String(col + 1);
            c.style.translate = half ? `${(w + GAP) / 2}px 0` : "";
            c.style.marginTop = row ? `${tuck}px` : "";
            col++;
        });
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
            else if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) {
                e.preventDefault();
                moveFocus(d, card, e.key);
            }
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
        const cards = [...d.grid.querySelectorAll(".ld-card")];
        const i = cards.indexOf(card);
        const cols = Math.max(1, Math.round(d.grid.clientWidth / (card.offsetWidth + 12)));
        const j = clamp(i + ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols })[key], 0, cards.length - 1);
        cards[j].focus();
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
        const base = data.items.filter((it) => !hiddenByPreset(it)
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
        const w = thumbWidth();
        const before = snapshot(d);
        d.grid.replaceChildren(...shown.map((it) => cardFor(d, it, w)));
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
        d.modes.innerHTML = mode("on", "checkCircle", "In prompt", d.on.size) + mode("fav", "star", "Favourites", count((it) => favs.has(it.name)))
            + mode("recent", "clock", "Recent", count((it) => recentSet.has(it.name)));
        d.modes.onclick = (e) => {
            const b = e.target.closest(".ld-mode");
            if (!b) return;
            d.mode = d.mode === b.dataset.m ? "all" : b.dataset.m;
            renderAll(d);
        };
    }
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
            : it.preview ? `<img class="ld-pic" src="${thumbUrl(it, w)}" alt="" loading="lazy" decoding="async" draggable="false">`
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
              ${sub ? `<div class="ld-subt">${esc(sub)}</div>` : ""}
            </div>
            <div class="ld-weight">
              <button type="button" class="ld-btn ld-mini" data-act="minus" title="Weight −0.05 (Shift: −0.2)" aria-label="Lower the weight">${ic("minus")}</button>
              <span class="ld-w"></span>
              <button type="button" class="ld-btn ld-mini" data-act="plus" title="Weight +0.05 (Shift: +0.2)" aria-label="Raise the weight">${ic("plus")}</button>
              <button type="button" class="ld-btn ld-mini ld-rm" data-act="remove" title="Take it out of the prompt (Delete)" aria-label="Take it out of the prompt">${ic("x")}</button>
            </div>
          </div>
          <div class="ld-act" title="${esc(it.activation)}">${it.activation ? esc(it.activation.replace(/\s*\n\s*/g, " ").replace(/\s*\|\|\s*/g, "  |  ")) : '<i>no activation text</i>'}</div>`;
        c.title = `${it.file}${it.folder ? `\n${it.folder}` : ""}\n${it._choices ? "Click to pick one of its choices" : "Click to add it to the prompt"}`;
        c.classList.toggle("fav", favs.has(it.name));
        const pic = c.querySelector("img.ld-pic");
        if (pic) {
            pic.addEventListener("load", () => c.classList.add("loaded"), { once: true });
            pic.addEventListener("error", () => c.classList.add("loaded", "broken"), { once: true });
        } else c.classList.add("loaded");
        d.cards.set(it.name, c);
        return c;
    }
    function updateThumb(c, it, w) {
        const pic = c.querySelector(".ld-pic");
        c.dataset.w = String(w);
        if (pic && pic.tagName === "IMG") pic.src = thumbUrl(it, w);
    }
    function updateThumbs(d) {
        const w = thumbWidth();
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
    function paintOn(d) {
        const prev = d.prevW || new Map();
        d.cards.forEach((c, name) => {
            const w = d.on.get(name);
            const on = w != null;
            c.classList.toggle("on", on);
            c.setAttribute("aria-current", on ? "true" : "false");
            if (on) {
                c.querySelectorAll(".ld-w").forEach((s) => {
                    if (s.textContent === w) return;
                    s.textContent = w;
                    if (prev.has(name) && prev.get(name) !== w) roll(s, Number(w) > Number(prev.get(name)));
                });
            }
        });
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
        node.style.top = top + "px";
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

    // --- details --------------------------------------------------------------------------------------------------
    let infoState = null;
    function forgeEvent(name) {
        // The WebUI's editor and metadata viewer read the card's name two levels above the clicked button
        const card = el("div");
        card.setAttribute("data-name", name);
        const row = el("div");
        const btn = el("span");
        row.appendChild(btn);
        card.appendChild(row);
        return { target: btn, stopPropagation() {}, preventDefault() {} };
    }
    function closeInfo() {
        const w = document.querySelector(".ld-modal-wrap");
        if (w) w.remove();
        document.removeEventListener("keydown", infoKeys, true);
        if (infoState && infoState.back) infoState.back.focus?.();
        infoState = null;
    }
    function infoKeys(e) {
        if (!infoState) return;
        if (e.key === "Escape") {
            e.stopPropagation();
            closeInfo();
        } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !/input|textarea/i.test(e.target.tagName)) {
            const d = decks[infoState.tab];
            const list = [...d.grid.querySelectorAll(".ld-card[data-name]")].map((c) => c.dataset.name);
            const i = list.indexOf(infoState.it.name);
            const next = list[i + (e.key === "ArrowRight" ? 1 : -1)];
            if (next) openInfo(infoState.tab, data.by.get(next), true);
        }
    }
    function openInfo(tab, it, keep) {
        closeFloating();
        const back = keep && infoState ? infoState.back : document.activeElement;
        const prev = document.querySelector(".ld-modal-wrap");
        if (prev) prev.remove();
        infoState = { tab, it, back };
        document.addEventListener("keydown", infoKeys, true);
        const ch = it._choices;
        const big = WIDTHS.find((w) => w >= 520 * (window.devicePixelRatio || 1)) || 960;
        const media = isVideo(it)
            ? `<video src="${thumbUrl(it, big)}" muted loop playsinline autoplay></video>`
            : it.preview ? `<img src="${thumbUrl(it, big)}" alt="">` : `<div class="ld-nopic"><span>${esc(it._title.slice(0, 2))}</span></div>`;
        const chips = (list, cls, line) => list.map(([t, n]) => `<button type="button" class="ld-chip ${cls || ""}" data-words="${esc(t)}" data-line="${line}" title="Add “${esc(t)}” to the prompt${prefs.lines ? ` (line ${line + 1})` : ""}">${esc(t)}${n ? `<small>${n}</small>` : ""}</button>`).join("");
        const facts = [
            ["File", it.file], ["Folder", it.folder || "models/Lora"], ["Base model", it.base_model], ["SD version", it.sd_version && it.sd_version !== "Unknown" ? it.sd_version : ""],
            ["Modified", it.mtime ? new Date(it.mtime * 1000).toLocaleString() : ""], ["Size", it.size ? (it.size / 1048576).toFixed(1) + " MB" : ""], ["Hash", it.hash],
        ].filter(([, v]) => v);
        const wrap = el("div", "ld-modal-wrap" + (prefs.blur ? " ld-blur" : ""));
        wrap.innerHTML = `
          <div class="ld-modal" role="dialog" aria-modal="true" aria-label="${esc(it._title)}">
            <div class="ld-m-media">${media}<button type="button" class="ld-btn ld-reveal" title="Show this preview">${ic("eye")}<span>Show</span></button></div>
            <div class="ld-m-body">
              <div class="ld-m-head">
                <div><h3>${esc(it._title)}</h3><div class="ld-m-path">${it._tag ? `<span class="ld-badge">${esc(it._tag)}</span>` : ""}${esc(it.folder || "models/Lora")}</div></div>
                <button type="button" class="ld-btn ld-icon ld-m-close" title="Close (Esc)" aria-label="Close">${ic("x")}</button>
              </div>
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
                ${(it.trained_words || []).length ? `<section><h4>${ic("star")}Trigger words <small>from Civitai; click to add</small></h4><div class="ld-chips">${chips(it.trained_words.map((t) => [t]), "", LINE_ACT)}</div></section>` : ""}
                ${(it.tags || []).length ? `<section><h4>${ic("code")}Trained on <small>how often each tag was in its captions; click to add</small></h4><div class="ld-chips">${chips(it.tags.slice(0, 40), "ld-soft", LINE_LOOKS)}</div></section>` : ""}
                ${it.description && !it.description.startsWith(it._title + " (") ? `<section><h4>${ic("info")}Description</h4><p class="ld-notes">${esc(it.description)}</p></section>` : ""}
                ${!it.activation && !(it.trained_words || []).length && !(it.tags || []).length ? `<p class="ld-hint">This LoRA has no suggested prompts (no activation text, trigger words or training tags). <b>Edit card</b> can give it activation text.</p>` : ""}
                <dl class="ld-facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
              </div>
              <div class="ld-m-foot">
                <button type="button" class="ld-btn ld-icon ld-favbig" data-do="fav" aria-label="Favourite">${ic("star")}</button>
                <button type="button" class="ld-btn ld-pill" data-do="edit" title="The WebUI's card editor: description, activation and negative text, weight, notes">${ic("edit")}<span>Edit card</span></button>
                <button type="button" class="ld-btn ld-pill" data-do="meta" title="What the .safetensors file says about its training">${ic("code")}<span>Metadata</span></button>
                <button type="button" class="ld-btn ld-pill" data-do="copypath" title="${esc(it.path)}">${ic("copy")}<span>Path</span></button>
                <span class="ld-grow"></span>
                <button type="button" class="ld-btn ld-pill ld-main" data-do="toggle"></button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(wrap);
        wrap.querySelectorAll(".ld-m-scroll > *").forEach((s, i) => s.style.setProperty("--i", Math.min(i, 8)));
        wrap.addEventListener("pointerdown", (e) => {
            if (e.target === wrap) closeInfo();
        });
        wrap.addEventListener("click", (e) => {
            const b = e.target.closest("[data-do], .ld-ch-opt, [data-words], .ld-m-close, .ld-reveal");
            if (!b) return;
            if (b.classList.contains("ld-m-close")) return closeInfo();
            if (b.classList.contains("ld-reveal")) return wrap.classList.remove("ld-blur");
            if (b.classList.contains("ld-ch-opt")) {
                useChoice(tab, it, Number(b.dataset.i));
                return toast(Number(b.dataset.i) >= 0 ? `${it._title}: ${ch.options[Number(b.dataset.i)].split(",")[0]}` : `${it._title}: none of its choices`);
            }
            if (b.dataset.words) return addWords(tab, b.dataset.words, Number(b.dataset.line));
            const what = b.dataset.do;
            const now = () => Number(decks[tab].on.get(it.name)) || weightOf(it);
            if (what === "copytag") copyText(`<lora:${it.alias}:${fmtW(decks[tab].on.has(it.name) ? now() : weightOf(it))}>`, "the tag");
            else if (what === "copyact") copyText(it.activation, "the activation text");
            else if (what === "copypath") copyText(it.path, "the path");
            else if (what === "fav") toggleFav(it);
            else if (what === "wminus" || what === "wplus") setWeight(tab, it, now() + (what === "wplus" ? 0.05 : -0.05) * (e.shiftKey ? 4 : 1));
            else if (what === "edit") {
                closeInfo();
                if (typeof extraNetworksEditUserMetadata === "function") extraNetworksEditUserMetadata(forgeEvent(it.name), tab, "lora");
            } else if (what === "meta") {
                if (typeof extraNetworksRequestMetadata === "function") extraNetworksRequestMetadata(forgeEvent(it.name), "lora");
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
        });
        paintInfoState();
        paintInfoFav();
        requestAnimationFrame(() => wrap.classList.add("show"));
        wrap.querySelector(".ld-m-close").focus();
    }
    function paintInfoState() {
        const wrap = document.querySelector(".ld-modal-wrap");
        if (!wrap || !infoState) return;
        const { tab, it } = infoState;
        const d = decks[tab];
        const on = d.on.has(it.name);
        const main = wrap.querySelector('[data-do="toggle"]');
        main.innerHTML = on ? `${ic("x")}<span>Take out</span>` : `${ic("plus")}<span>Add to prompt</span>`;
        main.classList.toggle("ld-primary", !on);
        main.classList.toggle("ld-danger", on);
        const w = wrap.querySelector(".ld-m-w");
        w.hidden = !on;
        if (on) w.querySelector("b").textContent = d.on.get(it.name);
        const box = promptBox(tab);
        const cur = on && box ? activeChoice(box.value, it) : null;
        wrap.querySelectorAll(".ld-m-choices .ld-ch-opt").forEach((b) => b.classList.toggle("on", cur != null && Number(b.dataset.i) === cur));
    }
    function paintInfoFav() {
        const b = document.querySelector('.ld-modal-wrap [data-do="fav"]');
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
