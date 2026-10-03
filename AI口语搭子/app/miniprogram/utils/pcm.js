// Explicit little-endian conversion handles sliced and unaligned typed arrays.
function bytesOf(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error('无效音频数据');
}

class Pcm16Decoder {
  constructor() { this.carry = null; }
  reset() { this.carry = null; }
  decode(value) {
    const source = bytesOf(value);
    let bytes = source;
    if (this.carry !== null) {
      bytes = new Uint8Array(source.length + 1);
      bytes[0] = this.carry;
      bytes.set(source, 1);
    }
    const sampleCount = Math.floor(bytes.length / 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
    const floats = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i += 1) floats[i] = view.getInt16(i * 2, true) / 32768;
    this.carry = bytes.length % 2 ? bytes[bytes.length - 1] : null;
    return floats;
  }
}

function clockLabel(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
}

module.exports = { Pcm16Decoder, bytesOf, clockLabel };
