export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/broadcast-schedule.json') return env.ASSETS.fetch(request);
    url.pathname = '/output/broadcast-pilot-preview/preview.json';
    const response = await env.ASSETS.fetch(new Request(url, request));
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'no-cache');
    return new Response(response.body, { status: response.status, headers });
  }
};
