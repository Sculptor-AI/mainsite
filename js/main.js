/*
 * Sculptor AI - Hero Animation
 * Blob -> Explode -> Text convergence, rendered as shaded ASCII.
 *
 * Particle state lives in flat Float32Arrays (structure-of-arrays) so the
 * per-frame loops stay allocation-free and cache-friendly.
 */

const {
    SPACE_CODE,
    createTextSurface,
    createVisibilityController,
    hash01,
    sampleRampCode,
    toCharCodes
} = window.ASCIIUtils;

// --- Configuration ---
// Matched with matchMedia rather than innerWidth so this agrees with the
// breakpoint in styles.css. The two can disagree otherwise: innerWidth is in
// layout pixels, which a zoomed-out mobile viewport scales away from the CSS
// pixels the media query is resolved in.
const isMobilePortrait = window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches;

const SPHERE_RADIUS = 25.0;
const NUM_POINTS = isMobilePortrait ? 12000 : 32000; // Reduced particles for mobile performance

// --- Zoom Configuration ---
const VIEW_DISTANCE_START = 110.0;
// Landscape pulls back to make room for the wordmark alongside the mark.
// Portrait drops the wordmark, so the camera has nothing to make room for and
// stops much nearer, landing the mark at about three fifths of the screen.
const VIEW_DISTANCE_END = isMobilePortrait ? 96.0 : 210.0;

const SHADE_CHARS = " .,:;-~=+*ox#X%@";
const SHADE_CHAR_CODES = toCharCodes(SHADE_CHARS);
const SHADE_DITHER = 0.08;
const CAM_YAW_SPEED = 0.01;

// Key light (upper-left, toward the camera) and its Blinn half-vector.
const LIGHT_X = -0.45, LIGHT_Y = 0.55, LIGHT_Z = -0.7;
const lightLen = Math.hypot(LIGHT_X, LIGHT_Y, LIGHT_Z);
const LX = LIGHT_X / lightLen, LY = LIGHT_Y / lightLen, LZ = LIGHT_Z / lightLen;
const halfLen = Math.hypot(LX, LY, LZ - 1.0);
const HX = LX / halfLen, HY = LY / halfLen, HZ = (LZ - 1.0) / halfLen;

// --- Timings (in frames) ---
// Speed up on mobile to let particles settle faster
const TIME_BLOB_END = isMobilePortrait ? 100 : 180;
const TIME_EXPLODE_END = isMobilePortrait ? 200 : 360;
const TIME_GATHER_DURATION = isMobilePortrait ? 180 : 320;
const TIME_TEXT_START = TIME_EXPLODE_END;

let stateTimer = 0;
let hasTriggeredExplosion = false;
let hasTriggeredConvergence = false;
let lastTimestamp = performance.now();

// --- Particle State (structure-of-arrays) ---
// dir* doubles as the unit-sphere base position and the surface normal.
const dirX = new Float32Array(NUM_POINTS);
const dirY = new Float32Array(NUM_POINTS);
const dirZ = new Float32Array(NUM_POINTS);
const posX = new Float32Array(NUM_POINTS);
const posY = new Float32Array(NUM_POINTS);
const posZ = new Float32Array(NUM_POINTS);
const velX = new Float32Array(NUM_POINTS);
const velY = new Float32Array(NUM_POINTS);
const velZ = new Float32Array(NUM_POINTS);
// Bezier control points for the convergence flight path.
const startX = new Float32Array(NUM_POINTS);
const startY = new Float32Array(NUM_POINTS);
const startZ = new Float32Array(NUM_POINTS);
const ctrl1X = new Float32Array(NUM_POINTS);
const ctrl1Y = new Float32Array(NUM_POINTS);
const ctrl1Z = new Float32Array(NUM_POINTS);
const ctrl2X = new Float32Array(NUM_POINTS);
const ctrl2Y = new Float32Array(NUM_POINTS);
const ctrl2Z = new Float32Array(NUM_POINTS);
const tgtX = new Float32Array(NUM_POINTS);
const tgtY = new Float32Array(NUM_POINTS);
const tgtZ = new Float32Array(NUM_POINTS);
const tgtChar = new Uint8Array(NUM_POINTS);
const reveal = new Float32Array(NUM_POINTS);

// Fibonacci sphere distribution
const phi = Math.PI * (3.0 - Math.sqrt(5.0));
for (let i = 0; i < NUM_POINTS; i++) {
    const y = 1 - (i / (NUM_POINTS - 1)) * 2;
    const radiusAtY = Math.sqrt(1 - y * y);
    const theta = phi * i;
    dirX[i] = Math.cos(theta) * radiusAtY;
    dirY[i] = y;
    dirZ[i] = Math.sin(theta) * radiusAtY;
    tgtChar[i] = SPACE_CODE;
    reveal[i] = hash01((i + 1) * 17.0);
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

    // Portrait stops the camera much nearer, which spreads one source pixel over
    // about one and a half cells in each direction and opens gaps between them.
    // Samples taken across the pixel close those; the z extrusion thins out to
    // pay for them, since depth is the one thing a head-on view does not show.
    const subX = isMobilePortrait ? [-0.7, 0.0, 0.7] : [0.0];
    const subY = isMobilePortrait ? [-1.33, 0.0, 1.33] : [0.0];
    const zStep = isMobilePortrait ? 2.0 : 1.0;

    for (let r = 0; r < lines.length; r++) {
        let line = lines[r];
        for (let c = 0; c < line.length; c++) {
            if (line[c] !== ' ' && line[c] !== undefined) {
                let x = (c - minC) * GRID_X;
                let y = -(r - logoHeightOffset) * GRID_Y;

                if (x > maxX) maxX = x;

                for (let ox of subX) {
                    for (let oy of subY) {
                        for (let z = -2.0; z <= 2.0; z += zStep) {
                            targets.push({
                                x: x + ox, y: y + oy, z: z,
                                isLogo: true,
                                char: '@' // Force logo to be @
                            });
                        }
                    }
                }
            }
        }
    }
    return { points: targets, width: maxX };
}

// --- Combine and Position ---
const textData = generateTextTargets();
const logoData = generateLogoTargets();

const GAP = 25.0;
let totalWidth;
let startXOffset;

if (isMobilePortrait) {
    // Only show logo
    totalWidth = logoData.width;
    startXOffset = -totalWidth / 2;
} else {
    // Show logo + text
    totalWidth = logoData.width + GAP + textData.width;
    startXOffset = -totalWidth / 2;
}

for (let p of logoData.points) {
    possibleTargets.push({
        x: p.x + startXOffset,
        y: p.y,
        z: p.z,
        isLogo: true,
        char: p.char
    });
}

if (!isMobilePortrait) {
    const textOffsetX = startXOffset + logoData.width + GAP;
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

// Precompute the target layout once so the phase change doesn't hitch.
// Strided rather than wrapped with a modulo: once the targets outnumber the
// particles, wrapping hands out the front of the list and stops, which would
// draw the top of the mark and leave the rest of it unbuilt. Striding thins the
// whole list evenly instead.
const sortedTargets = new Array(NUM_POINTS);
for (let i = 0; i < NUM_POINTS; i++) {
    sortedTargets[i] = possibleTargets[Math.floor(i * possibleTargets.length / NUM_POINTS)];
}
sortedTargets.sort((a, b) => a.x - b.x);

// Pre-sort particle indices by base X so targets map left-to-right without a runtime sort
const particleOrder = Array.from({ length: NUM_POINTS }, (_, i) => i)
    .sort((a, b) => dirX[a] - dirX[b]);

const screenElement = document.getElementById('canvas');
const heroLoop = createVisibilityController(document.getElementById('hero'));
// A 160 column frame is about 770px wide at the smallest legible glyph size,
// so on a phone the landscape grid hung a third of itself off each edge and
// sheared the blob into a band. Portrait gets a frame shaped like the screen.
const FRAME_WIDTH = isMobilePortrait ? 88 : 160;
const FRAME_HEIGHT = isMobilePortrait ? 56 : 80;
const surface = createTextSurface(FRAME_WIDTH, FRAME_HEIGHT);

// Focal length. Both values are set by the widest moment of the animation
// rather than the final pose: the explosion throws particles about 73 units out
// while the camera is still at VIEW_DISTANCE_START, and anything past the frame
// edge is clipped against an invisible box in the middle of the screen.
const PROJECTION_K1 = isMobilePortrait
    ? FRAME_WIDTH * 0.45
    : Math.min(FRAME_WIDTH, FRAME_HEIGHT) * 0.7;

// Measure character size dynamically to handle responsive scaling
let charWidth = 6;
let charHeight = 10;

function updateCharDimensions() {
    const computedCanvasStyle = getComputedStyle(screenElement);
    const measureElement = document.createElement('span');
    measureElement.style.fontFamily = computedCanvasStyle.fontFamily;
    measureElement.style.fontSize = computedCanvasStyle.fontSize;
    measureElement.style.lineHeight = computedCanvasStyle.lineHeight;
    measureElement.style.position = 'absolute';
    measureElement.style.visibility = 'hidden';
    measureElement.textContent = "X";
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

function render(timestamp) {
    if (!timestamp) timestamp = performance.now();

    if (!heroLoop.isActive()) {
        lastTimestamp = timestamp;
        requestAnimationFrame(render);
        return;
    }

    const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000); // Cap at 50ms to prevent glitches
    lastTimestamp = timestamp;
    const timeScale = dt * 120.0;

    const width = surface.width;
    const height = surface.height;
    surface.reset();
    const zbuffer = surface.zBuffer;
    const output = surface.charBuffer;

    const K1 = PROJECTION_K1;
    const aspectCorrection = (charHeight / charWidth);

    stateTimer += timeScale;

    // --- PHASE LOGIC ---

    if (stateTimer < TIME_BLOB_END) {
        // PHASE 1: BLOB
        camYaw += CAM_YAW_SPEED * timeScale;
        camPitch = Math.sin(time * 0.5) * 0.3;

        const pulseFreq = 4.0;
        const pulseSpeed = time * 3.0;

        for (let i = 0; i < NUM_POINTS; i++) {
            const noise = Math.sin(dirX[i] * pulseFreq + pulseSpeed) *
                Math.cos(dirY[i] * pulseFreq + pulseSpeed);
            const r = SPHERE_RADIUS * (1.0 + noise * 0.2);
            posX[i] = dirX[i] * r;
            posY[i] = dirY[i] * r;
            posZ[i] = dirZ[i] * r;
        }

    } else if (stateTimer < TIME_TEXT_START) {
        // PHASE 2: EXPLODE
        if (!hasTriggeredExplosion) {
            hasTriggeredExplosion = true;
            for (let i = 0; i < NUM_POINTS; i++) {
                velX[i] = dirX[i] * (Math.random() * 0.9 + 0.2);
                velY[i] = dirY[i] * (Math.random() * 0.9 + 0.2);
                velZ[i] = dirZ[i] * (Math.random() * 0.9 + 0.2);
            }
        }

        camYaw += CAM_YAW_SPEED * timeScale;
        camPitch = Math.sin(time * 0.5) * 0.4;

        const decay = Math.pow(0.98, timeScale);
        for (let i = 0; i < NUM_POINTS; i++) {
            posX[i] += velX[i] * timeScale;
            posY[i] += velY[i] * timeScale;
            posZ[i] += velZ[i] * timeScale;
            velX[i] *= decay;
            velY[i] *= decay;
            velZ[i] *= decay;
        }

    } else {
        // PHASE 3: CONVERGENCE
        if (!hasTriggeredConvergence) {
            hasTriggeredConvergence = true;
            capturedPitch = camPitch;
            capturedYaw = camYaw;
            targetYaw = Math.ceil((capturedYaw + 0.1) / (Math.PI * 2)) * (Math.PI * 2);
            // Compute a correction so yaw keeps its existing velocity and still lands on target
            yawCorrection = targetYaw - (capturedYaw + CAM_YAW_SPEED * TIME_GATHER_DURATION);

            const momentum = 120.0;
            const spread = 40.0;
            const approach = 50.0;

            for (let k = 0; k < NUM_POINTS; k++) {
                const i = particleOrder[k];
                const t = sortedTargets[k];

                tgtChar[i] = t.char.charCodeAt(0);

                const jitter = t.isLogo ? 0.05 : 0.1;
                tgtX[i] = t.x + (Math.random() - 0.5) * jitter;
                tgtY[i] = t.y + (Math.random() - 0.5) * jitter;
                tgtZ[i] = t.z + (Math.random() - 0.5) * jitter;

                startX[i] = posX[i];
                startY[i] = posY[i];
                startZ[i] = posZ[i];

                ctrl1X[i] = startX[i] + (velX[i] * momentum) + (Math.random() - 0.5) * spread;
                ctrl1Y[i] = startY[i] + (velY[i] * momentum) + (Math.random() - 0.5) * spread;
                ctrl1Z[i] = startZ[i] + (velZ[i] * momentum) + (Math.random() - 0.5) * spread;

                ctrl2X[i] = tgtX[i] + (Math.random() - 0.5) * approach;
                ctrl2Y[i] = tgtY[i] + (Math.random() - 0.5) * approach;
                ctrl2Z[i] = tgtZ[i] + (Math.random() - 0.5) * approach;
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

        // Bezier basis functions are shared by every particle this frame
        const t = progress;
        const u = 1 - t;
        const b0 = u * u * u;
        const b1 = 3 * u * u * t;
        const b2 = 3 * u * t * t;
        const b3 = t * t * t;

        for (let i = 0; i < NUM_POINTS; i++) {
            posX[i] = b0 * startX[i] + b1 * ctrl1X[i] + b2 * ctrl2X[i] + b3 * tgtX[i];
            posY[i] = b0 * startY[i] + b1 * ctrl1Y[i] + b2 * ctrl2Y[i] + b3 * tgtY[i];
            posZ[i] = b0 * startZ[i] + b1 * ctrl1Z[i] + b2 * ctrl2Z[i] + b3 * tgtZ[i];
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
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const nearClip = -currentViewDist + 1;
    const invDepthRange = 1.0 / (SPHERE_RADIUS * 4.0);

    for (let i = 0; i < NUM_POINTS; i++) {
        const y1 = posY[i] * cosA - posZ[i] * sinA;
        const z2 = posY[i] * sinA + posZ[i] * cosA;
        const x1 = posX[i];

        const x2 = x1 * cosB - y1 * sinB;
        const y2 = x1 * sinB + y1 * cosB;

        if (z2 <= nearClip) continue;

        const ooz = 1.0 / (currentViewDist + z2 / 4.0);
        const xp = Math.floor(halfWidth + K1 * ooz * x2 * aspectCorrection);
        const yp = Math.floor(halfHeight - K1 * ooz * y2);

        if (xp < 0 || xp >= width || yp < 0 || yp >= height) continue;

        const idx = xp + yp * width;
        if (ooz <= zbuffer[idx]) continue;
        zbuffer[idx] = ooz;

        // Rotate the surface normal through the same camera transform.
        // dir* stays a unit sphere normal through blob and explode phases.
        const ny1 = dirY[i] * cosA - dirZ[i] * sinA;
        const nz2 = dirY[i] * sinA + dirZ[i] * cosA;
        const nx2 = dirX[i] * cosB - ny1 * sinB;
        const ny2 = dirX[i] * sinB + ny1 * cosB;

        // Lambert diffuse + Blinn specular (^16 via repeated squaring)
        let diff = nx2 * LX + ny2 * LY + nz2 * LZ;
        if (diff < 0) diff = 0;
        let spec = nx2 * HX + ny2 * HY + nz2 * HZ;
        if (spec < 0) spec = 0;
        spec *= spec; spec *= spec; spec *= spec; spec *= spec;

        // Faint bounce fill from below keeps the dark side from going black
        const bounce = ny2 < 0 ? -ny2 * 0.16 : 0;
        let brightness = 0.1 + diff * 0.85 + spec * 0.6 + bounce;

        // Depth cue: pull the far side down slightly
        let fade = 0.88 - z2 * invDepthRange * 0.5;
        if (fade < 0.55) fade = 0.55; else if (fade > 1.0) fade = 1.0;
        brightness *= fade;

        // As the text forms, flatten lighting so the glyphs read evenly
        if (morphToText > 0) brightness += (0.62 - brightness) * morphToText;
        if (brightness > 1) brightness = 1;

        let code = sampleRampCode(SHADE_CHAR_CODES, brightness, xp, yp, SHADE_DITHER);

        if (morphToText > 0 && tgtChar[i] !== SPACE_CODE && morphToText >= reveal[i]) {
            // Deterministic reveal prevents noisy frame-to-frame flicker while preserving the morph.
            code = tgtChar[i];
        }

        output[idx] = code;
    }

    surface.presentText(screenElement);

    time += 0.03 * timeScale;
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
