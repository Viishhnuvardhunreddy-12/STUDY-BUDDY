
/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state, query} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';
import './components/ui/animated-shader-background';

interface ChatEntry {
  role: 'orb' | 'user' | 'system';
  text: string;
  timestamp: string;
}

interface GroundingChunk {
  web?: { uri: string; title: string };
}

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() onboardingComplete = false;
  @state() userName = '';
  @state() userSubject = '';
  @state() permissionGranted = false;

  @state() isRecording = false;
  @state() isSearching = false;
  @state() isAnalyzing = false;
  @state() status = '';
  @state() error = '';
  @state() transcription = '';
  @state() userTranscription = '';
  @state() isOrbSpeaking = false;
  @state() history: ChatEntry[] = [];
  @state() showHistory = false;
  @state() groundingLinks: { uri: string; title: string }[] = [];
  @state() mood = 'neutral'; 
  @state() activeDocumentName = '';
  @state() documentContext = '';
  @state() isReconnecting = false;

  @query('.history-panel-content') historyContent?: HTMLElement;
  @query('#fileInput') fileInput?: HTMLInputElement;

  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private scriptProcessorNode: ScriptProcessorNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private reconnectTimeout: any = null;
  
  // Track interruption state to prevent race conditions with async audio decoding
  private interruptionEpoch = 0;

  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #0a080d;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: white;
    }

    #status {
      position: absolute;
      bottom: 2vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      font-size: 0.6rem;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: rgba(255, 255, 255, 0.2);
      pointer-events: none;
      font-weight: 300;
    }

    .reconnecting-indicator {
      color: #ffaa00;
      font-weight: 500;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }

    .transcription-overlay {
      position: absolute;
      bottom: 20vh;
      left: 50%;
      transform: translateX(-50%);
      width: 85%;
      max-width: 450px;
      z-index: 20;
      text-align: center;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .transcription-text {
      font-size: 0.85rem;
      font-weight: 300;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.7);
      background: rgba(255, 255, 255, 0.03);
      backdrop-filter: blur(12px);
      padding: 10px 20px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      opacity: 0;
      transform: translateY(10px);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
    }

    .transcription-text.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .speaker-indicator {
      font-size: 0.5rem;
      letter-spacing: 2px;
      color: rgba(255, 255, 255, 0.25);
      text-transform: uppercase;
      font-weight: 500;
    }

    .grounding-panel {
      position: absolute;
      top: 24px;
      left: 24px;
      z-index: 30;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 300px;
      pointer-events: none;
    }

    .grounding-link {
      pointer-events: auto;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 0.7rem;
      color: #a0c4ff;
      text-decoration: none;
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: all 0.3s ease;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      animation: fadeInGrounding 0.5s ease forwards;
    }

    .grounding-link:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: translateX(5px);
    }

    .doc-badge {
      position: absolute;
      top: 24px;
      right: 24px;
      background: rgba(160, 196, 255, 0.15);
      border: 1px solid rgba(160, 196, 255, 0.3);
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.65rem;
      color: #a0c4ff;
      display: flex;
      align-items: center;
      gap: 8px;
      backdrop-filter: blur(10px);
      animation: fadeIn 0.5s ease;
      z-index: 40;
    }

    .history-panel {
      position: absolute;
      top: 0;
      right: 0;
      width: 320px;
      height: 100vh;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(50px);
      border-left: 1px solid rgba(255, 255, 255, 0.05);
      z-index: 50;
      transform: translateX(100%);
      transition: transform 0.8s cubic-bezier(0.19, 1, 0.22, 1);
      display: flex;
      flex-direction: column;
    }

    .history-panel.open {
      transform: translateX(0);
    }

    .history-header {
      padding: 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .history-header h2 {
      margin: 0;
      font-size: 0.75rem;
      letter-spacing: 4px;
      text-transform: uppercase;
      font-weight: 300;
      color: rgba(255, 255, 255, 0.5);
    }

    .history-panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .history-entry {
      display: flex;
      flex-direction: column;
      gap: 6px;
      animation: slideIn 0.5s ease forwards;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateX(10px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .entry-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.55rem;
      letter-spacing: 1px;
      text-transform: uppercase;
      opacity: 0.6;
    }

    .role-orb { color: #a0c4ff; }
    .role-user { color: #ffc09f; }
    .role-system { color: #88ff88; font-style: italic; }

    .entry-text {
      font-size: 0.8rem;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.8);
      background: rgba(255, 255, 255, 0.03);
      padding: 12px;
      border-radius: 12px;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 8vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
    }

    button {
      outline: none;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: white;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.03);
      width: 56px;
      height: 56px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(20px);
      position: relative;
      overflow: hidden;
      padding: 0;
    }

    button:hover {
      background: rgba(255, 255, 255, 0.08);
      transform: translateY(-2px);
      border-color: rgba(255, 255, 255, 0.2);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }

    button:active {
      transform: scale(0.95);
    }

    .btn-main {
      width: 68px;
      height: 68px;
      background: rgba(255, 255, 255, 0.05);
      border-width: 1.5px;
    }

    .record-indicator {
      width: 24px;
      height: 24px;
      background: #ff5f5f;
      border-radius: 50%;
      transition: all 0.3s ease;
    }

    .recording .record-indicator {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      animation: pulseRecord 1.5s ease-in-out infinite;
    }

    @keyframes pulseRecord {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 95, 95, 0.4); }
      50% { transform: scale(1.1); box-shadow: 0 0 15px 5px rgba(255, 95, 95, 0.2); }
    }

    .btn-secondary {
      width: 52px;
      height: 52px;
      opacity: 0.8;
    }

    .btn-secondary:hover {
      opacity: 1;
    }

    .onboarding-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      width: 100vw;
      position: absolute;
      top: 0;
      left: 0;
      z-index: 100;
      background: radial-gradient(circle at center, rgba(16, 16, 24, 0.5) 0%, rgba(0, 0, 0, 0.8) 100%);
    }

    .onboarding-card {
      background: rgba(18, 18, 24, 0.7);
      backdrop-filter: blur(40px);
      -webkit-backdrop-filter: blur(40px);
      border: 1px solid rgba(255, 255, 255, 0.06);
      padding: 40px 48px;
      border-radius: 24px;
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      gap: 32px;
      box-shadow: 
        0 24px 64px rgba(0, 0, 0, 0.7),
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
      transform: translateY(0);
    }

    h1 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 300;
      text-align: center;
      letter-spacing: 0.4em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.95);
      text-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    label {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: rgba(255, 255, 255, 0.4);
      font-weight: 600;
      margin-left: 4px;
    }

    input {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 16px 20px;
      color: white;
      font-size: 0.95rem;
      outline: none;
      transition: all 0.25s ease;
      font-family: inherit;
      letter-spacing: 0.02em;
    }

    input:focus {
      border-color: rgba(255, 255, 255, 0.2);
      background: rgba(0, 0, 0, 0.5);
      box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.03);
    }

    input::placeholder {
      color: rgba(255, 255, 255, 0.15);
      font-weight: 300;
    }

    .submit-btn {
      margin-top: 12px;
      background: #ffffff;
      color: #000;
      border: none;
      padding: 18px 32px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 0.8rem;
      letter-spacing: 0.2em;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
      text-transform: uppercase;
      width: 100%;
      box-shadow: 0 4px 12px rgba(255, 255, 255, 0.1);
    }
    
    .submit-btn:hover {
      background: #f2f2f2;
      transform: translateY(-1px);
      box-shadow: 0 8px 24px rgba(255, 255, 255, 0.15);
    }

    .submit-btn:active {
      transform: translateY(1px);
      background: #e6e6e6;
    }

    .permission-hint {
      text-align: center;
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.25);
      margin-top: 8px;
      font-weight: 300;
      letter-spacing: 0.02em;
    }

    .loader {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(160, 196, 255, 0.3);
      border-radius: 50%;
      border-top-color: #a0c4ff;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  private async handleOnboardingSubmit(e: Event) {
    e.preventDefault();
    if (this.userName && this.userSubject) {
      try {
        this.status = "Establishing spiritual link...";
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaStream = stream;
        this.permissionGranted = true;
        this.onboardingComplete = true;
        this.outputNode.connect(this.outputAudioContext.destination);
        await this.initSession();
        await this.startRecording();
      } catch (err) {
        this.error = "Orus needs to hear you to awaken. Please allow microphone access.";
        console.error(err);
      }
    }
  }

  private async initSession() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-2.5-flash-native-audio-preview-12-2025';

    const systemInstruction = `
      CONTEXT:
      User Name: ${this.userName}
      Subject: ${this.userSubject}
      
      GENERAL BEHAVIOR (STUDY MODE):
      You are a helpful and simple assistant. Your tone is professional yet friendly. 
      For general questions, give direct and useful answers.
      
      PERSONA SWITCH (STORY MODE):
      ONLY if the user asks you to "tell a story" (or similar), adopt the 'Orus' persona.
      In 'Orus' mode:
      - Start with a cosmic, ancient greeting.
      - Use a wise, poetic tone.
      - IMPORTANT: To visualize the story's emotion, you MUST insert mood markers periodically in your text:
        - Use [MOOD:SAD] for tragic, mournful, or low moments (Orb turns Red).
        - Use [MOOD:GOOD] for happy, hopeful, or triumphant moments (Orb turns Green).
        - Use [MOOD:MYSTICAL] for magic, wonder, or mystery (Orb turns Purple).
        - Use [MOOD:ANGRY] for conflict, danger, or intense energy (Orb turns Orange).
        - Use [MOOD:NEUTRAL] to reset the aura.
      - Markers are hidden from the user but guide the Orb.
      - Markers should ONLY appear when you are in Story Mode.
    `;

    try {
      this.isReconnecting = true;
      this.sessionPromise = ai.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.isReconnecting = false;
            this.updateStatus('Connected.');
            this.sessionPromise?.then(session => {
              session.sendRealtimeInput({ text: `Say exactly: "Hi ${this.userName}, how can I help you with ${this.userSubject}?"` });
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              this.isSearching = true;
              this.updateStatus("Searching...");
            }

            const groundingMetadata = (message as any).serverContent?.groundingMetadata;
            if (groundingMetadata?.groundingChunks) {
               const chunks = groundingMetadata.groundingChunks as GroundingChunk[];
               const newLinks = chunks
                 .filter(c => c.web)
                 .map(c => ({ uri: c.web!.uri, title: c.web!.title }));
               
               if (newLinks.length > 0) {
                 this.groundingLinks = [...this.groundingLinks, ...newLinks].slice(-5);
               }
            }

            if (message.serverContent?.inputTranscription) {
              this.userTranscription += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
              this.isOrbSpeaking = true;
              let text = message.serverContent.outputTranscription.text;
              
              // Handle mood markers from story mode
              const moodMatch = text.match(/\[MOOD:(\w+)\]/i);
              if (moodMatch) {
                this.mood = moodMatch[1].toLowerCase();
                text = text.replace(/\[MOOD:\w+\]/ig, '');
              }
              
              this.transcription += text;
              this.isSearching = false; 
            }
            if (message.serverContent?.turnComplete) {
              this.isOrbSpeaking = false;
              this.isSearching = false;
              this.archiveTurn();
              // Reset mood after turn to prevent "stuck" colors
              this.mood = 'neutral';
            }

            const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64EncodedAudioString) {
              // Capture current interruption epoch to discard this chunk if an interruption happens during decode
              const currentEpoch = this.interruptionEpoch;
              
              // Decode audio (async)
              const audioBuffer = await decodeAudioData(decode(base64EncodedAudioString), this.outputAudioContext, 24000, 1);
              
              // If interrupted during decode, discard this chunk
              if (currentEpoch !== this.interruptionEpoch) {
                return;
              }

              this.isSearching = false; 
              this.isOrbSpeaking = true;
              this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
              
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () => {
                this.sources.delete(source);
                if (this.sources.size === 0) this.isOrbSpeaking = false;
              });
              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            if (message.serverContent?.interrupted) {
              this.interruptionEpoch++; // Invalidate pending async operations
              this.archiveTurn();
              this.isOrbSpeaking = false;
              this.isSearching = false;
              this.mood = 'neutral';
              
              // Stop all currently playing sources
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.sources.clear();
              
              // Reset time cursor to now, effectively clearing the future queue
              this.nextStartTime = this.outputAudioContext.currentTime;
            }
          },
          onerror: (e: any) => {
            this.reconnect();
          },
          onclose: (e: CloseEvent) => {
            if (this.onboardingComplete && !this.isReconnecting) {
              this.reconnect();
            }
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {}, 
          inputAudioTranscription: {},
          tools: [{ googleSearch: {} }],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Kore'}},
          },
          systemInstruction: systemInstruction,
        },
      });
      await this.sessionPromise;
    } catch (e) {
      this.isReconnecting = false;
      this.reconnect();
    }
  }

  private reconnect() {
    this.isReconnecting = true;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(async () => {
      await this.initSession();
    }, 2000);
  }

  private async handleFileButtonClick() {
    this.fileInput?.click();
  }

  private async onFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.isAnalyzing = true;
    this.activeDocumentName = file.name;
    this.updateStatus(`Absorbing ${file.name}...`);

    try {
      const text = await file.text();
      this.documentContext = text;
      
      this.archiveSystemEvent(`Ingested ${file.name}. Commencing analysis...`);

      const aiPro = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const analysisResponse = await aiPro.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Analyze the document "${file.name}" uploaded by ${this.userName}. 
        Briefly summarize its intent and provide key insights.
        Content: ${text.substring(0, 15000)}`,
      });

      const analysisResult = analysisResponse.text;
      
      this.sessionPromise?.then(session => {
        session.sendRealtimeInput({ 
          text: `SYSTEM NOTIFICATION: Document "${file.name}" uploaded. Summary: ${analysisResult}` 
        });
      });

      this.isAnalyzing = false;
      this.updateStatus('Knowledge absorbed.');
    } catch (err) {
      console.error(err);
      this.updateError('Failed to parse document.');
      this.isAnalyzing = false;
    }
  }

  private archiveSystemEvent(text: string) {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.history = [...this.history, { role: 'system', text, timestamp: now }];
  }

  private archiveTurn() {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const fullIn = this.userTranscription.trim();
    const fullOut = this.transcription.trim();

    if (fullIn) {
      this.history = [...this.history, { role: 'user', text: fullIn, timestamp: now }];
      this.userTranscription = '';
    }
    if (fullOut) {
      this.history = [...this.history, { role: 'orb', text: fullOut, timestamp: now }];
      this.transcription = '';
    }
    setTimeout(() => {
      if (this.historyContent) this.historyContent.scrollTop = this.historyContent.scrollHeight;
    }, 100);
  }

  private updateStatus(msg: string) { this.status = msg; }
  private updateError(msg: string) { this.error = msg; }

  private async startRecording() {
    if (this.isRecording) return;
    this.inputAudioContext.resume();
    this.updateStatus('Listening...');
    this.userTranscription = '';
    this.transcription = '';

    try {
      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      this.sourceNode = this.inputAudioContext.createMediaStreamSource(this.mediaStream!);
      this.sourceNode.connect(this.inputNode);
      // Reduced buffer size from 4096 to 2048 to lower input latency (approx 128ms)
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(2048, 1, 1);
      this.scriptProcessorNode.onaudioprocess = (e) => {
        if (!this.isRecording) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBlob = createBlob(inputData);
        if (this.sessionPromise && !this.isReconnecting) {
          this.sessionPromise.then((session) => {
            try { session.sendRealtimeInput({ media: pcmBlob }); } catch(err) {}
          });
        }
      };
      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);
      this.isRecording = true;
    } catch (err) {
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.updateStatus('Paused.');
    if (this.scriptProcessorNode) this.scriptProcessorNode.disconnect();
    if (this.sourceNode) this.sourceNode.disconnect();
  }

  private async reset() {
    this.sessionPromise?.then(session => session.close());
    this.transcription = '';
    this.userTranscription = '';
    this.history = [];
    this.groundingLinks = [];
    this.documentContext = '';
    this.activeDocumentName = '';
    this.mood = 'neutral';
    this.interruptionEpoch = 0;
    await this.initSession();
    await this.startRecording();
  }

  render() {
    if (!this.onboardingComplete) {
      return html`
        <gdm-shader-background></gdm-shader-background>
        <div class="onboarding-container">
          <form class="onboarding-card" @submit=${this.handleOnboardingSubmit}>
            <h1>Wake the Orb</h1>
            <div class="form-group">
              <label>Name</label>
              <input type="text" required .value=${this.userName} @input=${(e: any) => this.userName = e.target.value} placeholder="Name" />
            </div>
            <div class="form-group">
              <label>Subject</label>
              <input type="text" required .value=${this.userSubject} @input=${(e: any) => this.userSubject = e.target.value} placeholder="Topic" />
            </div>
            <button type="submit" class="submit-btn">Continue</button>
            <div class="permission-hint">Enable microphone to begin.</div>
            ${this.error ? html`<div style="color: #ff8b8b; font-size: 0.7rem; text-align: center; margin-top: 10px;">${this.error}</div>` : ''}
          </form>
        </div>
      `;
    }

    return html`
      <div class="app-viewport">
        <gdm-shader-background .isSearching=${this.isSearching || this.isAnalyzing || this.isReconnecting}></gdm-shader-background>

        <input type="file" id="fileInput" hidden @change=${this.onFileChange} accept=".txt,.pdf,.js,.py,.ts,.md,.cpp,.java,.json" />

        <div class="grounding-panel">
          ${this.groundingLinks.map(link => html`
            <a href="${link.uri}" target="_blank" class="grounding-link">
              ${link.title || 'Source'}
            </a>
          `)}
        </div>

        ${this.activeDocumentName ? html`
          <div class="doc-badge">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            ${this.activeDocumentName}
            ${this.isAnalyzing ? html`<div class="loader"></div>` : ''}
          </div>
        ` : ''}

        <div class="transcription-overlay">
          ${this.transcription ? html`
            <div class="speaker-indicator">Assistant</div>
            <div class="transcription-text visible">${this.transcription}</div>
          ` : ''}
          ${this.isRecording && this.userTranscription ? html`
            <div class="speaker-indicator" style="color: #ffc09f;">${this.userName}</div>
            <div class="transcription-text visible" style="border-color: rgba(255,192,159,0.1);">${this.userTranscription}</div>
          ` : ''}
        </div>

        <div class="history-panel ${this.showHistory ? 'open' : ''}">
          <div class="history-header">
            <h2>Activity</h2>
            <button class="btn-secondary" style="width: 32px; height: 32px; border-radius: 50%;" @click=${() => this.showHistory = false}>
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M18 6L6 18M6 6l12 12"></path></svg>
            </button>
          </div>
          <div class="history-panel-content">
            ${this.history.map(entry => html`
              <div class="history-entry">
                <div class="entry-header">
                  <span class="role-${entry.role}">${entry.role === 'orb' ? 'Assistant' : (entry.role === 'system' ? 'System' : this.userName)}</span>
                  <span>${entry.timestamp}</span>
                </div>
                <div class="entry-text">${entry.text}</div>
              </div>
            `)}
          </div>
        </div>

        <div class="controls">
          <button class="btn-secondary" @click=${this.handleFileButtonClick} title="Analyze File" ?disabled=${this.isAnalyzing}>
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <path d="M12 18V12m0 0l-3 3m3-3l3 3"></path>
            </svg>
          </button>

          <button class="btn-secondary" id="resetButton" @click=${this.reset} title="Restart">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M23 4v6h-6"></path>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
          
          <button class="btn-main ${this.isRecording ? 'recording' : ''}" @click=${this.isRecording ? this.stopRecording : this.startRecording} title="${this.isRecording ? 'Stop' : 'Start'}">
            <div class="record-indicator"></div>
          </button>

          <button class="btn-secondary" @click=${() => this.showHistory = !this.showHistory} title="View Journal">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <line x1="10" y1="9" x2="8" y2="9"></line>
            </svg>
          </button>
        </div>

        <div id="status">
          ${this.isReconnecting ? html`<span class="reconnecting-indicator">Mending link...</span>` : 
            (this.isAnalyzing ? html`Analyzing...` : 
            (this.error ? html`<span style="color: #ff8b8b">${this.error}</span>` : this.status))}
        </div>

        <gdm-live-audio-visuals-3d 
          .inputNode=${this.inputNode} 
          .outputNode=${this.outputNode}
          .isSearching=${this.isSearching || this.isAnalyzing || this.isReconnecting}
          .mood=${this.mood}
        ></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}
