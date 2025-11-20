
let webgl_status, canvas, gl, program, buffer;


function cleanup() {
  gl.useProgram(null);
  if (buffer) {
    gl.deleteBuffer(buffer);
  }
  if (program) {
    gl.deleteProgram(program);
  }
}


function init_shaders() {
  source = document.querySelector("#vertex-shader").innerHTML;
  vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, source);
  gl.compileShader(vertexShader);

  source = document.querySelector("#fragment-shader").innerHTML;
  fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, source);
  gl.compileShader(fragmentShader);

  program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  gl.linkProgram(program);

  gl.detachShader(program, vertexShader);
  gl.detachShader(program, fragmentShader);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const linkErrLog = gl.getProgramInfoLog(program);
    cleanup();
    webgl_status.style.display = 'block';
    webgl_status.textContent = `Shader program did not link successfully. Error log: ${linkErrLog}`;
    throw new Error(`Program failed to link: ${linkErrLog}`);
  }
}


function loadBuffers() {
  gl.enableVertexAttribArray(0);

  latticeBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, latticeBuffer);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  
  // How many (theta, phi) pairs to form my spherical coordinate mesh vertices
  thetaN = 20;
  phiN = 20;
  // Note: phi[0] is south pole, and phi[len - 1] is north pole

  // 2 poles, each with 2 floats (theta, phi)
  latticeSize = 2 * 2;
  // Full rings of theta, but phi not counted at poles
  latticeSize += 2 * thetaN * (phiN - 2);

  lattice = new Float32Array(latticeSize);

  // Fill from the bottom up

  lattice[0] = 0.0; // theta of bottom pole
  lattice[1] = Math.PI; // phi of bottom pole

  // Theta rings are full 0 to 2PI
  thetaFactor = 2.0*Math.PI/thetaN;

  // Phi ranges from PI to 0 (so pi) but over 1 to 98 since 0 and 99 are poles
  phiFactor = Math.PI/(phiN - 1);

  // The index within the contiguous lattice (not i,j)
  index = 0;

  // Note we start phi at 1 and end 1 early because we already set the poles as a single point
  for(let i = 1; i < phiN - 1; i++) {
    for(let j = 0; j < thetaN; j++) {
      lattice[index] = thetaFactor*j;
      lattice[index + 1] = Math.PI + phiFactor*i;

      index += 2;
    }
  }

  lattice[latticeSize - 2] = 0.0; // theta of top pole
  lattice[latticeSize - 1] = Math.PI/2; // phi of top pole

  gl.bufferData(gl.ARRAY_BUFFER, lattice, gl.DYNAMIC_DRAW);


  indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

  // 3 indices per triangle
  // 1 triangle per theta
  // 2 because bottom and top hat
  indicesSize = 3 * thetaN * 2

  // 2 triangles per theta
  // 3 indices per triangle
  // A theta ring per phi for all but the 2 poles
  indicesSize += 2 * 3 * thetaN * (phiN - 2);

  indices = new Uint16Array(indicesSize);
  index = 0; // index within the indices list, not i,j, etc.

  // Skip vIndex 0 because that is the south pole
  bottomHatStart = 1;

  // Skip south pole, and all theta rings up to the last, so 1 less then phiN - 2
  topHatStart = 1 + thetaN * (phiN - 3);

  // 2 floats per vertex, so divide that out to get number of vertices
  verticesSize = latticeSize / 2;

  // 3 indices per triangle, and topHatStart triangles up to this point
  topHatIndexOffset = topHatStart * 3;

  for(let i = 0; i < thetaN; i++) {
    // Bottom Hat
    quadTopLeft = bottomHatStart + i;
    
    quadTopRight = bottomHatStart + i + 1;
    if(i == thetaN - 1) {
      quadTopRight = bottomHatStart;
    }

    southPole = 0;

    indices[index] = quadTopLeft;
    indices[index + 1] = quadTopRight;
    indices[index + 2] = southPole;

    // -----------------------------------------

    // Top Hat
    quadBottomLeft = topHatStart + i;

    quadBottomRight = topHatStart + i + 1;
    if(i == thetaN - 1) {
      quadBottomRight = topHatStart;
    }

    northPole = verticesSize - 1;

    indices[topHatIndexOffset + index] = quadBottomLeft;
    indices[topHatIndexOffset + index + 1] = northPole;
    indices[topHatIndexOffset + index + 2] = quadBottomRight;

    index += 3;
  }


  // Now fill the strips between bottom hat and top hat

  // 1st index is south pole so offset my vIndex by that
  stripStart = 1;

  // Note we don't have a strip on the topmost theta ring, so < phiN - 2 instead of 1
  for(let i = 1; i < phiN - 2; i++) {
    for(let j = 0; j < thetaN; j++) {
      // Gotta offset the south pole, and then the theta rings below me
      quadBottomLeft = stripStart + j + (i - 1) * thetaN;

      // I'm a whole theta ring above
      quadTopLeft = quadBottomLeft + thetaN;

      quadTopRight = quadTopLeft + 1;

      quadBottomRight = quadBottomLeft + 1;

      // Put me at start of this ring if I reach the last vertex, to complete that circle
      if(j == thetaN - 1) {
        quadBottomRight = stripStart + (i - 1) * thetaN;
        quadTopRight = quadBottomRight + thetaN;
      }


      // Left Triangle
      indices[index] = quadBottomLeft;
      indices[index + 1] = quadTopLeft;
      indices[index + 2] = quadTopRight;

      // Right triangle
      indices[index + 3] = quadTopRight;
      indices[index + 4] = quadBottomRight;
      indices[index + 5] = quadBottomLeft; 


      // 2 triangles per theta, 3 vertices per triangle
      index += 6;
    }
  }


  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);
}


function loadUniforms() {
  uMVP = gl.getUniformLocation(program, "uMVP");

  model = glMatrix.mat4.create();
  view = glMatrix.mat4.create();
  proj = glMatrix.mat4.create();
  mvp = glMatrix.mat4.create();

  // Camera
  glMatrix.mat4.lookAt(
    view,
    [0, 10, -15], // camera position
    [0, 0, 0], // look at origin
    [0, 1, 0] // up direction
  );

  // Projection
  fov = Math.PI/4; // field of view
  aspect = canvas.width / canvas.height;
  near = 0.1;
  far = 100.0;
  glMatrix.mat4.perspective(proj, fov, aspect, near, far);

  // Model
  // identity to clear it so we don't compound transformations
  glMatrix.mat4.identity(model);
  glMatrix.mat4.rotateY(model, model, performance.now()*0.0005);


  // MVP
  glMatrix.mat4.multiply(mvp, view, model);
  glMatrix.mat4.multiply(mvp, proj, mvp);

  gl.uniformMatrix4fv(uMVP, false, mvp);
}


function init() {
  init_shaders();

  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  
  loadBuffers();

  render();
}


function render() {
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);

  loadUniforms();

  gl.drawElements(gl.LINES, indicesSize, gl.UNSIGNED_SHORT, 0);

  requestAnimationFrame(render);

  //cleanup();
}


window.onload = function() {
  webgl_status = this.document.querySelector("#webgl-status");

  canvas = document.querySelector("canvas");
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  gl = canvas.getContext("webgl");

  if(gl instanceof WebGLRenderingContext) {
    webgl_status.style.display = "none";

    init();
  }else {
    webgl_status.textContent = "Failed. Your browser or device may not support WebGL";
  }
}

