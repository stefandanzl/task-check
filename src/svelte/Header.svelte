<script lang="ts">
  import { getIcon, Notice } from "obsidian"
  import type { TodoSettings } from "src/settings"
  import {
    todoTagsStore,
    hiddenTagsStore,
    enableLimitStore,
    todoGroupsStore,
    collapsedSectionsStore,
    showSettingsPanelStore,
    searchQueriesStore,
  } from "./viewStore"

  let {
    onTagStatusChange,
    onSearch,
    onCopyTasks = () => '',
    updateSetting,
    registerSearchInput = () => {},
  }: {
    onTagStatusChange: (tag: string, status: boolean) => void
    onSearch: (str: string) => void
    onCopyTasks?: () => string
    updateSetting: (updates: Partial<TodoSettings>) => Promise<void>
    registerSearchInput?: (input: HTMLInputElement) => void
  } = $props()

  let search = $state("")
  let searchInput: HTMLInputElement
  let inputRegistered = false
  let showRecentDropdown = $state(false)
  let saveTimeout: ReturnType<typeof setTimeout> | null = null
  let dropdownStyle = $state('')

  const searchQueries = $derived($searchQueriesStore)

  const totalCount = $derived($todoGroupsStore.reduce((sum, g) => sum + g.todos.length, 0))

  const allCollapsed = $derived(
    $todoGroupsStore.length > 0 && $collapsedSectionsStore.length === $todoGroupsStore.length
  )

  async function toggleExpandCollapseAll() {
    if (allCollapsed) {
      await updateSetting({ _collapsedSections: [] })
    } else {
      await updateSetting({ _collapsedSections: $todoGroupsStore.map(g => g.id) })
    }
  }

  const portal = (node: HTMLElement, target: HTMLElement = document.body) => {
    target.appendChild(node)
    return {
      destroy() { node.parentNode?.removeChild(node) }
    }
  }

  $effect(() => {
    if (!showRecentDropdown || !searchInput) return
    const updatePosition = () => {
      const r = searchInput!.getBoundingClientRect();
      dropdownStyle = `position: fixed; top: ${r.bottom}px; left: ${r.left}px; width: ${r.width}px; z-index: var(--layer-popover);`
    };

    // 1. Initial position
    updatePosition();

    // 2. Obsidan Sidepanel Support:
    // ResizeObserver catches the sidebar being dragged
    const observer = new ResizeObserver(updatePosition);
    observer.observe(searchInput);

    // 3. Cleanup: Stop observing when dropdown closes
    return () => observer.disconnect();
  })

  $effect(() => {
    if (searchInput && !inputRegistered) {
      registerSearchInput(searchInput)
      inputRegistered = true
    }
  })

  function clearSearch() {
    search = ""
    onSearch("")
    searchInput?.focus()
  }

  function toggleTag(tag: string) {
    onTagStatusChange(tag, $hiddenTagsStore.includes(tag))
  }

  async function handleCopy() {
    const markdown = onCopyTasks()
    await navigator.clipboard.writeText(markdown)
    new Notice("Tasks copied to clipboard")
  }

  async function toggleLimit() {
    await updateSetting({ enableLimit: !$enableLimitStore })
  }

  async function toggleSettingsPanel() {
    await updateSetting({ _showSettingsPanel: !$showSettingsPanelStore })
  }

  $effect(() => {
    search;
    scheduleSaveSearch()
  })

  function scheduleSaveSearch() {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      if (search.trim() && search !== "") {
        const queries = [...searchQueries].filter(q => q !== search)
        updateSetting({ _searchQueries: [search, ...queries].slice(0, 10) })
      }
    }, 1000)
  }

  function handleSearchFocus() {
    showRecentDropdown = true
  }

  function handleSearchBlur(ev: FocusEvent) {
    const historyDiv = document.getElementById('task-search-history');
    if (historyDiv) {
      const isClickInside = historyDiv.contains(ev.relatedTarget as Node);
      if (isClickInside) return
    }  
      showRecentDropdown = false
  }

  function selectRecentQuery(query: string) {
    console.log(query)
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
        onkeydown={(e) => {
          if (e.key === 'Escape') {
            search = ""
            onSearch("")
          }
        }}
      />
      {#if showRecentDropdown && search.length === 0 && searchQueries.length > 0 && dropdownStyle}
        {#key dropdownStyle}
        <div class="recent-searches suggestion-container mod-search-suggestion" id="task-search-history" use:portal style={dropdownStyle}>
          {#each searchQueries as query}
            <div class="recent-item" onclick={() => selectRecentQuery(query)} onkeydown={(e) => e.key === 'Enter' && selectRecentQuery(query)} role="option" aria-selected="false" tabindex="0">{query}</div>
          {/each}
        </div>
        {/key}
      {/if}
      {#if search}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div class="search-input-clear-button" onclick={clearSearch} role="button" tabindex="0" aria-label="Clear search">
        </div>
      {/if}
    </div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="settings-button clickable-icon {$showSettingsPanelStore ? 'is-active' : ''}"
      role="button"
      tabindex="0"
      onclick={toggleSettingsPanel}
      aria-label="Settings panel"
    >
      {@html getIcon("sliders-horizontal")?.outerHTML}
    </div>
  </div>

  {#if $showSettingsPanelStore}
    <div class="settings-panel">
      <div class="settings-controls">

        <div class="toggle-switch" aria-label="Toggle limit for shown task group lenght">
          <label class="toggle-label">
            <input type="checkbox" class="toggle-input" checked={$enableLimitStore} onchange={toggleLimit}/>
            <span class="toggle-slider"></span>
            <span class="toggle-text">Limit tasks</span>
          </label>
        </div>
        <div class="toggle-switch">
        {#if allCollapsed}
          <button class="copy-icon-button" onclick={toggleExpandCollapseAll} aria-label="Expand all">
            {@html getIcon("chevrons-up-down")?.outerHTML}
          </button>
        {:else}
          <button class="copy-icon-button" onclick={toggleExpandCollapseAll} aria-label="Collapse all">
            {@html getIcon("chevrons-down-up")?.outerHTML}
          </button>
        {/if}
          &nbsp;&nbsp;
          <button class="copy-icon-button" onclick={handleCopy} aria-label="Copy tasks to clipboard">
          {@html getIcon("copy")?.outerHTML}
          </button>
        </div>
      </div>
      <div class="settings-title">
        <span class="settings-title-span">Show Tags</span>
      </div>
      {#each $todoTagsStore as tag}
        <div class="tag-checkbox-item">
          <label class="task-list-label">
            <input class="task-list-item-checkbox" type="checkbox" checked={!$hiddenTagsStore.includes(tag)} onchange={() => toggleTag(tag)} />
            <span><span class="hash">#</span>{tag}</span>
          </label>
        </div>
      {/each}
      {#if $todoTagsStore.length === 0}
        <div class="empty">No tags specified</div>
      {/if}

      
          <div class="search-results-info" style="border-top: var(--border-width) solid var(--background-modifier-border); border-bottom: none; padding: 0; margin: 4px 0 0 0;">
            <div class="clickable-icon search-results-result-count">
              <span>{totalCount} tasks</span>
              <div class="more-options-icon">
               {@html getIcon("more-horizontal")?.outerHTML}
            </div>
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
    {/if}
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
    padding: 12px;
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .toggle-switch {
    display: flex;
    align-items: center;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: var(--font-ui-small);
    color: var(--text-normal);
  }

  .toggle-input {
    display: none;
  }

  .toggle-slider {
    position: relative;
    width: 36px;
    height: 20px;
    background-color: var(--interactive-normal);
    border-radius: 10px;
    transition: background-color 0.2s ease;
  }

  .toggle-slider::before {
    content: '';
    position: absolute;
    width: 16px;
    height: 16px;
    left: 2px;
    top: 2px;
    background-color: white;
    border-radius: 50%;
    transition: transform 0.2s ease;
  }

  .toggle-input:checked + .toggle-slider {
    background-color: var(--interactive-accent);
  }

  .toggle-input:checked + .toggle-slider::before {
    transform: translateX(16px);
  }

  .toggle-text {
    font-size: var(--font-ui-small);
  }

  .copy-icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 2px;
    border: none;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    border-radius: 4px;
    transition: color 0.15s ease, background 0.15s ease;
  }

  .copy-icon-button:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }
/* 
  .copy-icon-button svg {
    width: 16px;
    height: 16px;
  } */

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
