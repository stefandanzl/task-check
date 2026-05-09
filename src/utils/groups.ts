import {classifyString, sortGenericItemsInplace} from './helpers'

import type {TodoItem, TodoGroup, PriorityGroup, GroupByType, SortDirection} from 'src/_types'

export const groupTodos = (
  items: TodoItem[],
  groupBy: GroupByType,
  sortGroups: SortDirection,
  sortItems: SortDirection,
  subGroups: boolean,
  subGroupSort: SortDirection,
  baseTagFirst: boolean = false,
  priorityTag: string = '',
): TodoGroup[] => {
  const groups: TodoGroup[] = []
  for (const item of items) {
    const itemKey = groupBy === 'page' ? item.filePath : `#${[item.mainTag, item.subTag].filter(e => e != null).join('/')}`
    let group = groups.find(g => g.id === itemKey)
    if (!group) {
      const newGroup: TodoGroup = {
        id: itemKey,
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
        newGroup.mainTag = item.mainTag
        newGroup.subTags = item.subTag
        if (baseTagFirst && !item.subTag) {
          newGroup.sortName = `0_${item.mainTag}`
        } else {
          newGroup.sortName = item.mainTag + (item.subTag ?? '0')
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

    group.todos.push(item)
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
      if (priorityTag) {
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
    map.get(key)!.push(item)
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
