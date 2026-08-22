<script lang="ts">
  import {Component, MarkdownRenderer, type App} from 'obsidian'
  import type {TodoItem} from 'src/_types'
  import {getTaskDisplayText, navToFile, toggleTodoItem} from 'src/utils'
  import {formatRelativeDateDiff} from 'src/utils/helpers'
  import {priorityTagStore, dateTagStore} from './viewStore'
  import {openTaskContextMenu} from './taskMenu'
  import {renderWhenVisible} from './viewActions'

  let {
    item,
    app,
    draggable = false,
    targetPriority = null,
    ondragstart = () => {},
    ondragend = () => {},
  }: {
    item: TodoItem
    app: App
    draggable?: boolean
    targetPriority?: number | null
    ondragstart?: (e: DragEvent) => void
    ondragend?: (e: DragEvent) => void
  } = $props()

  const handleContextMenu = (e: MouseEvent) => {
    openTaskContextMenu(item, containerEl, app, e, $priorityTagStore, $dateTagStore)
  }

  // $state because the span (and thus the binding) only exists once the row is
  // visible — the assignment when the {#if} renders must re-trigger the effect.
  let containerEl = $state<HTMLElement | undefined>()

  // Lazy row rendering: the <li> mounts as an empty skeleton (see .skeleton
  // CSS below); its whole content — checkbox, indent guides, markdown, pills —
  // is only constructed once the row nears the viewport (renderWhenVisible
  // action on the <li>, 200px pre-render buffer). One-shot: once visible it
  // stays materialized, so scrolling back doesn't thrash.
  let isVisible = $state(false)
  const markVisible = () => {
    isVisible = true
  }

  // Render the task markdown with Obsidian's own renderer (replaces the old
  // custom marked pipeline). containerEl only exists once the row content has
  // been constructed ({#if isVisible} below), so this effect — and Obsidian's
  // render pipeline — is naturally deferred until the row is near the viewport.
  $effect(() => {
    if (!containerEl) return
    const md = getTaskDisplayText(item, $priorityTagStore, $dateTagStore)
    containerEl.innerHTML = ''
    // Obsidian's renderer needs a Component to own the rendered children
    // (internal-link handling, hover popovers). Fresh one per render; the
    // teardown unloads it on re-render AND when the item unmounts.
    const renderer = new Component()
    renderer.load()
    MarkdownRenderer.render(app, md, containerEl, item.filePath, renderer)
    return () => renderer.unload()
  })

  // 1 = top-level, 2 = once-indented, ...
  const level = $derived(item.spacesIndented + 1)
  const indent = $derived(level === 1 ? 31 : 31 + (level - 1) * 36)

  const showDatePill = $derived(!!item.date)
  const datePillLabel = $derived(item.date ? formatRelativeDateDiff(item.date) : '')
  const datePillAria = $derived(item.dateTag ?? '')

  const handleClick = (ev: MouseEvent) => {
    const t = ev.target as HTMLElement
    const anchor = t.closest('a')

    if (anchor) {
      ev.stopPropagation()
      if (anchor.classList.contains('internal-link') && anchor.dataset.href) {
        const dest = app.metadataCache.getFirstLinkpathDest(anchor.dataset.href, item.filePath)
        if (dest) navToFile(app, dest.path, ev, item.line)
      }
      return
    }
    navToFile(app, item.filePath, ev, item.line)
  }

  const handleDragStart = (e: DragEvent) => {
    e.dataTransfer?.setData('text/plain', `${item.filePath}:${item.line}`)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
    ondragstart(e)
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<li class="checklist-item" class:family-context={item.isFamilyContext} 
  class:skeleton={!isVisible} use:renderWhenVisible={markVisible} 
  onclick={handleClick} oncontextmenu={handleContextMenu}
  >
  {#if isVisible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="cm-active HyperMD-list-line HyperMD-list-line-{level} cm-line task-list-item-line"
    data-task={item.taskStatus}
    dir="ltr"
    // style="text-indent: -{indent}px; padding-inline-start: {indent}px;"
    {draggable}
    ondragstart={handleDragStart}
    {ondragend}>
    {#each Array(level - 1) as _}
      <span class="cm-hmd-list-indent cm-hmd-list-indent-{level}"
        ><span class="cm-indent"> </span></span>
    {/each}
    <!-- svelte-ignore a11y_missing_attribute -->
    <!-- <img class="cm-widgetBuffer" aria-hidden="true"> -->
    <!-- <div class="label-center" > -->
    <label class="task-list-label" contenteditable="false">
      <input
        type="checkbox"
        class="task-list-item-checkbox"
        data-task={item.taskStatus}
        checked={item.taskStatus !== ' '}
        onclick={ev => {
          toggleTodoItem(item, app)
          ev.stopPropagation()
        }} />
    </label>
    <!-- svelte-ignore a11y_missing_attribute -->
    <!-- <img class="cm-widgetBuffer" aria-hidden="true"> -->
    <!-- </div> -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <span bind:this={containerEl} class="cm-list-{level} task-list-item-text"
      ></span>
  </div>
  {#if showDatePill}
    <span class="date-pill no-select" data-cat={item.dateCategory} aria-label={datePillAria}>{datePillLabel}</span>
  {/if}
  {#if targetPriority != null}
    <span class="prio-level no-select" aria-label={`Priority level ${targetPriority}`}>{targetPriority}</span>
  {/if}
  {/if}
</li>

<style>
  li.checklist-item {
    display: flex;
    align-items: center;
    background-color: var(--checklist-listItemBackground);
    border-radius: var(--checklist-listItemBorderRadius);
    margin: 2px 2px 2px 0;
    cursor: pointer;
    transition: background-color 100ms ease-in-out;
    width: 100%;
    box-sizing: border-box;
    padding: 6px 4px 6px 4px;
    user-select: none;
    -webkit-user-select: none;

    /* Performance Boost for Paint/Layout: */
    content-visibility: auto;
    contain-intrinsic-size: auto 34px; /* Estimated hight incl. padding */
  }

  /* Un-rendered skeleton rows: content-visibility only reserves the intrinsic
     size while OFF-screen; an on-screen-yet-unrendered empty row would collapse
     to its padding (visible as a flash at initial mount). Keep skeletons at
     full height until their content is constructed. */
  li.checklist-item.skeleton {
    min-height: 34px;
  }

  li.checklist-item:hover {
    background-color: var(--checklist-listItemBackground--hover);
  }

  /* Family-context rows: dimmed, non-interactive context shown alongside a
     matched task. Opacity only for now (no font change) — tweak here. */
  li.checklist-item.family-context {
    opacity: 0.5;
  }
  li.checklist-item.family-context:hover {
    background-color: var(--checklist-listItemBackground);
  }

  .prio-level {
    padding: 1px 6px;
    font-size: var(--font-smallest);
    color: var(--color-accent);
    border: 1px solid currentColor;
    border-radius: 50%;
    margin: 0 2px;
  }

  /* Due-date urgency pill. Background is driven by [data-cat] so the same
     category→color mapping can be reused elsewhere. */
  .date-pill {
    padding: 1px 6px;
    margin-inline-end: 2px;
    font-size: var(--font-smallest);
    font-weight: 600;
    /* line-height: 1.4; */
    color: #fff;
    border-radius: 999px;
    white-space: nowrap;
    background-color: var(--text-faint);
    margin: 0 2px;
  }
  .date-pill[data-cat='overdue'] { background-color: var(--taskcheck-date-overdue); }
  .date-pill[data-cat='today'] { background-color: var(--taskcheck-date-today); }
  .date-pill[data-cat='tomorrow'] { background-color: var(--taskcheck-date-tomorrow); }
  .date-pill[data-cat='thisWeek'] { background-color: var(--taskcheck-date-week); }
  .date-pill[data-cat='thisMonth'] { background-color: var(--taskcheck-date-month); }
  .date-pill[data-cat='future'] { background-color: var(--taskcheck-date-future); }

  li > .HyperMD-list-line {
    flex: 1;
    min-width: 0; /* lets long content wrap instead of overflowing */
  }

  .task-list-item-line {
    display: flex;
    align-items: center;
    height: 100%;
  }
  .task-list-item-text {
    flex: 1; /* claim all remaining width to the right of the checkbox */
    min-width: 0;
    padding-inline-start: 4px;
    overflow-wrap: anywhere;
  }

  /* Has to be scaled up because of smaller font size used for sidepanel (?) */
  .HyperMD-list-line.cm-line.task-list-item-line .cm-indent::before {
    margin-inline-start: calc(var(--indentation-guide-editing-indent) * 1.2);
  }
</style>
