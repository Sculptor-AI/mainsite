/*
 * Sculptor AI - 3D Logo Animation
 * Handles the solid 3D logo in the left column.
 */

(function () {
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

    const CODE_TEXT = `function init() { return true; } if (sys.active) { process.start(); } const orb = new Entity(); orb.spin(); <div id="data"></div> while(loading) { await fetch(); } class AI extends System { constructor() { super(); } } export default function() { return "sculptor"; } console.log("booting..."); for(let i=0; i<99; i++) { update(i); } import { ref } from 'vue'; const data = ref(null); function render() { return <html></html>; } if (err) throw new Error("Fail"); const config = { speed: 0.5, mode: "auto" }; function animate(t) { requestAnimationFrame(animate); } const vector = new THREE.Vector3(0, 1, 0); `;

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

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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

    function getGasTexture(x, y, z, time) {
        // Latitude Bands
        let wavyY = y + Math.sin(x * 3.0 + time * 0.5) * 0.1;
        let band = Math.sin(wavyY * 12.0);

        // Turbulence
        let turb = Math.sin(x * 6.0 + time) * Math.cos(z * 6.0 + time) * Math.sin(y * 8.0);

        // Spots
        let spot = Math.sin(x * 3.5 - time * 0.2) * Math.cos(y * 3.5);

        // Mix
        let noiseVal = band * 0.6 + turb * 0.3 + spot * 0.2;

        return (noiseVal + 1.2) / 2.4;
    }

    function generateOrbTargets(count) {
        const targets = [];
        const golden = Math.PI * (3 - Math.sqrt(5));
        const denom = Math.max(1, count - 1);

        for (let i = 0; i < count; i++) {
            const y = 1 - (i / denom) * 2;
            const radius = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = golden * i;
            const radiusJitter = ORB_RADIUS * (0.9 + Math.random() * 0.15);

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
        const DWARF_RADIUS = 28.0; // Slightly smaller than orb

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
                            logoWeight: weight,

                            // State 1: Orb
                            orbX: 0, orbY: 0, orbZ: 0, orbChar: ' ',

                            // State 2: Fish
                            fishX: 0, fishY: 0, fishZ: 0, fishIsFace: false, fishWeight: 0,

                            // State 3: Brown Dwarf
                            dwarfX: 0, dwarfY: 0, dwarfZ: 0
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
        p.orbX = tOrb.x; p.orbY = tOrb.y; p.orbZ = tOrb.z; p.orbChar = tOrb.char;

        // Fish
        if (k < fishTargets.length) {
            const tFish = fishTargets[fishOrder[k]];
            p.fishX = tFish.x; p.fishY = tFish.y; p.fishZ = tFish.z;
            p.fishIsFace = tFish.isFace; p.fishWeight = tFish.weight;
        } else {
            p.fishX = 0; p.fishY = 0; p.fishZ = 0; p.fishWeight = 0; p.fishIsFace = false;
        }

        // Dwarf
        const tDwarf = dwarfTargets[dwarfOrder[k]];
        p.dwarfX = tDwarf.x; p.dwarfY = tDwarf.y; p.dwarfZ = tDwarf.z;

        // Logo2 (Return state - identical to Logo)
        p.logo2X = p.logoX;
        p.logo2Y = p.logoY;
        p.logo2Z = p.logoZ;
    }

    // --- Rendering ---
    const screenElement = document.getElementById('solid-logo-canvas');

    // Measure Char size
    // Measure Char size dynamically
    let charWidth = 6;
    let charHeight = 10;

    function updateLogoMetrics() {
        const measureElement = document.createElement('span');
        const style = getComputedStyle(screenElement);
        measureElement.style.fontFamily = style.fontFamily;
        measureElement.style.fontSize = style.fontSize;
        measureElement.innerHTML = "X";
        document.body.appendChild(measureElement);
        let rect = measureElement.getBoundingClientRect();
        charWidth = rect.width || 6;
        charHeight = (rect.height * 0.9) || 10;
        document.body.removeChild(measureElement);
    }

    updateLogoMetrics();
    window.addEventListener('resize', updateLogoMetrics);

    let angle = 0;
    let time = 0;

    // State: 0 = Logo, 1 = Orb, 2 = Fish, 3 = Dwarf, 4 = Logo2 (Return)
    let targetState = 0;
    let sourceState = 0;  // The state we're morphing FROM
    let morphProgress = 1.0; // 0 = at source, 1 = at target
    let lastTimestamp = performance.now();

    // Helper to get position for a particle at a given state
    function getStatePosition(p, state) {
        switch (state) {
            case 0: return { x: p.logoX, y: p.logoY, z: p.logoZ };
            case 1: return { x: p.orbX, y: p.orbY, z: p.orbZ };
            case 2: return { x: p.fishX, y: p.fishY, z: p.fishZ };
            case 3: return { x: p.dwarfX, y: p.dwarfY, z: p.dwarfZ };
            case 4: return { x: p.logo2X, y: p.logo2Y, z: p.logo2Z };
            default: return { x: p.logoX, y: p.logoY, z: p.logoZ };
        }
    }

    function render(timestamp) {
        const now = typeof timestamp === 'number' ? timestamp : performance.now();
        const dt = Math.min(0.05, Math.max(0, (now - lastTimestamp) / 1000)); // seconds
        lastTimestamp = now;
        time += dt;

        // Morph State Logic - Direct transitions
        const morphSpeed = dt / MORPH_DURATION;

        // When target changes, start a new morph from current blended position
        // morphProgress goes from 0 to 1 as we transition to targetState
        if (morphProgress < 1.0) {
            morphProgress += morphSpeed;
            if (morphProgress > 1.0) morphProgress = 1.0;
        }

        // Get eased progress
        let easedProgress = easeInOutCubic(morphProgress);

        // Calculate weights based on direct source->target blend
        let wLogo = 0, wOrb = 0, wFish = 0, wDwarf = 0, wLogo2 = 0;

        // Source weights (what we're coming FROM)
        let srcWeights = { logo: 0, orb: 0, fish: 0, dwarf: 0, logo2: 0 };
        switch (sourceState) {
            case 0: srcWeights.logo = 1; break;
            case 1: srcWeights.orb = 1; break;
            case 2: srcWeights.fish = 1; break;
            case 3: srcWeights.dwarf = 1; break;
            case 4: srcWeights.logo2 = 1; break;
        }

        // Target weights (what we're going TO)
        let tgtWeights = { logo: 0, orb: 0, fish: 0, dwarf: 0, logo2: 0 };
        switch (targetState) {
            case 0: tgtWeights.logo = 1; break;
            case 1: tgtWeights.orb = 1; break;
            case 2: tgtWeights.fish = 1; break;
            case 3: tgtWeights.dwarf = 1; break;
            case 4: tgtWeights.logo2 = 1; break;
        }

        // Blend between source and target
        wLogo = lerp(srcWeights.logo, tgtWeights.logo, easedProgress);
        wOrb = lerp(srcWeights.orb, tgtWeights.orb, easedProgress);
        wFish = lerp(srcWeights.fish, tgtWeights.fish, easedProgress);
        wDwarf = lerp(srcWeights.dwarf, tgtWeights.dwarf, easedProgress);
        wLogo2 = lerp(srcWeights.logo2, tgtWeights.logo2, easedProgress);

        // Render setup
        const container = screenElement.parentElement;

        // Fixed resolution for consistent "video-like" scaling
        // Expanded to 128x128 as requested to fix clipping
        const width = 128;
        const height = 128;

        const size = width * height;
        const aspectCorrection = (charHeight / charWidth);

        // Prepare output buffers. Note: We need color now!
        // Since we are writing to a <pre>, we can't change color per char easily without <span>s which is slow.
        // HOWEVER, the prompt implies "color transition".
        // ASCII art engines usually use spans for color. 
        // BUT, this existing engine uses innerText = frame (monochrome).
        // Refactoring to full color span output is heavy.
        // Check if `good_dwarf.html` used canvas? YES, it used <canvas>.
        // The current site uses <pre>.
        // To support color for the dwarf, we'd need to switch to spans or a canvas overlay.
        // Given the constraints and "don't affect regular spinning logo", sticking to monochrome <pre> 
        // means no color, just brightness. 
        // BUT user said "color transition". 
        // Let's assume we need to output spans OR use CSS gradients on the text itself?
        // CSS `background-clip: text` is used on the headers. 
        // Maybe we can just color the whole block? No, dwarf is multi-colored.

        // Optimization: Only use spans if we are in Dwarf mode (wDwarf > 0).
        // Otherwise use innerText for performance.
        const useColor = (wDwarf > 0.01);

        // If using color, we build an HTML string. Else plain text.
        let htmlBuffer = "";
        let textBuffer = new Array(size).fill(' ');
        let zbuffer = new Float32Array(size).fill(-9999.0);
        let colorBuffer = useColor ? new Array(size) : null; // Store {r,g,b}

        const K1 = 40.0;
        const cosT = Math.cos(angle);
        const sinT = Math.sin(angle);

        const lx = 0.6; const ly = 0.4; const lz = -0.5;

        for (let i = 0; i < particles.length; i++) {
            let p = particles[i];

            // Position Blend
            // Note: We add p.logo2*wLogo2. Since p.logo2 is identical to p.logo, it smoothly returns to logo shape.
            let px = p.logoX * wLogo + p.orbX * wOrb + p.fishX * wFish + p.dwarfX * wDwarf + p.logo2X * wLogo2;
            let py = p.logoY * wLogo + p.orbY * wOrb + p.fishY * wFish + p.dwarfY * wDwarf + p.logo2Y * wLogo2;
            let pz = p.logoZ * wLogo + p.orbZ * wOrb + p.fishZ * wFish + p.dwarfZ * wDwarf + p.logo2Z * wLogo2;

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

                        // --- NORMALS ---
                        // Logo Normal
                        let nLogoX = 0, nLogoZ = 0;
                        if (p.logoIsFace) { nLogoX = sinT * (p.logoZ > 0 ? 1 : -1); nLogoZ = cosT * (p.logoZ > 0 ? 1 : -1); }
                        else { nLogoX = cosT; nLogoZ = -sinT; }

                        // Orb Normal
                        let orbLen = Math.hypot(p.orbX, p.orbY, p.orbZ) || 1;
                        let nOrbX = p.orbX / orbLen; let nOrbY = p.orbY / orbLen; let nOrbZ = p.orbZ / orbLen;
                        let rOrbX = nOrbX * cosT - nOrbZ * sinT; let rOrbZ = nOrbX * sinT + nOrbZ * cosT;
                        nOrbX = rOrbX; nOrbZ = rOrbZ;

                        // Fish Normal
                        let nFishX = 0, nFishZ = 0;
                        if (p.fishIsFace) { nFishX = sinT * (p.fishZ > 0 ? 1 : -1); nFishZ = cosT * (p.fishZ > 0 ? 1 : -1); }
                        else { nFishX = cosT; nFishZ = -sinT; }

                        // Dwarf Normal (Sphere like orb)
                        let dwarfLen = Math.hypot(p.dwarfX, p.dwarfY, p.dwarfZ) || 1;
                        let nDwarfX = p.dwarfX / dwarfLen; let nDwarfY = p.dwarfY / dwarfLen; let nDwarfZ = p.dwarfZ / dwarfLen;
                        let rDwarfX = nDwarfX * cosT - nDwarfZ * sinT; let rDwarfZ = nDwarfX * sinT + nDwarfZ * cosT;
                        nDwarfX = rDwarfX; nDwarfZ = rDwarfZ;

                        // Blend Normals
                        // Since Logo and Logo2 have same normals (approximately, if we don't bake them), we can reuse nLogoX.
                        // But wait, nLogoX calculated above used p.logoZ. p.logo2Z is same.
                        // So yes, nLogoX applies to both.
                        let nx = nLogoX * wLogo + nOrbX * wOrb + nFishX * wFish + nDwarfX * wDwarf + nLogoX * wLogo2;
                        let ny = 0 + nOrbY * wOrb + 0 + nDwarfY * wDwarf + 0;
                        let nz = nLogoZ * wLogo + nOrbZ * wOrb + nFishZ * wFish + nDwarfZ * wDwarf + nLogoZ * wLogo2;

                        let norm = Math.hypot(nx, ny, nz) || 0.001;
                        nx /= norm; ny /= norm; nz /= norm;

                        let dot = nx * lx + ny * ly + nz * lz;
                        let diffuse = Math.max(0.15, dot);

                        // --- COLOR CALCULATION (For Dwarf) ---
                        if (useColor) {
                            // Texture Generation
                            // We need "unrotated" coords for the texture to stick to the planet
                            // But the planet spins. So we use the original coords relative to rotation?
                            // Actually passing (x,y,z) to noise works if we account for rotation in time or coords.
                            // The good_dwarf uses unrotated coords usually.
                            // Let's use p.dwarfX, p.dwarfY, p.dwarfZ (local coords)

                            let pat = getGasTexture(p.dwarfX / 10, p.dwarfY / 10, p.dwarfZ / 10, time * 1.5);
                            let litPat = pat * (0.6 + diffuse * 0.9);
                            let heatColor = getHeatColor(litPat);

                            // Blend with default grey
                            // If wDwarf is 0.5, we are halfway.
                            // We lerp between COLOR_DEFAULT and heatColor based on wDwarf
                            let finalColor = lerpColor(COLOR_DEFAULT, heatColor, wDwarf);
                            colorBuffer[idx] = finalColor;
                        }

                        // --- BRIGHTNESS / CHAR ---
                        let bLogo = p.logoIsFace ? (diffuse * 0.4 + p.logoWeight * 0.8) : (diffuse * 0.7);
                        let bOrb = diffuse * 0.7 + (wOrb * 0.12);
                        let bFish = p.fishIsFace ? (diffuse * 0.4 + p.fishWeight * 0.8) : (diffuse * 0.7);

                        // Dwarf Brightness (gas pattern)
                        // We need to calculate pattern even if not using color for the char intensity
                        let pat = getGasTexture(p.dwarfX / 10, p.dwarfY / 10, p.dwarfZ / 10, time * 1.5);
                        let bDwarf = (diffuse * 0.4) + (pat * 0.6);

                        // Blend Brightness
                        let brightness = bLogo * wLogo + bOrb * wOrb + bFish * wFish + bDwarf * wDwarf + bLogo * wLogo2;

                        let fog = (z + 50) / 200.0;
                        brightness -= fog;
                        if (brightness < 0) brightness = 0; if (brightness >= 1) brightness = 0.99;

                        let charIdx = Math.floor(brightness * SHADE_CHARS.length);
                        let finalChar = SHADE_CHARS[charIdx];

                        if (wOrb > 0.5 && brightness > 0.2 && Math.random() < wOrb) finalChar = p.orbChar;
                        if (wFish > 0.8 && p.fishWeight === 0) finalChar = ' ';

                        textBuffer[idx] = finalChar;
                    }
                }
            }
        }

        // Output Generation
        if (useColor) {
            // Full HTML generation (slower, but needed for color)
            // We optimize by grouping spans of same color?
            // For now, naive per-char span or just per-line.
            // Per-char is safest for varying gas giant colors.

            let html = "";
            for (let r = 0; r < height; r++) {
                let lineHtml = "";
                for (let c = 0; c < width; c++) {
                    let idx = c + r * width;
                    let char = textBuffer[idx];
                    if (char === ' ') {
                        lineHtml += " ";
                    } else {
                        let col = colorBuffer[idx] || COLOR_DEFAULT;
                        // Optimization: don't output style if it's default grey?
                        // Actually, just outputting spans is heavy.
                        // Let's try to keep it relatively efficient.
                        lineHtml += `<span style="color:rgb(${col.r},${col.g},${col.b})">${char}</span>`;
                    }
                }
                html += lineHtml + "\n";
            }
            screenElement.innerHTML = html;
        } else {
            // Fast plain text path
            let frame = "";
            for (let k = 0; k < size; k++) {
                frame += textBuffer[k];
                if ((k + 1) % width === 0) frame += "\n";
            }
            screenElement.innerText = frame;
        }

        // Speed
        // Logo2 also uses 1.0 speed
        let speedMult = 1.0 * wLogo + 0.5 * wOrb + 3.0 * wFish + 0.8 * wDwarf + 1.0 * wLogo2;
        angle += ROTATION_SPEED * speedMult;
        requestAnimationFrame(render);
    }

    // Scroll Trigger Logic
    const pastProjects = document.getElementById('past-projects');
    const sunfish = document.getElementById('project-sunfish');
    const brownDwarf = document.getElementById('brown-dwarf');
    const sourceCode = document.getElementById('connect');

    let isPastProjectsVisible = false;
    let isSunfishVisible = false;
    let isBrownDwarfVisible = false;
    let isSourceCodeVisible = false;

    function updateState() {
        // Priority: Bottom up
        let newTarget = 0;

        if (isSourceCodeVisible) {
            newTarget = 4; // Logo (State 4, after Dwarf)
        } else if (isBrownDwarfVisible) {
            newTarget = 3; // Dwarf
        } else if (isSunfishVisible) {
            newTarget = 2; // Fish
        } else if (isPastProjectsVisible) {
            newTarget = 1; // Orb
        } else {
            newTarget = 0; // Logo
        }

        // If target changed, start a new morph
        if (newTarget !== targetState) {
            sourceState = targetState; // Current target becomes new source
            targetState = newTarget;
            morphProgress = 0.0; // Reset morph progress
        }
    }

    // Observers
    const obsOptions = { threshold: 0.45 };

    if (pastProjects) new IntersectionObserver((e) => { e.forEach(x => { isPastProjectsVisible = x.isIntersecting; updateState(); }) }, obsOptions).observe(pastProjects);
    if (sunfish) new IntersectionObserver((e) => { e.forEach(x => { isSunfishVisible = x.isIntersecting; updateState(); }) }, obsOptions).observe(sunfish);

    if (brownDwarf) {
        new IntersectionObserver((e) => { e.forEach(x => { isBrownDwarfVisible = x.isIntersecting; updateState(); }) }, obsOptions).observe(brownDwarf);
    }

    if (sourceCode) {
        // Trigger slightly earlier so the transition starts as it comes into view
        new IntersectionObserver((e) => { e.forEach(x => { isSourceCodeVisible = x.isIntersecting; updateState(); }) }, { threshold: 0.05 }).observe(sourceCode);
    }

    requestAnimationFrame(render);
})();
