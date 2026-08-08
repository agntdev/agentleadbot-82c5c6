// Single clock seam for every application timestamp. Tests may replace it
// without relying on wall-clock time.
let currentClock: () => Date = () => new Date();

export function now(): Date {
  return currentClock();
}

export function setClockForTests(clock: () => Date): void {
  currentClock = clock;
}

export function resetClockForTests(): void {
  currentClock = () => new Date();
}
