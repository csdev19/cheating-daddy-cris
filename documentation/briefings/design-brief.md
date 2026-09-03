> Paste this whole document into another model's context before doing design
> or UI-copy work on this app. If it ever disagrees with the live values in
> `src/index.html`, **`src/index.html` wins** — that file is the single
> source of truth for every token below and this document is regenerated
> from it. Current as of 2026-09-03.

## The aesthetic in one paragraph

Near-black, near-silent, and built to disappear. This is a transparent,
always-on-top overlay meant to sit unnoticed over a video call — so the UI
itself follows suit: a dark, low-contrast surface (`#0a0a0a` app background
rising through three barely-distinguishable elevation steps to `#1f1f1f`),
one restrained blue accent used only where the user must act or notice
something changed, small type, tight spacing, soft 150ms transitions, and
almost no ornament. Nothing about it wants to be looked at for its own sake;
it wants to be readable in a glance during a live conversation and invisible
the rest of the time.

## Palette

Raw values, from `src/index.html`'s `:root`:

```css
--bg-app: #0a0a0a;
--bg-surface: #111111;
--bg-elevated: #191919;
--bg-hover: #1f1f1f;

--text-primary: #f5f5f5;
--text-secondary: #999999;
--text-muted: #555555;

--border: #222222;
--border-strong: #333333;

--accent: #3b82f6;
--accent-hover: #2563eb;

--success: #22c55e;
--warning: #d4a017;
--danger: #ef4444;
```

Semantic meaning:

| Token | Meaning | Decorative or data? |
| --- | --- | --- |
| `--bg-app` / `--bg-surface` / `--bg-elevated` / `--bg-hover` | Four-step elevation scale, darkest to lightest — depth, not brand color. | Decorative (layout only) |
| `--text-primary` / `--text-secondary` / `--text-muted` | Reading-priority scale: primary content, supporting/description text, placeholders and disabled text. | Decorative |
| `--border` / `--border-strong` | Hairline dividers (`--border`) vs. a border that needs to read as an active edge — focus rings, selected state (`--border-strong`, also used directly as the focus box-shadow color). | Decorative |
| `--accent` / `--accent-hover` | The single interactive color: primary buttons, links, focus rings, the "start session" CTA, selected-state borders. | **Carries meaning — reserved for interactive/actionable elements.** Do not reuse it as plain decoration; if something is blue, it means "you can act on this." |
| `--success` | Positive state (e.g. a completed save, a healthy connection). | Carries meaning — status only |
| `--warning` | Attention/caution state. | Carries meaning — status only |
| `--danger` | Destructive action or error state (delete confirmations, failed operations). | Carries meaning — status only |

Color is otherwise **absent by design** — the near-monochrome background is
the point of an overlay meant to go unnoticed. Any new UI should default to
grayscale and reach for `--accent`/`--success`/`--warning`/`--danger` only
when it needs to communicate one of those specific meanings.

## Typography

| Token | For | Notes |
| --- | --- | --- |
| `--font: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif` | All UI text | **'Inter' is declared but never actually loaded** — there is no `@font-face`, no bundled `.woff`, and no Google Fonts `<link>` anywhere in the repo. In practice every user sees the OS system font (`-apple-system`/`system-ui`), not Inter. Treat `--font`'s first value as aspirational; don't design around Inter's actual metrics, and if Inter is ever wanted for real, it needs to be added as a vendored asset (the Lit/marked/highlight.js pattern — no build step, no npm font package) or the token should be corrected to drop it. |
| `--font-mono: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace` | Code blocks, session transcripts, technical values | System monospace stack, same "declared, not loaded" caveat doesn't apply here — these are genuine OS-installed fonts. |
| `--font-size-xs` 11px / `-sm` 13px / `-base` 14px / `-lg` 16px / `-xl` 20px / `-2xl` 28px | Six-step type scale | `-base` (14px) is body text; `-2xl` is reserved for the rare hero/title moment (onboarding), not routine headings. |
| `--font-weight-normal` 400 / `-medium` 500 / `-semibold` 600 | The only three weights used | No bold (700) anywhere in tokens — `-semibold` is the ceiling for emphasis. |
| `--line-height: 1.6` | Global default | Generous for the small base size, since this UI is read during a live conversation under time pressure. |

## Structure and texture

- **Radius:** three steps — `--radius-sm` 4px (inputs, small controls),
  `--radius-md` 8px (cards, panels), `--radius-lg` 12px (larger containers).
  Nothing is fully rounded or sharp-cornered; the app avoids both extremes.
- **Borders over shadows for separation.** Most surfaces are distinguished by
  a 1px `--border`/`--border-strong` line, not elevation shadows — consistent
  with an overlay that should read as flat and unobtrusive, not floating.
- **The one deliberate shadow** is the app window's own drop shadow
  (`0 6px 24px rgba(0,0,0,0.45)`, `CheatingDaddyApp.js`) — it exists because
  the window floats over arbitrary video-call content and needs to read as a
  distinct layer against anything behind it. Elsewhere `box-shadow` is used
  as a focus ring (`0 0 0 1px var(--accent)`), not for elevation.
  `--transition: 150ms ease` is the one global animation speed, applied to
  those focus/hover states.
- **Spacing rhythm:** a six-step scale, `--space-xs` 4px through `--space-2xl`
  64px, doubling roughly at each step (4 · 8 · 16 · 24 · 40 · 64). Most
  in-component padding sits at `-sm`/`-md`; `-xl`/`-2xl` are reserved for
  page-level gaps (onboarding, empty states).
- **Signature motif: a UI designed to be positioned, shrunk, and made
  click-through.** `--sidebar-width: 220px` collapses to
  `--sidebar-width-collapsed: 60px`; the whole window is
  always-on-top, movable by keyboard shortcut, and can go click-through —
  this isn't a normal app chrome, it's an instrument meant to sit at the
  edge of the user's attention during a live call.
- **A large "legacy compatibility" token layer exists** (`--bg-primary`,
  `--text-color`, `--start-button-background`, etc.) — all aliases onto the
  tokens above, kept for older component code that hasn't been migrated to
  the newer names. New components should use the primary tokens (`--bg-app`,
  `--text-primary`, `--accent`, …), not the legacy aliases.

## Brand assets

`src/assets/` — flat folder, not organized by platform subfolder:

| File | For |
| --- | --- |
| `logo.png` (512×512) | Master app icon, source for the platform-specific formats below |
| `logo.ico` | Windows app/installer icon |
| `logo.icns` | macOS app icon |
| `src/assets/old/0.3/` | A frozen copy of the same three icon files from a previous version — historical, not in active use |
| `src/assets/onboarding/{welcome,security,context,customize,ready}.svg` | One illustration per onboarding step, named for the step it appears on |

There is no separate "brand" folder or style guide beyond these files and
the tokens above — this is a personal-scale project, not one with a
maintained design system doc.

## Voice

Copy is plain, direct, and second-person ("Enter your Gemini API key",
"Choose your profile") — instructional, not marketing-toned, inside the
app itself. Error and status copy states what happened plainly (see the
`Saving… / Saved HH:MM / Save failed` pattern for the profile editor,
decision D30) rather than softening or over-explaining.

**Off-limits, everywhere user-facing copy is written** (product pivoted away
from this framing — see D1 and `documentation/briefings/pitch.md`):

- Never describe the app as feeding answers, writing what to say, or doing
  anything covert/deceptive toward another party in the call. It is a memory
  aid the user consults on their own initiative, not a script generator.
- Don't lean on "cheat" as a selling point in new copy, even though the
  repository and package name (`cheating-daddy`) predate this rule and
  haven't been renamed.
