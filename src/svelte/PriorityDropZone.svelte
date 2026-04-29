<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import type { App } from 'obsidian'
  import type { LookAndFeel, TodoItem } from 'src/_types'
  import ChecklistItem from './ChecklistItem.svelte'

  export let position: 'above' | 'below' | 'into'
  export let items: TodoItem[] = []
  export let targetPriority: number | null
  export let lookAndFeel: LookAndFeel = 'classic'
  export let app: App | undefined = undefined
  export let isDragging: boolean = false
  export let shouldHide: boolean = false

  const dispatch = createEventDispatcher()
  let isDragOver = false
  let dropZoneEl: HTMLDivElement

  // 'into' is only droppable for the neutral zone (removes priority tag)
  $: isDroppable = position !== 'into' || targetPriority === null

  function handleDragOver(e: DragEvent) {
    if (!isDroppable || !isDragging) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    isDragOver = true
  }

  function handleDragLeave(e: DragEvent) {
    if (!dropZoneEl) return
    const rect = dropZoneEl.getBoundingClientRect()
    if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
      isDragOver = false
    }
  }

  function handleDrop(e: DragEvent) {
    if (!isDroppable || !isDragging) return
    e.preventDefault()
    isDragOver = false
    const itemId = e.dataTransfer?.getData('text/plain')
    if (itemId) {
      dispatch('drop', { item: { id: itemId }, dropPosition: position, targetPriority })
    }
    dispatch('dragEnd')
  }

  function forwardDragStart(e: CustomEvent) {
    dispatch('dragStart', { item: e.detail.item })
  }

  function forwardDragEnd() {
    dispatch('dragEnd')
  }

  $: if (!isDragging) isDragOver = false

  $: displayLabel = targetPriority === null ? 'Neutral' : `Priority ${targetPriority}`
  $: zoneClass = `${position}-zone ${targetPriority === null ? 'neutral' : targetPriority > 0 ? 'positive' : 'negative'}`
</script>

{#if position === 'into'}
  {#if targetPriority === null}
    <!-- Neutral zone: always droppable to remove priority, shows items if any -->
    <div
      class="neutral-zone {zoneClass}"
      class:has-items={items.length > 0}
      class:drop-visible={isDragging && items.length === 0}
      class:hovered={isDragOver}
      bind:this={dropZoneEl}
      on:dragover={handleDragOver}
      on:dragleave={handleDragLeave}
      on:drop={handleDrop}
    >
      {#if items.length > 0 && app}
        <div class="zone-header">
          <span class="zone-label">{displayLabel}</span>
          <span class="zone-count">{items.length}</span>
        </div>
        <ul class="zone-items">
          {#each items as item (item.filePath + ':' + item.line)}
            <ChecklistItem
              {item}
              lookAndFeel={lookAndFeel ?? 'classic'}
              {app}
              draggable={true}
              on:dragstart={forwardDragStart}
              on:dragend={forwardDragEnd}
            />
          {/each}
        </ul>
      {:else if isDragging}
        <span class="neutral-label">Drop here to remove priority</span>
      {/if}
    </div>
  {:else if items.length > 0 && app}
    <div class="priority-content {zoneClass}">
      <div class="zone-header">
        <span class="zone-label">{displayLabel}</span>
        <span class="zone-count">{items.length}</span>
      </div>
      <ul class="zone-items">
        {#each items as item (item.filePath + ':' + item.line)}
          <ChecklistItem
            {item}
            lookAndFeel={lookAndFeel ?? 'classic'}
            {app}
            draggable={true}

            on:dragstart={forwardDragStart}
            on:dragend={forwardDragEnd}
            {targetPriority}
          />
        {/each}
      </ul>
    </div>
  {/if}
{:else}
  {#if !shouldHide}
    <div
      class="drop-zone {zoneClass}"
      class:visible={isDragging}
      class:hovered={isDragOver}
      bind:this={dropZoneEl}
      on:dragover={handleDragOver}
      on:dragleave={handleDragLeave}
      on:drop={handleDrop}
    >
      <div class="drop-indicator" />
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
    margin: 4px 0;
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
