#version 300 es
precision highp float;
out vec4 outColor;
in vec4 windColor;
void main() {
  //outColor = vec4(1, 0, 0, 1);
  outColor = windColor;
}
