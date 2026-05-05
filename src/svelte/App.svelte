<script lang="ts">
  import type { App } from "obsidian"
  import type { TodoSettings } from "src/settings"
  import ChecklistGroup from "./ChecklistGroup.svelte"
  import Header from "./Header.svelte"
  import {
    todoGroupsStore,
    todoTagsStore,
    lookAndFeelStore,
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
  }: {
    app: App
    updateSetting: (updates: Partial<TodoSettings>) => Promise<void>
    onSearch: (str: string) => void
    onCopyTasks?: () => string
    registerSearchInput?: (input: HTMLInputElement) => void
  } = $props()

  let showAllMap = $state<Record<string, boolean>>({})

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

<div class="checklist-plugin-main markdown-preview-view">
  <Header
    onTagStatusChange={updateTagStatus}
    {onSearch}
    onCopyTasks={onCopyTasks || (() => '')}
    {updateSetting}
    registerSearchInput={registerSearchInput || (() => {})}
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
        lookAndFeel={$lookAndFeelStore}
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
