import { MedXAIClient } from 'fhir-rest-client';

export function createFhirClient(baseUrl: string): MedXAIClient {
  return new MedXAIClient({ baseUrl, igCacheEnabled: true });
}
