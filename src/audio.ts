class GameAudio {
  private ctx: AudioContext | null = null;
  private bgmGain: GainNode | null = null;
  private isBgmPlaying = false;
  private nextNoteTime = 0;
  private noteIndex = 0;
  private timingInterval: number | null = null;

  // Relaxing pentatonic sequence
  private sequence = [261.63, 329.63, 392.00, 329.63, 261.63, 293.66, 392.00, 293.66];

  private isMuted = false;

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      if (this.isBgmPlaying) this.stopBGM();
    } else {
      // Don't auto-start BGM here unless we know we are in game, 
      // but maybe let the component handle it or we just resume if needed.
      // Actually, if we're in game and unmuted, we might want to start BGM.
    }
    return this.isMuted;
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.isBgmPlaying) {
      this.stopBGM();
    }
  }

  getMuted() {
    return this.isMuted;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playStart() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.3);
    
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }

  playBuildSuccess() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playCollapse() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    
    const bufferSize = this.ctx.sampleRate * 2.0; 
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
        // Pseudo brown noise
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.4));
    }
    
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 2.0);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 2.0);
    
    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    noiseSource.start();
  }

  startBGM() {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx || this.isBgmPlaying) return;
    
    this.isBgmPlaying = true;
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.15; // Relaxing low volume
    
    // Add space with delay
    const delay = this.ctx.createDelay();
    delay.delayTime.value = 0.4;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.3;
    
    delay.connect(feedback);
    feedback.connect(delay);
    
    this.bgmGain.connect(delay);
    this.bgmGain.connect(this.ctx.destination);
    delay.connect(this.ctx.destination);

    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.scheduler();
  }

  private scheduler = () => {
    if (!this.isBgmPlaying || !this.ctx) return;
    
    while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
      this.playBGMNote(this.nextNoteTime);
      this.nextNoteTime += 0.5; // Arpeggio tempo 
    }
    this.timingInterval = window.setTimeout(this.scheduler, 25);
  };

  private playBGMNote(time: number) {
    if (!this.ctx || !this.bgmGain) return;
    
    const osc = this.ctx.createOscillator();
    const noteGain = this.ctx.createGain();
    
    // Soft sine wave
    osc.type = 'sine';
    
    // occasionally hit a lower octave to ground it
    let freq = this.sequence[this.noteIndex];
    if (Math.random() < 0.2) {
      freq = freq / 2;
    }
    osc.frequency.value = freq;
    
    // Envelope for a soft chime / pluck
    noteGain.gain.setValueAtTime(0, time);
    noteGain.gain.linearRampToValueAtTime(0.8, time + 0.05);
    noteGain.gain.exponentialRampToValueAtTime(0.01, time + 0.45);
    
    osc.connect(noteGain);
    noteGain.connect(this.bgmGain);
    
    osc.start(time);
    osc.stop(time + 0.5);
    
    this.noteIndex = (this.noteIndex + 1) % this.sequence.length;
  }

  stopBGM() {
    this.isBgmPlaying = false;
    if (this.timingInterval) {
      clearTimeout(this.timingInterval);
    }
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.0);
      setTimeout(() => {
        if (this.bgmGain) {
            this.bgmGain.disconnect();
            this.bgmGain = null;
        }
      }, 1000);
    }
  }
}

export const audioSystem = new GameAudio();
