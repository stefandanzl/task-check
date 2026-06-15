<script lang="ts">
  import {getIcon, Notice, Menu} from 'obsidian'
  import type {TodoSettings} from 'src/settings'
  import type {GroupMode} from 'src/_types'
  import {
    todoTagsStore,
    hiddenTagsStore,
    enableLimitStore,
    todoGroupsStore,
    collapsedSectionsStore,
    showSettingsPanelStore,
    searchQueriesStore,
    priorityTagStore,
    dateTagStore,
    groupModeStore,
  } from './viewStore'

  let {
    onTagStatusChange,
    onSearch,
    onCopyTasks = () => '',
    updateSetting,
    registerSearchInput = () => {},
    restoreLastSearch,
    lastSearchQuery,
  }: {
    onTagStatusChange: (tag: string, status: boolean) => void
    onSearch: (str: string) => void
    onCopyTasks?: () => string
    updateSetting: (updates: Partial<TodoSettings>) => Promise<void>
    registerSearchInput?: (input: HTMLInputElement) => void
    restoreLastSearch: boolean
    lastSearchQuery: string
  } = $props()

  let search = $state('')
  let searchInput: HTMLInputElement
  let inputRegistered = false
  let showRecentDropdown = $state(false)
  let saveTimeout: ReturnType<typeof setTimeout> | null = null
  let dropdownStyle = $state('')
  let hasRestoredSearch = false

  const searchQueries = $derived($searchQueriesStore)

  const totalCount = $derived(
    $todoGroupsStore.reduce((sum, g) => sum + g.todos.length, 0),
  )

  const allCollapsed = $derived(
    $todoGroupsStore.length > 0 &&
      $collapsedSectionsStore.length === $todoGroupsStore.length,
  )

  async function toggleExpandCollapseAll() {
    if (allCollapsed) {
      await updateSetting({_collapsedSections: []})
    } else {
      await updateSetting({_collapsedSections: $todoGroupsStore.map(g => g.id)})
    }
  }

  const portal = (node: HTMLElement, target: HTMLElement = document.body) => {
    target.appendChild(node)
    return {
      destroy() {
        node.parentNode?.removeChild(node)
      },
    }
  }

  $effect(() => {
    if (!showRecentDropdown || !searchInput) return
    const updatePosition = () => {
      const r = searchInput!.getBoundingClientRect()
      dropdownStyle = `position: fixed; top: ${r.bottom}px; left: ${r.left}px; width: ${r.width}px; z-index: var(--layer-popover);`
    }

    // 1. Initial position
    updatePosition()

    // 2. Obsidan Sidepanel Support:
    // ResizeObserver catches the sidebar being dragged
    const observer = new ResizeObserver(updatePosition)
    observer.observe(searchInput)

    // 3. Cleanup: Stop observing when dropdown closes
    return () => observer.disconnect()
  })

  $effect(() => {
    if (searchInput && !inputRegistered) {
      registerSearchInput(searchInput)
      inputRegistered = true
    }
  })

  // Restore last search on mount if flag is set
  $effect(() => {
    if (
      !hasRestoredSearch &&
      restoreLastSearch &&
      lastSearchQuery &&
      search === ''
    ) {
      search = lastSearchQuery
      onSearch(lastSearchQuery)
      hasRestoredSearch = true
      // Reset the flag so it doesn't keep restoring
      updateSetting({_restoreLastSearch: false})
    }
  })

  function clearSearch() {
    search = ''
    onSearch('')
    searchInput?.focus()
    updateSetting({_restoreLastSearch: false})
  }

  function toggleTag(tag: string) {
    onTagStatusChange(tag, $hiddenTagsStore.includes(tag))
  }

  async function handleCopy() {
    const markdown = onCopyTasks()
    await navigator.clipboard.writeText(markdown)
    new Notice('Tasks copied to clipboard')
  }

  async function toggleLimit() {
    await updateSetting({enableLimit: !$enableLimitStore})
  }

  function openResultsMenu(e: MouseEvent) {
    const menu = new Menu()
    menu.addItem(item =>
      item
        .setTitle('Copy search results')
        .setIcon('copy')
        .onClick(() => handleCopy()),
    )
    menu.addItem(item =>
      item
        .setTitle('Toggle list group limits')
        .setIcon('list')
        .setChecked($enableLimitStore)
        .onClick(() => toggleLimit()),
    )
    menu.addItem(item =>
      item
        .setTitle(allCollapsed ? 'Expand all groups' : 'Collapse all groups')
        .setIcon(allCollapsed ? 'chevrons-up-down' : 'chevrons-down-up')
        .onClick(() => toggleExpandCollapseAll()),
    )
    menu.showAtMouseEvent(e)
  }

  let groupMode = $state<GroupMode>('tag')
  $effect(() => {
    groupMode = $groupModeStore
  })

  async function handleGroupChange() {
    if (groupMode === 'priority') {
      await updateSetting({prioGrouping: true, dateGrouping: false})
    } else if (groupMode === 'date') {
      await updateSetting({dateGrouping: true, prioGrouping: false})
    } else {
      await updateSetting({
        groupBy: groupMode,
        prioGrouping: false,
        dateGrouping: false,
      })
    }
  }

  // Replicates Obsidian's mouse-focus marker (added on pointer focus, removed on
  // blur, absent on keyboard focus) so the native .dropdown focus styling applies.
  function mouseFocus(node: HTMLElement) {
    const add = () => node.classList.add('mouse-focus')
    const remove = () => node.classList.remove('mouse-focus')
    node.addEventListener('pointerdown', add)
    node.addEventListener('blur', remove)
    return {
      destroy() {
        node.removeEventListener('pointerdown', add)
        node.removeEventListener('blur', remove)
      },
    }
  }

  async function toggleSettingsPanel() {
    await updateSetting({_showSettingsPanel: !$showSettingsPanelStore})
  }

  $effect(() => {
    search
    scheduleSaveSearch()
  })

  function scheduleSaveSearch() {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      if (search.trim() && search !== '') {
        const queries = [...searchQueries].filter(q => q !== search)
        updateSetting({
          _searchQueries: [search, ...queries].slice(0, 10),
          _restoreLastSearch: true,
        })
      } else if (search === '') {
        // Search was cleared, don't restore on next load
        updateSetting({_restoreLastSearch: false})
      }
    }, 1000)
  }

  function handleSearchFocus() {
    showRecentDropdown = true
  }

  function handleSearchBlur(ev: FocusEvent) {
    const historyDiv = document.getElementById('task-search-history')
    if (historyDiv) {
      const isClickInside = historyDiv.contains(ev.relatedTarget as Node)
      if (isClickInside) return
    }
    showRecentDropdown = false
  }

  function selectRecentQuery(query: string) {
    search = query
    onSearch(query)
    searchInput?.focus()
  }
</script>

<div class="task-search-settings">
  <div class="header-row">
    <div class="search-input-wrapper search-input-container">
      <input
        class="task-search"
        type="search"
        spellcheck="false"
        enterkeyhint="search"
        placeholder="Search..."
        bind:value={search}
        bind:this={searchInput}
        oninput={() => onSearch(search)}
        onfocus={handleSearchFocus}
        onblur={handleSearchBlur}
        onkeydown={e => {
          if (e.key === 'Escape') {
            search = ''
            onSearch('')
            updateSetting({_restoreLastSearch: false})
          }
        }} />
      {#if showRecentDropdown && search.length === 0 && searchQueries.length > 0 && dropdownStyle}
        {#key dropdownStyle}
          <div
            class="recent-searches suggestion-container mod-search-suggestion"
            id="task-search-history"
            use:portal
            style={dropdownStyle}>
            {#each searchQueries as query}
              <div
                class="recent-item"
                onclick={() => selectRecentQuery(query)}
                onkeydown={e => e.key === 'Enter' && selectRecentQuery(query)}
                role="option"
                aria-selected="false"
                tabindex="0">
                {query}
              </div>
            {/each}
          </div>
        {/key}
      {/if}
      {#if search}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="search-input-clear-button"
          onclick={clearSearch}
          role="button"
          tabindex="0"
          aria-label="Clear search">
        </div>
      {/if}
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="settings-button clickable-icon {$showSettingsPanelStore
        ? 'is-active'
        : ''}"
      role="button"
      tabindex="0"
      onclick={toggleSettingsPanel}
      aria-label="Settings panel">
      {@html getIcon('sliders-horizontal')?.outerHTML}
    </div>
  </div>

  <div class="settings-panel">
    {#if $showSettingsPanelStore}
      <div class="settings-title">
        <span class="settings-title-span">Show Tags</span>
      </div>
      {#each $todoTagsStore as tag}
        <div class="tag-checkbox-item">
          <label class="task-list-label">
            <input
              class="task-list-item-checkbox"
              type="checkbox"
              checked={!$hiddenTagsStore.includes(tag)}
              onchange={() => toggleTag(tag)} />
            <span><span class="hash">#</span>{tag}</span>
          </label>
        </div>
      {/each}
      {#if $todoTagsStore.length === 0}
        <div class="empty">No tags specified</div>
      {/if}
    {/if}
    <div
      class="search-results-info settings-controls"
      style="border-top: var(--border-width) solid var(--background-modifier-border); border-bottom: none; padding: 0; margin: 4px 0 0 0;">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="clickable-icon search-results-result-count"
        role="button"
        tabindex="0"
        onclick={e => openResultsMenu(e)}>
        <span>{totalCount} tasks</span>
        <div class="more-options-icon">
          {@html getIcon('more-horizontal')?.outerHTML}
        </div>
      </div>
      <div class="group-by">
        <span class="group-by-label">Group by:</span>
        <select
          class="dropdown"
          use:mouseFocus
          bind:value={groupMode}
          onchange={handleGroupChange}>
          <option value="tag">Tag</option>
          <option value="page">Note</option>
          {#if $dateTagStore}<option value="date">Date</option>{/if}
          {#if $priorityTagStore}<option value="priority">Priority</option>{/if}
        </select>
      </div>
      <!-- <select 
            class="dropdown" 
            bind:value={sortMethod} 
            onchange={handleSortChange}
          >
            <option value="alphabetical">File name (A to Z)</option>
            <option value="alphabeticalReverse">File name (Z to A)</option>
            <option value="byModifiedTime">Modified time (new to old)</option>
            <option value="byModifiedTimeReverse">Modified time (old to new)</option>
            <option value="byCreatedTime">Created time (new to old)</option>
            <option value="byCreatedTimeReverse">Created time (old to new)</option>
          </select> -->
    </div>
  </div>
</div>

<style>
  input.task-list-item-checkbox:hover {
    background-color: var(--interactive-hover);
  }
  .empty {
    color: var(--text-faint);
    text-align: center;
    margin-top: 16px;
    font-style: italic;
    font-size: var(--font-ui-small);
  }

  .task-search-settings {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 5px;
  }

  .header-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .search-input-wrapper {
    flex-grow: 1;
  }

  .settings-panel {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 0 12px 12px 12px;
    max-height: 300px;
    overflow-y: auto;
  }

  .settings-title {
    margin-bottom: 8px;
  }

  .settings-title-span {
    font-weight: 600;
    font-size: var(--font-ui-small);
    color: var(--text-normal);
  }

  .settings-controls {
    container-type: inline-size;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    border-top: var(--border-width) solid var(--background-modifier-border);
    padding-top: 4px;
    margin-top: 4px;
  }

  .group-by {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .group-by select {
    width: max-content;
    max-width: none;
    text-overflow: clip;
  }

  .group-by-label {
    display: none;
    white-space: nowrap;
    font-size: var(--font-ui-smaller);
  }

  @container (min-width: 240px) {
    .group-by-label {
      display: inline;
    }
  }

  .tag-checkbox-item {
    padding: 4px 0;
    max-width: 10rem;
  }

  .task-list-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: var(--font-ui-small);
    color: var(--text-normal);
  }

  .task-list-item-checkbox {
    margin: 0;
    cursor: pointer;
  }

  .hash {
    color: var(--text-accent);
    font-weight: 500;
  }

  .clickable-icon {
    cursor: pointer;
  }

  .recent-item {
    padding: 6px 12px;
    cursor: pointer;
    font-size: var(--font-ui-small);
    color: var(--text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-item:hover,
  .recent-item:focus {
    background: var(--background-modifier-hover);
  }
</style>
