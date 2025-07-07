// Assuming you have a 'common.ts' file for these, otherwise define them as needed.
// For this example, we'll stub them if they don't exist.
const rootDir = '.';
function getWorkspaceFile(path: string): Promise<{ text: string } | undefined> { return Promise.resolve(undefined); }
function readLocaleFile(path: string): string | undefined { return undefined; }


// --- Core Localization Logic (Language Agnostic) ---

let loadedCollection: Record<string, string> = {};

/**
 * Initializes the localizer by loading the appropriate NLS (National Language Support) JSON file.
 * This should be called once when your extension/application starts.
 */
export function initLocalize(): Promise<void> {
    const path = `${rootDir}/package.nls.<>.json`;
    
    // This logic correctly handles both browser and Node.js environments
    const loader = process.env.BROWSER 
        ? getWorkspaceFile(path).then(v => v?.text)
        : Promise.resolve(readLocaleFile(path));

    return loader.then(jsonString => {
        if (jsonString) {
            try {
                loadedCollection = JSON.parse(jsonString);
            } catch (e) {
                console.error("Failed to parse localization file.", e);
            }
        }
    });
}

/**
 * Creates a function that returns a localized and formatted string.
 * This is the main factory used to define all localizable text.
 * @param key The unique key for the string (e.g., 'tableau.diagnostic.unexpectedCharacter').
 * @param defValue The default English string to use if the key is not found in the NLS file.
 * @returns A function that takes format arguments and returns the final string.
 */
export function localize(key: string, defValue: string): (...args: (number | string)[]) => string {
    return (...args: (number | string)[]) => {
        const message = loadedCollection[key] || defValue;
        if (args.length) {
            // Replaces placeholders like {0}, {1} with provided arguments.
            return message.replace(/\{(\d+)\}/g, (match, indexStr) => {
                const i = parseInt(indexStr, 10);
                return args[i] !== undefined ? String(args[i]) : match;
            });
        }
        return message;
    };
}


// --- Tableau Language String Definitions ---

/**
 * Strings for providing completion item details and documentation.
 */
export const completionitem = {
    // Aggregate Functions
	sum: localize('tableau.completionitem.sum', 'SUM(expression)\n\nReturns the sum of all values in the expression. Null values are ignored.'),
	avg: localize('tableau.completionitem.avg', 'AVG(expression)\n\nReturns the average of all values in the expression. Null values are ignored.'),
	
    // Logical Functions
	if: localize('tableau.completionitem.if', 'IF test THEN value [ELSEIF test THEN value...] [ELSE value] END\n\nTests a series of expressions and returns the corresponding value for the first true expression.'),
	case: localize('tableau.completionitem.case', 'CASE expression WHEN value1 THEN return1 [WHEN value2 THEN return2...] [ELSE default_return] END\n\nPerforms a series of tests based on a single expression.'),

    // LOD Keywords
    fixed: localize('tableau.completionitem.fixed', 'FIXED [Dimension 1], [Dimension 2] : AGGREGATE(expression)\n\nComputes an aggregate using only the specified dimensions.'),
};

/**
 * Strings for code actions (quick fixes).
 */
export const codeaction = {
	fixCase: localize('tableau.codeaction.fixCase', 'Change \'{0}\' to uppercase \'{1}\''),
	didYouMean: localize('tableau.codeaction.didYouMean', 'Did you mean \'{0}\'?'),
};

/**
 * Strings for diagnostic messages (errors and warnings).
 */
export const diagnostic = {
	// Lexer Errors
	unterminatedString: localize('tableau.diagnostic.unterminatedString', 'Unterminated string literal. Expected a closing {0}.'),
	unterminatedFieldRef: localize('tableau.diagnostic.unterminatedFieldRef', 'Unterminated field reference. Expected a closing \']\'.'),
	unexpectedCharacter: localize('tableau.diagnostic.unexpectedCharacter', 'Unexpected character: \'{0}\'.'),
    
    // Parser Errors (examples for when you build a parser)
    missingClosingParen: localize('tableau.diagnostic.missingClosingParen', 'Missing closing parenthesis \')\'.'),
    missingKeyword: localize('tableau.diagnostic.missingKeyword', 'Missing expected keyword \'{0}\' after \'{1}\'.'),
    paramCountError: localize('tableau.diagnostic.paramCountError', 'Function \'{0}\' expects {1} parameter(s), but got {2}.'),
    syntaxError: localize('tableau.diagnostic.syntaxError', 'Syntax error near \'{0}\'.'),
};

/**
 * Strings for general warnings.
 */
export const warn = {
	unnecessarySemicolon: localize('tableau.warn.unnecessarySemicolon', 'Semicolons are not used in Tableau calculations.'),
    functionCase: localize('tableau.warn.functionCase', 'Function names are typically uppercase (e.g., \'SUM\' instead of \'sum\').'),
};