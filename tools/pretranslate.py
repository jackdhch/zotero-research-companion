"""用订阅模型预翻译：把 Zotero 里导出的待翻段落切成小批，翻好后写成双语插件的缓存。
  整个队列（研究伴读菜单「导出选中论文的待翻段落」生成的 research-companion-translate-queue.json）：
    python3 -I pretranslate.py prep 队列.json 工作根目录 [每组篇数=5]   → 工作根目录/groups.json，每组交给一个翻译代理
    python3 -I pretranslate.py merge-all 工作根目录                      → 写缓存，翻完的从队列里删掉
  单篇：
    python3 -I pretranslate.py split 论文.to-translate.json 工作目录 [每批段数=40]
    python3 -I pretranslate.py merge 论文.to-translate.json 工作目录
切批生成 工作目录/batch_NN.json（{"kind": "p"|"table", "texts": [...]}），译文放 batch_NN.zh.json（等长字符串数组）。
合并后在 PDF 旁边写 论文.bilingual.json（双语插件 reading-bilingual 1.6.3 的缓存格式，已有的条目保留）。"""
import json, os, re, sys, datetime, hashlib


def split(src, work, size=40):
    d = json.load(open(src, encoding='utf-8'))
    os.makedirs(work, exist_ok=True)
    jobs = [('p', d['paragraphs'][i:i + size]) for i in range(0, len(d['paragraphs']), size)]
    jobs += [('table', d['tables'][i:i + 10]) for i in range(0, len(d.get('tables', [])), 10)]
    for n, (kind, texts) in enumerate(jobs):
        json.dump({'kind': kind, 'texts': texts}, open(f'{work}/batch_{n:02d}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return len(jobs)


def merge(src, work, model='claude-sonnet-5-5'):
    d = json.load(open(src, encoding='utf-8'))
    new, missing = {}, []
    for f in sorted(x for x in os.listdir(work) if x.startswith('batch_') and not x.endswith('.zh.json')):
        texts = json.load(open(f'{work}/{f}', encoding='utf-8'))['texts']
        zh_path = f'{work}/{f[:-5]}.zh.json'
        zh = json.load(open(zh_path, encoding='utf-8')) if os.path.exists(zh_path) else []
        if len(zh) != len(texts):
            missing.append(f)
            continue
        new.update({t: z for t, z in zip(texts, zh) if z and z.strip()})
    out = src[:-len('.to-translate.json')] + '.bilingual.json'
    old = json.load(open(out, encoding='utf-8')) if os.path.exists(out) else {}
    merged = {**old.get('translations', {}), **new}
    json.dump({'version': 1, 'itemID': d.get('itemID'), 'model': model,
               'updatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'translations': merged},
              open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    return out, len(new), missing


def wsl(p):
    """Windows 路径换成 WSL 路径；已经是 Linux 路径的原样返回。"""
    m = re.match(r'^\\\\wsl(?:\.localhost|\$)\\[^\\]+(\\.*)$', p, re.I)
    if m:
        return m[1].replace('\\', '/')
    m = re.match(r'^([A-Za-z]):\\(.*)$', p)
    return f'/mnt/{m[1].lower()}/' + m[2].replace('\\', '/') if m else p


def prep(queue_path, root, per_group=5, size=120):
    queue = json.load(open(queue_path, encoding='utf-8'))
    os.makedirs(root, exist_ok=True)
    index = []
    for q in queue:
        src = wsl(q['path'])
        if not os.path.exists(src):
            continue
        work = f"{root}/{hashlib.md5(src.encode()).hexdigest()[:10]}"
        if not os.path.isdir(work):
            split(src, work, size)
        index.append({'src': src, 'work': work, 'title': os.path.basename(src)[:-len('.to-translate.json')]})
    groups = [index[i:i + per_group] for i in range(0, len(index), per_group)]
    json.dump({'queue': queue_path, 'papers': index, 'groups': groups},
              open(f'{root}/groups.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return len(index), len(groups)


def merge_all(root):
    g = json.load(open(f'{root}/groups.json', encoding='utf-8'))
    done, report = set(), []
    for p in g['papers']:
        out, n, missing = merge(p['src'], p['work'])
        report.append((p['title'], n, missing))
        if not missing:
            done.add(p['src'])
    queue = json.load(open(g['queue'], encoding='utf-8'))
    queue = [q for q in queue if wsl(q['path']) not in done]
    json.dump(queue, open(g['queue'], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return report, len(queue)


def demo():
    import tempfile
    t = tempfile.mkdtemp()
    src = f'{t}/a.to-translate.json'
    json.dump({'itemID': 7, 'paragraphs': ['p1', 'p2', 'p3'], 'tables': ['t1']}, open(src, 'w'))
    json.dump({'version': 1, 'translations': {'old': '旧'}}, open(f'{t}/a.bilingual.json', 'w'))
    assert split(src, f'{t}/w', 2) == 3
    json.dump(['段一', '段二'], open(f'{t}/w/batch_00.zh.json', 'w'))
    json.dump(['表一'], open(f'{t}/w/batch_02.zh.json', 'w'))
    out, n, missing = merge(src, f'{t}/w')
    c = json.load(open(out))
    assert n == 3 and missing == ['batch_01.json'], (n, missing)
    assert c['translations'] == {'old': '旧', 'p1': '段一', 'p2': '段二', 't1': '表一'} and c['itemID'] == 7
    assert wsl('C:\\Users\\me\\a b.pdf') == '/mnt/c/Users/me/a b.pdf'
    assert wsl('\\\\wsl.localhost\\Ubuntu\\home\\me\\x.json') == '/home/me/x.json'
    assert wsl('/home/me/x.json') == '/home/me/x.json'
    # 队列：两篇，一篇翻完、一篇没翻完
    srcs = []
    for name in ('b', 'c'):
        f = f'{t}/{name}.to-translate.json'
        json.dump({'itemID': 1, 'paragraphs': ['x' + name], 'tables': []}, open(f, 'w'))
        srcs.append(f)
    qp = f'{t}/queue.json'
    json.dump([{'path': f} for f in srcs] + [{'path': f'{t}/gone.to-translate.json'}], open(qp, 'w'))
    assert prep(qp, f'{t}/root', 5) == (2, 1)
    g = json.load(open(f'{t}/root/groups.json'))
    json.dump(['译b'], open(g['papers'][0]['work'] + '/batch_00.zh.json', 'w'))
    report, left = merge_all(f'{t}/root')
    assert [r[1] for r in report] == [1, 0] and left == 2, (report, left)  # c 没翻完、gone 文件不在，都留在队列
    assert json.load(open(f'{t}/b.bilingual.json'))['translations'] == {'xb': '译b'}
    print('demo ok')


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        demo()
    elif a[0] == 'split':
        print(split(a[1], a[2], int(a[3]) if len(a) > 3 else 40), '批')
    elif a[0] == 'prep':
        n, k = prep(a[1], a[2], int(a[3]) if len(a) > 3 else 5)
        print(f'{n} 篇，分 {k} 组；清单在 {a[2]}/groups.json')
    elif a[0] == 'merge-all':
        report, left = merge_all(a[1])
        for title, n, missing in report:
            print(f'{"✓" if not missing else "…"} {title}：新增 {n} 条' + (f'，没翻完 {missing}' if missing else ''))
        print('队列剩', left, '篇')
    elif a[0] == 'merge':
        out, n, missing = merge(a[1], a[2])
        print(f'写入 {out}：新增 {n} 条；没翻完的批：{missing or "无"}')
