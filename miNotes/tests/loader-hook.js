export async function resolve(specifier, context, nextResolve) {
  if (specifier.includes('purify.es.mjs')) {
    return {
      format: 'module',
      shortCircuit: true,
      url: new URL('data:text/javascript,export default { addHook: () => {}, sanitize: (html) => html };').href,
    };
  }
  return nextResolve(specifier, context);
}
