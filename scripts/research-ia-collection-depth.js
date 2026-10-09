/* Read-only Archive research. Counts are metadata-qualified, not decoded frames.
   Serial requests avoid turning depth research into an upstream burst. */
const fs = require('node:fs');
const path = require('node:path');
const { qualifyIaFileRecord } = require('../ia_file_contract.js');
const queries = {
  '10': 'mediatype:movies AND (title:("complete series") OR title:("season") OR title:("collection")) AND (title:("television") OR title:("sitcom") OR title:("Benson") OR title:("Bewitched") OR title:("Dick Van Dyke") OR title:("Mary Tyler Moore") OR title:("Munsters") OR title:("Honeymooners") OR title:("Leave It to Beaver") OR title:("I Love Lucy"))',
  '150': 'mediatype:movies AND (title:("complete series") OR title:("season") OR title:("collection")) AND (title:("cartoons") OR title:("Flintstones") OR title:("Jetsons") OR title:("Scooby") OR title:("Yogi Bear") OR title:("Top Cat") OR title:("Jonny Quest") OR title:("Rocky and Bullwinkle"))',
};
const families = {
  '10': [['Leave It to Beaver', 1957], ['Benson', 1979], ['The Dick Van Dyke Show', 1961], ['The Mary Tyler Moore Show', 1970], ['Bewitched', 1964], ['The Munsters', 1964], ['I Love Lucy', 1951], ['The Honeymooners', 1955], ['The Andy Griffith Show', 1960], ['The Addams Family', 1964], ['Get Smart', 1965], ['Green Acres', 1965]],
  '150': [['The Flintstones', 1960], ['The Jetsons', 1962], ['The Scooby Doo Show', 1976], ['Clutch Cargo', 1959], ['Space Angel', 1962], ['Top Cat', 1961], ['The Yogi Bear Show', 1961], ['Jonny Quest', 1964], ['Rocky and Bullwinkle', 1959], ['The Pink Panther Show', 1969]],
};
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw Error('Archive HTTP ' + response.status);
  return response.json();
}
async function main() {
  const report = { measuredAt: new Date().toISOString(), measurement: 'Archive search and file metadata; not playback certification', channels: [] };
  const sourceQueries = process.argv.includes('--families') ? Object.entries(families).flatMap(([channel, rows]) => rows.map(([series, year]) => [channel, 'mediatype:movies AND title:("' + series + '")', series, year])) : Object.entries(queries);
  for (const [channel, query, series, year] of sourceQueries) {
    const url = new URL('https://archive.org/advancedsearch.php');
    url.search = new URLSearchParams({ q: query, output: 'json', rows: '40' });
    ['identifier', 'title', 'year', 'subject', 'language'].forEach(field => url.searchParams.append('fl[]', field));
    url.searchParams.append('sort[]', 'downloads desc');
    const data = await json(url);
    const lane = { channel, query, series, year, matchingParents: data.response?.numFound || 0, parents: [] };
    for (const doc of (data.response?.docs || []).slice(0, series ? 3 : 24)) {
      const row = { identifier: doc.identifier, title: doc.title, year: doc.year, eligibleFiles: 0, rejected: {}, samples: [] };
      try {
        const metadata = await json('https://archive.org/metadata/' + encodeURIComponent(doc.identifier));
        const seen = new Set();
        for (const file of metadata.files || []) {
          if (!/\.mp4$/i.test(file.name || '')) continue;
          const key = file.name.replace(/(?:\.ia|_512kb)\.mp4$/i, '.mp4');
          if (seen.has(key)) continue;
          seen.add(key);
          const item = { identifier: doc.identifier + '::' + file.name, title: doc.title + ' · ' + file.name,
            media: { type: 'video', url: 'https://archive.org/download/' + doc.identifier + '/' + encodeURIComponent(file.name),
              sourceIdentifier: doc.identifier, fileName: file.name, runtime: Number(file.length || file.duration), width: Number(file.width), height: Number(file.height), language: file.language || metadata.metadata?.language, metadataVerifiedAt: Date.now() } };
          const check = qualifyIaFileRecord(item, { channel, minRuntimeSeconds: 900, mediaTypes: ['movies'], requireTransport: false });
          if (check.accepted) { row.eligibleFiles++; if (row.samples.length < 3) row.samples.push(item); }
          else row.rejected[check.reason] = (row.rejected[check.reason] || 0) + 1;
        }
      } catch (error) { row.error = error.message; }
      lane.parents.push(row);
      console.log(JSON.stringify({ channel, parent: row.identifier, eligible: row.eligibleFiles, error: row.error }));
    }
    report.channels.push(lane);
  }
  const output = path.resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'artifacts/ia-collection-depth-research.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, channels: report.channels.map(lane => ({ channel: lane.channel, matchingParents: lane.matchingParents, inspected: lane.parents.length, eligibleFiles: lane.parents.reduce((sum, p) => sum + p.eligibleFiles, 0) })) }));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
