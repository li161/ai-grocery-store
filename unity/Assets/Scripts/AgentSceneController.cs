using System;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Applies bridge commands to actual scene roots and character animators.
/// Wire the two scene roots and six agent bindings in the Unity Inspector.
/// Animator bool parameters are optional: Speaking, Working, Success, Error.
/// </summary>
public sealed class AgentSceneController : MonoBehaviour
{
    [Serializable]
    public sealed class AgentBinding
    {
        public string agentId;
        public GameObject root;
        public Animator animator;
        public Transform focusPoint;
    }

    [Header("Mode roots")]
    [SerializeField] private GameObject fairytaleRoot;
    [SerializeField] private GameObject businessRoot;

    [Header("Stable agent IDs")]
    [SerializeField] private List<AgentBinding> agents = new List<AgentBinding>();

    [Header("Optional camera focus")]
    [SerializeField] private Transform cameraTarget;

    private readonly Dictionary<string, AgentBinding> agentsById =
        new Dictionary<string, AgentBinding>(StringComparer.OrdinalIgnoreCase);
    private string currentMode = "fairytale";

    private void Awake()
    {
        agentsById.Clear();
        foreach (AgentBinding agent in agents)
        {
            if (agent == null || string.IsNullOrWhiteSpace(agent.agentId)) continue;
            if (agentsById.ContainsKey(agent.agentId))
            {
                Debug.LogWarning("[AgentSceneController] Duplicate agent ID: " + agent.agentId);
                continue;
            }
            agentsById.Add(agent.agentId, agent);
        }
        ApplyMode(currentMode);
    }

    private void OnEnable()
    {
        AgentSceneBridge.CommandReceived += HandleCommand;
    }

    private void OnDisable()
    {
        AgentSceneBridge.CommandReceived -= HandleCommand;
    }

    private void Start()
    {
        AgentSceneBridge bridge = FindObjectOfType<AgentSceneBridge>();
        if (bridge != null) bridge.NotifySceneReady();
    }

    private void HandleCommand(AgentSceneBridge.SceneCommand command)
    {
        if (command == null) return;

        switch (command.type)
        {
            case "setMode":
                ApplyMode(command.mode);
                break;
            case "focusAgent":
                FocusAgent(command.agentId);
                break;
            case "agentState":
                ApplyAgentState(command.agentId, command.state);
                break;
            case "chatMessage":
                ApplyAgentState(command.agentId, "speaking");
                break;
        }
    }

    private void ApplyMode(string mode)
    {
        if (mode != "business" && mode != "fairytale") return;
        currentMode = mode;

        if (fairytaleRoot != null) fairytaleRoot.SetActive(mode == "fairytale");
        if (businessRoot != null) businessRoot.SetActive(mode == "business");

        AgentSceneBridge bridge = FindObjectOfType<AgentSceneBridge>();
        if (bridge != null) bridge.NotifyModeApplied(currentMode);
    }

    private void FocusAgent(string agentId)
    {
        AgentBinding binding;
        if (string.IsNullOrWhiteSpace(agentId) || !agentsById.TryGetValue(agentId, out binding))
        {
            Debug.LogWarning("[AgentSceneController] Unknown agent ID: " + agentId);
            return;
        }

        if (cameraTarget != null && binding.focusPoint != null)
            cameraTarget.position = binding.focusPoint.position;

        AgentSceneBridge bridge = FindObjectOfType<AgentSceneBridge>();
        if (bridge != null) bridge.NotifyAgentSelected(agentId);
    }

    private void ApplyAgentState(string agentId, string state)
    {
        AgentBinding binding;
        if (string.IsNullOrWhiteSpace(agentId) || !agentsById.TryGetValue(agentId, out binding))
        {
            Debug.LogWarning("[AgentSceneController] Unknown agent ID: " + agentId);
            return;
        }

        if (state != "idle" && state != "speaking" && state != "working" &&
            state != "success" && state != "error")
        {
            Debug.LogWarning("[AgentSceneController] Unsupported agent state: " + state);
            return;
        }

        Animator animator = binding.animator;
        if (animator == null) return;

        SetBoolIfPresent(animator, "Speaking", state == "speaking");
        SetBoolIfPresent(animator, "Working", state == "working");
        SetBoolIfPresent(animator, "Success", state == "success");
        SetBoolIfPresent(animator, "Error", state == "error");
    }

    private static void SetBoolIfPresent(Animator animator, string parameter, bool value)
    {
        foreach (AnimatorControllerParameter item in animator.parameters)
        {
            if (item.name == parameter && item.type == AnimatorControllerParameterType.Bool)
            {
                animator.SetBool(parameter, value);
                return;
            }
        }
    }
}
