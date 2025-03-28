import {classifyString, sortGenericItemsInplace} from './helpers'

import type {TodoItem, TodoGroup, GroupByType, SortDirection} from 'src/_types'

export const groupTodos = (
  items: TodoItem[],
  groupBy: GroupByType,
  sortGroups: SortDirection,
  sortItems: SortDirection,
  subGroups: boolean,
  subGroupSort: SortDirection,
  baseTagFirst: boolean = false, // New parameter with default false
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
        oldestItem: Infinity,
        newestItem: 0,
      }

      if (newGroup.type === 'page') {
        newGroup.pageName = item.fileLabel
        newGroup.sortName = item.fileLabel
        newGroup.className = classifyString(item.fileLabel)
      } else if (newGroup.type === 'tag') {
        newGroup.mainTag = item.mainTag
        newGroup.subTags = item.subTag
        // Add a special prefix for base tags if baseTagFirst is true
        if (baseTagFirst && !item.subTag) {
          // Base tags (without subtags) get a special prefix to sort first
          newGroup.sortName = `0_${item.mainTag}`
        } else {
          newGroup.sortName = item.mainTag + (item.subTag ?? '0')
        }
        newGroup.className = classifyString((newGroup.mainTag ?? '') + (newGroup.subTags ?? ''))
      }
      groups.push(newGroup)
      group = newGroup
    }
    if (group.newestItem < item.fileCreatedTs) group.newestItem = item.fileCreatedTs
    if (group.oldestItem > item.fileCreatedTs) group.oldestItem = item.fileCreatedTs

    group.todos.push(item)
  }

  const nonEmptyGroups = groups.filter(g => g.todos.length > 0)

  // If baseTagFirst is true and we're grouping by tags, we'll do a custom sort
  if (baseTagFirst && groupBy === 'tag') {
    // First separate base tags from subtags
    const baseTags = nonEmptyGroups.filter(g => !g.id.includes('/'))
    const subTags = nonEmptyGroups.filter(g => g.id.includes('/'))

    // Sort each set separately
    sortGenericItemsInplace(baseTags, sortGroups, 'sortName', sortGroups === 'new->old' ? 'newestItem' : 'oldestItem')

    sortGenericItemsInplace(subTags, sortGroups, 'sortName', sortGroups === 'new->old' ? 'newestItem' : 'oldestItem')

    // Combine them with base tags first
    nonEmptyGroups.length = 0
    nonEmptyGroups.push(...baseTags, ...subTags)
  } else {
    // Normal sorting if baseTagFirst is false
    sortGenericItemsInplace(nonEmptyGroups, sortGroups, 'sortName', sortGroups === 'new->old' ? 'newestItem' : 'oldestItem')
  }

  if (!subGroups) for (const g of groups) sortGenericItemsInplace(g.todos, sortItems, 'originalText', 'fileCreatedTs')
  else
    for (const g of nonEmptyGroups)
      g.groups = groupTodos(
        g.todos,
        groupBy === 'page' ? 'tag' : 'page',
        subGroupSort,
        sortItems,
        false,
        null,
        baseTagFirst, // Pass the baseTagFirst parameter to subgroups
      )

  return nonEmptyGroups
}
