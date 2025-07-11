import {MarkdownView, Plugin} from 'obsidian'

import {TODO_VIEW_TYPE} from './constants'
import {DEFAULT_SETTINGS, TodoSettings, TodoSettingTab} from './settings'
import TodoListView from './view'
import type {TodoGroup, TodoItem} from './_types'
import {toggleTodoItem} from './utils'

export default class TodoPlugin extends Plugin {
  private settings: TodoSettings

  get view() {
    return this.app.workspace.getLeavesOfType(TODO_VIEW_TYPE)[0]
      ?.view as TodoListView
  }

  // Add this public method to expose tasks
  public getTasks(): Map<string, TodoItem[]> {
    if (!this.view) return new Map()
    return this.view.itemsByFile // We'll need to make itemsByFile public in TodoListView
  }

  // Optionally add this for grouped tasks
  public getGroupedTasks(): TodoGroup[] {
    if (!this.view) return []
    return this.view.groupedItems // We'll need to make groupedItems public in TodoListView
  }

  public toggleTask(item: TodoItem) {
    if (!item) {
      console.error('No item')
      return
    }

    toggleTodoItem(item, this.app)
  }

  async onload() {
    await this.loadSettings()

    this.addSettingTab(new TodoSettingTab(this.app, this))
    this.addCommand({
      id: 'show-checklist-view',
      name: 'Show Checklist Pane',
      callback: () => {
        const workspace = this.app.workspace
        const views = workspace.getLeavesOfType(TODO_VIEW_TYPE)
        if (views.length === 0) {
          workspace
            .getRightLeaf(false)
            .setViewState({
              type: TODO_VIEW_TYPE,
              active: true,
            })
            .then(() => {
              const todoLeaf = workspace.getLeavesOfType(TODO_VIEW_TYPE)[0]
              workspace.revealLeaf(todoLeaf)
              workspace.setActiveLeaf(todoLeaf, true, true)
            })
        } else {
          views[0].setViewState({
            active: true,
            type: TODO_VIEW_TYPE,
          })
          workspace.revealLeaf(views[0])
          workspace.setActiveLeaf(views[0], true, true)
        }
      },
    })
    this.addCommand({
      id: 'refresh-checklist-view',
      name: 'Refresh List',
      callback: () => {
        this.view.refresh()
      },
    })

    this.addCommand({
      id: 'text-helper',
      name: 'Task text helper',
      icon: 'wrap-text',
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView)
        const editor = view?.editor

        if (!editor) return

        editor.replaceSelection(`#${this.settings.todoPageName}/`)

        const handleEnter = (event: KeyboardEvent) => {
          if (event.key === 'Enter') {
            window.removeEventListener('keydown', handleEnter)

            // Add " - [ ] " after a short delay to ensure the newline is processed
            setTimeout(() => {
              editor.replaceSelection('- [ ] ')
            }, 10)
          }
        }
        // Add the event listener
        window.addEventListener('keydown', handleEnter)
      },
    })

    this.registerView(TODO_VIEW_TYPE, leaf => {
      const newView = new TodoListView(leaf, this)
      return newView
    })

    if (this.app.workspace.layoutReady) this.initLeaf()
    else this.app.workspace.onLayoutReady(() => this.initLeaf())
  }

  initLeaf(): void {
    if (this.app.workspace.getLeavesOfType(TODO_VIEW_TYPE).length) return

    this.app.workspace.getRightLeaf(false).setViewState({
      type: TODO_VIEW_TYPE,
      active: true,
    })
  }

  async onunload() {
    this.app.workspace.getLeavesOfType(TODO_VIEW_TYPE)[0]?.detach()
  }

  async loadSettings() {
    const loadedData = await this.loadData()
    this.settings = {...DEFAULT_SETTINGS, ...loadedData}
  }

  async updateSettings(updates: Partial<TodoSettings>) {
    Object.assign(this.settings, updates)
    await this.saveData(this.settings)
    const onlyRepaintWhenChanges = [
      'autoRefresh',
      'lookAndFeel',
      '_collapsedSections',
    ]
    const onlyReGroupWhenChanges = [
      'subGroups',
      'groupBy',
      'sortDirectionGroups',
      'sortDirectionSubGroups',
      'sortDirectionItems',
      'baseTagFirst',
    ]
    if (onlyRepaintWhenChanges.includes(Object.keys(updates)[0]))
      this.view.rerender()
    else
      this.view.refresh(
        !onlyReGroupWhenChanges.includes(Object.keys(updates)[0]),
      )
  }

  getSettingValue<K extends keyof TodoSettings>(setting: K): TodoSettings[K] {
    return this.settings[setting]
  }
}
