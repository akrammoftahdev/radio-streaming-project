import sys
import re

file_path = "frontend/src/app/studio/studio-ui-v2.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Add state variables
code = code.replace(
    "const [isMicOpen, setIsMicOpen] = useState(false);",
    "const [isMicOpen, setIsMicOpen] = useState(false);\n  const [isGuestOnAir, setIsGuestOnAir] = useState(false);\n  const isVoiceLive = isMicOpen || isGuestOnAir;"
)

def replace_in_block(start_str, end_str, replace_func):
    global code
    start_idx = code.find(start_str)
    if start_idx == -1:
        print(f"Start string not found: {start_str}")
        return
    end_idx = code.find(end_str, start_idx)
    if end_idx == -1:
        print(f"End string not found: {end_str}")
        return
    end_idx += len(end_str)
    
    block = code[start_idx:end_idx]
    new_block = replace_func(block)
    code = code[:start_idx] + new_block + code[end_idx:]

# applyBgGain
replace_in_block(
    "const applyBgGain = useCallback((reason: string, volumeOverride?: number) => {",
    "}, [isMicOpen]); // bgVolumeRef is a ref",
    lambda b: b.replace("isMicOpen", "isVoiceLive")
)

# bg ducking mic toggle effect
replace_in_block(
    "// Background ducking — mic open/close applies same formula",
    "}, [isMicOpen]);",
    lambda b: b.replace("isMicOpen", "isVoiceLive")
)

# enqueueItem
replace_in_block(
    "const enqueueItem = useCallback((",
    "}, [isMicOpen]);",
    lambda b: b.replace("isMicOpen", "isVoiceLive")
)

# queue play/pause logic
replace_in_block(
    "// Group 4.6 / 4.10 — Mic-priority queue management",
    "}, [isMicOpen]);",
    lambda b: b.replace("isMicOpen", "isVoiceLive")
)

# UI logic replaces
code = code.replace("showFadeMessage(isMicOpen ? t('queue.willPlayAfterMic') : t('queue.addedToQueue'));", "showFadeMessage(isVoiceLive ? t('queue.willPlayAfterMic') : t('queue.addedToQueue'));")
code = code.replace("showFadeMessage(isMicOpen ? t('queue.willPlayAfterMic') : t('queue.addedFileToQueue'));", "showFadeMessage(isVoiceLive ? t('queue.willPlayAfterMic') : t('queue.addedFileToQueue'));")
code = code.replace("}, [mediaQueue, enqueueItem, isMicOpen, showFadeMessage]);", "}, [mediaQueue, enqueueItem, isVoiceLive, showFadeMessage]);")

code = code.replace("{bgVolume}%{isMicOpen ? ` (${t('faders.ducked')})` : ''}", "{bgVolume}%{isVoiceLive ? ` (${t('faders.ducked')})` : ''}")

code = code.replace("{isMicOpen && (\n                        <div className=\"absolute inset-[-4px] rounded-2xl bg-amber-500/10 border border-amber-500/50 pointer-events-none animate-pulse\"></div>\n                      )}", "{isVoiceLive && (\n                        <div className=\"absolute inset-[-4px] rounded-2xl bg-amber-500/10 border border-amber-500/50 pointer-events-none animate-pulse\"></div>\n                      )}")

code = code.replace("{isMicOpen ? MEDIA_POLICY.SONG.waitLabel : t('library.readyOnMicCloseSongs')}", "{isVoiceLive ? MEDIA_POLICY.SONG.waitLabel : t('library.readyOnMicCloseSongs')}")
code = code.replace("{isMicOpen ? MEDIA_POLICY.BREAK.waitLabel : t('library.readyOnMicCloseBreaks')}", "{isVoiceLive ? MEDIA_POLICY.BREAK.waitLabel : t('library.readyOnMicCloseBreaks')}")
code = code.replace("{isMicOpen ? MEDIA_POLICY.AD.waitLabel : t('library.readyOnMicCloseAds')}", "{isVoiceLive ? MEDIA_POLICY.AD.waitLabel : t('library.readyOnMicCloseAds')}")

code = code.replace("if (isMicOpen && pausedItem)", "if (isVoiceLive && pausedItem)")
code = code.replace("else if (isMicOpen && activeBgTrack)", "else if (isVoiceLive && activeBgTrack)")
code = code.replace("else if (isMicOpen)", "else if (isVoiceLive)")

code = code.replace("isMicOpen ? t('statusCard.waitingMicForTitle'", "isVoiceLive ? t('statusCard.waitingMicForTitle'")
code = code.replace("{isMicOpen ? t('queue.micOpenWaiting') : t('queue.micClosedReady')}", "{isVoiceLive ? t('queue.micOpenWaiting') : t('queue.micClosedReady')}")
code = code.replace("{isConnected && !isMicOpen && mediaQueue", "{isConnected && !isVoiceLive && mediaQueue")
code = code.replace("isMicOpen={isMicOpen}", "isMicOpen={isVoiceLive}")
code = code.replace(") : isMicOpen ? (", ") : isVoiceLive ? (")

# Routing Update
code = code.replace(
    "useEffect(() => {\n    if (tabAudioGainRef.current) {\n      tabAudioGainRef.current.gain.value = tabAudioVolume / 100;\n    }\n  }, [tabAudioVolume]);",
    "useEffect(() => {\n    if (tabAudioGainRef.current) {\n      tabAudioGainRef.current.gain.value = isGuestOnAir ? (tabAudioVolume / 100) : 0;\n    }\n  }, [tabAudioVolume, isGuestOnAir]);"
)

# Tab Audio UI replacement
tab_ui_search = """<span className="text-xs font-semibold text-neutral-400">{t('tabAudioTitle') || 'Guest / Tab Audio'}</span>
              <button onClick={isTabAudioActive ? stopTabAudio : startTabAudio} className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-colors ${isTabAudioActive ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'}`}>
                {isTabAudioActive ? t('stopTabCapture') || 'Stop Tab Capture' : t('startTabCapture') || 'Start Tab Capture'}
              </button>
            </div>"""

tab_ui_replace = """<span className="text-xs font-semibold text-neutral-400">{t('tabAudioTitle') || 'Guest / Tab Audio'}</span>
              <div className="flex items-center gap-2">
                {isTabAudioActive && (
                  <button onClick={() => setIsGuestOnAir(!isGuestOnAir)} className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-colors flex items-center gap-1 ${isGuestOnAir ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'bg-neutral-800 border-neutral-600 text-neutral-400 hover:text-neutral-200'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${isGuestOnAir ? 'bg-red-400 animate-pulse' : 'bg-neutral-500'}`}></div>
                    {isGuestOnAir ? 'GUEST ON AIR' : 'GUEST OFF AIR'}
                  </button>
                )}
                <button onClick={isTabAudioActive ? stopTabAudio : startTabAudio} className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-colors ${isTabAudioActive ? 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'}`}>
                  {isTabAudioActive ? 'Stop' : (t('startTabCapture') || 'Start Tab Capture')}
                </button>
              </div>
            </div>"""

if tab_ui_search in code:
    code = code.replace(tab_ui_search, tab_ui_replace)
else:
    print("Could not find tab_ui_search block")

code = code.replace(
    "const stopTabAudio = () => {\n    setIsTabAudioActive(false);",
    "const stopTabAudio = () => {\n    setIsGuestOnAir(false);\n    setIsTabAudioActive(false);"
)

code = code.replace(
    "setIsTabAudioActive(true);\n        showFadeMessage('Tab Audio Capture Started');",
    "setIsTabAudioActive(true);\n        setIsGuestOnAir(true);\n        showFadeMessage('Tab Audio Capture Started');"
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(code)

print("Patch script finished.")
