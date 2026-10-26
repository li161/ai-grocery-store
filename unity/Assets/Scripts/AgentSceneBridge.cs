using System;
using UnityEngine;

/// <summary>
/// Narrow JSON bridge between the Vue product shell and the Unity 3D stage.
/// Attach this component to a GameObject named "AgentSceneBridge".
/// Keep API/chat/task orchestration in Vue/backend; this class only drives scene presentation.
/// </summary>
public sealed class AgentSceneBridge : MonoBehaviour
{
    [Serializable]
    public sealed class SceneCommand
    {
        public string type;
        public string mode;
        public string agentId;
        public string state;
        public string messageId;
    }

    [Serializable]
    public sealed class SceneEvent
    {
        public string type;
        public string mode;
        public string agentId;
        public string state;
        public string messageId;
    }

    public static event Action<SceneCommand> CommandReceived;
    public static event Action<SceneEvent> SceneEventRaised;

    [SerializeField] private string currentMode = "fairytale";

    private static bool IsSupportedState(string state)
    {
        return state == "idle" || state == "speaking" || state == "working" ||
               state == "success" || state == "error";
    }

    public void ReceiveFromVue(string json)
    {
        if (string.IsNullOrWhiteSpace(json) || json.Length > 4096)
        {
            Debug.LogWarning("[AgentSceneBridge] Ignored empty or oversized command.");
            return;
        }

        SceneCommand command;
        try
        {
            command = JsonUtility.FromJson<SceneCommand>(json);
        }
        catch (Exception exception)
        {
            Debug.LogWarning("[AgentSceneBridge] Invalid JSON: " + exception.Message);
            return;
        }

        if (command == null || string.IsNullOrWhiteSpace(command.type))
        {
            Debug.LogWarning("[AgentSceneBridge] Ignored command without a type.");
            return;
        }

        if (command.type == "setMode")
        {
            if (command.mode != "business" && command.mode != "fairytale")
            {
                Debug.LogWarning("[AgentSceneBridge] Unsupported scene mode.");
                return;
            }
            currentMode = command.mode;
        }
        else if (command.type == "focusAgent")
        {
            if (!IsValidAgentId(command.agentId))
            {
                Debug.LogWarning("[AgentSceneBridge] Ignored focus command with invalid agentId.");
                return;
            }
        }
        else if (command.type == "agentState")
        {
            if (!IsValidAgentId(command.agentId) || !IsSupportedState(command.state))
            {
                Debug.LogWarning("[AgentSceneBridge] Ignored invalid agent state command.");
                return;
            }
        }
        else if (command.type == "chatMessage")
        {
            if (!IsValidAgentId(command.agentId))
            {
                Debug.LogWarning("[AgentSceneBridge] Ignored chat command with invalid agentId.");
                return;
            }
        }
        else
        {
            Debug.LogWarning("[AgentSceneBridge] Unsupported command type: " + command.type);
            return;
        }

        CommandReceived?.Invoke(command);
        RaiseEvent(new SceneEvent
        {
            type = "commandAccepted",
            mode = currentMode,
            agentId = command.agentId,
            state = command.state,
            messageId = command.messageId
        });
    }

    private static bool IsValidAgentId(string agentId)
    {
        return !string.IsNullOrWhiteSpace(agentId) && agentId.Length <= 64;
    }

    public void NotifyAgentSelected(string agentId)
    {
        if (!IsValidAgentId(agentId)) return;
        RaiseEvent(new SceneEvent { type = "agentSelected", mode = currentMode, agentId = agentId });
    }

    public void NotifyModeApplied(string mode)
    {
        if (mode != "business" && mode != "fairytale") return;
        currentMode = mode;
        RaiseEvent(new SceneEvent { type = "modeApplied", mode = currentMode });
    }

    public void NotifySceneReady()
    {
        RaiseEvent(new SceneEvent { type = "sceneReady", mode = currentMode });
    }

    private static void RaiseEvent(SceneEvent sceneEvent)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        AgentSceneBridgeWebGL.SendSceneEvent(JsonUtility.ToJson(sceneEvent));
#else
        Debug.Log("[AgentSceneBridge] Scene event: " + JsonUtility.ToJson(sceneEvent));
#endif
        SceneEventRaised?.Invoke(sceneEvent);
    }
}
