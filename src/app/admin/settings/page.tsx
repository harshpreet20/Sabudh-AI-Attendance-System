import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/helpers'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Settings, Building2, Globe } from 'lucide-react'
import { SelfieVerificationSettings } from '@/components/admin/selfie-verification-settings'
import type { SystemSetting, Organization } from '@/types/database'

export default async function AdminSettingsPage() {
  await requireAdmin()
  const supabase = await createClient()

  const { data: settings } = await supabase
    .from('system_settings')
    .select('*')
    .order('key')

  const { data: organization } = await supabase
    .from('organizations')
    .select('*')
    .limit(1)
    .single()

  const systemSettings = (settings as SystemSetting[]) ?? []
  const org = organization as Organization | null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and manage system configuration
        </p>
      </div>

      {org && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              Organization
            </CardTitle>
            <CardDescription>Your organization details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-500">
                  Name
                </label>
                <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-900">
                  {org.name}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-500">
                  Slug
                </label>
                <div className="rounded-lg bg-gray-50 px-3 py-2.5 font-mono text-sm text-gray-900">
                  {org.slug}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-500">
                  Timezone
                </label>
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-900">
                  <Globe className="h-4 w-4 text-gray-400" />
                  {org.timezone}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-500">
                  Created
                </label>
                <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-900">
                  {new Date(org.created_at).toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-500" />
            System Settings
          </CardTitle>
          <CardDescription>
            Configuration parameters for the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          {systemSettings.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              No system settings configured yet.
            </p>
          ) : (
            <div className="space-y-3">
              {systemSettings.map((setting) => (
                <div
                  key={setting.id}
                  className="rounded-lg border border-gray-100 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {setting.key}
                      </p>
                      {setting.description && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {setting.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 rounded bg-gray-50 px-3 py-2">
                    <pre className="text-xs text-gray-700 overflow-x-auto">
                      {JSON.stringify(setting.value, null, 2)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SelfieVerificationSettings />
    </div>
  )
}
