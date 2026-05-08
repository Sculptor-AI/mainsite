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
    const ORB_RADIUS = 24.0;
    const MORPH_DURATION = 1.2;
    const BURST_DISTANCE = 14.0;

    // Voxel density
    const Z_STEP = 0.2;
    const XY_JITTER = 0.5;

    // Shape-based rendering config
    const CONTRAST_EXPONENT = 3.5; // higher = sharper edges between regions

    // A long gradient for fallback and orb text
    const SHADE_CHARS = " `.-':_,^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@";
    const SHADE_CHAR_CODES = toCharCodes(SHADE_CHARS);

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

    function generateOrbTargets(count) {
        const targets = [];
        const golden = Math.PI * (3 - Math.sqrt(5));
        const denom = Math.max(1, count - 1);
        for (let i = 0; i < count; i++) {
            const y = 1 - (i / denom) * 2;
            const radius = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = golden * i;
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
                            orbX: 0, orbY: 0, orbZ: 0,
                            orbNX: 0, orbNY: 0, orbNZ: 0,
                            orbCharCode: SPACE_CODE,
                            orbReveal: hash01((particles.length + 1) * 19.0),
                            fishX: 0, fishY: 0, fishZ: 0,
                            fishIsFace: false, fishFaceSign: 1, fishWeight: 0,
                            dwarfX: 0, dwarfY: 0, dwarfZ: 0,
                            dwarfNX: 0, dwarfNY: 0, dwarfNZ: 0,
                            dwarfBandPhase: 0, dwarfSwirlPhase: 0,
                            dwarfStormPhase: 0, dwarfDriftPhase: 0,
                            dwarfEquatorBias: 0
                        });
                    }
                }
            }
        }
    }

    initLogo();

    // Generate targets
    const orbTargets = generateOrbTargets(particles.length);
    const cleanText = CODE_TEXT.replace(/\s+/g, ' ');
    const textOrder = orbTargets.map((t, i) => i).sort((a, b) => {
        const ta = orbTargets[a], tb = orbTargets[b];
        const rows = 25;
        const rowA = Math.floor((1 - ta.y / ORB_RADIUS) / 2 * rows);
        const rowB = Math.floor((1 - tb.y / ORB_RADIUS) / 2 * rows);
        if (rowA !== rowB) return rowA - rowB;
        return Math.atan2(tb.z, tb.x) - Math.atan2(ta.z, ta.x);
    });
    textOrder.forEach((targetIndex, i) => {
        orbTargets[targetIndex].char = cleanText[i % cleanText.length];
    });

    const fishTargets = generateFishTargets();
    const dwarfTargets = generateDwarfTargets(particles.length);

    const particleOrder = buildSortedIndices(particles.length, i => ({ x: particles[i].logoX, y: particles[i].logoY, z: particles[i].logoZ }));
    const orbOrder = buildSortedIndices(orbTargets.length, i => orbTargets[i]);
    const fishOrder = buildSortedIndices(fishTargets.length, i => fishTargets[i]);
    const dwarfOrder = buildSortedIndices(dwarfTargets.length, i => dwarfTargets[i]);

    for (let k = 0; k < particles.length; k++) {
        const p = particles[particleOrder[k]];
        const tOrb = orbTargets[orbOrder[k]];
        const orbLen = Math.hypot(tOrb.x, tOrb.y, tOrb.z) || 1;
        p.orbX = tOrb.x; p.orbY = tOrb.y; p.orbZ = tOrb.z;
        p.orbNX = tOrb.x / orbLen; p.orbNY = tOrb.y / orbLen; p.orbNZ = tOrb.z / orbLen;
        p.orbCharCode = tOrb.char.charCodeAt(0);

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

        p.logo2X = p.logoX; p.logo2Y = p.logoY; p.logo2Z = p.logoZ;
    }

    // --- Shape Vector System ---
    const shapeData = computeShapeVectors("'Courier New', Courier, monospace");
    // Verify shape vectors computed correctly
    let nonZeroVecs = 0;
    for (let i = 0; i < shapeData.numChars * 6; i++) if (shapeData.vectors[i] > 0.01) nonZeroVecs++;
    console.log(`[ShapeVectors] Computed ${shapeData.numChars} chars, ${nonZeroVecs} non-zero components (expected ~400+)`);

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

    // State: 0 = Logo, 1 = Orb, 2 = Fish, 3 = Dwarf, 4 = Logo2
    let targetState = 0;
    let lastTimestamp = performance.now();
    let currentWeights = { logo: 1, orb: 0, fish: 0, dwarf: 0, logo2: 0 };
    let targetWeights = { logo: 1, orb: 0, fish: 0, dwarf: 0, logo2: 0 };

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
        currentWeights.orb += (targetWeights.orb - currentWeights.orb) * morphSpeed;
        currentWeights.fish += (targetWeights.fish - currentWeights.fish) * morphSpeed;
        currentWeights.dwarf += (targetWeights.dwarf - currentWeights.dwarf) * morphSpeed;
        currentWeights.logo2 += (targetWeights.logo2 - currentWeights.logo2) * morphSpeed;

        let sum = currentWeights.logo + currentWeights.orb + currentWeights.fish + currentWeights.dwarf + currentWeights.logo2;
        if (sum > 0.001) {
            currentWeights.logo /= sum; currentWeights.orb /= sum;
            currentWeights.fish /= sum; currentWeights.dwarf /= sum;
            currentWeights.logo2 /= sum;
        }

        let wLogo = currentWeights.logo < 0.001 ? 0 : currentWeights.logo;
        let wOrb = currentWeights.orb < 0.001 ? 0 : currentWeights.orb;
        let wFish = currentWeights.fish < 0.001 ? 0 : currentWeights.fish;
        let wDwarf = currentWeights.dwarf < 0.001 ? 0 : currentWeights.dwarf;
        let wLogo2 = currentWeights.logo2 < 0.001 ? 0 : currentWeights.logo2;
        const wLogoCombined = wLogo + wLogo2;
        const hasOrb = wOrb > 0;
        const hasFish = wFish > 0;
        const hasDwarf = wDwarf > 0;

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

        const K1 = 40.0;
        const cosT = Math.cos(angle);
        const sinT = Math.sin(angle);
        const sideNormalX = cosT;
        const sideNormalZ = -sinT;
        const lx = 0.6, ly = 0.4, lz = -0.5;

        // ====== PASS 1: Project particles, compute brightness ======
        for (let i = 0; i < particles.length; i++) {
            let p = particles[i];
            let px = 0, py = 0, pz = 0;

            if (wLogoCombined) {
                px += p.logoX * wLogoCombined;
                py += p.logoY * wLogoCombined;
                pz += p.logoZ * wLogoCombined;
            }
            if (hasOrb) { px += p.orbX * wOrb; py += p.orbY * wOrb; pz += p.orbZ * wOrb; }
            if (hasFish) { px += p.fishX * wFish; py += p.fishY * wFish; pz += p.fishZ * wFish; }
            if (hasDwarf) { px += p.dwarfX * wDwarf; py += p.dwarfY * wDwarf; pz += p.dwarfZ * wDwarf; }

            let x = px * cosT - pz * sinT;
            let z = px * sinT + pz * cosT;
            let y = py;
            let zDist = VIEW_DISTANCE + z;

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

                        if (hasOrb) {
                            nx += (p.orbNX * cosT - p.orbNZ * sinT) * wOrb;
                            ny += p.orbNY * wOrb;
                            nz += (p.orbNX * sinT + p.orbNZ * cosT) * wOrb;
                        }
                        if (hasFish) {
                            nx += (p.fishIsFace ? sinT * p.fishFaceSign : sideNormalX) * wFish;
                            nz += (p.fishIsFace ? cosT * p.fishFaceSign : sideNormalZ) * wFish;
                        }
                        if (hasDwarf) {
                            nx += (p.dwarfNX * cosT - p.dwarfNZ * sinT) * wDwarf;
                            ny += p.dwarfNY * wDwarf;
                            nz += (p.dwarfNX * sinT + p.dwarfNZ * cosT) * wDwarf;
                        }

                        let norm = Math.hypot(nx, ny, nz) || 0.001;
                        nx /= norm; ny /= norm; nz /= norm;

                        let dot = nx * lx + ny * ly + nz * lz;
                        let diffuse = Math.max(0.15, dot);

                        let brightness = 0;
                        if (wLogoCombined) {
                            brightness += (p.logoIsFace ? (diffuse * 0.4 + p.logoWeight * 0.8) : (diffuse * 0.7)) * wLogoCombined;
                        }
                        if (hasOrb) brightness += (diffuse * 0.7 + wOrb * 0.12) * wOrb;
                        if (hasFish) {
                            brightness += (p.fishIsFace ? (diffuse * 0.4 + p.fishWeight * 0.8) : (diffuse * 0.7)) * wFish;
                        }

                        let dwarfThermal = 0;
                        if (hasDwarf) {
                            const pat = sampleDwarfSurface(p, dwarfTime);
                            const rim = Math.pow(Math.max(0, 1.0 - Math.abs(nz)), 2) * (0.24 + p.dwarfEquatorBias * 0.14);
                            dwarfThermal = clamp01(pat * (0.72 + diffuse * 0.24) + rim * 0.55);
                            brightness += clamp01(diffuse * 0.34 + pat * 0.46 + rim * 0.42) * wDwarf;
                        }

                        let fog = (z + 50) / 200.0;
                        brightness -= fog;
                        brightness = clamp01(brightness);

                        brightnessBuffer[idx] = brightness;

                        // Sentinel: 0 = needs shape matching in Pass 2
                        textBuffer[idx] = 0;

                        // Special overrides: orb text chars
                        if (hasOrb && wOrb > 0.1) {
                            const showCode = wOrb > 0.92 || wOrb >= p.orbReveal;
                            if (showCode && brightness > 0.15) {
                                textBuffer[idx] = p.orbCharCode;
                            }
                        }
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
        let speedMult = 1.0 * wLogoCombined + 0.5 * wOrb + 3.0 * wFish + 0.8 * wDwarf;
        let timeScale = dt * 60.0;
        let autoSpeed = BASE_ROTATION_SPEED * speedMult;

        if (!isDragging) {
            // Blend angular velocity toward the auto-rotation speed.
            // On release with momentum, this smoothly decays the flick velocity
            // into the constant spin — never stops, just settles.
            let blend = 1.0 - Math.pow(1.0 - MOMENTUM_DECAY, timeScale);
            angularVelocity = angularVelocity + (autoSpeed - angularVelocity) * blend;
            angle += angularVelocity * timeScale;
        }

        requestAnimationFrame(render);
    }

    // --- Scroll Trigger Logic ---
    const aboutUs = document.getElementById('about-us');
    const pastProjects = document.getElementById('past-projects');
    const futureProjects = document.getElementById('future-projects');
    const sunfish = document.getElementById('project-sunfish');
    const brownDwarf = document.getElementById('brown-dwarf');
    const sourceCode = document.getElementById('connect');

    let isAboutUsVisible = false, isPastProjectsVisible = false;
    let isFutureProjectsVisible = false, isSunfishVisible = false;
    let isBrownDwarfVisible = false, isSourceCodeVisible = false;

    function updateState() {
        let newTarget = null;
        if (isSourceCodeVisible) newTarget = 4;
        else if (isBrownDwarfVisible) newTarget = 3;
        else if (isSunfishVisible) newTarget = 2;
        else if (isFutureProjectsVisible) newTarget = 0;
        else if (isPastProjectsVisible) newTarget = 1;
        else if (isAboutUsVisible) newTarget = 0;

        if (newTarget !== null && newTarget !== targetState) {
            targetState = newTarget;
            targetWeights = getTargetWeightsForState(newTarget);
        }
    }

    const obsOptions = { threshold: 0.1, rootMargin: '-40% 0px -40% 0px' };
    if (aboutUs) new IntersectionObserver((e) => { e.forEach(x => { isAboutUsVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(aboutUs);
    if (pastProjects) new IntersectionObserver((e) => { e.forEach(x => { isPastProjectsVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(pastProjects);
    if (futureProjects) new IntersectionObserver((e) => { e.forEach(x => { isFutureProjectsVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(futureProjects);
    if (sunfish) new IntersectionObserver((e) => { e.forEach(x => { isSunfishVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(sunfish);
    if (brownDwarf) new IntersectionObserver((e) => { e.forEach(x => { isBrownDwarfVisible = x.isIntersecting; updateState(); }); }, obsOptions).observe(brownDwarf);
    if (sourceCode) new IntersectionObserver((e) => { e.forEach(x => { isSourceCodeVisible = x.isIntersecting; updateState(); }); }, { threshold: 0.1, rootMargin: '-30% 0px -50% 0px' }).observe(sourceCode);

    requestAnimationFrame(render);
})();
