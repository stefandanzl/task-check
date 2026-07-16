import {writable} from 'svelte/store'
import type {TodoGroup} from '../_types'
import type {GroupMode} from '../_types'
import type {TodoItem} from '../_types'

export const todoGroupsStore = writable<TodoGroup[]>([])
export const todoTagsStore = writable<string[]>([])
export const collapsedSectionsStore = writable<string[]>([])
export const hiddenTagsStore = writable<string[]>([])
export const priorityTagStore = writable<string>('')
export const maxTasksPerGroupStore = writable<number | null>(null)
export const enableLimitStore = writable<boolean>(true)
export const showSettingsPanelStore = writable<boolean>(false)
export const searchQueriesStore = writable<string[]>([])
export const bookmarksStore = writable<string[]>([])
export const activePanelTabStore = writable<'tags' | 'bookmarks'>('tags')
export const todoGroupsCountStore = writable<number>(0)
export const dateTagStore = writable<string>('')
export const groupModeStore = writable<GroupMode>('tag')
export const dragState = writable({
  inProgress: false,
  sourcePriority: null as number | null,
  dragGroupId: null as string | null,
  draggedItem: null as TodoItem | null,
})
