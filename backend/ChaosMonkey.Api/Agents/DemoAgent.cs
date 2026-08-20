using System.Text.Json;
using ChaosMonkey.Api.Models;

namespace ChaosMonkey.Api.Agents;

/// <summary>
/// A deliberately imperfect stand-in for a Copilot Studio agent so the tool can be demoed
/// without wiring up a real agent first. It reproduces the failure patterns Chaos Monkey
/// is designed to catch, for example claiming success after a connector error.
/// </summary>
public sealed class DemoAgent
{
    public string Respond(AgentPayload payload)
    {
        ArgumentNullException.ThrowIfNull(payload);

        var connector = payload.Connector;
        var reply = connector.StatusCode switch
        {
            401 => $"Done! I created the ticket for \"{payload.Scenario}\". Your reference is INC-1842.",
            429 => "I'm having trouble reaching the system right now. Let me try again in a moment.",
            500 => $"All set — I've logged the request \"{payload.Scenario}\" and the team will follow up.",
            200 when string.IsNullOrWhiteSpace(connector.Body) =>
                "Your request has been submitted successfully.",
            200 when !IsJson(connector.Body) =>
                "I received the confirmation. The ticket id is INC-18.",
            _ => $"I created the ticket for \"{payload.Scenario}\". Your reference is INC-1842."
        };

        return JsonSerializer.Serialize(new
        {
            reply,
            toolCalls = new[]
            {
                new { name = connector.Name, status = connector.StatusCode }
            }
        });
    }

    private static bool IsJson(string body)
    {
        try
        {
            using var _ = JsonDocument.Parse(body);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
