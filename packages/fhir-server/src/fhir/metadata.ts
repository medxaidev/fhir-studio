/**
 * FHIR CapabilityStatement Builder
 *
 * Generates a static CapabilityStatement declaring the server's
 * supported FHIR R4 interactions.
 *
 * Reference: https://hl7.org/fhir/R4/capabilitystatement.html
 *
 * @module fhir-server/fhir
 */

// =============================================================================
// Section 1: Types
// =============================================================================

/**
 * Subset of FHIR CapabilityStatement used by this server.
 */
export interface CapabilityStatement {
  resourceType: "CapabilityStatement";
  status: "active" | "draft" | "retired";
  date: string;
  kind: "instance" | "capability" | "requirements";
  fhirVersion: string;
  format: string[];
  software?: {
    name: string;
    version: string;
  };
  implementation?: {
    description: string;
    url?: string;
  };
  rest: CapabilityStatementRest[];
}

export interface CapabilityStatementRest {
  mode: "server" | "client";
  resource: CapabilityStatementRestResource[];
}

export interface CapabilityStatementRestResource {
  type: string;
  interaction: Array<{ code: string }>;
  versioning: "no-version" | "versioned" | "versioned-update";
  readHistory: boolean;
  updateCreate: boolean;
}

// =============================================================================
// Section 2: Supported Interactions
// =============================================================================

/**
 * FHIR interactions supported by this server (Phase 11 scope).
 */
const SUPPORTED_INTERACTIONS = [
  { code: "read" },
  { code: "vread" },
  { code: "update" },
  { code: "delete" },
  { code: "history-instance" },
  { code: "create" },
];

/**
 * Common FHIR R4 resource types supported by this server.
 *
 * This is a static list for Phase 11. In future phases, this will
 * be dynamically generated from the StructureDefinitionRegistry.
 */
const SUPPORTED_RESOURCE_TYPES = [
  "Account",
  "ActivityDefinition",
  "AdverseEvent",
  "AllergyIntolerance",
  "Appointment",
  "AppointmentResponse",
  "AuditEvent",
  "Basic",
  "Binary",
  "BiologicallyDerivedProduct",
  "BodyStructure",
  "Bundle",
  "CarePlan",
  "CareTeam",
  "ChargeItem",
  "ChargeItemDefinition",
  "Claim",
  "ClaimResponse",
  "ClinicalImpression",
  "Communication",
  "CommunicationRequest",
  "Composition",
  "Condition",
  "Consent",
  "Contract",
  "Coverage",
  "CoverageEligibilityRequest",
  "CoverageEligibilityResponse",
  "DetectedIssue",
  "Device",
  "DeviceDefinition",
  "DeviceMetric",
  "DeviceRequest",
  "DeviceUseStatement",
  "DiagnosticReport",
  "DocumentManifest",
  "DocumentReference",
  "Encounter",
  "Endpoint",
  "EnrollmentRequest",
  "EnrollmentResponse",
  "EpisodeOfCare",
  "ExplanationOfBenefit",
  "FamilyMemberHistory",
  "Flag",
  "Goal",
  "Group",
  "GuidanceResponse",
  "HealthcareService",
  "ImagingStudy",
  "Immunization",
  "ImmunizationEvaluation",
  "ImmunizationRecommendation",
  "InsurancePlan",
  "Invoice",
  "Library",
  "Linkage",
  "List",
  "Location",
  "Measure",
  "MeasureReport",
  "Media",
  "Medication",
  "MedicationAdministration",
  "MedicationDispense",
  "MedicationKnowledge",
  "MedicationRequest",
  "MedicationStatement",
  "MolecularSequence",
  "NutritionOrder",
  "Observation",
  "OperationOutcome",
  "Organization",
  "OrganizationAffiliation",
  "Patient",
  "PaymentNotice",
  "PaymentReconciliation",
  "Person",
  "PlanDefinition",
  "Practitioner",
  "PractitionerRole",
  "Procedure",
  "Provenance",
  "Questionnaire",
  "QuestionnaireResponse",
  "RelatedPerson",
  "RequestGroup",
  "ResearchDefinition",
  "ResearchElementDefinition",
  "ResearchStudy",
  "ResearchSubject",
  "RiskAssessment",
  "RiskEvidenceSynthesis",
  "Schedule",
  "ServiceRequest",
  "Slot",
  "Specimen",
  "SpecimenDefinition",
  "Subscription",
  "Substance",
  "SupplyDelivery",
  "SupplyRequest",
  "Task",
  "VisionPrescription",
];

// =============================================================================
// Section 3: Builder
// =============================================================================

/**
 * Options for building the CapabilityStatement.
 */
export interface CapabilityStatementOptions {
  baseUrl?: string;
  serverName?: string;
  serverVersion?: string;
}

/**
 * Build a FHIR R4 CapabilityStatement for this server.
 */
export function buildCapabilityStatement(
  options?: CapabilityStatementOptions,
): CapabilityStatement {
  const serverName = options?.serverName ?? "MedXAI FHIR Server";
  const serverVersion = options?.serverVersion ?? "0.0.1";

  const stmt: CapabilityStatement = {
    resourceType: "CapabilityStatement",
    status: "active",
    date: new Date().toISOString(),
    kind: "instance",
    fhirVersion: "4.0.1",
    format: ["json"],
    software: {
      name: serverName,
      version: serverVersion,
    },
    rest: [
      {
        mode: "server",
        resource: SUPPORTED_RESOURCE_TYPES.map((type) => ({
          type,
          interaction: [...SUPPORTED_INTERACTIONS],
          versioning: "versioned" as const,
          readHistory: true,
          updateCreate: false,
        })),
      },
    ],
  };

  if (options?.baseUrl) {
    stmt.implementation = {
      description: serverName,
      url: options.baseUrl,
    };
  }

  return stmt;
}
