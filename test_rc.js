// node test_rc.js —— 用假 Zotero 跑一遍导入和右侧栏查找，检查不重复建条目、标签分类正确
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

// Zotero 安装时强制要求的三项（Extension.sys.mjs:1875-1882），少一项就装不上
const mf = require("./manifest.json").applications.zotero;
for (const k of ["id", "update_url", "strict_max_version"]) assert.ok(mf[k], "manifest 缺 " + k);

let nextID = 100, items = new Map(), atts = new Map(), collections = [];
class Item {
  constructor(type) { this.itemType = type; this.fields = {}; this.tags = new Set(); this.cols = new Set(); this.creators = []; this.atts = []; }
  isRegularItem() { return true; }
  isPDFAttachment() { return false; }
  getField(f) { return this.fields[f] || ""; }
  setField(f, v) { this.fields[f] = v; }
  setCreators(c) { this.creators = c; }
  addTag(t) { this.tags.add(t); }
  removeTag(t) { this.tags.delete(t); }
  getTags() { return [...this.tags].map(tag => ({ tag })); }
  addToCollection(id) { this.cols.add(id); }
  getAttachments() { return this.atts; }
  async saveTx() { if (!this.id) { this.id = nextID++; items.set(this.id, this); } }
}
const existing = new Item("journalArticle");
existing.fields = { title: "Nezha-F: Design and Analysis of a Foldable and Self-Deployable HAUV", DOI: "10.1109/LRA.2023.3252343" };
existing.saveTx();

const Zotero = {
  DataDirectory: { dir: "/tmp" }, isWin: false, Libraries: { userLibraryID: 1 },
  File: {
    getContentsAsync: async (p) => { if (p in files) return files[p]; if (/(queue|done)\.json$/.test(p)) throw new Error("无"); return JSON.stringify(data); },
    putContentsAsync: async (p, s) => { files[p] = s; },
    pathToFile: p => ({ exists: () => p.endsWith("have.pdf") }),
  },
  Promise: { delay: async () => {} },
  Items: { getAll: async () => [...items.values()], getAsync: async id => items.get(id), get: id => items.get(id) || atts.get(id) },
  Item,
  ItemTypes: { getID: t => t },
  ItemFields: { getID: f => f, isValidForType: (f, t) => !(f === "DOI" && t === "book") },
  Collections: { getByLibrary: () => collections },
  Collection: class { async saveTx() { this.id = nextID++; collections.push(this); } },
  Attachments: { linkFromFile: async ({ parentItemID }) => { let id = nextID++; atts.set(id, { attachmentContentType: "application/pdf" }); items.get(parentItemID).atts.push(id); } },
  ProgressWindow: class { changeHeadline() {} addDescription() {} show() {} startCloseTimer() {}
    get ItemProgress() { return class { setProgress() {} setText(t) { lastLine = t; } }; } },
  debug() {}, logError(e) { throw new Error(e); },
  ItemPaneManager: { registerSection: () => "pane" }, MenuManager: { registerMenu: () => "menu" },
  ItemTreeManager: { registerColumn: (o) => { column = o; return o.dataKey; }, refreshColumns: () => { refreshed++; } },
  getMainWindow: () => ({ setInterval: () => 1 }),
};
let lastLine = "", column = null, refreshed = 0;
const files = {};
const data = {
  collection: "论文调研_测试",
  airframe: { A1: { title: "统一弦长", what: "量实物", priority: "P0" } },
  papers: [
    { title: "Nezha-F: Design and Analysis of a Foldable and Self-Deployable HAUV", doi: "https://doi.org/10.1109/lra.2023.3252343",
      topics: ["nezha", "morphing"], is_nezha: true, seen_local: true, local_path: "/mnt/c/x/have.pdf", airframe_ids: ["A1"], verify: "verified" },
    { title: "Wing-in-ground effect vehicles", authors: "K. V. Rozhdestvensky", year: 2006, venue: "Progress in Aerospace Sciences",
      doi: "10.1016/j.paerosci.2006.10.001", paper_type: "journal", topics: ["wig"], local_path: "/mnt/c/x/missing.pdf" },
    { title: "地效翼船及其技术", authors: "云连", paper_type: "book", doi: "10.9/book", topics: ["wig"] },
  ],
};

const ctx = { Zotero };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/content/lib.js", "utf8"), ctx);
vm.runInContext(fs.readFileSync(__dirname + "/content/rc.js", "utf8"), ctx);
const RC = vm.runInContext("ResearchCompanion", ctx);

(async () => {
  await RC.init({ id: "t", rootURI: "x/" });
  assert.strictEqual(RC.lookup(existing).airframe_ids[0], "A1", "右侧栏按 DOI 找到");

  await RC.importAll();
  assert.strictEqual(items.size, 3, "已有的 Nezha-F 不重复建，新建 2 条");
  assert.ok(existing.tags.has("调研/哪吒团队") && existing.tags.has("本机看过") && existing.tags.has("机体改进依据"));
  assert.strictEqual(existing.atts.length, 1, "本机存在的 PDF 挂上");
  const wig = [...items.values()].find(i => i.fields.title === "Wing-in-ground effect vehicles");
  assert.strictEqual(wig.fields.publicationTitle, "Progress in Aerospace Sciences");
  assert.strictEqual(wig.fields.DOI, "10.1016/j.paerosci.2006.10.001");
  assert.strictEqual(wig.creators[0].lastName, "Rozhdestvensky");
  assert.deepStrictEqual(wig.atts, [], "本机不存在的 PDF 不挂");
  const book = [...items.values()].find(i => i.itemType === "book");
  assert.strictEqual(book.fields.extra, "DOI: 10.9/book", "书没有 DOI 字段时写进 Extra");
  const names = collections.map(c => c.name).sort();
  assert.deepStrictEqual(names, ["哪吒团队", "地效", "收折变形", "本机看过", "论文调研_测试"]);
  assert.ok(lastLine.startsWith("完成：新建 2，已有条目补标签 1，挂上本机 PDF 1，失败 0"), lastLine);

  data.papers[1].verify = "verified"; // 核实状态变了，再导入一次
  await RC.loadData();
  await RC.importAll(); // 再跑一次：不新增条目、不新增分类、不重复挂 PDF，核实标签被替换
  assert.strictEqual(items.size, 3);
  assert.strictEqual(collections.length, 5);
  assert.ok(wig.tags.has("核实/已核实") && !wig.tags.has("核实/未核实"), [...wig.tags].join(","));
  assert.strictEqual(existing.atts.length, 1);

  // 导出待翻段落：选中一篇论文（带 PDF）+ 一个扫描版 PDF（阅读模式出不来）
  const pdf = (id, ok) => ({ id, ok, isPDFAttachment: () => true, getField: () => "pdf" + id });
  const att = { 501: pdf(501, true), 502: pdf(502, false) };
  const paper = new Item("journalArticle"); paper.fields.title = "论文"; paper.atts = [501];
  const closed = [];
  const doc = { querySelector: () => ({}), querySelectorAll: () => [] };
  const RB = {
    getAutoTranslate: () => false,
    getRealContentDoc: (r) => r.att.ok ? doc : null,
    async translateReader() { try { await this.callOpenAIBatch(["段一", "段二"]); } catch (e) {} await this.translateTableBlock({ text: "表一" }); },
    callOpenAIBatch: async () => ["真翻译"], translateTableBlock: async () => {}, callGeminiBatch() {}, callModelText() {}, translateTocBlock() {}, translateRoadmapTogether() {},
    getCacheFilePath: async (r) => `/x/${r.att.id}.bilingual.json`,
  };
  const realBatch = RB.callOpenAIBatch;
  Zotero.ReadingBilingual = RB;
  Zotero.Items.get = id => att[id] || items.get(id);
  Zotero.getMainWindow = () => ({
    ZoteroPane: { getSelectedItems: () => [paper, att[502]], getSelectedCollection: () => null },
    Zotero_Tabs: { getTabIDByItemID: () => null, selectedID: "t", selectedType: "library" },
  });
  Zotero.Reader = { open: async (id) => ({ att: att[id], _initPromise: null, _internalReader: { initializedPromise: null, _primarySDTView: null, async _handleReadingModeEnabledChange() { if (att[id].ok) this._primarySDTView = {}; } }, close() { closed.push(id); } }) };
  await RC.exportForTranslation();
  assert.deepStrictEqual(JSON.parse(files["/x/501.to-translate.json"]), { itemID: 501, paragraphs: ["段一", "段二"], tables: ["表一"] });
  assert.ok(!("/x/502.to-translate.json" in files), "扫描版不导出");
  const q = JSON.parse(files["/tmp/research-companion-translate-queue.json"]);
  assert.deepStrictEqual(q, [{ path: "/x/501.to-translate.json", itemID: 501, paragraphs: 2, tables: 1 }]);
  assert.strictEqual(RB.callOpenAIBatch, realBatch, "导出后恢复双语插件原函数");
  assert.deepStrictEqual(closed.sort(), [501, 502], "自己打开的标签页都关掉");
  assert.strictEqual(column.dataProvider(paper), "待翻译", "导出后「译文」列显示待翻译");
  // 外面翻完：done 文件写入 501、队列清空 → 列显示已翻译
  files["/tmp/research-companion-translate-done.json"] = "[501]";
  files["/tmp/research-companion-translate-queue.json"] = "[]";
  await RC.loadStatus();
  assert.strictEqual(column.dataProvider(paper), "✓ 已翻译");
  assert.strictEqual(column.dataProvider(existing), "", "没导出过的空着");
  assert.ok(lastLine.startsWith("完成：导出 1 篇，已全部有译文 0 篇，失败 1 篇"), lastLine);

  // 在论文阅读页面点：只导出正在看的那篇，且不关掉它的标签页
  delete files["/x/501.to-translate.json"];
  closed.length = 0;
  const openReader = { itemID: 502 };
  Zotero.getMainWindow = () => ({
    ZoteroPane: { getSelectedItems: () => [paper], getSelectedCollection: () => null },
    Zotero_Tabs: { getTabIDByItemID: (id) => id === 502 ? "r" : null, selectedID: "r", selectedType: "reader" },
  });
  Zotero.Reader.getByTabID = () => openReader;
  att[502].ok = true;
  await RC.exportForTranslation();
  assert.ok("/x/502.to-translate.json" in files && !("/x/501.to-translate.json" in files), "只导出正在看的那篇");
  assert.deepStrictEqual(closed, [], "用户自己打开的论文不关");
  console.log("rc ok");
})().catch(e => { console.error(e); process.exit(1); });
