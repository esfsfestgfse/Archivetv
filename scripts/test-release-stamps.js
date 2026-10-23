const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Run each real release gate against the current app, replacing only its stamp.
// In particular, accepting a prerelease must not disable malformed/stale checks.
for (const file of ['check-cast-contract.js', 'check-source-suite-contract.js', 'test-release2-runtime.js']) {
  for (const [version, allowed] of [
    ['5.6.32', true], ['6.0.0-rc.1', true], ['6.0.0', true],
    ['6.0.0-rc.bad', false], ['6.0.0-rc.0', false], ['1.7.10', false],
    ['6.0', false], ['6.0.0-rc.1-bogus', false],
  ]) {
    test(`${file}: ${allowed ? 'accepts' : 'rejects'} ${version} without bypassing the release gate`, () => {
      const fakeFs = { ...fs, readFileSync(target, ...args) {
        const value = fs.readFileSync(target, ...args);
        const name = path.basename(String(target));
        if (!/^the_dial_(desktop|mobile)\.html$/.test(name)) return value;
        const surface = name.includes('desktop') ? 'desktop' : 'mobile';
        return value.replace(/window\.__ATV_BUILD\s*=\s*"[^"]+"/, `window.__ATV_BUILD="${version}-${surface}-v6-guide"`);
      } };
      const logs = [], process = { exitCode: 0 };
      const script = path.join(__dirname, file);
      vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
        require: name => name === 'node:fs' ? fakeFs : require(name),
        __dirname, process, console: { log: (...xs) => logs.push(xs.join(' ')), error: (...xs) => logs.push(xs.join(' ')) },
      }, { filename: file });
      assert.equal(process.exitCode === 0, allowed, logs.filter(x => /stamp|release/.test(x)).join('\n'));
    });
  }
}

for (const surface of ['desktop', 'mobile']) {
  for (const [stamp, expected] of [
    [`6.0.0-rc.1-${surface}-v6-guide`, 'v6.0.0-rc.1'],
    [`5.6.32-${surface}-v6-guide-preview`, 'v5.6.32'],
  ]) {
    test(`${surface} visible version chips preserve ${expected}`, () => {
      const html = fs.readFileSync(path.join(__dirname, '..', `the_dial_${surface}.html`), 'utf8');
      const marker = html.indexOf('/* Populate the build-number chip');
      const start = html.indexOf('(function()', marker), end = html.indexOf('window.__atvBootDone', start);
      assert.ok(start >= 0 && end > start, 'execute the actual boot-time chip formatter');
      const ids = { verChip: {}, mVerChip: {}, 'atv-build-stamp-value': {} };
      vm.runInNewContext(html.slice(start, end), { window: { __ATV_BUILD: stamp }, document: { getElementById: id => ids[id] } });
      assert.equal(ids.verChip.textContent, expected);
      if (surface === 'mobile') assert.equal(ids.mVerChip.textContent, expected);
      assert.equal(ids['atv-build-stamp-value'].textContent, stamp);
    });
  }
}
