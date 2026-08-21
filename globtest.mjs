// temp test for globsToRegex semantics — delete after use
const globToPattern = g => {
  const anyDepth = !g.includes('/')
  let s = g.replace(/^\/+|\/+$/g, '').replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const body = s.replace(/\*\*\/|\*\*|\*|\?/g, tok => {
    switch (tok) {
      case '**/': return '(?:.+/)?'
      case '**': return '.*'
      case '*': return '[^/]*'
      default: return '[^/]'
    }
  })
  return anyDepth ? `(?:.+/)?${body}` : body
}

function globsToRegex(globs) {
  const valid = globs.map(g => g.trim()).filter(Boolean)
  const negatives = valid.filter(g => g.startsWith('!')).map(g => g.slice(1).trim()).filter(Boolean)
  const positives = valid.filter(g => !g.startsWith('!'))
  const allIncluded = !positives.length || positives.some(g => g === '*' || g === '**' || g === '**/*')
  const positiveSrc = allIncluded ? '.*' : `((${positives.map(globToPattern).join(')|(')}))`
  const negationSrc = negatives.length ? `(?!(?:(${negatives.map(globToPattern).join(')|(')}))$)` : ''
  return new RegExp(`^${negationSrc}${positiveSrc}$`, 'i')
}

// the user's exact setting
const re = globsToRegex(['zzztest/**', 'Downloads/**', 'TESTING/**', 'Journal/**'])
console.log('regex:', re.source)

// the **/2026/** line from the include setting
const re5 = globsToRegex(['zzztest/**', 'Downloads/**', 'TESTING/**', 'Journal/**', '**/2026/**'])
console.log('regex5:', re5.source)
console.log('2026/a.md          ->', re5.test('2026/a.md'))
console.log('Journal/2026/a.md  ->', re5.test('Journal/2026/a.md'))
console.log('deep/2026/sub/a.md ->', re5.test('deep/2026/sub/a.md'))
console.log('2026-notes/a.md    ->', re5.test('2026-notes/a.md'), '(should be false)')

const checks = [
  ['zzztest/note.md', true],
  ['zzztest/sub/deep/note.md', true],
  ['Downloads/a.md', true],
  ['TESTING/x/y.md', true],
  ['Journal/daily.md', true],       // ← failed before (old regex required literal dot)
  ['Journal/2026/june.md', true],   // ← failed before (single-segment only)
  ['Journal', false],
  ['JournalX/a.md', false],
  ['Other/note.md', false],
]
let failed = 0
for (const [path, want] of checks) {
  const got = re.test(path)
  if (got !== want) failed++
  console.log((got === want ? 'ok  ' : 'FAIL'), path.padEnd(28), '->', got)
}

// negation cases
const negCases = [
  [['zzztest/**', '! zzztest/private/**'], [['zzztest/a.md', true], ['zzztest/private/x.md', false], ['other/a.md', false]]],
  [['! Journal/**'], [['Other/x.md', true], ['Journal/x.md', false], ['Journal/deep/x.md', false]]],
  [['**/*', '! Journal/**'], [['Other/x.md', true], ['Journal/x.md', false]]],
  [['zzztest/**', '!zzztest/private/**'], [['zzztest/private/x.md', false], ['zzztest/a.md', true]]], // no space
  [['! **/2026/**', 'zzztest/**'], [['zzztest/2026/a.md', false], ['zzztest/a.md', true], ['x/2026/a.md', false]]],
  // gitignore rule: slash-less patterns match at any depth
  [['**/*', '! *.md'], [['a.md', false], ['deep/x/a.md', false], ['notes/b.txt', true]]],
  [['*.md'], [['a.md', true], ['sub/a.md', true], ['a.txt', false]]],
  [['! *.md', '**-01/**'], [['deep/x-01/a.txt', true], ['x-01/a.md', false], ['other/a.txt', false]]],
  [['**2026**'], [['x/2026/a.md', true], ['foo2026bar.md', true], ['x/2025/a.md', false]]],
]
for (const [globs, pathChecks] of negCases) {
  const reN = globsToRegex(globs)
  console.log('\nnegation:', globs.join(' , '), '\n  regex:', reN.source)
  for (const [p, want] of pathChecks) {
    const got = reN.test(p)
    if (got !== want) failed++
    console.log(' ', (got === want ? 'ok  ' : 'FAIL'), p.padEnd(26), '->', got, want === false ? '(excluded)' : '')
  }
}

console.log(failed ? `\n${failed} FAILING` : '\nall pass')
