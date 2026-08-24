import {
  addPriorityTagToText,
  combineFileLines,
  extractTextFromTodoLine,
  getAllLinesFromFile,
  getFileFromPath,
  removePriorityTagFromText,
  removeTagFromText,
  setLineTo,
  setTaskStatusChar,
  splitBlockRef,
  removeDateTagFromText,
  addDateTagToText,
} from './helpers'
import { pushUndo, type UndoChange } from '../undo'

import type {
  App,
} from 'obsidian'
import { Notice } from 'obsidian'
import type {TodoItem} from 'src/_types'



export const toggleTodoItem = async (item: TodoItem, app: App) => {
  const file = getFileFromPath(app.vault, item.filePath)
  if (!file) return
  const currentFileContents = await app.vault.read(file)
  const currentFileLines = getAllLinesFromFile(currentFileContents)
  if (!currentFileLines[item.line].includes(item.originalText)) return
  const before = currentFileLines[item.line]
  const newData = setTodoStatusAtLineTo(
    currentFileLines,
    item.line,
    item.taskStatus === " ",
  )
  app.vault.modify(file, newData)
  pushUndo({label: 'toggle complete', changes: [{filePath: file.path, line: item.line, before, after: currentFileLines[item.line]}]})
}

// Set a task's checkbox marker to an arbitrary single character (e.g. !, ?, >).
export const setTodoStatus = async (item: TodoItem, status: string, app: App) => {
  const file = getFileFromPath(app.vault, item.filePath)
  if (!file) return
  const lines = getAllLinesFromFile(await app.vault.cachedRead(file))
  const currentLine = lines[item.line]
  if (!currentLine || !currentLine.includes(item.originalText)) return
  const before = currentLine
  lines[item.line] = setTaskStatusChar(currentLine, status)
  app.vault.modify(file, combineFileLines(lines))
  pushUndo({label: 'set state', changes: [{filePath: file.path, line: item.line, before, after: lines[item.line]}]})
}

export const setTodoPriority = async (
  item: TodoItem,
  newPriority: number | null,
  priorityTag: string,
  app: App,
) => {
  await setTodoPrioritiesBatch([{ item, newPriority }], priorityTag, app)
}

export const setTodoPrioritiesBatch = async (
  updates: Array<{ item: TodoItem; newPriority: number | null }>,
  priorityTag: string,
  app: App,
) => {
  const byFile = new Map<string, typeof updates>()
  for (const u of updates) {
    if (!byFile.has(u.item.filePath)) byFile.set(u.item.filePath, [])
    byFile.get(u.item.filePath)!.push(u)
  }

  const changes: UndoChange[] = []
  for (const [, fileUpdates] of byFile) {
    const file = getFileFromPath(app.vault, fileUpdates[0].item.filePath)
    if (!file) continue
    const lines = getAllLinesFromFile(await app.vault.cachedRead(file))

    for (const { item, newPriority } of fileUpdates) {
      const currentLine = lines[item.line]
      if (!currentLine.includes(item.originalText)) continue
      const rawText = extractTextFromTodoLine(currentLine)
      const newText = newPriority === null
        ? removePriorityTagFromText(rawText, priorityTag)
        : addPriorityTagToText(rawText, priorityTag, newPriority)
      const before = currentLine
      lines[item.line] = currentLine.replace(rawText, newText)
      changes.push({filePath: file.path, line: item.line, before, after: lines[item.line]})

      if (newPriority === null && item.blockPriority !== undefined) {
        new Notice(`This task still has a block-level priority tag.\nAdd #${priorityTag}/0 manually.`)
      }
    }

    await app.vault.modify(file, combineFileLines(lines))
  }

  if (changes.length) pushUndo({label: 'set priority', changes})
}

export const setTodoDate = async (
  item: TodoItem,
  newDate: Date | null,
  dateTag: string,
  app: App,
) => {
  const file = getFileFromPath(app.vault, item.filePath)
  if (!file) return
  const lines = getAllLinesFromFile(await app.vault.cachedRead(file))
  const currentLine = lines[item.line]
  if (!currentLine || !currentLine.includes(item.originalText)) return
  const rawText = extractTextFromTodoLine(currentLine)
  const newText =
    newDate === null ? removeDateTagFromText(rawText, dateTag) : addDateTagToText(rawText, dateTag, newDate)
  const before = currentLine
  lines[item.line] = currentLine.replace(rawText, newText)
  await app.vault.modify(file, combineFileLines(lines))
  pushUndo({label: 'set due date', changes: [{filePath: file.path, line: item.line, before, after: lines[item.line]}]})
}

const BLOCK_ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const generateBlockId = (len = 6): string => {
  let s = ''
  for (let i = 0; i < len; i++) s += BLOCK_ID_CHARS[Math.floor(Math.random() * BLOCK_ID_CHARS.length)]
  return s
}

// Ensures the task's line has a trailing ^blockId (generating one if missing,
// which writes to the file) and returns the id, for building block-reference links.
export const ensureTaskBlockRef = async (item: TodoItem, app: App): Promise<string | null> => {
  const file = getFileFromPath(app.vault, item.filePath)
  if (!file) return null
  const lines = getAllLinesFromFile(await app.vault.read(file))
  const line = lines[item.line]
  if (!line) return null
  const existing = line.match(/\s\^([A-Za-z0-9_-]+)\s*$/)
  if (existing) return existing[1]
  const id = generateBlockId()
  const before = line
  lines[item.line] = `${line.replace(/\s+$/, '')} ^${id}`
  await app.vault.modify(file, combineFileLines(lines))
  pushUndo({label: 'copy link (add block id)', changes: [{filePath: file.path, line: item.line, before, after: lines[item.line]}]})
  return id
}



/**
 * The task text as shown in the panel: the main todo tag, priority tag, date
 * tag and any trailing block reference stripped; other tags + markdown
 * formatting kept. Computed on demand (not at parse time) so the markdown
 * pipeline only runs for tasks that are actually displayed or copied.
 */
export const getTaskDisplayText = (item: TodoItem, priorityTag: string, dateTag: string): string => {
  let text = item.originalText
  // Strip every task tag this item carries. removeTagFromText matches `#main`
  // followed by any non-space chars, so passing `main` alone also removes the
  // `/sub` portion. Dedupe mains so shared-main tags don't re-scan.
  for (const main of new Set(item.taskTags.map(t => t.main).filter(Boolean))) {
    text = removeTagFromText(text, main)
  }
  if (priorityTag) text = removePriorityTagFromText(text, priorityTag)
  if (dateTag) text = removeDateTagFromText(text, dateTag)
  return splitBlockRef(text).body
}





const setTodoStatusAtLineTo = (
  fileLines: string[],
  line: number,
  setTo: boolean,
) => {
  fileLines[line] = setLineTo(fileLines[line], setTo)
  return combineFileLines(fileLines)
}
