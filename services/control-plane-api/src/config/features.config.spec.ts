describe('FEATURES feature flags', () => {
  afterEach(() => {
    // Limpiar las variables de entorno tras cada test
    delete process.env['FEATURE_AI'];
    delete process.env['FEATURE_DNS_ORCH'];
    delete process.env['FEATURE_WEBMAIL'];
    delete process.env['FEATURE_GROUPWARE'];
    delete process.env['FEATURE_BIMI'];
    delete process.env['FEATURE_ARCHIVAL'];
    delete process.env['FEATURE_WHITELABEL'];
    delete process.env['FEATURE_ORIZON'];
    jest.resetModules();
  });

  it('todos los flags son false cuando no hay variables de entorno', () => {
    let features: Record<string, boolean>;
    jest.isolateModules(() => {
       
      features = (require('./features.config') as { FEATURES: Record<string, boolean> }).FEATURES;
    });
    expect(features!['AI_ENGINE']).toBe(false);
    expect(features!['DNS_ORCHESTRATION']).toBe(false);
    expect(features!['WEBMAIL']).toBe(false);
    expect(features!['GROUPWARE']).toBe(false);
    expect(features!['BIMI']).toBe(false);
    expect(features!['ARCHIVAL']).toBe(false);
    expect(features!['WHITELABEL']).toBe(false);
    expect(features!['ORIZON']).toBe(false);
  });

  it('AI_ENGINE es true cuando FEATURE_AI="true"', () => {
    process.env['FEATURE_AI'] = 'true';
    let features: Record<string, boolean>;
    jest.isolateModules(() => {
       
      features = (require('./features.config') as { FEATURES: Record<string, boolean> }).FEATURES;
    });
    expect(features!['AI_ENGINE']).toBe(true);
  });

  it('DNS_ORCHESTRATION es true cuando FEATURE_DNS_ORCH="true"', () => {
    process.env['FEATURE_DNS_ORCH'] = 'true';
    let features: Record<string, boolean>;
    jest.isolateModules(() => {
       
      features = (require('./features.config') as { FEATURES: Record<string, boolean> }).FEATURES;
    });
    expect(features!['DNS_ORCHESTRATION']).toBe(true);
  });

  it('los flags no son true con valor distinto de "true" (ej: "1", "yes")', () => {
    process.env['FEATURE_WEBMAIL'] = '1';
    process.env['FEATURE_BIMI'] = 'yes';
    let features: Record<string, boolean>;
    jest.isolateModules(() => {
       
      features = (require('./features.config') as { FEATURES: Record<string, boolean> }).FEATURES;
    });
    expect(features!['WEBMAIL']).toBe(false);
    expect(features!['BIMI']).toBe(false);
  });

  it('múltiples flags pueden estar activos al mismo tiempo', () => {
    process.env['FEATURE_GROUPWARE'] = 'true';
    process.env['FEATURE_ARCHIVAL'] = 'true';
    process.env['FEATURE_ORIZON'] = 'true';
    let features: Record<string, boolean>;
    jest.isolateModules(() => {
       
      features = (require('./features.config') as { FEATURES: Record<string, boolean> }).FEATURES;
    });
    expect(features!['GROUPWARE']).toBe(true);
    expect(features!['ARCHIVAL']).toBe(true);
    expect(features!['ORIZON']).toBe(true);
    expect(features!['AI_ENGINE']).toBe(false);
  });
});
