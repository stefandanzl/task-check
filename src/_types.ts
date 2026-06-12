import type {CachedMetadata, TagCache, TFile} from 'obsidian'

export type DateCategory = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'thisMonth' | 'future' | 'noDate'

export type DateFilter = {
  operator: 'before' | 'after' | 'on' | '>=' | '<=' | '=' | '>' | '<'
  dateValue: Date | 'today' | 'tomorrow' | 'overdue' | 'week' | 'month' | { type: 'exact' | 'partial', date: Date, partialInfo?: { year: number; month?: number } }
  partialDate?: { year: number; month?: number }  // For YYYY-MM or YYYY formats
}

export type TodoItem = {
  checked: boolean
  taskStatus: string
  filePath: string
  fileName: string
  fileLabel: string
  fileCreatedTs: number
  fileModifiedTs: number
  mainTag?: string
  subTag?: string
  line: number
  spacesIndented: number
  fileInfo: FileInfo
  originalText: string
  rawHTML: string
  priority?: number
  blockPriority?: number
  blockTagLine?: number
  date?: Date
  dateCategory?: DateCategory
  dateTag?: string  // raw date tag value like "2026-04-30"
}

type BaseGroup = {
  type: GroupByType | 'priority' | 'date'
  todos: TodoItem[]
  id: string
  sortName: string
  className: string
  oldestCreatedItem: number
  newestCreatedItem: number
  oldestModifiedItem: number
  newestModifiedItem: number
  groups?: TodoGroup[]
}

export type PageGroup = BaseGroup & {
  type: 'page'
  pageName?: string
}
export type TagGroup = BaseGroup & {
  type: 'tag'
  mainTag?: string
  subTags?: string
}

export type PriorityGroup = BaseGroup & {
  type: 'priority'
  priorityValue: number
}

export type DateGroup = BaseGroup & {
  type: 'date'
  dateCategory: DateCategory
  sortOrder: number  // for custom ordering of date groups
}

export type TodoGroup = PageGroup | TagGroup | PriorityGroup | DateGroup

export type FileInfo = {
  content: string
  cache: CachedMetadata
  parseEntireFile: boolean
  frontmatterTag: string
  file: TFile
  validTags: TagCache[]
}

export type TagMeta = {main: string; sub: string}
export type LinkMeta = {filePath: string; linkName: string}

export type GroupByType = 'page' | 'tag'
export type SortDirection =
  | 'created: new->old'
  | 'created: old->new'
  | 'modified: new->old'
  | 'modified: old->new'
  | 'a->z'
  | 'z->a'
export type LookAndFeel = 'compact' | 'classic'

export type Icon = 'chevron' | 'settings'

export type KeysOfType<T, V> = {
  [K in keyof T]: T[K] extends V ? K : never
}[keyof T]
