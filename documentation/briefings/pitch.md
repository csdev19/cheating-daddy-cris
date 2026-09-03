# What this is

You're in an interview, a sales call, or a negotiation. Somewhere in your
notes is the number, the decision, or the name you need right now — but it's
in a CV, a doc, an old email, not in your head. The meeting doesn't pause
while you go find it. Ten minutes later you remember, too late to matter.

The usual workarounds don't hold up. A cheat sheet on a second monitor only
covers what you thought to write down beforehand — nothing that comes up
live. Pausing to search your notes mid-call kills the conversation's
momentum. And a generic AI copilot that listens and answers everything
turns the meeting into you reading its output, which is its own kind of
obvious.

## What it is

It's a transparent, always-on-top overlay that quietly listens to a meeting
— what it sees on your screen and what it hears — and holds all of it,
plus your own prior material, in one running thread. It only speaks when
you ask it to, with one shortcut. The rest of the time it's just
remembering, so that when you press it, the answer is already assembled
from what you actually know, not generated from scratch.

Setup is three steps:

```
1. bun install
2. bun run start
```

Enter a Gemini API key, pick a profile — Interview, Sales Call, Business
Meeting — and start a session. The overlay positions anywhere with
`Ctrl/Cmd + Arrow Keys` and turns click-through with `Ctrl/Cmd + M`, so it
never gets in the way of the call itself.

## Why it's different

**It's memory, not a teleprompter.** The app doesn't tell you what to say —
it reminds you of what you already know but forgot in the moment: a figure
from your own CV, a decision your team already made, a thread from earlier
in this same meeting. Ask it something you never wrote down and it says so,
rather than inventing an answer that sounds confident.

**Your material stays yours, on your disk.** A profile is a plain folder of
markdown files — your notes, your context, your checklist — that you can
open in any editor, back up, or version-control. There's no database that
owns them and no cloud sync; the app is one more writer of files you
already control.

**It listens the whole meeting, but answers on your terms.** Screen and
audio are captured continuously so the thread is complete when you need it,
but the app stays silent until you press the shortcut. No running
commentary, no answers you didn't ask for, and no model calls burned on
every turn of conversation.

**The window is built to not be a distraction on your side of the call.**
It's positionable, click-through when you need your cursor back, and
designed to stay out of screen shares and recordings of the call itself —
so consulting your own notes doesn't turn into a visible interruption.

## Who it's for

Built for anyone who walks into a meeting with prior material that matters
— a candidate interviewing with their own project history in their head, a
salesperson with account context, someone running a negotiation who prepared
figures they don't want to fumble recalling live.

It isn't for someone who wants an AI to conduct the conversation for them:
it won't draft your answers or feed you a script, and testing it that way —
asking it something without the other side actually asking a question first
— won't get a response. It also isn't yet a polished, permission-hardened
product: screen-recording code signing is unresolved, Linux support is
explicitly experimental, and it's Gemini-only today.
