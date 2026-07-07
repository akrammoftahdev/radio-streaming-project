import json
import re
import os
import hashlib

def slugify(text):
    text = re.sub(r'[^a-zA-Z0-9\s]', '', text)
    words = text.strip().split()
    if not words: return "key_" + os.urandom(4).hex()
    slug = words[0].lower() + ''.join(w.capitalize() for w in words[1:6])
    return slug

with open('translations.json', 'r') as f:
    translations = json.load(f)

with open('arabic_files.json', 'r') as f:
    files = json.load(f)

# Load existing i18n
en_path = "frontend/messages/en.json"
ar_path = "frontend/messages/ar.json"
with open(en_path, "r") as f: en_json = json.load(f)
with open(ar_path, "r") as f: ar_json = json.load(f)

if "admin" not in en_json: en_json["admin"] = {"messages": {}}
if "admin" not in ar_json: ar_json["admin"] = {"messages": {}}
if "messages" not in en_json["admin"]: en_json["admin"]["messages"] = {}
if "messages" not in ar_json["admin"]: ar_json["admin"]["messages"] = {}

def get_key(arabic_text):
    arabic_text = arabic_text.strip()
    en_text = translations.get(arabic_text)
    if not en_text:
        en_text = "Translated: " + arabic_text
        print(f"Warning: Missing translation for '{arabic_text}'")
    slug = slugify(en_text)
    
    # Store in json
    en_json["admin"]["messages"][slug] = en_text
    ar_json["admin"]["messages"][slug] = arabic_text
    return f"admin.messages.{slug}"

def patch_file(filepath):
    with open(filepath, "r") as f:
        content = f.read()

    # Determine type
    is_server_action = '"use server"' in content or "'use server'" in content
    is_client = '"use client"' in content or "'use client'" in content
    is_tsx = filepath.endswith('.tsx')
    
    has_arabic = bool(re.search(r'[\u0600-\u06FF]', content))
    if not has_arabic: return
    
    # Extract string literals and JSX text containing Arabic
    # We will replace them one by one.
    
    # Replace JSX Text (e.g. >مرحبا<)
    def jsx_text_replacer(match):
        prefix = match.group(1)
        arabic = match.group(2)
        suffix = match.group(3)
        key = get_key(arabic)
        return f"{prefix}{{t('{key}')}}{suffix}"
    
    content = re.sub(r'(>)([\s]*[\u0600-\u06FF][^<]*[\u0600-\u06FFa-zA-Z0-9.,!? ]*)(<)', jsx_text_replacer, content)

    # Replace String literals ("..." or '...' or `...`)
    def string_replacer(match):
        quote = match.group(1)
        text = match.group(2)
        if not re.search(r'[\u0600-\u06FF]', text):
            return match.group(0) # no arabic
        key = get_key(text)
        
        # If it's an attribute like placeholder="مرحبا", we need to change it to placeholder={t('key')}
        # Wait, the regex won't know if it's an attribute.
        # It's safer to just replace "مرحبا" with t("key")
        # But for attributes: we can do a second pass or handle it based on context.
        return f"t('{key}')"
        
    # We need to be careful with template literals containing variables.
    # e.g. `فشل الحذف: ${msg.slice(0, 150)}` -> this is tricky.
    # Let's handle exact known strings by replacing them in the content directly!
    
    # Let's sort translations by length descending to replace longest first
    items = sorted(translations.items(), key=lambda x: len(x[0]), reverse=True)
    
    for ar_str, en_str in items:
        if ar_str not in content: continue
        key = get_key(ar_str)
        # Check if it's inside quotes: "ar_str" -> t("key")
        content = content.replace(f'"{ar_str}"', f't("{key}")')
        content = content.replace(f"'{ar_str}'", f't("{key}")')
        content = content.replace(f"`{ar_str}`", f't("{key}")')
        # Check if it's JSX text: >ar_str< -> >{t("key")}<
        # This might overlap, so we do it carefully.
        # Actually, since it's just strings, replacing `"ar_str"` first covers JS strings.
        # Then replace `ar_str` if it's alone (like in JSX).
        # We can use a regex to find ar_str not inside quotes.
        content = re.sub(rf'(>[\s]*){re.escape(ar_str)}([\s]*<)', rf'\1{{t("{key}")}}\2', content)

    # Now inject imports and hooks
    if 'useTranslations' not in content and 'getTranslations' not in content:
        if is_server_action:
            content = re.sub(r'("use server";|' + "'use server';" + r')\n', '\\1\nimport { getTranslations } from "next-intl/server";\n', content)
            # Inject const t = await getTranslations("admin.messages"); inside exported async functions
            content = re.sub(r'(export\s+async\s+function\s+\w+\s*\([^)]*\)\s*{)', 
                             '\\1\n  const t = await getTranslations("admin.messages");', content)
        elif is_client or is_tsx:
            if is_client:
                content = re.sub(r'("use client";|' + "'use client';" + r')\n', '\\1\nimport { useTranslations } from "next-intl";\n', content)
            else:
                # server component
                content = 'import { getTranslations } from "next-intl/server";\n' + content
                
            # Inject hook inside the main component function.
            # Usually export default function Component() {
            if is_client:
                content = re.sub(r'(export\s+(default\s+)?function\s+\w+\s*\([^)]*\)\s*{)', 
                                '\\1\n  const t = useTranslations("admin.messages");', content)
            else:
                content = re.sub(r'(export\s+(default\s+)?async\s+function\s+\w+\s*\([^)]*\)\s*{)', 
                                '\\1\n  const t = await getTranslations("admin.messages");', content)

    with open(filepath, "w") as f:
        f.write(content)

for file in files:
    patch_file(file)

with open(en_path, "w") as f: json.dump(en_json, f, indent=2, ensure_ascii=False)
with open(ar_path, "w") as f: json.dump(ar_json, f, indent=2, ensure_ascii=False)

print("Patching complete!")
