// Builds data/tagmap.json, what Organize tags knows beyond its rules, from the Danbooru Tag Taxonomy
// (Mexes, https://huggingface.co/datasets/Mexes/danbooru-tag-taxonomy, CC BY 4.0):
//   - "lines": Danbooru tags the rules can't place (or clearly misplace), with the line their slot belongs on;
//   - "heads": last words that pick one line in at least 85% of the sorted tags ending in them (3 tags or more),
//     used for tags nobody has sorted ("...punch", "...cupcake").
// The rules keep every tag they already place on an expected line, so deliberate choices stay (gaze on the pose line,
// "full body" on the camera line).
//
//   node tools/build_tagmap.js <tags.csv from the taxonomy> [--check]
// --check also measures it: on the sorted tags, and on held-out tags (5 folds) for how the head words do on new ones.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
global.window = {};
new Function(fs.readFileSync(path.join(ROOT, "javascript", "lora_deck_tags.js"), "utf8"))();
const T = window.LoraDeckTags;
const rules = T.rulesOf;  // the rules alone, without a table loaded
const L = T.LINES;

// a taxonomy slot -> Organize tags' line
const FACE = /\b(?:eyebrows?|eyelashes|eyelids?|teeth|tooth|fangs?|tongue|lips?|mouth|nose|ears?|cheeks?|forehead|chin|freckles|face|facial|eyes?|pupils?|horns?|halo)\b/;
const GAZE = /\b(?:looking|facing|eye contact|glance|staring|gaze|peeking|peek)\b/;
function lineFor(slot, tag) {
    const [cat, sub] = slot.split(":");
    if (cat === "appearance") return sub === "hair" || sub === "eyes" ? L.looks : sub === "demographics" ? L.who : FACE.test(tag) ? L.looks : L.body;
    if (cat === "clothing") return sub === "headwear" || sub === "eyewear" || (sub === "accents" && /\bhair\b/.test(tag)) ? L.looks : L.outfit;
    if (cat === "equipment" || cat === "creature") return L.pose;
    if (cat === "pose") return sub === "camera" && !GAZE.test(tag) ? L.camera : L.pose;
    if (cat === "scenery") return L.bg;
    if (cat === "other") return sub === "layout" ? L.camera : sub === "style" || sub === "meta" ? L.act : -1;
    return -1;
}
// where the rules' other answer is a deliberate choice, not a miss, they keep it
const ACCEPT = {
    "appearance:anatomy": [L.body, L.looks], "appearance:demographics": [L.who, L.looks, L.body], "clothing:accents": [L.outfit, L.looks],
    "clothing:headwear": [L.looks, L.outfit], "clothing:eyewear": [L.looks, L.outfit], "pose:camera": [L.camera, L.pose],
    "pose:physiological": [L.pose, L.body], "scenery:props": [L.bg, L.pose], "creature:animal": [L.pose, L.bg, L.who],
    "other:style": [L.act, L.camera], "other:layout": [L.camera, L.act],
};
// slots whose meaning matches our lines closely enough that a confident taxonomy answer beats the rules
const TRUST = new Set(["equipment:weapon", "equipment:handheld", "pose:combat", "pose:kinetic", "pose:posture", "pose:gesture",
    "pose:expression", "pose:interaction", "scenery:setting", "scenery:atmosphere", "clothing:top", "clothing:bottom",
    "clothing:underwear", "clothing:legwear", "clothing:footwear", "clothing:outfit", "appearance:hair", "appearance:eyes"]);

const rows = [];
for (const line of fs.readFileSync(process.argv[2], "utf8").split("\n").slice(1)) {
    if (!line) continue;
    const f = line.split(",");
    const [tag, dcat, , , slot, conf, status, posts] = f;
    if (dcat !== "general" || status !== "approved") continue;
    const t = T.clean(tag);
    const want = lineFor(slot, t);
    if (want < 0) continue;
    rows.push({ t, slot, want, ok: ACCEPT[slot] || [want], conf: Number(conf), posts: Number(posts) || 0, rule: rules(t) });
}
const baseOf = (t) => t.replace(/\s*\([^)]*\)$/, "");

function build(sample) {
    const lines = {};
    const counts = new Map();
    for (const r of sample) {
        const misplaced = r.rule >= 0 && !r.ok.includes(r.rule);
        // keep the rules' structural lines (who, activation, camera): those are layout choices, not misses
        const override = misplaced && TRUST.has(r.slot) && r.conf >= 0.9 && ![L.who, L.act, L.camera].includes(r.rule);
        if (r.rule < 0 || override) (lines[r.want] = lines[r.want] || []).push(r.t);
        const words = baseOf(r.t).split(" ");
        if (words.length < 2) continue;
        const head = words[words.length - 1];
        const c = counts.get(head) || new Array(9).fill(0);
        c[r.want]++;
        counts.set(head, c);
    }
    const heads = {};
    for (const [head, c] of counts) {
        const n = c.reduce((a, b) => a + b, 0);
        const best = c.indexOf(Math.max(...c));
        if (n >= Number(process.env.HEAD_MIN || 3) && c[best] / n >= Number(process.env.HEAD_PURITY || 0.85) && /^[a-z][a-z-]*$/.test(head)) heads[head] = best;
    }
    return { lines, heads };
}

const out = build(rows);
const data = {
    source: "Danbooru Tag Taxonomy by Mexes, https://huggingface.co/datasets/Mexes/danbooru-tag-taxonomy (CC BY 4.0); mapped onto Organize tags' lines by tools/build_tagmap.js",
    lines: Object.fromEntries(Object.entries(out.lines).map(([k, v]) => [k, v.sort().join("|")])),
    heads: out.heads,
};
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
const file = path.join(ROOT, "data", "tagmap.json");
fs.writeFileSync(file, JSON.stringify(data));
const n = Object.values(out.lines).reduce((a, v) => a + v.length, 0);
console.log(`data/tagmap.json: ${n} tags, ${Object.keys(out.heads).length} head words, ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);

if (process.argv.includes("--check")) {
    const pct = (a, b) => (100 * a / b).toFixed(1);
    // the sorted tags, with the table and head words loaded
    T.useMap(data);
    let ok = 0, unk = 0, w = 0, wok = 0, wunk = 0;
    for (const r of rows) {
        const got = T.lineOf(r.t);
        w += r.posts;
        if (r.ok.includes(got)) { ok++; wok += r.posts; } else if (got < 0) { unk++; wunk += r.posts; }
    }
    console.log(`sorted tags (${rows.length}): ${pct(ok, rows.length)}% on an expected line, ${pct(unk, rows.length)}% unplaced; by uses ${pct(wok, w)}% right, ${pct(wunk, w)}% unplaced`);
    // new tags: 5 folds; head words learned without the fold, tried on the fold's tags the rules can't place
    let tried = 0, placed = 0, right = 0;
    for (let k = 0; k < 5; k++) {
        const fold = (r) => [...r.t].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 5 === k;
        const learned = build(rows.filter((r) => !fold(r)));
        T.useMap({ lines: {}, heads: learned.heads });
        for (const r of rows.filter(fold)) {
            if (r.rule >= 0) continue;
            tried++;
            const got = T.lineOf(r.t);
            if (got >= 0) placed++;
            if (r.ok.includes(got)) right++;
        }
    }
    console.log(`new tags the rules can't place (held out, ${tried}): head words place ${pct(placed, tried)}%, right on ${pct(right, placed)}% of those`);
}
