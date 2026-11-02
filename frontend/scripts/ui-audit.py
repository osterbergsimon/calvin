#!/usr/bin/env python3
"""UI consistency audit (docs/design/audits/2026-10-31-frontend-audit.md).

Counts hand-rolled versions of shared patterns (buttons, inputs, cards, notices,
headings, overlays…) outside components/ui/, plus distinct z-index, shadow,
weight, duration and breakpoint values. Run from the repo root:

    python3 frontend/scripts/ui-audit.py ui-audit.json

The numbers should only go down as the frontend doctrine migration lands.
"""
import re,glob,os,json,collections,sys
ROOT='frontend/src'
files=[f for f in glob.glob(ROOT+'/**/*.vue',recursive=True) if '/dev/' not in f]
css=[f for f in glob.glob(ROOT+'/styles/*.css')]
def style_of(f):
    s=open(f).read()
    return ''.join(re.findall(r'<style[^>]*>(.*?)</style>',s,re.S)), s.split('<script')[0]
rules=[]  # (file, selector, {prop:val})
for f in files:
    st,_=style_of(f)
    st=re.sub(r'/\*.*?\*/','',st,flags=re.S)
    for m in re.finditer(r'([^{}@]+)\{([^{}]*)\}',st):
        sel=' '.join(m.group(1).split()); body=m.group(2)
        props={}
        for d in body.split(';'):
            if ':' in d:
                k,v=d.split(':',1); props[k.strip()]=' '.join(v.split())
        rules.append((os.path.relpath(f,ROOT),sel,props))
def inui(f): return f.startswith('components/ui/')
VIS={'background','background-color','border','border-radius','font-size','font-weight','color','padding','box-shadow'}
out={}
def cat(name, pred, need=VIS, min_props=2):
    hits=[(f,s,p) for f,s,p in rules if not inui(f) and pred(f,s,p) and len(VIS & set(p))>=min_props]
    sigs=collections.Counter(tuple(sorted((k,p[k]) for k in ('background','border','border-radius','padding','font-size','font-weight') if k in p)) for f,s,p in hits)
    filesset=sorted(set(f for f,_,_ in hits))
    out[name]={'rules':len(hits),'files':len(filesset),'distinct_looks':len(sigs),'file_list':filesset,'examples':[s for _,s,_ in hits[:12]]}
last=lambda s: s.split(',')[0].split()[-1] if s.split() else ''
cat('buttons', lambda f,s,p: re.search(r'(btn|button)(?![\w-]*(group|row|wrap|bar|cluster|s\b))',last(s)) or re.search(r'(^|\s)button\b',s))
cat('inputs', lambda f,s,p: re.search(r'\b(input|select|textarea)\b|(input|field|search)[\w-]*$',last(s)))
cat('cards_panels', lambda f,s,p: 'border' in p and 'border-radius' in p and ('background' in p or 'background-color' in p) and not re.search('btn|button|input|chip|tag|badge|pill',s), min_props=3)
cat('badges_chips', lambda f,s,p: re.search(r'(badge|chip|tag|pill)(?![\w-]*(s\b|list|wrap|row|group))',last(s)))
cat('empty_states', lambda f,s,p: re.search(r'empty',last(s)), min_props=1)
cat('notices_errors', lambda f,s,p: re.search(r'(error|warning|warn|notice|hint|banner|alert|success)',last(s)), min_props=1)
cat('headings', lambda f,s,p: re.search(r'(^|\s)h[1-6]\b|(title|heading|header)$',last(s)) and 'font-size' in p, min_props=1)
cat('modals_overlays', lambda f,s,p: p.get('position')=='fixed', min_props=0)
def distinct(prop, pred=lambda v: True):
    c=collections.Counter(p[prop] for f,s,p in rules if prop in p and pred(p[prop]))
    return c
z=distinct('z-index'); sh=distinct('box-shadow'); fw=distinct('font-weight'); tr=collections.Counter()
for f,s,p in rules:
    for k in ('transition',):
        if k in p:
            for d in re.findall(r'(\d*\.?\d+m?s\b|var\(--dur(?:-fast)?\))',p[k]): tr[d]+=1
media=collections.Counter()
for f in files+css:
    src=open(f).read()
    for m in re.findall(r'@media[^{]*\((?:max|min)-width:\s*([0-9.]+(?:px|rem|em))',src): media[m]+=1
    # The shared breakpoint names (src/styles/breakpoints.js), e.g. (--bp-phone).
    for m in re.findall(r'@media[^{]*?\((--bp-[\w-]+)\)',src): media[m]+=1
raw=collections.Counter()
for f,s,p in rules:
    for k in ('padding','margin','gap','row-gap','column-gap'):
        if k in p and re.search(r'\d(px|rem|em)',p[k]) and 'var(' not in p[k]: raw[k]+=1
emoji=collections.Counter(); emojifiles=collections.Counter()
for f in files:
    _,t=style_of(f)
    for e in re.findall(r'[\U0001F300-\U0001FAFF☀-➿]',t): emoji[e]+=1; emojifiles[os.path.relpath(f,ROOT)]+=1
natives={'<select':0,'type="number"':0,'type="checkbox"':0,'type="color"':0,'<textarea':0,'<input':0}
nativefiles=collections.defaultdict(set)
for f in files:
    if inui(os.path.relpath(f,ROOT)): continue
    _,t=style_of(f)
    for k in natives:
        n=t.count(k); natives[k]+=n
        if n: nativefiles[k].add(os.path.relpath(f,ROOT))
styleblocks=sum(1 for f in files if '<style' in open(f).read())
settings_style=[os.path.relpath(f,ROOT) for f in files if '/settings/' in f and '<style' in open(f).read()]
summary={k:{kk:vv for kk,vv in v.items() if kk!='file_list' and kk!='examples'} for k,v in out.items()}
summary.update({'z_index_values':dict(z),'box_shadow_distinct':len(sh),'font_weight_values':dict(fw),'transition_durations':dict(tr),'media_widths':dict(media),'raw_spacing_decls':dict(raw),'emoji_in_templates':sum(emoji.values()),'emoji_files':len(emojifiles),'native_controls_outside_ui':natives,'vue_files':len(files),'files_with_style':styleblocks,'settings_files_with_style':len(settings_style)})
json.dump({'summary':summary,'detail':out,'native_files':{k:sorted(v) for k,v in nativefiles.items()},'emoji_files':emojifiles.most_common(),'settings_style_files':settings_style,'shadows':sh.most_common()},open(sys.argv[1],'w'),indent=1,ensure_ascii=False)
print(json.dumps(summary,indent=1,ensure_ascii=False))
