/*
 * Sculptor AI - Section text reveals
 *
 * Copy resolves as it scrolls into view. Each section gets a reveal built on
 * a different mechanism rather than a different schedule, so they read as
 * distinct at a glance:
 *
 *   tick     mechanical — an odometer roll through the alphabet, each slot
 *            physically flapping down into place
 *   diffuse  optical — the whole block sits blurred and churning, then
 *            sharpens and snaps all at once
 *   classify semantic — whole words swap between real candidate words until
 *            the classifier settles on one
 *   deliver  kinetic — characters slide in from the right in the car's wake
 *
 * Every slot is measured and pinned to its final width before it animates,
 * and substitutes are width-matched, so a reveal never reflows the copy.
 */

(function () {
    'use strict';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const ROLL_SET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const DENSE_SET = '@#%&$WMB8OQ0';
    const MID_SET = '=+*?!ozcsxvnu';
    const LIGHT_SET = '.,:;-~\'`';
    const MEASURED_SET = ROLL_SET + DENSE_SET + MID_SET + LIGHT_SET;

    const CHAR_CLASSES = [
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        'abcdefghijklmnopqrstuvwxyz',
        '0123456789',
        '.,:;-\'"!?()/@'
    ];

    // Plausible wrong answers for the classifier to cycle through, pooled
    // with the section's own words so most lengths have something to offer.
    const CLASS_LABELS = [
        'spectra', 'spectrum', 'dwarfs', 'brown', 'methane', 'ammonia',
        'photometry', 'luminosity', 'effective', 'gravity', 'synthetic',
        'catalogue', 'infrared', 'parallax', 'magnitude', 'candidate',
        'anomalous', 'metallicity', 'atmosphere', 'temperature', 'radius',
        'redshift', 'emission', 'absorption', 'confidence', 'posterior'
    ];

    // --- Glyph metrics ---------------------------------------------------
    // Canvas measurement only compares glyph widths inside one font; the
    // authoritative slot width still comes from layout.

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
        for (const group of CHAR_CLASSES) {
            if (group.indexOf(target) !== -1) return similarPool(font, target, group);
        }
        return similarPool(font, target, ROLL_SET);
    }

    // Width-matched glyphs from the target's own class, in order, so counting
    // through them reads as an odometer landing rather than a scramble.
    function rollPool(font, target) {
        const pool = sameClassPool(font, target).slice().sort();
        let index = pool.indexOf(target);
        if (index === -1) {
            pool.push(target);
            pool.sort();
            index = pool.indexOf(target);
        }
        return { pool, index };
    }

    function pick(pool) {
        return pool[(Math.random() * pool.length) | 0];
    }

    // --- Slot construction ------------------------------------------------

    const pristine = new WeakMap();

    function buildSlots(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) textNodes.push(node);

        const slots = [];
        const words = [];
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
                const wordEl = document.createElement('span');
                wordEl.className = 'fx-word';
                const wordSlots = [];
                for (const ch of part) {
                    const el = document.createElement('span');
                    el.className = 'fx-char';
                    el.textContent = ch;
                    wordEl.appendChild(el);
                    const slot = { el, target: ch, font, shown: ch, cls: '', done: false, mark: -1 };
                    slots.push(slot);
                    wordSlots.push(slot);
                }
                words.push({ text: part, slots: wordSlots, font });
                frag.appendChild(wordEl);
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

        return { slots, words };
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
        if (slot.moved) {
            slot.el.style.transform = '';
            slot.el.style.opacity = '';
            slot.moved = false;
        }
        slot.done = true;
    }

    function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

    // --- Effects -----------------------------------------------------------
    // Each builder returns a stepper called with elapsed milliseconds; it
    // reports true once every slot has settled.

    // MECHANICAL. Slots stay blank until the wave reaches them, then count up
    // through the alphabet — in order, like an odometer — while each flap
    // physically drops into its frame. Lands on the letter rather than
    // stopping at a random one.
    const FLAP_MS = 105;

    function tickEffect(root, slots, words, opts) {
        const duration = opts.duration || 2000;

        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            slot.start = (i / slots.length) * 0.58 + Math.random() * 0.05;
            slot.rolls = 5 + ((Math.random() * 4) | 0);
            const roll = rollPool(slot.font, slot.target);
            slot.pool = roll.pool;
            slot.landing = roll.index;
            show(slot, ' ', 'fx-pending');
        }

        return function step(elapsed) {
            const u = elapsed / duration;
            let remaining = 0;
            for (const slot of slots) {
                if (slot.done) continue;
                if (u < slot.start) { remaining++; continue; }

                const k = ((elapsed - slot.start * duration) / FLAP_MS) | 0;
                if (k >= slot.rolls) { lock(slot); continue; }
                remaining++;
                if (k === slot.mark) continue;
                slot.mark = k;

                // Count up so the last few flaps approach the answer
                const n = slot.pool.length;
                const at = (((slot.landing - (slot.rolls - k)) % n) + n) % n;
                show(slot, slot.pool[at], 'fx-flap');
            }
            return remaining === 0;
        };
    }

    // OPTICAL. The whole block is present from the first frame but blurred
    // past reading and churning everywhere at once. It sharpens as the noise
    // anneals, and the text snaps in over the last stretch — a denoiser
    // resolving globally, not a wipe crossing the paragraph.
    function diffuseEffect(root, slots, words, opts) {
        const duration = opts.duration || 2400;
        const hold = 0.5;          // fraction spent as pure noise
        const maxBlur = 5.0;

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
        let lastBlur = -1;
        let lastChurn = -1;

        return function step(elapsed) {
            const u = Math.min(1, elapsed / duration);

            // Quantized so the blurred layer only re-rasterizes when it moves
            const blur = Math.round(maxBlur * (1 - u) * (1 - u) * 4) / 4;
            if (blur !== lastBlur) {
                lastBlur = blur;
                root.style.filter = blur > 0.01 ? `blur(${blur}px)` : '';
            }

            if (u > hold) {
                const want = Math.round(slots.length * Math.min(1, (u - hold) / (1 - hold)));
                while (settled < want) lock(slots[order[settled++]]);
            }
            if (settled >= slots.length) {
                root.style.filter = '';
                return true;
            }

            // Every unsettled slot keeps moving, sampling closer to the
            // answer as the schedule anneals
            const churn = (elapsed / 70) | 0;
            if (churn !== lastChurn) {
                lastChurn = churn;
                for (const slot of slots) {
                    if (slot.done || Math.random() > 0.55) continue;
                    const pool = Math.random() < u ? slot.near
                        : (Math.random() < u + 0.4 ? slot.faint : slot.dense);
                    show(slot, pick(pool), 'fx-noise');
                }
            }
            return false;
        };
    }

    // SEMANTIC. Whole words swap between real candidate words of the same
    // length — drawn from the copy itself plus a pool of plausible wrong
    // answers — until the classifier commits. Nothing else on the page
    // shuffles at word granularity.
    function classifyEffect(root, slots, words, opts) {
        const duration = opts.duration || 2200;
        const swap = 135;

        // Bucket every candidate by length so a swap can never change a width
        const byLength = new Map();
        const addCandidate = (text) => {
            const key = text.length;
            if (!byLength.has(key)) byLength.set(key, []);
            byLength.get(key).push(text);
        };
        for (const word of words) addCandidate(word.text);
        for (const label of CLASS_LABELS) addCandidate(label);

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            word.start = (i / words.length) * 0.68;
            word.cycles = 3 + ((Math.random() * 3) | 0);
            word.candidates = (byLength.get(word.text.length) || [])
                .filter(text => text !== word.text);
            if (!word.candidates.length) {
                // Nothing the same length: fabricate one from the same
                // character classes so the word still cycles
                word.candidates = [word.slots.map(s => pick(sameClassPool(s.font, s.target))).join('')];
            }
            for (const slot of word.slots) show(slot, ' ', 'fx-pending');
        }

        return function step(elapsed) {
            const u = elapsed / duration;
            let remaining = 0;
            for (const word of words) {
                if (word.done) continue;
                if (u < word.start) { remaining++; continue; }

                const k = ((elapsed - word.start * duration) / swap) | 0;
                if (k >= word.cycles) {
                    for (const slot of word.slots) lock(slot);
                    word.done = true;
                    continue;
                }
                remaining++;
                if (k === word.mark) continue;
                word.mark = k;

                const guess = word.candidates[k % word.candidates.length];
                for (let c = 0; c < word.slots.length; c++) {
                    show(word.slots[c], guess[c] || ' ', 'fx-candidate');
                }
            }
            return remaining === 0;
        };
    }

    // KINETIC. Characters are carried in from the right and set down in the
    // order the car passes them. The signature is horizontal motion — nothing
    // else on the page travels.
    function deliverEffect(root, slots, words, opts) {
        const duration = opts.duration || 2000;
        const flight = 0.22;
        const travel = 34;

        const order = slots.map((_, i) => i).sort((a, b) => slots[b].x - slots[a].x);
        for (let rank = 0; rank < order.length; rank++) {
            const slot = slots[order[rank]];
            slot.start = (rank / order.length) * 0.74;
            slot.near = sameClassPool(slot.font, slot.target);
            show(slot, pick(slot.near), 'fx-pending');
        }

        return function step(elapsed) {
            const u = elapsed / duration;
            let remaining = 0;
            for (const slot of slots) {
                if (slot.done) continue;
                const p = (u - slot.start) / flight;
                if (p >= 1) { lock(slot); continue; }
                remaining++;
                if (p <= 0) continue;

                const eased = easeOutCubic(p);
                slot.el.style.transform = `translateX(${((1 - eased) * travel).toFixed(2)}px)`;
                slot.el.style.opacity = (0.1 + 0.9 * eased).toFixed(2);
                slot.moved = true;

                // Settles onto the right character just before it lands
                const k = (elapsed / 60) | 0;
                if (k !== slot.mark) {
                    slot.mark = k;
                    show(slot, p > 0.55 ? slot.target : pick(slot.near), 'fx-flight');
                }
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

    // --- Runner -------------------------------------------------------------

    const running = new Map();
    let looping = false;

    function restore(el) {
        el.style.filter = '';
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

        const built = buildSlots(el);
        if (!built.slots.length) { restore(el); return; }

        const build = EFFECTS[name] || EFFECTS.tick;
        running.set(el, {
            step: build(el, built.slots, built.words, opts || {}),
            startedAt: performance.now()
        });

        if (!looping) {
            looping = true;
            requestAnimationFrame(frame);
        }
    }

    // --- Triggers -------------------------------------------------------------
    // Sections replay whenever they come back around, so a reveal always
    // accompanies the shape morphing in beside it.

    const CAR_SECTION = 'av-research';
    let carPending = null;

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

    document.querySelectorAll('.scroll-section[data-fx]').forEach(s => observer.observe(s));

    window.TextFX = { play, stop, effects: Object.keys(EFFECTS) };

    window.addEventListener('sculptor:car-arriving', (event) => {
        clearTimeout(carPending);
        carPending = null;
        const duration = (event.detail && event.detail.duration) || 1900;
        play(document.getElementById(CAR_SECTION), 'deliver', { duration: duration + 400 });
    });
})();
