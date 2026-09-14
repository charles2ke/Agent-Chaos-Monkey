using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
namespace ChaosMonkey.Api.Lab;

/// <summary>
/// Drives a real Copilot Studio / Microsoft 365 Agents SDK agent over Direct Line: token exchange,
/// conversation start, activity send and activity receive. The chaos gateway callback protocol is
/// carried on the activity so the agent invokes its tools through the laboratory boundary, which is
/// what turns a run into observed evidence instead of an inconclusive result.
/// </summary>
public sealed class DirectLineAdapter(IHttpClientFactory clients, DirectLineOptions options, string userId)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private string? _conversationId;
    private string? _token;
    private string? _watermark;

    /// <summary>Credentials that must never appear in a stored result.</summary>
    public IEnumerable<string?> Secrets => [options.Secret, _token];

    public static string[] ConfigurationErrors(DirectLineOptions options)
    {
        var errors = new List<string>();
        if (!options.Enabled) errors.Add("Direct Line transport is disabled.");
        if (string.IsNullOrEmpty(options.Secret)) errors.Add("A LabGateway:DirectLine:Secret is required for Direct Line transport.");
        if (!LabValidation.SafeUrl(options.BaseUrl)) errors.Add("A trusted LabGateway:DirectLine:BaseUrl is required.");
        if (options.PollIntervalMs is < 50 or > 5000 || options.ReceiveTimeoutSeconds is < 1 or > 90)
            errors.Add("Direct Line poll interval or receive timeout is out of range.");
        return errors.ToArray();
    }

    /// <summary>
    /// Exchanges the channel secret for a short-lived, conversation-scoped token and starts the
    /// conversation. The secret is never sent again after this exchange.
    /// </summary>
    public async Task StartConversationAsync(CancellationToken token)
    {
        _token = Read(await SendAsync(HttpMethod.Post, Combine("/v3/directline/tokens/generate"),
            options.Secret, new { user = new { id = userId } }, token), "token")
            ?? throw new HttpRequestException("Direct Line token exchange returned no token.");
        _conversationId = Read(await SendAsync(HttpMethod.Post, Combine("/v3/directline/conversations"), _token, null, token), "conversationId")
            ?? throw new HttpRequestException("Direct Line conversation start returned no conversation id.");
        _watermark = null;
    }

    /// <summary>
    /// Sends one user turn and returns the agent's reply text. Activities the agent sends back
    /// before its own message (typing indicators, traces) are ignored.
    /// </summary>
    public async Task<string> SendTurnAsync(string message, object payload, CancellationToken token)
    {
        if (_conversationId is null || _token is null) throw new InvalidOperationException("Direct Line conversation was not started.");
        using var sent = await SendAsync(HttpMethod.Post, Combine($"/v3/directline/conversations/{Uri.EscapeDataString(_conversationId)}/activities"),
            _token, new
            {
                type = "message",
                from = new { id = userId },
                text = message,
                // Copilot Studio surfaces activity.value to the agent, and the Agents SDK sample in
                // examples/copilot-studio reads the chaos callback from exactly this property.
                value = payload,
                channelData = new { chaosMonkey = payload }
            }, token);
        return await ReceiveAsync(token);
    }

    private async Task<string> ReceiveAsync(CancellationToken token)
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(options.ReceiveTimeoutSeconds);
        var replies = new List<string>();
        while (DateTimeOffset.UtcNow < deadline)
        {
            await Task.Delay(options.PollIntervalMs, token);
            var path = $"/v3/directline/conversations/{Uri.EscapeDataString(_conversationId!)}/activities" +
                (_watermark is null ? "" : $"?watermark={Uri.EscapeDataString(_watermark)}");
            using var document = await SendAsync(HttpMethod.Get, Combine(path), _token, null, token);
            if (document.RootElement.TryGetProperty("watermark", out var watermark) && watermark.ValueKind == JsonValueKind.String)
                _watermark = watermark.GetString();
            if (!document.RootElement.TryGetProperty("activities", out var activities) || activities.ValueKind != JsonValueKind.Array)
                continue;
            foreach (var activity in activities.EnumerateArray())
            {
                if (!activity.TryGetProperty("type", out var type) || type.GetString() != "message") continue;
                if (activity.TryGetProperty("from", out var from) && from.TryGetProperty("id", out var id) &&
                    id.ValueKind == JsonValueKind.String && id.GetString() == userId) continue;
                if (activity.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String &&
                    !string.IsNullOrWhiteSpace(text.GetString()))
                    replies.Add(text.GetString()!);
            }
            if (replies.Count > 0) return string.Join("\n", replies);
        }
        throw new OperationCanceledException("The agent did not send a message activity before the receive timeout.");
    }

    private Uri Combine(string path) => new(options.BaseUrl.TrimEnd('/') + path);

    private async Task<JsonDocument> SendAsync(HttpMethod method, Uri url, string? bearer, object? body, CancellationToken token)
    {
        using var client = clients.CreateClient(LabRunner.AgentClientName);
        using var request = new HttpRequestMessage(method, url);
        if (!string.IsNullOrEmpty(bearer)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        if (body is not null)
            request.Content = new StringContent(JsonSerializer.Serialize(body, Json), Encoding.UTF8, "application/json");
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);
        var content = await BoundarySession.ReadBoundedAsync(response.Content, token);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"Direct Line returned HTTP {(int)response.StatusCode}.");
        try { return JsonDocument.Parse(string.IsNullOrWhiteSpace(content) ? "{}" : content); }
        catch (JsonException) { throw new HttpRequestException("Direct Line returned a non-JSON response."); }
    }

    private static string? Read(JsonDocument document, string property)
    {
        using (document)
        {
            return document.RootElement.ValueKind == JsonValueKind.Object &&
                document.RootElement.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
                    ? value.GetString() : null;
        }
    }
}
