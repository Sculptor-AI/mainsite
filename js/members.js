/*
 * Sculptor AI - Members Interlude
 * Scroll-driven particle physics for the Members section: dust gathers into a
 * raw block of stone, splits to both sides into a mallet and a chisel — one
 * per member — then bursts and reforms at the bottom into the Sculptor mark.
 *
 * Same discipline as the hero: particle state in flat Float32Arrays, no
 * allocation inside the frame loop, and the loop parks itself whenever the
 * section is offscreen. Motion is a damped spring per particle, slightly
 * underdamped on purpose so arrivals overshoot and settle instead of easing
 * in on rails.
 */

(function () {
    const {
        SPACE_CODE,
        createTextSurface,
        createVisibilityController,
        hash01,
        sampleRampCode,
        toCharCodes
    } = window.ASCIIUtils;

    const section = document.getElementById('members');
    const screenElement = document.getElementById('members-canvas');
    if (!section || !screenElement) return;
    const stickyEl = section.querySelector('.members-sticky');

    // Same breakpoint logo-3d.js uses, so the grid agrees with the CSS layout
    const NARROW = window.matchMedia('(max-width: 768px)').matches;
    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const W = NARROW ? 92 : 192;
    const H = NARROW ? 112 : 88;
    const NUM = NARROW ? 2600 : 4200;
    const CHAR_ASPECT = 0.6; // Courier advance width as a fraction of line height

    // Spring toward the current target. K sets the pull, DAMPING bleeds
    // velocity; this pair lands just under critical damping, so flights end in
    // one soft overshoot. Reduced motion snaps hard instead of flying.
    const K_SPRING = REDUCED ? 70 : 20;
    const DAMPING = REDUCED ? 16 : 5.0;

    const RAMP_CODES = toCharCodes(" .,:;-~=+*ox#X%@");
    const RAMP_DITHER = 0.10;

    // Where in the scroll the block splits and where the tools reform into the
    // mark. Staggered per particle below, so each handover ripples through the
    // cloud instead of snapping as one.
    const P_SPLIT = 0.30;
    const P_REFORM = 0.68;
    const STAGGER = 0.07;

    // Layout anchors, in grid cells
    const BLOCK_CY = NARROW ? H * 0.34 : H * 0.42;
    const TOOLS_CY = BLOCK_CY;
    const MALLET_CX = W * 0.27;
    const CHISEL_CX = W * 0.73;
    const MARK_CX = W * 0.5;
    const MARK_CY = NARROW ? H * 0.78 : H * 0.74;

    // --- Target artwork ---

    const MALLET_ART = [
        "      .=*#%%%%%%#*=.",
        "    -#@@@@@@@@@@@@@@#-",
        "   =@@@@@@@@@@@@@@@@@@=",
        "  .%@@@@@@@@@@@@@@@@@@%.",
        "  -@@@@@@@@@@@@@@@@@@@@-",
        "  -@@@@@@@@@@@@@@@@@@@@-",
        "  -@@@@@@@@@@@@@@@@@@@@-",
        "  .%@@@@@@@@@@@@@@@@@@%.",
        "   =@@@@@@@@@@@@@@@@@@=",
        "    -#@@@@@@@@@@@@@@#-",
        "      .=*#%%%%%%#*=.",
        "          +@@@@+",
        "          +@@@@+",
        "          +@@@@+",
        "          +@@@@+",
        "          +@@@@+",
        "          +@@@@+",
        "          +@@@@+",
        "          +@@@@+",
        "         .#@@@@#.",
        "         '*####*'"
    ];

    const CHISEL_ART = [
        "    .=+####+=.",
        "    '#%@@@@%#'",
        "      |@@@@|",
        "      |@@@@|",
        "      |@@@@|",
        "      |@@@@|",
        "      |@@@@|",
        "      |@@@@|",
        "      |@@@@|",
        "      |@@@@|",
        "      |@@@@|",
        "      |@@@@|",
        "     .#@@@@#.",
        "    .%@@@@@@%.",
        "   .%@@@@@@@@%.",
        "   #@@@@@@@@@@#",
        "   %@@@@@@@@@@%",
        "   =@@@@@@@@@@=",
        "    *@@@@@@@@*",
        "     '======'"
    ];

    // Same mark the hero converges on, so the reform reads as the site's logo
    const MARK_ART = `
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
`.split('\n');

    function targetsFromArt(lines, cx, cy) {
        // Center on the ink, not the string: art blocks carry indentation, and
        // centering on line length would drag the shape off its anchor
        let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
        for (let r = 0; r < lines.length; r++) {
            const line = lines[r];
            for (let c = 0; c < line.length; c++) {
                if (line[c] !== ' ') {
                    if (c < minC) minC = c;
                    if (c > maxC) maxC = c;
                    if (r < minR) minR = r;
                    if (r > maxR) maxR = r;
                }
            }
        }
        if (minC > maxC) return [];
        const midC = (minC + maxC) / 2;
        const midR = (minR + maxR) / 2;
        const out = [];
        for (let r = 0; r < lines.length; r++) {
            const line = lines[r];
            for (let c = 0; c < line.length; c++) {
                const ch = line[c];
                if (ch !== ' ') {
                    out.push({ x: cx + c - midC, y: cy + r - midR, code: ch.charCodeAt(0) });
                }
            }
        }
        return out;
    }

    // The uncarved block: a rectangle with chipped corners and a ragged edge,
    // so it reads as raw stone rather than a UI panel
    function blockTargets(cx, cy, halfW, halfH) {
        const out = [];
        const grain = "@@@@%%#".split('').map(ch => ch.charCodeAt(0));
        for (let r = -halfH; r <= halfH; r++) {
            for (let c = -halfW; c <= halfW; c++) {
                const u = Math.abs(c) / halfW, v = Math.abs(r) / halfH;
                const chip = hash01(c * 12.91 + r * 7.73);
                if (Math.max(u, v) > 0.86 + chip * 0.14) continue;
                if (u * u + v * v > 1.28 + chip * 0.35) continue;
                const g = hash01(c * 3.17 + r * 9.41);
                const code = g < 0.05 ? 45 /* '-' texture pits */
                    : grain[Math.floor(hash01(c * 5.53 + r * 2.29) * grain.length)];
                out.push({ x: cx + c, y: cy + r, code });
            }
        }
        return out;
    }

    // Sort a target list by x and stride it out to one entry per particle.
    // Every phase is sorted the same way, so particle i is always the i-th
    // point from the left: the block's left half flies to the mallet, its
    // right half to the chisel, and flights barely cross.
    function buildSet(list) {
        list.sort((a, b) => a.x - b.x || a.y - b.y);
        const tx = new Float32Array(NUM);
        const ty = new Float32Array(NUM);
        const tc = new Uint8Array(NUM);
        for (let i = 0; i < NUM; i++) {
            const t = list[Math.floor(i * list.length / NUM)];
            tx[i] = t.x + (hash01(i * 3.71) - 0.5) * 0.9;
            ty[i] = t.y + (hash01(i * 9.13) - 0.5) * 0.7;
            tc[i] = t.code;
        }
        return { tx, ty, tc };
    }

    const blockSet = buildSet(blockTargets(W * 0.5, BLOCK_CY, NARROW ? 18 : 23, NARROW ? 10 : 12));
    const toolsSet = buildSet(
        targetsFromArt(MALLET_ART, MALLET_CX, TOOLS_CY)
            .concat(targetsFromArt(CHISEL_ART, CHISEL_CX, TOOLS_CY)));
    const markSet = buildSet(targetsFromArt(MARK_ART, MARK_CX, MARK_CY));

    // --- Particle state ---
    const posX = new Float32Array(NUM);
    const posY = new Float32Array(NUM);
    const velX = new Float32Array(NUM);
    const velY = new Float32Array(NUM);
    const curPhase = new Uint8Array(NUM);
    const splitAt = new Float32Array(NUM);
    const reformAt = new Float32Array(NUM);

    for (let i = 0; i < NUM; i++) {
        // Loose dust just past the edges of the frame, so entering the section
        // shows the stone gathering itself
        posX[i] = hash01(i * 1.37) * (W + 24) - 12;
        posY[i] = hash01(i * 2.11) * (H + 16) - 8;
        velX[i] = (hash01(i * 3.31) - 0.5) * 40;
        velY[i] = (hash01(i * 4.73) - 0.5) * 40;
        splitAt[i] = P_SPLIT + (hash01(i * 5.19) - 0.5) * STAGGER;
        reformAt[i] = P_REFORM + (hash01(i * 6.41) - 0.5) * STAGGER;
    }

    const surface = createTextSurface(W, H);
    const loop = createVisibilityController(stickyEl);

    // --- Full-bleed fit ---
    // The section lives inside the right text column but must span the whole
    // viewport. CSS alone can only center it on its parent, so the offset to
    // the viewport's left edge is measured instead.
    function fitBleed() {
        section.style.marginLeft = '0px';
        const left = section.getBoundingClientRect().left;
        if (left) section.style.marginLeft = (-left) + 'px';
    }
    fitBleed();
    window.addEventListener('resize', fitBleed);
    window.addEventListener('orientationchange', fitBleed);

    // --- Pointer repulsion ---
    // A light physics toy: the cursor shoves nearby particles aside and the
    // springs pull them home. Strength decays so a parked cursor goes inert.
    let pointerX = 0, pointerY = 0, pointerStrength = 0;
    const POINTER_R = 10; // in row units

    stickyEl.addEventListener('pointermove', (e) => {
        const r = screenElement.getBoundingClientRect();
        if (!r.width || !r.height) return;
        pointerX = (e.clientX - r.left) / r.width * W;
        pointerY = (e.clientY - r.top) / r.height * H;
        pointerStrength = 1.0;
    });

    // --- Scroll progress ---
    function readProgress() {
        const rect = section.getBoundingClientRect();
        const range = rect.height - stickyEl.clientHeight;
        if (range <= 0) return 0;
        const p = -rect.top / range;
        return p < 0 ? 0 : p > 1 ? 1 : p;
    }

    // --- Overlay copy ---
    const headingEl = section.querySelector('.members-heading');
    const leftEl = section.querySelector('.member-label-left');
    const rightEl = section.querySelector('.member-label-right');
    const codaEl = section.querySelector('.members-coda');
    const labelEls = [headingEl, leftEl, rightEl, codaEl];
    const labelShown = [false, false, false, false];

    function setLabels(p) {
        // Names trail the split slightly, and the left one leads the right,
        // matching the direction the particles peel apart
        const want = [
            p < P_SPLIT,
            p > P_SPLIT + 0.02 && p < 0.72,
            p > P_SPLIT + 0.05 && p < 0.72,
            p > 0.76
        ];
        for (let i = 0; i < labelEls.length; i++) {
            if (labelEls[i] && want[i] !== labelShown[i]) {
                labelShown[i] = want[i];
                labelEls[i].classList.toggle('show', want[i]);
            }
        }
    }

    // --- Frame loop ---
    let lastTimestamp = performance.now();
    let time = 0;

    function render(timestamp) {
        if (typeof timestamp !== 'number') timestamp = performance.now();

        if (!loop.isActive()) {
            lastTimestamp = timestamp;
            requestAnimationFrame(render);
            return;
        }

        const dt = Math.min(0.05, Math.max(0, (timestamp - lastTimestamp) / 1000));
        lastTimestamp = timestamp;
        time += dt;

        const p = readProgress();
        setLabels(p);

        // Idle life for settled shapes: each tool floats and rocks on its own
        // clock, the mark breathes. Applied to the targets, so the springs
        // carry the motion and it stays physical.
        const angM = Math.sin(time * 1.05) * 0.05;
        const bobM = Math.sin(time * 0.8) * 0.55;
        const cM = Math.cos(angM), sM = Math.sin(angM);
        const angC = Math.sin(time * 0.85 + 2.0) * 0.045;
        const bobC = Math.sin(time * 1.25 + 1.0) * 0.7;
        const cC = Math.cos(angC), sC = Math.sin(angC);
        const markBob = Math.sin(time * 0.6) * 0.5;

        pointerStrength *= Math.exp(-2.2 * dt);
        const doPointer = !REDUCED && pointerStrength > 0.02;
        const damp = Math.exp(-DAMPING * dt);
        const halfW = W * 0.5;

        surface.reset();
        const out = surface.charBuffer;

        for (let i = 0; i < NUM; i++) {
            const phase = p < splitAt[i] ? 0 : (p < reformAt[i] ? 1 : 2);

            if (phase !== curPhase[i]) {
                // A kick on every handover, so targets changing under the
                // springs looks like a burst rather than a crossfade
                if (!REDUCED) {
                    const h1 = hash01(i * 7.77 + phase * 13.1);
                    const h2 = hash01(i * 8.31 + phase * 17.9);
                    if (phase === 1 && curPhase[i] === 0) {
                        // The split: shove each half toward its own side
                        const sign = toolsSet.tx[i] < halfW ? -1 : 1;
                        velX[i] += sign * (40 + h1 * 50);
                        velY[i] += (h2 - 0.5) * 50;
                    } else if (phase === 2) {
                        // The reform: collapse downward toward the mark
                        velX[i] += (h1 - 0.5) * 70;
                        velY[i] += 25 + h2 * 45;
                    } else {
                        velX[i] += (h1 - 0.5) * 60;
                        velY[i] += (h2 - 0.5) * 60;
                    }
                }
                curPhase[i] = phase;
            }

            let tx, ty, tc;
            if (phase === 0) {
                tx = blockSet.tx[i]; ty = blockSet.ty[i]; tc = blockSet.tc[i];
            } else if (phase === 1) {
                const bx = toolsSet.tx[i], by = toolsSet.ty[i];
                tc = toolsSet.tc[i];
                if (bx < halfW) {
                    const ox = bx - MALLET_CX, oy = by - TOOLS_CY;
                    tx = MALLET_CX + ox * cM - oy * sM;
                    ty = TOOLS_CY + bobM + ox * sM + oy * cM;
                } else {
                    const ox = bx - CHISEL_CX, oy = by - TOOLS_CY;
                    tx = CHISEL_CX + ox * cC - oy * sC;
                    ty = TOOLS_CY + bobC + ox * sC + oy * cC;
                }
            } else {
                tx = markSet.tx[i]; ty = markSet.ty[i] + markBob; tc = markSet.tc[i];
            }

            let x = posX[i], y = posY[i];
            let vx = velX[i] + (tx - x) * K_SPRING * dt;
            let vy = velY[i] + (ty - y) * K_SPRING * dt;

            if (doPointer) {
                // Distances in row units: a cell is a full row tall but only
                // CHAR_ASPECT of one wide, so x shrinks before measuring
                const rx = (x - pointerX) * CHAR_ASPECT;
                const ry = y - pointerY;
                const d2 = rx * rx + ry * ry;
                if (d2 < POINTER_R * POINTER_R && d2 > 0.01) {
                    const d = Math.sqrt(d2);
                    const f = (1 - d / POINTER_R) * 140 * pointerStrength / d;
                    vx += rx * f * dt / CHAR_ASPECT;
                    vy += ry * f * dt;
                }
            }

            vx *= damp; vy *= damp;
            x += vx * dt; y += vy * dt;
            velX[i] = vx; velY[i] = vy;
            posX[i] = x; posY[i] = y;

            if (x < 0 || y < 0) continue;
            const xi = x | 0, yi = y | 0;
            if (xi >= W || yi >= H) continue;
            const idx = xi + yi * W;

            const ddx = tx - x, ddy = ty - y;
            const sp2 = vx * vx + vy * vy;
            if (ddx * ddx + ddy * ddy < 0.8 && sp2 < 16) {
                // Home and at rest: show the artwork's own character.
                // Settled particles always win the cell over passing flights.
                out[idx] = tc;
            } else if (out[idx] === SPACE_CODE) {
                // In flight: brightness from speed, so streams read as comets
                // that dim as they slow into place
                const b = Math.min(1, 0.10 + Math.sqrt(sp2) * 0.012);
                out[idx] = sampleRampCode(RAMP_CODES, b, xi, yi, RAMP_DITHER);
            }
        }

        surface.presentText(screenElement);
        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
})();
