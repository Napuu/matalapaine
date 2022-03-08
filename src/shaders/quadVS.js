// workaround to avoid ejecting react app
const string = `#version 300 es
precision highp float;

in vec2 a_pos;

out vec2 v_tex_pos;

void main() {
  v_tex_pos = a_pos;
  gl_Position = vec4(1.0 - 2.0 * a_pos, 0, 1);
}`
export default string
