<script lang="ts">
  import type { App } from "obsidian"

  import type { TodoGroup, PriorityGroup, DateGroup, TodoItem, DateCategory } from "src/_types"
  import { navToFile, setTodoPrioritiesBatch } from "src/utils"
  import ChecklistItem from "./ChecklistItem.svelte"
  import Icon from "./Icon.svelte"
  import PriorityDropZone from "./PriorityDropZone.svelte"
  import { dragState, todoGroupsStore } from "./viewStore"
  import { slide } from "svelte/transition"

  let {
    group,
    isCollapsed,
    app,
    onToggle,
    priorityTag = '',
    maxTasksPerGroup = null,
    enableLimit = true,
    showAllMap = {},
    onToggleShowAll = () => {}
  }: {
    group: TodoGroup
    isCollapsed: boolean
    app: App
    onToggle: (id: string) => void
    priorityTag?: string
    maxTasksPerGroup?: number | null
    enableLimit?: boolean
    showAllMap?: Record<string, boolean>
    onToggleShowAll?: (className: string) => void
  } = $props()

  function toggleShowAll() {
    onToggleShowAll(group.className)
  }

  const isGroupShowingAll = $derived(showAllMap[group.className] || false)

  function getDateCategoryDisplay(category: DateCategory): { icon: string; label: string } {
    switch (category) {
      case 'today': return { icon: '🟡', label: 'Today' }
      case 'tomorrow': return { icon: '🟠', label: 'Tomorrow' }
      case 'thisWeek': return { icon: '🟢', label: 'This Week' }
      case 'thisMonth': return { icon: '📅', label: 'This Month' }
      case 'future': return { icon: '🔵', label: 'Future' }
      case 'overdue': return { icon: '🔴', label: 'Overdue' }
      default: return { icon: '📅', label: 'No Date' }
    }
  }

  function clickTitle(ev: MouseEvent) {
    if (group.type === "page") navToFile(app, group.id, ev)
  }

  function groupTodosByPriority(todos: TodoItem[]): Map<number | null, TodoItem[]> {
    const grouped = new Map<number | null, TodoItem[]>()
    for (const todo of todos) {
      const key = (todo.priority ?? 0) === 0 ? null : todo.priority!
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(todo)
    }
    if (!grouped.has(null)) grouped.set(null, [])
    return grouped
  }

  function getSortedPriorityKeys(grouped: Map<number | null, TodoItem[]>): (number | null)[] {
    return Array.from(grouped.keys()).sort((a, b) => {
      const av = a ?? 0
      const bv = b ?? 0
      if (av > 0 && bv > 0) return bv - av   // both positive: descending
      if (av < 0 && bv < 0) return bv - av   // both negative: descending (-1 before -2)
      if (av > 0) return -1                   // positive before neutral/negative
      if (bv > 0) return 1
      if (av === 0) return -1                 // neutral before negative
      if (bv === 0) return 1
      return 0
    })
  }

  // upper/lower are the zone keys on each side of the drop position.
  // null = neutral zone key, undefined = edge of list (nothing beyond).
  function calculateNewPriority(upper: number | null | undefined, lower: number | null | undefined): number | null {
    // Above the topmost zone (nothing above)
    if (upper === undefined) {
      if (lower === null || lower === 0) return 1   // above neutral only → lowest positive
      if (lower > 0) return lower + 1               // above topmost positive → go higher
      return lower                                  // above first negative (between neutral and it) → duplicate
    }

    // Below the bottommost zone (nothing below)
    if (lower === undefined) {
      if (upper === null || upper === 0) return -1  // below neutral → first negative
      if (upper > 0) return 1                       // below last positive → lowest positive (between it and neutral)
      return upper - 1                              // below last negative → go more negative
    }

    // Both zone keys are present
    if (upper === null && lower === null) return null  // shouldn't happen

    if (upper === null && lower < 0) return -1     // between neutral and first negative → duplicate first negative
    if (upper > 0 && lower === null) return 1         // between last positive and neutral → lowest positive

    if (upper > 0 && lower > 0) return lower + 1     // between two positives: fill gap or duplicate
    if (upper < 0 && lower < 0) return upper - 1     // between two negatives: fill gap or duplicate

    return null
  }

  // Returns cascade updates ordered furthest-first so writes don't conflict.
  function getCascadeUpdates(draggedItem: TodoItem, targetPriority: number): Array<{item: TodoItem, priority: number}> {
    const direction = targetPriority > 0 ? 1 : -1
    const updates: Array<{item: TodoItem, priority: number}> = []
    let check = targetPriority
    while (true) {
      const displaced = group.todos.filter(t => t !== draggedItem && (t.priority ?? 0) === check)
      if (displaced.length === 0) break
      const next = check + direction
      for (const t of displaced) updates.push({ item: t, priority: next })
      check = next
    }
    updates.reverse()
    return updates
  }

  async function handleDropPosition(e: CustomEvent) {
    const { itemId, dropPosition, targetPriority } = e.detail as {
      itemId?: string
      dropPosition: 'above' | 'below' | 'into'
      targetPriority: number | null
    }

    // Try to find the item - first from dragState (for priority groups), then from current group
    let item = $dragState.draggedItem
    if (!item && itemId) {
      item = group.todos.find(i => `${i.filePath}:${i.line}` === itemId)
    }
    if (!item) return

    let newPriority: number | null

    if (dropPosition === 'into') {
      newPriority = targetPriority
    } else {
      const targetIndex = sortedKeys.findIndex(k => k === targetPriority)
      const upperPriority = dropPosition === 'above'
        ? (targetIndex > 0 ? sortedKeys[targetIndex - 1] : undefined)
        : targetPriority
      const lowerPriority = dropPosition === 'above'
        ? targetPriority
        : (targetIndex < sortedKeys.length - 1 ? sortedKeys[targetIndex + 1] : undefined)

      newPriority = calculateNewPriority(upperPriority, lowerPriority)
    }

    dragState.update(s => ({ ...s, inProgress: false, sourcePriority: null, dragGroupId: null, draggedItem: null }))

    const currentPriority = item.priority ?? 0
    const newPriorityVal = newPriority ?? 0
    if (currentPriority === newPriorityVal) return

    const allUpdates: Array<{ item: TodoItem; newPriority: number | null }> = []
    // Only cascade for above/below drops, not for 'into' drops (allow duplicates)
    if (dropPosition !== 'into' && newPriority !== null && newPriority !== 0) {
      for (const u of getCascadeUpdates(item, newPriority)) {
        allUpdates.push({ item: u.item, newPriority: u.priority })
      }
    }
    allUpdates.push({ item, newPriority })
    await setTodoPrioritiesBatch(allUpdates, priorityTag, app)
  }

  function handleDragStart(e: CustomEvent) {
    const item = e.detail.item as TodoItem
    dragState.update(s => ({ ...s, inProgress: true, sourcePriority: item.priority ?? 0, dragGroupId: group.id, draggedItem: item }))
  }

  function handleDragEnd() {
    dragState.update(s => ({ ...s, inProgress: false, sourcePriority: null, dragGroupId: null, draggedItem: null }))
  }

  // Adapter for ChecklistItem's native drag event
  function handleItemDragStart(item: TodoItem) {
    return (_e: DragEvent) => {
      dragState.update(s => ({ ...s, inProgress: true, sourcePriority: item.priority ?? 0, dragGroupId: group.id, draggedItem: item }))
    }
  }

  const handleItemDragEnd = () => {
    dragState.update(s => ({ ...s, inProgress: false, sourcePriority: null, dragGroupId: null }))
  }

  // First maxTasksPerGroup items of the (already-sorted) group. The full
  // group.todos stays available for drag cascade lookups.
  const visibleTodos = $derived(
    maxTasksPerGroup && enableLimit && group.todos.length > maxTasksPerGroup && !isGroupShowingAll
      ? group.todos.slice(0, maxTasksPerGroup)
      : group.todos,
  )
  const groupedTodos = $derived(priorityTag ? groupTodosByPriority(visibleTodos) : new Map())
  const sortedKeys = $derived(groupedTodos ? getSortedPriorityKeys(groupedTodos) : [])
  const isMyDrag = $derived($dragState.inProgress && ($dragState.dragGroupId === group.id || (group.type === 'priority' && $dragState.dragGroupId?.startsWith('priority:'))))

  // Check if the source priority level has only one task
  const sourceHasSingleTask = $derived((() => {
    if (!$dragState.inProgress || $dragState.sourcePriority === null) return false
    // Neutral (prio 0) keeps its upper/lower drop zones visible even when it's
    // the only item, so you can still drop it into a positive/negative zone.
    if ($dragState.sourcePriority === 0) return false
    const items = groupedTodos?.get($dragState.sourcePriority)
    return items?.length === 1
  })())

  // Find the index of the source priority in sortedKeys
  const sourceIndex = $derived((() => {
    if (!$dragState.inProgress || $dragState.sourcePriority === null) return -1
    const sourceKey = $dragState.sourcePriority === 0 ? null : $dragState.sourcePriority
    return sortedKeys.indexOf(sourceKey)
  })())

  // True when there's at least one unoccupied priority level strictly between
  // the source priority and 0. In that case dropping adjacent to the lone item
  // is a meaningful move (not a redundant same-priority drop), so we keep the
  // adjacent drop zones visible.
  const hasEmptySlotToNeutral = $derived((() => {
    const sp = $dragState.sourcePriority
    if (!sp) return false
    const occupied = new Set<number>()
    for (const t of group.todos) {
      const p = t.priority ?? 0
      if (p !== 0) occupied.add(p)
    }
    if (sp > 0) {
      for (let p = 1; p < sp; p++) if (!occupied.has(p)) return true
    } else {
      for (let p = -1; p > sp; p--) if (!occupied.has(p)) return true
    }
    return false
  })())

  // Create an array indicating whether each gap should be hidden
  // Gap i is between sortedKeys[i-1] and sortedKeys[i] (or above sortedKeys[0] if i=0)
  const hiddenGaps = $derived((() => {
    if (!sourceHasSingleTask || hasEmptySlotToNeutral || sourceIndex === -1) return []
    const result: boolean[] = []
    for (let i = 0; i <= sortedKeys.length; i++) {
      result.push(i === sourceIndex || i === sourceIndex + 1)
    }
    return result
  })())
</script>

<section class="group {group.className}">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  {#if !(group.type === "priority" && group.todos.length === 0)}
  <header class={`group-header ${group.type}`} data-cat={group.type === 'date' ? (group as DateGroup).dateCategory : undefined} onclick={() => onToggle(group.id)} title="Toggle Group">
    <div class="title no-select" onclick={clickTitle}>
      {#if group.type === "priority"}
        <span class="priority-label">Priority {(group as PriorityGroup).priorityValue}</span>
      {:else if group.type === "date"}
        {@const dateInfo = getDateCategoryDisplay((group as DateGroup).dateCategory)}
        <span class="date-label">{dateInfo.icon} {dateInfo.label}</span>
      {:else if group.type === "page"}
        {group.pageName}
      {:else if group.mainTag}
        <span class="tag-base">#</span>
        <span class={group.subTags == null ? "tag-sub" : "tag-base"}
          >{`${group.mainTag}${group.subTags != null ? "/" : ""}`}</span
        >
        {#if group.subTags != null}
          <span class="tag-sub">{group.subTags}</span>
        {/if}
      {:else}
        <span class="tag-base">All Tags</span>
      {/if}
    </div>
    <div class="space"></div>
    <div class="count no-select">{group.todos.length}</div>
    <button class="collapse"  >
      <Icon name="chevron" direction={isCollapsed ? "left" : "down"} />
    </button>
  </header>
  {/if}
  {#if !isCollapsed}
    <div transition:slide={{ duration: 100 }}>
    {#if group.type === 'priority'}
      <!-- Above dropzone for highest priority group -->
      {#if $todoGroupsStore[0]?.type === 'priority' && (group as PriorityGroup).priorityValue === ($todoGroupsStore[0] as PriorityGroup).priorityValue}
        <PriorityDropZone
          position="above"
          targetPriority={(group as PriorityGroup).priorityValue}
          {app}
          isDragging={isMyDrag}
          ondrop={handleDropPosition}
          ondragstart={handleDragStart}
          ondragend={handleDragEnd}
        />
      {/if}
      <div class="priority-group-dropzone" class:dragging={isMyDrag}>
        <PriorityDropZone
          position="into"
          items={visibleTodos}
          targetPriority={(group as PriorityGroup).priorityValue}
          {app}
          isDragging={isMyDrag}
          ondrop={handleDropPosition}
          ondragstart={handleDragStart}
          ondragend={handleDragEnd}
        />
      </div>
      <!-- Below dropzone for lowest priority group -->
      {#if $todoGroupsStore[$todoGroupsStore.length - 1]?.type === 'priority' && (group as PriorityGroup).priorityValue === ($todoGroupsStore[$todoGroupsStore.length - 1] as PriorityGroup).priorityValue}
        <PriorityDropZone
          position="below"
          targetPriority={(group as PriorityGroup).priorityValue}
          {app}
          isDragging={isMyDrag}
          ondrop={handleDropPosition}
          ondragstart={handleDragStart}
          ondragend={handleDragEnd}
        />
      {/if}
      {#if maxTasksPerGroup && enableLimit && group.todos.length > maxTasksPerGroup && !isGroupShowingAll}
        <button class="show-more-button" onclick={toggleShowAll} aria-label="Show more">
          Show all ({group.todos.length})
        </button>
      {:else if maxTasksPerGroup && enableLimit && group.todos.length > maxTasksPerGroup && isGroupShowingAll}
        <button class="show-more-button" onclick={toggleShowAll} aria-label="Hide some">
          Hide some
        </button>
      {/if}
    {:else if priorityTag && groupedTodos}
      <div class="priority-zones" class:dragging={isMyDrag}>
        {#each sortedKeys as key, i (key ?? 'neutral')}
          <PriorityDropZone
            position="above"
            targetPriority={key}
            isDragging={isMyDrag}
            shouldHide={hiddenGaps[i]}
            ondrop={handleDropPosition}
            ondragstart={handleDragStart}
            ondragend={handleDragEnd}
          />
          <PriorityDropZone
            position="into"
            items={groupedTodos.get(key) ?? []}
            targetPriority={key}
            {app}
            isDragging={isMyDrag}
            ondrop={handleDropPosition}
            ondragstart={handleDragStart}
            ondragend={handleDragEnd}
          />
          {#if i === sortedKeys.length - 1}
            <PriorityDropZone
              position="below"
              targetPriority={key}
              isDragging={isMyDrag}
              shouldHide={hiddenGaps[i + 1]}
              ondrop={handleDropPosition}
              ondragstart={handleDragStart}
              ondragend={handleDragEnd}
            />
          {/if}
        {/each}
      </div>
      {#if maxTasksPerGroup && enableLimit && group.todos.length > maxTasksPerGroup && !isGroupShowingAll}
        <button class="show-more-button" onclick={toggleShowAll} aria-label="Show more">
          Show all ({group.todos.length})
        </button>
      {:else if maxTasksPerGroup && enableLimit && group.todos.length > maxTasksPerGroup && isGroupShowingAll}
        <button class="show-more-button" onclick={toggleShowAll} aria-label="Hide some">
          Hide some
        </button>
      {/if}
    {:else}
      <ul>
        {#each visibleTodos as item, i}
          <ChecklistItem {item} {app} draggable={true} ondragstart={handleItemDragStart(item)} ondragend={handleItemDragEnd} />
        {/each}
      </ul>
      {#if maxTasksPerGroup && enableLimit && group.todos.length > maxTasksPerGroup && !isGroupShowingAll}
      <button class="show-more-button" onclick={toggleShowAll} aria-label="Show more">
          Show all ({group.todos.length})
      </button>
      {:else if maxTasksPerGroup && enableLimit && group.todos.length > maxTasksPerGroup && isGroupShowingAll}
        <button class="show-more-button" onclick={toggleShowAll} aria-label="Hide some">
          Collapse ({group.todos.length})
        </button>
      {/if}
    {/if}
    </div>
  {/if}
</section>

<style>
  .page {
    margin: var(--checklist-pageMargin);
    color: var(--checklist-textColor);
    transition: opacity 150ms ease-in-out;
    cursor: pointer;
  }

  .file-link:hover {
    opacity: 0.8;
  }

  header {
    font-weight: var(--checklist-headerFontWeight);
    font-size: var(--checklist-headerFontSize);
    /* margin: var(--checklist-headerMargin); */
    padding: 4px 6px 4px 12px;
    border-radius: 5px;
    display: flex;
    gap: var(--checklist-headerGap);
    align-items: center;
    cursor: pointer;
  }

  .space {
    flex: 1;
  }
  button,
  .count,
  .title {
    flex-shrink: 1;
  }
  .count {
    padding: var(--checklist-countPadding);
    background: var(--checklist-countBackground);
    border-radius: var(--checklist-countBorderRadius);
    font-size: var(--checklist-countFontSize);
  }
  .title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
  }
  button {
    display: flex;
    padding: var(--checklist-buttonPadding);
    background: transparent;
    box-shadow: var(--checklist-buttonBoxShadow);
  }

  .tag-base {
    color: var(--checklist-tagBaseColor);
  }
  .tag-sub {
    color: var(--checklist-tagSubColor);
  }
  .priority-label {
    color: var(--inline-title-color);
    font-weight: 600;
  }

  .date-label {
    color: var(--inline-title-color);
    font-weight: 600;
  }

  /* Color the date group header by urgency category, using the shared palette.
     A faint background tint is derived from the same hue via color-mix. */
  .group-header.date[data-cat='overdue'] .date-label { color: var(--taskcheck-date-overdue); }
  .group-header.date[data-cat='today'] .date-label { color: var(--taskcheck-date-today); }
  .group-header.date[data-cat='tomorrow'] .date-label { color: var(--taskcheck-date-tomorrow); }
  .group-header.date[data-cat='thisWeek'] .date-label { color: var(--taskcheck-date-week); }
  .group-header.date[data-cat='thisMonth'] .date-label { color: var(--taskcheck-date-month); }
  .group-header.date[data-cat='future'] .date-label { color: var(--taskcheck-date-future); }

  .group-header.date[data-cat='overdue'] { background-color: color-mix(in srgb, var(--taskcheck-date-overdue) 12%, transparent); }
  .group-header.date[data-cat='today'] { background-color: color-mix(in srgb, var(--taskcheck-date-today) 12%, transparent); }
  .group-header.date[data-cat='tomorrow'] { background-color: color-mix(in srgb, var(--taskcheck-date-tomorrow) 12%, transparent); }
  .group-header.date[data-cat='thisWeek'] { background-color: color-mix(in srgb, var(--taskcheck-date-week) 12%, transparent); }
  .group-header.date[data-cat='thisMonth'] { background-color: color-mix(in srgb, var(--taskcheck-date-month) 12%, transparent); }
  .group-header.date[data-cat='future'] { background-color: color-mix(in srgb, var(--taskcheck-date-future) 12%, transparent); }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    padding-inline-start: initial !important;
    overflow-x: hidden;
  }

  .group {
    border-bottom: 1px solid var(--background-modifier-border);
    overflow: hidden; /* IMPORTANT */

    padding-bottom: 8px;
    margin-top: 8px;
  }

  header:hover {
    background-color: rgba(0, 0, 0, 0.1);
  }

  .collapse {
    width: initial;
  }

  .show-more-container {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .show-more-button {
    width: 100%;
    padding: 8px;
    border-radius: 4px;
    color: var(--text-normal);
    cursor: pointer;
    font-size: var(--font-ui-small);
    transition: background 0.15s ease;
  }

  .show-more-button:hover {
    background: var(--background-modifier-border-hover);
  }

  .priority-group-dropzone {
    border-radius: 4px;
    min-height: 28px;
    transition: background-color 0.1s;
  }
</style>
