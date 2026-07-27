import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    // Client admin — are acces complet (service_role, bypass RLS)
    const admin = createClient(supabaseUrl, serviceKey)

    // Client user — verifică că cel care apelează e admin keyuser
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user: callerUser }, error: callerErr } = await caller.auth.getUser()
    if (callerErr || !callerUser) throw new Error('Unauthorized')

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single()

    if (callerProfile?.role !== 'keyuser') throw new Error('Forbidden')

    const { action, payload } = await req.json()

    let result: Record<string, unknown> = {}

    if (action === 'create') {
      // Creare utilizator nou: Auth user + profil
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email:          `${payload.username}@depozit.internal`,
        password:       payload.password,
        email_confirm:  true,
      })
      if (createErr) throw createErr

      const { error: profileErr } = await admin.from('profiles').insert({
        id:                   created.user.id,
        username:             payload.username,
        name:                 payload.name,
        role:                 payload.role,
        active:               true,
        must_change_password: true,
      })
      if (profileErr) throw profileErr

      result = { id: created.user.id }

    } else if (action === 'update') {
      // Actualizare metadata profil (nume, rol, activ)
      const { error } = await admin
        .from('profiles')
        .update({
          name:   payload.name,
          role:   payload.role,
          active: payload.active,
        })
        .eq('username', payload.username)

      if (error) throw error
      result = { success: true }

    } else if (action === 'reset_password') {
      // Reset parolă de către admin
      const { data: targetProfile } = await admin
        .from('profiles')
        .select('id')
        .eq('username', payload.username)
        .single()

      if (!targetProfile) throw new Error('User not found')

      const { error } = await admin.auth.admin.updateUserById(targetProfile.id, {
        password: payload.password,
      })
      if (error) throw error

      await admin
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', targetProfile.id)

      result = { success: true }

    } else if (action === 'delete') {
      // Ștergere utilizator (cascadează și profilul via FK)
      const { data: targetProfile } = await admin
        .from('profiles')
        .select('id')
        .eq('username', payload.username)
        .single()

      if (!targetProfile) throw new Error('User not found')

      const { error } = await admin.auth.admin.deleteUser(targetProfile.id)
      if (error) throw error

      result = { success: true }

    } else {
      throw new Error(`Unknown action: ${action}`)
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
