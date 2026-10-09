/* Recheck public metadata before promoting a music bootstrap shelf. No media extraction. */
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
(async () => {
  const root = path.resolve(__dirname,'..');
  const file = path.join(root,'artifacts','ok-title-playback-canary.json');
  const canary = JSON.parse(fs.readFileSync(file,'utf8'));
  const profileKey = process.env.OK_MUSIC_PROFILE || 'ok-soul-flow-channel';
  const music = await import(pathToFileURL(path.join(root,'ok_music_catalog.js')));
  const helpers = await import(pathToFileURL(path.join(root,'ok_public_search.js')));
  const source = await import(pathToFileURL(path.join(root,'realsignal_source_catalog.js')));
  const profile = source.sourceProfile({profileKey});
  const known = canary.catalogs[profileKey].items;
  const eligible = known.filter(item=>music.okMusicPrecheck(profile,item));
  const verified = [];
  const metadata = async url => {
    const response = await fetch(url,{headers:{'User-Agent':'RealSignal/5.5.80 (https://github.com/esfsfestgfse/Archivetv)'},signal:AbortSignal.timeout(3500)});
    if (!response.ok) throw new Error('identity HTTP '+response.status);
    return response.json();
  };
  for (let start=0; start<eligible.length; start+=12) {
    const batch=eligible.slice(start,start+12);
    const identities = await music.okMusicIdentities(batch,known.concat(verified),metadata);
    for (const item of batch) {
      const identity = identities.get(item.id);
      if (!identity) continue;
      try {
        const response=await fetch(item.embedUrl,{signal:AbortSignal.timeout(6000)});
        const embed=response.ok?helpers.okEmbedMetadata(await response.text(),String(item.id).replace(/^ok:/,'')):null;
        const qualified=embed&&source.qualifySourceItem(profile,{...item,...embed,...identity,id:item.id});
        if (qualified) verified.push(qualified);
      } catch (_) { /* withheld until a later discovery succeeds */ }
    }
    console.log(JSON.stringify({checked:Math.min(start+12,eligible.length),verified:verified.length}));
  }
  const tracks=new Set(verified.map(x=>x.identityReference));
  const artists=new Set(verified.map(x=>x.musicArtistId));
  const decades=verified.reduce((out,item)=>{const decade=Math.floor(item.musicReleaseYear/10)*10;out[decade]=(out[decade]||0)+1;return out;},{});
  if (tracks.size<20 || artists.size<10 || Object.keys(decades).length<3) throw new Error('Music release gate underfilled: '+JSON.stringify({tracks:tracks.size,artists:artists.size,decades}));
  canary.catalogs[profileKey].items=verified;
  canary.catalogs[profileKey].verification={tracks:tracks.size,artists:artists.size,decades,checkedAt:new Date().toISOString()};
  fs.writeFileSync(file,JSON.stringify(canary,null,2));
  console.log(JSON.stringify({verified:verified.length,tracks:tracks.size,artists:artists.size,decades}));
})().catch(error=>{console.error(error);process.exitCode=1;});
