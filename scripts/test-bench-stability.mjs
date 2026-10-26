import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const sourcePath = fileURLToPath(new URL('../src/lib/benchMath.ts', import.meta.url))
const source = await readFile(sourcePath, 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2021,
  },
}).outputText
const moduleRecord = { exports: {} }
new Function('exports', 'module', 'require', output)(
  moduleRecord.exports,
  moduleRecord,
  createRequire(import.meta.url),
)

const { median, summarizeRunDistribution, measurementNoiseFloor } = moduleRecord.exports
let checks = 0

function check(description, assertion) {
  assertion()
  checks += 1
  console.log(`PASS ${description}`)
}

check('median handles odd and even run counts', () => {
  assert.equal(median([90, 100, 95]), 95)
  assert.equal(median([90, 100]), 95)
})

check('distribution records spread and typical variation', () => {
  assert.deepEqual(summarizeRunDistribution([90, 100, 95]), {
    median: 95,
    spread: 10,
    mad: 5,
    count: 3,
  })
})

check('non-finite probe values do not become evidence', () => {
  assert.deepEqual(summarizeRunDistribution([90, Number.NaN, 100]), {
    median: 95,
    spread: 10,
    mad: 5,
    count: 2,
  })
  assert.throws(() => median([Number.NaN]), /finite value/)
})

check('noise floor never hides a meaningful minimum delta', () => {
  assert.equal(measurementNoiseFloor({ mad: 0.1, spread: 0.2 }, { mad: 0.2, spread: 0.4 }), 1)
  assert.equal(measurementNoiseFloor({ mad: 2, spread: 3 }, { mad: 1, spread: 8 }), 4)
  assert.equal(measurementNoiseFloor(null, { mad: 1, spread: 2 }), null)
})

console.log(`\n${checks} benchmark stability checks passed.`)
