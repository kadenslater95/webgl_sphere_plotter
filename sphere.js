
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
    this.thetaN = thetaN;
    this.phiN = phiN;

    // (theta, phi) pairs for the poles.
    // Full rings of theta, but phi not counted at poles.
    this.vDataSize = 2 * 2 + 2 * thetaN * (phiN - 1);
    
    this.#buildVertexData();

    // 3 indicies per triangle
    // 2 poles with thetaN triangles per pole
    // Strips have 2 triangles per theta
    // A theta ring per phi for all but the 2 poles
    this.iDataSize = 3 * thetaN * 2 + 2 * 3 * thetaN * (phiN - 1);

    this.#buildIndexData();
  }

  get thetaN() {
    return this.thetaN;
  }

  get phiN() {
    return this.phiN;
  }

  get verticesN() {
    return this.vDataSize / 2;
  }

  get vDataSize() {
    return this.vDataSize;
  }

  get vData() {
    return this.vData;
  }

  get iDataSize() {
    return this.iDataSize;
  }

  get iData() {
    return this.iData;
  }

  #buildVertexData() {
    this.vData = new Float32Array(this.vDataSize);

    // Fill from the top down

    this.vData[0] = 0.0; // theta of north pole
    this.vData[1] = 0.0; // phi of north pole

    // Theta rings are full 0 to 2PI
    thetaFactor = 2.0*Math.PI/(this.thetaN - 1);

    // Phi ranges from 0 to PI
    phiFactor = Math.PI/this.phiN;

    // The index within the contiguous lattice (not i,j)
    index = 2;

    // Note we start phi at 1 and end 1 early because we already set the poles as a single point
    for(let i = 1; i < this.phiN; i++) {
      for(let j = 0; j < this.thetaN; j++) {
        this.vData[index] = thetaFactor*j;
        this.vData[index + 1] = phiFactor*i;

        index += 2;
      }
    }

    this.vData[index] = 0.0; // theta of south pole
    this.vData[index + 1] = Math.PI; // phi of south pole
  }

  #buildIndexData() {

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

  init(vertexAttribPointer) {
    this.latticeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.latticeBuffer);
    gl.vertexAttribPointer(vertexAttribPointer, 2, gl.FLOAT, false, 0, 0);
    gl.bufferData(gl.ARRAY_BUFFER, this.lattice.vData, gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.lattice.indices, gl.STATIC_DRAW);
  }

  draw()  {
    gl.useProgram(this.program);

    // TODO: Uniforms stuff

    gl.bindBuffer(gl.ARRAY_BUFFER, this.latticeBuffer);
    
    gl.drawEl
  }
}
