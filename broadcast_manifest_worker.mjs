export default {
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname !== '/broadcast-schedule.json' && pathname !== '/broadcast-schedule-v2.json') {
      return new Response(null, { status: 404 });
    }
    return Response.json({ lineup: [], stations: [] }, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
    });
  }
};
