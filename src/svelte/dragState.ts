import { writable } from 'svelte/store'

export const dragState = writable({
  inProgress: false,
  sourcePriority: null as number | null,
  dragGroupId: null as string | null,
})
