/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
const vs = `precision highp float;

in vec3 position;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`;

const fs = `precision highp float;

out vec4 fragmentColor;

uniform vec2 resolution;
uniform float rand;
uniform float intensity;

void main() {
  float aspectRatio = resolution.x / resolution.y; 
  vec2 vUv = gl_FragCoord.xy / resolution;
  
  // Dynamic noise based on intensity
  float noiseSpeed = 1.0 + intensity * 5.0;
  float noise = (fract(sin(dot(vUv, vec2(12.9898 + rand * noiseSpeed, 78.233)*2.0)) * 43758.5453));

  vUv -= .5;
  vUv.x *= aspectRatio;

  // Intensify the vignette falloff
  float factor = 4.0 - (intensity * 2.5); 
  float d = factor * length(vUv);
  
  // Base cosmic colors (Deep Void)
  vec3 voidColor = vec3(16., 12., 20.) / 2550.;
  vec3 orbCenter = vec3(40., 30., 60.) / 255.;
  
  // Glowing "Search" colors (Data Flux)
  vec3 searchGlow = vec3(0.0, 0.4, 0.8) * intensity * 1.5;
  vec3 energyCore = vec3(0.5, 0.8, 1.0) * pow(max(0.0, 1.0 - d * 0.5), 4.0) * intensity;
  
  vec3 finalColor = mix(orbCenter, voidColor, d);
  finalColor += searchGlow + energyCore;
  
  // Add some digital 'static' during search
  float staticNoise = noise * 0.02 * intensity;
  
  fragmentColor = vec4(finalColor + staticNoise + .005 * noise, 1.0);
}
`;

export {fs, vs};