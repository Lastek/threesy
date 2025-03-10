import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

let scene, camera, renderer, clock;
let terrain, character, water;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = true, velocity = new THREE.Vector3(), isJumping = false;
let characterSpeed = 0.1;
let gravity = 0.005;
let jumpForce = 0.2;

// Camera settings
let cameraAngle = 0;
const CAMERA_HEIGHT = 3;
const CAMERA_DISTANCE = 5;
const CAMERA_LERP = 0.1;
const ROTATION_SPEED = 0.02;


const colors = {
  sky: 0x87CEEB,
  sand: 0xEDC9AF,
  water: 0x0077FF,
  palmTrunk: 0x4A3A2A,
  palmLeaves: 0x228833,
  rock: 0x555555
};
// Helper function to get the terrain height at a given (x, z)
function getTerrainHeightAt(x, z) {
    if (!terrain) return 0;
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3(x, 100, z); // cast from high above
    const direction = new THREE.Vector3(0, -1, 0);
    raycaster.set(origin, direction);
    const intersects = raycaster.intersectObject(terrain, true);
    if (intersects.length > 0) {
        return intersects[0].point.y;
    }
    return 0;
}

function init() {
    clock = new THREE.Clock();

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(colors.sky);
    scene.fog = new THREE.Fog(colors.sky, 1, 300);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    scene.add(directionalLight);


    createTerrain();
    createWater();
    createCharacter();
    setupControls();
    createPalmTree(15, 0, 15);
    createPalmTree(-20, 0, 10);
    createPalmTree(10, 0, -25);
    createRocks();
    window.addEventListener('resize', onWindowResize, false);
    animate();
}

function createTerrain() {
  const textureLoader = new THREE.TextureLoader();
  const sandTexture = textureLoader.load('https://threejs.org/examples/textures/terrain/sand.jpg');
  sandTexture.wrapS = sandTexture.wrapT = THREE.RepeatWrapping;
  sandTexture.repeat.set(100, 100);

  const terrainGeometry = new THREE.PlaneGeometry(1000, 1000, 200, 200);
  const terrainMaterial = new THREE.MeshStandardMaterial({
    map: sandTexture,
    color: colors.sand,
    displacementScale: 10,
    roughness: 0.8
  });

  // Add gentle hills using noise
  const vertices = terrainGeometry.attributes.position.array;
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i + 2] = (Math.sin(vertices[i] * 0.02) + Math.cos(vertices[i + 1] * 0.02)) * 2;
  }

  terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  scene.add(terrain);
}

function createCharacter() {
  const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
  const headGeometry = new THREE.SphereGeometry(0.4);
  const material = new THREE.MeshStandardMaterial({ color: 0x00FF00 });

  const body = new THREE.Mesh(bodyGeometry, material);
  const head = new THREE.Mesh(headGeometry, material);
  head.position.y = 1.2;

  character = new THREE.Group();
  character.add(body, head);
  character.castShadow = true;
  character.position.set(0, 5, 0);
  scene.add(character);
}

function createWater() {
  const waterGeometry = new THREE.PlaneGeometry(1000, 1000);
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: colors.water,
    transparent: true,
    opacity: 0.6,
    metalness: 0.8,
    roughness: 0.2
  });

  water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.1;
  scene.add(water);
}

function createPalmTree(x, y, z) {
  const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 6, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: colors.palmTrunk });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.set(x, y + 3, z);

  const leavesGeometry = new THREE.ConeGeometry(3, 4, 8);
  const leavesMaterial = new THREE.MeshStandardMaterial({ color: colors.palmLeaves });
  const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
  leaves.position.set(x, y + 6, z);
  leaves.rotation.x = Math.PI / 2;

  const tree = new THREE.Group();
  tree.add(trunk, leaves);
  tree.castShadow = true;
  scene.add(tree);
}

function createRocks() {
  const rockGeometry = new THREE.SphereGeometry(1, 6, 6);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: colors.rock });

  for (let i = 0; i < 20; i++) {
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    const scale = 0.2 + Math.random() * 0.8;
    rock.scale.set(scale, scale * 0.8, scale);
    rock.position.set(
      (Math.random() - 0.5) * 200,
      0.5,
      (Math.random() - 0.5) * 200
    );
    rock.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    rock.castShadow = true;
    scene.add(rock);
  }
}

function updateWater() {
  // Simple water animation
  water.material.opacity = 0.5 + Math.sin(clock.getElapsedTime() * 2) * 0.1;
  water.position.y = 0.1 + Math.sin(clock.getElapsedTime()) * 0.05;
}
function addBeachDecorations() {
    const numClusters = 12;
    for (let i = 0; i < numClusters; i++) {
        const angle = (i / numClusters) * Math.PI * 2;
        const radius = 25 + Math.random() * 5;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        createBeachCluster(x, z);
    }
}

function createBeachCluster(x, z) {
    const group = new THREE.Group();
    createBeachUmbrella(0, 0, group);

    for (let i = 0; i < 5; i++) {
        const rockX = (Math.random() - 0.5) * 3;
        const rockZ = (Math.random() - 0.5) * 3;
        createRock(rockX, rockZ, group);
    }
    for (let i = 0; i < 8; i++) {
        const shellX = (Math.random() - 0.5) * 4;
        const shellZ = (Math.random() - 0.5) * 4;
        createShell(shellX, shellZ, group);
    }
    group.position.set(x, getTerrainHeightAt(x, z), z);
    group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(group);
}

function createRock(x, z, parent) {
    const geometry = new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.2);
    const material = new THREE.MeshStandardMaterial({
        color: colors.rocks,
        flatShading: true,
        roughness: 0.8
    });
    const rock = new THREE.Mesh(geometry, material);
    rock.position.set(x, 0, z);
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    rock.scale.set(
        1 + Math.random() * 0.5,
        0.7 + Math.random() * 0.3,
        1 + Math.random() * 0.5
    );
    rock.castShadow = true;
    parent.add(rock);
}

function createShell(x, z, parent) {
    const geometry = new THREE.TorusGeometry(0.1, 0.05, 8, 12, Math.PI * 1.2);
    const material = new THREE.MeshStandardMaterial({
        color: colors.shells,
        flatShading: true,
        roughness: 0.6,
        metalness: 0.2
    });
    const shell = new THREE.Mesh(geometry, material);
    shell.position.set(x, 0.05, z);
    shell.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI * 2);
    shell.scale.set(
        0.8 + Math.random() * 0.4,
        1,
        0.8 + Math.random() * 0.4
    );
    shell.castShadow = true;
    parent.add(shell);
}


function createCharacter() {
    const geometry = new THREE.BoxGeometry(0.5, 1, 0.5);
    const material = new THREE.MeshStandardMaterial({
        color: colors.character,
        flatShading: true
    });
    character = new THREE.Mesh(geometry, material);
    character.position.set(0, getTerrainHeightAt(0, 0) + 10.2, 0);
    character.castShadow = true;
    scene.add(character);

    camera.position.set(0, 8, 5);
    camera.lookAt(character.position);
}

function setupControls() {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('keypress', (event) => {
        if (event.code === 'Space' && canJump) {
            velocity.y = jumpForce;
            isJumping = true;
            canJump = false;
        }
    });
}

function onKeyDown(event) {
    switch(event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyD': moveRight = true; break;
    }
}

function onKeyUp(event) {
    switch(event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyD': moveRight = false; break;
    }
}

function updateCharacter() {
    const direction = new THREE.Vector3();
    if (moveForward) direction.z -= 1;
    if (moveBackward) direction.z += 1;
    if (moveLeft) {
        direction.x -= 1;
        cameraAngle += ROTATION_SPEED;
    }
    if (moveRight) {
        direction.x += 1;
        cameraAngle -= ROTATION_SPEED;
    }
    direction.normalize();

    // Rotate movement by camera angle
    const rotatedDirection = direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle);
    character.position.x += rotatedDirection.x * characterSpeed;
    character.position.z += rotatedDirection.z * characterSpeed;

    if (direction.length() > 0) {
        character.rotation.y = cameraAngle + Math.atan2(direction.x, direction.z);
    }

    velocity.y -= gravity;
    character.position.y += velocity.y;

    // Raycast downward to detect the terrain surface
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3(character.position.x, character.position.y + 1, character.position.z);
    const down = new THREE.Vector3(0, -1, 0);
    raycaster.set(origin, down);
    const intersects = raycaster.intersectObject(terrain, true);
    
    if (intersects.length > 0) {
        const groundY = intersects[0].point.y;
        if (character.position.y < groundY + 1.2) {
            character.position.y = groundY + 1.2;
            velocity.y = 0;
            isJumping = false;
            canJump = true;
        }
    }

    updateCamera();
}

function updateCamera() {
    const idealOffset = new THREE.Vector3(
        Math.sin(cameraAngle) * CAMERA_DISTANCE,
        CAMERA_HEIGHT,
        Math.cos(cameraAngle) * CAMERA_DISTANCE
    );
    const targetPosition = character.position.clone().add(idealOffset);
    camera.position.lerp(targetPosition, CAMERA_LERP);
    const lookAtPos = character.position.clone();
    lookAtPos.y += 1;
    camera.lookAt(lookAtPos);
}

function updateWater() {
    const time = clock.getElapsedTime();
    const posAttr = water.geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        posAttr.setY(i, Math.sin(x * 0.5 + time) * 0.2 + Math.cos(z * 0.5 + time) * 0.2);
    }
    posAttr.needsUpdate = true;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    updateCharacter();
    updateWater();
    renderer.render(scene, camera);
}

init();