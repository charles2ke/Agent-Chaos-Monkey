using Azure.Core;
using Azure.Identity;

namespace ChaosMonkey.Api.Evaluation;

/// <summary>
/// Supplies an Entra ID access token for the Azure OpenAI / AI Foundry judge. It exists so the
/// evaluator never needs a raw API key, and so tests can substitute a token without a credential.
/// </summary>
public interface IEvaluatorCredential
{
    ValueTask<string> GetTokenAsync(string scope, CancellationToken cancellationToken);
}

/// <summary>
/// Uses <see cref="DefaultAzureCredential"/>, so the same code works with a developer sign-in,
/// a workload identity in Container Apps, or a managed identity, without storing secrets.
/// </summary>
public sealed class EntraIdEvaluatorCredential : IEvaluatorCredential
{
    private readonly TokenCredential _credential;

    public EntraIdEvaluatorCredential() : this(new DefaultAzureCredential()) { }

    public EntraIdEvaluatorCredential(TokenCredential credential) => _credential = credential;

    public async ValueTask<string> GetTokenAsync(string scope, CancellationToken cancellationToken)
    {
        var token = await _credential
            .GetTokenAsync(new TokenRequestContext([scope]), cancellationToken)
            .ConfigureAwait(false);
        return token.Token;
    }
}
