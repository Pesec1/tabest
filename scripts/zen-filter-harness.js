// Disposable native Zen integration test; never runs in the user's profile.
try {
  const options = __TABEST_TEST_OPTIONS__;
  const { setTimeout } = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const { FileUtils } = ChromeUtils.importESModule('resource://gre/modules/FileUtils.sys.mjs');
  const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
  Components.utils.importGlobalProperties(['IOUtils']);
  const report = { done: false, passed: false };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(predicate, message) {
    for (let i = 0; i < 150; i++) { if (predicate()) return; await wait(50); }
    throw new Error(message);
  }
  setTimeout(async () => {
    try {
      let win;
      await until(() => {
        win = Services.wm.getMostRecentWindow('navigator:browser');
        return win?.gBrowserInit?.delayedStartupFinished;
      }, 'Browser not ready');
      const addon = await AddonManager.installTemporaryAddon(new FileUtils.File(options.addonPath));
      const extension = ExtensionParent.GlobalManager.getExtension(addon.id);
      await until(() => extension.shortcuts, 'Shortcut not ready');
      const principal = Services.scriptSecurityManager.getSystemPrincipal();
      const pinned = win.gBrowser.addTab(options.previewUrl + '?pinned', { triggeringPrincipal: principal });
      win.gBrowser.pinTab(pinned);
      const ordinary = win.gBrowser.addTab(options.previewUrl + '?ordinary', { triggeringPrincipal: principal });
      win.gBrowser.selectedTab = ordinary;
      const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
      if (!tip.beginInputTransactionForTests(win)) throw new Error('Keyboard transaction failed');
      const key = (type, name, code, keyCode) => new win.KeyboardEvent(type, { key: name, code, keyCode });
      await wait(300);
      tip.keydown(key('keydown', 'Control', 'ControlLeft', 17)); tip.keydown(key('keydown', 'Shift', 'ShiftLeft', 16));
      tip.keydown(key('keydown', ' ', 'Space', 32)); tip.keyup(key('keyup', ' ', 'Space', 32));
      tip.keyup(key('keyup', 'Shift', 'ShiftLeft', 16)); tip.keyup(key('keyup', 'Control', 'ControlLeft', 17));
      await until(() => {
        const titles = Array.from(win.gBrowser.tabs).map(tab => extension.tabManager.convert(tab)?.title ?? '');
        const failure = titles.find(title => title.includes(options.ui ? '[ui-failed:' : '[filters-failed:'));
        if (failure) throw new Error(failure);
        return titles.some(title => title.includes(options.ui ? '[ui-wide-ok]' : '[filters-ok]'));
      }, 'Filter UI checks timed out');
      if (options.ui) {
        const picker = Array.from(win.gBrowser.tabs).find(tab => (extension.tabManager.convert(tab)?.title ?? '').includes('[ui-wide-ok]'));
        const capture = async name => {
          const bitmap = await picker.linkedBrowser.browsingContext.currentWindowGlobal.drawSnapshot(null, 1, '#121518');
          const canvas = win.document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
          canvas.width = bitmap.width; canvas.height = bitmap.height;
          canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
          const bytes = Uint8Array.from(win.atob(canvas.toDataURL('image/png').split(',')[1]), character => character.charCodeAt(0));
          await IOUtils.write(options.resultPath.replace('result.json', name + '.png'), bytes);
        };
        await capture('ui-wide');
        const box = picker.linkedBrowser.getBoundingClientRect();
        win.resizeTo(win.outerWidth + 400 - box.width, win.outerHeight + 760 - box.height);
        await until(() => {
          const title = extension.tabManager.convert(picker)?.title ?? '';
          if (title.includes('[ui-failed:')) throw new Error(title);
          return title.includes('[ui-ok]');
        }, 'Narrow UI checks timed out');
        await capture('ui-narrow');
      }
      report.passed = true;
    } catch (error) { report.error = String(error); report.stack = error.stack; }
    report.done = true;
    await IOUtils.writeUTF8(options.resultPath, JSON.stringify(report, null, 2));
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
  }, 1500);
} catch (error) { dump('Filter harness failed: ' + error + '\n'); }
