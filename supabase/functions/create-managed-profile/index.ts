import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
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

    const { data: callerProfile } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (callerProfile?.role !== 'commissioner') {
      return new Response(JSON.stringify({ error: 'Commissioner access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { displayName, managingUserEmail, syntheticEmail, pending } = await req.json()
    if (!displayName) {
      return new Response(JSON.stringify({ error: 'displayName is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Pending mode: pre-created at invite time, before the managing
    // user's own account exists yet. managed_by is left null and gets
    // filled in later by claim_pending_managed_profile() on their first
    // login. Non-pending mode (the original behavior, still used by the
    // admin Managed Profiles tool) requires an existing managingUserEmail.
    let managingUserId: string | null = null
    if (!pending) {
      if (!managingUserEmail) {
        return new Response(
          JSON.stringify({ error: 'managingUserEmail is required unless pending is true' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const { data: managingUser, error: managingUserError } = await adminClient
        .from('users')
        .select('id')
        .eq('email', managingUserEmail)
        .single()

      if (managingUserError || !managingUser) {
        return new Response(
          JSON.stringify({ error: `No existing user found with email ${managingUserEmail}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      managingUserId = managingUser.id
    }

    // Synthetic email — auto-generated for pending profiles (nobody needs
    // to think about it), or explicitly provided for the admin tool's
    // existing non-pending flow.
    const emailToUse =
      syntheticEmail ??
      `thebuckstopshereapp+managed${crypto.randomUUID().slice(0, 8)}@gmail.com`

    const { data: newAuthUser, error: createError } = await adminClient.auth.admin.createUser({
      email: emailToUse,
      email_confirm: true,
    })

    if (createError || !newAuthUser?.user) {
      return new Response(
        JSON.stringify({ error: createError?.message ?? 'Failed to create auth user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { error: updateError } = await adminClient
      .from('users')
      .update({ display_name: displayName, managed_by: managingUserId })
      .eq('id', newAuthUser.user.id)

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        id: newAuthUser.user.id,
        display_name: displayName,
        managed_by: managingUserId,
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
