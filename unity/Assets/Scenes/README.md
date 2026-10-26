# Unity sample scene acceptance checklist

Create the initial scene in a Unity LTS + URP project and attach `AgentSceneBridge` to a GameObject with the exact name `AgentSceneBridge`.

- [ ] A cohesive, licensed environment asset with clear foreground/midground/background.
- [ ] Six rigged characters mapped to stable IDs: `manager`, `cashier`, `guide`, `buyer`, `inventory`, `pm`.
- [ ] One animator controller per character or a shared controller with deterministic parameters.
- [ ] Idle, speaking, working, success and error presentation states.
- [ ] Business/fairytale mode switching changes actual environment roots and character sets.
- [ ] Camera orbit, zoom and focus selection are available without blocking chat UI.
- [ ] No missing materials, pink shaders, console errors or broken asset references in WebGL.
- [ ] Test desktop Chromium and a real mobile device.
- [ ] Capture the WebGL-only stage screenshot, full UI screenshot, cold-load duration and 60-second frame-time sample.

Do not mark this checklist complete merely because the scene opens in Unity Editor; the deliverable target is the built WebGL player in the actual Vue page.
