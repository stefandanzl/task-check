<script lang="ts">
  import type { App } from "obsidian"

  import type { LookAndFeel, TodoItem } from "src/_types"
  import { navToFile, toggleTodoItem } from "src/utils"
  import CheckCircle from "./CheckCircle.svelte"

  let {
    item,
    lookAndFeel,
    app,
    draggable = false,
    targetPriority = null,
    ondragstart = () => {},
    ondragend = () => {}
  }: {
    item: TodoItem
    lookAndFeel: LookAndFeel
    app: App
    draggable?: boolean
    targetPriority?: number | null
    ondragstart?: (e: DragEvent) => void
    ondragend?: (e: DragEvent) => void
  } = $props()

  let contentDiv: HTMLDivElement

  const toggleItem = async (item: TodoItem) => {
    toggleTodoItem(item, app)
  }

  const handleClick = (ev: MouseEvent, item?: TodoItem) => {
    const target: HTMLElement = ev.target as any
    if (target.tagName === "A") {
      ev.stopPropagation()
      if (target.dataset.type === "link") {
        navToFile(app, target.dataset.filepath, ev, item?.line)
      } else if (target.dataset.type === "tag") {
        // goto tag
      }
    }
    else {
      navToFile(app, item.filePath, ev, item?.line)
    }
  }

  const handleDragStart = (e: DragEvent) => {
    const dt = e.dataTransfer
    if (dt) {
      dt.setData('text/plain', `${item.filePath}:${item.line}`)
      dt.effectAllowed = 'move'
    }
    ondragstart(e)
  }

  const handleDragEnd = (e: DragEvent) => {
    ondragend(e)
  }

  $effect(() => {
    if (contentDiv) contentDiv.innerHTML = item.rawHTML
  })
</script>

<li class={`${lookAndFeel} HyperMD-list-line HyperMD-task-line cm-line`} data-task={item.taskStatus} draggable={draggable} ondragstart={handleDragStart} ondragend={handleDragEnd}>
  <button
    class="toggle"
    onclick={(ev) => {
      toggleItem(item)
      ev.stopPropagation()
    }}
  >
    <CheckCircle taskStatus={item.taskStatus} />
  </button>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div bind:this={contentDiv} onclick={(ev) => handleClick(ev, item)} class="content cm-s-obsidian"></div>
  {#if targetPriority}
  <span class="prio-level">{targetPriority}</span>
  {/if}
</li>

<style>
  li {
    display: flex;
    align-items: center;
    background-color: var(--checklist-listItemBackground);
    border-radius: var(--checklist-listItemBorderRadius);
    margin: var(--checklist-listItemMargin);
    cursor: pointer;
    transition: background-color 100ms ease-in-out;
  }
  li:hover {
    background-color: var(--checklist-listItemBackground--hover);
  }
  .toggle {
    padding: var(--checklist-togglePadding);
    background: transparent;
    box-shadow: var(--checklist-listItemBoxShadow);
    flex-shrink: 1;
    width: initial;
  }
  .content {
    padding: var(--checklist-contentPadding);
    flex: 1;
    font-size: var(--checklist-contentFontSize);
  }
  .compact {
    bottom: var(--checklist-listItemMargin--compact);
  }
  .compact > .content {
    padding: var(--checklist-contentPadding--compact);
  }
  .compact > .toggle {
    padding: var(--checklist-togglePadding--compact);
  }
  .toggle:hover {
    opacity: 0.8;
  }
  .prio-level {
    padding: 1px 6px;
    font-size: var(--font-smallest);
    color: var(--color-accent);
  }
</style>
