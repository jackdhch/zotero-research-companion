/* eslint-disable no-undef */
var ctx;

function install() {}
function uninstall() {}

async function startup({ id, rootURI }) {
  await Zotero.initializationPromise;
  ctx = {};
  Services.scriptloader.loadSubScript(rootURI + "content/lib.js", ctx);
  Services.scriptloader.loadSubScript(rootURI + "content/rc.js", ctx);
  for (let win of Zotero.getMainWindows()) onMainWindowLoad({ window: win });
  await ctx.ResearchCompanion.init({ id, rootURI });
}

function onMainWindowLoad({ window }) {
  // 界面文字在 locale/*/research-companion.ftl，Zotero 会自动注册，这里只需挂到窗口上
  window.MozXULElement.insertFTLIfNeeded("research-companion.ftl");
}

function onMainWindowUnload() {}

function shutdown(data, reason) {
  if (reason === APP_SHUTDOWN) return;
  ctx?.ResearchCompanion?.shutdown();
  ctx = null;
}
