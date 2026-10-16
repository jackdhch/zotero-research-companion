// 在 Zotero「工具 → 开发者 → Run JavaScript」里运行（勾选 Run as async function）。
// 作用：让双语插件按它自己的规则挑出当前论文要翻的段落和表格，导出到 PDF 旁边的 xxx.to-translate.json。
// 全程不调用任何翻译接口；已经翻过（有缓存）的段落不会导出。
const RB = Zotero.ReadingBilingual;
const r = Zotero.Reader.getByTabID(Zotero.getMainWindow().Zotero_Tabs.selectedID);
if (!RB || !r) return "请先打开一篇论文，并切到阅读模式";
const doc = RB.getRealContentDoc(r);
const paras = [], tables = [], keep = {};
const names = ["callOpenAIBatch", "callGeminiBatch", "callModelText", "translateTableBlock", "translateTocBlock", "translateRoadmapTogether"];
for (const k of names) keep[k] = RB[k];
RB.callOpenAIBatch = RB.callGeminiBatch = async (t) => { paras.push(...t); throw new Error("仅导出"); };
RB.callModelText = async () => { throw new Error("仅导出"); };
RB.translateTableBlock = async (b) => { if (b?.text) tables.push(b.text); };
RB.translateTocBlock = RB.translateRoadmapTogether = async () => {};
try {
  await RB.translateReader(r, doc, true, false);
}
finally {
  await new Promise((ok) => setTimeout(ok, 3000)); // 等侧栏目录翻译那条异步调用也撞上假接口
  Object.assign(RB, keep);
  doc.querySelectorAll(".zotero-bilingual-card").forEach((c) => { if (/仅导出/.test(c.textContent)) c.remove(); });
}
const out = (await RB.getCacheFilePath(r)).replace(/\.bilingual\.json$/, ".to-translate.json");
await IOUtils.writeUTF8(out, JSON.stringify({ itemID: r.itemID, paragraphs: paras, tables }, null, 1));
return `已导出 ${paras.length} 段正文、${tables.length} 张表格 → ${out}`;
