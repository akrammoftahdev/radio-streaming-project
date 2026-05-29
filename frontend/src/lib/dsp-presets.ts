// ── DSP Mic Filter Presets ─────────────────────────────────────────────────────
// Defines the parameter schema + system presets for the 13-node mic processing chain.
// Used by both the studio UI (client) and API routes (server).

export interface DspParams {
  // ── Per-group enable/disable toggles ────────────────────────────────────
  filterEnabled?: boolean;   // HP + LP filters
  eqEnabled?: boolean;       // 3-band parametric EQ
  dynamicsEnabled?: boolean; // Compressor + Limiter
  gateEnabled?: boolean;     // Noise Gate
  deesserEnabled?: boolean;  // De-Esser
  reverbEnabled?: boolean;   // Reverb
  delayEnabled?: boolean;    // Delay / Echo
  warmthEnabled?: boolean;   // Tape Warmth
  // ── High-Pass Filter ──────────────────────────────────────────────────────
  hpFreq: number;          // Hz — cuts rumble below this freq (20-500)
  // ── Low-Pass Filter ──────────────────────────────────────────────────────
  lpFreq: number;          // Hz — cuts hiss above this freq (4000-22000)
  // ── 3-Band Parametric EQ ──────────────────────────────────────────────────
  eqLowGain: number;       // dB (-12 to +12)
  eqLowFreq: number;       // Hz (60-500)
  eqMidGain: number;       // dB (-12 to +12)
  eqMidFreq: number;       // Hz (500-4000)
  eqHighGain: number;      // dB (-12 to +12)
  eqHighFreq: number;      // Hz (4000-12000)
  // ── Compressor ────────────────────────────────────────────────────────────
  compThreshold: number;   // dB (-60 to 0)
  compRatio: number;       // 1:1 to 20:1
  compAttack: number;      // seconds (0.001-1)
  compRelease: number;     // seconds (0.01-1)
  compKnee: number;        // dB (0-40)
  // ── Limiter ───────────────────────────────────────────────────────────────
  limiterThreshold: number; // dB (-20 to 0)
  // ── Noise Gate ────────────────────────────────────────────────────────────
  gateThreshold: number;   // dB (-96 to -20) — below this = silence
  gateAttack: number;      // seconds (0.001-0.1)
  gateRelease: number;     // seconds (0.01-0.5)
  // ── De-Esser ──────────────────────────────────────────────────────────────
  deEsserFreq: number;     // Hz — center frequency (4000-10000)
  deEsserQ: number;        // Q factor (0.5-10)
  deEsserReduction: number;// dB to reduce sibilance (0-12)
  // ── Reverb ────────────────────────────────────────────────────────────────
  reverbWet: number;       // 0-1 — mix amount
  reverbDecay: number;     // seconds (0.1-5)
  // ── Delay ─────────────────────────────────────────────────────────────────
  delayTime: number;       // seconds (0-1)
  delayFeedback: number;   // 0-0.95
  delayWet: number;        // 0-1 — mix amount
  // ── Tape Warmth ───────────────────────────────────────────────────────────
  warmthAmount: number;    // 0-1 — saturation drive
}

// Default "clean" preset — no processing applied
export const DEFAULT_DSP_PARAMS: DspParams = {
  filterEnabled: true, eqEnabled: false, dynamicsEnabled: false, gateEnabled: false,
  deesserEnabled: false, reverbEnabled: false, delayEnabled: false, warmthEnabled: false,
  hpFreq: 80,
  lpFreq: 16000,
  eqLowGain: 0, eqLowFreq: 200,
  eqMidGain: 0, eqMidFreq: 1500,
  eqHighGain: 0, eqHighFreq: 6000,
  compThreshold: -24, compRatio: 4, compAttack: 0.003, compRelease: 0.25, compKnee: 10,
  limiterThreshold: -3,
  gateThreshold: -60, gateAttack: 0.005, gateRelease: 0.05,
  deEsserFreq: 6500, deEsserQ: 2, deEsserReduction: 0,
  reverbWet: 0, reverbDecay: 1.5,
  delayTime: 0, delayFeedback: 0, delayWet: 0,
  warmthAmount: 0,
};

// Map group keys to their enable flag in DspParams
export const DSP_GROUP_ENABLE_KEY: Record<string, keyof DspParams> = {
  filter: 'filterEnabled',
  eq: 'eqEnabled',
  dynamics: 'dynamicsEnabled',
  gate: 'gateEnabled',
  deesser: 'deesserEnabled',
  reverb: 'reverbEnabled',
  delay: 'delayEnabled',
  warmth: 'warmthEnabled',
};

// System presets — seeded into DB with isSystem=true
export const SYSTEM_PRESETS: { name: string; params: DspParams }[] = [
  {
    name: "بدون معالجة",  // No processing
    params: { ...DEFAULT_DSP_PARAMS },
  },
  {
    name: "صوت إذاعي FM",  // FM Radio Voice
    params: {
      ...DEFAULT_DSP_PARAMS,
      filterEnabled: true, eqEnabled: true, dynamicsEnabled: true, gateEnabled: true,
      deesserEnabled: true, warmthEnabled: true,
      hpFreq: 100,
      lpFreq: 14000,
      eqLowGain: -2, eqMidGain: 3, eqHighGain: 2,
      compThreshold: -20, compRatio: 6, compAttack: 0.003, compRelease: 0.15, compKnee: 8,
      limiterThreshold: -2,
      gateThreshold: -50, gateAttack: 0.003, gateRelease: 0.05,
      deEsserFreq: 6500, deEsserQ: 3, deEsserReduction: 4,
      warmthAmount: 0.15,
    },
  },
  {
    name: "صوت بودكاست",  // Podcast Voice
    params: {
      ...DEFAULT_DSP_PARAMS,
      filterEnabled: true, eqEnabled: true, dynamicsEnabled: true, gateEnabled: true,
      hpFreq: 80,
      lpFreq: 15000,
      eqLowGain: -1, eqMidGain: 2, eqHighGain: 1,
      compThreshold: -18, compRatio: 3, compAttack: 0.005, compRelease: 0.2, compKnee: 12,
      limiterThreshold: -3,
      gateThreshold: -55,
    },
  },
  {
    name: "صوت عميق (بيس)",  // Deep Bass Voice
    params: {
      ...DEFAULT_DSP_PARAMS,
      filterEnabled: true, eqEnabled: true, dynamicsEnabled: true, warmthEnabled: true,
      hpFreq: 60,
      eqLowGain: 4, eqLowFreq: 150,
      eqMidGain: 1, eqMidFreq: 800,
      eqHighGain: -1,
      compThreshold: -22, compRatio: 5,
      warmthAmount: 0.25,
    },
  },
  {
    name: "صوت حاد وواضح",  // Bright & Clear
    params: {
      ...DEFAULT_DSP_PARAMS,
      filterEnabled: true, eqEnabled: true, dynamicsEnabled: true, deesserEnabled: true,
      hpFreq: 120,
      eqLowGain: -3,
      eqMidGain: 2, eqMidFreq: 2500,
      eqHighGain: 4, eqHighFreq: 8000,
      compThreshold: -20, compRatio: 4,
      deEsserFreq: 7000, deEsserQ: 3, deEsserReduction: 6,
    },
  },
  {
    name: "صوت دافئ (راديو كلاسيك)",  // Warm Classic Radio
    params: {
      ...DEFAULT_DSP_PARAMS,
      filterEnabled: true, eqEnabled: true, dynamicsEnabled: true, warmthEnabled: true,
      hpFreq: 90,
      lpFreq: 12000,
      eqLowGain: 2, eqLowFreq: 250,
      eqMidGain: 1, eqMidFreq: 1000,
      eqHighGain: -2,
      compThreshold: -24, compRatio: 5, compKnee: 15,
      warmthAmount: 0.35,
    },
  },
  {
    name: "صوت تلفزيوني",  // TV Broadcast
    params: {
      ...DEFAULT_DSP_PARAMS,
      filterEnabled: true, eqEnabled: true, dynamicsEnabled: true, gateEnabled: true,
      deesserEnabled: true,
      hpFreq: 100,
      lpFreq: 14000,
      eqLowGain: -1,
      eqMidGain: 2, eqMidFreq: 2000,
      eqHighGain: 1,
      compThreshold: -16, compRatio: 3.5, compAttack: 0.002, compRelease: 0.1,
      limiterThreshold: -1,
      gateThreshold: -48,
      deEsserFreq: 6000, deEsserReduction: 3,
    },
  },
  {
    name: "صوت مع ريفيرب خفيف",  // Light Reverb
    params: {
      ...DEFAULT_DSP_PARAMS,
      filterEnabled: true, dynamicsEnabled: true, reverbEnabled: true,
      hpFreq: 100,
      compThreshold: -22, compRatio: 4,
      reverbWet: 0.15, reverbDecay: 1.2,
    },
  },
  {
    name: "صوت مع تأخير",  // Echo/Delay Effect
    params: {
      ...DEFAULT_DSP_PARAMS,
      filterEnabled: true, dynamicsEnabled: true, delayEnabled: true,
      hpFreq: 100,
      compThreshold: -22, compRatio: 4,
      delayTime: 0.25, delayFeedback: 0.3, delayWet: 0.2,
    },
  },
  {
    name: "صوت تلاوة قرآن",  // Quran Recitation
    params: {
      ...DEFAULT_DSP_PARAMS,
      filterEnabled: true, eqEnabled: true, dynamicsEnabled: true,
      reverbEnabled: true, warmthEnabled: true,
      hpFreq: 80,
      lpFreq: 16000,
      eqLowGain: 1, eqLowFreq: 200,
      eqMidGain: 2, eqMidFreq: 1200,
      eqHighGain: 1, eqHighFreq: 5000,
      compThreshold: -18, compRatio: 3, compKnee: 15,
      reverbWet: 0.2, reverbDecay: 2.0,
      warmthAmount: 0.1,
    },
  },
];

// Numeric-only param keys (excludes boolean enable flags)
type DspNumericKey = Exclude<keyof DspParams, `${string}Enabled`>;

// Parameter display metadata for UI sliders
export const DSP_PARAM_META: Record<DspNumericKey, { label: string; min: number; max: number; step: number; unit: string }> = {
  hpFreq:            { label: "قطع منخفض",      min: 20,    max: 500,   step: 5,     unit: "Hz" },
  lpFreq:            { label: "قطع عالي",        min: 4000,  max: 22000, step: 100,   unit: "Hz" },
  eqLowGain:         { label: "بيس (EQ)",        min: -12,   max: 12,    step: 0.5,   unit: "dB" },
  eqLowFreq:         { label: "تردد البيس",      min: 60,    max: 500,   step: 10,    unit: "Hz" },
  eqMidGain:         { label: "وسط (EQ)",        min: -12,   max: 12,    step: 0.5,   unit: "dB" },
  eqMidFreq:         { label: "تردد الوسط",      min: 500,   max: 4000,  step: 50,    unit: "Hz" },
  eqHighGain:        { label: "حاد (EQ)",        min: -12,   max: 12,    step: 0.5,   unit: "dB" },
  eqHighFreq:        { label: "تردد الحاد",      min: 4000,  max: 12000, step: 100,   unit: "Hz" },
  compThreshold:     { label: "عتبة الضغط",      min: -60,   max: 0,     step: 1,     unit: "dB" },
  compRatio:         { label: "نسبة الضغط",       min: 1,     max: 20,    step: 0.5,   unit: ":1" },
  compAttack:        { label: "هجوم الضغط",       min: 0.001, max: 1,     step: 0.001, unit: "s" },
  compRelease:       { label: "إطلاق الضغط",      min: 0.01,  max: 1,     step: 0.01,  unit: "s" },
  compKnee:          { label: "ركبة الضغط",       min: 0,     max: 40,    step: 1,     unit: "dB" },
  limiterThreshold:  { label: "عتبة المحدد",      min: -20,   max: 0,     step: 0.5,   unit: "dB" },
  gateThreshold:     { label: "عتبة البوابة",     min: -96,   max: -20,   step: 1,     unit: "dB" },
  gateAttack:        { label: "هجوم البوابة",      min: 0.001, max: 0.1,   step: 0.001, unit: "s" },
  gateRelease:       { label: "إطلاق البوابة",     min: 0.01,  max: 0.5,   step: 0.01,  unit: "s" },
  deEsserFreq:       { label: "تردد De-Esser",    min: 4000,  max: 10000, step: 100,   unit: "Hz" },
  deEsserQ:          { label: "حدة De-Esser",     min: 0.5,   max: 10,    step: 0.1,   unit: "Q" },
  deEsserReduction:  { label: "تخفيض De-Esser",   min: 0,     max: 12,    step: 0.5,   unit: "dB" },
  reverbWet:         { label: "مزج الريفيرب",     min: 0,     max: 1,     step: 0.01,  unit: "" },
  reverbDecay:       { label: "مدة الريفيرب",     min: 0.1,   max: 5,     step: 0.1,   unit: "s" },
  delayTime:         { label: "وقت التأخير",      min: 0,     max: 1,     step: 0.01,  unit: "s" },
  delayFeedback:     { label: "تكرار التأخير",    min: 0,     max: 0.95,  step: 0.01,  unit: "" },
  delayWet:          { label: "مزج التأخير",      min: 0,     max: 1,     step: 0.01,  unit: "" },
  warmthAmount:      { label: "دفء الصوت",        min: 0,     max: 1,     step: 0.01,  unit: "" },
};

// Groups for UI sections
export const DSP_GROUPS = [
  { key: 'filter' as const,     label: '🎚️ فلاتر التردد',      params: ['hpFreq', 'lpFreq'] as const },
  { key: 'eq' as const,         label: '🎛️ المعادل الصوتي (EQ)', params: ['eqLowGain', 'eqLowFreq', 'eqMidGain', 'eqMidFreq', 'eqHighGain', 'eqHighFreq'] as const },
  { key: 'dynamics' as const,   label: '🔊 ديناميكيات',         params: ['compThreshold', 'compRatio', 'compAttack', 'compRelease', 'compKnee', 'limiterThreshold'] as const },
  { key: 'gate' as const,       label: '🚪 بوابة الضوضاء',      params: ['gateThreshold', 'gateAttack', 'gateRelease'] as const },
  { key: 'deesser' as const,    label: '🐍 مزيل الصفير',        params: ['deEsserFreq', 'deEsserQ', 'deEsserReduction'] as const },
  { key: 'reverb' as const,     label: '🏛️ ريفيرب',             params: ['reverbWet', 'reverbDecay'] as const },
  { key: 'delay' as const,      label: '🔁 تأخير / صدى',        params: ['delayTime', 'delayFeedback', 'delayWet'] as const },
  { key: 'warmth' as const,     label: '🔥 دفء الصوت',          params: ['warmthAmount'] as const },
] as const;
