/* Shared Source Suite editorial guard. No I/O, catalog mutation, or viewing history. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RealSignalSourcePrograms=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function clean(value){return String(value||'').replace(/<[^>]*>/g,' ').replace(/\bA\.I\./gi,'AI').replace(/[\u2010-\u2015]/g,'-');}
  function synthetic(item){
    if(!item)return false;
    if(item.containsSyntheticMedia===true||item.status&&item.status.containsSyntheticMedia===true)return true;
    // Confirmed on the player: EyeBible's Judith movie carries YouTube's AI
    // disclosure. Match uploader identity, never a passing mention in a story.
    if(String(item.channelId||'')==='UCEKndy_m0UI1TALDsivTDUg'||/^@?eyebible$/i.test(String(item.account||item.channelTitle||'').trim()))return true;
    if([item.id,item.embedUrl,item.url,item.sourceUrl].some(function(value){return /(?:^|[:/=])0yGHkKFFvE0(?:[?&#/]|$)/.test(String(value||''));}))return true;
    var title=clean(item.title),description=clean(item.description),ai='(?:AI|artificial intelligence)',made='(?:generated|created|animated|produced|made)',tools='(?:AI|artificial intelligence|Sora|Veo(?:\\s*\\d+(?:\\.\\d+)?)?|Midjourney|Runway|Pika|Kling)',qualifier='(?:(?:entirely|fully|solely|completely|partially|100%)\\s+)*',production=made+'\\s+'+qualifier+'(?:with|using|by)\\s+'+tools;
    function disclosed(sentence){
      // A negated disclosure is not evidence that the program was generated.
      var value=sentence.trim().replace(/\b(?:no|not|without)\s+(?:any\s+)?AI[-\s]+(?:generated|created|animated|produced|made)(?:\s+content)?\b/gi,'')
        .replace(new RegExp('\\b(?:not|never)\\s+'+qualifier+production+'\\b','gi'),'');
      return new RegExp('(?:^|[|[(])\\s*'+ai+'[-\\s]+'+made+'\\b','i').test(value)
        ||new RegExp('(?:^|\\s[-]\\s)'+qualifier+production+'\\b','i').test(value)
        ||new RegExp('\\bthis\\s+is\\s+(?:an?\\s+)?'+qualifier+ai+'[-\\s]+'+made+'\\b','i').test(value)
        ||new RegExp('\\b(?:this|our|the|all)\\s+(?:video|film|movie|animation|visuals?|images?|footage|content)\\s+(?:(?:is|are|was|were|has|have|been|uses)\\s+)*'+qualifier+'(?:'+ai+'[-\\s]+'+made+'|'+production+')\\b','i').test(value);
    }
    return disclosed(title)||description.split(/[.!?\n]+/).some(disclosed);
  }
  function allow(profileKey,item){
    if(!/^(?:ok|vimeo)-/.test(String(profileKey||''))&&synthetic(item))return false;
    if(profileKey!=='cartoon-time-machine')return true;
    var title=String(item&&item.title||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    if(!title)return false;
    // Match the video's editorial framing, not account/description boilerplate.
    // "Just the Facts (Full Episode)" is not the same as "Facts About [show]".
    return !/\b(?:facts?\s+(?:about|you)|things\s+you\s+(?:didn['’]?t|never)\s+know|trivia|rankings?|ranked|countdown|top\s+(?:\d+|ten)|video\s+essay|analysis|explained|explored|retrospective|history\s+of|what\s+happened\s+to|why\s+you\s+should|reviews?|reactions?|animation\s+(?:history|tutorial)|made\s+in\s+blender)\b/i.test(title);
  }
  return {allow:allow};
});
