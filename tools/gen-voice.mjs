// Build-time Kokoro voiceover generator.
// Usage: node tools/gen-voice.mjs <outDir>   (needs `npm i kokoro-js@1.2.1` resolvable)
// Writes one WAV per scene plus manifest.json with durations.
import { KokoroTTS } from 'kokoro-js';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, '..', 'voice');
mkdirSync(out, { recursive: true });
const script = JSON.parse(readFileSync(join(here, 'narration.json'), 'utf8'));

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
const manifest = {};
for (const [id, text] of Object.entries(script)) {
  const audio = await tts.generate(text, { voice: 'af_heart' });
  const file = `${id}.wav`;
  await audio.save(join(out, file));
  manifest[id] = { src: `voice/${file}`, duration: +(audio.audio.length / audio.sampling_rate).toFixed(3), text };
  console.log(id, manifest[id].duration);
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
