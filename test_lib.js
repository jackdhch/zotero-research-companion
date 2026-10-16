// node test_lib.js —— 纯函数自检
const assert = require("assert");
const L = require("./content/lib.js");

assert.deepStrictEqual(L.parseCreators("Yulin Bai, Yufei Jin, Chunhu Liu et al."),
  [{ firstName: "Yulin", lastName: "Bai" }, { firstName: "Yufei", lastName: "Jin" }, { firstName: "Chunhu", lastName: "Liu" }]);
assert.deepStrictEqual(L.parseCreators("Fink, M. P.; Lastinger, J. L.").map(c => c.lastName), ["Fink", "Lastinger"]);
assert.strictEqual(L.parseCreators("曾铮、连琏")[1].lastName, "连琏");
assert.strictEqual(L.parseCreators("").length, 0);

assert.strictEqual(L.normDOI("https://doi.org/10.1109/LRA.2023.3252343"), "10.1109/lra.2023.3252343");
assert.strictEqual(L.winPath("/mnt/c/Users/me/Documents/NEZHA/a b.pdf"), "C:\\Users\\me\\Documents\\NEZHA\\a b.pdf");
assert.strictEqual(L.winPath("/home/me/x/y.pdf"), "\\\\wsl.localhost\\Ubuntu\\home\\me\\x\\y.pdf");
assert.strictEqual(L.winPath("refs.bib:Yun10"), null);

assert.strictEqual(L.itemType("conference"), "conferencePaper");
assert.strictEqual(L.venueField("conferencePaper"), "proceedingsTitle");
assert.strictEqual(L.venueField("patent"), null);

const tags = L.tagsFor({ topics: ["nezha", "morphing"], is_nezha: true, seen_local: true, verify: "corrected", airframe_ids: ["A1"] });
assert.deepStrictEqual(tags, ["调研/哪吒团队", "调研/收折变形", "本机看过", "核实/已核实", "机体改进依据"]);
assert.ok(L.tagsFor({ topics: [] }).includes("核实/未核实"));
assert.ok(L.tagsFor({ verify: "not_found" }).includes("核实/数据库没查到"));

const idx = L.buildIndex([{ id: 1, doi: "10.1109/LRA.2023.3252343", title: "Nezha-F" }, { id: 2, doi: "", title: "Wing-in-ground effect vehicles" }]);
assert.strictEqual(L.find(idx, { doi: "https://doi.org/10.1109/lra.2023.3252343", title: "x" }), 1);
assert.strictEqual(L.find(idx, { doi: "", title: "Wing-in-Ground Effect Vehicles" }), 2);
assert.strictEqual(L.find(idx, { doi: "10.0/none", title: "nothing" }), null);
assert.strictEqual(L.doiFromExtra("foo\nDOI: 10.1/abc\n"), "10.1/abc");
assert.strictEqual(L.find(L.buildIndex([{ id: 0, doi: "10.1/a", title: "A" }]), { doi: "10.1/a" }), 0, "下标 0 能查到");
console.log("lib ok");
