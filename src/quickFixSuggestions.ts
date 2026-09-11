/** Case-insensitive edit distance, counting an adjacent transposition as one typo. */
export function nameEditDistance(left: string, right: string): number {
    const a = left.toUpperCase();
    const b = right.toUpperCase();
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    let beforePrevious = previous;
    for (let row = 1; row <= a.length; row++) {
        const current = [row];
        for (let column = 1; column <= b.length; column++) {
            current[column] = Math.min(
                previous[column] + 1,
                current[column - 1] + 1,
                previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
            );
            if (row > 1 && column > 1 && a[row - 1] === b[column - 2] && a[row - 2] === b[column - 1]) {
                current[column] = Math.min(current[column], beforePrevious[column - 2] + 1);
            }
        }
        beforePrevious = previous;
        previous = current;
    }
    return previous[b.length];
}

const compareNames = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

/** Offer only nearby names; alphabetical ties make results independent of catalog order. */
export function rankNameSuggestions(name: string, candidates: Iterable<string>, limit = 3): string[] {
    if (!name || limit <= 0) return [];
    const maximumDistance = name.length <= 4 ? 1 : 2;
    const names = [...candidates].filter(candidate => typeof candidate === 'string' && candidate.length > 0);
    if (names.some(candidate => candidate.toUpperCase() === name.toUpperCase())) return [];
    const seen = new Set<string>();
    return names
        .sort((left, right) => compareNames(left.toUpperCase(), right.toUpperCase()) || compareNames(left, right))
        .filter(candidate => {
            const key = candidate.toUpperCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return Math.abs(candidate.length - name.length) <= maximumDistance;
        })
        .map(candidate => ({ candidate, distance: nameEditDistance(name, candidate) }))
        .filter(({ distance }) => distance <= maximumDistance)
        .sort((left, right) => left.distance - right.distance ||
            compareNames(left.candidate.toUpperCase(), right.candidate.toUpperCase()))
        .slice(0, limit)
        .map(({ candidate }) => candidate);
}
