import json
import glob

files = glob.glob('./frontend/messages/*.json')
for f in files:
    with open(f, 'r') as file:
        data = json.load(file)
    
    if 'common' not in data:
        data['common'] = {}
        
    # Default to English if not present to prevent crashes
    if 'username' not in data['common']:
        data['common']['username'] = 'Username'
    if 'password' not in data['common']:
        data['common']['password'] = 'Password'
    if 'confirmPassword' not in data['common']:
        data['common']['confirmPassword'] = 'Confirm Password'
        
    with open(f, 'w') as file:
        json.dump(data, file, indent=2, ensure_ascii=False)
