
const camera = glMatrix.mat4.create();
const projection = glMatrix.mat4.create();

const wfSphere_1 = new Sphere({mode: 'WIREFRAME', rho: 5.0, color: [0.2, 0.2, 0.7, 1.0]});
const model_1 = glMatrix.mat4.create();

function init() {
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  // Camera
  glMatrix.mat4.lookAt(
    camera,
    [0, 10, -15], // camera position (Note: make sure to match cameraPosition)
    [0, 0, 0], // look at origin
    [0, 1, 0] // up direction
  );

  // Projection
  fov = Math.PI/4; // field of view
  aspect = canvas.width / canvas.height;
  near = 0.1;
  far = 100.0;
  glMatrix.mat4.perspective(projection, fov, aspect, near, far);


  wfSphere_1.init();

  render();
}


function render() {
  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT || gl.DEPTH_BUFFER_BIT);


  glMatrix.mat4.identity(model_1);
  glMatrix.mat4.rotateY(model_1, model_1, performance.now() * 0.0005);
  glMatrix.mat4.rotateX(model_1, model_1, Math.PI/2);

  wfSphere_1.draw(model_1, camera, projection);

  requestAnimationFrame(render);

  //cleanup();
}


window.onload = function() {
  if(gl instanceof WebGLRenderingContext) {
    webgl_status.style.display = "none";

    init();
  }else {
    webgl_status.textContent = "Failed. Your browser or device may not support WebGL";
  }
}
