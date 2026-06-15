**LOOKING FOR ANOTHER MAINTAINER TO HELP OUT** There's quite a bit of work to do on this plugin still and i've been neglecting it because work is too busy. I would love some help, or at least someone who could approve PRs and triage issues. Send me an email at delashum@gmail.com if you're interested.

# obsidian-checklist-plugin

This plugin consolidates checklists from across files into a single view.

![screenshot-main](https://raw.githubusercontent.com/delashum/obsidian-checklist-plugin/master/images/screenshot-two-files.png)

## Usage

After enabling this plugin, you will see the checklist appear in the right sidebar. If you do not you can run the `Checklist: Open View` command from the command palette to get it to appear.

By default block of checklist items you tag with `#todo` will appear in this sidebar.

You can complete checklist items by checking them off in your editor (e.g. `- [ ]` -> `- [x]`) or by clicking a checklist item in the sidebar which will update your `.md` file for you

## Configuration

![screenshot-settings](https://raw.githubusercontent.com/delashum/obsidian-checklist-plugin/master/images/screenshot-settings.png)

**Tag name:** The default tag to lookup checklist items by is `#todo`, but may be changed to whatever you like

**Show completed?:** By default the plugin will only show uncompleted tasks, and as tasks are completed they will filter out of the sidebar. You may choose to show all tasks

![screenshot-completed](https://raw.githubusercontent.com/delashum/obsidian-checklist-plugin/master/images/screenshot-show-completed.png)

**Show All Todos In File?:** By default the plugin will only show tasks in the block that is tagged - changing this will show all tasks present in a file if the tag is present anywhere on the page.

**Group by:** Use the **Group by** dropdown in the sidebar header to switch how tasks are organized:

- **Tag** – group by tag, including sub-tags (e.g. `#todo/work`). Groups appear in the order they first appear in your files (or last, depending on sort order)
- **Note** – group by the file each task lives in
- **Date** – only tasks with a due-date tag, bucketed into Overdue / Today / Tomorrow / This Week / This Month / Future
- **Priority** – only tasks with a priority tag, bucketed by priority level (drag tasks between levels to re-prioritize)

The **Date** and **Priority** options only appear once you've configured a date tag / priority tag.

![screenshot-tags](https://raw.githubusercontent.com/delashum/obsidian-checklist-plugin/master/images/screenshot-sub-tag.png)

**Sort order:** By default checklist items will appear in the order they appear in the file, with files ordered with the oldest at the top. This can be changed to show the newest files at the top.

## Search & filtering

The search box at the top of the sidebar filters tasks live. You can mix free-text search with structured **date** and **priority** filters.

**Text**

- Space-separated words must all match (AND): `report draft`
- `OR` matches either side: `report OR invoice`
- `"quoted phrases"` match exactly: `"final report"`

**Date filters**

Filter by the due-date tag (e.g. `#date/2026-06-15`). Both natural-language and symbol forms work:

- `before:2026-06-15`, `after:2026-06-15`, `on:2026-06-15`
- `due:today`, `due:tomorrow`, `due:overdue`, `due:week`, `due:month`
- `date>=2026-06-01`, `date<2026-07-01`, `date=2026-06-15` (also `>` and `<=`)
- Dates may be full (`YYYY-MM-DD`) or partial (`YYYY-MM`, `YYYY`)

**Priority filters**

Filter by the priority tag (e.g. `#prio/3`):

- `prio>2`, `prio<5`, `prio>=1`, `prio<=4`, `prio=3`
- Negative priorities work too: `prio>=-2`

**Notes**

- The `date…` / `prio…` keywords follow **your configured tag names** — if you renamed the date tag to `due`, write `due>=2026-06-01`; if your priority tag is `p`, write `p>2`.
- Symbol operators are written with no space between the keyword and the operator: `date>=2026-06-01`, not `date >= …`.
- Filters combine: `prio>=3 due:week report` means priority ≥ 3, due this week, and containing "report". A task with no date/priority never matches the corresponding filter.

## Custom Checkbox Styling

This plugin supports custom checkbox states and styling! You can use something like the [Obsidian Checkbox Snippets](https://github.com/deathau/obsidian-snippets#checkboxes) to add visual distinction to different task states:

- `[/]` - In progress (accent color filled)
- `[!]` - Important (red background)
- `[?]` - Question (yellow background)
- `[>]` - Deferred (chevron icon)
- `[-]` - Cancelled (line icon)

Simply install the CSS snippet and your checkboxes in the plugin sidebar will match your editor's styling exactly!

## Glob File Matching

The "Include Files" setting uses Glob file matching. Specifically the plugin uses [minimatch](https://github.com/isaacs/minimatch) to match the file pattern - so any specific oddities will come from that plugin.

Couple of common examples to help structure your glob:

- `!{_templates/**,_archive/**}` will include everything except for the two directories `_templates` and `_archive`.
- `{Daily/**,Weekly/**}` will only include files in the `Daily` & `Weekly` directories

I recommend the [Digital Ocean Glob Tool](https://www.digitalocean.com/community/tools/glob) for figuring out how globs work - although the implementation is not identical to minimatch so there might be slight differences.
