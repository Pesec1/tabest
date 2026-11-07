// Test-only configuration for an isolated Zen installation.
try {
  const options = __TABEST_TEST_OPTIONS__;
  const { setTimeout } = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const { FileUtils } = ChromeUtils.importESModule('resource://gre/modules/FileUtils.sys.mjs');
  const { ExtensionParent } = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
  Components.utils.importGlobalProperties(['IOUtils']);
  const report = { done: false, passed: false, steps: [] };
  const save = () => IOUtils.writeUTF8(options.resultPath, JSON.stringify(report, null, 2));
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
      }, 'Browser window not ready');
      const addon = await AddonManager.installTemporaryAddon(new FileUtils.File(options.addonPath));
      const extension = ExtensionParent.GlobalManager.getExtension(addon.id);
      await until(() => extension.shortcuts, 'Shortcuts not ready');
      const principal = Services.scriptSecurityManager.getSystemPrincipal();
      const targetB = win.gBrowser.addTab(options.fixtures.targetB, { triggeringPrincipal: principal });
      win.gBrowser.addTab(options.fixtures.targetC, { triggeringPrincipal: principal });
      const victim = win.gBrowser.addTab(options.fixtures.victim, { triggeringPrincipal: principal });
      win.gBrowser.selectedTab = victim;
      const pickerUrl = extension.baseURI.resolve('picker.html');
      const pickers = () => Array.from(win.gBrowser.tabs).filter(tab => !tab.closing && tab.linkedBrowser?.currentURI?.spec === pickerUrl);
      const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
      if (!tip.beginInputTransactionForTests(win)) throw new Error('Keyboard transaction failed');
      const key = (type, name, code, keyCode) => new win.KeyboardEvent(type, { key: name, code, keyCode });
      const hotkey = () => {
        tip.keydown(key('keydown', 'Control', 'ControlLeft', 17)); tip.keydown(key('keydown', 'Shift', 'ShiftLeft', 16));
        tip.keydown(key('keydown', ' ', 'Space', 32)); tip.keyup(key('keyup', ' ', 'Space', 32));
        tip.keyup(key('keyup', 'Shift', 'ShiftLeft', 16)); tip.keyup(key('keyup', 'Control', 'ControlLeft', 17));
      };
      const record = async label => {
        const tabs = Array.from(win.gBrowser.tabs).filter(tab => !tab.closing).map(tab => ({
          id: extension.tabManager.convert(tab)?.id, url: tab.linkedBrowser?.currentURI?.spec, active: tab.selected,
        }));
        report.steps.push({ label, tabs }); await save();
      };
      const stage = async marker => {
        await until(() => {
          const titles = pickers().map(tab => extension.tabManager.convert(tab)?.title ?? '');
          const failure = titles.find(title => title.includes('[delete-failed:'));
          if (failure) throw new Error(failure);
          return titles.some(title => title.includes(marker));
        }, 'UI did not reach ' + marker);
        await record(marker);
        if (Array.from(win.gBrowser.tabs).some(tab => !tab.closing && tab.linkedBrowser?.currentURI?.spec === options.fixtures.victim)) {
          throw new Error('Native Zen tab was resurrected at ' + marker);
        }
      };
      await wait(300);
      hotkey(); await stage('[delete-step1-ok]');
      hotkey(); await stage('[delete-step2-ok]');
      hotkey(); await until(() => pickers().some(tab => tab.selected), 'Picker not active');
      hotkey(); await until(() => pickers().length === 0, 'Picker not closed');
      hotkey(); await stage('[delete-step3-ok]');
      report.passed = true;
    } catch (error) { report.error = String(error); report.stack = error.stack; }
    report.done = true; await save();
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
  }, 1500);
} catch (error) { dump('Deletion harness failed: ' + error + '\n'); }
