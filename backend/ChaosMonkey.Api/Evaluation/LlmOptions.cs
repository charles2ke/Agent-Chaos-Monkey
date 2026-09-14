namespace ChaosMonkey.Api.Evaluation;

/// <summary>
/// Configuration for the LLM used to judge agent resilience. Any OpenAI-compatible or
/// Anthropic-compatible endpoint can be plugged in, so the model is fully configurable.
/// Azure OpenAI / AI Foundry is a first-class provider and authenticates with Entra ID only.
/// </summary>
public sealed class LlmOptions
{
    public const string SectionName = "Llm";

    /// <summary>The Entra ID scope used for Azure OpenAI / AI Foundry data-plane calls.</summary>
    public const string AzureScope = "https://cognitiveservices.azure.com/.default";

    /// <summary>"anthropic", "openai", or "azure" for Azure OpenAI / AI Foundry with Entra ID.</summary>
    public string Provider { get; set; } = "anthropic";

    public string Model { get; set; } = "claude-opus-4-1-20250805";

    /// <summary>Azure OpenAI deployment name. Falls back to <see cref="Model"/> when unset.</summary>
    public string? Deployment { get; set; }

    /// <summary>Azure OpenAI data-plane API version.</summary>
    public string ApiVersion { get; set; } = "2024-10-21";

    /// <summary>Ignored by the Azure provider, which always uses Entra ID instead of a key.</summary>
    public string? ApiKey { get; set; }

    /// <summary>
    /// Optional base URL override, e.g. http://localhost:11434/v1 for a local model. Required for
    /// the Azure provider, e.g. https://my-resource.openai.azure.com.
    /// </summary>
    public string? BaseUrl { get; set; }

    public int MaxTokens { get; set; } = 1500;

    public int TimeoutSeconds { get; set; } = 90;

    public bool IsAnthropic => string.Equals(Provider, "anthropic", StringComparison.OrdinalIgnoreCase);

    public bool IsAzure => string.Equals(Provider, "azure", StringComparison.OrdinalIgnoreCase);

    /// <summary>The Azure deployment name, or the model name for every other provider.</summary>
    public string DeploymentOrModel => string.IsNullOrWhiteSpace(Deployment) ? Model : Deployment;

    public bool IsConfigured => IsAzure
        ? IsAzureEndpoint(BaseUrl) && IsDeploymentName(DeploymentOrModel)
        : !string.IsNullOrWhiteSpace(Model) &&
          (!string.IsNullOrWhiteSpace(ApiKey) || !string.IsNullOrWhiteSpace(BaseUrl));

    /// <summary>A deployment name is placed in the request path, so only safe characters are allowed.</summary>
    public static bool IsDeploymentName(string? value) => !string.IsNullOrWhiteSpace(value) &&
        value.Length <= 100 && value.All(c => char.IsLetterOrDigit(c) || c is '-' or '_' or '.');

    /// <summary>The Azure endpoint must be an absolute HTTPS URL without credentials, query or fragment.</summary>
    public static bool IsAzureEndpoint(string? value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps &&
        string.IsNullOrEmpty(uri.UserInfo) && string.IsNullOrEmpty(uri.Query) && string.IsNullOrEmpty(uri.Fragment);

    public Uri ResolveEndpoint(string? deploymentOrModel = null)
    {
        if (IsAzure)
        {
            var deployment = string.IsNullOrWhiteSpace(deploymentOrModel) ? DeploymentOrModel : deploymentOrModel.Trim();
            if (!IsAzureEndpoint(BaseUrl) || !IsDeploymentName(deployment))
            {
                throw new InvalidOperationException(
                    "The Azure provider requires an HTTPS Llm:BaseUrl and a simple Llm:Deployment name.");
            }

            var version = string.IsNullOrWhiteSpace(ApiVersion) ? "2024-10-21" : ApiVersion.Trim();
            return new Uri($"{BaseUrl!.TrimEnd('/')}/openai/deployments/{Uri.EscapeDataString(deployment)}" +
                           $"/chat/completions?api-version={Uri.EscapeDataString(version)}");
        }

        var baseUrl = string.IsNullOrWhiteSpace(BaseUrl)
            ? (IsAnthropic ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1")
            : BaseUrl.TrimEnd('/');

        var path = IsAnthropic ? "/messages" : "/chat/completions";
        return new Uri(baseUrl.TrimEnd('/') + path);
    }
}
