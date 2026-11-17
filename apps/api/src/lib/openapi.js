export function securityFromHooks(hooks) {
  const requirements = hooks.flatMap(hook => hook.openApiSecurity ?? []);
  return requirements.length > 0 ? [Object.assign({}, ...requirements)] : [];
}
