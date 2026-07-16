import {classifyString, sortGenericItemsInplace} from './helpers'

import type {TodoItem, TodoGroup, PriorityGroup, GroupByType, SortDirection, DateCategory, DateGroup} from 'src/_types'

/**
 * Wires `family` (parent/children object refs) and `auxTags.inherited` on a
 * per-file task list. Done tasks are INCLUDED — lineage must pass through them
 * so a done parent's aux tags reach its descendants and the parent stays
 * reachable for context display. Runs on the full set (allTodos); display-side
 * showChecked filtering (shownTasks) is applied later and independently.
 *
 * `family`: undefined before this runs; {parent?, children?} if the task has a
 * parent or children; null if it's standalone (searched, nothing found).
 * `auxTags.inherited`: union of the parent's inline ∪ block ∪ inherited, so it
 * transitively carries every ancestor's aux tags. Items are processed line-order
 * (parents before children), so a parent's inherited is already final when its
 * children read it.
 */
export const wireFamilyAndInherited = (items: TodoItem[]) => {
  if (items.length === 0) return
  const sorted = [...items].sort((a, b) => a.line - b.line)

  // Pass 1 — resolve each item's parent via an indent stack.
  const parentOf = new Map<TodoItem, TodoItem>()
  const stack: TodoItem[] = []
  for (const item of sorted) {
    while (stack.length && stack[stack.length - 1].spacesIndented >= item.spacesIndented) stack.pop()
    if (stack.length) parentOf.set(item, stack[stack.length - 1])
    stack.push(item)
  }

  // Pass 2 — collect children from parent links.
  const childrenOf = new Map<TodoItem, TodoItem[]>()
  for (const [child, parent] of parentOf) {
    let arr = childrenOf.get(parent)
    if (!arr) childrenOf.set(parent, (arr = []))
    arr.push(child)
  }

  // Pass 3 — set family (null when standalone), then inherited aux (parents-first).
  for (const item of sorted) {
    const parent = parentOf.get(item)
    const children = childrenOf.get(item)
    item.family = parent || children ? {parent, children} : null
  }
  for (const item of sorted) {
    const parent = item.family?.parent
    if (parent) {
      const seen = new Set(item.auxTags.inherited)
      for (const src of [parent.auxTags.inline, parent.auxTags.block, parent.auxTags.inherited]) {
        for (const t of src) {
          if (!seen.has(t)) {
            seen.add(t)
            item.auxTags.inherited.push(t)
          }
        }
      }
    }
  }
}

/**
 * Pushes an item into a list only if no item with the same filePath:line is
 * already present. A task is uniquely identified by filePath:line, but the
 * parser can emit it multiple times (e.g. a block-level tag plus an inline tag,
 * or several tags that collapse to the same priority/date bucket). This keeps a
 * task from appearing twice within one group/bucket while leaving multi-tag
 * aggregation across *different* groups untouched.
 */
const pushUniqueByLocation = (list: TodoItem[], item: TodoItem) => {
  if (!list.some(t => t.filePath === item.filePath && t.line === item.line)) {
    list.push(item)
  }
}

export const groupTodos = (
  items: TodoItem[],
  groupBy: GroupByType,
  sortGroups: SortDirection,
  sortItems: SortDirection,
  subGroups: boolean,
  subGroupSort: SortDirection,
  baseTagFirst: boolean = false,
  priorityTag: string = '',
  preserveOrder: boolean = false,
): TodoGroup[] => {
  const groups: TodoGroup[] = []

  // In tag mode a multi-tag item fans out: one group per registered tag it
  // carries (so it appears under each of its tags). In page mode it lands in a
  // single group. Untagged items under tag mode collapse to one '#' group,
  // matching the previous single-tag behavior.
  type GroupSpec = {id: string; mainTag?: string; subTag?: string}
  const specsForItem = (item: TodoItem): GroupSpec[] => {
    if (groupBy === 'page') return [{id: item.filePath}]
    if (item.taskTags.length === 0) return [{id: '#'}]
    return item.taskTags.map(t => ({
      id: `#${[t.main, t.sub].filter(e => e != null).join('/')}`,
      mainTag: t.main,
      subTag: t.sub,
    }))
  }

  for (const item of items) {
    for (const spec of specsForItem(item)) {
      let group = groups.find(g => g.id === spec.id)
      if (!group) {
        const newGroup: TodoGroup = {
          id: spec.id,
          sortName: '',
          className: '',
          type: groupBy,
          todos: [],
          oldestCreatedItem: Infinity,
          newestCreatedItem: 0,
          oldestModifiedItem: Infinity,
          newestModifiedItem: 0,
        }

        if (newGroup.type === 'page') {
          newGroup.pageName = item.fileLabel
          newGroup.sortName = item.fileLabel
          newGroup.className = classifyString(item.fileLabel)
        } else if (newGroup.type === 'tag') {
          newGroup.mainTag = spec.mainTag
          newGroup.subTags = spec.subTag
          if (baseTagFirst && !spec.subTag) {
            newGroup.sortName = `0_${spec.mainTag}`
          } else {
            newGroup.sortName = spec.mainTag + (spec.subTag ?? '0')
          }
          newGroup.className = classifyString((newGroup.mainTag ?? '') + (newGroup.subTags ?? ''))
        }
        groups.push(newGroup)
        group = newGroup
      }
      if (group.newestCreatedItem < item.fileCreatedTs) group.newestCreatedItem = item.fileCreatedTs
      if (group.oldestCreatedItem > item.fileCreatedTs) group.oldestCreatedItem = item.fileCreatedTs
      if (group.newestModifiedItem < item.fileModifiedTs) group.newestModifiedItem = item.fileModifiedTs
      if (group.oldestModifiedItem > item.fileModifiedTs) group.oldestModifiedItem = item.fileModifiedTs

      pushUniqueByLocation(group.todos, item)
    }
  }

  const nonEmptyGroups = groups.filter(g => g.todos.length > 0)

  if (baseTagFirst && groupBy === 'tag') {
    const baseTags = nonEmptyGroups.filter(g => !g.id.includes('/'))
    const subTags = nonEmptyGroups.filter(g => g.id.includes('/'))

    sortGenericItemsInplace(baseTags, sortGroups, 'sortName', 'newestCreatedItem')
    sortGenericItemsInplace(subTags, sortGroups, 'sortName', 'newestCreatedItem')

    nonEmptyGroups.length = 0
    nonEmptyGroups.push(...baseTags, ...subTags)
  } else {
    sortGenericItemsInplace(nonEmptyGroups, sortGroups, 'sortName', 'newestCreatedItem')
  }

  if (!subGroups) {
    for (const g of nonEmptyGroups) {
      if (preserveOrder) {
        // Keep families adjacent: order by document position rather than the
        // user's sort setting (used when family-context rows are expanded).
        g.todos.sort((a, b) => a.filePath === b.filePath ? a.line - b.line : a.filePath.localeCompare(b.filePath))
      } else if (priorityTag) {
        sortTodosByPriority(g.todos, sortItems)
      } else {
        sortGenericItemsInplace(g.todos, sortItems, 'originalText', 'fileCreatedTs')
      }
    }
  } else {
    for (const g of nonEmptyGroups)
      g.groups = groupTodos(
        g.todos,
        groupBy === 'page' ? 'tag' : 'page',
        subGroupSort,
        sortItems,
        false,
        null,
        baseTagFirst,
        priorityTag,
        preserveOrder,
      )
  }

  return nonEmptyGroups
}

export const groupTodosByPriority = (
  items: TodoItem[],
  sortItems: SortDirection,
): PriorityGroup[] => {
  const withPrio = items.filter(t => t.priority !== undefined)
  const map = new Map<number, TodoItem[]>()
  for (const item of withPrio) {
    const key = item.priority!
    if (!map.has(key)) map.set(key, [])
    pushUniqueByLocation(map.get(key)!, item)
  }

  // Sort keys numerically descending: 5, 4, 3, 2, 1, 0, -1, -2...
  const sortedKeys = Array.from(map.keys()).sort((a, b) => b - a)

  // Fill in gaps between existing priorities with empty groups
  const allKeys: number[] = []
  if (sortedKeys.length > 0) {
    const maxPrio = sortedKeys[0]
    const minPrio = sortedKeys[sortedKeys.length - 1]
    for (let p = maxPrio; p >= minPrio; p--) {
      allKeys.push(p)
    }
  }

  return allKeys.map(key => {
    const todos = map.get(key) || []
    if (todos.length > 0) {
      sortGenericItemsInplace(todos, sortItems, 'originalText', 'fileCreatedTs')
    }
    const tsValues = todos.length > 0 ? todos.map(t => t.fileCreatedTs) : [0, 0]
    const modValues = todos.length > 0 ? todos.map(t => t.fileModifiedTs) : [0, 0]
    return {
      type: 'priority' as const,
      priorityValue: key,
      id: `priority:${key}`,
      sortName: String(key),
      className: `priority-group-${key < 0 ? 'neg' + Math.abs(key) : key}`,
      todos,
      oldestCreatedItem: Math.min(...tsValues),
      newestCreatedItem: Math.max(...tsValues),
      oldestModifiedItem: Math.min(...modValues),
      newestModifiedItem: Math.max(...modValues),
    }
  })
}

const sortTodosByPriority = (todos: TodoItem[], sortItems: SortDirection) => {
  // Bucket per exakter Prio-Zahl
  const buckets = new Map<number, TodoItem[]>()
  for (const todo of todos) {
    const key = todo.priority ?? 0
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(todo)
  }

  // Bucket-Reihenfolge: positiv desc, neutral, negativ desc (3, 2, 1, 0, -1, -2, -3)
  const orderedKeys = Array.from(buckets.keys()).sort((a, b) => {
    if (a > 0 && b > 0) return b - a
    if (a < 0 && b < 0) return b - a
    if (a > 0) return -1
    if (b > 0) return 1
    if (a === 0) return -1
    if (b === 0) return 1
    return 0
  })

  // Innerhalb jedes Buckets: user's sortItems-Setting respektieren, line ↑ als Tiebreaker
  for (const items of buckets.values()) {
    sortGenericItemsInplace(items, sortItems, 'originalText', 'fileCreatedTs')
  }

  todos.length = 0
  for (const key of orderedKeys) todos.push(...buckets.get(key)!)
}

export const groupTodosByDate = (
  items: TodoItem[],
  sortItems: SortDirection,
): DateGroup[] => {
  const withDate = items.filter(t => t.date !== undefined)
  const map = new Map<DateCategory, TodoItem[]>()

  for (const item of withDate) {
    const category = item.dateCategory!
    if (!map.has(category)) map.set(category, [])
    pushUniqueByLocation(map.get(category)!, item)
  }

  // Define custom order for date groups
  const categoryOrder: DateCategory[] = ['today', 'tomorrow', 'thisWeek', 'thisMonth', 'future', 'overdue']

  return categoryOrder.map(category => {
    const todos = map.get(category) || []

    // Sort todos within each date category by date, then by user's sort preference
    todos.sort((a, b) => {
      if (a.date && b.date) {
        const dateDiff = a.date.getTime() - b.date.getTime()
        if (dateDiff !== 0) return dateDiff
      }
      // Fallback to user's sort preference
      if (sortItems === 'a->z') return a.originalText.localeCompare(b.originalText)
      if (sortItems === 'z->a') return b.originalText.localeCompare(a.originalText)
      if (sortItems.startsWith('created')) {
        const isNewToOld = sortItems.includes('new->old')
        return isNewToOld ? b.fileCreatedTs - a.fileCreatedTs : a.fileCreatedTs - b.fileCreatedTs
      }
      if (sortItems.startsWith('modified')) {
        const isNewToOld = sortItems.includes('new->old')
        return isNewToOld ? b.fileModifiedTs - a.fileModifiedTs : a.fileModifiedTs - b.fileModifiedTs
      }
      return 0
    })

    const tsValues = todos.length > 0 ? todos.map(t => t.fileCreatedTs) : [0, 0]
    const modValues = todos.length > 0 ? todos.map(t => t.fileModifiedTs) : [0, 0]

    return {
      type: 'date' as const,
      dateCategory: category,
      id: `date:${category}`,
      sortName: category,
      sortOrder: categoryOrder.indexOf(category),
      className: `date-group-${category}`,
      todos,
      oldestCreatedItem: Math.min(...tsValues),
      newestCreatedItem: Math.max(...tsValues),
      oldestModifiedItem: Math.min(...modValues),
      newestModifiedItem: Math.max(...modValues),
    }
  }).filter(g => g.todos.length > 0) // Remove empty groups
}
