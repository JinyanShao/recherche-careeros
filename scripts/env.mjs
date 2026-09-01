export function requiredCareerOpsSource(scriptName) {
  const value = process.env.RECHERCHE_CAREER_OPS_SOURCE?.trim();
  if (value) return value;
  const command = scriptName.startsWith('verify-')
    ? `npm run ${scriptName.replace('verify-', 'verify:')}`
    : `node scripts/${scriptName}.mjs`;
  throw new Error(
    `${scriptName} requires RECHERCHE_CAREER_OPS_SOURCE. ` +
    'Set it to your local career-ops checkout, for example: ' +
    `RECHERCHE_CAREER_OPS_SOURCE=/path/to/career-ops ${command}`,
  );
}

export function configuredNodeExecutable() {
  return process.env.RECHERCHE_NODE_PATH?.trim() || process.execPath;
}
