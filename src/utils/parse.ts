import type {
  TFile,
  MetadataCache,
  Vault,
  TagCache,
  CachedMetadata,
} from 'node_modules/obsidian/obsidian'
import type {TodoItem, FileInfo, TagMeta, BlockInfo, ParseContext, TodoLineInfo} from 'src/_types'
import {getTodoFrontmatterTags, globsToRegex} from './helpers'
import {
  // retrieveTag,
  getTagMeta,
  extractTextFromTodoLine,
  getAllLinesFromFile,
  getDateCategory,
  getIndentationLevelsFromTodoLine,
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
  cache: MetadataCache,
  vault: Vault,
  lastRerender: number,
  ctx: ParseContext
): Promise<Map<TFile, TodoItem[]>> => {
  
  const todosForUpdatedFiles = new Map<TFile, TodoItem[]>()
  const includedFiles = files.filter(file => ctx.includeRegex.test(file.path))

  await Promise.all(
    includedFiles
      .filter(file => {
        if (file.stat.mtime < lastRerender) return false
        return true
      })
      .map(async file => {
        const fileCache = cache.getFileCache(file)

        const todos = await parseFile(
          file,
          fileCache,
          vault,
          ctx
        )

        if (todos !== null) {
          todosForUpdatedFiles.set(file, todos)
        }
      }),
  )
  return todosForUpdatedFiles
}

export function buildParseContext(includePattern: string, todoTags: string[], hiddenTags: string[], showAllTodos: boolean, priorityTag: string, dateTag: string) {

  const includePatternArray = includePattern.trim()
    ? includePattern.trim().split('\n')
    : ['**/*']

  const includeRegex = globsToRegex(includePatternArray)
  let enabledTodoTags = todoTags.filter(e => e).filter(tag => !hiddenTags.includes(tag))
  
  /** 
   * @description
   * To get any checklist item in the vault from ANY TAG ASSOCIATION. 
   * This will still require tags to be present, only not discriminating which one is present.
   * Simply delete all todo tags, or enable one that is called `*` - an actual wildcard
   */
  if (todoTags.length === 0 || enabledTodoTags.find((t)=> t === "*") !== undefined){
    enabledTodoTags = ["*"]
  }

  const enabledTagSet = new Set(enabledTodoTags)
  /**
   * @todo Whats the right choice for wildcard case?
   */
  const excludeMains = new Set<string>()
  for (const t of todoTags) if (t !== '*') excludeMains.add(t)
  if (priorityTag) excludeMains.add(priorityTag)
  if (dateTag) excludeMains.add(dateTag)

  const dateStringRegex = dateTag
    ? new RegExp(`#${dateTag} (\\d{4}-\\d{2}-\\d{2}(?: \\d{1,2}:\\d{2})?)`)
    : undefined
  
  const dateParseRegex = dateTag 
    ? new RegExp(`\\s#${dateTag} (\\d{4}-\\d{2}-\\d{2})(?: (\\d{1,2}:\\d{2}))?`) 
    : undefined

  const anyCheckbox = showAllTodos

  const priorityRegex = new RegExp(`\\s#${priorityTag}/(-?\\d+)`)

  const ctx: ParseContext = {
    includeRegex,
    priorityTag,
    priorityRegex,
    dateTag,
    dateStringRegex,
    dateParseRegex,
    excludeMains,
    anyCheckbox,
    enabledTodoTags,
    enabledTagSet
  }
  return ctx
}


export async function parseFile(
  file: TFile,
  fileCache: CachedMetadata,
  vault: Vault,
  ctx: ParseContext,
): Promise<TodoItem[] | null> {



  
  const todoFrontMatterTags = getTodoFrontmatterTags(fileCache, ctx.enabledTagSet) ?? []
  const hasFrontMatterTag = todoFrontMatterTags.length > 0

  let tagsOnPage = fileCache?.tags?.filter(
      e => ctx.enabledTagSet.has(getTagMeta(e.tag).main) ||
      todoFrontMatterTags.contains(getTagMeta(e.tag).main)
    ) ?? []  

  const fileQualifies =  tagsOnPage.length > 0 || ctx.enabledTodoTags[0] === "*" || hasFrontMatterTag

  if (!fileQualifies) return []

  const parseEntireFile = ctx.enabledTodoTags[0] === "*" || ctx.anyCheckbox || todoFrontMatterTags.contains("any")
  //const content = await vault.cachedRead(file)

  if (!fileCache?.listItems?.length) return []
  const taskItemsByLine = new Map(fileCache?.listItems?.
    filter((i)=>i.task !== undefined).
    map(i => [i.position.start.line, i]))
  if (!taskItemsByLine.size) return []

  const content = await vault.cachedRead(file)
  const validTags = tagsOnPage.map(e => ({...e, tag: e.tag.toLowerCase()}))

  const fileInfo: FileInfo = {
    content,
    cache: fileCache,
    validTags,
    file,
    taskItemsByLine
  }


  let todos: TodoItem[] = []
  if (!parseEntireFile) {
    // A task within reach of several registered tag-blocks is emitted once per
    // tag; dedupeByLine below merges those into one item carrying all its tags.
    todos = fileInfo.validTags.flatMap(tag =>
      findAllTodosFromTagBlock(fileInfo, tag, ctx),
    )
    return dedupeByLine(todos)
  }

  if (!fileInfo.content) return todos
  const fileLines = getAllLinesFromFile(fileInfo.content)

    // Use cached listItems instead of parsing all lines
    const listItems = fileInfo.cache.listItems ?? []

    for (const listItem of listItems) {
      // Only process items that have a task property (are tasks)
      if (listItem.task === undefined) continue

      const lineNum = listItem.position.start.line
      const line = fileLines[lineNum]
      if (!line) continue

      const todo = formTodo(line, fileInfo, lineNum, listItem.task, ctx, undefined)
      if (todo) todos.push(todo)
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
  ctx: ParseContext,
) => {
  if (!file.content) return []
  const fileLines = getAllLinesFromFile(file.content)
  const tagMeta = getTagMeta(tag.tag)
  const tagLineNum = tag.position.start.line

  const listItems = file.cache.listItems ?? []
  const todos: TodoItem[] = []

  // Step 1: Check if tag and task are on same line (inline tag - single task mode)
  // (task check included: a tag line with a non-task list item → block mode)
  const sameLineItem = file.taskItemsByLine.get(tagLineNum)
  const tagLine = fileLines[tagLineNum]
  if (!tagLine) return []

  if (sameLineItem?.task !== undefined) {
    // Tag sits on the task line itself — its tags are captured as auxTags.inline,
    // there is no separate block line, so auxBlock stays empty.
    const todo = formTodo(
      tagLine, file, tagLineNum, sameLineItem.task, ctx, tagMeta,
    )
    return todo ? [todo] : []
  }

  const block: BlockInfo = {
    priority: ctx.priorityTag
      ? parsePriorityTag(tagLine, ctx.priorityRegex)
      : undefined,
    tagLine: tagLineNum,
    // Non-task/prio/date tags on the block's tag line apply to every task in the block.
    aux: extractAuxTags(tagLine, ctx.excludeMains),
  }

  // Step 2: Walk line by line from tagLineNum + 1 (block mode)
  let currentLine = tagLineNum + 1
  while (currentLine < fileLines.length) {
    const line = fileLines[currentLine]

    // Check if there's a task on this line
    const taskOnLine = file.taskItemsByLine.get(currentLine)

    if (taskOnLine?.task !== undefined) {
      // Single parse inside formTodo doubles as the valid/non-empty check:
      // null for desynced, bare "- [ ]" or otherwise unparseable lines.
      const todo = formTodo(
        line, file, currentLine, taskOnLine.task, ctx, tagMeta, block,
      )
      // (taskOnLine narrowed to task-bearing by the check above)
      if (todo) todos.push(todo)
    } else if (!line || line.trim().length === 0) {
      // Empty line - stop processing (end of block)
      break
    }
    // If line has content but no task, just continue (description text between tasks)
    currentLine++
  }
  return todos
}

const TODO_LINE_RE = /^(?<prefix>(?:\s|>)*)(?<marker>[-*]|[0-9]+\.)\s\[(?<status>.)\]\s{1,4}(?<text>\S.*)$/;

export function parseTodoLine(line: string): TodoLineInfo | null {
  const match = TODO_LINE_RE.exec(line);
  if (!match?.groups) return null;

  const { prefix, status, text } = match.groups;

  let width = 0;
  for (const ch of prefix) width += ch === "\t" ? 4 : 1;

  return {
    valid: true,
    text,
    status,
    checked: status !== " ",
    indentLevel: Math.floor(width / 4),
  };
}




/**
 * Parses one task line into a TodoItem. 
 */
const formTodo = (
  line: string,
  file: FileInfo,
  lineNum: number,
  taskStatus: string,
  ctx: ParseContext,
  tagMeta?: TagMeta,
  block?: BlockInfo,
): TodoItem | null => {
  const parsed = parseTodoLine(line)
  if (!parsed) return null
  const rawText = parsed.text
  const spacesIndented = parsed.indentLevel

  const linePriority = ctx.priorityTag
    ? parsePriorityTag(rawText, ctx.priorityRegex)
    : undefined
  const priority = linePriority !== undefined ? linePriority : block?.priority
  const dateString = ctx.dateTag ? rawText.match(ctx.dateStringRegex)?.[1] : undefined
  const lineDate = dateString ? parseDateTag(rawText, ctx.dateParseRegex) : undefined
  const dateCategory = lineDate ? getDateCategory(lineDate) : undefined
  

  const checked = DONE_TASK_SYMBOLS.has(taskStatus)

  return {
    taskTags: tagMeta ? [tagMeta] : [],
    family: null,
    isFamilyContext: false,
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
    blockPriority: block?.priority,
    blockTagLine: block?.tagLine,
    date: lineDate,
    dateCategory,
    dateTag: dateString,
    auxTags: {
      inline: extractAuxTags(rawText, ctx.excludeMains),
      block: [...(block?.aux ?? [])],
      inherited: [],
    },
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
