/* Bounded public-metadata evidence; no media downloads or production writes. */
const fs = require('node:fs'), path = require('node:path');
async function main() {
  const queries = [
    'mediatype:movies AND title:(flintstones AND (complete OR season))',
    'mediatype:movies AND title:(scooby AND (complete OR season))',
    'mediatype:movies AND title:(cartoon AND (VHS OR compilation OR "full show"))',
    'mediatype:movies AND title:(jetsons AND (complete OR season))',
  ];
  const searches = [], parents = [];
  for (const q of queries) {
    const url = new URL('https://archive.org/advancedsearch.php');
    url.searchParams.set('q', q + ' AND NOT title:(fanmade OR "fan made" OR intro OR promo OR trailer OR reaction OR Italian OR Portuguese OR Russian)');
    ['identifier', 'title', 'year', 'language'].forEach(f => url.searchParams.append('fl[]', f));
    url.searchParams.set('rows', '12'); url.searchParams.set('output', 'json'); url.searchParams.append('sort[]', 'downloads desc');
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('search HTTP ' + response.status);
    const payload = await response.json(); searches.push({ q, total: payload.response?.numFound, docs: payload.response?.docs || [] });
    console.log(JSON.stringify({ q, total: payload.response?.numFound, docs: (payload.response?.docs || []).slice(0, 4) }));
  }
  const ids = [...new Set(searches.flatMap(x => x.docs.slice(0, 3).map(r => r.identifier)))].slice(0, 12);
  for (const id of ids) {
    try {
      const response = await fetch('https://archive.org/metadata/' + encodeURIComponent(id), { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw Error('metadata HTTP ' + response.status);
      const payload = await response.json();
      const files = (payload.files || []).filter(f => /\.(mp4|ogv|webm)$/i.test(f.name || '') && Number(f.length) >= 900 && Number(f.width) > Number(f.height) && Number(f.height) > 0);
      const parent = { id, metadata: payload.metadata, files };
      parents.push(parent);
      console.log(JSON.stringify({ id, title: payload.metadata?.title, language: payload.metadata?.language, eligibleFiles: files.length, sample: files.slice(0, 2).map(f => ({ name: f.name, seconds: f.length, width: f.width, height: f.height })) }));
    } catch (error) { parents.push({ id, error: error.message }); }
  }
  const out = path.resolve('artifacts/ia-repair-cartoon-depth.json');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify({ searches, parents }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
