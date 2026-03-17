/*
 * Shared ASCII rendering helpers.
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

    window.ASCIIUtils = {
        SPACE_CODE,
        clamp01,
        createTextSurface,
        createVisibilityController,
        hash01,
        packColor,
        sampleRampCode,
        toCharCodes
    };
})();
