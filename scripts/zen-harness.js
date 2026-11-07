// Loaded only by the temporary Zen installation created by zen-smoke.mjs.
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
  const assert = (condition, text) => { if (!condition) throw new Error(text); };
  const until = async (predicate, text) => {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await wait(50); }
    throw new Error(text);
  };

  setTimeout(async () => {
    try {
      let win;
      await until(() => {
        win = Services.wm.getMostRecentWindow('navigator:browser');
        return win?.gBrowser?.addTab && win.gBrowserInit?.delayedStartupFinished;
      }, 'Zen browser window did not initialize');
      const addon = await AddonManager.installTemporaryAddon(new FileUtils.File(options.addonPath));
      const extension = ExtensionParent.GlobalManager.getExtension(addon.id);
      await until(() => extension.shortcuts, 'Extension shortcut was not registered');
      const system = Services.scriptSecurityManager.getSystemPrincipal();
      const closedUrl = 'data:text/html,<title>Closed fixture</title>Do not reopen';
      const closed = win.gBrowser.addTab(closedUrl, { triggeringPrincipal: system });
      win.gBrowser.removeTab(closed, { animate: false });
      const source = win.gBrowser.addTab(options.previewUrl, { triggeringPrincipal: system });
      win.gBrowser.selectedTab = source;
      const pickerUrl = extension.baseURI.resolve('picker.html');
      const pickers = () => Array.from(win.gBrowser.tabs).filter(tab => !tab.closing && tab.linkedBrowser?.currentURI?.spec === pickerUrl);
      const tip = Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
      assert(tip.beginInputTransactionForTests(win), 'Native keyboard transaction failed');
      const key = (type, name, code, keyCode) => new win.KeyboardEvent(type, { key: name, code, keyCode });
      const hotkey = () => {
        tip.keydown(key('keydown', 'Control', 'ControlLeft', 17));
        tip.keydown(key('keydown', 'Shift', 'ShiftLeft', 16));
        tip.keydown(key('keydown', ' ', 'Space', 32));
        tip.keyup(key('keyup', ' ', 'Space', 32));
        tip.keyup(key('keyup', 'Shift', 'ShiftLeft', 16));
        tip.keyup(key('keyup', 'Control', 'ControlLeft', 17));
      };
      const record = async label => {
        const tabs = Array.from(win.gBrowser.tabs).filter(tab => !tab.closing).map(tab => ({
          id: extension.tabManager.convert(tab)?.id,
          url: tab.linkedBrowser?.currentURI?.spec,
          active: tab === win.gBrowser.selectedTab,
        }));
        assert(!tabs.some(tab => tab.url === closedUrl), 'A closed fixture was reopened');
        report.steps.push({ label, pickers: pickers().length, tabs });
        await save();
      };
      await wait(250);
      for (let i = 1; i <= 20; i++) {
        hotkey();
        const expected = i % 2;
        await until(() => pickers().length === expected && (
          expected ? pickers()[0] === win.gBrowser.selectedTab : win.gBrowser.selectedTab === source
        ), `Hotkey ${i}: expected ${expected} picker tabs and correct focus`);
        await wait(100);
        if (i === 1) {
          await until(() => {
            const title = extension.tabManager.convert(pickers()[0])?.title ?? '';
            if (title.includes('[preview-failed:')) throw new Error(title);
            return title.includes('[preview-ok]');
          }, 'Screenshot probe did not finish');
          report.preview = 'Actual screenshot and fallbacks fit without scrolling at 250×410, 320×480 and 480×720, including long metadata; details and focus preserved';
        }
        assert(pickers().length === expected, `Hotkey ${i} created a duplicate`);
        await record(`hotkey ${i}`);
      }
      // Simulate two leftover service tabs from an older installation.
      const duplicate1 = win.gBrowser.addTab(pickerUrl, { triggeringPrincipal: extension.principal });
      win.gBrowser.addTab(pickerUrl, { triggeringPrincipal: extension.principal });
      win.gBrowser.selectedTab = duplicate1;
      await until(() => pickers().length === 2, 'Duplicate fixture did not load');
      hotkey();
      await until(() => pickers().length === 0, 'Duplicate service tabs were not cleaned up');
      await record('duplicates cleaned');
      report.passed = true;
    } catch (error) { report.error = String(error); report.stack = error.stack; }
    report.done = true;
    await save();
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
  }, 1500);
} catch (error) { dump('Tabest integration harness failed: ' + error + '\n'); }
