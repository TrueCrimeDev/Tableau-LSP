# Design Document

## Overview

This design implements web-based OAuth authentication for Visual Studio Code Extension (vsce) publishing, replacing the current personal access token (PAT) workflow. The solution will integrate with the existing vsce CLI tool to provide a seamless browser-based authentication experience.

## Architecture

### Authentication Flow
```
Developer runs `vsce publish`
    ↓
Check for valid stored credentials
    ↓
If invalid/missing → Launch web authentication
    ↓
Open browser to VS Code Marketplace OAuth endpoint
    ↓
User completes authentication in browser
    ↓
Receive OAuth token via callback
    ↓
Store credentials securely
    ↓
Continue with publishing process
```

### Components Overview
- **Authentication Manager**: Handles OAuth flow and credential storage
- **Browser Launcher**: Opens authentication URL in default browser
- **Callback Server**: Local HTTP server to receive OAuth callback
- **Credential Store**: Secure storage for authentication tokens
- **CLI Integration**: Integrates with existing vsce publish workflow

## Components and Interfaces

### 1. Authentication Manager
```typescript
interface AuthenticationManager {
    authenticate(): Promise<AuthToken>;
    isAuthenticated(): Promise<boolean>;
    getStoredToken(): Promise<AuthToken | null>;
    clearCredentials(): Promise<void>;
}

interface AuthToken {
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
    scope: string[];
}
```

### 2. Browser Launcher
```typescript
interface BrowserLauncher {
    openAuthUrl(authUrl: string): Promise<void>;
    isDefaultBrowserAvailable(): boolean;
    getFallbackInstructions(): string;
}
```

### 3. Callback Server
```typescript
interface CallbackServer {
    start(port?: number): Promise<number>;
    waitForCallback(timeoutMs: number): Promise<AuthorizationCode>;
    stop(): Promise<void>;
}

interface AuthorizationCode {
    code: string;
    state: string;
}
```

### 4. Credential Store
```typescript
interface CredentialStore {
    store(token: AuthToken): Promise<void>;
    retrieve(): Promise<AuthToken | null>;
    clear(): Promise<void>;
    isValid(token: AuthToken): boolean;
}
```

## Data Models

### OAuth Configuration
```typescript
interface OAuthConfig {
    clientId: string;
    clientSecret: string;
    authUrl: string;
    tokenUrl: string;
    redirectUri: string;
    scopes: string[];
}
```

### Authentication State
```typescript
interface AuthState {
    isAuthenticated: boolean;
    token?: AuthToken;
    lastAuthTime?: Date;
    expiresAt?: Date;
}
```

## Error Handling

### Error Types
1. **Network Errors**: Handle offline scenarios and API failures
2. **Browser Errors**: Handle cases where browser cannot be opened
3. **Timeout Errors**: Handle authentication timeout scenarios
4. **Token Errors**: Handle invalid or expired tokens
5. **Permission Errors**: Handle insufficient marketplace permissions

### Error Recovery Strategies
- **Retry Logic**: Automatic retry for transient network errors
- **Fallback Methods**: Manual token entry if browser auth fails
- **Clear Instructions**: Detailed error messages with resolution steps
- **Graceful Degradation**: Fall back to PAT method if OAuth fails

## Testing Strategy

### Unit Tests
- Authentication manager token validation
- Credential store encryption/decryption
- OAuth flow state management
- Error handling scenarios

### Integration Tests
- End-to-end authentication flow
- Browser launching across different platforms
- Callback server functionality
- Token refresh workflows

### Manual Testing
- Cross-platform browser compatibility
- Network connectivity scenarios
- User experience flow testing
- Error message clarity

## Security Considerations

### Token Security
- Store tokens using OS keychain/credential manager
- Encrypt tokens at rest
- Use secure HTTP for callback server (HTTPS with self-signed cert)
- Implement token rotation

### OAuth Security
- Use PKCE (Proof Key for Code Exchange) for additional security
- Validate state parameter to prevent CSRF attacks
- Use secure random state generation
- Implement proper scope validation

### Network Security
- Use HTTPS for all external communications
- Validate SSL certificates
- Implement timeout controls
- Sanitize callback parameters

## Implementation Notes

### Platform Considerations
- **Windows**: Use Windows Credential Manager for token storage
- **macOS**: Use Keychain Services for secure storage
- **Linux**: Use libsecret or gnome-keyring for credential storage

### Browser Compatibility
- Support default browser detection across platforms
- Handle cases where no browser is available
- Provide manual URL copying as fallback

### VS Code Marketplace Integration
- Research current OAuth endpoints and requirements
- Understand required scopes for publishing
- Implement proper error handling for marketplace-specific errors

### Backward Compatibility
- Maintain support for existing PAT workflow
- Allow users to choose authentication method
- Provide migration path from PAT to OAuth