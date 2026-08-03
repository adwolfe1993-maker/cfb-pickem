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

    const { email, displayName } = await req.json()
    if (!email || !displayName) {
      return new Response(JSON.stringify({ error: 'email and displayName are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // admin.createUser bypasses the project's "Allow new users to sign up"
    // setting (which we're turning off) — this is intentionally the only
    // path that can create a real participant account, matching the
    // charter's "commissioner-only invite flow, no self-registration."
    const { data: newAuthUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
    })

    if (createError || !newAuthUser?.user) {
      return new Response(
        JSON.stringify({ error: createError?.message ?? 'Failed to create account' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // handle_new_auth_user already inserted a public.users row with a
    // garbage display_name derived from the email's local part — fix it.
    const { error: updateError } = await adminClient
      .from('users')
      .update({ display_name: displayName })
      .eq('id', newAuthUser.user.id)

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Send a real sign-in code immediately, so the invite actually lands
    // as an email in their inbox rather than requiring the commissioner
    // to separately tell them where to go.
    const { error: otpError } = await adminClient.auth.signInWithOtp({ email })

    return new Response(
      JSON.stringify({
        id: newAuthUser.user.id,
        display_name: displayName,
        email,
        invite_email_sent: !otpError,
        invite_email_error: otpError?.message ?? null,
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
