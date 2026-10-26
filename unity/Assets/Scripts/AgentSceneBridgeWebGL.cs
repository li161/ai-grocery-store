using System.Runtime.InteropServices;
using UnityEngine;

/// <summary>WebGL browser-event adapter; editor/desktop builds safely log instead.</summary>
public static class AgentSceneBridgeWebGL
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern void AgentSceneBridge_SendSceneEvent(string json);
#endif

    public static void SendSceneEvent(string json)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        AgentSceneBridge_SendSceneEvent(json);
#else
        Debug.Log("[AgentSceneBridgeWebGL] " + json);
#endif
    }
}
