<script lang="ts">
  import type { App } from "obsidian"
  import type { TodoSettings } from "src/settings"
  import ChecklistGroup from "./ChecklistGroup.svelte"
  import Header from "./Header.svelte"
  import ScrollToTop from "./ScrollToTop.svelte"
  import {
    dragState,
    todoGroupsStore,
    todoTagsStore,
    collapsedSectionsStore,
    hiddenTagsStore,
    priorityTagStore,
    maxTasksPerGroupStore,
    enableLimitStore,
  } from "./viewStore"

  let {
    app,
    updateSetting,
    onSearch,
    onCopyTasks,
    registerSearchInput,
    restoreLastSearch,
    lastSearchQuery,
  }: {
    app: App
    updateSetting: (updates: Partial<TodoSettings>) => Promise<void>
    onSearch: (str: string) => void
    onCopyTasks?: () => string
    registerSearchInput?: (input: HTMLInputElement) => void
    restoreLastSearch: boolean
    lastSearchQuery: string
  } = $props()

  let showAllMap = $state<Record<string, boolean>>({})
  let rootEl: HTMLElement

  /** Nearest ancestor that actually scrolls — the sidebar's content container. */
  function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
    let node = el?.parentElement
    while (node) {
      const style = getComputedStyle(node)
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node
      node = node.parentElement
    }
    return null
  }

  // While a task drag is in progress, auto-scroll the sidebar when the pointer
  // is near the top/bottom edge so you can reach groups that are off-screen.
  // dragState.inProgress can only go true on desktop (drag is disabled on
  // mobile), so no platform gate is needed here.
  $effect(() => {
    if (!$dragState.inProgress) return
    const scroller = findScrollContainer(rootEl)
    if (!scroller) return
    const edgeFraction = 0.15 // top/bottom fraction of the viewport that triggers scrolling
    const speed = 12 // max px/frame (at the very edge; ramps down toward the zone's inner edge)
    let clientY = 0
    let raf = 0
    const onDragOver = (e: DragEvent) => {clientY = e.clientY}
    const tick = () => {
      if (clientY > 0) {
        const rect = scroller.getBoundingClientRect()
        const margin = rect.height * edgeFraction
        if (clientY < rect.top + margin) {
          // Closer to the top edge → faster up-scroll (ratio 1 at edge → 0 at inner bound).
          const ratio = 1 - (clientY - rect.top) / margin
          scroller.scrollTop -= speed * Math.max(0, ratio)
        } else if (clientY > rect.bottom - margin) {
          // Closer to the bottom edge → faster down-scroll.
          const ratio = (clientY - (rect.bottom - margin)) / margin
          scroller.scrollTop += speed * Math.max(0, ratio)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    document.addEventListener('dragover', onDragOver)
    raf = requestAnimationFrame(tick)
    return () => {
      document.removeEventListener('dragover', onDragOver)
      cancelAnimationFrame(raf)
    }
  })

  function toggleGroup(id: string) {
    const collapsed = $collapsedSectionsStore
    const newCollapsedSections = collapsed.includes(id)
      ? collapsed.filter((e) => e !== id)
      : [...collapsed, id]
    updateSetting({ _collapsedSections: newCollapsedSections })
  }

  function updateTagStatus(tag: string, status: boolean) {
    const newHiddenTags = $hiddenTagsStore.filter((t) => t !== tag)
    if (!status) newHiddenTags.push(tag)
    updateSetting({ _hiddenTags: newHiddenTags })
  }

  function handleToggleShowAll(groupClass: string) {
    showAllMap = { ...showAllMap, [groupClass]: !showAllMap[groupClass] }
  }
</script>

<div class="checklist-plugin-main markdown-preview-view markdown-source-view is-live-preview mod-cm6 cm-s-obsidian" bind:this={rootEl}>
  <Header
    {app}
    onTagStatusChange={updateTagStatus}
    {onSearch}
    onCopyTasks={onCopyTasks || (() => '')}
    {updateSetting}
    registerSearchInput={registerSearchInput || (() => {})}
    {restoreLastSearch}
    {lastSearchQuery}
  />
  {#if $todoGroupsStore.length === 0}
    <div class="empty">
      {#if $hiddenTagsStore.length === $todoTagsStore.length && $todoTagsStore.length > 0}
        All checklist set to hidden
      {:else if $todoTagsStore.filter((t) => !$hiddenTagsStore.includes(t)).length}
        No checklists found for tag{$todoTagsStore.filter((t) => !$hiddenTagsStore.includes(t)).length > 1 ? "s" : ""}: {$todoTagsStore.filter((t) => !$hiddenTagsStore.includes(t)).map((e) => `#${e}`).join(" ")}
      {:else}
        No checklists found in all files
      {/if}
    </div>
  {:else}
    {#each $todoGroupsStore as group (group.id)}
      <ChecklistGroup
        {group}
        {app}
        priorityTag={$priorityTagStore ?? ''}
        maxTasksPerGroup={$maxTasksPerGroupStore ?? null}
        enableLimit={$enableLimitStore ?? true}
        {showAllMap}
        onToggleShowAll={handleToggleShowAll}
        isCollapsed={$collapsedSectionsStore.includes(group.id)}
        onToggle={toggleGroup}
      />
    {/each}
  {/if}

  <ScrollToTop />
</div>

<style>
  .empty {
    color: var(--text-faint);
    text-align: center;
    margin-top: 32px;
    font-style: italic;
  }

  .checklist-plugin-main {
    padding: initial;
    width: initial;
    height: initial;
    position: initial;
    overflow-y: initial;
    overflow-wrap: initial;
  }
</style>
