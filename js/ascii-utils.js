/*
 * Shared ASCII rendering helpers.
 * Includes shape-vector based character matching for sharp edge rendering.
 */

(function () {
    const SPACE_CODE = 32;
    const EMPTY_DEPTH = -9999.0;

    const BAYER_4X4 = [
        0, 8, 2, 10,
        12, 4, 14, 6,
        3, 11, 1, 9,
        15, 7, 13, 5
    ].map(value => (value + 0.5) / 16.0);

    const CHAR_CACHE = Array.from({ length: 128 }, (_, i) => String.fromCharCode(i));
    const HTML_CHAR_CACHE = Array.from({ length: 128 }, (_, i) => {
        const char = String.fromCharCode(i);
        if (char === '&') return '&amp;';
        if (char === '<') return '&lt;';
        if (char === '>') return '&gt;';
        if (char === '"') return '&quot;';
        return char;
    });
    const SPACE_RUN_CACHE = [''];
    const COLOR_STYLE_CACHE = new Map();

    function clamp01(value) {
        if (value <= 0) return 0;
        if (value >= 1) return 1;
        return value;
    }

    function dither(value, x, y, strength = 0.0) {
        if (!strength) return clamp01(value);
        const threshold = BAYER_4X4[(x & 3) + ((y & 3) << 2)] - 0.5;
        return clamp01(value + threshold * strength);
    }

    function hash01(seed) {
        const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
        return value - Math.floor(value);
    }

    function packColor(r, g, b) {
        return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
    }

    function toCharCodes(text) {
        return Array.from(text, char => char.charCodeAt(0));
    }

    function sampleRampCode(rampCodes, value, x, y, strength = 0.0) {
        const shaded = dither(value, x, y, strength);
        const index = Math.min(rampCodes.length - 1, Math.floor(shaded * (rampCodes.length - 1)));
        return rampCodes[index];
    }

    function getSpaceRun(length) {
        while (SPACE_RUN_CACHE.length <= length) {
            SPACE_RUN_CACHE.push(' '.repeat(SPACE_RUN_CACHE.length));
        }
        return SPACE_RUN_CACHE[length];
    }

    function getColorStyle(packedColor) {
        let style = COLOR_STYLE_CACHE.get(packedColor);
        if (!style) {
            const r = (packedColor >> 16) & 255;
            const g = (packedColor >> 8) & 255;
            const b = packedColor & 255;
            style = `color:rgb(${r},${g},${b})`;
            COLOR_STYLE_CACHE.set(packedColor, style);
        }
        return style;
    }

    function createTextSurface(width, height) {
        const size = width * height;
        const zBuffer = new Float32Array(size);
        const charBuffer = new Uint8Array(size);
        const colorBuffer = new Uint32Array(size);
        const rowChars = new Array(width);
        const lines = new Array(height);

        let lastMode = '';
        let lastFrame = '';

        function reset() {
            zBuffer.fill(EMPTY_DEPTH);
            charBuffer.fill(SPACE_CODE);
            colorBuffer.fill(0);
        }

        function presentText(element) {
            let offset = 0;
            for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) {
                    rowChars[col] = CHAR_CACHE[charBuffer[offset++]];
                }
                lines[row] = rowChars.join('');
            }

            const nextFrame = lines.join('\n');
            if (lastMode !== 'text' || nextFrame !== lastFrame) {
                element.textContent = nextFrame;
                lastMode = 'text';
                lastFrame = nextFrame;
            }
        }

        function presentColor(element, fallbackColor) {
            let offset = 0;
            for (let row = 0; row < height; row++) {
                let line = '';
                let col = 0;

                while (col < width) {
                    const rowIndex = offset + col;
                    const code = charBuffer[rowIndex];

                    if (code === SPACE_CODE) {
                        const runStart = col;
                        while (col < width && charBuffer[offset + col] === SPACE_CODE) {
                            col++;
                        }
                        line += getSpaceRun(col - runStart);
                        continue;
                    }

                    const packedColor = colorBuffer[rowIndex] || fallbackColor;
                    let run = '';

                    while (col < width) {
                        const runIndex = offset + col;
                        const runCode = charBuffer[runIndex];
                        const runColor = colorBuffer[runIndex] || fallbackColor;
                        if (runCode === SPACE_CODE || runColor !== packedColor) break;
                        run += HTML_CHAR_CACHE[runCode];
                        col++;
                    }

                    line += `<span style="${getColorStyle(packedColor)}">${run}</span>`;
                }

                lines[row] = line;
                offset += width;
            }

            const nextFrame = lines.join('\n');
            if (lastMode !== 'html' || nextFrame !== lastFrame) {
                element.innerHTML = nextFrame;
                lastMode = 'html';
                lastFrame = nextFrame;
            }
        }

        reset();

        return {
            width,
            height,
            size,
            zBuffer,
            charBuffer,
            colorBuffer,
            reset,
            presentText,
            presentColor
        };
    }

    function createVisibilityController(element) {
        let inViewport = true;
        let docVisible = document.visibilityState !== 'hidden';

        if ('IntersectionObserver' in window && element) {
            const observer = new IntersectionObserver((entries) => {
                inViewport = entries.some(entry => entry.isIntersecting);
            }, { threshold: 0.0 });
            observer.observe(element);
        }

        document.addEventListener('visibilitychange', () => {
            docVisible = document.visibilityState !== 'hidden';
        });

        return {
            isActive() {
                return docVisible && (!element || element.offsetParent !== null) && inViewport;
            }
        };
    }

    // ====================================================================
    // Shape-Vector System — 6D character shape matching
    // Inspired by https://alexharri.com/blog/ascii-rendering
    // ====================================================================

    const SHAPE_DIMS = 6;

    // Sampling circle positions relative to cell [0,1]×[0,1]
    // 3 rows × 2 cols, staggered for maximum coverage
    const CIRCLE_POS = [
        [0.28, 0.20], [0.72, 0.13],   // top row
        [0.28, 0.50], [0.72, 0.47],   // mid row
        [0.28, 0.83], [0.72, 0.90],   // bot row
    ];
    const CIRCLE_RADIUS = 0.26;
    const SAMPLES_PER_CIRCLE = 37;

    /**
     * Pre-compute 6D shape vectors for all 95 printable ASCII characters.
     * Renders each character to an offscreen canvas and samples 6 regions.
     * Returns a reusable ShapeData object for lookups.
     */
    function computeShapeVectors(fontFamily) {
        const CELL_W = 30;
        const CELL_H = 50; // monospace chars are taller than wide
        const canvas = document.createElement('canvas');
        canvas.width = CELL_W;
        canvas.height = CELL_H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const NUM_CHARS = 95; // ASCII 32–126
        const vectors = new Float32Array(NUM_CHARS * SHAPE_DIMS);
        const charCodes = new Uint8Array(NUM_CHARS);

        // Pre-compute sample positions for each circle (relative to cell)
        const sampleOffsets = [];
        for (let ci = 0; ci < SHAPE_DIMS; ci++) {
            const cx = CIRCLE_POS[ci][0];
            const cy = CIRCLE_POS[ci][1];
            const offsets = [];
            for (let s = 0; s < SAMPLES_PER_CIRCLE; s++) {
                const frac = (s + 0.5) / SAMPLES_PER_CIRCLE;
                const ang = s * 2.39996323; // golden angle
                const dist = Math.sqrt(frac) * CIRCLE_RADIUS;
                offsets.push([
                    cx + Math.cos(ang) * dist,
                    cy + Math.sin(ang) * dist
                ]);
            }
            sampleOffsets.push(offsets);
        }

        const fontSize = Math.floor(CELL_H * 0.72);
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';

        // Measure actual character width to center it
        const metrics = ctx.measureText('M');
        const charActualW = metrics.width;
        const xOff = Math.max(0, (CELL_W - charActualW) / 2);

        for (let ci = 0; ci < NUM_CHARS; ci++) {
            const code = 32 + ci;
            charCodes[ci] = code;

            if (code === 32) continue; // space = all zeros

            ctx.clearRect(0, 0, CELL_W, CELL_H);
            ctx.fillStyle = '#fff';
            ctx.fillText(String.fromCharCode(code), xOff, 2);

            const imgData = ctx.getImageData(0, 0, CELL_W, CELL_H);
            const px = imgData.data;

            for (let si = 0; si < SHAPE_DIMS; si++) {
                let sum = 0;
                let count = 0;
                const offsets = sampleOffsets[si];

                for (let s = 0; s < offsets.length; s++) {
                    const sx = Math.round(offsets[s][0] * CELL_W);
                    const sy = Math.round(offsets[s][1] * CELL_H);
                    if (sx >= 0 && sx < CELL_W && sy >= 0 && sy < CELL_H) {
                        sum += px[(sy * CELL_W + sx) * 4 + 3] / 255;
                        count++;
                    }
                }

                vectors[ci * SHAPE_DIMS + si] = count > 0 ? sum / count : 0;
            }
        }

        // Normalize each dimension by its max
        const maxPerDim = new Float32Array(SHAPE_DIMS);
        for (let d = 0; d < SHAPE_DIMS; d++) {
            for (let ci = 0; ci < NUM_CHARS; ci++) {
                const v = vectors[ci * SHAPE_DIMS + d];
                if (v > maxPerDim[d]) maxPerDim[d] = v;
            }
            if (maxPerDim[d] > 0.001) {
                for (let ci = 0; ci < NUM_CHARS; ci++) {
                    vectors[ci * SHAPE_DIMS + d] /= maxPerDim[d];
                }
            }
        }

        return { vectors, charCodes, numChars: NUM_CHARS, dims: SHAPE_DIMS, maxPerDim };
    }

    /**
     * Brute-force nearest-neighbor lookup in 6D shape space.
     * Returns the char code of the best matching character.
     */
    function findBestShapeChar(s0, s1, s2, s3, s4, s5, shapeData) {
        const vecs = shapeData.vectors;
        const codes = shapeData.charCodes;
        const n = shapeData.numChars;
        let bestDist = Infinity;
        let bestCode = SPACE_CODE;

        for (let ci = 0; ci < n; ci++) {
            const off = ci * 6;
            const d0 = s0 - vecs[off];
            const d1 = s1 - vecs[off + 1];
            const d2 = s2 - vecs[off + 2];
            const d3 = s3 - vecs[off + 3];
            const d4 = s4 - vecs[off + 4];
            const d5 = s5 - vecs[off + 5];
            const dist = d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3 + d4 * d4 + d5 * d5;
            if (dist < bestDist) {
                bestDist = dist;
                bestCode = codes[ci];
            }
        }
        return bestCode;
    }

    /**
     * Apply global contrast enhancement to a 6-element sampling vector (in-place).
     * Normalizes to [0,1], applies exponent, then denormalizes.
     */
    function applyGlobalContrast(s, exponent) {
        let maxVal = s[0];
        for (let i = 1; i < 6; i++) if (s[i] > maxVal) maxVal = s[i];
        if (maxVal < 0.001) return;

        const inv = 1.0 / maxVal;
        for (let i = 0; i < 6; i++) {
            s[i] = Math.pow(s[i] * inv, exponent) * maxVal;
        }
    }

    /**
     * Build a quantized cache key from a 6D sampling vector.
     * Each component quantized to BITS levels, packed into a single integer.
     */
    const CACHE_BITS = 4;
    const CACHE_RANGE = 1 << CACHE_BITS; // 16
    const shapeLookupCache = new Map();

    function cachedShapeLookup(s0, s1, s2, s3, s4, s5, shapeData) {
        // Quantize to cache key
        const q0 = Math.min(CACHE_RANGE - 1, (s0 * CACHE_RANGE) | 0);
        const q1 = Math.min(CACHE_RANGE - 1, (s1 * CACHE_RANGE) | 0);
        const q2 = Math.min(CACHE_RANGE - 1, (s2 * CACHE_RANGE) | 0);
        const q3 = Math.min(CACHE_RANGE - 1, (s3 * CACHE_RANGE) | 0);
        const q4 = Math.min(CACHE_RANGE - 1, (s4 * CACHE_RANGE) | 0);
        const q5 = Math.min(CACHE_RANGE - 1, (s5 * CACHE_RANGE) | 0);

        const key = (q0 << 20) | (q1 << 16) | (q2 << 12) | (q3 << 8) | (q4 << 4) | q5;

        let code = shapeLookupCache.get(key);
        if (code !== undefined) return code;

        code = findBestShapeChar(s0, s1, s2, s3, s4, s5, shapeData);
        shapeLookupCache.set(key, code);
        return code;
    }

    window.ASCIIUtils = {
        SPACE_CODE,
        EMPTY_DEPTH,
        clamp01,
        createTextSurface,
        createVisibilityController,
        hash01,
        packColor,
        sampleRampCode,
        toCharCodes,
        computeShapeVectors,
        findBestShapeChar,
        cachedShapeLookup,
        applyGlobalContrast,
        SHAPE_DIMS
    };
})();
