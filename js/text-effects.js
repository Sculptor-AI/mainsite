/*
 * Sculptor AI - Section text reveals
 *
 * Copy resolves a character at a time. The default is an Aperture-style
 * split-flap tick; project sections override it with a reveal that echoes
 * what the project does — denoising steps for the diffusion model, a
 * classifier settling on its argmax for the brown dwarfs, and a wipe that
 * follows the car in as it pulls up.
 *
 * Every slot is measured before it animates and pinned to its final width,
 * and substitute glyphs are drawn from a width-matched pool, so a reveal
 * never reflows the copy underneath it.
 */

(function () {
    'use strict';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const TICK_SET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const DENSE_SET = '@#%&$WMB8OQ0';
    const MID_SET = '=+*?!ozcsxvnu';
    const LIGHT_SET = '.,:;-~\'`';
    const MEASURED_SET = TICK_SET + DENSE_SET + MID_SET + LIGHT_SET;

    const CLASSES = [
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        'abcdefghijklmnopqrstuvwxyz',
        '0123456789',
        '.,:;-\'"!?()/@'
    ];

    // --- Glyph metrics -------------------------------------------------
    // Canvas measurement is only used to compare glyph widths inside one
    // font; the authoritative slot width still comes from layout.

    let measureCtx = null;
    const widthTables = new Map();

    function widthTable(font) {
        let table = widthTables.get(font);
        if (!table) {
            if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
            measureCtx.font = font;
            table = new Map();
            for (const ch of MEASURED_SET) table.set(ch, measureCtx.measureText(ch).width);
            widthTables.set(font, table);
        }
        return table;
    }

    function glyphWidth(font, ch) {
        const table = widthTable(font);
        if (!table.has(ch)) {
            measureCtx.font = font;
            table.set(ch, measureCtx.measureText(ch).width);
        }
        return table.get(ch);
    }

    function similarPool(font, target, set) {
        const table = widthTable(font);
        const want = glyphWidth(font, target);
        const tolerance = Math.max(1.2, want * 0.22);
        const pool = [];
        for (const ch of set) {
            if (Math.abs(table.get(ch) - want) <= tolerance) pool.push(ch);
        }
        return pool.length ? pool : set.split('');
    }

    function sameClassPool(font, target) {
        for (const group of CLASSES) {
            if (group.indexOf(target) !== -1) return similarPool(font, target, group);
        }
        return similarPool(font, target, TICK_SET);
    }

    function pick(pool) {
        return pool[(Math.random() * pool.length) | 0];
    }

    // --- Slot construction ---------------------------------------------

    const pristine = new WeakMap();

    function buildSlots(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node);

        const slots = [];
        const fonts = new Map();

        for (const node of textNodes) {
            const text = node.nodeValue;
            if (!text.trim()) continue;

            const owner = node.parentElement;
            let font = fonts.get(owner);
            if (!font) {
                const cs = getComputedStyle(owner);
                font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
                fonts.set(owner, font);
            }

            // Split on whitespace so line breaking still only happens between
            // words — each word becomes one unbreakable inline-block.
            const frag = document.createDocumentFragment();
            for (const part of text.split(/(\s+)/)) {
                if (!part) continue;
                if (!part.trim()) {
                    frag.appendChild(document.createTextNode(part));
                    continue;
                }
                const word = document.createElement('span');
                word.className = 'fx-word';
                for (const ch of part) {
                    const el = document.createElement('span');
                    el.className = 'fx-char';
                    el.textContent = ch;
                    word.appendChild(el);
                    slots.push({ el, target: ch, font, shown: ch, done: false, mark: -1 });
                }
                frag.appendChild(word);
            }
            node.parentNode.replaceChild(frag, node);
        }

        // Read every slot before writing any back, so pinning the widths
        // costs one layout pass rather than one per character.
        for (const slot of slots) {
            const rect = slot.el.getBoundingClientRect();
            slot.w = rect.width;
            slot.x = rect.left;
        }
        for (const slot of slots) slot.el.style.width = slot.w.toFixed(2) + 'px';

        return slots;
    }

    function show(slot, ch, className) {
        if (slot.shown !== ch) {
            slot.el.textContent = ch;
            slot.shown = ch;
        }
        if (slot.cls !== className) {
            slot.el.className = className ? 'fx-char ' + className : 'fx-char';
            slot.cls = className;
        }
    }

    function lock(slot) {
        show(slot, slot.target, '');
        slot.done = true;
    }

    // --- Effects ---------------------------------------------------------
    // Each returns a stepper called with elapsed milliseconds; it reports
    // true once every slot has settled.

    function easeInOutCubic(x) {
        return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    }

    // Split-flap board: slots stay blank until the wave reaches them, then
    // roll through glyphs and land on the letter.
    function tickEffect(slots, opts) {
        const duration = opts.duration || 1500;
        const flip = 55;

        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            slot.start = (i / slots.length) * 0.62 + Math.random() * 0.06;
            slot.span = 0.13 + Math.random() * 0.1;
            slot.pool = similarPool(slot.font, slot.target, TICK_SET);
            show(slot, ' ', 'fx-pending');
        }

        return function step(elapsed) {
            const u = elapsed / duration;
            let remaining = 0;
            for (const slot of slots) {
                if (slot.done) continue;
                if (u < slot.start) { remaining++; continue; }
                if (u >= slot.start + slot.span) { lock(slot); continue; }
                remaining++;
                const k = ((u - slot.start) * duration / flip) | 0;
                if (k !== slot.mark) {
                    slot.mark = k;
                    show(slot, pick(slot.pool), 'fx-tick');
                }
            }
            return remaining === 0;
        };
    }

    // Denoising schedule: the whole block starts as noise and slots lock in
    // random order, a few more each step, while the noise anneals from dense
    // glyphs down to faint ones.
    function diffuseEffect(slots, opts) {
        const duration = opts.duration || 1900;
        const steps = 15;
        const order = slots.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            const t = order[i]; order[i] = order[j]; order[j] = t;
        }

        for (const slot of slots) {
            slot.dense = similarPool(slot.font, slot.target, DENSE_SET + MID_SET);
            slot.faint = similarPool(slot.font, slot.target, MID_SET + LIGHT_SET);
            slot.near = sameClassPool(slot.font, slot.target);
            show(slot, pick(slot.dense), 'fx-noise');
        }

        let settled = 0;
        let lastStep = -1;

        return function step(elapsed) {
            const k = Math.min(steps, (elapsed / (duration / steps)) | 0);
            if (k === lastStep) return settled >= slots.length;
            lastStep = k;

            const want = Math.round(slots.length * easeInOutCubic(k / steps));
            while (settled < want) lock(slots[order[settled++]]);
            if (settled >= slots.length) return true;

            // Late steps sample closer to the answer, the way a denoiser does
            const anneal = k / steps;
            for (const slot of slots) {
                if (slot.done || Math.random() > 0.62) continue;
                const pool = Math.random() < anneal ? slot.near
                    : (Math.random() < anneal + 0.35 ? slot.faint : slot.dense);
                show(slot, pick(pool), 'fx-noise');
            }
            return false;
        };
    }

    // A scan head sweeps the block: unread slots sit dim, slots under the
    // head flicker between candidate classes, and each one locks on the
    // winner as the head moves past.
    function classifyEffect(slots, opts) {
        const duration = opts.duration || 1800;
        const window_ = 0.26;
        const flicker = 48;

        for (const slot of slots) {
            slot.near = sameClassPool(slot.font, slot.target);
            slot.faint = similarPool(slot.font, slot.target, LIGHT_SET + MID_SET);
            show(slot, pick(slot.faint), 'fx-noise');
        }

        return function step(elapsed) {
            const head = (elapsed / duration) * (1 + window_);
            let remaining = 0;
            for (let i = 0; i < slots.length; i++) {
                const slot = slots[i];
                if (slot.done) continue;
                const p = i / slots.length;
                if (p > head) {
                    remaining++;
                    if ((elapsed / 140 | 0) !== slot.mark) {
                        slot.mark = elapsed / 140 | 0;
                        show(slot, pick(slot.faint), 'fx-noise');
                    }
                    continue;
                }
                if (p <= head - window_) { lock(slot); continue; }
                remaining++;
                const k = (elapsed / flicker) | 0;
                if (k !== slot.mark) {
                    slot.mark = k;
                    // Confidence climbs as the head passes over the slot
                    const conf = (head - p) / window_;
                    show(slot, Math.random() < conf * conf ? slot.target : pick(slot.near), 'fx-scan');
                }
            }
            return remaining === 0;
        };
    }

    // Right-to-left wipe: slots settle in the order the car passes them, so
    // the copy looks dropped off in its wake.
    function deliverEffect(slots, opts) {
        const duration = opts.duration || 1900;
        const order = slots.map((_, i) => i).sort((a, b) => slots[b].x - slots[a].x);

        for (let rank = 0; rank < order.length; rank++) {
            const slot = slots[order[rank]];
            slot.start = (rank / order.length) * 0.78;
            slot.dense = similarPool(slot.font, slot.target, DENSE_SET + MID_SET);
            slot.near = sameClassPool(slot.font, slot.target);
            show(slot, pick(slot.dense), 'fx-noise');
        }

        return function step(elapsed) {
            const u = elapsed / duration;
            let remaining = 0;
            for (const slot of slots) {
                if (slot.done) continue;
                if (u >= slot.start + 0.14) { lock(slot); continue; }
                remaining++;
                const k = (elapsed / 62) | 0;
                if (k === slot.mark || Math.random() > 0.7) continue;
                slot.mark = k;
                // Slots just behind the wavefront are already close to right
                const settle = u > slot.start;
                show(slot, pick(settle ? slot.near : slot.dense), settle ? 'fx-scan' : 'fx-noise');
            }
            return remaining === 0;
        };
    }

    const EFFECTS = {
        tick: tickEffect,
        diffuse: diffuseEffect,
        classify: classifyEffect,
        deliver: deliverEffect
    };

    // --- Runner -----------------------------------------------------------

    const running = new Map();
    let looping = false;

    function restore(el) {
        const html = pristine.get(el);
        if (html !== undefined) el.innerHTML = html;
    }

    function stop(el) {
        if (!running.has(el)) return;
        running.delete(el);
        restore(el);
    }

    function frame(now) {
        for (const [el, inst] of running) {
            if (inst.step(now - inst.startedAt)) {
                running.delete(el);
                restore(el);
            }
        }
        if (running.size) {
            requestAnimationFrame(frame);
        } else {
            looping = false;
        }
    }

    function play(el, name, opts) {
        if (!el) return;
        stop(el);
        if (reduceMotion.matches) return;

        if (!pristine.has(el)) pristine.set(el, el.innerHTML);
        else el.innerHTML = pristine.get(el);

        const slots = buildSlots(el);
        if (!slots.length) { restore(el); return; }

        const build = EFFECTS[name] || EFFECTS.tick;
        running.set(el, { step: build(slots, opts || {}), startedAt: performance.now() });

        if (!looping) {
            looping = true;
            requestAnimationFrame(frame);
        }
    }

    // --- Triggers ---------------------------------------------------------
    // Sections replay whenever they come back around, so a reveal always
    // accompanies the shape morphing in beside it.

    const CAR_SECTION = 'av-research';
    let carPending = null;

    const sections = document.querySelectorAll('.scroll-section[data-fx]');

    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const el = entry.target;
            if (!entry.isIntersecting) {
                stop(el);
                if (el.id === CAR_SECTION) {
                    clearTimeout(carPending);
                    carPending = null;
                }
                continue;
            }

            if (el.id === CAR_SECTION) {
                // The car dispatches its own cue; this only covers layouts
                // where the diorama never renders, such as mobile portrait.
                clearTimeout(carPending);
                carPending = setTimeout(() => {
                    carPending = null;
                    play(el, 'deliver');
                }, 700);
                continue;
            }

            play(el, el.dataset.fx);
        }
    }, { threshold: 0.2 });

    sections.forEach(section => observer.observe(section));

    window.TextFX = { play, stop, effects: Object.keys(EFFECTS) };

    window.addEventListener('sculptor:car-arriving', (event) => {
        clearTimeout(carPending);
        carPending = null;
        const el = document.getElementById(CAR_SECTION);
        const duration = (event.detail && event.detail.duration) || 1900;
        play(el, 'deliver', { duration: duration + 250 });
    });
})();
