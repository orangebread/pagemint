const RUNTIME_ENV_PREFIXES = [
  'NEXT_PUBLIC_PAGEMINT_',
  'WXT_PAGEMINT_'
];

process.env.NODE_ENV = 'test';
delete process.env.VERCEL;
delete process.env.VERCEL_ENV;
delete process.env.VERCEL_REGION;

for (const key of Object.keys(process.env)) {
  if (RUNTIME_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    delete process.env[key];
  }
}
