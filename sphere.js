
vShader_Wireframe = `
  #version 100

  attribute vec2 aPosition;

  uniform mat4 uModel;
  uniform mat4 uCamera;
  uniform mat4 uProjection;

  uniform float rho;

  void main() {
    float x = rho * sin(aPosition.y) * cos(aPosition.x);
    float y = rho * cos(aPosition.y);
    float z = rho * sin(aPosition.y) * sin(aPosition.x);

    gl_Position = uProjection * uCamera * uModel * vec4(x, y, z, 1.0);
  }
`;

vShader_Surface = `
  #version 100

  attribute vec2 aPosition;

  attribute vec3 aNormal;

  uniform mat4 uModel;
  uniform mat4 uCamera;
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

    gl_Position = uProjection * uCamera * worldPosition;
  }
`;


fShader_Wireframe = `
  #version 100

  precision mediump float;

  uniform vec4 uColor;

  void main() {
    gl_FragColor = uColor;
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




class SphereLattice {
  constructor(args) {
    this.#constructorValidator(args);

    this._thetaN = args.thetaN;
    this._phiN = args.phiN;
    
    this.#buildVertexData();

    // The setter calls the build index data too
    this._mode = args.mode;
    if(args.mode === 'WIREFRAME') {
      this.#buildWireframeIndexData();
    }else {
      this.#buildSurfaceIndexData();
    }
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

  get mode() {
    return this._mode;
  }

  #constructorValidator(args) {
    if(
      !(typeof args.thetaN === 'number') ||
      !(typeof args.phiN === 'number')
    ) {
      throw "SphereLatticeError: Invalid argument provided, thetaN and phiN must be of type 'number'";
    }

    if(!['SURFACE', 'WIREFRAME'].includes(args.mode)) {
      throw "SphereLatticeError: Invalid argument provided, mode must be one of (SURFACE,WIREFRAME)";
    }
  }

  #buildVertexData() {
    this._vDataSize = 2 * 2 + 2 * this._thetaN * (this._phiN - 1);

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

  #buildSurfaceIndexData() {
    // 3 indices per triangle.
    // a theta ring of triangles on both bottom and top hat.
    // 2 triangles per theta in the theta strips.
    // 1 less than phiN number of strips.
    this._iDataSize = 3 * this._thetaN * 2 + 2 * 3 * this._thetaN * (this._phiN - 1);

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

    // 1st index is north pole so offset my vIndex by that
    let stripStart = 1;

    // Note we don't have a strip on the topmost theta ring, so < this._phiN - 2 instead of 1
    for(let i = 1; i < this._phiN - 1; i++) {
      for(let j = 0; j < this._thetaN; j++) {
        // Gotta offset the north pole, and then the theta rings above me
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

  #buildWireframeIndexData() {
    // 2 indices per line.
    // Bottom and Top have 1 vertical line per theta.
    // The strips make the right side triangle and bottom horizontal line
    // per theta, and it wraps around nicely.
    this._iDataSize = 2 * 2 * this._thetaN + 2 * 4 * this._thetaN;

    this._iData = new Uint16Array(this._iDataSize);
    let index = 0; // index within indices list, not i,j, etc.

    // Skip vIndex 0 because that is the north pole
    let topHatStart = 1;

    // Skip north pole, and theta rings up to phiN - 2 instead of
    // phiN - 1 so that the bottom of the last strip is the top of the
    // bottom hat
    let bottomHatStart = 1 + this._thetaN * (this._phiN - 2);

    // 2 floats per vertex, so divide that out to get number of vertices
    let verticesSize = this._vDataSize / 2;

    // 2 indices per line.
    // Theta ring of lines on bottom row.
    // 4 lines per theta in the theta strip.
    // phiN - 2 instead phiN - 1 because last strip is top of bottom hat
    let bottomHatIndexOffset = 2 * this._thetaN + 2 * 4 * this._thetaN * (this._phiN - 2);

    for(let i = 0; i < this.thetaN; i++) {
      // North pole to each theta
      this._iData[index] = 0;
      this._iData[index + 1] = topHatStart + i;

      // Each theta to south pole
      this._iData[bottomHatIndexOffset + index] = bottomHatStart + i;
      this._iData[bottomHatIndexOffset + index + 1] = verticesSize - 1;

      index += 2;
    }

    // 1st index is north pole, so offset by that
    let stripStart = 1;

    for(let i = 1; i < this._phiN - 1; i++) {
      for(let j = 0; j < this._thetaN; j++) {
        // Gotta offset the north pole, and then the theta rings above me
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

        // horizontal top
        this._iData[index] = quadTopLeft;
        this._iData[index + 1] = quadTopRight;

        // vertical right
        this._iData[index + 2] = quadTopRight;
        this._iData[index + 3] = quadBottomRight;

        // diagnol
        this._iData[index + 4] = quadBottomRight;
        this._iData[index + 5] = quadTopLeft;

        // horizontal bottom
        this._iData[index + 6] = quadBottomLeft;
        this._iData[index + 7] = quadBottomRight;

        // 2 indices per line, 4 lines per theta
        index += 8;
      }
    }
  }
}


class Sphere {
  // TODO: Make scene object so that surface can have same light as other
  // Objects. Update wireframe to use lighting as well.
  constructor(args) {
    this.#constructorValidator(args);

    this._thetaN = args.thetaN ?? 50;
    this._phiN = args.phiN ?? 50;
    this._rho = args.rho ?? 1.0;
    this._mode = args.mode ?? 'SURFACE';

    this._latticeArgs = {
      thetaN: this._thetaN,
      phiN: this._phiN,
      mode: this._mode
    };
  }


  init() {
    if(this._mode === 'WIREFRAME') {
      this.#buildWireframeShaders(vShader_Wireframe, fShader_Wireframe);
    }else {
      this.#buildSurfaceShaders(vShader_Surface, fShader_Surface);
    }

    this._lattice = new SphereLattice(this._latticeArgs);

    this._aPosition = gl.getAttribLocation(this._program, "aPosition");
    gl.enableVertexAttribArray(this._aPosition);

    this._latticeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._latticeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this._lattice.vData, gl.STATIC_DRAW);
    gl.vertexAttribPointer(this._aPosition, 2, gl.FLOAT, false, 0, 0);

    this._indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._lattice.iData, gl.STATIC_DRAW);

    this._uModel = gl.getUniformLocation(this._program, "uModel");
    this._uCamera = gl.getUniformLocation(this._program, "uCamera");
    this._uProjection = gl.getUniformLocation(this._program, "uProjection");

    this._uColor = gl.getUniformLocation(this._program, "uColor");
    this._uRho = gl.getUniformLocation(this._program, "rho");

    if(this._mode === 'WIREFRAME') {
      this.#initWireframe();
    }else {
      this.#initSurface();
    }
  }

  draw(model, camera, projection) {
    // TODO: Pass GL to this object
    if(this._mode === 'WIREFRAME') {
      this.#drawWireframe(model, camera, projection);
    }else {
      this.#drawSurface(model, camera, projection);
    }
  }


  #constructorValidator(args) {
    let invalidArg = null

    if(
      !([null, undefined].includes(args.thetaN) || typeof args.thetaN === 'number')
    ) {
      invalidArg = 'thetaN';
    }else if(
      !([null, undefined].includes(args.phiN) || typeof args.phiN === 'number')
    ) {
      invalidArg = 'phiN';
    }else if(
      !([null, undefined].includes(args.rho) || typeof args.rho === 'number')
    ) {
      invalidArg = 'rho';
    }

    if(invalidArg) {
      throw `SphereError: Invalid argument provided, ${invalidArg} must be of type 'number' or not provided`
    }

    if(!['SURFACE', 'WIREFRAME'].includes(args.mode)) {
      throw "SphereError: Invalid argument provided, mode must be empty or one of (SURFACE,WIREFRAME)";
    }
  }

  #buildWireframeShaders(vShaderSource, fShaderSource) {
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vShaderSource);
    gl.compileShader(vertexShader);

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fShaderSource);
    gl.compileShader(fragmentShader);

    this._program = gl.createProgram();

    gl.attachShader(this._program, vertexShader);
    gl.attachShader(this._program, fragmentShader);

    gl.linkProgram(this._program);

    gl.detachShader(this._program, vertexShader);
    gl.detachShader(this._program, fragmentShader);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if(!gl.getProgramParameter(this._program, gl.LINK_STATUS)) {
      const linkErrLog = gl.getProgramInfoLog(this._program);
      cleanup();
      webgl_status.style.display = 'block';
      webgl_status.textContent = `Shader program did not link successfully. Error log: ${linkErrLog}`;
      throw new Error(`Program failed to link: ${linkErrLog}`);
    }
  }

  #buildSurfaceShaders(vShaderSource, fShaderSource) {
    // TODO: Fill this in
  }

  #initWireframe() {
    // TODO: Fill this in
  }

  #initSurface() {
    // TODO: Fill this up
  }

  #loadWireframeUniforms(model, camera, projection) {
    gl.uniformMatrix4fv(this._uModel, false, model);
    gl.uniformMatrix4fv(this._uCamera, false, camera);
    gl.uniformMatrix4fv(this._uProjection, false, projection);

    gl.uniform4fv(this._uColor, [0.2, 8.0, 0.2, 1.0]);
    gl.uniform1f(this._uRho, this._rho);
  }

  #loadSurfaceUniforms(model, camera, projection) {
    // TODO: Fill this in
  }

  #drawWireframe(model, camera, projection)  {
    gl.useProgram(this._program);

    this.#loadWireframeUniforms(model, camera, projection);
    
    gl.drawElements(gl.LINES, this._lattice.iDataSize, gl.UNSIGNED_SHORT, 0);
  }

  #drawSurface(model, camera, projection) {
    // TODO: Fill this in
  }
};
