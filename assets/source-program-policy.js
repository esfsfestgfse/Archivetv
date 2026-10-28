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
    // Ai Clash Zone's ant movie was also confirmed with the player's AI label.
    // Keep that evidence effective for old catalog rows missing disclosure data.
    if(String(item.channelId||'')==='UCa56NpS_ul3xsCBatFQ7kgA'||/^@?ai\s*clash\s*zone$/i.test(String(item.account||item.channelTitle||'').trim()))return true;
    if([item.id,item.identifier,item.embedUrl,item.url,item.sourceUrl].some(function(value){return /(?:^|[:/=])(?:0yGHkKFFvE0|Sx05wFa494k)(?:[?&#/]|$)/.test(String(value||''));}))return true;
    var title=clean(item.title),description=clean(item.description),ai='(?:AI|artificial intelligence)',made='(?:generated|created|animated|produced|made)',tools='(?:AI|artificial intelligence|Sora|Veo(?:\\s*\\d+(?:\\.\\d+)?)?|Midjourney|Runway|Pika|Kling)',qualifier='(?:(?:entirely|fully|solely|completely|partially|100%)\\s+)*',production=made+'\\s+'+qualifier+'(?:with|using|by)\\s+(?:the\\s+assistance\\s+of\\s+)?'+tools;
    function disclosed(sentence){
      // A negated disclosure is not evidence that the program was generated.
      var value=sentence.trim().replace(/\b(?:no|not|without)\s+(?:any\s+)?AI[-\s]+(?:generated|created|animated|produced|made)(?:\s+content)?\b/gi,'')
        .replace(new RegExp('\\b(?:not|never)\\s+'+qualifier+production+'\\b','gi'),'');
      return new RegExp('\\b(?:this|our|the)\\s+(?:video|film|movie|animation|footage|content)\\s+(?:contains?|includes?)\\s+'+ai+'[-\\s]+'+made+'\\b','i').test(value)
        ||new RegExp('\\b(?:this|our|the)\\s+(?:video|film|movie|animation)\\s+(?:is|was)\\s+(?:created|produced|made)\\s+as\\s+(?:an?\\s+)?(?:cinematic\\s+)?'+ai+'[-\\s]+'+made+'\\b','i').test(value)
        ||new RegExp('(?:^|[|[(])\\s*'+ai+'[-\\s]+'+made+'\\b','i').test(value)
        ||new RegExp('(?:^|\\s[-]\\s)'+qualifier+production+'\\b','i').test(value)
        ||new RegExp('\\bthis\\s+is\\s+(?:an?\\s+)?'+qualifier+ai+'[-\\s]+'+made+'\\b','i').test(value)
        ||new RegExp('\\b(?:this|our|the|all)\\s+(?:video|film|movie|animation|visuals?|images?|footage|content)\\s+(?:(?:is|are|was|were|has|have|been|uses)\\s+)*'+qualifier+'(?:'+ai+'[-\\s]+'+made+'|'+production+')\\b','i').test(value);
    }
    return disclosed(title)||description.split(/[.!?\n]+/).some(disclosed);
  }
  function allow(profileKey,item){
    if(!/^(?:ok|vimeo)-/.test(String(profileKey||''))){
      if(synthetic(item))return false;
      // A podcast named in the program title is its format. A companion
      // podcast link in a later description/footer is not that evidence.
      var formatTitle=clean(item&&item.title);
      // Explicit no-picture editions are audio formats even when the provider
      // reports a landscape video track. Recheck retained catalogs and guides.
      var pictureTitle=formatTitle.replace(/\b(?:no|not|without)\s+(?:an?\s+)?(?:black[ -]?screen|blank[ -]?screen|screen[ -]?off|audio[ -]+only)\b/gi,'');
      var pictureParts=pictureTitle.split(/\s+-\s+|[|()[\]]/);
      if(pictureParts.some(function(part){
        var subject=/^(?:(?:why|how|what|when)\b|(?:the\s+)?(?:history|science|story)\s+of\b|(?:a\s+)?documentary\s+(?:about|on)\b)/i.test(part.trim())&&/\bdocumentary\b/i.test(formatTitle);
        if(/\b(?:screen[ -]?off|no[ -]+(?:video|picture)|audio[ -]+only)\b/i.test(part))return true;
        return /\b(?:black[ -]?screen|blank[ -]?screen)\b/i.test(part)&&!subject;
      }))return false;
      var podcastSubject=/\b(?:history of|documentary (?:about|on)|rise of)\s+(?:pod\s?casts?|vodcasts?)\b/i.test(formatTitle)
        && /\bdocumentary\b/i.test([formatTitle,item&&item.description].join(' '));
      if(/\b(?:pod\s?casts?|vodcasts?)\b/i.test(formatTitle)&&!podcastSubject)return false;
      // Program self-identification belongs to the opening sentence. Later
      // companion-podcast promotions must not veto a real documentary.
      var introduction=clean(item&&item.description).trim().split(/[.!?](?:\s+|$)|\n/)[0];
      if(/\bthis podcast (?:releases?|is|covers?|features?|explores?|discusses?)\b|\bin this episode of\b[^.!?\n]{0,100}\bpodcast\b/i.test(introduction))return false;
      // Spoken-language metadata takes precedence over title/description locale.
      var language=String(item&&(item.defaultAudioLanguage||item.language||item.defaultLanguage)||'').trim();
      if(language&&!/^en(?:[-_]|$)/i.test(language))return false;
      // Official player checked: German speech-derived captions, no alternate
      // audio selector. Its English subtitles/metadata are not English audio.
      if([item&&item.id,item&&item.identifier,item&&item.sourceUrl,item&&item.embedUrl].some(function(value){return /(?:^|[:/=])c5PIN8CRSzs(?:[?&#/]|$)/.test(String(value||''));}))return false;
      // Reviewed uploads: Bin Bole Bol exposes Hindi speech captions with no
      // English audio track. The competition upload's English ASR label does
      // not verify an English performance; hold that exact item for review.
      // This is not a publisher/country ban or a provider-failure cooldown.
      if([item&&item.id,item&&item.identifier,item&&item.sourceUrl,item&&item.embedUrl].some(function(value){return /(?:^|[:/=])(?:SpSsy62IImo|ggG8Jn0r7ks)(?:[?&#/]|$)/.test(String(value||''));}))return false;
      // Old normalized PeerTube rows lost language. These three were checked
      // against the original provider; future rows retain the declared code.
      if(/^(?:pt:indymotion\.fr\/)(?:2f2b99fa-3fe2-4141-8520-14296e580125|bf85b376-fad9-41df-b97f-f9453743d0d9|db41bbcc-fb64-4526-92c1-520756c638fd)$/.test(String(item&&item.id||'')))return false;
    }
    var title=String(item&&item.title||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
    // A sitcom/cast retrospective is not a home-project or craft program.
    // Keep this title-format rule local; garden/project history remains valid.
    if(profileKey==='comfort-television'&&/\b(?:cast\s*[:|-]?\s*then\s+(?:and|&)\s+now|where\s+are\s+they\s+now|who(?:['’]s|\s+is)\s+still\s+alive)\b/i.test(title))return false;
    if(profileKey==='comfort-television'&&/\b(?:new yankee workshop|norm abram)\b/i.test(title)
      &&/\b(?:what happened to|the real reason|officially ended|(?:really|suddenly) ended|finally (?:admits|revealed)|tells the truth)\b/i.test(title))return false;
    if(profileKey==='garden-ledger'){
      var gardenIdentity=[title,item&&item.account,item&&item.channelTitle].join(' ');
      var gardenOpening=clean(item&&item.description).trim().split(/[.!?](?:\s+|$)|\n/)[0];
      if(/^(?:an?\s+)?(?:gardening\s+|garden\s+|horticulture\s+)?podcast\b|^(?:an?\s+)?political (?:commentary|debate)\b|\b(?:this|our)\s+(?:full\s+)?(?:program|programme|episode|video)\s+is\s+(?:an?\s+)?(?:how[ -]+to\s+)?(?:tutorial|political commentary|commentary)\b/i.test(gardenOpening))return false;
      if(/\b(?:podcasts?|commentary|political|politics|debate|livestock|animal husbandry|horse meat|horsemeat|horse slaughter|meat processing|tractor|hunting|fishing)\b|farm needs animals/i.test(title))return false;
      if(/guerrilla gardening/i.test(title)&&/corbett|episode\s*299/i.test([gardenIdentity,item&&item.description,item&&item.sourceUrl].join(' ')))return false;
      if(!/\b(?:gardening|gardeners?|horticulture|botanical|permaculture|greenhouse|vegetable|pollinator|compost)\b|garden (?:tour|design|restoration)|food forest|plant cultivation|growing a greener world|gardensmart/i.test(gardenIdentity))return false;
    }
    if(profileKey==='restoration-row'){
      // Restoring objects and buildings is the programme subject. Software,
      // medical restoration and upload-restoration credits are different uses.
      var restorationTitle=clean(title);
      if(/\b(?:software game|software restoration|software preservation|sight restoration|restor(?:ing|ation of) (?:eyesight|vision)|eye banks?|organ donations?|team presentations?|conference talks?|keynote|seminars?|webinars?)\b/i.test(restorationTitle)
        || /\bhome movies?\b.{0,100}\brestoration by\b/i.test(restorationTitle))return false;
    }
    if(profileKey==='game-show-archive'&&/\b(?:timelapse|gameplay|walkthrough|longplay|speedrun|final fantasy|ffxiv|fan festival)\b/i.test(title))return false;
    if(profileKey==='documentary-desk'&&/\bdeep dive\s*:\s*(?:ep\.?|episode)\s*\d+/i.test(title))return false;
    if(!/^(?:cartoon-time-machine|(?:holiday|christmas|halloween)-cartoon-club)$/.test(String(profileKey||'')))return true;
    if(!title)return false;
    var opening=clean(item&&item.description).trim().split(/[.!?](?:\s+|$)|\n/)[0];
    if(/\b(?:my first video essay|watch adults talk about cartoons)\b/i.test(opening)
      ||/\bthis is not an official (?:movie|film)\s*[.!]/i.test(clean(item&&item.description)))return false;
    if(/\b(?:minecraft animation|speedpaint|shady market of public domain)\b|^it came from public domain[!:]/i.test(title))return false;
    if(/\b(?:ambience|ambient|fireplace|relaxing jazz|sleep music)\b|\bdeep dive\s*[!:]/i.test(title))return false;
    if(/\b(?:gameplay|walkthrough|longplay|speedrun|let['’]?s play|(?:guess|name)\s+(?:the\s+)?(?:cartoon\s+)?theme\s+song|theme\s+song\s+(?:quiz|challenge)|the life and times of public domain vhs)\b/i.test(title))return false;
    // Match the video's editorial framing, not account/description boilerplate.
    // "Just the Facts (Full Episode)" is not the same as "Facts About [show]".
    return !/\b(?:facts?\s+(?:about|you)|things\s+you\s+(?:didn['’]?t|never)\s+know|trivia|rankings?|ranked|countdown|top\s+(?:\d+|ten)|video\s+essay|analysis|explained|explored|retrospective|history\s+of|what\s+happened\s+to|why\s+you\s+should|reviews?|reactions?|animation\s+(?:history|tutorial)|made\s+in\s+blender)\b/i.test(title);
  }
  return {allow:allow};
});
