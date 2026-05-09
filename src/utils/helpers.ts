import {type CachedMetadata, parseFrontMatterTags, TFile, Vault} from 'obsidian'

import {LOCAL_SORT_OPT} from '../constants'

import type {SortDirection, TagMeta, KeysOfType, TodoItem, TodoGroup} from 'src/_types'
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
  return text.replace(new RegExp(`\\s+#${priorityTagName}/-?\\d+`), '').trim()
}

export const addPriorityTagToText = (text: string, priorityTagName: string, priority: number): string => {
  if (!text || !priorityTagName) return text
  const cleanedText = removePriorityTagFromText(text, priorityTagName)
  return `${cleanedText} #${priorityTagName}/${priority}`
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
export const getFileLabelFromName = (filename: string) =>
  /^(.+)\.md$/.exec(filename)?.[1]

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

    // For tasks within same Group and in same file we want to keep the original order 
    // from file in any case because it looks better when writing down multiple points 
    // that depend on each other for context and order
    if ('line' in a && 'line' in b) {
      return lineA - lineB;
    }

    // For Groups it should depend on sorting direction
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
