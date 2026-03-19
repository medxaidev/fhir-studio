export interface ServerConfig {
  id: string;
  name: string;
  url: string;
  description?: string;
}

export interface FhirStudioConfig {
  servers: ServerConfig[];
  defaultServer?: string;
}

const DEFAULT_CONFIG: FhirStudioConfig = {
  servers: [
    {
      id: 'local',
      name: 'Local FHIR',
      url: 'http://localhost:8080',
      description: 'Local development server',
    },
  ],
  defaultServer: 'local',
};

export async function loadConfig(): Promise<FhirStudioConfig> {
  try {
    const response = await fetch('/fhir.config.json');
    if (!response.ok) {
      console.warn('Failed to load fhir.config.json, using default config');
      return DEFAULT_CONFIG;
    }
    const config = await response.json();
    return config;
  } catch (error) {
    console.error('Error loading fhir.config.json:', error);
    return DEFAULT_CONFIG;
  }
}
