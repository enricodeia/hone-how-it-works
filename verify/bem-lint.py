"""BEM lint for this project: python3 verify/bem-lint.py
Checks index.html + src/styles.css + classes created in src/*.js against the conventions in styles.css:
 1 names are block / block__element / block--mod / block__element--mod (lowercase, hyphenated)
 2 no modifier without its base class on the same element
 3 every element class sits inside (or on) its block
 4 every CSS class selector exists in markup/JS (or is third-party), every markup class is styled or listed
 5 CSS: no cross-block descendant selectors except .page--* state rules and a block styling its own elements
 6 JS: no selecting by our own class names
"""
import re, sys, glob
from html.parser import HTMLParser
ROOT = __file__.rsplit('/verify/', 1)[0]
NAME = re.compile(r'^[a-z]+(-[a-z0-9]+)*(__[a-z]+(-[a-z0-9]+)*)?(--[a-z]+(-[a-z0-9]+)*)?$')
THIRD = re.compile(r'^(lenis|lenis-.*|svg-inline--fa|fa-.*)$')
problems = []

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.stack = []; self.used = {}
    def handle_starttag(self, tag, attrs):
        cls = dict(attrs).get('class', '')
        classes = cls.split() if cls else []
        void = tag in ('img', 'br', 'meta', 'link', 'input', 'rect', 'path')
        for c in classes:
            self.used[c] = self.used.get(c, 0) + 1
            if not NAME.match(c): problems.append(f'1 bad name: {c}')
            base = c.split('--')[0]
            if '--' in c and base not in classes: problems.append(f'2 modifier without base: {c} in "{cls}"')
            if '__' in c:
                block = c.split('__')[0]
                ancestors = {x for fr in self.stack for x in fr} | set(classes)
                if block not in ancestors: problems.append(f'3 element outside its block: {c} (ancestors lack .{block})')
        if not void: self.stack.append(classes)
    def handle_endtag(self, tag):
        if tag not in ('img', 'br', 'meta', 'link', 'input', 'rect', 'path') and self.stack: self.stack.pop()

html = open(f'{ROOT}/index.html').read()
p = P(); p.feed(html)
used = set(p.used)
# classes created by JS
js = ''.join(open(f).read() for f in glob.glob(f'{ROOT}/src/*.js'))
js_created = set(re.findall(r"className = '([^']+)'", js)) | set(re.findall(r"classList\.(?:add|toggle)\('([^']+)'(?:, '([^']+)')?", js) and
    [x for t in re.findall(r"classList\.(?:add|toggle)\('([^']+)'(?:,\s*'([^']+)')?", js) for x in t if x]) | set(re.findall(r"classes: \['([^']+)'\]", js))
# class names declared as plain string literals in JS (e.g. a table of modifier classes)
js_created |= {c for c in re.findall(r"'([a-z][a-z0-9-]*(?:__[a-z0-9-]+)?--[a-z0-9-]+|[a-z][a-z0-9-]*__[a-z0-9-]+)'", js)}
# no class name may be assembled at runtime: it could not be searched for, or checked here
for m in re.finditer(r"`[^`]*(?:__|--)\$\{[^`]*`", js): problems.append(f'6 class name built from a template string: {m.group(0)[:60]}')
for c in js_created:
    if not NAME.match(c) and not THIRD.match(c): problems.append(f'1 bad JS class name: {c}')
# CSS
css = open(f'{ROOT}/src/styles.css').read()
css_nc = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
selectors = []
for m in re.finditer(r'([^{}]+)\{', css_nc):
    head = m.group(1).strip()
    if head.startswith('@'): continue
    selectors += [x.strip() for x in head.split(',')]
css_classes = set()
for sel in selectors:
    for c in re.findall(r'\.([a-zA-Z][\w-]*)', sel): css_classes.add(c)
    # 5: descendant chains
    parts = [x for x in re.split(r'\s+|>', sel) if x]
    if len(parts) > 1:
        first = re.findall(r'\.([\w-]+)', parts[0])
        if first and all(f.startswith('page') for f in first): continue          # page state rules
        blocks = {re.findall(r'\.([\w-]+)', x)[0].split('__')[0].split('--')[0] for x in parts if re.findall(r'\.([\w-]+)', x)}
        if parts[0].startswith(('html', '*')): continue
        if len(blocks) > 1: problems.append(f'5 cross-block descendant selector: {sel}')
    # tag / attribute selectors on our own components
    if re.search(r'\[data-', sel): problems.append(f'5 attribute selector in CSS: {sel}')
for c in sorted(css_classes - used - js_created):
    if not THIRD.match(c): problems.append(f'4 CSS class not in markup/JS: .{c}')
unstyled = sorted(c for c in used if c not in css_classes)
# 6: JS selecting by class
for m in re.finditer(r"(querySelector(?:All)?|matches|closest|\$\$?)\(\s*['\"`]([^'\"`]*)['\"`]", js):
    if re.search(r'(^|[\s,>])\.[a-z]', m.group(2)): problems.append(f'6 JS selects by class: {m.group(0)}')
for m in re.finditer(r"classList\.contains\('([^']+)'\)", js): problems.append(f'6 JS reads a class: {m.group(0)}')

print(f'classes in markup: {len(used)} · in CSS: {len(css_classes)} · created by JS: {len(js_created)}')
print('unstyled markup classes (structural, intentionally):', ', '.join(unstyled) or 'none')
print('\n'.join(problems) if problems else 'BEM lint: 0 problems')
sys.exit(1 if problems else 0)
