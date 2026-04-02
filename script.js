/* ============================================
   MOODIFY — CORE APPLICATION LOGIC
   Vanilla JS · Web Audio API · CSS 3D Orb
   ============================================ */

(function () {
    'use strict';

    // ─────────────────────────────────────────
    // 1. MOOD CONFIGURATION
    // ─────────────────────────────────────────
    const MOOD_DATA = {
        energetic: { hex: '#ffc4d9', rgb: '255, 196, 217', song: 'energetic.mp3', title: 'Energetic Waves' },
        happy:     { hex: '#ffd6a5', rgb: '255, 214, 165', song: 'happy.mp3',     title: 'Sunny Vibes' },
        focus:     { hex: '#98f5e1', rgb: '152, 245, 225', song: 'focus.mp3',     title: 'Deep Focus' },
        chill:     { hex: '#b39cd0', rgb: '179, 156, 208', song: 'chill.mp3',     title: 'Lavender Drift' },
        sad:       { hex: '#a0c4ff', rgb: '160, 196, 255', song: 'sad.mp3',       title: 'Rainy Blues' },
    };

    let currentMood = 'energetic';
    let isPlaying   = false;
    let isExpanded  = false;

    // ─────────────────────────────────────────
    // 2. DOM REFERENCES
    // ─────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        // Audio
        audioPlayer:    $('#audio-player'),
        // Orb
        orbScene:       $('#orb-scene'),
        orbWrapper:     $('#orb-wrapper'),
        orbCore:        $('#orb-core'),
        orbGlowOuter:   $('#orb-glow-outer'),
        orbGlowMid:     $('#orb-glow-mid'),
        orbRipple:      $('#orb-ripple'),
        satellitesCont: $('#satellites-container'),
        // Sidebar
        moodBtns:       $$('.mood-btn'),
        aiStatus:       $('#ai-status'),
        hint:           $('#center-hint'),
        // Player
        playPauseBtn:   $('#play-pause-btn'),
        playIcon:       $('#play-icon'),
        pauseIcon:      $('#pause-icon'),
        prevBtn:        $('#prev-btn'),
        nextBtn:        $('#next-btn'),
        trackTitle:     $('#track-title'),
        albumArt:       $('#album-art'),
        albumContainer: $('#album-art-container'),
        recordLabel:    $('#record-label'),
        waveformCont:   $('#waveform-container'),
        waveformBars:   $$('.waveform-bar'),
        progressBar:    $('#progress-bar'),
        progressFill:   $('#progress-fill'),
        progressGlow:   $('#progress-glow'),
        timeCurrent:    $('#time-current'),
        timeTotal:      $('#time-total'),
        // Background
        bgParticles:    $('#bg-particles'),
    };

    // ─────────────────────────────────────────
    // 3. BACKGROUND PARTICLES (CSS-only)
    // ─────────────────────────────────────────
    function spawnParticles(count) {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.className = 'bg-particle';
            p.style.left              = `${Math.random() * 100}%`;
            p.style.top               = `${Math.random() * 100 + 100}%`;
            p.style.width             = `${1 + Math.random() * 3}px`;
            p.style.height            = p.style.width;
            p.style.animationDuration = `${12 + Math.random() * 20}s`;
            p.style.animationDelay    = `${Math.random() * 15}s`;
            frag.appendChild(p);
        }
        dom.bgParticles.appendChild(frag);
    }
    spawnParticles(80);

    // ─────────────────────────────────────────
    // 4. SATELLITE GENERATION
    // ─────────────────────────────────────────
    const NUM_SATELLITES = 12;
    const satellites = [];

    function createSatellites() {
        for (let i = 0; i < NUM_SATELLITES; i++) {
            const phi   = Math.acos(-1 + (2 * i) / NUM_SATELLITES);
            const theta = Math.sqrt(NUM_SATELLITES * Math.PI) * phi;
            const r = 160; // px radius from center

            const x = r * Math.cos(theta) * Math.sin(phi);
            const y = r * Math.sin(theta) * Math.sin(phi);
            const z = r * Math.cos(phi);

            const el = document.createElement('div');
            el.className = 'satellite';
            dom.satellitesCont.appendChild(el);

            satellites.push({ el, x, y, z });
        }
    }
    createSatellites();

    // ─────────────────────────────────────────
    // 5. ORB INTERACTION (Expand / Collapse)
    // ─────────────────────────────────────────
    dom.orbWrapper.addEventListener('click', toggleExpansion);

    function toggleExpansion() {
        isExpanded = !isExpanded;

        if (isExpanded) {
            if (dom.hint) dom.hint.style.opacity = '0';

            // Collapse core
            dom.orbCore.classList.add('collapsed');

            // Expand satellites outward
            satellites.forEach((sat, i) => {
                setTimeout(() => {
                    sat.el.style.transform = `translate(-50%, -50%) translate3d(${sat.x}px, ${sat.y}px, ${sat.z}px) scale(1)`;
                    sat.el.classList.add('expanded');
                }, i * 30);
            });
        } else {
            if (dom.hint) dom.hint.style.opacity = '1';

            // Restore core
            dom.orbCore.classList.remove('collapsed');

            // Collapse satellites inward
            satellites.forEach((sat, i) => {
                setTimeout(() => {
                    sat.el.style.transform = `translate(-50%, -50%) translate3d(0px, 0px, 0px) scale(0)`;
                    sat.el.classList.remove('expanded');
                }, i * 20);
            });
        }
    }

    // ─────────────────────────────────────────
    // 6. MOUSE TRACKING (CSS 3D Rotation)
    // ─────────────────────────────────────────
    let mouseTarget  = { rx: 0, ry: 0 };
    let mouseCurrent = { rx: 0, ry: 0 };

    document.addEventListener('mousemove', (e) => {
        const nx = (e.clientX / window.innerWidth)  * 2 - 1;
        const ny = (e.clientY / window.innerHeight) * 2 - 1;
        mouseTarget.ry =  nx * 25;
        mouseTarget.rx = -ny * 15;
    });

    // ─────────────────────────────────────────
    // 7. WEB AUDIO API
    // ─────────────────────────────────────────
    let audioCtx    = null;
    let analyser    = null;
    let dataArray   = null;
    let source      = null;
    let isAudioInit = false;

    function initAudio() {
        if (isAudioInit) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;

        source = audioCtx.createMediaElementSource(dom.audioPlayer);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);

        dataArray = new Uint8Array(analyser.frequencyBinCount);
        isAudioInit = true;
    }

    // Robust play helper — loads source then plays when ready
    function loadAndPlay() {
        dom.audioPlayer.load();
        dom.audioPlayer.removeEventListener('canplaythrough', onCanPlay);
        dom.audioPlayer.addEventListener('canplaythrough', onCanPlay, { once: true });
    }

    function onCanPlay() {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        dom.audioPlayer.play().catch(e => console.warn('Play blocked:', e));
    }

    // Debug listeners
    dom.audioPlayer.addEventListener('error', (e) => {
        console.error('Audio error:', dom.audioPlayer.error);
    });

    function getBassIntensity() {
        if (!isAudioInit || !isPlaying) return 0;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < 4; i++) sum += dataArray[i];
        return (sum / 4) / 255;
    }

    // ─────────────────────────────────────────
    // 8. ANIMATION LOOP (requestAnimationFrame)
    // ─────────────────────────────────────────
    let currentOrbScale    = 1;
    let currentGlowOpacity = 0.2;
    let satRotation        = 0;

    function lerp(a, b, t) { return a + (b - a) * t; }

    function animationLoop(time) {
        requestAnimationFrame(animationLoop);

        // --- Smooth mouse-tracked rotation ---
        mouseCurrent.rx = lerp(mouseCurrent.rx, mouseTarget.rx, 0.06);
        mouseCurrent.ry = lerp(mouseCurrent.ry, mouseTarget.ry, 0.06);

        // Floating bob (antigravity feel)
        const orbFloatOffset = Math.sin(time * 0.001) * 18;

        // --- Beat-reactive scaling ---
        const bass = getBassIntensity();
        const targetScale = 1 + bass * bass * 0.45;
        currentOrbScale = lerp(currentOrbScale, targetScale, 0.4);

        // --- Glow intensity ---
        const targetGlow = 0.15 + bass * 0.7;
        currentGlowOpacity = lerp(currentGlowOpacity, targetGlow, 0.35);

        // --- Apply main wrapper transform ---
        dom.orbWrapper.style.transform = `translateY(${orbFloatOffset}px) rotateX(${mouseCurrent.rx}deg) rotateY(${mouseCurrent.ry}deg)`;

        // Core pulse (only when not expanded)
        if (!isExpanded) {
            dom.orbCore.style.transform = `translate(-50%, -50%) scale(${currentOrbScale})`;
        }

        // Glow pulse
        const glowScale = 1 + bass * 0.3;
        dom.orbGlowMid.style.opacity   = currentGlowOpacity + 0.1;
        dom.orbGlowMid.style.transform = `translate(-50%, -50%) scale(${glowScale})`;
        dom.orbGlowOuter.style.opacity = currentGlowOpacity;
        dom.orbGlowOuter.style.transform = `translate(-50%, -50%) scale(${1 + bass * 0.15})`;

        // Dynamic box-shadow intensity on core
        const shadowSpread  = 60 + bass * 80;
        const shadowOpacity = 0.4 + bass * 0.4;
        dom.orbCore.style.boxShadow = `
            inset 0 -10px 30px rgba(0, 0, 0, 0.15),
            inset 0 10px 20px rgba(255, 255, 255, 0.12),
            0 0 ${shadowSpread}px rgba(var(--mood-color-rgb), ${shadowOpacity}),
            0 0 ${shadowSpread * 2}px rgba(var(--mood-color-rgb), ${shadowOpacity * 0.35})
        `;

        // Ripple on strong beats
        if (bass > 0.7) triggerRipple();

        // Satellite rotation when expanded
        if (isExpanded) {
            satRotation += 0.15 + bass * 0.3;
            dom.satellitesCont.style.transform = `rotateY(${satRotation}deg) rotateZ(${Math.sin(time * 0.0003) * 8}deg)`;

            // Pulse satellites to the beat
            const satScale = 1 + bass * bass * 0.4;
            satellites.forEach(sat => {
                if (sat.el.classList.contains('expanded')) {
                    sat.el.style.transform = `translate(-50%, -50%) translate3d(${sat.x}px, ${sat.y}px, ${sat.z}px) scale(${satScale})`;
                }
            });
        }
    }

    let rippleCooldown = false;
    function triggerRipple() {
        if (rippleCooldown) return;
        rippleCooldown = true;
        dom.orbRipple.classList.remove('active');
        void dom.orbRipple.offsetWidth; // force reflow
        dom.orbRipple.classList.add('active');
        setTimeout(() => { rippleCooldown = false; }, 400);
    }

    requestAnimationFrame(animationLoop);

    // ─────────────────────────────────────────
    // 9. PLAY / PAUSE
    // ─────────────────────────────────────────
    function setPlayingUI(playing) {
        isPlaying = playing;
        dom.playIcon.style.display  = playing ? 'none'  : 'block';
        dom.pauseIcon.style.display = playing ? 'block' : 'none';
        dom.albumArt.classList.toggle('playing', playing);
        dom.waveformCont.classList.toggle('playing', playing);
    }

    function togglePlay() {
        initAudio();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

        if (isPlaying) {
            dom.audioPlayer.pause();
            setPlayingUI(false);
            dom.aiStatus.textContent = `Paused — ${capitalize(currentMood)} Energy`;
        } else {
            // If no source loaded yet, load the default mood
            if (!dom.audioPlayer.src || dom.audioPlayer.readyState < 2) {
                dom.audioPlayer.src = `songs/${MOOD_DATA[currentMood].song}`;
                loadAndPlay();
            } else {
                dom.audioPlayer.play().catch(e => console.warn('Play blocked:', e));
            }
            setPlayingUI(true);
            dom.aiStatus.textContent = `Vibing to ${capitalize(currentMood)} Energy`;
        }
    }

    dom.playPauseBtn.addEventListener('click', togglePlay);

    // ─────────────────────────────────────────
    // 10. PROGRESS BAR
    // ─────────────────────────────────────────
    dom.audioPlayer.addEventListener('timeupdate', () => {
        const ratio = dom.audioPlayer.currentTime / dom.audioPlayer.duration;
        if (isNaN(ratio)) return;
        dom.progressFill.style.width = `${ratio * 100}%`;
        dom.progressGlow.style.width = `${ratio * 100}%`;
        dom.timeCurrent.textContent  = formatTime(dom.audioPlayer.currentTime);
    });

    dom.audioPlayer.addEventListener('loadedmetadata', () => {
        dom.timeTotal.textContent = formatTime(dom.audioPlayer.duration);
    });

    dom.progressBar.addEventListener('click', (e) => {
        if (!dom.audioPlayer.duration) return;
        const rect  = dom.progressBar.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        dom.audioPlayer.currentTime = ratio * dom.audioPlayer.duration;
    });

    // ─────────────────────────────────────────
    // 11. MOOD SWITCHING
    // ─────────────────────────────────────────
    function setMood(moodKey) {
        currentMood = moodKey;
        const cfg = MOOD_DATA[moodKey];

        initAudio();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

        // Update active button
        dom.moodBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mood === moodKey);
        });

        // Update CSS custom properties → drives all orb/glow colors automatically
        document.documentElement.style.setProperty('--mood-color',     cfg.hex);
        document.documentElement.style.setProperty('--mood-color-rgb', cfg.rgb);

        // Update player panel colors
        dom.recordLabel.style.background    = cfg.hex;
        dom.progressFill.style.background   = `linear-gradient(90deg, #a0c4ff, ${cfg.hex})`;
        dom.progressGlow.style.background   = `linear-gradient(90deg, transparent, ${cfg.hex})`;
        dom.albumContainer.style.background = `linear-gradient(45deg, ${cfg.hex}, #a0c4ff)`;
        dom.albumContainer.style.boxShadow  = `0 15px 40px ${cfg.hex}50`;
        dom.aiStatus.style.color            = cfg.hex;

        dom.waveformBars.forEach(bar => { bar.style.background = cfg.hex; });

        // Update track info
        dom.trackTitle.textContent = cfg.title;

        // Switch audio source, load, then play when ready
        dom.audioPlayer.src = `songs/${cfg.song}`;
        loadAndPlay();

        setPlayingUI(true);
        dom.aiStatus.textContent = `Vibing to ${capitalize(moodKey)} Energy`;
    }

    dom.moodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.mood;
            if (MOOD_DATA[key]) setMood(key);
        });
    });

    // ─────────────────────────────────────────
    // 12. PREV / NEXT (cycle through moods)
    // ─────────────────────────────────────────
    const moodKeys = Object.keys(MOOD_DATA);

    dom.prevBtn.addEventListener('click', () => {
        let idx = moodKeys.indexOf(currentMood) - 1;
        if (idx < 0) idx = moodKeys.length - 1;
        setMood(moodKeys[idx]);
    });

    dom.nextBtn.addEventListener('click', () => {
        let idx = moodKeys.indexOf(currentMood) + 1;
        if (idx >= moodKeys.length) idx = 0;
        setMood(moodKeys[idx]);
    });

    // Auto-advance on track end
    dom.audioPlayer.addEventListener('ended', () => {
        let idx = moodKeys.indexOf(currentMood) + 1;
        if (idx >= moodKeys.length) idx = 0;
        setMood(moodKeys[idx]);
    });

    // ─────────────────────────────────────────
    // 13. UTILITIES
    // ─────────────────────────────────────────
    function formatTime(sec) {
        if (isNaN(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

})();
