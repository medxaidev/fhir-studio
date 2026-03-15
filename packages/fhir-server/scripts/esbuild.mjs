import { build } from 'esbuild';
import { writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// 读取 package.json
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// 设置外部依赖
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  'node:*'
];

// 类型声明文件路径
const dtsSource = './dist/index.d.ts';
const dtsEsmDest = './dist/esm/index.d.ts';
const dtsCjsDest = './dist/cjs/index.d.ts';

// 运行 api-extractor 生成单一类型声明
console.log('Running api-extractor...');
execSync('api-extractor run --local', { stdio: 'inherit' });

// 构建通用配置
const baseOptions = {
  entryPoints: ['./src/index.ts'],
  bundle: true,
  sourcemap: true,
  platform: 'node',
  target: ['es2022'],
  tsconfig: 'tsconfig.json',
  loader: { '.ts': 'ts' },
  resolveExtensions: ['.ts', '.js'],
  external
};

// 顺序构建 ESM
async function buildESM() {
  console.log('Building ESM...');
  await build({
    ...baseOptions,
    format: 'esm',
    outfile: './dist/esm/index.mjs'
  });

  // 复制类型声明
  copyFileSync(dtsSource, dtsEsmDest);

  // 写子 package.json
  writeFileSync(
    './dist/esm/package.json',
    JSON.stringify(
      {
        type: 'module',
        main: 'index.mjs',
        types: 'index.d.ts'
      },
      null,
      2
    )
  );

  console.log('ESM build finished.');
}

// 顺序构建 CJS
async function buildCJS() {
  console.log('Building CJS...');
  await build({
    ...baseOptions,
    format: 'cjs',
    outfile: './dist/cjs/index.cjs'
  });

  // 复制类型声明
  copyFileSync(dtsSource, dtsCjsDest);

  // 写子 package.json
  writeFileSync(
    './dist/cjs/package.json',
    JSON.stringify(
      {
        type: 'commonjs',
        main: 'index.cjs',
        types: 'index.d.ts'
      },
      null,
      2
    )
  );

  console.log('CJS build finished.');
}

// 主函数顺序执行
async function main() {
  try {
    await buildESM();
    await buildCJS();
    console.log('Build all done.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();