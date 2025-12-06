/*
 * Sculptor AI - Main Animation Script
 * Handles the Blob -> Explode -> Text convergence animation.
 */

// --- Configuration ---
const SPHERE_RADIUS = 25.0;
const NUM_POINTS = 32000;

// --- Zoom Configuration ---
const VIEW_DISTANCE_START = 110.0;
const VIEW_DISTANCE_END = 210.0;

// Standard shading characters for the Blob phase
const SHADE_CHARS = " ·-:;=+*#%@";
const CAM_YAW_SPEED = 0.01;

// --- Timings (in frames) ---
const TIME_BLOB_END = 180;
const TIME_EXPLODE_END = 360;
const TIME_GATHER_DURATION = 320;
const TIME_TEXT_START = TIME_EXPLODE_END;

let stateTimer = 0;

// --- Geometry: The Blob ---
const blobPoints = [];
const phi = Math.PI * (3.0 - Math.sqrt(5.0));

for (let i = 0; i < NUM_POINTS; i++) {
    const y = 1 - (i / (NUM_POINTS - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = phi * i;
    blobPoints.push({
        x: Math.cos(theta) * radiusAtY,
        y: y,
        z: Math.sin(theta) * radiusAtY
    });
}

// --- Geometry: Target Generation ---
const possibleTargets = [];

// 1. Define the Logo
const LOGO_ART_MAIN = `
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

// 2. Define the Text Art (Specific Characters)
const TEXT_ART = `
 .oooooo..o                       oooo                 .                      
d8P'    \`Y8                       \`888               .o8                      
Y88bo.       .ooooo.  oooo  oooo   888  oo.ooooo.  .o888oo  .ooooo.  oooo d8b 
 \`"Y8888o.  d88' \`"Y8 \`888  \`888   888   888' \`88b   888   d88' \`88b \`888""8P 
     \`"Y88b 888        888   888   888   888   888   888   888   888  888     
oo     .d8P 888   .o8  888   888   888   888   888   888 . 888   888  888     
8""88888P'  \`Y8bod8P'  \`V88V"V8P' o888o  888bod8P'   "888" \`Y8bod8P' d888b    
                                         888                                  
                                        o888o                                 
`;

const GRID_X = 2.1;
const GRID_Y = 4.0;

// --- Helper: Generate Targets for Text Art ---
function generateTextTargets() {
    let targets = [];
    const lines = TEXT_ART.split('\n');

    // Normalize indentation
    let minC = 9999;
    for (let r = 0; r < lines.length; r++) {
        let line = lines[r];
        for (let c = 0; c < line.length; c++) {
            if (line[c] !== ' ' && line[c] !== undefined && line[c] !== '\n') {
                if (c < minC) minC = c;
            }
        }
    }
    if (minC === 9999) minC = 0;

    const heightOffset = lines.length / 2;
    let maxX = 0;

    for (let r = 0; r < lines.length; r++) {
        let line = lines[r];
        for (let c = 0; c < line.length; c++) {
            let char = line[c];
            if (char && char !== ' ' && char !== '\n') {

                const baseX = (c - minC) * GRID_X;
                const baseY = -(r - heightOffset) * GRID_Y;

                if (baseX > maxX) maxX = baseX;

                // VOXEL HEAVY LOGIC:
                // 3x3 BLOCK of points per pixel + Deep Z Extrusion
                const offsets = [-0.6, 0.0, 0.6];

                for (let ox of offsets) {
                    for (let oy of offsets) {
                        // Extrude Z for depth
                        for (let zDepth = -3.0; zDepth <= 3.0; zDepth += 1.5) {
                            targets.push({
                                x: baseX + ox,
                                y: baseY + oy,
                                z: zDepth,
                                isLogo: false,
                                char: char // Store specific char
                            });
                        }
                    }
                }
            }
        }
    }
    return { points: targets, width: maxX };
}

// --- Helper: Generate Targets for Logo ---
function generateLogoTargets() {
    let targets = [];
    const lines = LOGO_ART_MAIN.split('\n');

    let minC = 9999;
    for (let r = 0; r < lines.length; r++) {
        let line = lines[r];
        for (let c = 0; c < line.length; c++) {
            if (line[c] !== ' ' && line[c] !== undefined) {
                if (c < minC) minC = c;
            }
        }
    }

    const logoHeightOffset = lines.length / 2;
    let maxX = 0;

    for (let r = 0; r < lines.length; r++) {
        let line = lines[r];
        for (let c = 0; c < line.length; c++) {
            if (line[c] !== ' ' && line[c] !== undefined) {
                let x = (c - minC) * GRID_X;
                let y = -(r - logoHeightOffset) * GRID_Y;

                if (x > maxX) maxX = x;

                for (let z = -2.0; z <= 2.0; z += 1.0) {
                    targets.push({
                        x: x, y: y, z: z,
                        isLogo: true,
                        char: '@' // Force logo to be @
                    });
                }
            }
        }
    }
    return { points: targets, width: maxX };
}

// --- Combine and Position ---
const textData = generateTextTargets();
const logoData = generateLogoTargets();

// Check for mobile portrait
const isMobilePortrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;

const GAP = 25.0;
let totalWidth;
let startX;

if (isMobilePortrait) {
    // Only show logo
    totalWidth = logoData.width;
    startX = -totalWidth / 2;
} else {
    // Show logo + text
    totalWidth = logoData.width + GAP + textData.width;
    startX = -totalWidth / 2;
}

for (let p of logoData.points) {
    possibleTargets.push({
        x: p.x + startX,
        y: p.y,
        z: p.z,
        isLogo: true,
        char: p.char
    });
}

if (!isMobilePortrait) {
    const textOffsetX = startX + logoData.width + GAP;
    for (let p of textData.points) {
        possibleTargets.push({
            x: p.x + textOffsetX,
            y: p.y,
            z: p.z,
            isLogo: false,
            char: p.char
        });
    }
}

// Precompute the target layout once so the phase change doesn't hitch
const sortedTargets = new Array(NUM_POINTS);
for (let i = 0; i < NUM_POINTS; i++) {
    sortedTargets[i] = possibleTargets[i % possibleTargets.length];
}
sortedTargets.sort((a, b) => a.x - b.x);

// --- Particle System ---
let particles = [];
for (let i = 0; i < NUM_POINTS; i++) {
    particles.push({
        x: 0, y: 0, z: 0,
        sx: 0, sy: 0, sz: 0,
        c1x: 0, c1y: 0, c1z: 0,
        c2x: 0, c2y: 0, c2z: 0,
        tx: 0, ty: 0, tz: 0,
        tChar: ' ', // Target Character

        vx: 0, vy: 0, vz: 0,
        baseX: blobPoints[i % blobPoints.length].x,
        baseY: blobPoints[i % blobPoints.length].y,
        baseZ: blobPoints[i % blobPoints.length].z
    });
}

// Pre-sort particle indices by their baseX so we can map targets without a runtime sort
const particleOrder = Array.from({ length: NUM_POINTS }, (_, i) => i)
    .sort((a, b) => particles[a].baseX - particles[b].baseX);

const screenElement = document.getElementById('canvas');
const computedCanvasStyle = getComputedStyle(screenElement);

// Measure character size accurately to avoid vertical clipping
// Measure character size dynamically to handle responsive scaling
let charWidth = 6;
let charHeight = 10;

function updateCharDimensions() {
    const measureElement = document.createElement('span');
    measureElement.style.fontFamily = computedCanvasStyle.fontFamily;
    measureElement.style.fontSize = computedCanvasStyle.fontSize;
    measureElement.style.lineHeight = computedCanvasStyle.lineHeight;
    measureElement.style.position = 'absolute';
    measureElement.style.visibility = 'hidden';
    measureElement.innerText = "X";
    document.body.appendChild(measureElement);

    let rect = measureElement.getBoundingClientRect();
    charWidth = rect.width || 6;

    // Try to get line-height from styles first, else fallback to rect height
    let lh = parseFloat(computedCanvasStyle.lineHeight);
    if (!lh || Number.isNaN(lh)) {
        lh = rect.height || 10;
    }
    charHeight = lh;

    document.body.removeChild(measureElement);
}

// Initial measurement
updateCharDimensions();

// Update on resize
window.addEventListener('resize', updateCharDimensions);

let time = 0;
let camPitch = 0;
let camYaw = 0;

let capturedPitch = 0;
let capturedYaw = 0;
let targetYaw = 0;
let yawCorrection = 0;

function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function cubicBezier(t, p0, p1, p2, p3) {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;
    return (uuu * p0) + (3 * uu * t * p1) + (3 * u * tt * p2) + (ttt * p3);
}

function render() {
    // Fixed resolution to ensure "actual characters displayed" never changes, only scales.
    const width = 160;
    const height = 80;
    const size = width * height;

    const zbuffer = new Float32Array(size).fill(-9999.0);
    const output = new Array(size).fill(' ');

    const K1 = Math.min(width, height) * 0.7;
    const aspectCorrection = (charHeight / charWidth);

    stateTimer++;

    // --- PHASE LOGIC ---

    if (stateTimer < TIME_BLOB_END) {
        // PHASE 1: BLOB
        camYaw += CAM_YAW_SPEED;
        camPitch = Math.sin(time * 0.5) * 0.3;

        const pulseFreq = 4.0;
        const pulseSpeed = time * 3.0;

        for (let p of particles) {
            const noise = Math.sin(p.baseX * pulseFreq + pulseSpeed) *
                Math.cos(p.baseY * pulseFreq + pulseSpeed);
            const morph = 1.0 + (noise * 0.2);

            p.x = p.baseX * SPHERE_RADIUS * morph;
            p.y = p.baseY * SPHERE_RADIUS * morph;
            p.z = p.baseZ * SPHERE_RADIUS * morph;
        }

    } else if (stateTimer < TIME_TEXT_START) {
        // PHASE 2: EXPLODE
        if (stateTimer === TIME_BLOB_END) {
            for (let p of particles) {
                p.vx = p.baseX * (Math.random() * 0.9 + 0.2);
                p.vy = p.baseY * (Math.random() * 0.9 + 0.2);
                p.vz = p.baseZ * (Math.random() * 0.9 + 0.2);
            }
        }

        camYaw += CAM_YAW_SPEED;
        camPitch = Math.sin(time * 0.5) * 0.4;

        for (let p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.z += p.vz;
            p.vx *= 0.98;
            p.vy *= 0.98;
            p.vz *= 0.98;
        }

    } else {
        // PHASE 3: CONVERGENCE
        if (stateTimer === TIME_TEXT_START) {
            capturedPitch = camPitch;
            capturedYaw = camYaw;
            targetYaw = Math.ceil((capturedYaw + 0.1) / (Math.PI * 2)) * (Math.PI * 2);
            // Compute a correction so yaw keeps its existing velocity and still lands on target
            yawCorrection = targetYaw - (capturedYaw + CAM_YAW_SPEED * TIME_GATHER_DURATION);

            for (let i = 0; i < NUM_POINTS; i++) {
                let p = particles[particleOrder[i]];
                let t = sortedTargets[i];

                // Assign the specific character
                p.tChar = t.char;

                let jitter = t.isLogo ? 0.05 : 0.1;

                p.tx = t.x + (Math.random() - 0.5) * jitter;
                p.ty = t.y + (Math.random() - 0.5) * jitter;
                p.tz = t.z + (Math.random() - 0.5) * jitter;

                p.sx = p.x;
                p.sy = p.y;
                p.sz = p.z;

                const momentum = 120.0;
                const spread = 40.0;
                p.c1x = p.sx + (p.vx * momentum) + (Math.random() - 0.5) * spread;
                p.c1y = p.sy + (p.vy * momentum) + (Math.random() - 0.5) * spread;
                p.c1z = p.sz + (p.vz * momentum) + (Math.random() - 0.5) * spread;

                const approach = 50.0;
                p.c2x = p.tx + (Math.random() - 0.5) * approach;
                p.c2y = p.ty + (Math.random() - 0.5) * approach;
                p.c2z = p.tz + (Math.random() - 0.5) * approach;
            }
        }

        let framesSinceStart = (stateTimer - TIME_TEXT_START);
        let progress = framesSinceStart / TIME_GATHER_DURATION;
        if (progress > 1.0) progress = 1.0;

        let ease = easeInOutCubic(progress);
        let framesClamped = Math.min(framesSinceStart, TIME_GATHER_DURATION);
        let baseYaw = capturedYaw + CAM_YAW_SPEED * framesClamped;
        camYaw = progress >= 1.0 ? targetYaw : baseYaw + yawCorrection * ease;
        camPitch = capturedPitch * (1.0 - ease);

        let t = progress;

        for (let p of particles) {
            p.x = cubicBezier(t, p.sx, p.c1x, p.c2x, p.tx);
            p.y = cubicBezier(t, p.sy, p.c1y, p.c2y, p.ty);
            p.z = cubicBezier(t, p.sz, p.c1z, p.c2z, p.tz);
        }
    }

    // --- RENDER & LIGHTING ---

    let currentViewDist = VIEW_DISTANCE_START;
    let morphToText = 0.0; // 0.0 = Light Shading, 1.0 = Exact Char

    if (stateTimer > TIME_TEXT_START) {
        let p = (stateTimer - TIME_TEXT_START) / TIME_GATHER_DURATION;
        if (p > 1.0) p = 1.0;
        let zoomEase = easeInOutCubic(p);

        currentViewDist = VIEW_DISTANCE_START + (VIEW_DISTANCE_END - VIEW_DISTANCE_START) * zoomEase;

        // Ramp up texture morph
        morphToText = Math.max(0.0, (p - 0.2) * 1.5);
        if (morphToText > 1.0) morphToText = 1.0;
    }

    const cosA = Math.cos(camPitch), sinA = Math.sin(camPitch);
    const cosB = Math.cos(camYaw), sinB = Math.sin(camYaw);

    for (let i = 0; i < NUM_POINTS; i++) {
        let p = particles[i];

        let y1 = p.y * cosA - p.z * sinA;
        let z1 = p.y * sinA + p.z * cosA;
        let x1 = p.x;

        let x2 = x1 * cosB - y1 * sinB;
        let y2 = x1 * sinB + y1 * cosB;
        let z2 = z1;

        if (z2 > -currentViewDist + 1) {
            let ooz = 1.0 / (currentViewDist + z2 / 4.0);

            // Aspect ratio correction: (charHeight / charWidth) instead of 2.0
            let xp = Math.floor(width / 2 + K1 * ooz * x2 * aspectCorrection);
            let yp = Math.floor(height / 2 - K1 * ooz * y2);

            if (xp >= 0 && xp < width && yp >= 0 && yp < height) {
                let idx = xp + yp * width;
                if (ooz > zbuffer[idx]) {
                    zbuffer[idx] = ooz;

                    // 1. Calculate Standard Light Shade
                    let bBlob = (x2 * -0.5 + y2 * -0.5 + z2 * -1.0) / SPHERE_RADIUS + 0.3;
                    if (bBlob < 0) bBlob = 0; if (bBlob > 1) bBlob = 1;
                    let shadeChar = SHADE_CHARS[Math.floor(bBlob * (SHADE_CHARS.length - 1))];

                    // 2. Determine Final Char
                    let finalChar = shadeChar;

                    if (stateTimer > TIME_TEXT_START && p.tChar) {
                        // Transition from shading to actual character
                        if (Math.random() < morphToText) {
                            finalChar = p.tChar;
                        }
                    }

                    output[idx] = finalChar;
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

    time += 0.03;
    requestAnimationFrame(render);
}

requestAnimationFrame(render);

// --- SCROLL ANIMATION OBSERVER ---
const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.2
};

const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
        }
    });
}, observerOptions);

document.querySelectorAll('.scroll-section').forEach(section => {
    observer.observe(section);
});
