# Design Document

## Overview

This design implements web-based authentication for Visual Studio Code Extension (vsce) publishing, replacing the current Personal Access Token (PAT) approach with a more user-friendly browser-based OAuth flow. The solution will leverage the latest vsce features and provide fallback options for different authentication scenarios.

## Architecture

### Authentication Flow Architecture
```
User runs publish command
    ↓
Check for existing valid credentials
    ↓
If invalid/missing → Initiate web authentication
    ↓
Open browser → Azure/Microsoft OAuth
    ↓
User authenticates → Receive token
    ↓
Store credentials securely
    ↓
Continue with publishing process
```

### Component Structure
- **Authentication Manager**: Handles credential storage and validation
- **Web Auth Provider**: Manages browser-based OAuth flow
- **Credential Store**: Secure local storage for tokens
- **Fallback Handler**: Alternative authentication methods
- **Publishing Wrapper**: Integrates authentication with vsce publish

## Components and Interfaces

### 1. Authentication Manager
```typescript
interface AuthenticationManager {
    authenticate(): Promise<AuthResult>
    isAuthenticated(): Promise<boolean>
    clearCredentials(): Promise<void>
    getStoredCredentials(): Promise<Credentials | null>
}
```

### 2. Web Authentication Provider
```typescript
interface WebAuthProvider {
    initiateWebAuth(): Promise<AuthToken>
    openBrowser(authUrl: string): Promise<void>
    waitForCallback(): Promise<AuthToken>
    validateToken(token: AuthToken): Promise<boolean>
}
```

### 3. Credential Storage
```typescript
interface CredentialStore {
    store(credentials: Credentials): Promise<void>
    retrieve(): Promise<Credentials | null>
    clear(): Promise<void>
    isValid(credentials: Credentials): Promise<boolean>
}
```

## Data Models

### Authentication Result
```typescript
interface AuthResult {
    success: boolean
    token?: string
    error?: string
    requiresReauth?: boolean
}
```

### Credentials
```typescript
interface Credentials {
    accessToken: string
    refreshToken?: string
    expiresAt: Date
    publisher: string
    authMethod: 'web' | 'pat' | 'azure'
}
```

### Configuration
```typescript
interface AuthConfig {
    publisher: string
    useWebAuth: boolean
    fallbackToPAT: boolean
    browserTimeout: number
    credentialStorePath: string
}
```

## Implementation Strategy

### Phase 1: Azure CLI Integration
- Install and configure Azure CLI
- Use `az login` for initial authentication
- Leverage Azure CLI credentials for vsce publishing
- Command: `az login` followed by `vsce publish --azure-credential`

### Phase 2: Direct Web Authentication
- Implement custom OAuth flow
- Create local callback server
- Open browser to Microsoft authentication
- Handle OAuth callback and token exchange

### Phase 3: Credential Management
- Secure token storage using OS keychain
- Token refresh mechanism
- Automatic re-authentication on expiry
- Clear credentials command

## Error Handling

### Authentication Failures
- **Browser fails to open**: Provide manual URL and instructions
- **OAuth callback timeout**: Retry mechanism with extended timeout
- **Token validation fails**: Clear stored credentials and retry
- **Network issues**: Offline mode with cached credentials

### Fallback Mechanisms
1. **Azure CLI**: If available, use `az login` + `--azure-credential`
2. **Personal Access Token**: Fall back to traditional PAT method
3. **Manual URL**: Provide authentication URL for manual browser opening
4. **Environment Variables**: Support VSCE_PAT environment variable

## Testing Strategy

### Unit Tests
- Authentication manager functionality
- Credential storage and retrieval
- Token validation logic
- Error handling scenarios

### Integration Tests
- End-to-end authentication flow
- Browser automation testing
- Credential persistence across sessions
- Publishing workflow integration

### Manual Testing
- Different browser configurations
- Network connectivity scenarios
- Multiple publisher accounts
- Cross-platform compatibility (Windows, macOS, Linux)

## Security Considerations

### Token Security
- Store tokens in OS-specific secure storage (Windows Credential Manager, macOS Keychain, Linux Secret Service)
- Encrypt tokens at rest
- Automatic token expiration handling
- Secure token transmission

### Browser Security
- Use HTTPS for all authentication URLs
- Validate callback URLs to prevent CSRF
- Implement state parameter for OAuth flow
- Timeout mechanisms for abandoned sessions

## Platform-Specific Implementation

### Windows
- Use Windows Credential Manager for token storage
- PowerShell integration for Azure CLI
- Handle Windows Defender/antivirus browser blocking

### macOS
- Use macOS Keychain for secure storage
- Handle Safari/Chrome browser preferences
- Integrate with macOS security prompts

### Linux
- Use Secret Service API for credential storage
- Handle various desktop environments
- Support headless server environments

## Configuration Options

### User Configuration
```json
{
  "vsce": {
    "authMethod": "web",
    "publisher": "TrueCrimeAudit",
    "browserTimeout": 120,
    "fallbackToPAT": true,
    "autoRefreshTokens": true
  }
}
```

### Environment Variables
- `VSCE_AUTH_METHOD`: Override authentication method
- `VSCE_BROWSER_TIMEOUT`: Set browser timeout
- `VSCE_PUBLISHER`: Set default publisher
- `VSCE_PAT`: Fallback personal access token

## Migration Strategy

### From PAT to Web Auth
1. Detect existing PAT configuration
2. Offer migration to web authentication
3. Preserve PAT as fallback option
4. Gradual deprecation of PAT usage

### Backward Compatibility
- Support existing PAT workflows
- Maintain current command-line interface
- Provide opt-in web authentication
- Clear migration documentation