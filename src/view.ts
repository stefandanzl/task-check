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
      updateSetting: (updates: Partial<TodoSettings>) => this.plugin.updateSettings(updates),
      onSearch: (val: string) => {
        this.searchTerm = val
        this.refresh()
      },
    }
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
    )
    for (const [file, todos] of todosForUpdatedFiles) {
      this.itemsByFile.set(file.path, todos)
    }
  }

  private groupItems() {
    const flattenedItems = Array.from(this.itemsByFile.values()).flat()
    const viewOnlyOpen = this.plugin.getSettingValue('showOnlyActiveFile')
    const openFile = this.app.workspace.getActiveFile()
    const filteredItems = viewOnlyOpen ? flattenedItems.filter(i => i.filePath === openFile.path) : flattenedItems
    const searchLower = this.searchTerm.toLowerCase()
    const searchedItems = filteredItems.filter(e => {
      // Search in original text
      if (e.originalText.toLowerCase().includes(searchLower)) return true
      // Search in main tag
      if (e.mainTag && e.mainTag.toLowerCase().includes(searchLower)) return true
      // Search in sub tag
      if (e.subTag && e.subTag.toLowerCase().includes(searchLower)) return true
      // Search in combined "main/sub" format
      if (e.mainTag && e.subTag) {
        const combined = `#${e.mainTag}/${e.subTag}`.toLowerCase()
        if (combined.includes(searchLower)) return true
      }
      return false
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
