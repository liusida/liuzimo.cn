# Real-Time Engine Sound Simulator

This project implements a modular, sample-based engine audio system for a driving game using the Web Audio API.

It prioritizes believable behavior (band blending, load response, transitions, limiter behavior, interior/exterior voicing) over strict physical simulation.
The default setup is now a configurable V16 profile.

## File Structure

- `index.html` - demo UI and controls.
- `styles.css` - lightweight layout and debug styling.
- `src/main.js` - app bootstrap and frame loop.
- `src/core/types.js` - shared state model and enums.
- `src/core/smoothing.js` - interpolation and damping helpers.
- `src/audio/AudioSampleLibrary.js` - clip loading with generated fallback loops/events.
- `src/audio/EngineLayerMixer.js` - per-layer RPM band playback, pitch shift, and crossfade logic.
- `src/audio/EngineEventManager.js` - transition-driven transient events (start/stop/shift/limiter/blip/backfire).
- `src/audio/EngineBusMixer.js` - interior/exterior bus routing, filter voicing, and distance attenuation.
- `src/audio/EngineAudioController.js` - top-level orchestration and per-frame parameter update.
- `src/config/engineConfig.js` - data-driven 4-cylinder example configuration.
- `src/sim/VehicleSimulator.js` - simple driveline model feeding audio state.
- `src/ui/DebugPanel.js` - runtime debug output (bands, weights, pitch, events).

## Architecture

1. `VehicleSimulator` (or your game code) produces frame-by-frame parameters:
   - `rpm`, `throttle`, `engineLoad`, `gear`, `clutch`, `limiterActive`, `cameraMode`, `cameraBlend`, `distanceNormalized`, `engineRunning`.
2. `EngineAudioController` smooths unstable values and computes derived runtime controls (load blend, idle jitter, micro-variation, torque cut).
   - It also derives firing density from cylinder count:
   - `firingEventsPerSecond = (RPM * cylinderCount) / 120`
3. Each `EngineLayerMixer`:
   - finds nearest RPM bands,
   - computes crossfade weights,
   - pitch-shifts loops using `pitch = currentRPM / recordedRPM`,
   - blends coast vs power gain from load/throttle,
   - applies load-based gain and brightness for each layer.
4. `EngineEventManager` emits one-shots from state transitions.
5. `EngineBusMixer` applies interior/exterior gain + filter voicing.
6. `DebugPanel` displays runtime diagnostics.

## Running

Use a static server (required by browsers for module loading):

```bash
cd "engine sim"
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## Controls

- `Start Audio` button: initializes Web Audio graph.
- `Engine On/Off`: triggers start/stop events.
- `W`: throttle
- `S`: extra load / braking
- `Q`: clutch disengage
- `A` / `D`: shift down / up
- `E`: limiter force toggle
- `C` button in UI: interior/exterior camera mode
- `Z` / `X`: move listener near/far (distance attenuation demo)

## Configuration / Tuning

Edit `src/config/engineConfig.js`.

- `layers[*].bands[*].recordedRPM`: source clip RPM.
- `layers[*].bands[*].clip` / `powerClip` / `coastClip`:
  - assign your loop files (e.g. `./assets/exhaust_mid_power.wav`),
  - leave `null` to use generated fallback loops.
- `layers[*].baseGain`, `powerPresence`, `coastPresence`: spectral and dynamic balance.
- `layers[*].lowLoadGain` / `highLoadGain`: layer loudness response to load.
- `layers[*].brightnessDbAtLoad0` / `brightnessDbAtLoad1`: layer brightness response to load.
- `layers[*].interiorSend` / `exteriorSend`: perspective routing.
- `engine.cylinderCount`, `engine.engineType`: scalable engine architecture.
- `engine.smoothnessFactor`: global roughness/silkiness control.
- `events.*`: transient gains and behavior thresholds.
- `smoothing.*`: responsiveness vs stability.
- `buses.interior/exterior`: filter voicing for cockpit vs outside camera.
- `buses.distance.minAttenuation`: far-camera attenuation floor.

## Realism Impact Summary

- **Load influence**: the same RPM now sounds different under cruise vs heavy acceleration.
- **Layered mixing**: exhaust/intake/mechanical elements are independently tunable and react differently.
- **Band crossfades**: avoids extreme time-stretch artifacts from single-loop systems.
- **State-driven transients**: shifts, limiter, blips, and overrun pops add mechanical character.
- **Limiter stutter**: rapid cut pattern creates audible redline chatter instead of silent clamping.
- **Cylinder density**: more cylinders increase pulse rate while reducing per-pulse depth, so V16 sounds smoother and denser than V4/V8.
- **Anti-robot motion**: idle jitter and tiny micro-variation prevent static/looped feel.
- **Interior/exterior blend**: perspective transitions smoothly rather than hard switching.

## Integration Notes

In a real game, replace `VehicleSimulator` with your own telemetry feed and call:

- `engineAudio.update(vehicleState, dtSeconds)` once per frame.

Keep event correctness by providing truthful transitions (`gear`, `engineRunning`, `limiterActive`) rather than ad hoc triggers.
