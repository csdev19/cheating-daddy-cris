import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { markdownStyles, markdownNode } from './markdown.js';

const SPEAKER_LABELS = { them: 'Them', me: 'Me' };

export class AssistantView extends LitElement {
    static styles = [
        markdownStyles,
        css`
        :host {
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        * {
            font-family: var(--font);
            cursor: default;
        }

        /* ── Hilo ── */

        .thread {
            flex: 1;
            overflow-y: auto;
            background: var(--bg-app);
            padding: var(--space-md);
            scroll-behavior: smooth;
            user-select: text;
            cursor: text;
            color: var(--text-primary);
            font-size: var(--response-font-size, 15px);
            line-height: var(--line-height);
            display: flex;
            flex-direction: column;
            gap: var(--space-md);
        }

        .thread * {
            user-select: text;
            cursor: text;
        }

        .thread a {
            cursor: pointer;
        }

        .thread::-webkit-scrollbar {
            width: 6px;
        }

        .thread::-webkit-scrollbar-track {
            background: transparent;
        }

        .thread::-webkit-scrollbar-thumb {
            background: var(--border-strong);
            border-radius: 3px;
        }

        .thread::-webkit-scrollbar-thumb:hover {
            background: #444444;
        }

        .empty {
            margin: auto;
            color: var(--text-muted);
            font-size: var(--font-size-sm);
            text-align: center;
            max-width: 44ch;
            line-height: 1.5;
        }

        .empty-title {
            font-family: var(--font-mono);
            font-size: var(--font-size-xs);
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--accent);
            margin-bottom: var(--space-sm);
        }

        .empty-hint {
            margin-top: var(--space-sm);
            opacity: 0.6;
        }

        /* ── Etiqueta de hablante ── */

        .who {
            display: flex;
            align-items: baseline;
            gap: var(--space-sm);
            margin-bottom: 2px;
            font-family: var(--font-mono);
            font-size: var(--font-size-xs);
            letter-spacing: 0.06em;
            text-transform: uppercase;
        }

        .who .clock {
            color: var(--text-muted);
            letter-spacing: 0;
        }

        .row-them .who .name {
            color: var(--text-secondary);
        }

        .row-me .who .name {
            color: var(--accent);
        }

        .row-ask .who .name {
            color: var(--accent);
        }

        .said {
            white-space: pre-wrap;
        }

        /* Channel marker: whose turn it is reads at a glance, without the label. */
        .row-speech {
            border-left: 2px solid transparent;
            padding-left: var(--space-md);
        }

        .row-them {
            border-left-color: var(--border-strong);
        }

        .row-me {
            border-left-color: var(--accent);
        }

        /* ── Echoed turn ── */

        .row-echo {
            border-left: 2px solid transparent;
            padding-left: var(--space-md);
        }

        .echo-toggle {
            display: flex;
            align-items: center;
            gap: 6px;
            background: none;
            border: none;
            padding: 0;
            cursor: pointer;
            font-family: var(--font-mono);
            font-size: var(--font-size-xs);
            letter-spacing: 0.04em;
            color: var(--text-muted);
            opacity: 0.65;
            transition: opacity var(--transition);
        }

        .echo-toggle:hover {
            opacity: 1;
        }

        .echo-caret {
            display: inline-block;
            transition: transform var(--transition);
        }

        .echo-caret.open {
            transform: rotate(90deg);
        }

        .echo-text {
            margin-top: 4px;
            color: var(--text-muted);
            opacity: 0.65;
            font-size: var(--font-size-sm);
        }

        /* ── Pregunta al asistente y su respuesta ── */

        .ask-question {
            border-left: 2px solid var(--accent);
            padding-left: var(--space-md);
        }

        .answer {
            margin-top: var(--space-sm);
            background: var(--bg-surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            padding: var(--space-md);
        }

        .answer-tag {
            display: flex;
            align-items: center;
            gap: 5px;
            margin-bottom: var(--space-sm);
            font-family: var(--font-mono);
            font-size: var(--font-size-xs);
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: var(--accent);
        }

        .answer-tag svg {
            width: 11px;
            height: 11px;
        }

        .thinking {
            display: inline-block;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--accent);
            animation: pulse 1.2s ease-in-out infinite;
        }

        @keyframes pulse {
            0%,
            100% {
                opacity: 0.25;
            }
            50% {
                opacity: 1;
            }
        }

        .failed {
            color: var(--danger);
            font-size: var(--font-size-sm);
        }

        /* ── Captura de pantalla ── */

        .shot {
            margin-top: var(--space-sm);
            display: block;
            max-width: 260px;
            width: 100%;
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            cursor: pointer;
        }

        .shot.zoomed {
            max-width: 100%;
        }

        .row-screen .caption {
            color: var(--text-muted);
            font-size: var(--font-size-xs);
            font-family: var(--font-mono);
        }

        /* ── Checklist y avisos ── */

        .chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 100px;
            padding: 2px var(--space-sm);
            font-size: var(--font-size-xs);
            font-family: var(--font-mono);
            color: var(--text-secondary);
        }

        .notice {
            border-left: 2px solid var(--danger);
            padding-left: var(--space-md);
            color: var(--danger);
            font-size: var(--font-size-sm);
        }

        /* ── Barra inferior ── */

        .input-bar {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-md);
            background: var(--bg-app);
            border-top: 1px solid var(--border);
        }

        .input-bar-inner {
            display: flex;
            align-items: center;
            flex: 1;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: 100px;
            padding: 0 var(--space-md);
            height: 32px;
            transition: border-color var(--transition);
        }

        .input-bar-inner:focus-within {
            border-color: var(--accent);
        }

        .input-bar-inner input {
            flex: 1;
            background: none;
            color: var(--text-primary);
            border: none;
            padding: 0;
            font-size: var(--font-size-sm);
            font-family: var(--font);
            height: 100%;
            outline: none;
        }

        .input-bar-inner input::placeholder {
            color: var(--text-muted);
        }

        .analyze-btn {
            position: relative;
            background: var(--bg-elevated);
            border: 1px solid var(--border);
            color: var(--text-primary);
            cursor: pointer;
            font-size: var(--font-size-xs);
            font-family: var(--font-mono);
            white-space: nowrap;
            padding: var(--space-xs) var(--space-md);
            border-radius: 100px;
            height: 32px;
            display: flex;
            align-items: center;
            gap: 4px;
            transition:
                border-color 0.4s ease,
                background var(--transition);
            flex-shrink: 0;
            overflow: hidden;
        }

        .analyze-btn:hover:not(.analyzing) {
            border-color: var(--accent);
            background: var(--bg-surface);
        }

        .analyze-btn.analyzing {
            cursor: default;
            border-color: transparent;
        }

        .analyze-btn-content {
            display: flex;
            align-items: center;
            gap: 4px;
            transition: opacity 0.4s ease;
            z-index: 1;
            position: relative;
        }

        .analyze-btn.analyzing .analyze-btn-content {
            opacity: 0;
        }

        .analyze-canvas {
            position: absolute;
            inset: -1px;
            width: calc(100% + 2px);
            height: calc(100% + 2px);
            pointer-events: none;
        }
    `,
    ];

    static properties = {
        events: { type: Array },
        pendingAsk: { type: Object },
        streamingAnswer: { type: String },
        notices: { type: Array },
        captureState: { type: Object },
        selectedProfile: { type: String },
        onSendText: { type: Function },
        isAnalyzing: { type: Boolean, state: true },
        _thumbs: { state: true },
        _zoomed: { state: true },
        _expandedEchoes: { state: true },
    };

    constructor() {
        super();
        this.events = [];
        this.pendingAsk = null;
        this.streamingAnswer = '';
        this.notices = [];
        this.captureState = { mic: false, system: false };
        this.selectedProfile = 'interview';
        this.onSendText = () => {};
        this.isAnalyzing = false;
        this._thumbs = new Map();
        this._zoomed = null;
        this._expandedEchoes = new Set();
        this._animFrame = null;
        this._askCountWhenStarted = 0;
    }

    // Rows come from `projectThread` (src/core/thread-view.js), the same module the
    // history uses: a live session and a stored one render identically.
    getRows() {
        const project = window.threadView?.projectThread;
        const rows = project ? project(this.events || []) : [];

        for (const notice of this.notices || []) {
            rows.push({ id: `notice-${notice.t}`, kind: 'notice', t: notice.t, text: notice.text });
        }
        rows.sort((a, b) => a.t - b.t);

        // The in-flight question always goes last: it is not in the thread yet,
        // because the `ask` event is only recorded once there is an answer.
        if (this.pendingAsk) {
            rows.push({
                id: 'pending',
                kind: 'ask',
                t: this.pendingAsk.t,
                question: this.pendingAsk.question,
                answer: this.streamingAnswer || '',
                imageRef: this.pendingAsk.imageRef || null,
                pending: true,
                error: this.pendingAsk.error || null,
            });
        }

        return rows;
    }

    // The empty thread is the moment a silent misconfiguration is invisible, so it
    // says out loud which channels are actually open.
    capturingLabel() {
        const { mic, system } = this.captureState || {};
        if (mic && system) return 'Recording your microphone and the system audio.';
        if (mic) return 'Recording your microphone only — system audio is not being captured.';
        if (system) return 'Recording the system audio only — your own voice is not being captured.';
        return 'No audio is being captured yet.';
    }

    clock(t) {
        return window.threadView?.formatClock ? window.threadView.formatClock(t) : '';
    }

    // Thumbnails live on disk; they are fetched by ref and cached in memory.
    loadThumb(ref) {
        if (!ref || this._thumbs.has(ref) || !window.require) return;
        this._thumbs.set(ref, null);
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.invoke('read-screenshot', ref).then(dataUrl => {
            if (!dataUrl) return;
            this._thumbs = new Map(this._thumbs).set(ref, dataUrl);
        });
    }

    // The "previous/next response" shortcuts no longer switch responses: they jump
    // between the assistant's answers inside the thread, which is what you usually
    // want to reread once the conversation has moved on.
    jumpToAnswer(direction) {
        const thread = this.shadowRoot.querySelector('.thread');
        if (!thread) return;

        const answers = Array.from(this.shadowRoot.querySelectorAll('.row-ask'));
        if (!answers.length) return;

        // `offsetTop` measures against the offsetParent, which here can fall outside
        // the shadow root: measure against the container's own rect instead.
        const threadTop = thread.getBoundingClientRect().top;
        const tops = answers.map(el => el.getBoundingClientRect().top - threadTop + thread.scrollTop);
        const current = thread.scrollTop;
        const target = direction === 'previous' ? [...tops].reverse().find(top => top < current - 4) : tops.find(top => top > current + 4);

        if (target !== undefined) thread.scrollTop = target;
    }

    scrollThreadUp() {
        const thread = this.shadowRoot.querySelector('.thread');
        if (thread) thread.scrollTop = Math.max(0, thread.scrollTop - thread.clientHeight * 0.3);
    }

    scrollThreadDown() {
        const thread = this.shadowRoot.querySelector('.thread');
        if (thread) thread.scrollTop = Math.min(thread.scrollHeight - thread.clientHeight, thread.scrollTop + thread.clientHeight * 0.3);
    }

    connectedCallback() {
        super.connectedCallback();

        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            this.handleScrollUp = () => this.scrollThreadUp();
            this.handleScrollDown = () => this.scrollThreadDown();
            this.handlePreviousAnswer = () => this.jumpToAnswer('previous');
            this.handleNextAnswer = () => this.jumpToAnswer('next');
            ipcRenderer.on('scroll-response-up', this.handleScrollUp);
            ipcRenderer.on('scroll-response-down', this.handleScrollDown);
            ipcRenderer.on('navigate-previous-response', this.handlePreviousAnswer);
            ipcRenderer.on('navigate-next-response', this.handleNextAnswer);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._stopWaveformAnimation();

        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            if (this.handleScrollUp) ipcRenderer.removeListener('scroll-response-up', this.handleScrollUp);
            if (this.handleScrollDown) ipcRenderer.removeListener('scroll-response-down', this.handleScrollDown);
            if (this.handlePreviousAnswer) ipcRenderer.removeListener('navigate-previous-response', this.handlePreviousAnswer);
            if (this.handleNextAnswer) ipcRenderer.removeListener('navigate-next-response', this.handleNextAnswer);
        }
    }

    async handleSendText() {
        const textInput = this.shadowRoot.querySelector('#textInput');
        if (textInput && textInput.value.trim()) {
            const message = textInput.value.trim();
            textInput.value = '';
            await this.onSendText(message);
        }
    }

    handleTextKeydown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSendText();
        }
    }

    handleScreenAnswer() {
        if (this.isAnalyzing) return;
        if (window.captureManualScreenshot) {
            this.isAnalyzing = true;
            this._askCountWhenStarted = (this.events || []).filter(e => e.kind === 'ask').length;
            window.captureManualScreenshot();
        }
    }

    _startWaveformAnimation() {
        const canvas = this.shadowRoot.querySelector('.analyze-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const dangerColor = getComputedStyle(this).getPropertyValue('--danger').trim() || '#EF4444';
        const startTime = performance.now();
        const FADE_IN = 0.5; // seconds
        const PARTICLE_SPREAD = 4; // px inward from border
        const PARTICLE_COUNT = 250;

        // Pill perimeter helpers
        const w = rect.width;
        const h = rect.height;
        const r = h / 2; // pill radius = half height
        const straightLen = w - 2 * r;
        const arcLen = Math.PI * r;
        const perimeter = 2 * straightLen + 2 * arcLen;

        // Given a distance along the perimeter, return {x, y, nx, ny} (position + inward normal)
        const pointOnPerimeter = d => {
            d = ((d % perimeter) + perimeter) % perimeter;
            // Top straight: left to right
            if (d < straightLen) {
                return { x: r + d, y: 0, nx: 0, ny: 1 };
            }
            d -= straightLen;
            // Right arc
            if (d < arcLen) {
                const angle = -Math.PI / 2 + (d / arcLen) * Math.PI;
                return {
                    x: w - r + Math.cos(angle) * r,
                    y: r + Math.sin(angle) * r,
                    nx: -Math.cos(angle),
                    ny: -Math.sin(angle),
                };
            }
            d -= arcLen;
            // Bottom straight: right to left
            if (d < straightLen) {
                return { x: w - r - d, y: h, nx: 0, ny: -1 };
            }
            d -= straightLen;
            // Left arc
            const angle = Math.PI / 2 + (d / arcLen) * Math.PI;
            return {
                x: r + Math.cos(angle) * r,
                y: r + Math.sin(angle) * r,
                nx: -Math.cos(angle),
                ny: -Math.sin(angle),
            };
        };

        // Pre-seed random offsets for stable particles
        const seeds = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            seeds.push({ pos: Math.random(), drift: Math.random(), depthSeed: Math.random() });
        }

        const draw = now => {
            const elapsed = (now - startTime) / 1000;
            const fade = Math.min(1, elapsed / FADE_IN);

            ctx.clearRect(0, 0, w, h);

            // ── Particle border ──
            ctx.fillStyle = dangerColor;
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const s = seeds[i];
                const along = (s.pos + s.drift * elapsed * 0.03) * perimeter;
                const depth = s.depthSeed * PARTICLE_SPREAD;
                const density = 1 - depth / PARTICLE_SPREAD;

                if (Math.random() > density) continue;

                const p = pointOnPerimeter(along);
                const px = p.x + p.nx * depth;
                const py = p.y + p.ny * depth;
                const size = 0.8 + density * 0.6;

                ctx.globalAlpha = fade * density * 0.85;
                ctx.beginPath();
                ctx.arc(px, py, size, 0, Math.PI * 2);
                ctx.fill();
            }

            // ── Waveform ──
            const midY = h / 2;
            const waves = [
                { freq: 3, amp: 0.35, speed: 2.5, opacity: 0.9, width: 1.8 },
                { freq: 5, amp: 0.2, speed: 3.5, opacity: 0.5, width: 1.2 },
                { freq: 7, amp: 0.12, speed: 5, opacity: 0.3, width: 0.8 },
            ];

            for (const wave of waves) {
                ctx.beginPath();
                ctx.strokeStyle = dangerColor;
                ctx.globalAlpha = wave.opacity * fade;
                ctx.lineWidth = wave.width;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                for (let x = 0; x <= w; x++) {
                    const norm = x / w;
                    const envelope = Math.sin(norm * Math.PI);
                    const y = midY + Math.sin(norm * Math.PI * 2 * wave.freq + elapsed * wave.speed) * (midY * wave.amp) * envelope;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            ctx.globalAlpha = 1;
            this._animFrame = requestAnimationFrame(draw);
        };

        this._animFrame = requestAnimationFrame(draw);
    }

    _stopWaveformAnimation() {
        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }
        const canvas = this.shadowRoot.querySelector('.analyze-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    _stopWaveformAnimation() {
        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }
        const canvas = this.shadowRoot.querySelector('.analyze-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    // Only follow the tail if you were already at the tail: if you scrolled up to
    // reread something, the view will not drag you back down every time someone talks.
    isNearBottom() {
        const thread = this.shadowRoot.querySelector('.thread');
        if (!thread) return true;
        return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
    }

    scrollToBottom() {
        const thread = this.shadowRoot.querySelector('.thread');
        if (thread) thread.scrollTop = thread.scrollHeight;
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('events') || changedProperties.has('pendingAsk') || changedProperties.has('streamingAnswer')) {
            this._stickToBottom = this.isNearBottom();
        }
    }

    updated(changedProperties) {
        super.updated(changedProperties);

        if (this._stickToBottom) {
            this._stickToBottom = false;
            this.scrollToBottom();
        }

        if (changedProperties.has('isAnalyzing')) {
            if (this.isAnalyzing) {
                this._startWaveformAnimation();
            } else {
                this._stopWaveformAnimation();
            }
        }

        // The capture finishes when its question lands in the thread, or when it fails.
        if (this.isAnalyzing) {
            const asks = (this.events || []).filter(e => e.kind === 'ask').length;
            if (asks > this._askCountWhenStarted || this.pendingAsk?.error) this.isAnalyzing = false;
        }
    }

    renderShot(ref) {
        if (!ref) return '';
        this.loadThumb(ref);
        const src = this._thumbs.get(ref);
        if (!src) return '';
        return html`
            <img
                class="shot ${this._zoomed === ref ? 'zoomed' : ''}"
                src=${src}
                alt="Screen capture"
                @click=${() => {
                    this._zoomed = this._zoomed === ref ? null : ref;
                }}
            />
        `;
    }

    toggleEcho(id) {
        const next = new Set(this._expandedEchoes);
        next.has(id) ? next.delete(id) : next.add(id);
        this._expandedEchoes = next;
    }

    // Collapsed, not hidden: the person has to be able to tell their mic is
    // re-recording the speakers, and to check what was flagged in case it was
    // something they really said (D23).
    renderEchoRow(row) {
        const open = this._expandedEchoes.has(row.id);
        return html`
            <div class="row row-echo">
                <button class="echo-toggle" @click=${() => this.toggleEcho(row.id)} title="Your microphone picked up the system audio">
                    <span class="echo-caret ${open ? 'open' : ''}">›</span>
                    Duplicate audio · ${this.clock(row.t)}
                </button>
                ${open ? html`<div class="said echo-text">${row.text}</div>` : ''}
            </div>
        `;
    }

    renderRow(row) {
        if (row.kind === 'speech') {
            if (row.echo) return this.renderEchoRow(row);

            return html`
                <div class="row row-speech row-${row.speaker}">
                    <div class="who">
                        <span class="name">${SPEAKER_LABELS[row.speaker] || row.speaker}</span>
                        <span class="clock">${this.clock(row.t)}</span>
                    </div>
                    <div class="said">${row.text}</div>
                </div>
            `;
        }

        if (row.kind === 'ask') {
            return html`
                <div class="row row-ask">
                    <div class="ask-question">
                        <div class="who">
                            <span class="name">You asked</span>
                            <span class="clock">${this.clock(row.t)}</span>
                        </div>
                        <div class="said">${row.question}</div>
                        ${this.renderShot(row.imageRef)}
                    </div>
                    <div class="answer">
                        <div class="answer-tag">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path d="M13 3v7h6l-8 11v-7H5z" />
                            </svg>
                            Assistant
                        </div>
                        ${
                            row.error
                                ? html`<div class="failed">${row.error}</div>`
                                : row.answer
                                  ? markdownNode(row.answer)
                                  : html`<span class="thinking"></span>`
                        }
                    </div>
                </div>
            `;
        }

        if (row.kind === 'screen') {
            return html`
                <div class="row row-screen">
                    <div class="caption">${row.caption || 'Screen captured'} · ${this.clock(row.t)}</div>
                    ${this.renderShot(row.imageRef)}
                </div>
            `;
        }

        if (row.kind === 'checklist') {
            return html`<div class="row row-checklist"><span class="chip">${row.itemId} · ${row.status}</span></div>`;
        }

        return html`<div class="row notice">${row.text}</div>`;
    }

    render() {
        const rows = this.getRows();

        return html`
            <div class="thread">
                ${
                    rows.length === 0
                        ? html`<div class="empty">
                              <div class="empty-title">Listening</div>
                              <div>${this.capturingLabel()}</div>
                              <div class="empty-hint">Whatever is said will show up here.</div>
                          </div>`
                        : rows.map(row => html`<div data-row=${row.id}>${this.renderRow(row)}</div>`)
                }
            </div>

            <div class="input-bar">
                <div class="input-bar-inner">
                    <input type="text" id="textInput" placeholder="Ask something…" @keydown=${this.handleTextKeydown} />
                </div>
                <button class="analyze-btn ${this.isAnalyzing ? 'analyzing' : ''}" @click=${this.handleScreenAnswer}>
                    <canvas class="analyze-canvas"></canvas>
                    <span class="analyze-btn-content">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
                            <path
                                fill="none"
                                stroke="currentColor"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M13 3v7h6l-8 11v-7H5z"
                            />
                        </svg>
                        Analyze screen
                    </span>
                </button>
            </div>
        `;
    }
}

customElements.define('assistant-view', AssistantView);
