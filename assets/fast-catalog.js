/* Public FAST rows: flat provider variants and routes supported by existing relays. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RealSignalFAST=api;})(typeof window!=='undefined'?window:this,function(){
  function variants(channel){
    var pending=[channel],objects=[],seen=Object.create(null),out=[];
    while(pending.length&&objects.length<128){
      var row=pending.shift();if(!row||objects.indexOf(row)>=0)continue;objects.push(row);
      (Array.isArray(row.alternates)?row.alternates:[]).forEach(function(other){pending.push(other);});
      var key=String(row.url||'')+'|'+String(row.src||'');if(!row.url||seen[key])continue;seen[key]=1;
      var copy=Object.assign({},row);delete copy.alternates;out.push(copy);
    }
    return out;
  }
  function trust(x){return (x.checked?30:0)+(x.verified?20:0)+(x.tvgId?5:0)+(x.src==='Tubi'?8:0)+(x.src==='Pluto TV'?7:0)+(x.src==='Roku'?6:0)+(x.src==='Xumo'?5:0);}
  function merge(items){
    var groups=Object.create(null);
    (items||[]).forEach(function(c){variants(c).forEach(function(row){
      var key=String(row.name||'').toLowerCase().replace(/\s*\((?:\d{3,4}p|4k|hd|sd)\)\s*$/i,'').replace(/\s+/g,' ').trim();if(!key)return;
      var group=groups[key]||(groups[key]=[]);if(!group.some(function(x){return x.url===row.url&&x.src===row.src;}))group.push(row);
    });});
    return Object.keys(groups).map(function(key){var rows=groups[key].sort(function(a,b){return trust(b)-trust(a);}),primary=Object.assign({},rows[0]);primary.alternates=rows.slice(1);return primary;});
  }
  function forSource(channel,source){
    var rows=variants(channel),selected=source?rows.find(function(row){return source.test(String(row.src||''));}):rows[0];
    return selected?Object.assign({},selected,{alternates:rows.filter(function(row){return row!==selected;})}):null;
  }
  function snapshot(items,max){
    var groups=Object.create(null),selected=[],keys;
    (items||[]).forEach(function(c){variants(c).forEach(function(row){var k=String(row.src||'IPTV');(groups[k]||(groups[k]=[])).push(row);});});
    keys=Object.keys(groups);
    while(selected.length<max){var added=false;keys.forEach(function(k){if(selected.length<max&&groups[k].length){selected.push(groups[k].shift());added=true;}});if(!added)break;}
    return merge(selected);
  }
  function proxies(channel,input){
    var list=input.slice(),hls='https://hls-proxy.tdy1990.workers.dev',fallback='https://tv-proxy.tdy1990.workers.dev',host='';
    try{host=new URL(channel.url).hostname.toLowerCase();}catch(_){}
    /* Roku's shortener lacks CORS and the generic relay rebases against it.
       The HLS-aware relay now explicitly allows the final Roku video CDN. */
    var supported=/(^|\.)(pluto\.tv|plutotv\.net|samsungtv\.plus|cloudfront\.net|akamaized\.net|delivery\.roku\.com)$/.test(host)||host==='jmp2.uk'&&(/^(Pluto TV|Samsung TV\+|Roku)$/.test(String(channel.src||''))||/\/roku[/-]/i.test(channel.url));
    if(!supported&&list.indexOf(fallback)>=0)list=list.filter(function(base){return base!==hls;});
    return list;
  }
  return {variants:variants,merge:merge,forSource:forSource,proxies:proxies,snapshot:snapshot};
});
