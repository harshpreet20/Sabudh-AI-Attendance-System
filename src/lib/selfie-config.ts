import { createServiceClient } from '@/lib/supabase/service'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'
const SETTINGS_KEY = 'attendance_selfie'

export interface SelfieConfig {
  enabled: boolean
  /** Reference photos of the classroom (for re-analysis / admin preview). */
  references: string[]
  /** One-time OpenAI "understanding" of the room, reused for every selfie. */
  description: string
}

const EMPTY: SelfieConfig = { enabled: false, references: [], description: '' }

export async function getSelfieConfig(): Promise<SelfieConfig> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  const v = (data?.value ?? {}) as Partial<SelfieConfig>
  return {
    enabled: Boolean(v.enabled),
    references: Array.isArray(v.references) ? v.references : [],
    description: typeof v.description === 'string' ? v.description : '',
  }
}

export async function setSelfieConfig(cfg: SelfieConfig): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('system_settings').upsert(
    {
      organization_id: ORG_ID,
      key: SETTINGS_KEY,
      value: cfg,
      description: 'Class selfie verification (room understanding + face match)',
    },
    { onConflict: 'organization_id,key' }
  )
}

export { EMPTY as EMPTY_SELFIE_CONFIG }
