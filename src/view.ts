import {ItemView, WorkspaceLeaf} from 'obsidian'

import {TODO_VIEW_TYPE} from './constants'
import App from './svelte/App.svelte'
import {groupTodos, parseTodos} from './utils'

import type {TodoSettings} from './settings'
import type TodoPlugin from './main'
import type {TodoGroup, TodoItem} from './_types'
export default class TodoListView extends ItemView {
  private _app: App
  private lastRerender = 0
  public groupedItems: TodoGroup[] = []
  public itemsByFile = new Map<string, TodoItem[]>()
  private searchTerm = ''

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
    this._app.$destroy()
  }

  async onOpen(): Promise<void> {
    this._app = new App({
      target: (this as any).contentEl,
      props: this.props(),
    })
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
    this.refresh()
  }

  async refresh(all = false) {
    if (all) {
      this.lastRerender = 0
      this.itemsByFile.clear()
    }
    await this.calculateAllItems()
    this.groupItems()
    this.renderView()
    this.lastRerender = +new Date()
  }

  rerender() {
    this.renderView()
  }

  private deleteFile(path: string) {
    this.itemsByFile.delete(path)
    this.groupItems()
    this.renderView()
  }

  private props() {
    return {
      todoTags: this.todoTagArray,
      lookAndFeel: this.plugin.getSettingValue('lookAndFeel'),
      subGroups: this.plugin.getSettingValue('subGroups'),
      _collapsedSections: this.plugin.getSettingValue('_collapsedSections'),
      _hiddenTags: this.plugin.getSettingValue('_hiddenTags'),
      app: this.app,
      todoGroups: this.groupedItems,
      priorityTag: this.plugin.getSettingValue('priorityTag'),
      maxTasksPerGroup: this.plugin.getSettingValue('maxTasksPerGroup'),
      enableLimit: this.plugin.getSettingValue('enableLimit'),
      groupBy: this.plugin.getSettingValue('groupBy'),
      updateSetting: (updates: Partial<TodoSettings>) => this.plugin.updateSettings(updates),
      onSearch: (val: string) => {
        this.searchTerm = val
        this.refresh()
      },
      onCopyTasks: this.handleCopyTasks.bind(this),
    }
  }

  private handleCopyTasks(): string {
    const lines: string[] = []

    for (const group of this.groupedItems) {
      // Add group title if grouping by page
      if (this.plugin.getSettingValue('groupBy') === 'page' && (group as any).pageName) {
        lines.push((group as any).pageName)
      } else if (this.plugin.getSettingValue('groupBy') === 'tag' && (group as any).mainTag) {
        const mainTag = (group as any).mainTag
        const subTags = (group as any).subTags ?? ""
        const header = subTags ? `${mainTag}/${subTags}` : mainTag
        lines.push(header)
      }

      // Add all tasks in this group
      for (const todo of group.todos) {
        // Remove hashtag symbols from task text
        const cleanText = todo.originalText.replace(/^#\s*/, '')
        lines.push(`- [${todo.checked ? 'x' : ' '}] ${cleanText}`)
      }

      // Add empty line between groups
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

      // Extract quoted phrases first
      const quotedRegex = /"([^"]+)"/g
      let match: RegExpExecArray | null
      let remaining = group

      while ((match = quotedRegex.exec(group)) !== null) {
        andTerms.push(match[1].toLowerCase())
        remaining = remaining.replace(match[0], '')
      }

      // Split remaining by AND or whitespace
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

    return searchTerms.every(term =>
      lowerText.includes(term) ||
      lowerMainTag.includes(term) ||
      lowerSubTag.includes(term) ||
      combined.includes(term)
    )
  }

  private groupItems() {
    const flattenedItems = Array.from(this.itemsByFile.values()).flat()
    const viewOnlyOpen = this.plugin.getSettingValue('showOnlyActiveFile')
    const openFile = this.app.workspace.getActiveFile()
    const filteredItems = viewOnlyOpen ? flattenedItems.filter(i => i.filePath === openFile.path) : flattenedItems

    const searchQuery = this.parseSearchQuery(this.searchTerm)
    const searchedItems = filteredItems.filter(e => {
      if (searchQuery.length === 0) return true
      // OR logic: match ANY group
      return searchQuery.some(andTerms =>
        // AND logic within group: match ALL terms
        this.itemMatchesSearch(e, andTerms)
      )
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

  private renderView() {
    this._app.$set(this.props())
  }
}
