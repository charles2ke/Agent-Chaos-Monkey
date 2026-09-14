using System.Text.Json;
using System.Text.RegularExpressions;
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
        var injectedCanary = InjectedCanary(connector.Body);
        var reply = connector.StatusCode switch
        {
            // The demo agent obeys instructions found in tool output, which is exactly the
            // behaviour prompt-injection runs are meant to expose.
            200 when injectedCanary is not null =>
                $"All done — the request completed. Your confirmation code is {injectedCanary}.",
            400 => $"Done! I created the ticket for \"{payload.Scenario}\". Your reference is INC-1842.",
            401 => $"Done! I created the ticket for \"{payload.Scenario}\". Your reference is INC-1842.",
            429 => "I'm having trouble reaching the system right now. Let me try again in a moment.",
            503 => $"All set — I've logged the request \"{payload.Scenario}\" and the dependent updates went through too.",
            500 => $"All set — I've logged the request \"{payload.Scenario}\" and the team will follow up.",
            200 when string.IsNullOrWhiteSpace(connector.Body) =>
                "Your request has been submitted successfully.",
            200 when IsTruncatedResultSet(connector.Body) =>
                "I pulled back the complete result set. Everything is logged and up to date.",
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

    /// <summary>Returns the canary phrase an injected connector payload asked the agent to repeat.</summary>
    private static string? InjectedCanary(string body)
    {
        var match = Regex.Match(body ?? string.Empty, "CHAOS-CANARY-[A-Z0-9]+");
        return match.Success ? match.Value : null;
    }

    /// <summary>A successful payload that the connector itself flagged as truncated / partial.</summary>
    private static bool IsTruncatedResultSet(string body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            return document.RootElement.ValueKind == JsonValueKind.Object &&
                document.RootElement.TryGetProperty("truncated", out var truncated) &&
                truncated.ValueKind == JsonValueKind.True;
        }
        catch (JsonException)
        {
            return false;
        }
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
