const test = require('node:test');
const assert = require('node:assert');
const { buildPayload } = require('../src/core/payload');
const { createSessionContext } = require('../src/core/session-context');

const sampleProfile = {
    name: 'backend-interview',
    meta: { name: 'Backend Interview', confidential: false, model: 'gemini-3.7-flash' },
    instructions: 'Do not tell me what to say.',
    contextFiles: [
        { file: 'figures.md', content: 'Cut latency by 40%.' },
        { file: 'cv.md', content: '15 years of backend.' },
    ],
    checklist: [
        { id: 'ask-team', text: 'Ask about the team' },
        { id: 'mention-k8s', text: 'Mention Kubernetes' },
    ],
};

function contextWithSpeech() {
    let clock = 1000;
    const ctx = createSessionContext({ sessionId: 's1', now: () => clock++ });
    ctx.addSpeech({ speaker: 'them', text: 'What have you done with Node?' });
    ctx.addSpeech({ speaker: 'me', text: 'Backend at scale.' });
    return ctx;
}

test('system carries the instructions and every context file', () => {
    const p = buildPayload({ profile: sampleProfile, sessionContext: contextWithSpeech(), question: 'what do I say?' });
    assert.ok(p.system.includes('Do not tell me what to say.'));
    assert.ok(p.system.includes('Cut latency by 40%.'));
    assert.ok(p.system.includes('15 years of backend.'));
});

test('system does NOT carry the transcript (it must stay out of the cached prefix)', () => {
    const p = buildPayload({ profile: sampleProfile, sessionContext: contextWithSpeech(), question: 'what do I say?' });
    assert.ok(!p.system.includes('Backend at scale.'));
    assert.ok(p.transcript.includes('Backend at scale.'));
});

test('system stays identical across calls even as the transcript grows', () => {
    const ctx = contextWithSpeech();
    const first = buildPayload({ profile: sampleProfile, sessionContext: ctx, question: 'a' });
    ctx.addSpeech({ speaker: 'them', text: 'One more question.' });
    const second = buildPayload({ profile: sampleProfile, sessionContext: ctx, question: 'b' });

    assert.strictEqual(first.system, second.system);
    assert.notStrictEqual(first.transcript, second.transcript);
});

test('the checklist shows up with its current state', () => {
    const ctx = contextWithSpeech();
    ctx.addChecklist({ itemId: 'mention-k8s', status: 'done' });

    const p = buildPayload({ profile: sampleProfile, sessionContext: ctx, question: 'x' });
    assert.ok(p.system.includes('Ask about the team'));
    assert.ok(p.system.includes('Mention Kubernetes'));
});

test('propagates the model and the confidential flag from the profile', () => {
    const p = buildPayload({ profile: sampleProfile, sessionContext: contextWithSpeech(), question: 'x' });
    assert.strictEqual(p.model, 'gemini-3.7-flash');
    assert.strictEqual(p.confidential, false);

    const confidential = { ...sampleProfile, meta: { ...sampleProfile.meta, confidential: true } };
    assert.strictEqual(buildPayload({ profile: confidential, sessionContext: contextWithSpeech(), question: 'x' }).confidential, true);
});

test('the image is optional and travels through untouched', () => {
    const withoutImage = buildPayload({ profile: sampleProfile, sessionContext: contextWithSpeech(), question: 'x' });
    assert.strictEqual(withoutImage.image, null);

    const withImage = buildPayload({
        profile: sampleProfile,
        sessionContext: contextWithSpeech(),
        question: 'x',
        image: { data: 'YWJj', mimeType: 'image/jpeg' },
    });
    assert.strictEqual(withImage.image.data, 'YWJj');
});

test('works with a profile that has no context and no checklist', () => {
    const minimal = {
        name: 'm',
        meta: { name: 'M', confidential: false, model: null },
        instructions: 'Keep it short.',
        contextFiles: [],
        checklist: [],
    };
    const p = buildPayload({ profile: minimal, sessionContext: contextWithSpeech(), question: 'x' });
    assert.ok(p.system.includes('Keep it short.'));
    assert.strictEqual(p.model, null);
});

test('requires profile and sessionContext', () => {
    assert.throws(() => buildPayload({ sessionContext: contextWithSpeech(), question: 'x' }), /profile/);
    assert.throws(() => buildPayload({ profile: sampleProfile, question: 'x' }), /sessionContext/);
});
