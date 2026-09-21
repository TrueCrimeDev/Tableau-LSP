# Chat validation — September 21, 2026

Automated checks pass. Live `@tableau` requests reach the participant and identify the selected workbook, but both tested model providers fail before returning a response. The same failures occur in ordinary VS Code Chat without `@tableau`.

## Tested versions

- Source baseline: `1cd9a32`, with the regression tests and model-error wording change accompanying this report.
- Installed extension: the published **1.14.0** VSIX, tested in **VS Code 1.138.0** on Windows.
- VSIX SHA-256: `ce6087ceea336cd1185b7e2779437c66f336d43d1df459a30ef36c32a756c997`.
- Workbook: the synthetic Retail Demo; no Tableau installation or account was needed for these checks.

## Results

| Check | Result |
| --- | --- |
| Chat-related unit tests | **291 passed across 16 suites**, zero failures or skips. |
| Expanded participant flow suite | **16 passed**, including 11 new cases; included in the 291 total. |
| Final participant/error regression check | **58 passed across two suites** after the wording fix; repeated checks, not additional unique tests. |
| TypeScript check | Passed. |
| Published VSIX extension-host checks | **42 passed**, exit code 0, using the released artifact without rebuilding it. |
| Live registration | `@tableau`, its six slash commands, and five tools appear in VS Code Chat completion. |
| Live workbook selection | `/fields` displays the Retail Demo workbook as its source. |
| OpenAI: GPT 5.6 Sol | Provider returned a failed-response error without further details. A plain “Reply with exactly READY” control request failed the same way. |
| OpenRouter: Google Gemini 3.1 Pro Preview Custom Tools | Provider returned “User not found.” The ordinary Chat control request failed the same way. |

## What the automated checks establish

The tests cover all six slash-command routes, conversation history, project guidance, workbook selection, tool-call/result correlation, XML edits, approval rejection, cancellation, and save-only exports. The new flow cases exercise the actual participant handler with a scripted model.

The installed-VSIX checks exercise registered read tools through `vscode.lm.invokeTool`. Mutation and export checks invoke the packaged tool classes directly inside the extension host, including their preparation step. They verify real saved files, complete backups, preserved TWBX binary data, and rejection of malformed or stale edits.

## Remaining live verification

The unit tests simulate model responses and approval UI. Installed-VSIX mutation tests do not exercise the native chat approval dialog. No live model response, chat-driven edit, calculation creation, or export completed during this session. Tableau rendering remains untested.

The control requests establish that the observed provider failures also occur outside this extension; they do not establish the exact account or service-side cause. Restore access to a model in VS Code Chat, confirm that a plain request succeeds, then repeat `/fields`, calculation creation, XML-edit approval/rejection, and save-only export against a disposable workbook. The original model selection was restored after testing.

The accompanying source change replaces the missing-model message's Copilot-subscription requirement with provider-neutral setup guidance. This wording change is for a future build; it does not alter the published 1.14.0 VSIX or repair provider access.
