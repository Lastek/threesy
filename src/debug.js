
function log_materal(mesh){
tree.traverse((child) => {
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
});

}