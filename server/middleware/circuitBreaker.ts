type State = "CLOSED" | "OPEN" | "HALF_OPEN";

class CircuitBreaker {
  private state: State = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly threshold = 5;
  private readonly resetTimeout = 30000;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = "HALF_OPEN";
      } else {
        throw new Error("Sistema temporalmente saturado. Reintente en un momento.");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold) {
      this.state = "OPEN";
      console.error(`[CircuitBreaker] OPEN — ${this.failureCount} fallos consecutivos. Pausando queries por ${this.resetTimeout / 1000}s.`);
    }
  }

  getState() {
    return { state: this.state, failures: this.failureCount };
  }
}

export const dbCircuitBreaker = new CircuitBreaker();
