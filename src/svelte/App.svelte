<script lang="ts">
  import type { App } from "obsidian"
  import type { LookAndFeel, TodoGroup } from "src/_types"
  import type { TodoSettings } from "src/settings"
  import ChecklistGroup from "./ChecklistGroup.svelte"
  import Header from "./Header.svelte"

  let {
    todoTags,
    lookAndFeel,
    _collapsedSections,
    _hiddenTags,
    updateSetting,
    onSearch,
    onCopyTasks,
    app,
    todoGroups: groups,
    priorityTag,
    maxTasksPerGroup,
    enableLimit,
    registerSearchInput
  }: {
    todoTags: string[]
    lookAndFeel: LookAndFeel
    _collapsedSections: string[]
    _hiddenTags: string[]
    updateSetting: (updates: Partial<TodoSettings>) => Promise<void>
    onSearch: (str: string) => void
    onCopyTasks?: () => string
    app: App
    todoGroups?: TodoGroup[]
    priorityTag?: string
    maxTasksPerGroup?: number | null
    enableLimit?: boolean
    registerSearchInput?: (input: HTMLInputElement) => void
  } = $props()

  // Track which groups have their "Show all" button clicked
  let showAllMap = $state<Record<string, boolean>>({})

  // Derived values for optional props
  const todoGroups = $derived(groups ?? [])
  const effectiveEnableLimit = $derived(enableLimit ?? true)
  const effectivePriorityTag = $derived(priorityTag ?? '')
  const effectiveMaxTasksPerGroup = $derived(maxTasksPerGroup ?? null)
  const visibleTags = $derived(todoTags.filter((t) => !_hiddenTags.includes(t)))

  function toggleGroup(id: string) {
    const newCollapsedSections = _collapsedSections.includes(id)
      ? _collapsedSections.filter((e) => e !== id)
      : [..._collapsedSections, id]
    updateSetting({ _collapsedSections: newCollapsedSections })
  }

  function updateTagStatus(tag: string, status: boolean) {
    const newHiddenTags = _hiddenTags.filter((t) => t !== tag)
    if (!status) newHiddenTags.push(tag)
    updateSetting({ _hiddenTags: newHiddenTags })
  }

  function handleToggleShowAll(groupClass: string) {
    showAllMap = { ...showAllMap, [groupClass]: !showAllMap[groupClass] }
  }
</script>

<div class="checklist-plugin-main markdown-preview-view">
    <Header
      {todoTags}
      hiddenTags={_hiddenTags}
      onTagStatusChange={updateTagStatus}
      {onSearch}
      onCopyTasks={onCopyTasks || (() => '')}
      enableLimit={effectiveEnableLimit}
      {updateSetting}
      registerSearchInput={registerSearchInput || (() => {})}
      todoGroups={todoGroups}
      _collapsedSections={_collapsedSections}
    />
    {#if todoGroups.length === 0}
      <div class="empty">
        {#if _hiddenTags.length === todoTags.length}
          All checklist set to hidden
        {:else if visibleTags.length}
          No checklists found for tag{visibleTags.length > 1 ? "s" : ""}: {visibleTags.map((e) => `#${e}`).join(" ")}
        {:else}
          No checklists found in all files
        {/if}
      </div>
    {:else}
      {#each todoGroups as group}
        <ChecklistGroup
          {group}
          {app}
          {lookAndFeel}
          priorityTag={effectivePriorityTag}
          maxTasksPerGroup={effectiveMaxTasksPerGroup}
          enableLimit={effectiveEnableLimit}
          showAllMap={showAllMap}
          onToggleShowAll={handleToggleShowAll}
          isCollapsed={_collapsedSections.includes(group.id)}
          onToggle={toggleGroup}
        />
      {/each}
    {/if}
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
