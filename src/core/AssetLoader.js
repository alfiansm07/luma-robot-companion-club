/** Reports completion of real module/resource preparation, never timer-based progress. */
export class AssetLoader {
  constructor(onProgress) {
    this.onProgress = onProgress;
    this.completed = 0;
    this.total = 0;
  }

  /** Every task is an actual asynchronous resource operation with a fixed work weight. */
  async load(tasks) {
    this.total = tasks.reduce((sum, task) => sum + (task.weight ?? 1), 0);
    this.completed = 0;
    this.onProgress(0, 'Preparing your playground');
    const entries = await Promise.all(
      tasks.map(async ({ name, load, weight = 1 }) => {
        const value = await load();
        this.completed += weight;
        this.onProgress(this.completed / this.total, name);
        return [name, value];
      }),
    );
    return Object.fromEntries(entries);
  }
}
