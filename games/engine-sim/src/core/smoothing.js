export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, smoothingSeconds, dtSeconds) {
  if (smoothingSeconds <= 0) {
    return target;
  }
  const alpha = 1 - Math.exp(-dtSeconds / smoothingSeconds);
  return lerp(current, target, alpha);
}

export class ExponentialSmoother {
  constructor(initialValue, smoothingSeconds) {
    this.value = initialValue;
    this.smoothingSeconds = smoothingSeconds;
  }

  setSmoothing(smoothingSeconds) {
    this.smoothingSeconds = smoothingSeconds;
  }

  update(target, dtSeconds) {
    this.value = damp(this.value, target, this.smoothingSeconds, dtSeconds);
    return this.value;
  }
}
