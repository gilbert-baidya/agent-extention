/**
 * Concurrency-limited async queue.
 *
 * Processes items with at most `concurrency` parallel workers.
 * Supports pause / resume without losing queued items.
 */
export class AsyncQueue<T> {
  private readonly items: T[] = []
  private running = 0
  private _paused = false
  private _stopped = false

  constructor(
    private readonly concurrency: number,
    private readonly processor: (item: T) => Promise<void>,
    private readonly onDrained?: () => void,
  ) {}

  /** Add items and start processing */
  enqueue(items: T[]): void {
    this.items.push(...items)
    this.tick()
  }

  pause(): void {
    this._paused = true
  }

  resume(): void {
    this._paused = false
    this.tick()
  }

  stop(): void {
    this._stopped = true
    this.items.length = 0
  }

  get pending(): number { return this.items.length }
  get active(): number  { return this.running }
  get paused(): boolean { return this._paused }

  private tick(): void {
    if (this._paused || this._stopped) return

    while (this.running < this.concurrency && this.items.length > 0) {
      const item = this.items.shift()!
      this.running++
      this.processor(item).finally(() => {
        this.running--
        if (this.items.length === 0 && this.running === 0) {
          this.onDrained?.()
        } else {
          this.tick()
        }
      })
    }
  }
}
