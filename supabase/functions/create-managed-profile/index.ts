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

    const { managingUserEmail, displayName, syntheticEmail } = await req.json()
    if (!managingUserEmail || !displayName || !syntheticEmail) {
      return new Response(
        JSON.stringify({
          error: 'managingUserEmail, displayName, and syntheticEmail are required',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Resolve the managing user's real user_id from their email.
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

    // Create the synthetic auth account. Nobody ever logs into this
    // directly — it exists only to satisfy public.users' foreign key to
    // auth.users. email_confirm: true avoids sending a confirmation email
    // to it.
    const { data: newAuthUser, error: createError } = await adminClient.auth.admin.createUser({
      email: syntheticEmail,
      email_confirm: true,
    })

    if (createError || !newAuthUser?.user) {
      return new Response(
        JSON.stringify({ error: createError?.message ?? 'Failed to create auth user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // handle_new_auth_user already inserted a public.users row with a
    // garbage display_name derived from the synthetic email's local part —
    // fix it and set managed_by in one follow-up update.
    const { error: updateError } = await adminClient
      .from('users')
      .update({ display_name: displayName, managed_by: managingUser.id })
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
        managed_by: managingUser.id,
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
