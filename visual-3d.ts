
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:organize-imports
// tslint:disable:ban-malformed-import-paths
// tslint:disable:no-new-decorators

import {LitElement, css, html} from 'lit';
import {customElement, property, query} from 'lit/decorators.js';
import {Analyser} from './analyser';

import * as THREE from 'this-package-should-be-three';
// Using generic import as requested but Three.js is required. 
// Standard Three.js imports for this specific platform:
import * as THREE_RAW from 'three';
const THREE = THREE_RAW;
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {fs as backdropFS, vs as backdropVS} from './backdrop-shader';
import {vs as sphereVS} from './sphere-shader';

/**
 * 3D live audio visual.
 */
@customElement('gdm-live-audio-visuals-3d')
export class GdmLiveAudioVisuals3D extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private camera!: THREE.PerspectiveCamera;
  private backdrop!: THREE.Mesh;
  private composer!: EffectComposer;
  private sphere!: THREE.Mesh;
  private particleSystem!: THREE.Points;
  private prevTime = 0;
  private rotation = new THREE.Vector3(0, 0, 0);
  private currentIntensity = 0;
  
  private moodColors: Record<string, { color: number, emissive: number }> = {
    neutral: { color: 0x121225, emissive: 0x050515 },
    sad: { color: 0x330000, emissive: 0x990000 },
    good: { color: 0x003311, emissive: 0x00cc44 },
    happy: { color: 0x003311, emissive: 0x00cc44 },
    mystical: { color: 0x220044, emissive: 0xaa00ff },
    angry: { color: 0x441100, emissive: 0xff4400 },
    tense: { color: 0x221100, emissive: 0x552200 }
  };

  @property({type: Boolean}) isSearching = false;
  @property({type: String}) mood = 'neutral'; 

  private _outputNode!: AudioNode;

  @property()
  set outputNode(node: AudioNode) {
    this._outputNode = node;
    this.outputAnalyser = new Analyser(this._outputNode);
  }

  get outputNode() {
    return this._outputNode;
  }

  private _inputNode!: AudioNode;

  @property()
  set inputNode(node: AudioNode) {
    this._inputNode = node;
    this.inputAnalyser = new Analyser(this._inputNode);
  }

  get inputNode() {
    return this._inputNode;
  }

  @query('canvas') canvas!: HTMLCanvasElement;

  static styles = css`
    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
      image-rendering: auto;
    }
  `;

  private init() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a080d);

    const backdrop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(15, 5),
      new THREE.RawShaderMaterial({
        uniforms: {
          resolution: {value: new THREE.Vector2(1, 1)},
          rand: {value: 0},
          intensity: {value: 0},
        },
        vertexShader: backdropVS,
        fragmentShader: backdropFS,
        glslVersion: THREE.GLSL3,
        transparent: true
      }),
    );
    backdrop.material.side = THREE.BackSide;
    scene.add(backdrop);
    this.backdrop = backdrop;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 0, 5);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    const geometry = new THREE.IcosahedronGeometry(1, 12);

    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x121225,
      metalness: 0.95,
      roughness: 0.02,
      emissive: 0x050515,
      emissiveIntensity: 0.5,
      envMapIntensity: 1.5,
    });

    new EXRLoader().load('piz_compressed.exr', (texture: THREE.Texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
      const exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
      sphereMaterial.envMap = exrCubeRenderTarget.texture;
      sphere.visible = true;
    });

    sphereMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = {value: 0};
      shader.uniforms.inputData = {value: new THREE.Vector4()};
      shader.uniforms.outputData = {value: new THREE.Vector4()};
      sphereMaterial.userData.shader = shader;
      shader.vertexShader = sphereVS;
    };

    const sphere = new THREE.Mesh(geometry, sphereMaterial);
    scene.add(sphere);
    sphere.visible = false;
    this.sphere = sphere;

    const particleCount = 200;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);
    
    for (let i = 0; i < particleCount; i++) {
      const r = 8 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      
      speeds[i] = 0.05 + Math.random() * 0.1;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x88ccff,
      size: 0.05,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending
    });
    
    this.particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    (this.particleSystem as any).userData = { speeds, initialPositions: positions.slice() };
    scene.add(this.particleSystem);

    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.5,
      0.4, 
      0.85 
    );

    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    this.composer = composer;

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      const dPR = renderer.getPixelRatio();
      const w = window.innerWidth;
      const h = window.innerHeight;
      backdrop.material.uniforms.resolution.value.set(w * dPR, h * dPR);
      renderer.setSize(w, h);
      composer.setSize(w, h);
    }

    window.addEventListener('resize', onWindowResize);
    onWindowResize();

    this.animation();
  }

  private animation() {
    requestAnimationFrame(() => this.animation());

    if (this.inputAnalyser) this.inputAnalyser.update();
    if (this.outputAnalyser) this.outputAnalyser.update();

    const t = performance.now();
    const dt = (t - this.prevTime) / (1000 / 60);
    this.prevTime = t;
    
    const backdropMaterial = this.backdrop.material as THREE.RawShaderMaterial;
    const sphereMaterial = this.sphere.material as THREE.MeshStandardMaterial;
    const particleMaterial = this.particleSystem.material as THREE.PointsMaterial;

    const targetIntensity = this.isSearching ? 1.0 : 0.0;
    this.currentIntensity += (targetIntensity - this.currentIntensity) * 0.05 * dt;
    backdropMaterial.uniforms.intensity.value = this.currentIntensity;
    backdropMaterial.uniforms.rand.value = Math.random() * 10000;

    // Mood-based Color Lerp
    const targetMoodCfg = this.moodColors[this.mood] || this.moodColors.neutral;
    const targetColor = new THREE.Color(targetMoodCfg.color);
    const targetEmissive = new THREE.Color(targetMoodCfg.emissive);

    sphereMaterial.color.lerp(targetColor, 0.08 * dt);
    sphereMaterial.emissive.lerp(targetEmissive, 0.08 * dt);
    
    // Dynamic emissive pulse for active moods
    const baseEmissiveIntensity = (this.mood === 'neutral' || this.mood === '') ? 0.3 : 1.2;
    const pulse = 1.0 + 0.3 * Math.sin(t * 0.003);
    sphereMaterial.emissiveIntensity = baseEmissiveIntensity * pulse;

    sphereMaterial.roughness += (0.02 - sphereMaterial.roughness) * 0.05 * dt;
    sphereMaterial.metalness += (0.95 - sphereMaterial.metalness) * 0.05 * dt;

    // Particle Animation
    particleMaterial.opacity = this.currentIntensity * 0.8;
    if (this.currentIntensity > 0.01) {
      const positions = this.particleSystem.geometry.attributes.position.array as Float32Array;
      const initialPositions = (this.particleSystem as any).userData.initialPositions;
      const speeds = (this.particleSystem as any).userData.speeds;
      
      for (let i = 0; i < speeds.length; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        
        positions[i * 3] -= x * speeds[i] * dt * 0.5;
        positions[i * 3 + 1] -= y * speeds[i] * dt * 0.5;
        positions[i * 3 + 2] -= z * speeds[i] * dt * 0.5;
        
        const dist = Math.sqrt(x*x + y*y + z*z);
        if (dist < 0.2) {
          positions[i * 3] = initialPositions[i * 3];
          positions[i * 3 + 1] = initialPositions[i * 3 + 1];
          positions[i * 3 + 2] = initialPositions[i * 3 + 2];
        }
      }
      this.particleSystem.geometry.attributes.position.needsUpdate = true;
    }

    if (sphereMaterial.userData.shader && this.outputAnalyser && this.inputAnalyser) {
      const outVol = this.outputAnalyser.data[1] / 255;
      const inVol = this.inputAnalyser.data[1] / 255;
      
      this.sphere.scale.setScalar(1.0 + 0.015 * outVol + 0.005 * inVol);

      const f = 0.0006; 
      this.rotation.x += dt * f * (0.5 + 0.05 * outVol);
      this.rotation.y += dt * f * (0.3 + 0.05 * inVol);
      this.rotation.z += dt * f * 0.2;

      this.sphere.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);

      sphereMaterial.userData.shader.uniforms.time.value += dt * 0.01;
      
      sphereMaterial.userData.shader.uniforms.inputData.value.set(
        (0.3 * this.inputAnalyser.data[0]) / 255,
        (0.08 * this.inputAnalyser.data[1]) / 255,
        (6.0 * this.inputAnalyser.data[2]) / 255,
        0,
      );
      sphereMaterial.userData.shader.uniforms.outputData.value.set(
        (0.8 * this.outputAnalyser.data[0]) / 255,
        (0.15 * this.outputAnalyser.data[1]) / 255,
        (8.0 * this.outputAnalyser.data[2]) / 255,
        0,
      );
    }

    this.composer.render();
  }

  protected firstUpdated() {
    this.init();
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-3d': GdmLiveAudioVisuals3D;
  }
}
