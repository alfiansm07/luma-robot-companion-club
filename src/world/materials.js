import * as THREE from 'three';

/** Creates the shelter's original warm palette and two procedural surface shaders. */
export function createMaterials() {
  const standard = (color, roughness = 0.7, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const materials = {
    ivory: standard('#f8f2e4'),
    chalk: standard('#fffaf0', 0.55),
    sand: standard('#ded1b8'),
    wood: standard('#c99c6d'),
    teal: standard('#277f76', 0.45),
    deepTeal: standard('#18534f', 0.52),
    mint: standard('#b1d7c6'),
    coral: standard('#ed937d', 0.6),
    peach: standard('#f3ccba'),
    lime: standard('#c5d67d'),
    leaf: standard('#4c8763'),
    leafLight: standard('#8dae73'),
    dark: standard('#364c49', 0.42),
    steel: standard('#b3c5bc', 0.28, 0.65),
    soil: standard('#756551'),
    bed: standard('#e2c5a9', 0.95),
    carpet: standard('#9bc4b4', 1),
    peachCarpet: standard('#e8b7a2', 1),
    greenCarpet: standard('#cad59f', 1),
    window: new THREE.MeshBasicMaterial({ color: '#d9f3ee', toneMapped: false }),
    glow: new THREE.MeshStandardMaterial({
      color: '#fff5dd',
      emissive: '#fff5dd',
      emissiveIntensity: 2.2,
    }),
  };
  const floor = standard('#e8e1d0', 0.72);
  floor.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vFloorPosition;',
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvFloorPosition = position;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vFloorPosition;
      float terrazzoHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec2 cell = floor(vFloorPosition.xz * 12.0);
      float seed = terrazzoHash(cell);
      vec2 point = fract(vFloorPosition.xz * 12.0) - vec2(terrazzoHash(cell + 4.1), terrazzoHash(cell + 8.3));
      float chip = (1.0 - smoothstep(0.035, 0.09, length(point))) * step(0.68, seed);
      diffuseColor.rgb *= 1.0 - 0.17 * chip;
      vec2 groutDistance = abs(fract(vFloorPosition.xz / 3.0 + 0.5) - 0.5) * 3.0;
      float grout = 1.0 - smoothstep(0.008, 0.02, min(groutDistance.x, groutDistance.y));
      diffuseColor.rgb *= 1.0 - grout * 0.025;
    `,
    );
  };
  floor.customProgramCacheKey = () => 'luma-terrazzo-v1';
  materials.floor = floor;
  materials.water = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#68c4c3') } },
    vertexShader: `varying vec3 vPosition;
      void main() { vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec3 vPosition;
      void main() {
        float ripple = sin(vPosition.x * 20.0 + uTime * 1.4) * sin(vPosition.z * 17.0 - uTime * 1.1);
        float glint = pow(max(0.0, ripple), 8.0);
        gl_FragColor = vec4(uColor * (0.92 + ripple * 0.09) + vec3(glint * 0.24), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return materials;
}
