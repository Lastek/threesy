let seed = 12345; // Default seed

function seededRandom() {
    seed = (seed * 9301 + 49297) % 233280; // LCG parameters
    return seed / 233280; // Normalize to 0-1 range
}

function setSeed(newSeed) {
    seed = newSeed;
}

function getSeed() {
    return seed;
}

// Export the functions
export { seededRandom, setSeed, getSeed };