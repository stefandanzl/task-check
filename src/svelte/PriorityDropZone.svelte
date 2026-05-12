<script lang="ts">
  import type { App } from 'obsidian'
  import type { LookAndFeel, TodoItem } from 'src/_types'
  import ChecklistItem from './ChecklistItem.svelte'

  let {
    position,
    items = [],
    targetPriority = null,
    lookAndFeel = 'classic',
    app,
    isDragging = false,
    shouldHide = false,
    ondrop = () => {},
    ondragstart = () => {},
    ondragend = () => {}
  }: {
    position: 'above' | 'below' | 'into'
    items?: TodoItem[]
    targetPriority?: number | null
    lookAndFeel?: LookAndFeel
    app?: App
    isDragging?: boolean
    shouldHide?: boolean
    ondrop?: (e: CustomEvent) => void
    ondragstart?: (e: CustomEvent) => void
    ondragend?: () => void
  } = $props()

  let isDragOver = $state(false)
  // svelte-ignore non_reactive_update
  let dropZoneEl: HTMLDivElement

  // 'into' is droppable for all zones to set priority to that zone's value
  const isDroppable = true

  function handleDragOver(e: DragEvent) {
    if (!isDroppable || !isDragging) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    isDragOver = true
  }

  function handleDragLeave(e: DragEvent) {
    if (!dropZoneEl) return
    // Check if we're actually leaving this element (not entering a child)
    const relatedTarget = e.relatedTarget as Node
    if (!relatedTarget || !dropZoneEl.contains(relatedTarget)) {
      isDragOver = false
    }
  }

  function handleDrop(e: DragEvent) {
    if (!isDroppable || !isDragging) return
    e.preventDefault()
    isDragOver = false
    const itemId = e.dataTransfer?.getData('text/plain')
    if (itemId) {
      ondrop(new CustomEvent('drop', { detail: { itemId, dropPosition: position, targetPriority } }))
    }
    ondragend()
  }

  function forwardDragStart(item: TodoItem) {
    return (_e: DragEvent) => {
      ondragstart(new CustomEvent('dragStart', { detail: { item } }))
    }
  }

  function forwardDragEnd() {
    ondragend()
  }

  $effect(() => {
    if (!isDragging) isDragOver = false
  })

  const displayLabel = $derived(targetPriority === null ? 'Neutral' : `Priority ${targetPriority}`)
  const zoneClass = $derived(`${position}-zone ${targetPriority === null ? 'neutral' : targetPriority > 0 ? 'positive' : 'negative'}`)
  const itemsKey = $derived(items.map(i => `${i.filePath}:${i.line}`).join('|'))
</script>

{#if position === 'into'}
  {#if targetPriority === null}
    <!-- Neutral zone: always droppable to remove priority, shows items if any -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="neutral-zone {zoneClass}"
      class:has-items={items.length > 0}
      class:drop-visible={isDragging && items.length === 0}
      class:hovered={isDragOver}
      bind:this={dropZoneEl}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
    >
      {#if items.length > 0 && app}
        <div class="zone-header">
          <span class="zone-label">{displayLabel}</span>
          <span class="zone-count">{items.length}</span>
        </div>
        {#key itemsKey}
        <ul class="zone-items">
          {#each items as item (item.filePath + ':' + item.line)}
            <ChecklistItem
              {item}
              lookAndFeel={lookAndFeel ?? 'classic'}
              {app}
              draggable={true}
              ondragstart={forwardDragStart(item)}
              ondragend={forwardDragEnd}
            />
          {/each}
        </ul>
        {/key}
      {:else if isDragging}
        <span class="neutral-label">Drop here to remove priority</span>
      {/if}
    </div>
  {:else}
    {#if items.length > 0 && app}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="priority-content {zoneClass}"
        class:hovered={isDragOver}
        bind:this={dropZoneEl}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
      >
        <div class="zone-header">
          <span class="zone-label">{displayLabel}</span>
          <span class="zone-count">{items.length}</span>
        </div>
        {#key itemsKey}
        <ul class="zone-items">
          {#each items as item (item.filePath + ':' + item.line)}
            <ChecklistItem
              {item}
              lookAndFeel={lookAndFeel ?? 'classic'}
              {app}
              draggable={true}
              ondragstart={forwardDragStart(item)}
              ondragend={forwardDragEnd}
              {targetPriority}
            />
          {/each}
        </ul>
        {/key}
      </div>
    {:else}
      <!-- Empty priority zone: always visible as a drop target -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="priority-drop-zone {zoneClass}"
        class:visible={isDragging || items.length === 0}
        class:hovered={isDragOver}
        bind:this={dropZoneEl}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
        ondrop={handleDrop}
      >
        <span class="priority-drop-label">Drop to set {displayLabel}</span>
      </div>
    {/if}
  {/if}
{:else}
  {#if !shouldHide}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="drop-zone {zoneClass}"
      class:visible={isDragging}
      class:hovered={isDragOver}
      bind:this={dropZoneEl}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
    >
      <div class="drop-indicator"></div>
    </div>
  {/if}
{/if}

<style>
  .drop-zone {
    height: 0;
    overflow: hidden;
    transition: height 0.15s ease-in-out, background-color 0.1s;
    border-radius: 4px;
  }

  .drop-zone.visible {
    height: 10px;
    background: var(--background-modifier-hover);
  }

  .drop-zone.hovered {
    height: 24px;
    background: var(--interactive-accent);
    opacity: 0.4;
  }

  .drop-indicator {
    height: 100%;
  }

  .neutral-zone {
    border-radius: 4px;
    border: 1px dashed transparent;
    transition: border-color 0.1s, background-color 0.1s;
  }

  .neutral-zone.drop-visible {
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-color: var(--text-faint);
    background: var(--background-modifier-hover);
  }

  .neutral-zone.hovered {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-border-hover);
  }

  .neutral-label {
    font-size: var(--font-smallest);
    font-style: italic;
    color: var(--text-muted);
    pointer-events: none;
  }

  .neutral-zone.hovered .neutral-label {
    color: var(--interactive-accent);
  }

  .priority-content {
    /* margin: 4px 0; */
    border-radius: 4px;
    border: 1px dashed transparent;
    transition: border-color 0.1s, background-color 0.1s;
  }

  .priority-content.hovered {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-border-hover);
  }

  .priority-drop-zone {
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    border: 1px dashed transparent;
    transition: border-color 0.1s, background-color 0.1s;
  }

  .priority-drop-zone.visible {
    border-color: var(--text-faint);
    background: var(--background-modifier-hover);
  }

  .priority-drop-zone.hovered {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-border-hover);
  }

  .priority-drop-label {
    font-size: var(--font-smallest);
    font-style: italic;
    color: var(--text-muted);
    pointer-events: none;
  }

  .priority-drop-zone.hovered .priority-drop-label {
    color: var(--interactive-accent);
  }

  .zone-header {
    /* display: flex; */
    display: none;
    justify-content: space-between;
    align-items: center;
    padding: 2px 6px;
    font-size: var(--font-smallest);
    font-weight: 500;
  }

  .zone-label {
    font-weight: 500;
  }

  .zone-count {
    background-color: var(--background-modifier-border);
    border-radius: 10px;
    padding: 1px 6px;
    font-size: var(--font-smallest);
  }

  .positive .zone-label {
    color: var(--text-success);
  }

  .negative .zone-label {
    color: var(--text-warning);
  }

  .neutral .zone-label {
    color: var(--text-muted);
  }

  .zone-items {
    list-style: none;
    padding: 0;
    margin: 0;
    padding-inline-start: initial !important;
  }
</style>
