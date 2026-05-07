/**
 * Standalone Three.js scene (Slow Roads–inspired): rolling hills, road strip, fog, calm palette.
 * Served from this folder; asset paths are relative to main.js — safe to move the project anywhere.
 * Educational / inspired recreation — not the real game.
 */
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** Low Poly Cars Free — see lowpoly_cars_free/License.txt */
const CAR_FOLDER = new URL("./lowpoly_cars_free/GLTF/", import.meta.url).href;
/** Low Poly Environment Pack — FBX props (extracted next to this file) */
const ENV_PACK_BASE = new URL("./LowPoly Environment Pack/", import.meta.url);
// Other GLBs: armor, coupe, fenyr, ghini, italia, jeep, lamb, mobil, police, rally, van
const CAR_FILE = "kamaro.glb";
/** Extra Y rotation after auto-align (set to Math.PI if the car still faces backward). */
const CAR_YAW_EXTRA = 0;

/** World units ≈ metres → speed in units/s × 3.6 = km/h (displayed “real” speed). */
const MAX_KMH = 190;
const MAX_SPEED = MAX_KMH / 3.6;
const MAX_REVERSE_SPEED = (55 / 3.6);
/** Turbo: hold Shift to raise forward cap by this much (km/h). */
const TURBO_KMH = 20;
const TURBO_MAX_SPEED = (MAX_KMH + TURBO_KMH) / 3.6;
/**
 * Multiplies world motion only; the speed readout still uses internal speed × 3.6 (unchanged “real” km/h).
 * Increase for snappier travel, decrease for slower world without changing the dial.
 */
const WORLD_SPEED_MULT = 1.22;

/** World units ≈ metres: gravity pulls the car down until it hits terrain. */
const GRAVITY = -22;
/** Small clearance so wheel contact isn’t z-fighting the ribbon (origin is at model base). */
const CAR_HEIGHT = 0.02;
/** Extra deceleration when Space (brake) is held — world units/s². */
const BRAKE_DECEL = 92;
/** Below this |speed| the car does not turn; steering input decays (world units/s). */
const STEER_STANDSTILL_THRESHOLD = 0.14;
/** HUD speed readout smoothing (higher = faster catch-up to true km/h). */
const SPEED_DISPLAY_SMOOTH = 8;
/** Steering rate base; multiplied by speed and speed-based sensitivity (faster → sharper turn). */
const STEER_RATE_BASE = 0.00052;
/** Mouse X steering: ignore small deviation from canvas center (0–1 along width). */
const MOUSE_STEER_DEAD = 0.07;
/** Minimum speed magnitude used only for steer-rate math when rolling (keeps crawl steer usable). */
const STEER_RATE_SPEED_FLOOR = 14;

const COLORS = {
  skyTop: 0x6eb8ff,
  skyBottom: 0xb8dcff,
  fog: 0xa8cef5,
  /** Sunlit / shaded grass (vertex colors on terrain) — saturated greens */
  grass: 0x4ec968,
  grassDark: 0x2a8a3e,
  road: 0x4a4f52,
  roadEdge: 0x3a3e40,
};

/** Phase offsets for terrainHeight — set per session in applyWorldTerrainSeed. */
let terrainPhaseA = 0;
let terrainPhaseB = 0;
let terrainPhaseMacro = 0;

/** Deterministic PRNG (0..1) from a 32-bit seed — used for world + plant scatter. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

/** Call once per page load so hills and low-frequency noise differ each world. */
function applyWorldTerrainSeed(seed) {
  const rand = mulberry32(seed);
  terrainPhaseA = rand() * Math.PI * 2;
  terrainPhaseB = rand() * Math.PI * 2;
  terrainPhaseMacro = rand() * Math.PI * 2;
}

/** Winding road centerline in XZ: z = u (world), x = f(u). */
const ROAD_WIGGLE = 26;
const ROAD_FREQ = 0.0038;
const ROAD_WIGGLE2 = 14;
const ROAD_FREQ2 = 0.0025;
const ROAD_PHASE2 = 0.9;

function roadCenterX(u) {
  return (
    ROAD_WIGGLE * Math.sin(u * ROAD_FREQ) +
    ROAD_WIGGLE2 * Math.sin(u * ROAD_FREQ2 + ROAD_PHASE2)
  );
}

/** d/d u of roadCenterX — for tangent along the path. */
function roadCenterDxDu(u) {
  return (
    ROAD_WIGGLE * ROAD_FREQ * Math.cos(u * ROAD_FREQ) +
    ROAD_WIGGLE2 * ROAD_FREQ2 * Math.cos(u * ROAD_FREQ2 + ROAD_PHASE2)
  );
}

/** Unit tangent (XZ) of the road centerline at arc parameter u — forward along +u (world Z). */
function roadTangentXZ(u) {
  const dx = roadCenterDxDu(u);
  const len = Math.hypot(dx, 1);
  return { x: dx / len, z: 1 / len };
}

/** Heading (radians) aligned with the road: matches sin/cos used for vehicle velocity. */
function roadHeadingAt(u) {
  const t = roadTangentXZ(u);
  return Math.atan2(t.x, t.z);
}

/**
 * Signed lateral offset (m) from the centerline at u: perpendicular to the path tangent,
 * positive when the car sits to the “right” of the forward path — better than px − roadCenterX(u) on curves.
 */
function signedLateralToPath(px, pz, u) {
  const cx = roadCenterX(u);
  const cz = u;
  const dx = px - cx;
  const dz = pz - cz;
  const t = roadTangentXZ(u);
  return dx * t.z - dz * t.x;
}

function wrapAnglePi(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** World XZ on the road ribbon: u = arc parameter (world Z of centerline), lateral = across width. */
function roadPointAt(u, lateral) {
  const tx = roadCenterDxDu(u);
  const tz = 1;
  const invLen = 1 / Math.sqrt(tx * tx + tz * tz);
  const rx = tz * invLen;
  const rz = -tx * invLen;
  return {
    x: roadCenterX(u) + rx * lateral,
    z: u + rz * lateral,
  };
}

// Layered hills — smooth but with enough amplitude to feel rolling, not pancake-flat
function terrainHeight(x, z) {
  const s = 0.0052;
  const pa = terrainPhaseA;
  const pb = terrainPhaseB;
  const pm = terrainPhaseMacro;
  let h =
    Math.sin(x * s + pa) * Math.cos(z * s * 0.88 + pb) * 17 +
    Math.sin(x * s * 1.5 + z * s * 1.2 + pa * 0.6) * 6 +
    Math.sin(x * s * 2.6 + z * s * 2.0 + pb) * 1.6 +
    Math.sin(x * s * 3.4 - z * s * 2.8 + pa) * 0.85;
  h += Math.sin(x * 0.001 + z * 0.00075 + pm) * 4;
  return h;
}

function terrainNormal(x, z) {
  const e = 1.1;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  const n = new THREE.Vector3(-hx, 2 * e, -hz);
  n.normalize();
  if (n.y < 0.2) n.multiplyScalar(-1);
  return n;
}

/**
 * Smoothed terrain for the road bed — dampens high-frequency sine terms that read as bumps.
 */
function roadTerrainHeight(x, z) {
  const r = 2.6;
  const c = 0.5;
  const o = 0.125;
  return (
    terrainHeight(x, z) * c +
    terrainHeight(x + r, z) * o +
    terrainHeight(x - r, z) * o +
    terrainHeight(x, z + r) * o +
    terrainHeight(x, z - r) * o
  );
}

/** Road surface Y: vertical offset only (no normal slide) + clamp above raw terrain to avoid clipping. */
function roadSurfaceY(x, z) {
  const ground = terrainHeight(x, z);
  const smoothH = roadTerrainHeight(x, z);
  /** Minimum gap above ground mesh so the strip reads slightly above the grass. */
  const minAboveGround = 0.26;
  return Math.max(smoothH + ROAD_LIFT, ground + minAboveGround);
}

/** Surface normal of the road heightfield (for vehicle pitch/roll). */
function roadSurfaceNormal(x, z) {
  const e = 1.15;
  const hx = roadSurfaceY(x + e, z) - roadSurfaceY(x - e, z);
  const hz = roadSurfaceY(x, z + e) - roadSurfaceY(x, z - e);
  const n = new THREE.Vector3(-hx, 2 * e, -hz);
  n.normalize();
  if (n.y < 0.12) n.multiplyScalar(-1);
  return n;
}

/** Matches road ribbon half-width in createInfiniteRoadPool (HALF_W). */
const ROAD_RIBBON_HALF_W = 5.2;
const OFFROAD_BLEND_START = ROAD_RIBBON_HALF_W + 0.6;
const OFFROAD_BLEND_END = ROAD_RIBBON_HALF_W + 3.5;

function distanceSqToRoadCenterline(px, pz, u) {
  const dx = px - roadCenterX(u);
  const dz = pz - u;
  return dx * dx + dz * dz;
}

/**
 * Closest centerline parameter u to (px, pz); centerline samples are (roadCenterX(u), u).
 * Used so off-road autopilot can steer toward the ribbon and rejoin the lane.
 */
function nearestRoadCenterlineU(px, pz) {
  let bestU = pz;
  let bestD = distanceSqToRoadCenterline(px, pz, pz);
  const span = 220;
  const coarse = 5;
  for (let u = pz - span; u <= pz + span; u += coarse) {
    const d = distanceSqToRoadCenterline(px, pz, u);
    if (d < bestD) {
      bestD = d;
      bestU = u;
    }
  }
  for (let w = 4; w >= 0.125; w /= 2) {
    for (const du of [-w, 0, w]) {
      const u = bestU + du;
      const d = distanceSqToRoadCenterline(px, pz, u);
      if (d < bestD) {
        bestD = d;
        bestU = u;
      }
    }
  }
  return bestU;
}

/**
 * Autopilot: Stanley-style on-road + recovery blend off-road (bearing toward nearest ribbon point).
 * Returns forward ∈ [-1,1], turn ∈ [-1,1], turbo (boolean).
 */
function computeAutopilotInput(px, pz, heading, speed, poleXZ = []) {
  const uN = nearestRoadCenterlineU(px, pz);
  const cx = roadCenterX(uN);
  const cz = uN;
  const distToPath = Math.hypot(px - cx, pz - cz);

  const u = uN;
  /** Lookahead tangent — uses projected road u so bends stay correct when far from the lane. */
  const uLook = uN + 16;
  const headingPath = roadHeadingAt(uLook);
  const lateralNear = signedLateralToPath(px, pz, uN);
  const lateralAhead = signedLateralToPath(px, pz, uLook);
  /** Blend rear + lookahead lateral so the path stays centered through bends. */
  const lateralErr = lateralNear * 0.55 + lateralAhead * 0.45;
  const v = Math.abs(speed) + 10;
  /** Stronger cross-track gain keeps the car near the ribbon center (Stanley). */
  const crossTerm = Math.atan2(0.072 * lateralErr, v);
  const headingErr = wrapAnglePi(headingPath - heading);

  /** Off-road: steer toward nearest point on the centerline, then blend back to lane-following. */
  const headingReturn = Math.atan2(cx - px, cz - pz);
  const headingReturnErr = wrapAnglePi(headingReturn - heading);
  const recoverT = THREE.MathUtils.smoothstep(distToPath, OFFROAD_BLEND_START, OFFROAD_BLEND_END + 7);
  const blendedHeadingErr = THREE.MathUtils.lerp(headingErr, headingReturnErr, recoverT);

  const curvatureTerm = 0.35 * wrapAnglePi(roadHeadingAt(u) - roadHeadingAt(uLook));
  const steerRaw =
    5.2 * blendedHeadingErr +
    crossTerm * (1 - recoverT * 0.4) +
    curvatureTerm * (1 - recoverT * 0.55);
  const { turnDelta, speedMul } = autopilotObstacleFactors(px, pz, heading, speed, poleXZ);
  const turn = THREE.MathUtils.clamp(steerRaw + turnDelta, -1, 1);

  /** Match max dial speed (190 km/h) — same cap as manual W without Shift. */
  const cruise = MAX_SPEED;
  const bend =
    Math.abs(blendedHeadingErr) + Math.abs(roadHeadingAt(uN + 28) - roadHeadingAt(uN)) * 0.45;
  let targetSpeed = cruise * THREE.MathUtils.clamp(1 - bend * 0.95, 0.28, 1);
  /** Slightly lower cap on rough grass while rejoining — still pushes throttle to get back. */
  if (recoverT > 0.12) {
    targetSpeed *= THREE.MathUtils.lerp(1, 0.68, recoverT);
  }
  targetSpeed *= speedMul;
  let forward = 0;
  if (speed < targetSpeed - 1.1) forward = 1;
  else if (speed > targetSpeed + 1.6) forward = -0.55;
  else if (speed < targetSpeed) forward = 0.45;

  return { forward, turn, turbo: false };
}

/** Lateral distance (m) ≤ this counts as “on the road” for checkpoint autosave. */
function isOnRoadForCheckpoint(px, pz) {
  return Math.abs(px - roadCenterX(pz)) <= OFFROAD_BLEND_START;
}

const CHECKPOINT_STORAGE_KEY = "recreate_checkpoint_v1";
const CHECKPOINT_SAVE_INTERVAL_S = 3.2;

/** Ground contact height: road surface on the ribbon, raw terrain when far off-road (see debug ry−th gap). */
function vehicleGroundHeight(px, pz) {
  const lateral = Math.abs(px - roadCenterX(pz));
  // Three.js: smoothstep(x, min, max) — not GLSL edge0/edge1/x order.
  const t = THREE.MathUtils.smoothstep(lateral, OFFROAD_BLEND_START, OFFROAD_BLEND_END);
  return THREE.MathUtils.lerp(roadSurfaceY(px, pz), terrainHeight(px, pz), t);
}

/** Blend road vs terrain normals so pitch/roll matches the surface you drive on. */
function vehicleSurfaceUp(px, pz, out) {
  const lateral = Math.abs(px - roadCenterX(pz));
  const t = THREE.MathUtils.smoothstep(lateral, OFFROAD_BLEND_START, OFFROAD_BLEND_END);
  const rn = roadSurfaceNormal(px, pz);
  const tn = terrainNormal(px, pz);
  out.copy(rn).lerp(tn, t).normalize();
}

const _carRight = new THREE.Vector3();
const _carFwd = new THREE.Vector3();
const _carMat = new THREE.Matrix4();
const _carTargetQuat = new THREE.Quaternion();

/**
 * Local +Z forward, +Y up — matches attachCarModel (+Z forward). Uses heading on the road tangent plane.
 */
function quaternionFromRoadHeading(heading, surfaceUp, outQuat) {
  const up = surfaceUp;
  _carFwd.set(Math.sin(heading), 0, Math.cos(heading));
  _carFwd.projectOnPlane(up);
  if (_carFwd.lengthSq() < 1e-10) {
    _carFwd.set(0, 0, 1).projectOnPlane(up);
  }
  if (_carFwd.lengthSq() < 1e-10) _carFwd.set(0, 0, -1);
  _carFwd.normalize();
  _carRight.crossVectors(up, _carFwd).normalize();
  _carFwd.crossVectors(_carRight, up).normalize();
  _carMat.makeBasis(_carRight, up, _carFwd);
  outQuat.setFromRotationMatrix(_carMat);
}

/** One terrain tile: fixed topology, world XZ baked from tile indices + local plane coords. */
function createTerrainTileBaseGeometry(tileSize, segments) {
  const geo = new THREE.PlaneGeometry(tileSize, tileSize, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const localXZ = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    localXZ[i * 2] = pos.getX(i);
    localXZ[i * 2 + 1] = pos.getZ(i);
  }
  geo.userData.localXZ = localXZ;
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
  return geo;
}

function fillTerrainTileGeometry(geo, tileIx, tileIz, tileSize) {
  const pos = geo.attributes.position;
  const colors = geo.attributes.color;
  const localXZ = geo.userData.localXZ;
  const grassA = new THREE.Color(COLORS.grassDark);
  const grassB = new THREE.Color(COLORS.grass);
  const grassMix = new THREE.Color();
  const arr = colors.array;
  for (let i = 0; i < pos.count; i++) {
    const lx = localXZ[i * 2];
    const lz = localXZ[i * 2 + 1];
    const wx = tileIx * tileSize + lx;
    const wz = tileIz * tileSize + lz;
    const y = terrainHeight(wx, wz);
    pos.setXYZ(i, wx, y, wz);
    const n = terrainNormal(wx, wz);
    const sun = Math.max(0.32, n.dot(new THREE.Vector3(0.4, 0.85, 0.35)));
    const t = Math.min(1, sun * 1.05);
    grassMix.copy(grassA).lerp(grassB, t);
    const o = i * 3;
    arr[o] = grassMix.r;
    arr[o + 1] = grassMix.g;
    arr[o + 2] = grassMix.b;
  }
  pos.needsUpdate = true;
  colors.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
}

/**
 * Infinite grass: grid of tiles recycled around the car (same heightfield, new world origin per tile).
 */
function createTerrainTilePool(scene, landMat) {
  const TILE_SIZE = 440;
  const TILE_SEG = 34;
  const N = 15;
  const half = (N - 1) / 2;
  const meshes = [];

  for (let k = 0; k < N * N; k++) {
    const geo = createTerrainTileBaseGeometry(TILE_SIZE, TILE_SEG);
    fillTerrainTileGeometry(geo, 0, 0, TILE_SIZE);
    const mesh = new THREE.Mesh(geo, landMat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.userData.tileIx = null;
    mesh.userData.tileIz = null;
    scene.add(mesh);
    meshes.push(mesh);
  }

  function invalidate() {
    for (const m of meshes) {
      m.userData.tileIx = null;
      m.userData.tileIz = null;
    }
  }

  function updateTerrainTiles(px, pz) {
    const cx = Math.floor(px / TILE_SIZE);
    const cz = Math.floor(pz / TILE_SIZE);
    let needFill = false;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const idx = i * N + j;
        const ix = cx - half + i;
        const iz = cz - half + j;
        const m = meshes[idx];
        if (m.userData.tileIx !== ix || m.userData.tileIz !== iz) {
          m.userData.tileIx = ix;
          m.userData.tileIz = iz;
          needFill = true;
        }
      }
    }
    if (!needFill) return;
    for (const m of meshes) {
      fillTerrainTileGeometry(m.geometry, m.userData.tileIx, m.userData.tileIz, TILE_SIZE);
    }
  }

  return { updateTerrainTiles, invalidate };
}

const ROAD_LIFT = 0.48;

function createRoadSegmentGeometry(segmentLen, segmentsAcross, segmentsAlong, halfWidth) {
  const geo = new THREE.PlaneGeometry(
    halfWidth * 2,
    segmentLen,
    segmentsAcross,
    segmentsAlong
  );
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const localXZ = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    localXZ[i * 2] = pos.getX(i);
    localXZ[i * 2 + 1] = pos.getZ(i);
  }
  geo.userData.localXZ = localXZ;
  return geo;
}

/**
 * Ribbon road: local X = lateral across width, local Z = offset along path (u = world Z on centerline).
 * lateralOffset shifts the whole strip (e.g. edge lines).
 * yOffset lifts slightly above asphalt to reduce z-fighting.
 */
function fillRoadRibbonGeometry(geo, chunkCenterU, segLen, lateralOffset = 0, yOffset = 0) {
  const pos = geo.attributes.position;
  const localXZ = geo.userData.localXZ;
  for (let i = 0; i < pos.count; i++) {
    const lx = localXZ[i * 2];
    const zAlong = localXZ[i * 2 + 1];
    const u = chunkCenterU + zAlong;
    const lateral = lateralOffset + lx;
    const w = roadPointAt(u, lateral);
    const y = roadSurfaceY(w.x, w.z) + yOffset;
    pos.setXYZ(i, w.x, y, w.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
}

/** White road markings: offset above asphalt; edge ribbons + thick dashed center mesh. */
const MARK_LINE_W = 0.34;
const CENTER_LINE_W = 0.26;
const MARK_Y_OFFSET = 0.028;
const CENTER_DASH_LEN = 3.4;
const CENTER_GAP_LEN = 2.6;

/** Thick dashed center line as triangle strips (Line width is unreliable in WebGL). */
function buildCenterDashGeometry(chunkIndex, segLen) {
  const chunkCenterU = chunkIndex * segLen;
  const uMin = chunkCenterU - segLen / 2;
  const uMax = chunkCenterU + segLen / 2;
  const halfW = CENTER_LINE_W / 2;
  const positions = [];
  const indices = [];
  const cycle = CENTER_DASH_LEN + CENTER_GAP_LEN;
  /** Dash periods align to n*cycle; iterate n so every overlap with [uMin,uMax] is included. */
  let vBase = 0;
  const n0 = Math.floor(uMin / cycle);
  const n1 = Math.ceil(uMax / cycle) + 1;
  for (let n = n0; n <= n1; n++) {
    const u = n * cycle;
    const d0 = Math.max(u, uMin);
    const d1 = Math.min(u + CENTER_DASH_LEN, uMax);
    if (d1 - d0 <= 0.05) continue;
    const steps = 8;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      const ua = d0 + t0 * (d1 - d0);
      const ub = d0 + t1 * (d1 - d0);
      const p0a = roadPointAt(ua, -halfW);
      const p0b = roadPointAt(ua, halfW);
      const p1a = roadPointAt(ub, -halfW);
      const p1b = roadPointAt(ub, halfW);
      const y0a = roadSurfaceY(p0a.x, p0a.z) + MARK_Y_OFFSET;
      const y0b = roadSurfaceY(p0b.x, p0b.z) + MARK_Y_OFFSET;
      const y1a = roadSurfaceY(p1a.x, p1a.z) + MARK_Y_OFFSET;
      const y1b = roadSurfaceY(p1b.x, p1b.z) + MARK_Y_OFFSET;
      const i0 = vBase;
      positions.push(
        p0a.x, y0a, p0a.z,
        p0b.x, y0b, p0b.z,
        p1a.x, y1a, p1a.z,
        p1b.x, y1b, p1b.z
      );
      indices.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
      vBase += 4;
    }
  }
  if (positions.length === 0) {
    return new THREE.BufferGeometry();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function rebuildCenterDashMesh(mesh, chunkIndex, segLen) {
  mesh.geometry.dispose();
  mesh.geometry = buildCenterDashGeometry(chunkIndex, segLen);
  mesh.geometry.computeBoundingSphere();
}

/**
 * Infinite winding road: pool of ribbon segments along the path, recycled as the car moves.
 * Includes white edge stripes and a dashed center line.
 */
function createInfiniteRoadPool(scene, roadMat) {
  const SEG_LEN = 160;
  const HALF_W = 5.2;
  const SEG_ACROSS = 32;
  const SEG_ALONG = 48;
  const NUM_CHUNKS = 40;
  const meshes = [];
  const lineWHalf = MARK_LINE_W / 2;
  const leftLateral = -HALF_W + lineWHalf;
  const rightLateral = HALF_W - lineWHalf;

  const lineMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75,
    metalness: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  /** Unlit white so the center dashes stay visible in shadow (Standard was reading as asphalt). */
  const centerLineMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
  const leftMeshes = [];
  const rightMeshes = [];
  const centerLines = [];

  for (let i = 0; i < NUM_CHUNKS; i++) {
    const geo = createRoadSegmentGeometry(SEG_LEN, SEG_ACROSS, SEG_ALONG, HALF_W);
    fillRoadRibbonGeometry(geo, 0, SEG_LEN);
    const mesh = new THREE.Mesh(geo, roadMat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.chunkIndex = null;
    scene.add(mesh);
    meshes.push(mesh);

    const geoL = createRoadSegmentGeometry(SEG_LEN, 1, SEG_ALONG, lineWHalf);
    fillRoadRibbonGeometry(geoL, 0, SEG_LEN, leftLateral, MARK_Y_OFFSET);
    const mL = new THREE.Mesh(geoL, lineMat);
    mL.receiveShadow = true;
    mL.castShadow = false;
    mL.frustumCulled = false;
    mL.userData.chunkIndex = null;
    scene.add(mL);
    leftMeshes.push(mL);

    const geoR = createRoadSegmentGeometry(SEG_LEN, 1, SEG_ALONG, lineWHalf);
    fillRoadRibbonGeometry(geoR, 0, SEG_LEN, rightLateral, MARK_Y_OFFSET);
    const mR = new THREE.Mesh(geoR, lineMat);
    mR.receiveShadow = true;
    mR.castShadow = false;
    mR.frustumCulled = false;
    mR.userData.chunkIndex = null;
    scene.add(mR);
    rightMeshes.push(mR);

    const centerMesh = new THREE.Mesh(new THREE.BufferGeometry(), centerLineMat);
    centerMesh.frustumCulled = false;
    centerMesh.receiveShadow = false;
    centerMesh.castShadow = false;
    centerMesh.userData.chunkIndex = null;
    scene.add(centerMesh);
    centerLines.push(centerMesh);
  }

  function updateRoadChunks(carPz) {
    const centerChunk = Math.floor(carPz / SEG_LEN);
    const half = (NUM_CHUNKS / 2) | 0;
    let needFill = false;
    for (let i = 0; i < NUM_CHUNKS; i++) {
      const ci = centerChunk - half + i;
      if (meshes[i].userData.chunkIndex !== ci) {
        meshes[i].userData.chunkIndex = ci;
        needFill = true;
      }
      if (leftMeshes[i].userData.chunkIndex !== ci) {
        leftMeshes[i].userData.chunkIndex = ci;
        needFill = true;
      }
      if (rightMeshes[i].userData.chunkIndex !== ci) {
        rightMeshes[i].userData.chunkIndex = ci;
        needFill = true;
      }
      if (centerLines[i].userData.chunkIndex !== ci) {
        centerLines[i].userData.chunkIndex = ci;
        needFill = true;
      }
    }
    if (!needFill) return;
    const cu = (ci) => ci * SEG_LEN;
    for (let i = 0; i < NUM_CHUNKS; i++) {
      const ci = meshes[i].userData.chunkIndex;
      const cc = cu(ci);
      fillRoadRibbonGeometry(meshes[i].geometry, cc, SEG_LEN);
      fillRoadRibbonGeometry(leftMeshes[i].geometry, cc, SEG_LEN, leftLateral, MARK_Y_OFFSET);
      fillRoadRibbonGeometry(rightMeshes[i].geometry, cc, SEG_LEN, rightLateral, MARK_Y_OFFSET);
      rebuildCenterDashMesh(centerLines[i], ci, SEG_LEN);
    }
  }

  return { updateRoadChunks };
}

function addPlaceholderCar(carGroup) {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.1, 4.2),
    new THREE.MeshStandardMaterial({ color: 0x5c6568, roughness: 0.45, metalness: 0.25 })
  );
  body.position.y = 0.55;
  body.castShadow = true;
  carGroup.add(body);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.7, 2.4),
    new THREE.MeshStandardMaterial({ color: 0x8a9499, roughness: 0.35, metalness: 0.2 })
  );
  roof.position.set(0, 1.35, -0.2);
  roof.castShadow = true;
  carGroup.add(roof);
}

function fixLoadedMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!m) continue;
      // FBX often sets color to black while albedo lives in map → everything reads as black.
      if (m.map) {
        m.map.colorSpace = THREE.SRGBColorSpace;
        if (m.color) m.color.setHex(0xffffff);
      }
      if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      // Some FBX exports mark meshes transparent with opacity 0 → invisible in color pass but still cast shadows.
      if (m.opacity !== undefined && m.opacity < 0.001) {
        m.opacity = 1;
        m.transparent = false;
      }
      m.needsUpdate = true;
    }
  });
}

/**
 * Scale FBX prop to a target height (m), center on XZ. Vertical placement is done in scatterEnvTemplate
 * with a world bounding box so random per-instance scale cannot float the model.
 */
function prepareEnvProp(root, targetHeight) {
  fixLoadedMaterials(root);
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  root.scale.setScalar(targetHeight / maxDim);
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(root);
  const c = new THREE.Vector3();
  b2.getCenter(c);
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y = 0;
  return root;
}

function loadFBX(loader, filename) {
  const url = new URL(filename, ENV_PACK_BASE).href;
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function scatterEnvTemplate(
  group,
  template,
  count,
  uMin,
  uMax,
  lateralMin,
  lateralMax,
  rand = Math.random,
  recordPlantHitboxes = false
) {
  const b = new THREE.Box3();
  for (let i = 0; i < count; i++) {
    const o = template.clone(true);
    const u = uMin + rand() * (uMax - uMin);
    const side = rand() < 0.5 ? -1 : 1;
    const lateral = side * (lateralMin + rand() * (lateralMax - lateralMin));
    const p = roadPointAt(u, lateral);
    const j = 2.2;
    const x = p.x + (rand() - 0.5) * j;
    const z = p.z + (rand() - 0.5) * j;
    o.rotation.y = rand() * Math.PI * 2;
    o.scale.multiplyScalar(0.88 + rand() * 0.28);
    o.position.set(x, 0, z);
    o.updateMatrixWorld(true);
    b.setFromObject(o);
    const h = terrainHeight(x, z);
    o.position.y = h - b.min.y;
    o.updateMatrixWorld(true);
    b.setFromObject(o);
    if (recordPlantHitboxes) {
      registerPlantCollider(o.position.x, o.position.z, plantFootprintRadiusFromBox(b));
    }
    group.add(o);
  }
}

/** Min |x − road center| so plants do not sit on the ribbon (half-width + margin). */
const PLANT_ROAD_CLEAR = 5.5 + 3.8;

/**
 * Random XZ for world scatter; if random draws keep landing on the narrow road ribbon, nudge sideways off-road.
 */
function pickWorldXZOffRoad(xMin, xMax, zMin, zMax, rand = Math.random) {
  let x = 0;
  let z = 0;
  for (let attempt = 0; attempt < 48; attempt++) {
    x = xMin + rand() * (xMax - xMin);
    z = zMin + rand() * (zMax - zMin);
    if (Math.abs(x - roadCenterX(z)) > PLANT_ROAD_CLEAR) return { x, z };
  }
  z = zMin + rand() * (zMax - zMin);
  const cx = roadCenterX(z);
  const side = rand() < 0.5 ? -1 : 1;
  const off = PLANT_ROAD_CLEAR + 2.5 + rand() * 62;
  x = THREE.MathUtils.clamp(cx + side * off, xMin, xMax);
  return { x, z };
}

function snapEnvToGround(group, obj, x, z, box) {
  obj.position.set(x, 0, z);
  obj.updateMatrixWorld(true);
  box.setFromObject(obj);
  obj.position.y = terrainHeight(x, z) - box.min.y;
  group.add(obj);
}

/**
 * World scatter for FBX plants: random template per instance (mixed species).
 */
function scatterRandomPlantTemplatesWorld(group, templates, count, xMin, xMax, zMin, zMax, rand = Math.random) {
  if (!templates.length) return;
  const b = new THREE.Box3();
  for (let i = 0; i < count; i++) {
    const o = templates[Math.floor(rand() * templates.length)].clone(true);
    const { x, z } = pickWorldXZOffRoad(xMin, xMax, zMin, zMax, rand);
    o.rotation.y = rand() * Math.PI * 2;
    o.scale.multiplyScalar(0.72 + rand() * 0.42);
    snapEnvToGround(group, o, x, z, b);
    o.updateMatrixWorld(true);
    b.setFromObject(o);
    registerPlantCollider(o.position.x, o.position.z, plantFootprintRadiusFromBox(b));
  }
}

/** Shared materials + base geometries for procedural plants (avoid thousands of unique materials). */
const _procFoliageMats = [];
const _procStemMats = [];
const PROC_GEO = {
  cone: new THREE.ConeGeometry(0.15, 0.42, 5),
  stem: new THREE.CylinderGeometry(0.022, 0.036, 0.14, 5),
  leaf: new THREE.SphereGeometry(0.09, 4, 4),
  blade: new THREE.CylinderGeometry(0.008, 0.016, 0.07, 4),
};
(() => {
  const r = mulberry32(0x71c4b103);
  for (let i = 0; i < 10; i++) {
    _procFoliageMats.push(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.22 + r() * 0.14, 0.32 + r() * 0.22, 0.26 + r() * 0.2),
        roughness: 0.91,
        metalness: 0.04,
        flatShading: true,
      })
    );
  }
  for (let i = 0; i < 3; i++) {
    _procStemMats.push(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.08 + r() * 0.05, 0.48, 0.19 + r() * 0.11),
        roughness: 0.91,
        metalness: 0.04,
        flatShading: true,
      })
    );
  }
})();

/**
 * Procedural low-poly plant — reuses shared geometries + material palette (cheap draw cost vs per-instance mats).
 */
function createProceduralPlant(rand) {
  const root = new THREE.Group();
  const kind = rand();
  const matF = () => _procFoliageMats[Math.floor(rand() * _procFoliageMats.length)];
  const matS = () => _procStemMats[Math.floor(rand() * _procStemMats.length)];

  if (kind < 0.34) {
    const cone = new THREE.Mesh(PROC_GEO.cone, matF());
    const sh = 0.75 + rand() * 0.55;
    const sr = 0.75 + rand() * 0.5;
    cone.scale.set(sr, sh, sr);
    cone.position.y = (0.42 * sh) / 2;
    cone.rotation.z = (rand() - 0.5) * 0.28;
    root.add(cone);
  } else if (kind < 0.68) {
    const stemH = 0.65 + rand() * 0.5;
    const stem = new THREE.Mesh(PROC_GEO.stem, matS());
    stem.scale.set(1, stemH, 1);
    stem.position.y = (0.14 * stemH) / 2;
    root.add(stem);
    const n = 2 + Math.floor(rand() * 3);
    const baseY = 0.14 * stemH;
    for (let i = 0; i < n; i++) {
      const leaf = new THREE.Mesh(PROC_GEO.leaf, matF());
      leaf.scale.setScalar(0.85 + rand() * 0.45);
      const ang = (i / n) * Math.PI * 2 + rand();
      leaf.position.set(Math.cos(ang) * 0.05, baseY + rand() * 0.06, Math.sin(ang) * 0.05);
      leaf.scale.y *= 0.55 + rand() * 0.25;
      root.add(leaf);
    }
  } else {
    const tufts = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < tufts; i++) {
      const blade = new THREE.Mesh(PROC_GEO.blade, matF());
      const sh = 0.75 + rand() * 0.65;
      blade.scale.set(1, sh, 1);
      blade.position.set((rand() - 0.5) * 0.1, (0.07 * sh) / 2, (rand() - 0.5) * 0.1);
      blade.rotation.x = (rand() - 0.5) * 0.9;
      blade.rotation.z = (rand() - 0.5) * 0.9;
      root.add(blade);
    }
  }

  root.traverse((ch) => {
    if (ch.isMesh) {
      ch.castShadow = true;
      ch.receiveShadow = true;
    }
  });
  return root;
}

function scatterProceduralPlantsWorld(group, count, xMin, xMax, zMin, zMax, rand = Math.random) {
  const b = new THREE.Box3();
  for (let i = 0; i < count; i++) {
    const o = createProceduralPlant(rand);
    const { x, z } = pickWorldXZOffRoad(xMin, xMax, zMin, zMax, rand);
    o.rotation.y = rand() * Math.PI * 2;
    o.scale.multiplyScalar(0.85 + rand() * 1.15);
    snapEnvToGround(group, o, x, z, b);
    o.updateMatrixWorld(true);
    b.setFromObject(o);
    registerPlantCollider(o.position.x, o.position.z, plantFootprintRadiusFromBox(b));
  }
}

const ROAD_MARKER_U0 = -2700;
const ROAD_MARKER_U1 = 2700;
const ROAD_MARKER_STEP = 45;
const MARKER_MAX = 120;

function rebuildRoadMarkers(markers, poleXZ) {
  poleXZ.length = 0;
  const dummy = new THREE.Object3D();
  let mi = 0;
  for (let u = ROAD_MARKER_U0; u < ROAD_MARKER_U1 && mi < MARKER_MAX; u += ROAD_MARKER_STEP) {
    const outward = mi % 2 === 0 ? -6.2 : 6.2;
    const { x, z } = roadPointAt(u, outward);
    poleXZ.push({ x, z });
    const y = terrainHeight(x, z) + 0.6;
    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    markers.setMatrixAt(mi++, dummy.matrix);
  }
  markers.count = mi;
  markers.instanceMatrix.needsUpdate = true;
}

/**
 * Scatter trees/bushes/rocks/plants from loaded FBX roots. Clears `envPropsGroup` first.
 * Call `loaded[i].clone(true)` before prepareEnvProp so originals stay reusable for regen.
 */
function populateLowPolyEnvironment(envPropsGroup, loaded, worldSeed) {
  while (envPropsGroup.children.length) envPropsGroup.remove(envPropsGroup.children[0]);
  clearPlantCollisionBuckets();
  const rand = mulberry32(worldSeed ^ 0x9e3779b9);
  let k = 0;
  const trees = [
    prepareEnvProp(loaded[k++].clone(true), 12),
    prepareEnvProp(loaded[k++].clone(true), 12.5),
    prepareEnvProp(loaded[k++].clone(true), 12),
  ];
  const bushes = [
    prepareEnvProp(loaded[k++].clone(true), 2.4),
    prepareEnvProp(loaded[k++].clone(true), 2.4),
    prepareEnvProp(loaded[k++].clone(true), 2.4),
  ];
  const rocks = [
    prepareEnvProp(loaded[k++].clone(true), 1.5),
    prepareEnvProp(loaded[k++].clone(true), 1.5),
    prepareEnvProp(loaded[k++].clone(true), 1.3),
    prepareEnvProp(loaded[k++].clone(true), 1.4),
  ];
  const grassClumps = [
    prepareEnvProp(loaded[k++].clone(true), 0.85),
    prepareEnvProp(loaded[k++].clone(true), 0.85),
  ];
  const logs = [
    prepareEnvProp(loaded[k++].clone(true), 1.2),
    prepareEnvProp(loaded[k++].clone(true), 1.2),
  ];
  const plantHeights = [1.15, 1.35, 1.55, 1.2, 1.7, 1.25, 1.45];
  shuffleInPlace(plantHeights, rand);
  const plants = plantHeights.map((h) =>
    prepareEnvProp(loaded[k++].clone(true), h * (0.88 + rand() * 0.26))
  );

  /** Arc length along road (world u) for roadside props — must stay huge or plants vanish after a few km. */
  const uSpan = 85000 + Math.floor(rand() * 45000);
  const u0 = -uSpan;
  const u1 = uSpan;
  /** Scale roadside density; cap keeps total env meshes reasonable for frame time. */
  const uRoadScale = Math.min(16, Math.max(8, Math.round(uSpan / 2800)));

  for (const t of trees) {
    scatterEnvTemplate(
      envPropsGroup,
      t,
      Math.max(1, Math.floor((10 + Math.floor(rand() * 18)) * uRoadScale)),
      u0,
      u1,
      13 + rand() * 5,
      30 + rand() * 12,
      rand
    );
  }
  for (const b of bushes) {
    scatterEnvTemplate(
      envPropsGroup,
      b,
      Math.max(1, Math.floor((9 + Math.floor(rand() * 16)) * uRoadScale)),
      u0,
      u1,
      7 + rand() * 3,
      11 + rand() * 7,
      rand
    );
  }
  for (const r of rocks) {
    scatterEnvTemplate(
      envPropsGroup,
      r,
      Math.max(1, Math.floor((5 + Math.floor(rand() * 10)) * uRoadScale)),
      u0,
      u1,
      8 + rand() * 3,
      20 + rand() * 8,
      rand
    );
  }
  for (const g of grassClumps) {
    scatterEnvTemplate(
      envPropsGroup,
      g,
      Math.max(1, Math.floor((8 + Math.floor(rand() * 14)) * uRoadScale)),
      u0,
      u1,
      6.5 + rand() * 3,
      10 + rand() * 5,
      rand
    );
  }
  for (const l of logs) {
    scatterEnvTemplate(
      envPropsGroup,
      l,
      Math.max(1, Math.floor((4 + Math.floor(rand() * 9)) * uRoadScale)),
      u0,
      u1,
      8 + rand() * 4,
      16 + rand() * 8,
      rand
    );
  }
  for (const p of plants) {
    scatterEnvTemplate(
      envPropsGroup,
      p,
      Math.max(1, Math.floor((18 + Math.floor(rand() * 22)) * uRoadScale)),
      u0,
      u1,
      12 + rand() * 4,
      32 + rand() * 8,
      rand,
      true
    );
  }
  const worldHalf = uSpan + 15000 + Math.floor(rand() * 25000);
  /** √(area) scaling for world fill — caps avoid 100k+ meshes (lag). */
  const areaKm2 = ((2 * worldHalf) / 1000) ** 2;
  const worldDensityMul = THREE.MathUtils.clamp(Math.sqrt(areaKm2 / 8800), 1.35, 2.1);
  const totalWorldPlants = Math.floor((4200 + Math.floor(rand() * 2600)) * worldDensityMul);
  const proceduralPlantCount = Math.floor((1400 + Math.floor(rand() * 1000)) * worldDensityMul);
  scatterRandomPlantTemplatesWorld(
    envPropsGroup,
    plants,
    totalWorldPlants,
    -worldHalf,
    worldHalf,
    -worldHalf,
    worldHalf,
    rand
  );
  scatterProceduralPlantsWorld(
    envPropsGroup,
    proceduralPlantCount,
    -worldHalf,
    worldHalf,
    -worldHalf,
    worldHalf,
    rand
  );
}

/**
 * Fit loaded car (GLB/GLTF): scale to ~4.2 m long, origin on ground center, +Z forward.
 */
function attachCarModel(carGroup, root) {
  fixLoadedMaterials(root);

  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const targetLen = 4.2;
  root.scale.setScalar(targetLen / maxDim);

  const bAfter = new THREE.Box3().setFromObject(root);
  const s2 = bAfter.getSize(new THREE.Vector3());
  root.rotation.y = (s2.x >= s2.z ? Math.PI / 2 : 0) + CAR_YAW_EXTRA;

  const b2 = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  b2.getCenter(center);
  root.position.sub(center);
  const b3 = new THREE.Box3().setFromObject(root);
  root.position.y -= b3.min.y;

  carGroup.add(root);
}

/**
 * When driving from inside the cabin, draw both sides of mesh faces so the interior shell is visible.
 * Restores original material.side when disabled.
 */
function setCarInteriorViewMode(carGroup, enabled) {
  carGroup.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.userData._fpvOrigSide === undefined) {
        m.userData._fpvOrigSide = m.side;
      }
      m.side = enabled ? THREE.DoubleSide : m.userData._fpvOrigSide;
      m.needsUpdate = true;
    }
  });
}

/** Car vs roadside pole collision (horizontal, metres). */
const CAR_POLE_RADIUS = 1.45;
/** Pole extent in XZ — marker box is 0.35 m wide (~0.18 m half); keep a small margin only. */
const POLE_HIT_R = 0.22;

/** Spatial grid for plant hit tests (avoid O(n) over every scattered plant). */
const PLANT_COLLISION_CELL = 32;
const plantCollisionBuckets = new Map();

function clearPlantCollisionBuckets() {
  plantCollisionBuckets.clear();
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} r Horizontal hit radius (m), from placed mesh footprint.
 */
function registerPlantCollider(x, z, r) {
  const ix = Math.floor(x / PLANT_COLLISION_CELL);
  const iz = Math.floor(z / PLANT_COLLISION_CELL);
  const key = ix + "," + iz;
  let cell = plantCollisionBuckets.get(key);
  if (!cell) {
    cell = [];
    plantCollisionBuckets.set(key, cell);
  }
  cell.push({ x, z, r });
}

function plantFootprintRadiusFromBox(box) {
  const sz = box.getSize(new THREE.Vector3());
  const hr = 0.5 * Math.max(sz.x, sz.z, 0.001) * 0.78;
  return THREE.MathUtils.clamp(hr, 0.28, 2.5);
}

/**
 * Push the car out of poles and strip inward velocity so head-on hits stop instead of sliding through.
 */
function resolvePoleCollisions(px, pz, vx, vz, poleXZ) {
  let x = px;
  let z = pz;
  let vx2 = vx;
  let vz2 = vz;
  for (let i = 0; i < poleXZ.length; i++) {
    const px0 = poleXZ[i].x;
    const pz0 = poleXZ[i].z;
    const dx = x - px0;
    const dz = z - pz0;
    const d = Math.hypot(dx, dz);
    const minD = CAR_POLE_RADIUS + POLE_HIT_R;
    if (d < minD && d > 1e-6) {
      const nx = dx / d;
      const nz = dz / d;
      const vn = vx2 * nx + vz2 * nz;
      if (vn < 0) {
        vx2 -= vn * nx;
        vz2 -= vn * nz;
        vx2 *= 0.22;
        vz2 *= 0.22;
      }
      const push = (minD - d) / d;
      x += dx * push;
      z += dz * push;
    }
  }
  return { x, z, vx: vx2, vz: vz2 };
}

/**
 * Same response as poles — plants use variable horizontal radius from mesh bounds.
 */
function resolvePlantCollisions(px, pz, vx, vz) {
  let x = px;
  let z = pz;
  let vx2 = vx;
  let vz2 = vz;
  const cx = Math.floor(x / PLANT_COLLISION_CELL);
  const cz = Math.floor(z / PLANT_COLLISION_CELL);
  for (let dxi = -1; dxi <= 1; dxi++) {
    for (let dzi = -1; dzi <= 1; dzi++) {
      const cell = plantCollisionBuckets.get(cx + dxi + "," + (cz + dzi));
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) {
        const { x: px0, z: pz0, r: pr } = cell[i];
        const dx = x - px0;
        const dz = z - pz0;
        const d = Math.hypot(dx, dz);
        const minD = CAR_POLE_RADIUS + pr;
        if (d < minD && d > 1e-6) {
          const nx = dx / d;
          const nz = dz / d;
          const vn = vx2 * nx + vz2 * nz;
          if (vn < 0) {
            vx2 -= vn * nx;
            vz2 -= vn * nz;
            vx2 *= 0.2;
            vz2 *= 0.2;
          }
          const push = (minD - d) / d;
          x += dx * push;
          z += dz * push;
        }
      }
    }
  }
  return { x, z, vx: vx2, vz: vz2 };
}

/**
 * Extra steering + speed scaling for autopilot — uses the same pole list and plant spatial grid as physics.
 * Steers toward open space around roadside hazards (ahead cone + a forward lookahead sample).
 */
function autopilotObstacleFactors(px, pz, heading, speed, poleXZ) {
  const fs = Math.sin(heading);
  const fc = Math.cos(heading);
  const maxR = 32;
  const aheadMin = 0.1;
  let turnSum = 0;
  let minGapFore = 80;

  function sampleAt(pxq, pzq, ox, oz, hitR) {
    const dx = ox - pxq;
    const dz = oz - pzq;
    const d = Math.hypot(dx, dz);
    if (d < 0.12 || d > maxR) return;
    const clearance = CAR_POLE_RADIUS + hitR + 2.05;
    const fwdDot = (fs * dx + fc * dz) / d;
    if (fwdDot < aheadMin) return;
    const cross = fs * dz - fc * dx;
    if (cross === 0) return;
    const side = Math.sign(cross);
    const gap = d - clearance;
    const str = Math.max(0, 1 - gap / 15);
    const w = str * str * (0.55 + 0.45 * fwdDot);
    turnSum += side * w * 2.25;
    if (fwdDot > 0.38) minGapFore = Math.min(minGapFore, gap);
  }

  function sampleAll(pxq, pzq) {
    for (let i = 0; i < poleXZ.length; i++) {
      const p = poleXZ[i];
      sampleAt(pxq, pzq, p.x, p.z, POLE_HIT_R);
    }
    const ix = Math.floor(pxq / PLANT_COLLISION_CELL);
    const iz = Math.floor(pzq / PLANT_COLLISION_CELL);
    for (let dxi = -2; dxi <= 2; dxi++) {
      for (let dzi = -2; dzi <= 2; dzi++) {
        const cell = plantCollisionBuckets.get(ix + dxi + "," + (iz + dzi));
        if (!cell) continue;
        for (let j = 0; j < cell.length; j++) {
          const { x, z, r } = cell[j];
          sampleAt(pxq, pzq, x, z, r);
        }
      }
    }
  }

  sampleAll(px, pz);
  const look = 9 + Math.min(Math.abs(speed) * 0.95, 19);
  sampleAll(px + fs * look, pz + fc * look);

  const turnDelta = THREE.MathUtils.clamp(turnSum, -0.78, 0.78);
  const speedMul =
    minGapFore < 15
      ? THREE.MathUtils.clamp(
          THREE.MathUtils.lerp(0.34, 1, THREE.MathUtils.smoothstep(minGapFore, -2, 12)),
          0.34,
          1
        )
      : 1;
  return { turnDelta, speedMul };
}

function main() {
  let savedCheckpoint = null;
  try {
    const raw = localStorage.getItem(CHECKPOINT_STORAGE_KEY);
    if (raw) savedCheckpoint = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const restoredFromCheckpoint =
    savedCheckpoint &&
    savedCheckpoint.v === 1 &&
    typeof savedCheckpoint.worldSeed === "number" &&
    typeof savedCheckpoint.px === "number" &&
    typeof savedCheckpoint.pz === "number" &&
    Number.isFinite(savedCheckpoint.px) &&
    Number.isFinite(savedCheckpoint.pz);

  let worldSeed = restoredFromCheckpoint
    ? savedCheckpoint.worldSeed >>> 0
    : ((Date.now() >>> 0) ^ (Math.random() * 0xffffffff)) >>> 0;
  applyWorldTerrainSeed(worldSeed);

  const speedValEl = document.getElementById("speed-val");
  const distanceValEl = document.getElementById("distance-val");
  const statusCameraEl = document.getElementById("status-camera");
  const statusMouseEl = document.getElementById("status-mouse");
  const statusAutopilotEl = document.getElementById("status-autopilot");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.skyBottom);
  const fogBase = 0.00095;
  scene.fog = new THREE.FogExp2(COLORS.fog, fogBase);

  const CHASE_NEAR = 0.5;
  const FPV_NEAR = 0.06;
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, CHASE_NEAR, 2500);
  camera.position.set(0, 12, 18);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  document.body.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(COLORS.skyTop, COLORS.grassDark, 0.95);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0xffffff, 0.38));
  const sun = new THREE.DirectionalLight(0xfff5e8, 1.15);
  sun.position.set(80, 120, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.left = -200;
  sun.shadow.camera.right = 200;
  sun.shadow.camera.top = 200;
  sun.shadow.camera.bottom = -200;
  scene.add(sun);

  const sunDiscDir = new THREE.Vector3().copy(sun.position).normalize();
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(22, 24, 24),
    new THREE.MeshBasicMaterial({
      color: 0xfff2c5,
      fog: false,
      depthTest: false,
      depthWrite: false,
    })
  );
  sunDisc.renderOrder = -1;
  sunDisc.frustumCulled = false;
  scene.add(sunDisc);

  const landMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    flatShading: false,
  });
  const terrainPool = createTerrainTilePool(scene, landMat);
  terrainPool.updateTerrainTiles(0, 0);

  const roadMat = new THREE.MeshStandardMaterial({
    color: COLORS.road,
    roughness: 0.92,
    metalness: 0.05,
    flatShading: false,
  });
  const infiniteRoad = createInfiniteRoadPool(scene, roadMat);
  infiniteRoad.updateRoadChunks(0);

  // Subtle roadside markers (low boxes) — suggestion of “place” without copying assets
  const markerGeo = new THREE.BoxGeometry(0.35, 1.2, 0.35);
  const markerMat = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.8 });
  const markers = new THREE.InstancedMesh(markerGeo, markerMat, MARKER_MAX);
  /** World XZ for pole collision (same as marker instances). */
  const poleXZ = [];
  rebuildRoadMarkers(markers, poleXZ);
  markers.castShadow = true;
  scene.add(markers);

  const envPropsGroup = new THREE.Group();
  envPropsGroup.name = "lowPolyEnv";
  scene.add(envPropsGroup);

  const fbxLoader = new FBXLoader();
  const envPackFiles = [
    "Tree_1.fbx",
    "Tree_2.fbx",
    "Tree_3.fbx",
    "Bush_1.fbx",
    "Bush_2.fbx",
    "Bush_3.fbx",
    "Rock_1.fbx",
    "Rock_2.fbx",
    "Rock_3.fbx",
    "Rock_4.fbx",
    "Grass_1.fbx",
    "Grass_2.fbx",
    "Log_1.fbx",
    "Log_2.fbx",
    "Plant_1.fbx",
    "Plant_2.fbx",
    "Plant_3.fbx",
    "Plant_4.fbx",
    "Plant_5.fbx",
    "Plant_6.fbx",
    "Plant_7.fbx",
  ];
  let envFBXLoaded = null;
  Promise.all(envPackFiles.map((f) => loadFBX(fbxLoader, f)))
    .then((loaded) => {
      envFBXLoaded = loaded;
      populateLowPolyEnvironment(envPropsGroup, loaded, worldSeed);
    })
    .catch((err) => {
      console.warn("Low Poly Environment Pack failed to load:", err);
    });

  const carGroup = new THREE.Group();
  scene.add(carGroup);
  addPlaceholderCar(carGroup);

  let speed = 0;
  /** Smoothed |speed|×3.6 for the km/h HUD (reduces jitter from physics / collisions). */
  let speedDisplayKmh = 0;
  /** Distance travelled along the ground (km); uses world motion including WORLD_SPEED_MULT. */
  let odometerKm = 0;
  const accel = 48;
  const friction = 0.989;
  let steer = 0;
  let heading = 0;
  let px = roadCenterX(0);
  let pz = 0;
  let carY = vehicleGroundHeight(px, pz) + CAR_HEIGHT;
  let vy = 0;
  /** Visual body height (suspension smoothing); physics uses carY. */
  let vehicleBodyY = carY;
  /** Smoothed road normal for vehicle pitch/roll (avoids jitter on bumps). */
  const vehicleUpSmoothed = new THREE.Vector3(0, 1, 0);
  const _vehicleSurfaceUpTarget = new THREE.Vector3();
  vehicleSurfaceUp(px, pz, vehicleUpSmoothed);
  quaternionFromRoadHeading(heading, vehicleUpSmoothed, _carTargetQuat);
  carGroup.quaternion.copy(_carTargetQuat);

  /** Persisted while driving on-road (throttled). Restores world + pose on next visit. */
  function saveCheckpointToStorage() {
    try {
      localStorage.setItem(
        CHECKPOINT_STORAGE_KEY,
        JSON.stringify({
          v: 1,
          worldSeed,
          px,
          pz,
          heading,
          speed,
          odometerKm,
        })
      );
    } catch {
      /* private mode / quota */
    }
  }

  let checkpointRoadTimer = 0;

  /** Orbit camera around the car (radians): yaw around Y, pitch up/down from default chase. */
  let camOrbitYaw = 0;
  let camOrbitPitch = 0;
  /** Wheel zoom multiplier applied to chase distance (lerped). */
  let camDistMult = 1;
  const CAM_ORBIT_SENS = 0.006;
  /** Wider pitch arc + unbounded yaw = full 360° orbit around the car (yaw clamp none). */
  const CAM_PITCH_MIN = -1.38;
  const CAM_PITCH_MAX = 1.38;
  const CAM_DIST_MULT_MIN = 0.55;
  const CAM_DIST_MULT_MAX = 1.55;
  const CAM_LOOK_HEIGHT = 1.2;

  const camBack = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const camDesired = new THREE.Vector3();
  const camUp = new THREE.Vector3(0, 1, 0);
  /** Chase camera stabilizer: damp vertical jitter (hills/bumps) while keeping horizontal snappy. */
  const camStableLook = new THREE.Vector3();
  const camStablePos = new THREE.Vector3();
  let camStabilizerReady = false;
  const CAM_STAB_XZ = 14;
  const CAM_STAB_Y = 5.2;

  if (restoredFromCheckpoint) {
    px = savedCheckpoint.px;
    pz = savedCheckpoint.pz;
    heading = savedCheckpoint.heading ?? 0;
    speed = THREE.MathUtils.clamp(savedCheckpoint.speed ?? 0, -MAX_REVERSE_SPEED, TURBO_MAX_SPEED);
    speedDisplayKmh = Math.abs(speed) * 3.6;
    odometerKm = Math.max(0, savedCheckpoint.odometerKm ?? 0);
    steer = 0;
    carY = vehicleGroundHeight(px, pz) + CAR_HEIGHT;
    vehicleBodyY = carY;
    vy = 0;
    vehicleSurfaceUp(px, pz, vehicleUpSmoothed);
    quaternionFromRoadHeading(heading, vehicleUpSmoothed, _carTargetQuat);
    carGroup.quaternion.copy(_carTargetQuat);
    camStabilizerReady = false;
    terrainPool.invalidate();
  }

  /** Free camera (T): fly and look; world tiles follow the camera. */
  let freeCamActive = false;
  const freeCamPos = new THREE.Vector3();
  let freeCamYaw = 0;
  let freeCamPitch = 0;
  const freeCamFwdH = new THREE.Vector3();
  const freeCamRightH = new THREE.Vector3();

  /**
   * First person: driver’s eye in car local space (+Y up, +Z forward along the road).
   * Car origin ≈ ground, bbox centered on XZ — values place the view inside the cabin (LHD: −X).
   */
  /** FPV eyepoint in car local space (+Z = forward, metres). */
  const fpvEyeLocal = new THREE.Vector3(-0.44, 0.9, 1);
  let firstPersonActive = false;

  const loader = new GLTFLoader();
  loader.setPath(CAR_FOLDER);
  loader.load(
    CAR_FILE,
    (gltf) => {
      while (carGroup.children.length) carGroup.remove(carGroup.children[0]);
      attachCarModel(carGroup, gltf.scene);
      if (firstPersonActive) {
        setCarInteriorViewMode(carGroup, true);
        camera.near = FPV_NEAR;
        camera.updateProjectionMatrix();
      }
    },
    undefined,
    (err) => {
      console.warn("Car GLB failed to load, keeping placeholder:", err);
    }
  );

  const keys = {};
  /** Lane-keeping + cruise; P toggles. WASD/arrows override and turn autopilot off. */
  let autopilotActive = false;
  /** M toggles; when false, canvas X does not steer (keyboard still can). */
  let mouseSteerEnabled = true;
  function syncAutopilotUi() {
    if (!statusAutopilotEl) return;
    statusAutopilotEl.textContent = autopilotActive ? "Autopilot · On" : "Autopilot · Off";
    statusAutopilotEl.className = `status-badge ${autopilotActive ? "status-badge--on" : "status-badge--off"}`;
  }
  function syncMouseSteerUi() {
    if (!statusMouseEl) return;
    statusMouseEl.textContent = mouseSteerEnabled ? "Mouse steer · On" : "Mouse steer · Off";
    statusMouseEl.className = `status-badge ${mouseSteerEnabled ? "status-badge--on" : "status-badge--off"}`;
  }
  function syncCameraModeUi() {
    if (!statusCameraEl) return;
    if (freeCamActive) {
      statusCameraEl.textContent = "Free camera · Alt fine · Shift fast · WASD · Space/C ↑↓ · T exit";
      statusCameraEl.className = "status-badge status-badge--camera-free";
    } else if (firstPersonActive) {
      statusCameraEl.textContent = "First person · V chase";
      statusCameraEl.className = "status-badge status-badge--camera-fpv";
    } else {
      statusCameraEl.textContent = "Chase camera · 360° orbit · wheel zoom";
      statusCameraEl.className = "status-badge status-badge--camera-chase";
    }
  }
  syncAutopilotUi();
  syncMouseSteerUi();
  syncCameraModeUi();
  const loadingOverlayEl = document.getElementById("loading-overlay");
  const pauseBtn = document.getElementById("pause-btn");
  const newWorldBtn = document.getElementById("new-world-btn");
  const NEW_WORLD_LOADING_MS = 3000;
  let worldGenInputLocked = false;
  let paused = false;

  function syncPauseUi() {
    if (pauseBtn) {
      pauseBtn.textContent = paused ? "Resume" : "Pause";
      pauseBtn.setAttribute("aria-pressed", paused ? "true" : "false");
    }
  }
  syncPauseUi();

  function generateNewWorld() {
    if (!envFBXLoaded || worldGenInputLocked) return;
    worldGenInputLocked = true;
    paused = false;
    syncPauseUi();
    for (const k of Object.keys(keys)) delete keys[k];
    if (pauseBtn) pauseBtn.disabled = true;
    if (newWorldBtn) newWorldBtn.disabled = true;
    if (loadingOverlayEl) {
      loadingOverlayEl.classList.add("is-visible");
      loadingOverlayEl.setAttribute("aria-hidden", "false");
    }
    const t0 = performance.now();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        worldSeed = ((Date.now() >>> 0) ^ (Math.random() * 0xffffffff)) >>> 0;
        try {
          localStorage.removeItem(CHECKPOINT_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        applyWorldTerrainSeed(worldSeed);
        rebuildRoadMarkers(markers, poleXZ);
        populateLowPolyEnvironment(envPropsGroup, envFBXLoaded, worldSeed);
        pz = speed = steer = heading = 0;
        speedDisplayKmh = 0;
        odometerKm = 0;
        px = roadCenterX(0);
        carY = vehicleGroundHeight(px, pz) + CAR_HEIGHT;
        vehicleBodyY = carY;
        vehicleSurfaceUp(px, pz, vehicleUpSmoothed);
        quaternionFromRoadHeading(heading, vehicleUpSmoothed, _carTargetQuat);
        carGroup.quaternion.copy(_carTargetQuat);
        vy = 0;
        camOrbitYaw = camOrbitPitch = 0;
        camDistMult = 1;
        camStabilizerReady = false;
        checkpointRoadTimer = 0;
        firstPersonActive = false;
        autopilotActive = false;
        syncAutopilotUi();
        setCarInteriorViewMode(carGroup, false);
        camera.near = CHASE_NEAR;
        camera.updateProjectionMatrix();
        if (freeCamActive) freeCamActive = false;
        syncCameraModeUi();
        terrainPool.invalidate();
        infiniteRoad.updateRoadChunks(0);

        const elapsed = performance.now() - t0;
        const remaining = Math.max(0, NEW_WORLD_LOADING_MS - elapsed);
        setTimeout(() => {
          if (loadingOverlayEl) {
            loadingOverlayEl.classList.remove("is-visible");
            loadingOverlayEl.setAttribute("aria-hidden", "true");
          }
          worldGenInputLocked = false;
          if (pauseBtn) pauseBtn.disabled = false;
          if (newWorldBtn) newWorldBtn.disabled = false;
        }, remaining);
      });
    });
  }

  addEventListener("keydown", (e) => {
    if (worldGenInputLocked) {
      e.preventDefault();
      return;
    }
    if (e.code === "Escape" && !e.repeat) {
      paused = !paused;
      syncPauseUi();
      e.preventDefault();
      return;
    }
    keys[e.code] = true;
    if (e.code === "KeyG" && !e.repeat) {
      generateNewWorld();
      e.preventDefault();
    }
    if (e.code === "KeyV" && !e.repeat && !freeCamActive) {
      firstPersonActive = !firstPersonActive;
      camStabilizerReady = false;
      setCarInteriorViewMode(carGroup, firstPersonActive);
      camera.near = firstPersonActive ? FPV_NEAR : CHASE_NEAR;
      camera.updateProjectionMatrix();
      syncCameraModeUi();
      e.preventDefault();
    }
    if (e.code === "KeyT" && !e.repeat) {
      freeCamActive = !freeCamActive;
      if (freeCamActive) {
        firstPersonActive = false;
        setCarInteriorViewMode(carGroup, false);
        camera.near = CHASE_NEAR;
        camera.updateProjectionMatrix();
        freeCamPos.copy(camera.position);
        const eul = new THREE.Euler(0, 0, 0, "YXZ");
        eul.setFromQuaternion(camera.quaternion, "YXZ");
        freeCamYaw = eul.y;
        freeCamPitch = eul.x;
      } else {
        camStabilizerReady = false;
      }
      syncCameraModeUi();
      e.preventDefault();
    }
    if (e.code === "KeyP" && !e.repeat) {
      autopilotActive = !autopilotActive;
      if (autopilotActive) {
        mouseSteerEnabled = false;
        syncMouseSteerUi();
      }
      syncAutopilotUi();
      e.preventDefault();
    }
    if (e.code === "KeyM" && !e.repeat) {
      mouseSteerEnabled = !mouseSteerEnabled;
      syncMouseSteerUi();
      e.preventDefault();
    }
    if (e.code === "KeyR") {
      try {
        localStorage.removeItem(CHECKPOINT_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      pz = speed = steer = heading = 0;
      speedDisplayKmh = 0;
      odometerKm = 0;
      px = roadCenterX(0);
      carY = vehicleGroundHeight(px, pz) + CAR_HEIGHT;
      vehicleBodyY = carY;
      vehicleSurfaceUp(px, pz, vehicleUpSmoothed);
      quaternionFromRoadHeading(heading, vehicleUpSmoothed, _carTargetQuat);
      carGroup.quaternion.copy(_carTargetQuat);
      vy = 0;
      camOrbitYaw = camOrbitPitch = 0;
      camDistMult = 1;
      camStabilizerReady = false;
      checkpointRoadTimer = 0;
      firstPersonActive = false;
      autopilotActive = false;
      syncAutopilotUi();
      setCarInteriorViewMode(carGroup, false);
      camera.near = CHASE_NEAR;
      camera.updateProjectionMatrix();
      if (freeCamActive) freeCamActive = false;
      syncCameraModeUi();
      terrainPool.invalidate();
    }
  });
  addEventListener("keyup", (e) => {
    if (worldGenInputLocked) {
      e.preventDefault();
      return;
    }
    keys[e.code] = false;
  });

  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      if (worldGenInputLocked) return;
      paused = !paused;
      syncPauseUi();
      pauseBtn.blur();
    });
    pauseBtn.addEventListener("keydown", (e) => {
      if (e.code === "Space") e.preventDefault();
    });
  }
  if (newWorldBtn) {
    newWorldBtn.addEventListener("click", () => {
      if (worldGenInputLocked) return;
      generateNewWorld();
      newWorldBtn.blur();
    });
    /** Space activates a focused button — block so Space stays free for free-cam / driving. */
    newWorldBtn.addEventListener("keydown", (e) => {
      if (e.code === "Space") e.preventDefault();
    });
  }

  let camDragging = false;
  let camLastX = 0;
  let camLastY = 0;
  /** −1..1 from canvas pointer X (center = straight); cleared while LMB orbits camera. */
  let mouseSteer = 0;
  const canvas = renderer.domElement;
  function setMouseSteerFromClientXY(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      mouseSteer = 0;
      return;
    }
    const nx = (clientX - rect.left) / rect.width;
    /** Right side of canvas = steer left; left side = steer right (reversed X). */
    let t = (0.5 - nx) * 2;
    if (Math.abs(t) < MOUSE_STEER_DEAD) {
      mouseSteer = 0;
      return;
    }
    const s = Math.sign(t);
    t = THREE.MathUtils.clamp((Math.abs(t) - MOUSE_STEER_DEAD) / (1 - MOUSE_STEER_DEAD) * s, -1, 1);
    mouseSteer = t;
  }
  canvas.tabIndex = 0;
  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerdown", (e) => {
    if (worldGenInputLocked) {
      e.preventDefault();
      return;
    }
    canvas.focus();
    if (e.button !== 0) return;
    camDragging = true;
    mouseSteer = 0;
    canvas.style.cursor = "grabbing";
    camLastX = e.clientX;
    camLastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (worldGenInputLocked) return;
    if (camDragging) {
      const dx = e.clientX - camLastX;
      const dy = e.clientY - camLastY;
      camLastX = e.clientX;
      camLastY = e.clientY;
      if (freeCamActive) {
        const orbitSens =
          keys["AltLeft"] || keys["AltRight"] ? CAM_ORBIT_SENS * 0.32 : CAM_ORBIT_SENS;
        freeCamYaw -= dx * orbitSens;
        freeCamPitch = THREE.MathUtils.clamp(
          freeCamPitch - dy * orbitSens,
          -Math.PI / 2 + 0.06,
          Math.PI / 2 - 0.06
        );
      } else if (!firstPersonActive) {
        camOrbitYaw -= dx * CAM_ORBIT_SENS;
        camOrbitPitch = THREE.MathUtils.clamp(
          camOrbitPitch - dy * CAM_ORBIT_SENS,
          CAM_PITCH_MIN,
          CAM_PITCH_MAX
        );
      }
      return;
    }
    setMouseSteerFromClientXY(e.clientX, e.clientY);
  });
  canvas.addEventListener("pointerleave", (e) => {
    if (worldGenInputLocked || camDragging) return;
    mouseSteer = 0;
  });
  function endCamDrag(e) {
    if (worldGenInputLocked) {
      camDragging = false;
      return;
    }
    if (!camDragging) return;
    camDragging = false;
    canvas.style.cursor = "grab";
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (e.clientX !== undefined) {
      setMouseSteerFromClientXY(e.clientX, e.clientY);
    }
  }
  canvas.addEventListener("pointerup", endCamDrag);
  canvas.addEventListener("pointercancel", endCamDrag);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (worldGenInputLocked) return;
    if (freeCamActive || firstPersonActive) return;
    const step = Math.sign(e.deltaY) * 0.08;
    camDistMult = THREE.MathUtils.clamp(
      camDistMult + step,
      CAM_DIST_MULT_MIN,
      CAM_DIST_MULT_MAX
    );
  }, { passive: false });

  function updateFreeCam(dt) {
    camera.rotation.order = "YXZ";
    camera.rotation.x = freeCamPitch;
    camera.rotation.y = freeCamYaw;
    camera.rotation.z = 0;

    freeCamFwdH.set(0, 0, -1).applyQuaternion(camera.quaternion);
    freeCamFwdH.y = 0;
    if (freeCamFwdH.lengthSq() > 1e-10) freeCamFwdH.normalize();
    else freeCamFwdH.set(-Math.sin(freeCamYaw), 0, -Math.cos(freeCamYaw));

    freeCamRightH.set(1, 0, 0).applyQuaternion(camera.quaternion);
    freeCamRightH.y = 0;
    if (freeCamRightH.lengthSq() > 1e-10) freeCamRightH.normalize();

    /** Default = moderate; Alt = fine / Shift = fast (Shift wins if both, for snappy exits). */
    const kAlt = keys["AltLeft"] || keys["AltRight"];
    const kShift = keys["ShiftLeft"] || keys["ShiftRight"];
    let moveSpeed = 22;
    if (kShift) moveSpeed = 54;
    else if (kAlt) moveSpeed = 6.8;
    let mx = 0;
    let mz = 0;
    let my = 0;
    if (keys["KeyW"]) {
      mx += freeCamFwdH.x;
      mz += freeCamFwdH.z;
    }
    if (keys["KeyS"]) {
      mx -= freeCamFwdH.x;
      mz -= freeCamFwdH.z;
    }
    if (keys["KeyA"]) {
      mx -= freeCamRightH.x;
      mz -= freeCamRightH.z;
    }
    if (keys["KeyD"]) {
      mx += freeCamRightH.x;
      mz += freeCamRightH.z;
    }
    if (keys["Space"]) my += 1;
    if (keys["KeyC"] || keys["ControlLeft"]) my -= 1;

    const hlen = Math.hypot(mx, mz);
    if (hlen > 1e-6) {
      mx /= hlen;
      mz /= hlen;
    }

    freeCamPos.x += mx * moveSpeed * dt;
    freeCamPos.z += mz * moveSpeed * dt;
    freeCamPos.y += my * moveSpeed * dt;

    const ground = terrainHeight(freeCamPos.x, freeCamPos.z) + 1.1;
    if (freeCamPos.y < ground) freeCamPos.y = ground;

    camera.position.copy(freeCamPos);
    camera.rotation.order = "YXZ";
    camera.rotation.x = freeCamPitch;
    camera.rotation.y = freeCamYaw;
    camera.rotation.z = 0;

    camera.fov = 62;
    camera.updateProjectionMatrix();
    if (scene.fog) scene.fog.density = fogBase;
  }

  function updateCar(dt) {
    if (worldGenInputLocked) {
      infiniteRoad.updateRoadChunks(pz);
      terrainPool.updateTerrainTiles(px, pz);
      return;
    }

    /** In free cam, WASD/Space/Shift steer the camera — keep sim running without double-binding those keys to the car. */
    const carKeys = !freeCamActive;

    let forward = carKeys
      ? (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0) - (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0)
      : 0;
    // A / ← = turn left (negative heading); D / → = turn right (positive heading).
    const turnKeys = carKeys
      ? (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0) - (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0)
      : 0;
    let turn = THREE.MathUtils.clamp(
      turnKeys + (mouseSteerEnabled && carKeys ? mouseSteer : 0),
      -1,
      1
    );

    const manualDrive =
      carKeys &&
      (keys["KeyW"] ||
        keys["ArrowUp"] ||
        keys["KeyS"] ||
        keys["ArrowDown"] ||
        keys["KeyA"] ||
        keys["ArrowLeft"] ||
        keys["KeyD"] ||
        keys["ArrowRight"] ||
        keys["Space"] ||
        (mouseSteerEnabled && Math.abs(mouseSteer) > 0.04));
    if (manualDrive && autopilotActive) {
      autopilotActive = false;
      syncAutopilotUi();
    }

    let turbo = carKeys && (keys["ShiftLeft"] || keys["ShiftRight"]);
    if (autopilotActive && !manualDrive) {
      const ap = computeAutopilotInput(px, pz, heading, speed, poleXZ);
      forward = ap.forward;
      turn = ap.turn;
      turbo = ap.turbo || (carKeys && (keys["ShiftLeft"] || keys["ShiftRight"]));
    }

    const speedAbs = Math.abs(speed);
    if (speedAbs < STEER_STANDSTILL_THRESHOLD) {
      steer = THREE.MathUtils.lerp(steer, 0, dt * 12);
    } else {
      steer = THREE.MathUtils.lerp(steer, turn * 0.65, dt * 4);
      const v = Math.max(speedAbs, STEER_RATE_SPEED_FLOOR);
      const t = THREE.MathUtils.clamp(speedAbs / MAX_SPEED, 0, 1.25);
      const speedSensitivity = 0.72 + 1.28 * t * t;
      const steerRate = STEER_RATE_BASE * v * speedSensitivity;
      heading += steer * steerRate;
    }
    speed += forward * accel * dt;
    speed *= friction;
    if (carKeys && keys["Space"]) {
      const absSp = Math.abs(speed);
      const newAbs = Math.max(0, absSp - BRAKE_DECEL * dt);
      speed = (absSp < 1e-8 ? 0 : Math.sign(speed)) * newAbs;
    }
    const forwardCap = turbo ? TURBO_MAX_SPEED : MAX_SPEED;
    speed = THREE.MathUtils.clamp(speed, -MAX_REVERSE_SPEED, forwardCap);

    let vx = Math.sin(heading) * speed * WORLD_SPEED_MULT;
    let vz = Math.cos(heading) * speed * WORLD_SPEED_MULT;
    const px0 = px;
    const pz0 = pz;
    px += vx * dt;
    pz += vz * dt;
    for (let pass = 0; pass < 4; pass++) {
      let r = resolvePoleCollisions(px, pz, vx, vz, poleXZ);
      r = resolvePlantCollisions(r.x, r.z, r.vx, r.vz);
      px = r.x;
      pz = r.z;
      vx = r.vx;
      vz = r.vz;
    }
    const fwdx = Math.sin(heading);
    const fwdz = Math.cos(heading);
    const along = vx * fwdx + vz * fwdz;
    speed = along / WORLD_SPEED_MULT;
    if (Math.abs(speed) < 0.02) speed = 0;

    odometerKm += Math.hypot(px - px0, pz - pz0) / 1000;

    const groundY = vehicleGroundHeight(px, pz) + CAR_HEIGHT;
    vy += GRAVITY * dt;
    carY += vy * dt;
    if (carY <= groundY) {
      carY = groundY;
      vy = 0;
    }

    const airborne = carY > groundY + 0.06;
    const suspRate = airborne ? 1 - Math.exp(-22 * dt) : 1 - Math.exp(-14 * dt);
    vehicleBodyY = THREE.MathUtils.lerp(vehicleBodyY, carY, suspRate);

    if (!freeCamActive && isOnRoadForCheckpoint(px, pz) && Math.abs(speed) > 0.8) {
      checkpointRoadTimer += dt;
      if (checkpointRoadTimer >= CHECKPOINT_SAVE_INTERVAL_S) {
        checkpointRoadTimer = 0;
        saveCheckpointToStorage();
      }
    } else {
      checkpointRoadTimer = 0;
    }

    vehicleSurfaceUp(px, pz, _vehicleSurfaceUpTarget);
    const upLerp = 1 - Math.exp(-14 * dt);
    vehicleUpSmoothed.lerp(_vehicleSurfaceUpTarget, upLerp);
    vehicleUpSmoothed.normalize();

    quaternionFromRoadHeading(heading, vehicleUpSmoothed, _carTargetQuat);
    const quatLerp = 1 - Math.exp(-10 * dt);
    carGroup.quaternion.slerp(_carTargetQuat, quatLerp);

    carGroup.position.set(px, vehicleBodyY, pz);

    const absS = Math.abs(speed);
    const speedT = Math.min(absS / forwardCap, 1);

    if (freeCamActive) {
      updateFreeCam(dt);
    } else if (firstPersonActive) {
      camera.up.copy(vehicleUpSmoothed);
      camBack.set(0, 0, 1).applyQuaternion(carGroup.quaternion);
      camBack.normalize();

      camera.position.copy(fpvEyeLocal).applyQuaternion(carGroup.quaternion).add(carGroup.position);
      camLook.copy(camera.position).add(camBack);
      camera.lookAt(camLook);

      camera.fov = THREE.MathUtils.lerp(72, 82, speedT * speedT);
      camera.updateProjectionMatrix();
    } else {
      camera.up.set(0, 1, 0);
      // Tighter chase + wider FOV at speed = stronger sense of motion (still true km/h).
      const camDist = THREE.MathUtils.lerp(17, 11.5, speedT * speedT) * camDistMult;
      const camH = 6.2 + Math.min(speed, forwardCap) * 0.038;
      camLook.set(px, vehicleBodyY + CAM_LOOK_HEIGHT, pz);
      // Default chase: behind the car (opposite velocity in XZ).
      camBack.set(-Math.sin(heading), 0, -Math.cos(heading));
      camBack.applyAxisAngle(camUp, camOrbitYaw);
      camRight.crossVectors(camUp, camBack);
      if (camRight.lengthSq() < 1e-10) camRight.set(1, 0, 0);
      else camRight.normalize();
      camBack.applyAxisAngle(camRight, camOrbitPitch);
      camBack.normalize();
      camDesired.copy(camLook).addScaledVector(camBack, camDist);
      let cx = camDesired.x;
      let cy = camDesired.y;
      const cz = camDesired.z;
      const groundCam = terrainHeight(cx, cz) + camH;
      if (cy < groundCam) cy = groundCam;
      camDesired.set(cx, cy, cz);

      const aXZ = 1 - Math.exp(-CAM_STAB_XZ * dt);
      const aY = 1 - Math.exp(-CAM_STAB_Y * dt);
      if (!camStabilizerReady) {
        camStableLook.copy(camLook);
        camStablePos.copy(camDesired);
        camStabilizerReady = true;
      } else {
        camStableLook.x = THREE.MathUtils.lerp(camStableLook.x, camLook.x, aXZ);
        camStableLook.y = THREE.MathUtils.lerp(camStableLook.y, camLook.y, aY);
        camStableLook.z = THREE.MathUtils.lerp(camStableLook.z, camLook.z, aXZ);
        camStablePos.x = THREE.MathUtils.lerp(camStablePos.x, camDesired.x, aXZ);
        camStablePos.y = THREE.MathUtils.lerp(camStablePos.y, camDesired.y, aY);
        camStablePos.z = THREE.MathUtils.lerp(camStablePos.z, camDesired.z, aXZ);
      }
      camera.position.copy(camStablePos);
      camera.lookAt(camStableLook);

      camera.fov = THREE.MathUtils.lerp(60, 88, speedT * speedT);
      camera.updateProjectionMatrix();
    }

    if (!freeCamActive && scene.fog) {
      scene.fog.density = THREE.MathUtils.lerp(fogBase, fogBase * 0.72, speedT);
    }

    const targetKmh = Math.abs(speed) * 3.6;
    const spdLerp = 1 - Math.exp(-SPEED_DISPLAY_SMOOTH * dt);
    speedDisplayKmh = THREE.MathUtils.lerp(speedDisplayKmh, targetKmh, spdLerp);
    const kmh = Math.round(speedDisplayKmh);
    if (speedValEl) speedValEl.textContent = speed < -0.5 ? `-${kmh}` : String(kmh);
    if (distanceValEl) distanceValEl.textContent = odometerKm.toFixed(2);

    if (freeCamActive) {
      infiniteRoad.updateRoadChunks(freeCamPos.z);
      terrainPool.updateTerrainTiles(freeCamPos.x, freeCamPos.z);
    } else {
      infiniteRoad.updateRoadChunks(pz);
      terrainPool.updateTerrainTiles(px, pz);
    }
  }

  let last = performance.now() / 1000;
  function tick() {
    const now = performance.now() / 1000;
    if (!paused) {
      const dt = Math.min(now - last, 0.05);
      last = now;
      updateCar(dt);
    } else {
      const dt = Math.min(now - last, 0.05);
      last = now;
      /** While paused, fly-only: keep streams under the free camera without advancing the car sim. */
      if (freeCamActive && !worldGenInputLocked) {
        updateFreeCam(dt);
        infiniteRoad.updateRoadChunks(freeCamPos.z);
        terrainPool.updateTerrainTiles(freeCamPos.x, freeCamPos.z);
      }
    }
    sunDisc.position.copy(camera.position).addScaledVector(sunDiscDir, 480);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
}

main();
