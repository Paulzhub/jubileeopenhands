// Compresses the Kokoro WAV clips to small MP3s (mono, 64 kbps) and points the manifest at them.
// Usage: node tools/wav-to-mp3.mjs <voiceDir>   (needs `npm i lamejs@1.2.1` resolvable)
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';

// lamejs's CommonJS entry breaks under Node (MPEGMode is not defined); its single-file build works.
const require = createRequire(join(process.cwd(), 'noop.js'));
const ctx = { console };
vm.runInNewContext(readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8') + '\n;this.lamejs = lamejs;', ctx);
const lamejs = ctx.lamejs;
const dir = process.argv[2] || 'voice';
const manifestPath = join(dir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

function readWav(buf) {
  let fmt = null, data = null;
  for (let o = 12; o + 8 <= buf.length;) {
    const id = buf.toString('ascii', o, o + 4), size = buf.readUInt32LE(o + 4), body = o + 8;
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    if (id === 'data') data = buf.subarray(body, body + size);
    o = body + size + (size % 2);
  }
  const n = data.length / (fmt.bits / 8);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const v = fmt.format === 3 ? data.readFloatLE(i * 4) : fmt.bits === 16 ? data.readInt16LE(i * 2) / 32768 : 0;
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  return { rate: fmt.rate, pcm };
}

for (const [id, clip] of Object.entries(manifest)) {
  const wavPath = join(dir, `${id}.wav`);
  const { rate, pcm } = readWav(readFileSync(wavPath));
  const enc = new lamejs.Mp3Encoder(1, rate, 64);
  const parts = [];
  for (let i = 0; i < pcm.length; i += 1152) { const b = enc.encodeBuffer(pcm.subarray(i, i + 1152)); if (b.length) parts.push(Buffer.from(b)); }
  const end = enc.flush(); if (end.length) parts.push(Buffer.from(end));
  const mp3 = Buffer.concat(parts);
  writeFileSync(join(dir, `${id}.mp3`), mp3);
  clip.src = `voice/${id}.mp3`;
  console.log(id, (mp3.length / 1024).toFixed(1) + ' KB');
  if (process.argv.includes('--delete-wav')) unlinkSync(wavPath);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
