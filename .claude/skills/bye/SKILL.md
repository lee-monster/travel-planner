---
description: "End session: record work summary to memory, clean up stale memories, and exit. Use when finishing a work session."
user-invocable: true
---

# Session End Skill (/bye)

Gracefully end the current work session by recording progress and cleaning up memory.

## Process

### Step 1: Summarize Current Session
1. Run `git log --oneline -5` to see commits made in this session
2. Run `git status` to check any uncommitted changes
3. Identify the key tasks accomplished in this conversation

### Step 2: Save Session Record to Memory
1. Read `MEMORY.md` from the memory directory
2. Create a new project memory file with today's date (e.g., `project_<topic>_<YYYY_MM_DD>.md`)
3. Include:
   - What was done (commits, features, fixes)
   - Current status (what's pending, blocked, or in progress)
   - Any decisions or context useful for next session
4. Add the new entry to `MEMORY.md` index

### Step 3: Clean Up Stale Memories
1. Review existing project memory entries in `MEMORY.md`
2. For memories older than 2 weeks that have been superseded by newer entries:
   - If the older memory's content is fully covered by a newer one, delete the old file and remove from index
   - If partially relevant, update the old memory to remove outdated parts
3. Keep feedback, user, and reference memories (these don't expire)
4. Keep the `MEMORY.md` index concise (under 200 lines)

### Step 4: Warn About Uncommitted Work
- If `git status` shows uncommitted changes, warn the user before exiting
- Ask if they want to commit first, or proceed with exit

### Step 5: Exit
- Show a brief summary of what was recorded
- Say goodbye in Korean
- The user will type /exit themselves, or you can suggest they do so

## Important Notes
- Always write memories in the format with frontmatter (name, description, type)
- Use absolute dates, not relative ones
- Do NOT delete feedback or reference memories during cleanup
- If nothing meaningful was done in the session, skip memory creation and just exit
- Keep the goodbye message short and friendly
