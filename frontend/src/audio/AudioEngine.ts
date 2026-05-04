import { presetFor } from "./instrumentPresets";

type WebAudioFontPreset = {
  waveType?: OscillatorType;
  gain?: number;
};

type PlayingNode = {
  oscillator: { stop(when: number): void };
  gain: { gain: AudioParam };
};

type WebAudioFontPlayerLike = {
  loader?: {
    decodeAfterLoading?: (
      audioContext: AudioContext,
      variableName: string
    ) => void;
  };
  queueWaveTable?: (
    audioContext: AudioContext,
    destination: AudioNode,
    preset: WebAudioFontPreset,
    when: number,
    midi: number,
    duration: number,
    velocity: number
  ) => PlayingNode | undefined;
};

export type AudioDebugState = {
  contextState: AudioContextState | "unsupported" | "error";
  currentTime: number;
  htmlAudioAttempted: boolean;
  error?: string;
};

declare global {
  interface Window {
    WebAudioFontPlayer?: new () => WebAudioFontPlayerLike;
    webkitAudioContext?: typeof AudioContext;
    [key: string]: unknown;
  }
}

export class AudioEngine {
  private audioContext?: AudioContext;
  private player?: WebAudioFontPlayerLike;
  private scriptPromises = new Map<string, Promise<void>>();
  private presetPromises = new Map<string, Promise<WebAudioFontPreset>>();
  private loadedPresets = new Map<string, WebAudioFontPreset>();
  private noteUrls = new Map<string, string>();
  private beepUrl?: string;
  private activeNodes = new Map<string, PlayingNode>();

  async unlock(): Promise<void> {
    const audioContext = this.ensureAudioContext();
    const resumePromise = this.resumeIfNeeded();
    this.primeContext(audioContext);
    await resumePromise;
    void this.ensurePlayer().catch(() => undefined);
  }

  async preloadPreset(presetKey: string): Promise<void> {
    await this.loadPreset(presetKey);
  }

  async playTestTone(): Promise<void> {
    this.playTestToneNow();
  }

  playTestToneNow(): AudioDebugState {
    try {
      const audioContext = this.ensureAudioContext();
      void this.resumeIfNeeded().catch(() => undefined);
      this.primeContext(audioContext);
      this.fallbackOscillator(
        { waveType: "square", gain: 0.7 },
        audioContext.currentTime + 0.02,
        84,
        0.85,
        1
      );
      this.playHtmlBeep();

      return {
        contextState: audioContext.state,
        currentTime: audioContext.currentTime,
        htmlAudioAttempted: true
      };
    } catch (error) {
      return {
        contextState: "error",
        currentTime: 0,
        htmlAudioAttempted: false,
        error: error instanceof Error ? error.message : "Unknown audio error"
      };
    }
  }

  getDebugState(): AudioDebugState {
    if (!window.AudioContext && !window.webkitAudioContext) {
      return {
        contextState: "unsupported",
        currentTime: 0,
        htmlAudioAttempted: false
      };
    }

    try {
      const audioContext = this.ensureAudioContext();
      return {
        contextState: audioContext.state,
        currentTime: audioContext.currentTime,
        htmlAudioAttempted: false
      };
    } catch (error) {
      return {
        contextState: "error",
        currentTime: 0,
        htmlAudioAttempted: false,
        error: error instanceof Error ? error.message : "Unknown audio error"
      };
    }
  }

  async playTestToneAsync(): Promise<void> {
    const audioContext = this.ensureAudioContext();
    await this.resumeIfNeeded();
    this.fallbackOscillator(
      { waveType: "triangle", gain: 0.42 },
      audioContext.currentTime,
      72,
      0.45,
      0.8
    );
  }

  async playNow(args: {
    presetKey: string;
    midi: number;
    durationMs: number;
    velocity: number;
  }): Promise<void> {
    const audioContext = this.ensureAudioContext();
    void this.resumeIfNeeded().catch(() => undefined);
    const preset = this.presetForPlayback(args.presetKey);
    if (isLikelyIos()) {
      this.playHtmlNote(args.midi, args.durationMs, args.velocity);
    }
    this.queue(
      preset,
      audioContext.currentTime + 0.01,
      args.midi,
      args.durationMs,
      args.velocity
    );
    void this.loadPreset(args.presetKey).catch(() => undefined);
  }

  async schedule(args: {
    presetKey: string;
    midi: number;
    durationMs: number;
    velocity: number;
    playAtServerMs: number;
    serverTimeOffsetMs: number;
    sustainKey?: string;
  }): Promise<void> {
    const audioContext = this.ensureAudioContext();
    const preset = this.presetForPlayback(args.presetKey);
    const estimatedServerNow = Date.now() + args.serverTimeOffsetMs;
    const delaySeconds = Math.max(
      0,
      (args.playAtServerMs - estimatedServerNow) / 1000
    );
    const when = audioContext.currentTime + delaySeconds;

    const node = this.queue(preset, when, args.midi, args.durationMs, args.velocity);
    if (args.sustainKey && node) {
      this.activeNodes.set(args.sustainKey, node);
    }
    void this.loadPreset(args.presetKey).catch(() => undefined);
  }

  stopNote(sustainKey: string): void {
    const audioContext = this.audioContext;
    const node = this.activeNodes.get(sustainKey);
    if (!node || !audioContext) return;
    this.activeNodes.delete(sustainKey);
    const t = audioContext.currentTime;
    try {
      node.gain.gain.cancelScheduledValues(t);
      node.gain.gain.setValueAtTime(node.gain.gain.value, t);
      node.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      node.oscillator.stop(t + 0.09);
    } catch {
      // node may have already ended
    }
  }

  private queue(
    preset: WebAudioFontPreset,
    when: number,
    midi: number,
    durationMs: number,
    velocity: number
  ): PlayingNode | undefined {
    const audioContext = this.ensureAudioContext();
    const safeVelocity = Math.min(0.95, Math.max(0, velocity));
    const durationSeconds = Math.max(0.08, durationMs / 1000);

    if (this.player?.queueWaveTable) {
      return this.player.queueWaveTable(
        audioContext,
        audioContext.destination,
        preset,
        when,
        midi,
        durationSeconds,
        safeVelocity
      );
    }

    return this.fallbackOscillator(preset, when, midi, durationSeconds, safeVelocity);
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      const AudioContextConstructor =
        window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextConstructor) {
        throw new Error("Web Audio is not supported by this browser.");
      }

      this.audioContext = new AudioContextConstructor();
    }

    return this.audioContext;
  }

  private async resumeIfNeeded(): Promise<void> {
    const audioContext = this.ensureAudioContext();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  }

  private primeContext(audioContext: AudioContext): void {
    const gain = audioContext.createGain();
    gain.gain.value = 0.0001;
    gain.connect(audioContext.destination);
    const oscillator = audioContext.createOscillator();
    oscillator.connect(gain);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.03);
  }

  private async ensurePlayer(): Promise<WebAudioFontPlayerLike> {
    if (this.player) {
      return this.player;
    }

    await this.loadScript("/webaudiofont/WebAudioFontPlayer.js");
    if (window.WebAudioFontPlayer) {
      this.player = new window.WebAudioFontPlayer();
    } else {
      this.player = {};
    }

    return this.player;
  }

  private async loadPreset(presetKey: string): Promise<WebAudioFontPreset> {
    const preset = presetFor(presetKey);
    const loaded = this.loadedPresets.get(preset.key);
    if (loaded) {
      return loaded;
    }

    const existing = this.presetPromises.get(preset.key);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      const player = await this.ensurePlayer();
      await this.loadScript(preset.file);
      const sourceValue = window[preset.variableName] as
        | (WebAudioFontPreset & { zones?: unknown[] })
        | undefined;
      let loadedPreset: WebAudioFontPreset = sourceValue ?? {
        waveType: "sine",
        gain: 0.3
      };
      if (preset.copyKey && sourceValue && Array.isArray(sourceValue.zones)) {
        loadedPreset = {
          ...sourceValue,
          zones: sourceValue.zones.map((zone) => ({ ...(zone as object) }))
        } as WebAudioFontPreset;
      }
      player.loader?.decodeAfterLoading?.(
        this.ensureAudioContext(),
        preset.variableName
      );
      this.loadedPresets.set(preset.key, loadedPreset);
      return loadedPreset;
    })();

    this.presetPromises.set(preset.key, promise);
    return promise;
  }

  private loadScript(src: string): Promise<void> {
    const existing = this.scriptPromises.get(src);
    if (existing) {
      return existing;
    }

    const promise = new Promise<void>((resolve, reject) => {
      const currentScript = document.querySelector(`script[src="${src}"]`);
      if (currentScript) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.addEventListener("load", () => resolve());
      script.addEventListener("error", () =>
        reject(new Error(`Unable to load audio script ${src}`))
      );
      document.head.append(script);
    });

    this.scriptPromises.set(src, promise);
    return promise;
  }

  private presetForPlayback(presetKey: string): WebAudioFontPreset {
    const preset = presetFor(presetKey);
    return this.loadedPresets.get(preset.key) ?? synthPresetFor(preset.key);
  }

  private fallbackOscillator(
    preset: WebAudioFontPreset,
    when: number,
    midi: number,
    durationSeconds: number,
    velocity: number
  ): PlayingNode {
    const audioContext = this.ensureAudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);

    oscillator.type = preset.waveType ?? "sine";
    oscillator.frequency.setValueAtTime(frequency, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, velocity * (preset.gain ?? 0.35)),
      when + 0.01
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      when + Math.max(0.05, durationSeconds)
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(when);
    oscillator.stop(when + durationSeconds + 0.04);
    return { oscillator, gain };
  }

  private playHtmlBeep(): void {
    const audio = new Audio(this.getBeepUrl());
    audio.volume = 1;
    void audio.play().catch(() => undefined);
  }

  private playHtmlNote(midi: number, durationMs: number, velocity: number): void {
    const audio = new Audio(this.getNoteUrl(midi, durationMs, velocity));
    audio.volume = Math.min(1, Math.max(0, velocity));
    void audio.play().catch(() => undefined);
  }

  private getBeepUrl(): string {
    if (!this.beepUrl) {
      this.beepUrl = URL.createObjectURL(createToneWavBlob(880, 450, 0.85));
    }

    return this.beepUrl;
  }

  private getNoteUrl(midi: number, durationMs: number, velocity: number): string {
    const safeDurationMs = Math.round(Math.min(900, Math.max(90, durationMs)));
    const safeVelocity = Math.round(Math.min(1, Math.max(0, velocity)) * 100);
    const key = `${midi}:${safeDurationMs}:${safeVelocity}`;
    const existing = this.noteUrls.get(key);
    if (existing) {
      return existing;
    }

    const frequency = 440 * Math.pow(2, (midi - 69) / 12);
    const url = URL.createObjectURL(
      createToneWavBlob(frequency, safeDurationMs, safeVelocity / 100)
    );
    this.noteUrls.set(key, url);
    return url;
  }
}

function createToneWavBlob(
  frequency: number,
  durationMs: number,
  velocity: number
): Blob {
  const sampleRate = 22050;
  const durationSeconds = Math.min(1.2, Math.max(0.08, durationMs / 1000));
  const samples = Math.floor(sampleRate * durationSeconds);
  const headerBytes = 44;
  const bytesPerSample = 2;
  const dataBytes = samples * bytesPerSample;
  const buffer = new ArrayBuffer(headerBytes + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  for (let index = 0; index < samples; index += 1) {
    const t = index / sampleRate;
    const envelope = Math.min(1, index / 700) * Math.min(1, (samples - index) / 1600);
    const sample =
      Math.sin(2 * Math.PI * frequency * t) *
      envelope *
      Math.min(1, Math.max(0, velocity));
    view.setInt16(headerBytes + index * bytesPerSample, sample * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function isLikelyIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function synthPresetFor(_presetKey: string): WebAudioFontPreset {
  return { waveType: "triangle", gain: 0.34 };
}
