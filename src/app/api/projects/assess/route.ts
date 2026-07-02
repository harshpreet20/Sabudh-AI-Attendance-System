import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

const AI_ASSESSABLE_EXPERTISE = ['dsa', 'ml', 'gen_ai', 'data_science', 'web_dev']

const EXPERTISE_PROMPTS: Record<string, string> = {
  dsa: `You are an expert DSA (Data Structures & Algorithms) assessor. Evaluate the student's code for:
- Correctness of the algorithm
- Time and space complexity analysis
- Code quality and readability
- Edge case handling
- Proper use of data structures`,

  ml: `You are an expert Machine Learning assessor. Evaluate the student's work for:
- Model selection and justification
- Data preprocessing and feature engineering
- Training methodology and hyperparameter tuning
- Evaluation metrics and interpretation
- Code quality and documentation`,

  gen_ai: `You are an expert Generative AI assessor. Evaluate the student's work for:
- Prompt engineering quality
- Model selection and API usage
- Output quality and relevance
- Error handling and edge cases
- Creative application of Gen AI concepts`,

  data_science: `You are an expert Data Science assessor. Evaluate the student's work for:
- Data exploration and cleaning methodology
- Statistical analysis and visualization quality
- Insight generation and storytelling
- Code quality and reproducibility
- Proper use of libraries and tools`,

  web_dev: `You are an expert Web Development assessor. Evaluate the student's work for:
- Code structure and organization
- UI/UX design and responsiveness
- Functionality and feature completeness
- Security best practices
- Performance considerations`,
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: role } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!role || !['instructor', 'admin', 'super_admin'].includes(role.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { submissionId, projectId } = body

  if (!submissionId || !projectId) {
    return NextResponse.json({ error: 'Missing submissionId or projectId' }, { status: 400 })
  }

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  if (!AI_ASSESSABLE_EXPERTISE.includes(project.expertise)) {
    return NextResponse.json({
      error: `AI assessment is not available for "${project.expertise}" projects. Only available for: ${AI_ASSESSABLE_EXPERTISE.join(', ')}`,
    }, { status: 400 })
  }

  const { data: budget } = await supabase
    .from('ai_budget_config')
    .select('*')
    .eq('organization_id', ORG_ID)
    .single()

  if (budget) {
    const periodStart = new Date(budget.period_start)
    const periodEnd = new Date(periodStart)
    periodEnd.setMonth(periodEnd.getMonth() + budget.period_months)

    const { data: usage } = await supabase
      .from('ai_token_usage')
      .select('cost_inr')
      .eq('organization_id', ORG_ID)
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString())

    const totalSpent = (usage ?? []).reduce((sum, u) => sum + Number(u.cost_inr), 0)

    if (totalSpent >= budget.budget_inr) {
      return NextResponse.json({
        error: `AI budget exhausted. Spent ₹${totalSpent.toFixed(2)} of ₹${budget.budget_inr} limit for this ${budget.period_months}-month period.`,
      }, { status: 429 })
    }
  }

  const { data: submission } = await supabase
    .from('project_submissions')
    .select('*')
    .eq('id', submissionId)
    .single()

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  const { data: student } = await supabase
    .from('student_profiles')
    .select('full_name')
    .eq('id', submission.student_id)
    .single()

  const expertisePrompt = EXPERTISE_PROMPTS[project.expertise] ?? EXPERTISE_PROMPTS.dsa

  const submissionContent = [
    `Project: ${project.title}`,
    project.description ? `Description: ${project.description}` : '',
    project.objectives ? `Objectives: ${project.objectives}` : '',
    project.requirements ? `Requirements: ${project.requirements}` : '',
    `Max Score: ${project.max_score}`,
    `\nStudent: ${student?.full_name ?? 'Unknown'}`,
    submission.title ? `Submission Title: ${submission.title}` : '',
    submission.content ? `Student's Work:\n${submission.content}` : '',
    submission.demo_url ? `Demo URL: ${submission.demo_url}` : '',
    submission.file_urls?.length > 0
      ? `Attached files: ${submission.file_urls.map((u: string) => u.split('/').pop()).join(', ')}`
      : '',
  ].filter(Boolean).join('\n')

  try {
    const openai = getOpenAI()
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `${expertisePrompt}

Provide your assessment as a JSON object with these fields:
- "score": integer from 0 to ${project.max_score}
- "summary": 1-2 sentence overall assessment
- "strengths": array of 2-4 key strengths
- "improvements": array of 2-4 areas for improvement
- "detailed_feedback": 2-3 paragraph detailed feedback
- "expertise_specific": object with expertise-specific metrics

Respond ONLY with valid JSON, no markdown.`,
        },
        {
          role: 'user',
          content: submissionContent,
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    })

    const inputTokens = response.usage?.prompt_tokens ?? 0
    const outputTokens = response.usage?.completion_tokens ?? 0

    const costPer1kInput = 0.000150 * 85
    const costPer1kOutput = 0.000600 * 85
    const costInr = (inputTokens / 1000) * costPer1kInput + (outputTokens / 1000) * costPer1kOutput

    let assessment: Record<string, unknown>
    try {
      const raw = response.choices[0]?.message?.content ?? '{}'
      assessment = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
    } catch {
      assessment = {
        summary: response.choices[0]?.message?.content ?? 'Assessment completed',
        score: Math.round(project.max_score * 0.7),
        strengths: [],
        improvements: [],
        detailed_feedback: response.choices[0]?.message?.content ?? '',
      }
    }

    const aiScore = typeof assessment.score === 'number'
      ? Math.min(Math.max(0, assessment.score), project.max_score)
      : null

    await supabase
      .from('project_submissions')
      .update({
        ai_assessment: assessment,
        ai_score: aiScore,
        ai_tokens_used: inputTokens + outputTokens,
      })
      .eq('id', submissionId)

    await supabase.from('ai_token_usage').insert({
      organization_id: ORG_ID,
      user_id: user.id,
      action: 'project_assessment',
      model: 'gpt-4o-mini',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_inr: costInr,
      metadata: { project_id: projectId, submission_id: submissionId, expertise: project.expertise },
    })

    return NextResponse.json({
      assessment,
      ai_score: aiScore,
      tokens_used: inputTokens + outputTokens,
      cost_inr: costInr,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI assessment failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
