// author: Fyrestar <info@mevedia.com>
var camera, scene, renderer, mesh, goal, keys, follow;

var time = 0;
var newPosition = new THREE.Vector3();
var matrix = new THREE.Matrix4();

var stop = 1;
var DEGTORAD = 0.01745327;
var temp = new THREE.Vector3;
var dir = new THREE.Vector3;
var eye = new THREE.Vector3;
var a = new THREE.Vector3;
var b = new THREE.Vector3;
var raycaster = new THREE.Raycaster;
var mouse = new THREE.Vector2;
var environment = [];
var coronaSafetyDistance = 0.3;
var goalDistance = coronaSafetyDistance;
var velocity = 0.0;
var speed = 0.0;

init();
animate();

function init() {

    camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.01, 10 );
    camera.position.set( 0, .2, 0 );
    
    scene = new THREE.Scene();
    camera.lookAt( scene.position );

    var geometry = new THREE.BoxBufferGeometry( 0.2, 0.2, 0.2 );
    var material = new THREE.MeshNormalMaterial();

    mesh = new THREE.Mesh( geometry, material );
  
    var rand = Math.random;
  
    for ( var x = 0; x < 10; x ++ )
    for ( var y = 0; y < 10; y ++ ) {
      
      var clone = mesh.clone();
      
      clone.position.set(  (( x - 5 ) / 10) * 15, 0, (( y - 5 ) / 10) * 15 );
      clone.scale.set( 1 + rand() * 4, 2, 1 + rand() * 4 );
      scene.add( clone );
      
      environment.push( clone );
      
    }
    
    goal = new THREE.Object3D;
    follow = new THREE.Object3D;
    follow.position.z = -coronaSafetyDistance;
    mesh.add( follow );
    
    goal.add( camera );
    scene.add( mesh );
 

    
    var gridHelper = new THREE.GridHelper( 40, 40 );
    scene.add( gridHelper );
    
    scene.add( new THREE.AxesHelper() );

    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );
  
keys = {
    a: false,
    s: false,
    d: false,
    w: false
  };
  
  
  document.body.addEventListener( 'mousemove', function(e) {
    mouse.x = ( e.clientX / window.innerWidth ) * 2 - 1;
	  mouse.y = - ( e.clientY / window.innerHeight ) * 2 + 1;
    
  });

  document.body.addEventListener( 'keydown', function(e) {
    
    var key = e.code.replace('Key', '').toLowerCase();
    if ( keys[ key ] !== undefined )
      keys[ key ] = true;
    
  });
  document.body.addEventListener( 'keyup', function(e) {
    
    var key = e.code.replace('Key', '').toLowerCase();
    if ( keys[ key ] !== undefined )
      keys[ key ] = false;
    
  });

}


function animate() {

    requestAnimationFrame( animate );
    
  speed = 0.0;
  
  if ( keys.w )
    speed = 0.01;
  else if ( keys.s )
    speed = -0.01;

  velocity += ( speed - velocity ) * .3;
  mesh.translateZ( velocity );

  if ( keys.a )
    mesh.rotateY(0.05);
  else if ( keys.d )
    mesh.rotateY(-0.05);
		
  
  
  a.lerp(mesh.position, 0.4);
  b.copy(goal.position);
  
  temp.setFromMatrixPosition(camera.matrixWorld);
  
  
  
    dir.copy( a ).sub( b ).normalize();
  
    eye.copy(dir).negate();
    raycaster.set( a, eye );
    var intersects = raycaster.intersectObjects( environment );

    var distance = coronaSafetyDistance;
  
    if ( intersects && intersects.length ) {
      var space = intersects[0].distance;
      var radius = .2;
      
      // Pick the shorter distance
      distance = Math.min( distance, space - radius );
      
    }
  
    goalDistance += ( distance - goalDistance ) * 0.2;
  
    let dis = a.distanceTo( b ) - goalDistance;
  
    goal.position.addScaledVector( dir, dis );
    temp.setFromMatrixPosition(follow.matrixWorld);
    goal.position.lerp(temp, 0.02);
    
    camera.lookAt( mesh.position );
    
    renderer.render( scene, camera );

}