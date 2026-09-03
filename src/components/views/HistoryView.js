import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';
import { markdownStyles, markdownNode } from './markdown.js';

const SPEAKER_LABELS = { them: 'Them', me: 'Me' };

export class HistoryView extends LitElement {
    static styles = [
        unifiedPageStyles,
        markdownStyles,
        css`
            .unified-page {
                overflow-y: hidden;
            }

            .unified-wrap {
                height: 100%;
            }

            .search-wrap {
                position: relative;
                max-width: 280px;
            }

            .search-icon {
                position: absolute;
                left: 10px;
                top: 50%;
                transform: translateY(-50%);
                width: 14px;
                height: 14px;
                color: var(--text-muted);
                pointer-events: none;
            }

            .search-wrap .control {
                padding-left: 30px;
            }

            .list-shell {
                border: 1px solid var(--border);
                border-radius: var(--radius-md);
                background: var(--bg-surface);
                overflow: hidden;
                flex: 1;
                display: flex;
                flex-direction: column;
                min-height: 0;
            }

            .sessions-list {
                overflow-y: auto;
                flex: 1;
            }

            .session-card {
                width: 100%;
                border: none;
                border-bottom: 1px solid var(--border);
                background: transparent;
                text-align: left;
                padding: var(--space-sm) var(--space-md);
                cursor: pointer;
                transition: background var(--transition);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--space-sm);
            }

            .session-card:hover {
                background: var(--bg-hover);
            }

            .session-left {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .session-profile {
                color: var(--text-primary);
                font-size: var(--font-size-sm);
            }

            .session-date {
                color: var(--text-muted);
                font-size: var(--font-size-xs);
            }

            .session-badge {
                color: var(--text-secondary);
                font-size: var(--font-size-xs);
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 2px 8px;
                white-space: nowrap;
            }

            .detail-top {
                display: flex;
                align-items: center;
                gap: var(--space-sm);
            }

            .back-btn {
                border: none;
                background: none;
                color: var(--text-muted);
                padding: 0;
                font-size: var(--font-size-sm);
                cursor: pointer;
                display: flex;
                align-items: center;
            }

            .back-btn svg {
                cursor: pointer;
            }

            .back-btn:hover {
                color: var(--text-primary);
            }

            .detail-info {
                color: var(--text-secondary);
                font-size: var(--font-size-sm);
            }

            .copy-btn {
                margin-left: auto;
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                background: var(--bg-elevated);
                color: var(--text-secondary);
                padding: 5px 12px;
                font-size: var(--font-size-xs);
                cursor: pointer;
                white-space: nowrap;
                transition:
                    color var(--transition),
                    border-color var(--transition);
            }

            .copy-btn:hover:not(:disabled) {
                color: var(--text-primary);
                border-color: var(--accent);
            }

            .copy-btn:disabled {
                cursor: default;
                opacity: 0.5;
            }

            .tab-row {
                display: flex;
                gap: 6px;
            }

            .tab-btn {
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                background: transparent;
                color: var(--text-muted);
                padding: 6px 10px;
                cursor: pointer;
                font-size: var(--font-size-xs);
            }

            .tab-btn:hover {
                color: var(--text-secondary);
            }

            .tab-btn.active {
                color: var(--text-primary);
                border-color: var(--text-secondary);
            }

            .details-scroll {
                overflow-y: auto;
                flex: 1;
                min-height: 0;
                display: flex;
                flex-direction: column;
                gap: var(--space-md);
                padding: var(--space-sm) 0;
                user-select: text;
                cursor: text;
            }

            .details-scroll * {
                user-select: text;
                cursor: text;
            }

            /* ── Speaker label ── */

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
            .row-speech,
            .row-echo {
                border-left: 2px solid transparent;
                padding-left: var(--space-md);
            }

            .row-them {
                border-left-color: var(--border-strong);
            }

            .row-me {
                border-left-color: var(--accent);
            }

            /* Kept rather than dropped: the duplicate has to be visible to be
               recognised as one, but it is not part of what was said (D23). */
            .echo-label {
                font-family: var(--font-mono);
                font-size: var(--font-size-xs);
                letter-spacing: 0.04em;
                color: var(--text-muted);
                opacity: 0.65;
            }

            .echo-text {
                margin-top: 4px;
                color: var(--text-muted);
                opacity: 0.65;
                font-size: var(--font-size-sm);
            }

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

            .row-screen .caption {
                color: var(--text-muted);
                font-size: var(--font-size-xs);
                font-family: var(--font-mono);
            }

            .shot {
                margin-top: var(--space-sm);
                display: block;
                max-width: 260px;
                width: 100%;
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
            }

            .context-row {
                display: flex;
                align-items: flex-start;
                gap: var(--space-sm);
                padding: var(--space-sm);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                background: var(--bg-elevated);
            }

            .context-key {
                width: 84px;
                color: var(--text-muted);
                font-size: var(--font-size-xs);
                text-transform: uppercase;
                letter-spacing: 0.4px;
                flex-shrink: 0;
            }

            .context-value {
                color: var(--text-primary);
                font-size: var(--font-size-sm);
                line-height: 1.45;
                white-space: pre-wrap;
                word-break: break-word;
                user-select: text;
                cursor: text;
            }

            .session-digest {
                border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
                border-radius: 8px;
                padding: 12px 14px;
                margin-bottom: 16px;
                background: rgba(255, 255, 255, 0.03);
            }
            .session-digest-title {
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                opacity: 0.6;
                margin-bottom: 6px;
            }
            .digest-button {
                background: var(--bg-elevated);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                color: var(--text-primary);
                cursor: pointer;
                font-family: var(--font-mono);
                font-size: 11px;
                padding: 5px 12px;
            }

            .digest-button:hover:not(:disabled) {
                border-color: var(--accent);
            }

            .digest-button:disabled {
                cursor: default;
                opacity: 0.6;
            }

            .digest-error {
                color: var(--danger);
                margin-bottom: 8px;
            }

            /* No pre-wrap here: the summary is rendered Markdown, and the newlines
               between its block elements would show up as blank lines. */
            .session-digest-body {
                font-size: 13px;
                line-height: 1.5;
                user-select: text;
                cursor: text;
            }
            .empty {
                color: var(--text-muted);
                font-size: var(--font-size-sm);
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 120px;
                border: 1px dashed var(--border);
                border-radius: var(--radius-sm);
            }
        `,
    ];

    static properties = {
        sessions: { type: Array },
        selectedSession: { type: Object },
        selectedSessionId: { type: String },
        loading: { type: Boolean },
        activeTab: { type: String },
        searchQuery: { type: String },
        _thumbs: { state: true },
        _digesting: { state: true },
        _copied: { state: true },
    };

    constructor() {
        super();
        this.sessions = [];
        this.selectedSession = null;
        this.selectedSessionId = null;
        this.loading = true;
        this.activeTab = 'conversation';
        this.searchQuery = '';
        this._thumbs = new Map();
        this._digesting = false;
        this._copied = false;
        this._copiedTimer = null;
        this._profileNames = null;
        this.loadSessions();
        this._loadProfileNames();
    }

    async loadSessions() {
        try {
            this.loading = true;
            this.sessions = await cheatingDaddy.storage.getAllSessions();
        } catch (error) {
            console.error('Error loading sessions:', error);
            this.sessions = [];
        } finally {
            this.loading = false;
            this.requestUpdate();
        }
    }

    async openSession(sessionId) {
        try {
            const session = await cheatingDaddy.storage.getSession(sessionId);
            if (session) {
                this.selectedSession = session;
                this.selectedSessionId = sessionId;
                this.activeTab = 'conversation';
                this._resetCopied();
                this.requestUpdate();
            }
        } catch (error) {
            console.error('Error loading session:', error);
        }
    }

    closeSession() {
        this.selectedSession = null;
        this.selectedSessionId = null;
        this.activeTab = 'conversation';
        this._resetCopied();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._resetCopied();
    }

    _resetCopied() {
        if (this._copiedTimer) clearTimeout(this._copiedTimer);
        this._copiedTimer = null;
        this._copied = false;
    }

    handleSearchInput(e) {
        this.searchQuery = e.target.value;
    }

    formatDate(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    getProfileNames() {
        return this._profileNames || {};
    }

    // Read from disk, like the picker and the profile editor. The map that used to
    // live here listed profiles that no longer exist and could not name one the
    // person created, so a renamed profile showed as its folder slug and a deleted
    // one as a name from a different app entirely.
    async _loadProfileNames() {
        try {
            const profiles = await cheatingDaddy.listProfiles();
            this._profileNames = Object.fromEntries(profiles.map(profile => [profile.dir, profile.name]));
            this.requestUpdate();
        } catch (error) {
            console.error('Could not read the profile names:', error);
        }
    }

    _getProfileLabel(session) {
        if (session.profile) {
            return this.getProfileNames()[session.profile] || session.profile;
        }
        return 'Session';
    }

    getSessionPreview(session) {
        const parts = [];
        if (session.messageCount > 0) parts.push(`${session.messageCount} messages`);
        if (session.screenAnalysisCount > 0) parts.push(`${session.screenAnalysisCount} screen`);
        if (session.profile) {
            const profileNames = this.getProfileNames();
            parts.push(profileNames[session.profile] || session.profile);
        }
        return parts.length > 0 ? parts.join(' · ') : 'Empty session';
    }

    getFilteredSessions() {
        if (!this.searchQuery.trim()) return this.sessions;
        const q = this.searchQuery.toLowerCase();
        return this.sessions.filter(session => {
            const preview = this.getSessionPreview(session).toLowerCase();
            const date = this.formatDate(session.createdAt).toLowerCase();
            return preview.includes(q) || date.includes(q);
        });
    }

    // Nothing in this view can be selected comfortably in a window this size, so the
    // whole session is handed over at once, as the same Markdown written to disk.
    _canCopySession() {
        if (!this.selectedSession) return false;
        return (this.selectedSession.events || []).length > 0 || Boolean(this.selectedSession.digest);
    }

    async handleCopySession() {
        if (!this.selectedSessionId || !window.require) return;

        const { ipcRenderer } = window.require('electron');
        const result = await ipcRenderer.invoke('copy-session-markdown', this.selectedSessionId);
        if (!result?.success) {
            window.cheatingDaddy?.addNotice(`The session could not be copied: ${result?.error || 'unknown error'}`);
            return;
        }

        if (this._copiedTimer) clearTimeout(this._copiedTimer);
        this._copied = true;
        this._copiedTimer = setTimeout(() => {
            this._copied = false;
            this._copiedTimer = null;
        }, 2000);
    }

    // A session the app never closed properly carries no pending mark, so it is
    // never picked up automatically. This is how it gets its summary (D24).
    async handleGenerateDigest() {
        if (this._digesting || !this.selectedSessionId || !window.require) return;

        this._digesting = true;
        try {
            const { ipcRenderer } = window.require('electron');
            const result = await ipcRenderer.invoke('generate-session-digest', this.selectedSessionId);
            if (!result?.success) {
                this._digestError = result?.error || 'The summary could not be generated';
            } else {
                this._digestError = null;
                this.selectedSession = await cheatingDaddy.storage.getSession(this.selectedSessionId);
            }
        } finally {
            this._digesting = false;
        }
    }

    // Thumbnails live on disk under `history/<sessionId>/`; the thread only keeps
    // the ref, so they are fetched from main on demand.
    renderShot(ref) {
        if (!ref) return '';
        if (!this._thumbs.has(ref) && window.require) {
            this._thumbs.set(ref, null);
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.invoke('read-screenshot', ref).then(dataUrl => {
                if (dataUrl) this._thumbs = new Map(this._thumbs).set(ref, dataUrl);
            });
        }
        const src = this._thumbs.get(ref);
        return src ? html`<img class="shot" src=${src} alt="Screen capture" />` : '';
    }

    // Same projection as the live view (src/core/thread-view.js): segments chopped up
    // by the VAD are reread merged, exactly as they looked during the session.
    getRows(session) {
        const project = window.threadView?.projectThread;
        return project ? project(session?.events || []) : [];
    }

    clock(t) {
        return window.threadView?.formatClock ? window.threadView.formatClock(t) : '';
    }

    // The same rows the live view paints, painted the same way. A turn is named and
    // marked on its channel; a bubble said nothing about who was speaking.
    renderRow(row) {
        if (row.kind === 'speech') {
            if (row.echo) {
                return html`
                    <div class="row row-echo">
                        <div class="echo-label" title="Your microphone picked up the system audio">Duplicate audio · ${this.clock(row.t)}</div>
                        <div class="said echo-text">${row.text}</div>
                    </div>
                `;
            }

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
                    ${
                        row.answer
                            ? html`<div class="answer">
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
                                  ${markdownNode(row.answer)}
                              </div>`
                            : ''
                    }
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

        return '';
    }

    renderTabContent() {
        if (!this.selectedSession) return html`<div class="empty">Select a session.</div>`;

        if (this.activeTab === 'conversation') {
            const rows = this.getRows(this.selectedSession).filter(row => row.kind !== 'screen');
            const digest = this.selectedSession.digest;
            // A session with turns but no summary still has something to offer: the
            // button to generate one. Only a genuinely empty session is empty.
            if (!rows.length && !digest) return html`<div class="empty">No conversation data.</div>`;

            // The summary comes first: usually it is the only thing worth rereading (M2).
            const resumen = !digest
                ? html`<div class="session-digest">
                      <div class="session-digest-title">Summary</div>
                      <div class="session-digest-body">
                          ${this._digestError ? html`<div class="digest-error">${this._digestError}</div>` : ''}
                          <button class="digest-button" ?disabled=${this._digesting} @click=${() => this.handleGenerateDigest()}>
                              ${this._digesting ? 'Generating…' : 'Generate summary'}
                          </button>
                      </div>
                  </div>`
                : html`<div class="session-digest">
                      <div class="session-digest-title">Summary</div>
                      <div class="session-digest-body">${markdownNode(digest)}</div>
                  </div>`;

            return html`${resumen}${rows.map(row => this.renderRow(row))}`;
        }

        if (this.activeTab === 'screen') {
            const screen = (this.selectedSession.events || []).filter(e => e.kind === 'screen');
            if (!screen.length) return html`<div class="empty">No screen analysis data.</div>`;
            return screen.map(entry => this.renderRow({ kind: 'screen', t: entry.t, imageRef: entry.imageRef, caption: entry.caption }));
        }

        const profile = this.selectedSession.profile;
        const prompt = this.selectedSession.customPrompt;
        if (!profile && !prompt) return html`<div class="empty">No context saved for this session.</div>`;

        return html`
            ${
                profile
                    ? html`
                          <div class="context-row">
                              <span class="context-key">Profile</span>
                              <span class="context-value">${this.getProfileNames()[profile] || profile}</span>
                          </div>
                      `
                    : ''
            }
            ${
                prompt
                    ? html`
                          <div class="context-row">
                              <span class="context-key">Prompt</span>
                              <span class="context-value">${prompt}</span>
                          </div>
                      `
                    : ''
            }
        `;
    }

    renderListView() {
        const filteredSessions = this.getFilteredSessions();
        return html`
            <div class="page-title">History</div>

            <div class="search-wrap">
                <svg
                    class="search-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input class="control" type="text" placeholder="Search sessions..." .value=${this.searchQuery} @input=${this.handleSearchInput} />
            </div>

            <section class="list-shell">
                <div class="sessions-list">
                    ${this.loading ? html`<div class="empty" style="margin:var(--space-md);">Loading sessions...</div>` : ''}
                    ${!this.loading && filteredSessions.length === 0 ? html`<div class="empty" style="margin:var(--space-md);">No matching sessions.</div>` : ''}
                    ${
                        !this.loading
                            ? filteredSessions.map(
                                  session => html`
                                      <button class="session-card" @click=${() => this.openSession(session.sessionId)}>
                                          <div class="session-left">
                                              <span class="session-profile">${this._getProfileLabel(session)}</span>
                                              <span class="session-date"
                                                  >${this.formatDate(session.createdAt)} · ${this.formatTime(session.createdAt)}</span
                                              >
                                          </div>
                                          ${session.messageCount > 0 ? html`<span class="session-badge">${session.messageCount}</span>` : ''}
                                      </button>
                                  `
                              )
                            : ''
                    }
                </div>
            </section>
        `;
    }

    renderDetailView() {
        const conversationCount = this.getRows(this.selectedSession).filter(row => row.kind !== 'screen').length;
        const screenCount = (this.selectedSession?.events || []).filter(e => e.kind === 'screen').length;

        return html`
            <div class="page-title">Session Detail</div>
            <div class="detail-top">
                <button class="back-btn" @click=${this.closeSession}>
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
                <span class="detail-info"
                    >${this._getProfileLabel(this.selectedSession)} · ${this.formatDate(this.selectedSession.createdAt)} ·
                    ${this.formatTime(this.selectedSession.createdAt)}</span
                >
                <button
                    class="copy-btn"
                    ?disabled=${!this._canCopySession()}
                    title="Copy the whole session as Markdown"
                    @click=${() => this.handleCopySession()}
                >
                    ${this._copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <div class="tab-row">
                <button
                    class="tab-btn ${this.activeTab === 'conversation' ? 'active' : ''}"
                    @click=${() => {
                        this.activeTab = 'conversation';
                    }}
                >
                    Conversation (${conversationCount})
                </button>
                <button
                    class="tab-btn ${this.activeTab === 'screen' ? 'active' : ''}"
                    @click=${() => {
                        this.activeTab = 'screen';
                    }}
                >
                    Screen (${screenCount})
                </button>
                <button
                    class="tab-btn ${this.activeTab === 'context' ? 'active' : ''}"
                    @click=${() => {
                        this.activeTab = 'context';
                    }}
                >
                    Context
                </button>
            </div>
            <section class="details-scroll">${this.renderTabContent()}</section>
        `;
    }

    render() {
        return html`
            <div class="unified-page">
                <div class="unified-wrap">${this.selectedSession ? this.renderDetailView() : this.renderListView()}</div>
            </div>
        `;
    }
}

customElements.define('history-view', HistoryView);
