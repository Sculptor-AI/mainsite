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

    const FISH_ART = `
                           .
                         .\` \`.
                       .\`     \`.
                 _....:._       .                        .
              .-\`        \`\`-._   \`.                   .-\` .
           .-\`                \`-..:_               .-\`    .
        .-\`                         \`-.          .\`       .
     .-\`                               \`-.__...-\`       .\`
   .\`                                                  .
 .\`   ()     .                                        .
 \`.          .                                         .
   \`.        .  .'''.                   _....._         \`.
     \`-.    .   '....'               ..'.      \`-.        .
        \`-..._                    _.\`    '        \`-.     .
              \`-.................'.    .'            \`-.__. 
                   \`.         :    '. '
                     \`.       :      '
                       \`._.  .'
                          \`.\`
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

    function generateFishTargets() {
        const targets = [];
        const lines = FISH_ART.split('\n');
        let minC = 9999, maxC = 0, minR = 9999, maxR = 0;
        for (let r = 0; r < lines.length; r++) {
            for (let c = 0; c < lines[r].length; c++) {
                if (lines[r][c] !== ' ' && lines[r][c] !== '\n') {
                    if (c < minC) minC = c; if (c > maxC) maxC = c;
                    if (r < minR) minR = r; if (r > maxR) maxR = r;
                }
            }
        }
        const centerX = (minC + maxC) / 2;
        const centerY = (minR + maxR) / 2;
        for (let r = 0; r < lines.length; r++) {
            for (let c = 0; c < lines[r].length; c++) {
                let char = lines[r][c];
                if (char && char !== ' ' && char !== '\n') {
                    const baseX = (c - centerX) * GRID_X;
                    const baseY = -(r - centerY) * GRID_Y;
                    const weight = getCharWeight(char);
                    const FISH_EXTRUSION = 4.0, FISH_SCALE = 0.5;
                    for (let z = -FISH_EXTRUSION; z <= FISH_EXTRUSION; z += Z_STEP) {
                        targets.push({
                            x: (baseX + (Math.random() - 0.5) * XY_JITTER) * FISH_SCALE,
                            y: (baseY + (Math.random() - 0.5) * XY_JITTER) * FISH_SCALE,
                            z: z * FISH_SCALE,
                            isFace: (z > FISH_EXTRUSION - 1.0 || z < -FISH_EXTRUSION + 1.0),
                            weight: weight
                        });
                    }
                }
            }
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
                            fishIsFace: false, fishFaceSign: 1, fishWeight: 0,
                            dwarfX: 0, dwarfY: 0, dwarfZ: 0,
                            dwarfNX: 0, dwarfNY: 0, dwarfNZ: 0,
                            dwarfBandPhase: 0, dwarfSwirlPhase: 0,
                            dwarfStormPhase: 0, dwarfDriftPhase: 0,
                            dwarfEquatorBias: 0,
                            carX: 0, carY: 0, carZ: 0,
                            carNX: 0, carNY: 0, carNZ: 0,
                            carKind: CK_ROAD, carPhase: 0,
                            carShade: 0, carBob: 0
                        });
                    }
                }
            }
        }
    }

    initLogo();

    // Generate targets
    const fishTargets = generateFishTargets();
    const dwarfTargets = generateDwarfTargets(particles.length);
    const carTargets = generateCarTargets(particles.length);

    const particleOrder = buildSortedIndices(particles.length, i => ({ x: particles[i].logoX, y: particles[i].logoY, z: particles[i].logoZ }));
    const fishOrder = buildSortedIndices(fishTargets.length, i => fishTargets[i]);
    const dwarfOrder = buildSortedIndices(dwarfTargets.length, i => dwarfTargets[i]);
    const carOrder = buildSortedIndices(carTargets.length, i => carTargets[i]);

    for (let k = 0; k < particles.length; k++) {
        const p = particles[particleOrder[k]];

        if (k < fishTargets.length) {
            const tFish = fishTargets[fishOrder[k]];
            p.fishX = tFish.x; p.fishY = tFish.y; p.fishZ = tFish.z;
            p.fishIsFace = tFish.isFace;
            p.fishFaceSign = tFish.z >= 0 ? 1 : -1;
            p.fishWeight = tFish.weight;
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

        p.logo2X = p.logoX; p.logo2Y = p.logoY; p.logo2Z = p.logoZ;
    }

    // --- Shape Vector System ---
    const shapeData = computeShapeVectors("'Courier New', Courier, monospace");

    // --- Rendering Setup ---
    const screenElement = document.getElementById('solid-logo-canvas');
    const asciiColumn = screenElement.closest('.ascii-column') || screenElement;
    const logoLoop = createVisibilityController(asciiColumn);
    const surface = createTextSurface(128, 128);
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

    // Touch events
    asciiColumn.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            handleDragStart(e.touches[0].clientX);
        }
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
        if (isDragging && e.touches.length === 1) {
            handleDragMove(e.touches[0].clientX);
        }
    });
    window.addEventListener('touchend', handleDragEnd);
    window.addEventListener('touchcancel', handleDragEnd);

    // State: 0 = Logo, 2 = Fish, 3 = Dwarf, 4 = Logo2, 5 = Car
    let targetState = 0;
    let lastTimestamp = performance.now();
    let currentWeights = { logo: 1, fish: 0, dwarf: 0, logo2: 0, car: 0 };
    let targetWeights = { logo: 1, fish: 0, dwarf: 0, logo2: 0, car: 0 };

    function getTargetWeightsForState(state) {
        let w = { logo: 0, fish: 0, dwarf: 0, logo2: 0, car: 0 };
        switch (state) {
            case 0: w.logo = 1; break;
            case 2: w.fish = 1; break;
            case 3: w.dwarf = 1; break;
            case 4: w.logo2 = 1; break;
            case 5: w.car = 1; break;
        }
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
        currentWeights.logo += (targetWeights.logo - currentWeights.logo) * morphSpeed;
        currentWeights.fish += (targetWeights.fish - currentWeights.fish) * morphSpeed;
        currentWeights.dwarf += (targetWeights.dwarf - currentWeights.dwarf) * morphSpeed;
        currentWeights.logo2 += (targetWeights.logo2 - currentWeights.logo2) * morphSpeed;
        currentWeights.car += (targetWeights.car - currentWeights.car) * morphSpeed;

        let sum = currentWeights.logo + currentWeights.fish + currentWeights.dwarf + currentWeights.logo2 + currentWeights.car;
        if (sum > 0.001) {
            currentWeights.logo /= sum;
            currentWeights.fish /= sum; currentWeights.dwarf /= sum;
            currentWeights.logo2 /= sum; currentWeights.car /= sum;
        }

        let wLogo = currentWeights.logo < 0.001 ? 0 : currentWeights.logo;
        let wFish = currentWeights.fish < 0.001 ? 0 : currentWeights.fish;
        let wDwarf = currentWeights.dwarf < 0.001 ? 0 : currentWeights.dwarf;
        let wLogo2 = currentWeights.logo2 < 0.001 ? 0 : currentWeights.logo2;
        let wCar = currentWeights.car < 0.001 ? 0 : currentWeights.car;
        const wLogoCombined = wLogo + wLogo2;
        const hasFish = wFish > 0;
        const hasDwarf = wDwarf > 0;
        const hasCar = wCar > 0;

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

            if (wLogoCombined) {
                px += p.logoX * wLogoCombined;
                py += p.logoY * wLogoCombined;
                pz += p.logoZ * wLogoCombined;
            }
            if (hasFish) { px += p.fishX * wFish; py += p.fishY * wFish; pz += p.fishZ * wFish; }
            if (hasDwarf) { px += p.dwarfX * wDwarf; py += p.dwarfY * wDwarf; pz += p.dwarfZ * wDwarf; }
            if (hasCar) {
                px += p.carX * wCar;
                py += (p.carY + carBobOffset * p.carBob) * wCar;
                pz += p.carZ * wCar;
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
                            nx += (p.fishIsFace ? sinT * p.fishFaceSign : sideNormalX) * wFish;
                            nz += (p.fishIsFace ? cosT * p.fishFaceSign : sideNormalZ) * wFish;
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
                        if (hasFish) {
                            brightness += (p.fishIsFace ? (diffuse * 0.4 + p.fishWeight * 0.8) : (diffuse * 0.7)) * wFish;
                        }

                        if (hasCar) {
                            let cb;
                            switch (p.carKind) {
                                case CK_BODY: {
                                    // Product-shot lighting: camera-facing panels carry the
                                    // silhouette, roof stays quieter, plus a specular kick
                                    let facing = -nz;
                                    if (facing < 0) facing = 0;
                                    let spec = nx * HX + ny * HY + nz * HZ;
                                    if (spec < 0) spec = 0;
                                    spec *= spec; spec *= spec; spec *= spec; spec *= spec;
                                    cb = 0.18 + facing * 0.7 + diffuse * 0.2 + spec * 0.5;
                                    break;
                                }
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

                        // Depth fog — mostly cancelled for the car diorama, whose
                        // platform is wide enough that full fog would crush the far half
                        let fog = (z + 50) / 200.0;
                        brightness -= fog * (1.0 - wCar * 0.65);
                        brightness = clamp01(brightness);

                        brightnessBuffer[idx] = brightness;

                        // Sentinel: 0 = needs shape matching in Pass 2
                        textBuffer[idx] = 0;

                        if (hasFish && wFish > 0.8 && p.fishWeight === 0) {
                            textBuffer[idx] = SPACE_CODE;
                        }

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
        let speedMult = 1.0 * wLogoCombined + 3.0 * wFish + 0.8 * wDwarf;
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
        }

        requestAnimationFrame(render);
    }

    // --- Scroll Trigger Logic ---
    const aboutUs = document.getElementById('about-us');
    const futureProjects = document.getElementById('future-projects');
    const sunfish = document.getElementById('project-sunfish');
    const brownDwarf = document.getElementById('brown-dwarf');
    const avResearch = document.getElementById('av-research');
    const sourceCode = document.getElementById('connect');

    let isAboutUsVisible = false;
    let isFutureProjectsVisible = false, isSunfishVisible = false;
    let isBrownDwarfVisible = false, isAvResearchVisible = false, isSourceCodeVisible = false;

    function updateState() {
        let newTarget = null;
        if (isSourceCodeVisible) newTarget = 4;
        else if (isAvResearchVisible) newTarget = 5;
        else if (isBrownDwarfVisible) newTarget = 3;
        else if (isSunfishVisible) newTarget = 2;
        else if (isFutureProjectsVisible) newTarget = 0;
        else if (isAboutUsVisible) newTarget = 0;

        if (newTarget !== null && newTarget !== targetState) {
            targetState = newTarget;
            targetWeights = getTargetWeightsForState(newTarget);
        }
    }

    const obsOptions = { threshold: 0.1, rootMargin: '-40% 0px -40% 0px' };
    if (aboutUs) new IntersectionObserver((e) => { e.forEach(x => { isAboutUsVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(aboutUs);
    if (futureProjects) new IntersectionObserver((e) => { e.forEach(x => { isFutureProjectsVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(futureProjects);
    if (sunfish) new IntersectionObserver((e) => { e.forEach(x => { isSunfishVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(sunfish);
    if (brownDwarf) new IntersectionObserver((e) => { e.forEach(x => { isBrownDwarfVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(brownDwarf);
    if (avResearch) new IntersectionObserver((e) => { e.forEach(x => { isAvResearchVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(avResearch);
    if (sourceCode) new IntersectionObserver((e) => { e.forEach(x => { isSourceCodeVisible = x.isIntersecting; updateState(); }); }, { threshold: 0.1, rootMargin: '-30% 0px -50% 0px' }).observe(sourceCode);

    requestAnimationFrame(render);
})();
