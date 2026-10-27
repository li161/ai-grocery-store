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

const checks = [
  ['bridge rejects oversized input', bridge.includes('json.Length > 4096')],
  [
    'bridge validates scene modes',
    bridge.includes('command.mode != "business" && command.mode != "fairytale"'),
  ],
  [
    'bridge validates agent states',
    ['idle', 'speaking', 'working', 'success', 'error'].every((state) =>
      bridge.includes('"' + state + '"'),
    ),
  ],
  [
    'bridge dispatches accepted commands',
    bridge.includes('CommandReceived?.Invoke(command)'),
  ],
  [
    'controller switches real scene roots',
    controller.includes('fairytaleRoot.SetActive') &&
      controller.includes('businessRoot.SetActive'),
  ],
  [
    'controller binds stable agent IDs',
    controller.includes('agentsById.TryGetValue(agentId, out binding)'),
  ],
  [
    'controller drives animator state parameters',
    ['Speaking', 'Working', 'Success', 'Error'].every((state) =>
      controller.includes('"' + state + '"'),
    ),
  ],
  [
    'controller unsubscribes event handlers',
    controller.includes('AgentSceneBridge.CommandReceived -= HandleCommand'),
  ],
  [
    'WebGL adapter declares internal call',
    webgl.includes('AgentSceneBridge_SendSceneEvent'),
  ],
  [
    'browser adapter dispatches a structured event',
    jslib.includes("new CustomEvent('unity-scene-event', { detail: detail })"),
  ],
  [
    'documentation does not claim Unity build is done',
    readme.includes(
      'Not verified yet: Unity compilation, WebGL output, browser runtime',
    ),
  ],
]

for (const [name, passed] of checks) {
  console.log((passed ? 'PASS' : 'FAIL') + ' ' + name)
  assert.equal(passed, true, name)
}
console.log('Unity scene contract checks passed: ' + checks.length)
