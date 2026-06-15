# Bug Report: Svelte Key Duplication with Date Tags

## Error

Uncaught Error: https://svelte.dev/e/each_key_duplicate

```bash
plugin:obsidian-checklist-plugin:13 Uncaught Error: https://svelte.dev/e/each_key_duplicate
    at Ys (plugin:obsidian-checklist-plugin:13:84)
    at eval (plugin:obsidian-checklist-plugin:57:5096)
    at Wi (plugin:obsidian-checklist-plugin:56:27553)
    at Pr (plugin:obsidian-checklist-plugin:56:28780)
    at zr (plugin:obsidian-checklist-plugin:56:23741)
    at Mt (plugin:obsidian-checklist-plugin:56:24739)
    at Lt (plugin:obsidian-checklist-plugin:57:4539)
    at eval (plugin:obsidian-checklist-plugin:134:1940)
    at eval (plugin:obsidian-checklist-plugin:57:2510)
    at Wi (plugin:obsidian-checklist-plugin:56:27553)
```

## Setup Configuration

- `todoPageName`: Array of tags `["todo", "studium", "prio", "date"]`
- `priorityTag`: `"prio"`
- `dateTag`: `"date"`
- `dateGrouping`: Disabled (always tested as disabled)

## Working Scenarios ✅

- Multi-tagging works fine: `#studium/test1 #studium/test2 - [ ] Task`
- `prio` tag works in both contexts:
  - As regular tag in `todoPageName`
  - As `priorityTag` for priority grouping
  - No key duplication errors

## Failing Scenario ❌

- `date` tag causes key duplication when used in both contexts:
  - As regular tag in `todoPageName`
  - As `dateTag` for date functionality
- Example task: `#date/2026-06-15 - [ ] Task`
- Results in Svelte `each_key_duplicate` error

## Root Cause Analysis

**User's diagnosis:** "The ui has been designed sloppily where there is some sort of if filtering applied after trying to create the task items from regular task view and date mode view together!!!"

**Expected behavior:** Grouping modes should be completely exclusive:

```javascript
if (dateGrouping && dateTag) {
  // Date groups ONLY
} else if (prioGrouping && priorityTag) {
  // Priority groups ONLY
} else {
  // Regular tag/page groups ONLY
}
```

Actual behavior: Something is creating duplicate TodoItem objects with identical filePath:line combinations in the same group, despite the mutually exclusive grouping logic.

Applied Fixes (Did NOT resolve issue)
Added unique keys to ChecklistGroup.svelte: ${group.id}-${item.filePath}:${item.line}
Added unique keys to PriorityDropZone.svelte: ${position}-${targetPriority}-${item.filePath}:${item.line}
Changed date group IDs from date:${category} to date-group:${category}
Status: Error persists after all key fixes

Key Question
Why does prio work flawlessly in both regular and priority contexts, but date fails in regular and date contexts - despite the same architectural pattern?
