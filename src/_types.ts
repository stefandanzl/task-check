import type {CachedMetadata, TagCache, TFile} from 'obsidian'

export type TodoItem = {
  checked: boolean
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
}

type BaseGroup = {
  type: GroupByType
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

export type TodoGroup = PageGroup | TagGroup

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
