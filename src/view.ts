import {ItemView, WorkspaceLeaf} from 'obsidian'
import {mount, unmount} from 'svelte'

import {TODO_VIEW_TYPE} from './constants'
import App from './svelte/App.svelte'
import {groupTodos, groupTodosByPriority, groupTodosByDate, parseTodos, wireFamilyAndInherited} from './utils'
import {
  todoGroupsStore,
  todoTagsStore,
  collapsedSectionsStore,
  hiddenTagsStore,
  priorityTagStore,
  maxTasksPerGroupStore,
  enableLimitStore,
  showSettingsPanelStore,
  searchQueriesStore,
  bookmarksStore,
  activePanelTabStore,
  dateTagStore,
  groupModeStore,
} from './svelte/viewStore'

import type {TodoSettings} from './settings'
import type TodoPlugin from './main'
import type {TodoGroup, TodoItem, DateFilter, PriorityFilter, StatusFilter} from './_types'

export default class TodoListView extends ItemView {
  private _app: ReturnType<typeof mount>
  private lastRerender = 0
  public groupedItems: TodoGroup[] = []
  public itemsByFile = new Map<string, TodoItem[]>()
  private parsedSearch: {textTerms: string[][]; negatedTerms: string[]; dateFilters: DateFilter[]; priorityFilters: PriorityFilter[]; statusFilters: StatusFilter[]} = {textTerms: [], negatedTerms: [], dateFilters: [], priorityFilters: [], statusFilters: []}
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
    collapsedSectionsStore.set(this.plugin.getSettingValue('_collapsedSections'))
    hiddenTagsStore.set(this.plugin.getSettingValue('_hiddenTags'))
    priorityTagStore.set(this.plugin.getSettingValue('priorityTag'))
    maxTasksPerGroupStore.set(this.plugin.getSettingValue('maxTasksPerGroup'))
    enableLimitStore.set(this.plugin.getSettingValue('enableLimit'))
    showSettingsPanelStore.set(this.plugin.getSettingValue('_showSettingsPanel'))
    searchQueriesStore.set(this.plugin.getSettingValue('_searchQueries'))
    bookmarksStore.set(this.plugin.getSettingValue('_bookmarks'))
    activePanelTabStore.set(this.plugin.getSettingValue('_activePanelTab'))
    dateTagStore.set(this.plugin.getSettingValue('dateTag'))
    groupModeStore.set(
      this.plugin.getSettingValue('dateGrouping')
        ? 'date'
        : this.plugin.getSettingValue('prioGrouping')
          ? 'priority'
          : this.plugin.getSettingValue('groupBy'),
    )
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
            this.parsedSearch = this.parseSearchQuery(val)
            this.groupItems()
            todoGroupsStore.set(this.groupedItems)
          },
          onCopyTasks: this.handleCopyTasks.bind(this),
          registerSearchInput: (input: HTMLInputElement) => {
            this.searchInputRef = input
          },
          restoreLastSearch: this.plugin.getSettingValue('_restoreLastSearch'),
          lastSearchQuery: this.plugin.getSettingValue('_searchQueries')[0] || '',
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
      if (group.type === 'priority') {
        lines.push(`Priority ${group.priorityValue}`)
      } else if (group.type === 'page' && group.pageName) {
        lines.push(group.pageName)
      } else if (group.type === 'tag' && group.mainTag) {
        const header = group.subTags ? `${group.mainTag}/${group.subTags}` : group.mainTag
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
      this.plugin.getSettingValue('showAllTodos'),
      this.lastRerender,
      this.plugin.getSettingValue('priorityTag'),
      this.plugin.getSettingValue('dateTag'),
    )
    for (const [file, todos] of todosForUpdatedFiles) {
      // Wire family + inherited aux on the full per-file set (done tasks included
      // so lineage passes through them). This is allTodos; showChecked filtering
      // to shownTasks happens at display time in groupItems.
      wireFamilyAndInherited(todos)
      this.itemsByFile.set(file.path, todos)
    }
  }

  private parseSearchQuery(query: string): { textTerms: string[][], negatedTerms: string[], dateFilters: DateFilter[], priorityFilters: PriorityFilter[], statusFilters: StatusFilter[] } {
    if (!query.trim()) return { textTerms: [], negatedTerms: [], dateFilters: [], priorityFilters: [], statusFilters: [] }

    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const dateTag = this.plugin.getSettingValue('dateTag')
    const priorityTag = this.plugin.getSettingValue('priorityTag')

    const dateFilters: DateFilter[] = []
    const priorityFilters: PriorityFilter[] = []
    const statusFilters: StatusFilter[] = []

    // Extract task-status tokens like [!], [x], [ ], [T] (exactly one char inside brackets).
    // Done FIRST so the space inside "[ ]" survives intact (the text split below runs on whitespace).
    // A leading "-" negates: -[x] excludes done tasks. Positive tokens combine as OR.
    const statusRegex = /(-?)\[(.)\]/g
    let remainingQuery = query.replace(statusRegex, (_match, neg: string, ch: string) => {
      statusFilters.push({status: ch.toLowerCase(), negated: neg === '-'})
      return ''
    })

    // Extract date operators BEFORE text splitting.
    // Natural-language words stay literal; the symbol form uses the configured dateTag.
    // IMPORTANT: Longer patterns must come first (>= before >).
    const dateOps = ['before:', 'after:', 'on:', 'due:']
    if (dateTag) {
      const dt = escapeRegex(dateTag)
      dateOps.push(`${dt}<=`, `${dt}>=`, `${dt}<`, `${dt}>`, `${dt}=`)
    }
    const dateRegex = new RegExp(`(${dateOps.join('|')})\\s*(\\S+)`, 'gi')

    // console.log('Search query:', query)
    remainingQuery = remainingQuery.replace(dateRegex, (match, operator, value) => {
      console.log('Date match:', match, 'Operator:', operator, 'Value:', value)
      const filter = this.parseDateOperator(operator, value, dateTag)
      console.log('Parsed filter:', filter)
      if (!filter) return match // invalid value → keep as plain text (consistent with priority)
      dateFilters.push(filter)
      return '' // Remove from text query
    })

    // Extract priority operators (glued, e.g. prio>=2) using the configured priorityTag.
    if (priorityTag) {
      const pt = escapeRegex(priorityTag)
      const prioRegex = new RegExp(`${pt}(<=|>=|<|>|=)\\s*(-?\\d+)`, 'gi')
      remainingQuery = remainingQuery.replace(prioRegex, (_match, operator, value) => {
        priorityFilters.push({operator: operator as PriorityFilter['operator'], value: parseInt(value, 10)})
        return ''
      })
    }
    // console.log('Remaining query:', remainingQuery)

    // Process remaining text search normally. A leading "-" negates a term:
    // "-foo" and -"foo bar" exclude items that contain that term/phrase.
    const textTerms: string[][] = []
    const negatedTerms: string[] = []
    const orGroups = remainingQuery.split(/\s+OR\s+/i)

    for (const group of orGroups) {
      const andTerms: string[] = []

      const quotedRegex = /(-?)"([^"]+)"/g
      let match: RegExpExecArray | null
      let remaining = group

      while ((match = quotedRegex.exec(group)) !== null) {
        const phrase = match[2].toLowerCase()
        if (match[1] === '-') negatedTerms.push(phrase)
        else andTerms.push(phrase)
        remaining = remaining.replace(match[0], '')
      }

      const remainingTerms = remaining.split(/\s+AND\s+|\s+/i).filter(t => t.trim())
      for (const term of remainingTerms) {
        if (term.startsWith('-') && term.length > 1) {
          negatedTerms.push(term.slice(1).toLowerCase())
        } else {
          andTerms.push(term.toLowerCase())
        }
      }

      if (andTerms.length > 0) {
        textTerms.push(andTerms)
      }
    }

    return {textTerms: textTerms.length > 0 ? textTerms : [], negatedTerms, dateFilters, priorityFilters, statusFilters}
  }

  private parseDateOperator(match: string, value: string, dateTag: string): DateFilter | null {
    const operator = match.toLowerCase().trim()

    console.log('Parsing operator:', operator, 'with value:', value)

    // Word syntax (spaces allowed after colon)
    if (operator.startsWith('before:')) {
      const dateValue = this.parseDateValue(value)
      return dateValue ? { operator: 'before', dateValue } : null
    }
    if (operator.startsWith('after:')) {
      const dateValue = this.parseDateValue(value)
      return dateValue ? { operator: 'after', dateValue } : null
    }
    if (operator.startsWith('on:')) {
      const dateValue = this.parseDateValue(value)
      return dateValue ? { operator: 'on', dateValue } : null
    }
    if (operator.startsWith('due:')) {
      const dueValue = value.toLowerCase()
      if (dueValue === 'today') return { operator: 'on', dateValue: 'today' }
      if (dueValue === 'tomorrow') return { operator: 'on', dateValue: 'tomorrow' }
      if (dueValue === 'overdue') return { operator: 'before', dateValue: 'today' }
      if (dueValue === 'week') return { operator: '>=', dateValue: 'today' }
      if (dueValue === 'month') return { operator: '>=', dateValue: 'today' }
      const dateValue = this.parseDateValue(value)
      return dateValue ? { operator: 'on', dateValue } : null
    }

    // Symbol syntax (NO spaces in operator): keyword is the configured dateTag, e.g. date>=, due<
    const dt = dateTag.toLowerCase()
    if (dt && operator.startsWith(dt)) {
      const symbol = operator.slice(dt.length)
      const symbolOps: Record<string, DateFilter['operator']> = {'<': '<', '>': '>', '<=': '<=', '>=': '>=', '=': '='}
      const op = symbolOps[symbol]
      if (op) {
        const dateValue = this.parseDateValue(value)
        return dateValue ? { operator: op, dateValue } : null
      }
    }

    console.log('No matching operator found for:', operator)
    return null
  }

  private itemMatchesPriorityFilter(item: TodoItem, filter: PriorityFilter): boolean {
    if (item.priority === undefined) return false
    switch (filter.operator) {
      case '<': return item.priority < filter.value
      case '>': return item.priority > filter.value
      case '<=': return item.priority <= filter.value
      case '>=': return item.priority >= filter.value
      case '=': return item.priority === filter.value
      default: return false
    }
  }

  private parseDateValue(value: string): { type: 'exact' | 'partial', date: Date, partialInfo?: { year: number; month?: number } } | 'today' | 'tomorrow' | 'overdue' | 'week' | 'month' | undefined {
    const lowerValue = value.toLowerCase()

    // Handle relative date keywords
    if (lowerValue === 'today') return 'today'
    if (lowerValue === 'tomorrow') return 'tomorrow'
    if (lowerValue === 'overdue') return 'overdue'
    if (lowerValue === 'week') return 'week'
    if (lowerValue === 'month') return 'month'

    // Parse exact date format YYYY-MM-DD
    const exactMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (exactMatch) {
      const [, year, month, day] = exactMatch
      return { type: 'exact', date: new Date(parseInt(year), parseInt(month) - 1, parseInt(day)) }
    }

    // Parse partial date formats YYYY-MM or YYYY
    const partialMatch = /^(\d{4})(?:-(\d{2}))?$/.exec(value)
    if (partialMatch) {
      const [, year, month] = partialMatch
      if (month) {
        // YYYY-MM format (month specified) - use end of month as reference date
        const refDate = new Date(parseInt(year), parseInt(month), 0)
        return { type: 'partial' as const, date: refDate, partialInfo: { year: parseInt(year), month: parseInt(month) } }
      } else {
        // YYYY format (year only) - use end of year as reference date
        const refDate = new Date(parseInt(year), 12, 0)
        return { type: 'partial' as const, date: refDate, partialInfo: { year: parseInt(year) } }
      }
    }

    return undefined // Invalid date format - fail instead of defaulting
  }

  private resolveDateValue(dateValue: Date | 'today' | 'tomorrow' | 'overdue' | 'week' | 'month' | { type: 'exact' | 'partial', date: Date, partialInfo?: { year: number; month?: number } }): Date {
    if (dateValue instanceof Date) return dateValue

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    if (dateValue === 'today') return today
    if (dateValue === 'tomorrow') {
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      return tomorrow
    }
    if (dateValue === 'overdue') return today // For "before" comparisons
    if (dateValue === 'week') return today
    if (dateValue === 'month') return today

    // Handle partial dates
    if (typeof dateValue === 'object' && 'type' in dateValue) {
      return dateValue.date
    }

    return today
  }

  private getDateBoundary(partialInfo: { year: number; month?: number }, operator: string): Date {
    // For >= and <  → use START of period
    // For > and <=  → use END of period
    const useLowerBoundary = (operator === '>=' || operator === '<')
    const useUpperBoundary = (operator === '>' || operator === '<=')

    if (useLowerBoundary) {
      // START of period
      if (partialInfo.month !== undefined) {
        // Start of month: June 1, 2026
        return new Date(partialInfo.year, partialInfo.month - 1, 1)
      } else {
        // Start of year: Jan 1, 2026
        return new Date(partialInfo.year, 0, 1)
      }
    }

    if (useUpperBoundary) {
      // END of period
      if (partialInfo.month !== undefined) {
        // End of month: June 30, 2026
        return new Date(partialInfo.year, partialInfo.month, 0)
      } else {
        // End of year: Dec 31, 2026
        return new Date(partialInfo.year, 11, 31)
      }
    }

    return new Date() // Fallback
  }

  private itemMatchesDateFilter(item: TodoItem, filter: DateFilter): boolean {
    if (!item.date) {
      return false // Items without dates don't match date filters
    }

    const itemDate = new Date(item.date.getFullYear(), item.date.getMonth(), item.date.getDate())

    // Handle partial dates (YYYY-MM or YYYY)
    let filterDateMidnight: Date
    if (typeof filter.dateValue === 'object' && 'partialInfo' in filter.dateValue) {
      const boundaryDate = this.getDateBoundary((filter.dateValue as any).partialInfo, filter.operator)
      filterDateMidnight = new Date(boundaryDate.getFullYear(), boundaryDate.getMonth(), boundaryDate.getDate())
    } else {
      const filterDate = this.resolveDateValue(filter.dateValue)
      filterDateMidnight = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate())
    }

    console.log('Date comparison:', {
      itemText: item.originalText.substring(0, 30),
      itemDate: itemDate.toISOString().split('T')[0],
      filterOperator: filter.operator,
      filterDate: filterDateMidnight.toISOString().split('T')[0]
    })

    switch (filter.operator) {
      case 'before':
      case '<':
        return itemDate < filterDateMidnight
      case 'after':
      case '>':
        return itemDate > filterDateMidnight
      case 'on':
      case '=':
        // For partial dates with '=' operator, check if item date falls within the period
        if (typeof filter.dateValue === 'object' && 'partialInfo' in filter.dateValue) {
          return this.isDateInPeriod(itemDate, (filter.dateValue as any).partialInfo)
        }
        return itemDate.getTime() === filterDateMidnight.getTime()
      case '>=':
        return itemDate >= filterDateMidnight
      case '<=':
        return itemDate <= filterDateMidnight
      default:
        return false
    }
  }

  private isDateInPeriod(date: Date, partialInfo: { year: number; month?: number }): boolean {
    if (partialInfo.month !== undefined) {
      // Check if date falls within the specified month
      return date.getFullYear() === partialInfo.year && date.getMonth() === partialInfo.month - 1
    } else {
      // Check if date falls within the specified year
      return date.getFullYear() === partialInfo.year
    }
  }

  private itemContainsText(item: TodoItem, term: string): boolean {
    const lowerText = item.originalText.toLowerCase()
    if (lowerText.includes(term)) return true
    for (const t of item.taskTags) {
      const lowerMainTag = t.main?.toLowerCase() ?? ''
      const lowerSubTag = t.sub?.toLowerCase() ?? ''
      const combined = t.main && t.sub ? `#${t.main}/${t.sub}`.toLowerCase() : ''
      if (lowerMainTag.includes(term) || lowerSubTag.includes(term) || combined.includes(term)) return true
    }
    // Auxiliary tags (inline + block + inherited from ancestors). All lowercased;
    // `term` is already lowercased by the query parser. Short-circuits per array.
    if (Object.values(item.auxTags).some(arr => arr.some(t => t.includes(term)))) return true
    return false
  }

  private itemMatchesSearch(item: TodoItem, searchTerms: string[], dateFilters: DateFilter[]): boolean {
    const textMatch = searchTerms.every(term => this.itemContainsText(item, term))
    const dateMatch = dateFilters.every(filter => this.itemMatchesDateFilter(item, filter))

    return textMatch && dateMatch
  }

  private groupItems() {
    // itemsByFile holds allTodos (done included, family already wired). showChecked
    // is the discernor: shownTasks is the display subset with done removed when off.
    const allTodos = Array.from(this.itemsByFile.values()).flat()
    const showChecked = this.plugin.getSettingValue('showChecked')
    const shownTasks = showChecked ? allTodos : allTodos.filter(i => !i.checked)

    const viewOnlyOpen = this.plugin.getSettingValue('showOnlyActiveFile')
    const openFile = this.app.workspace.getActiveFile()
    const filteredItems = viewOnlyOpen
      ? shownTasks.filter(i => i.filePath === openFile.path)
      : shownTasks

    const { textTerms, negatedTerms, dateFilters, priorityFilters, statusFilters } = this.parsedSearch
    // console.log('Parsed search - textTerms:', textTerms, 'dateFilters:', dateFilters, 'priorityFilters:', priorityFilters)

    const positiveStatusFilters = statusFilters.filter(f => !f.negated)
    const negatedStatusFilters = statusFilters.filter(f => f.negated)

    const searchedItems = filteredItems.filter(e => {
      if (!dateFilters.every(filter => this.itemMatchesDateFilter(e, filter))) return false
      if (!priorityFilters.every(filter => this.itemMatchesPriorityFilter(e, filter))) return false
      // Positive status filters combine as OR (a task has exactly one status);
      // negated filters (-[x]) exclude. Comparison is case-insensitive.
      if (positiveStatusFilters.length > 0 && !positiveStatusFilters.some(f => e.taskStatus.toLowerCase() === f.status)) return false
      if (negatedStatusFilters.some(f => e.taskStatus.toLowerCase() === f.status)) return false
      if (negatedTerms.some(term => this.itemContainsText(e, term))) return false
      if (textTerms.length === 0) return true
      return textTerms.some(andTerms => this.itemMatchesSearch(e, andTerms, []))
    })

    // console.log('Search results:', searchedItems.length, 'items from', filteredItems.length)

    // Family-context expansion runs AFTER grouping/sorting: the user's normal
    // item sort is applied to matched tasks first; then each task's family
    // (ancestors incl. done above, open descendants below) is attached next to
    // it as dimmed, non-interactive context. The sort is never disturbed.
    const familyExpansion = this.plugin.getSettingValue('showFamilyInSearch')
    for (const it of searchedItems) it.isFamilyContext = false

    const prioGrouping = this.plugin.getSettingValue('prioGrouping')
    const priorityTag = this.plugin.getSettingValue('priorityTag')
    const dateGrouping = this.plugin.getSettingValue('dateGrouping')
    const dateTag = this.plugin.getSettingValue('dateTag')

    if (dateGrouping && dateTag) {
      this.groupedItems = groupTodosByDate(searchedItems, this.plugin.getSettingValue('sortDirectionItems'))
    } else if (prioGrouping && priorityTag) {
      this.groupedItems = groupTodosByPriority(searchedItems, this.plugin.getSettingValue('sortDirectionItems'))
    } else {
      this.groupedItems = groupTodos(
        searchedItems,
        this.plugin.getSettingValue('groupBy'),
        this.plugin.getSettingValue('sortDirectionGroups'),
        this.plugin.getSettingValue('sortDirectionItems'),
        this.plugin.getSettingValue('baseTagFirst'),
        priorityTag,
      )
    }

    if (familyExpansion) this.injectFamilyContext()
  }

  /** Attach each matched task's family as dimmed context next to it, without
   *  disturbing the already-sorted primary order. Ancestors (incl. done) go
   *  above the match, open descendants below. Each relative appears once. */
  private injectFamilyContext() {
    const injected = new Set<TodoItem>()
    for (const g of this.groupedItems) {
      for (const t of g.todos) injected.add(t)
      if (g.groups) for (const s of g.groups) for (const t of s.todos) injected.add(t)
    }
    const injectInto = (todos: TodoItem[]): TodoItem[] => {
      const out: TodoItem[] = []
      for (const primary of todos) {
        const ancestors: TodoItem[] = []
        let p = primary.family?.parent
        while (p) {
          if (!injected.has(p)) {injected.add(p); ancestors.unshift(p)}
          p = p.family?.parent
        }
        for (const a of ancestors) {a.isFamilyContext = true; out.push(a)}
        primary.isFamilyContext = false
        out.push(primary)
        const addDesc = (node: TodoItem) => {
          for (const child of node.family?.children ?? []) {
            if (child.checked || injected.has(child)) continue
            injected.add(child)
            child.isFamilyContext = true
            out.push(child)
            addDesc(child)
          }
        }
        addDesc(primary)
      }
      return out
    }
    for (const g of this.groupedItems) {
      if (g.todos.length) g.todos = injectInto(g.todos)
      if (g.groups) for (const s of g.groups) if (s.todos.length) s.todos = injectInto(s.todos)
    }
  }
}
