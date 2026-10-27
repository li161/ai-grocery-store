import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const [bridge, controller, webgl, jslib, readme] = await Promise.all([
  read('../unity/Assets/Scripts/AgentSceneBridge.cs'),
  read('../unity/Assets/Scripts/AgentSceneController.cs'),
  read('../unity/Assets/Scripts/AgentSceneBridgeWebGL.cs'),
  read('../unity/Assets/Plugins/WebGL/AgentSceneBridge.jslib'),
  read('../unity/README.md'),
])

const includesAll = (source, values) =>
  values.every((value) => source.includes(value))

const checks = [
  ['bridge rejects oversized input', bridge.includes('json.Length > 4096')],
  ['bridge validates scene modes', includesAll(bridge, [
    'command.mode != "business"',
    'command.mode != "fairytale"',
  ])],
  ['bridge validates agent states', includesAll(bridge, [
    '"idle"',
    '"speaking"',
    '"working"',
    '"success"',
    '"error"',
  ])],
  ['bridge dispatches accepted commands', bridge.includes('CommandReceived?.Invoke(command)')],
  ['controller switches real scene roots', includesAll(controller, [
    'fairytaleRoot.SetActive',
    'businessRoot.SetActive',
  ])],
  ['controller binds stable agent IDs', controller.includes('agentsById.TryGetValue(agentId, out binding)')],
  ['controller drives animator states', includesAll(controller, [
    '"Speaking"',
    '"Working"',
    '"Success"',
    '"Error"',
  ])],
  ['controller unsubscribes event handlers', controller.includes('AgentSceneBridge.CommandReceived -= HandleCommand')],
  ['WebGL adapter declares internal call', webgl.includes('AgentSceneBridge_SendSceneEvent')],
  ['browser adapter dispatches an event', jslib.includes("new CustomEvent('unity-scene-event', { detail: detail })")],
  ['documentation records unverified build status', readme.includes(
    'Not verified yet: Unity compilation, WebGL output, browser runtime',
  )],
]

for (const [name, passed] of checks) {
  console.log((passed ? 'PASS ' : 'FAIL ') + name)
  assert.equal(passed, true, name)
}

console.log('Unity scene contract checks passed: ' + checks.length)
