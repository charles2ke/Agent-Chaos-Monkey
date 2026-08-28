#!/usr/bin/env bash

set -euo pipefail

OWNER=${OWNER:-charles2ke}

# Format: repository|space-separated topics
TOPIC_MAPPING=$(cat <<'EOF'
Agent-Chaos-Monkey|chaos-engineering ai-agents llm resilience-testing evals dotnet react copilot-studio
Message-Flow|chain-of-responsibility design-patterns dotnet csharp java middleware pipeline
design-patterns|design-patterns typescript software-architecture learning
tax-break|tax-calculator fintech typescript
Portfolio-Watcher|portfolio-tracker finance investing typescript
Night-Sky|astronomy stargazing generative-art javascript
OpenTrading|trading stock-market fintech javascript
GraphQL|graphql microservices api javascript
Nakshatra|ecommerce online-shopping csharp dotnet
basa|elder-care dashboard healthcare html
travel|travel html static-site
workout|fitness workout-tracker javascript
charles2ke|profile-readme
EOF
)

usage() {
  printf 'Usage: %s [--dry-run] [repository]\n' "$0"
}

dry_run=false
selected_repo=

for argument in "$@"; do
  case "$argument" in
    --dry-run)
      dry_run=true
      ;;
    -*)
      printf 'Unknown option: %s\n' "$argument" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [ -n "$selected_repo" ]; then
        printf 'Only one repository may be specified.\n' >&2
        usage >&2
        exit 2
      fi
      selected_repo=$argument
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  printf 'Error: GitHub CLI (gh) is required but was not found.\n' >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  printf 'Error: GitHub CLI is not authenticated. Run "gh auth login" first.\n' >&2
  exit 1
fi

failures=0
matched=false

while IFS='|' read -r repo topics; do
  if [ -n "$selected_repo" ] && [ "$repo" != "$selected_repo" ]; then
    continue
  fi

  matched=true
  normalised_topics=
  set -- gh api --method PUT "/repos/$OWNER/$repo/topics"

  for raw_topic in $topics; do
    topic=$(printf '%s' "$raw_topic" | tr '[:upper:]' '[:lower:]')
    if [ "${#topic}" -gt 35 ]; then
      printf 'FAIL %s/%s: topic exceeds 35 characters: %s\n' "$OWNER" "$repo" "$topic" >&2
      failures=1
      continue 2
    fi
    case "$topic" in
      ''|*[!a-z0-9-]*)
        printf 'FAIL %s/%s: invalid topic: %s\n' "$OWNER" "$repo" "$topic" >&2
        failures=1
        continue 2
        ;;
    esac

    normalised_topics="${normalised_topics}${normalised_topics:+ }${topic}"
    set -- "$@" -f "names[]=$topic"
  done

  if [ "$dry_run" = true ]; then
    printf 'DRY RUN %s/%s: %s\n' "$OWNER" "$repo" "$normalised_topics"
  elif "$@" >/dev/null; then
    printf 'OK %s/%s\n' "$OWNER" "$repo"
  else
    printf 'FAIL %s/%s\n' "$OWNER" "$repo" >&2
    failures=1
  fi
done <<EOF
$TOPIC_MAPPING
EOF

if [ "$matched" = false ]; then
  printf 'Error: repository not found in topic mapping: %s\n' "$selected_repo" >&2
  exit 1
fi

exit "$failures"
