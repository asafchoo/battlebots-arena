import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const now = Date.now();
    return Response.json(
      {
        server_time_ms: now,
        server_time_iso: new Date(now).toISOString(),
      },
      { headers }
    );
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500, headers }
    );
  }
});