# Tableau-LSP Agent Playbook

## Scope
- Central checklist for any automated or human assistant contributing to the Tableau Language Support (LSP) extension.
- Complements CLAUDE.md and GEMINI.md; keep all three files synchronized when guidance changes.

## Core Principles
- Follow the universal engineering rules in CLAUDE.md (Mandatory Research, Required Questions, Code Quality, and similar sections).
- Treat Tableau calculation support as the only target domain: .twbl files, Tableau syntax, and the data sources in the syntaxes folder.
- Default to candid risk assessment. Surface blockers, unknowns, and trade-offs instead of hiding them.

## Authoritative Assets
- syntaxes/functions.json: canonical function signatures, return types, documentation for hover and completion.
- syntaxes/twbl.tmLanguage.json: TextMate grammar powering syntax highlighting and semantic tokens.
- syntaxes/twbl.d.twbl: semantic token legend for level-of-detail expressions, window functions, and field types.
- docs/developer-guide.md: overview of architecture, extension activation, and debugging flows.

## Build and Validation Commands
- npm run build: bundles the client (src/extension.ts) and server (src/server.ts) through the build-base esbuild pipeline defined in package.json.
- npm run watch: incremental build for iterative development.
- npm run typecheck, npm run lint, npm run format:check: required before completion.
- Testing options:
  - npm run test:unit (Jest suite) and npm run test (VS Code integration harness).
  - npm run test:hover and npm run test:hover:compile for hover regression checks.
  - npm run test:edge:*, npm run test:performance:* for targeted suites as needed.
- esbuild1.mjs exists for legacy builds; do not default to it unless a legacy workflow explicitly requires it.

## Workflow Expectations
- Sequence every task: understand context -> review history -> clarify requirements -> plan concretely -> implement -> validate -> document.
- Keep pull requests atomic: one logical change per commit, Conventional Commit messages, no references to specific AI models.
- Prefer unknown in catch blocks, enforce explicit return types, and avoid introducing any.
- When touching hover, completion, or semantic token logic, reference the dependency files above and keep them the single source of truth.

## Communication Norms
- Explain reasoning in 300 words or fewer unless the user asks for a deep dive.
- Use fenced code blocks (ts, json, xml) for snippets; prefer patch blocks for diffs when providing fixes.
- Call out validation steps taken and any remaining gaps before handing off work.
- Flag any inconsistencies between this playbook and model-specific files so all prompts stay aligned.

Remember: write and document code so the next maintainer can follow it under pressure.
