<script lang="ts">
  import {getIcon, Menu, Notice, type App} from 'obsidian'
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
    bookmarksStore,
    activePanelTabStore,
    priorityTagStore,
    dateTagStore,
    groupModeStore,
  } from './viewStore'
  import {undoLast, undoState} from '../undo'

  let {
    app,
    onTagStatusChange,
    onSearch,
    onCopyTasks = () => '',
    updateSetting,
    registerSearchInput = () => {},
    restoreLastSearch,
    lastSearchQuery,
  }: {
    app: App
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
    e.stopPropagation()
    e.stopImmediatePropagation()

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

  async function switchTab(tab: 'tags' | 'bookmarks') {
    await updateSetting({_activePanelTab: tab})
  }

  async function addBookmark() {
    const q = search.trim()
    if (!q) {
      new Notice('Type a search query first')
      return
    }
    if ($bookmarksStore.includes(q)) {
      new Notice('Already bookmarked')
      return
    }
    await updateSetting({_bookmarks: [...$bookmarksStore, q]})
  }

  async function deleteBookmark(index: number) {
    const next = [...$bookmarksStore]
    next.splice(index, 1)
    await updateSetting({_bookmarks: next})
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
      class="clickable-icon {$undoState.count ? '' : 'is-disabled'}"
      role="button"
      tabindex={$undoState.count ? 0 : -1}
      aria-label={`Undo${$undoState.label ? ' · ' + $undoState.label : ''}`}
      aria-disabled={!$undoState.count}
      onclick={() => $undoState.count && undoLast(app, true)}>
      {@html getIcon('undo-2')?.outerHTML}
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
      <div class="settings-tabs">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="settings-tab {$activePanelTabStore === 'tags' ? 'is-active' : ''}"
          role="button"
          tabindex="0"
          onclick={() => switchTab('tags')}>Tags</div>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="settings-tab {$activePanelTabStore === 'bookmarks' ? 'is-active' : ''}"
          role="button"
          tabindex="0"
          onclick={() => switchTab('bookmarks')}>Bookmarks</div>
        {#if $activePanelTabStore === 'bookmarks'}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="clickable-icon bookmark-add {!search.trim() ? 'is-disabled' : ''}"
            role="button"
            tabindex="0"
            aria-label="Bookmark current search"
            onclick={() => search.trim() && addBookmark()}>
            {@html getIcon('bookmark-plus')?.outerHTML}
          </div>
        {/if}
      </div>
      <div class="settings-list-scroll">
        <div class="settings-pane" class:is-hidden={$activePanelTabStore !== 'tags'}>
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
        </div>
        <div class="settings-pane" class:is-hidden={$activePanelTabStore !== 'bookmarks'}>
          {#each $bookmarksStore as query, i}
            <div class="bookmark-item">
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="bookmark-query"
                role="button"
                tabindex="0"
                title={query}
                onclick={() => selectRecentQuery(query)}
                onkeydown={e => e.key === 'Enter' && selectRecentQuery(query)}>
                {query}
              </div>
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                class="clickable-icon bookmark-delete"
                role="button"
                tabindex="0"
                aria-label="Delete bookmark"
                onclick={() => deleteBookmark(i)}>
                {@html getIcon('x')?.outerHTML}
              </div>
            </div>
          {/each}
          {#if $bookmarksStore.length === 0}
            <div class="empty">No bookmarks — run a search and tap +</div>
          {/if}
        </div>
      </div>
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
    overflow-y: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Tabbed header (Tags / Bookmarks). The panel itself doesn't scroll — only
     the .settings-list-scroll area below does, so the tabs and bottom controls
     stay pinned. Active tab uses a browser-style border (top/left/right, no
     bottom) that overlaps the separator so it reads as connected to the list. */
  .settings-tabs {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    padding: 8px 4px 0 4px;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  .settings-tab {
    padding: 4px 12px;
    font-size: var(--font-ui-small);
    color: var(--text-muted);
    cursor: pointer;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: 6px 6px 0 0;
    position: relative;
    margin-bottom: -1px;
  }
  .settings-tab:hover {
    background: var(--background-modifier-hover);
  }
  .settings-tab.is-active {
    color: var(--text-normal);
    font-weight: 600;
    background: var(--background-secondary);
    border-color: var(--background-modifier-border);
  }
  .bookmark-add {
    margin-inline-start: auto;
  }

  /* Both panes render always and stack in the same grid cell, so the area
     sizes to the TALLER pane's content (no fixed height, no flicker on switch).
     The inactive pane is visibility:hidden so it still contributes its height
     to the cell. Caps + scrolls via the flex panel's max-height + overflow. */
  .settings-list-scroll {
    overflow-y: auto;
    min-height: 0;
    flex: 0 1 auto;
    display: grid;
  }
  .settings-pane {
    grid-area: 1 / 1;
    align-self: start;
  }
  .settings-pane.is-hidden {
    visibility: hidden;
  }

  .bookmark-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 0;
  }
  .bookmark-query {
    flex: 1;
    min-width: 0;
    cursor: pointer;
    font-size: var(--font-ui-small);
    color: var(--text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 2px 4px;
    border-radius: 4px;
  }
  .bookmark-query:hover {
    background: var(--background-modifier-hover);
  }
  .bookmark-delete {
    opacity: 0.5;
    flex-shrink: 0;
  }
  .bookmark-delete:hover {
    opacity: 1;
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
