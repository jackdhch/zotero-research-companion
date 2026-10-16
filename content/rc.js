/* 研究伴读 for Zotero：右侧栏显示论文和你研究的关系；工具菜单一键导入调研清单。
   数据文件：Zotero 数据目录下的 research-companion.json（由 build_data.py 生成）。 */
var ResearchCompanion = {
  id: null,
  rootURI: null,
  paneID: null,
  menuID: null,
  data: null,      // { papers: [...], airframe: {id: {...}} }
  index: null,     // RCLib.buildIndex 的结果，值是 papers 下标

  get dataPath() {
    return Zotero.DataDirectory.dir + (Zotero.isWin ? "\\" : "/") + "research-companion.json";
  },

  async init({ id, rootURI }) {
    this.id = id;
    this.rootURI = rootURI;
    await this.loadData();

    this.paneID = Zotero.ItemPaneManager.registerSection({
      paneID: "research-companion",
      pluginID: id,
      header: { l10nID: "rc-pane-header", icon: rootURI + "content/icon16.svg" },
      sidenav: { l10nID: "rc-pane-sidenav", icon: rootURI + "content/icon20.svg" },
      onItemChange: ({ item, setEnabled }) => setEnabled(!!this.lookup(item)),
      onRender: ({ doc, body, item }) => this.render(doc, body, item),
    });

    this.menuID = Zotero.MenuManager.registerMenu({
      menuID: "research-companion-tools",
      pluginID: id,
      target: "main/menubar/tools",
      menus: [{
        menuType: "submenu",
        l10nID: "rc-menu",
        menus: [
          { menuType: "menuitem", l10nID: "rc-menu-import", onCommand: () => this.importAll() },
          { menuType: "menuitem", l10nID: "rc-menu-reload", onCommand: () => { this.loadData(true); this.loadStatus(); } },
          { menuType: "menuitem", l10nID: "rc-menu-export", onCommand: () => this.exportForTranslation() },
        ],
      }],
    });

    this.columnKey = Zotero.ItemTreeManager.registerColumn({
      dataKey: "rc-translated",
      label: "译文",
      pluginID: id,
      flex: 0,
      width: "80",
      dataProvider: (item) => this.translateLabel(item),
    });
    await this.loadStatus();
    // 翻译在 Zotero 外面做完会改 done 文件，每分钟看一眼，变了就刷新这一列
    let win = Zotero.getMainWindow();
    if (win) this.timer = { win, id: win.setInterval(() => this.loadStatus(), 60000) };
  },

  shutdown() {
    if (this.paneID) Zotero.ItemPaneManager.unregisterSection(this.paneID);
    if (this.menuID) Zotero.MenuManager.unregisterMenu(this.menuID);
    if (this.columnKey) Zotero.ItemTreeManager.unregisterColumn(this.columnKey);
    if (this.timer) this.timer.win.clearInterval(this.timer.id);
  },

  // 文库列表「译文」列：attachment itemID → "done" | "todo"，来自 done / queue 两个文件
  status: new Map(),

  get donePath() {
    return Zotero.DataDirectory.dir + (Zotero.isWin ? "\\" : "/") + "research-companion-translate-done.json";
  },

  async readJSON(path, fallback) {
    try { return JSON.parse(await Zotero.File.getContentsAsync(path)); }
    catch (e) { return fallback; }
  },

  async loadStatus() {
    let m = new Map();
    for (let id of await this.readJSON(this.donePath, [])) m.set(id, "done");
    for (let q of await this.readJSON(this.queuePath, [])) m.set(q.itemID, "todo");
    let key = JSON.stringify([...m]);
    if (key === this._statusKey) return;
    this._statusKey = key;
    this.status = m;
    Zotero.ItemTreeManager.refreshColumns();
  },

  translateLabel(item) {
    let ids = item.isRegularItem() ? item.getAttachments() : [item.id];
    let s = ids.map(id => this.status.get(id));
    return s.includes("done") ? "✓ 已翻译" : s.includes("todo") ? "待翻译" : "";
  },

  async setDone(attID, done) {
    let list = new Set(await this.readJSON(this.donePath, []));
    if (done === list.has(attID)) return;
    done ? list.add(attID) : list.delete(attID);
    await Zotero.File.putContentsAsync(this.donePath, JSON.stringify([...list]));
  },

  async loadData(notify) {
    try {
      this.data = JSON.parse(await Zotero.File.getContentsAsync(this.dataPath));
      this.index = RCLib.buildIndex(this.data.papers.map((p, i) => ({ id: i, doi: p.doi, title: p.title })));
      if (notify) this.toast(`已重新读取：${this.data.papers.length} 篇`);
    }
    catch (e) {
      this.data = null;
      this.index = null;
      Zotero.debug("[研究伴读] 没读到数据文件 " + this.dataPath + "：" + e);
      if (notify) this.toast("没找到数据文件：" + this.dataPath);
    }
  },

  itemDOI(item) {
    let doi = "";
    try { doi = item.getField("DOI"); } catch (e) {}
    return doi || RCLib.doiFromExtra(item.getField("extra"));
  },

  lookup(item) {
    if (!this.index || !item?.isRegularItem()) return null;
    let i = RCLib.find(this.index, { doi: this.itemDOI(item), title: item.getField("title") });
    return i === null ? null : this.data.papers[i];
  },

  render(doc, body, item) {
    body.replaceChildren();
    let p = this.lookup(item);
    if (!p) return;
    let el = (tag, text, style) => {
      let e = doc.createElement(tag);
      if (text) e.textContent = text;
      if (style) e.setAttribute("style", style);
      return e;
    };
    let wrap = el("div", null, "display:flex;flex-direction:column;gap:6px;padding:2px 0;line-height:1.5");
    let row = (label, text) => {
      if (!text) return;
      let r = el("div");
      r.append(el("b", label + "："), el("span", text));
      wrap.append(r);
    };
    let chips = el("div", null, "display:flex;flex-wrap:wrap;gap:4px");
    for (let t of RCLib.tagsFor(p)) {
      chips.append(el("span", t, "border:1px solid var(--fill-quinary, #ccc);border-radius:8px;padding:0 6px;font-size:0.9em"));
    }
    wrap.append(chips);
    row("讲了什么", p.summary_zh);
    row("和你的研究", p.why_relevant_zh);
    for (let id of p.airframe_ids || []) {
      let a = this.data.airframe?.[id];
      if (a) row(`机体改进 ${id}（${a.priority}）`, `${a.title}：${a.what}`);
    }
    if (p.local_path) row("本机文件", RCLib.winPath(p.local_path) || p.local_path);
    if (p.url) {
      let link = el("a", "打开出版社页面", "cursor:pointer;color:var(--accent-blue, #2b6cb0);text-decoration:underline");
      link.addEventListener("click", () => Zotero.launchURL(p.url));
      wrap.append(link);
    }
    body.append(wrap);
  },

  toast(text) {
    let pw = new Zotero.ProgressWindow();
    pw.changeHeadline("研究伴读");
    pw.addDescription(text);
    pw.show();
    pw.startCloseTimer(5000);
  },

  // 一键导入：已有条目只补标签和分类；没有的新建；本机有 PDF 的挂链接附件。可重复运行，不会重复建条目。
  async importAll() {
    if (!this.data) await this.loadData();
    if (!this.data) return this.toast("没找到数据文件：" + this.dataPath);
    let lib = Zotero.Libraries.userLibraryID;
    let papers = this.data.papers;

    let pw = new Zotero.ProgressWindow({ closeOnClick: false });
    pw.changeHeadline("研究伴读：导入论文调研清单");
    pw.show();
    let line = new pw.ItemProgress(null, `准备中…（共 ${papers.length} 篇）`);

    // 库内现有条目索引
    let items = await Zotero.Items.getAll(lib, true);
    let entries = items.filter(it => it.isRegularItem())
      .map(it => ({ id: it.id, doi: this.itemDOI(it), title: it.getField("title") }));
    let index = RCLib.buildIndex(entries);

    let root = this.data.collection || "论文调研";
    let rootCol = await this.ensureCollection(lib, root, null);
    let colFor = {};
    let stats = { created: 0, updated: 0, linked: 0, failed: 0 };

    for (let [n, p] of papers.entries()) {
      try {
        let itemID = RCLib.find(index, p);
        let item;
        if (itemID) {
          item = await Zotero.Items.getAsync(itemID);
          stats.updated++;
        }
        else {
          item = this.newItem(lib, p);
          stats.created++;
        }
        let tags = RCLib.tagsFor(p);
        // 核实状态会变：先去掉过时的「核实/…」，免得「未核实」和「已核实」同时挂着
        for (let { tag } of item.getTags()) {
          if (tag.startsWith("核实/") && !tags.includes(tag)) item.removeTag(tag);
        }
        for (let t of tags) item.addTag(t);
        let groups = (p.topics || []).map(t => RCLib.TOPICS[t] || t);
        if (p.seen_local) groups.push("本机看过");
        for (let g of groups) {
          colFor[g] = colFor[g] || await this.ensureCollection(lib, g, rootCol.id);
          item.addToCollection(colFor[g].id);
        }
        await item.saveTx();
        if (!itemID) {
          if (p.doi) index.byDOI.set(RCLib.normDOI(p.doi), item.id);
          index.byTitle.set(RCLib.norm(p.title), item.id);
        }
        if (await this.linkLocalPDF(item, p)) stats.linked++;
      }
      catch (e) {
        stats.failed++;
        Zotero.logError(`[研究伴读] 导入失败：${p.title}：${e}`);
      }
      if (n % 20 === 0 || n === papers.length - 1) {
        line.setProgress(Math.round((n + 1) / papers.length * 100));
        line.setText(`${n + 1}/${papers.length}　新建 ${stats.created}，补标签 ${stats.updated}`);
      }
    }
    line.setText(`完成：新建 ${stats.created}，已有条目补标签 ${stats.updated}，挂上本机 PDF ${stats.linked}，失败 ${stats.failed}`);
    pw.startCloseTimer(15000);
  },

  newItem(lib, p) {
    let type = RCLib.itemType(p.paper_type);
    let item = new Zotero.Item(type);
    item.libraryID = lib;
    let typeID = Zotero.ItemTypes.getID(type);
    let set = (field, value) => {
      if (!value) return false;
      let fid = Zotero.ItemFields.getID(field);
      if (!fid || !Zotero.ItemFields.isValidForType(fid, typeID)) return false;
      item.setField(field, String(value));
      return true;
    };
    set("title", p.title);
    set("date", p.year);
    set(RCLib.venueField(type), p.venue);
    set("url", p.url);
    let extra = [];
    if (p.doi && !set("DOI", p.doi)) extra.push("DOI: " + p.doi);
    if (p.arxiv) extra.push("arXiv: " + p.arxiv);
    if (extra.length) item.setField("extra", extra.join("\n"));
    item.setCreators(RCLib.parseCreators(p.authors).map(c => ({ ...c, creatorType: "author" })));
    return item;
  },

  async ensureCollection(lib, name, parentID) {
    let hit = Zotero.Collections.getByLibrary(lib, true)
      .find(c => c.name === name && (c.parentID || null) === (parentID || null));
    if (hit) return hit;
    let c = new Zotero.Collection();
    c.libraryID = lib;
    c.name = name;
    if (parentID) c.parentID = parentID;
    await c.saveTx();
    return c;
  },

  get queuePath() {
    return Zotero.DataDirectory.dir + (Zotero.isWin ? "\\" : "/") + "research-companion-translate-queue.json";
  },

  // 选中的条目（没选就用当前分类）里的 PDF：逐篇打开、切阅读模式，让双语插件按它自己的规则挑出
  // 还没有译文的段落和表格，写到 PDF 旁边的 xxx.to-translate.json，并把清单记进队列文件。
  // 全程不调用翻译接口。依赖 zotero-reading-bilingual 1.6.3 的内部函数。
  async exportForTranslation() {
    let RB = Zotero.ReadingBilingual;
    if (!RB) return this.toast("没找到双语阅读插件（zotero-reading-bilingual）");
    if (RB.getAutoTranslate()) return this.toast("请先在双语插件设置里关掉「进入阅读模式时自动翻译」");
    // 在论文阅读页面点：只导出正在看的这一篇；在文库页面点：导出选中的条目，没选就导出当前分类
    let win = Zotero.getMainWindow();
    let items;
    if (win.Zotero_Tabs.selectedType !== "library") {
      let reader = Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID);
      items = reader ? [Zotero.Items.get(reader.itemID)].filter(Boolean) : [];
    }
    else {
      items = win.ZoteroPane.getSelectedItems();
      if (!items.length) items = win.ZoteroPane.getSelectedCollection()?.getChildItems() || [];
    }
    let pdfs = new Map();
    for (let it of items) {
      let ids = it.isPDFAttachment() ? [it.id] : it.isRegularItem() ? it.getAttachments() : [];
      for (let id of ids) {
        let a = Zotero.Items.get(id);
        if (a?.isPDFAttachment()) pdfs.set(a.id, a);
      }
    }
    if (!pdfs.size) return this.toast("先选中论文，或点开一个分类");

    let pw = new Zotero.ProgressWindow({ closeOnClick: false });
    pw.changeHeadline("研究伴读：导出待翻段落");
    pw.show();
    let line = new pw.ItemProgress(null, `共 ${pdfs.size} 个 PDF`);
    let queue = [];
    try { queue = JSON.parse(await Zotero.File.getContentsAsync(this.queuePath)); } catch (e) {}
    let stats = { exported: 0, done: 0, failed: 0 };
    let n = 0;
    for (let att of pdfs.values()) {
      n++;
      line.setText(`${n}/${pdfs.size}　${att.parentItem?.getField("title") || att.getField("title")}`);
      try {
        let r = await this.exportOne(RB, att);
        if (r) await this.setDone(att.id, !r.count);
        if (!r) stats.failed++;
        else if (!r.count) {
          stats.done++;
          if (queue.some(q => q.itemID === att.id)) {
            queue = queue.filter(q => q.itemID !== att.id);
            await Zotero.File.putContentsAsync(this.queuePath, JSON.stringify(queue, null, 1));
          }
        }
        else {
          stats.exported++;
          queue = queue.filter(q => q.path !== r.path);
          queue.push({ path: r.path, itemID: att.id, paragraphs: r.paragraphs, tables: r.tables });
          await Zotero.File.putContentsAsync(this.queuePath, JSON.stringify(queue, null, 1));
        }
      }
      catch (e) {
        stats.failed++;
        Zotero.logError(`[研究伴读] 导出失败：${att.getField("title")}：${e}`);
      }
      line.setProgress(Math.round(n / pdfs.size * 100));
    }
    await this.loadStatus();
    line.setText(`完成：导出 ${stats.exported} 篇，已全部有译文 ${stats.done} 篇，失败 ${stats.failed} 篇（多为扫描版 PDF）`);
    pw.startCloseTimer(15000);
  },

  // 返回 { path, count, paragraphs, tables }；阅读模式等不出来返回 null
  async exportOne(RB, att, timeoutMs = 180000) {
    let win = Zotero.getMainWindow();
    let wasOpen = !!win.Zotero_Tabs.getTabIDByItemID(att.id);
    let reader = await Zotero.Reader.open(att.id) || Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID);
    if (!reader) return null;
    try {
      await reader._initPromise;
      let internal = reader._internalReader;
      await internal.initializedPromise;
      // 这一步会等 PDF 转成文字；转不出来（扫描版）时阅读模式视图仍为空，直接跳过
      if (!internal._primarySDTView) await internal._handleReadingModeEnabledChange(true);
      if (!internal._primarySDTView) return null;
      // 和双语插件自动翻译的判断一致：#sdt-content 里出现段落才算阅读模式就绪
      let doc = null;
      for (let t = 0; t < timeoutMs && !doc; t += 1000) {
        await Zotero.Promise.delay(1000);
        let d = RB.getRealContentDoc(reader);
        if (d?.querySelector("#sdt-content p")) doc = d;
      }
      if (!doc) return null;

      let paras = [], tables = [], keep = {};
      let names = ["callOpenAIBatch", "callGeminiBatch", "callModelText", "translateTableBlock", "translateTocBlock", "translateRoadmapTogether"];
      for (let k of names) keep[k] = RB[k];
      RB.callOpenAIBatch = RB.callGeminiBatch = async (t) => { paras.push(...t); throw new Error("仅导出"); };
      RB.callModelText = async () => { throw new Error("仅导出"); };
      RB.translateTableBlock = async (b) => { if (b?.text) tables.push(b.text); };
      RB.translateTocBlock = RB.translateRoadmapTogether = async () => {};
      try {
        await RB.translateReader(reader, doc, true, false);
        await Zotero.Promise.delay(3000); // 侧栏目录那条异步调用也要撞上假接口
      }
      finally {
        Object.assign(RB, keep);
        doc.querySelectorAll(".zotero-bilingual-card").forEach((c) => { if (/仅导出/.test(c.textContent)) c.remove(); });
      }
      let path = (await RB.getCacheFilePath(reader)).replace(/\.bilingual\.json$/, ".to-translate.json");
      let count = paras.length + tables.length;
      if (count) {
        await Zotero.File.putContentsAsync(path, JSON.stringify({ itemID: att.id, paragraphs: paras, tables }, null, 1));
      }
      return { path, count, paragraphs: paras.length, tables: tables.length };
    }
    finally {
      if (!wasOpen) reader.close();
    }
  },

  async linkLocalPDF(item, p) {
    let path = RCLib.winPath(p.local_path);
    if (!path || !/\.pdf$/i.test(path) || !Zotero.File.pathToFile(path).exists()) return false;
    // 已经有任何 PDF（存进库里的或链接的）就不再挂，免得同一篇出现两份
    let hasPDF = item.getAttachments().map(id => Zotero.Items.get(id))
      .some(a => a.attachmentContentType === "application/pdf");
    if (hasPDF) return false;
    await Zotero.Attachments.linkFromFile({ file: path, parentItemID: item.id });
    return true;
  },
};
