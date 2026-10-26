# Unity WebGL scene spike

This directory is the integration contract for evaluating Unity as the high-fidelity renderer for AI Grocery Store. It is intentionally separate from the production Vue/Three.js renderer until a real Unity build is available and verified.

## Target architecture

- Vue 3 remains the product shell: navigation, role selection, chat history, DeepSeek API, task progress and business workflows.
- Unity owns only the 3D stage: environment, character rigs, animation, camera and scene interaction.
- A small JSON event bridge connects the two. Do not duplicate chat/task business logic in Unity.
- Keep the current Three.js renderer as the fallback until Unity WebGL has passed the same browser smoke tests.

## First vertical slice

1. Create a Unity LTS project using the Universal Render Pipeline (URP), not HDRP, for browser compatibility.
2. Import a licensed, cohesive environment GLB/FBX and six rigged character assets. Record source, license and asset version before shipping.
3. Add `Assets/Scripts/AgentSceneBridge.cs` and `Assets/Plugins/WebGL/AgentSceneBridge.jslib`.
4. Build WebGL into `public/unity-scene/` only when the local Unity Editor build succeeds. Do not commit generated build output until size and licensing are reviewed.
5. Host the build in a Vue component/iframe and communicate using `unityInstance.SendMessage('AgentSceneBridge', 'ReceiveFromVue', json)` plus `window.dispatchEvent(new CustomEvent('unity-scene-event', { detail }))`.
6. Validate: load success, six character IDs, mode switch, focus selection, speaking/working/idle events, browser console errors, mobile fallback, cold-load size and frame-time measurements.

## Event contract

Vue -> Unity JSON:
```json
{ "type": "setMode", "mode": "business" }
{ "type": "focusAgent", "agentId": "manager" }
{ "type": "agentState", "agentId": "buyer", "state": "working" }
{ "type": "chatMessage", "agentId": "manager", "messageId": "m-123" }
```

Unity -> Vue browser event:
```js
window.addEventListener('unity-scene-event', (event) => {
  // event.detail is validated JSON from the Unity scene
})
```

Supported states are `idle`, `speaking`, `working`, `success`, and `error`. The bridge must not execute arbitrary commands or accept HTML.

## Why URP

Unity WebGL cannot simply use desktop HDRP features unchanged. URP offers a more realistic browser deployment target. The goal is high-quality art direction, licensed PBR assets, baked lighting where possible, efficient rigs and polished animation—not to turn on every expensive rendering feature.

## Status / non-claims

- Implemented in this repository: bridge contract source files and integration documentation.
- Not implemented yet: Unity scene asset, imported production characters, Unity Editor build, Vue host component and live Unity WebGL deployment.
- Not verified yet: Unity compilation, WebGL output, browser runtime, frame rate or visual parity. A Unity Editor/CI build is required before calling this migration functional.
