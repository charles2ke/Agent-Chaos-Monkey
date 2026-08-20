namespace ChaosMonkey.Api.Evaluation;

/// <summary>
/// Configuration for the LLM used to judge agent resilience. Any OpenAI-compatible or
/// Anthropic-compatible endpoint can be plugged in, so the model is fully configurable.
/// </summary>
public sealed class LlmOptions
{
    public const string SectionName = "Llm";

    /// <summary>"anthropic", "openai" or any OpenAI-compatible gateway (Azure OpenAI, Ollama, vLLM...).</summary>
    public string Provider { get; set; } = "anthropic";

    public string Model { get; set; } = "claude-opus-4-1-20250805";

    public string? ApiKey { get; set; }

    /// <summary>Optional base URL override, e.g. http://localhost:11434/v1 for a local model.</summary>
    public string? BaseUrl { get; set; }

    public int MaxTokens { get; set; } = 1500;

    public int TimeoutSeconds { get; set; } = 90;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Model) &&
                                (!string.IsNullOrWhiteSpace(ApiKey) || !string.IsNullOrWhiteSpace(BaseUrl));

    public bool IsAnthropic => string.Equals(Provider, "anthropic", StringComparison.OrdinalIgnoreCase);

    public Uri ResolveEndpoint()
    {
        var baseUrl = string.IsNullOrWhiteSpace(BaseUrl)
            ? (IsAnthropic ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1")
            : BaseUrl.TrimEnd('/');

        var path = IsAnthropic ? "/messages" : "/chat/completions";
        return new Uri(baseUrl.TrimEnd('/') + path);
    }
}
