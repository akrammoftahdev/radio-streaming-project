"use client";

import { useState, useRef, useEffect } from "react";
import { submitListenerMessage, checkMessagingStatus } from "./actions";

const COUNTRIES = [
  { code: "EG", name: "Egypt", flag: "🇪🇬" },
  { code: "SA", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "AE", name: "UAE", flag: "🇦🇪" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
  { code: "MA", name: "Morocco", flag: "🇲🇦" },
  { code: "DZ", name: "Algeria", flag: "🇩🇿" },
  { code: "TN", name: "Tunisia", flag: "🇹🇳" },
  { code: "QA", name: "Qatar", flag: "🇶🇦" },
  { code: "KW", name: "Kuwait", flag: "🇰🇼" },
  { code: "OM", name: "Oman", flag: "🇴🇲" },
  { code: "BH", name: "Bahrain", flag: "🇧🇭" },
  { code: "JO", name: "Jordan", flag: "🇯🇴" },
  { code: "LB", name: "Lebanon", flag: "🇱🇧" },
  { code: "TR", name: "Turkey", flag: "🇹🇷" },
  { code: "WW", name: "Other / Global", flag: "🌐" }
];

export default function ChatForm({ stationId, translations, colors, isMessagingEnabled }: any) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [cooldown, setCooldown] = useState(0);
  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const tl = translations;

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const isEnabled = await checkMessagingStatus(stationId);
      if (isEnabled !== isMessagingEnabled) {
        window.location.reload();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [stationId, isMessagingEnabled]);

  if (!isMessagingEnabled) {
    const bgColor = colors.bgColor || "#0f172a";
    const textColor = colors.textColor || "#ffffff";
    const borderColor = colors.borderColor || "#334155";
    
    return (
      <div style={{ background: bgColor, color: textColor, minHeight: "100vh", fontFamily: "'Cairo', sans-serif", padding: "24px", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <div style={{ border: `1px solid ${borderColor}`, padding: "24px", borderRadius: "12px", background: "rgba(0,0,0,0.2)" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>😴</div>
          <p style={{ margin: 0, fontWeight: "500", lineHeight: "1.5" }}>{translations.offlineMessage}</p>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (cooldown > 0) return;
    
    setStatus("submitting");
    const formData = new FormData(e.currentTarget);
    formData.append("stationId", stationId);
    if (selectedCountry) formData.set("country", selectedCountry); // Ensure the custom selected value is used
    
    try {
      const res = await submitListenerMessage(formData);
      if (res.success) {
        setStatus("success");
        formRef.current?.reset();
        setSelectedCountry("");
        setCountrySearch("");
        setCooldown(10);
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    } catch (err) {
      console.error(err);
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  // Use defined colors or fallback
  const bgColor = colors.bgColor || "#0f172a";
  const textColor = colors.textColor || "#ffffff";
  const borderColor = colors.borderColor || "#334155";
  const placeholderColor = colors.placeholderColor || "#94a3b8";

  // Quick style injection
  const css = `
    .chat-container { background: ${bgColor}; color: ${textColor}; min-height: 100vh; font-family: 'Cairo', sans-serif; padding: 16px; position: relative; }
    .chat-input { 
      background: rgba(0,0,0,0.1); 
      border: 1px solid ${borderColor}; 
      color: ${textColor}; 
      width: 100%; 
      padding: 10px 12px; 
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.2s;
    }
    .chat-input::placeholder { color: ${placeholderColor}; }
    .chat-input:focus { outline: none; border-color: ${textColor}; }
    .chat-label { font-size: 13px; font-weight: 600; margin-bottom: 4px; display: block; opacity: 0.9; }
    .chat-btn {
      background: ${textColor};
      color: ${bgColor};
      font-weight: bold;
      width: 100%;
      padding: 12px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .chat-btn:hover { opacity: 0.9; }
    .chat-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    
    /* Smart Dropdown Styles */
    .dropdown-container { position: relative; width: 100%; }
    .dropdown-header {
      background: rgba(0,0,0,0.1); border: 1px solid ${borderColor}; color: ${textColor};
      padding: 10px 12px; border-radius: 8px; font-size: 14px; cursor: pointer;
      display: flex; justify-content: space-between; align-items: center;
    }
    .dropdown-list {
      position: absolute; top: calc(100% + 4px); left: 0; right: 0;
      background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px;
      max-height: 200px; overflow-y: auto; z-index: 50; display: flex; flex-direction: column;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .dropdown-search {
      padding: 8px; border-bottom: 1px solid ${borderColor}; position: sticky; top: 0; background: ${bgColor}; z-index: 2;
    }
    .dropdown-search input {
      width: 100%; background: rgba(0,0,0,0.1); border: 1px solid ${borderColor};
      color: ${textColor}; padding: 6px 10px; border-radius: 6px; font-size: 13px; outline: none;
    }
    .dropdown-item {
      padding: 8px 12px; cursor: pointer; transition: background 0.1s; font-size: 14px;
    }
    .dropdown-item:hover { background: rgba(255,255,255,0.05); }
  `;

  const filteredCountries = COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()));
  const selectedCountryObj = COUNTRIES.find(c => c.name === selectedCountry);

  return (
    <div className="chat-container">
      <style>{css}</style>
      
      <div style={{ marginBottom: "16px", fontWeight: "bold", fontSize: "18px", borderBottom: `1px solid ${borderColor}`, paddingBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span>💬</span> {tl.title}
      </div>

      <form ref={formRef} onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label className="chat-label">{tl.name} *</label>
          <input name="senderName" className="chat-input" required />
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <label className="chat-label">{tl.phone}</label>
            <input name="phoneNumber" type="tel" className="chat-input" placeholder="+123..." dir="ltr" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="chat-label">{tl.country}</label>
            <div className="dropdown-container">
              <div className="dropdown-header" onClick={() => setIsCountryOpen(!isCountryOpen)}>
                <span>{selectedCountryObj ? `${selectedCountryObj.flag} ${selectedCountryObj.name}` : `-- ${tl.selectCountry || "Select Country"} --`}</span>
                <span style={{ fontSize: "10px" }}>▼</span>
              </div>
              {isCountryOpen && (
                <div className="dropdown-list">
                  <div className="dropdown-search">
                    <input 
                      type="text" 
                      placeholder="Search..." 
                      value={countrySearch} 
                      onChange={(e) => setCountrySearch(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {filteredCountries.length > 0 ? (
                    filteredCountries.map(c => (
                      <div 
                        key={c.code} 
                        className="dropdown-item"
                        onClick={() => {
                          setSelectedCountry(c.name);
                          setIsCountryOpen(false);
                          setCountrySearch("");
                        }}
                      >
                        {c.flag} {c.name}
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: "8px 12px", fontSize: "13px", opacity: 0.5 }}>No results</div>
                  )}
                </div>
              )}
            </div>
            {/* Hidden input to ensure it submits with the form if they don't use React state */}
            <input type="hidden" name="country" value={selectedCountry} />
          </div>
        </div>

        <div>
          <label className="chat-label">{tl.email}</label>
          <input name="email" type="email" className="chat-input" />
        </div>

        <div>
          <label className="chat-label">{tl.message} *</label>
          <textarea name="message" className="chat-input" rows={4} required style={{ resize: "none" }} />
        </div>

        <button type="submit" className="chat-btn" disabled={status === "submitting" || cooldown > 0}>
          {status === "submitting" ? "..." : cooldown > 0 ? `${tl.send || "Wait"} (${cooldown}s)` : tl.send}
        </button>

        {status === "success" && (
          <div style={{ background: "rgba(16, 185, 129, 0.1)", color: "#10b981", padding: "12px", borderRadius: "8px", fontSize: "14px", textAlign: "center", marginTop: "4px" }}>
            {tl.success}
          </div>
        )}
        
        {status === "error" && (
          <div style={{ background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", padding: "12px", borderRadius: "8px", fontSize: "14px", textAlign: "center", marginTop: "4px" }}>
            {tl.error}
          </div>
        )}
      </form>
    </div>
  );
}
