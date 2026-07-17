import {Editor, MarkdownView, Notice, Plugin, type ObsidianProtocolData} from 'obsidian'

import {TODO_VIEW_TYPE} from './constants'
import {DEFAULT_SETTINGS, type TodoSettings, TodoSettingTab} from './settings'
import {StatusSuggestModal} from './StatusSuggestModal'
import TodoListView from './view'
import {setTaskStatusChar} from './utils/helpers'
import type {TodoGroup, TodoItem} from './_types'
import {toggleTodoItem} from './utils'
import {undoLast} from './undo'
import { buildIcons } from './utils/helpers'

export default class TodoPlugin extends Plugin {
  settings!: TodoSettings

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

  public async focusSearchInput(searchQuery?: string): Promise<void> {
    const view = this.view
    if (!view) {
      // View doesn't exist yet, open it first
      const workspace = this.app.workspace
      await workspace.getRightLeaf(false).setViewState({
        type: TODO_VIEW_TYPE,
        active: true,
      })
    }
    // Now get the view and focus
    const focusedView = this.view
    if (!focusedView) return
    await focusedView.focusSearchInput(searchQuery)
  }

  async onload() {
    await this.loadSettings()
    buildIcons()

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
      id: 'undo-last-task-action',
      name: 'Undo last task action',
      callback: () => {
        void undoLast(this.app, true)
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

        // Get the first tag only
        const firstTag = this.settings.todoPageName[0]?.trim() ?? ''
        editor.replaceSelection(`#${firstTag}/`)

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

    this.addCommand({
      id: 'open-search',
      name: 'Open search',
      icon: 'list-todo',
      callback: async () => {
        await this.focusSearchInput()
      },
    })

    this.addCommand({
      id: 'set-status-current-line',
      name: 'Set status for selected task line(s)',
      icon: 'square-check-big',
      editorCallback: (editor: Editor) => {
        // Collect every checklist line covered by the current selection(s).
        // Non-checklist lines are skipped silently; a plain cursor (no selection)
        // collapses to the single line under it. Multi-cursor selections are
        // merged and deduped.
        const taskLines: number[] = []
        const seen = new Set<number>()
        for (const sel of editor.listSelections()) {
          const from = Math.min(sel.anchor.line, sel.head.line)
          const to = Math.max(sel.anchor.line, sel.head.line)
          for (let l = from; l <= to; l++) {
            if (seen.has(l)) continue
            seen.add(l)
            if (/^(\s|>)*([-*]|[0-9]+\.)\s\[([^\]]+)\]/.test(editor.getLine(l))) taskLines.push(l)
          }
        }
        if (taskLines.length === 0) {
          new Notice('Select a task line (- [ ]) first')
          return
        }
        new StatusSuggestModal(this.app, (symbol) => {
          // Re-read each line at apply time in case it changed while the modal
          // was open; only the status char is swapped.
          for (const l of taskLines) {
            editor.setLine(l, setTaskStatusChar(editor.getLine(l), symbol))
          }
        }).open()
      },
    })

    // obsidian://taskcheck?search=<query> — opens the pane and runs the query.
    this.registerObsidianProtocolHandler('taskcheck', (data: ObsidianProtocolData) => {
      const raw = data.search
      const search = raw && raw !== 'true' ? raw : undefined
      this.focusSearchInput(search)
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
    // Settings Migration: Older versions stored todoPageName as a newline-separated string; coerce to array.
    const rawTodoPageName = (loadedData as {todoPageName?: unknown}).todoPageName
    if (typeof rawTodoPageName === 'string') {
      this.settings.todoPageName = rawTodoPageName
        .split('\n')
        .map(e => e.trim())
        .filter(Boolean)
    }
  }

  async updateSettings(updates: Partial<TodoSettings>) {
    Object.assign(this.settings, updates)
    await this.saveData(this.settings)
    const onlyRepaintWhenChanges = [
      'autoRefresh',
      '_collapsedSections',
      '_showSettingsPanel',
      '_bookmarks',
      '_activePanelTab',
    ]
    const onlyReGroupWhenChanges = [
      'groupBy',
      'sortDirectionGroups',
      'sortDirectionItems',
      'baseTagFirst',
      'prioGrouping',
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
