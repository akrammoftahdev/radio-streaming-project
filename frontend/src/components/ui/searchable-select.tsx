"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check } from "lucide-react";

export interface Option {
  id: string;
  label: string;
  subLabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  noOptionsText?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "اختر...",
  searchPlaceholder = "ابحث...",
  noOptionsText = "لا توجد نتائج"
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.id === value);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    } else {
      setSearchQuery(""); // Clear search when closed
    }
  }, [isOpen]);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (opt.subLabel && opt.subLabel.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="relative w-full text-right" dir="rtl" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-neutral-950 border border-amber-500/30 text-neutral-200 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all cursor-pointer"
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`text-amber-500/70 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-neutral-900 border border-amber-500/20 rounded-xl shadow-2xl overflow-hidden backdrop-blur-xl">
          {/* Search Input */}
          <div className="p-2 border-b border-neutral-800 bg-neutral-950/50">
            <div className="relative">
              <Search
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs rounded-lg pr-9 pl-3 py-2 focus:outline-none focus:border-amber-500/40 transition-colors"
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {filteredOptions.length > 0 ? (
              <div className="p-1">
                {filteredOptions.map((opt) => {
                  const isSelected = opt.id === value;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        onChange(opt.id);
                        setIsOpen(false);
                      }}
                      className={`w-full text-right flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                        isSelected
                          ? "bg-amber-500/10 text-amber-400"
                          : "text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
                      }`}
                    >
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-sm font-medium">{opt.label}</span>
                        {opt.subLabel && (
                          <span className="text-[10px] text-neutral-500 font-mono" dir="ltr">
                            {opt.subLabel}
                          </span>
                        )}
                      </div>
                      {isSelected && <Check size={16} className="text-amber-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-neutral-500">
                {noOptionsText}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
