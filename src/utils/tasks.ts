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
  getFileLabelFromName,
  getFrontmatterTags,
  getIndentationSpacesFromTodoLine,
  getTagMeta,
  parsePriorityTag,
  removePriorityTagFromText,
  retrieveTag,
  removeTagFromText,
  setLineTo,
} from './helpers'
import { DONE_TASK_SYMBOLS } from '../constants'

import type {
  App,
  MetadataCache,
  TagCache,
  TFile,
  Vault,
} from 'obsidian'
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
  app: App,
): Promise<Map<TFile, TodoItem[]>> => {
  const includePattern = includeFiles.trim()
    ? includeFiles.trim().split('\n')
    : ['**/*']
  const filesWithCache = await Promise.all(
    files
      .filter(file => {
        if (file.stat.mtime < lastRerender) return false
        if (!includePattern.some(p => minimatch(file.path, p))) return false
        if (todoTags.length === 1 && todoTags[0] === '*') return true
        const fileCache = cache.getFileCache(file)
        const allTags = getAllTagsFromMetadata(fileCache)
        const tagsOnPage = allTags.filter(tag =>
          todoTags.includes(retrieveTag(getTagMeta(tag)).toLowerCase()),
        )
        return tagsOnPage.length > 0
      })
      .map<Promise<FileInfo>>(async file => {
        const fileCache = cache.getFileCache(file)
        const tagsOnPage =
          fileCache?.tags?.filter(e =>
            todoTags.includes(retrieveTag(getTagMeta(e.tag)).toLowerCase()),
          ) ?? []
        const frontMatterTags = getFrontmatterTags(fileCache, todoTags)
        const hasFrontMatterTag = frontMatterTags.length > 0
        const parseEntireFile =
          todoTags[0] === '*' || hasFrontMatterTag || showAllTodos
        const content = await vault.cachedRead(file)
        return {
          content,
          cache: fileCache,
          validTags: tagsOnPage.map(e => ({
            ...e,
            tag: e.tag.toLowerCase(),
          })),
          file,
          parseEntireFile,
          frontmatterTag: todoTags.length ? frontMatterTags[0] : undefined,
        }
      }),
  )

  const todosForUpdatedFiles = new Map<TFile, TodoItem[]>()
  for (const fileInfo of filesWithCache) {
    let todos = findAllTodosInFile(fileInfo, priorityTag, app)
    if (!showChecked) {
      todos = todos.filter(todo => !todo.checked)
    }
    todosForUpdatedFiles.set(fileInfo.file, todos)
  }

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
    !item.checked,
  )
  app.vault.modify(file, newData)
  item.checked = !item.checked
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
    const lines = getAllLinesFromFile(await app.vault.read(file))

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
    }

    await app.vault.modify(file, combineFileLines(lines))
  }
}

const findAllTodosInFile = (file: FileInfo, priorityTag: string, app?: App): TodoItem[] => {
  if (!file.parseEntireFile)
    return file.validTags.flatMap(tag => findAllTodosFromTagBlock(file, tag, priorityTag, app))

  if (!file.content) return []
  const fileLines = getAllLinesFromFile(file.content)
  const tagMeta = file.frontmatterTag
    ? getTagMeta(file.frontmatterTag)
    : undefined

  // Use cached listItems instead of parsing all lines
  const listItems = file.cache.listItems ?? []
  const todos: TodoItem[] = []

  for (const listItem of listItems) {
    // Only process items that have a task property (are tasks)
    if (listItem.task === undefined) continue

    const lineNum = listItem.position.start.line
    const line = fileLines[lineNum]
    if (!line) continue

    todos.push(formTodo(line, file, lineNum, listItem.task, tagMeta, priorityTag, app))
  }

  return todos
}

const findAllTodosFromTagBlock = (file: FileInfo, tag: TagCache, priorityTag: string, app?: App) => {
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
  if (sameLineItem) {
    const line = fileLines[tagLineNum]
    if (line) {
      return [formTodo(line, file, tagLineNum, sameLineItem.task, tagMeta, priorityTag, app)]
    }
  }

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
      // Found a task - add it and continue
      todos.push(formTodo(line, file, currentLine, taskOnLine.task, tagMeta, priorityTag, app))
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
    const escapedTag = sub ? main + '/' + sub : main
    return `${space}<span class="cm-formatting cm-formatting-hashtag cm-hashtag cm-hashtag-begin cm-meta cm-tag-${stringer}" spellcheck="false">#</span><span class="cm-hashtag cm-hashtag-end cm-meta cm-tag-${stringer}" spellcheck="false">${escapeHtml(escapedTag)}</span>`
  })

  // Finally, render any remaining markdown with marked
  const markedHTML = marked(processed) as string

  // Post-process to match Obsidian's native rendering
  return postprocessHTML(markedHTML)
}

// Post-process HTML to match Obsidian's native rendering
const postprocessHTML = (html: string): string => {
  let processed = html

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

const formTodo = (
  line: string,
  file: FileInfo,
  lineNum: number,
  taskStatus: string,
  tagMeta?: TagMeta,
  priorityTag?: string,
  app?: App,
): TodoItem => {
  const rawText = extractTextFromTodoLine(line)
  const spacesIndented = getIndentationSpacesFromTodoLine(line)
  const tagStripped = removeTagFromText(rawText, tagMeta?.main)
  const priority = parsePriorityTag(rawText, priorityTag ?? '')
  const displayText = priorityTag ? removePriorityTagFromText(tagStripped, priorityTag) : tagStripped
  const rawHTML = app ? preprocessMarkdown(displayText, app.metadataCache, file.file.path) : displayText

  // Use the task status from cache - no fallback needed since we only call this for actual tasks
  const checked = DONE_TASK_SYMBOLS.has(taskStatus)

  return {
    mainTag: tagMeta?.main,
    subTag: tagMeta?.sub,
    checked,
    filePath: file.file.path,
    fileName: file.file.name,
    fileLabel: getFileLabelFromName(file.file.name),
    fileCreatedTs: file.file.stat.ctime,
    fileModifiedTs: file.file.stat.mtime,
    rawHTML,
    line: lineNum,
    spacesIndented,
    fileInfo: file,
    originalText: rawText,
    priority,
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
