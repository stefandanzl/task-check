<script lang="ts">
  import { Notice } from "obsidian"
  import Icon from "./Icon.svelte"
  import type { TodoSettings } from "src/settings"

  export let todoTags: string[]
  export let hiddenTags: string[]
  export let disableSearch: boolean
  export let onTagStatusChange: (tag: string, status: boolean) => void
  export let onSearch: (str: string) => void
  export let onCopyTasks: () => string = () => ''
  export let enableLimit: boolean = true
  export let updateSetting: (updates: Partial<TodoSettings>) => Promise<void>

  let showSettings = false
  let search = ""
  let searchInput: HTMLInputElement

  function clearSearch() {
    search = ""
    onSearch("")
    searchInput?.focus()
  }

  function toggleTag(tag: string) {
    onTagStatusChange(tag, hiddenTags.includes(tag))
  }

  async function handleCopy() {
    const markdown = onCopyTasks()
    await navigator.clipboard.writeText(markdown)
    new Notice("Tasks copied to clipboard")
  }

  async function toggleLimit() {
    await updateSetting({ enableLimit: !enableLimit })
  }
</script>

<div class="task-search-settings">
  <div class="header-row">
    <div class="search-input-wrapper">
      <input
        disabled={disableSearch && !search}
        class="search"
        placeholder="Search tasks"
        bind:value={search}
        bind:this={searchInput}
        on:input={() => onSearch(search)}
      />
      {#if search}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div class="search-clear-button" on:click={clearSearch} role="button" tabindex="0" aria-label="Clear search">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </div>
      {/if}
    </div>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div
      class="settings-button clickable-icon {showSettings ? 'is-active' : ''}"
      role="button"
      tabindex="0"
      on:click={() => showSettings = !showSettings}
      aria-label="Search settings"
    >
      <Icon name="settings" style="button" />
    </div>
  </div>

  {#if showSettings}
    <div class="settings-panel">
      <div class="settings-controls">
      
        <div class="toggle-switch">
        
          <label class="toggle-label">
            <input type="checkbox" class="toggle-input" checked={enableLimit} on:change={toggleLimit} />
            <span class="toggle-slider"></span>
            <span class="toggle-text">Limit tasks</span>
          </label>
        </div>
        <button class="copy-icon-button" on:click={handleCopy} title="Copy tasks to clipboard">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        </button>
      </div>
      <div class="settings-title">
        <span class="settings-title-span">Show Tags</span>
      </div>
      {#each todoTags as tag}
        <div class="tag-checkbox-item">
          <label class="task-list-label">
            <input class="task-list-item-checkbox" type="checkbox" checked={!hiddenTags.includes(tag)} on:change={() => toggleTag(tag)} />
            <span><span class="hash">#</span>{tag}</span>
          </label>
        </div>
      {/each}
      {#if todoTags.length === 0}
        <div class="empty">No tags specified</div>
      {/if}

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
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }

  .search {
    width: 100%;
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    font-size: var(--font-ui-medium);
    border-radius: var(--input-radius);
    padding: 8px 32px 8px 8px;
    color: var(--text-normal);
    height: 36px;
    box-sizing: border-box;
  }

  .search:focus {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--background-modifier-border-hover);
  }

  .search:disabled {
    opacity: 0.5;
  }

  .search-clear-button {
    position: absolute;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-faint);
    padding: 2px;
    border-radius: 4px;
  }

  .search-clear-button:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .settings-button {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--input-radius);
    color: var(--text-faint);
    transition: color 0.15s ease, background-color 0.15s ease;
  }

  .settings-button:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .settings-button.is-active {
    color: var(--interactive-accent);
    background: var(--background-modifier-border-hover);
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

  .copy-icon-button svg {
    width: 16px;
    height: 16px;
  }

  .tag-checkbox-item {
    padding: 4px 0;
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
</style>
