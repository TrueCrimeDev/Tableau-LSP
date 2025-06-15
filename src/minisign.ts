// This file is not needed for Tableau LSP
// Originally used for binary signature verification
// Kept as placeholder for future security features

export interface SignatureValidation {
    isValid: boolean;
    error?: string;
}

export function validateSignature(_data: string, _signature: string): SignatureValidation {
    // Tableau doesn't require signature validation
    return { isValid: true };
}