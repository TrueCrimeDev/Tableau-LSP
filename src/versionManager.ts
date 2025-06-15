// This file is not needed for Tableau LSP
// Originally used for version management
// Kept as placeholder for future version management features

export interface Config {
    enabled: boolean;
    version?: string;
}

export function getConfig(): Config {
    // Tableau doesn't require version management
    return { enabled: false };
}

export function isEnabled(): boolean {
    return false;
}