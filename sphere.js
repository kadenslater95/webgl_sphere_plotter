
vShader_Wireframe = `
  #version 100

  attribute vec2 aPosition;

  uniform mat4 uModel;
  uniform mat4 uView;
  uniform mat4 uProjection;

  uniform float rho;

  void main() {
    float x = rho * sin(aPosition.y) * cos(aPosition.x);
    float y = rho * cos(aPosition.y);
    float z = rho * sin(aPosition.y) * sin(aPosition.x);

    gl_Position = uProjection * uView * uModel * vec4(x, y, z, 1.0);
  }
`;

vShader_Surface = `
  #version 100

  attribute vec2 aPosition;

  attribute vec3 aNormal;

  uniform mat4 uModel;
  uniform mat4 uView;
  uniform mat4 uProjection;

  // Inverse-Transpose of upper-left 3x3 matrix of uModel
  uniform mat3 uNormalMatrix;

  varying vec3 vNormal;
  varying vec3 vFragmentPosition;

  void main() {
    float rho = 5.0;

    float x = rho * sin(aPosition.y) * cos(aPosition.x);
    float y = rho * cos(aPosition.y);
    float z = rho * sin(aPosition.y) * sin(aPosition.x);

    vec4 worldPosition = uModel * vec4(x, y, z, 1.0);

    vFragmentPosition = worldPosition.xyz;

    vNormal = normalize(uNormalMatrix * aNormal);

    gl_Position = uProjection * uView * worldPosition;
  }
`;


fShader_Wireframe = `
  #version 100

  precision mediump float;

  uniform vec4 color;

  void main() {
    gl_FragColor = color;
  }
`;


fShader_Surface = `
  #version 100

  precision mediump float;

  // Uses Blinn-Phong Lighting

  varying vec3 vNormal;
  varying vec3 vFragmentPosition;

  uniform vec3 uLightPosition; // in world space
  uniform vec3 uCameraPosition; // in world space
  uniform vec3 uLightColor;
  uniform vec3 uObjectColor;

  void main() {
    // Normalize interpolated normal
    vec3 N = normalize(vNormal);

    // Direction from fragment to light
    vec3 L = normalize(uLightPosition - vFragmentPosition);

    // Diffuse
    float diff = max(dot(N, L), 0.0);

    // Ambient
    float ambientStrength = 0.1;
    vec3 ambient = ambientStrength * uLightColor;

    // Specular
    float specularStrength = 0.5;
    vec3 V = normalize(uCameraPosition - vFragmentPosition);
    vec3 H = normalize(L + V); // half vector
    float spec = pow(max(dot(N, H), 0.0), 32.0);

    vec3 diffuse = diff * uLightColor;
    vec3 specular = specularStrength * spec * uLightColor;

    vec3 result = (ambient + diffuse + specular) * uObjectColor;

    gl_FragColor = vec4(result, 1.0);
  }
`;




class SphericalLattice {
  constructor(thetaN, phiN) {
    this._thetaN = thetaN;
    this._phiN = phiN;

    // (theta, phi) pairs for the poles.
    // Full rings of theta, but phi not counted at poles.
    this._vDataSize = 2 * 2 + 2 * thetaN * (phiN - 1);
    
    this.#buildVertexData();

    // 3 indicies per triangle
    // 2 poles with thetaN triangles per pole
    // Strips have 2 triangles per theta
    // A theta ring per phi for all but the 2 poles
    this._iDataSize = 3 * thetaN * 2 + 2 * 3 * thetaN * (phiN - 1);

    this.#buildIndexData();
  }

  get thetaN() {
    return this._thetaN;
  }

  get phiN() {
    return this._phiN;
  }

  get verticesN() {
    return this._vDataSize / 2;
  }

  get vDataSize() {
    return this._vDataSize;
  }

  get vData() {
    return this._vData;
  }

  get iDataSize() {
    return this._iDataSize;
  }

  get iData() {
    return this._iData;
  }

  #buildVertexData() {
    this._vData = new Float32Array(this._vDataSize);

    // Fill from the top down

    this._vData[0] = 0.0; // theta of north pole
    this._vData[1] = 0.0; // phi of north pole

    // Theta rings are full 0 to 2PI
    let thetaFactor = 2.0*Math.PI/(this._thetaN - 1);

    // Phi ranges from 0 to PI
    let phiFactor = Math.PI/this._phiN;

    // The index within the contiguous lattice (not i,j)
    let index = 2;

    // Note we start phi at 1 and end 1 early because we already set the poles as a single point
    for(let i = 1; i < this._phiN; i++) {
      for(let j = 0; j < this._thetaN; j++) {
        this._vData[index] = thetaFactor*j;
        this._vData[index + 1] = phiFactor*i;

        index += 2;
      }
    }

    this._vData[index] = 0.0; // theta of south pole
    this._vData[index + 1] = Math.PI; // phi of south pole
  }

  #buildIndexData() {
    this._iData = new Uint16Array(this._iDataSize);
    let index = 0; // index within the indices list, not i,j, etc.

    // Skip vIndex 0 because that is the north pole
    let topHatStart = 1;

    // Skip noth pole, and all theta rings up to the last, so 1 less then phiN - 2
    let bottomHatStart = 1 + this._thetaN * (this._phiN - 2);

    // 2 floats per vertex, so divide that out to get number of vertices
    let verticesSize = this._vDataSize / 2;

    // 3 indices per triangle, and topHatStart triangles up to this point
    let bottomHatIndexOffset = 3 * this._thetaN + 3 * 2 * this._thetaN * (this._phiN - 2);

    for(let i = 0; i < this._thetaN; i++) {
      // Top Hat
      let quadBottomLeft = topHatStart + i;
      
      let quadBottomRight = topHatStart + i + 1;
      if(i == this._thetaN - 1) {
        quadBottomRight = topHatStart;
      }

      let northPole = 0;

      this._iData[index] = northPole;
      this._iData[index + 1] = quadBottomRight;
      this._iData[index + 2] = quadBottomLeft;

      // -----------------------------------------

      // Bottom Hat
      let quadTopLeft = bottomHatStart + i;

      let quadTopRight = bottomHatStart + i + 1;
      if(i == this._thetaN - 1) {
        quadTopRight = bottomHatStart;
      }

      let southPole = verticesSize - 1;

      this._iData[bottomHatIndexOffset + index] = southPole;
      this._iData[bottomHatIndexOffset + index + 1] = quadTopLeft;
      this._iData[bottomHatIndexOffset + index + 2] = quadTopRight;

      index += 3;
    }

    // Now fill the strips between bottom hat and top hat

    // 1st index is south pole so offset my vIndex by that
    let stripStart = 1;

    // Note we don't have a strip on the topmost theta ring, so < this._phiN - 2 instead of 1
    for(let i = 1; i < this._phiN - 1; i++) {
      for(let j = 0; j < this._thetaN; j++) {
        // Gotta offset the south pole, and then the theta rings below me
        let quadTopLeft = stripStart + j + (i - 1) * this._thetaN;

        let quadTopRight = quadTopLeft + 1;

        // I'm a whole ring below
        let quadBottomLeft = quadTopLeft + this._thetaN;

        let quadBottomRight = quadBottomLeft + 1;

        // Put me at start of this ring if I reach the last vertex, to complete that circle
        if(j == this._thetaN - 1) {
          quadTopRight = stripStart + (i - 1) * this._thetaN;
          quadBottomRight = quadTopRight + this._thetaN;
        }

        // Left Triangle
        this._iData[index] = quadBottomLeft;
        this._iData[index + 1] = quadTopLeft;
        this._iData[index + 2] = quadTopRight;

        // Right triangle
        this._iData[index + 3] = quadTopRight;
        this._iData[index + 4] = quadBottomRight;
        this._iData[index + 5] = quadBottomLeft; 


        // 2 triangles per theta, 3 vertices per triangle
        index += 6;
      }
    }
  }
}


class SphereBase {
  program;

  constructor(thetaN, phiN) {
    this.lattice = new SphericalLattice(thetaN, phiN);
  }

  buildShaders(vShaderSource, fShaderSource) {
    vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vShaderSource);
    gl.compileShader(vertexShader);

    fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fShaderSource);
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
};


class SphereWireframe extends SphereBase {
  constructor(rho = 5.0, thetaN = 50, phiN = 50) {
    super(thetaN, phiN);

    this.rho = rho;

    this.program = this.buildShaders(vShader_Wireframe, fShader_Wireframe);
  }

  init(vertexAttribIndex) {
    this.latticeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.latticeBuffer);
    gl.vertexAttribPointer(vertexAttribIndex, 2, gl.FLOAT, false, 0, 0);
    gl.bufferData(gl.ARRAY_BUFFER, this.lattice.vData, gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.lattice.iData, gl.STATIC_DRAW);

    this.uModel = gl.getUniformLocation(program, "uModel");
    this.uCamera = gl.getUniformLocation(program, "uView");
    this.uProjection = gl.getUniformLocation(program, "uProjection");
  }

  loadUniforms(model, camera, projection) {
    gl.uniformMatrix4fv(uModel, false, model);
    gl.uniformMatrix4fv(uView, false, view);
    gl.uniformMatrix4fv(uProjection, false, projection);
  }

  draw(model, camera, projection)  {
    gl.useProgram(this.program);

    this.loadUniforms(model, camera, projection);
    
    gl.drawElements(gl.TRIANGLES, this.lattice.iDataSize, gl.UNSIGNED_SHORT, 0);
  }
}
