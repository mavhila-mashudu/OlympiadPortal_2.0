// Jest runs CommonJS in a VM that can't execute `import()`. Prisma's generated
// client lazy-loads its query compiler with `await import(...)`, and Babel 8's
// CommonJS transform leaves dynamic imports alone, so rewrite
//   import(x)  →  Promise.resolve().then(() => require(x))
// for the test run only. Application code is untouched.
module.exports = ({ types: t }) => {
    const toRequire = (path, specifier) => {
        path.replaceWith(
            t.callExpression(
                t.memberExpression(
                    t.callExpression(
                        t.memberExpression(
                            t.identifier('Promise'),
                            t.identifier('resolve')
                        ),
                        []
                    ),
                    t.identifier('then')
                ),
                [
                    t.arrowFunctionExpression(
                        [],
                        t.callExpression(t.identifier('require'), [specifier])
                    ),
                ]
            )
        );
    };

    return {
        name: 'dynamic-import-to-require',
        visitor: {
            // Babel 8 AST
            ImportExpression(path) {
                toRequire(path, path.node.source);
            },
            // Babel 7 AST
            CallExpression(path) {
                if (path.node.callee.type === 'Import')
                    toRequire(path, path.node.arguments[0]);
            },
        },
    };
};
