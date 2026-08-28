# Repository topic scripts

`set-topics.sh` applies the curated GitHub topic mapping to all 13 repositories
owned by `charles2ke`. It can also target one repository, and it is safe to
re-run because each invocation replaces that repository's topic set.

## Prerequisites

- Install the [GitHub CLI](https://cli.github.com/).
- Authenticate `gh` with a token that has the `public_repo` scope:

  ```sh
  gh auth login
  gh auth status
  ```

## Usage

Run commands from the repository root. Previewing the changes first is the
safer option:

```sh
./scripts/set-topics.sh --dry-run
```

Apply topics to every mapped repository:

```sh
./scripts/set-topics.sh
```

Preview or apply topics to one repository by passing its case-sensitive name:

```sh
./scripts/set-topics.sh --dry-run Agent-Chaos-Monkey
./scripts/set-topics.sh Agent-Chaos-Monkey
```

The owner defaults to `charles2ke`. Override it with the `OWNER` environment
variable:

```sh
OWNER=another-owner ./scripts/set-topics.sh --dry-run
```

The script checks that `gh` is installed and authenticated even in dry-run
mode, but dry-run mode does not make any GitHub API requests.

Topics can alternatively be set manually from each repository's **About**
section by selecting the gear icon.
