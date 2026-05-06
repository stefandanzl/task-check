import {ItemView, WorkspaceLeaf} from 'obsidian'
import {mount, unmount} from 'svelte'

import {TODO_VIEW_TYPE} from './constants'
import App from './svelte/App.svelte'
import {groupTodos, parseTodos} from './utils'
import {
  todoGroupsStore,
  todoTagsStore,
  lookAndFeelStore,
  collapsedSectionsStore,
  hiddenTagsStore,
  priorityTagStore,
  maxTasksPerGroupStore,
  enableLimitStore,
  showSettingsPanelStore,
  searchQueriesStore,
} from './svelte/viewStore'

import type {TodoSettings} from './settings'
import type TodoPlugin from './main'
import type {TodoGroup, TodoItem} from './_types'

export default class TodoListView extends ItemView {
  private _app: ReturnType<typeof mount>
  private lastRerender = 0
  public groupedItems: TodoGroup[] = []
  public itemsByFile = new Map<string, TodoItem[]>()
  private searchTerm = ''
  private searchInputRef: HTMLInputElement | null = null
  private isRefreshing = false

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: TodoPlugin,
  ) {
    super(leaf)
  }

  getViewType(): string {
    return TODO_VIEW_TYPE
  }

  getDisplayText(): string {
    return 'Todo List'
  }

  getIcon(): string {
    return 'checkmark'
  }

  get todoTagArray() {
    return this.plugin
      .getSettingValue('todoPageName')
      .trim()
      .split('\n')
      .map(e => e.toLowerCase())
      .filter(e => e)
  }

  get visibleTodoTagArray() {
    return this.todoTagArray.filter(t => !this.plugin.getSettingValue('_hiddenTags').includes(t))
  }

  async onClose() {
    if (this._app) {
      unmount(this._app)
      this._app = null
    }
  }

  async onOpen(): Promise<void> {
    this.refresh()
    this.registerEvent(
      this.app.metadataCache.on('resolved', async () => {
        if (!this.plugin.getSettingValue('autoRefresh')) return
        await this.refresh()
      }),
    )
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', async () => {
        if (!this.plugin.getSettingValue('showOnlyActiveFile')) return
        await this.refresh()
      }),
    )
    this.registerEvent(this.app.vault.on('delete', file => this.deleteFile(file.path)))
  }

  private updateStores() {
    todoGroupsStore.set(this.groupedItems)
    todoTagsStore.set(this.todoTagArray)
    lookAndFeelStore.set(this.plugin.getSettingValue('lookAndFeel'))
    collapsedSectionsStore.set(this.plugin.getSettingValue('_collapsedSections'))
    hiddenTagsStore.set(this.plugin.getSettingValue('_hiddenTags'))
    priorityTagStore.set(this.plugin.getSettingValue('priorityTag'))
    maxTasksPerGroupStore.set(this.plugin.getSettingValue('maxTasksPerGroup'))
    enableLimitStore.set(this.plugin.getSettingValue('enableLimit'))
    showSettingsPanelStore.set(this.plugin.getSettingValue('_showSettingsPanel'))
    searchQueriesStore.set(this.plugin.getSettingValue('_searchQueries'))
  }

  private renderView() {
    this.updateStores()
    if (!this._app) {
      this._app = mount(App, {
        target: this.contentEl,
        props: {
          app: this.app,
          updateSetting: (updates: Partial<TodoSettings>) => this.plugin.updateSettings(updates),
          onSearch: (val: string) => {
            this.searchTerm = val
            this.groupItems()
            todoGroupsStore.set(this.groupedItems)
          },
          onCopyTasks: this.handleCopyTasks.bind(this),
          registerSearchInput: (input: HTMLInputElement) => {
            this.searchInputRef = input
          },
        },
      })
    }
  }

  async refresh(all = false) {
    if (this.isRefreshing) return
    
    this.isRefreshing = true
    try {
      const startTime = Date.now()
      if (all) {
        this.lastRerender = 0
        this.itemsByFile.clear()
      }
      await this.calculateAllItems()
      this.groupItems()
      this.renderView()
      this.lastRerender = startTime
    } finally {
      this.isRefreshing = false
    }
  }

  rerender() {
    this.renderView()
  }

  async focusSearchInput(searchQuery?: string): Promise<void> {
    const workspace = this.app.workspace
    let leaf = workspace.getLeavesOfType(TODO_VIEW_TYPE)[0]

    if (!leaf) {
      await workspace.getRightLeaf(false).setViewState({
        type: TODO_VIEW_TYPE,
        active: true,
      })
      leaf = workspace.getLeavesOfType(TODO_VIEW_TYPE)[0]
      workspace.revealLeaf(leaf)
      workspace.setActiveLeaf(leaf, {focus: true})
    } else {
      workspace.revealLeaf(leaf)
      workspace.setActiveLeaf(leaf, {focus: true})
    }

    const container = this.containerEl
    if (container) {
      container.scrollTop = 0
    }

    setTimeout(() => {
      this.searchInputRef?.focus()
      if (searchQuery !== undefined) {
        const inputEvent = new Event('input', {bubbles: true})
        this.searchInputRef.value = searchQuery
        this.searchInputRef.dispatchEvent(inputEvent)
        requestAnimationFrame(() => {
          //@ts-ignore
          this.searchInputRef?.focus({focusVisible: true})
        })
      }
    }, 100)
  }

  private deleteFile(path: string) {
    this.itemsByFile.delete(path)
    this.groupItems()
    this.renderView()
  }

  private handleCopyTasks(): string {
    const lines: string[] = []

    for (const group of this.groupedItems) {
      if (this.plugin.getSettingValue('groupBy') === 'page' && (group as any).pageName) {
        lines.push((group as any).pageName)
      } else if (this.plugin.getSettingValue('groupBy') === 'tag' && (group as any).mainTag) {
        const mainTag = (group as any).mainTag
        const subTags = (group as any).subTags ?? ''
        const header = subTags ? `${mainTag}/${subTags}` : mainTag
        lines.push(header)
      }

      for (const todo of group.todos) {
        const cleanText = todo.originalText.replace(/^#\s*/, '')
        lines.push(`- [${todo.checked ? 'x' : ' '}] ${cleanText}`)
      }

      lines.push('')
    }

    return lines.join('\n')
  }

  private async calculateAllItems() {
    const todosForUpdatedFiles = await parseTodos(
      this.app.vault.getMarkdownFiles(),
      this.todoTagArray.length === 0 ? ['*'] : this.visibleTodoTagArray,
      this.app.metadataCache,
      this.app.vault,
      this.plugin.getSettingValue('includeFiles'),
      this.plugin.getSettingValue('showChecked'),
      this.plugin.getSettingValue('showAllTodos'),
      this.lastRerender,
      this.plugin.getSettingValue('priorityTag'),
      this.app,
    )
    for (const [file, todos] of todosForUpdatedFiles) {
      this.itemsByFile.set(file.path, todos)
    }
  }

  private parseSearchQuery(query: string): string[][] {
    if (!query.trim()) return []

    const terms: string[][] = []
    const orGroups = query.split(/\s+OR\s+/i)

    for (const group of orGroups) {
      const andTerms: string[] = []

      const quotedRegex = /"([^"]+)"/g
      let match: RegExpExecArray | null
      let remaining = group

      while ((match = quotedRegex.exec(group)) !== null) {
        andTerms.push(match[1].toLowerCase())
        remaining = remaining.replace(match[0], '')
      }

      const remainingTerms = remaining.split(/\s+AND\s+|\s+/i).filter(t => t.trim())
      for (const term of remainingTerms) {
        andTerms.push(term.toLowerCase())
      }

      if (andTerms.length > 0) {
        terms.push(andTerms)
      }
    }

    return terms.length > 0 ? terms : []
  }

  private itemMatchesSearch(item: TodoItem, searchTerms: string[]): boolean {
    const lowerText = item.originalText.toLowerCase()
    const lowerMainTag = item.mainTag?.toLowerCase() ?? ''
    const lowerSubTag = item.subTag?.toLowerCase() ?? ''
    const combined = item.mainTag && item.subTag ? `#${item.mainTag}/${item.subTag}`.toLowerCase() : ''

    return searchTerms.every(
      term =>
        lowerText.includes(term) ||
        lowerMainTag.includes(term) ||
        lowerSubTag.includes(term) ||
        combined.includes(term),
    )
  }

  private groupItems() {
    const flattenedItems = Array.from(this.itemsByFile.values()).flat()
    const viewOnlyOpen = this.plugin.getSettingValue('showOnlyActiveFile')
    const openFile = this.app.workspace.getActiveFile()
    const filteredItems = viewOnlyOpen
      ? flattenedItems.filter(i => i.filePath === openFile.path)
      : flattenedItems

    const searchQuery = this.parseSearchQuery(this.searchTerm)
    const searchedItems = filteredItems.filter(e => {
      if (searchQuery.length === 0) return true
      return searchQuery.some(andTerms => this.itemMatchesSearch(e, andTerms))
    })
    this.groupedItems = groupTodos(
      searchedItems,
      this.plugin.getSettingValue('groupBy'),
      this.plugin.getSettingValue('sortDirectionGroups'),
      this.plugin.getSettingValue('sortDirectionItems'),
      this.plugin.getSettingValue('subGroups'),
      this.plugin.getSettingValue('sortDirectionSubGroups'),
      this.plugin.getSettingValue('baseTagFirst'),
      this.plugin.getSettingValue('priorityTag'),
    )
  }
}
