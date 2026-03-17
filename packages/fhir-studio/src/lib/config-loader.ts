export interface ServerConfig {
  id: string;
  name: string;
  baseUrl: string;
}

export interface FhirStudioConfig {
  servers: ServerConfig[];
}

const DEFAULT_CONFIG: FhirStudioConfig = {
  servers: [
    {
      id: 'local',
      name: 'Local FHIR',
      baseUrl: 'http://localhost:8080',
    },
    {
      id: 'test',
      name: 'Test Server',
      baseUrl: 'https://test.fhir.com',
    },
  ],
};

export function loadConfig(): FhirStudioConfig {
  return DEFAULT_CONFIG;
}
