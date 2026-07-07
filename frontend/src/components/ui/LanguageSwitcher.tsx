'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { SUPPORTED_LOCALES, LOCALE_NAMES, LOCALE_FLAGS, type Locale } from '@/i18n/config';
import { Globe, Search, Check, ChevronDown } from 'lucide-react';

interface LanguageSwitcherProps {
  compact?: boolean;
  className?: string;
}

export default function LanguageSwitcher({ compact = false, className = '' }: LanguageSwitcherProps) {
  const router = useRouter();
  const currentLocale = useLocale() as Locale;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filtered locales based on search
  const filteredLocales = SUPPORTED_LOCALES.filter((locale) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = LOCALE_NAMES[locale]?.toLowerCase() ?? '';
    const flag = LOCALE_FLAGS[locale] ?? '';
    return name.includes(query) || locale.toLowerCase().includes(query) || flag.includes(query);
  });

  // Open dropdown with animation
  const openDropdown = useCallback(() => {
    setIsOpen(true);
    setIsAnimating(true);
    setSearchQuery('');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsAnimating(false));
    });
  }, []);

  // Close dropdown with animation
  const closeDropdown = useCallback(() => {
    setIsAnimating(true);
    const timer = setTimeout(() => {
      setIsOpen(false);
      setIsAnimating(false);
      setSearchQuery('');
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  const toggleDropdown = useCallback(() => {
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }, [isOpen, openDropdown, closeDropdown]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && !isAnimating) {
      searchInputRef.current?.focus();
    }
  }, [isOpen, isAnimating]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (isOpen) closeDropdown();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, closeDropdown]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        closeDropdown();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeDropdown]);

  // Handle language selection
  const handleSelectLocale = async (locale: Locale) => {
    if (locale === currentLocale) {
      closeDropdown();
      return;
    }

    try {
      await fetch('/api/set-locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      // Full reload so the server layout re-renders with new dir/lang/font
      window.location.reload();
    } catch (error) {
      console.error('Failed to set locale:', error);
    }
  };

  const currentFlag = LOCALE_FLAGS[currentLocale] ?? '🌐';
  const currentName = LOCALE_NAMES[currentLocale] ?? currentLocale;

  // Determine dropdown animation state
  const dropdownVisible = isOpen && !isAnimating;
  const dropdownEntering = isOpen && isAnimating;
  const dropdownLeaving = !isOpen && isAnimating;

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={toggleDropdown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Switch language"
        className={`
          group flex items-center gap-1.5 rounded-lg
          bg-slate-800 border border-slate-700
          text-slate-300 transition-colors
          hover:bg-slate-700/50 hover:text-white
          focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:ring-offset-0
          ${compact ? 'p-1.5' : 'px-3 py-1.5'}
        `}
      >
        {compact ? (
          <Globe className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors duration-200" />
        ) : (
          <>
            <span className="text-sm leading-none">{currentFlag}</span>
            <span className="text-xs font-medium tracking-wide">{currentName}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-300 ${
                isOpen ? 'rotate-180' : 'rotate-0'
              }`}
            />
          </>
        )}
      </button>

      {/* Dropdown Panel */}
      {(isOpen || dropdownLeaving) && (
        <div
          role="listbox"
          aria-label="Select language"
          className={`
            absolute top-full mt-2 z-50
            ${compact ? 'right-0' : 'left-0'}
            w-64 max-h-[360px]
            rounded-xl overflow-hidden
            bg-gray-900/80 backdrop-blur-xl
            border border-white/10
            shadow-2xl shadow-black/40
            transition-all duration-200 ease-out origin-top
            ${dropdownVisible
              ? 'opacity-100 scale-100 translate-y-0'
              : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
            }
          `}
        >
          {/* Search Input */}
          <div className="p-2.5 border-b border-white/[0.06]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search language..."
                className="
                  w-full pl-9 pr-3 py-2 rounded-lg
                  bg-white/5 border border-white/[0.08]
                  text-sm text-white/90 placeholder-white/30
                  outline-none transition-all duration-200
                  focus:bg-white/[0.08] focus:border-violet-500/30
                  focus:ring-1 focus:ring-violet-500/20
                "
              />
            </div>
          </div>

          {/* Language List */}
          <div className="overflow-y-auto max-h-[280px] py-1.5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {filteredLocales.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-white/30">
                No languages found
              </div>
            ) : (
              filteredLocales.map((locale) => {
                const isActive = locale === currentLocale;
                const flag = LOCALE_FLAGS[locale] ?? '🌐';
                const name = LOCALE_NAMES[locale] ?? locale;

                return (
                  <button
                    key={locale}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => handleSelectLocale(locale)}
                    className={`
                      w-full flex items-center gap-3 px-3.5 py-2.5 mx-1.5
                      rounded-lg text-left transition-all duration-150 ease-out
                      ${isActive
                        ? 'bg-gradient-to-r from-violet-500/20 to-indigo-500/15 text-white border border-violet-500/20'
                        : 'text-white/75 hover:bg-white/10 hover:text-white border border-transparent'
                      }
                    `}
                    style={{ width: 'calc(100% - 12px)' }}
                  >
                    {/* Flag */}
                    <span className="text-xl leading-none shrink-0">{flag}</span>

                    {/* Language Name */}
                    <span className={`text-sm font-medium flex-1 ${isActive ? 'text-white' : ''}`}>
                      {name}
                    </span>

                    {/* Locale Code */}
                    <span className="text-[11px] font-mono text-white/25 uppercase tracking-wider shrink-0">
                      {locale}
                    </span>

                    {/* Checkmark for active */}
                    {isActive && (
                      <Check className="w-4 h-4 text-violet-400 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
