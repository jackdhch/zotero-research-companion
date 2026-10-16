/* 研究伴读：不依赖 Zotero 的纯函数，Zotero 和 Node 测试共用。 */
var RCLib = {
  TOPICS: {
    nezha: "哪吒团队", wig: "地效", morphing: "收折变形", cross_domain: "跨域",
    ai_uav: "AI无人机", vtol_control: "倾转VTOL控制", hydro: "水动力",
    sensing: "测高感知", other: "其他",
  },

  norm(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
  },

  normDOI(s) {
    return String(s || "").trim().toLowerCase()
      .replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "");
  },

  // "Yulin Bai, Yufei Jin, Chunhu Liu et al." → [{firstName, lastName}]；中文名整串当姓
  parseCreators(s) {
    s = String(s || "").replace(/\bet al\.?/i, "").replace(/等$/, "");
    // 有分号说明是 "姓, 名; 姓, 名" 写法，逗号属于名字内部
    return s.split(s.includes(";") ? /\s*;\s*/ : /\s*[,，、]\s*|\s+and\s+/).map(x => x.trim()).filter(Boolean)
      .map(name => {
        if (/[\u4e00-\u9fa5]/.test(name) || !name.includes(" ")) return { lastName: name, firstName: "", fieldMode: 1 };
        if (name.includes(".") && /^[^.]+,/.test(name)) { // "Fink, M. P." 形式
          let [last, first] = name.split(",");
          return { lastName: last.trim(), firstName: first.trim() };
        }
        let parts = name.split(/\s+/);
        return { lastName: parts.pop(), firstName: parts.join(" ") };
      });
  },

  itemType(paperType) {
    return { journal: "journalArticle", conference: "conferencePaper", preprint: "preprint",
      thesis: "thesis", book: "book", report: "report", patent: "patent" }[paperType] || "journalArticle";
  },

  venueField(itemType) {
    return { journalArticle: "publicationTitle", conferencePaper: "proceedingsTitle",
      preprint: "repository", thesis: "university", book: "publisher", report: "institution" }[itemType] || null;
  },

  // /mnt/c/Users/x/a.pdf → C:\Users\x\a.pdf；已是 Windows 路径原样返回；其他（refs.bib:键、清单未下载）返回 null
  winPath(p) {
    p = String(p || "");
    let m = p.match(/^\/mnt\/([a-z])\/(.*)$/i);
    if (m) return m[1].toUpperCase() + ":\\" + m[2].replace(/\//g, "\\");
    if (/^\/home\//.test(p)) return "\\\\wsl.localhost\\Ubuntu" + p.replace(/\//g, "\\");
    if (/^[A-Z]:\\/i.test(p)) return p;
    return null;
  },

  tagsFor(p) {
    let tags = (p.topics || []).map(t => "调研/" + (RCLib.TOPICS[t] || t));
    if (p.is_nezha) tags.push("调研/哪吒团队");
    if (p.seen_local) tags.push("本机看过");
    tags.push({ verified: "核实/已核实", corrected: "核实/已核实", not_found: "核实/数据库没查到", needs_manual: "核实/需人工核" }[p.verify] || "核实/未核实");
    if ((p.airframe_ids || []).length) tags.push("机体改进依据");
    return [...new Set(tags)];
  },

  // 库内条目索引：DOI 优先，标题兜底
  buildIndex(entries) {
    let byDOI = new Map(), byTitle = new Map();
    for (let e of entries) {
      if (e.doi) byDOI.set(RCLib.normDOI(e.doi), e.id);
      if (e.title) byTitle.set(RCLib.norm(e.title), e.id);
    }
    return { byDOI, byTitle };
  },

  find(index, p) {
    // 用 ?? 不用 ||：下标 0 是合法结果
    let d = RCLib.normDOI(p.doi);
    return (d ? index.byDOI.get(d) : undefined) ?? index.byTitle.get(RCLib.norm(p.title)) ?? null;
  },

  // Zotero 的 Extra 字段里可能写着 "DOI: 10.xxx"
  doiFromExtra(extra) {
    let m = String(extra || "").match(/^DOI:\s*(\S+)/mi);
    return m ? m[1] : "";
  },
};

if (typeof module !== "undefined") module.exports = RCLib;
