/* Resample the microphone's native rate into 16 kHz PCM16 mono in 40 ms packets.
 * Area averaging preserves timing at both 44.1 kHz and 48 kHz input rates.
 * No microphone samples are connected to the speakers. */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.ratio = sampleRate / this.targetRate;
    this.weight = 0;
    this.sum = 0;
    this.packet = new Int16Array(640);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const sample of channel) {
      let remaining = 1;
      while (remaining > 1e-8) {
        const part = Math.min(remaining, this.ratio - this.weight);
        this.sum += sample * part;
        this.weight += part;
        remaining -= part;
        if (this.weight >= this.ratio - 1e-8) {
          const value = Math.max(-1, Math.min(1, this.sum / this.ratio));
          this.packet[this.offset++] = Math.round(value * (value < 0 ? 32768 : 32767));
          this.sum = 0;
          this.weight = 0;
          if (this.offset === this.packet.length) {
            this.port.postMessage(this.packet.buffer, [this.packet.buffer]);
            this.packet = new Int16Array(640);
            this.offset = 0;
          }
        }
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PCMCaptureProcessor);
