const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend/src/app/studio/studio-ui-v2.tsx');
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Add state variables
code = code.replace(
  /const \[isMicOpen, setIsMicOpen\] = useState\(false\);/,
  `const [isMicOpen, setIsMicOpen] = useState(false);\n  const [isGuestOnAir, setIsGuestOnAir] = useState(false);\n  const isVoiceLive = isMicOpen || isGuestOnAir;`
);

// 2. Queue logic & Background music logic (Lines 913-1140)
// Replace isMicOpen with isVoiceLive in specific places
const replaceInBlock = (startString, endString, replacer) => {
  const startIdx = code.indexOf(startString);
  const endIdx = code.indexOf(endString, startIdx) + endString.length;
  if (startIdx === -1 || endIdx === -1) {
    console.error("Could not find block for", startString);
    return;
  }
  let block = code.substring(startIdx, endIdx);
  block = replacer(block);
  code = code.substring(0, startIdx) + block + code.substring(endIdx);
};

// applyBgGain dependencies and ducking
replaceInBlock(
  'const applyBgGain = useCallback((reason: string, volumeOverride?: number) => {',
  '}, [isMicOpen]); // bgVolumeRef is a ref — always current without being a dep',
  (block) => block.replace(/isMicOpen/g, 'isVoiceLive')
);

// bg ducking mic toggle effect
replaceInBlock(
  '// Background ducking — mic open/close applies same formula',
  '}, [isMicOpen]);',
  (block) => block.replace(/isMicOpen/g, 'isVoiceLive')
);

// enqueueItem
replaceInBlock(
  'const enqueueItem = useCallback((',
  '}, [isMicOpen]);',
  (block) => block.replace(/isMicOpen/g, 'isVoiceLive')
);

// queue play/pause logic
replaceInBlock(
  '// Group 4.8 — Auto-resume / Auto-start when MIC CLOSES',
  '}, [isMicOpen]);',
  (block) => block.replace(/isMicOpen/g, 'isVoiceLive')
);

// 3. UI logic
// enqueue handlers
code = code.replace(/showFadeMessage\(isMicOpen \? t\('queue.willPlayAfterMic'\) : t\('queue.addedToQueue'\)\);/g, `showFadeMessage(isVoiceLive ? t('queue.willPlayAfterMic') : t('queue.addedToQueue'));`);
code = code.replace(/showFadeMessage\(isMicOpen \? t\('queue.willPlayAfterMic'\) : t\('queue.addedFileToQueue'\)\);/g, `showFadeMessage(isVoiceLive ? t('queue.willPlayAfterMic') : t('queue.addedFileToQueue'));`);
code = code.replace(/}, \[mediaQueue, enqueueItem, isMicOpen, showFadeMessage\]\);/g, `}, [mediaQueue, enqueueItem, isVoiceLive, showFadeMessage]);`);

// Ducked label
code = code.replace(/{bgVolume}%{isMicOpen \? \` \(\${t\('faders.ducked'\)}\)\` : ''}/g, `{bgVolume}%{isVoiceLive ? \` (\${t('faders.ducked')})\` : ''}`);

// Faders isMicOpen
code = code.replace(/{isMicOpen && \(\n *<div className="absolute inset-\[-4px\] rounded-2xl bg-amber-500\/10 border border-amber-500\/50 pointer-events-none animate-pulse"><\/div>\n *\)}/g, `{isVoiceLive && (\n                        <div className="absolute inset-[-4px] rounded-2xl bg-amber-500/10 border border-amber-500/50 pointer-events-none animate-pulse"></div>\n                      )}`);

// Media library policy
code = code.replace(/{isMicOpen \? MEDIA_POLICY\.SONG\.waitLabel : t\('library\.readyOnMicCloseSongs'\)}/g, `{isVoiceLive ? MEDIA_POLICY.SONG.waitLabel : t('library.readyOnMicCloseSongs')}`);
code = code.replace(/{isMicOpen \? MEDIA_POLICY\.BREAK\.waitLabel : t\('library\.readyOnMicCloseBreaks'\)}/g, `{isVoiceLive ? MEDIA_POLICY.BREAK.waitLabel : t('library.readyOnMicCloseBreaks')}`);
code = code.replace(/{isMicOpen \? MEDIA_POLICY\.AD\.waitLabel : t\('library\.readyOnMicCloseAds'\)}/g, `{isVoiceLive ? MEDIA_POLICY.AD.waitLabel : t('library.readyOnMicCloseAds')}`);

// Now playing
code = code.replace(/if \(isMicOpen && pausedItem\)/g, `if (isVoiceLive && pausedItem)`);
code = code.replace(/else if \(isMicOpen && activeBgTrack\)/g, `else if (isVoiceLive && activeBgTrack)`);
code = code.replace(/else if \(isMicOpen\)/g, `else if (isVoiceLive)`);

// Status card
code = code.replace(/isMicOpen \? t\('statusCard\.waitingMicForTitle'/g, `isVoiceLive ? t('statusCard.waitingMicForTitle'`);
code = code.replace(/{isMicOpen \? t\('queue\.micOpenWaiting'\) : t\('queue\.micClosedReady'\)}/g, `{isVoiceLive ? t('queue.micOpenWaiting') : t('queue.micClosedReady')}`);
code = code.replace(/{isConnected && !isMicOpen && mediaQueue/g, `{isConnected && !isVoiceLive && mediaQueue`);
code = code.replace(/isMicOpen={isMicOpen}/g, `isMicOpen={isVoiceLive}`);
code = code.replace(/\) : isMicOpen \? \(/g, `) : isVoiceLive ? (`);

// 4. Guest / Tab Audio Source UI Updates & Routing Update
// Volume hook routing
code = code.replace(
  /useEffect\(\(\) => {\n *if \(tabAudioGainRef\.current\) {\n *tabAudioGainRef\.current\.gain\.value = tabAudioVolume \/ 100;\n *}\n *}, \[tabAudioVolume\]\);/g,
  `useEffect(() => {\n    if (tabAudioGainRef.current) {\n      tabAudioGainRef.current.gain.value = isGuestOnAir ? (tabAudioVolume / 100) : 0;\n    }\n  }, [tabAudioVolume, isGuestOnAir]);`
);

// Tab Audio UI replacement
const tabAudioUiRegex = /<span className="text-xs font-semibold text-neutral-400">{t\('tabAudioTitle'\) \|\| 'Guest \/ Tab Audio'}<\/span>\s*<button onClick={isTabAudioActive \? stopTabAudio : startTabAudio}[\s\S]*?<\/button>\s*<\/div>/;
const tabAudioUiReplacement = `<span className="text-xs font-semibold text-neutral-400">{t('tabAudioTitle') || 'Guest / Tab Audio'}</span>
              <div className="flex items-center gap-2">
                {isTabAudioActive && (
                  <button onClick={() => setIsGuestOnAir(!isGuestOnAir)} className={\`text-[10px] px-2 py-1 rounded-lg border font-medium transition-colors flex items-center gap-1 \${isGuestOnAir ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-neutral-800 border-neutral-600 text-neutral-400 hover:text-neutral-200'}\`}>
                    <div className={\`w-1.5 h-1.5 rounded-full \${isGuestOnAir ? 'bg-red-400 animate-pulse' : 'bg-neutral-500'}\`}></div>
                    {isGuestOnAir ? 'GUEST ON AIR' : 'GUEST OFF AIR'}
                  </button>
                )}
                <button onClick={isTabAudioActive ? stopTabAudio : startTabAudio} className={\`text-[10px] px-2 py-1 rounded-lg border font-medium transition-colors \${isTabAudioActive ? 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'}\`}>
                  {isTabAudioActive ? 'Stop' : (t('startTabCapture') || 'Start Tab Capture')}
                </button>
              </div>
            </div>`;

code = code.replace(tabAudioUiRegex, tabAudioUiReplacement);

// 5. Update startTabAudio/stopTabAudio to handle Guest On Air state
code = code.replace(
  /const stopTabAudio = \(\) => {/g,
  `const stopTabAudio = () => {\n    setIsGuestOnAir(false);`
);
code = code.replace(
  /setIsTabAudioActive\(true\);\n *showFadeMessage\('Tab Audio Capture Started'\);/g,
  `setIsTabAudioActive(true);\n        setIsGuestOnAir(true);\n        showFadeMessage('Tab Audio Capture Started');`
);

fs.writeFileSync(filePath, code);
console.log("Patch applied successfully.");
