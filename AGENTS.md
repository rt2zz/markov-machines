# AGENTS.md

Guidelines for AI agents working in this repository.

## Package Manager

**Always use `bun` - never use npm, yarn, or pnpm.**

- `bun install` for dependencies
- `bun test` for tests
- `bun run <script>` for scripts
- `bun add <package>` to add dependencies
- `bun add -d <package>` for dev dependencies

## Monorepo Structure

This is a Bun workspace monorepo. Packages are in `packages/`:

- `markov-machines` - Framework
- `todo` - Reference implementation
