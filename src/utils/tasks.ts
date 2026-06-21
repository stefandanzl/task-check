import { marked } from 'marked'
import minimatch from 'minimatch'

// Configure marked to be synchronous
marked.use({ async: false })

import {
  addPriorityTagToText,
  combineFileLines,
  extractTextFromTodoLine,
  getAllLinesFromFile,
  getAllTagsFromMetadata,
  getFileFromPath,
  getFrontmatterTags,
  getIndentationSpacesFromTodoLine,
  getTagMeta,
  parsePriorityTag,
  removePriorityTagFromText,
  retrieveTag,
  removeTagFromText,
  setLineTo,
  setTaskStatusChar,
  splitBlockRef,
  parseDateTag,
  getDateCategory,
  removeDateTagFromText,
  addDateTagToText,
} from './helpers'
import { DONE_TASK_SYMBOLS } from '../constants'

import type {
  App,
  MetadataCache,
  TagCache,
  TFile,
  Vault,
} from 'obsidian'
import { Notice } from 'obsidian'
import type {TodoItem, TagMeta, FileInfo} from 'src/_types'

/**
 * Finds all of the {@link TodoItem todos} in the {@link TFile files} that have been updated since the last re-render.
 *
 * @param files The files to search for todos.
 * @param todoTags The tag(s) that should be present on todos in order to be displayed by this plugin.
 * @param cache The Obsidian {@link MetadataCache} object.
 * @param vault The Obsidian {@link Vault} object.
 * @param includeFiles The pattern of files to include in the search for todos.
 * @param showChecked Whether the user wants to show completed todos in the plugin's UI.
 * @param lastRerender Timestamp of the last time we re-rendered the checklist.
 * @returns A map containing each {@link TFile file} that was updated, and the {@link TodoItem todos} in that file.
 * If there are no todos in a file, that file will still be present in the map, but the value for its entry will be an
 * empty array. This is required to account for the case where a file that previously had todos no longer has any.
 */
export const parseTodos = async (
  files: TFile[],
  todoTags: string[],
  cache: MetadataCache,
  vault: Vault,
  includeFiles: string,
  showChecked: boolean,
  showAllTodos: boolean,
  lastRerender: number,
  priorityTag: string,
  dateTag: string,
): Promise<Map<TFile, TodoItem[]>> => {
  const includePattern = includeFiles.trim()
    ? includeFiles.trim().split('\n')
    : ['**/*']

  const todosForUpdatedFiles = new Map<TFile, TodoItem[]>()

  await Promise.all(
    files
      .filter(file => {
        if (file.stat.mtime < lastRerender) return false
        if (!includePattern.some(p => minimatch(file.path, p))) return false
        return true
      })
      .map(async file => {
        const fileCache = cache.getFileCache(file)
        const tagsOnPage =
          fileCache?.tags?.filter(e =>
            todoTags.includes(retrieveTag(getTagMeta(e.tag)).toLowerCase()),
          ) ?? []
        const frontMatterTags = getFrontmatterTags(fileCache, todoTags)
        const hasFrontMatterTag = frontMatterTags.length > 0
        const qualifies =
          todoTags[0] === '*' || tagsOnPage.length > 0 || hasFrontMatterTag

        if (!qualifies) {
          todosForUpdatedFiles.set(file, [])
          return
        }

        const parseEntireFile =
          todoTags[0] === '*' || hasFrontMatterTag || showAllTodos
        const content = await vault.cachedRead(file)

        const fileInfo: FileInfo = {
          content,
          cache: fileCache,
          validTags: tagsOnPage.map(e => ({...e, tag: e.tag.toLowerCase()})),
          file,
          parseEntireFile,
          frontmatterTag: todoTags.length ? frontMatterTags[0] : undefined,
        }

        let todos = findAllTodosInFile(fileInfo, priorityTag, dateTag)
        if (!showChecked) todos = todos.filter(todo => !todo.checked)
        todosForUpdatedFiles.set(file, todos)
      })
  )

return todosForUpdatedFiles
}

export const toggleTodoItem = async (item: TodoItem, app: App) => {
  const file = getFileFromPath(app.vault, item.filePath)
  if (!file) return
  const currentFileContents = await app.vault.read(file)
  const currentFileLines = getAllLinesFromFile(currentFileContents)
  if (!currentFileLines[item.line].includes(item.originalText)) return
  const newData = setTodoStatusAtLineTo(
    currentFileLines,
    item.line,
    item.taskStatus === " ",
  )
  app.vault.modify(file, newData)
  item.checked = !item.checked
}

// Set a task's checkbox marker to an arbitrary single character (e.g. !, ?, >).
export const setTodoStatus = async (item: TodoItem, status: string, app: App) => {
  const file = getFileFromPath(app.vault, item.filePath)
  if (!file) return
  const lines = getAllLinesFromFile(await app.vault.cachedRead(file))
  const currentLine = lines[item.line]
  if (!currentLine || !currentLine.includes(item.originalText)) return
  lines[item.line] = setTaskStatusChar(currentLine, status)
  item.taskStatus = status
  item.checked = DONE_TASK_SYMBOLS.has(status)
  await app.vault.modify(file, combineFileLines(lines))
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
      lines[item.line] = currentLine.replace(rawText, newText)
      item.priority = newPriority ?? undefined
      item.originalText = newText

      if (newPriority === null && item.blockPriority !== undefined) {
        new Notice(`This task still has a block-level priority tag.\nAdd #${priorityTag}/0 manually.`)
      }
    }

    await app.vault.modify(file, combineFileLines(lines))
  }
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
  lines[item.line] = currentLine.replace(rawText, newText)
  item.date = newDate ?? undefined
  await app.vault.modify(file, combineFileLines(lines))
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
  lines[item.line] = `${line.replace(/\s+$/, '')} ^${id}`
  await app.vault.modify(file, combineFileLines(lines))
  return id
}

const findAllTodosInFile = (fileInfo: FileInfo, priorityTag: string, dateTag: string): TodoItem[] => {
  if (!fileInfo.parseEntireFile)
    return fileInfo.validTags.flatMap(tag => findAllTodosFromTagBlock(fileInfo, tag, priorityTag, dateTag))

  if (!fileInfo.content) return []
  const fileLines = getAllLinesFromFile(fileInfo.content)
  const tagMeta = fileInfo.frontmatterTag
    ? getTagMeta(fileInfo.frontmatterTag)
    : undefined

  // Use cached listItems instead of parsing all lines
  const listItems = fileInfo.cache.listItems ?? []
  const todos: TodoItem[] = []

  for (const listItem of listItems) {
    // Only process items that have a task property (are tasks)
    if (listItem.task === undefined) continue

    const lineNum = listItem.position.start.line
    const line = fileLines[lineNum]
    if (!line) continue

    todos.push(formTodo(line, fileInfo, lineNum, listItem.task, tagMeta, priorityTag, dateTag))
  }

  return todos
}

const findAllTodosFromTagBlock = (file: FileInfo, tag: TagCache, priorityTag: string, dateTag: string) => {
  if (!file.content) return []
  const fileLines = getAllLinesFromFile(file.content)
  const tagMeta = getTagMeta(tag.tag)
  const tagLineNum = tag.position.start.line

  const listItems = file.cache.listItems ?? []
  const todos: TodoItem[] = []

  // Step 1: Check if tag and task are on same line (inline tag - single task mode)
  const sameLineItem = listItems.find(item =>
    item.position.start.line === tagLineNum &&
    item.task !== undefined
  )
  const tagLine = fileLines[tagLineNum]
  if (!tagLine) return []

  if (sameLineItem) {
      return [formTodo(tagLine, file, tagLineNum, sameLineItem.task, tagMeta, priorityTag, dateTag)]
  }


  const blockPriority = priorityTag ? parsePriorityTag(tagLine, priorityTag) : undefined
  const blockTagLine = tagLineNum


  // Step 2: Walk line by line from tagLineNum + 1 (block mode)
  let currentLine = tagLineNum + 1
  while (currentLine < fileLines.length) {
    const line = fileLines[currentLine]

    // Check if there's a task on this line
    const taskOnLine = listItems.find(item =>
      item.position.start.line === currentLine &&
      item.task !== undefined
    )

    if (taskOnLine) {
      // Empty task check
      const content = line.match(/- \[.\]\s(.*)/)?.[1];
      if (content.trim().length !== 0) {
        // Found a task - add it and continue
        todos.push(formTodo(line, file, currentLine, taskOnLine.task, tagMeta, priorityTag, dateTag, blockPriority, blockTagLine))
      }
    } else if (line.trim().length === 0) {
      // Empty line - stop processing (end of block)
      break
    }
    // If line has content but no task, just continue (description text between tasks)

    currentLine++
  }

  return todos
}

const escapeHtml = (text: string): string => {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const preprocessMarkdown = (text: string, metadataCache: MetadataCache, sourcePath: string): string => {
  // Apply custom regex replacements in order
  let processed = text

  // %%comment%% → HTML comment
  processed = processed.replace(/%%([^%]+)%%/g, (_, content) => 
    `<span class="cm-comment cm-comment-start cm-formatting">%%</span>` +
    `<span class="cm-comment">${escapeHtml(content)}</span>` + 
    `<span class="cm-comment cm-comment-end cm-formatting">%%</span>`
  )
    
  // [[link|label]] → internal link
  processed = processed.replace(/\[\[([^\]]+)\]\]/g, (_, content) => {
    const [link, label] = content.trim().split('|')
    const targetFile = metadataCache.getFirstLinkpathDest(link, sourcePath)
    if (!targetFile) return `[[${content}]]`
    const displayText = label || link
    return `<a data-href="${escapeHtml(link)}" data-type="link" data-filepath="${escapeHtml(targetFile.path)}" class="internal-link">${escapeHtml(displayText)}</a>`
  })

  // ==highlight== → Obsidian-style highlight span
  processed = processed.replace(/==([^=]+)==/g, (_, content) => `<span class="cm-highlight">${escapeHtml(content)}</span>`)

  // #tag → Obsidian hashtag spans (requires space before to avoid false matches)
  processed = processed.replace(/(\s)#(\S+)/g, (_, space, tag) => {
    const parts = tag.split('/')
    const main = parts[0] || ''
    const stringer = parts.join('')
    const sub = parts.slice(1).join('/') || ''
    // const escapedTag = sub ? main + '/' + sub : main
    return `${space}<span class="cm-formatting cm-formatting-hashtag cm-hashtag cm-hashtag-begin cm-meta cm-tag-${stringer}" spellcheck="false">#</span><span class="cm-hashtag cm-hashtag-end cm-meta cm-tag-${stringer}" spellcheck="false">${escapeHtml(tag)}</span>`
  })

  // Finally, render any remaining markdown with marked
  const markedHTML = marked(processed) as string

  // Post-process to match Obsidian's native rendering
  return postprocessHTML(markedHTML)
}

// Post-process HTML to match Obsidian's native rendering
const postprocessHTML = (html: string): string => {
  let processed = html

  // <p> → Obsidian inline code span
processed = processed.replace(/^\s*<p>([\s\S]*)<\/p>\s*$/, "$1")

  // <code> → Obsidian inline code span
  processed = processed.replace(/<code>(.*?)<\/code>/g, (_, content) =>
    `<span class="cm-inline-code cm-list-1" spellcheck="false">${content}</span>`
  )

  // <strong> → Obsidian bold span
  processed = processed.replace(/<strong>(.*?)<\/strong>/g, (_, content) =>
    `<span class="cm-list-1 cm-strong">${content}</span>`
  )

  // <em> → Obsidian emphasis span
  processed = processed.replace(/<em>(.*?)<\/em>/g, (_, content) =>
    `<span class="cm-list-1 cm-em">${content}</span>`
  )

  return processed
}

/**
 * The task text as shown in the panel: the main todo tag, priority tag, date
 * tag and any trailing block reference stripped; other tags + markdown
 * formatting kept. Computed on demand (not at parse time) so the markdown
 * pipeline only runs for tasks that are actually displayed or copied.
 */
export const getTaskDisplayText = (item: TodoItem, priorityTag: string, dateTag: string): string => {
  let text = item.originalText
  if (item.mainTag) text = removeTagFromText(text, item.mainTag)
  if (priorityTag) text = removePriorityTagFromText(text, priorityTag)
  if (dateTag) text = removeDateTagFromText(text, dateTag)
  return splitBlockRef(text).body
}

/** Full HTML rendering of a task's display text (runs preprocessMarkdown + marked). */
export const renderTaskHTML = (item: TodoItem, app: App, priorityTag: string, dateTag: string): string => {
  return preprocessMarkdown(getTaskDisplayText(item, priorityTag, dateTag), app.metadataCache, item.filePath)
}

const formTodo = (
  line: string,
  file: FileInfo,
  lineNum: number,
  taskStatus: string,
  tagMeta?: TagMeta,
  priorityTag?: string,
  dateTag?: string,
  blockPriority: number | undefined = undefined,
  blockTagLine: number | undefined = undefined
): TodoItem => {
  const rawText = extractTextFromTodoLine(line)
  const spacesIndented = getIndentationSpacesFromTodoLine(line)
  const linePriority = priorityTag ? parsePriorityTag(rawText, priorityTag) : undefined
  const priority =  (linePriority !== undefined) ? linePriority : blockPriority
  const lineDate = dateTag ? parseDateTag(rawText, dateTag) : undefined
  const dateCategory = lineDate ? getDateCategory(lineDate) : undefined

  // Use the task status from cache - no fallback needed since we only call this for actual tasks
  const checked = DONE_TASK_SYMBOLS.has(taskStatus)

  return {
    mainTag: tagMeta?.main,
    subTag: tagMeta?.sub,
    checked,
    taskStatus,
    filePath: file.file.path,
    fileName: file.file.name,
    fileLabel: file.file.basename,
    fileCreatedTs: file.file.stat.ctime,
    fileModifiedTs: file.file.stat.mtime,
    line: lineNum,
    spacesIndented,
    originalText: rawText,
    priority,
    blockPriority,
    blockTagLine,
    date: lineDate,
    dateCategory,
    dateTag: lineDate ? rawText.match(new RegExp(`#${dateTag}/([\\d-]+)`))?.[1] : undefined
  }
}

const setTodoStatusAtLineTo = (
  fileLines: string[],
  line: number,
  setTo: boolean,
) => {
  fileLines[line] = setLineTo(fileLines[line], setTo)
  return combineFileLines(fileLines)
}
