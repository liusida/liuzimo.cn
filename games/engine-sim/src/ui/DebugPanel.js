function formatLayer(name, runtime) {
  if (!runtime) {
    return `${name}: (no data)`;
  }
  return [
    `${name.toUpperCase()}:`,
    `  bands: ${runtime.selectedBands[0]} (${runtime.weights[0].toFixed(2)}) -> ${runtime.selectedBands[1]} (${runtime.weights[1].toFixed(2)})`,
    `  pitch: ${runtime.pitch[0].toFixed(2)} / ${runtime.pitch[1].toFixed(2)}`,
    `  layerGain: ${runtime.gain.toFixed(2)} | brightness: ${runtime.brightnessDb.toFixed(1)} dB`,
    `  pulse: depth ${runtime.pulseDepth.toFixed(3)} @ ${runtime.pulseRateHz.toFixed(1)} Hz`,
  ].join("\n");
}

export class DebugPanel {
  constructor(element) {
    this.element = element;
  }

  render(vehicleState, audioDebug) {
    const main = audioDebug.main;
    if (!main) {
      this.element.textContent = "Audio pending...";
      return;
    }

    const text = [
      `RPM: ${main.rpm.toFixed(0)} | Gear: ${vehicleState.gear} | Camera: ${vehicleState.cameraMode}`,
      `Engine: ${main.engineType}${main.cylinderCount} | Firing: ${main.firingHz.toFixed(1)} /s | Smoothness: ${main.smoothness.toFixed(2)}`,
      `Throttle: ${main.throttle.toFixed(2)} | Load: ${main.load.toFixed(2)} | Blend: ${main.loadBlend.toFixed(2)}`,
      `Camera Blend: ${main.cameraBlend.toFixed(2)} | Distance: ${main.distance.toFixed(2)}`,
      `Torque Scalar: ${main.torqueScalar.toFixed(2)} | Limiter Cut: ${main.limiterCut.toFixed(2)}`,
      `Events: ${main.events.length ? main.events.join(", ") : "none"}`,
      "",
      formatLayer("exhaust", audioDebug.exhaust),
      "",
      formatLayer("intake", audioDebug.intake),
      "",
      formatLayer("mechanical", audioDebug.mechanical),
    ].join("\n");

    this.element.textContent = text;
  }
}
