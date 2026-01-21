
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

import * as THREE from 'three';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
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
  private currentMood = 0; 

  @property({type: Boolean}) isSearching = false;
  @property({type: Number}) mood = 0; 

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

    // Initial sphere material setup with high gloss/reflection for "original" look
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x121225, // Deep obsidian/indigo
      metalness: 0.95,
      roughness: 0.02, // Polished surface for sharp reflections
      emissive: 0x050515,
      emissiveIntensity: 0.2,
      envMapIntensity: 1.5, // Make reflections more visible
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
      1.2, // Slightly lower bloom to preserve surface detail
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

    this.currentMood += (this.mood - this.currentMood) * 0.03 * dt;

    const targetIntensity = this.isSearching ? 1.0 : 0.0;
    this.currentIntensity += (targetIntensity - this.currentIntensity) * 0.05 * dt;
    backdropMaterial.uniforms.intensity.value = this.currentIntensity;
    backdropMaterial.uniforms.rand.value = Math.random() * 10000;

    // Restore "Original" Colour Aesthetic: High-gloss Obsidian/Deep Indigo
    const originalColor = new THREE.Color(0x121225);
    const originalEmissive = new THREE.Color(0x050515);
    
    // Minimal mood influence to keep the orb looking like the requested image
    const moodEmissive = this.currentMood < 0 ? new THREE.Color(0x080010) : new THREE.Color(0x151000);
    const targetEmissive = new THREE.Color().lerpColors(originalEmissive, moodEmissive, Math.abs(this.currentMood) * 0.15);

    sphereMaterial.color.lerp(originalColor, 0.05 * dt);
    sphereMaterial.emissive.lerp(targetEmissive, 0.05 * dt);
    
    // Smoothly maintain the polished look (Low roughness, high metalness)
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
      
      // Keep scaling very subtle for a calm experience
      const moodScaleBase = 1.0 - (this.currentMood < 0 ? Math.abs(this.currentMood) * 0.05 : 0);
      this.sphere.scale.setScalar(moodScaleBase + 0.012 * outVol + 0.004 * inVol);

      const f = 0.0006; 
      // Minimal rotation/shake as requested previously
      this.rotation.x += dt * f * (0.5 + 0.05 * outVol);
      this.rotation.y += dt * f * (0.3 + 0.05 * inVol);
      this.rotation.z += dt * f * 0.2;

      this.sphere.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);

      sphereMaterial.userData.shader.uniforms.time.value += dt * 0.01;
      
      const distortionFreqScale = this.currentMood < 0 ? 1.1 : 0.85; 

      // Minimal surface distortion
      sphereMaterial.userData.shader.uniforms.inputData.value.set(
        (0.3 * this.inputAnalyser.data[0]) / 255,
        (0.08 * this.inputAnalyser.data[1]) / 255,
        (6.0 * distortionFreqScale * this.inputAnalyser.data[2]) / 255,
        0,
      );
      sphereMaterial.userData.shader.uniforms.outputData.value.set(
        (0.8 * this.outputAnalyser.data[0]) / 255,
        (0.15 * this.outputAnalyser.data[1]) / 255,
        (8.0 * distortionFreqScale * this.outputAnalyser.data[2]) / 255,
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
