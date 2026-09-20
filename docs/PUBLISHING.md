# Publishing Tableau Language Support

The canonical release path is `.github/workflows/publish.yml`. The legacy Azure pipeline is manual packaging only; it has no automatic trigger and never publishes to the Marketplace.

## GitHub release workflow

Configure the repository secret `VSCE_PAT` with a Marketplace token authorized for the `TrueCrimeAudit` publisher and **Marketplace (Publish)** scope.

1. Review the changes, update `CHANGELOG.md` and the manifest version, and commit the exact release source. Push the reviewed commit.
2. Create and push a tag matching the manifest version. For example, from PowerShell:

   ```powershell
   $releaseVersion = node -p "require('./package.json').version"
   git tag "v$releaseVersion"
   git push origin "v$releaseVersion"
   ```

3. Follow **Publish VS Code Extension** in GitHub Actions. Its reusable test workflow runs type checking, release safeguards, deterministic tests, unit tests, and real workbook extension-host tests on Linux, Windows, and macOS. Packaging starts only after all three pass. A fresh host then installs and exercises the production VSIX.
4. The publish job downloads `tested-vsix-<commit>` from that same workflow run. It checks the recorded SHA256, source commit, extension identity/version, installed-package test evidence, and release tag before publishing those exact bytes. It does not rebuild the package.
5. Confirm the public Marketplace version. The publish helper checks automatically after a successful publish invocation; a later independent check is:

   ```sh
   npm run release:verify
   ```

To start the same gated workflow manually, select **Run workflow** in GitHub Actions or use:

```sh
gh workflow run "Publish VS Code Extension" --ref main
```

Dispatching a branch tests and publishes that branch's exact selected commit/version. Dispatching a version tag also requires the tag to match the packaged version. The workflow serializes Marketplace publication attempts.

## Local verification and manual publishing

Prefer the GitHub workflow for cross-platform evidence. A local package is not an uploaded GitHub release or a Marketplace publication. Use a clean, committed checkout; release provenance creation and publishing reject uncommitted tracked or untracked files.

```sh
npm ci
npm run typecheck
npm run test:release
npm run test:deterministic
npm run test:unit -- --runInBand
npm run test:workbook-host
```

Create the ignored `release-artifacts` directory, then package and test:

```sh
npm run package -- --out release-artifacts/tableau-language-support.vsix
npm run test:vsix -- release-artifacts/tableau-language-support.vsix
npm run release:manifest -- release-artifacts/tableau-language-support.vsix
```

On Linux without a display, prefix the two host-test commands with `xvfb-run -a`. The installed-package report binds its result to the exact VSIX checksum; the manifest command writes `release-artifacts/release.json` beside that file. Renaming or changing the VSIX afterward invalidates that manifest.

Only when manual publication is intended, provide `VSCE_PAT` in the current process environment and run:

```sh
npm run publish -- release-artifacts/tableau-language-support.vsix
```

The helper requires the adjacent `release.json` and verifies the current clean checkout against it. It does not infer the newest file or silently package another build. A local publication does not establish that the GitHub three-platform matrix passed.

## Confirm each release destination

- A packaged VSIX is a local installable file.
- A GitHub Actions artifact is downloadable test output. Creating a GitHub Release and attaching a VSIX is a separate action.
- A successful Marketplace write still needs public-version confirmation. The public listing and installed extension version are separate checks.

`release:verify` defaults to the identity and version in the current manifest. To verify a specific version explicitly:

```sh
npm run release:verify -- TrueCrimeAudit.tableau-language-support 1.14.0
```

## Failed or throttled publication

The helper invokes publishing once and does not use `--skip-duplicate`. A duplicate-version response is a failure; verify the public version before deciding what to do next.

For HTTP 429 or VSID Concurrency throttling, stop. Honor `Retry-After` when supplied, or wait for the service cooldown before a deliberate manual retry. Do not create an automatic retry loop.

Public-version checks use bounded backoff only when successful responses still show an older version. HTTP 429 or another HTTP failure stops immediately. If publishing succeeds but the public version has not appeared, run `npm run release:verify` later; do not republish simply to refresh the listing.
