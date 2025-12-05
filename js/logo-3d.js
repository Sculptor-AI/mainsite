/*
 * Sculptor AI - 3D Logo Animation
 * Handles the solid 3D logo in the left column.
 */

(function () {
    // --- Configuration ---
    const VIEW_DISTANCE = 55.0;
    const ROTATION_SPEED = 0.005; // Restored rotation
    const EXTRUSION_DEPTH = 5.0;
    const ORB_RADIUS = 32.0;
    const MORPH_DURATION = 1.2; // seconds to morph logo -> orb
    const BURST_DISTANCE = 14.0;

    // Voxel density
    const Z_STEP = 0.2; // High resolution depth
    const XY_JITTER = 0.5; // Randomness to fill gaps

    // A long gradient for better depth resolution
    const SHADE_CHARS = " `.-':_,^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@";

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

    const GRID_X = 1.8;
    const GRID_Y = 3.5;

    const particles = [];

    // Map original chars to a "weight" (0.0 to 1.0)
    // This allows the 3D object to retain the "drawing" on its face
    function getCharWeight(c) {
        const weights = {
            '.': 0.3, ':': 0.4, '-': 0.4, '=': 0.5, '+': 0.6,
            '*': 0.7, '#': 0.8, '%': 0.9, '@': 1.0
        };
        return weights[c] || 0.6; // Default weight
    }

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
                z: Math.sin(theta) * radius * radiusJitter
            });
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

        // Center Calculation (Center of Mass)
        let totalC = 0;
        let totalR = 0;
        let count = 0;

        for (let r = 0; r < lines.length; r++) {
            let line = lines[r];
            for (let c = 0; c < line.length; c++) {
                if (line[c] !== ' ' && line[c] !== undefined && line[c] !== '\n') {
                    totalC += c;
                    totalR += r;
                    count++;
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

                    // Extrude Z
                    for (let z = -EXTRUSION_DEPTH; z <= EXTRUSION_DEPTH; z += Z_STEP) {

                        // Determine if this is a surface layer (Front/Back face)
                        // We use a small tolerance to catch the outer layers
                        let isFace = (z > EXTRUSION_DEPTH - 1.0 || z < -EXTRUSION_DEPTH + 1.0);

                        // We only add jitter to X/Y to fill holes, keep Z precise for the profile view
                        particles.push({
                            x: baseX + (Math.random() - 0.5) * XY_JITTER,
                            y: baseY + (Math.random() - 0.5) * XY_JITTER,
                            z: z,
                            isFace: isFace,
                            weight: weight, // Store texture brightness
                            orbX: 0,
                            orbY: 0,
                            orbZ: 0
                        });
                    }
                }
            }
        }
    }

    initLogo();

    // Generate orb layout
    const orbTargets = generateOrbTargets(particles.length);

    // Map particles to orb targets by sorted latitude + angle to minimize teleport paths
    const particleOrder = buildSortedIndices(particles.length, i => particles[i]);
    const orbOrder = buildSortedIndices(orbTargets.length, i => orbTargets[i]);

    for (let k = 0; k < particles.length; k++) {
        const p = particles[particleOrder[k]];
        const t = orbTargets[orbOrder[k]];
        p.orbX = t.x;
        p.orbY = t.y;
        p.orbZ = t.z;
    }

    // --- Rendering ---
    const screenElement = document.getElementById('solid-logo-canvas');

    // Measure Char size
    const measureElement = document.createElement('span');
    measureElement.style.fontFamily = getComputedStyle(screenElement).fontFamily;
    measureElement.style.fontSize = getComputedStyle(screenElement).fontSize;
    measureElement.innerHTML = "X";
    document.body.appendChild(measureElement);
    let rect = measureElement.getBoundingClientRect();
    const charWidth = rect.width || 6;
    const charHeight = (rect.height * 0.9) || 10;
    document.body.removeChild(measureElement);

    let angle = 0;
    let morphTarget = 0; // 0 = logo, 1 = orb
    let morphProgress = 0;
    let lastTimestamp = performance.now();
    let morphDirection = 0; // 1 = moving to orb, -1 = returning

    function render(timestamp) {
        const now = typeof timestamp === 'number' ? timestamp : performance.now();
        const dt = Math.min(0.05, Math.max(0, (now - lastTimestamp) / 1000)); // seconds
        lastTimestamp = now;

        const morphStep = dt / MORPH_DURATION;
        if (morphTarget > morphProgress) {
            morphProgress = Math.min(morphTarget, morphProgress + morphStep);
            morphDirection = 1;
        } else if (morphTarget < morphProgress) {
            morphProgress = Math.max(morphTarget, morphProgress - morphStep);
            morphDirection = -1;
        }

        const easedMorph = easeInOutCubic(morphProgress);

        // Adapted to use container width to fit in the column
        const container = screenElement.parentElement;
        const width = Math.max(1, Math.floor(container.clientWidth / charWidth));
        const height = Math.max(1, Math.floor(window.innerHeight / charHeight));
        const size = width * height;

        const zbuffer = new Float32Array(size).fill(-9999.0);
        const output = new Array(size).fill(' ');

        const K1 = Math.min(width, height) * 0.5;

        const cosT = Math.cos(angle);
        const sinT = Math.sin(angle);

        // Light Source: Top-Left-Front
        // Moving light source slightly to create dynamic shadows
        const lx = 0.6;
        const ly = 0.4;
        const lz = -0.5;

        // Iterate all particles
        for (let i = 0; i < particles.length; i++) {
            let p = particles[i];

            // Morph between logo voxels and spherical orb
            const interpX = p.x + (p.orbX - p.x) * easedMorph;
            const interpY = p.y + (p.orbY - p.y) * easedMorph;
            const interpZ = p.z + (p.orbZ - p.z) * easedMorph;

            // Rotate Y
            let x = interpX * cosT - interpZ * sinT;
            let z = interpX * sinT + interpZ * cosT;
            let y = interpY;

            // Camera Projection
            let zDist = VIEW_DISTANCE + z;

            if (zDist > 1.0) {
                let ooz = 1.0 / zDist;

                let xp = Math.floor(width / 2 + K1 * ooz * x * 2.0);
                let yp = Math.floor(height / 2 - K1 * ooz * y);

                if (xp >= 0 && xp < width && yp >= 0 && yp < height) {
                    let idx = xp + yp * width;

                    // Z-Buffer
                    if (ooz > zbuffer[idx]) {
                        zbuffer[idx] = ooz;

                        // --- LIGHTING CALCULATION ---

                        // 1. Calculate Normal Vector
                        let nx = 0, ny = 0, nz = 0;

                        if (easedMorph < 0.25) {
                            // Preserve the logo's flat/sided lighting early in the morph
                            if (p.isFace) {
                                nx = sinT * (p.z > 0 ? 1 : -1);
                                nz = cosT * (p.z > 0 ? 1 : -1);
                            } else {
                                nx = cosT;
                                nz = -sinT;
                            }
                        } else {
                            // Orb / blended: use position-based normal
                            const len = Math.max(0.001, Math.hypot(interpX, interpY, interpZ));
                            nx = interpX / len;
                            ny = interpY / len;
                            nz = interpZ / len;

                            // Blend a little of the logo normal back in to keep edges readable mid-morph
                            const logoInfluence = Math.max(0, 0.4 - easedMorph) / 0.4;
                            if (logoInfluence > 0) {
                                const logoNx = p.isFace ? sinT * (p.z > 0 ? 1 : -1) : cosT;
                                const logoNy = 0;
                                const logoNz = p.isFace ? cosT * (p.z > 0 ? 1 : -1) : -sinT;

                                nx = nx * (1 - logoInfluence) + logoNx * logoInfluence;
                                ny = ny * (1 - logoInfluence) + logoNy * logoInfluence;
                                nz = nz * (1 - logoInfluence) + logoNz * logoInfluence;
                            }
                        }

                        let norm = Math.max(0.001, Math.hypot(nx, ny, nz));
                        nx /= norm; ny /= norm; nz /= norm;

                        // 2. Diffuse Lighting (Dot Product)
                        let dot = (nx * lx + ny * ly + nz * lz);
                        // Normalize dot from [-1, 1] to [0, 1] loosely
                        let diffuse = Math.max(0, dot);

                        // 3. Texture Mixing
                        let brightness = 0;
                        const textureFade = p.isFace ? (1 - easedMorph) : 0;

                        if (p.isFace) {
                            // If it's the face, blend the 3D lighting with the original 2D Art weight
                            // Fade the texture as we head into the orb
                            brightness = (diffuse * 0.55) + (p.weight * 0.8 * textureFade);
                        } else {
                            // Sides are purely geometric. 
                            // Make sides slightly darker than faces to emphasize edges
                            brightness = diffuse * 0.7;
                        }

                        // Subtle glow bump when fully orb'd
                        brightness += diffuse * easedMorph * 0.12;

                        // 4. Depth Fog (make things in back darker)
                        // z ranges roughly -20 to 20. 
                        let fog = (z + 20) / 60.0; // 0.0 near, 1.0 far
                        brightness -= fog;

                        // 5. Final Clamp & Char Map
                        if (brightness < 0) brightness = 0;
                        if (brightness >= 1) brightness = 0.99;

                        let charIdx = Math.floor(brightness * SHADE_CHARS.length);
                        output[idx] = SHADE_CHARS[charIdx];
                    }
                }
            }
        }

        let frame = "";
        for (let k = 0; k < size; k++) {
            frame += output[k];
            if ((k + 1) % width === 0) frame += "\n";
        }
        screenElement.innerText = frame;

        const spinBoost = easedMorph * 0.004;
        angle += ROTATION_SPEED + spinBoost;
        requestAnimationFrame(render);
    }

    // Morph control based on Past Projects visibility
    function setOrbActive(shouldExplode) {
        morphTarget = shouldExplode ? 1 : 0;
    }

    const pastProjects = document.getElementById('past-projects');
    if (pastProjects) {
        const orbObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => setOrbActive(entry.isIntersecting));
        }, { threshold: 0.45 });
        orbObserver.observe(pastProjects);
    }

    // Handy manual triggers for debugging
    window.sculptorLogoToOrb = () => setOrbActive(true);
    window.sculptorLogoToLogo = () => setOrbActive(false);

    requestAnimationFrame(render);
})();
