/**
 * AI Service for BossBoard
 *
 * Supports both:
 * - Anthropic Claude API (cloud)
 * - LM Studio local LLM (OpenAI-compatible endpoint)
 *
 * Handles AI-powered features:
 * - Hazard identification and suggestions
 * - Control measure recommendations
 * - Document completion assistance
 */

import Anthropic from '@anthropic-ai/sdk';

// Configuration - supports local LM Studio, cloud Anthropic, or mock (Phase 6a)
// MOCK_CLAUDE === 'true' is the canonical Phase 6a per-service flag.
// MOCK_EXTERNAL_SERVICES === 'true' is retained as a backward-compat master
// switch that mocks Anthropic (alongside Stripe + Resend) for existing
// scripts / docs that still set the legacy flag.
const MOCK_EXTERNAL =
  process.env.MOCK_CLAUDE === 'true' ||
  process.env.MOCK_EXTERNAL_SERVICES === 'true';
// When MOCK_CLAUDE/MOCK_EXTERNAL_SERVICES=true, route through the Anthropic
// SDK path so the mock can monkey-patch messages.create — bypass the
// LM-Studio branch.
const USE_LOCAL_LLM = !MOCK_EXTERNAL && (
  process.env.USE_LOCAL_LLM === 'true' || !process.env.ANTHROPIC_API_KEY
);
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234';
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || 'qwen/qwen3-vl-4b';
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 2048;

// Initialize Anthropic client once at module level.
// When mocking, we instantiate with a stub key — the mock monkey-patches
// messages.create() before any HTTP call would happen.
const anthropicClient: Anthropic | null = (() => {
  if (MOCK_EXTERNAL) {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || 'sk-ant-mock-phase6a-stub-key',
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { installClaudeMock } = require('./mocks/claude-mock.js');
    installClaudeMock(client);
    console.log('[AI] MOCK_CLAUDE=true — Anthropic SDK mocked');
    return client;
  }
  if (!USE_LOCAL_LLM && process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return null;
})();

console.log(`AI Service initialized: ${MOCK_EXTERNAL ? 'Anthropic (MOCKED — Phase 6a, MOCK_CLAUDE)' : USE_LOCAL_LLM ? `LM Studio (local) - ${LM_STUDIO_MODEL}` : 'Anthropic (cloud)'}`);

// Timeout for LM Studio calls (30 seconds)
const LM_STUDIO_TIMEOUT = 30000;

/**
 * Unified chat completion that works with both LM Studio and Anthropic
 */
async function chatCompletion(prompt: string): Promise<string> {
  if (USE_LOCAL_LLM) {
    // Use OpenAI-compatible endpoint for LM Studio
    const url = `${LM_STUDIO_URL}/v1/chat/completions`;
    console.log(`[AI] Calling LM Studio at ${url}`);
    console.log(`[AI] Model: ${LM_STUDIO_MODEL}`);
    console.log(`[AI] Prompt length: ${prompt.length} chars`);

    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LM_STUDIO_TIMEOUT);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LM_STUDIO_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: MAX_TOKENS,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      const elapsed = Date.now() - startTime;
      console.log(`[AI] LM Studio responded in ${elapsed}ms with status ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AI] LM Studio error response: ${errorText}`);
        throw new Error(`LM Studio error: ${response.status} ${response.statusText}`);
      }

      const data: any = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('[AI] Unexpected LM Studio response structure:', JSON.stringify(data).slice(0, 500));
        throw new Error('Unexpected LM Studio response format');
      }

      const content = data.choices[0].message.content;
      console.log(`[AI] LM Studio returned ${content.length} chars`);
      console.log(`[AI] Response preview: ${content.slice(0, 200)}...`);

      return content;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.error(`[AI] LM Studio request timed out after ${LM_STUDIO_TIMEOUT}ms`);
          throw new Error('LM Studio request timed out');
        }
        if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
          console.error(`[AI] Cannot connect to LM Studio at ${LM_STUDIO_URL}. Is it running?`);
        }
        console.error(`[AI] LM Studio call failed: ${error.message}`);
      }
      throw error;
    } finally {
      // Always clear the timeout so the timer doesn't keep the process alive
      // (Jest workers hang on this in CI, failing the run)
      clearTimeout(timeoutId);
    }
  } else {
    // Use Anthropic API
    if (!anthropicClient) {
      throw new Error('Anthropic client not initialized - missing ANTHROPIC_API_KEY');
    }

    const response = await anthropicClient.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }
    return content.text;
  }
}

/**
 * Parse JSON from LLM response, handling common issues including truncated responses
 */
function parseJsonResponse<T>(text: string): T {
  // Remove markdown code blocks if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Try to find JSON array or object
  const jsonMatch = cleaned.match(/[\[\{][\s\S]*[\]\}]/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    // Try to fix common truncation issues for arrays
    if (cleaned.startsWith('[')) {
      // Find the last complete array item
      const lastValidComma = cleaned.lastIndexOf('",');
      if (lastValidComma > 0) {
        const fixedArray = cleaned.slice(0, lastValidComma + 1) + ']';
        console.log(`[AI] Attempting to fix truncated array (cut at position ${lastValidComma})`);
        try {
          return JSON.parse(fixedArray);
        } catch {
          // Continue to throw original error
        }
      }
    }

    // Try to fix common truncation issues for objects
    if (cleaned.startsWith('{')) {
      // This is harder to fix, just throw the error
    }

    throw firstError;
  }
}

/**
 * Generate hazard suggestions based on job details
 */
export async function generateHazardSuggestions(
  tradeType: string,
  jobDescription: string,
  siteDetails: string
): Promise<string[]> {
  try {
    const prompt = `You are a NZ workplace health and safety expert. Given the following job details, suggest specific hazards that should be considered for the Safe Work Method Statement (SWMS).

Trade: ${tradeType}
Job Description: ${jobDescription}
Site Details: ${siteDetails}

Focus on NZ-specific regulations:
- Health and Safety at Work Act 2015
- WorkSafe NZ guidelines
- Trade-specific regulations

Return a JSON array of hazard strings. Each hazard should be specific and practical. Include both common and job-specific hazards.

Example format:
["Working at height on ladder without fall protection", "Exposed live electrical circuits in switchboard", "Asbestos cement sheeting in ceiling cavity"]

Return ONLY the JSON array, no other text or explanation.`;

    const response = await chatCompletion(prompt);
    return parseJsonResponse<string[]>(response);
  } catch (error) {
    console.error('[AI] Error generating hazard suggestions:', error instanceof Error ? error.message : error);
    console.log(`[AI] Falling back to default hazards for trade: ${tradeType}`);
    // Return default hazards on error
    return getDefaultHazards(tradeType);
  }
}

/**
 * Generate control measures for identified hazards
 */
export async function generateControlMeasures(
  hazards: string[],
  tradeType: string
): Promise<Record<string, ControlMeasure>> {
  try {
    const prompt = `You are a NZ workplace health and safety expert. For each hazard listed, provide specific control measures following the hierarchy of controls:

1. Elimination - Remove the hazard entirely
2. Substitution - Replace with something safer
3. Engineering - Isolate people from the hazard
4. Administrative - Change how work is done
5. PPE - Personal protective equipment (last resort)

Trade: ${tradeType}
Hazards: ${JSON.stringify(hazards)}

For each hazard, provide:
- Primary control (the main control measure)
- Control type (elimination/substitution/engineering/administrative/ppe)
- Additional controls (list of supporting measures)
- PPE required (specific items)
- NZ regulation reference (if applicable)

Return a JSON object where keys are the hazards and values follow this structure:
{
  "hazard text here": {
    "primaryControl": "Main control measure",
    "controlType": "engineering",
    "additionalControls": ["Control 1", "Control 2"],
    "ppeRequired": ["Item 1", "Item 2"],
    "regulationReference": "WorkSafe guidance on X"
  }
}

Return ONLY the JSON object, no other text.`;

    const response = await chatCompletion(prompt);
    return parseJsonResponse<Record<string, ControlMeasure>>(response);
  } catch (error) {
    console.error('[AI] Error generating control measures:', error instanceof Error ? error.message : error);
    console.log(`[AI] Falling back to default control measures for ${hazards.length} hazards`);
    // Return default controls on error
    return getDefaultControls(hazards);
  }
}

/**
 * Generate risk assessment suggestions
 */
export async function generateRiskAssessment(
  activity: string,
  location: string,
  tradeType: string
): Promise<RiskAssessmentSuggestion[]> {
  try {
    const prompt = `You are a NZ workplace health and safety expert. Generate a risk assessment for the following activity.

Activity: ${activity}
Location: ${location}
Trade: ${tradeType}

For each potential hazard, assess:
- Hazard description
- Potential harm and who is affected
- Likelihood (1-5): 1=Rare, 2=Unlikely, 3=Possible, 4=Likely, 5=Almost Certain
- Consequence (1-5): 1=Insignificant, 2=Minor, 3=Moderate, 4=Major, 5=Catastrophic
- Suggested controls (following hierarchy)
- Residual risk after controls

Return a JSON array of risk assessments:
[
  {
    "hazard": "Hazard description",
    "potentialHarm": "What harm could occur and to whom",
    "likelihood": 3,
    "consequence": 4,
    "riskRating": 12,
    "controls": ["Control 1", "Control 2"],
    "residualLikelihood": 2,
    "residualConsequence": 3,
    "residualRisk": 6
  }
]

Focus on NZ-specific risks and WorkSafe guidance. Return ONLY the JSON array.`;

    const response = await chatCompletion(prompt);
    return parseJsonResponse<RiskAssessmentSuggestion[]>(response);
  } catch (error) {
    console.error('Error generating risk assessment:', error);
    throw new Error('Failed to generate risk assessment');
  }
}

/**
 * Complete SWMS section with AI suggestions
 */
export async function completeSWMSSection(
  templateType: string,
  sectionId: string,
  existingData: Record<string, unknown>,
  context: string
): Promise<Record<string, unknown>> {
  try {
    const prompt = `You are a NZ workplace health and safety expert helping complete a Safe Work Method Statement.

Template Type: ${templateType}
Section: ${sectionId}
Existing Data: ${JSON.stringify(existingData)}
Context: ${context}

Based on the context and existing data, suggest completions for any empty or incomplete fields in this section. Follow NZ regulations and WorkSafe best practices.

Return a JSON object with field suggestions:
{
  "fieldName1": "suggested value",
  "fieldName2": ["item 1", "item 2"]
}

Return ONLY the JSON object with suggestions for empty/incomplete fields.`;

    const response = await chatCompletion(prompt);
    return parseJsonResponse<Record<string, unknown>>(response);
  } catch (error) {
    console.error('Error completing SWMS section:', error);
    throw new Error('Failed to complete SWMS section');
  }
}

/**
 * Validate SWMS document for compliance
 */
export async function validateSWMS(
  templateType: string,
  swmsData: Record<string, unknown>
): Promise<ValidationResult> {
  try {
    const prompt = `You are a NZ workplace health and safety compliance expert. Review this SWMS document for completeness and compliance.

Template Type: ${templateType}
SWMS Data: ${JSON.stringify(swmsData)}

Check for:
1. Required fields completed
2. Adequate hazard identification
3. Appropriate control measures
4. Emergency procedures present
5. NZ regulatory compliance (HSWA 2015, WorkSafe guidance)

Return a JSON object:
{
  "isValid": true,
  "completenessScore": 85,
  "issues": [
    {
      "severity": "warning",
      "field": "field name or section",
      "issue": "description of the issue",
      "suggestion": "how to fix it"
    }
  ],
  "regulatoryNotes": ["Any relevant NZ regulatory notes"]
}

Return ONLY the JSON object.`;

    const response = await chatCompletion(prompt);
    return parseJsonResponse<ValidationResult>(response);
  } catch (error) {
    console.error('Error validating SWMS:', error);
    throw new Error('Failed to validate SWMS');
  }
}

/**
 * Get default hazards when AI fails
 */
function getDefaultHazards(tradeType: string): string[] {
  const defaults: Record<string, string[]> = {
    electrician: [
      'Electric shock from live conductors',
      'Arc flash/blast from electrical fault',
      'Working at height on ladders or platforms',
      'Manual handling of heavy equipment',
      'Working in confined spaces',
    ],
    plumber: [
      'Contact with hot water/steam',
      'Manual handling of pipes and materials',
      'Working at height',
      'Exposure to sewage/biological hazards',
      'Slips, trips and falls on wet surfaces',
    ],
    builder: [
      'Falls from height',
      'Struck by falling objects',
      'Manual handling injuries',
      'Noise exposure from power tools',
      'Dust inhalation',
    ],
    landscaper: [
      'Manual handling of materials',
      'Cuts from tools and equipment',
      'UV exposure',
      'Noise from machinery',
      'Slips, trips on uneven ground',
    ],
    painter: [
      'Falls from ladders/scaffolding',
      'Chemical exposure from paints/solvents',
      'Respiratory hazards from fumes',
      'Manual handling',
      'Eye injuries from splashes',
    ],
  };
  return defaults[tradeType] || defaults.builder;
}

/**
 * Get default controls when AI fails
 */
function getDefaultControls(hazards: string[]): Record<string, ControlMeasure> {
  const controls: Record<string, ControlMeasure> = {};
  for (const hazard of hazards) {
    controls[hazard] = {
      primaryControl: 'Implement safe work procedures and training',
      controlType: 'administrative',
      additionalControls: ['Pre-work briefing', 'Regular supervision', 'Safety signage'],
      ppeRequired: ['Safety boots', 'Hi-vis vest', 'Safety glasses'],
      regulationReference: 'Health and Safety at Work Act 2015',
    };
  }
  return controls;
}

// Type definitions
export interface ControlMeasure {
  primaryControl: string;
  controlType: 'elimination' | 'substitution' | 'engineering' | 'administrative' | 'ppe';
  additionalControls: string[];
  ppeRequired: string[];
  regulationReference?: string;
}

export interface RiskAssessmentSuggestion {
  hazard: string;
  potentialHarm: string;
  likelihood: number;
  consequence: number;
  riskRating: number;
  controls: string[];
  residualLikelihood: number;
  residualConsequence: number;
  residualRisk: number;
}

export interface ValidationIssue {
  severity: 'critical' | 'warning' | 'info';
  field: string;
  issue: string;
  suggestion: string;
}

export interface ValidationResult {
  isValid: boolean;
  completenessScore: number;
  issues: ValidationIssue[];
  regulatoryNotes: string[];
}

/**
 * Get current AI configuration (for usage tracking)
 */
export function getAIConfig() {
  return {
    model: USE_LOCAL_LLM ? LM_STUDIO_MODEL : ANTHROPIC_MODEL,
    provider: (USE_LOCAL_LLM ? 'local' : 'anthropic') as 'local' | 'anthropic',
  };
}

export default {
  generateHazardSuggestions,
  generateControlMeasures,
  generateRiskAssessment,
  completeSWMSSection,
  validateSWMS,
  getAIConfig,
};
