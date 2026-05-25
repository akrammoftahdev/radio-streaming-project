import os
import glob

def replace_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Replacements
    content = content.replace('"/stream/api', '"/api')
    content = content.replace('"/stream/studio', '"/studio')
    content = content.replace('"/stream/admin', '"/admin')
    content = content.replace('"/stream/login', '"/login')
    content = content.replace('"/stream/station-manager', '"/station-manager')
    content = content.replace('basePath="/stream/api/auth"', 'basePath="/api/auth"')
    content = content.replace('const BASE = "/stream";', 'const BASE = "";')
    content = content.replace('"/stream"', '""') # generic fallback

    with open(filepath, 'w') as f:
        f.write(content)

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            replace_in_file(os.path.join(root, file))

