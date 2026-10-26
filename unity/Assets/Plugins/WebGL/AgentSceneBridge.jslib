mergeInto(LibraryManager.library, {
  AgentSceneBridge_SendSceneEvent: function (jsonPtr) {
    try {
      var json = UTF8ToString(jsonPtr);
      var detail = JSON.parse(json);
      window.dispatchEvent(new CustomEvent('unity-scene-event', { detail: detail }));
    } catch (error) {
      console.error('[UnitySceneBridge] Could not dispatch scene event:', error);
    }
  }
});
