
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
  gl.enableVertexAttribArray(1);

  latticeBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, latticeBuffer);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  
  // How many (theta, phi) pairs to form my spherical coordinate mesh vertices
  thetaN = 25;
  phiN = 25;
  // Note: phi[0] is south pole, and phi[len - 1] is north pole

  // 2 poles, each with 2 floats (theta, phi)
  latticeSize = 2 * 2;
  // Full rings of theta, but phi not counted at poles
  latticeSize += 2 * thetaN * phiN;

  lattice = new Float32Array(latticeSize);

  // Fill from the top down

  lattice[0] = 0.0; // theta of north pole
  lattice[1] = 0.0; // phi of north pole

  // Theta rings are full 0 to 2PI
  thetaFactor = 2.0*Math.PI/(thetaN - 1);

  // Phi ranges from 0 to PI
  phiFactor = Math.PI/phiN;

  // The index within the contiguous lattice (not i,j)
  index = 2;

  // Note we start phi at 1 and end 1 early because we already set the poles as a single point
  for(let i = 1; i < phiN; i++) {
    for(let j = 0; j < thetaN; j++) {
      lattice[index] = thetaFactor*j;
      lattice[index + 1] = phiFactor*i;

      index += 2;
    }
  }

  lattice[index] = 0.0; // theta of south pole
  lattice[index + 1] = Math.PI; // phi of south pole

  gl.bufferData(gl.ARRAY_BUFFER, lattice, gl.STATIC_DRAW);


  indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

  // 3 indices per triangle
  // 1 triangle per theta
  // 2 because bottom and top hat
  indicesSize = 3 * thetaN * 2

  // 2 triangles per theta
  // 3 indices per triangle
  // A theta ring per phi for all but the 2 poles
  indicesSize += 2 * 3 * thetaN * (phiN - 1);

  indices = new Uint16Array(indicesSize);
  index = 0; // index within the indices list, not i,j, etc.

  // Skip vIndex 0 because that is the north pole
  topHatStart = 1;

  // Skip noth pole, and all theta rings up to the last, so 1 less then phiN - 2
  bottomHatStart = 1 + thetaN * (phiN - 1);

  // 2 floats per vertex, so divide that out to get number of vertices
  verticesSize = latticeSize / 2;

  // 3 indices per triangle, and topHatStart triangles up to this point
  bottomHatIndexOffset = 3 * thetaN + 3 * 2 * thetaN * (phiN - 2);

  for(let i = 0; i < thetaN; i++) {
    // Top Hat
    quadBottomLeft = topHatStart + i;
    
    quadBottomRight = topHatStart + i + 1;
    if(i == thetaN - 1) {
      quadBottomRight = topHatStart;
    }

    northPole = 0;

    indices[index] = northPole;
    indices[index + 1] = quadBottomRight;
    indices[index + 2] = quadBottomLeft;

    // -----------------------------------------

    // Bottom Hat
    quadTopLeft = bottomHatStart + i;

    quadTopRight = bottomHatStart + i + 1;
    if(i == thetaN - 1) {
      quadTopRight = bottomHatStart;
    }

    southPole = verticesSize - 1;

    indices[bottomHatIndexOffset + index] = southPole;
    indices[bottomHatIndexOffset + index + 1] = quadTopLeft;
    indices[bottomHatIndexOffset + index + 2] = quadTopRight;

    index += 3;
  }

  // Now fill the strips between bottom hat and top hat

  // 1st index is south pole so offset my vIndex by that
  stripStart = 1;

  // Note we don't have a strip on the topmost theta ring, so < phiN - 2 instead of 1
  for(let i = 1; i < phiN - 1; i++) {
    for(let j = 0; j < thetaN; j++) {
      // Gotta offset the south pole, and then the theta rings below me
      quadTopLeft = stripStart + j + (i - 1) * thetaN;

      quadTopRight = quadTopLeft + 1;

      // I'm a whole ring below
      quadBottomLeft = quadTopLeft + thetaN;

      quadBottomRight = quadBottomLeft + 1;

      // Put me at start of this ring if I reach the last vertex, to complete that circle
      if(j == thetaN - 1) {
        quadTopRight = stripStart + (i - 1) * thetaN;
        quadBottomRight = quadTopRight + thetaN;
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


  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);


  normalBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  normalsSize = 3 * latticeSize
  normals = new Float32Array(normalsSize);

  normals[0] = 0.0;
  normals[1] = 1.0;
  normals[2] = 0.0;

  normals[normalsSize - 3] = 0.0;
  normals[normalsSize - 2] = -1.0;
  normals[normalsSize - 1] = 0.0;

  index = 3;

  for(let i = 2; i < latticeSize - 2; i += 2) {
    normals[index] = Math.sin(lattice[i + 1]) * Math.cos(lattice[i]);
    normals[index + 1] = Math.cos(lattice[i + 1]);
    normals[index + 2] = Math.sin(lattice[i + 1]) * Math.sin(lattice[i]);

    index += 3;
  }

  gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
}


function loadUniforms() {
  const uModel = gl.getUniformLocation(program, "uModel");
  const uView = gl.getUniformLocation(program, "uView");
  const uProjection = gl.getUniformLocation(program, "uProjection");

  const uNormalMatrix = gl.getUniformLocation(program, "uNormalMatrix");

  const uLightPosition = gl.getUniformLocation(program, "uLightPosition");
  const uCameraPosition = gl.getUniformLocation(program, "uCameraPosition");

  const uLightColor = gl.getUniformLocation(program, "uLightColor");
  const uObjectColor = gl.getUniformLocation(program, "uObjectColor");


  const model = glMatrix.mat4.create();
  const view = glMatrix.mat4.create();
  const projection = glMatrix.mat4.create();

  const normalMatrix = glMatrix.mat3.create();

  const lightPosition = [-15.0, 10.0, -15.0];
  const cameraPosition = [0.0, 10.0, -15.0]; // Note: make sure to match view matrix

  // Camera
  glMatrix.mat4.lookAt(
    view,
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

  // Model
  // identity to clear it so we don't compound transformations
  glMatrix.mat4.identity(model);
  glMatrix.mat4.rotateX(model, model, Math.PI/2.0);
  //glMatrix.mat4.rotateX(model, model, performance.now()*0.00025);
  //glMatrix.mat4.rotateY(model, model, performance.now()*0.0005);
  //glMatrix.mat4.rotateZ(model, model, performance.now()*0.00025);

  glMatrix.mat3.fromMat4(normalMatrix, model);
  glMatrix.mat3.invert(normalMatrix, normalMatrix);
  glMatrix.mat3.transpose(normalMatrix, normalMatrix);

  gl.uniformMatrix4fv(uModel, false, model);
  gl.uniformMatrix4fv(uView, false, view);
  gl.uniformMatrix4fv(uProjection, false, projection);

  gl.uniformMatrix3fv(uNormalMatrix, false, normalMatrix);

  gl.uniform3fv(uLightPosition, lightPosition);
  gl.uniform3fv(uCameraPosition, cameraPosition);

  gl.uniform3fv(uLightColor, [1.0, 1.0, 1.0]);
  gl.uniform3fv(uObjectColor, [0.8, 0.8, 0.8]);
}


function init() {
  init_shaders();

  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  
  loadBuffers();

  render();
}


function render() {
  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT || gl.DEPTH_BUFFER_BIT);

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

