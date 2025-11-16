
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
  
  latticeN = 100;

  // 100 x 100 vertices with 2 coordinates per vertex
  lattice = new Float32Array(latticeN*latticeN*2);

  thetaFactor = 2.0*Math.PI/latticeN;
  phiFactor = Math.PI/latticeN;
  for(let i = 0; i < latticeN*latticeN*2; i++) {
    if(i % 2 == 0) {
      lattice[i] = thetaFactor*(i % latticeN);
    }else {
      lattice[i] = -Math.PI/2 + phiFactor*(i % latticeN);
    }
  }

  gl.bufferData(gl.ARRAY_BUFFER, lattice, gl.DYNAMIC_DRAW);


  indexBuffer = gl.createBuffer
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);


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

  gl.drawArrays(gl.POINTS, 0, 1);

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

