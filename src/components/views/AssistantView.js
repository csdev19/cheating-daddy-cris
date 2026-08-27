import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';

const SPEAKER_LABELS = { them: 'Them', me: 'Me' };

export class AssistantView extends LitElement {
    static styles = css`
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

        /* Marca de canal: de un vistazo se ve de quién es cada turno sin leer la etiqueta. */
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

        /* ── Markdown de la respuesta ── */

        .md h1,
        .md h2,
        .md h3,
        .md h4,
        .md h5,
        .md h6 {
            margin: 1em 0 0.5em 0;
            color: var(--text-primary);
            font-weight: var(--font-weight-semibold);
        }

        .md h1 {
            font-size: 1.5em;
        }
        .md h2 {
            font-size: 1.3em;
        }
        .md h3 {
            font-size: 1.15em;
        }
        .md h4 {
            font-size: 1.05em;
        }
        .md h5,
        .md h6 {
            font-size: 1em;
        }

        .md > *:first-child {
            margin-top: 0;
        }

        .md > *:last-child {
            margin-bottom: 0;
        }

        .md p {
            margin: 0.6em 0;
            color: var(--text-primary);
        }

        .md ul,
        .md ol {
            margin: 0.6em 0;
            padding-left: 1.5em;
            color: var(--text-primary);
        }

        .md li {
            margin: 0.3em 0;
        }

        .md blockquote {
            margin: 0.8em 0;
            padding: 0.5em 1em;
            border-left: 2px solid var(--border-strong);
            background: var(--bg-elevated);
            border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        }

        .md code {
            background: var(--bg-elevated);
            padding: 0.15em 0.4em;
            border-radius: var(--radius-sm);
            font-family: var(--font-mono);
            font-size: 0.85em;
        }

        .md pre {
            background: var(--bg-app);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            padding: var(--space-md);
            overflow-x: auto;
            margin: 0.8em 0;
        }

        .md pre code {
            background: none;
            padding: 0;
        }

        .md a {
            color: var(--accent);
            text-decoration: underline;
            text-underline-offset: 2px;
        }

        .md strong,
        .md b {
            font-weight: var(--font-weight-semibold);
        }

        .md hr {
            border: none;
            border-top: 1px solid var(--border);
            margin: 1.5em 0;
        }

        .md table {
            border-collapse: collapse;
            width: 100%;
            margin: 0.8em 0;
            display: block;
            overflow-x: auto;
        }

        .md th,
        .md td {
            border: 1px solid var(--border);
            padding: var(--space-sm);
            text-align: left;
        }

        .md th {
            background: var(--bg-elevated);
            font-weight: var(--font-weight-semibold);
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
    `;

    static properties = {
        events: { type: Array },
        pendingAsk: { type: Object },
        streamingAnswer: { type: String },
        notices: { type: Array },
        selectedProfile: { type: String },
        onSendText: { type: Function },
        isAnalyzing: { type: Boolean, state: true },
        _thumbs: { state: true },
        _zoomed: { state: true },
    };

    constructor() {
        super();
        this.events = [];
        this.pendingAsk = null;
        this.streamingAnswer = '';
        this.notices = [];
        this.selectedProfile = 'interview';
        this.onSendText = () => {};
        this.isAnalyzing = false;
        this._thumbs = new Map();
        this._zoomed = null;
        this._animFrame = null;
        this._askCountWhenStarted = 0;
    }

    // Las filas salen de `projectThread` (src/core/thread-view.js), el mismo módulo
    // que usa el historial: una sesión en curso y una guardada se pintan igual.
    getRows() {
        const project = window.threadView?.projectThread;
        const rows = project ? project(this.events || []) : [];

        for (const notice of this.notices || []) {
            rows.push({ id: `notice-${notice.t}`, kind: 'notice', t: notice.t, text: notice.text });
        }
        rows.sort((a, b) => a.t - b.t);

        // La pregunta en curso va siempre al final: aún no está en el hilo porque
        // el evento `ask` no se registra hasta que hay respuesta.
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

    clock(t) {
        return window.threadView?.formatClock ? window.threadView.formatClock(t) : '';
    }

    renderMarkdown(content) {
        if (typeof window !== 'undefined' && window.marked) {
            try {
                window.marked.setOptions({ breaks: true, gfm: true, sanitize: false });
                return window.marked.parse(content);
            } catch (error) {
                console.warn('Error parsing markdown:', error);
            }
        }
        return content;
    }

    // Lit acepta un nodo DOM como valor, así que el markdown se monta aparte en vez
    // de escribir innerHTML sobre lo que Lit gestiona.
    markdownNode(content) {
        const el = document.createElement('div');
        el.className = 'md';
        el.innerHTML = this.renderMarkdown(content || '');
        return el;
    }

    // Las miniaturas viven en disco; se piden por su ref y se cachean en memoria.
    loadThumb(ref) {
        if (!ref || this._thumbs.has(ref) || !window.require) return;
        this._thumbs.set(ref, null);
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.invoke('read-screenshot', ref).then(dataUrl => {
            if (!dataUrl) return;
            this._thumbs = new Map(this._thumbs).set(ref, dataUrl);
        });
    }

    // Los atajos de "respuesta anterior/siguiente" ya no cambian de respuesta:
    // saltan entre las respuestas del asistente dentro del hilo, que es lo que se
    // suele querer releer cuando la conversación ha seguido avanzando.
    jumpToAnswer(direction) {
        const thread = this.shadowRoot.querySelector('.thread');
        if (!thread) return;

        const answers = Array.from(this.shadowRoot.querySelectorAll('.row-ask'));
        if (!answers.length) return;

        // `offsetTop` mide contra el offsetParent, que aquí puede caer fuera del
        // shadow root: se calcula contra el rect del propio contenedor.
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

    // Solo se sigue el final del hilo si ya estabas al final: si has subido a releer
    // algo, la vista no te arrastra abajo cada vez que alguien habla.
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

        // La captura termina cuando su pregunta entra en el hilo, o cuando falla.
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

    renderRow(row) {
        if (row.kind === 'speech') {
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
                                  ? this.markdownNode(row.answer)
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
                        ? html`<div class="empty">Listening. Whatever is said will show up here.</div>`
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
