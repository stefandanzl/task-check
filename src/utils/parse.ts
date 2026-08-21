import type {
  TFile,
  MetadataCache,
  Vault,
  TagCache,
  CachedMetadata,
} from 'node_modules/obsidian/obsidian'
import type {TodoItem, FileInfo, TagMeta} from 'src/_types'
import {globToRegex, isExcluded} from './glob'
import {
  retrieveTag,
  getTagMeta,
  getFrontmatterTags,
  extractTextFromTodoLine,
  getAllLinesFromFile,
  getDateCategory,
  getIndentationSpacesFromTodoLine,
  parseDateTag,
  parsePriorityTag,
} from './helpers'
import {DONE_TASK_SYMBOLS} from 'src/constants'

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
  showAllTodos: boolean,
  lastRerender: number,
  priorityTag: string,
  dateTag: string,
): Promise<Map<TFile, TodoItem[]>> => {
  const includePattern = includeFiles.trim()
    ? includeFiles.trim().split('\n')
    : ['**/*']

  const todosForUpdatedFiles = new Map<TFile, TodoItem[]>()
  const includeRegex = globToRegex(includePattern)
  console.log(includeRegex)

  await Promise.all(
    files
      .filter(file => {
        if (file.stat.mtime < lastRerender) return false
        // if (!includePattern.some(p => minimatch(file.path, p))) return false
        // console.log(file.path)
        // if (isExcluded(file.path, includeRegex)) return false
        console.log(file.path)
        return true
      })
      .map(async file => {
        const fileCache = cache.getFileCache(file)

        const todos = await parseFile(
          file,
          fileCache,
          vault,
          todoTags,
          showAllTodos,
          priorityTag,
          dateTag,
        )

        if (todos !== null) {
          todosForUpdatedFiles.set(file, todos)
        }
      }),
  )

  return todosForUpdatedFiles
}

export async function parseFile(
  file: TFile,
  fileCache: CachedMetadata,
  vault: Vault,
  todoTags: string[],
  showAllTodos: boolean,
  priorityTag?: string,
  dateTag?: string,
): Promise<TodoItem[] | null> {
  const tagsOnPage =
    fileCache?.tags?.filter(e =>
      todoTags.includes(retrieveTag(getTagMeta(e.tag)).toLowerCase()),
    ) ?? []
  const frontMatterTags = getFrontmatterTags(fileCache, todoTags)
  const hasFrontMatterTag = frontMatterTags.length > 0
  const qualifies =
    todoTags[0] === '*' || tagsOnPage.length > 0 || hasFrontMatterTag

  if (!qualifies) return []

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

  const excludeMains = new Set<string>()
  for (const t of todoTags) if (t !== '*') excludeMains.add(getTagMeta(t).main)
  if (priorityTag) excludeMains.add(priorityTag)
  if (dateTag) excludeMains.add(dateTag)

  return findAllTodosInFile(fileInfo, priorityTag, dateTag, excludeMains)
}

const findAllTodosInFile = (
  fileInfo: FileInfo,
  priorityTag: string,
  dateTag: string,
  excludeMains: Set<string>,
): TodoItem[] => {
  let todos: TodoItem[]
  if (!fileInfo.parseEntireFile) {
    // A task within reach of several registered tag-blocks is emitted once per
    // tag; dedupeByLine below merges those into one item carrying all its tags.
    todos = fileInfo.validTags.flatMap(tag =>
      findAllTodosFromTagBlock(
        fileInfo,
        tag,
        priorityTag,
        dateTag,
        excludeMains,
      ),
    )
  } else {
    todos = []
    if (!fileInfo.content) return todos
    const fileLines = getAllLinesFromFile(fileInfo.content)
    const tagMeta = fileInfo.frontmatterTag
      ? getTagMeta(fileInfo.frontmatterTag)
      : undefined

    // Use cached listItems instead of parsing all lines
    const listItems = fileInfo.cache.listItems ?? []

    for (const listItem of listItems) {
      // Only process items that have a task property (are tasks)
      if (listItem.task === undefined) continue

      const lineNum = listItem.position.start.line
      const line = fileLines[lineNum]
      if (!line) continue

      todos.push(
        formTodo(
          line,
          fileInfo,
          lineNum,
          listItem.task,
          tagMeta,
          priorityTag,
          dateTag,
          undefined,
          undefined,
          excludeMains,
        ),
      )
    }
  }

  return dedupeByLine(todos)
}

/**
 * Collapses parser duplicates: one TodoItem per (filePath, line), unioning the
 * taskTags of every emit that resolved to the same physical task. Other fields
 * are identical across emits of the same line, so first-wins. This is the fix
 * for "task shows multiple times when several registered TODO tags match it".
 */
const dedupeByLine = (items: TodoItem[]): TodoItem[] => {
  const byLocation = new Map<string, TodoItem>()
  for (const item of items) {
    const key = `${item.filePath}:${item.line}`
    const existing = byLocation.get(key)
    if (!existing) {
      byLocation.set(key, {
        ...item,
        taskTags: [...item.taskTags],
        auxTags: {
          inline: [...item.auxTags.inline],
          block: [...item.auxTags.block],
          inherited: [],
        },
      })
    } else {
      for (const tag of item.taskTags) {
        if (
          !existing.taskTags.some(t => t.main === tag.main && t.sub === tag.sub)
        ) {
          existing.taskTags.push(tag)
        }
      }
      // auxTags.block can differ across blocks the task belongs to → union.
      for (const t of item.auxTags.block) {
        if (!existing.auxTags.block.includes(t)) existing.auxTags.block.push(t)
      }
    }
  }
  return [...byLocation.values()]
}

const findAllTodosFromTagBlock = (
  file: FileInfo,
  tag: TagCache,
  priorityTag: string,
  dateTag: string,
  excludeMains: Set<string>,
) => {
  if (!file.content) return []
  const fileLines = getAllLinesFromFile(file.content)
  const tagMeta = getTagMeta(tag.tag)
  const tagLineNum = tag.position.start.line

  const listItems = file.cache.listItems ?? []
  const todos: TodoItem[] = []

  // Step 1: Check if tag and task are on same line (inline tag - single task mode)
  const sameLineItem = listItems.find(
    item => item.position.start.line === tagLineNum && item.task !== undefined,
  )
  const tagLine = fileLines[tagLineNum]
  if (!tagLine) return []

  if (sameLineItem) {
    // Tag sits on the task line itself — its tags are captured as auxTags.inline,
    // there is no separate block line, so auxBlock stays empty.
    return [
      formTodo(
        tagLine,
        file,
        tagLineNum,
        sameLineItem.task,
        tagMeta,
        priorityTag,
        dateTag,
        undefined,
        undefined,
        excludeMains,
      ),
    ]
  }

  const blockPriority = priorityTag
    ? parsePriorityTag(tagLine, priorityTag)
    : undefined
  const blockTagLine = tagLineNum
  // Non-task/prio/date tags on the block's tag line apply to every task in the block.
  const auxBlock = extractAuxTags(tagLine, excludeMains)

  // Step 2: Walk line by line from tagLineNum + 1 (block mode)
  let currentLine = tagLineNum + 1
  while (currentLine < fileLines.length) {
    const line = fileLines[currentLine]

    // Check if there's a task on this line
    const taskOnLine = listItems.find(
      item =>
        item.position.start.line === currentLine && item.task !== undefined,
    )

    if (taskOnLine) {
      // Empty task check
      const content = line.match(/- \[.\]\s(.*)/)?.[1]
      if (content.trim().length !== 0) {
        // Found a task - add it and continue
        todos.push(
          formTodo(
            line,
            file,
            currentLine,
            taskOnLine.task,
            tagMeta,
            priorityTag,
            dateTag,
            blockPriority,
            blockTagLine,
            excludeMains,
            auxBlock,
          ),
        )
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

const formTodo = (
  line: string,
  file: FileInfo,
  lineNum: number,
  taskStatus: string,
  tagMeta?: TagMeta,
  priorityTag?: string,
  dateTag?: string,
  blockPriority: number | undefined = undefined,
  blockTagLine: number | undefined = undefined,
  excludeMains: Set<string> = new Set(),
  auxBlock: string[] = [],
): TodoItem => {
  const rawText = extractTextFromTodoLine(line)
  const spacesIndented = getIndentationSpacesFromTodoLine(line)
  const linePriority = priorityTag
    ? parsePriorityTag(rawText, priorityTag)
    : undefined
  const priority = linePriority !== undefined ? linePriority : blockPriority
  const lineDate = dateTag ? parseDateTag(rawText, dateTag) : undefined
  const dateCategory = lineDate ? getDateCategory(lineDate) : undefined

  // Use the task status from cache - no fallback needed since we only call this for actual tasks
  const checked = DONE_TASK_SYMBOLS.has(taskStatus)

  return {
    taskTags: tagMeta ? [tagMeta] : [],
    auxTags: {
      inline: extractAuxTags(rawText, excludeMains),
      block: [...auxBlock],
      inherited: [],
    },
    family: undefined,
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
    dateTag: lineDate
      ? rawText.match(new RegExp(`#${dateTag}/([\\d-]+)`))?.[1]
      : undefined,
  }
}

/**
 * Extracts auxiliary tags from a line: every `#ns/value` token whose namespace
 * (the part before `/`) is NOT a task/priority/date tag. Lowercased, deduped.
 * `excludeMains` is the set of reserved namespaces (registered todo-tag mains +
 * priorityTag + dateTag) built once per parse.
 */
const extractAuxTags = (line: string, excludeMains: Set<string>): string[] => {
  const matches = line.match(/#[a-z0-9][a-z0-9/-]*/gi) ?? []
  const out: string[] = []
  for (const m of matches) {
    const tag = m.slice(1).toLowerCase()
    if (!excludeMains.has(tag.split('/')[0]) && !out.includes(tag))
      out.push(tag)
  }
  return out
}
