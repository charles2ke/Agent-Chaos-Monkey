# Blog

This folder holds long-form writing about Agent Chaos Monkey — the thinking behind the project, not just its feature list. It's meant to double as narrative documentation inside the repo and as source material for posts published elsewhere (Dev.to, Hashnode, a personal blog, etc.).

Each post is a self-contained Markdown file with a small front-matter block (title, description, tags, canonical URL placeholder) so it can be copied into an external platform with minimal editing.

## Posts

- [**The Failure Mode Nobody Tests For: Agents That Lie About Success**](./agent-chaos-testing.md) — why agents that fabricate success after a tool call fails are the most dangerous and least-tested failure mode in agentic systems, and how chaos-engineering ideas apply to the agent/tool boundary.

## Publishing notes

Checklist for the author when a post is ready to go out:

- [ ] Fill in the real `canonical_url` in the post's front matter once it has a permanent home (e.g. the Dev.to or Hashnode URL, or a personal blog URL), then update the canonical URL on every mirror.
- [ ] Cross-post to [Dev.to](https://dev.to)
- [ ] Cross-post to [Hashnode](https://hashnode.com)
- [ ] Submit to [Hacker News](https://news.ycombinator.com) ("Show HN" if appropriate)
- [ ] Share in [r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA/)
- [ ] Share in [r/MachineLearning](https://www.reddit.com/r/MachineLearning/)
- [ ] Share in relevant LLM/agent-building Discord communities

This list is a checklist for the human doing the publishing — it is not part of the post body itself.
