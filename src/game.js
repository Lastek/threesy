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

// Global colors for our beach paradise
const colors = {
    sand: 0xffd998,
    wetSand: 0xe6c288,
    drySand: 0xffebc8,
    water: 0x4ac7e9,
    deepWater: 0x2389da,
    palmTrunk: 0x8b4513,
    palmLeaves: 0x2d5a27,
    sky: 0x87ceeb,
    character: 0xff6b6b,
    umbrella: 0xff4444,
    towel: 0x4286f4,
    rocks: 0x808080,
    shells: 0xfff5ee,
    grass: 0x90EE90
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

    createIsland();      // Try to load island model; falls back to procedural
    createCharacter();
    setupControls();
    createWater();       // Create water using a segmented plane

    window.addEventListener('resize', onWindowResize, false);
    animate();
}

function createIsland() {
    const loader = new GLTFLoader();
    
    loader.load(
        'models/terrain.glb',
        (gltf) => {
            const model = gltf.scene;
            model.scale.set(50, 50, 50);
            model.position.set(0, 0, 0);
            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: child.material.color,
                        flatShading: true,
                        side: THREE.DoubleSide
                    });
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            terrain = model;
            scene.add(terrain);

            // Once the terrain is loaded, add decorations
            addBeachDecorations();
            addPalmTrees();
        },
        (progress) => {
            console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
        },
        (error) => {
            console.error('Error loading model:', error);
            createProceduralIsland();
        }
    );
}

function createProceduralIsland() {
    console.log('Falling back to procedural island generation');

    // Create a circular geometry and displace its vertices
    const radius = 50;
    const segments = 64;
    const geometry = new THREE.CircleGeometry(radius, segments);
    geometry.rotateX(-Math.PI / 2);
    const posAttr = geometry.attributes.position;
    const vertexCount = posAttr.count;
    const noise = new SimplexNoise();
    
    // Create an array for vertex colors
    const vertexColors = new Float32Array(vertexCount * 3);

    for (let i = 0; i < vertexCount; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const distance = Math.sqrt(x * x + z * z);

        // Base height calculation using island and beach parameters
        let height = 0;
        const beachStart = 25;
        const islandRadius = 35;

        if (distance < beachStart) {
            const norm = distance / beachStart;
            height = 5 * (1 - norm * norm);
            height += noise.noise(x * 0.1, z * 0.1) * 1.5;
        } else if (distance < islandRadius) {
            const t = (distance - beachStart) / (islandRadius - beachStart);
            height = 2 * (1 - t);
            height += noise.noise(x * 0.2, z * 0.2) * 0.5 * (1 - t);
        }
        posAttr.setY(i, Math.max(0, height));

        // Assign vertex color based on distance and height
        const color = new THREE.Color();
        if (distance >= islandRadius) {
            color.setHex(colors.water);
        } else if (distance >= beachStart) {
            const t = (distance - beachStart) / (islandRadius - beachStart);
            color.setHex(colors.sand).lerp(new THREE.Color(colors.wetSand), t);
        } else {
            color.setHex(colors.grass);
            if (noise.noise(x * 0.3, z * 0.3) > 0.6) {
                color.lerp(new THREE.Color(colors.sand), 0.2);
            }
        }
        vertexColors[i * 3] = color.r;
        vertexColors[i * 3 + 1] = color.g;
        vertexColors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        side: THREE.DoubleSide
    });
    terrain = new THREE.Mesh(geometry, material);
    terrain.receiveShadow = true;
    scene.add(terrain);

    addBeachDecorations();
    addPalmTrees();
}

function createWater() {
    // Create a deep water layer (background)
    const deepWaterGeometry = new THREE.PlaneGeometry(400, 400, 50, 50);
    const deepWaterMaterial = new THREE.MeshPhongMaterial({
        color: colors.deepWater,
        transparent: true,
        opacity: 0.9,
        shininess: 90,
        flatShading: true
    });
    const deepWater = new THREE.Mesh(deepWaterGeometry, deepWaterMaterial);
    deepWater.rotation.x = -Math.PI / 2;
    deepWater.position.y = -0.2;
    scene.add(deepWater);

    // Create a surface water layer (animated waves)
    const waterGeometry = new THREE.PlaneGeometry(400, 400, 50, 50);
    const waterMaterial = new THREE.MeshPhongMaterial({
        color: colors.water,
        transparent: true,
        opacity: 0.6,
        shininess: 100,
        flatShading: true
    });
    water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0;
    water.receiveShadow = true;
    scene.add(water);
}

function addPalmTrees() {
    const noise = new SimplexNoise();
    const numTrees = 25;
    
    for (let i = 0; i < numTrees; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 15 + Math.random() * 15;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        if (radius > 10 && radius < 35) {
            const scale = 0.7 + Math.random() * 0.6;
            createPalmTree(x, z, scale);
        }
    }
}

function createPalmTree(x, z, scale) {
    const group = new THREE.Group();
    
    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 4 * scale, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: colors.palmTrunk,
        flatShading: true,
        roughness: 0.9
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.castShadow = true;
    group.add(trunk);

    // Leaves
    const numLeaves = 5;
    for (let i = 0; i < numLeaves; i++) {
        const angle = (i / numLeaves) * Math.PI * 2;
        const leavesGeometry = new THREE.ConeGeometry(1 * scale, 2 * scale, 4);
        const leavesMaterial = new THREE.MeshStandardMaterial({
            color: colors.palmLeaves,
            flatShading: true,
            roughness: 0.8
        });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.y = 2 * scale;
        leaves.rotation.x = Math.PI * 0.2;
        leaves.rotation.y = angle;
        leaves.castShadow = true;
        group.add(leaves);
    }
    
    group.position.set(x, getTerrainHeightAt(x, z), z);
    scene.add(group);
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

function createBeachUmbrella(x, z, parent) {
    const group = new THREE.Group();

    // Umbrella pole
    const poleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        flatShading: true
    });
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.rotation.x = Math.PI * 0.1;
    pole.castShadow = true;
    group.add(pole);

    // Umbrella top
    const topGeometry = new THREE.ConeGeometry(2, 0.5, 16);
    const topMaterial = new THREE.MeshStandardMaterial({
        color: colors.umbrella,
        flatShading: true,
        side: THREE.DoubleSide
    });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.y = 2;
    top.castShadow = true;
    group.add(top);

    // Beach towel
    const towelGeometry = new THREE.PlaneGeometry(2, 1);
    const towelMaterial = new THREE.MeshStandardMaterial({
        color: colors.towel,
        flatShading: true,
        side: THREE.DoubleSide
    });
    const towel = new THREE.Mesh(towelGeometry, towelMaterial);
    towel.rotation.x = -Math.PI / 2;
    towel.position.set(1.5, 0.01, 0);
    towel.receiveShadow = true;
    group.add(towel);

    group.position.set(x, getTerrainHeightAt(x, z), z);
    group.rotation.y = Math.random() * Math.PI * 2;
    parent.add(group);
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