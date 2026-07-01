'use client'

import {
  RadialBarChart,
  RadialBar,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface EngagementRadialData {
  name: string
  value: number
  fill: string
}

interface EngagementLineData {
  label: string
  attendance: number
  assignments: number
  discussions: number
}

interface EngagementRadarData {
  metric: string
  score: number
  fullMark: number
}

const DEFAULT_RADIAL_DATA: EngagementRadialData[] = [
  { name: 'Attendance', value: 0, fill: '#6366f1' },
  { name: 'Assignments', value: 0, fill: '#10b981' },
  { name: 'Discussions', value: 0, fill: '#f59e0b' },
  { name: 'Projects', value: 0, fill: '#ec4899' },
]

const DEFAULT_LINE_DATA: EngagementLineData[] = [
  { label: 'Week 1', attendance: 0, assignments: 0, discussions: 0 },
]

const DEFAULT_RADAR_DATA: EngagementRadarData[] = [
  { metric: 'Attendance', score: 0, fullMark: 100 },
  { metric: 'Assignments', score: 0, fullMark: 100 },
  { metric: 'Discussions', score: 0, fullMark: 100 },
  { metric: 'Timeliness', score: 0, fullMark: 100 },
  { metric: 'Projects', score: 0, fullMark: 100 },
  { metric: 'Participation', score: 0, fullMark: 100 },
]

export function EngagementRadialChart({
  data = DEFAULT_RADIAL_DATA,
  title = 'Engagement Overview',
}: {
  data?: EngagementRadialData[]
  title?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="20%"
            outerRadius="90%"
            barSize={16}
            data={data}
            startAngle={180}
            endAngle={0}
          >
            <RadialBar
              background={{ fill: 'rgba(0,0,0,0.04)' }}
              dataKey="value"
              cornerRadius={8}
            />
            <Legend
              iconSize={10}
              layout="horizontal"
              verticalAlign="bottom"
              wrapperStyle={{ fontSize: '12px' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '12px',
                fontSize: '12px',
              }}
              formatter={(value) => [`${value}%`, '']}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function EngagementLineChart({
  data = DEFAULT_LINE_DATA,
  title = 'Weekly Engagement Trends',
}: {
  data?: EngagementLineData[]
  title?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '12px',
                fontSize: '12px',
              }}
              formatter={(value) => [`${value}%`, '']}
            />
            <Line
              type="monotone"
              dataKey="attendance"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, fill: '#6366f1' }}
              name="Attendance"
            />
            <Line
              type="monotone"
              dataKey="assignments"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, fill: '#10b981' }}
              name="Assignments"
            />
            <Line
              type="monotone"
              dataKey="discussions"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 4, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 6, fill: '#f59e0b' }}
              name="Discussions"
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

export function EngagementRadarChart({
  data = DEFAULT_RADAR_DATA,
  title = 'Student Engagement Profile',
}: {
  data?: EngagementRadarData[]
  title?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
            <PolarGrid stroke="rgba(0,0,0,0.08)" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fontSize: 11, fill: '#6b7280' }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={{ fontSize: 10 }}
              axisLine={false}
            />
            <Radar
              name="Score"
              dataKey="score"
              stroke="#6366f1"
              fill="#6366f1"
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '12px',
                fontSize: '12px',
              }}
              formatter={(value) => [`${value}%`, '']}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
