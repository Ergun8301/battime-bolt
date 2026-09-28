import re, json, os, subprocess, urllib.parse
here = os.path.dirname(os.path.abspath(__file__))
urls = set()
for f in ['css2-app.css', 'css2-full.css']:
    urls |= set(re.findall(r'url\((https://fonts\.gstatic\.com/[^)]+)\)', open(os.path.join(here, f)).read()))
mapping = {}
for u in sorted(urls):
    p = urllib.parse.urlparse(u).path  # /s/archivo/v25/xxx.woff2
    local = 'gstatic' + p.replace('/s/', '/', 1)
    dst = os.path.join(here, local)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if not os.path.exists(dst):
        subprocess.check_call(['curl', '-sS', '-o', dst, u])
    mapping[u] = 'fonts/' + local
APP = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap"
FULL = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700;800&display=swap"
route = {APP: 'fonts/css2-app.css', FULL: 'fonts/css2-full.css'}
# encoded variants (browser normalises ; and : but be generous)
for u, v in list(route.items()):
    route[u.replace(';', '%3B')] = v
route.update(mapping)
json.dump(route, open(os.path.join(here, 'route-map.json'), 'w'), indent=1)
# local fonts.css: same as css2-full with relative urls
css = open(os.path.join(here, 'css2-full.css')).read()
for u, v in mapping.items():
    css = css.replace(u, v.replace('fonts/', '', 1))
open(os.path.join(here, 'fonts.css'), 'w').write('/* Local copy of Google Fonts css2 (Archivo 400-900, JetBrains Mono 400-800). Paths relative to this file. */\n' + css)
print(len(mapping), 'woff2 files')
