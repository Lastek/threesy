import * as THREE from 'three';
// import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader'; // Add this import at the top
import * as sRand from '../src/seededRand'
import Stats from 'three/examples/jsm/libs/stats.module';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min';
import { DDSLoader } from 'three/examples/jsm/loaders/DDSLoader';

// import * as joy from '../src/joystick.js';
const stats = new Stats();
document.body.appendChild(stats.dom);

let scene, cameraRig, camera, lights, renderer, clock;

const Gui = new GUI();
let shadowFolder;

let deltaTime ;
let terrain, character, water;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = true, velocity = new THREE.Vector3(), isJumping = false;
let characterSpeed = 20;
let gravity = 0.0098;
let jumpForce = 0.2;
let orbs = [];
let collectedOrbs = 0;

const palmCache = new Map();
// Add these variables near the top with other global variables
let isMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;
let MOUSE_SENSITIVITY = 0.002;
let isPointerLocked = false;

// Add these variables near the other character variables
let moveVelocity = new THREE.Vector2(0, 0); // x and z velocity for movement
const MAX_SPEED = 20.0; // Same as previous characterSpeed
const ACCELERATION = 420.015;
const DECELERATION = 120.01;
const TURN_SPEED = 0.15; // How quickly the character turns to face movement direction
// Camera settings
let cameraDistance = 1; // Increased from 2 for better view
let cameraLerp = 2.1;
let cameraAngle = 0;         // Yaw (horizontal rotation)
let cameraPitch = 0.3;       // Pitch (vertical rotation)
let MIN_PITCH = -0.5;      // radians
let MAX_PITCH = 0.5;
// Camera quaternions for smooth rotation
let currentCameraQuat = new THREE.Quaternion();
let targetCameraQuat = new THREE.Quaternion();
let cameraRotationMatrix = new THREE.Matrix4();
// Add camera velocity for spring physics
let cameraVelocity = new THREE.Vector3();
// Advanced camera settings
let minCameraDistance = 0.2;
let cameraSpringStrength = 0.15;
let cameraDamping = 0.4;
let cameraHeight = 2;    // Changed from const to let
// Character
let model, skeleton, mixer;
let idleAction, walkAction, runAction;

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

// Add cleanup for collected orbs

// Camera debug helpers
let cameraForwardArrow, cameraRightArrow, cameraUpArrow;
const ARROW_LENGTH = 2;
const ARROW_COLORS = {
    forward: 0x0000ff, // Blue for forward
    right: 0xff0000,   // Red for right
    up: 0x00ff00       // Green for up
};

async function init() {
    clock = new THREE.Clock();
    // deltaTime = clock.getDelta();
    // deltaTime = 1
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
    camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 600);
    camera.position.set(0, 5, 10);
    // Initialize in your setup code
    cameraRig = new THREE.Object3D();
    scene.add(cameraRig);
    cameraRig.add(camera);

    initRenderer();

    lights = initLights();
    Object.values(lights).forEach(element => {
        console.info(element);
        scene.add(element);
    });

    await createTerrain();
    createWater();
    await createCharacter();
    setupControls();
    createCoastlineVegetation();
    createOrbs();
    createRocks();

    window.addEventListener('resize', onWindowResize, false);
    document.body.appendChild(renderer.domElement);
    animate();
    createFoldout();
    // console.log(scene.remove(character));

    // console.log(JSON.stringify(scene.toJSON()));

    // Create camera orientation helpers
    createCameraHelpers();
}

function createFoldout() {
    shadowFolder = Gui.addFolder('Shadows');
    shadowFolder.add(renderer.shadowMap, 'enabled').name('Enable Shadows');
    shadowFolder.add(lights['sunLight'], 'castShadow').name('Light Cast Shadows');
    shadowFolder.add(lights['sunLight'].shadow, 'bias', -0.01, 0.01).name('Shadow Bias');
    shadowFolder.add(lights['sunLight'].shadow.camera, 'near', 0.1, 100).name('Shadow Near');
    shadowFolder.add(lights['sunLight'].shadow.camera, 'far', 1, 500).name('Shadow Far');
    shadowFolder.open();

    const characterFolder = Gui.addFolder('Character');
    characterFolder.add(character, 'visible').name('Enable Character');

    const characterControls = {
        removeCharacter: function () {
            scene.remove(character);
        },
        addCharacter: function () {
            scene.add(character);
        }
    };

    characterFolder.add(characterControls, 'removeCharacter').name('Remove Character');
    characterFolder.add(characterControls, 'addCharacter').name('Add Character');
    characterFolder.open();

    // Camera and Controls GUI
    const cameraFolder = Gui.addFolder('Camera');
    const cameraControls = {
        // Basic camera settings
        distance: cameraDistance,
        height: cameraHeight,
        minDistance: minCameraDistance,
        
        // Mouse sensitivity
        mouseSensitivity: MOUSE_SENSITIVITY,
        
        // Camera pitch limits
        minPitch: MIN_PITCH,
        maxPitch: MAX_PITCH,
        currentPitch: cameraPitch,
        
        // Camera movement settings
        lerpSpeed: cameraLerp,
        springStrength: cameraSpringStrength,
        damping: cameraDamping,
        
        // Auto-follow settings
        swivelSpeed: CAMERA_SWIVEL_SPEED,
        swivelThreshold: CAMERA_SWIVEL_THRESHOLD,
        maxSwivelAngle: MAX_SWIVEL_ANGLE,
        
        // Reset camera
        resetCamera: function() {
            cameraAngle = 0;
            cameraPitch = 0.3;
            targetCameraAngle = 0;
        }
    };

    // Basic camera controls
    cameraFolder.add(cameraControls, 'distance', 0.2, 10)
        .name('Camera Distance')
        .onChange(value => { cameraDistance = value; });
    
    cameraFolder.add(cameraControls, 'height', 0, 8)
        .name('Camera Height')
        .onChange(value => { cameraHeight = value; });
    
    cameraFolder.add(cameraControls, 'minDistance', 0.5, 5)
        .name('Min Distance')
        .onChange(value => { minCameraDistance = value; });

    // Mouse sensitivity
    cameraFolder.add(cameraControls, 'mouseSensitivity', 0.0001, 0.01)
        .name('Mouse Sensitivity')
        .onChange(value => { MOUSE_SENSITIVITY = value; });

    // Camera pitch settings
    const pitchFolder = cameraFolder.addFolder('Pitch Settings');
    pitchFolder.add(cameraControls, 'minPitch', -Math.PI/2, 0)
        .name('Min Pitch')
        .onChange(value => { MIN_PITCH = value; });
    
    pitchFolder.add(cameraControls, 'maxPitch', 0, Math.PI/2)
        .name('Max Pitch')
        .onChange(value => { MAX_PITCH = value; });
    
    pitchFolder.add(cameraControls, 'currentPitch', -Math.PI/2, Math.PI/2)
        .name('Current Pitch')
        .onChange(value => { cameraPitch = value; });

    // Camera movement settings
    const movementFolder = cameraFolder.addFolder('Movement Settings');
    movementFolder.add(cameraControls, 'lerpSpeed', 0.1, 5)
        .name('Lerp Speed')
        .onChange(value => { cameraLerp = value; });
    
    movementFolder.add(cameraControls, 'springStrength', 0.05, 1)
        .name('Spring Strength')
        .onChange(value => { cameraSpringStrength = value; });
    
    movementFolder.add(cameraControls, 'damping', 0.1, 1)
        .name('Damping')
        .onChange(value => { cameraDamping = value; });

    // Auto-follow settings
    const followFolder = cameraFolder.addFolder('Auto-Follow Settings');
    followFolder.add(cameraControls, 'swivelSpeed', 0.01, 0.1)
        .name('Swivel Speed')
        .onChange(value => { CAMERA_SWIVEL_SPEED = value; });
    
    followFolder.add(cameraControls, 'swivelThreshold', 0.01, 0.5)
        .name('Swivel Threshold')
        .onChange(value => { CAMERA_SWIVEL_THRESHOLD = value; });
    
    followFolder.add(cameraControls, 'maxSwivelAngle', 0, Math.PI)
        .name('Max Swivel Angle')
        .onChange(value => { MAX_SWIVEL_ANGLE = value; });

    // Reset button
    cameraFolder.add(cameraControls, 'resetCamera').name('Reset Camera');

    // Open the main camera folder by default
    cameraFolder.open();

    // Add debug visualization controls
    const debugFolder = Gui.addFolder('Debug Visualization');
    const debugControls = {
        showCameraOrientation: false,
        arrowLength: ARROW_LENGTH
    };

    debugFolder.add(debugControls, 'showCameraOrientation')
        .name('Show Camera Orientation')
        .onChange(value => {
            cameraForwardArrow.visible = value;
            cameraRightArrow.visible = value;
            cameraUpArrow.visible = value;
        });

    debugFolder.add(debugControls, 'arrowLength', 0.5, 5)
        .name('Arrow Length')
        .onChange(value => {
            cameraForwardArrow.setLength(value, value * 0.1, value * 0.05);
            cameraRightArrow.setLength(value, value * 0.1, value * 0.05);
            cameraUpArrow.setLength(value, value * 0.1, value * 0.05);
        });

    debugFolder.open();
}

function toggleVisible(object) {
    if (object.visible) {
        object.visible = false;
    } else { object.visible = true; }
}

function initRenderer() {
    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0)); // Reduced from 2
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Slightly cheaper than PCFSoftShadowMap
    renderer.shadowMap.autoUpdate = true;

    // Add this to your init function renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2 for performance
}

function initLights() {
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Increased from 0.6 for softer lighting
    // const directionalLight = new THREE.HemisphereLight(0x99aaee,0xffffff, 0.8);
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
    sunLight.position.set(100, 180, 50); // Positioned behind the terrain
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    // Viewbox for sunLight camera (effective distance)
    sunLight.shadow.camera.top = 200;
    sunLight.shadow.camera.bottom = -200;
    sunLight.shadow.camera.left = - 200;
    sunLight.shadow.camera.right = 200;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 400;
    // Add a backlight for transmission effect
    const backLight = new THREE.DirectionalLight(0xffffff, 0.1);
    backLight.position.set(-100, 50, -50); // Positioned behind the terrain

    return {
        'sunLight': sunLight,
        'ambientLight': ambientLight,
        'backLight': backLight,
    }
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

async function createPBRMaterial(baseColorUrl, normalUrl, roughnessUrl, displacementUrl, aoUrl) {
    const textureLoader = new THREE.TextureLoader();
    const ddsLoader = new DDSLoader();
    const exrLoader = new EXRLoader();

    // Default fallback material (sand-like appearance)
    const fallbackMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xEDC9AF, // Sandy color
        roughness: 0.8,
        metalness: 0.0,
        shadowSide: THREE.FrontSide
    });
    const fallbackTexture_src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAFiUAABYlAUlSJPAAAACQSURBVHhe7dAxAQAgEIBAI385e9ngLUADGG5h5Lw7a9YAiiYNoGjSAIomDaBo0gCKJg2gaNIAiiYNoGjSAIomDaBo0gCKJg2gaNIAiiYNoGjSAIomDaBo0gCKJg2gaNIAiiYNoGjSAIomDaBo0gCKJg2gaNIAiibyAbMfugtC4CK4i+wAAAAASUVORK5CYII=";

    // Primary material definition
    const physical_material = new THREE.MeshPhysicalMaterial({
        color: 0xEDC9AF,
        shadowSide: THREE.FrontSide,
        roughness: 0.8,
        metalness: 0.0,
        displacementScale: 0.5,
        displacementBias: -0.0,
        transmission: 0.2,
        specularIntensity: 0.0,
        thickness: 0.3,
        envMapIntensity: 0.0,
        normalMapType: THREE.TangentSpaceNormalMap
    });

    // Function to load a texture with a Promise
    function loadTexture(url, mapType, mat) {
        if (!url) return Promise.resolve(null); // Skip if no URL

        let loader;
        if (url.toLowerCase().endsWith('.dds')) {
            loader = ddsLoader;
        } else if (url.toLowerCase().endsWith('.exr')) {
            loader = exrLoader;
        } else {
            loader = textureLoader;
        }

        return new Promise((resolve, reject) => {
            loader.load(
                url,
                (texture) => {
                    if (texture.image.height === 0) reject(false); // Hack: Loader will not fail otherwise if it can't load a texture for some reason.
                    texture.wrapS = THREE.RepeatWrapping;
                    texture.wrapT = THREE.RepeatWrapping;
                    texture.repeat.set(25, 25);

                    texture.minFilter = THREE.LinearMipmapLinearFilter;
                    texture.magFilter = THREE.LinearFilter;

                    if (!(texture instanceof THREE.CompressedTexture)) {
                        texture.generateMipmaps = true;
                    }

                    if (mapType === 'normalMap') {
                        texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
                        mat.normalScale = new THREE.Vector2(0.3, 0.3);
                    }

                    mat[mapType] = texture;
                    mat.needsUpdate = true;
                    resolve(texture);
                },
                undefined,
                (err) => {
                    console.error(`Failed to load ${mapType} texture from ${url}:`, err);
                    reject(err);
                }
            );
        });
    }

    // Load all textures concurrently and handle failures
    const texturePromises = [
        loadTexture(baseColorUrl, 'map', physical_material),
        loadTexture(normalUrl, 'normalMap', physical_material),
        loadTexture(roughnessUrl, 'roughnessMap', physical_material),
        loadTexture(displacementUrl, 'displacementMap', physical_material),
        loadTexture(aoUrl, 'aoMap', physical_material),
        loadTexture(displacementUrl, 'thicknessMap', physical_material) // Reusing displacement
    ];

    return Promise.allSettled(texturePromises).then((results) => {
        const textureMaps = ['map', 'normalMap', 'roughnessMap', 'displacementMap', 'aoMap', 'thicknessMap'];
        const hasFailures = results.some(result => result.status === 'rejected');

        if (hasFailures) {
            console.warn('One or more textures failed to load; using fallback material');
            loadTexture(fallbackTexture_src, 'map', fallbackMaterial);
            console.warn(fallbackMaterial);
            return fallbackMaterial;
        }
        return physical_material; // All textures loaded successfully
    }).catch((err) => {
        console.error('Unexpected error in texture loading:', err);
        loadTexture(fallbackTexture_src, 'map', fallbackMaterial);
        console.warn(fallbackMaterial);
        return fallbackMaterial; // Fallback on unexpected errors
    });
}

async function createTerrain() {
    const sandTextures = [
        'textures/sandy2/ground_0024_color_1k.DDS',
        'textures/sandy2/ground_0024_normal_opengl_1k.DDS',
        'textures/sandy2/ground_0024_roughness_1k.DDS',
        'textures/sandy2/ground_0024_height_1k.DDS',
        'textures/sandy2/ground_0024_ao_1k.DDS'
    ]
    //////////////////////
    // Terrain geometry //
    //////////////////////
    const terrainGeometry = new THREE.PlaneGeometry(800, 800, 150, 150);
    // Add gentle hills using noise
    const vertices = terrainGeometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i + 2] = (Math.sin(vertices[i] * 0.03) + Math.cos(vertices[i + 1] * 0.02)) * 2;
    }
    // Update geometry buffers
    terrainGeometry.attributes.position.needsUpdate = true;
    terrainGeometry.computeVertexNormals();
    function skin_mesh(plane_geometry, material) {
        material.shadowSide = THREE.FrontSide;
        terrain = new THREE.Mesh(plane_geometry, material);
        terrain.rotation.x = -Math.PI / 2;
        terrain.receiveShadow = true;
        return terrain;
    }
    await createPBRMaterial(...sandTextures).then((sandMaterial) => {
        skin_mesh(terrainGeometry, sandMaterial);
        scene.add(terrain);
    }).catch(err => { console.error('Failed to create terrain:', err); })
}
async function loadCharacterModel() {
    const loader = new GLTFLoader();
    return new Promise((resolve, reject) => {
        loader.load('models/Soldier.glb', function (gltf) {
            model = gltf.scene;

            // Calculate model height and adjust position
            const bbox = new THREE.Box3().setFromObject(model);
            const modelHeight = bbox.max.y - bbox.min.y;
            const modelWidth = bbox.max.x - bbox.min.x;
            console.log("Model height:", modelHeight, "Model width:", modelWidth);

            // Create capsule helper with adjusted radius
            const radius = modelWidth / 4; // Smaller radius
            const height = modelHeight - (radius * 2);
            const capsuleGeometry = new THREE.CapsuleGeometry(radius, height, 4, 8);
            const wireframeMaterial = new THREE.MeshBasicMaterial({
                color: 0xff0000,
                wireframe: true,
                transparent: true,
                opacity: 0.5
            });
            const capsuleHelper = new THREE.Mesh(capsuleGeometry, wireframeMaterial);
            capsuleHelper.name = 'characterCapsule';

            // Adjust capsule position to better match character's feet
            capsuleHelper.position.y = height / 2 + radius / 2 + radius / 6;
            model.add(capsuleHelper);

            // Store capsule parameters for collision
            model.userData.capsule = {
                radius: radius,
                height: height,
                helper: capsuleHelper
            };

            // Add debug controls to GUI
            const debugFolder = Gui.addFolder('Debug');
            debugFolder.add(capsuleHelper, 'visible').name('Show Collision Capsule');
            debugFolder.open();

            scene.add(model);
            model.traverse(function (object) {
                if (object.isMesh) object.castShadow = true;
            });

            skeleton = new THREE.SkeletonHelper(model);
            skeleton.visible = false;
            scene.add(skeleton);

            // Set up animation mixer
            mixer = new THREE.AnimationMixer(model);

            // Get all animations
            const animations = gltf.animations;
            console.log("Available animations:", animations.map(a => a.name));

            // Create and store actions
            idleAction = mixer.clipAction(animations[0]);
            walkAction = mixer.clipAction(animations[3]);
            runAction = mixer.clipAction(animations[1]);

            // Configure animations
            walkAction.timeScale = 2; // Speed up walking animation

            // Set up action properties
            [idleAction, walkAction, runAction].forEach(action => {
                if (action) {
                    action.clampWhenFinished = false;
                    action.loop = THREE.LoopRepeat;
                    action.enabled = true;
                }
            });

            // Start with idle
            idleAction.play();

            resolve(model);
        });
    }).catch((err) => {
        console.error("Failed to load model: ", err);
        // reject(err);
    });
}
// Keep only ONE createCharacter function (replace both with this version)
async function createCharacter() {

    // character = new THREE.Group();
    await loadCharacterModel().then((char) => {
        console.log("char");
        console.log(char);

        // char.position.set(0, 4, 0);
        character = char;
        // char['quaternion']['_w'];
    });
    // const bodyGeometry = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
    // const headGeometry = new THREE.SphereGeometry(0.4);
    // const material = new THREE.MeshStandardMaterial({ color: colors.character });

    // const body = new THREE.Mesh(bodyGeometry, material);
    // const head = new THREE.Mesh(headGeometry, material);
    // head.position.y = 1.2;

    // character.add(body, head);
    character.castShadow = true;
    character.position.set(0, 2, 0);
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

function createPalmTree(x, y, z, rotY, scale, type) {
    if (!palmCache.has(type)) {
        // Load once and clone
        const loader = new GLTFLoader();
        loader.load(
            type, (gltf) => {
                gltf.scene;
                palmCache.set(type, gltf.scene);
                instantiatePalm(x, y, z, rotY, scale, type);
            }
        );
    } else { instantiatePalm(x, y, z, rotY, scale, type); }
}

function instantiatePalm(x, y, z, rotY, scale, type) {
    const terrainHeight = getTerrainHeightAt(x, z);
    const tree = palmCache.get(type).clone();

    tree.scale.set(scale, scale, scale);
    tree.position.set(x, terrainHeight, z); // Position on terrain
    tree.rotation.set(0, rotY, 0); // Rotate on XZ plane
    // Enable shadows and inspect materials
    tree.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true; // Only cast shadows for every other tree
            child.receiveShadow = true;
            // Fix texture color space
            if (child.material.map) {
                child.material.map.colorSpace = THREE.SRGBColorSpace;
                child.material.needsUpdate = true;
            }
            child.material.shadowSide = THREE.FrontSide;
        }
    });

    // const cullable = new CullableObject(tree);
    // cullableObjects.push(cullable);
    scene.add(tree);
}

let rockGeometry, rockMaterial, rockMesh;

function createRocks() {
    const matrix = new THREE.Matrix4();

    rockGeometry = new THREE.SphereGeometry(1, 4, 4);
    rockMaterial = new THREE.MeshStandardMaterial({ color: colors.rock });
    rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, 20);
    for (let i = 0; i < 20; i++) {
        const scale = 0.2 + Math.random() * 0.8;

        const position = new THREE.Vector3(
            (Math.random() - 0.5) * 200,
            0.5,
            (Math.random() - 0.5) * 200
        );
        matrix.makeScale(scale, scale * 0.8, scale);
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
        color: 0xffef50,
        emissive: 0xffff30,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.8,
        transmission: 0.0
    });

    const orb = new THREE.Mesh(orbGeometry, orbMaterial);
    const terrainHeight = getTerrainHeightAt(x, z);
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

function setupControls() {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    // Mouse controls for pointer lock - only on canvas
    renderer.domElement.addEventListener('click', (event) => {
        if (!isPointerLocked && event.target === renderer.domElement) {
            renderer.domElement.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        isPointerLocked = document.pointerLockElement === renderer.domElement;
    });

    // Auto-exit pointer lock when GUI is clicked
    Gui.domElement.addEventListener('mousedown', () => {
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isPointerLocked) {
            // Create rotation quaternions in camera's local space
            const rotationX = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                -e.movementX * MOUSE_SENSITIVITY
            );
            
            // Get camera's right vector for pitch rotation
            const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(currentCameraQuat);
            const rotationY = new THREE.Quaternion().setFromAxisAngle(
                cameraRight,
                -e.movementY * MOUSE_SENSITIVITY
            );
            
            // Apply pitch first, then yaw
            currentCameraQuat.multiply(rotationY);
            currentCameraQuat.multiply(rotationX);
            
            // Extract and clamp pitch
            const euler = new THREE.Euler().setFromQuaternion(currentCameraQuat, 'YXZ');
            euler.x = Math.max(MIN_PITCH, Math.min(MAX_PITCH, euler.x));
            
            // Reconstruct quaternion with clamped pitch
            currentCameraQuat.setFromEuler(euler);
            
            // Store this as the target for smooth transitions
            targetCameraQuat.copy(currentCameraQuat);
        }
    });

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
    // Get input direction relative to camera
    const inputDirection = new THREE.Vector2(0, 0);
    if (moveForward) inputDirection.y += 1;
    if (moveBackward) inputDirection.y -= 1;
    if (moveLeft) inputDirection.x -= 1;  // Changed: Flipped sign for correct camera-relative movement
    if (moveRight) inputDirection.x += 1;  // Changed: Flipped sign for correct camera-relative movement
    
    // Only normalize if there is input
    if (inputDirection.length() > 0) {
        inputDirection.normalize();
    }

    // Apply acceleration based on input
    if (inputDirection.length() > 0) {
        // Get camera's forward direction (ignoring pitch)
        const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(currentCameraQuat);
        cameraForward.y = 0;  // Project onto XZ plane
        cameraForward.normalize();
        
        // Get camera's right direction
        const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(currentCameraQuat);
        cameraRight.y = 0;  // Project onto XZ plane
        cameraRight.normalize();
        
        // Calculate movement direction in world space
        const moveDirection = new THREE.Vector3()
            .addScaledVector(cameraForward, inputDirection.y)
            .addScaledVector(cameraRight, inputDirection.x)
            .normalize();
        
        // Accelerate in movement direction
        moveVelocity.x += moveDirection.x * ACCELERATION * deltaTime;
        moveVelocity.y += moveDirection.z * ACCELERATION * deltaTime;  // Use z component for forward/back

        // Limit speed
        const currentSpeed = moveVelocity.length();
        if (currentSpeed > MAX_SPEED) {
            moveVelocity.multiplyScalar(MAX_SPEED / currentSpeed);
        }
    } else {
        // Apply deceleration when no input
        const currentSpeed = moveVelocity.length();
        if (currentSpeed > 0) {
            const newSpeed = Math.max(0, currentSpeed - DECELERATION * deltaTime);
            if (newSpeed === 0) {
                moveVelocity.set(0, 0);
            } else {
                moveVelocity.multiplyScalar(newSpeed / currentSpeed);
            }
        }
    }

    // Apply movement in world space
    character.position.x += moveVelocity.x * deltaTime;
    character.position.z += moveVelocity.y * deltaTime;

    // Character rotation
    if (moveVelocity.length() > 0.01) {
        // FIXED: Calculate target rotation based on actual movement direction in Three.js space
        const targetRotation = Math.atan2(-moveVelocity.x, -moveVelocity.y);
        
        // Smoothly interpolate rotation
        let currentRotation = character.rotation.y;
        let rotationDiff = targetRotation - currentRotation;
        
        // Normalize the rotation difference to [-PI, PI]
        while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
        
        character.rotation.y = currentRotation + rotationDiff * TURN_SPEED * deltaTime * 60;
    }

    // Animation state management based on velocity
    const speed = moveVelocity.length();
    if (speed > 0.01) {
        if (!runAction.isRunning()) {
            fadeToAction(runAction, 0.2);
        }
        // Scale animation speed with movement speed
        if (runAction) {
            runAction.timeScale = Math.max(0.7, Math.min(2.0, speed / MAX_SPEED * 2));
        }
    } else {
        if (!idleAction.isRunning()) {
            fadeToAction(idleAction, 0.2);
        }
    }

    // Vertical movement (jumping/gravity)
    velocity.y -= gravity;
    character.position.y += velocity.y;

    // Ground collision check
    const raycaster = new THREE.Raycaster();
    const capsule = character.userData.capsule;
    if (capsule) {
        const origin = new THREE.Vector3(
            character.position.x,
            character.position.y + capsule.radius / 2,
            character.position.z
        );
        const down = new THREE.Vector3(0, -1, 0);
        raycaster.set(origin, down);
        const intersects = raycaster.intersectObject(terrain, false);

        if (intersects.length > 0) {
            const groundY = intersects[0].point.y;
            if (character.position.y < groundY + capsule.radius / 2) {
                character.position.y = groundY + capsule.radius / 2;
                velocity.y = 0;
                isJumping = false;
                canJump = true;
            }
        }
    }

    // Orb collection
    for (let i = orbs.length - 1; i >= 0; i--) {
        const orb = orbs[i];
        const distance = character.position.distanceTo(orb.position);
        if (distance < 1.8) {
            scene.remove(orb);
            orbs.splice(i, 1);
            collectedOrbs++;
            console.log(`Collected orb! Total: ${collectedOrbs}`);
        }
    }

    updateCamera();
}

// Add these variables near other camera variables
let targetCameraAngle = cameraAngle;
let CAMERA_SWIVEL_SPEED = 5.0;  // Increased for more responsive following
let CAMERA_SWIVEL_THRESHOLD = 0.1;
let MAX_SWIVEL_ANGLE = Math.PI * 0.5; // Increased to allow faster turning

function updateCamera() {
    // Only calculate auto-follow when not actively moving mouse and character is moving
    if (moveVelocity.length() > CAMERA_SWIVEL_THRESHOLD && !isPointerLocked) {
        // Create a quaternion for the desired look direction
        const movementDir = new THREE.Vector3(moveVelocity.x, 0, moveVelocity.y).normalize();
        
        // Only rotate if the angle difference is significant
        const currentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(currentCameraQuat);
        currentForward.y = 0;
        currentForward.normalize();
        
        const angleToTarget = currentForward.angleTo(movementDir);
        if (angleToTarget > 0.01) {
            // Determine rotation direction (clockwise or counterclockwise)
            const cross = new THREE.Vector3().crossVectors(currentForward, movementDir);
            const rotationDirection = Math.sign(cross.y);
            
            // Calculate limited rotation
            const rotationAmount = Math.min(angleToTarget, MAX_SWIVEL_ANGLE * deltaTime);
            const rotationQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                rotationAmount * rotationDirection
            );
            
            // Apply the rotation to the target quaternion
            targetCameraQuat.copy(currentCameraQuat).multiply(rotationQuat);
        }
    }

    // Smooth camera rotation using spherical interpolation
    const interpolationFactor = Math.min(CAMERA_SWIVEL_SPEED * deltaTime * 60, 1.0);
    currentCameraQuat.slerp(targetCameraQuat, interpolationFactor);
    currentCameraQuat.normalize(); // Ensure quaternion stays normalized
    
    // Apply rotation to camera rig
    cameraRig.setRotationFromQuaternion(currentCameraQuat);
    
    // Calculate camera position using quaternion
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(currentCameraQuat);
    const up = new THREE.Vector3(0, 1, 0);
    
    // Calculate ideal camera position
    const offset = new THREE.Vector3()
        .addScaledVector(forward, -cameraDistance)
        .addScaledVector(up, cameraHeight);
    
    const idealRigPosition = character.position.clone().add(offset);
    
    // Check for camera collisions
    const adjustedPosition = checkCameraCollision(idealRigPosition);
    
    // Smooth position transition using spring physics
    const positionDelta = adjustedPosition.clone().sub(cameraRig.position);
    const springForce = positionDelta.multiplyScalar(cameraSpringStrength);
    
    // Apply spring physics with damping
    cameraVelocity.add(springForce);
    cameraVelocity.multiplyScalar(1 - cameraDamping);
    cameraRig.position.add(cameraVelocity);
    
    // Look at character (slightly above feet)
    const lookAtPos = character.position.clone().add(new THREE.Vector3(0, 1, 0));
    camera.lookAt(lookAtPos);

    // Update debug visualization arrows if visible
    if (cameraForwardArrow && cameraForwardArrow.visible) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(currentCameraQuat);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(currentCameraQuat);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(currentCameraQuat);

        cameraForwardArrow.setDirection(forward);
        cameraRightArrow.setDirection(right);
        cameraUpArrow.setDirection(up);
    }
}

// Add this helper function for camera collision detection
function checkCameraCollision(position) {
    const raycaster = new THREE.Raycaster();
    const origin = character.position.clone();
    origin.y += 1; // Start slightly above character

    const direction = position.clone().sub(origin).normalize();
    const distance = position.distanceTo(origin);

    raycaster.set(origin, direction);
    const intersects = raycaster.intersectObject(terrain);

    if (intersects.length > 0 && intersects[0].distance < distance) {
        return intersects[0].point.clone().add(direction.multiplyScalar(-minCameraDistance));
    }

    return position;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    stats.begin();
    deltaTime = clock.getDelta(); // Ensure you have a THREE.Clock
    requestAnimationFrame(animate);

    if (mixer) {
        mixer.update(deltaTime);
    }

    updateCharacter();
    updateWater();
    updateOrbs();
    updateAxesWidget();
    updateBoundingBox();

    renderer.render(scene, camera);
    renderer.shadowMap.needsUpdate = true;
    stats.end();
}

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

// Proper animation transition function
function fadeToAction(newAction, duration = 0.2, scale = 1.0) {
    if (!newAction || !mixer) return;

    // Stop any current animations
    if (idleAction) idleAction.fadeOut(duration);
    if (walkAction) walkAction.fadeOut(duration);
    if (runAction) runAction.fadeOut(duration);

    // Start new animation
    newAction.reset();
    newAction.fadeIn(duration);
    if (newAction === runAction) {
        newAction.timeScale = scale;
    }
    newAction.play();
}

function updateBoundingBox() {
    const bboxHelper = scene.getObjectByName('characterBBox');
    if (bboxHelper) {
        const bbox = new THREE.Box3().setFromObject(character);
        bboxHelper.box.copy(bbox);
    }
}

function createCameraHelpers() {
    // Create arrows for camera orientation
    const arrowOptions = {
        dir: new THREE.Vector3(0, 0, -1),
        origin: new THREE.Vector3(0, 0, 0),
        length: ARROW_LENGTH,
        headLength: 0.2,
        headWidth: 0.1
    };

    // Forward arrow (blue Z-axis)
    cameraForwardArrow = new THREE.ArrowHelper(
        arrowOptions.dir,
        arrowOptions.origin,
        arrowOptions.length,
        ARROW_COLORS.forward,
        arrowOptions.headLength,
        arrowOptions.headWidth
    );

    // Right arrow (red X-axis)
    cameraRightArrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        arrowOptions.origin,
        arrowOptions.length,
        ARROW_COLORS.right,
        arrowOptions.headLength,
        arrowOptions.headWidth
    );

    // Up arrow (green Y-axis)
    cameraUpArrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        arrowOptions.origin,
        arrowOptions.length,
        ARROW_COLORS.up,
        arrowOptions.headLength,
        arrowOptions.headWidth
    );

    // Add arrows to camera rig
    cameraRig.add(cameraForwardArrow);
    cameraRig.add(cameraRightArrow);
    cameraRig.add(cameraUpArrow);

    // Hide by default
    cameraForwardArrow.visible = false;
    cameraRightArrow.visible = false;
    cameraUpArrow.visible = false;
}

init().catch(err => console.error('Init failed:', err));
