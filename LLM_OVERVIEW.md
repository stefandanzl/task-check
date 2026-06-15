# Checklist Plugin - LLM Overview

## Purpose
This Obsidian plugin consolidates checklists from across all files in a vault into a single sidebar view, making it easy to track and manage tasks without opening individual files.

## Core Functionality
- Scans markdown files for checkbox items (`- [ ]` and `- [x]`)
- Groups and displays them in a right sidebar pane
- Allows checking/unchecking items directly in the sidebar (updates source files)
- Supports custom checkbox states (e.g., `[/]`, `[!]`, `[?]`, `[>]`, `[-]`)

## Task Detection
Tasks are identified by:
- **Tag-based**: Default tag `#todo` (configurable) - finds checkboxes in blocks tagged with this tag
- **All-in-file mode**: If a file contains the tag anywhere, shows ALL checkboxes in that file
- **Empty tag mode**: Can capture all checkboxes regardless of tags

## Key Features

### Grouping & Organization
- **Group by**: Tag or Page/File
- **Sub-groups**: Can create hierarchical grouping
- **Tag hiding**: Can hide specific tags from view
- **Collapsible groups**: Each group can be collapsed/expanded

### Sorting
Multiple sort options for items, groups, and sub-groups:
- Created time (new→old, old→new)
- Modified time (new→old, old→new)  
- Alphabetical (A→Z, Z→A)
- Base tag priority (can put main tag first when sorting by tags)

### Priority System
- Uses `#prio/N` tag format (e.g., `#prio/1`, `#prio/2`)
- Configurable priority tag name (default: `prio`)
- Supports priority-based grouping and sorting
- Drag-and-drop reordering between priority groups

### Due Dates
- Uses `#date/YYYY-MM-DD` tag format (e.g., `#date/2026-06-15`)
- Configurable date tag name (default: `date`)
- Supports date-based grouping

### Display Controls
- **Show/hide completed**: Can filter out completed tasks
- **Task limiting**: Can limit tasks per group with expandable "show all" button
- **Active file filter**: Can show only tasks from currently active file
- **Compact/Classic view modes**

### Search & Navigation
- **Search functionality**: Filter tasks by text search
- **Search query persistence**: Remembers last search on restart
- **Commands**: 
  - Open checklist pane
  - Refresh list
  - Task text helper (inserts tag + checkbox)
  - Focus search input

### File Filtering
- **Glob pattern matching**: Include/exclude specific files or directories
- Examples: `!{_templates/**,_archive/**}` excludes those directories

## Technical Architecture
- **Framework**: Svelte 5 (for UI components)
- **Storage**: Uses Obsidian's plugin data store for settings
- **File watching**: Monitors file changes for auto-refresh
- **View management**: Custom Obsidian view type in sidebar
- **State management**: Svelte stores for reactive UI updates

## Main Settings
- Multiple tag names supported (newline-separated)
- Auto-refresh toggle (for performance on large vaults)
- Group by (tag/page)
- Sort directions (items, groups, sub-groups)
- Priority and date tag configuration
- Visual styling options
- File inclusion patterns

## Commands Available
- `Checklist: Open View` - Shows the checklist sidebar
- `Checklist: Refresh List` - Manually refreshes task list  
- `Task text helper` - Inserts tag + checkbox format
- `Open search` - Focuses search input

## Important Notes for Development
- Plugin uses custom checkbox state detection (not just `[ ]` and `[x]`)
- Settings changes trigger different update paths (some require regrouping, some just repaint)
- View maintains state for collapsed sections and hidden tags
- Tasks are indexed by file path for efficient updates
- Uses Obsidian's Markdown view rendering for consistent styling

## Use Cases
- Task management across project files
- Daily todo tracking
- Cross-file project overviews
- Meeting action items distributed across notes
- Reading/checklist management for research notes