import {classifyString, sortGenericItemsInplace} from './helpers'

import type {TodoItem, TodoGroup, GroupByType, SortDirection} from 'src/_types'

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
        sortTodosByPriority(g.todos)
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

const sortTodosByPriority = (todos: TodoItem[]) => {
  todos.sort((a, b) => {
    const aPrio = a.priority ?? 0
    const bPrio = b.priority ?? 0

    // Both neutral - maintain original order (file order, newest first)
    if (aPrio === 0 && bPrio === 0) {
      return b.fileCreatedTs - a.fileCreatedTs || b.line - a.line
    }

    // a is positive, b is neutral or negative - a comes first
    if (aPrio > 0 && bPrio <= 0) return -1

    // b is positive, a is neutral or negative - b comes first
    if (bPrio > 0 && aPrio <= 0) return 1

    // Both positive - higher priority first (descending: 3, 2, 1)
    if (aPrio > 0 && bPrio > 0) {
      if (aPrio !== bPrio) return bPrio - aPrio
      return b.fileCreatedTs - a.fileCreatedTs || b.line - a.line
    }

    // Both negative - higher priority first (descending: -1, -2, -3)
    if (aPrio < 0 && bPrio < 0) {
      if (aPrio !== bPrio) return bPrio - aPrio
      return b.fileCreatedTs - a.fileCreatedTs || b.line - a.line
    }

    // a is neutral, b is negative - a comes first
    if (aPrio === 0 && bPrio < 0) return -1

    // b is neutral, a is negative - b comes first
    if (bPrio === 0 && aPrio < 0) return 1

    return 0
  })
}
