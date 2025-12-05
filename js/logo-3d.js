/*
 * Sculptor AI - 3D Logo Animation
 * Handles the solid 3D logo in the left column.
 */

(function () {
    // --- Configuration ---
    const VIEW_DISTANCE = 55.0;
    const ROTATION_SPEED = 0.005; // Restored rotation
    const EXTRUSION_DEPTH = 5.0;

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
                            weight: weight // Store texture brightness
                        });
                    }
                }
            }
        }
    }

    initLogo();

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

    function render() {
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

            // Rotate Y
            let x = p.x * cosT - p.z * sinT;
            let z = p.x * sinT + p.z * cosT;
            let y = p.y;

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

                        if (p.isFace) {
                            // Face normal follows rotation
                            nx = sinT * (p.z > 0 ? 1 : -1);
                            nz = cosT * (p.z > 0 ? 1 : -1);
                        } else {
                            // Side normal (approximated as Cylinder normal)
                            nx = cosT;
                            nz = -sinT;
                        }

                        // 2. Diffuse Lighting (Dot Product)
                        let dot = (nx * lx + ny * ly + nz * lz);
                        // Normalize dot from [-1, 1] to [0, 1] loosely
                        let diffuse = Math.max(0, dot);

                        // 3. Texture Mixing
                        let brightness = 0;

                        if (p.isFace) {
                            // If it's the face, blend the 3D lighting with the original 2D Art weight
                            // 40% Lighting + 60% Texture
                            brightness = (diffuse * 0.4) + (p.weight * 0.8);
                        } else {
                            // Sides are purely geometric. 
                            // Make sides slightly darker than faces to emphasize edges
                            brightness = diffuse * 0.7;
                        }

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

        angle += ROTATION_SPEED;
        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
})();
