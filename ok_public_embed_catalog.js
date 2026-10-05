/*
 * Credential-free OK.ru public-embed catalog.
 *
 * This is deliberately a small, reviewable manifest rather than an anonymous
 * scraper. Each entry is a public OK.ru embed whose page metadata explicitly
 * identifies an open/public-domain or creator-authorized release. The normal
 * source filters still enforce English metadata, landscape video, and the
 * fifteen-minute television floor before an item reaches a client.
 */

export const OK_PUBLIC_EMBED_MANIFEST = Object.freeze({
  "ok-movie-channel": Object.freeze([
    Object.freeze({
      id: "ok:1570971190743",
      title: "Seder-Masochism (2019) — Full Movie",
      description: "Animated feature by Nina Paley. The creator's release statement identifies the film as a public-domain dedication using CC0.",
      year: "2019",
      language: "en",
      rights: "Creative Commons CC0 / public domain dedication — creator release statement",
      rightsStatus: "verified-license-claim",
      duration: 4667,
      aspectRatio: 16 / 9,
      type: "embed",
      url: "https://ok.ru/videoembed/1570971190743",
      embedUrl: "https://ok.ru/videoembed/1570971190743",
      sourceUrl: "https://ok.ru/video/1570971190743",
      embedAllowed: true,
      query: "public-domain-feature"
    })
  ]),
  /* No OK.tv item is promoted until the page itself identifies an authorized
     English television release. An empty lane is safer than padding the new
     channel with reuploads, podcasts, fan edits, or uncertain rights. */
  "ok-tv-channel": Object.freeze([])
});
