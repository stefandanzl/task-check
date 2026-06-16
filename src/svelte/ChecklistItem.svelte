<script lang="ts">
  import type {App} from 'obsidian'
  import type {TodoItem} from 'src/_types'
  import {navToFile, renderTaskHTML, toggleTodoItem} from 'src/utils'
  import {priorityTagStore, dateTagStore} from './viewStore'
  import {openTaskContextMenu} from './taskMenu'

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
    openTaskContextMenu(item, app, e, $priorityTagStore, $dateTagStore)
  }

  // Render the task HTML lazily (only for mounted tasks), so the markdown
  // pipeline doesn't run for filtered-out / collapsed / limit-hidden tasks.
  const taskHTML = $derived(renderTaskHTML(item, app, $priorityTagStore, $dateTagStore))

  // 1 = top-level, 2 = once-indented, ...
  const level = $derived(item.spacesIndented + 1)
  const indent = $derived(level === 1 ? 31 : 31 + (level - 1) * 36)

  const handleClick = (ev: MouseEvent) => {
    const t = ev.target as HTMLElement
    const anchor = t.closest('a')

    if (anchor) {
      ev.stopPropagation()
      if (anchor.dataset.type === 'link') {
        navToFile(app, anchor.dataset.filepath!, ev, item.line)
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
<li class="checklist-item" onclick={handleClick} oncontextmenu={handleContextMenu}>
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
    <span class="cm-list-{level} task-list-item-text"
      >{@html taskHTML}</span>
  </div>
  <span class="prio-level no-select">{targetPriority ?? '\u2007'}</span>
</li>

<style>
  li.checklist-item {
    display: flex;
    align-items: center;
    background-color: var(--checklist-listItemBackground);
    border-radius: var(--checklist-listItemBorderRadius);
    margin: 2px 0;
    cursor: pointer;
    transition: background-color 100ms ease-in-out;
    width: 100%;
    box-sizing: border-box;
    padding: 6px 0 6px 4px;
  }

  li.checklist-item:hover {
    background-color: var(--checklist-listItemBackground--hover);
  }

  .prio-level {
    padding: 1px 8px;
    font-size: var(--font-smallest);
    color: var(--color-accent);
    border-radius: 50%;
  }

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
