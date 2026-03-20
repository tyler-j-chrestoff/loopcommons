import { defineTool } from '@loopcommons/llm';
import type { ToolPackage } from '@loopcommons/llm';
import { z } from 'zod';

const sections = ['experience', 'skills', 'education', 'certifications', 'all'] as const;
type Section = (typeof sections)[number];

type ExperienceEntry = {
  role: string;
  company: string;
  location: string;
  period: string;
  highlights: string[];
};

const summary =
  'Senior Data Engineer with 10+ years building reliable, scalable data systems across batch and streaming. Strong focus on data modeling, ETL/ELT pipelines, orchestration, cost-aware cloud architecture, and ML enablement. Known for simplifying complex systems, mentoring engineers, and delivering measurable business impact.';

const experience: ExperienceEntry[] = [
  {
    role: 'Lead Data Platform Engineer',
    company: 'Root Insurance',
    location: 'Columbus, Ohio',
    period: 'Sep 2024 – Jul 2025',
    highlights: [
      'Promoted from Senior; continued ownership of data platform strategy and architecture',
    ],
  },
  {
    role: 'Senior Data Platform Engineer',
    company: 'Root Insurance',
    location: 'Columbus, Ohio',
    period: 'Sep 2021 – Sep 2024',
    highlights: [
      'Designed and built ML-ready data marts using dimensional modeling, reducing LTV-model development cycles by 50%',
      'Architected event-driven streaming pipeline (Python, Kinesis, Lambda) delivering partner funnel data with sub-minute latency from 10+ embedded insurance integrations',
      'Owned and scaled internal data orchestration platform (Rails + Python) running 400+ daily ETL jobs',
      'Built serverless data pipelines on AWS (Lambda, SQS/SNS, S3, Kinesis) processing millions of events daily',
      'Administered 100+ TB Amazon Redshift data warehouse; optimized for 100+ concurrent queries via WLM tuning',
      'Led orchestration tool evaluation (Airflow, Dagster) to modernize legacy scheduling infrastructure',
      'Mentored 5 engineers through AWS certification study group; all obtained Data Engineer Associate certification',
    ],
  },
  {
    role: 'Data Platform Engineer',
    company: 'Root Insurance',
    location: 'Columbus, Ohio',
    period: 'May 2019 – Sep 2021',
    highlights: [
      'Built foundational data pipelines and ETL infrastructure supporting Analytics, Data Science, and Actuarial teams',
    ],
  },
  {
    role: 'Software Engineer',
    company: 'Dynamit',
    location: 'Columbus, Ohio',
    period: 'May 2018 – Apr 2019',
    highlights: [
      'Delivered information architecture and authoring experiences using Crownpeak CMS + ASP.NET for National Grid',
      'Built Sitecore–Eventbrite integration to centralize hospital event creation and management',
      'Supported legacy apps (PhoneGap, Angular) and multiple Hippo CMS sites',
    ],
  },
  {
    role: 'IT Director',
    company: 'Capital.Energy',
    location: 'Columbus, Ohio',
    period: 'Jun 2016 – May 2018',
    highlights: [
      'Owned core IT infrastructure and data systems; built integrations and automated reporting pipelines',
      'Introduced Git-based version control and CI/CD practices, reducing deployment failures',
    ],
  },
  {
    role: 'Software Developer',
    company: 'Village Communities',
    location: 'Columbus, Ohio',
    period: 'Jun 2015 – Jun 2016',
    highlights: [
      'Built C# ETL application replacing legacy batch scripts; automated daily data transfers with SQL Server audit logging',
      'Developed Excel/CSV data import tool, eliminating manual data entry for bulk accounting uploads',
    ],
  },
  {
    role: 'Software Developer',
    company: 'Broadview Instrumentation Services',
    location: 'Valley View, Ohio',
    period: 'Aug 2012 – May 2015',
    highlights: [
      'Developed C# applications for automated control and data acquisition from precision instrumentation (calibrators, oscilloscopes, piston gauges)',
    ],
  },
];

const skills: Record<string, string[]> = {
  'Data Engineering': ['ETL/ELT Pipelines', 'Data Modeling', 'Dimensional Modeling', 'Data Warehousing', 'Stream Processing', 'Batch Processing', 'Data Quality', 'Pipeline Orchestration'],
  'Languages': ['Python', 'SQL', 'Ruby', 'C#', 'JavaScript'],
  'Languages (Familiar)': ['Rust', 'Go', 'Java'],
  'Databases & Warehouses': ['Amazon Redshift', 'PostgreSQL', 'SQL Server', 'MySQL'],
  'AWS': ['Lambda', 'Kinesis', 'SQS/SNS', 'S3', 'EC2', 'ECS', 'Redshift', 'IAM', 'CloudFormation', 'Step Functions'],
  'Tools & Frameworks': ['PySpark', 'Terraform', 'Buildkite', 'Rails', 'Git'],
  'AI/ML': ['ML pipeline deployment', 'LLM integration', 'Agentic tooling (Claude Code, Copilot, Codex)'],
};

const certifications = [
  'AWS Certified Data Engineer – Associate',
  'AWS Certified Cloud Practitioner',
];

function formatExperience(entries: ExperienceEntry[]): string {
  return entries
    .map(e => `**${e.role}** at ${e.company}, ${e.location} (${e.period})\n${e.highlights.map(h => `- ${h}`).join('\n')}`)
    .join('\n\n');
}

function formatSkills(grouped: Record<string, string[]>): string {
  return Object.entries(grouped)
    .map(([category, items]) => `**${category}**: ${items.join(', ')}`)
    .join('\n');
}

function formatCertifications(certs: string[]): string {
  return certs.map(c => `- ${c}`).join('\n');
}

function getSection(section: Section): string {
  switch (section) {
    case 'experience':
      return `## Summary\n\n${summary}\n\n## Experience\n\n${formatExperience(experience)}`;
    case 'skills':
      return `## Skills\n\n${formatSkills(skills)}`;
    case 'education':
      return `Tyler's resume focuses on professional experience and certifications rather than formal education.`;
    case 'certifications':
      return `## Certifications\n\n${formatCertifications(certifications)}`;
    case 'all':
      return [getSection('experience'), getSection('skills'), getSection('certifications')].join('\n\n');
  }
}

export const resumeTool = defineTool({
  name: 'get_resume',
  description:
    'Retrieve information about Tyler\'s professional background. Use this when users ask about Tyler\'s experience, skills, education, certifications, or qualifications.',
  parameters: z.object({
    section: z
      .enum(sections)
      .default('all')
      .describe('Which section of the resume to retrieve'),
  }),
  execute: async ({ section }) => getSection(section),
});

export function createResumePackage(): ToolPackage {
  return {
    tools: [resumeTool],
    formatContext: () => '',
    metadata: {
      name: 'resume',
      capabilities: ['resume-lookup'],
      intent: ['resume'],
      sideEffects: false,
    },
  };
}
