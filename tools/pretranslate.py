"""用订阅模型预翻译：把 Zotero 里导出的待翻段落切成小批，翻好后写成双语插件的缓存。
  切批：python3 -I pretranslate.py split 论文.to-translate.json 工作目录 [每批段数=40]
  合并：python3 -I pretranslate.py merge 论文.to-translate.json 工作目录
切批生成 工作目录/batch_NN.json（{"kind": "p"|"table", "texts": [...]}），译文放 batch_NN.zh.json（等长字符串数组）。
合并后在 PDF 旁边写 论文.bilingual.json（双语插件 reading-bilingual 1.6.3 的缓存格式，已有的条目保留）。"""
import json, os, sys, datetime


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
    print('demo ok')


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        demo()
    elif a[0] == 'split':
        print(split(a[1], a[2], int(a[3]) if len(a) > 3 else 40), '批')
    elif a[0] == 'merge':
        out, n, missing = merge(a[1], a[2])
        print(f'写入 {out}：新增 {n} 条；没翻完的批：{missing or "无"}')
