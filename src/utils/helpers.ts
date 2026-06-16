import {type CachedMetadata, parseFrontMatterTags, TFile, Vault} from 'obsidian'

import {LOCAL_SORT_OPT} from '../constants'

import type {SortDirection, TagMeta, KeysOfType, TodoItem, TodoGroup, DateCategory} from 'src/_types'
export const isMacOS = () => window.navigator.userAgent.includes('Macintosh')
export const classifyString = (str: string) => {
  const sanitzedGroupName = (str ?? '').replace(/[^A-Za-z0-9]/g, '')
  const dasherizedGroupName = sanitzedGroupName.replace(
    /^([A-Z])|[\s\._](\w)/g,
    function (_, p1, p2) {
      if (p2) return '-' + p2.toLowerCase()
      return p1.toLowerCase()
    },
  )
  return dasherizedGroupName
}

export const removeTagFromText = (text: string, tag: string) => {
  if (!text) return ''
  if (!tag) return text.trim()
  return text.replace(new RegExp(`\\s?\\#${tag}[^\\s]*`, 'g'), '').trim()
}

// Splits a trailing Obsidian block reference (^id) off a line's text so tag
// add/remove can operate on the body and re-append the ref (block refs must
// stay at the very end of the line).
export const splitBlockRef = (text: string): {body: string; ref: string} => {
  if (!text) return {body: '', ref: ''}
  const m = text.match(/^([\s\S]*?)(\s*\^[A-Za-z0-9_-]+)\s*$/)
  return m ? {body: m[1], ref: m[2]} : {body: text, ref: ''}
}

export const parsePriorityTag = (text: string, priorityTagName: string): number | undefined => {
  if (!text || !priorityTagName) return undefined
  const priorityRegex = new RegExp(`\\s#${priorityTagName}/(-?\\d+)`)
  const match = text.match(priorityRegex)
  if (match) {
    const value = parseInt(match[1], 10)
    // if (value === 0) return undefined
    return value
  }
  return undefined
}

export const removePriorityTagFromText = (text: string, priorityTagName: string): string => {
  if (!text || !priorityTagName) return text
  const {body, ref} = splitBlockRef(text)
  return `${body.replace(new RegExp(`\\s+#${priorityTagName}/-?\\d+`), '').trim()}${ref}`
}

export const addPriorityTagToText = (text: string, priorityTagName: string, priority: number): string => {
  if (!text || !priorityTagName) return text
  const {body, ref} = splitBlockRef(text)
  const cleanedText = removePriorityTagFromText(body, priorityTagName)
  return `${cleanedText} #${priorityTagName}/${priority}${ref}`
}

// Date parsing functions
export const parseDateTag = (text: string, dateTagName: string): Date | undefined => {
  if (!text || !dateTagName) return undefined
  const dateRegex = new RegExp(`\\s#${dateTagName}/(\\d{4}-\\d{2}-\\d{2})`)
  const match = text.match(dateRegex)
  if (match) {
    const dateStr = match[1]
    const date = new Date(dateStr)
    if (!isNaN(date.getTime())) return date
  }
  return undefined
}

export const removeDateTagFromText = (text: string, dateTagName: string): string => {
  if (!text || !dateTagName) return text
  const {body, ref} = splitBlockRef(text)
  return `${body.replace(new RegExp(`\\s+#${dateTagName}/\\d{4}-\\d{2}-\\d{2}`), '').trim()}${ref}`
}

export const addDateTagToText = (text: string, dateTagName: string, date: Date): string => {
  if (!text || !dateTagName) return text
  const {body, ref} = splitBlockRef(text)
  const cleanedText = removeDateTagFromText(body, dateTagName)
  const dateStr = date.toISOString().split('T')[0] // YYYY-MM-DD format
  return `${cleanedText} #${dateTagName}/${dateStr}${ref}`
}

export const getDateCategory = (date: Date): DateCategory => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const endOfWeek = new Date(today)
  endOfWeek.setDate(endOfWeek.getDate() + 7)
  const endOfMonth = new Date(today)
  endOfMonth.setMonth(endOfMonth.getMonth() + 1)

  // Reset time to midnight for comparison
  const compareDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (compareDate < today) return 'overdue'
  if (compareDate.getTime() === today.getTime()) return 'today'
  if (compareDate.getTime() === tomorrow.getTime()) return 'tomorrow'
  if (compareDate < endOfWeek) return 'thisWeek'
  if (compareDate < endOfMonth) return 'thisMonth'
  return 'future'
}

export const getRelativeDateString = (date: Date): string => {
  const category = getDateCategory(date)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const compareDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((compareDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  switch (category) {
    case 'overdue': return `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''}`
    case 'today': return 'Today'
    case 'tomorrow': return 'Tomorrow'
    case 'thisWeek': return `In ${diffDays} day${diffDays > 1 ? 's' : ''}`
    case 'thisMonth': return date.toLocaleDateString()
    case 'future': return date.toLocaleDateString()
    default: return ''
  }
}

export const getTagMeta = (tag: string): TagMeta => {
  const tagMatch = /^\#([^\/]+)\/?(.*)?$/.exec(tag)
  if (!tagMatch) return {main: null, sub: null}
  const [full, main, sub] = tagMatch
  return {main, sub}
}

export const retrieveTag = (tagMeta: TagMeta): string => {
  return tagMeta.main ? tagMeta.main : tagMeta.sub ? tagMeta.sub : ''
}

export const setLineTo = (line: string, setTo: boolean) =>
  line.replace(
    /^((\s|\>)*([\-\*]|[0-9]+\.)\s\[)([^\]]+)(\].*$)/,
    `$1${setTo ? 'x' : ' '}$5`,
  )

export const getAllLinesFromFile = (cache: string) => cache.split(/\r?\n/)
export const combineFileLines = (lines: string[]) => lines.join('\n')
export const lineIsValidTodo = (line: string) => {
  return /^(\s|\>)*([\-\*]|[0-9]+\.)\s\[(.{1})\]\s{1,4}\S+/.test(line)
}
export const extractTextFromTodoLine = (line: string) =>
  /^(\s|\>)*([\-\*]|[0-9]+\.)\s\[(.{1})\]\s{1,4}(\S{1}.*)$/.exec(line)?.[4]
export const getIndentationSpacesFromTodoLine = (line: string) =>
  /^(\s*)([\-\*]|[0-9]+\.)\s\[(.{1})\]\s{1,4}(\S+)/.exec(line)?.[1]?.length ?? 0
export const todoLineIsChecked = (line: string) =>
  /^(\s|\>)*([\-\*]|[0-9]+\.)\s\[(\S{1})\]/.test(line)

export const sortGenericItemsInplace = <
  T extends TodoItem | TodoGroup,
  NK extends KeysOfType<T, string>,
  TK extends KeysOfType<T, number>,
>(
  items: T[],
  direction: SortDirection,
  sortByNameKey: NK,
  sortByTimeKey: TK,
) => {
  const getLine = (item: T): number => {
    if ('line' in item) {
      return (item as TodoItem).line;
    }
    return (item as TodoGroup).todos?.[0]?.line ?? 0;
  };

  items.sort((a, b) => {
    if (direction === 'a->z') 
      return (a[sortByNameKey] as any).localeCompare(b[sortByNameKey], navigator.language, LOCAL_SORT_OPT);
    if (direction === 'z->a') 
      return (b[sortByNameKey] as any).localeCompare(a[sortByNameKey], navigator.language, LOCAL_SORT_OPT);

    let timeDiff = 0;
    const isNewToOld = direction.includes('new->old');

    if (direction.startsWith('created')) {
      timeDiff = isNewToOld 
        ? (b[sortByTimeKey] as any) - (a[sortByTimeKey] as any)
        : (a[sortByTimeKey] as any) - (b[sortByTimeKey] as any);
    } else if (direction.startsWith('modified')) {
      const aTime = 'fileModifiedTs' in a ? (a as any).fileModifiedTs : (a as any).newestModifiedItem;
      const bTime = 'fileModifiedTs' in b ? (b as any).fileModifiedTs : (b as any).newestModifiedItem;
      timeDiff = isNewToOld ? bTime - aTime : aTime - bTime;
    }

    if (timeDiff !== 0) return timeDiff;

    // Tie breakers needed for Groups or Todos in same file
    const lineA = getLine(a);
    const lineB = getLine(b);

    // For tasks within same Group and in same file and in the same block we want to keep the original order 
    // from file in any case because it looks better when writing down multiple points and using indentation
    // that depend on each other for context and order
    if ('line' in a && 'line' in b) {
      if (a.blockTagLine !== undefined &&  b.blockTagLine !== undefined && a.blockTagLine === b.blockTagLine){
        return lineA - lineB;
      } 
    }

    // For Groups and tasks with line tags it should depend on sorting direction
    return isNewToOld 
    ? lineB - lineA  // Higher line number first
    : lineA - lineB // Lower line number first
  });
};

export const ensureMdExtension = (path: string) => {
  if (!/\.md$/.test(path)) return `${path}.md`
  return path
}

export const getFrontmatterTags = (
  cache: CachedMetadata,
  todoTags: string[] = [],
) => {
  const frontMatterTags: string[] =
    parseFrontMatterTags(cache?.frontmatter) ?? []
  if (todoTags.length > 0)
    return frontMatterTags.filter((tag: string) =>
      todoTags.includes(getTagMeta(tag).main),
    )
  return frontMatterTags
}

export const getAllTagsFromMetadata = (cache: CachedMetadata): string[] => {
  if (!cache) return []
  const frontmatterTags = getFrontmatterTags(cache)
  const blockTags = (cache.tags ?? []).map(e => e.tag)
  return [...frontmatterTags, ...blockTags]
}

export const getFileFromPath = (vault: Vault, path: string) => {
  let file = vault.getAbstractFileByPath(path)
  if (file instanceof TFile) return file
  const files = vault.getMarkdownFiles()
  file = files.find(e => e.name === path)
  if (file instanceof TFile) return file
}
