# Chat Workbook Proximity Resolution — Design

**Date:** 2026-08-02
**Status:** Approved (user-approved in session; tiered file→root→workbench scoping, applied to both open tabs and disk search)

## Summary

`resolveWorkbookUri()` (`src/chat/activeWorkbook.ts`) decides which workbook's
fields the `@tableau` chat participant and its language-model tools
(`tableau_listFields`, `tableau_addCalculation`) use. It currently only
recognizes a workbook that is itself the active editor/tab; whenever a `.twbl`
calculation file is active instead, or more than one workbook is a candidate,
it falls back to a single whole-workspace search and gives up on ambiguity —
never using the active file's location as a signal. It also has zero test
coverage.

This adds proximity-based tie-breaking — same directory, then same workspace
root, then the whole workbench — so an open calculation file's location
disambiguates which workbook it belongs to, and adds a test suite covering
both the existing contract and the new behavior.

## Current behavior (unchanged fast paths)

1. Active editor is a `.twb`/`.twbx` → return it.
2. Active tab of the active group is one → return it.

Below that is what changes.

## New behavior

Introduce `activeResource` — whatever is actually focused right now, workbook
or not (active editor's document URI, else the active tab's URI). This is
`undefined` when nothing is focused (e.g. invoked via command palette with no
editor open), in which case behavior is unchanged from today.

**Open-tab candidates** (existing `candidates` map of every open workbook tab):

- 0 candidates → fall through to disk search.
- 1 candidate → return it (unchanged).
- 2+ candidates → `pickByProximity(candidates, activeResource)`:
  - Filter to candidates in the same directory as `activeResource`; if
    exactly one, return it.
  - Else filter to candidates in the same `vscode.workspace.getWorkspaceFolder`
    root as `activeResource`; if exactly one, return it.
  - Else `undefined` (still ambiguous — unchanged final behavior, just reached
    by a narrower path).

**Disk search** (only reached when zero workbook tabs are open) —
`resolveFromDisk(activeResource)`, three staged `findFiles` queries, each
capped at 2 results (only "exactly one" matters):

1. Same directory as `activeResource` (non-recursive `*.{twb,twbx}` via
   `RelativePattern`) — if exactly one, return it.
2. `activeResource`'s workspace folder, if any (recursive `**/*.{twb,twbx}`
   scoped to that `WorkspaceFolder`) — if exactly one, return it.
3. Whole workbench (today's query, unchanged) — if exactly one, return it,
   else `undefined`.

If `activeResource` is `undefined` or has no workspace folder, stages 1/2 are
skipped as applicable and resolution falls straight to stage 3 — identical to
today's behavior.

`resolveWritableWorkbookUri()` is unchanged; it wraps `resolveWorkbookUri()`.

## Why this shape

- Matches the three scopes named for this feature — active file, folder path,
  workbench — as three concrete, testable tiers rather than one blended
  heuristic.
- Precision before recall: a same-directory match wins even if a wider search
  would also have found a second, unrelated workbook elsewhere.
- Open tabs stay a stronger signal than on-disk files: an ambiguous set of
  *open* workbook tabs does not fall through to a disk search after proximity
  fails to break the tie — matches today's existing priority (open beats
  merely-present-on-disk).
- Single-file-per-`RelativePattern` queries reuse the same `findFiles` +
  `RelativePattern` pattern already used by
  `workbookFieldContextManager.ts`/`tableauLibrary.ts` for declaration
  discovery — no new dependency or discovery mechanism.
- `tableauChatParticipant.ts` and `tableauTools.ts` both call
  `resolveWorkbookUri()`/`resolveWritableWorkbookUri()` already, so both the
  participant and the tools inherit the fix with no changes of their own.

## Scope

One file changed: `src/chat/activeWorkbook.ts` (adds `pickByProximity` and
`resolveFromDisk` helpers; `resolveWorkbookUri` calls them in place of the
current single candidate-map check and single `findFiles` call).

Out of scope: `NO_WORKBOOK_MESSAGE` wording, ancestor-directory walking above
the workspace-root tier, and any change to how the participant/tools read
the resolved workbook once found.

## Testing

New `src/tests/unit/activeWorkbook.test.ts`, mocking `vscode.window` /
`vscode.workspace` the same way `workbookFieldContextManager.test.ts` already
does (`activeTextEditor`, `tabGroups`, `findFiles`, `getWorkspaceFolder`).

**Baseline contract** (regression coverage for existing behavior, currently
untested):
- Active editor is the workbook → returned directly.
- Active tab (not the editor) is the workbook → returned directly.
- Exactly one open workbook tab, not active → returned.
- Zero open tabs, exactly one workbook on disk → returned.
- Zero open tabs, zero workbooks on disk → `undefined`.
- `resolveWritableWorkbookUri` rejects `.twbx` and non-`file`-scheme URIs.

**New proximity behavior:**
- 2 open workbook tabs; active resource (a `.twbl`) shares a directory with
  one of them → that one is returned.
- 2 open workbook tabs; active resource shares only a workspace root with one
  of them → that one is returned.
- 2 open workbook tabs; active resource resolves neither tier → `undefined`.
- Zero open tabs; disk search resolved at the same-directory tier (verify the
  workspace-wide query is never reached).
- Zero open tabs; same-directory tier ambiguous/empty, workspace-root tier
  resolves it.
- Zero open tabs; root tier ambiguous/empty, falls back to the existing
  whole-workbench query.
- No active resource at all (no editor, no tab) → goes straight to the
  whole-workbench query, matching today's behavior exactly.
