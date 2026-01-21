import { LitElement, html, css } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import * as THREE from 'three';

/**
 * Animated Shader Background
 * Renders a high-performance aurora and star field shader.
 * Reacts to 'isSearching' state by intensifying visuals.
 */
@customElement('gdm-shader-background')
export class GdmShaderBackground extends LitElement {
  @query('#container') container!: HTMLDivElement;

  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private material!: THREE.ShaderMaterial;
  private clock = new THREE.Clock();
  private frameId: number = 0;
  private searchIntensity = 0;

  @property({ type: Boolean }) isSearching = false;

  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: -1;
      pointer-events: none;
      overflow: hidden;
    }
    #container {
      width: 100%;
      height: 100%;
    }
    canvas {
      display: block;
    }
  `;

  firstUpdated() {
    this.initThree();
  }

  private initThree() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 1);
    this.container.appendChild(this.renderer.domElement);

    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float iTime;
      uniform vec2 iResolution;
      uniform float searchIntensity;

      #define NUM_OCTAVES 3

      float rand(vec2 n) {
        return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 ip = floor(p);
        vec2 u = fract(p);
        u = u*u*(3.0-2.0*u);

        float res = mix(
          mix(rand(ip), rand(ip + vec2(1.0, 0.0)), u.x),
          mix(rand(ip + vec2(0.0, 1.0)), rand(ip + vec2(1.0, 1.0)), u.x), u.y);
        return res * res;
      }

      float fbm(vec2 x) {
        float v = 0.0;
        float a = 0.3;
        vec2 shift = vec2(100.0);
        mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
        for (int i = 0; i < NUM_OCTAVES; ++i) {
          v += a * noise(x);
          x = rot * x * 2.0 + shift;
          a *= 0.4;
        }
        return v;
      }

      float stars(vec2 uv, float frequency, float size) {
        vec2 grid = floor(uv * frequency);
        vec2 sub = fract(uv * frequency);
        float r = rand(grid);
        float star = 0.0;
        if (r > 0.94) {
          vec2 pos = vec2(rand(grid + 0.1), rand(grid + 0.2));
          float dist = length(sub - pos);
          star = smoothstep(size, size * 0.5, dist) * r;
          float twinkleSpeed = 2.0 + searchIntensity * 10.0;
          star *= (0.4 + 0.6 * sin(iTime * twinkleSpeed + r * 6.28));
        }
        return star;
      }

      void main() {
        float timeScale = 1.0 + searchIntensity * 2.5;
        float scaledTime = iTime * timeScale;
        
        vec2 shake = vec2(sin(iTime * 1.1) * (0.003 + searchIntensity * 0.01), cos(iTime * 1.7) * (0.003 + searchIntensity * 0.01));
        vec2 p = ((gl_FragCoord.xy + shake * iResolution.xy) - iResolution.xy * 0.5) / iResolution.y * mat2(6.0, -4.0, 4.0, 6.0);
        
        vec2 starUv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y;
        float s = 0.0;
        s += stars(starUv + scaledTime * 0.02, 12.0, 0.09);
        s += stars(starUv - scaledTime * 0.012, 28.0, 0.07);
        s += stars(starUv + scaledTime * 0.008, 60.0, 0.05);

        vec4 o = vec4(0.0);
        float f = 2.0 + fbm(p + vec2(scaledTime * 4.0, 0.0)) * 0.5;

        for (float i = 0.0; i < 35.0; i++) {
          vec2 v = p + cos(i * i + (scaledTime + p.x * 0.08) * 0.025 + i * vec2(13.0, 11.0)) * 3.5 + vec2(sin(scaledTime * 3.0 + i) * 0.003, cos(scaledTime * 3.5 - i) * 0.003);
          float tailNoise = fbm(v + vec2(scaledTime * 0.4, i)) * 0.3 * (1.0 - (i / 35.0));
          
          vec4 baseColor = vec4(
            0.1 + 0.3 * sin(i * 0.2 + scaledTime * 0.4),
            0.3 + 0.5 * cos(i * 0.3 + scaledTime * 0.5),
            0.7 + 0.3 * sin(i * 0.4 + scaledTime * 0.3),
            1.0
          );
          
          // Shifting towards data-cyan during search
          vec4 searchColor = vec4(0.1, 0.7, 1.0, 1.0);
          vec4 auroraColors = mix(baseColor, searchColor, searchIntensity * 0.6);
          
          vec4 currentContribution = auroraColors * exp(sin(i * i + scaledTime * 0.8)) / length(max(v, vec2(v.x * f * 0.015, v.y * 1.5)));
          float thinnessFactor = smoothstep(0.0, 1.0, i / 35.0) * 0.7;
          o += currentContribution * (1.0 + tailNoise * 0.8) * thinnessFactor;
        }

        o = tanh(pow(o / (65.0 - searchIntensity * 20.0), vec4(1.5)));
        vec3 finalColor = o.rgb * (1.6 + searchIntensity * 0.8) + vec3(s * (1.2 + searchIntensity * 2.0));
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        searchIntensity: { value: 0 }
      },
      vertexShader,
      fragmentShader
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(mesh);

    this.handleResize();

    const animate = () => {
      this.material.uniforms.iTime.value = this.clock.getElapsedTime();
      
      const target = this.isSearching ? 1.0 : 0.0;
      this.searchIntensity += (target - this.searchIntensity) * 0.05;
      this.material.uniforms.searchIntensity.value = this.searchIntensity;

      this.renderer.render(this.scene, this.camera);
      this.frameId = requestAnimationFrame(animate);
    };
    animate();

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => {
    if (!this.renderer) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.material) {
      this.material.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight);
    }
  };

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    if (this.renderer) {
      this.renderer.dispose();
    }
  }

  render() {
    return html`<div id="container"></div>`;
  }
}