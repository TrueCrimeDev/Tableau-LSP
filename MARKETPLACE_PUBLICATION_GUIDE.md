# VS Code Marketplace Publication Guide

This guide will help you publish the Tableau Language Support extension to the VS Code Marketplace.

## Prerequisites

1. **Microsoft Account**: You need a Microsoft account (personal or work)
2. **Azure DevOps Account**: Sign up at https://dev.azure.com
3. **Publisher Account**: Create a publisher account on the marketplace

## Step 1: Create a Publisher Account

1. Go to https://marketplace.visualstudio.com/manage
2. Sign in with your Microsoft account
3. Click "Create publisher"
4. Fill in the required information:
   - **Publisher ID**: Choose a unique identifier (e.g., "your-username")
   - **Display Name**: Your name or organization name
   - **Description**: Brief description of who you are

## Step 2: Update package.json

Before publishing, update the `package.json` file:

```json
{
  "publisher": "YOUR_PUBLISHER_ID",
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/tableau-language-support"
  },
  "homepage": "https://github.com/YOUR_USERNAME/tableau-language-support#readme",
  "bugs": {
    "url": "https://github.com/YOUR_USERNAME/tableau-language-support/issues"
  }
}
```

Replace:
- `YOUR_PUBLISHER_ID` with your actual publisher ID
- `YOUR_USERNAME` with your GitHub username

## Step 3: Create a Personal Access Token

1. Go to https://dev.azure.com
2. Click on your profile picture → "Personal access tokens"
3. Click "New Token"
4. Configure the token:
   - **Name**: "VS Code Extension Publishing"
   - **Organization**: Select your organization
   - **Expiration**: Choose appropriate duration
   - **Scopes**: Select "Marketplace" → "Manage"
5. Click "Create" and copy the token (save it securely!)

## Step 4: Install and Configure VSCE

```bash
# Install the VS Code Extension Manager globally
npm install -g @vscode/vsce

# Login with your publisher account
vsce login YOUR_PUBLISHER_ID
# Enter your Personal Access Token when prompted
```

## Step 5: Prepare for Publication

1. **Test the extension locally**:
   ```bash
   # Install dependencies
   npm install
   
   # Run tests
   npm run typecheck
   npm run build
   
   # Package the extension
   vsce package
   ```

2. **Verify the package**:
   - Install the generated `.vsix` file locally
   - Test all features work correctly
   - Check the README displays properly

## Step 6: Publish to Marketplace

```bash
# Publish the extension
vsce publish

# Or publish with a specific version
vsce publish 1.0.0

# Or publish a pre-release
vsce publish --pre-release
```

## Step 7: Verify Publication

1. Go to https://marketplace.visualstudio.com
2. Search for your extension
3. Verify all information is correct
4. Test installation from the marketplace

## Post-Publication Steps

### Update Extension

```bash
# Update version and publish
vsce publish patch  # 1.0.0 → 1.0.1
vsce publish minor  # 1.0.0 → 1.1.0
vsce publish major  # 1.0.0 → 2.0.0
```

### Monitor and Maintain

1. **Monitor downloads and ratings** on the marketplace
2. **Respond to user feedback** and issues
3. **Keep the extension updated** with bug fixes and new features
4. **Update documentation** as needed

## Troubleshooting

### Common Issues

1. **Publisher not found**: Make sure you've created a publisher account
2. **Token expired**: Generate a new Personal Access Token
3. **Package too large**: Check `.vscodeignore` to exclude unnecessary files
4. **Validation errors**: Run `vsce package` to check for issues

### Useful Commands

```bash
# Show extension info
vsce show YOUR_PUBLISHER_ID.tableau-language-support

# List all your extensions
vsce ls

# Unpublish an extension (use carefully!)
vsce unpublish YOUR_PUBLISHER_ID.tableau-language-support
```

## Best Practices

1. **Test thoroughly** before publishing
2. **Use semantic versioning** (major.minor.patch)
3. **Write clear release notes** in CHANGELOG.md
4. **Respond to user feedback** promptly
5. **Keep dependencies updated** and secure
6. **Monitor extension performance** and usage

## Resources

- [VS Code Extension Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Marketplace Publisher Portal](https://marketplace.visualstudio.com/manage)
- [VSCE Documentation](https://github.com/microsoft/vscode-vsce)

## Support

If you encounter issues during publication, you can:
1. Check the [VS Code Extension API documentation](https://code.visualstudio.com/api)
2. Ask questions on [Stack Overflow](https://stackoverflow.com/questions/tagged/visual-studio-code)
3. Report issues on the [VS Code GitHub repository](https://github.com/microsoft/vscode)
