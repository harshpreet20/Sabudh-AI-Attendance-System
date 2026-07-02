import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: budget } = await supabase
    .from('ai_budget_config')
    .select('*')
    .eq('organization_id', ORG_ID)
    .single()

  if (!budget) {
    return NextResponse.json({ budget_inr: 500, spent_inr: 0, remaining_inr: 500, period_months: 2 })
  }

  const periodStart = new Date(budget.period_start)
  const periodEnd = new Date(periodStart)
  periodEnd.setMonth(periodEnd.getMonth() + budget.period_months)

  const { data: usage } = await supabase
    .from('ai_token_usage')
    .select('cost_inr')
    .eq('organization_id', ORG_ID)
    .gte('created_at', periodStart.toISOString())
    .lte('created_at', periodEnd.toISOString())

  const spent = (usage ?? []).reduce((sum, u) => sum + Number(u.cost_inr), 0)

  return NextResponse.json({
    budget_inr: Number(budget.budget_inr),
    spent_inr: Math.round(spent * 100) / 100,
    remaining_inr: Math.round((Number(budget.budget_inr) - spent) * 100) / 100,
    period_months: budget.period_months,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
  })
}
