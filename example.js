
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
  thetaN = 100;
  phiN = 100;
  // Note: phi[0] is south pole, and phi[len - 1] is north pole

  // 2 poles, each with 2 floats (theta, phi)
  latticeSize = 2 * 2;
  // Full rings of theta, but phi not counted at poles
  latticeSize += 2 * thetaN * (phiN - 2);

  lattice = new Float32Array(latticeSize);

  // Fill from the bottom up

  lattice[0] = 0.0; // theta of bottom pole
  lattice[1] = -Math.PI/2.0; // phi of bottom pole

  // Theta rings are full 0 to 2PI
  thetaFactor = 2.0*Math.PI/thetaN;

  // Phi ranges from -PI/2 to PI/2 (so pi) but over 1 to 98 since 0 and 99 are poles
  phiFactor = Math.PI/(phiN - 1);

  // The index within the contiguous lattice (not i,j)
  index = 0;

  // Note we start phi at 1 and end 1 early because we already set the poles as a single point
  for(let i = 1; i < phiN - 1; i++) {
    for(let j = 0; j < thetaN; j++) {
      lattice[index] = thetaFactor*j;
      lattice[index + 1] = -Math.PI/2 + phiFactor*i;

      index += 2;
    }
  }

  lattice[latticeSize - 2] = 0.0; // theta of top pole
  lattice[latticeSize - 1] = Math.PI/2; // phi of top pole

  gl.bufferData(gl.ARRAY_BUFFER, lattice, gl.DYNAMIC_DRAW);


  indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

  // 2 poles, so multiply 2 by the total
  // 3 indices per triangle, each index being to a (theta, phi) pair.
  // Bottom/Top is 1 triangle per theta in my 1st theta ring.
  indicesSize = 2 * 3 * thetaN;

  // The rest is 2 triangles per theta in a given theta ring.
  // 3 indices per triangle
  // There are phiN - 2 total theta rings
  indicesSize += 2 * 3 * thetaN * (phiN - 2);


  indices = new Uint16Array(indicesSize);
  index = 0; // index within the indices list, not i,j, etc.

  // Fill from the bottom up, but fill top simultaneously in this first loop

  // Index 0 is the bottom pole, so offset by 1
  offsetElementBottom = 1;

  // The indices are per item, and an item is the 2 floats (theta, phi) pairing
  latticeElementsSize = latticeSize / 2;

  // Take out top theta ring of triangles, so we can start from empty top, then fill it.

  // Last index is (size - 1)
  // Take out the pole (just 1 index taken out)
  // Take out the 3 indices per triangle in the top theta ring
  offsetElementTop = (latticeElementsSize - 1) - 1 - 3 * thetaN;

  // 2 triangles per theta, and 3 indices per triangle
  indicesOffsetForTop = indicesSize - 2 * 3 * thetaN;

  // Fill the triangles at the poles going around the bottom theta ring
  for(let i = 0; i < thetaN; i++) {
    // ------------ Bottom Triangles ----------------

    indices[index] = offsetElementBottom + i;

    // Note need next vertex along theta ring
    // When we reach last vertex need to wrap back to 0, but then add the offset
    indices[index + 1] = (indices[index] + 1) % thetaN;
    if(indices[index + 1] == 0) {
      indices[index + 1] = offsetElementBottom;
    }

    // Every bottom triangle shares the south pole vertex.
    // Right hand rule puts this as 3rd vertex per triangle.
    indices[index + 2] = lattice[0];

    // -----------------------------------------------


    // ------------- Top Triangles -------------------
    
    indices[indicesOffsetForTop + index] = offsetElementTop + i;

    // Every top triangle shares this north pole vertex.
    // Right hand rule puts it as middle vertex per triangle.
    indices[indicesOffsetForTop + index + 1] = latticeElementsSize - 1;

    // Note need next vertex along theta ring
    // When we reach last vertex need to wrap back to 0, but then add the offset
    indices[indicesOffsetForTop + index + 2] = (indices[indicesOffsetForTop + index] + 1) % thetaN;
    if(indices[indicesOffsetForTop + index + 2] == 0) {
      indices[indicesOffsetForTop + index + 2] = indicesOffsetForTop;
    }

    // ------------------------------------------------


    // I did top and bottom simultaneously, and only 3 indices per triangle and only 1 triangle per
    // theta in the theta ring for the top and bottom
    index += 3;
  }


  // index at this point has the bottom triangles
  // 3 indices per triangle
  // thetaN triangles (1 per theta in the ring)
  indicesOffsetForMiddle = 3 * (thetaN - 1) + 1;
  index = indicesOffsetForMiddle;

  // thetaN would be the starting index if not for south pole
  // +1 for the south pole
  latticeIndexOffset = thetaN + 1;

  for(let i = 1; i < phiN - 1; i++) {
    for(let j = 0; j < thetaN; j++) {
      // 2 triangles per theta
      baseIndex = index + (i - 1)*thetaN + j

      // 1 to offset for the south pole
      // thetaN*i for how many theta rings are before us
      // This is theta 0 for ring i basically
      baseLatticeIndex = 1 + thetaN*i;

      quadBottomLeft = baseLatticeIndex + j;

      quadTopLeft = baseLatticeIndex + j + thetaN;

      // On the right, if I am the last vertex I need to reset to 0, or it will jump up to
      // next theta ring
      quadTopRight = baseLatticeIndex + j + thetaN + 1;
      if(j == thetaN - 1) {
        quadTopRight = baseLatticeIndex + thetaN;
      }

      quadBottomRight = baseLatticeIndex + j + 1;
      if(j == thetaN - 1) {
        quadBottomRight = baseLatticeIndex;
      }
      

      // 1st Triangle
      indices[baseIndex] = quadBottomLeft;
      indices[baseIndex + 1] = quadTopLeft;
      indices[baseIndex + 2] = quadTopRight;

      // 2nd triangle
      indices[baseIndex + 3] = quadTopRight;
      indices[baseIndex + 4] = quadBottomRight;
      indices[baseIndex + 5] = quadBottomLeft; 

      index += 6;
    }
  }

  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);
}


function init() {
  init_shaders();

  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  
  loadBuffers()

  render();
}


function render() {
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);

  gl.drawElements(gl.TRIANGLES, indicesSize, gl.UNSIGNED_SHORT, 0);

  cleanup();
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

