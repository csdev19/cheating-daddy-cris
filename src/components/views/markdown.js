import { css } from '../../assets/lit-core-2.7.4.min.js';

// Model output is Markdown, and it is worth reading as Markdown wherever it lands:
// the live answer, the same answer reread in the history, the session summary. Both
// views own a shadow root, so the styles have to be handed to each of them rather
// than declared once in the page.

export const markdownStyles = css`
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
`;

function parseMarkdown(content) {
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

// Lit accepts a DOM node as a value, so the markdown is built separately rather
// than writing innerHTML over something Lit manages.
export function markdownNode(content) {
    const el = document.createElement('div');
    el.className = 'md';
    el.innerHTML = parseMarkdown(content || '');
    return el;
}
