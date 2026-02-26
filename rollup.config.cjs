const pkg = require('./package.json');
const json = require('@rollup/plugin-json');
const nodeResolve = require('@rollup/plugin-node-resolve');
// eslint-disable-next-line
const commonjs = require('@rollup/plugin-commonjs');
// eslint-disable-next-line
const { dts } = require('rollup-plugin-dts');

const external = Object.keys(pkg.dependencies || {}).concat(
    Object.keys(pkg.peerDependencies || {})
);

module.exports = [
    {
        input: './index.js',
        output: [
            {
                name: pkg.name,
                file: 'dist/index.js',
                format: 'cjs',
                sourcemap: true
            },
            {
                name: pkg.name,
                file: 'dist/index.esm.js',
                format: 'esm',
                sourcemap: true
            }
        ],
        external,
        plugins: [nodeResolve(), json(), commonjs({
            esmExternals: true,
            strictRequires: true,
            requireNodeBuiltins: true
        })],
    },
    {
        input: 'index.d.ts',
        output: {
            file: 'dist/index.d.ts'
        },
        external,
        plugins: [dts()],
    }
];