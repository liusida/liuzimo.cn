import { EngineAudioController } from "./audio/EngineAudioController.js";
import { engineConfig } from "./config/engineConfig.js";
import { VehicleSimulator } from "./sim/VehicleSimulator.js";
import { DebugPanel } from "./ui/DebugPanel.js";

const input = {
  throttle: false,
  brake: false,
  clutch: false,
  limiter: false,
  shiftUp: false,
  shiftDown: false,
  distanceIn: false,
  distanceOut: false,
  distanceDelta: 0,
};

const keys = {
  KeyW: "throttle",
  KeyS: "brake",
  KeyQ: "clutch",
  KeyE: "limiter",
};

const debugPanel = new DebugPanel(document.getElementById("debug-output"));
const simulator = new VehicleSimulator(engineConfig);

let audioContext = null;
let engineAudio = null;
let started = false;
let lastFrame = performance.now();

const audioButton = document.getElementById("audio-toggle");
const engineButton = document.getElementById("engine-toggle");
const cameraButton = document.getElementById("camera-toggle");

async function ensureAudio() {
  if (started) {
    return;
  }
  audioContext = new AudioContext();
  engineAudio = new EngineAudioController(audioContext, engineConfig);
  await engineAudio.initialize();
  started = true;
  audioButton.textContent = "Audio Running";
}

audioButton.addEventListener("click", async () => {
  await ensureAudio();
});

engineButton.addEventListener("click", () => {
  simulator.toggleEngine();
  engineButton.textContent = simulator.state.engineRunning ? "Engine: On" : "Engine: Off";
});

cameraButton.addEventListener("click", () => {
  simulator.toggleCamera();
  const mode = simulator.state.cameraMode;
  cameraButton.textContent = `Camera: ${mode === "interior" ? "Interior" : "Exterior"}`;
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) {
    return;
  }
  if (event.code === "KeyC") {
    simulator.toggleCamera();
    const mode = simulator.state.cameraMode;
    cameraButton.textContent = `Camera: ${mode === "interior" ? "Interior" : "Exterior"}`;
    return;
  }
  if (event.code === "KeyD") {
    input.shiftUp = true;
    return;
  }
  if (event.code === "KeyA") {
    input.shiftDown = true;
    return;
  }
  if (event.code === "KeyZ") {
    input.distanceIn = true;
    return;
  }
  if (event.code === "KeyX") {
    input.distanceOut = true;
    return;
  }
  const mapped = keys[event.code];
  if (mapped) {
    input[mapped] = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "KeyD") {
    input.shiftUp = false;
    return;
  }
  if (event.code === "KeyA") {
    input.shiftDown = false;
    return;
  }
  if (event.code === "KeyZ") {
    input.distanceIn = false;
    return;
  }
  if (event.code === "KeyX") {
    input.distanceOut = false;
    return;
  }
  const mapped = keys[event.code];
  if (mapped) {
    input[mapped] = false;
  }
});

function frame(now) {
  const dtSeconds = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  input.distanceDelta = (input.distanceOut ? 1 : 0) - (input.distanceIn ? 1 : 0);

  const vehicleState = simulator.update(input, dtSeconds);
  if (started) {
    engineAudio.update(vehicleState, dtSeconds);
    debugPanel.render(vehicleState, engineAudio.getDebugData());
  } else {
    debugPanel.render(vehicleState, {});
  }

  if (input.shiftUp) {
    input.shiftUp = false;
  }
  if (input.shiftDown) {
    input.shiftDown = false;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
