// Privileged automation in a copied browser installation and fresh profile only.
try {
  const options = __TABEST_CAPTURE_OPTIONS__;
  const { setTimeout } = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const { FileUtils } = ChromeUtils.importESModule('resource://gre/modules/FileUtils.sys.mjs');
  const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
  Components.utils.importGlobalProperties(['IOUtils']);
  const report = { done: false, passed: false, screenshots: [] };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(predicate, message) {
    for (let i = 0; i < 200; i++) { if (predicate()) return; await wait(50); }
    throw new Error(message);
  }
  setTimeout(async () => {
    try {
      let win;
      await until(() => {
        win = Services.wm.getMostRecentWindow('navigator:browser');
        return win?.gBrowserInit?.delayedStartupFinished;
      }, 'Browser did not initialize');
      const addon = await AddonManager.installTemporaryAddon(new FileUtils.File(options.addonPath));
      const extension = ExtensionParent.GlobalManager.getExtension(addon.id);
      await until(() => extension.shortcuts, 'Extension not ready');
      const principal = Services.scriptSecurityManager.getSystemPrincipal();
      const tabs = [];
      for (const page of options.pages) {
        const tab = win.gBrowser.addTab(page.url, { triggeringPrincipal: principal });
        tabs.push(tab);
        win.gBrowser.selectedTab = tab;
        await until(() => extension.tabManager.convert(tab)?.title === page.title, 'Fixture did not load');
        if (page.pinned) win.gBrowser.pinTab(tab);
        await wait(180);
      }
      const picker = win.gBrowser.addTab(extension.baseURI.resolve('picker.html'), { triggeringPrincipal: extension.principal });
      win.gBrowser.selectedTab = picker;
      await wait(200);
      const box = picker.linkedBrowser.getBoundingClientRect();
      win.resizeTo(win.outerWidth + 1280 - box.width, win.outerHeight + 800 - box.height);
      await wait(400);
      for (const [index, stage] of ['search', 'pinned'].entries()) {
        await until(() => {
          const title = extension.tabManager.convert(picker)?.title ?? '';
          if (title.includes('[capture-failed:')) throw new Error(title);
          return title.includes(`[capture-${stage}-ready]`);
        }, `Capture ${stage} was not ready`);
        const bitmap = await picker.linkedBrowser.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, '#121518');
        const canvas = win.document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        if (canvas.width !== 1280 || canvas.height !== 800) throw new Error(`Unexpected viewport: ${canvas.width}×${canvas.height}`);
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        bitmap.close();
        const bytes = Uint8Array.from(win.atob(canvas.toDataURL('image/png').split(',')[1]), character => character.charCodeAt(0));
        const path = options.output + '/' + options.filenames[index];
        await IOUtils.write(path, bytes);
        report.screenshots.push({ path, width: canvas.width, height: canvas.height, stage });
      }
      await until(() => (extension.tabManager.convert(picker)?.title ?? '').includes('[capture-done]'), 'Probe did not finish');
      report.passed = true;
    } catch (error) { report.error = String(error); report.stack = error.stack; }
    report.done = true;
    await IOUtils.writeUTF8(options.resultPath, JSON.stringify(report, null, 2));
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
  }, 1500);
} catch (error) { dump('Store capture failed: ' + error + '\n'); }
