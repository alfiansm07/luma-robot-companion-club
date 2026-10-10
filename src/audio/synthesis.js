// Original LUMA sound design, generated from oscillators and seeded noise.
// All synthesized musical material and sound effects are dedicated to CC0-1.0.
// No recordings, samples, external assets, or third-party compositions are used.

const SAMPLE_RATE = 24000;
const TAU = Math.PI * 2;

function noiseGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return (value / 4294967296) * 2 - 1;
  };
}

function buffer(context, seconds, channels = 1) {
  return context.createBuffer(channels, Math.round(seconds * SAMPLE_RATE), SAMPLE_RATE);
}

function edgeEnvelope(index, length, fade) {
  return Math.min(1, index / fade, (length - 1 - index) / fade);
}

function noteFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

// Notes wrap into the same ring buffer, including their release and echo tails.
// Each note begins/ends at silence, so the finished chord cycle is seamless.
function addNote(left, right, start, seconds, note, amplitude, pan, pluck = false) {
  const frequency = noteFrequency(note);
  const length = Math.round(seconds * SAMPLE_RATE);
  const offset = Math.round(start * SAMPLE_RATE);
  const leftGain = Math.sqrt((1 - pan) * 0.5) * amplitude;
  const rightGain = Math.sqrt((1 + pan) * 0.5) * amplitude;
  for (let i = 0; i < length; i += 1) {
    const time = i / SAMPLE_RATE;
    const progress = i / length;
    const envelope = pluck
      ? Math.min(1, time / 0.018) * Math.exp(-time * 2.2) * Math.min(1, (seconds - time) / 0.15)
      : Math.sin(Math.PI * progress) ** 2;
    const phase = TAU * frequency * time;
    const tone =
      Math.sin(phase + 0.006 * Math.sin(TAU * 0.5 * time)) +
      0.16 * Math.sin(phase * 2 + 0.3) +
      (pluck ? 0.09 : 0.025) * Math.sin(phase * 3);
    const index = (((offset + i) % left.length) + left.length) % left.length;
    left[index] += tone * envelope * leftGain;
    right[index] += tone * envelope * rightGain;
  }
}

function makeMusic(context) {
  const result = buffer(context, 24, 2);
  const left = result.getChannelData(0);
  const right = result.getChannelData(1);
  const chords = [
    [50, 57, 61, 64, 69],
    [47, 54, 57, 62, 66],
    [43, 50, 54, 57, 62],
    [45, 52, 59, 61, 64],
  ];
  const melody = [76, 73, 74, 69, 71, 74, 73, 71];
  for (let chord = 0; chord < chords.length; chord += 1) {
    for (let voice = 0; voice < chords[chord].length; voice += 1) {
      addNote(left, right, chord * 6 - 0.75, 7.5, chords[chord][voice], 0.033, (voice - 2) * 0.28);
    }
  }
  for (let i = 0; i < melody.length; i += 1) {
    const pan = i % 2 === 0 ? -0.3 : 0.3;
    addNote(left, right, i * 3 + 0.7, 2.2, melody[i], 0.026, pan, true);
    addNote(left, right, i * 3 + 1.08, 2.2, melody[i], 0.007, -pan, true);
  }
  return result;
}

function makeAmbience(context) {
  const result = buffer(context, 8, 2);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = result.getChannelData(channel);
    const noise = noiseGenerator(4071 + channel * 91);
    let low = 0;
    for (let i = 0; i < data.length; i += 1) {
      const time = i / SAMPLE_RATE;
      low += 0.035 * (noise() - low);
      const air = low * (0.7 + 0.12 * Math.sin((TAU * time) / 8 + channel));
      const hum =
        0.007 * Math.sin(TAU * 78 * time + channel * 0.4) + 0.003 * Math.sin(TAU * 117 * time);
      data[i] = (air * 0.13 + hum) * edgeEnvelope(i, data.length, 1800);
    }
  }
  return result;
}

function makeServo(context) {
  const result = buffer(context, 0.6);
  const data = result.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const time = i / SAMPLE_RATE;
    const flutter =
      0.76 + 0.18 * Math.cos(TAU * 20 * time) + 0.06 * Math.cos(TAU * (110 / 3) * time);
    data[i] =
      flutter *
      (0.075 * Math.sin(TAU * 160 * time) +
        0.026 * Math.sin(TAU * 320 * time) +
        0.008 * Math.sin(TAU * 640 * time));
  }
  return result;
}

function makeFan(context) {
  const result = buffer(context, 4);
  const data = result.getChannelData(0);
  const noise = noiseGenerator(9403);
  let low = 0;
  for (let i = 0; i < data.length; i += 1) {
    const time = i / SAMPLE_RATE;
    low += 0.085 * (noise() - low);
    const blades = 0.82 + 0.18 * Math.sin(TAU * 17 * time);
    data[i] =
      (low * 0.22 + Math.sin(TAU * 85 * time) * 0.025) * blades * edgeEnvelope(i, data.length, 800);
  }
  return result;
}

function makeWater(context) {
  const result = buffer(context, 6);
  const data = result.getChannelData(0);
  const noise = noiseGenerator(21477);
  let low = 0;
  let slow = 0;
  for (let i = 0; i < data.length; i += 1) {
    const random = noise();
    low += 0.2 * (random - low);
    slow += 0.012 * (random - slow);
    const time = i / SAMPLE_RATE;
    const ripple = 0.78 + 0.14 * Math.sin(TAU * time * 2.5) + 0.08 * Math.cos(TAU * time * 7);
    data[i] = (low - slow) * 0.16 * ripple * edgeEnvelope(i, data.length, 1500);
  }
  for (let bubble = 0; bubble < 23; bubble += 1) {
    const start = Math.floor(((bubble * 0.257 + 0.12) % 5.8) * SAMPLE_RATE);
    const pitch = 620 + ((bubble * 137) % 900);
    for (let i = 0; i < 2400; i += 1) {
      const time = i / SAMPLE_RATE;
      const envelope = Math.sin((Math.PI * i) / 2400) * Math.exp(-time * 38);
      data[(start + i) % data.length] +=
        0.047 * envelope * Math.sin(TAU * (pitch * time + 700 * time * time));
    }
  }
  return result;
}

function makeFootstep(context, variant) {
  const result = buffer(context, 0.16);
  const data = result.getChannelData(0);
  const noise = noiseGenerator(3301 + variant * 167);
  let low = 0;
  for (let i = 0; i < data.length; i += 1) {
    const time = i / SAMPLE_RATE;
    low += 0.18 * (noise() - low);
    const attack = Math.min(1, time / 0.0025);
    const thud =
      Math.sin(TAU * ((140 + variant * 9) * time - 125 * time * time)) * Math.exp(-time * 38);
    const contact = low * 0.34 * Math.exp(-time * 64);
    const tick = Math.sin(TAU * (780 + variant * 53) * time) * Math.exp(-time * 95) * 0.045;
    data[i] = (thud * 0.27 + contact + tick) * attack * Math.min(1, (0.16 - time) / 0.025);
  }
  return result;
}

function makeJump(context) {
  const result = buffer(context, 0.32);
  const data = result.getChannelData(0);
  const noise = noiseGenerator(6007);
  let air = 0;
  let phase = 0;
  for (let i = 0; i < data.length; i += 1) {
    const time = i / SAMPLE_RATE;
    const progress = i / data.length;
    air += 0.08 * (noise() - air);
    phase += (TAU * (290 + 440 * progress)) / SAMPLE_RATE;
    const envelope = Math.sin(Math.PI * progress) ** 2 * Math.exp(-time * 4);
    data[i] = (Math.sin(phase) * 0.16 + Math.sin(phase * 2) * 0.025 + air * 0.25) * envelope;
  }
  return result;
}

function makeLanding(context) {
  const result = buffer(context, 0.3);
  const data = result.getChannelData(0);
  const noise = noiseGenerator(8101);
  let low = 0;
  for (let i = 0; i < data.length; i += 1) {
    const time = i / SAMPLE_RATE;
    low += 0.075 * (noise() - low);
    const envelope =
      Math.min(1, time / 0.004) * Math.exp(-time * 19) * Math.min(1, (0.3 - time) / 0.04);
    const spring = Math.sin(TAU * (185 * time - 140 * time * time)) * Math.exp(-time * 9) * 0.075;
    data[i] = (0.4 * Math.sin(TAU * 74 * time) + low * 0.65 + spring) * envelope;
  }
  return result;
}

function makeToy(context) {
  const result = buffer(context, 0.38);
  const data = result.getChannelData(0);
  const noise = noiseGenerator(9209);
  let phase = 0;
  let air = 0;
  for (let i = 0; i < data.length; i += 1) {
    const progress = i / data.length;
    const frequency = 840 + 530 * Math.sin(Math.PI * progress) - 210 * progress;
    phase += (TAU * frequency) / SAMPLE_RATE;
    air += 0.35 * (noise() - air);
    const envelope = Math.sin(Math.PI * progress) ** 1.4;
    data[i] =
      (Math.sin(phase + 0.09 * Math.sin(phase * 0.5)) * 0.21 +
        Math.sin(phase * 2) * 0.035 +
        air * 0.04) *
      envelope;
  }
  return result;
}

/**
 * Synthesize the complete original CC0 LUMA soundtrack once for an audio context.
 * Buffers use 24 kHz PCM; Web Audio resamples them to the device's output rate.
 * @param {AudioContext} context Native context used to allocate reusable buffers.
 * @returns {{music: AudioBuffer, ambience: AudioBuffer, servo: AudioBuffer,
 * fan: AudioBuffer, water: AudioBuffer, steps: AudioBuffer[], jump: AudioBuffer,
 * land: AudioBuffer, toy: AudioBuffer}} Shared immutable playback buffers.
 */
export function createSoundBuffers(context) {
  return {
    music: makeMusic(context),
    ambience: makeAmbience(context),
    servo: makeServo(context),
    fan: makeFan(context),
    water: makeWater(context),
    steps: [makeFootstep(context, 0), makeFootstep(context, 1), makeFootstep(context, 2)],
    jump: makeJump(context),
    land: makeLanding(context),
    toy: makeToy(context),
  };
}
