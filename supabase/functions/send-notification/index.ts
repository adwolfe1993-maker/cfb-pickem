import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // Browsers send a CORS preflight OPTIONS request with no Authorization
  // header before the real request — must be answered here, before any
  // auth check, or the real request never gets sent at all.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser()

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: profile } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'commissioner') {
      return new Response(JSON.stringify({ error: 'Commissioner access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { title, body } = await req.json()
    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'title and body are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: subscriptions, error: subError } = await adminClient
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')

    if (subError) {
      return new Response(JSON.stringify({ error: subError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Vault access goes through a dedicated SECURITY DEFINER RPC, locked to
    // service_role only — never queried directly via schema access, and
    // never granted to anon/authenticated (see get_vapid_private_key).
    const { data: vapidKey, error: vaultError } = await adminClient.rpc(
      'get_vapid_private_key'
    )

    if (vaultError || !vapidKey) {
      return new Response(JSON.stringify({ error: 'Could not load VAPID key from Vault' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    webpush.setVapidDetails(
      'mailto:adwolfe1993@gmail.com',
      'BE5PZPg6OHwGRcyCBaqDlKDMEnzT4vNpA3xUEYNSuxmqpCZbAR4mQ4uEpGei0Rmqk9607eNUwKMJ5Z4gALjY79w',
      vapidKey
    )

    const payload = JSON.stringify({ title, body })

    const results = await Promise.allSettled(
      (subscriptions ?? []).map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          )
          return { id: sub.id, status: 'sent' }
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode
          if (statusCode === 404 || statusCode === 410) {
            await adminClient.from('push_subscriptions').delete().eq('id', sub.id)
            return { id: sub.id, status: 'expired_and_removed' }
          }
          return { id: sub.id, status: 'failed', error: String(err) }
        }
      })
    )

    return new Response(
      JSON.stringify({
        sent: results.filter((r) => r.status === 'fulfilled').length,
        total: subscriptions?.length ?? 0,
        details: results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
