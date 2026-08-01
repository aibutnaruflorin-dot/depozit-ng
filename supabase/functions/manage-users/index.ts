import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// V11: restrânge CORS la originea Vercel de producție (nu mai '*')
const ALLOWED_ORIGIN = 'https://depozit-ng.vercel.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// V6: validare complexitate parolă pe server (aceeași regulă ca în client)
function validatePassword(password: string): void {
  if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Parola trebuie să aibă minim 8 caractere, o literă mare și o cifră.');
  }
}

// L1: allowlist roluri + normalizare/validare username
const ALLOWED_ROLES = ['keyuser','contabilitate','agent','sub-agent','sofer','ajutor_manipulant'];

function validateUsername(raw: string): string {
  const u = String(raw ?? '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(u)) throw new Error('Invalid username');
  return u;
}

function validateRole(role: string): void {
  if (!ALLOWED_ROLES.includes(role)) throw new Error('Invalid role');
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

    // Client user — verifică că cel care apelează e autentificat
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user: callerUser }, error: callerErr } = await caller.auth.getUser()
    if (callerErr || !callerUser) throw new Error('Unauthorized')

    // Citim body-ul o singură dată înainte de verificarea rolului
    const { action, payload } = await req.json()

    // M-C: verifică role + active pentru toate acțiunile privilegiate
    // clear_must_change_password e permis oricărui user autentificat (pentru propriul cont)
    const requiresAdmin = action !== 'clear_must_change_password'

    if (requiresAdmin) {
      const { data: callerProfile } = await admin
        .from('profiles')
        .select('role, active')
        .eq('id', callerUser.id)
        .single()

      if (callerProfile?.role !== 'keyuser' || callerProfile?.active !== true) {
        throw new Error('Forbidden')
      }
    }

    let result: Record<string, unknown> = {}

    if (action === 'create') {
      // L1: validare username + rol înainte de orice altceva
      const username = validateUsername(payload.username)
      validateRole(payload.role)
      // V6: validare parolă înainte de creare
      validatePassword(payload.password)

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email:          `${username}@depozit.internal`,
        password:       payload.password,
        email_confirm:  true,
      })
      if (createErr) throw createErr

      const { error: profileErr } = await admin.from('profiles').insert({
        id:                   created.user.id,
        username:             username,
        name:                 payload.name,
        role:                 payload.role,
        active:               true,
        must_change_password: payload.must_change_password ?? true,
      })
      if (profileErr) throw profileErr

      result = { id: created.user.id }

    } else if (action === 'update') {
      // L1: validare rol la update
      validateRole(payload.role)

      const updateData: Record<string, unknown> = {
        name:   payload.name,
        role:   payload.role,
        active: payload.active,
      }
      if (payload.must_change_password !== undefined) {
        updateData['must_change_password'] = payload.must_change_password
      }

      const { error } = await admin
        .from('profiles')
        .update(updateData)
        .eq('username', payload.username)

      if (error) throw error

      // V1b: la dezactivare, revocă toate sesiunile active ale utilizatorului
      if (payload.active === false) {
        const { data: profile } = await admin
          .from('profiles')
          .select('id')
          .eq('username', payload.username)
          .single()

        if (profile?.id) {
          await admin.auth.admin.signOut(profile.id as string)
        }
      }

      result = { success: true }

    } else if (action === 'reset_password') {
      if (!payload.userId) throw new Error('Missing userId')

      // V6: validare parolă înainte de reset
      validatePassword(payload.password)

      const { error } = await admin.auth.admin.updateUserById(payload.userId as string, {
        password: payload.password as string,
      })
      if (error) throw error

      await admin
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', payload.userId)

      result = { success: true }

    } else if (action === 'delete') {
      if (!payload.userId) throw new Error('Missing userId')

      const { error } = await admin.auth.admin.deleteUser(payload.userId as string)
      if (error) throw error

      result = { success: true }

    } else if (action === 'clear_must_change_password') {
      // L-A: curăță flag-ul must_change_password pentru user-ul curent (service_role bypass trigger)
      const { error } = await admin
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', callerUser.id)
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
