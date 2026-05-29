"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { type DspParams, DEFAULT_DSP_PARAMS } from "@/lib/dsp-presets";

/**
 * useDsp — DSP filter chain: HP, LP, EQ(3), Compressor, Gate, De-Esser,
 * Reverb, Delay, Warmth, Limiter.
 *
 * Depends on audioCtxRef from useAudioMixer.
 */

export interface DspHook {
  dspParams:       DspParams;
  setDspParams:    React.Dispatch<React.SetStateAction<DspParams>>;
  dspBypassed:     boolean;
  setDspBypassed:  React.Dispatch<React.SetStateAction<boolean>>;
  dspBypassRef:    React.MutableRefObject<boolean>;
  dspOutputRef:    React.MutableRefObject<GainNode | null>;
  buildDspChain:   (ctx: AudioContext, inputNode: MediaStreamAudioSourceNode) => GainNode;
  applyDspParams:  (params: DspParams) => void;
  toggleDspBypass: (micSourceRef: React.MutableRefObject<MediaStreamAudioSourceNode | null>, micGainRef: React.MutableRefObject<GainNode | null>, analyserRef: React.MutableRefObject<AnalyserNode | null>) => void;
  cleanupDsp:      () => void;
  resetDsp:        () => void;
}

export function useDsp(
  audioCtxRef: React.MutableRefObject<AudioContext | null>,
): DspHook {
  const [dspParams, setDspParams]     = useState<DspParams>(DEFAULT_DSP_PARAMS);
  const [dspBypassed, setDspBypassed] = useState(false);
  const dspParamsRef   = useRef<DspParams>(DEFAULT_DSP_PARAMS);
  const dspBypassRef   = useRef<boolean>(false);

  // DSP node refs
  const dspHpRef           = useRef<BiquadFilterNode | null>(null);
  const dspLpRef           = useRef<BiquadFilterNode | null>(null);
  const dspEqLowRef        = useRef<BiquadFilterNode | null>(null);
  const dspEqMidRef        = useRef<BiquadFilterNode | null>(null);
  const dspEqHighRef       = useRef<BiquadFilterNode | null>(null);
  const dspCompRef         = useRef<DynamicsCompressorNode | null>(null);
  const dspLimiterRef      = useRef<DynamicsCompressorNode | null>(null);
  const dspGateGainRef     = useRef<GainNode | null>(null);
  const dspGateAnalyserRef = useRef<AnalyserNode | null>(null);
  const dspGateRafRef      = useRef<number | null>(null);
  const dspDeEsserBpRef    = useRef<BiquadFilterNode | null>(null);
  const dspDeEsserGainRef  = useRef<GainNode | null>(null);
  const dspReverbConvRef   = useRef<ConvolverNode | null>(null);
  const dspReverbWetRef    = useRef<GainNode | null>(null);
  const dspReverbDryRef    = useRef<GainNode | null>(null);
  const dspDelayRef        = useRef<DelayNode | null>(null);
  const dspDelayFbRef      = useRef<GainNode | null>(null);
  const dspDelayWetRef     = useRef<GainNode | null>(null);
  const dspDelayDryRef     = useRef<GainNode | null>(null);
  const dspWarmthRef       = useRef<WaveShaperNode | null>(null);
  const dspWarmthWetRef    = useRef<GainNode | null>(null);
  const dspWarmthDryRef    = useRef<GainNode | null>(null);
  const dspOutputRef       = useRef<GainNode | null>(null);

  // Keep refs in sync
  useEffect(() => { dspParamsRef.current = dspParams; }, [dspParams]);
  useEffect(() => { dspBypassRef.current = dspBypassed; }, [dspBypassed]);

  // Generate impulse response for reverb
  const generateImpulseResponse = useCallback((ctx: AudioContext, decay: number, duration = 2): AudioBuffer => {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }, []);

  // Generate waveshaper curve for tape warmth
  const makeWarmthCurve = useCallback((amount: number): Float32Array<ArrayBuffer> => {
    const samples = 44100;
    const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
    const k = amount * 50;
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }, []);

  // Noise gate RAF loop
  const startNoiseGateLoop = useCallback(() => {
    if (dspGateRafRef.current) cancelAnimationFrame(dspGateRafRef.current);
    const analyser = dspGateAnalyserRef.current;
    const gateGain = dspGateGainRef.current;
    if (!analyser || !gateGain) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let gateOpen = true;

    const loop = () => {
      dspGateRafRef.current = requestAnimationFrame(loop);
      const params = dspParamsRef.current;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i];
      const rms = Math.sqrt(sum / dataArray.length);
      const dbLevel = 20 * Math.log10(rms / 255 + 1e-10);

      if (dbLevel > params.gateThreshold) {
        if (!gateOpen) {
          gateGain.gain.linearRampToValueAtTime(1, (audioCtxRef.current?.currentTime ?? 0) + params.gateAttack);
          gateOpen = true;
        }
      } else {
        if (gateOpen) {
          gateGain.gain.linearRampToValueAtTime(0, (audioCtxRef.current?.currentTime ?? 0) + params.gateRelease);
          gateOpen = false;
        }
      }
    };
    loop();
  }, [audioCtxRef]);

  // Build the full DSP chain
  const buildDspChain = useCallback((ctx: AudioContext, inputNode: MediaStreamAudioSourceNode): GainNode => {
    const p = dspParamsRef.current;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = p.hpFreq; hp.Q.value = 0.707;
    dspHpRef.current = hp;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = p.lpFreq; lp.Q.value = 0.707;
    dspLpRef.current = lp;

    const eqLow = ctx.createBiquadFilter();
    eqLow.type = 'lowshelf'; eqLow.frequency.value = p.eqLowFreq; eqLow.gain.value = p.eqLowGain;
    dspEqLowRef.current = eqLow;

    const eqMid = ctx.createBiquadFilter();
    eqMid.type = 'peaking'; eqMid.frequency.value = p.eqMidFreq; eqMid.gain.value = p.eqMidGain; eqMid.Q.value = 1.5;
    dspEqMidRef.current = eqMid;

    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = 'highshelf'; eqHigh.frequency.value = p.eqHighFreq; eqHigh.gain.value = p.eqHighGain;
    dspEqHighRef.current = eqHigh;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = p.compThreshold; comp.ratio.value = p.compRatio;
    comp.attack.value = p.compAttack; comp.release.value = p.compRelease; comp.knee.value = p.compKnee;
    dspCompRef.current = comp;

    const gateAnalyser = ctx.createAnalyser(); gateAnalyser.fftSize = 256;
    const gateGain = ctx.createGain(); gateGain.gain.value = 1;
    dspGateAnalyserRef.current = gateAnalyser;
    dspGateGainRef.current = gateGain;

    const deEsserBp = ctx.createBiquadFilter();
    deEsserBp.type = 'bandpass'; deEsserBp.frequency.value = p.deEsserFreq; deEsserBp.Q.value = p.deEsserQ;
    const deEsserGain = ctx.createGain(); deEsserGain.gain.value = 1;
    dspDeEsserBpRef.current = deEsserBp; dspDeEsserGainRef.current = deEsserGain;

    const reverbConv = ctx.createConvolver();
    reverbConv.buffer = generateImpulseResponse(ctx, p.reverbDecay);
    const reverbWet = ctx.createGain(); reverbWet.gain.value = p.reverbWet;
    const reverbDry = ctx.createGain(); reverbDry.gain.value = 1 - p.reverbWet;
    dspReverbConvRef.current = reverbConv; dspReverbWetRef.current = reverbWet; dspReverbDryRef.current = reverbDry;

    const delay = ctx.createDelay(2); delay.delayTime.value = p.delayTime;
    const delayFb = ctx.createGain(); delayFb.gain.value = p.delayFeedback;
    const delayWet = ctx.createGain(); delayWet.gain.value = p.delayWet;
    const delayDry = ctx.createGain(); delayDry.gain.value = 1 - p.delayWet;
    dspDelayRef.current = delay; dspDelayFbRef.current = delayFb;
    dspDelayWetRef.current = delayWet; dspDelayDryRef.current = delayDry;

    const warmth = ctx.createWaveShaper();
    warmth.curve = makeWarmthCurve(p.warmthAmount); warmth.oversample = '2x';
    const warmthWet = ctx.createGain(); warmthWet.gain.value = p.warmthAmount;
    const warmthDry = ctx.createGain(); warmthDry.gain.value = 1 - p.warmthAmount;
    dspWarmthRef.current = warmth; dspWarmthWetRef.current = warmthWet; dspWarmthDryRef.current = warmthDry;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = p.limiterThreshold; limiter.ratio.value = 20;
    limiter.attack.value = 0.001; limiter.release.value = 0.05; limiter.knee.value = 0;
    dspLimiterRef.current = limiter;

    const output = ctx.createGain(); output.gain.value = 1;
    dspOutputRef.current = output;

    // Wire the chain
    inputNode.connect(hp);
    hp.connect(lp); lp.connect(eqLow); eqLow.connect(eqMid); eqMid.connect(eqHigh);
    eqHigh.connect(comp); comp.connect(gateAnalyser); comp.connect(gateGain);
    gateGain.connect(deEsserBp); gateGain.connect(deEsserGain);

    const reverbMerge = ctx.createGain();
    deEsserGain.connect(reverbDry); deEsserGain.connect(reverbConv);
    reverbConv.connect(reverbWet); reverbDry.connect(reverbMerge); reverbWet.connect(reverbMerge);

    const delayMerge = ctx.createGain();
    reverbMerge.connect(delayDry); reverbMerge.connect(delay);
    delay.connect(delayFb); delayFb.connect(delay); delay.connect(delayWet);
    delayDry.connect(delayMerge); delayWet.connect(delayMerge);

    const warmthMerge = ctx.createGain();
    delayMerge.connect(warmthDry); delayMerge.connect(warmth);
    warmth.connect(warmthWet); warmthDry.connect(warmthMerge); warmthWet.connect(warmthMerge);

    warmthMerge.connect(limiter); limiter.connect(output);

    startNoiseGateLoop();
    return output;
  }, [generateImpulseResponse, makeWarmthCurve, startNoiseGateLoop]);

  // Apply DSP parameter changes in real-time
  const applyDspParams = useCallback((params: DspParams) => {
    setDspParams(params);
    const t = audioCtxRef.current?.currentTime ?? 0;

    const filterOn = params.filterEnabled !== false;
    if (dspHpRef.current) dspHpRef.current.frequency.setValueAtTime(filterOn ? params.hpFreq : 20, t);
    if (dspLpRef.current) dspLpRef.current.frequency.setValueAtTime(filterOn ? params.lpFreq : 22000, t);

    const eqOn = params.eqEnabled !== false;
    if (dspEqLowRef.current) { dspEqLowRef.current.frequency.setValueAtTime(params.eqLowFreq, t); dspEqLowRef.current.gain.setValueAtTime(eqOn ? params.eqLowGain : 0, t); }
    if (dspEqMidRef.current) { dspEqMidRef.current.frequency.setValueAtTime(params.eqMidFreq, t); dspEqMidRef.current.gain.setValueAtTime(eqOn ? params.eqMidGain : 0, t); }
    if (dspEqHighRef.current) { dspEqHighRef.current.frequency.setValueAtTime(params.eqHighFreq, t); dspEqHighRef.current.gain.setValueAtTime(eqOn ? params.eqHighGain : 0, t); }

    const dynOn = params.dynamicsEnabled !== false;
    if (dspCompRef.current) {
      dspCompRef.current.threshold.setValueAtTime(dynOn ? params.compThreshold : 0, t);
      dspCompRef.current.ratio.setValueAtTime(dynOn ? params.compRatio : 1, t);
      dspCompRef.current.attack.setValueAtTime(dynOn ? params.compAttack : 0.003, t);
      dspCompRef.current.release.setValueAtTime(dynOn ? params.compRelease : 0.25, t);
      dspCompRef.current.knee.setValueAtTime(dynOn ? params.compKnee : 0, t);
    }
    if (dspLimiterRef.current) dspLimiterRef.current.threshold.setValueAtTime(dynOn ? params.limiterThreshold : 0, t);

    const deesserOn = params.deesserEnabled !== false;
    if (dspDeEsserBpRef.current) { dspDeEsserBpRef.current.frequency.setValueAtTime(params.deEsserFreq, t); dspDeEsserBpRef.current.Q.setValueAtTime(deesserOn ? params.deEsserQ : 0.001, t); }

    const reverbOn = params.reverbEnabled !== false;
    const revWet = reverbOn ? params.reverbWet : 0;
    if (dspReverbWetRef.current) dspReverbWetRef.current.gain.setValueAtTime(revWet, t);
    if (dspReverbDryRef.current) dspReverbDryRef.current.gain.setValueAtTime(1 - revWet, t);
    if (dspReverbConvRef.current && audioCtxRef.current) {
      try { dspReverbConvRef.current.buffer = generateImpulseResponse(audioCtxRef.current, params.reverbDecay); } catch {/* */}
    }

    const delayOn = params.delayEnabled !== false;
    const dlyWet = delayOn ? params.delayWet : 0;
    if (dspDelayRef.current) dspDelayRef.current.delayTime.setValueAtTime(delayOn ? params.delayTime : 0, t);
    if (dspDelayFbRef.current) dspDelayFbRef.current.gain.setValueAtTime(delayOn ? params.delayFeedback : 0, t);
    if (dspDelayWetRef.current) dspDelayWetRef.current.gain.setValueAtTime(dlyWet, t);
    if (dspDelayDryRef.current) dspDelayDryRef.current.gain.setValueAtTime(1 - dlyWet, t);

    const warmthOn = params.warmthEnabled !== false;
    const warmAmt = warmthOn ? params.warmthAmount : 0;
    if (dspWarmthRef.current) dspWarmthRef.current.curve = makeWarmthCurve(warmAmt);
    if (dspWarmthWetRef.current) dspWarmthWetRef.current.gain.setValueAtTime(warmAmt, t);
    if (dspWarmthDryRef.current) dspWarmthDryRef.current.gain.setValueAtTime(1 - warmAmt, t);
  }, [audioCtxRef, generateImpulseResponse, makeWarmthCurve]);

  // Toggle DSP bypass — needs external refs passed in
  const toggleDspBypass = useCallback((
    micSourceRef: React.MutableRefObject<MediaStreamAudioSourceNode | null>,
    micGainRef: React.MutableRefObject<GainNode | null>,
    analyserRef: React.MutableRefObject<AnalyserNode | null>,
  ) => {
    setDspBypassed(prev => {
      const newBypassed = !prev;
      const ctx = audioCtxRef.current;
      const micSrc = micSourceRef.current;
      const micGain = micGainRef.current;
      const dspOut = dspOutputRef.current;
      if (!ctx || !micSrc || !micGain) return newBypassed;
      try { micSrc.disconnect(); } catch {/* */}
      if (newBypassed) {
        micSrc.connect(micGain);
        if (analyserRef.current) micSrc.connect(analyserRef.current);
      } else {
        if (dspHpRef.current) {
          micSrc.connect(dspHpRef.current);
          if (analyserRef.current && dspOut) dspOut.connect(analyserRef.current);
        } else { micSrc.connect(micGain); }
      }
      return newBypassed;
    });
  }, [audioCtxRef]);

  // DSP cleanup
  const cleanupDsp = useCallback(() => {
    if (dspGateRafRef.current) { cancelAnimationFrame(dspGateRafRef.current); dspGateRafRef.current = null; }
    const refs = [dspHpRef, dspLpRef, dspEqLowRef, dspEqMidRef, dspEqHighRef, dspCompRef, dspLimiterRef,
      dspGateGainRef, dspGateAnalyserRef, dspDeEsserBpRef, dspDeEsserGainRef,
      dspReverbConvRef, dspReverbWetRef, dspReverbDryRef,
      dspDelayRef, dspDelayFbRef, dspDelayWetRef, dspDelayDryRef,
      dspWarmthRef, dspWarmthWetRef, dspWarmthDryRef, dspOutputRef];
    for (const ref of refs) {
      try { (ref.current as AudioNode)?.disconnect(); } catch {/* */}
      (ref as React.MutableRefObject<AudioNode | null>).current = null;
    }
  }, []);

  // Reset DSP state
  const resetDsp = useCallback(() => {
    cleanupDsp();
    setDspBypassed(false);
    setDspParams(DEFAULT_DSP_PARAMS);
  }, [cleanupDsp]);

  return {
    dspParams, setDspParams,
    dspBypassed, setDspBypassed, dspBypassRef, dspOutputRef,
    buildDspChain, applyDspParams, toggleDspBypass, cleanupDsp, resetDsp,
  };
}
