import json
import urllib.request
import urllib.parse
import time
import re

def translate_text(text, source_lang='en', target_lang='it'):
    if not isinstance(text, str):
        return text
    if text.strip() == "":
        return text

    # Extract dynamic variables like {name} so they don't get translated
    variables = re.findall(r'\{[^}]+\}', text)
    placeholder_text = text
    for i, var in enumerate(variables):
        placeholder_text = placeholder_text.replace(var, f"__VAR{i}__")

    url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={source_lang}&tl={target_lang}&dt=t&q={urllib.parse.quote(placeholder_text)}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(req)
        result = json.loads(response.read().decode())
        translated = "".join([x[0] for x in result[0] if x[0]])
        
        # Restore variables
        for i, var in enumerate(variables):
            translated = translated.replace(f"__VAR{i}__", var)
        
        return translated
    except Exception as e:
        print(f"Error translating: {text}")
        return text

def traverse_and_translate(d):
    if isinstance(d, dict):
        new_d = {}
        for k, v in d.items():
            new_d[k] = traverse_and_translate(v)
            time.sleep(0.05) # small delay to prevent rate limit
        return new_d
    elif isinstance(d, list):
        return [traverse_and_translate(x) for x in d]
    elif isinstance(d, str):
        print(f"Translating: {d[:30]}...")
        return translate_text(d)
    else:
        return d

with open('frontend/messages/en.json', 'r', encoding='utf-8') as f:
    en_data = json.load(f)

it_data = traverse_and_translate(en_data)

with open('frontend/messages/it.json', 'w', encoding='utf-8') as f:
    json.dump(it_data, f, ensure_ascii=False, indent=2)

print("Translation to Italian complete!")
