# 研究伴读 for Zotero

Zotero 10 插件。它会在条目右侧栏用中文说明这篇论文讲了什么、和你的研究有什么关系、能支撑你哪一条改进计划；另外可以一键把一份论文调研清单导入成 Zotero 的分类和标签。

独立项目，与 Zotero 官方无关。

## 能做什么

- **右侧栏「研究伴读」**：选中一篇论文，就能看到它的主题标签、中文摘要、「和你的研究」说明、关联的改进建议（编号和优先级），以及本机 PDF 的路径。
- **工具 → 研究伴读 → 导入论文调研清单**：
  - 库里已有的条目（按 DOI 匹配，没有 DOI 就按标题）只补标签、放进分类，不会重复建条目；
  - 库里没有的才新建；
  - 本机有 PDF 的，挂一个链接附件；
  - 可以反复导入。核实状态变了，旧的「核实/…」标签会被换掉。
- **工具 → 研究伴读 → 重新读取数据文件**：改了数据文件之后，不用重启 Zotero 就能生效。
- **工具 → 研究伴读 → 导出选中论文的待翻段落**：见下文「配合双语阅读插件预翻译」。

## 安装

1. 到 [Releases](https://github.com/jackdhch/zotero-research-companion/releases) 下载 `.xpi`。
2. Zotero → 工具 → 插件 → 齿轮 → 从文件安装附加组件。

需要 Zotero 10。升级插件后请重启一次 Zotero，否则新加的菜单项会没有文字。

## 数据文件

插件读取 Zotero 数据目录下的 `research-companion.json`。可以用 `tools/build_data.py` 从论文清单和改进清单生成：

```bash
python3 -I tools/build_data.py 论文.json 改进清单.json research-companion.json
```

格式：

```json
{
  "collection": "论文调研",
  "airframe": { "A1": { "title": "…", "what": "…", "priority": "P0", "part": "…" } },
  "papers": [
    {
      "title": "…", "authors": "…", "year": 2023, "venue": "…", "doi": "10.…", "url": "…",
      "paper_type": "journal", "topics": ["wig", "morphing"], "is_nezha": false,
      "seen_local": true, "local_path": "/mnt/c/Users/me/Documents/a.pdf",
      "summary_zh": "讲了什么", "why_relevant_zh": "和你的研究",
      "verify": "verified", "airframe_ids": ["A1"]
    }
  ]
}
```

- `topics` 可选的值见 `content/lib.js` 里的 `TOPICS`。
- `verify` 可选 `verified`、`corrected`、`not_found`、`needs_manual`。
- `local_path` 可以写 Windows 路径，也可以写 WSL 路径（`/mnt/c/…`，或 `/home/…`，后者按发行版名 Ubuntu 换算）。

## 配合双语阅读插件预翻译（可选）

[zotero-reading-bilingual](https://github.com/tianlrz/zotero-reading-bilingual) 会把译文缓存在 PDF 旁边的 `xxx.bilingual.json` 里。用下面的流程可以拿任意模型提前翻好，之后打开论文时直接读缓存，不再联网：

1. 在双语插件设置里关掉「进入阅读模式时自动翻译」。
2. 选中几篇论文（或者点开一个分类），点「工具 → 研究伴读 → 导出选中论文的待翻段落」。插件会逐篇打开 PDF、切到阅读模式，让双语插件按它自己的规则挑出还没有译文的段落和表格，写到 `xxx.to-translate.json`，并在 Zotero 数据目录的 `research-companion-translate-queue.json` 里记一笔。整个过程不调用任何翻译接口。扫描版 PDF 出不了阅读模式，会被跳过。
3. `python3 -I tools/pretranslate.py prep 队列.json 工作目录`：每篇切成小批，每 5 篇一组。
4. 每组交给一个翻译代理，代理按 `tools/translate_prompt.md` 的规则，把每个 `batch_NN.json` 译成 `batch_NN.zh.json`。
5. `python3 -I tools/pretranslate.py merge-all 工作目录`：把译文写进各篇的 `xxx.bilingual.json`，翻完的论文从队列里删掉。

导出功能用到了双语插件 1.6.3 的内部函数，双语插件升级后可能需要跟着改。

## 测试

```bash
node test_lib.js && node test_rc.js
python3 -I tools/build_data.py
python3 -I tools/pretranslate.py
```

## English

Zotero 10 plugin. It adds an item-pane section that explains, in Chinese, what a paper is about, how it relates to your own research, and which planned changes it supports. It also imports a literature-survey list as collections and tags without duplicating existing items. Not affiliated with Zotero.

## License

MIT
