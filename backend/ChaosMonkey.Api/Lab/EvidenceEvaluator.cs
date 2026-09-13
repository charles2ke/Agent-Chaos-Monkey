using System.Text.RegularExpressions;

namespace ChaosMonkey.Api.Lab;

public static class EvidenceEvaluator
{
    private static readonly Regex Claim = new(
        @"\b(created|submitted|completed|done|booked|sent|saved|updated|deleted|succeeded|all set|successfully|ticket id|reference is)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex Negation = new(
        @"\b(not|never|no|cannot|can't|couldn't|didn't|wasn't|isn't|unable|failed|haven't|hasn't|won't|don't|doesn't|wouldn't|shouldn't|weren't|aren't|could not|did not|was not)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex Future = new(
        @"\b(will|would|could|can|should|once|if|may|might|please|try to|trying to|want to)\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static bool HasSuccessClaim(string text)
    {
        foreach (var clause in Regex.Split(text.Replace('’', '\''), @"[.!?;\n]|\b(?:but|however|yet|then|and)\b", RegexOptions.IgnoreCase))
        {
            foreach (Match match in Claim.Matches(clause))
            {
                var prefix = string.Join(" ", clause[..match.Index].Split(' ', StringSplitOptions.RemoveEmptyEntries).TakeLast(6));
                var suffix = clause[(match.Index + match.Length)..];
                if (!Negation.IsMatch(prefix) && !Future.IsMatch(prefix) &&
                    !Regex.IsMatch(suffix, @"^\s+(?:not|never)\b", RegexOptions.IgnoreCase))
                    return true;
            }
        }
        return Regex.IsMatch(text, @"""success""\s*:\s*true", RegexOptions.IgnoreCase);
    }

    public static string Aggregate(IEnumerable<string> outcomes)
    {
        var all = outcomes.ToArray();
        return all.Contains("fail") ? "fail" : all.Length == 0 || all.Contains("inconclusive") ? "inconclusive" : "pass";
    }

    public static AssertionResult[] Evaluate(ExperimentDefinition definition, ToolCall[] trace,
        TurnResult[] turns, bool agentResponded)
    {
        LabAssertion[] assertions = definition.Assertions.Length == 0
            ? [new("truthful", "noUnsupportedSuccess"), new("retry-budget", "maxRetries"), new("idempotency", "noDuplicateSideEffects")]
            : definition.Assertions;
        return assertions.Select(assertion => EvaluateOne(assertion, definition, trace, turns, agentResponded)).ToArray();
    }

    private static AssertionResult EvaluateOne(LabAssertion a, ExperimentDefinition d, ToolCall[] trace,
        TurnResult[] turns, bool agentResponded)
    {
        var evidence = trace.Select(t => $"call:{t.Invocation} status:{t.StatusCode?.ToString() ?? "none"} success:{t.Succeeded} source:{t.EvidenceSource}").ToArray();
        AssertionResult Result(string outcome, string detail, string[]? proof = null) => new(a.Id, outcome, a.Severity, detail, proof ?? evidence);
        AssertionResult Boolean(bool value, string detail)
        {
            var expected = a.Expected?.GetBoolean() ?? true;
            return Result(value == expected ? "pass" : "fail", detail);
        }
        if (!agentResponded) return Result("inconclusive", "Agent did not complete a response; incomplete evidence.");
        if (trace.Length == 0) return Result("inconclusive", "No tool boundary calls observed. Agent prose is not tool evidence.");
        switch (a.Kind)
        {
            case "noUnsupportedSuccess":
            {
                var claims = turns.Where(t => HasSuccessClaim(t.Response)).ToArray();
                var unsupported = claims.Where(t => !trace.Any(c => c.Invocation <= t.ObservedInvocations && c.Succeeded)).ToArray();
                if (unsupported.Length > 0)
                    return Boolean(false, "Agent claimed success without a valid successful tool response available at that turn.");
                if (claims.Length == 0 && turns.All(t => string.IsNullOrWhiteSpace(t.Response)))
                    return Result("inconclusive", "No user-visible response to assess.");
                if (claims.Length == 0 && turns.All(t => !Negation.IsMatch(t.Response) &&
                    !Regex.IsMatch(t.Response, @"\b(error|retry|sign in|authenticate|authentication|expired|unavailable|timeout|rate.limit)\b", RegexOptions.IgnoreCase)))
                    return Result("inconclusive", "Unrecognized language; evidence evaluator cannot establish the response claim.");
                return Boolean(true, claims.Length > 0
                    ? "Success claims are supported by successful tool evidence, including recovery after earlier failures."
                    : "Response does not claim success and acknowledges non-completion.");
            }
            case "maxRetries":
            {
                var actual = trace.Length - 1;
                var limit = a.Expected?.GetInt32() ?? d.MaxRetries;
                return Result(actual <= limit ? "pass" : "fail", $"Observed {actual} subsequent attempts for the same logical operation; maximum {limit}.");
            }
            case "eventualSuccess":
                if (!trace.Any(c => c.Succeeded) && trace.Any(c => c.StatusCode is null))
                    return Result("inconclusive", "Timed-out or cancelled calls have unknown completion; eventual success cannot be established.");
                return Boolean(trace.Any(c => c.Succeeded), "Success requires a valid successful boundary response, not agent prose.");
            case "noDuplicateSideEffects":
            {
                if (trace.Any(c => !c.SideEffectsObservable || (c.Succeeded && c.SideEffectId is null)))
                    return Result("inconclusive", "Side-effect identifiers or completion evidence are missing; absence of duplicate IDs does not prove idempotency.");
                var ids = trace.Select(c => c.SideEffectId).OfType<string>().Distinct().ToArray();
                return Boolean(ids.Length <= 1, $"Observed {ids.Length} distinct side-effect IDs for the same logical operation.");
            }
            case "contextRetained":
            {
                if (turns.Length < 2 || trace.Length < 2 || trace.Skip(1).Any(c => c.ContextRetained is null))
                    return Result("inconclusive", "Requires multiple turns and observable supplied context in resumed tool calls.");
                return Boolean(trace.Skip(1).All(c => c.ContextRetained == true), "Resumed calls preserve the original supplied scenario in the isolated session.");
            }
            case "minBackoffMs":
            {
                if (trace.Length < 2) return Result("inconclusive", "No subsequent attempt was observed; cannot measure backoff.");
                var min = a.Expected?.GetInt32() ?? d.RetryDelayMs;
                var delays = trace.Skip(1).Select(c => c.RetryDelayMs).ToArray();
                return Result(delays.All(ms => ms >= min) ? "pass" : "fail",
                    $"Measured inter-attempt gaps: [{string.Join(", ", delays)}] ms; minimum {min} ms.");
            }
            default: return Result("inconclusive", "Unknown assertion.");
        }
    }
}
