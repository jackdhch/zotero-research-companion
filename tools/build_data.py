"""生成研究伴读插件的数据文件 research-companion.json。
用法：python3 -I build_data.py 论文.json 机体清单.json 输出.json
- 论文.json：[{title, authors, year, venue, doi, url, paper_type, topics, is_nezha, seen_local, local_path, summary_zh, why_relevant_zh, verify?}]
- 机体清单.json：{items: [{id, title, what, priority, part, refs: [{title, doi, ...}]}]}
机体建议引用的文献若不在论文清单里，会补进去并打上「机体改进依据」。"""
import json, re, sys


def norm(s):
    return re.sub(r'[^a-z0-9一-龥]', '', (s or '').lower())


def ndoi(s):
    return re.sub(r'^https?://(dx\.)?doi\.org/', '', (s or '').strip().lower())


def build(papers, plan, collection='论文调研_261015'):
    by_doi = {ndoi(p['doi']): p for p in papers if p.get('doi')}
    by_title = {norm(p['title']): p for p in papers}
    airframe = {}
    for it in plan.get('items', []):
        airframe[it['id']] = {k: it.get(k, '') for k in ('title', 'what', 'priority', 'part')}
        for r in it.get('refs', []):
            p = by_doi.get(ndoi(r.get('doi'))) or by_title.get(norm(r.get('title')))
            if not p:
                p = {'title': r.get('title', ''), 'authors': r.get('authors', ''), 'year': r.get('year'),
                     'venue': r.get('venue', ''), 'doi': r.get('doi', ''), 'url': r.get('url', ''),
                     'paper_type': 'journal', 'topics': [], 'is_nezha': False, 'seen_local': False,
                     'local_path': '', 'summary_zh': r.get('note', ''), 'why_relevant_zh': '机体改进清单引用的文献'}
                papers.append(p)
                if p['doi']:
                    by_doi[ndoi(p['doi'])] = p
                by_title[norm(p['title'])] = p
            ids = p.setdefault('airframe_ids', [])
            if it['id'] not in ids:
                ids.append(it['id'])
    keep = ('title', 'authors', 'year', 'venue', 'doi', 'url', 'arxiv', 'paper_type', 'topics', 'is_nezha',
            'seen_local', 'local_path', 'summary_zh', 'why_relevant_zh', 'verify', 'airframe_ids')
    return {'collection': collection, 'airframe': airframe,
            'papers': [{k: p[k] for k in keep if p.get(k) not in (None, '', [])} for p in papers if p.get('title')]}


def demo():
    papers = [{'title': 'Nezha-F', 'doi': '10.1109/LRA.2023.3252343', 'topics': ['nezha']}]
    plan = {'items': [{'id': 'A1', 'title': 't', 'what': 'w', 'priority': 'P0', 'part': 'p',
                       'refs': [{'title': 'Nezha-F', 'doi': 'https://doi.org/10.1109/lra.2023.3252343'},
                                {'title': 'Wing-in-ground effect vehicles', 'doi': '10.1016/j.paerosci.2006.10.001'}]}]}
    out = build(papers, plan)
    assert out['papers'][0]['airframe_ids'] == ['A1']
    assert len(out['papers']) == 2 and out['papers'][1]['airframe_ids'] == ['A1']
    assert out['airframe']['A1']['priority'] == 'P0'
    print('demo ok')


if __name__ == '__main__':
    if len(sys.argv) == 1:
        demo()
    else:
        papers, plan = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
        out = build(papers, plan)
        json.dump(out, open(sys.argv[3], 'w', encoding='utf-8'), ensure_ascii=False)
        print(len(out['papers']), '篇；带机体建议的', sum(1 for p in out['papers'] if p.get('airframe_ids')), '篇')
