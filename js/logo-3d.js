/*
 * Sculptor AI - 3D Logo Animation
 * Handles the solid 3D logo in the left column.
 * Features: shape-vector ASCII rendering, click-and-drag rotation, momentum.
 */

(function () {
    const {
        SPACE_CODE,
        EMPTY_DEPTH,
        clamp01,
        createTextSurface,
        createVisibilityController,
        hash01,
        packColor,
        toCharCodes,
        computeShapeVectors,
        cachedShapeLookup,
        applyGlobalContrast,
        SHAPE_DIMS
    } = window.ASCIIUtils;

    // --- Configuration ---
    const VIEW_DISTANCE = 55.0;
    const BASE_ROTATION_SPEED = 0.005;
    const EXTRUSION_DEPTH = 3.75;
    const MORPH_DURATION = 1.2;
    const BURST_DISTANCE = 14.0;

    // Voxel density
    const Z_STEP = 0.16;
    const XY_JITTER = 0.5;

    // Shape-based rendering config
    const CONTRAST_EXPONENT = 3.5; // higher = sharper edges between regions

    // Directional key light (normalized) + Blinn half-vector for specular
    const L_RAW_X = 0.6, L_RAW_Y = 0.4, L_RAW_Z = -0.5;
    const L_LEN = Math.hypot(L_RAW_X, L_RAW_Y, L_RAW_Z);
    const LX = L_RAW_X / L_LEN, LY = L_RAW_Y / L_LEN, LZ = L_RAW_Z / L_LEN;
    const H_LEN = Math.hypot(LX, LY, LZ - 1.0);
    const HX = LX / H_LEN, HY = LY / H_LEN, HZ = (LZ - 1.0) / H_LEN;

    // --- Car diorama configuration (AV research section) ---
    const CAR_PLATFORM_Y = -17.0;
    const CAR_SLAB_HALF_X = 26.0;  // half-length of the diorama base along the road
    const CAR_SLAB_HALF_Z = 10.0;  // half-width of the diorama base (road spans the full slab)
    const CAR_ROAD_HALF = 10.0;
    const CAR_ROAD_Y = -16.6;
    const CAR_WHEEL_R = 3.8;
    const CAR_WHEEL_HALF = 1.1;
    const CAR_WHEEL_X = 11.0;      // wheelbase half-length
    const CAR_ARCH_R = 4.8;        // wheel-arch cutout radius
    const CAR_AXLE_Y = CAR_ROAD_Y + CAR_WHEEL_R;
    const CAR_ROAD_SPEED = 26.0;   // world units per second the road scrolls
    const CAR_DASH_PERIOD = 14.0;
    const CAR_DASH_LEN = 7.0;
    const CAR_SPOKES = 4;

    // Car target kinds
    const CK_BODY = 0, CK_WHEEL = 1, CK_ROAD = 2, CK_DASH = 3,
        CK_EDGE = 4, CK_RIM = 5, CK_GLASS = 6;

    // --- Sunfish configuration (Mola mola) ---
    const FK_BODY = 0, FK_FIN = 1, FK_CLAVUS = 2, FK_PECT = 3,
        FK_EYE = 4, FK_MOUTH = 5, FK_GILL = 6;

    // Body outline: a superellipse whose rear exponent squares off the profile
    // into the truncated shape a mola has in place of a tail.
    const FISH_A_FRONT = 15.5, FISH_A_REAR = 13.5;
    const FISH_B_TOP = 12.0, FISH_B_BOT = 11.5;
    const FISH_N_FRONT = 2.05, FISH_N_REAR = 3.3;
    const FISH_T = 5.0;            // half-thickness at the center of the disc
    const FISH_FLAP_AMP = 3.6;     // how far the fin tips scull out of plane
    const FISH_FLAP_SPEED = 1.05;
    const FISH_SWAY = 0.34;        // lazy yaw oscillation around the profile view

    // --- Microscope configuration (research section) ---
    const MK_BASE = 0, MK_ARM = 1, MK_STAGE = 2, MK_SLIDE = 3, MK_TUBE = 4,
        MK_TURRET = 5, MK_OBJ = 6, MK_KNOB = 7, MK_LAMP = 8, MK_LENS = 9, MK_BEAM = 10;

    const SCOPE_SCALE = 1.22;
    const SCOPE_LIFT = 5.4;
    const SCOPE_TURRET_X = 0.5, SCOPE_TURRET_Z = 0.0;
    const SCOPE_OBJ_RADIUS = 2.5;
    const SCOPE_PIVOT_X = SCOPE_TURRET_X * SCOPE_SCALE;
    const SCOPE_PIVOT_Z = SCOPE_TURRET_Z * SCOPE_SCALE;
    const SCOPE_TURRET_DWELL = 4.5; // seconds between nosepiece clicks

    // --- Rocket configuration (products section) ---
    const RK_BODY = 0, RK_NOSE = 1, RK_FIN = 2, RK_WINDOW = 3,
        RK_NOZZLE = 4, RK_FLAME = 5, RK_STAR = 6;

    // Proportion is the whole game here. Size comes from length, not girth: the
    // airframe runs about 51 units on a 9.6 unit body, so roughly 5:1. Every
    // part is a surface of revolution about y, so the stack is built upright and
    // the render tips it over.
    const ROCKET_R = 4.8;              // radius of the main fuselage
    const ROCKET_NOSE_TIP = 30.0;
    const ROCKET_BODY_TOP = 12.0, ROCKET_BODY_BOT = -14.0;
    const ROCKET_TAIL_Y = -18.0, ROCKET_TAIL_R = 3.6;   // boat tail into the throat
    const ROCKET_BELL_Y = -21.5, ROCKET_BELL_R = 6.2;   // flared nozzle
    // Painted stripe. Kept a gentle step, because a hard one reads as a gap in
    // the hull rather than as paint.
    const ROCKET_BAND_LO = 2.0, ROCKET_BAND_HI = 6.5;
    const ROCKET_BAND_SHADE = 0.7;
    const ROCKET_FIN_R = 12.0;         // how far the fins reach out
    const ROCKET_FIN_T = 0.55;
    const ROCKET_FINS = 4;
    const ROCKET_WINDOW_Y = 9.0, ROCKET_WINDOW_R = 2.0;
    const ROCKET_FLAME_LEN = 34.0;     // two thirds the length of the airframe
    const ROCKET_FLAME_W = 10.0;       // plume is wider than the bell it leaves

    // Climbing pose: nose up and to the right at about 48 degrees, which is how
    // a rocket is drawn under power. Shifting along the axis first puts the
    // finished diagonal in the middle of the frame.
    const ROCKET_TILT = -0.733;
    const ROCKET_AXIAL_SHIFT = 12.75;
    const ROCKET_BELL_AXIAL = ROCKET_BELL_Y + ROCKET_AXIAL_SHIFT;
    const ROCKET_ROLL_SPEED = 0.5;     // slow roll, so the fins sweep round

    // Starfield sits well behind the airframe so it never wins the depth test
    const ROCKET_STAR_X = 55.0, ROCKET_STAR_Y = 45.0, ROCKET_STAR_Z = 16.0;
    const ROCKET_FLAME_FLICK = 9.0;    // turbulence rate in the plume
    const ROCKET_FLAME_PULSE = 6.0;    // rate the plume grows and shrinks

    // --- Members crest configuration ---
    // The Members section gets a flat 2D shape in the same slot every other
    // section uses: the particles settle into a plane and draw one person
    // silhouette in crisp text-art rather than shaded voxels, with a few
    // sparks adrift around it. The
    // section's words stay ordinary HTML copy in the text column.
    const TK_GLYPH = 0, TK_SPARK = 1;

    // Inverse of the resting projection (K1 = 40, view distance 55, Courier
    // cell aspect): one grid column is 0.825 world units across and one row
    // 1.375 down, so the crest can be authored directly in cells
    const TEXT_UNIT_X = 0.825;
    const TEXT_UNIT_Y = 1.375;

    // --- Constellation configuration (Constellation product) ---
    // One short loop, told in four beats: a scatter of stars, lines drawn
    // between them, the figure swallowed by a black hole that forms out of it,
    // and the hole failing and leaving the faint stars behind. Every particle
    // has a place in the sky and a place round the hole, and the cycle clock
    // blends between them. Kept to a few seconds, since that is about how long
    // anyone spends on a section.
    //   PK_LINE  a line in the sky, then a strand of the accretion disk
    //   PK_DISK  the rest of the disk, condensing out of nothing as it forms
    //   PK_VOID  the event horizon: dark points that blank out what is behind
    //   PK_RING  the thin photon ring hugging the horizon
    //   PK_LENS  the far side of the disk, lensed up over and under the hole
    //   PK_STAR  a star's core, printed as a literal glyph
    //   PK_GLINT the short arms a bright star throws when a line reaches it
    const PK_LINE = 0, PK_DISK = 1, PK_VOID = 2, PK_RING = 3, PK_LENS = 4,
        PK_STAR = 5, PK_GLINT = 6;

    // The hole, after Gargantua: a disk seen nearly edge on, crossing in front
    // of the shadow low down, with its far side bent up over the top. The
    // horizon, ring and lensed arcs are images rather than objects, so they
    // are billboarded to face the camera whatever the drag does; the disk is
    // real geometry and turns with it. The projection is roughly 1.21 cells
    // per unit across and 0.73 down, so this comes to about 56 by 22.
    const HOLE_R = 9.0;             // event horizon radius
    const HOLE_RING = 0.8;          // photon ring, this far outside the horizon
    const HOLE_DISK_IN = 12.5, HOLE_DISK_OUT = 23.0;
    const HOLE_TILT = 0.17;         // disk plane, tipped this far up from edge on
    const HOLE_SPIN = 1.7;          // rad/s at the inner edge, falling off as r^-1.5
    const HOLE_BEAMING = 0.55;      // how much brighter the side coming at you is
    const HOLE_LENS_TOP = 3.4, HOLE_LENS_BOT = 1.4;   // widths of the lensed arcs

    // The sky. Radii vary on purpose, with two stars well inside, so the
    // figure reads as a constellation rather than as a ring. Tier sets the
    // glyph: 0 bright, 1 mid, 2 dim. Depth is only there for parallax while
    // the sky drifts.
    const CONST_STARS = [
        { x: 3.0, y: 16.0, z: -2.0, tier: 0 },     // 0  rides the disk
        { x: -5.0, y: 8.5, z: 1.5, tier: 1 },      // 1
        { x: -14.0, y: 4.0, z: -1.0, tier: 0 },    // 2
        { x: -10.0, y: -8.5, z: 2.5, tier: 1 },    // 3
        { x: -1.0, y: -6.0, z: -3.0, tier: 1 },    // 4
        { x: 5.0, y: -18.0, z: 1.0, tier: 0 },     // 5
        { x: 13.5, y: -6.0, z: -1.5, tier: 0 },    // 6
        { x: 9.0, y: 7.0, z: 2.0, tier: 1 },       // 7
        { x: -11.5, y: 17.5, z: 3.0, tier: 2 },    // 8  falls all the way in
        { x: 4.5, y: -0.5, z: -4.0, tier: 0 },     // 9  the root everything grows from
        { x: 17.0, y: -15.0, z: 0.5, tier: 2 },    // 10
        { x: -15.5, y: -19.0, z: 4.0, tier: 2 },   // 11 loose, never joined
        { x: 15.0, y: 18.0, z: -3.5, tier: 2 },    // 12 loose
        { x: -4.0, y: 22.5, z: 1.0, tier: 1 },
        { x: 18.0, y: 4.5, z: 3.5, tier: 2 },
        { x: -6.5, y: -16.0, z: -2.5, tier: 2 },
        { x: 11.5, y: -21.5, z: -1.0, tier: 2 },
        { x: -17.0, y: -4.0, z: -3.0, tier: 2 },
        { x: -1.5, y: 1.5, z: 2.5, tier: 2 }
    ];
    const CONST_RIDERS = 8;         // the first eight stars ride the disk round
    // The figure grows like a tree rather than closing into a ring: every line
    // leaves from the root, and each star a line reaches sends out its own
    // branches the moment it lights, so the lines fork outward several at a
    // time. Listed as [from, to], parents before their children; nothing
    // crosses, and two stars are left unjoined so it stays a sky.
    const CONST_ROOT = 9;
    const CONST_BRANCHES = [
        [9, 7], [9, 6], [9, 4], [9, 18],
        [7, 0], [7, 14], [0, 13],
        [6, 10],
        [4, 5], [4, 3], [5, 16], [3, 17], [3, 15],
        [18, 1], [1, 2], [1, 8]
    ];

    // Timing, in seconds of the cycle clock
    // No stars-only intro: the stars are lit from the first frame and the pen
    // leaves the root almost at once, since a visitor may only stay a moment
    const CONST_WAKE_TIME = 0.1;
    const CONST_DRAW_SPEED = 30.0;  // units per second each pen travels
    const CONST_FIGURE_HOLD = 0.3;  // the finished figure, held before it goes
    const CONST_CONVERGE_TIME = 1.2;
    const CONST_FORM_LAG = 0.75;    // the hole starts forming this far in, once
                                    // the plane has nearly tipped flat
    const CONST_FORM_TIME = 0.6;
    const CONST_HOLD = 2.0;         // fully formed, before it starts to fail
    const CONST_FIZZLE_TIME = 1.1;
    const CONST_REST = 0.25;        // faint stars only, then round again
    const CONST_LINE_GAP = 1.4;     // lines stop short of the stars they join
    const CONST_GLINT_TIME = 0.35;  // how long a star flares on arrival
    const CONST_DRIFT = 0.16;       // radians the sky sways about the vertical
    const CONST_DRIFT_RATE = 0.5;
    // Hidden particles are pushed this far back while another shape is still
    // blending out, so the dark ones never win a cell from a lit star
    const CONST_HIDE_DEPTH = 14.0;
    // How long the sparks of the broken disk last, as a power on what is left
    // of the fizzle: higher thins it out faster, leaving fewer, longer lived
    // sparks
    const CONST_SPARK_THIN = 2.6;
    const CONST_SPARK_REACH = 9.0;  // furthest a spark is flung once released

    const GLYPH_STAR_BRIGHT = 42, GLYPH_STAR_MID = 43, GLYPH_STAR_DIM = 46;  // * + .
    const GLYPH_GLINT = 45;                                                  // -
    // Lines are printed, not shape-matched: matching a one-cell line from its
    // neighbours gives a scratchy staircase. A shallow line prints one cell
    // per column, picking the glyph that sits at the height the line crosses
    // that column, which is the classic _.-' run; a steeper one prints one
    // cell per row as a slash or a bar.
    const GLYPH_LINE_HIGH = 39, GLYPH_LINE_MID = 45,                         // ' -
        GLYPH_LINE_LOW = 46, GLYPH_LINE_FLOOR = 95;                          // . _
    const GLYPH_SLASH = 47, GLYPH_BACKSLASH = 92, GLYPH_BAR = 124;           // / \ |
    const CONST_LINE_RUN = Math.tan(35 * Math.PI / 180);   // below: the _.-' run
    const CONST_LINE_BAR = Math.tan(78 * Math.PI / 180);   // above: a bar
    // Lines stay printed this far into the fall, until they are wound tight
    // enough that the disk's own shading reads better
    const CONST_LINE_HOLD = 0.55;

    // How a line or curve through a point should print, given its direction
    // on screen in world units (which are square on screen, so the cell's own
    // shape drops out of how steep it looks). Anything drawn in slashes prints
    // by row: by column, two slashes land side by side wherever the line is
    // shallower than the glyph. Written to linePrint as by-row, slope in
    // cells (columns per row by row, rows per column otherwise), and the glyph,
    // 0 meaning pick from the _.-' run by height.
    const linePrint = new Float32Array(3);
    function setLinePrint(dx, dy, aspect) {
        const look = Math.abs(dy) / Math.max(1e-6, Math.abs(dx));
        if (look >= CONST_LINE_RUN) {
            linePrint[0] = 1;
            linePrint[1] = -dx * aspect / (dy || 1e-6);
            linePrint[2] = look > CONST_LINE_BAR ? GLYPH_BAR
                : (dx * dy > 0 ? GLYPH_SLASH : GLYPH_BACKSLASH);
        } else {
            linePrint[0] = 0;
            linePrint[1] = -dy / ((dx * aspect) || 1e-6);
            linePrint[2] = 0;
        }
    }

    // Links, each drawn from a to b at a constant speed; start time and
    // duration fall out of that.
    const CONST_LINKS = [];
    const CONST_STAR_ARRIVE = new Float32Array(CONST_STARS.length).fill(-1);
    let constDrawEnd = 0;
    (function buildConstellation() {
        const reached = new Float32Array(CONST_STARS.length).fill(-1);
        const addLink = (a, b, start) => {
            const sa = CONST_STARS[a], sb = CONST_STARS[b];
            const len = Math.hypot(sb.x - sa.x, sb.y - sa.y);
            const dur = len / CONST_DRAW_SPEED;
            CONST_LINKS.push({ a, b, len, start, dur });
            if (reached[b] < 0 || start + dur < reached[b]) reached[b] = start + dur;
            constDrawEnd = Math.max(constDrawEnd, start + dur);
            return start + dur;
        };
        reached[CONST_ROOT] = CONST_WAKE_TIME;
        for (const [a, b] of CONST_BRANCHES) addLink(a, b, reached[a]);
        CONST_STAR_ARRIVE.set(reached);
    })();
    const CONST_T_CONVERGE = constDrawEnd + CONST_FIGURE_HOLD;
    const CONST_T_FORM = CONST_T_CONVERGE + CONST_FORM_LAG;
    const CONST_T_FIZZLE = CONST_T_CONVERGE + CONST_CONVERGE_TIME + CONST_HOLD;
    const CONST_CYCLE = CONST_T_FIZZLE + CONST_FIZZLE_TIME + CONST_REST;

    // --- Apple configuration (spoilage forecasting section) ---
    // An apple that spoils over one loop and is then replaced by a fresh one.
    // A hyperspectral line scan sweeps down it the whole time, and it sees the
    // rot before the eye does: where the skin is about to go, the bright scan
    // line already comes back dark.
    const AK_SKIN = 0, AK_STEM = 1, AK_LEAF = 2;

    const APPLE_R = 23.0;            // body radius through the shoulder
    const APPLE_SQUASH = 0.9;        // height over width
    const APPLE_SHOULDER = 0.08;     // how much wider the top half sits than the base
    const APPLE_LOBES = 0.03;        // the five faint lobes round the calyx end
    // How much higher the shoulders stand either side of the stem than in
    // front of and behind it. A body of revolution has a flat top seen side
    // on, because the near rim of the cavity hides the dip; slightly raised
    // shoulders give the outline its gentle dip. Kept broad and low: tall,
    // narrow ones stand up off the fruit like a pair of ears.
    const APPLE_CREST = 2.2;
    // Depth of the stem cavity. Deep on purpose: seen side on, the dip between
    // the two shoulders with the stem rising out of it is what makes the
    // outline an apple rather than a ball
    const APPLE_DIMPLE_TOP = 9.0;
    const APPLE_DIMPLE_BOT = 1.8;    // depth of the calyx end
    const APPLE_LIFT = -2.8;         // body sits low so the stem and leaf fit the frame
    const APPLE_STEM_LEN = 10.5, APPLE_STEM_R = 1.0;
    const APPLE_STEM_LEAN = -1.4;    // the stem curves off upright by this much
    const APPLE_LEAF_AT = 0.85;      // how far up the stem the leaf hangs
    const APPLE_LEAF_LEN = 11.0, APPLE_LEAF_W = 3.6;
    const APPLE_SWAY = 0.45;         // held side on, turning lazily this far each way

    // The loop is four scan sweeps, about ten seconds, since a visitor only
    // gives a section a few. The last sweep images the next apple: fresh
    // above the line, the old one still rotting below it, so the reset is a
    // wipe carried by the scan itself rather than a fade.
    const APPLE_SCAN_TIME = 2.5;
    const APPLE_CYCLE = APPLE_SCAN_TIME * 4;
    const APPLE_RESET = APPLE_CYCLE - APPLE_SCAN_TIME;
    const APPLE_SCAN_HALF = 0.6;     // half-height of the scan band
    const APPLE_FORECAST = 2.5;      // seconds ahead the scan sees rot coming
    const APPLE_ROT_RAMP = 1.0;      // seconds a patch takes from sound to dark
    const APPLE_ROT_SINK = 0.9;      // how far rotten flesh sinks in
    // Where the rot starts, as an angle down from the stem and round the axis
    // (-PI/2 faces the camera), when it shows, and how fast it spreads in
    // radians a second. Both are on the side you see.
    const APPLE_SPOTS = [
        { phi: 1.25, theta: -1.05, start: 2.0, speed: 0.11 },
        { phi: 2.0, theta: -2.3, start: 3.2, speed: 0.085 }
    ];
    const APPLE_DULL_FROM = 1.8, APPLE_DULL_TO = 5.0;     // the sheen goes
    const APPLE_SLUMP_FROM = 4.5, APPLE_SLUMP_TO = 7.0;   // then it slumps and creases

    // A long gradient used as a fallback ramp
    const SHADE_CHARS = " `.-':_,^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@";
    const SHADE_CHAR_CODES = toCharCodes(SHADE_CHARS);

    const LOGO_ART = `
                                      .:=*##-
                                    :*@@@@@%-
                              .    +@@@@@#-   -+####+=.
                            =@@=  =@@@@@=   +%@@@@@@@@@%=
                           +@@@=  #@@@@-  .#@@@@@@%##%%@%.
                          :@@@@:  *@@@+  .%@@%+-.
                          +@@@@=  -@@@.  #@%-    :-==+==:.
                          =@@@@%   *@@.  %+  .=#@@@@@@@@@@*:
                           #@@@@*   *@-  .   :+=--=+*%@@@@@@+
                        .   +@@@@#.  :.               .=%@@@@=
                       #@%-  .+%@@@+:          .*%%*=.   -%@@@.
                       #@@@*:   .-+##-           :*@@@#-  .#@@.
                       .@@@@@#=:               +.  -@@@@#.  ..
                        :%@@@@@@@##**##+   :.  %@-  -@@@@%.
                         .=%@@@@@@@@%*-  .*@:  #@@.  +@@@@+
                            .:---:.    .=%@#   %@@+  :@@@@+
                             ..    .-+#@@@%.  =@@@%  .@@@@:
                            *@@@@@@@@@@@@#.  -@@@@%  -@@@=
                            :*%@@@@@@@@%=   =@@@@@=  :##=
                               .-=+++-:  .=%@@@@@+
                                        :@@@@@%+:
                                         =+=-.
`;

    const GRID_X = 1.35;
    const GRID_Y = 2.6;

    const particles = [];

    // Colors
    const COLOR_COLD = { r: 60, g: 20, b: 70 };
    const COLOR_MID = { r: 220, g: 60, b: 100 };
    const COLOR_HOT = { r: 255, g: 210, b: 140 };
    const COLOR_DEFAULT = { r: 224, g: 224, b: 224 };
    const DWARF_COLOR_LEVELS = 12;
    const DWARF_COLOR_THRESHOLD = 0.16;
    const DWARF_RIM_COLOR = { r: 255, g: 232, b: 180 };

    function lerp(start, end, t) { return start * (1 - t) + end * t; }

    function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

    function smooth01(t) { return t * t * (3 - 2 * t); }

    function lerpColor(c1, c2, t) {
        return {
            r: Math.floor(lerp(c1.r, c2.r, t)),
            g: Math.floor(lerp(c1.g, c2.g, t)),
            b: Math.floor(lerp(c1.b, c2.b, t))
        };
    }

    function getHeatColor(val) {
        val = clamp01(val);
        if (val < 0.5) return lerpColor(COLOR_COLD, COLOR_MID, val * 2.0);
        return lerpColor(COLOR_MID, COLOR_HOT, (val - 0.5) * 2.0);
    }

    function getCharWeight(c) {
        const weights = {
            '.': 0.3, ',': 0.3, "'": 0.3, '`': 0.3,
            ':': 0.4, '-': 0.4, '_': 0.5,
            '=': 0.5, '+': 0.6,
            '(': 0.7, ')': 0.7,
            '*': 0.7, '#': 0.8, '%': 0.9, '@': 1.0
        };
        return weights[c] || 0.6;
    }

    const DWARF_BASE_PALETTE = Array.from({ length: DWARF_COLOR_LEVELS }, (_, i) => {
        const t = i / Math.max(1, DWARF_COLOR_LEVELS - 1);
        const heat = getHeatColor(t);
        return lerpColor(heat, DWARF_RIM_COLOR, Math.pow(t, 3) * 0.3);
    });
    const DWARF_FRAME_PALETTE = new Uint32Array(DWARF_COLOR_LEVELS);

    function buildDwarfPalette(blend) {
        for (let i = 0; i < DWARF_COLOR_LEVELS; i++) {
            const color = lerpColor(COLOR_DEFAULT, DWARF_BASE_PALETTE[i], blend);
            DWARF_FRAME_PALETTE[i] = packColor(color.r, color.g, color.b);
        }
        return DWARF_FRAME_PALETTE;
    }

    function sampleDwarfSurface(p, timeData) {
        const band = Math.sin(p.dwarfBandPhase + timeData.band + Math.sin(p.dwarfDriftPhase + timeData.drift) * 0.45);
        const swirl = Math.sin(p.dwarfSwirlPhase + timeData.swirl) * 0.55;
        const storm = Math.cos(p.dwarfStormPhase - timeData.storm) * (0.35 + p.dwarfEquatorBias * 0.25);
        return clamp01((band * 0.5 + swirl * 0.32 + storm * 0.18 + 1.15) / 2.3);
    }

    function generateDwarfTargets(count) {
        const targets = [];
        const golden = Math.PI * (3 - Math.sqrt(5));
        const denom = Math.max(1, count - 1);
        const DWARF_RADIUS = 21.0;
        for (let i = 0; i < count; i++) {
            const y = 1 - (i / denom) * 2;
            const radius = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = golden * i;
            targets.push({
                x: Math.cos(theta) * DWARF_RADIUS * radius,
                y: y * DWARF_RADIUS,
                z: Math.sin(theta) * DWARF_RADIUS * radius
            });
        }
        return targets;
    }

    // --- Ocean sunfish geometry ---
    // A mola is a laterally compressed disc: a tall, rear-truncated body with a
    // long dorsal fin, a mirrored anal fin, a scalloped clavus where a tail
    // would be, and small pectorals. The body is built as a lens surface — the
    // half-thickness falls to zero at the outline, so the two faces close on
    // each other and the rim needs no separate seam pass.

    function fishProfileD(x, y) {
        const rx = x >= 0 ? FISH_A_FRONT : FISH_A_REAR;
        const ry = y >= 0 ? FISH_B_TOP : FISH_B_BOT;
        const n = x >= 0 ? FISH_N_FRONT : FISH_N_REAR;
        const u = Math.abs(x) / rx, v = Math.abs(y) / ry;
        return Math.pow(Math.pow(u, n) + Math.pow(v, n), 1 / n);
    }

    function fishThickness(x, y) {
        const d = fishProfileD(x, y);
        if (d >= 1) return 0;
        // Full through the middle, rolling off sharply into a thin rim
        const bulk = Math.pow(1 - d * d, 0.62);
        // The head end carries more bulk than the tapering rear
        const fore = 0.84 + 0.16 * clamp01((x + 8) / 20);
        return FISH_T * bulk * fore;
    }

    // Rear edge of the body at a given height, used to hang the clavus off it
    function fishRearEdge(y) {
        const ry = y >= 0 ? FISH_B_TOP : FISH_B_BOT;
        const k = Math.pow(Math.abs(y) / ry, FISH_N_REAR);
        if (k >= 1) return null;
        return -FISH_A_REAR * Math.pow(1 - k, 1 / FISH_N_REAR);
    }

    // Pale blotches plus the skin folds that radiate out from behind the
    // pectoral fin — the two things that make mola hide read as mola hide.
    function fishSkin(x, y) {
        // ~3 cols x 2 rows per patch at this projection; any finer and the
        // blotches land inside a single cell and just read as speckle
        const blotch = hash01(Math.floor(x * 0.5) * 37.1 + Math.floor(y * 0.45) * 91.7);
        const ang = Math.atan2(y - 1.0, x - 4.0);
        const rad = Math.hypot(x - 4.0, y - 1.0);
        const fold = Math.sin(ang * 11.0 + rad * 0.35);
        return (blotch > 0.84 ? 0.9 : 0) + fold * 0.5;
    }

    function pushFishBody(targets, count, rimBand) {
        const eps = 0.14;
        let added = 0, guard = count * 40;
        while (added < count && guard-- > 0) {
            let x, y;
            if (rimBand) {
                // fishProfileD is homogeneous, so a unit direction gives the
                // radius that lands on any chosen iso-contour directly
                const ang = Math.random() * Math.PI * 2;
                const ca = Math.cos(ang), sa = Math.sin(ang);
                const unit = fishProfileD(ca, sa) || 1;
                const dd = 0.9 + Math.random() * 0.0995;
                x = ca * dd / unit;
                y = sa * dd / unit;
            } else {
                x = -FISH_A_REAR + Math.random() * (FISH_A_REAR + FISH_A_FRONT);
                y = -FISH_B_BOT + Math.random() * (FISH_B_BOT + FISH_B_TOP);
                if (fishProfileD(x, y) >= 0.93) continue;
            }

            const t = fishThickness(x, y);
            if (t <= 0.001) continue;

            const tx = (fishThickness(x + eps, y) - fishThickness(x - eps, y)) / (2 * eps);
            const ty = (fishThickness(x, y + eps) - fishThickness(x, y - eps)) / (2 * eps);
            const side = Math.random() < 0.5 ? 1 : -1;
            // Both faces of the lens tilt the same way as the thickness falls
            // off, and only z flips between them. Folding `side` into the lateral
            // terms mirrored the gradient on the camera-facing face, which lit
            // the disc inside-out and read as a flat patch rather than a dome.
            let nx = -tx, ny = -ty, nz = side;
            const nl = Math.hypot(nx, ny, nz) || 1;

            targets.push({
                x, y, z: side * t,
                nx: nx / nl, ny: ny / nl, nz: nz / nl,
                kind: FK_BODY, flap: 0, tex: fishSkin(x, y),
                a: fishProfileD(x, y)   // 0 along the crown, 1 at the outline
            });
            added++;
        }
    }

    // Fins are sheets swept from a base segment to a tip, bowed along the
    // leading edge and thinning to nothing at every free edge.
    function pushFishFin(targets, count, baseFront, baseRear, tip, thick, curve) {
        const cx = (baseFront[0] + baseRear[0] + tip[0]) / 3;
        const cy = (baseFront[1] + baseRear[1] + tip[1]) / 3;
        for (let i = 0; i < count; i++) {
            // Area-uniform toward the tip: density falls off as (1 - h)
            const h = 1 - Math.sqrt(1 - Math.random());
            const s = Math.random();
            const bx = baseFront[0] + (baseRear[0] - baseFront[0]) * s;
            const by = baseFront[1] + (baseRear[1] - baseFront[1]) * s;
            const x = bx + (tip[0] - bx) * h + Math.sin(Math.PI * h) * curve * (1 - s);
            const y = by + (tip[1] - by) * h;

            const edge = Math.sqrt(clamp01(3.2 * Math.min(s, 1 - s))) *
                Math.sqrt(clamp01(2.6 * (1 - h)));
            const t = thick * (0.4 + 0.6 * (1 - h)) * edge;
            if (t < 0.03) continue;

            const side = Math.random() < 0.5 ? 1 : -1;
            // Roll the normal outward near the edges so the fin isn't cardboard
            const roll = (1 - edge) * 0.9;
            let nx = (x - cx) * 0.04 * roll, ny = (y - cy) * 0.04 * roll, nz = side;
            const nl = Math.hypot(nx, ny, nz) || 1;

            targets.push({
                x, y, z: side * t,
                nx: nx / nl, ny: ny / nl, nz: nz / nl,
                // Rays run base-to-tip at constant s, converging at the tip
                kind: FK_FIN, flap: Math.pow(h, 1.7),
                tex: Math.sin(s * Math.PI * 8.0), a: 0
            });
        }
    }

    function pushFishClavus(targets, count) {
        for (let i = 0; i < count; i++) {
            const y = (Math.random() * 2 - 1) * 10.6;
            const xb = fishRearEdge(y);
            if (xb === null) continue;

            // Scalloped trailing edge — the clavus is a row of soft lobes
            const reach = 4.4 + Math.sin(y * 1.15) * 0.9;
            const u = Math.random();
            const x = xb - u * reach;
            const taper = Math.sqrt(clamp01(1 - Math.pow(Math.abs(y) / 10.6, 6)));
            const t = 1.2 * (1 - u * 0.75) * taper;
            if (t < 0.03) continue;

            const side = Math.random() < 0.5 ? 1 : -1;
            targets.push({
                x, y, z: side * t,
                nx: -0.18 * u, ny: 0, nz: side * 0.98,
                kind: FK_CLAVUS, flap: Math.pow(u, 1.4) * 0.45,
                tex: Math.sin(y * 1.15), a: 0   // which lobe of the scallop
            });
        }
    }

    function pushFishPectoral(targets, count) {
        const cx = 3.0, cy = 1.4;
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const rr = Math.sqrt(Math.random());
            const ex = Math.cos(ang) * rr * 3.4, ey = Math.sin(ang) * rr * 2.5;
            const x = cx + ex * 0.95 - ey * 0.22;
            const y = cy + ey + ex * 0.16;
            const side = Math.random() < 0.5 ? 1 : -1;
            // Sits just proud of the flank it grows out of
            const t = fishThickness(x, y) + 0.55 * Math.sqrt(clamp01(1 - rr * rr));
            targets.push({
                x, y, z: side * t,
                nx: ex * 0.05, ny: ey * 0.05, nz: side,
                kind: FK_PECT, flap: 0, tex: rr, a: rr
            });
        }
    }

    // Small features that live on the flank: eye, beak, gill opening.
    function pushFishPatch(targets, count, cx, cy, rx, ry, kind, lift) {
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const rr = Math.sqrt(Math.random());
            const x = cx + Math.cos(ang) * rr * rx;
            const y = cy + Math.sin(ang) * rr * ry;
            const t = fishThickness(x, y);
            if (t <= 0) continue;
            const side = Math.random() < 0.5 ? 1 : -1;
            targets.push({
                x, y, z: side * (t + lift),
                nx: 0, ny: 0, nz: side,
                kind, flap: 0, tex: 0, a: rr
            });
        }
    }

    function pushFishGill(targets, count) {
        for (let i = 0; i < count; i++) {
            const a = -1.0 + Math.random() * 2.0;
            const r = 2.3 + (Math.random() - 0.5) * 0.55;
            const x = 7.4 - Math.cos(a) * r * 0.42;
            const y = -0.6 + Math.sin(a) * r;
            const t = fishThickness(x, y);
            if (t <= 0) continue;
            const side = Math.random() < 0.5 ? 1 : -1;
            targets.push({
                x, y, z: side * (t + 0.06),
                nx: 0, ny: 0, nz: side,
                kind: FK_GILL, flap: 0, tex: 0, a: 0
            });
        }
    }

    function generateFishTargets(count) {
        const targets = [];
        const share = f => Math.max(1, Math.floor(count * f));

        pushFishBody(targets, share(0.55), false);
        pushFishBody(targets, share(0.12), true);
        pushFishFin(targets, share(0.10), [2.5, 9.5], [-10.5, 7.5], [-11.0, 26.5], 1.6, 1.7);
        pushFishFin(targets, share(0.09), [1.5, -9.5], [-10.5, -7.5], [-12.0, -25.0], 1.5, 1.5);
        pushFishClavus(targets, share(0.09));
        pushFishPectoral(targets, share(0.035));
        pushFishPatch(targets, share(0.012), 11.5, 3.2, 1.35, 1.35, FK_EYE, 0.14);
        pushFishPatch(targets, share(0.004), 14.1, -2.6, 1.0, 0.8, FK_MOUTH, 0.05);
        pushFishGill(targets, share(0.006));

        if (targets.length < count) pushFishBody(targets, count - targets.length, false);
        return targets.slice(0, count);
    }

    // --- Surface samplers ---
    // Scatter points over the skin of a primitive, area-weighted per face so
    // density stays even. Each point carries its own normal, which is what the
    // shading pass needs and what an SDF would have to re-derive.

    function pushSurfaceBox(targets, count, cx, cy, cz, hx, hy, hz, kind) {
        const faces = [
            [hy * hz, 1, 0, 0], [hy * hz, -1, 0, 0],
            [hx * hz, 0, 1, 0], [hx * hz, 0, -1, 0],
            [hx * hy, 0, 0, 1], [hx * hy, 0, 0, -1]
        ];
        let total = 0;
        for (const f of faces) total += f[0];

        for (let i = 0; i < count; i++) {
            let pick = Math.random() * total;
            let face = faces[faces.length - 1];
            for (const cand of faces) {
                pick -= cand[0];
                if (pick <= 0) { face = cand; break; }
            }
            const nx = face[1], ny = face[2], nz = face[3];
            const u = Math.random() * 2 - 1, v = Math.random() * 2 - 1;
            targets.push({
                x: cx + (nx ? nx * hx : u * hx),
                y: cy + (ny ? ny * hy : (nx ? u * hy : v * hy)),
                z: cz + (nz ? nz * hz : v * hz),
                nx, ny, nz, kind, a: 0, s: 0, spin: 0
            });
        }
    }

    function pushSurfaceCylinder(targets, count, x0, y0, z0, x1, y1, z1, radius, kind, opts) {
        const o = opts || {};
        let ax = x1 - x0, ay = y1 - y0, az = z1 - z0;
        const len = Math.hypot(ax, ay, az) || 1;
        ax /= len; ay /= len; az /= len;

        // Any vector not parallel to the axis seeds the orthonormal basis
        const hx = Math.abs(az) > 0.9 ? 1 : 0;
        const hz = Math.abs(az) > 0.9 ? 0 : 1;
        let ux = ay * hz, uy = az * hx - ax * hz, uz = -ay * hx;
        const ul = Math.hypot(ux, uy, uz) || 1;
        ux /= ul; uy /= ul; uz /= ul;
        const vx = ay * uz - az * uy, vy = az * ux - ax * uz, vz = ax * uy - ay * ux;

        const taper = o.taper || 1;
        const capFar = o.capFar !== false, capNear = o.capNear !== false;
        const lateral = 2 * Math.PI * radius * len;
        const capArea = Math.PI * radius * radius;
        const total = lateral + (capFar ? capArea : 0) + (capNear ? capArea : 0);

        for (let i = 0; i < count; i++) {
            let pick = Math.random() * total;
            const ang = Math.random() * Math.PI * 2;
            const ca = Math.cos(ang), sa = Math.sin(ang);

            let along, r, nx, ny, nz;
            if (pick < lateral || (!capFar && !capNear)) {
                along = Math.random();
                r = radius * (1 - (1 - taper) * along);
                nx = ux * ca + vx * sa; ny = uy * ca + vy * sa; nz = uz * ca + vz * sa;
            } else {
                pick -= lateral;
                const far = capFar && (pick < capArea || !capNear);
                along = far ? 1 : 0;
                r = radius * Math.sqrt(Math.random()) * (far ? taper : 1);
                nx = far ? ax : -ax; ny = far ? ay : -ay; nz = far ? az : -az;
            }

            targets.push({
                x: x0 + ax * len * along + (ux * ca + vx * sa) * r,
                y: y0 + ay * len * along + (uy * ca + vy * sa) * r,
                z: z0 + az * len * along + (uz * ca + vz * sa) * r,
                nx, ny, nz, kind,
                a: o.phaseAngle ? ang : along,
                s: 0, spin: o.spin || 0
            });
        }
    }

    // --- Microscope geometry ---
    // Foot, arm, stage and head assembled from primitives. The nosepiece is
    // marked `spin` so the render loop can revolve the objectives around the
    // turret axis while the instrument itself turns.

    function generateScopeTargets(count) {
        const targets = [];
        const share = f => Math.max(1, Math.floor(count * f));

        // Heavy foot the whole instrument grows out of
        pushSurfaceBox(targets, share(0.14), -1.5, -22.0, 0, 13.0, 2.2, 9.0, MK_BASE);

        // Illuminator column, lamp, and the light climbing toward the stage
        pushSurfaceCylinder(targets, share(0.035), 4, -19.8, 0, 4, -13.2, 0, 2.0, MK_TUBE, { capNear: false });
        pushSurfaceCylinder(targets, share(0.012), 4, -13.2, 0, 4, -12.8, 0, 1.8, MK_LAMP, {});
        pushSurfaceCylinder(targets, share(0.012), 4, -12.7, 0, 4, -11.9, 0, 1.0, MK_BEAM, { capFar: false, capNear: false });

        // Stage and the specimen slide clipped to it
        pushSurfaceBox(targets, share(0.10), 3, -11.0, 0, 10.0, 0.8, 7.5, MK_STAGE);
        pushSurfaceBox(targets, share(0.02), 4, -10.0, 0, 4.5, 0.2, 2.2, MK_SLIDE);

        // Arm: the spine at the back plus the elbow carrying the head
        pushSurfaceBox(targets, share(0.17), -10.0, -6.5, 0, 3.2, 15.5, 4.0, MK_ARM);
        pushSurfaceBox(targets, share(0.07), -5.5, 7.5, 0, 5.5, 2.6, 3.6, MK_ARM);

        // Coarse and fine focus knobs, one stack per side
        for (const side of [1, -1]) {
            pushSurfaceCylinder(targets, share(0.035), -10, -4.0, side * 4.0, -10, -4.0, side * 5.4, 3.6, MK_KNOB, { phaseAngle: true });
            pushSurfaceCylinder(targets, share(0.018), -10, -4.0, side * 5.4, -10, -4.0, side * 6.4, 2.1, MK_KNOB, { phaseAngle: true });
        }

        // Nosepiece turret and the three objectives that revolve beneath it
        pushSurfaceCylinder(targets, share(0.05), SCOPE_TURRET_X, -3.4, 0, SCOPE_TURRET_X, -1.0, 0, 4.2, MK_TURRET, {});
        const perObjective = Math.floor(share(0.05) / 3);
        for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2;
            const ox = SCOPE_TURRET_X + Math.cos(a) * SCOPE_OBJ_RADIUS;
            const oz = SCOPE_TURRET_Z + Math.sin(a) * SCOPE_OBJ_RADIUS;
            const drop = 3.4 + k * 1.1; // three magnifications, three lengths
            pushSurfaceCylinder(targets, perObjective, ox, -3.4, oz, ox, -3.4 - drop, oz, 1.25, MK_OBJ,
                { taper: 0.55, spin: 1, capNear: false });
        }

        // Body tube, then the ocular tilting forward to the eyepiece
        pushSurfaceCylinder(targets, share(0.09), SCOPE_TURRET_X, -1.4, 0, -2.0, 7.0, 0, 3.2, MK_TUBE, { capFar: false, capNear: false });
        pushSurfaceCylinder(targets, share(0.09), -2.4, 6.4, 0, 5.5, 13.5, 0, 2.1, MK_TUBE, { capNear: false });
        pushSurfaceCylinder(targets, share(0.02), 5.4, 13.4, 0, 5.7, 13.8, 0, 2.1, MK_LENS, {});

        // Top up with foot points so every particle has somewhere to land
        if (targets.length < count) {
            pushSurfaceBox(targets, count - targets.length, -1.5, -22.0, 0, 13.0, 2.2, 9.0, MK_BASE);
        }

        for (const t of targets) {
            t.y += SCOPE_LIFT;
            t.x *= SCOPE_SCALE; t.y *= SCOPE_SCALE; t.z *= SCOPE_SCALE;
        }
        return targets.slice(0, count);
    }

    // --- Members crest geometry ---
    // Sized to carry the panel the way the modelled shapes do
    const TEXT_PERSON = [
        '           =+**+=',
        '        .*@@@@@@@@*.',
        '       -@@@@@@@@@@@@-',
        '       %@@@@@@@@@@@@%',
        '      .@@@@@@@@@@@@@@.',
        '       @@@@@@@@@@@@@@',
        '       =@@@@@@@@@@@@=',
        '        =@@@@@@@@@@=',
        '          =*%@@%*=',
        '',
        '',
        '       -==++++++++==-',
        '   =*%@@@@@@@@@@@@@@@@%*=',
        ' .#@@@@@@@@@@@@@@@@@@@@@@#.',
        ' #@@@@@@@@@@@@@@@@@@@@@@@@#',
        ' %@@@@@@@@@@@@@@@@@@@@@@@@%',
        ' %@@@@@@@@@@@@@@@@@@@@@@@@%',
        ' %@@@@@@@@@@@@@@@@@@@@@@@@%',
        ' %@@@@@@@@@@@@@@@@@@@@@@@@%',
        ' %@@@@@@@@@@@@@@@@@@@@@@@@%',
        ' %@@@@@@@@@@@@@@@@@@@@@@@@%',
        ' %@@@@@@@@@@@@@@@@@@@@@@@@%',
        ' %@@@@@@@@@@@@@@@@@@@@@@@@%',
        ' %@@@@@@@@@@@@@@@@@@@@@@@@%'
    ];

    function pushTextArt(cells, lines, centerCol, topRow) {
        let artW = 0;
        for (const line of lines) if (line.length > artW) artW = line.length;
        const col0 = centerCol - Math.floor(artW / 2);
        for (let r = 0; r < lines.length; r++) {
            for (let c = 0; c < lines[r].length; c++) {
                const ch = lines[r][c];
                if (ch !== ' ') {
                    cells.push({
                        col: col0 + c, row: topRow + r,
                        code: ch.charCodeAt(0), kind: TK_GLYPH, phase: 0
                    });
                }
            }
        }
    }

    function generateTextTargets(count) {
        const narrow = window.matchMedia('(max-width: 768px)').matches;
        const cells = [];
        const centerRow = narrow ? 42 : 64;

        // One figure standing for the team, centered on the canvas like any
        // other shape
        pushTextArt(cells, TEXT_PERSON, 64, centerRow - 12);

        // Loose sparks adrift around the figure, kept off the drawn cells so a
        // twinkle never eats part of it
        const used = new Set();
        for (const cell of cells) used.add(cell.col * 256 + cell.row);
        const sparkCount = 26;
        for (let i = 0; i < sparkCount; i++) {
            const col = 40 + Math.floor(hash01(i * 12.7) * 48);
            const row = centerRow - 17 + Math.floor(hash01(i * 31.3) * 34);
            if (used.has(col * 256 + row)) continue;
            cells.push({ col, row, code: 0, kind: TK_SPARK, phase: hash01(i * 6.7) });
        }

        // Every particle gets a cell; consecutive particles share one, jittered
        // inside it so the converging cloud has body without blurring the type.
        // Integer cell coordinates project exactly onto the floor() boundary
        // of the projection, so the half-cell shift centers each target in its
        // bucket — without it, half the jittered particles print the glyph one
        // cell over and every letter grows a ghost outline. The z spread is
        // kept tiny for the same reason: depth perturbs the projected scale,
        // and at the edge columns even ±0.4 units walks a particle a full
        // cell sideways.
        const targets = [];
        for (let i = 0; i < count; i++) {
            const cell = cells[Math.floor(i * cells.length / count)];
            const h1 = hash01(i * 3.71), h2 = hash01(i * 7.33), h3 = hash01(i * 5.17);
            targets.push({
                x: (cell.col - 64 + 0.5 + (h1 - 0.5) * 0.7) * TEXT_UNIT_X,
                y: (centerRow - cell.row - 0.5 + (h2 - 0.5) * 0.6) * TEXT_UNIT_Y,
                // Sparks sit just behind the plane of the type, so they can
                // never win a cell from a letter through the depth test
                z: cell.kind === TK_SPARK ? 2.0 + h3 * 0.3 : (h3 - 0.5) * 0.15,
                code: cell.code, kind: cell.kind, phase: cell.phase
            });
        }
        return targets;
    }

    // --- Car diorama geometry ---
    // A model-style scene: a slab of road with animated lane markings and a
    // car with spoke-shaded wheels, held in profile view while active.
    // Targets carry a kind + phase so the render loop can animate brightness
    // (scrolling dashes, spinning wheels) without moving any particles.

    function roundedBoxSDF(x, y, z, hx, hy, hz, r) {
        const qx = Math.abs(x) - hx + r;
        const qy = Math.abs(y) - hy + r;
        const qz = Math.abs(z) - hz + r;
        const ax = Math.max(qx, 0), ay = Math.max(qy, 0), az = Math.max(qz, 0);
        return Math.hypot(ax, ay, az) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
    }

    function carCabinTaper(y) {
        // Cabin length shrinks toward the roof: windshield and rear window slopes
        const t = clamp01((y + 7.8) / 5.8);
        const front = 7.0 - t * 5.0;
        const rear = 10.5 - t * 2.0;
        return { cx: (front - rear) / 2, hx: (front + rear) / 2, t };
    }

    function carBodySDF(x, y, z) {
        // Lower body shell with wheel arches carved out
        let lower = roundedBoxSDF(x, y + 10.2, z, 16.5, 3.4, 7.0, 1.5);
        const arch = Math.hypot(Math.abs(x) - CAR_WHEEL_X, y - CAR_AXLE_Y) - CAR_ARCH_R;
        lower = Math.max(lower, -arch);
        const taper = carCabinTaper(y);
        const cabin = roundedBoxSDF(x - taper.cx, y + 4.9, z, taper.hx, 2.9, 6.0 - taper.t * 0.8, 1.2);
        return Math.min(lower, cabin);
    }

    function pushCarBody(targets, count) {
        const eps = 0.25;
        let added = 0, guard = count * 300;
        while (added < count && guard-- > 0) {
            const x = (Math.random() * 2 - 1) * 18.5;
            const y = -15.2 + Math.random() * 13.4;
            const z = (Math.random() * 2 - 1) * 7.8;
            const d = carBodySDF(x, y, z);
            if (Math.abs(d) > 1.0) continue;

            let gx = carBodySDF(x + eps, y, z) - carBodySDF(x - eps, y, z);
            let gy = carBodySDF(x, y + eps, z) - carBodySDF(x, y - eps, z);
            let gz = carBodySDF(x, y, z + eps) - carBodySDF(x, y, z - eps);
            const gl = Math.hypot(gx, gy, gz) || 1;
            gx /= gl; gy /= gl; gz /= gl;

            // Project the sample onto the surface along the gradient
            const sx = x - gx * d, sy = y - gy * d, sz = z - gz * d;
            if (sy < CAR_ROAD_Y + 0.4) continue;

            // Glasshouse: everything between beltline and roof reads as glass,
            // including the windshield and rear-window slopes
            let kind = CK_BODY;
            if (sy > -6.4 && sy < -3.2 && Math.abs(gy) < 0.6) {
                kind = CK_GLASS;
            }

            targets.push({
                x: sx, y: sy, z: sz, nx: gx, ny: gy, nz: gz,
                kind, a: 0, s: 0, bob: 1
            });
            added++;
        }
    }

    function pushCarWheels(targets, count) {
        const centers = [
            [CAR_WHEEL_X, 6.2], [CAR_WHEEL_X, -6.2],
            [-CAR_WHEEL_X, 6.2], [-CAR_WHEEL_X, -6.2]
        ];
        const perWheel = Math.floor(count / centers.length);
        for (const [wx, wz] of centers) {
            for (let i = 0; i < perWheel; i++) {
                const ang = Math.random() * Math.PI * 2;
                if (Math.random() < 0.72) {
                    // Side discs — spoke pattern animates via `a`
                    const rad = Math.sqrt(Math.random()) * CAR_WHEEL_R;
                    const side = Math.random() < 0.5 ? 1 : -1;
                    targets.push({
                        x: wx + Math.cos(ang) * rad,
                        y: CAR_AXLE_Y + Math.sin(ang) * rad,
                        z: wz + side * CAR_WHEEL_HALF,
                        nx: 0, ny: 0, nz: side,
                        kind: CK_WHEEL, a: ang,
                        s: 1.0 - rad / CAR_WHEEL_R, // hub highlight
                        bob: 0
                    });
                } else {
                    // Tread
                    targets.push({
                        x: wx + Math.cos(ang) * CAR_WHEEL_R,
                        y: CAR_AXLE_Y + Math.sin(ang) * CAR_WHEEL_R,
                        z: wz + (Math.random() * 2 - 1) * CAR_WHEEL_HALF,
                        nx: Math.cos(ang), ny: Math.sin(ang), nz: 0,
                        kind: CK_WHEEL, a: ang, s: 0, bob: 0
                    });
                }
            }
        }
    }

    function pushCarRoad(targets, count) {
        // Road surface, dense enough to read as a solid slab
        for (let i = 0; i < count; i++) {
            const z = (Math.random() * 2 - 1) * CAR_ROAD_HALF;
            const x = (Math.random() * 2 - 1) * CAR_SLAB_HALF_X;
            targets.push({
                x, y: CAR_ROAD_Y, z, nx: 0, ny: 1, nz: 0,
                kind: CK_ROAD, a: x, s: 0, bob: 0
            });
        }
    }

    function pushCarSkirt(targets, count) {
        // Vertical sides of the diorama base
        for (let i = 0; i < count; i++) {
            const y = CAR_PLATFORM_Y - Math.random() * 2.5;
            if (Math.random() < 0.5) {
                // Long front/back faces
                const side = Math.random() < 0.5 ? 1 : -1;
                targets.push({
                    x: (Math.random() * 2 - 1) * CAR_SLAB_HALF_X,
                    y, z: side * CAR_SLAB_HALF_Z,
                    nx: 0, ny: 0, nz: side,
                    kind: CK_RIM, a: 0, s: 0, bob: 0
                });
            } else {
                // Road-end faces
                const side = Math.random() < 0.5 ? 1 : -1;
                targets.push({
                    x: side * CAR_SLAB_HALF_X,
                    y, z: (Math.random() * 2 - 1) * CAR_SLAB_HALF_Z,
                    nx: side, ny: 0, nz: 0,
                    kind: CK_RIM, a: 0, s: 0, bob: 0
                });
            }
        }
    }

    function pushCarMarkings(targets, count) {
        const edgeShare = Math.floor(count * 0.4);
        for (let i = 0; i < count; i++) {
            const isEdge = i < edgeShare;
            const z = isEdge
                ? (i % 2 === 0 ? 1 : -1) * (CAR_ROAD_HALF - 1.0)
                : (Math.random() * 2 - 1) * 0.45;
            const x = (Math.random() * 2 - 1) * CAR_SLAB_HALF_X;
            targets.push({
                x, y: CAR_ROAD_Y + 0.15, z, nx: 0, ny: 1, nz: 0,
                kind: isEdge ? CK_EDGE : CK_DASH, a: x, s: 0, bob: 0
            });
        }
    }

    function generateCarTargets(count) {
        const targets = [];
        pushCarBody(targets, Math.floor(count * 0.44));
        pushCarWheels(targets, Math.floor(count * 0.14));
        pushCarRoad(targets, Math.floor(count * 0.28));
        pushCarMarkings(targets, Math.floor(count * 0.06));
        pushCarSkirt(targets, Math.floor(count * 0.08));
        // Pad any rounding shortfall with extra road points
        pushCarRoad(targets, count - targets.length);
        // Lift the whole diorama so it sits centered in frame
        for (const t of targets) t.y += 9.0;
        return targets.slice(0, count);
    }

    // --- Rocket geometry ---
    // Fuselage, nose cone, boat tail and nozzle are all surfaces of revolution,
    // so one frustum walker builds every one of them. Fins are flat sheets in
    // planes through the axis, and the plume is a loose cone the render loop
    // stretches and shakes.

    // Rejection-sample along the height so points spread evenly over the
    // surface instead of piling up on the narrow end of a taper.
    function pushRocketFrustum(targets, count, y0, r0, y1, r1, kind, shade) {
        const h = y1 - y0;
        const slope = (r0 - r1) / h;   // outward normal leans by the taper
        const rMax = Math.max(r0, r1) || 1;
        let added = 0, guard = count * 40;
        while (added < count && guard-- > 0) {
            const t = Math.random();
            const r = r0 + (r1 - r0) * t;
            if (Math.random() > r / rMax) continue;

            const a = Math.random() * Math.PI * 2;
            const ca = Math.cos(a), sa = Math.sin(a);
            const nl = Math.hypot(1, slope) || 1;
            targets.push({
                x: ca * r, y: y0 + h * t, z: sa * r,
                nx: ca / nl, ny: slope / nl, nz: sa / nl,
                kind, phase: t, tex: shade, ang: a
            });
            added++;
        }
    }

    function pushRocketBody(targets, count) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const y = ROCKET_BODY_BOT + Math.random() * (ROCKET_BODY_TOP - ROCKET_BODY_BOT);
            const ca = Math.cos(a), sa = Math.sin(a);
            // A painted stripe round the midsection, so the hull is not one tone
            const band = (y > ROCKET_BAND_LO && y < ROCKET_BAND_HI)
                ? ROCKET_BAND_SHADE : 1.0;
            targets.push({
                x: ca * ROCKET_R, y, z: sa * ROCKET_R,
                nx: ca, ny: 0, nz: sa,
                kind: RK_BODY, phase: 0, tex: band, ang: a
            });
        }
    }

    function pushRocketFins(targets, count) {
        // Outline in (radius, height): swept back, so the trailing corner sits
        // below the nozzle throat the way a hobby fin does
        const rootLead = -5.0, rootTrail = -18.0;
        const tipLead = -14.5, tipTrail = -22.5;
        for (let i = 0; i < count; i++) {
            const fin = Math.floor(Math.random() * ROCKET_FINS);
            const a0 = fin * (Math.PI * 2 / ROCKET_FINS);
            const ca = Math.cos(a0), sa = Math.sin(a0);

            const u = Math.random();          // 0 at the root, 1 at the tip
            const v = Math.random();          // across the chord
            const r = ROCKET_R + (ROCKET_FIN_R - ROCKET_R) * u;
            const lead = rootLead + (tipLead - rootLead) * u;
            const trail = rootTrail + (tipTrail - rootTrail) * u;
            const y = lead + (trail - lead) * v;

            // Thins to nothing at the free edges so it is not a slab
            const edge = Math.sqrt(clamp01(2.6 * Math.min(v, 1 - v)));
            const t = ROCKET_FIN_T * (1 - u * 0.55) * edge;
            if (t < 0.04) continue;

            const side = Math.random() < 0.5 ? 1 : -1;
            targets.push({
                x: ca * r - sa * side * t,
                y,
                z: sa * r + ca * side * t,
                nx: -sa * side, ny: 0, nz: ca * side,
                kind: RK_FIN, phase: u, tex: v, ang: a0
            });
        }
    }

    function pushRocketWindow(targets, count) {
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const rr = Math.sqrt(Math.random());
            // Wrap the disc onto the hull: one axis is arc length, the other is y
            const ang = (Math.cos(a) * rr * ROCKET_WINDOW_R) / ROCKET_R;
            const ca = Math.cos(ang), sa = Math.sin(ang);
            targets.push({
                x: ca * (ROCKET_R + 0.14),
                y: ROCKET_WINDOW_Y + Math.sin(a) * rr * ROCKET_WINDOW_R,
                z: sa * (ROCKET_R + 0.14),
                nx: ca, ny: 0, nz: sa,
                kind: RK_WINDOW, phase: rr, tex: 1.0, ang: ang
            });
        }
    }

    function pushRocketFlame(targets, count) {
        for (let i = 0; i < count; i++) {
            // Denser at the throat, which is both the widest part of the plume
            // and the brightest. An exponent below 1 would bias the other way
            // and leave the throat too sparse to cover.
            const u = Math.pow(Math.random(), 1.7);
            // Bulges just clear of the bell, then necks down toward the tip
            const w = ROCKET_FLAME_W * (0.85 + 0.4 * Math.sin(u * 3.0)) * (1 - u * 0.75);
            const a = Math.random() * Math.PI * 2;
            const rr = Math.sqrt(Math.random());
            targets.push({
                x: Math.cos(a) * rr * w,
                y: ROCKET_BELL_Y - u * ROCKET_FLAME_LEN,
                z: Math.sin(a) * rr * w,
                nx: 0, ny: -1, nz: 0,
                // Half-width at this height, not the radial fraction. Only the
                // near skin of the plume survives the depth test, and every one
                // of those points sits at a radial fraction of about 0.97, so
                // heat has to come from the distance across the screen instead.
                kind: RK_FLAME, phase: u, tex: w, ang: a
            });
        }
    }

    // Backdrop, not part of the airframe: these are left in view space, so the
    // roll and the tilt skip them and the field stays put behind the rocket.
    function pushRocketStars(targets, count) {
        for (let i = 0; i < count; i++) {
            targets.push({
                x: (Math.random() * 2 - 1) * ROCKET_STAR_X,
                y: (Math.random() * 2 - 1) * ROCKET_STAR_Y,
                z: ROCKET_STAR_Z + Math.random() * 8.0,
                nx: 0, ny: 0, nz: -1,
                kind: RK_STAR, phase: Math.random(), tex: Math.random(), ang: 0
            });
        }
    }

    function generateRocketTargets(count) {
        const targets = [];
        const share = f => Math.max(1, Math.floor(count * f));
        pushRocketBody(targets, share(0.20));
        pushRocketFrustum(targets, share(0.11), ROCKET_BODY_TOP, ROCKET_R,
            ROCKET_NOSE_TIP, 0.0, RK_NOSE, 1.0);
        pushRocketFrustum(targets, share(0.03), ROCKET_BODY_BOT, ROCKET_R,
            ROCKET_TAIL_Y, ROCKET_TAIL_R, RK_BODY, 1.0);
        pushRocketFrustum(targets, share(0.05), ROCKET_TAIL_Y, ROCKET_TAIL_R,
            ROCKET_BELL_Y, ROCKET_BELL_R, RK_NOZZLE, 1.0);
        pushRocketFins(targets, share(0.14));
        pushRocketWindow(targets, share(0.015));
        pushRocketFlame(targets, share(0.36));

        // Centre the stack on its own axis, so tipping it over in the render
        // leaves the diagonal centred in frame rather than hanging off a corner
        for (const t of targets) t.y += ROCKET_AXIAL_SHIFT;

        pushRocketStars(targets, share(0.055));
        if (targets.length < count) pushRocketStars(targets, count - targets.length);
        return targets.slice(0, count);
    }

    // --- Constellation geometry ---
    // Every target carries its sky position in x/y/z, which is also what the
    // morph orders by, since the sky is what a visitor arrives at. Round the
    // hole each one is polar: fr is its radius and fa its angle, in the disk
    // plane for the disk and in the picture plane for the images. Anything in
    // the sky that falls into the disk keeps its sky angle as its starting
    // angle on the disk, so nothing has to cross over anything else on the way.

    // Angular speed of an orbit at radius r: Keplerian, so the inner disk
    // laps the outer one and shears whatever falls in into spiral arms
    function holeSpin(r) {
        return HOLE_SPIN * Math.pow(HOLE_DISK_IN / Math.max(r, 1), 1.5);
    }

    // Sky radius to disk radius. Monotonic, so stars and lines that were
    // neighbours in the figure are still neighbours in the disk.
    function constDiskRadius(skyR) {
        return HOLE_DISK_IN + (HOLE_DISK_OUT - HOLE_DISK_IN) * clamp01((skyR - 3.0) / 20.0);
    }

    // Where a point is on its way into the disk, a fraction k of the way from
    // the sky. Radius and plane both blend, and the angle winds on at the
    // orbit speed of where it is headed, so the inner strands overtake the
    // outer ones as they fall. The plane is passed in as its sine and cosine:
    // straight up is the sky, nearly flat is the disk. Written to holeOut as
    // x, y, z and the cosine of the angle, which the beaming needs.
    const holeOut = new Float32Array(4);
    function holePlace(skyR, angle, diskR, spin, k, tau, ps, pc, fling) {
        const r = skyR + (diskR - skyR) * k + fling;
        const a = angle + spin * tau * k;
        const ca = Math.cos(a), sa = Math.sin(a);
        holeOut[0] = r * ca;
        holeOut[1] = r * sa * ps;
        holeOut[2] = r * sa * pc;
        holeOut[3] = ca;
    }

    // Tone of the disk at radius r: hottest at the inner edge, with clumps
    // that the differential rotation winds into spiral streaks, brighter on
    // the side coming toward you. Spaced under the ~0.45 mark where this glyph
    // set saturates, apart from the inner edge on the near side, which is
    // meant to burn.
    function holeDiskTone(r, a0, cosA, pc) {
        const q = (r - HOLE_DISK_IN) / (HOLE_DISK_OUT - HOLE_DISK_IN);
        const clump = Math.sin(a0 * 5.0 + r * 1.1) > 0.35 ? 0.08 : 0;
        return (0.42 - q * 0.28 + clump) * (1 - HOLE_BEAMING * cosA * pc);
    }

    function pushConstTarget(targets, x, y, z, kind, ref, u, fr, fa, phase) {
        targets.push({ x, y, z, kind, ref, u, fr, fa, sr: Math.hypot(x, y), phase });
    }

    // Lines in the sky, strands of the disk once they fall in
    function pushConstLines(targets, count) {
        const total = CONST_LINKS.reduce((s, L) => s + L.len, 0);
        for (let li = 0; li < CONST_LINKS.length; li++) {
            const L = CONST_LINKS[li];
            const sa = CONST_STARS[L.a], sb = CONST_STARS[L.b];
            const n = Math.max(1, Math.round(count * L.len / total));
            const gap = Math.min(0.4, CONST_LINE_GAP / L.len);
            for (let i = 0; i < n; i++) {
                const u = gap + Math.random() * (1 - 2 * gap);
                const x = lerp(sa.x, sb.x, u), y = lerp(sa.y, sb.y, u);
                pushConstTarget(targets, x, y, lerp(sa.z, sb.z, u), PK_LINE, li, u,
                    constDiskRadius(Math.hypot(x, y)), Math.atan2(y, x), Math.random());
            }
        }
    }

    // Dark in the sky, so the sky position only matters to the morph. Denser
    // toward the hot inner edge.
    function pushHoleDisk(targets, count) {
        for (let i = 0; i < count; i++) {
            const r = HOLE_DISK_IN + (HOLE_DISK_OUT - HOLE_DISK_IN) * Math.pow(Math.random(), 1.4);
            const a = Math.random() * Math.PI * 2;
            pushConstTarget(targets, r * Math.cos(a), r * Math.sin(a) * Math.sin(HOLE_TILT), 0,
                PK_DISK, 0, 0, r, a, Math.random());
        }
    }

    // Images in the picture plane. The horizon is a filled disc, stored as a
    // fraction of the radius so it can grow and collapse.
    function pushHoleImages(targets, count) {
        const nVoid = Math.floor(count * 0.36), nRing = Math.floor(count * 0.18);
        for (let i = 0; i < nVoid; i++) {
            const f = Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
            pushConstTarget(targets, f * HOLE_R * Math.cos(a), f * HOLE_R * Math.sin(a), 0,
                PK_VOID, 0, 0, f, a, Math.random());
        }
        // Exactly on the circle, since it is printed one cell thick
        for (let i = 0; i < nRing; i++) {
            const r = HOLE_R + HOLE_RING;
            const a = Math.random() * Math.PI * 2;
            pushConstTarget(targets, r * Math.cos(a), r * Math.sin(a), 0,
                PK_RING, 0, 0, r, a, Math.random());
        }
        // Lensed arcs: widest straight over the top, a thinner one underneath,
        // both thinning to nothing at the sides where they meet the disk.
        // u is how far out across the arc a point sits.
        let added = nVoid + nRing, guard = count * 20;
        while (added < count && guard-- > 0) {
            const a = Math.random() * Math.PI * 2;
            const sa = Math.sin(a);
            const w = sa > 0 ? HOLE_LENS_TOP * Math.pow(sa, 0.7) : HOLE_LENS_BOT * Math.pow(-sa, 0.9);
            if (w < 0.3) continue;
            const u = Math.random();
            const r = HOLE_R + HOLE_RING + 0.6 + u * w;
            pushConstTarget(targets, r * Math.cos(a), r * sa, 0, PK_LENS, 0, u, r, a, Math.random());
            added++;
        }
    }

    // A star is one cell and one particle. More than one straddles a cell
    // edge while the morph settles and the star prints twice. Riders fall
    // into the disk and ride it round as hot spots; the rest fall all the way
    // in. Bright stars also get a pair of arms a cell either side, lit only in
    // a glint.
    function pushConstStars(targets) {
        for (let si = 0; si < CONST_STARS.length; si++) {
            const s = CONST_STARS[si];
            const r = Math.hypot(s.x, s.y), a = Math.atan2(s.y, s.x);
            const fr = si < CONST_RIDERS ? constDiskRadius(r) : HOLE_R * 0.6;
            pushConstTarget(targets, s.x, s.y, s.z, PK_STAR, si, 0, fr, a, Math.random());
            if (s.tier !== 0) continue;
            for (let side = -1; side <= 1; side += 2) {
                pushConstTarget(targets, s.x + side * TEXT_UNIT_X, s.y, s.z - 0.05,
                    PK_GLINT, si, side, fr, a, Math.random());
            }
        }
    }

    function generatePortalTargets(count) {
        const targets = [];
        const share = f => Math.max(1, Math.floor(count * f));
        pushConstStars(targets);
        pushConstLines(targets, share(0.30));
        pushHoleImages(targets, share(0.28));
        if (targets.length < count) pushHoleDisk(targets, count - targets.length);
        return targets.slice(0, count);
    }

    // --- Apple geometry ---
    // The body is a surface of revolution about y. Its profile is a squashed
    // circle, wider through the shoulder than the base, with the stem cavity
    // and the calyx end pulled in along the axis. Normals come from the
    // profile's own tangent, so the cavity shades as a cavity. The stem and
    // leaf are stored where they hang on a fresh apple; the render loop wilts
    // them from there.

    // Profile at angle phi down from the stem: [distance from the axis, height]
    function appleProfile(phi) {
        const t = Math.cos(phi), b = Math.PI - phi;
        // Fuller and flatter through the lower half, so the base is broad
        // and round rather than coming to a point like a strawberry
        const lower = t < 0;
        const sn = Math.sin(phi);
        return [
            APPLE_R * (lower ? Math.pow(sn, 0.6) : sn) * (1 + APPLE_SHOULDER * t),
            APPLE_R * APPLE_SQUASH * t * (lower ? 0.82 : 1)
                - APPLE_DIMPLE_TOP * Math.exp(-(phi * phi) / 0.2)
                + APPLE_DIMPLE_BOT * Math.exp(-(b * b) / 0.12)
                + APPLE_LIFT
        ];
    }
    // A point on the skin, with the calyx lobes and the raised shoulders
    function appleSurface(phi, theta) {
        const [rho, y] = appleProfile(phi);
        const lobe = 1 + APPLE_LOBES * Math.cos(theta * 5.0) * Math.max(0, -Math.cos(phi));
        const shoulder = (phi - 0.6) / 0.55;
        const crest = APPLE_CREST * Math.cos(theta * 2.0) * Math.exp(-shoulder * shoulder);
        return [rho * lobe * Math.cos(theta), y + crest, rho * lobe * Math.sin(theta)];
    }
    const APPLE_CAVITY_Y = appleProfile(0)[1];
    const APPLE_BASE_Y = appleProfile(Math.PI)[1];
    const APPLE_LEAF_X = APPLE_STEM_LEAN * APPLE_LEAF_AT * APPLE_LEAF_AT;
    const APPLE_LEAF_Y = APPLE_CAVITY_Y + APPLE_LEAF_AT * APPLE_STEM_LEN;
    // The scan runs from just over the stem to just under the base
    const APPLE_SCAN_TOP = APPLE_CAVITY_Y + APPLE_STEM_LEN + 1.0;
    const APPLE_SCAN_BOT = APPLE_BASE_Y - 1.0;

    // Smooth, low-frequency noise over the skin, so rot spreads in blotches
    // with a ragged edge instead of as a clean circle
    function appleBlotch(x, y, z) {
        return 0.5 + 0.25 * Math.sin(x * 4.1 + y * 2.3 + 0.7) * Math.sin(z * 3.7 - x * 1.9 + 1.3)
            + 0.25 * Math.sin(y * 5.3 - z * 2.9 + 2.1) * Math.sin(x * 2.7 + z * 4.4);
    }

    function pushAppleSkin(targets, count) {
        const eps = 0.01;
        const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
        const spots = APPLE_SPOTS.map(s => [
            Math.sin(s.phi) * Math.cos(s.theta), Math.cos(s.phi), Math.sin(s.phi) * Math.sin(s.theta)
        ]);
        for (let i = 0; i < count; i++) {
            const phi = Math.acos(1 - 2 * Math.random());
            const theta = Math.random() * Math.PI * 2;
            const P = appleSurface(phi, theta);
            // Outward normal from the two tangents, kept off the poles where
            // they degenerate
            const ph = Math.min(Math.PI - 0.02, Math.max(0.02, phi));
            const dPhi = sub(appleSurface(ph + eps, theta), appleSurface(ph - eps, theta));
            const dTh = sub(appleSurface(ph, theta + eps), appleSurface(ph, theta - eps));
            let nx = dTh[1] * dPhi[2] - dTh[2] * dPhi[1];
            let ny = dTh[2] * dPhi[0] - dTh[0] * dPhi[2];
            let nz = dTh[0] * dPhi[1] - dTh[1] * dPhi[0];
            const nl = Math.hypot(nx, ny, nz) || 1;
            nx /= nl; ny /= nl; nz /= nl;
            const ct = Math.cos(theta), st = Math.sin(theta);
            const ux = Math.sin(phi) * ct, uy = Math.cos(phi), uz = Math.sin(phi) * st;
            // When the rot reaches this point: the soonest of the spots, from
            // how far round the skin it is, pulled earlier or later by the
            // blotch noise and a finer ragged edge
            const ragged = (hash01(Math.floor(theta * 7.0) * 13.1 + Math.floor(phi * 7.0) * 7.7) - 0.5) * 0.18;
            const blotch = appleBlotch(ux, uy, uz) * 0.25 + ragged;
            let onset = 1e9;
            for (let k = 0; k < spots.length; k++) {
                const d = Math.acos(Math.max(-1, Math.min(1,
                    ux * spots[k][0] + uy * spots[k][1] + uz * spots[k][2])));
                const when = APPLE_SPOTS[k].start
                    + Math.max(0, d - blotch) / APPLE_SPOTS[k].speed;
                if (when < onset) onset = when;
            }
            targets.push({
                x: P[0], y: P[1], z: P[2], nx, ny, nz,
                kind: AK_SKIN, s: 0, onset,
                // Speckle for the rotten flesh, and the creases it slumps into
                tex: hash01(Math.floor(theta * 22.0) * 3.1 + Math.floor(phi * 18.0) * 9.3),
                wrinkle: Math.sin(theta * 5.0 + phi * 2.0) * Math.sin(phi * 4.0 - theta * 1.5)
            });
        }
    }

    function pushAppleStem(targets, count) {
        for (let i = 0; i < count; i++) {
            const u = Math.random();
            const a = Math.random() * Math.PI * 2;
            // Slightly flared where it snapped off the tree
            const r = APPLE_STEM_R * (u > 0.92 ? 1.35 : 1.0);
            targets.push({
                x: APPLE_STEM_LEAN * u * u + Math.cos(a) * r,
                y: APPLE_CAVITY_Y + u * APPLE_STEM_LEN,
                z: Math.sin(a) * r,
                nx: Math.cos(a), ny: 0, nz: Math.sin(a),
                kind: AK_STEM, s: u, onset: 1e9, tex: 0, wrinkle: 0
            });
        }
    }

    // A single sheet off the stem, up and out toward the key light and a
    // little toward the camera, folded along its midrib. It has to clear the
    // shoulder: lying over the top of the fruit it shades the same as the
    // skin and vanishes. Tex marks the midrib and veins.
    function pushAppleLeaf(targets, count) {
        let dx = 0.85, dy = 0.5, dz = -0.2;
        const dl = Math.hypot(dx, dy, dz);
        dx /= dl; dy /= dl; dz /= dl;
        // Across the blade: perpendicular to the midrib, kept level
        let sx = -dz, sz = dx;
        const sl = Math.hypot(sx, sz);
        sx /= sl; sz /= sl;
        // Face normal of the blade
        const fnx = dy * sz, fny = dz * sx - dx * sz, fnz = -dy * sx;
        for (let i = 0; i < count; i++) {
            const s = Math.random();
            const w = Math.random() * 2 - 1;
            const half = APPLE_LEAF_W * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.05)), 0.85)
                * (1 - 0.3 * s);
            const off = w * half;
            // Folded up along the midrib, and bowed along its length
            const lift = Math.abs(off) * 0.3 + Math.sin(Math.PI * s) * 0.9;
            const vein = Math.abs(w) < 0.1 ? 1 : (Math.sin(s * 16.0 - Math.abs(w) * 4.0) > 0.86 ? 0.6 : 0);
            let nx = fnx - Math.sign(w) * sx * 0.3, ny = fny, nz = fnz - Math.sign(w) * sz * 0.3;
            const nl = Math.hypot(nx, ny, nz) || 1;
            targets.push({
                x: APPLE_LEAF_X + dx * s * APPLE_LEAF_LEN + sx * off + fnx * lift,
                y: APPLE_LEAF_Y + dy * s * APPLE_LEAF_LEN + fny * lift,
                z: dz * s * APPLE_LEAF_LEN + sz * off + fnz * lift,
                nx: nx / nl, ny: ny / nl, nz: nz / nl,
                kind: AK_LEAF, s, onset: 1e9, tex: vein, wrinkle: 0
            });
        }
    }

    function generateAppleTargets(count) {
        const targets = [];
        const share = f => Math.max(1, Math.floor(count * f));
        pushAppleStem(targets, share(0.035));
        pushAppleLeaf(targets, share(0.09));
        if (targets.length < count) pushAppleSkin(targets, count - targets.length);
        return targets.slice(0, count);
    }

    function buildSortedIndices(length, extractor) {
        return Array.from({ length }, (_, i) => {
            const { x, y, z } = extractor(i);
            return { i, y, angle: Math.atan2(z, x) };
        }).sort((a, b) => {
            if (a.y === b.y) return a.angle - b.angle;
            return a.y - b.y;
        }).map(n => n.i);
    }

    // --- Initialization ---
    function initLogo() {
        const lines = LOGO_ART.split('\n');
        let totalC = 0, totalR = 0, count = 0;
        for (let r = 0; r < lines.length; r++) {
            for (let c = 0; c < lines[r].length; c++) {
                if (lines[r][c] !== ' ' && lines[r][c] !== '\n') {
                    totalC += c; totalR += r; count++;
                }
            }
        }
        const centerX = count > 0 ? totalC / count : 0;
        const centerY = count > 0 ? totalR / count : 0;

        for (let r = 0; r < lines.length; r++) {
            for (let c = 0; c < lines[r].length; c++) {
                let char = lines[r][c];
                if (char && char !== ' ' && char !== '\n') {
                    const baseX = (c - centerX) * GRID_X;
                    const baseY = -(r - centerY) * GRID_Y;
                    const weight = getCharWeight(char);

                    for (let z = -EXTRUSION_DEPTH; z <= EXTRUSION_DEPTH; z += Z_STEP) {
                        let isFace = (z > EXTRUSION_DEPTH - 1.0 || z < -EXTRUSION_DEPTH + 1.0);
                        particles.push({
                            x: baseX + (Math.random() - 0.5) * XY_JITTER,
                            y: baseY + (Math.random() - 0.5) * XY_JITTER,
                            z: z,
                            logoX: baseX + (Math.random() - 0.5) * XY_JITTER,
                            logoY: baseY + (Math.random() - 0.5) * XY_JITTER,
                            logoZ: z,
                            logoIsFace: isFace,
                            logoFaceSign: z >= 0 ? 1 : -1,
                            logoWeight: weight,
                            fishX: 0, fishY: 0, fishZ: 0,
                            fishNX: 0, fishNY: 0, fishNZ: 1,
                            fishKind: FK_BODY, fishFlap: 0, fishTex: 0, fishPhase: 0,
                            scopeX: 0, scopeY: 0, scopeZ: 0,
                            scopeNX: 0, scopeNY: 1, scopeNZ: 0,
                            scopeKind: MK_BASE, scopePhase: 0, scopeSpin: 0,
                            dwarfX: 0, dwarfY: 0, dwarfZ: 0,
                            dwarfNX: 0, dwarfNY: 0, dwarfNZ: 0,
                            dwarfBandPhase: 0, dwarfSwirlPhase: 0,
                            dwarfStormPhase: 0, dwarfDriftPhase: 0,
                            dwarfEquatorBias: 0,
                            carX: 0, carY: 0, carZ: 0,
                            carNX: 0, carNY: 0, carNZ: 0,
                            carKind: CK_ROAD, carPhase: 0,
                            carShade: 0, carBob: 0,
                            rockX: 0, rockY: 0, rockZ: 0,
                            rockNX: 0, rockNY: 1, rockNZ: 0,
                            rockKind: RK_BODY, rockPhase: 0,
                            rockTex: 1, rockAng: 0,
                            portSX: 0, portSY: 0, portSZ: 0, portSR: 0,
                            portKind: PK_DISK, portRef: 0, portU: 0,
                            portFR: 0, portFA: 0, portSpin: 0, portPhase: 0,
                            textX: 0, textY: 0, textZ: 0,
                            textCode: 32, textKind: TK_GLYPH,
                            textPhase: 0, textReveal: 1,
                            appX: 0, appY: 0, appZ: 0,
                            appNX: 0, appNY: 0, appNZ: 1,
                            appKind: AK_SKIN, appS: 0, appOnset: 1e9,
                            appTex: 0, appWrinkle: 0
                        });
                    }
                }
            }
        }
    }

    initLogo();

    // Generate targets
    const fishTargets = generateFishTargets(particles.length);
    const scopeTargets = generateScopeTargets(particles.length);
    const dwarfTargets = generateDwarfTargets(particles.length);
    const carTargets = generateCarTargets(particles.length);
    const rocketTargets = generateRocketTargets(particles.length);
    const portalTargets = generatePortalTargets(particles.length);
    const textTargets = generateTextTargets(particles.length);
    const appleTargets = generateAppleTargets(particles.length);

    const particleOrder = buildSortedIndices(particles.length, i => ({ x: particles[i].logoX, y: particles[i].logoY, z: particles[i].logoZ }));
    const fishOrder = buildSortedIndices(fishTargets.length, i => fishTargets[i]);
    const scopeOrder = buildSortedIndices(scopeTargets.length, i => scopeTargets[i]);
    const dwarfOrder = buildSortedIndices(dwarfTargets.length, i => dwarfTargets[i]);
    const carOrder = buildSortedIndices(carTargets.length, i => carTargets[i]);
    const rocketOrder = buildSortedIndices(rocketTargets.length, i => rocketTargets[i]);
    const portalOrder = buildSortedIndices(portalTargets.length, i => portalTargets[i]);
    const textOrder = buildSortedIndices(textTargets.length, i => textTargets[i]);
    const appleOrder = buildSortedIndices(appleTargets.length, i => appleTargets[i]);

    for (let k = 0; k < particles.length; k++) {
        const p = particles[particleOrder[k]];

        if (k < fishTargets.length) {
            const tFish = fishTargets[fishOrder[k]];
            p.fishX = tFish.x; p.fishY = tFish.y; p.fishZ = tFish.z;
            p.fishNX = tFish.nx; p.fishNY = tFish.ny; p.fishNZ = tFish.nz;
            p.fishKind = tFish.kind;
            p.fishFlap = tFish.flap;
            p.fishTex = tFish.tex;
            p.fishPhase = tFish.a;
        }

        if (k < scopeTargets.length) {
            const tScope = scopeTargets[scopeOrder[k]];
            p.scopeX = tScope.x; p.scopeY = tScope.y; p.scopeZ = tScope.z;
            p.scopeNX = tScope.nx; p.scopeNY = tScope.ny; p.scopeNZ = tScope.nz;
            p.scopeKind = tScope.kind;
            p.scopePhase = tScope.a;
            p.scopeSpin = tScope.spin;
        }

        const tDwarf = dwarfTargets[dwarfOrder[k]];
        p.dwarfX = tDwarf.x; p.dwarfY = tDwarf.y; p.dwarfZ = tDwarf.z;
        const dwarfLen = Math.hypot(tDwarf.x, tDwarf.y, tDwarf.z) || 1;
        p.dwarfNX = tDwarf.x / dwarfLen; p.dwarfNY = tDwarf.y / dwarfLen; p.dwarfNZ = tDwarf.z / dwarfLen;
        p.dwarfBandPhase = p.dwarfNY * 12.0 + p.dwarfNX * 1.5;
        p.dwarfSwirlPhase = (p.dwarfNX * 5.5) + (p.dwarfNZ * 4.5) + (p.dwarfNY * 2.0);
        p.dwarfStormPhase = Math.atan2(p.dwarfNZ, p.dwarfNX) * 2.6 + p.dwarfNY * 3.5;
        p.dwarfDriftPhase = (p.dwarfNX * 3.0) - (p.dwarfNZ * 2.0) + p.dwarfNY * 1.5;
        p.dwarfEquatorBias = 1.0 - Math.abs(p.dwarfNY);

        if (k < carTargets.length) {
            const tCar = carTargets[carOrder[k]];
            p.carX = tCar.x; p.carY = tCar.y; p.carZ = tCar.z;
            p.carNX = tCar.nx; p.carNY = tCar.ny; p.carNZ = tCar.nz;
            p.carKind = tCar.kind;
            p.carPhase = tCar.a;
            p.carShade = tCar.s;
            p.carBob = tCar.bob;
        }

        if (k < rocketTargets.length) {
            const tRock = rocketTargets[rocketOrder[k]];
            p.rockX = tRock.x; p.rockY = tRock.y; p.rockZ = tRock.z;
            p.rockNX = tRock.nx; p.rockNY = tRock.ny; p.rockNZ = tRock.nz;
            p.rockKind = tRock.kind;
            p.rockPhase = tRock.phase;
            p.rockTex = tRock.tex;
            p.rockAng = tRock.ang;
        }

        if (k < portalTargets.length) {
            const tPort = portalTargets[portalOrder[k]];
            p.portSX = tPort.x; p.portSY = tPort.y; p.portSZ = tPort.z;
            p.portSR = tPort.sr;
            p.portKind = tPort.kind;
            p.portRef = tPort.ref;
            p.portU = tPort.u;
            p.portFR = tPort.fr;
            p.portFA = tPort.fa;
            p.portSpin = holeSpin(tPort.fr);
            p.portPhase = tPort.phase;
        }

        if (k < appleTargets.length) {
            const tApple = appleTargets[appleOrder[k]];
            p.appX = tApple.x; p.appY = tApple.y; p.appZ = tApple.z;
            p.appNX = tApple.nx; p.appNY = tApple.ny; p.appNZ = tApple.nz;
            p.appKind = tApple.kind;
            p.appS = tApple.s;
            p.appOnset = tApple.onset;
            p.appTex = tApple.tex;
            p.appWrinkle = tApple.wrinkle;
        }

        if (k < textTargets.length) {
            const tText = textTargets[textOrder[k]];
            p.textX = tText.x; p.textY = tText.y; p.textZ = tText.z;
            p.textCode = tText.code;
            p.textKind = tText.kind;
            p.textPhase = tText.phase;
            // Staggered thresholds: the type crystallizes out of the arriving
            // cloud one cell at a time, and crumbles back the same way
            p.textReveal = 0.55 + hash01(k * 0.77) * 0.4;
        }

        p.logo2X = p.logoX; p.logo2Y = p.logoY; p.logo2Z = p.logoZ;
    }

    // --- Shape Vector System ---
    const shapeData = computeShapeVectors("'Courier New', Courier, monospace");

    // --- Rendering Setup ---
    const screenElement = document.getElementById('solid-logo-canvas');
    const asciiColumn = screenElement.closest('.ascii-column') || screenElement;
    const logoLoop = createVisibilityController(asciiColumn);
    // The tallest shape is the rocket at 54 rows, so on a phone the bottom half
    // of a square grid is guaranteed empty. Trimming it is a third off the
    // string this rebuilds every frame, which is the expensive part here.
    const NARROW = window.matchMedia('(max-width: 768px)');
    const surface = createTextSurface(128, NARROW.matches ? 84 : 128);
    const width = surface.width;
    const height = surface.height;
    const zbuffer = surface.zBuffer;
    const textBuffer = surface.charBuffer;
    const colorBuffer = surface.colorBuffer;
    const DEFAULT_PACKED_COLOR = packColor(COLOR_DEFAULT.r, COLOR_DEFAULT.g, COLOR_DEFAULT.b);

    // Brightness buffer for shape-vector post-processing
    const brightnessBuffer = new Float32Array(width * height);

    // Char metrics
    let charWidth = 6, charHeight = 10;

    function updateLogoMetrics() {
        const measureElement = document.createElement('span');
        const style = getComputedStyle(screenElement);
        measureElement.style.fontFamily = style.fontFamily;
        measureElement.style.fontSize = style.fontSize;
        measureElement.style.lineHeight = style.lineHeight;
        measureElement.style.position = 'absolute';
        measureElement.style.visibility = 'hidden';
        measureElement.textContent = 'X';
        document.body.appendChild(measureElement);
        let rect = measureElement.getBoundingClientRect();
        charWidth = rect.width || 6;
        let lineHeight = parseFloat(style.lineHeight);
        if (!lineHeight || Number.isNaN(lineHeight)) {
            lineHeight = (rect.height * 0.9) || 10;
        }
        charHeight = lineHeight;
        document.body.removeChild(measureElement);
    }

    updateLogoMetrics();
    window.addEventListener('resize', updateLogoMetrics);

    // --- Drag Interaction ---
    let angle = 0;
    let time = 0;
    let isDragging = false;
    let lastDragX = 0;
    let angularVelocity = 0; // current spin rate (radians per frame-unit)
    const DRAG_SENSITIVITY = 0.008;
    const MOMENTUM_DECAY = 0.07; // how fast velocity settles back to auto-speed (0-1, higher = faster)

    asciiColumn.style.cursor = 'grab';

    function handleDragStart(clientX) {
        isDragging = true;
        lastDragX = clientX;
        angularVelocity = 0;
        asciiColumn.style.cursor = 'grabbing';
    }

    function handleDragMove(clientX) {
        if (!isDragging) return;
        const dx = clientX - lastDragX;
        angularVelocity = dx * DRAG_SENSITIVITY; // track instantaneous velocity
        angle += angularVelocity;
        lastDragX = clientX;
    }

    function handleDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        // angularVelocity carries the release momentum
        asciiColumn.style.cursor = 'grab';
    }

    // Mouse events
    asciiColumn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handleDragStart(e.clientX);
    });
    window.addEventListener('mousemove', (e) => handleDragMove(e.clientX));
    window.addEventListener('mouseup', handleDragEnd);

    // Touch events. On mobile the graphic covers the top of the screen, so
    // swiping over it is how people scroll the page. Claiming the gesture on
    // touchstart trapped them; instead the first bit of movement decides, and
    // only a clearly horizontal drag spins the model.
    let touchTracking = false, touchIntent = 0; // 0 undecided, 1 spin, -1 scroll
    let touchStartX = 0, touchStartY = 0;

    asciiColumn.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            touchTracking = true;
            touchIntent = 0;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (!touchTracking || e.touches.length !== 1) return;
        const t = e.touches[0];
        if (touchIntent === 0) {
            const dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            // Ties go to scrolling, which matters more than spinning
            touchIntent = Math.abs(dx) > Math.abs(dy) ? 1 : -1;
            if (touchIntent === 1) handleDragStart(touchStartX);
            else { touchTracking = false; return; }
        }
        e.preventDefault();
        handleDragMove(t.clientX);
    }, { passive: false });

    const endTouch = () => { touchTracking = false; touchIntent = 0; handleDragEnd(); };
    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);

    // State: 0 = Logo, 1 = Microscope, 2 = Fish, 3 = Dwarf, 4 = Logo2, 5 = Car,
    //        6 = Rocket, 7 = Constellation, 8 = Members stage, 9 = Apple
    const SHAPE_KEYS = ['logo', 'scope', 'fish', 'dwarf', 'logo2', 'car', 'rocket', 'portal', 'text', 'apple'];
    const STATE_SHAPE = ['logo', 'scope', 'fish', 'dwarf', 'logo2', 'car', 'rocket', 'portal', 'text', 'apple'];

    let targetState = 0;
    let lastTimestamp = performance.now();
    const currentWeights = {
        logo: 1, scope: 0, fish: 0, dwarf: 0, logo2: 0, car: 0, rocket: 0, portal: 0, text: 0,
        apple: 0
    };
    let targetWeights = getTargetWeightsForState(0);

    function getTargetWeightsForState(state) {
        const w = {
            logo: 0, scope: 0, fish: 0, dwarf: 0, logo2: 0, car: 0, rocket: 0, portal: 0, text: 0,
            apple: 0
        };
        const key = STATE_SHAPE[state];
        if (key) w[key] = 1;
        return w;
    }

    // Constellation cycle clock, and the per-link and per-star state derived
    // from it once a frame so the particle loop only has to look it up
    let constClock = 0;
    // The apple's own clock, for the spoiling and the scan
    let appleClock = 0;
    const constLinkProg = new Float32Array(CONST_LINKS.length);
    const constStarGlyph = new Uint8Array(CONST_STARS.length);
    const constStarGlint = new Uint8Array(CONST_STARS.length);
    const CONST_STAR_TWINKLE = CONST_STARS.map((s, i) => 0.7 + hash01(i * 2.9) * 0.9);

    // One star's glyph at this point in the cycle; 0 means it is not shown
    function constellationStarGlyph(si, cc, conv, fizz) {
        const s = CONST_STARS[si];
        const inDisk = si < CONST_RIDERS;
        constStarGlint[si] = 0;
        // The hole has failed and left the sky behind: faint dots back where
        // they started. The ones that fell all the way in wait for the
        // collapse to throw them clear before they show.
        if (fizz > 0) return (inDisk || fizz > 0.3) ? GLYPH_STAR_DIM : 0;
        if (!inDisk && conv > 0) return conv < 0.6 ? GLYPH_STAR_DIM : 0;
        // A star flares the moment a line reaches it
        const arrive = CONST_STAR_ARRIVE[si];
        if (conv === 0 && arrive >= 0 && cc >= arrive && cc < arrive + CONST_GLINT_TIME) {
            constStarGlint[si] = s.tier === 0 ? 1 : 0;
            return GLYPH_STAR_BRIGHT;
        }
        if (s.tier === 0) return GLYPH_STAR_BRIGHT;
        // Twinkle is a brief dip, on each star's own slow clock, and only
        // while it is still a sky
        const tw = conv === 0
            ? Math.sin(time * CONST_STAR_TWINKLE[si] + si * 2.39) : 0;
        if (s.tier === 1) return tw < -0.93 ? GLYPH_STAR_DIM : GLYPH_STAR_MID;
        return tw < -0.88 ? 0 : GLYPH_STAR_DIM;
    }

    function setTargetState(state) {
        // Arriving at the constellation starts it from the top, so a visitor
        // sees the stars before the black hole. Not while it is still most of
        // the way there, so a quick scroll away and back picks it up again.
        if (STATE_SHAPE[state] === 'portal' && currentWeights.portal < 0.5) constClock = 0;
        // The apple likewise always arrives fresh
        if (STATE_SHAPE[state] === 'apple' && currentWeights.apple < 0.5) appleClock = 0;
        targetState = state;
        targetWeights = getTargetWeightsForState(state);
        // Resized as the morph starts, so the change of scale is carried by
        // the same motion that rebuilds the shape
        fitShapeToPanel(state);
    }

    // --- Main Render Loop ---
    function render(timestamp) {
        const now = typeof timestamp === 'number' ? timestamp : performance.now();

        if (!logoLoop.isActive()) {
            lastTimestamp = now;
            requestAnimationFrame(render);
            return;
        }

        const dt = Math.min(0.05, Math.max(0, (now - lastTimestamp) / 1000));
        lastTimestamp = now;
        time += dt;

        // Morph weights
        const morphSpeed = dt / MORPH_DURATION * 2;
        let sum = 0;
        for (const key of SHAPE_KEYS) {
            currentWeights[key] += (targetWeights[key] - currentWeights[key]) * morphSpeed;
            sum += currentWeights[key];
        }
        if (sum > 0.001) {
            for (const key of SHAPE_KEYS) currentWeights[key] /= sum;
        }

        let wLogo = currentWeights.logo < 0.001 ? 0 : currentWeights.logo;
        let wScope = currentWeights.scope < 0.001 ? 0 : currentWeights.scope;
        let wFish = currentWeights.fish < 0.001 ? 0 : currentWeights.fish;
        let wDwarf = currentWeights.dwarf < 0.001 ? 0 : currentWeights.dwarf;
        let wLogo2 = currentWeights.logo2 < 0.001 ? 0 : currentWeights.logo2;
        let wCar = currentWeights.car < 0.001 ? 0 : currentWeights.car;
        let wRocket = currentWeights.rocket < 0.001 ? 0 : currentWeights.rocket;
        let wPortal = currentWeights.portal < 0.001 ? 0 : currentWeights.portal;
        let wText = currentWeights.text < 0.001 ? 0 : currentWeights.text;
        let wApple = currentWeights.apple < 0.001 ? 0 : currentWeights.apple;
        const wLogoCombined = wLogo + wLogo2;
        // The constellation's clock runs at the speed the shape has the frame:
        // stopped while the last shape is still there, full speed once it
        // has gone. The lines start drawing the moment there is a sky to draw
        // them on, rather than unseen inside the morph.
        constClock += dt * clamp01((wPortal - 0.4) / 0.5);
        appleClock += dt * clamp01((wApple - 0.4) / 0.5);
        const hasScope = wScope > 0;
        const hasFish = wFish > 0;
        const hasDwarf = wDwarf > 0;
        const hasCar = wCar > 0;
        const hasRocket = wRocket > 0;
        const hasPortal = wPortal > 0;
        const hasText = wText > 0;
        const hasApple = wApple > 0;

        const aspectCorrection = (charHeight / charWidth);

        // Reset buffers
        surface.reset();
        brightnessBuffer.fill(0);

        const dwarfColorBlend = clamp01((wDwarf - DWARF_COLOR_THRESHOLD) / (1.0 - DWARF_COLOR_THRESHOLD));
        const useColor = dwarfColorBlend > 0.001;
        const dwarfPalette = useColor ? buildDwarfPalette(dwarfColorBlend) : null;
        const dwarfTime = hasDwarf ? {
            band: time * 1.15, drift: time * 0.35,
            swirl: time * 1.7, storm: time * 0.6
        } : null;

        // Sunfish: dorsal and anal fins scull in unison, the way a mola swims
        const finSweep = hasFish ? Math.sin(time * FISH_FLAP_SPEED) * FISH_FLAP_AMP : 0;

        // Microscope: the nosepiece dwells on an objective, then clicks 120°
        // to the next one
        const turretSeg = time / SCOPE_TURRET_DWELL;
        const turretStep = Math.floor(turretSeg);
        const turretAngle = (turretStep + easeInOutQuad(clamp01((turretSeg - turretStep) * 4.0)))
            * (Math.PI * 2 / 3);
        const turretCos = Math.cos(turretAngle), turretSin = Math.sin(turretAngle);
        const scopeLampPulse = hasScope ? 0.82 + Math.sin(time * 2.3) * 0.14 : 0;
        const scopeKnobSpin = time * 1.6;

        // Constellation. conv carries everything into the disk while the sky
        // plane tips back into the disk plane, form grows the hole out of the
        // middle, and fizzle is the failure: a wobble and a stutter first,
        // then the horizon collapsing in a flash as the disk is let go and
        // evaporates. tau is how long the disk has been turning. sky is how
        // much of a sky it still is, which is all the drift is scaled by.
        let constConv = 0, constForm = 0, constFizz = 0, constTau = 0;
        let constBreak = 0, constClose = 0, constFlash = 0, constHole = 0;
        let constStutter = 1, planeS = 1, planeC = 0;
        let driftC = 1, driftS = 0;
        if (hasPortal) {
            const cc = constClock % CONST_CYCLE;
            constConv = smooth01(clamp01((cc - CONST_T_CONVERGE) / CONST_CONVERGE_TIME));
            constForm = smooth01(clamp01((cc - CONST_T_FORM) / CONST_FORM_TIME));
            constFizz = clamp01((cc - CONST_T_FIZZLE) / CONST_FIZZLE_TIME);
            constTau = Math.max(0, cc - CONST_T_CONVERGE);
            constBreak = smooth01(clamp01((constFizz - 0.3) / 0.7));
            constClose = smooth01(clamp01((constFizz - 0.25) / 0.45));
            constFlash = Math.sin(Math.PI * constClose);
            constHole = constForm * (1 - constClose);
            let tilt = HOLE_TILT;
            if (constFizz > 0) {
                // Two beating rates give an uneven stutter rather than a
                // strobe, and the disk rocks on its axis as it loses its hold
                const beat = Math.sin(time * 47.0) + Math.sin(time * 29.0);
                constStutter = beat > 1.1 - constFizz * 1.6 ? 0.6 : 1;
                tilt += Math.sin(time * 11.0) * 0.12 * Math.min(1, constFizz * 4.0);
            }
            const plane = lerp(Math.PI / 2, tilt, constConv);
            planeS = Math.sin(plane); planeC = Math.cos(plane);
            const sky = Math.min(clamp01(cc / 0.6), 1 - constConv);
            const drift = Math.sin(time * CONST_DRIFT_RATE) * CONST_DRIFT * sky;
            driftC = Math.cos(drift); driftS = Math.sin(drift);
            for (let li = 0; li < CONST_LINKS.length; li++) {
                const L = CONST_LINKS[li];
                constLinkProg[li] = clamp01((cc - L.start) / L.dur);
            }
            for (let si = 0; si < CONST_STARS.length; si++) {
                constStarGlyph[si] = constellationStarGlyph(si, cc, constConv, constFizz);
            }
        }

        // Apple: the scan sweeps top to bottom every APPLE_SCAN_TIME, the sheen
        // goes, and then the fruit slumps. The last sweep is the reset wipe.
        // forecast is how far ahead the scan sees, as a time on the rot clock;
        // on the last sweep it is looking at the next apple's.
        let appleC = 0, appleScanY = 0, appleDull = 0, appleSlump = 0;
        let appleForecast = 0, appleReset = false;
        if (hasApple) {
            appleC = appleClock % APPLE_CYCLE;
            const sweep = (appleC % APPLE_SCAN_TIME) / APPLE_SCAN_TIME;
            appleScanY = lerp(APPLE_SCAN_TOP, APPLE_SCAN_BOT, sweep);
            appleReset = appleC >= APPLE_RESET;
            appleDull = smooth01(clamp01((appleC - APPLE_DULL_FROM)
                / (APPLE_DULL_TO - APPLE_DULL_FROM)));
            appleSlump = smooth01(clamp01((appleC - APPLE_SLUMP_FROM)
                / (APPLE_SLUMP_TO - APPLE_SLUMP_FROM)));
            appleForecast = (appleReset ? appleC - APPLE_CYCLE : appleC) + APPLE_FORECAST;
        }

        // Rocket: the plume stretches on a slow pulse and boils on a fast one
        const flamePulse = 1.0 + Math.sin(time * ROCKET_FLAME_PULSE) * 0.22;
        const flameFlick = time * ROCKET_FLAME_FLICK;
        const rocketRoll = time * ROCKET_ROLL_SPEED;
        const rollC = Math.cos(rocketRoll), rollS = Math.sin(rocketRoll);
        const tiltC = Math.cos(ROCKET_TILT), tiltS = Math.sin(ROCKET_TILT);

        // Car animation clocks: dashes scroll backward, wheels spin to match
        const carRoadScroll = time * CAR_ROAD_SPEED;
        const carWheelSpin = time * (CAR_ROAD_SPEED / CAR_WHEEL_R);
        const carBobOffset = hasCar ? Math.sin(time * 5.0) * 0.25 : 0;
        // Camera tilts down for the diorama; pulling back while lengthening the
        // focal length flattens perspective so the scene reads like a model
        const carTilt = 0.34 * wCar;
        const carTiltCos = Math.cos(carTilt), carTiltSin = Math.sin(carTilt);
        const viewDist = VIEW_DISTANCE + 25.0 * wCar;

        const K1 = 40.0 * (1.0 + 1.5 * wCar);
        const cosT = Math.cos(angle);
        const sinT = Math.sin(angle);
        const sideNormalX = cosT;
        const sideNormalZ = -sinT;

        // ====== PASS 1: Project particles, compute brightness ======
        for (let i = 0; i < particles.length; i++) {
            let p = particles[i];
            let px = 0, py = 0, pz = 0;
            // The constellation works out tone and glyph while positioning,
            // since both decide whether the point is shown at all, and reads
            // them back when shading. A glyph of 0 means shape-match the cell.
            let portalTone = 0, portalGlyph = 0;
            // While a line point is still printed as a line: its slope on
            // screen in cells (columns per row when it prints by row, rows per
            // column otherwise), and the glyph if it is not the _.-' run
            let portalLine = false, portalByRow = false, portalSlope = 0;
            // Where it sits in the constellation alone, for snapping to below
            let portalQX = 0, portalQY = 0, portalQZ = 0;
            // The apple's state at this point, worked out while placing it and
            // read back when shading: how rotten, how creased, how much sheen
            // is left, how wilted, and its height for the scan
            let appleRot = 0, appleCrease = 0, appleSheen = 1, appleWilt = 0, appleY = 0;
            // Set while the rocket is still upright, read back when shading the
            // plume: distance from the plume axis across the view plane
            let flameLat = 0;

            if (wLogoCombined) {
                px += p.logoX * wLogoCombined;
                py += p.logoY * wLogoCombined;
                pz += p.logoZ * wLogoCombined;
            }
            if (hasFish) {
                px += p.fishX * wFish;
                py += p.fishY * wFish;
                pz += (p.fishZ + finSweep * p.fishFlap) * wFish;
            }
            if (hasScope) {
                let sx = p.scopeX, sz = p.scopeZ;
                if (p.scopeSpin) {
                    // Objectives orbit the turret axis instead of sitting still
                    const dx = sx - SCOPE_PIVOT_X, dz = sz - SCOPE_PIVOT_Z;
                    sx = SCOPE_PIVOT_X + dx * turretCos - dz * turretSin;
                    sz = SCOPE_PIVOT_Z + dx * turretSin + dz * turretCos;
                }
                px += sx * wScope; py += p.scopeY * wScope; pz += sz * wScope;
            }
            if (hasDwarf) { px += p.dwarfX * wDwarf; py += p.dwarfY * wDwarf; pz += p.dwarfZ * wDwarf; }
            if (hasCar) {
                px += p.carX * wCar;
                py += (p.carY + carBobOffset * p.carBob) * wCar;
                pz += p.carZ * wCar;
            }
            if (hasRocket) {
                let rx = p.rockX, ry = p.rockY, rz = p.rockZ;
                if (p.rockKind === RK_FLAME) {
                    const u = p.rockPhase;
                    // Stretch about the bell, then snake, harder further out
                    ry = ROCKET_BELL_AXIAL + (ry - ROCKET_BELL_AXIAL) * flamePulse;
                    const wob = u * 2.4;
                    rx += Math.sin(u * 5.5 + flameFlick * 0.9 + p.rockAng) * wob;
                    rz += Math.cos(u * 4.5 + flameFlick * 0.75 + p.rockAng) * wob;
                }
                if (p.rockKind !== RK_STAR) {
                    // Roll about the long axis while it is still upright, which
                    // is the cheap frame to do it in, then tip the stack into
                    // its climb. A lateral offset survives the tilt with its
                    // length intact, so rx here is also how far this point sits
                    // from the plume axis across the screen.
                    const arx = rx * rollC + rz * rollS;
                    rz = rz * rollC - rx * rollS;
                    rx = arx;
                    flameLat = rx;
                    const trx = rx * tiltC - ry * tiltS;
                    ry = rx * tiltS + ry * tiltC;
                    rx = trx;
                }
                px += rx * wRocket; py += ry * wRocket; pz += rz * wRocket;
            }
            if (hasPortal) {
                // Sky position, swayed about the vertical so the stars' depth
                // reads as parallax
                const sx = p.portSX * driftC - p.portSZ * driftS;
                const sz = p.portSX * driftS + p.portSZ * driftC;
                const sy = p.portSY;
                const keep = 1 - constConv;
                let qx = sx, qy = sy, qz = sz;
                // The horizon has nothing to show but still has to hide what
                // is behind it, so it is kept even though it is dark
                let occlude = false;
                switch (p.portKind) {
                    case PK_LINE: {
                        // Drawn from one star to the next, then pulled round
                        // into the disk. Each point dies at its own moment once
                        // the disk is released, most of them early, so what is
                        // left is a sparse spray rather than chunks of disk.
                        const prog = constLinkProg[p.portRef];
                        if (prog < p.portU) break;
                        if (constBreak > 0
                            && p.portPhase > Math.pow(1 - constBreak, CONST_SPARK_THIN)) break;
                        const L = CONST_LINKS[p.portRef];
                        const sa = CONST_STARS[L.a], sb = CONST_STARS[L.b];
                        let dx = 0, dy = 0, dz = 0, cosA = 0;
                        if (constConv > 0) {
                            holePlace(p.portSR, p.portFA, p.portFR, p.portSpin, constConv,
                                constTau, planeS, planeC,
                                constBreak * CONST_SPARK_REACH * (0.3 + p.portPhase));
                            const hx = holeOut[0], hy = holeOut[1], hz = holeOut[2];
                            cosA = holeOut[3];
                            qx = hx + (sx - p.portSX) * keep;
                            qy = hy;
                            qz = hz + sz * keep;
                            if (constConv < CONST_LINE_HOLD) {
                                // Direction of the strand: a point a little
                                // further along the line, put through the same fall
                                const e = 0.03;
                                const ex = p.portSX + (sb.x - sa.x) * e;
                                const ey = p.portSY + (sb.y - sa.y) * e;
                                const er = Math.hypot(ex, ey), erd = constDiskRadius(er);
                                holePlace(er, Math.atan2(ey, ex), erd, holeSpin(erd), constConv,
                                    constTau, planeS, planeC, 0);
                                dx = holeOut[0] - hx;
                                dy = holeOut[1] - hy;
                                dz = holeOut[2] - hz + (sb.z - sa.z) * e * keep;
                            }
                        } else {
                            const ex = sb.x - sa.x, ez = sb.z - sa.z;
                            dx = ex * driftC - ez * driftS;
                            dy = sb.y - sa.y;
                            dz = ex * driftS + ez * driftC;
                        }
                        // Printed only once the constellation has the frame:
                        // while another shape holds it, the one-cell test
                        // would just thin that shape out
                        if (constConv < CONST_LINE_HOLD && wPortal > 0.5) {
                            setLinePrint(dx * cosT - dz * sinT, dy, aspectCorrection);
                            portalLine = true;
                            portalByRow = linePrint[0] === 1;
                            portalSlope = linePrint[1];
                            portalGlyph = linePrint[2];
                        }
                        portalTone = lerp(0.5, holeDiskTone(p.portFR, p.portFA, cosA, planeC),
                            constConv) * constStutter;
                        break;
                    }
                    case PK_DISK: {
                        // Condenses inward out of a wider cloud as the hole
                        // forms, each point arriving at its own moment
                        if (p.portPhase >= constForm) break;
                        if (constBreak > 0
                            && p.portPhase > Math.pow(1 - constBreak, CONST_SPARK_THIN)) break;
                        const r = p.portFR * (1 + (1 - constForm) * 0.25);
                        holePlace(r, p.portFA, r, p.portSpin, 1, constTau, planeS, planeC,
                            constBreak * CONST_SPARK_REACH * (0.3 + p.portPhase));
                        qx = holeOut[0]; qy = holeOut[1]; qz = holeOut[2];
                        portalTone = holeDiskTone(p.portFR, p.portFA, holeOut[3], planeC)
                            * constStutter;
                        break;
                    }
                    case PK_VOID:
                    case PK_RING:
                    case PK_LENS: {
                        // Billboarded: written in the picture plane and turned
                        // back against the drag, so the hole always faces you.
                        // depth sets them just in front of, on, or behind the
                        // horizon, so the near disk still crosses all three.
                        if (constHole <= 0) break;
                        const ca = Math.cos(p.portFA), sa = Math.sin(p.portFA);
                        let r, depth;
                        if (p.portKind === PK_VOID) {
                            r = p.portFR * HOLE_R * constHole;
                            depth = 0;
                            occlude = true;
                        } else if (p.portKind === PK_RING) {
                            // Printed as a clean one-cell circle, which is what
                            // makes the dark inside read as a hole. As the
                            // horizon collapses it flashes instead: shaded hot
                            // and fat for a moment, then gone.
                            r = p.portFR * constHole;
                            depth = -0.15;
                            const flash = constFlash > 0.25;
                            portalTone = flash ? (0.5 + constFlash * 0.4) * (1 - constBreak) : 0.5;
                            if (!flash && wPortal > 0.5) {
                                setLinePrint(-sa, ca, aspectCorrection);
                                portalLine = true;
                                portalByRow = linePrint[0] === 1;
                                portalSlope = linePrint[1];
                                portalGlyph = linePrint[2];
                            }
                        } else {
                            // Brightest along the inner edge, with the disk's
                            // clumps streaming round it
                            r = p.portFR * constHole;
                            depth = 0.25;
                            const flow = Math.sin(p.portFA * 6.0 - time * 2.4 + p.portU * 3.0);
                            portalTone = (0.1 + (1 - p.portU) * 0.18 + (flow > 0.3 ? 0.06 : 0))
                                * (1 - 0.3 * ca) * constForm * (1 - constClose) * constStutter;
                        }
                        const bx = r * ca;
                        qx = bx * cosT + depth * sinT;
                        qy = r * sa;
                        qz = depth * cosT - bx * sinT;
                        break;
                    }
                    case PK_STAR: {
                        // Riders fall into the disk and ride it round as
                        // hot spots; the rest fall all the way in. The fizzle
                        // sends every one of them home, from wherever it got to.
                        portalGlyph = constStarGlyph[p.portRef];
                        if (portalGlyph === 0) break;
                        let bx = sx, by = sy, bz = sz;
                        if (constConv > 0) {
                            holePlace(p.portSR, p.portFA, p.portFR, p.portSpin, constConv,
                                constTau, planeS, planeC, 0);
                            bx = holeOut[0] + (sx - p.portSX) * keep;
                            by = holeOut[1];
                            bz = holeOut[2] + sz * keep;
                        }
                        const home = 1 - (1 - constFizz) * (1 - constFizz);
                        qx = lerp(bx, sx, home);
                        qy = lerp(by, sy, home);
                        qz = lerp(bz, sz, home);
                        portalTone = 0.75;
                        break;
                    }
                    default: // PK_GLINT
                        if (!constStarGlint[p.portRef]) break;
                        portalGlyph = GLYPH_GLINT;
                        portalTone = 0.5;
                        break;
                }
                // Dark points are left out once the constellation has the
                // frame to itself. While another shape is still blending out
                // they are sent back, so they never cover a lit star.
                if (portalTone <= 0 && portalGlyph === 0 && !occlude) {
                    if (wPortal > 0.97) continue;
                    qz += CONST_HIDE_DEPTH;
                }
                px += qx * wPortal; py += qy * wPortal; pz += qz * wPortal;
                portalQX = qx; portalQY = qy; portalQZ = qz;
            }
            if (hasApple) {
                // On the last sweep everything above the scan line is already
                // the next apple, blended across a short band so the wipe has
                // no seam
                const fresh = appleReset ? clamp01((p.appY - appleScanY) / 2.5 + 0.5) : 0;
                const keep = 1 - fresh;
                const slump = appleSlump * keep;
                appleRot = clamp01((appleC - p.appOnset) / APPLE_ROT_RAMP) * keep;
                appleCrease = slump * p.appWrinkle;
                appleSheen = 1 - appleDull * keep;
                appleWilt = slump;
                let ax = p.appX, ay = p.appY, az = p.appZ;
                if (p.appKind === AK_SKIN) {
                    // Rotten flesh sinks in, and late on the skin creases
                    const dent = appleCrease * 0.5 - appleRot * APPLE_ROT_SINK;
                    ax += p.appNX * dent; ay += p.appNY * dent; az += p.appNZ * dent;
                } else if (slump > 0) {
                    // The stem flops further over the way it already leans,
                    // and the leaf, which points the other way, hangs off it,
                    // swinging down about the point where it joins
                    if (p.appKind === AK_STEM) {
                        const bend = p.appS * p.appS * slump;
                        ax -= bend * 2.6; ay -= bend * 1.6;
                    } else {
                        const bend = APPLE_LEAF_AT * APPLE_LEAF_AT * slump;
                        const rx = ax - APPLE_LEAF_X, ry = ay - APPLE_LEAF_Y;
                        const ch = Math.cos(slump * 0.9), sh = -Math.sin(slump * 0.9);
                        ax = APPLE_LEAF_X - bend * 2.6 + rx * ch - ry * sh;
                        ay = APPLE_LEAF_Y - bend * 1.6 + rx * sh + ry * ch;
                    }
                }
                // Settles onto its base, a little narrower and lower
                const sag = 1 - 0.05 * slump;
                ax *= sag; az *= sag;
                ay = APPLE_BASE_Y + (ay - APPLE_BASE_Y) * (1 - 0.1 * slump);
                appleY = ay;
                px += ax * wApple; py += ay * wApple; pz += az * wApple;
            }
            if (hasText) {
                px += p.textX * wText;
                py += p.textY * wText;
                pz += p.textZ * wText;
            }
            // A printed glyph has to sit exactly where it belongs. The morph
            // approaches its target exponentially, and the last few percent of
            // the previous shape is enough to jitter a line off its own cells,
            // so these are pulled the rest of the way in as the morph settles.
            if (portalGlyph !== 0 || portalLine) {
                const snap = smooth01(clamp01((wPortal - 0.5) / 0.4));
                px += (portalQX - px) * snap;
                py += (portalQY - py) * snap;
                pz += (portalQZ - pz) * snap;
            }

            let x = px * cosT - pz * sinT;
            let z = px * sinT + pz * cosT;
            let y = py;
            if (hasCar) {
                const ty = y * carTiltCos + z * carTiltSin;
                z = z * carTiltCos - y * carTiltSin;
                y = ty;
            }
            let zDist = viewDist + z;

            if (zDist > 1.0) {
                let ooz = 1.0 / zDist;
                let exactX = width / 2 + K1 * ooz * x * aspectCorrection;
                let exactY = height / 2 - K1 * ooz * y;
                let xp = Math.floor(exactX);
                let yp = Math.floor(exactY);

                if (portalLine) {
                    // Only the point nearest the line's own crossing of this
                    // row (or column) prints, so the line is one cell thick
                    if (portalByRow) {
                        if (Math.floor(exactX + (yp + 0.5 - exactY) * portalSlope) !== xp) continue;
                    } else {
                        const yc = exactY + (xp + 0.5 - exactX) * portalSlope;
                        if (Math.floor(yc) !== yp) continue;
                        const f = yc - yp;
                        portalGlyph = f < 0.3 ? GLYPH_LINE_HIGH : f < 0.55 ? GLYPH_LINE_MID
                            : f < 0.8 ? GLYPH_LINE_LOW : GLYPH_LINE_FLOOR;
                    }
                }

                if (xp >= 0 && xp < width && yp >= 0 && yp < height) {
                    let idx = xp + yp * width;

                    if (ooz > zbuffer[idx]) {
                        zbuffer[idx] = ooz;

                        // Compute normal
                        let nLogoX = p.logoIsFace ? sinT * p.logoFaceSign : sideNormalX;
                        let nLogoZ = p.logoIsFace ? cosT * p.logoFaceSign : sideNormalZ;
                        let nx = nLogoX * wLogoCombined, ny = 0, nz = nLogoZ * wLogoCombined;

                        if (hasFish) {
                            nx += (p.fishNX * cosT - p.fishNZ * sinT) * wFish;
                            ny += p.fishNY * wFish;
                            nz += (p.fishNX * sinT + p.fishNZ * cosT) * wFish;
                        }
                        if (hasScope) {
                            let snx = p.scopeNX, snz = p.scopeNZ;
                            if (p.scopeSpin) {
                                const rnx = snx * turretCos - snz * turretSin;
                                snz = snx * turretSin + snz * turretCos;
                                snx = rnx;
                            }
                            nx += (snx * cosT - snz * sinT) * wScope;
                            ny += p.scopeNY * wScope;
                            nz += (snx * sinT + snz * cosT) * wScope;
                        }
                        if (hasDwarf) {
                            nx += (p.dwarfNX * cosT - p.dwarfNZ * sinT) * wDwarf;
                            ny += p.dwarfNY * wDwarf;
                            nz += (p.dwarfNX * sinT + p.dwarfNZ * cosT) * wDwarf;
                        }
                        if (hasCar) {
                            nx += (p.carNX * cosT - p.carNZ * sinT) * wCar;
                            ny += p.carNY * wCar;
                            nz += (p.carNX * sinT + p.carNZ * cosT) * wCar;
                        }
                        if (hasRocket) {
                            let rnx = p.rockNX, rny = p.rockNY, rnz = p.rockNZ;
                            if (p.rockKind !== RK_STAR) {
                                // Same roll then tilt the positions took
                                const arx = rnx * rollC + rnz * rollS;
                                rnz = rnz * rollC - rnx * rollS;
                                rnx = arx;
                                const trx = rnx * tiltC - rny * tiltS;
                                rny = rnx * tiltS + rny * tiltC;
                                rnx = trx;
                            }
                            nx += (rnx * cosT - rnz * sinT) * wRocket;
                            ny += rny * wRocket;
                            nz += (rnx * sinT + rnz * cosT) * wRocket;
                        }
                        if (hasPortal) {
                            // Everything here is light rather than surface,
                            // so it faces the camera
                            nz -= wPortal;
                        }
                        if (hasText) {
                            // Flat type faces the camera
                            nz -= wText;
                        }
                        if (hasApple) {
                            nx += (p.appNX * cosT - p.appNZ * sinT) * wApple;
                            ny += p.appNY * wApple;
                            nz += (p.appNX * sinT + p.appNZ * cosT) * wApple;
                        }

                        if (hasCar) {
                            const tny = ny * carTiltCos + nz * carTiltSin;
                            nz = nz * carTiltCos - ny * carTiltSin;
                            ny = tny;
                        }

                        let norm = Math.hypot(nx, ny, nz) || 0.001;
                        nx /= norm; ny /= norm; nz /= norm;

                        let dot = nx * LX + ny * LY + nz * LZ;
                        let diffuse = Math.max(0.15, dot);

                        let brightness = 0;
                        if (wLogoCombined) {
                            brightness += (p.logoIsFace ? (diffuse * 0.4 + p.logoWeight * 0.8) : (diffuse * 0.7)) * wLogoCombined;
                        }
                        // Solid-object shading terms shared by the modelled shapes:
                        // how squarely the surface faces the camera, plus a
                        // Blinn specular raised to ^16 by repeated squaring
                        let facing = 0, spec = 0;
                        if (hasFish || hasScope || hasCar || hasRocket || hasApple) {
                            facing = -nz;
                            if (facing < 0) facing = 0;
                            spec = nx * HX + ny * HY + nz * HZ;
                            if (spec < 0) spec = 0;
                            spec *= spec; spec *= spec; spec *= spec; spec *= spec;
                        }

                        if (hasFish) {
                            let fb;
                            // A mola is a flat disc, so a world-space light hits
                            // every body particle at the same angle and the sway
                            // modulates the whole flank in lockstep. Measured, the
                            // dense-glyph share swung 20x over one sway cycle, from
                            // a saturated slab to a hollow husk. Light the fish in
                            // its own frame instead: tone then comes from where a
                            // point sits on the dome, and turning only changes the
                            // silhouette. `nz` is mirrored to the near face so the
                            // far half of the lens shades like the half you see.
                            const fishForm = Math.max(0.12,
                                p.fishNX * LX + p.fishNY * LY
                                - Math.abs(p.fishNZ) * LZ);

                            switch (p.fishKind) {
                                case FK_BODY: {
                                    // Crown lifts the thick centre, form sweeps the
                                    // dome head-to-tail, and the skin folds break up
                                    // what would otherwise be two flat halves.
                                    const crown = 1 - p.fishPhase;
                                    fb = 0.12 + crown * 0.16 + fishForm * 0.42
                                        + p.fishTex * 0.15 + facing * 0.09;
                                    break;
                                }
                                case FK_FIN:
                                    // Darker than the body, with the rays picked out
                                    // against the membrane between them
                                    fb = 0.11 + fishForm * 0.30
                                        + (p.fishTex > 0.4 ? 0.17 : 0);
                                    break;
                                case FK_CLAVUS:
                                    // Sits at the shadowed rear, so it has to stay
                                    // at or below the flank it hangs off, since
                                    // brighter than the body reads as a loose bar
                                    fb = 0.13 + fishForm * 0.34 + p.fishTex * 0.07;
                                    break;
                                case FK_PECT:
                                    // Catches more light than the flank behind it
                                    fb = 0.26 + fishForm * 0.44;
                                    break;
                                case FK_EYE:
                                    // Dark pupil ringed by a pale iris
                                    fb = p.fishPhase < 0.55 ? 0.0 : 0.85;
                                    break;
                                case FK_MOUTH: fb = 0.0; break;
                                default: fb = 0.02; break; // gill slit
                            }
                            brightness += clamp01(fb) * wFish;
                        }

                        if (hasRocket) {
                            let rb;
                            switch (p.rockKind) {
                                case RK_FLAME: {
                                    // Emissive, so no key light: hottest along the
                                    // axis at the throat, cooling down the plume and
                                    // out toward its edges
                                    const u = p.rockPhase;
                                    const core = 1 - clamp01(
                                        Math.abs(flameLat) / Math.max(0.6, p.rockTex));
                                    const flick = 0.80 + Math.sin(
                                        flameFlick + u * 7.0 + p.rockAng * 2.0) * 0.20;
                                    rb = (0.99 - u * 0.6) * (0.30 + core * 0.70) * flick;
                                    break;
                                }
                                case RK_STAR: {
                                    // Mostly faint, a few bright, each on its own
                                    // twinkle phase so the field is never uniform
                                    const tw = 0.6 + Math.sin(
                                        time * 1.7 + p.rockPhase * 6.283) * 0.4;
                                    rb = (0.1 + Math.pow(p.rockTex, 3.0) * 0.75) * tw;
                                    break;
                                }
                                case RK_NOSE:
                                    // Polished cone, so it takes the hardest sheen
                                    rb = 0.22 + facing * 0.22 + diffuse * 0.34 + spec * 0.42;
                                    break;
                                case RK_WINDOW:
                                    // Dark glass inside a bright bezel
                                    rb = p.rockPhase < 0.62 ? 0.05 + spec * 0.45 : 0.9;
                                    break;
                                case RK_FIN: {
                                    // A fin is a thin sheet, so both of its faces
                                    // land at practically the same depth and the
                                    // depth test picks between them at random.
                                    // Shade whichever one points at the camera, or
                                    // half the sheet comes out backlit and the
                                    // surface breaks up into speckle.
                                    const s = nz > 0 ? -1 : 1;
                                    const fdot = Math.max(0.15,
                                        s * (nx * LX + ny * LY + nz * LZ));
                                    // A flat sheet shades dead flat, so pick out
                                    // the leading edge to give it an outline
                                    rb = 0.15 + Math.abs(nz) * 0.20 + fdot * 0.34
                                        + (p.rockTex < 0.15 ? 0.17 : 0);
                                    break;
                                }
                                case RK_NOZZLE:
                                    // Scorched bell, darkest part of the airframe
                                    rb = 0.09 + facing * 0.14 + diffuse * 0.22 + spec * 0.3;
                                    break;
                                default: // RK_BODY, scaled by the painted stripe
                                    rb = (0.19 + facing * 0.2 + diffuse * 0.34
                                        + spec * 0.3) * p.rockTex;
                                    break;
                            }
                            brightness += clamp01(rb) * wRocket;
                        }

                        if (hasPortal) brightness += clamp01(portalTone) * wPortal;

                        if (hasText) {
                            let tb;
                            if (p.textKind === TK_SPARK) {
                                // Sparks breathe around the type, each on its
                                // own clock
                                tb = 0.08 + Math.max(0, Math.sin(time * 2.1
                                    + p.textPhase * 6.283)) * 0.55;
                            } else {
                                // Even tone, so mid-flight the cloud already
                                // reads as unlit print rather than a surface
                                tb = 0.6;
                            }
                            brightness += clamp01(tb) * wText;
                        }

                        if (hasScope) {
                            let sb;
                            switch (p.scopeKind) {
                                case MK_BASE:
                                case MK_ARM:
                                    // Cast metal: matte, with a soft sheen along the edges
                                    sb = 0.14 + facing * 0.42 + diffuse * 0.28 + spec * 0.35;
                                    break;
                                case MK_TUBE:
                                    sb = 0.18 + facing * 0.46 + diffuse * 0.26 + spec * 0.55;
                                    break;
                                case MK_TURRET:
                                    sb = 0.1 + facing * 0.3 + diffuse * 0.22;
                                    break;
                                case MK_OBJ: {
                                    // Knurled bands down the barrel, bright lens at the tip
                                    const band = Math.sin(p.scopePhase * 26.0) > 0 ? 0.5 : 0.16;
                                    sb = band + diffuse * 0.15 + (p.scopePhase > 0.93 ? 0.4 : 0);
                                    break;
                                }
                                case MK_KNOB: {
                                    // Ridges turning under the fingers
                                    const ridge = Math.sin((p.scopePhase + scopeKnobSpin) * 9.0);
                                    sb = 0.12 + (ridge > 0.2 ? 0.48 : 0.1) + diffuse * 0.18;
                                    break;
                                }
                                case MK_STAGE:
                                    sb = 0.06 + diffuse * 0.14 + spec * 0.2;
                                    break;
                                case MK_SLIDE:
                                    // Lit from beneath by the illuminator
                                    sb = 0.55 + scopeLampPulse * 0.3;
                                    break;
                                case MK_LAMP: sb = scopeLampPulse + 0.15; break;
                                case MK_BEAM: sb = scopeLampPulse * 0.35; break;
                                default: sb = 0.72 + spec * 0.3; break; // eyepiece lens
                            }
                            brightness += clamp01(sb) * wScope;
                        }

                        if (hasCar) {
                            let cb;
                            switch (p.carKind) {
                                case CK_BODY:
                                    // Product-shot lighting: camera-facing panels carry the
                                    // silhouette, roof stays quieter, plus a specular kick
                                    cb = 0.18 + facing * 0.7 + diffuse * 0.2 + spec * 0.5;
                                    break;
                                case CK_WHEEL: {
                                    if (p.carShade === 0) {
                                        // Tread: dark rubber
                                        cb = 0.06 + diffuse * 0.06;
                                    } else if (p.carShade < 0.28) {
                                        // Tire sidewall ring
                                        cb = 0.08 + diffuse * 0.08;
                                    } else {
                                        // Hub: bright spokes rolling forward (clockwise on
                                        // screen, matching the road scrolling toward -x)
                                        const spoke = Math.sin((p.carPhase + carWheelSpin) * CAR_SPOKES);
                                        cb = 0.12 + (spoke > 0.3 ? 0.5 : 0.08) + p.carShade * 0.2;
                                    }
                                    break;
                                }
                                case CK_DASH: {
                                    let u = (p.carPhase + carRoadScroll) % CAR_DASH_PERIOD;
                                    if (u < 0) u += CAR_DASH_PERIOD;
                                    cb = u < CAR_DASH_LEN ? 0.9 : 0.1;
                                    break;
                                }
                                case CK_EDGE: cb = 0.4; break;
                                case CK_ROAD:
                                    // Faint moving texture sells the road scroll
                                    cb = 0.07 + diffuse * 0.08 + Math.sin((p.carPhase + carRoadScroll) * 0.9) * 0.03;
                                    break;
                                case CK_RIM: cb = 0.03 + diffuse * 0.2; break;
                                default: cb = 0.02 + diffuse * 0.05; break; // glass
                            }
                            brightness += clamp01(cb) * wCar;
                        }

                        if (hasApple) {
                            let ab;
                            if (p.appKind === AK_SKIN) {
                                // Glossy while fresh: the matte skin is kept
                                // under the ~0.45 mark where this glyph set
                                // saturates, so it shades, and only a tight
                                // highlight crosses it. Squared twice more,
                                // since ^16 on a ball this size lights a third
                                // of it. The sheen is the first thing to go.
                                // Rot is dark but not empty, flecked with
                                // mould, so the fruit keeps its outline. A rim
                                // light traces the silhouette, since the two
                                // shoulders and the dip between them are what
                                // say apple and they face away from the key.
                                let gloss = spec * spec;
                                gloss *= gloss;
                                const edge = 1 - facing;
                                const skin = 0.04 + facing * 0.2 + diffuse * 0.16
                                    + edge * edge * edge * 0.32
                                    + p.appTex * 0.03 + gloss * 0.6 * appleSheen;
                                const rot = 0.13 + diffuse * 0.05 + (p.appTex > 0.8 ? 0.1 : 0);
                                ab = lerp(skin, rot, appleRot) + appleCrease * 0.05;
                                // The spreading edge is darkest, which is what
                                // makes a soft spot read as a bruise with an
                                // edge rather than as the skin fading out
                                if (appleRot > 0.05 && appleRot < 0.6) ab *= 0.35;
                            } else if (p.appKind === AK_STEM) {
                                // Solid, to stand out against the black and
                                // against the mid-tone skin: a dark stem would
                                // print as nothing at all
                                ab = 0.55 + diffuse * 0.15;
                            } else {
                                // A leaf is one sheet, so light whichever face
                                // points at the camera. Solid like the stem, so
                                // it reads as a shape of its own rather than
                                // more skin, with the midrib cut into it. It
                                // fades as it wilts.
                                const face = nz > 0 ? -1 : 1;
                                const lit = Math.max(0.15, face * (nx * LX + ny * LY + nz * LZ));
                                ab = (p.appTex === 1 ? 0.2 : 0.52 + lit * 0.2) * (1 - 0.45 * appleWilt);
                            }
                            // The scan line is bright on sound skin and comes
                            // back dark wherever the rot is, or soon will be
                            if (Math.abs(appleY - appleScanY) < APPLE_SCAN_HALF) {
                                ab = (appleRot > 0.2 || p.appOnset < appleForecast) ? 0.03 : 0.9;
                            }
                            brightness += clamp01(ab) * wApple;
                        }

                        let dwarfThermal = 0;
                        if (hasDwarf) {
                            const pat = sampleDwarfSurface(p, dwarfTime);
                            const rim = Math.pow(Math.max(0, 1.0 - Math.abs(nz)), 2) * (0.24 + p.dwarfEquatorBias * 0.14);
                            dwarfThermal = clamp01(pat * (0.72 + diffuse * 0.24) + rim * 0.55);
                            brightness += clamp01(diffuse * 0.34 + pat * 0.46 + rim * 0.42) * wDwarf;
                        }

                        // Depth fog — pulled back for the modelled shapes, which
                        // are wide enough that full fog would crush their far half
                        let fog = (z + 50) / 200.0;
                        brightness -= fog * (1.0 - wCar * 0.65 - wFish * 0.5 - wScope * 0.5
                            - wText * 0.85 - wPortal * 0.8 - wApple * 0.5);
                        brightness = clamp01(brightness);

                        brightnessBuffer[idx] = brightness;

                        // Sentinel: 0 = needs shape matching in Pass 2.
                        // Settled type prints its own character instead: the
                        // per-particle threshold staggers the switch, so the
                        // glyphs crystallize out of the arriving cloud rather
                        // than snapping in — and crumble back out the same way
                        // when the section scrolls past. Stars do the same.
                        let glyph = 0;
                        if (hasText && p.textKind === TK_GLYPH && wText >= p.textReveal) {
                            glyph = p.textCode;
                        } else if (portalGlyph && wPortal >= 0.55 + p.portPhase * 0.35) {
                            glyph = portalGlyph;
                        }
                        textBuffer[idx] = glyph;

                        // Dwarf color
                        if (useColor && hasDwarf) {
                            const paletteIndex = Math.min(DWARF_COLOR_LEVELS - 1, Math.floor(dwarfThermal * (DWARF_COLOR_LEVELS - 1)));
                            colorBuffer[idx] = dwarfPalette[paletteIndex];
                        }
                    }
                }
            }
        }

        // ====== PASS 2: Neighborhood-based shape-vector matching ======
        // For each filled cell, sample surrounding cells' brightness to build
        // a 6D vector that captures the local edge structure.
        // At silhouette edges, some neighbors are empty (brightness=0),
        // creating non-uniform vectors that match edge-appropriate characters.
        const sv = new Float32Array(6);

        for (let py = 0; py < height; py++) {
            for (let px = 0; px < width; px++) {
                let idx = px + py * width;

                if (zbuffer[idx] <= EMPTY_DEPTH) continue;
                if (textBuffer[idx] !== 0) continue; // has override

                let c = brightnessBuffer[idx];
                if (c < 0.01) { textBuffer[idx] = SPACE_CODE; continue; }

                // Sample 3x3 neighborhood brightness (0 for empty/out-of-bounds)
                let n  = (py > 0)                          ? brightnessBuffer[idx - width] : 0;
                let s_ = (py < height - 1)                 ? brightnessBuffer[idx + width] : 0;
                let w  = (px > 0)                          ? brightnessBuffer[idx - 1] : 0;
                let e  = (px < width - 1)                  ? brightnessBuffer[idx + 1] : 0;
                let nw = (py > 0 && px > 0)                ? brightnessBuffer[idx - width - 1] : 0;
                let ne = (py > 0 && px < width - 1)        ? brightnessBuffer[idx - width + 1] : 0;
                let sw = (py < height - 1 && px > 0)       ? brightnessBuffer[idx + width - 1] : 0;
                let se = (py < height - 1 && px < width - 1) ? brightnessBuffer[idx + width + 1] : 0;

                // Build 6D sampling vector (3 rows × 2 cols)
                // Each component blends the cell's own brightness with its neighbors
                // in the corresponding direction
                sv[0] = (nw * 0.3 + n * 0.3 + w * 0.15 + c * 0.25);  // top-left
                sv[1] = (ne * 0.3 + n * 0.3 + e * 0.15 + c * 0.25);  // top-right
                sv[2] = (w * 0.45 + c * 0.35 + nw * 0.1 + sw * 0.1); // mid-left
                sv[3] = (e * 0.45 + c * 0.35 + ne * 0.1 + se * 0.1); // mid-right
                sv[4] = (sw * 0.3 + s_ * 0.3 + w * 0.15 + c * 0.25); // bot-left
                sv[5] = (se * 0.3 + s_ * 0.3 + e * 0.15 + c * 0.25); // bot-right

                // Apply global contrast enhancement — sharpens edges
                applyGlobalContrast(sv, CONTRAST_EXPONENT);

                // Find best matching character via cached 6D lookup
                textBuffer[idx] = cachedShapeLookup(sv[0], sv[1], sv[2], sv[3], sv[4], sv[5], shapeData);
            }
        }

        // Present
        if (useColor) {
            surface.presentColor(screenElement, DEFAULT_PACKED_COLOR);
        } else {
            surface.presentText(screenElement);
        }

        // --- Rotation & Speed ---
        // The rocket gets its motion from its own roll instead of a world spin,
        // which would swing the climb angle toward the camera and flatten it.
        let speedMult = 1.0 * wLogoCombined + 0.8 * wDwarf + 0.9 * wScope;
        let timeScale = dt * 60.0;
        let autoSpeed = BASE_ROTATION_SPEED * speedMult;

        if (!isDragging) {
            // Blend angular velocity toward the auto-rotation speed.
            // On release with momentum, this smoothly decays the flick velocity
            // into the constant spin — never stops, just settles.
            let blend = 1.0 - Math.pow(1.0 - MOMENTUM_DECAY, timeScale);
            angularVelocity = angularVelocity + (autoSpeed - angularVelocity) * blend;
            angle += angularVelocity * timeScale;

            // The car diorama holds a profile view instead of spinning,
            // so the scene stays readable. Drag still spins it freely.
            if (hasCar) {
                const profileAngle = Math.round(angle / (Math.PI * 2)) * (Math.PI * 2);
                const pull = 1.0 - Math.pow(0.96, timeScale);
                angle += (profileAngle - angle) * pull * wCar;
            }

            // The constellation is a picture and the black hole's disk is tipped
            // for one view, so both are held square to the camera. Drag still
            // spins the disk freely; the hole's images stay facing you.
            // The rocket is held for the same reason: the climb angle only reads
            // side on, and its own roll supplies the movement. Type is held
            // hardest of all: letters only exist face-on.
            if (hasPortal || hasRocket || hasText) {
                const square = Math.round(angle / (Math.PI * 2)) * (Math.PI * 2);
                const pull = 1.0 - Math.pow(0.94, timeScale);
                angle += (square - angle) * pull * Math.max(wPortal, wRocket, wText);
            }

            // An apple reads by its outline, the two shoulders and the dip the
            // stem rises from, so it is held side on too, turning lazily
            if (hasApple) {
                const sway = Math.sin(time * 0.4) * APPLE_SWAY;
                const held = Math.round((angle - sway) / (Math.PI * 2)) * (Math.PI * 2) + sway;
                const pull = 1.0 - Math.pow(0.965, timeScale);
                angle += (held - angle) * pull * wApple;
            }

            // A mola is only a mola side-on — hold the profile, but let it
            // turn lazily in place rather than freezing.
            if (hasFish) {
                const sway = Math.sin(time * 0.33) * FISH_SWAY;
                const held = Math.round((angle - sway) / (Math.PI * 2)) * (Math.PI * 2) + sway;
                const pull = 1.0 - Math.pow(0.965, timeScale);
                angle += (held - angle) * pull * wFish;
            }
        }

        requestAnimationFrame(render);
    }

    // --- Scroll Trigger Logic ---
    const aboutUs = document.getElementById('about-us');
    const futureProjects = document.getElementById('future-projects');
    const sunfish = document.getElementById('project-sunfish');
    const brownDwarf = document.getElementById('brown-dwarf');
    const spoilage = document.getElementById('spoilage');
    const avResearch = document.getElementById('av-research');
    const products = document.getElementById('products');
    const constellation = document.getElementById('project-constellation');
    const members = document.getElementById('members');
    const sourceCode = document.getElementById('connect');

    let isAboutUsVisible = false;
    let isFutureProjectsVisible = false, isSunfishVisible = false;
    let isBrownDwarfVisible = false, isAvResearchVisible = false, isSourceCodeVisible = false;
    let isSpoilageVisible = false;
    let isProductsVisible = false, isConstellationVisible = false, isMembersVisible = false;

    // Checked bottom-of-page first, so when two sections straddle the trigger
    // band the lower one wins and the shape tracks the scroll direction
    function updateState() {
        let newTarget = null;
        if (isSourceCodeVisible) newTarget = 4;
        else if (isMembersVisible) newTarget = 8;
        else if (isConstellationVisible) newTarget = 7;
        else if (isProductsVisible) newTarget = 6;
        else if (isAvResearchVisible) newTarget = 5;
        else if (isSpoilageVisible) newTarget = 9;
        else if (isBrownDwarfVisible) newTarget = 3;
        else if (isSunfishVisible) newTarget = 2;
        else if (isFutureProjectsVisible) newTarget = 1;
        else if (isAboutUsVisible) newTarget = 0;

        if (newTarget !== null && newTarget !== targetState) setTargetState(newTarget);
    }

    const narrowLayout = NARROW.matches;
    const obsOptions = { threshold: 0.1, rootMargin: '-40% 0px -40% 0px' };
    const connectObsOptions = { threshold: 0.1, rootMargin: '-30% 0px -50% 0px' };

    // Roughly how many cells each shape covers, padded a little for the ones
    // that spin. The footprints are wildly different, so on mobile one font
    // size cannot serve them all: sized to fit the 116 column road diorama, the
    // 40 column members figure ends up a third of the panel and looks like an
    // afterthought. Each state gets the size that fills the panel instead.
    const STATE_EXTENT = [
        { cols: 70, rows: 46 },   // 0 logo
        { cols: 48, rows: 46 },   // 1 microscope
        { cols: 46, rows: 42 },   // 2 sunfish
        { cols: 58, rows: 36 },   // 3 brown dwarf
        { cols: 70, rows: 46 },   // 4 logo again
        { cols: 116, rows: 28 },  // 5 road diorama
        { cols: 102, rows: 54 },  // 6 rocket
        { cols: 56, rows: 36 },   // 7 constellation sky, then the black hole
        { cols: 40, rows: 32 },   // 8 members figure
        { cols: 60, rows: 38 }    // 9 apple
    ];
    const CHAR_ASPECT = 0.6;      // Courier advance width, as a fraction of em

    function fitShapeToPanel(state) {
        // Re-read the query rather than trusting the value from load: rotating a
        // phone into landscape hands the layout back to the desktop rules, and a
        // font size measured against the portrait band would be left behind.
        if (!NARROW.matches) {
            screenElement.style.fontSize = '';
            screenElement.style.lineHeight = '';
            return;
        }
        const ext = STATE_EXTENT[state] || STATE_EXTENT[0];
        const box = asciiColumn.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) return;
        // line-height is kept equal to font-size, so a row is one em tall.
        // Deliberately short of the band on both axes: filling it edge to edge
        // put the top of the shape against the top of the screen, where it read
        // as cropped rather than as placed.
        const byWidth = (box.width * 0.86) / (ext.cols * CHAR_ASPECT);
        const byHeight = (box.height * 0.84) / ext.rows;
        const size = Math.max(3, Math.min(byWidth, byHeight));
        screenElement.style.fontSize = size.toFixed(2) + 'px';
        screenElement.style.lineHeight = size.toFixed(2) + 'px';
    }
    if (narrowLayout) {
        // Mobile picks the shape geometrically: whichever section sits nearest
        // below the bottom edge of the graphic panel owns it.
        //
        // The observer bands below cannot do this job here. They are expressed
        // as percentages of the viewport, and would have to be tuned against a
        // CSS offset given in vh, but the two do not agree on a phone: vh is
        // fixed to the large viewport while the intersection root tracks the
        // small one, so the band drifts by the height of the URL bar every time
        // it collapses. Measuring the panel edge from the DOM has no such
        // coupling, and it also resolves ties without a priority order.
        const tracked = [
            [aboutUs, 0], [futureProjects, 1], [sunfish, 2], [brownDwarf, 3],
            [spoilage, 9], [avResearch, 5], [products, 6], [constellation, 7],
            [members, 8], [sourceCode, 4]
        ].filter(([el]) => el);

        // One dot per panel. Built from the same list the picker walks, so the
        // marker cannot drift out of step with the graphic.
        const rail = document.getElementById('section-rail');
        const dots = tracked.map(() => {
            const dot = document.createElement('i');
            if (rail) rail.appendChild(dot);
            return dot;
        });

        let currentIndex = -1;
        let pastHero = null;

        let queued = false;
        const pickShape = () => {
            queued = false;
            const line = asciiColumn.getBoundingClientRect().bottom;
            let bestIndex = -1, bestDist = Infinity;
            for (let i = 0; i < tracked.length; i++) {
                // How far the top of the panel sits from the top of the text
                // band, which is where a panel comes to rest. Panels on their way
                // out are scored a little harder than ones on their way in, so
                // the morph starts just before you land rather than after.
                //
                // Scored off one edge rather than the whole box on purpose. An
                // earlier version measured the nearest edge, which made the
                // outgoing panel's bottom and the incoming panel's top both land
                // exactly on the line at every snap position: a dead tie, always
                // won by whichever came first in the list, so the graphic sat one
                // panel behind the copy the whole way down.
                const top = tracked[i][0].getBoundingClientRect().top;
                const d = top >= line ? top - line : (line - top) * 1.25;
                if (d < bestDist) { bestDist = d; bestIndex = i; }
            }

            // The graphic is only pinned once the hero has gone by, and the rail
            // has nothing to mark until then. Measured off the top of the band
            // rather than the bottom edge the picker uses: the bottom edge is
            // below the fold for the whole of the hero, so it never reads as
            // being behind you.
            const nowPastHero = asciiColumn.getBoundingClientRect().top <= 1;
            if (nowPastHero !== pastHero) {
                pastHero = nowPastHero;
                document.body.classList.toggle('past-hero', nowPastHero);
            }

            if (bestIndex < 0 || bestIndex === currentIndex) return;

            // Copy and graphic are handed over together, which is the whole
            // point of picking both from one measurement
            if (currentIndex >= 0) {
                tracked[currentIndex][0].classList.remove('is-current');
                dots[currentIndex].classList.remove('on');
            }
            currentIndex = bestIndex;
            tracked[currentIndex][0].classList.add('is-current');
            dots[currentIndex].classList.add('on');

            const bestState = tracked[bestIndex][1];
            if (bestState !== targetState) setTargetState(bestState);
        };
        const onScroll = () => {
            if (!queued) { queued = true; requestAnimationFrame(pickShape); }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        window.addEventListener('orientationchange', onScroll);
        pickShape();
    } else {
        if (aboutUs) new IntersectionObserver((e) => { e.forEach(x => { isAboutUsVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(aboutUs);
        if (futureProjects) new IntersectionObserver((e) => { e.forEach(x => { isFutureProjectsVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(futureProjects);
        if (sunfish) new IntersectionObserver((e) => { e.forEach(x => { isSunfishVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(sunfish);
        if (brownDwarf) new IntersectionObserver((e) => { e.forEach(x => { isBrownDwarfVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(brownDwarf);
        if (spoilage) new IntersectionObserver((e) => { e.forEach(x => { isSpoilageVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(spoilage);
        if (avResearch) new IntersectionObserver((e) => { e.forEach(x => { isAvResearchVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(avResearch);
        if (products) new IntersectionObserver((e) => { e.forEach(x => { isProductsVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(products);
        if (constellation) new IntersectionObserver((e) => { e.forEach(x => { isConstellationVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(constellation);
        if (members) new IntersectionObserver((e) => { e.forEach(x => { isMembersVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(members);
        if (sourceCode) new IntersectionObserver((e) => { e.forEach(x => { isSourceCodeVisible = x.isIntersecting; updateState(); }); }, connectObsOptions).observe(sourceCode);
    }

    fitShapeToPanel(targetState);
    window.addEventListener('resize', () => fitShapeToPanel(targetState));
    window.addEventListener('orientationchange', () => fitShapeToPanel(targetState));

    requestAnimationFrame(render);
})();
