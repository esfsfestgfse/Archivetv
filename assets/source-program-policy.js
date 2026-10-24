/* Shared Source Suite editorial guard. No I/O, catalog mutation, or viewing history. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RealSignalSourcePrograms=api;})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function allow(profileKey,item){
    if(profileKey!=='cartoon-time-machine')return true;
    var title=String(item&&item.title||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    if(!title)return false;
    // Match the video's editorial framing, not account/description boilerplate.
    // "Just the Facts (Full Episode)" is not the same as "Facts About [show]".
    return !/\b(?:facts?\s+(?:about|you)|things\s+you\s+(?:didn['’]?t|never)\s+know|trivia|rankings?|ranked|countdown|top\s+(?:\d+|ten)|video\s+essay|analysis|explained|explored|retrospective|history\s+of|what\s+happened\s+to|why\s+you\s+should|reviews?|reactions?|animation\s+(?:history|tutorial)|made\s+in\s+blender)\b/i.test(title);
  }
  return {allow:allow};
});
