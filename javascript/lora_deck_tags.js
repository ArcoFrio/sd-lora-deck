// LoRA Deck: which line of an organized prompt a booru tag belongs on, by what it means.
//   0 LoRAs, 1 activation (triggers, and style, quality and meta tags), 2 participants, 3 appearance (face and head,
//   and what is worn on the head), 4 body (and what the clothes show of it), 5 outfit, 6 pose, action, objects and
//   expression, 7 background, 8 camera.
// Returns -1 for a tag it can't place (a LoRA's own trigger word, a name...).
//
// Booru tags are built the same few ways, so a tag it has never seen can still be placed:
//   - a head word with words in front of it: "lavender hair", "striped thighhighs", "frilled apron". The head word (the
//     last one) says what it is (HEAD below), the words in front only how it looks;
//   - a verb and its object: "holding sword", "sitting on chair", "looking at viewer": the verb decides (pose);
//   - a body part and where it is: "arms up", "hand on own hip" (pose), "hair up" (appearance), "breasts out" (body).
// Tuned on Danbooru's most-used tags (tagcomplete's list) in several passes.
(function () {
    "use strict";
    const L = { lora: 0, act: 1, who: 2, looks: 3, body: 4, outfit: 5, pose: 6, bg: 7, camera: 8 };
    const set = (s) => new Set(s.trim().split(/\s*\|\s*/));

    // --- whole tags, checked first -----------------------------------------------------------------------------------
    const WHO = /^(?:\d+\+?|multiple|no|one|two|three|several)\s?(?:girls?|boys?|others?|humans|people|persons?|futas?|females?|males?)$|^(?:solo|solo focus|male focus|female focus|other focus|1other|hetero|yuri|yaoi|couple|group|crowd|everyone|harem|threesome|foursome|group sex|reverse harem|siblings|sisters|brothers|twins|brother and sister|mother and daughter|mother and son|father and daughter|age difference|size difference|height difference|interspecies|futa with female|futa with male|futa with futa|futanari|trap|otoko no ko|genderswap|genderswap \(.+\)|multiple persona|dual persona|clone|no humans|mini person|minigirl|giantess|giant|duo|trio|anthro|feral|humanoid|human|taur|intersex|gynomorph|andromorph|herm|femboy|ambiguous gender|male|female|young|mature anthro|female anthro|male anthro|anthro on anthro|human on anthro|anthro on feral|feral on feral|human on feral|human on human|big dom small sub|small dom big sub|crossgender|dominant|submissive|dominant female|dominant male|submissive female|submissive male|size play|macro|micro|duo focus)$|^[a-z]+\/[a-z]+(?:\/[a-z]+)?$/;
    const CAMERA = /^(?:from (?:above|below|behind|side|front|outside|inside)|close-up|extreme close-up|cowboy shot|upper body|lower body|full body|portrait|profile|half body|bust|pov(?:\s.*)?|first-person view|dutch angle|wide shot|very wide shot|straight-on|foreshortening|fisheye|perspective|vanishing point|depth of field|bokeh|blurry|blurry (?:foreground|background)|chromatic aberration|motion blur|lens flare|vignetting|film grain|split screen|multiple views|selfie|mirror selfie|viewfinder|panorama|atmospheric perspective|sideways|upside-down|rotated|tilted frame|out of frame|cropped|cropped (?:legs|torso|arms|arm|head|shoulders|body|feet)|aerial view|bird's-eye view|worm's-eye view|isometric|backlighting|rim lighting|dramatic lighting|cinematic lighting|silhouette|reflection|zoom layer|close-up|focus)$|.+ focus$|.+ out of frame$|^(?:viewed|seen) from .+|^(?:close-up|extreme close-up|wide shot|very wide shot|full shot|medium shot|long shot|cowboy shot|upper body shot)\b.+|^(?:shot|view) (?:of|from) .+/;
    // style, medium, quality, rating and the marks on a picture: the activation line, next to the triggers
    const STYLE = /^(?:masterpiece|best quality|high quality|good quality|normal quality|low quality|worst quality|amazing quality|very aesthetic|aesthetic|absurdres|highres|lowres|incredibly absurdres|score \d+(?: up)?|score_\d+(?:_up)?|safe|sensitive|nsfw|sfw|explicit|questionable|general|rating:.+|year \d+|newest|recent|mid|early|old|oldest|monochrome|greyscale|grayscale|sepia|limited palette|spot color|partially colored|flat color|anime coloring|cel shading|sketch|lineart|line art|no lineart|traditional media|watercolor|watercolor \(medium\)|oil painting|oil painting \(medium\)|painting \(medium\)|pencil|pixel art|3d|realistic|photorealistic|semi-realistic|chibi|chibi only|comic|4koma|2koma|manga|doujinshi|doujin cover|cover|cover page|magazine cover|album cover|official art|key visual|promotional art|game cg|tachi-e|character sheet|reference sheet|concept art|fan art|parody|meme|crossover|cosplay|official alternate costume|alternate costume|alternate hairstyle|alternate color|alternate form|alternate universe|aged up|aged down|bishoujo|bishounen|kemonomimi mode|personification|enmaided|virtual youtuber|signature|watermark|artist name|artist logo|character name|copyright name|copyright notice|dated|twitter username|pixiv username|patreon username|patreon logo|web address|logo|text|english text|japanese text|chinese text|korean text|translated|translation request|speech bubble|thought bubble|spoken .+|sound effects|onomatopoeia|page number|border|white border|black border|outside border|rounded corners|letterboxed|pillarboxed|framed|inset|censored|uncensored|mosaic censoring|bar censor|convenient censoring|novelty censor|heart censor|blank censor|light censor|steam censor|censored nipples|censored pussy|one-hour drawing challenge|sample watermark|jpeg artifacts|scan|scan artifacts|oekaki|tegaki|unfinished|simple shading|gradient|blue theme|red theme|pink theme|green theme|black theme|white theme|purple theme|yellow theme|orange theme|.+ theme|.+ \(style\)|.+ \(medium\)|.+ \(meme\))$/;
    const SEX = /^(?:sex|vaginal|anal|oral|fellatio|irrumatio|cunnilingus|paizuri|handjob|footjob|thigh sex|masturbation|female masturbation|male masturbation|fingering|groping|grinding|cowgirl position|reverse cowgirl position|missionary|doggystyle|sex from behind|mating press|spooning|69|deepthroat|cum|cum .+|.+ cum|ejaculation|orgasm|female orgasm|squirting|creampie|bukkake|facial|after sex|after vaginal|after anal|penetration|insertion|object insertion|tentacle sex|tentacles|bondage|bdsm|restrained|tied up|shibari|bound|bound .+|spanking|choking|rape|molestation|exhibitionism|public nudity|voyeurism|prostitution|gangbang|double penetration|imminent .+|implied .+|clothed sex|nude sex|pussy juice|saliva|saliva trail|drooling|sweat|sweating|sweatdrop|steam|heavy breathing|trembling|motion lines|speed lines|emphasis lines|notice lines|wet|dripping|splashing|pantyshot|upskirt|downblouse|nipple tweak|breast sucking|breast feeding|lactation|erection|bulge|condom|used condom|sex toy|vibrator|dildo|gag|ball gag|blindfold|leash|collar and leash|girl on top|boy on top)$/;
    const FACE = /^(?:smile|smiling|grin|smirk|smug|blush|light blush|nose blush|full-face blush|blush stickers|frown|pout|tears|crying|crying with eyes open|streaming tears|tearing up|teardrop|sad|happy|angry|annoyed|surprised|shocked|scared|afraid|shy|embarrassed|nervous|serious|confused|bored|sleepy|tired|drunk|excited|determined|disgust|disgusted|expressionless|evil smile|seductive smile|light smile|gentle smile|kind smile|sad smile|naughty face|ahegao|fucked silly|rolling eyes|wink|one eye closed|closed eyes|half-closed eyes|narrowed eyes|wide-eyed|empty eyes|crazy eyes|open mouth|closed mouth|parted lips|tongue|tongue out|licking lips|clenched teeth|upper teeth only|lower teeth only|gritted teeth|fang out|fangs out|mouth hold|raised eyebrow|raised eyebrows|furrowed brow|v-shaped eyebrows|laughing|giggling|screaming|shouting|yawning|sigh|gasp|panting|moaning|expression|facial expression|emotionless|anger vein|flying sweatdrops|nervous sweating|blank stare|thinking|sparkling eyes|tsurime|tareme|jitome|doyagao|kubrick stare|staring|breath|wavy mouth|@ @|\? ?|!+\?*|\.\.\.|blank eyes|crazy smile|happy tears|surprised|sideways glance|glance)$|^(?=[^a-z]*[^a-z0-9\s])\S{1,4}$|^[:;=][a-z0-9()<>|/\\]{1,2}$|^\S{1,2} \S{1,2}$|^[xo] [xo]$|^xd$|.+ face$|.+ smile$|.+ eyes closed$|.+ expression$/;
    const POSE_START = /^(?:holding|carrying|grabbing|hugging|pointing|reaching|waving|touching|adjusting|pulling|lifting|covering|playing|eating|drinking|licking|biting|kissing|sucking|riding|wielding|dual wielding|using|tying|untying|undressing|dressing|removing|putting on|taking off|showing|presenting|offering|feeding|petting|patting|headpat|hand on|hands on|hand in|hands in|hand between|hand under|hand over|hand to|hands to|arm around|arms around|arm on|arms on|arm under|arm behind|arms behind|leg on|leg up|legs up|leg lift|knee up|knees up|knees to|head on|head rest|chin rest|cheek rest|finger to|fingers to|finger on|index finger|leaning|looking|facing|staring|glaring|gazing|peeking|turning|walking|running|jumping|dancing|fighting|sleeping|lying|sitting|standing|kneeling|squatting|crouching|bending|bent|stretching|spreading|spread|crossing|crossed|clenching|raising|smoking|singing|reading|writing|bathing|showering|swimming|wading|flying|falling|floating|cooking|shopping|exercising|posing|smelling|tasting|shushing|beckoning|saluting|cheering|praying|cleaning|washing|tugging|squeezing|biting|licking|blowing|catching|throwing|kicking|punching|slapping|stepping|climbing|crawling|hiding|waiting|resting|relaxing|against (?:wall|tree|window|door|glass|railing|pillar)|on (?:front|stomach|side|one knee|knees|all fours|lap|bed|floor|couch|chair|ground|grass|table|desk|rock|stairs|ledge|bench)|in (?:water|bath|bed|pool|tub|container|box|basket)|partially submerged|submerged|upside-down|top-down bottom-up)\b/;
    const LIMB_ANY = /\b(?:arms?|hands?|legs?|knees?|feet|foot|fingers?|elbows?|wrists?)\b.*\b(?:raised|up|lifted|crossed|spread|bent|extended|outstretched|folded|tucked|apart|together|behind|over head|overhead|above head|in the air|stretched)$/;
    const FACE_VERB = /^(?:blushing|smiling|grinning|smirking|crying|sobbing|weeping|laughing|giggling|chuckling|pouting|frowning|scowling|sneering|winking|screaming|shouting|yelling|moaning|panting|drooling|sweating|trembling|shaking|shivering|sighing|yawning|gasping|gaping|beaming|glowering|squinting|wincing|grimacing)\b/;
    const LIMB_STATE = /^(?:outstretched|clenched|interlocked|spread|raised|crossed|folded|joined|open|cupped|spread out|reaching) (?:arms?|hands?|fingers?|legs?|palms?|wings)$|^(?:eye contact|v arms|heart hands|finger heart|lap pillow|tail wagging|between legs|hands together|arms at sides|arm at side|own hands together|own hands clasped|double v|v|w|salute|seiza|wariza|yokozuwari|contrapposto|tiptoes|pigeon-toed|princess carry|hug from behind|back-to-back|face-to-face|side-by-side|heads together|reclining|aiming|firing|talking|blinking|wince|light frown|taking picture|broom riding)$/;
    const LIMB_POSE = /^(?:arms?|hands?|fingers?|legs?|knees?|feet|foot|elbows?|wrists?|thumbs?|head|chin|tail)\s(?:up|down|out|together|apart|crossed|behind|over|on|in|around|between|under|above|raised|spread|outstretched|extended|forward|back|lift|grab|hold|to|tilt|tucked|folded|wrapped|clasped|support)\b/;

    // --- the head word: the last word of a tag says what it is ----------------------------------------------------
    const HEAD = new Map();
    const put = (line, words) => set(words).forEach((h) => HEAD.set(h, line));
    put(L.looks, `hair | bangs | ponytail | ponytails | twintails | braid | braids | bun | buns | ahoge | sidelocks | drill |
        drills | locks | intakes | updo | hairstyle | eyes | eye | pupils | sclera | irises | iris | eyelashes | eyebrows |
        eyebrow | eyeshadow | eyeliner | mascara | lips | lipstick | makeup | ears | ear | horns | horn | halo | antlers |
        antennae | hat | cap | beret | helmet | hood | crown | tiara | circlet | diadem | headdress | headwear | headpiece |
        headgear | headband | hairband | hairclip | hairclips | hairpin | ornament | scrunchie | veil | bonnet | beanie |
        fedora | earrings | earring | eyewear | glasses | sunglasses | goggles | mask | monocle | eyepatch | headphones |
        headset | earmuffs | beard | mustache | moustache | stubble | goatee | sideburns | freckles | fang | fangs | nose |
        whiskers | forehead | girl | boy | person | woman | man | demon | angel | elf | vampire | kitsune | android | robot |
        cyborg | ghost | zombie | witch | oni | succubus | fairy | mermaid | slime | lamia | harpy | centaur | dragon girl |
        nekomata | jiangshi | yokai | kemonomimi | furry | inkling | octoling | miqo'te | draph | erune | bandana | headscarf |
        earphones | hachimaki | eyeball | eyelid | eyelids | hairline | hairpins | barrette | bobbles | tiara | crown`);
    put(L.body, `breasts | breast | nipples | nipple | areolae | areola | cleavage | sideboob | underboob | navel | belly |
        stomach | abs | midriff | waist | hips | hip | thighs | thigh | ass | butt | buttocks | legs | leg | feet | foot | toes |
        soles | arms | arm | hands | hand | fingers | finger | fingernails | nails | shoulders | shoulder | collarbone |
        armpits | armpit | back | neck | nape | skin | tan | tanlines | body | figure | pussy | vulva | clitoris | labia | penis |
        testicles | anus | groin | crotch | pectorals | muscles | biceps | tattoo | tattoos | piercing | scar | scars | mole |
        moles | veins | vein | wings | wing | tail | tails | claws | fins | scales | gap | peek | venus | chest | torso | kneepits |
        knees | knee | ribs | spine | lap | curves | physique | build | toned | muscular | curvy | plump | chubby | slim |
        skinny | petite | pregnant | wet | oiled | sweaty | shiny | polish | toenails | cameltoe | crease | blades | crack |
        alba | foreskin | uterus | joints | stitches | bruise | bruises | injury | wound | wounds | blood | bandaged | amputee |
        prosthesis | abdomen | belly button | collarbones | clavicle | heterochromia | albino | fat | mons | snout | paws |
        tuft | fluff | pawpads | pawpad | countershading | digitigrade | plantigrade | spots | markings | marking | mane | beak |
        glistening | fluffy | translucent | overweight | voluptuous | athletic | obese | moobs | pecs | hindpaw | genitals |
        genitalia | glans | sheath | balls | backsack | perineum | flaccid | stack | chested | biped | quadruped | pubes |
        fluids | bulge |
        paw | hooves | talons | feathers | gills | tentacle | muzzle`);
    put(L.outfit, `shirt | t-shirt | blouse | dress | gown | sundress | skirt | miniskirt | shorts | pants | trousers | jeans |
        leggings | jacket | coat | blazer | cardigan | sweater | hoodie | vest | cape | capelet | cloak | robe | kimono | yukata |
        hakama | haori | obi | sash | uniform | serafuku | gakuran | suit | tuxedo | armor | gauntlets | pauldrons | greaves |
        swimsuit | bikini | leotard | bodysuit | jumpsuit | overalls | apron | bra | panties | underwear | lingerie | negligee |
        nightgown | pajamas | corset | bustier | garter | garters | thighhighs | thighhigh | pantyhose | tights | socks |
        kneehighs | stockings | legwear | warmers | boots | shoes | footwear | heels | sandals | slippers | loafers | sneakers |
        janes | geta | gloves | glove | mittens | sleeves | sleeve | collar | necktie | tie | bowtie | ascot | neckerchief |
        scarf | shawl | stole | choker | necklace | pendant | jewelry | bracelet | bracelets | bangle | wristband | cuffs |
        armband | armlet | anklet | ring | rings | belt | belts | buckle | suspenders | harness | ribbon | ribbons | bow | bows |
        frills | lace | trim | buttons | zipper | pocket | pockets | strap | straps | cutout | cutouts | costume | outfit |
        clothes | clothing | attire | fashion | wear | sportswear | swimwear | print | pattern | stripes | plaid | top | bottom |
        bottoms | lift | pull | aside | slit | halter | brooch | feathers | towel | bunny | bunnysuit | miko | nun | maid |
        nurse | bloomers | buruma | fishnets | denim | tabard | shrug | drawstring | bandages | bandage | bandaid | pasties |
        maebari | covers | tassel | tassels | emblem | badge | patch | gemstone | jewel | gem | o-ring | fur | trim |
        loincloth | thong | g-string | fundoshi | sarashi | camisole | bandeau | sarong | pareo | poncho | parka | windbreaker |
        tracksuit | gym | crop | pin | lanyard | pouch | holster | sheath | scabbard | quiver | wristwatch | watch | backpack |
        topwear | bottomwear | handwear | armwear | neckwear | skimpy | clothed | furgonomics |
        turtleneck | halterneck | breastplate | microskirt | bodystocking | petticoat | tabi | epaulettes | lapels | vambraces |
        tunic | waistcoat | plugsuit | babydoll | v-neck | latex | leather | camouflage | pads | guards | faulds | muneate |
        tasuki | habit | lolita | cheerleader | waitress | idol | queen | police | ninja | knight | bride | military |
        thighlet | bracer | bracers | randoseru | dougi | hanfu | kariginu | uwabaki | zouri | cutoffs | undershirt | tags |
        obijime | beads | bell | bells | collarband | crotchless | lowleg | seam | vent | opening | fly | overhang | fabric`);
    put(L.pose, `viewer | another | pose | stance | position | kiss | hug | grab | hold | smile | face | mouth | tongue | blush |
        wagging | smother | awe | bondage | carry | piggyback | tickling | massage | headpat | penetrating | penetrated |
        cumshot | moan | gesture | squish | inflation | transformation | vore | forced | seductive | surprise | furniture |
        container | electronics | beverage | machine | restraints | knot |
        tears | sweat | sweatdrop | sweatdrops | sex | masturbation | penetration | insertion | stimulation | juice | trail |
        overflow | threesome | docking | fours | rest | press | lap | straddling | sword | swords | katana | knife | dagger |
        axe | spear | polearm | scythe | staff | wand | arrow | shield | gun | guns | rifle | pistol | handgun | shotgun |
        weapon | weapons | cup | mug | teacup | glass | bottle | can | phone | cellphone | smartphone | book | books | food |
        fruit | cake | candy | lollipop | popsicle | dessert | drink | umbrella | parasol | bag | handbag | basket | box | gift |
        card | cards | paper | letter | pen | pencil | brush | microphone | guitar | instrument | camera | controller | toy |
        doll | plush | balloon | flag | fan | torch | lantern | candle | cigarette | pipe | chopsticks | spoon | fork | plate |
        bowl | tray | slice | stick | ball | bat | racket | tool | wrench | hammer | broom | syringe | clipboard | tablet | laptop |
        computer | keyboard | bubble | bubbles | sign | banner | poster | photo | mirror | vehicle | car | motorcycle | bicycle |
        boat | ship | airplane | aircraft | train | turret | object | objects | animal | animals | cat | dog | rabbit | bear |
        bird | fish | fox | wolf | horse | cow | pig | sheep | mouse | snake | dragon | monster | creature | insect | bug |
        butterfly | pokemon | chain | chains | rope | handcuffs | shackles | cross | ofuda | skull | blanket | dakimakura |
        bouquet | strawberry | apple | peach | cherry | grapes | orange | banana | watermelon | lemon | carrot | pumpkin |
        mushroom | bread | cookie | cookies | chocolate | doughnut | burger | sandwich | pizza | rice | noodles | ramen | sushi |
        onigiri | dango | wagashi | pocky | meat | egg | eggs | tea | coffee | beer | wine | sake | alcohol | juice | milk |
        soda | teapot | kettle | saucer | sakazuki | bucket | sack | suitcase | key | coin | money | scroll | notebook | vase |
        cushion | futon | kotatsu | stool | television | monitor | chalkboard | scissors | whistle | whip | cane | anchor |
        cannon | tank | torpedo | revolver | explosive | bone | skeleton | chess | frog | penguin | alien | beachball |
        innertube | charm | magatama | gohei | shimenawa | console | earphones | cable | rigging | watercraft | broom |
        paintbrush | mecha | machinery | clock`);
    put(L.bg, `background | sky | moon | sun | stars | clouds | cloud | field | floor | wall | walls | bed | sheet | sheets | pillow |
        pillows | chair | table | desk | couch | sofa | bench | curtain | curtains | tree | trees | plant | plants | flower |
        flowers | rose | roses | lily | tulip | sunflower | daisy | hibiscus | petals | leaves | leaf | branch | blossoms | grass |
        particles | rays | light | lights | room | window | windows | door | building | buildings | city | cityscape | street |
        road | beach | ocean | sea | lake | river | water | pool | forest | mountain | mountains | symbol | note | notes | heart |
        hearts | star | sparkle | sparkles | glitter | snow | rain | fire | flames | ice | smoke | fog | mist | wind | shadow |
        reflection | architecture | interior | exterior | scenery | landscape | night | day | sunset | sunrise | outdoors |
        indoors | ruins | castle | temple | shrine | church | school | classroom | bedroom | bathroom | kitchen | office |
        library | cafe | restaurant | shop | store | stage | space | planet | rock | rocks | crystal | crystals | plantlife |
        foliage | vines | bush | bushes | garden | park | fence | railing | stairs | hallway | corridor | balcony | rooftop |
        bridge | lamp | lamppost | streetlight | fireworks | confetti | snowflakes | waves | sand | shore | horizon | island |
        onsen | bath | bathtub | shower | locker | gym | dungeon | throne | battlefield | train | bus | car interior | festival |
        christmas | halloween | new year | valentine | birthday | summer | winter | autumn | spring | sunlight | snowing |
        underwater | tiles | tatami | bookshelf | nature | evening | twilight | torii | house | skyscraper | lines | pole |
        poolside | rainbow | explosion | lightning | electricity | circle | ripples | sunbeam | shade | aura | energy | glint |
        outside | inside | seaside | holidays | public |
        glowing | magic | dark | hot | gold | shell | pillar | shelf | splatter | puppet | ice cream`);
    put(L.camera, `focus | shot | angle | view | views | frame | above | below | foreground | blur | aberration | flare | lighting |
        backlighting | silhouette | perspective | close-up | portrait | profile`);
    put(L.act, `text | username | name | logo | signature | watermark | border | outline | censor | censoring | censored | cover |
        comic | koma | page | number | address | challenge | parody | meme | theme | color | colors | style | art | mode | inset |
        layer | effects | connection | character | ellipsis | request | commentary | artifacts | quality | aesthetic | rating |
        casual | contemporary | fiction | fantasy | halftone | artstyle | texture | error | screenshot | mechanics | life |
        pick | ranguage | pun | animification | humanization | animalization | anniversary | koma | anatomy | dialogue | profanity |
        humor | point | anthrofied | pokemorph | humanoidized`);

    // a head word that changes with the word in front of it
    function mixedHead(base, words, head) {
        const has = (re) => re.test(base);
        if (head === "back" && words.length === 1) return L.body;
        if (/^(?:male|female|intersex|anthro|feral|human|gynomorph|herm|ambiguous) (?:penetrating|penetrated|on top|on bottom|pov|focus)/.test(base)) return L.who;
        if (head === "up" || head === "down" || head === "back") {
            if (has(/\b(?:hair|ponytail|braid|bun|bangs|hood|hat|cap|mask|goggles|eyewear|glasses|veil)\b/)) return L.looks;
            if (has(/\b(?:skirt|dress|shirt|clothes|pants|shorts|panties|bikini|sleeves?|swimsuit|top|jacket|coat|towel|bra|strap)\b/)) return L.outfit;
            return L.pose;
        }
        if (head === "out" || head === "slip" || head === "only" || head === "visible" || head === "exposed" || head === "outline") {
            if (has(/^(?:tongue|fangs?|fang|teeth|upper teeth|lower teeth)\b/)) return L.pose;
            if (has(/\b(?:underwear|bra|panties|swimsuit|apron|shirt|towel|socks|thighhighs|legwear|bikini|ribbon|strap|bandages?|clothes)\b/)) return L.outfit;
            if (has(/\b(?:breasts?|nipples?|areolae?|areola|pussy|penis|ass|navel|testicles|cleavage|tail|wings)\b/)) return L.body;
            if (head === "outline") return L.act;
            return L.pose;
        }
        if (head === "head" || head === "shoulder" || head === "shoulders") {
            if (words[0] === "on") return L.looks;      // "on head": something sitting on it
            if (has(/^(?:hand|hands|arm|arms|head|finger)\b/)) return L.pose;
            return head === "head" ? L.looks : L.body;
        }
        if (head === "mouth") return has(/^(?:mole|beauty mark)\b/) ? L.looks : L.pose;
        if (head === "teeth") return has(/^(?:sharp|pointy|shark|fang|crooked|buck|missing|round|square)\b/) ? L.looks : L.pose;
        if (head === "cover" || head === "covers") {
            if (has(/^(?:bun|ear|ears|hair|horn|eye|single ear)\b/)) return L.looks;
            if (has(/^(?:nipple|breast|pussy|crotch|heart|star)\b/)) return L.outfit;
            return L.act;
        }
        if (head === "art" && has(/^(?:nail|body|toenail)\b/)) return L.body;
        if (head === "frame" && has(/^(?:picture|photo|window|mirror|door)\b/)) return L.bg;
        if ((head === "curtain" || head === "curtains" || head === "flower" || head === "flowers") && has(/^(?:breast|pelvic|dress|skirt|hat|shirt|kimono|clothes)\b/)) {
            return has(/^hat\b/) ? L.looks : L.outfit;
        }
        if (head === "face" && has(/^(?:scar|mole|tattoo|mark|freckles|paint|bandaid|bandage|whisker)/)) return L.looks;
        if (head === "girl" || head === "boy" || head === "female" || head === "male" || head === "man" || head === "woman") {
            if (has(/\b(?:topless|nude|naked|bottomless|clothed|half-dressed|undressed)\b/)) return L.outfit;
            if (has(/^(?:magical|shrine maiden|school|office|bunny|maid|nurse|police|cheerleader|idol|gyaru|kogal)\b/)) return L.outfit;
            if (has(/^(?:dark-skinned|pale-skinned|tan|tanned|mature|muscular|fat|plump|chubby|old|young|tall|short|petite|curvy|toned)\b/)) return L.body;
            if (/ on top$/.test(base)) return L.pose;
            if (words.length === 1) return -1;       // "girl" alone
            return L.looks;                          // "fox girl", "demon girl": what she is
        }
        if (head === "mark" || head === "marks" || head === "markings") {
            return has(/^(?:facial|forehead|beauty|whisker|cheek)\b/) ? L.looks : L.body;
        }
        if (head === "bow" && /\(weapon\)/.test(base)) return L.pose;
        return null;
    }

    // --- the words anywhere in a tag, when the head word says nothing --------------------------------------------------
    const wordsIn = (s) => new RegExp(`(?:^|\\s)(?:${s.trim().split(/\s*\|\s*/).join("|")})(?:$|\\s)`);
    const ANY = [
        [L.looks, wordsIn(`hair | eyes | eye | ears | horns | hat | glasses | eyewear | makeup | lipstick | freckles | halo`)],
        [L.outfit, wordsIn(`shirt | dress | skirt | shorts | pants | jacket | coat | sweater | uniform | swimsuit | bikini | leotard |
            bodysuit | bra | panties | underwear | lingerie | thighhighs | pantyhose | socks | legwear | boots | shoes | footwear |
            gloves | sleeves | collar | necktie | scarf | choker | belt | ribbon | bow | frills | lace | buttons | zipper | strap |
            straps | cutout | clothes | clothing | costume | outfit | armor | apron | kimono | cape | hoodie | vest | nude | naked |
            topless | bottomless | see-through | sleeveless | strapless | backless | off-shoulder | off shoulder | highleg |
            skindentation | zettai ryouiki`)],
        [L.body, wordsIn(`breasts | breast | nipples | nipple | areolae | navel | stomach | thighs | thigh | ass | legs | hips |
            waist | skin | body | pussy | penis | tattoo | tail | wings | muscular | curvy | bare | barefoot | flat chest`)],
        [L.bg, wordsIn(`background | sky | outdoors | indoors | room | water | beach | forest | city | night | day | flower |
            flowers | tree | window | wall | floor | bed`)],
    ];

    function clean(tag) {
        let t = String(tag || "").trim().toLowerCase();
        if (t.startsWith("<lora:") || t.startsWith("<lyco:")) return "<lora>";
        t = t.replace(/\\([()])/g, "$1");                       // \( and \) as written in prompts
        let m;
        while ((m = t.match(/^[([{]+(.*?)(?::[\d.]+)?[)\]}]+$/)) && m[1] !== t) t = m[1].trim();  // (tag:1.2), [tag], {tag}
        return t.replace(/_/g, " ").replace(/\s+/g, " ").trim();
    }
    // a qualifier in brackets: "(symbol)", "(weapon)"... are kinds of things; "(series name)" means a character
    const KINDS = /\((?:marking|feature|symbol|weapon|object|food|animal|clothes|clothing|medium|creature|cosplay|style|sky|plant|flower|fruit|instrument|vehicle|furniture|meme|game|sport|shape|pattern|emblem|body|anatomy|organ|hairstyle|accessory|projectile|mtf|ftm|theme|artwork|computer|phone|drink|dessert|insect|bird|fish|cat|dog)\)$/;

    const KIND_LINE = [
        [/\((?:weapon|object|food|animal|creature|instrument|vehicle|computer|phone|drink|dessert|insect|bird|fish|cat|dog|projectile|fruit)\)$/, L.pose],
        [/\((?:symbol|sky|plant|flower|furniture|shape|pattern)\)$/, L.bg],
        [/\((?:clothes|clothing|accessory|emblem|cosplay)\)$/, L.outfit],  // "hatsune miku (cosplay)": dressed as her
        [/\((?:hairstyle)\)$/, L.looks],
        [/\((?:body|anatomy|organ|marking|feature)\)$/, L.body],
        [/\((?:medium|style|meme|artwork|theme|game|sport)\)$/, L.act],
    ];
    const OUTFIT_EXACT = set(`off shoulder | off-shoulder | skin tight | pelvic curtain | strapless | backless | sleeveless | see-through |
        highleg | lowleg | zettai ryouiki | skindentation | nude | naked | completely nude | topless | bottomless | no bra |
        no panties | no pants | no shoes | barefoot sandals | center opening | open fly | crotch seam | underbust | turtleneck |
        halterneck | v-neck | double-breasted | unbuttoned | unzipped | partially unbuttoned | partially unzipped | latex |
        leather | camouflage | military | casual | formal`);
    const LOOKS_EXACT = set(`two side up | one side up | side up | hime cut | bob cut | pixie cut | bowl cut | undercut | bald |
        topknot | single sidelock | colored tips | blunt ends | heterochromia | animal ear fluff | glowing eyes | one-eyed |
        albino | facepaint | bandana | headscarf | earphones | hachimaki | forehead protector | tate eboshi | eyeball`);
    const BG_FALLING = /^(?:falling|floating|flying|scattered|drifting) (?:petals|leaves|feathers|snow|snowflakes|sparkles|confetti|cherry blossoms|bubbles|hearts|stars|embers|ashes)$/;
    const HAND_ACTION = /^(?:hand|hands|holding|grabbing|pulling|adjusting|playing|touching|tucking|twirling|stroking|brushing|tying|cutting|washing|drying|biting|sniffing|smelling|licking|kissing) /;

    function rulesOf(tag) {
        const t = clean(tag);
        if (!t) return -1;
        if (t === "<lora>") return L.lora;
        if (WHO.test(t)) return L.who;
        if (STYLE.test(t)) return L.act;
        if (CAMERA.test(t)) return L.camera;
        if (/\([^)]*\)$/.test(t) && !KINDS.test(t)) return -1;  // "anis (nikke)": a character or a series
        for (const [re, line] of KIND_LINE) if (re.test(t)) return line;
        const base = t.replace(/\s*\([^)]*\)$/, "");
        if (OUTFIT_EXACT.has(base)) return L.outfit;
        if (LOOKS_EXACT.has(base)) return L.looks;
        if (BG_FALLING.test(base)) return L.bg;
        const words0 = base.split(" ");
        const head0 = words0[words0.length - 1];
        // hair: always the look, unless a hand does something to it ("hand in own hair") or it isn't head hair
        if ((head0 === "hair" || head0 === "bangs" || words0[0] === "hair") && !HAND_ACTION.test(base)) {
            if (/\b(?:pubic|body|armpit|leg|chest|arm|ass|anal|facial) hair\b/.test(base)) return /facial/.test(base) ? L.looks : L.body;
            if (!/^hair (?:pull|grab|tug|sniffing|brushing)/.test(base)) return L.looks;
        }
        if (/^(?:scar|mole|tattoo|mark|freckles|facial mark|bandaid|bandage|bruise|whisker markings|paint|makeup)\b.* (?:on|across) (?:face|cheek|nose|forehead|eye)$/.test(base)) return L.looks;
        if (/^hair (?:pull|grab|tug|sniffing)/.test(base)) return L.pose;
        if (SEX.test(base) || FACE.test(base)) return L.pose;
        if (POSE_START.test(base) || LIMB_POSE.test(base) || LIMB_STATE.test(base) || FACE_VERB.test(base)) return L.pose;
        if (LIMB_ANY.test(base) && !/\b(?:sleeves?|gloves?|warmers|socks|boots|shoes|stockings|thighhighs|ribbon|bow|tattoo|strap|band)\b/.test(base)) return L.pose;
        const words = base.split(" ");
        const head = words[words.length - 1];
        if (words[0] === "see-through" || words[0] === "transparent") return L.outfit;
        if (HEAD.get(head) === L.body) {
            const first = HEAD.get(words[0]);
            // "sleeves past fingers", "jacket on shoulders", "hair over shoulder": the thing named first
            if (words.length > 2 && (first === L.outfit || first === L.looks)) return first;
            // "weapon over shoulder", "butterfly on hand": something held or resting on the body
            if (words.length > 2 && first === L.pose && /\b(?:on|over|in|between|under|around|against)\b/.test(base)) return L.pose;
            // "cupping hands", "steepled fingers", "locked arms": what the hands or limbs are doing
            if (/^(?:hands?|fingers?|arms?|legs?|feet|foot|palms?|thumbs?|knees?)$/.test(head)
                && /^(?:cupping|cupped|steepled|locked|curled|guiding|between|clasped|crossed|folded|outstretched|spread|interlocked|raised|clenched|joined|hidden|linked|praying|heart|own|bent|open|pointed|reaching|waving|tucked|dangling|hugging|wrapped|lifted|kicking|pointing|\d-finger)\b/.test(base)) return L.pose;
        }
        // a hair accessory worn somewhere else: "wrist scrunchie", "leg ribbon"
        if (words.length > 1 && /^(?:wrist|ankle|arm|leg|thigh|neck|waist|tail|finger)$/.test(words[0]) && (HEAD.get(head) === L.looks || HEAD.get(head) === L.outfit)) return L.outfit;
        const mixed = mixedHead(base, words, head);
        if (mixed !== null) return mixed;
        if (words.length > 1 && /^(?:hair|eye|ear|head|hat|headwear|horn|halo)$/.test(words[0]) && HEAD.get(head) !== L.pose) return L.looks;  // "hair ornament", "hat ribbon"
        if (HEAD.has(head)) return HEAD.get(head);
        if (HEAD.has(head.replace(/s$/, ""))) return HEAD.get(head.replace(/s$/, ""));
        for (const [line, re] of ANY) if (re.test(base)) return line;
        return -1;
    }

    // What the rules don't know, from the Danbooru Tag Taxonomy (Mexes, CC BY 4.0; data/tagmap.json, built by
    // tools/build_tagmap.js): the line of Danbooru tags the rules can't place, and of tags nobody has sorted, by
    // their last word. The page loads it (useMap) when Organize tags is on; without it the rules work alone.
    let MAP = null, HEADS = null;
    function useMap(m) {
        MAP = new Map();
        for (const [line, list] of Object.entries((m && m.lines) || {})) for (const tag of list.split("|")) if (tag) MAP.set(tag, Number(line));
        HEADS = new Map(Object.entries((m && m.heads) || {}).map(([w, line]) => [w, Number(line)]));
    }
    function lineOf(tag) {
        const t = clean(tag);
        if (MAP && MAP.has(t)) return MAP.get(t);
        const r = rulesOf(t);
        if (r >= 0 || !HEADS || t === "<lora>") return r;
        if (/\([^)]*\)$/.test(t) && !KINDS.test(t)) return -1;  // still a character or a series
        const words = t.replace(/\s*\([^)]*\)$/, "").split(" ");
        return words.length > 1 && HEADS.has(words[words.length - 1]) ? HEADS.get(words[words.length - 1]) : -1;
    }

    window.LoraDeckTags = { lineOf, rulesOf, useMap, clean, LINES: L, hasMap: () => !!MAP };
})();
