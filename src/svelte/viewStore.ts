import {writable} from 'svelte/store'
import type {TodoGroup} from '../_types'
import type {LookAndFeel, GroupByType} from '../_types'

export const todoGroupsStore = writable<TodoGroup[]>([])
export const todoTagsStore = writable<string[]>([])
export const lookAndFeelStore = writable<LookAndFeel>('classic')
export const collapsedSectionsStore = writable<string[]>([])
export const hiddenTagsStore = writable<string[]>([])
export const priorityTagStore = writable<string>('')
export const maxTasksPerGroupStore = writable<number | null>(null)
export const enableLimitStore = writable<boolean>(true)
export const showSettingsPanelStore = writable<boolean>(false)
export const todoGroupsCountStore = writable<number>(0)
export const dragState = writable({
  inProgress: false,
  sourcePriority: null as number | null,
  dragGroupId: null as string | null,
})
