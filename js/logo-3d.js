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

    // --- Members type configuration ---
    // At the Members section the graphic goes typographic: the canvas slides
    // out of its column and fills the screen while the particles flatten into
    // a plane and set the section's text themselves — MEMBERS on top, the two
    // names beneath, a mallet and a chisel in the margins, sparks breathing
    // around it all. Scrolling on crumbles the type back into the 3D shapes.
    const TK_GLYPH = 0, TK_SPARK = 1;

    // Inverse of the resting projection (K1 = 40, view distance 55, Courier
    // cell aspect): one grid column is 0.825 world units across and one row
    // 1.375 down, so the layout can be authored directly in cells
    const TEXT_UNIT_X = 0.825;
    const TEXT_UNIT_Y = 1.375;
    const TEXT_LAYOUT_COLS = 124;  // footprint the fill-screen scale is fit to
    const TEXT_LAYOUT_ROWS = 52;

    // --- Portal configuration (Constellation product) ---
    const PK_LIP = 0, PK_FIELD = 1, PK_MOTE = 2;

    // Shaped after the game: a tall oval with a hot lip and a turning field
    // inside. Sized to sit just inside the Connect logo, which renders 44 rows
    // by 54 cols; motes included this comes to about 40 by 50. The projection
    // is roughly 1.21 cells per unit across and 0.73 down.
    const PORTAL_RX = 14.5, PORTAL_RY = 21.5;
    const PORTAL_TUBE = 2.2;        // cross-section radius of the lip
    const PORTAL_SPIN = 0.55;       // base rate the field turns
    const PORTAL_RIPPLE = 1.1;      // rate ripples travel out through the field
    const PORTAL_MOTE_REACH = 4.0;  // how far outside the lip motes start
    const PORTAL_MOTE_RATE = 0.21;  // how fast they fall inward

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

    // --- Members type geometry ---
    // A 5x7 bitmap face covering just the letters this section needs. Each lit
    // pixel becomes one grid cell; the title doubles its pixels across, which
    // restores the letters' proportions inside tall Courier cells.
    const TEXT_FONT = {
        A: ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
        B: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.'],
        C: ['.XXX.', 'X...X', 'X....', 'X....', 'X....', 'X...X', '.XXX.'],
        E: ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
        H: ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
        K: ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'],
        L: ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
        M: ['X...X', 'XX.XX', 'X.X.X', 'X.X.X', 'X...X', 'X...X', 'X...X'],
        N: ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X', 'X...X', 'X...X'],
        O: ['.XXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
        R: ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
        S: ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
        T: ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
        U: ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
        Y: ['X...X', 'X...X', '.X.X.', '..X..', '..X..', '..X..', '..X..']
    };

    // The other stuff around the type, drawn in text like everything else
    const TEXT_MALLET = [
        ' .=*#%%#*=.',
        '-%@@@@@@@@%-',
        '=@@@@@@@@@@=',
        '=@@@@@@@@@@=',
        '-%@@@@@@@@%-',
        ' .=*#%%#*=.',
        '    |@@|',
        '    |@@|',
        '    |@@|',
        '    |@@|',
        '    |@@|',
        '   .#@@#.',
        "   '*==*'"
    ];
    const TEXT_CHISEL = [
        '  .+##+.',
        "  '%@@%'",
        '   |@@|',
        '   |@@|',
        '   |@@|',
        '   |@@|',
        '   |@@|',
        '  .#@@#.',
        '  %@@@@%',
        '  =@@@@=',
        '   *@@*',
        "   '=='"
    ];

    function textWidth(str, pw) {
        let w = 0;
        for (const ch of str) w += (ch === ' ' ? 3 : 6) * pw;
        return w - pw;
    }

    function pushTextLine(cells, str, centerCol, topRow, pw, code) {
        let col = centerCol - Math.floor(textWidth(str, pw) / 2);
        for (const ch of str) {
            if (ch === ' ') { col += 3 * pw; continue; }
            const glyph = TEXT_FONT[ch];
            for (let r = 0; r < 7; r++) {
                for (let c = 0; c < 5; c++) {
                    if (glyph[r][c] !== 'X') continue;
                    for (let k = 0; k < pw; k++) {
                        cells.push({ col: col + c * pw + k, row: topRow + r, code, kind: TK_GLYPH, phase: 0 });
                    }
                }
            }
            col += 6 * pw;
        }
    }

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
        const AT = 64, HASH = 35, EQ = 61;
        const centerRow = narrow ? 42 : 64;

        if (narrow) {
            // The band is short, so it carries the title with the tools at its
            // shoulders; the names stay HTML copy in the panel below it
            pushTextLine(cells, 'MEMBERS', 64, centerRow - 3, 2, AT);
            pushTextArt(cells, TEXT_MALLET, 13, centerRow - 6);
            pushTextArt(cells, TEXT_CHISEL, 115, centerRow - 6);
        } else {
            pushTextLine(cells, 'MEMBERS', 64, 40, 2, AT);
            for (let c = 0; c < 82; c++) {
                cells.push({ col: 23 + c, row: 49, code: EQ, kind: TK_GLYPH, phase: 0 });
            }
            // Names take the doubled pixels too — single-width letters go
            // spindly in tall Courier cells — and at that size a full name
            // outruns the grid, so each member stacks first name over last
            pushTextLine(cells, 'KELLEN', 64, 53, 2, HASH);
            pushTextLine(cells, 'HERATY', 64, 62, 2, HASH);
            pushTextLine(cells, 'CHASE', 64, 73, 2, HASH);
            pushTextLine(cells, 'CULBERTSON', 64, 82, 2, HASH);
            pushTextArt(cells, TEXT_MALLET, 8, 40);
            pushTextArt(cells, TEXT_CHISEL, 120, 41);
        }

        // Loose sparks scattered through the margins, kept off the type so a
        // twinkle never eats a letter
        const used = new Set();
        for (const cell of cells) used.add(cell.col * 256 + cell.row);
        const sparkCount = narrow ? 26 : 60;
        const r0 = narrow ? centerRow - 14 : 36;
        const r1 = narrow ? centerRow + 14 : 92;
        for (let i = 0; i < sparkCount; i++) {
            const col = 5 + Math.floor(hash01(i * 12.7) * 118);
            const row = r0 + Math.floor(hash01(i * 31.3) * (r1 - r0));
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

    // --- Portal geometry ---
    // Three parts. The lip is a torus swept round an ellipse and is the only
    // thing bright enough to read as solid. The field inside is stored in polar
    // form and positioned at render time, so it can turn with the inner rings
    // running faster than the outer ones, which shears it into a spiral. Motes
    // fall in from outside along the lip's outward normal.

    // Outward normal of the ellipse at angle t. Not the radial direction: for
    // anything other than a circle those differ, and using the radius makes the
    // lip look pinched at the ends.
    function portalOutward(t) {
        let nx = Math.cos(t) / PORTAL_RX, ny = Math.sin(t) / PORTAL_RY;
        const l = Math.hypot(nx, ny) || 1;
        return [nx / l, ny / l];
    }

    function pushPortalLip(targets, count) {
        for (let i = 0; i < count; i++) {
            const t = Math.random() * Math.PI * 2;
            const [onx, ony] = portalOutward(t);
            const around = Math.random() * Math.PI * 2;
            const cp = Math.cos(around), sp = Math.sin(around);
            targets.push({
                x: PORTAL_RX * Math.cos(t) + onx * PORTAL_TUBE * cp,
                y: PORTAL_RY * Math.sin(t) + ony * PORTAL_TUBE * cp,
                z: PORTAL_TUBE * sp,
                nx: onx * cp, ny: ony * cp, nz: sp,
                kind: PK_LIP, fr: 1, fa: t, phase: Math.random()
            });
        }
    }

    function pushPortalField(targets, count) {
        for (let i = 0; i < count; i++) {
            targets.push({
                x: 0, y: 0, z: 0,          // placed by the render loop
                nx: 0, ny: 0, nz: -1,
                kind: PK_FIELD,
                fr: Math.sqrt(Math.random()),   // area-uniform across the mouth
                fa: Math.random() * Math.PI * 2,
                phase: Math.random()
            });
        }
    }

    function pushPortalMotes(targets, count) {
        for (let i = 0; i < count; i++) {
            targets.push({
                x: 0, y: 0, z: 0,
                nx: 0, ny: 0, nz: -1,
                kind: PK_MOTE, fr: 0,
                fa: Math.random() * Math.PI * 2,
                phase: Math.random()
            });
        }
    }

    function generatePortalTargets(count) {
        const targets = [];
        const share = f => Math.max(1, Math.floor(count * f));
        pushPortalLip(targets, share(0.38));
        pushPortalField(targets, share(0.54));
        pushPortalMotes(targets, share(0.08));
        if (targets.length < count) pushPortalField(targets, count - targets.length);
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
                            portX: 0, portY: 0, portZ: 0,
                            portNX: 0, portNY: 0, portNZ: -1,
                            portKind: PK_FIELD, portFR: 0, portFA: 0,
                            portPhase: 0,
                            textX: 0, textY: 0, textZ: 0,
                            textCode: 32, textKind: TK_GLYPH,
                            textPhase: 0, textReveal: 1
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

    const particleOrder = buildSortedIndices(particles.length, i => ({ x: particles[i].logoX, y: particles[i].logoY, z: particles[i].logoZ }));
    const fishOrder = buildSortedIndices(fishTargets.length, i => fishTargets[i]);
    const scopeOrder = buildSortedIndices(scopeTargets.length, i => scopeTargets[i]);
    const dwarfOrder = buildSortedIndices(dwarfTargets.length, i => dwarfTargets[i]);
    const carOrder = buildSortedIndices(carTargets.length, i => carTargets[i]);
    const rocketOrder = buildSortedIndices(rocketTargets.length, i => rocketTargets[i]);
    const portalOrder = buildSortedIndices(portalTargets.length, i => portalTargets[i]);
    const textOrder = buildSortedIndices(textTargets.length, i => textTargets[i]);

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
            p.portX = tPort.x; p.portY = tPort.y; p.portZ = tPort.z;
            p.portNX = tPort.nx; p.portNY = tPort.ny; p.portNZ = tPort.nz;
            p.portKind = tPort.kind;
            p.portFR = tPort.fr;
            p.portFA = tPort.fa;
            p.portPhase = tPort.phase;
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

    // How far the canvas must slide to sit over the middle of the viewport,
    // and how much it must grow for the type layout to fill it. Measured
    // rather than derived from the column widths, so a layout change cannot
    // strand the type off-center. CSS animates the transform whenever the
    // members-mode class toggles, in step with the particle morph.
    function updateMembersVars() {
        if (NARROW.matches) return;
        const box = asciiColumn.getBoundingClientRect();
        if (box.width < 1) return;
        const shift = window.innerWidth / 2 - (box.left + box.width / 2);
        const sx = (window.innerWidth * 0.92) / (TEXT_LAYOUT_COLS * charWidth);
        const sy = (window.innerHeight * 0.92) / (TEXT_LAYOUT_ROWS * charHeight);
        const scale = Math.max(1, Math.min(sx, sy));
        screenElement.style.setProperty('--members-shift', shift.toFixed(1) + 'px');
        screenElement.style.setProperty('--members-scale', scale.toFixed(3));
    }

    updateMembersVars();
    window.addEventListener('resize', updateMembersVars);

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
    //        6 = Rocket, 7 = Portal, 8 = Members type
    const SHAPE_KEYS = ['logo', 'scope', 'fish', 'dwarf', 'logo2', 'car', 'rocket', 'portal', 'text'];
    const STATE_SHAPE = ['logo', 'scope', 'fish', 'dwarf', 'logo2', 'car', 'rocket', 'portal', 'text'];

    let targetState = 0;
    let lastTimestamp = performance.now();
    const currentWeights = {
        logo: 1, scope: 0, fish: 0, dwarf: 0, logo2: 0, car: 0, rocket: 0, portal: 0, text: 0
    };
    let targetWeights = getTargetWeightsForState(0);

    function getTargetWeightsForState(state) {
        const w = {
            logo: 0, scope: 0, fish: 0, dwarf: 0, logo2: 0, car: 0, rocket: 0, portal: 0, text: 0
        };
        const key = STATE_SHAPE[state];
        if (key) w[key] = 1;
        return w;
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
        const wLogoCombined = wLogo + wLogo2;
        const hasScope = wScope > 0;
        const hasFish = wFish > 0;
        const hasDwarf = wDwarf > 0;
        const hasCar = wCar > 0;
        const hasRocket = wRocket > 0;
        const hasPortal = wPortal > 0;
        const hasText = wText > 0;

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

        // The portal is always open, so there is no cycle to wait through: all
        // the life comes from the field turning, ripples crossing it and motes
        // falling in.
        const portalSpin = time * PORTAL_SPIN;
        const portalRipple = time * PORTAL_RIPPLE;
        // Inner radius of the mouth, just inside the lip
        const portalInX = PORTAL_RX - PORTAL_TUBE * 0.85;
        const portalInY = PORTAL_RY - PORTAL_TUBE * 0.85;

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
            // Both are needed again when shading, so they are hoisted out of the
            // blend below: how far this point is into the portal, and whether it
            // is still riding the head of a line that is being drawn.
            // How far a mote is through its fall, 1 outside and 0 at the lip.
            // Set while positioning, read back when shading.
            let portalMoteLife = 0;
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
                let qx = p.portX, qy = p.portY, qz = p.portZ;
                if (p.portKind === PK_FIELD) {
                    // Inner rings turn faster than outer ones, and the shear is
                    // what winds the field into a spiral instead of a spinning
                    // disc that reads as static
                    const fr = p.portFR;
                    const a = p.portFA + portalSpin * (0.35 + 0.95 * (1 - fr));
                    qx = Math.cos(a) * fr * portalInX;
                    qy = Math.sin(a) * fr * portalInY;
                    qz = Math.sin(fr * 5.0 + a * 2.0 + portalRipple) * 0.8;
                } else if (p.portKind === PK_MOTE) {
                    // Falls from PORTAL_MOTE_REACH outside the lip down onto it,
                    // winding forward as it goes
                    portalMoteLife = 1 - ((p.portPhase + time * PORTAL_MOTE_RATE) % 1);
                    const a = p.portFA + portalSpin * 0.5 + portalMoteLife * 2.4;
                    const grow = (1 - portalMoteLife) * PORTAL_MOTE_REACH;
                    const ox = Math.cos(a) / PORTAL_RX, oy = Math.sin(a) / PORTAL_RY;
                    const ol = Math.hypot(ox, oy) || 1;
                    qx = PORTAL_RX * Math.cos(a) + (ox / ol) * grow;
                    qy = PORTAL_RY * Math.sin(a) + (oy / ol) * grow;
                    qz = Math.sin(a * 3.0 + portalRipple) * 1.2;
                }
                px += qx * wPortal; py += qy * wPortal; pz += qz * wPortal;
            }
            if (hasText) {
                px += p.textX * wText;
                py += p.textY * wText;
                pz += p.textZ * wText;
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
                            // The lip carries a real torus normal so the ring
                            // reads as solid; field and motes are flat sparks
                            // facing the camera
                            nx += (p.portNX * cosT - p.portNZ * sinT) * wPortal;
                            ny += p.portNY * wPortal;
                            nz += (p.portNX * sinT + p.portNZ * cosT) * wPortal;
                        }
                        if (hasText) {
                            // Flat type faces the camera
                            nz -= wText;
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
                        if (hasFish || hasScope || hasCar || hasRocket) {
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

                        if (hasPortal) {
                            let pb;
                            if (p.portKind === PK_LIP) {
                                // Lit in the portal's own frame, since it is held
                                // square to the camera and a world light would just
                                // track the drift instead of describing the lip.
                                const pForm = Math.max(0.15, p.portNX * LX
                                    + p.portNY * LY - Math.abs(p.portNZ) * LZ);
                                // A charge runs round the ring. Uniform tone
                                // saturates in this glyph set past about 0.45, so
                                // the wave swings across that mark to stay visible
                                // rather than riding above it.
                                const wave = Math.sin(p.portFA * 3.0 - portalSpin * 2.6);
                                pb = 0.34 + pForm * 0.20 + (wave > 0.2 ? 0.28 : 0);
                            } else if (p.portKind === PK_FIELD) {
                                const fr = p.portFR;
                                // Brightest where it meets the lip, falling away
                                // toward the middle, with spiral arms over the top
                                // and ripples running outward
                                // Three separable tones: field, arm, rim. Anything
                                // over about 0.45 collapses to one glyph, so they
                                // are spaced inside the band below it.
                                const glow = Math.pow(fr, 2.6) * 0.22;
                                const arm = Math.sin(p.portFA * 3.0 - fr * 5.0
                                    + portalSpin * 1.4);
                                const ripple = Math.sin(fr * 11.0 - portalRipple * 2.0);
                                pb = 0.19 + glow + (arm > 0.15 ? 0.16 : 0)
                                    + ripple * 0.05;
                            } else {
                                // Fades up on the way in and dies at the lip, so
                                // the loop never shows a mote popping in or out
                                const l = portalMoteLife;
                                pb = 0.1 + Math.min(1, (1 - l) * 5.0)
                                    * Math.min(1, l * 5.0) * 0.46;
                            }
                            brightness += clamp01(pb) * wPortal;
                        }

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
                        brightness -= fog * (1.0 - wCar * 0.65 - wFish * 0.5 - wScope * 0.5 - wText * 0.85);
                        brightness = clamp01(brightness);

                        brightnessBuffer[idx] = brightness;

                        // Sentinel: 0 = needs shape matching in Pass 2.
                        // Settled type prints its own character instead: the
                        // per-particle threshold staggers the switch, so the
                        // glyphs crystallize out of the arriving cloud rather
                        // than snapping in — and crumble back out the same way
                        // when the section scrolls past.
                        textBuffer[idx] = (hasText && p.textKind === TK_GLYPH
                            && wText >= p.textReveal)
                            ? p.textCode : 0;

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

            // A portal is only a portal seen through, so hold the mouth square to
            // the camera and keep the oval an oval. Drag still spins it freely.
            // The rocket is held for the same reason: the climb angle only reads
            // side on, and its own roll supplies the movement. Type is held
            // hardest of all: letters only exist face-on.
            if (hasPortal || hasRocket || hasText) {
                const square = Math.round(angle / (Math.PI * 2)) * (Math.PI * 2);
                const pull = 1.0 - Math.pow(0.94, timeScale);
                angle += (square - angle) * pull * Math.max(wPortal, wRocket, wText);
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
    const avResearch = document.getElementById('av-research');
    const products = document.getElementById('products');
    const constellation = document.getElementById('project-constellation');
    const members = document.getElementById('members');
    const sourceCode = document.getElementById('connect');

    let isAboutUsVisible = false;
    let isFutureProjectsVisible = false, isSunfishVisible = false;
    let isBrownDwarfVisible = false, isAvResearchVisible = false, isSourceCodeVisible = false;
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
        else if (isBrownDwarfVisible) newTarget = 3;
        else if (isSunfishVisible) newTarget = 2;
        else if (isFutureProjectsVisible) newTarget = 1;
        else if (isAboutUsVisible) newTarget = 0;

        if (newTarget !== null && newTarget !== targetState) {
            targetState = newTarget;
            targetWeights = getTargetWeightsForState(newTarget);
            // Resized as the morph starts, so the change of scale is carried by
            // the same motion that rebuilds the shape
            fitShapeToPanel(newTarget);
            // Members: the same moment the particles start flattening into
            // type, the canvas starts sliding out to fill the screen — one
            // motion, two mechanisms
            document.body.classList.toggle('members-mode', newTarget === 8);
        }
    }

    const narrowLayout = NARROW.matches;
    const obsOptions = { threshold: 0.1, rootMargin: '-40% 0px -40% 0px' };
    const connectObsOptions = { threshold: 0.1, rootMargin: '-30% 0px -50% 0px' };

    // Roughly how many cells each shape covers, padded a little for the ones
    // that spin. The footprints are wildly different, so on mobile one font
    // size cannot serve them all: sized to fit the 116 column road diorama, the
    // 48 column portal ends up a third of the panel and looks like an
    // afterthought. Each state gets the size that fills the panel instead.
    const STATE_EXTENT = [
        { cols: 70, rows: 46 },   // 0 logo
        { cols: 48, rows: 46 },   // 1 microscope
        { cols: 46, rows: 42 },   // 2 sunfish
        { cols: 58, rows: 36 },   // 3 brown dwarf
        { cols: 70, rows: 46 },   // 4 logo again
        { cols: 116, rows: 28 },  // 5 road diorama
        { cols: 102, rows: 54 },  // 6 rocket
        { cols: 48, rows: 40 },   // 7 portal
        { cols: 124, rows: 28 }   // 8 members type
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
            [avResearch, 5], [products, 6], [constellation, 7], [members, 8],
            [sourceCode, 4]
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
            if (bestState !== targetState) {
                targetState = bestState;
                targetWeights = getTargetWeightsForState(bestState);
                fitShapeToPanel(bestState);
            }
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
