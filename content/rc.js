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
          { menuType: "menuitem", l10nID: "rc-menu-reload", onCommand: () => this.loadData(true) },
        ],
      }],
    });
  },

  shutdown() {
    if (this.paneID) Zotero.ItemPaneManager.unregisterSection(this.paneID);
    if (this.menuID) Zotero.MenuManager.unregisterMenu(this.menuID);
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
