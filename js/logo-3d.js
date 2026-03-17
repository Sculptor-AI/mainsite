/*
 * Sculptor AI - 3D Logo Animation
 * Handles the solid 3D logo in the left column.
 */

(function () {
    const {
        SPACE_CODE,
        clamp01,
        createTextSurface,
        createVisibilityController,
        hash01,
        packColor,
        sampleRampCode,
        toCharCodes
    } = window.ASCIIUtils;

    // --- Configuration ---
    const VIEW_DISTANCE = 55.0;
    const ROTATION_SPEED = 0.005; // Restored rotation
    const EXTRUSION_DEPTH = 3.75; // Reduced 25%
    const ORB_RADIUS = 24.0;      // Reduced 25%
    const MORPH_DURATION = 1.2; // seconds to morph logo -> orb
    const BURST_DISTANCE = 14.0;

    // Voxel density
    const Z_STEP = 0.2; // High resolution depth
    const XY_JITTER = 0.5; // Randomness to fill gaps

    // A long gradient for better depth resolution
    const SHADE_CHARS = " `.-':_,^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@";
    const SHADE_CHAR_CODES = toCharCodes(SHADE_CHARS);
    const SHADE_DITHER = 0.06;

    const CODE_TEXT = `import { Galaxy } from 'cosmos'; const star = new Star({ type: 'G2V', mass: 1.0 }); function main() { while(orbiting) { physics.simulate(dt); render(scene); } } class BlackHole extends Singularity { consume(light) { return void 0; } } const entropy = Math.random(); if (entropy > 0.99) { bigBang(); } // TODO: Fix gravity bug export default function() { return 42; } const darkMatter = calculate(95); `;

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

    // Your specific Sunfish ASCII Art
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

    const GRID_X = 1.35; // Reduced 25%
    const GRID_Y = 2.6;  // Reduced ~25%

    const particles = [];

    // Colors for Brown Dwarf (State 3)
    const COLOR_COLD = { r: 60, g: 20, b: 70 };
    const COLOR_MID = { r: 220, g: 60, b: 100 };
    const COLOR_HOT = { r: 255, g: 210, b: 140 };

    // Default color (Logo/Orb/Fish are white/grey)
    const COLOR_DEFAULT = { r: 224, g: 224, b: 224 };
    const DWARF_COLOR_LEVELS = 12;
    const DWARF_COLOR_THRESHOLD = 0.16;
    const DWARF_RIM_COLOR = { r: 255, g: 232, b: 180 };
    const DWARF_BASE_PALETTE = Array.from({ length: DWARF_COLOR_LEVELS }, (_, i) => {
        const t = i / Math.max(1, DWARF_COLOR_LEVELS - 1);
        const heat = getHeatColor(t);
        return lerpColor(heat, DWARF_RIM_COLOR, Math.pow(t, 3) * 0.3);
    });
    const DWARF_FRAME_PALETTE = new Uint32Array(DWARF_COLOR_LEVELS);

    // Map original chars to a "weight" (0.0 to 1.0)
    function getCharWeight(c) {
        const weights = {
            '.': 0.3, ',': 0.3, "'": 0.3, '`': 0.3,
            ':': 0.4, '-': 0.4, '_': 0.5,
            '=': 0.5, '+': 0.6,
            '(': 0.7, ')': 0.7,
            '*': 0.7, '#': 0.8, '%': 0.9, '@': 1.0
        };
        return weights[c] || 0.6; // Default weight
    }

    function lerp(start, end, t) {
        return start * (1 - t) + end * t;
    }

    function lerpColor(c1, c2, t) {
        return {
            r: Math.floor(lerp(c1.r, c2.r, t)),
            g: Math.floor(lerp(c1.g, c2.g, t)),
            b: Math.floor(lerp(c1.b, c2.b, t))
        };
    }

    function getHeatColor(val) {
        if (val < 0) val = 0;
        if (val > 1) val = 1;

        if (val < 0.5) {
            let t = val * 2.0;
            return lerpColor(COLOR_COLD, COLOR_MID, t);
        } else {
            let t = (val - 0.5) * 2.0;
            return lerpColor(COLOR_MID, COLOR_HOT, t);
        }
    }

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

    function generateOrbTargets(count) {
        const targets = [];
        const golden = Math.PI * (3 - Math.sqrt(5));
        const denom = Math.max(1, count - 1);

        for (let i = 0; i < count; i++) {
            const y = 1 - (i / denom) * 2;
            const radius = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = golden * i;
            // Tighter jitter for cleaner text lines
            const radiusJitter = ORB_RADIUS * (0.98 + Math.random() * 0.04);

            targets.push({
                x: Math.cos(theta) * radius * radiusJitter,
                y: y * radiusJitter,
                z: Math.sin(theta) * radius * radiusJitter,
                char: ' '
            });
        }
        return targets;
    }

    // Brown Dwarf uses similar spherical targets but packed more densely visually?
    // Actually we can reuse the orb target generation but maybe modify radius/jitter
    function generateDwarfTargets(count) {
        const targets = [];
        const golden = Math.PI * (3 - Math.sqrt(5));
        const denom = Math.max(1, count - 1);
        const DWARF_RADIUS = 21.0; // Reduced to 75% size

        for (let i = 0; i < count; i++) {
            const y = 1 - (i / denom) * 2;
            const radius = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = golden * i;
            // Less jitter for a smoother gas giant surface
            const r = DWARF_RADIUS;

            targets.push({
                x: Math.cos(theta) * r * radius,
                y: y * r,
                z: Math.sin(theta) * r * radius
            });
        }
        return targets;
    }

    function generateFishTargets() {
        const targets = [];
        const lines = FISH_ART.split('\n');

        // Center Calculation
        let minC = 9999, maxC = 0;
        let minR = 9999, maxR = 0;

        for (let r = 0; r < lines.length; r++) {
            let line = lines[r];
            for (let c = 0; c < line.length; c++) {
                if (line[c] !== ' ' && line[c] !== undefined && line[c] !== '\n') {
                    if (c < minC) minC = c;
                    if (c > maxC) maxC = c;
                    if (r < minR) minR = r;
                    if (r > maxR) maxR = r;
                }
            }
        }

        const centerX = (minC + maxC) / 2;
        const centerY = (minR + maxR) / 2;

        // Generate Voxels
        for (let r = 0; r < lines.length; r++) {
            let line = lines[r];
            for (let c = 0; c < line.length; c++) {
                let char = line[c];
                if (char && char !== ' ' && char !== '\n') {

                    const baseX = (c - centerX) * GRID_X;
                    const baseY = -(r - centerY) * GRID_Y;
                    const weight = getCharWeight(char);

                    // Extrude Z - Using 4.0 to match the fish demo
                    const FISH_EXTRUSION = 4.0;
                    const FISH_SCALE = 0.5;

                    for (let z = -FISH_EXTRUSION; z <= FISH_EXTRUSION; z += Z_STEP) {

                        let isFace = (z > FISH_EXTRUSION - 1.0 || z < -FISH_EXTRUSION + 1.0);

                        targets.push({
                            x: (baseX + (Math.random() - 0.5) * XY_JITTER) * FISH_SCALE,
                            y: (baseY + (Math.random() - 0.5) * XY_JITTER) * FISH_SCALE,
                            z: z * FISH_SCALE,
                            isFace: isFace,
                            weight: weight
                        });
                    }
                }
            }
        }
        return targets;
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

        // Center Calculation
        let totalC = 0, totalR = 0, count = 0;
        for (let r = 0; r < lines.length; r++) {
            let line = lines[r];
            for (let c = 0; c < line.length; c++) {
                if (line[c] !== ' ' && line[c] !== undefined && line[c] !== '\n') {
                    totalC += c; totalR += r; count++;
                }
            }
        }
        const centerX = count > 0 ? totalC / count : 0;
        const centerY = count > 0 ? totalR / count : 0;

        // Generate Voxels
        for (let r = 0; r < lines.length; r++) {
            let line = lines[r];
            for (let c = 0; c < line.length; c++) {
                let char = line[c];
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

                            // State 0: Logo
                            logoX: baseX + (Math.random() - 0.5) * XY_JITTER,
                            logoY: baseY + (Math.random() - 0.5) * XY_JITTER,
                            logoZ: z,
                            logoIsFace: isFace,
                            logoFaceSign: z >= 0 ? 1 : -1,
                            logoWeight: weight,

                            // State 1: Orb
                            orbX: 0, orbY: 0, orbZ: 0,
                            orbNX: 0, orbNY: 0, orbNZ: 0,
                            orbCharCode: SPACE_CODE,
                            orbReveal: hash01((particles.length + 1) * 19.0),

                            // State 2: Fish
                            fishX: 0, fishY: 0, fishZ: 0,
                            fishIsFace: false,
                            fishFaceSign: 1,
                            fishWeight: 0,

                            // State 3: Brown Dwarf
                            dwarfX: 0, dwarfY: 0, dwarfZ: 0,
                            dwarfNX: 0, dwarfNY: 0, dwarfNZ: 0,
                            dwarfBandPhase: 0,
                            dwarfSwirlPhase: 0,
                            dwarfStormPhase: 0,
                            dwarfDriftPhase: 0,
                            dwarfEquatorBias: 0
                        });
                    }
                }
            }
        }
    }

    initLogo();

    // Generate Orb Layout
    const orbTargets = generateOrbTargets(particles.length);

    // Apply Code Text Wrapping
    const cleanText = CODE_TEXT.replace(/\s+/g, ' ');
    const textOrder = orbTargets.map((t, i) => i).sort((a, b) => {
        const ta = orbTargets[a];
        const tb = orbTargets[b];
        const rows = 25;
        const rowA = Math.floor((1 - ta.y / ORB_RADIUS) / 2 * rows);
        const rowB = Math.floor((1 - tb.y / ORB_RADIUS) / 2 * rows);
        if (rowA !== rowB) return rowA - rowB;
        const angA = Math.atan2(ta.z, ta.x);
        const angB = Math.atan2(tb.z, tb.x);
        return angB - angA;
    });
    textOrder.forEach((targetIndex, i) => {
        orbTargets[targetIndex].char = cleanText[i % cleanText.length];
    });

    // Generate Fish Layout
    const fishTargets = generateFishTargets();

    // Generate Dwarf Layout
    const dwarfTargets = generateDwarfTargets(particles.length);

    // Map particles
    const particleOrder = buildSortedIndices(particles.length, i => ({ x: particles[i].logoX, y: particles[i].logoY, z: particles[i].logoZ }));
    const orbOrder = buildSortedIndices(orbTargets.length, i => orbTargets[i]);
    const fishOrder = buildSortedIndices(fishTargets.length, i => fishTargets[i]);
    const dwarfOrder = buildSortedIndices(dwarfTargets.length, i => dwarfTargets[i]);

    for (let k = 0; k < particles.length; k++) {
        const p = particles[particleOrder[k]];

        // Orb
        const tOrb = orbTargets[orbOrder[k]];
        const orbLen = Math.hypot(tOrb.x, tOrb.y, tOrb.z) || 1;
        p.orbX = tOrb.x; p.orbY = tOrb.y; p.orbZ = tOrb.z;
        p.orbNX = tOrb.x / orbLen; p.orbNY = tOrb.y / orbLen; p.orbNZ = tOrb.z / orbLen;
        p.orbCharCode = tOrb.char.charCodeAt(0);

        // Fish
        if (k < fishTargets.length) {
            const tFish = fishTargets[fishOrder[k]];
            p.fishX = tFish.x; p.fishY = tFish.y; p.fishZ = tFish.z;
            p.fishIsFace = tFish.isFace;
            p.fishFaceSign = tFish.z >= 0 ? 1 : -1;
            p.fishWeight = tFish.weight;
        } else {
            p.fishX = 0; p.fishY = 0; p.fishZ = 0; p.fishWeight = 0; p.fishIsFace = false; p.fishFaceSign = 1;
        }

        // Dwarf
        const tDwarf = dwarfTargets[dwarfOrder[k]];
        p.dwarfX = tDwarf.x; p.dwarfY = tDwarf.y; p.dwarfZ = tDwarf.z;
        const dwarfLen = Math.hypot(tDwarf.x, tDwarf.y, tDwarf.z) || 1;
        p.dwarfNX = tDwarf.x / dwarfLen; p.dwarfNY = tDwarf.y / dwarfLen; p.dwarfNZ = tDwarf.z / dwarfLen;
        p.dwarfBandPhase = p.dwarfNY * 12.0 + p.dwarfNX * 1.5;
        p.dwarfSwirlPhase = (p.dwarfNX * 5.5) + (p.dwarfNZ * 4.5) + (p.dwarfNY * 2.0);
        p.dwarfStormPhase = Math.atan2(p.dwarfNZ, p.dwarfNX) * 2.6 + p.dwarfNY * 3.5;
        p.dwarfDriftPhase = (p.dwarfNX * 3.0) - (p.dwarfNZ * 2.0) + p.dwarfNY * 1.5;
        p.dwarfEquatorBias = 1.0 - Math.abs(p.dwarfNY);

        // Logo2 (Return state - identical to Logo)
        p.logo2X = p.logoX;
        p.logo2Y = p.logoY;
        p.logo2Z = p.logoZ;
    }

    // --- Rendering ---
    const screenElement = document.getElementById('solid-logo-canvas');
    const logoLoop = createVisibilityController(screenElement.closest('.ascii-column') || screenElement);
    const surface = createTextSurface(128, 128);
    const width = surface.width;
    const height = surface.height;
    const zbuffer = surface.zBuffer;
    const textBuffer = surface.charBuffer;
    const colorBuffer = surface.colorBuffer;
    const DEFAULT_PACKED_COLOR = packColor(COLOR_DEFAULT.r, COLOR_DEFAULT.g, COLOR_DEFAULT.b);

    // Measure Char size
    // Measure Char size dynamically
    let charWidth = 6;
    let charHeight = 10;

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

    let angle = 0;
    let time = 0;

    // State: 0 = Logo, 1 = Orb, 2 = Fish, 3 = Dwarf, 4 = Logo2 (Return)
    let targetState = 0;
    let lastTimestamp = performance.now();

    // Track current blend weights continuously (allows smooth mid-morph transitions)
    let currentWeights = { logo: 1, orb: 0, fish: 0, dwarf: 0, logo2: 0 };
    let targetWeights = { logo: 1, orb: 0, fish: 0, dwarf: 0, logo2: 0 };

    // Get target weights for a state
    function getTargetWeightsForState(state) {
        let w = { logo: 0, orb: 0, fish: 0, dwarf: 0, logo2: 0 };
        switch (state) {
            case 0: w.logo = 1; break;
            case 1: w.orb = 1; break;
            case 2: w.fish = 1; break;
            case 3: w.dwarf = 1; break;
            case 4: w.logo2 = 1; break;
        }
        return w;
    }

    function render(timestamp) {
        const now = typeof timestamp === 'number' ? timestamp : performance.now();

        if (!logoLoop.isActive()) {
            lastTimestamp = now;
            requestAnimationFrame(render);
            return;
        }

        const dt = Math.min(0.05, Math.max(0, (now - lastTimestamp) / 1000)); // seconds
        lastTimestamp = now;
        time += dt;

        // Smooth weight interpolation - always move current weights toward target weights
        const morphSpeed = dt / MORPH_DURATION * 2; // Speed of weight change

        // Smoothly interpolate each weight toward its target
        currentWeights.logo += (targetWeights.logo - currentWeights.logo) * morphSpeed;
        currentWeights.orb += (targetWeights.orb - currentWeights.orb) * morphSpeed;
        currentWeights.fish += (targetWeights.fish - currentWeights.fish) * morphSpeed;
        currentWeights.dwarf += (targetWeights.dwarf - currentWeights.dwarf) * morphSpeed;
        currentWeights.logo2 += (targetWeights.logo2 - currentWeights.logo2) * morphSpeed;

        // Normalize weights to ensure they sum to 1
        let sum = currentWeights.logo + currentWeights.orb + currentWeights.fish + currentWeights.dwarf + currentWeights.logo2;
        if (sum > 0.001) {
            currentWeights.logo /= sum;
            currentWeights.orb /= sum;
            currentWeights.fish /= sum;
            currentWeights.dwarf /= sum;
            currentWeights.logo2 /= sum;
        }

        // Use current weights for rendering
        let wLogo = currentWeights.logo;
        let wOrb = currentWeights.orb;
        let wFish = currentWeights.fish;
        let wDwarf = currentWeights.dwarf;
        let wLogo2 = currentWeights.logo2;
        if (wLogo < 0.001) wLogo = 0;
        if (wOrb < 0.001) wOrb = 0;
        if (wFish < 0.001) wFish = 0;
        if (wDwarf < 0.001) wDwarf = 0;
        if (wLogo2 < 0.001) wLogo2 = 0;
        const wLogoCombined = wLogo + wLogo2;
        const hasOrb = wOrb > 0;
        const hasFish = wFish > 0;
        const hasDwarf = wDwarf > 0;

        const aspectCorrection = (charHeight / charWidth);

        surface.reset();

        const dwarfColorBlend = clamp01((wDwarf - DWARF_COLOR_THRESHOLD) / (1.0 - DWARF_COLOR_THRESHOLD));
        const useColor = dwarfColorBlend > 0.001;
        const dwarfPalette = useColor ? buildDwarfPalette(dwarfColorBlend) : null;
        const dwarfTime = hasDwarf ? {
            band: time * 1.15,
            drift: time * 0.35,
            swirl: time * 1.7,
            storm: time * 0.6
        } : null;

        const K1 = 40.0;
        const cosT = Math.cos(angle);
        const sinT = Math.sin(angle);
        const sideNormalX = cosT;
        const sideNormalZ = -sinT;

        const lx = 0.6; const ly = 0.4; const lz = -0.5;

        for (let i = 0; i < particles.length; i++) {
            let p = particles[i];

            let px = 0;
            let py = 0;
            let pz = 0;

            if (wLogoCombined) {
                px += p.logoX * wLogoCombined;
                py += p.logoY * wLogoCombined;
                pz += p.logoZ * wLogoCombined;
            }
            if (hasOrb) {
                px += p.orbX * wOrb;
                py += p.orbY * wOrb;
                pz += p.orbZ * wOrb;
            }
            if (hasFish) {
                px += p.fishX * wFish;
                py += p.fishY * wFish;
                pz += p.fishZ * wFish;
            }
            if (hasDwarf) {
                px += p.dwarfX * wDwarf;
                py += p.dwarfY * wDwarf;
                pz += p.dwarfZ * wDwarf;
            }

            // Rotate
            let x = px * cosT - pz * sinT;
            let z = px * sinT + pz * cosT;
            let y = py;

            let zDist = VIEW_DISTANCE + z;

            if (zDist > 1.0) {
                let ooz = 1.0 / zDist;
                // Aspect Correction
                let xp = Math.floor(width / 2 + K1 * ooz * x * aspectCorrection);
                let yp = Math.floor(height / 2 - K1 * ooz * y);

                if (xp >= 0 && xp < width && yp >= 0 && yp < height) {
                    let idx = xp + yp * width;
                    if (ooz > zbuffer[idx]) {
                        zbuffer[idx] = ooz;

                        let nLogoX = p.logoIsFace ? sinT * p.logoFaceSign : sideNormalX;
                        let nLogoZ = p.logoIsFace ? cosT * p.logoFaceSign : sideNormalZ;
                        let nx = nLogoX * wLogoCombined;
                        let ny = 0;
                        let nz = nLogoZ * wLogoCombined;

                        if (hasOrb) {
                            const nOrbX = p.orbNX * cosT - p.orbNZ * sinT;
                            const nOrbZ = p.orbNX * sinT + p.orbNZ * cosT;
                            nx += nOrbX * wOrb;
                            ny += p.orbNY * wOrb;
                            nz += nOrbZ * wOrb;
                        }

                        if (hasFish) {
                            const nFishX = p.fishIsFace ? sinT * p.fishFaceSign : sideNormalX;
                            const nFishZ = p.fishIsFace ? cosT * p.fishFaceSign : sideNormalZ;
                            nx += nFishX * wFish;
                            nz += nFishZ * wFish;
                        }

                        if (hasDwarf) {
                            const nDwarfX = p.dwarfNX * cosT - p.dwarfNZ * sinT;
                            const nDwarfZ = p.dwarfNX * sinT + p.dwarfNZ * cosT;
                            nx += nDwarfX * wDwarf;
                            ny += p.dwarfNY * wDwarf;
                            nz += nDwarfZ * wDwarf;
                        }

                        let norm = Math.hypot(nx, ny, nz) || 0.001;
                        nx /= norm; ny /= norm; nz /= norm;

                        let dot = nx * lx + ny * ly + nz * lz;
                        let diffuse = Math.max(0.15, dot);

                        let brightness = 0;

                        if (wLogoCombined) {
                            const bLogo = p.logoIsFace ? (diffuse * 0.4 + p.logoWeight * 0.8) : (diffuse * 0.7);
                            brightness += bLogo * wLogoCombined;
                        }

                        if (hasOrb) {
                            const bOrb = diffuse * 0.7 + (wOrb * 0.12);
                            brightness += bOrb * wOrb;
                        }

                        if (hasFish) {
                            const bFish = p.fishIsFace ? (diffuse * 0.4 + p.fishWeight * 0.8) : (diffuse * 0.7);
                            brightness += bFish * wFish;
                        }

                        if (hasDwarf) {
                            const pat = sampleDwarfSurface(p, dwarfTime);
                            const rim = Math.pow(Math.max(0, 1.0 - Math.abs(nz)), 2) * (0.24 + p.dwarfEquatorBias * 0.14);
                            const thermal = clamp01(pat * (0.72 + diffuse * 0.24) + rim * 0.55);
                            const bDwarf = clamp01(diffuse * 0.34 + pat * 0.46 + rim * 0.42);
                            brightness += bDwarf * wDwarf;

                            if (useColor) {
                                const paletteIndex = Math.min(DWARF_COLOR_LEVELS - 1, Math.floor(thermal * (DWARF_COLOR_LEVELS - 1)));
                                colorBuffer[idx] = dwarfPalette[paletteIndex];
                            }
                        }

                        let fog = (z + 50) / 200.0;
                        brightness -= fog;
                        if (brightness < 0) brightness = 0; if (brightness >= 1) brightness = 0.99;

                        let finalCharCode = sampleRampCode(SHADE_CHAR_CODES, brightness, xp, yp, SHADE_DITHER);

                        if (hasOrb && wOrb > 0.1) {
                            const showCode = wOrb > 0.92 || wOrb >= p.orbReveal;
                            if (showCode && brightness > 0.15) finalCharCode = p.orbCharCode;
                        }
                        if (hasFish && wFish > 0.8 && p.fishWeight === 0) finalCharCode = SPACE_CODE;

                        textBuffer[idx] = finalCharCode;
                    }
                }
            }
        }

        if (useColor) {
            surface.presentColor(screenElement, DEFAULT_PACKED_COLOR);
        } else {
            surface.presentText(screenElement);
        }

        // Speed
        // Logo2 also uses 1.0 speed
        let speedMult = 1.0 * wLogoCombined + 0.5 * wOrb + 3.0 * wFish + 0.8 * wDwarf;

        // Normalize speed to 60FPS (dt is in seconds, so dt * 60 gives us ratio relative to 1 frame at 60fps)
        let timeScale = dt * 60.0;
        angle += ROTATION_SPEED * speedMult * timeScale;
        requestAnimationFrame(render);
    }

    // Scroll Trigger Logic
    const aboutUs = document.getElementById('about-us');
    const pastProjects = document.getElementById('past-projects');
    const futureProjects = document.getElementById('future-projects');
    const sunfish = document.getElementById('project-sunfish');
    const brownDwarf = document.getElementById('brown-dwarf');
    const sourceCode = document.getElementById('connect');

    let isAboutUsVisible = false;
    let isPastProjectsVisible = false;
    let isFutureProjectsVisible = false;
    let isSunfishVisible = false;
    let isBrownDwarfVisible = false;
    let isSourceCodeVisible = false;

    function updateState() {
        // Priority: Bottom up
        // Only change state when a section is actively visible
        // Otherwise maintain current state (don't fall back to Logo during gaps)
        let newTarget = null;

        if (isSourceCodeVisible) {
            newTarget = 4; // Logo (State 4, after Dwarf)
        } else if (isBrownDwarfVisible) {
            newTarget = 3; // Dwarf
        } else if (isSunfishVisible) {
            newTarget = 2; // Fish
        } else if (isFutureProjectsVisible) {
            newTarget = 0; // Logo (brief return between Orb and Fish)
        } else if (isPastProjectsVisible) {
            newTarget = 1; // Orb
        } else if (isAboutUsVisible) {
            newTarget = 0; // Logo (top of page)
        }
        // Note: We no longer default to 0 when nothing is visible
        // This keeps the current state during scroll gaps

        // If a section is actively visible and it's different from current target, update target weights
        if (newTarget !== null && newTarget !== targetState) {
            targetState = newTarget;
            targetWeights = getTargetWeightsForState(newTarget);
        }
    }

    // Observers - use rootMargin to trigger when section crosses center of viewport
    // '-40% 0px -40% 0px' shrinks the observation zone to the middle 20% of the screen
    const obsOptions = { threshold: 0.1, rootMargin: '-40% 0px -40% 0px' };

    if (aboutUs) new IntersectionObserver((e) => { e.forEach(x => { isAboutUsVisible = x.isIntersecting; updateState(); }) }, obsOptions).observe(aboutUs);
    if (pastProjects) new IntersectionObserver((e) => { e.forEach(x => { isPastProjectsVisible = x.isIntersecting; updateState(); }) }, obsOptions).observe(pastProjects);
    if (futureProjects) new IntersectionObserver((e) => { e.forEach(x => { isFutureProjectsVisible = x.isIntersecting; updateState(); }) }, obsOptions).observe(futureProjects);
    if (sunfish) new IntersectionObserver((e) => { e.forEach(x => { isSunfishVisible = x.isIntersecting; updateState(); }) }, obsOptions).observe(sunfish);

    if (brownDwarf) {
        new IntersectionObserver((e) => { e.forEach(x => { isBrownDwarfVisible = x.isIntersecting; updateState(); }) }, obsOptions).observe(brownDwarf);
    }

    if (sourceCode) {
        // Trigger slightly earlier for the connect section
        new IntersectionObserver((e) => { e.forEach(x => { isSourceCodeVisible = x.isIntersecting; updateState(); }) }, { threshold: 0.1, rootMargin: '-30% 0px -50% 0px' }).observe(sourceCode);
    }

    requestAnimationFrame(render);
})();
