import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';

// The profile editor (D30). It replaces a screen that put a profile picker next to
// a textarea bound to a global preference no model ever read, so the text never
// changed when the profile did.
//
// Three rules hold this together:
//
//   - A region is one file. `profile.md` holds the name, the model, the
//     confidential flag and the instructions, so those four save as one document:
//     saving them per field lets an older debounce put back a field edited since.
//   - Every write carries the revision it read. A hand edit that lands in between
//     is a question for the person, never something to overwrite.
//   - Read-only while a session runs. The main process refuses the write too; this
//     is the half that explains why.
const SAVE_DEBOUNCE_MS = 700;

export class ProfilesView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            .unified-page,
            .unified-wrap {
                height: 100%;
            }

            .columns {
                flex: 1;
                display: flex;
                gap: 16px;
                min-height: 0;
            }

            .list {
                width: 220px;
                flex-shrink: 0;
                display: flex;
                flex-direction: column;
                gap: 4px;
                overflow-y: auto;
            }

            .editor {
                flex: 1;
                min-width: 0;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 14px;
            }

            .profile-row {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                border-radius: 6px;
                cursor: pointer;
                border: 1px solid transparent;
                text-align: left;
                background: none;
                color: var(--text-color);
                font-size: 12px;
                width: 100%;
            }

            .profile-row:hover {
                background: var(--bg-surface);
            }

            .profile-row.editing {
                background: var(--bg-surface);
                border-color: var(--border-color, rgba(255, 255, 255, 0.15));
            }

            .profile-row .name {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            /* Which profile the next session will use — not the one being edited. */
            .active-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: var(--accent, #4ade80);
                flex-shrink: 0;
            }

            .slug {
                font-size: 11px;
                opacity: 0.55;
                font-family: ui-monospace, SFMono-Regular, monospace;
            }

            .region-head {
                display: flex;
                align-items: baseline;
                gap: 10px;
                flex-wrap: wrap;
            }

            .save-state {
                font-size: 11px;
                opacity: 0.6;
                margin-left: auto;
            }

            .save-state.saved {
                color: var(--accent, #4ade80);
                opacity: 0.85;
            }

            .save-state.failed,
            .save-state.conflict {
                color: var(--danger, #ef4444);
                opacity: 1;
            }

            .banner {
                padding: 8px 10px;
                border-radius: 6px;
                background: var(--bg-surface);
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }

            .banner.warning {
                color: var(--danger, #ef4444);
            }

            .inline-actions {
                display: flex;
                gap: 8px;
                align-items: center;
                flex-wrap: wrap;
            }

            button.link {
                background: none;
                border: none;
                color: inherit;
                text-decoration: underline;
                cursor: pointer;
                font-size: 11px;
                padding: 0;
            }

            button.action {
                background: var(--bg-surface);
                border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
                color: var(--text-color);
                border-radius: 6px;
                padding: 6px 10px;
                font-size: 12px;
                cursor: pointer;
            }

            button.action:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }

            button.action.danger {
                color: var(--danger, #ef4444);
            }

            .note-row,
            .checklist-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .note-row button.name {
                flex: 1;
                text-align: left;
                background: none;
                border: none;
                color: inherit;
                cursor: pointer;
                font-size: 12px;
                padding: 4px 0;
            }

            .note-row.open button.name {
                font-weight: 600;
            }

            .bytes {
                font-size: 11px;
                opacity: 0.5;
            }

            .checkbox-row {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
            }

            textarea.control {
                min-height: 120px;
                resize: vertical;
            }

            textarea.instructions {
                min-height: 160px;
            }

            .empty {
                font-size: 12px;
                opacity: 0.6;
            }
        `,
    ];

    static properties = {
        selectedProfile: { type: String },
        availableProfiles: { type: Array },
        sessionActive: { type: Boolean },
        onProfileChange: { type: Function },
        onProfilesChanged: { type: Function },
        _editing: { state: true },
        _profile: { state: true },
        _checklist: { state: true },
        _revisions: { state: true },
        _openNote: { state: true },
        _status: { state: true },
        _conflicts: { state: true },
        _creating: { state: true },
        _newName: { state: true },
        _newNoteName: { state: true },
        _confirmDelete: { state: true },
        _error: { state: true },
    };

    constructor() {
        super();
        this.selectedProfile = null;
        this.availableProfiles = [];
        this.sessionActive = false;
        this.onProfileChange = () => {};
        this.onProfilesChanged = async () => {};

        this._editing = null;
        this._profile = null;
        this._checklist = [];
        this._revisions = {};
        this._openNote = null;
        this._status = {};
        this._conflicts = {};
        this._creating = false;
        this._newName = '';
        this._newNoteName = '';
        this._confirmDelete = false;
        this._error = null;
        this._loading = false;

        // One debounce, one in-flight chain and one queued write per region, so a
        // late response for an obsolete edit can never land on top of a newer one.
        this._timers = new Map();
        this._pending = new Map();
        this._queues = new Map();
    }

    connectedCallback() {
        super.connectedCallback();
        this._loadInitial();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        // Leaving the view is a flush, not a discard.
        this._flushAll();
    }

    updated() {
        this._loadInitial();
    }

    // `updated` fires on every render, and `_load` awaits: without this guard a
    // render landing mid-load starts a second one, and the two race to set state.
    _loadInitial() {
        if (this._editing || this._loading || !(this.availableProfiles || []).length) return;
        const exists = this.availableProfiles.some(p => p.dir === this.selectedProfile);
        this._load(exists ? this.selectedProfile : this.availableProfiles[0].dir);
    }

    // ---------------------------------------------------------------- loading

    async _load(slug) {
        this._loading = true;
        try {
            await this._flushAll();
            await this._read(slug);
        } finally {
            this._loading = false;
        }
    }

    async _read(slug) {
        if (!slug) {
            this._editing = null;
            this._profile = null;
            return;
        }

        const result = await cheatingDaddy.profiles.read(slug);
        if (!result.success) {
            this._error = result.error;
            return;
        }

        this._editing = slug;
        this._profile = result.data.profile;
        this._checklist = result.data.profile.checklist.map(item => item.text);
        this._revisions = result.data.revisions;
        this._openNote = result.data.profile.notes[0]?.name || null;
        this._status = {};
        this._conflicts = {};
        this._confirmDelete = false;
        this._creating = false;
        this._newNoteName = '';
        this._error = null;
    }

    // ------------------------------------------------------------ save queues

    _fileOf(region) {
        if (region === 'profile') return 'profile.md';
        if (region === 'checklist') return 'checklist.md';
        return `context/${region.slice('note:'.length)}`;
    }

    _setStatus(region, value) {
        this._status = { ...this._status, [region]: value };
    }

    _schedule(region, run) {
        this._pending.set(region, run);
        this._setStatus(region, { state: 'pending' });

        clearTimeout(this._timers.get(region));
        this._timers.set(
            region,
            setTimeout(() => this._flush(region), SAVE_DEBOUNCE_MS)
        );
    }

    async _flush(region) {
        clearTimeout(this._timers.get(region));
        this._timers.delete(region);

        const run = this._pending.get(region);
        if (!run) return;
        this._pending.delete(region);

        const chained = (this._queues.get(region) || Promise.resolve()).catch(() => {}).then(() => this._save(region, run));
        this._queues.set(region, chained);
        return chained;
    }

    async _flushAll() {
        await Promise.all([...this._timers.keys()].map(region => this._flush(region)));
        await Promise.all([...this._queues.values()].map(queue => queue.catch(() => {})));
    }

    async _save(region, run) {
        // A conflicted region stops until the person decides. Retrying on its own
        // is exactly the overwrite the revision exists to prevent.
        if (this._conflicts[region]) return;

        this._setStatus(region, { state: 'saving' });
        const result = await run();

        if (result.success) {
            if (result.data && result.data.revision) {
                this._revisions = { ...this._revisions, [this._fileOf(region)]: result.data.revision };
            }
            this._setStatus(region, { state: 'saved', at: new Date() });
            return;
        }

        if (result.code === 'PROFILE_CONFLICT') {
            this._conflicts = { ...this._conflicts, [region]: true };
            this._setStatus(region, { state: 'conflict' });
            return;
        }

        this._setStatus(region, { state: 'failed', message: result.error });
    }

    // ------------------------------------------------------------------ edits

    // Serialised from the current state at save time rather than from the value
    // that scheduled the write: these four fields share one file.
    _scheduleProfile() {
        const slug = this._editing;
        this._schedule('profile', () =>
            cheatingDaddy.profiles.write(slug, { meta: this._profile.meta, instructions: this._profile.instructions }, this._revisions['profile.md'])
        );
    }

    _updateMeta(key, value) {
        this._profile = { ...this._profile, meta: { ...this._profile.meta, [key]: value } };
        this._scheduleProfile();
    }

    _updateInstructions(value) {
        this._profile = { ...this._profile, instructions: value };
        this._scheduleProfile();
    }

    _updateNote(name, content) {
        this._profile = {
            ...this._profile,
            notes: this._profile.notes.map(note => (note.name === name ? { ...note, content } : note)),
        };

        const slug = this._editing;
        this._schedule(`note:${name}`, () =>
            cheatingDaddy.profiles.writeNote(
                slug,
                name,
                this._profile.notes.find(note => note.name === name).content,
                this._revisions[`context/${name}`]
            )
        );
    }

    _updateChecklist(items) {
        this._checklist = items;

        const slug = this._editing;
        this._schedule('checklist', () =>
            cheatingDaddy.profiles.writeChecklist(slug, this._checklist.map(text => text.trim()).filter(Boolean), this._revisions['checklist.md'])
        );
    }

    // -------------------------------------------------------------- conflicts

    async _reloadRegion(region) {
        const result = await cheatingDaddy.profiles.read(this._editing);
        if (!result.success) {
            this._error = result.error;
            return;
        }

        const { profile, revisions } = result.data;

        if (region === 'profile') {
            this._profile = { ...this._profile, meta: profile.meta, instructions: profile.instructions };
        } else if (region === 'checklist') {
            this._checklist = profile.checklist.map(item => item.text);
        } else {
            const name = region.slice('note:'.length);
            const fresh = profile.notes.find(note => note.name === name);
            this._profile = {
                ...this._profile,
                notes: this._profile.notes.map(note => (note.name === name ? { ...note, content: fresh ? fresh.content : '' } : note)),
            };
        }

        this._revisions = { ...this._revisions, [this._fileOf(region)]: revisions[this._fileOf(region)] || null };

        const conflicts = { ...this._conflicts };
        delete conflicts[region];
        this._conflicts = conflicts;
        this._setStatus(region, { state: 'idle' });
    }

    _draftOf(region) {
        if (region === 'profile') return this._profile.instructions;
        if (region === 'checklist') return this._checklist.join('\n');
        return (this._profile.notes.find(note => note.name === region.slice('note:'.length)) || {}).content || '';
    }

    async _copyDraft(region) {
        try {
            await navigator.clipboard.writeText(this._draftOf(region));
            this._setStatus(region, { state: 'failed', message: 'Draft copied to the clipboard.' });
        } catch (error) {
            this._error = `Could not copy the draft: ${error.message}`;
        }
    }

    // ------------------------------------------------- create, delete, notes

    async _createProfile() {
        const displayName = this._newName.trim();
        if (!displayName) return;

        const result = await cheatingDaddy.profiles.create(displayName);
        if (!result.success) {
            this._error = result.error;
            return;
        }

        this._newName = '';
        this._creating = false;
        await this.onProfilesChanged();
        // Created, opened for editing — but not made the active profile. That stays
        // a choice, not a side effect of adding one.
        await this._load(result.data.slug);
    }

    async _deleteProfile() {
        const slug = this._editing;
        const result = await cheatingDaddy.profiles.remove(slug);
        this._confirmDelete = false;

        if (!result.success) {
            this._error = result.error;
            return;
        }

        await this.onProfilesChanged();
        const survivors = await cheatingDaddy.listProfiles();
        if (this.selectedProfile === slug && survivors[0]) this.onProfileChange(survivors[0].dir);

        this._editing = null;
        await this._load(survivors[0] ? survivors[0].dir : null);
    }

    async _addNote() {
        const raw = this._newNoteName.trim();
        if (!raw) return;

        const name = raw.endsWith('.md') ? raw : `${raw}.md`;
        const result = await cheatingDaddy.profiles.writeNote(this._editing, name, '', null);
        if (!result.success) {
            this._error = result.error;
            return;
        }

        this._newNoteName = '';
        await this._load(this._editing);
        this._openNote = name;
    }

    async _deleteNote(name) {
        const result = await cheatingDaddy.profiles.deleteNote(this._editing, name, this._revisions[`context/${name}`]);
        if (!result.success) {
            this._error = result.error;
            return;
        }
        await this._load(this._editing);
    }

    // --------------------------------------------------------------- render

    _clock(date) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    _renderStatus(region) {
        if (this._conflicts[region]) {
            return html`
                <span class="save-state conflict">Changed outside the app</span>
                <span class="inline-actions">
                    <button class="link" @click=${() => this._reloadRegion(region)}>Reload</button>
                    <button class="link" @click=${() => this._copyDraft(region)}>Copy draft</button>
                </span>
            `;
        }

        const status = this._status[region];
        if (!status || status.state === 'idle') return null;
        if (status.state === 'pending' || status.state === 'saving') return html`<span class="save-state">Saving…</span>`;
        if (status.state === 'saved') return html`<span class="save-state saved">✓ Saved ${this._clock(status.at)}</span>`;
        return html`<span class="save-state failed">Save failed — ${status.message}</span>`;
    }

    _renderList() {
        const profiles = this.availableProfiles || [];

        return html`
            <div class="list">
                ${profiles.map(
                    profile => html`
                        <button
                            class="profile-row ${profile.dir === this._editing ? 'editing' : ''}"
                            @click=${() => this._load(profile.dir)}
                            title=${profile.dir}
                        >
                            <span class="name">${profile.name}</span>
                            ${profile.dir === this.selectedProfile ? html`<span class="active-dot" title="Used by the next session"></span>` : null}
                        </button>
                    `
                )}
                ${
                    this._creating
                        ? html`
                              <div class="inline-actions">
                                  <input
                                      class="control"
                                      placeholder="Profile name"
                                      .value=${this._newName}
                                      @input=${e => (this._newName = e.target.value)}
                                      @keydown=${e => e.key === 'Enter' && this._createProfile()}
                                  />
                                  <button class="action" @click=${() => this._createProfile()}>Add</button>
                              </div>
                          `
                        : html`<button class="action" ?disabled=${this.sessionActive} @click=${() => (this._creating = true)}>+ New profile</button>`
                }
            </div>
        `;
    }

    _renderNotes() {
        const notes = this._profile.notes || [];

        return html`
            <div class="form-group vertical">
                <div class="region-head">
                    <label class="form-label">Notes (context/)</label>
                    ${this._openNote ? this._renderStatus(`note:${this._openNote}`) : null}
                </div>

                ${notes.length === 0 ? html`<div class="empty">No notes yet. Everything here is sent to the model whole.</div>` : null}
                ${notes.map(
                    note => html`
                        <div class="note-row ${note.name === this._openNote ? 'open' : ''}">
                            <button class="name" @click=${() => (this._openNote = note.name)}>${note.name}</button>
                            <span class="bytes">${note.bytes} B</span>
                            <button class="link" ?disabled=${this.sessionActive} @click=${() => this._deleteNote(note.name)}>Remove</button>
                        </div>
                    `
                )}

                <div class="inline-actions">
                    <input
                        class="control"
                        placeholder="new-note.md"
                        .value=${this._newNoteName}
                        ?disabled=${this.sessionActive}
                        @input=${e => (this._newNoteName = e.target.value)}
                        @keydown=${e => e.key === 'Enter' && this._addNote()}
                    />
                    <button class="action" ?disabled=${this.sessionActive} @click=${() => this._addNote()}>+ Add note</button>
                </div>

                ${
                    this._openNote
                        ? html`
                              <textarea
                                  class="control"
                                  .value=${(notes.find(note => note.name === this._openNote) || {}).content || ''}
                                  ?disabled=${this.sessionActive}
                                  @input=${e => this._updateNote(this._openNote, e.target.value)}
                                  @blur=${() => this._flush(`note:${this._openNote}`)}
                              ></textarea>
                          `
                        : null
                }
            </div>
        `;
    }

    _renderChecklist() {
        return html`
            <div class="form-group vertical">
                <div class="region-head">
                    <label class="form-label">Checklist</label>
                    ${this._renderStatus('checklist')}
                </div>

                ${this._checklist.map(
                    (text, index) => html`
                        <div class="checklist-row">
                            <input
                                class="control"
                                .value=${text}
                                ?disabled=${this.sessionActive}
                                @input=${e => this._updateChecklist(this._checklist.map((item, i) => (i === index ? e.target.value : item)))}
                                @blur=${() => this._flush('checklist')}
                            />
                            <button
                                class="link"
                                ?disabled=${this.sessionActive}
                                @click=${() => this._updateChecklist(this._checklist.filter((item, i) => i !== index))}
                            >
                                Remove
                            </button>
                        </div>
                    `
                )}

                <button class="action" ?disabled=${this.sessionActive} @click=${() => this._updateChecklist([...this._checklist, ''])}>
                    + Add item
                </button>
                <div class="form-help">Each item gets an id from its text, so two items cannot read the same.</div>
            </div>
        `;
    }

    _renderEditor() {
        if (!this._profile) return html`<div class="editor"><div class="empty">Select a profile.</div></div>`;

        const meta = this._profile.meta;

        return html`
            <div class="editor">
                <div class="region-head">
                    <div class="surface-title">${meta.name}</div>
                    <span class="slug">${this._profile.slug}</span>
                    ${this._renderStatus('profile')}
                </div>

                <div class="form-group">
                    <label class="form-label">Name</label>
                    <input
                        class="control"
                        .value=${meta.name}
                        ?disabled=${this.sessionActive}
                        @input=${e => this._updateMeta('name', e.target.value)}
                        @blur=${() => this._flush('profile')}
                    />
                    <div class="form-help">The folder name never changes; stored sessions point at it.</div>
                </div>

                <div class="form-group">
                    <label class="form-label">Model</label>
                    <input
                        class="control"
                        placeholder="Leave empty to use the default"
                        .value=${meta.model || ''}
                        ?disabled=${this.sessionActive}
                        @input=${e => this._updateMeta('model', e.target.value.trim() || null)}
                        @blur=${() => this._flush('profile')}
                    />
                </div>

                <label class="checkbox-row">
                    <input
                        type="checkbox"
                        .checked=${meta.confidential === true}
                        ?disabled=${this.sessionActive}
                        @change=${e => this._updateMeta('confidential', e.target.checked)}
                    />
                    Confidential — transcription and reasoning stay on this machine
                </label>

                <div class="form-group vertical">
                    <label class="form-label">Instructions</label>
                    <textarea
                        class="control instructions"
                        .value=${this._profile.instructions}
                        ?disabled=${this.sessionActive}
                        @input=${e => this._updateInstructions(e.target.value)}
                        @blur=${() => this._flush('profile')}
                    ></textarea>
                </div>

                ${this._renderNotes()} ${this._renderChecklist()}

                <div class="inline-actions">
                    ${
                        this._confirmDelete
                            ? html`
                                  <span class="danger">Delete ${meta.name} and everything in it?</span>
                                  <button class="action danger" @click=${() => this._deleteProfile()}>Delete</button>
                                  <button class="action" @click=${() => (this._confirmDelete = false)}>Cancel</button>
                              `
                            : html`
                                  <button class="action danger" ?disabled=${this.sessionActive} @click=${() => (this._confirmDelete = true)}>
                                      Delete profile
                                  </button>
                              `
                    }
                </div>
            </div>
        `;
    }

    render() {
        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div class="page-title">Profiles</div>

                    ${this.sessionActive ? html`<div class="banner warning">Session running — end it to edit this profile.</div>` : null}
                    ${this._error ? html`<div class="banner warning">${this._error}</div>` : null}

                    <div class="columns">${this._renderList()} ${this._renderEditor()}</div>
                </div>
            </div>
        `;
    }
}

customElements.define('profiles-view', ProfilesView);
