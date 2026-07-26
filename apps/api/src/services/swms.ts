/**
 * SWMS Service
 * Safe Work Method Statement generation and management
 */

import { v4 as uuidv4 } from 'uuid';
import db from './database.js';
import claudeService from './claude.js';
import { recordAICall } from './subscriptions.js';
import {
  SWMSDocument,
  SWMSGenerateInput,
  SWMSGenerateResponse,
  SWMSTemplate,
  Hazard,
  Control,
  TradeType,
} from '../types/index.js';
import { createError } from '../middleware/error.js';

// Import templates
// eslint-disable-next-line @typescript-eslint/no-require-imports
const electricianTemplate = require('../templates/swms-electrician.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plumberTemplate = require('../templates/swms-plumber.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const builderTemplate = require('../templates/swms-builder.json');

const templates: Record<TradeType, SWMSTemplate> = {
  electrician: electricianTemplate as unknown as SWMSTemplate,
  plumber: plumberTemplate as unknown as SWMSTemplate,
  builder: builderTemplate as unknown as SWMSTemplate,
  landscaper: builderTemplate as unknown as SWMSTemplate, // Use builder as fallback
  painter: builderTemplate as unknown as SWMSTemplate, // Use builder as fallback
  other: builderTemplate as unknown as SWMSTemplate,
};

/**
 * Get default hazards for a trade type (hardcoded fallback)
 */
function getTradeHazards(tradeType: TradeType): string[] {
  const tradeHazards: Record<string, string[]> = {
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
      'Working at height on ladders or scaffolding',
      'Exposure to paint fumes and solvents',
      'Skin contact with hazardous chemicals',
      'Manual handling of paint containers',
      'Slips, trips and falls on drop sheets',
    ],
    other: [
      'Manual handling injuries',
      'Slips, trips and falls',
      'Working at height',
      'Noise exposure',
      'Hazardous substances',
    ],
  };
  return tradeHazards[tradeType] || tradeHazards.other;
}

/**
 * Get available templates
 */
export function getTemplates(): { tradeType: TradeType; name: string; version: string }[] {
  return [
    { tradeType: 'electrician', name: 'Electrician SWMS', version: '1.0' },
    { tradeType: 'plumber', name: 'Plumber SWMS', version: '1.0' },
    { tradeType: 'builder', name: 'Builder/Construction SWMS', version: '1.0' },
  ];
}

/** Max length of the job-description portion of a generated SWMS title. */
const SWMS_TITLE_DESC_MAX = 50;

/**
 * Build a display title from the job description.
 * Caps the description portion at SWMS_TITLE_DESC_MAX, breaking on the last
 * space so titles never end mid-word (e.g. "a light switc"). Continuous
 * strings with no space fall back to a hard cut. Column is VARCHAR(255).
 */
export function buildSWMSTitle(jobDescription: string, maxLen = SWMS_TITLE_DESC_MAX): string {
  if (jobDescription.length <= maxLen) {
    return `SWMS - ${jobDescription}`;
  }

  const hard = jobDescription.slice(0, maxLen);
  const lastSpace = hard.lastIndexOf(' ');
  const desc = lastSpace > 0 ? hard.slice(0, lastSpace).trimEnd() : hard;
  return `SWMS - ${desc}`;
}

/**
 * Get template by trade type
 */
export function getTemplate(tradeType: TradeType): SWMSTemplate {
  const template = templates[tradeType];
  if (!template) {
    throw createError(`Template not found for trade type: ${tradeType}`, 404, 'TEMPLATE_NOT_FOUND');
  }
  return template;
}

/**
 * Generate a new SWMS document
 */
export async function generateSWMS(
  userId: string,
  input: SWMSGenerateInput
): Promise<SWMSGenerateResponse> {
  const template = getTemplate(input.tradeType);
  const swmsId = uuidv4();

  // Generate AI suggestions if enabled
  let suggestedHazards: Hazard[] = [];
  let suggestedControls: Control[] = [];

  if (input.useAI !== false) {
    try {
      console.log(`[SWMS] Generating AI suggestions for ${input.tradeType} job...`);

      const aiConfig = claudeService.getAIConfig();

      // Record hazard suggestion call
      await recordAICall(
        userId,
        'generate_hazard_suggestions',
        aiConfig.model,
        aiConfig.provider
      );

      // Get AI hazard suggestions
      const hazardStrings = await claudeService.generateHazardSuggestions(
        input.tradeType,
        input.jobDescription,
        input.siteAddress || ''
      );

      console.log(`[SWMS] Received ${hazardStrings.length} hazard suggestions`);

      // Assign risk levels based on hazard keywords
      const getRiskLevel = (desc: string): 'low' | 'medium' | 'high' | 'extreme' => {
        const lower = desc.toLowerCase();
        if (lower.includes('death') || lower.includes('fatal') || lower.includes('electrocution') || lower.includes('asbestos')) {
          return 'extreme';
        }
        if (lower.includes('electric') || lower.includes('fall') || lower.includes('height') || lower.includes('confined space') || lower.includes('arc flash')) {
          return 'high';
        }
        if (lower.includes('manual handling') || lower.includes('noise') || lower.includes('hot') || lower.includes('chemical')) {
          return 'medium';
        }
        return 'medium'; // Default to medium for unclassified
      };

      suggestedHazards = hazardStrings.map((description, index) => ({
        id: `hazard-${index}`,
        category: 'ai-suggested',
        description,
        riskLevel: getRiskLevel(description),
        aiGenerated: true,
      }));

      // Get AI control suggestions for hazards
      if (suggestedHazards.length > 0) {
        try {
          // Record control measure call
          await recordAICall(
            userId,
            'generate_control_measures',
            aiConfig.model,
            aiConfig.provider
          );

          const controlMap = await claudeService.generateControlMeasures(
            hazardStrings,
            input.tradeType
          );

          suggestedControls = Object.entries(controlMap).map(([hazardDesc, control], index) => ({
            hazardId: suggestedHazards.find(h => h.description === hazardDesc)?.id || `hazard-${index}`,
            controlType: control.controlType,
            description: control.primaryControl,
            ppeRequired: control.ppeRequired,
            aiGenerated: true,
          }));

          console.log(`[SWMS] Generated ${suggestedControls.length} control measures`);
        } catch (controlError) {
          console.error('[SWMS] Control generation failed (non-fatal):', controlError instanceof Error ? controlError.message : controlError);
          // Generate default controls for the hazards we have
          suggestedControls = suggestedHazards.map((h) => ({
            hazardId: h.id,
            controlType: 'administrative' as const,
            description: 'Implement safe work procedures and ensure workers are trained',
            ppeRequired: ['Safety boots', 'Hi-vis vest', 'Safety glasses'],
            aiGenerated: false,
          }));
          console.log(`[SWMS] Using ${suggestedControls.length} default control measures`);
        }
      }
    } catch (error) {
      console.error('[SWMS] AI suggestion error (non-fatal):', error instanceof Error ? error.message : error);
      // Continue without AI suggestions - defaults will be applied below
    }
  }

  // Ensure we always have hazards and controls (static defaults only — never re-call AI here;
  // generateHazardSuggestions already falls back internally, and useAI=false must not hit the model)
  if (suggestedHazards.length === 0) {
    console.log(`[SWMS] No hazards generated, using static defaults for ${input.tradeType}`);
    const hazardStrings = getTradeHazards(input.tradeType);

    suggestedHazards = hazardStrings.map((description, index) => ({
      id: `hazard-${index}`,
      category: 'default',
      description,
      riskLevel: 'medium' as const,
      aiGenerated: false,
    }));
  }

  if (suggestedControls.length === 0 && suggestedHazards.length > 0) {
    console.log(`[SWMS] No controls generated, using defaults`);
    suggestedControls = suggestedHazards.map((h) => ({
      hazardId: h.id,
      controlType: 'administrative' as const,
      description: 'Implement safe work procedures and ensure workers are trained',
      ppeRequired: ['Safety boots', 'Hi-vis vest', 'Safety glasses'],
      aiGenerated: false,
    }));
  }

  // Create document in database
  const result = await db.query<SWMSDocument>(
    `INSERT INTO swms_documents (
      id, user_id, template_type, title, status,
      job_description, site_address, client_name, expected_duration,
      hazards, controls, ppe_required,
      is_synced, local_id
    )
    VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, true, $12)
    RETURNING *`,
    [
      swmsId,
      userId,
      input.tradeType,
      buildSWMSTitle(input.jobDescription),
      input.jobDescription,
      input.siteAddress || null,
      input.clientName || null,
      input.expectedDuration || null,
      JSON.stringify(suggestedHazards),
      JSON.stringify(suggestedControls),
      JSON.stringify([]),
      uuidv4(), // local_id for offline sync
    ]
  );

  const document = result.rows[0];

  return {
    swmsId,
    document: {
      id: document.id,
      templateType: input.tradeType,
      title: document.title,
      status: 'draft',
      jobDescription: input.jobDescription,
      siteAddress: input.siteAddress || null,
      clientName: input.clientName || null,
      expectedDuration: input.expectedDuration || null,
    },
    suggestedHazards,
    suggestedControls,
    template,
  };
}

/**
 * Transform hazards and controls to mobile-friendly format
 * Mobile expects: { id, hazard, risk_level, control_measures[] }
 */
function transformHazardsForMobile(hazards: Hazard[], controls: Control[]): MobileHazard[] {
  return hazards.map((h) => {
    // Find controls for this hazard
    const hazardControls = controls.filter((c) => c.hazardId === h.id);
    const controlMeasures = hazardControls.map((c) => c.description);

    // Also collect PPE from controls
    const ppeFromControls = hazardControls
      .flatMap((c) => c.ppeRequired || [])
      .filter((v, i, a) => a.indexOf(v) === i); // unique

    return {
      id: h.id,
      hazard: h.description, // Mobile expects 'hazard' not 'description'
      risk_level: h.riskLevel || 'medium', // Default to medium if not set
      control_measures: controlMeasures.length > 0 ? controlMeasures : ['Implement safe work procedures'],
      ppe_required: ppeFromControls,
    };
  });
}

// Mobile-friendly hazard format
interface MobileHazard {
  id: string;
  hazard: string;
  risk_level: string;
  control_measures: string[];
  ppe_required?: string[];
}

/**
 * Get SWMS by ID
 */
export async function getSWMSById(
  swmsId: string,
  userId: string
): Promise<SWMSDocument | null> {
  const result = await db.query<SWMSDocument>(
    `SELECT id, user_id as "userId", template_type as "templateType", title, status,
            job_description as "jobDescription", site_address as "siteAddress",
            client_name as "clientName", expected_duration as "expectedDuration",
            hazards, controls, ppe_required as "ppeRequired",
            emergency_plan as "emergencyPlan", isolation_procedure as "isolationProcedure",
            worker_signature as "workerSignature", worker_signed_at as "workerSignedAt",
            supervisor_signature as "supervisorSignature", supervisor_signed_at as "supervisorSignedAt",
            pdf_url as "pdfUrl", is_synced as "isSynced", local_id as "localId",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM swms_documents
     WHERE id = $1 AND user_id = $2`,
    [swmsId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const doc = result.rows[0];
  const hazards: Hazard[] = typeof doc.hazards === 'string' ? JSON.parse(doc.hazards) : (doc.hazards || []);
  const controls: Control[] = typeof doc.controls === 'string' ? JSON.parse(doc.controls) : (doc.controls || []);
  const ppeRequired: string[] = typeof doc.ppeRequired === 'string' ? JSON.parse(doc.ppeRequired) : (doc.ppeRequired || []);

  // Collect all PPE from controls and merge with document-level PPE
  const allPpe = [
    ...ppeRequired,
    ...controls.flatMap((c) => c.ppeRequired || []),
  ].filter((v, i, a) => a.indexOf(v) === i); // unique

  // Build signatures array for mobile
  const signatures: Array<{ role: string; signed_at: string; signed_by: string }> = [];
  if (doc.workerSignature && doc.workerSignedAt) {
    signatures.push({
      role: 'worker',
      signed_at: doc.workerSignedAt.toISOString ? doc.workerSignedAt.toISOString() : String(doc.workerSignedAt),
      signed_by: 'Worker',
    });
  }
  if (doc.supervisorSignature && doc.supervisorSignedAt) {
    signatures.push({
      role: 'supervisor',
      signed_at: doc.supervisorSignedAt.toISOString ? doc.supervisorSignedAt.toISOString() : String(doc.supervisorSignedAt),
      signed_by: 'Supervisor',
    });
  }

  // Return in mobile-friendly format (snake_case field names)
  return {
    id: doc.id,
    title: doc.title,
    trade_type: doc.templateType,
    status: doc.status,
    job_description: doc.jobDescription,
    site_address: doc.siteAddress,
    client_name: doc.clientName,
    expected_duration: doc.expectedDuration,
    hazards: transformHazardsForMobile(hazards, controls),
    ppe_required: allPpe,
    emergency_procedures: doc.emergencyPlan ? [doc.emergencyPlan] : ['Call 111 for emergencies', 'First aid kit on site', 'Evacuate if necessary'],
    signatures,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  } as unknown as SWMSDocument;
}

/**
 * List SWMS documents for user (returns mobile-friendly snake_case format)
 */
export async function listSWMS(
  userId: string,
  options: { status?: string; limit?: number; offset?: number } = {}
): Promise<{ documents: Record<string, unknown>[]; total: number }> {
  const { status, limit = 20, offset = 0 } = options;

  let whereClause = 'user_id = $1';
  const params: unknown[] = [userId];

  if (status) {
    whereClause += ' AND status = $2';
    params.push(status);
  }

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM swms_documents WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get items with snake_case field names for mobile
  const result = await db.query<Record<string, unknown>>(
    `SELECT id, user_id, template_type as trade_type, title, status,
            job_description, site_address, client_name,
            created_at, updated_at
     FROM swms_documents
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    documents: result.rows,
    total,
  };
}

/**
 * Update SWMS document
 */
export async function updateSWMS(
  swmsId: string,
  userId: string,
  updates: Partial<SWMSDocument>
): Promise<SWMSDocument | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const allowedFields = [
    'title', 'status', 'jobDescription', 'siteAddress', 'clientName',
    'expectedDuration', 'hazards', 'controls', 'ppeRequired',
    'emergencyPlan', 'isolationProcedure', 'workerSignature', 'workerSignedAt',
    'supervisorSignature', 'supervisorSignedAt',
  ];

  const fieldMap: Record<string, string> = {
    jobDescription: 'job_description',
    siteAddress: 'site_address',
    clientName: 'client_name',
    expectedDuration: 'expected_duration',
    ppeRequired: 'ppe_required',
    emergencyPlan: 'emergency_plan',
    isolationProcedure: 'isolation_procedure',
    workerSignature: 'worker_signature',
    workerSignedAt: 'worker_signed_at',
    supervisorSignature: 'supervisor_signature',
    supervisorSignedAt: 'supervisor_signed_at',
  };

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      const dbField = fieldMap[key] || key;
      const dbValue = ['hazards', 'controls', 'ppeRequired'].includes(key)
        ? JSON.stringify(value)
        : value;
      fields.push(`${dbField} = $${paramIndex++}`);
      values.push(dbValue);
    }
  }

  if (fields.length === 0) {
    return getSWMSById(swmsId, userId);
  }

  fields.push('updated_at = NOW()');
  values.push(swmsId, userId);

  const result = await db.query<SWMSDocument>(
    `UPDATE swms_documents SET ${fields.join(', ')}
     WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  return getSWMSById(swmsId, userId);
}

/**
 * Delete SWMS document
 */
export async function deleteSWMS(swmsId: string, userId: string): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM swms_documents WHERE id = $1 AND user_id = $2',
    [swmsId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Sign SWMS document
 */
export async function signSWMS(
  swmsId: string,
  userId: string,
  signature: string,
  role: 'worker' | 'supervisor'
): Promise<SWMSDocument | null> {
  const signatureField = role === 'worker' ? 'worker_signature' : 'supervisor_signature';
  const signedAtField = role === 'worker' ? 'worker_signed_at' : 'supervisor_signed_at';

  // Update signature
  await db.query(
    `UPDATE swms_documents SET ${signatureField} = $1, ${signedAtField} = NOW(), updated_at = NOW()
     WHERE id = $2 AND user_id = $3`,
    [signature, swmsId, userId]
  );

  // Check if both signatures are present to update status
  const doc = await getSWMSById(swmsId, userId);
  if (doc?.workerSignature) {
    await db.query(
      `UPDATE swms_documents SET status = 'signed' WHERE id = $1`,
      [swmsId]
    );
  }

  return getSWMSById(swmsId, userId);
}

export default {
  getTemplates,
  getTemplate,
  generateSWMS,
  getSWMSById,
  listSWMS,
  updateSWMS,
  deleteSWMS,
  signSWMS,
};
