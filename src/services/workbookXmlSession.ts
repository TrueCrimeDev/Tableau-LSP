/** Serializes editor saves and retains the last successfully persisted XML. */
export class WorkbookXmlSession {
    private pending: Promise<void> = Promise.resolve();

    public constructor(
        private baseline: string,
        private readonly apply: (original: string, updated: string) => Promise<void>,
    ) {}

    public get text(): string { return this.baseline; }

    public save(updated: string): Promise<void> {
        const operation = this.pending.then(async () => {
            if (updated === this.baseline) { return; }
            await this.apply(this.baseline, updated);
            this.baseline = updated;
        });
        this.pending = operation.catch(() => undefined);
        return operation;
    }
}
