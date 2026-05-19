import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.2/build/three.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/loaders/FBXLoader.js';

const scoreLabel = document.getElementById('score');
const shotsLabel = document.getElementById('shots');
const healthLabel = document.getElementById('health');
const ammoLabel = document.getElementById('ammo');
const message = document.getElementById('message');
const mainWeaponHudLabel = document.getElementById('weapon-main');
const sideWeaponHudLabel = document.getElementById('weapon-side');
const mainGunSelect = document.getElementById('main-gun-select');
const sideGunSelect = document.getElementById('side-gun-select');
const activeWeaponLabel = document.getElementById('active-weapon');
const currentWeaponBottomLabel = document.getElementById('current-weapon-bottom');
const crosshair = document.getElementById('crosshair');
const scopeOverlay = document.getElementById('scope-overlay');
const ironSightOverlay = document.getElementById('iron-sight-overlay');
const gunBasePosition = new THREE.Vector3(0.42, -0.48, -0.82);
const gunBaseRotation = new THREE.Euler(0, 0, 0);
const gunHeightOffset = 0.08;
const playerCollisionRadius = 0.95;
const collisionStepSize = 0.18;
const adsMoveSpeedMultiplier = 0.5;
const sprintMoveSpeedMultiplier = 1.65;
const movingSpreadMultiplier = 1.9;
const standingSpreadMultiplier = 0.85;
const adsSpreadMultiplier = 0.28;
const airborneSpreadMultiplier = 1.25;
const defaultCameraFov = 75;
const sniperScopeFov = 24;
const adsCameraFov = 66;
const defaultGunKey = 'Pistol_Compact_West';
const defaultMainGunKey = 'Rifle_Assault_West';
const defaultSideGunKey = 'Pistol_Compact_West';
const sideGunKeys = ['Pistol_Compact_West', 'Pistol_Full_West'];
const mainGunKeys = [
  'SMG_Compact_West',
  'SMG_Full_West',
  'Rifle_Assault_West',
  'Rifle_Battle_West',
  'Shotgun_Pump_West',
  'Shotgun_Auto_West',
  'Sniper_Rifle_West',
  'Sniper_Material_West',
];
const gunConfigs = {
  Pistol_Compact_West: { glb: 'Flat Guns West/GLB/Pistol_Compact_West.glb', fbx: 'Flat Guns West/FBX/Pistol_Compact_West.Rig.fbx', scale: 1.2, position: [0.42, -0.48, -0.82], ammo: 12, fireCooldownMs: 180, damage: 34, bulletSpeed: 82, spread: 0.01, range: 86, projectiles: 1, reloadBaseMs: 900 },
  Pistol_Full_West: { glb: 'Flat Guns West/GLB/Pistol_Full_West.glb', fbx: 'Flat Guns West/FBX/Pistol_Full_West.Rig.fbx', scale: 1.15, position: [0.41, -0.49, -0.82], ammo: 15, fireCooldownMs: 190, damage: 42, bulletSpeed: 84, spread: 0.007, range: 102, projectiles: 1, reloadBaseMs: 1000 },
  SMG_Compact_West: { glb: 'Flat Guns West/GLB/SMG_Compact_West.glb', fbx: 'Flat Guns West/FBX/SMG_Compact_West.Rig.fbx', scale: 1.05, position: [0.44, -0.52, -0.82], ammo: 25, fireCooldownMs: 95, damage: 22, bulletSpeed: 88, spread: 0.022, range: 78, projectiles: 1, reloadBaseMs: 1150 },
  SMG_Full_West: { glb: 'Flat Guns West/GLB/SMG_Full_West.glb', fbx: 'Flat Guns West/FBX/SMG_Full_West.Rig.fbx', scale: 1.02, position: [0.45, -0.53, -0.8], ammo: 32, fireCooldownMs: 100, damage: 24, bulletSpeed: 90, spread: 0.018, range: 90, projectiles: 1, reloadBaseMs: 1250 },
  Rifle_Assault_West: { glb: 'Flat Guns West/GLB/Rifle_Assault_West.glb', fbx: 'Flat Guns West/FBX/Rifle_Assault_West.Rig.fbx', scale: 0.98, position: [0.46, -0.56, -0.78], ammo: 30, fireCooldownMs: 150, damage: 36, bulletSpeed: 96, spread: 0.011, range: 130, projectiles: 1, reloadBaseMs: 1300 },
  Rifle_Battle_West: { glb: 'Flat Guns West/GLB/Rifle_Battle_West.glb', fbx: 'Flat Guns West/FBX/Rifle_Battle_West.Rig.fbx', scale: 0.98, position: [0.46, -0.56, -0.78], ammo: 20, fireCooldownMs: 280, damage: 62, bulletSpeed: 102, spread: 0.015, range: 150, projectiles: 1, reloadBaseMs: 1500 },
  Shotgun_Pump_West: { glb: 'Flat Guns West/GLB/Shotgun_Pump_West.glb', fbx: 'Flat Guns West/FBX/Shotgun_Pump_West.Rig.fbx', scale: 1.05, position: [0.44, -0.54, -0.8], ammo: 6, fireCooldownMs: 800, damage: 18, bulletSpeed: 76, spread: 0.08, range: 66, projectiles: 8, reloadBaseMs: 1650 },
  Shotgun_Auto_West: { glb: 'Flat Guns West/GLB/Shotgun_Auto_West.glb', fbx: 'Flat Guns West/FBX/Shotgun_Auto_West.Rig.fbx', scale: 1.02, position: [0.45, -0.54, -0.8], ammo: 8, fireCooldownMs: 360, damage: 14, bulletSpeed: 78, spread: 0.085, range: 62, projectiles: 7, reloadBaseMs: 1600 },
  Sniper_Rifle_West: { glb: 'Flat Guns West/GLB/Sniper_Rifle_West.glb', fbx: 'Flat Guns West/FBX/Sniper_Rifle_West.Rig.fbx', scale: 0.92, position: [0.48, -0.58, -0.76], ammo: 5, fireCooldownMs: 1050, damage: 120, bulletSpeed: 130, spread: 0.003, range: 210, projectiles: 1, reloadBaseMs: 1900, oneShot: true },
  Sniper_Material_West: { glb: 'Flat Guns West/GLB/Sniper_Material_West.glb', fbx: 'Flat Guns West/FBX/Sniper_Material_West.Rig.fbx', scale: 0.92, position: [0.48, -0.58, -0.76], ammo: 3, fireCooldownMs: 1500, damage: 200, bulletSpeed: 140, spread: 0.0018, range: 250, projectiles: 1, reloadBaseMs: 2400, oneShot: true },
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 60, 160);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 0.9);
light.position.set(10, 20, 15);
const ambient = new THREE.AmbientLight(0x888888, 0.75);
scene.add(light, ambient);

const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();

const moveState = { forward: false, backward: false, left: false, right: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const bullets = [];
const targets = [];
let score = 0;
let bulletsShot = 0;
let health = 100;
let canFire = true;
let canJump = false;
let isReloading = false;
let gunModel = null;
let gunMixer = null;
let reloadAction = null;
let fallbackReloadActive = false;
let fallbackReloadTime = 0;
let fallbackReloadDurationMs = 900;
let reloadTimeoutId = null;
let gunLoadRequestId = 0;
let activeWeaponSlot = 'main';
const weaponSlots = {
  main: { gunKey: defaultMainGunKey, ammo: gunConfigs[defaultMainGunKey].ammo },
  side: { gunKey: defaultSideGunKey, ammo: gunConfigs[defaultSideGunKey].ammo },
};
let currentGunKey = weaponSlots.main.gunKey;
let currentGunConfig = gunConfigs[currentGunKey];
let maxAmmo = currentGunConfig.ammo;
let ammo = weaponSlots.main.ammo;
let fireCooldownMs = currentGunConfig.fireCooldownMs;
let isAiming = false;
let isTriggerHeld = false;
let infiniteAmmo = false;
let noCooldown = false;
let isSprinting = false;
const jumpState = { jump: false };
const raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 2.5);
const aimRaycaster = new THREE.Raycaster();
let spawnTimer = 0;
const clock = new THREE.Clock();

const floor = createFloor();
scene.add(floor);
createClouds();
const obstacles = createObstacles();
const obstacleBoxes = obstacles.map((object) => {
  scene.add(object);
  return new THREE.Box3().setFromObject(object);
});

const gunGroup = new THREE.Group();
controls.getObject().add(gunGroup);
setupWeaponSelectors();
switchWeaponSlot('main', true);

function getGunConfig(gunKey) {
  return gunConfigs[gunKey] || gunConfigs[defaultGunKey];
}

function isAllowedGunForSlot(slotKey, gunKey) {
  if (slotKey === 'main') return mainGunKeys.includes(gunKey);
  if (slotKey === 'side') return sideGunKeys.includes(gunKey);
  return false;
}

function normalizeSlotGun(slotKey, gunKey) {
  if (isAllowedGunForSlot(slotKey, gunKey)) return gunKey;
  return slotKey === 'main' ? defaultMainGunKey : defaultSideGunKey;
}

function setActiveWeaponLabel() {
  if (!activeWeaponLabel) return;
  const slotName = activeWeaponSlot === 'main' ? 'Main' : 'Side';
  const hotkey = activeWeaponSlot === 'main' ? '1' : '2';
  activeWeaponLabel.textContent = `Active: ${slotName} [${hotkey}]`;
}

function getGunNameByKey(gunKey) {
  const sourceSelect = mainGunSelect || sideGunSelect;
  if (!sourceSelect) return gunKey;
  const option = sourceSelect.querySelector(`option[value="${gunKey}"]`);
  return option ? option.textContent : gunKey;
}

function updateLoadoutHud() {
  const activeGunName = getGunNameByKey(currentGunKey);
  if (currentWeaponBottomLabel) {
    currentWeaponBottomLabel.textContent = `Current: ${activeGunName}`;
  }
  if (mainWeaponHudLabel) {
    mainWeaponHudLabel.textContent = `1 Main: ${getGunNameByKey(weaponSlots.main.gunKey)}`;
    mainWeaponHudLabel.classList.toggle('active', activeWeaponSlot === 'main');
  }
  if (sideWeaponHudLabel) {
    sideWeaponHudLabel.textContent = `2 Side: ${getGunNameByKey(weaponSlots.side.gunKey)}`;
    sideWeaponHudLabel.classList.toggle('active', activeWeaponSlot === 'side');
  }
}

function syncWeaponMenuUI() {
  if (mainGunSelect) mainGunSelect.value = weaponSlots.main.gunKey;
  if (sideGunSelect) sideGunSelect.value = weaponSlots.side.gunKey;
  setActiveWeaponLabel();
  updateLoadoutHud();
}

function setupWeaponSelectors() {
  weaponSlots.main.gunKey = normalizeSlotGun('main', weaponSlots.main.gunKey);
  weaponSlots.side.gunKey = normalizeSlotGun('side', weaponSlots.side.gunKey);
  weaponSlots.main.ammo = getGunConfig(weaponSlots.main.gunKey).ammo;
  weaponSlots.side.ammo = getGunConfig(weaponSlots.side.gunKey).ammo;

  if (mainGunSelect) {
    mainGunSelect.value = weaponSlots.main.gunKey;
    mainGunSelect.addEventListener('change', (event) => {
      setSlotWeapon('main', event.target.value);
    });
  }
  if (sideGunSelect) {
    sideGunSelect.value = weaponSlots.side.gunKey;
    sideGunSelect.addEventListener('change', (event) => {
      setSlotWeapon('side', event.target.value);
    });
  }
  syncWeaponMenuUI();
}

function persistCurrentWeaponState() {
  const slot = weaponSlots[activeWeaponSlot];
  if (!slot) return;
  slot.gunKey = currentGunKey;
  slot.ammo = THREE.MathUtils.clamp(ammo, 0, maxAmmo);
}

function setSlotWeapon(slotKey, gunKey) {
  const slot = weaponSlots[slotKey];
  if (!slot) return;
  const selectedGunKey = normalizeSlotGun(slotKey, gunKey);
  slot.gunKey = selectedGunKey;
  slot.ammo = getGunConfig(selectedGunKey).ammo;
  syncWeaponMenuUI();
  if (slotKey === activeWeaponSlot) {
    switchWeaponSlot(slotKey, true);
  }
}

function switchWeaponSlot(slotKey, forceSwitch = false) {
  const slot = weaponSlots[slotKey];
  if (!slot) return;
  slot.gunKey = normalizeSlotGun(slotKey, slot.gunKey);
  const isSameSlot = activeWeaponSlot === slotKey;
  if (!forceSwitch && isSameSlot) return;
  if (!isSameSlot) {
    persistCurrentWeaponState();
  }
  activeWeaponSlot = slotKey;
  currentGunKey = slot.gunKey;
  currentGunConfig = getGunConfig(slot.gunKey);
  fireCooldownMs = currentGunConfig.fireCooldownMs;
  maxAmmo = currentGunConfig.ammo;
  ammo = THREE.MathUtils.clamp(slot.ammo, 0, maxAmmo);
  clearReloadTimer();
  isReloading = false;
  canFire = true;
  isAiming = false;
  updateUI();
  syncWeaponMenuUI();
  loadGun(currentGunConfig);
}

function clearReloadTimer() {
  if (reloadTimeoutId !== null) {
    clearTimeout(reloadTimeoutId);
    reloadTimeoutId = null;
  }
}

function resetGunAnimationState() {
  fallbackReloadActive = false;
  fallbackReloadTime = 0;
  fallbackReloadDurationMs = 900;
  if (reloadAction) {
    reloadAction.setEffectiveTimeScale(1);
    reloadAction.stop();
    reloadAction.reset();
  }
  reloadAction = null;
  gunMixer = null;
}

function clearCurrentGunModel() {
  resetGunAnimationState();
  if (gunModel) {
    gunGroup.remove(gunModel);
    gunModel = null;
  }
}

async function loadGun(config) {
  const loadId = ++gunLoadRequestId;
  clearCurrentGunModel();
  try {
    const gltf = await gltfLoader.loadAsync(config.glb);
    if (loadId !== gunLoadRequestId) return;

    gunModel = gltf.scene;
    gunBasePosition.set(config.position[0], config.position[1] + gunHeightOffset, config.position[2]);
    gunBaseRotation.set(0, 0, 0);
    gunModel.position.copy(gunBasePosition);
    gunModel.rotation.copy(gunBaseRotation);
    gunModel.scale.set(config.scale, config.scale, config.scale);
    gunGroup.add(gunModel);

    const hasEmbeddedReloadAnimation = setupReloadAnimation(gltf.animations);
    if (!hasEmbeddedReloadAnimation) {
      await loadRigReloadAnimation(config, loadId);
    }
  } catch (error) {
    console.error('Failed to load gun model:', error);
  }
}

function setupReloadAnimation(clips) {
  if (!gunModel || !Array.isArray(clips) || clips.length === 0) return false;
  gunMixer = new THREE.AnimationMixer(gunModel);
  const namedClip = THREE.AnimationClip.findByName(clips, 'Reload');
  const clip = namedClip || clips[0];
  reloadAction = gunMixer.clipAction(clip);
  reloadAction.setLoop(THREE.LoopOnce, 1);
  reloadAction.clampWhenFinished = true;
  return true;
}

async function loadRigReloadAnimation(config, loadId) {
  try {
    const fbxRig = await fbxLoader.loadAsync(config.fbx);
    if (loadId !== gunLoadRequestId || !gunModel) return;
    setupReloadAnimation(fbxRig.animations);
  } catch (error) {
    console.warn('No rig animation loaded, using fallback reload animation.', error);
  }
}

function startFallbackReloadAnimation() {
  if (!gunModel) return;
  fallbackReloadActive = true;
  fallbackReloadTime = 0;
}

function updateFallbackReloadAnimation(delta) {
  if (!gunModel || !fallbackReloadActive) return;
  fallbackReloadTime += delta;
  const duration = fallbackReloadDurationMs / 1000;
  const t = Math.min(fallbackReloadTime / duration, 1);
  const kick = Math.sin(Math.PI * t);
  gunModel.position.set(
    gunBasePosition.x - 0.1 * kick,
    gunBasePosition.y - 0.16 * kick,
    gunBasePosition.z + 0.14 * kick
  );
  gunModel.rotation.set(
    gunBaseRotation.x - 0.35 * kick,
    gunBaseRotation.y + 0.18 * kick,
    gunBaseRotation.z - 0.12 * kick
  );

  if (t >= 1) {
    fallbackReloadActive = false;
    gunModel.position.copy(gunBasePosition);
    gunModel.rotation.copy(gunBaseRotation);
  }
}

function isSniperGun() {
  return currentGunKey.startsWith('Sniper_');
}

function isScopeActive() {
  return controls.isLocked && isAiming && isSniperGun();
}

function isIronSightActive() {
  return controls.isLocked && isAiming && !isSniperGun();
}

function isPlayerMoving() {
  const movementInput = moveState.forward || moveState.backward || moveState.left || moveState.right;
  const speed = Math.hypot(velocity.x, velocity.z);
  return movementInput || speed > 1.5;
}

function getCurrentShotSpread() {
  if (isScopeActive()) return 0;
  let spread = currentGunConfig.spread || 0.01;
  spread *= isPlayerMoving() ? movingSpreadMultiplier : standingSpreadMultiplier;
  if (!canJump) spread *= airborneSpreadMultiplier;
  if (isAiming) spread *= adsSpreadMultiplier;
  return spread;
}

function updateCrosshair() {
  if (!crosshair) return;
  if (isScopeActive()) {
    crosshair.style.opacity = '0';
    crosshair.classList.remove('iron-cross');
    return;
  }

  if (isIronSightActive()) {
    crosshair.style.opacity = '1';
    crosshair.classList.add('iron-cross');
    const crossSize = 28;
    const halfSize = crossSize / 2;
    crosshair.style.width = `${crossSize}px`;
    crosshair.style.height = `${crossSize}px`;
    crosshair.style.marginLeft = `${-halfSize}px`;
    crosshair.style.marginTop = `${-halfSize}px`;
    return;
  }

  crosshair.classList.remove('iron-cross');
  crosshair.style.opacity = '1';
  const baseRadius = 8;
  const spread = controls.isLocked ? getCurrentShotSpread() : 0.01;
  const radius = THREE.MathUtils.clamp(baseRadius + spread * 700, 8, 58);
  crosshair.style.width = `${radius * 2}px`;
  crosshair.style.height = `${radius * 2}px`;
  crosshair.style.marginLeft = `${-radius}px`;
  crosshair.style.marginTop = `${-radius}px`;
}

function updateScopeAndZoom() {
  const scopeActive = isScopeActive();
  const ironSightActive = isIronSightActive();
  if (scopeOverlay) {
    scopeOverlay.classList.toggle('active', scopeActive);
  }
  if (ironSightOverlay) {
    ironSightOverlay.classList.toggle('active', ironSightActive);
  }

  let targetFov = defaultCameraFov;
  if (scopeActive) {
    targetFov = sniperScopeFov;
  } else if (isAiming && controls.isLocked) {
    targetFov = adsCameraFov;
  }

  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.2);
  camera.updateProjectionMatrix();
}

function createFloor() {
  const geo = new THREE.PlaneGeometry(200, 200);
  const mat = new THREE.MeshPhongMaterial({ color: 0x202038, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  return mesh;
}

function createObstacles() {
  const items = [];
  const material = new THREE.MeshStandardMaterial({ color: 0x334166, roughness: 0.8, metalness: 0.1 });
  for (let i = 0; i < 12; i += 1) {
    const size = 2 + Math.random() * 3;
    const geometry = new THREE.BoxGeometry(size, 1.5, size);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      THREE.MathUtils.randFloatSpread(80),
      0.75,
      THREE.MathUtils.randFloat(-80, 40)
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    items.push(mesh);
  }
  return items;
}

function playerIntersectsObstacle(position) {
  const sphere = new THREE.Sphere(position, playerCollisionRadius);
  return obstacleBoxes.some((box) => box.intersectsSphere(sphere));
}

function movePlayerHorizontalWithCollision(moveRightAmount, moveForwardAmount) {
  const maxDistance = Math.max(Math.abs(moveRightAmount), Math.abs(moveForwardAmount));
  const steps = Math.max(1, Math.ceil(maxDistance / collisionStepSize));
  const rightStep = moveRightAmount / steps;
  const forwardStep = moveForwardAmount / steps;

  for (let i = 0; i < steps; i += 1) {
    if (rightStep !== 0) {
      const previousPosition = controls.getObject().position.clone();
      controls.moveRight(rightStep);
      if (playerIntersectsObstacle(controls.getObject().position)) {
        controls.getObject().position.copy(previousPosition);
        velocity.x = 0;
      }
    }

    if (forwardStep !== 0) {
      const previousPosition = controls.getObject().position.clone();
      controls.moveForward(forwardStep);
      if (playerIntersectsObstacle(controls.getObject().position)) {
        controls.getObject().position.copy(previousPosition);
        velocity.z = 0;
      }
    }
  }
}

function targetIntersectsObstacle(target, obstacleBox) {
  const sphere = new THREE.Sphere(target.position, target.userData.radius);
  return obstacleBox.intersectsSphere(sphere);
}

function createClouds() {
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 20; i += 1) {
    const radius = 5 + Math.random() * 4;
    const geometry = new THREE.SphereGeometry(radius, 12, 12);
    const cloud = new THREE.Mesh(geometry, cloudMaterial);
    cloud.position.set(
      THREE.MathUtils.randFloatSpread(120),
      20 + Math.random() * 20,
      -20 - Math.random() * 80
    );
    cloud.scale.set(1.4, 0.8, 0.8);
    scene.add(cloud);
  }
}

function createTarget() {
  const geometry = new THREE.SphereGeometry(0.8, 16, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0x330000, roughness: 0.4 });
  const target = new THREE.Mesh(geometry, material);
  target.position.set(
    THREE.MathUtils.randFloatSpread(40),
    1.2,
    -30 - Math.random() * 40
  );

  let tries = 0;
  while (tries < 10 && obstacleBoxes.some((box) => targetIntersectsObstacle(target, box))) {
    target.position.set(
      THREE.MathUtils.randFloatSpread(40),
      1.2,
      -30 - Math.random() * 40
    );
    tries += 1;
  }

  target.userData = {
    velocity: new THREE.Vector3(
      THREE.MathUtils.randFloat(-0.8, 0.8),
      0,
      THREE.MathUtils.randFloat(0.4, 1.1)
    ),
    radius: 0.8,
    health: 100,
  };
  scene.add(target);
  targets.push(target);
}

function getMuzzleWorldPosition() {
  const muzzle = new THREE.Vector3();
  if (gunModel) {
    gunModel.getWorldPosition(muzzle);
    const muzzleOffset = new THREE.Vector3(0.45, 0.08, -0.42);
    const gunWorldQuaternion = new THREE.Quaternion();
    gunModel.getWorldQuaternion(gunWorldQuaternion);
    muzzleOffset.applyQuaternion(gunWorldQuaternion);
    muzzle.add(muzzleOffset);
    return muzzle;
  }

  // Fallback when model is still loading.
  camera.getWorldPosition(muzzle);
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const up = new THREE.Vector3().copy(camera.up).normalize();
  return muzzle
    .addScaledVector(right, 0.25)
    .addScaledVector(up, -0.2)
    .addScaledVector(forward, 0.65);
}

function getCenterAimPoint(maxDistance = 1200) {
  const cameraWorldPosition = new THREE.Vector3();
  camera.getWorldPosition(cameraWorldPosition);

  const cameraForward = new THREE.Vector3();
  camera.getWorldDirection(cameraForward);

  aimRaycaster.near = 0;
  aimRaycaster.far = maxDistance;
  aimRaycaster.set(cameraWorldPosition, cameraForward);
  const intersections = aimRaycaster.intersectObjects([floor, ...obstacles, ...targets], false);
  if (intersections.length > 0) {
    return intersections[0].point.clone();
  }
  return cameraWorldPosition.addScaledVector(cameraForward, maxDistance);
}

function getCenterAimDirection(origin, spread = 0) {
  const aimPoint = getCenterAimPoint();
  const direction = aimPoint.sub(origin).normalize();

  if (spread > 0) {
    direction.x += THREE.MathUtils.randFloatSpread(spread);
    direction.y += THREE.MathUtils.randFloatSpread(spread);
    direction.normalize();
  }

  return direction;
}

function fireBullet() {
  if (!controls.isLocked || !canFire || isReloading) return;
  if (!infiniteAmmo && ammo <= 0) {
    message.textContent = 'Out of ammo. Press R to reload.';
    return;
  }
  const bulletGeometry = new THREE.SphereGeometry(0.08, 8, 8);
  const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff80 });
  const projectileCount = currentGunConfig.projectiles || 1;
  const spread = getCurrentShotSpread();
  const muzzlePosition = getMuzzleWorldPosition();
  for (let i = 0; i < projectileCount; i += 1) {
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    bullet.position.copy(muzzlePosition);
    const forward = getCenterAimDirection(muzzlePosition, spread);
    bullet.userData = {
      velocity: forward.multiplyScalar(currentGunConfig.bulletSpeed),
      distance: 0,
      maxDistance: currentGunConfig.range,
      damage: currentGunConfig.damage,
      oneShot: Boolean(currentGunConfig.oneShot),
    };
    bullets.push(bullet);
    scene.add(bullet);
  }
  bulletsShot += projectileCount;
  if (!infiniteAmmo) ammo -= 1;
  updateUI();
  if (!noCooldown) {
    canFire = false;
    setTimeout(() => { canFire = true; }, fireCooldownMs);
  }
}

function reloadWeapon() {
  if (isReloading || ammo === maxAmmo) return;
  clearReloadTimer();
  isReloading = true;
  message.textContent = 'Reloading...';
  const missingAmmo = maxAmmo - ammo;
  const missingAmmoRatio = missingAmmo / maxAmmo;
  const minReloadFactor = 0.55;
  const reloadFactor = minReloadFactor + ((1 - minReloadFactor) * missingAmmoRatio);
  const baseReloadMs = currentGunConfig.reloadBaseMs || 900;
  const baseDurationMs = reloadAction ? Math.max(baseReloadMs, reloadAction.getClip().duration * 1000) : baseReloadMs;
  const reloadDurationMs = Math.round(baseDurationMs * reloadFactor);

  if (reloadAction) {
    const timeScale = baseDurationMs / reloadDurationMs;
    reloadAction.reset();
    reloadAction.setEffectiveTimeScale(timeScale);
    reloadAction.play();
  } else {
    fallbackReloadDurationMs = reloadDurationMs;
    startFallbackReloadAnimation();
  }
  reloadTimeoutId = setTimeout(() => {
    ammo = maxAmmo;
    isReloading = false;
    reloadTimeoutId = null;
    if (controls.isLocked) message.textContent = 'Pointer locked. Shoot targets!';
    updateUI();
  }, reloadDurationMs);
}

function updateUI() {
  scoreLabel.textContent = `Score: ${score}`;
  shotsLabel.textContent = `Bullets Shot: ${bulletsShot}`;
  healthLabel.textContent = `Health: ${health}`;
  if (infiniteAmmo) {
    ammoLabel.textContent = `Ammo: \u221e`;
  } else {
    ammoLabel.textContent = `Ammo: ${ammo} / ${maxAmmo}`;
  }
  persistCurrentWeaponState();
}

function resetGame() {
  bullets.forEach((bullet) => scene.remove(bullet));
  targets.forEach((target) => scene.remove(target));
  bullets.length = 0;
  targets.length = 0;
  score = 0;
  bulletsShot = 0;
  health = 100;
  weaponSlots.main.ammo = getGunConfig(weaponSlots.main.gunKey).ammo;
  weaponSlots.side.ammo = getGunConfig(weaponSlots.side.gunKey).ammo;
  ammo = weaponSlots[activeWeaponSlot].ammo;
  clearReloadTimer();
  isReloading = false;
  resetGunAnimationState();
  if (gunModel) {
    gunModel.position.copy(gunBasePosition);
    gunModel.rotation.copy(gunBaseRotation);
  }
  spawnTimer = 0;
  updateUI();
  message.textContent = 'Click to start';
}

function spawnTargets(delta) {
  spawnTimer += delta;
  if (spawnTimer > 1.2 && targets.length < 14) {
    createTarget();
    spawnTimer = 0;
  }
}

function moveTargets(delta) {
  targets.forEach((target, index) => {
    target.position.addScaledVector(target.userData.velocity, delta);
    if (Math.abs(target.position.x) > 90) {
      target.userData.velocity.x *= -1;
    }

    if (target.position.z > 10) {
      scene.remove(target);
      targets.splice(index, 1);
      health -= 12;
      updateUI();
      return;
    }

    obstacleBoxes.forEach((obstacleBox) => {
      if (targetIntersectsObstacle(target, obstacleBox)) {
        target.userData.velocity.x *= -1.1;
        target.userData.velocity.z *= -1.1;
        target.position.addScaledVector(target.userData.velocity, delta * 0.5);
      }
    });

    const jitter = 0.18;
    target.userData.velocity.x += (Math.random() - 0.5) * jitter * delta;
    target.userData.velocity.z += (Math.random() - 0.5) * jitter * delta;
    const speed = target.userData.velocity.length();
    target.userData.velocity.setLength(THREE.MathUtils.clamp(speed, 0.35, 1.25));
  });
}

function moveBullets(delta) {
  for (let index = bullets.length - 1; index >= 0; index -= 1) {
    const bullet = bullets[index];
    bullet.position.addScaledVector(bullet.userData.velocity, delta);
    bullet.userData.distance += bullet.userData.velocity.length() * delta;
    if (bullet.userData.distance > bullet.userData.maxDistance) {
      scene.remove(bullet);
      bullets.splice(index, 1);
      continue;
    }
    for (let targetIndex = targets.length - 1; targetIndex >= 0; targetIndex -= 1) {
      const target = targets[targetIndex];
      const distance = bullet.position.distanceTo(target.position);
      if (distance < target.userData.radius + 0.08) {
        scene.remove(bullet);
        bullets.splice(index, 1);
        if (bullet.userData.oneShot) {
          target.userData.health = 0;
        } else {
          target.userData.health -= bullet.userData.damage;
        }
        if (target.userData.health <= 0) {
          scene.remove(target);
          targets.splice(targetIndex, 1);
          score += 15;
          updateUI();
        }
        break;
      }
    }
  }
}

function onKeyDown(event) {
  switch (event.code) {
    case 'Digit1': switchWeaponSlot('main'); break;
    case 'Digit2': switchWeaponSlot('side'); break;
    case 'KeyW': moveState.forward = true; break;
    case 'KeyS': moveState.backward = true; break;
    case 'KeyA': moveState.left = true; break;
    case 'KeyD': moveState.right = true; break;
    case 'ShiftLeft':
    case 'ShiftRight':
      isSprinting = true;
      break;
    case 'Space': jumpState.jump = true; break;
    case 'KeyR': reloadWeapon(); break;
    case 'KeyP':
      infiniteAmmo = !infiniteAmmo;
      if (infiniteAmmo) {
        message.textContent = 'Infinite ammo enabled (test mode).';
      } else if (controls.isLocked) {
        message.textContent = 'Infinite ammo disabled.';
      }
      updateUI();
      break;
    case 'KeyL':
      noCooldown = !noCooldown;
      if (noCooldown) {
        canFire = true;
        message.textContent = 'No cooldown enabled (test mode).';
      } else if (controls.isLocked) {
        message.textContent = 'No cooldown disabled.';
      }
      break;
  }
}

function onKeyUp(event) {
  switch (event.code) {
    case 'KeyW': moveState.forward = false; break;
    case 'KeyS': moveState.backward = false; break;
    case 'KeyA': moveState.left = false; break;
    case 'KeyD': moveState.right = false; break;
    case 'ShiftLeft':
    case 'ShiftRight':
      isSprinting = false;
      break;
    case 'Space': jumpState.jump = false; break;
  }
}

function onMouseDown(event) {
  if (!controls.isLocked) return;
  if (event.button === 0) {
    isTriggerHeld = true;
    fireBullet();
  }
  if (event.button === 2) isAiming = true;
}

function onMouseUp(event) {
  if (event.button === 0) isTriggerHeld = false;
  if (event.button === 2) isAiming = false;
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);
  if (gunMixer) gunMixer.update(delta);
  updateFallbackReloadAnimation(delta);
  updateScopeAndZoom();
  updateCrosshair();

  if (controls.isLocked) {
    if (isTriggerHeld) fireBullet();
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= 30.0 * delta;

    raycaster.ray.origin.copy(controls.getObject().position);
    raycaster.ray.origin.y -= 0.1;
    const intersections = raycaster.intersectObjects(scene.children, true);
    const onObject = intersections.length > 0;

    if (onObject) {
      velocity.y = Math.max(0, velocity.y);
      canJump = true;
    }

    direction.z = Number(moveState.forward) - Number(moveState.backward);
    direction.x = Number(moveState.right) - Number(moveState.left);
    direction.normalize();

    let moveAcceleration = 220.0;
    if (isSprinting && !isAiming) moveAcceleration *= sprintMoveSpeedMultiplier;
    if (isAiming) moveAcceleration *= adsMoveSpeedMultiplier;
    if (moveState.forward || moveState.backward) velocity.z -= direction.z * moveAcceleration * delta;
    if (moveState.left || moveState.right) velocity.x -= direction.x * moveAcceleration * delta;

    if (jumpState.jump && canJump) {
      velocity.y = 16;
      canJump = false;
    }

    movePlayerHorizontalWithCollision(-velocity.x * delta, -velocity.z * delta);

    const previousPosition = controls.getObject().position.clone();
    controls.getObject().position.y += velocity.y * delta;
    if (playerIntersectsObstacle(controls.getObject().position)) {
      controls.getObject().position.copy(previousPosition);
      velocity.y = 0;
    }

    if (controls.getObject().position.y < 1.6) {
      velocity.y = 0;
      controls.getObject().position.y = 1.6;
      canJump = true;
    }
  }

  spawnTargets(delta);
  moveTargets(delta);
  moveBullets(delta);

  if (health <= 0) {
    message.textContent = 'Game over. Click to restart.';
    controls.unlock();
    resetGame();
  }

  renderer.render(scene, camera);
}

controls.addEventListener('lock', () => {
  message.textContent = 'Pointer locked. Shoot targets!';
  document.body.style.cursor = 'none';
});

controls.addEventListener('unlock', () => {
  isTriggerHeld = false;
  isAiming = false;
  isSprinting = false;
  if (scopeOverlay) {
    scopeOverlay.classList.remove('active');
  }
  if (ironSightOverlay) {
    ironSightOverlay.classList.remove('active');
  }
  message.textContent = 'Click to start';
  document.body.style.cursor = 'crosshair';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('mousedown', onMouseDown);
window.addEventListener('mouseup', onMouseUp);
window.addEventListener('contextmenu', (event) => event.preventDefault());
renderer.domElement.addEventListener('click', () => {
  if (!controls.isLocked) controls.lock();
});

updateUI();
animate();
