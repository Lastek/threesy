import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'; // Add this import at the top
import * as sRand from '../src/seededRand.js'
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';

// document.body.appendChild(shadowFolder.dom);
const stats = new Stats();
document.body.appendChild(stats.dom);

let scene, camera, renderer, clock;
let terrain, character, water;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = true, velocity = new THREE.Vector3(), isJumping = false;
let characterSpeed = 0.23;
let gravity = 0.005;
let jumpForce = 0.2;

let orbs = [];
let collectedOrbs = 0;

const palmCache = new Map();
// Camera settings
let cameraAngle = 0;
const CAMERA_HEIGHT = 3;
const CAMERA_DISTANCE = 5;
const CAMERA_LERP = 0.1;
const ROTATION_SPEED = 0.02;

const frustum = new THREE.Frustum();
const cameraViewProjectionMatrix = new THREE.Matrix4();
class CullableObject {
    constructor(object) {
        this.object = object;
        this.visible = true;
        this.boundingSphere = new THREE.Sphere();
        this.updateBoundingSphere();
    }

    updateBoundingSphere() {
        this.object.updateMatrixWorld(true);
        this.boundingSphere.setFromObject(this.object);
    }

    checkVisibility() {
        this.visible = frustum.intersectsSphere(this.boundingSphere);
        this.object.visible = this.visible;
    }
}
// Add character color to your colors object
const colors = {
    sky: 0x87CEEB,
    sand: 0xEDC9AF,
    water: 0x0077FF,
    palmTrunk: 0x4A3A2A,
    palmLeaves: 0x228833,
    rock: 0x555555,
    character: 0xdefdef// Added missing character color
};

// Helper function to get the terrain height at a given (x, z)
function getTerrainHeightAt(x, z) {
    if (!terrain) return 0;

    // Add early exit for distant areas
    if (Math.abs(x) > 400 || Math.abs(z) > 400) return 0;
    
    // Use simplified calculation for distant areas
    if (Math.abs(x) > 200 || Math.abs(z) > 200) {
        return (Math.sin(x * 0.03) + Math.cos(z * 0.02)) * 2;
    }

    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3(x, 100, z); // Higher origin (above max terrain height)
    const direction = new THREE.Vector3(0, -1, 0);
    raycaster.set(origin, direction);
    terrain.updateMatrixWorld()
    const intersects = raycaster.intersectObject(terrain, true);

    if (intersects.length > 0) {
        return intersects[0].point.y;
    }

    // Fallback: try multiple nearby points for hilly areas
    // const offsets = [
    //     [0, 0],   // Center
    //     [1, 0],   // Right
    //     [-1, 0],  // Left
    //     [0, 1],   // Up
    //     [0, -1]   // Down
    // ];
    // let heightSum = 0;
    // let validHits = 0;

    // // for (const [dx, dz] of offsets) {
    //     raycaster.set(new THREE.Vector3(x + dx, 100, z + dz), direction);
    //     const nearbyIntersects = raycaster.intersectObject(terrain, true);
    //     if (nearbyIntersects.length > 0) {
    //         heightSum += nearbyIntersects[0].point.y;
    //         validHits++;
    //     }
    // }

    return 0; // Average height or 0 if no hits
}
//
// Add cleanup for collected orbs
function collectOrb(index) {
    const orb = orbs[index];
    scene.remove(orb);
    orb.geometry.dispose();
    orb.material.dispose();
    orbs.splice(index, 1);
}
function init() {

const gui = new GUI();
const shadowFolder = gui.addFolder('Shadows');
    clock = new THREE.Clock();
    sRand.setSeed(2);
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(colors.sky);
    scene.fog = new THREE.Fog(colors.sky, 20, 700);

    // Add AxesHelper widget
    const axesHelper = new THREE.AxesHelper(1); // Size of 1 unit for each axis
    axesHelper.position.set(-4, 4, 0); // Initial position (adjusted later)
    scene.add(axesHelper);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Reduced from 2
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Slightly cheaper than PCFSoftShadowMap
    renderer.shadowMap.autoUpdate = true;

    // Add this to your init function renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2 for performance

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Increased from 0.6 for softer lighting
    scene.add(ambientLight);

    // const directionalLight = new THREE.HemisphereLight(0x99aaee,0xffffff, 0.8);
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(100,180, 50); // Positioned behind the terrain
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = - 200;
    sun.shadow.camera.left = - 200;
    sun.shadow.camera.right = 200;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 4000;
    scene.add(sun);
    // Add a backlight for transmission effect
    const backLight = new THREE.DirectionalLight(0xffffff, 0.1);
    backLight.position.set(-100, 50, -50); // Positioned behind the terrain
    scene.add(backLight);

    shadowFolder.add(renderer.shadowMap, 'enabled').name('Enable Shadows');
    shadowFolder.add(sun, 'castShadow').name('Light Cast Shadows');
    shadowFolder.add(sun.shadow, 'bias', -0.01, 0.01).name('Shadow Bias');
    shadowFolder.add(sun.shadow.camera, 'near', 0.1, 100).name('Shadow Near');
    shadowFolder.add(sun.shadow.camera, 'far', 1, 500).name('Shadow Far');
    createTerrain();
    createWater();
    createCharacter();
    setupControls();
    createCoastlineVegetation();
    createOrbs();
    createRocks();
    window.addEventListener('resize', onWindowResize, false);
    document.body.appendChild(renderer.domElement);


    shadowFolder.open();
    animate();
}
function updateAxesWidget() {
    const axesHelper = scene.getObjectByName('axesWidget') || scene.children.find(child => child instanceof THREE.AxesHelper);
    if (!axesHelper) return;

    // Set a unique name for easier access
    axesHelper.name = 'axesWidget';

    // Scale down the axes for widget size
    axesHelper.scale.set(0.5, 0.5, 0.5); // Smaller size (adjust as needed)

    // Position in top-left corner
    const screenPos = new THREE.Vector2(-0.85, 0.85); // Normalized device coordinates (-1 to 1), top-left
    const distanceFromCamera = 10; // Distance from camera (adjust for visibility)

    // Convert screen coordinates to world coordinates
    const vector = new THREE.Vector3(screenPos.x, screenPos.y, 0.5); // Z = 0.5 for depth
    vector.unproject(camera);
    const dir = vector.sub(camera.position).normalize();
    const pos = camera.position.clone().add(dir.multiplyScalar(distanceFromCamera));

    axesHelper.position.copy(pos);
    axesHelper.rotation.set(0, 0, 0); // Keep aligned with global axes (optional: match camera rotation)
}
function createPBRMaterial(baseColorUrl, normalUrl, roughnessUrl, displacementUrl, aoUrl) {
    const textureLoader = new THREE.TextureLoader();
    const exrLoader = new EXRLoader(); // Add EXR loader
    const mat = new THREE.MeshPhysicalMaterial({
        color: 0xEDC9AF, // Your original sand color from `colors.sand`
        shadowSide: THREE.FrontSide, // Improve shadow rendering
        roughness: 0.8, // Slightly higher default roughness for sand
        metalness: 0.0, // Low metalness for sandy beach
        displacementScale: 0.4, // Reduce this if displacement noise is too strong
        displacementBias: -0.0, // Optiponal: tweak if displacement offsets are off
        transmission: 0.2, // Subtle transmission for light scattering (0-1 range)
        displacementScale:0.5,
        specularIntensity: 0.0,
        thickness: 0.3,   // Depth in world units, controls how much light penetrates
        envMapIntensity: 0.0, // Keep reflections minimal
        normalMapType: THREE.TangentSpaceNormalMap,
    });


    function loadTexture(url, mapType, isEXR = false) {
        if (!url) return;
        const loader = isEXR ? exrLoader : textureLoader;
        const onLoaded = texture => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(25, 25); // Test with lower values (e.g., 20, 20 or 50, 50)

            // Default filtering for all textures
            texture.minFilter = THREE.LinearMipmapLinearFilter; // Use mipmaps for downscaling
            texture.magFilter = THREE.LinearFilter; // Smooth upscaling
            texture.generateMipmaps = !isEXR; // Only generate mipmaps for non-EXR

            // Special handling for normal map to reduce noise
            if (mapType === 'normalMap' || mapType === 'baseColorUrl') {
                texture.minFilter = THREE.LinearMipmapLinearFilter; // Ensure mipmapping
                texture.magFilter = THREE.LinearFilter; // Smooth magnification
                texture.generateMipmaps = !isEXR;
                texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4); // Get anisotropy
                mat.normalScale = new THREE.Vector2(0.3, 0.3); // Reduce intensity (default is 1, 1)
                if (isEXR) {
                    texture.encoding = THREE.LinearEncoding; // Normal maps should stay linear
                }
            } else if (isEXR) {
                texture.encoding = THREE.LinearEncoding; // EXR encoding
            } else {
                texture.encoding = THREE.sRGBEncoding; // Base color in sRGB
            }

            mat[mapType] = texture;
            mat.needsUpdate = true;
        };

        loader.load(
            url,
            onLoaded,
            undefined,
            err => console.error(`Error loading ${mapType} from ${url}:`, err)
        );
    }

    // Load textures with automatic EXR detection
    loadTexture(baseColorUrl, 'map', baseColorUrl.endsWith('.exr'));
    loadTexture(normalUrl, 'normalMap', normalUrl.endsWith('.exr'));
    loadTexture(roughnessUrl, 'roughnessMap', roughnessUrl.endsWith('.exr'));
    loadTexture(aoUrl, 'aoMap', aoUrl.endsWith('.exr'));
    loadTexture(displacementUrl, 'displacementMap', displacementUrl.endsWith('.exr'));
    loadTexture(displacementUrl, 'thicknessMap', displacementUrl && displacementUrl.endsWith('.exr')); // Reuse displacement

    return mat;
}

function createTerrain() {
    // Terrain geometry
    const terrainGeometry = new THREE.PlaneGeometry(800, 800, 150, 150);
    const sandMaterial = createPBRMaterial(
        'textures/sandy2/ground_0024_color_1k.jpg',
        'textures/sandy2/ground_0024_normal_opengl_1k.png',
        'textures/sandy2/ground_0024_roughness_1k.jpg',
        'textures/sandy2/ground_0024_height_1k.png',
        'textures/sandy2/ground_0024_ao_1k.jpg',
    )

    // Add gentle hills using noise
    const vertices = terrainGeometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i + 2] = (Math.sin(vertices[i] * 0.03) + Math.cos(vertices[i + 1] * 0.02)) * 2;
    }

    // Update geometry buffers
    terrainGeometry.attributes.position.needsUpdate = true;
    terrainGeometry.computeVertexNormals();

    sandMaterial.shadowSide = THREE.FrontSide;
    // Create terrain mesh
    terrain = new THREE.Mesh(terrainGeometry, sandMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    terrain.position
    scene.add(terrain);
}

// Keep only ONE createCharacter function (replace both with this version)
function createCharacter() {
    const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
    const headGeometry = new THREE.SphereGeometry(0.4);
    const material = new THREE.MeshStandardMaterial({ color: colors.character });

    const body = new THREE.Mesh(bodyGeometry, material);
    const head = new THREE.Mesh(headGeometry, material);
    head.position.y = 1.2;

    character = new THREE.Group();
    character.add(body, head);
    character.castShadow = true;
    character.position.set(0, 4, 0);
    scene.add(character);
}

function createWater() {
    const waterGeometry = new THREE.PlaneGeometry(800, 800);
    const waterMaterial = new THREE.MeshStandardMaterial({
        color: colors.water,
        depthWrite: false, // Improve water rendering
        transparent: true,
        opacity: 0.6,
        metalness: 0.8,
        roughness: 0.2
    });

    water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.8;
    scene.add(water);
}

function generatePalmTree(x, y, z) {
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 6, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: colors.palmTrunk });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, y + 3, z);

    const leavesGeometry = new THREE.ConeGeometry(3, 4, 8);
    const leavesMaterial = new THREE.MeshStandardMaterial({ color: colors.palmLeaves });
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.set(x, y + 8, z);
    // leaves.rotation.x = Math.PI / 2;

    const tree = new THREE.Group();
    tree.add(trunk, leaves);
    tree.castShadow = true;
    scene.add(tree);
}
function addCurveVisualizer(points) {
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 64, 0.2, 8, false);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 5;
    scene.add(mesh);
}


function createCoastlineVegetation() {
    // Define your coastline path with control points
    const coastlinePoints = [
        new THREE.Vector3(150, 0, 60),
        new THREE.Vector3(33, 0, 30),
        new THREE.Vector3(25, 0, -0),  // End point
        new THREE.Vector3(35, 0, -50)  // End point
    ];
    addCurveVisualizer(coastlinePoints);
    // Create a smooth curve through the points
    const coastlineCurve = new THREE.CatmullRomCurve3(coastlinePoints);
    const curvePoints = coastlineCurve.getPoints(41); // Get sampled points along curve

    // Configuration
    const clusterCount = 10;
    const treesPerCluster = 6;
    const clusterSpread = 17;
    const minTreeScale = 0.7;
    const maxTreeScale = 1.2;

    // Create clusters along the curve
    for (let i = 0; i < clusterCount; i++) {
        const t = i / (clusterCount - 1);
        const curvePoint = coastlineCurve.getPoint(t);
        const tangent = coastlineCurve.getTangent(t).normalize();
        
        // Get perpendicular direction for offset
        const perpendicular = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        
        // Create cluster around this point
        for (let j = 0; j < treesPerCluster; j++) {
            // Random offset in both tangent and perpendicular directions
            const offset = perpendicular.clone()
                .multiplyScalar((Math.random() - 0.5) * clusterSpread)
                .add(tangent.clone().multiplyScalar((Math.random() - 0.5) * clusterSpread * 0.5));

            const position = curvePoint.clone().add(offset);
            
            // Get actual terrain height
            position.y = getTerrainHeightAt(position.x, position.z);
            
            // Random tree rotation and scale
            const rotationY = Math.random() * Math.PI * 2;
            const scale = minTreeScale + Math.random() * (maxTreeScale - minTreeScale);
            const type = 'models/low_poly_palm_tree.glb';
            createPalmTree(
                position.x, 
                position.y, 
                position.z, 
                rotationY, 
                scale,
                type
            );
        }
    }
}
// Call with: addCurveVisualizer(coastlinePoints);
function createPalmTreeLine_old() {

    const spawnPoint = new THREE.Vector3(30, 0, -30); // Near player spawn (y adjusted by terrain)
    const treeLineLength = 50; // Length of the treeline along X axis
    const clusterCount = 6; // Number of clusters
    const treesPerCluster = 8; // Trees per cluster
    const clusterSpread = 10; // Max distance trees spread within a cluster
    const offsetZ = 10; // Distance from spawn along Z axis to avoid player overlap

    for (let i = 0; i < clusterCount; i++) {
        // Base position for each cluster along the X axis
        const clusterX = spawnPoint.x - treeLineLength / 2 + (i * treeLineLength) / (clusterCount - 1);
        const clusterZ = spawnPoint.z + offsetZ + Math.sin(i / (clusterCount - 1) * Math.PI) * 5;
        // Create a cluster of trees
        for (let j = 0; j < treesPerCluster; j++) {
            // Random offset within cluster
            const offsetX = (Math.random() - 0.5) * clusterSpread;
            const offsetZ = (Math.random() - 0.5) * clusterSpread;
            const rotY = 20+(Math.random()*360) * clusterSpread;
            const x = clusterX + offsetX;
            const z = clusterZ + offsetZ;
            const scale = 0.9 * (0.8 + Math.random() * 0.4); // 0.16 to 0.28
            // Use existing createPalmTree function
            // Pass 0 for y since terrain height is handled inside
            createPalmTree(x, 0, z, rotY,scale);
        }
    }
}
function createPalmTree(x, y, z, rotY, scale, type) {
    if (!palmCache.has(type)) {
        // Load once and clone
    const loader = new GLTFLoader();
    loader.load(
        type, (gltf) => {

            gltf.scene; // THREE.Group
            // gltf.scenes; // Array<THREE.Group>
            // gltf.cameras; // Array<THREE.Camera>
            // gltf.asset; // Object
            palmCache.set(type, gltf.scene);
            instantiatePalm(x, y, z, rotY, scale, type);
        //     console.log(`Palm tree loaded at (${x}, ${terrainHeight}, ${z})`);
        // },
        // (progress) => {
        //     console.log(`Loading palm tree: ${(progress.loaded / progress.total * 100).toFixed(2)}%`);
        // },
        // (error) => {
        //     console.error('Error loading palm tree model:', error);
        }

    );
    } else {
        instantiatePalm(x, y, z, rotY, scale, type);
    }
}

function instantiatePalm(x, y, z, rotY, scale, type) {
    const tree = palmCache.get(type).clone();
    tree.scale.set(scale, scale, scale);
    // Position on terrain
    const terrainHeight = getTerrainHeightAt(x, z);
    tree.position.set(x, terrainHeight, z);
    tree.rotation.set(0,rotY, 0);
    // gltf.animations; // Array<THREE.AnimationClip>
    // Enable shadows and inspect materials
    tree.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true; // Only cast shadows for every other tree
                child.receiveShadow = true;
            // Detailed material logging
            console.log('Mesh name:', child.name);
            console.log('Material:', {
                name: child.material.name,
                color: child.material.color?.getHexString(),
                map: child.material.map ? 'Texture present' : 'No texture',
                specular: child.material.specular?.getHexString(),
                glossiness: child.material.glossiness,
                extensions: child.material.extensions
            });
            
            // Fix texture color space
            if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.needsUpdate = true;
            }
            // child.materials.shadowSide = THREE.FrontSide;

        }
    });

    // const cullable = new CullableObject(tree);
    // cullableObjects.push(cullable);
    scene.add(tree);
}

let rockGeometry, rockMaterial, rockMesh;

function createRocks() {
    rockGeometry = new THREE.SphereGeometry(1, 4, 4);
    rockMaterial = new THREE.MeshStandardMaterial({ color: colors.rock });
    rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, 20);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 20; i++) {
        const scale = 0.2 + Math.random() * 0.8;
        matrix.makeScale(scale, scale * 0.8, scale);
        
        const position = new THREE.Vector3(
            (Math.random() - 0.5) * 200,
            0.5,
            (Math.random() - 0.5) * 200
        );
        matrix.setPosition(position);
        
        rockMesh.setMatrixAt(i, matrix);
    }

    // const cullable = new CullableObject(rockMesh);
    // cullableObjects.push(cullable);
    scene.add(rockMesh);
}

const dt = 1.0 / 60.0;
let lastWaterUpdate = 0;
function updateWater() {
    const time = clock.getElapsedTime();
    if (time - lastWaterUpdate > dt) { // Update every 100ms
        water.material.opacity = 0.5 + Math.sin(time + 0.1) * 0.05;
        water.position.y = 1.2 + Math.sin(time) * 0.05;
        lastWaterUpdate = time;
    }
}


// New functions
function createOrb(x, z) {
    const orbGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const orbMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.8,
        transmission: 0.0
    });

    const orb = new THREE.Mesh(orbGeometry, orbMaterial);
    const terrainHeight = getTerrainHeightAt(x, z);
    console.log("Orbs: ${terrainHeight} | ${x}, ${z}", terrainHeight, x, z);
    orb.position.set(x, terrainHeight + 1.5, z);
    orb.castShadow = true;
    orb.userData = {
        initialY: orb.position.y,
        phase: sRand.seededRandom() * Math.PI * 2
    };

    scene.add(orb);
    orbs.push(orb);
}

function createOrbs() {
    const orbCount = 20;
    for (let i = 0; i < orbCount; i++) {
        const x = (sRand.seededRandom() - 0.5) * 200;
        const z = (sRand.seededRandom() - 0.5) * 200;
        createOrb(x, z);
    }
}

let lastOrbUpdate = 0;
function updateOrbs() {
    const time = clock.getElapsedTime();
    if (time - lastOrbUpdate > dt) { // Update every 50ms
        orbs.forEach(orb => {
            const { initialY, phase } = orb.userData;
            orb.position.y = initialY + Math.sin(time * 2 + phase) * 0.2;
        });
        lastOrbUpdate = time;
    }
}
// function createCharacter() {
//     const geometry = new THREE.BoxGeometry(0.5, 1, 0.5);
//     const material = new THREE.MeshStandardMaterial({
//         color: colors.character,
//         flatShading: true
//     });
//     character = new THREE.Mesh(geometry, material);
//     character.position.set(0, getTerrainHeightAt(0, 0) + 10.2, 0);
//     character.castShadow = true;
//     scene.add(character);

//     camera.position.set(0, 8, 5);
//     camera.lookAt(character.position);
// }

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
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyD': moveRight = true; break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
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
    // ... existing code up to terrain raycast ...
    if (intersects.length > 0) {
        const groundY = intersects[0].point.y;
        if (character.position.y < groundY + 1.2) {
            character.position.y = groundY + 1.2;
            velocity.y = 0;
            isJumping = false;
            canJump = true;
        }
    }

    for (let i = orbs.length - 1; i >= 0; i--) {
        const orb = orbs[i];
        const distance = character.position.distanceTo(orb.position);
        if (distance < 0.8) {
            scene.remove(orb);
            orbs.splice(i, 1);
            collectedOrbs++;
            console.log(`Collected orb! Total: ${collectedOrbs}`);
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

// function updateCamera() {
//     // Add distance check
//     const maxDistance = 100;
//     if (camera.position.distanceTo(character.position) > maxDistance) {
//         camera.position.copy(character.position).add(idealOffset);
//     } else {
//         camera.position.lerp(targetPosition, CAMERA_LERP);
//     }
// }

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    stats.begin()
    requestAnimationFrame(animate);
    // // Update frustum and check visibility
    // updateFrustum();
    // cullableObjects.forEach(obj => {
    //     obj.checkVisibility();
    // });

    // // Only update visible objects
    // cullableObjects.forEach(obj => {
    //     if (obj.visible) {
    //         // Update object-specific logic here
    //     }
    // });
    updateCharacter();
    updateWater();
    updateOrbs();
    updateAxesWidget();

    renderer.render(scene, camera);
    renderer.shadowMap.needsUpdate = true;
    stats.end()
}

init();