import type OpenAI from 'openai'

// Multi-agent orchestration: an orchestrator plans which specialised agents to
// invoke for a user request, runs them (in parallel) against the shared lecture
// context, then synthesises their outputs into one coherent answer.

export interface AgentDef {
  key: string
  name: string
  emoji: string
  description: string
  system: string
}

export const AGENTS: AgentDef[] = [
  {
    key: 'teacher',
    name: 'Teacher Agent',
    emoji: '👨‍🏫',
    description: 'Explains concepts, generates lesson explanations and homework.',
    system:
      'You are the Teacher Agent. Explain concepts clearly and rigorously using the lecture context. When asked, produce lesson explanations, worked examples, or homework. Be accurate; if the lecture context does not cover something, say so briefly.',
  },
  {
    key: 'student',
    name: 'Study Coach',
    emoji: '🎓',
    description: 'Answers questions and gives hints without doing the work for you.',
    system:
      'You are the Study Coach (Student Agent). Answer the learner\'s question and give guiding hints and study strategies. For practice problems, prefer hints and step-by-step guidance over just the final answer. Encourage independent thinking.',
  },
  {
    key: 'research',
    name: 'Research Agent',
    emoji: '🔎',
    description: 'Finds references, validates claims and suggests further resources.',
    system:
      'You are the Research Agent. Validate statements against the lecture context, surface related concepts, and suggest further reading (topics, canonical papers/books, reputable sources). You cannot browse the live web — be honest, do not fabricate URLs; suggest search terms and well-known references only.',
  },
  {
    key: 'quiz',
    name: 'Quiz Agent',
    emoji: '❓',
    description: 'Creates assessments, grades responses and explains mistakes.',
    system:
      'You are the Quiz Agent. Create targeted practice questions (with answers + explanations) from the lecture context, or evaluate a learner\'s answer and explain any mistakes clearly.',
  },
  {
    key: 'whiteboard',
    name: 'Whiteboard Agent',
    emoji: '🧑‍🎨',
    description: 'Structures visual explanations, diagrams and mind maps.',
    system:
      'You are the Whiteboard Agent. Produce a clear visual/structural explanation: a mind-map or flow outline, and where useful a Mermaid diagram in a ```mermaid code block. Keep it well-organised and easy to redraw on a board.',
  },
  {
    key: 'notes',
    name: 'Notes Agent',
    emoji: '📝',
    description: 'Summarises lectures and extracts key concepts and revision notes.',
    system:
      'You are the Notes Agent. Produce concise summaries, revision notes and extracted key concepts/definitions from the lecture context. Use tight bullet points.',
  },
]

const AGENT_BY_KEY = new Map(AGENTS.map((a) => [a.key, a]))
const MODEL = 'gpt-4o-mini'
const MAX_AGENTS = 3

export interface AgentOutput {
  agent: string
  name: string
  emoji: string
  task: string
  output: string
}

export interface OrchestrationResult {
  answer: string
  plan: Array<{ agent: string; task: string }>
  agentOutputs: AgentOutput[]
}

interface Plan {
  reasoning?: string
  agents?: Array<{ agent: string; task: string }>
}

// 1) Plan: pick the most relevant agents (max 3) and a sub-task for each.
async function planTasks(openai: OpenAI, context: string, question: string): Promise<Plan> {
  const roster = AGENTS.map((a) => `- ${a.key}: ${a.description}`).join('\n')
  const prompt = `You are the Orchestrator for a lecture-learning AI team. Choose the MINIMAL set of agents (1 to ${MAX_AGENTS}) needed to best answer the user, and give each a focused sub-task. Avoid duplicate work.

Available agents:
${roster}

User request: "${question}"

Lecture context (excerpt):
${context.slice(0, 2500)}

Return JSON: {"reasoning":"short","agents":[{"agent":"<key>","task":"<specific instruction>"}]}. Only use agent keys from the list.`

  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })
    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}') as Plan
    const agents = (parsed.agents || []).filter((a) => AGENT_BY_KEY.has(a.agent)).slice(0, MAX_AGENTS)
    return { reasoning: parsed.reasoning, agents: agents.length ? agents : [{ agent: 'teacher', task: question }] }
  } catch {
    return { agents: [{ agent: 'teacher', task: question }] }
  }
}

// 2) Run one agent against its sub-task.
async function runAgent(openai: OpenAI, def: AgentDef, task: string, context: string): Promise<string> {
  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: `${def.system}\n\nLECTURE CONTEXT:\n${context.slice(0, 6000)}` },
        { role: 'user', content: task },
      ],
      max_tokens: 700,
      temperature: 0.6,
    })
    return res.choices[0]?.message?.content?.trim() || ''
  } catch (err) {
    console.error('[agents] runAgent failed:', def.key, err instanceof Error ? err.message : err)
    return ''
  }
}

// 3) Synthesise agent outputs into one coherent answer.
async function synthesize(openai: OpenAI, question: string, outputs: AgentOutput[]): Promise<string> {
  if (outputs.length === 1) return outputs[0].output
  const merged = outputs.map((o) => `## ${o.name}\n${o.output}`).join('\n\n')
  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are the Orchestrator. Merge the specialist agents\' outputs into ONE clear, non-repetitive answer for the learner. Keep the best of each, remove duplication, maintain a consistent voice, and use Markdown (headings/bullets/code where useful). Do not mention the agents by name in the final answer.',
        },
        { role: 'user', content: `User asked: "${question}"\n\nAgent outputs:\n\n${merged}` },
      ],
      max_tokens: 900,
      temperature: 0.4,
    })
    return res.choices[0]?.message?.content?.trim() || merged
  } catch {
    return merged
  }
}

export async function orchestrate(openai: OpenAI, context: string, question: string): Promise<OrchestrationResult> {
  const plan = await planTasks(openai, context, question)
  const planned = plan.agents || []

  const agentOutputs: AgentOutput[] = (
    await Promise.all(
      planned.map(async (p) => {
        const def = AGENT_BY_KEY.get(p.agent)!
        const output = await runAgent(openai, def, p.task, context)
        return output ? { agent: def.key, name: def.name, emoji: def.emoji, task: p.task, output } : null
      }),
    )
  ).filter(Boolean) as AgentOutput[]

  if (agentOutputs.length === 0) {
    return { answer: 'I could not generate a response from the lecture material. Please try rephrasing.', plan: planned, agentOutputs: [] }
  }

  const answer = await synthesize(openai, question, agentOutputs)
  return { answer, plan: planned, agentOutputs }
}
