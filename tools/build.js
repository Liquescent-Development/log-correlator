#!/usr/bin/env node

/**
 * Build script for log-correlator packages
 * Handles TypeScript compilation, minification, and packaging
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const ROOT_DIR = path.join(__dirname, '..');

// Build configuration
const BUILD_CONFIG = {
  minify: process.argv.includes('--minify'),
  sourceMaps: !process.argv.includes('--no-sourcemaps'),
  watch: process.argv.includes('--watch'),
  clean: process.argv.includes('--clean'),
  verbose: process.argv.includes('--verbose')
};

// Logging utilities
const log = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  verbose: (msg) => BUILD_CONFIG.verbose && console.log(`   ${msg}`)
};

// Execute command with error handling
function exec(command, options = {}) {
  try {
    log.verbose(`Executing: ${command}`);
    const result = execSync(command, {
      cwd: ROOT_DIR,
      stdio: BUILD_CONFIG.verbose ? 'inherit' : 'pipe',
      ...options
    });
    return result?.toString();
  } catch (error) {
    log.error(`Command failed: ${command}`);
    if (!BUILD_CONFIG.verbose) {
      console.error(error.message);
    }
    process.exit(1);
  }
}

// Clean build artifacts
function clean() {
  log.info('Cleaning build artifacts...');
  
  const dirsToClean = [
    'dist',
    'lib',
    'build',
    '*.tsbuildinfo'
  ];
  
  // Clean root
  dirsToClean.forEach(dir => {
    const fullPath = path.join(ROOT_DIR, dir);
    if (fs.existsSync(fullPath)) {
      exec(`rm -rf ${fullPath}`);
      log.verbose(`Cleaned: ${fullPath}`);
    }
  });
  
  // Clean packages
  const packages = getPackages();
  packages.forEach(pkg => {
    dirsToClean.forEach(dir => {
      const fullPath = path.join(pkg.path, dir);
      if (fs.existsSync(fullPath)) {
        exec(`rm -rf ${fullPath}`);
        log.verbose(`Cleaned: ${fullPath}`);
      }
    });
  });
  
  log.success('Clean complete');
}

// Get all packages
function getPackages() {
  const packages = [];
  
  // Read workspace packages
  const workspaces = ['packages/*', 'packages/adapters/*'];
  
  workspaces.forEach(pattern => {
    const baseDir = path.join(ROOT_DIR, pattern.replace('/*', ''));
    if (fs.existsSync(baseDir)) {
      fs.readdirSync(baseDir).forEach(name => {
        const pkgPath = path.join(baseDir, name);
        const pkgJsonPath = path.join(pkgPath, 'package.json');
        
        if (fs.existsSync(pkgJsonPath)) {
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
          packages.push({
            name: pkgJson.name,
            path: pkgPath,
            json: pkgJson
          });
        }
      });
    }
  });
  
  return packages;
}

// Install dependencies
function installDependencies() {
  log.info('Installing dependencies...');
  exec('npm install');
  log.success('Dependencies installed');
}

// Build TypeScript
function buildTypeScript() {
  log.info('Building TypeScript...');
  
  const tscArgs = [
    '--build',
    BUILD_CONFIG.sourceMaps ? '--sourceMap' : '',
    BUILD_CONFIG.watch ? '--watch' : ''
  ].filter(Boolean).join(' ');
  
  exec(`npx tsc ${tscArgs}`);
  log.success('TypeScript build complete');
}

// Minify JavaScript files
async function minifyPackage(pkg) {
  if (!BUILD_CONFIG.minify) return;
  
  log.info(`Minifying ${pkg.name}...`);
  
  const distDir = path.join(pkg.path, 'dist');
  if (!fs.existsSync(distDir)) return;
  
  const files = getAllFiles(distDir, '.js');
  
  for (const file of files) {
    // Skip already minified files
    if (file.includes('.min.js')) continue;
    
    const code = fs.readFileSync(file, 'utf8');
    const minified = await minify(code, {
      sourceMap: BUILD_CONFIG.sourceMaps ? {
        filename: path.basename(file),
        url: `${path.basename(file)}.map`
      } : false,
      compress: {
        drop_console: false,
        drop_debugger: true,
        passes: 2
      },
      mangle: {
        keep_fnames: true,
        keep_classnames: true
      },
      format: {
        comments: false
      }
    });
    
    // Write minified version
    const minFile = file.replace('.js', '.min.js');
    fs.writeFileSync(minFile, minified.code);
    
    if (minified.map && BUILD_CONFIG.sourceMaps) {
      fs.writeFileSync(`${minFile}.map`, minified.map);
    }
    
    log.verbose(`Minified: ${path.relative(ROOT_DIR, file)}`);
  }
  
  log.success(`Minified ${pkg.name}`);
}

// Get all files with extension
function getAllFiles(dir, ext) {
  const files = [];
  
  function traverse(currentPath) {
    const items = fs.readdirSync(currentPath);
    
    items.forEach(item => {
      const itemPath = path.join(currentPath, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        traverse(itemPath);
      } else if (itemPath.endsWith(ext)) {
        files.push(itemPath);
      }
    });
  }
  
  traverse(dir);
  return files;
}

// Generate CommonJS builds
function generateCommonJS() {
  log.info('Generating CommonJS builds...');
  
  const packages = getPackages();
  
  packages.forEach(pkg => {
    const tsConfig = path.join(pkg.path, 'tsconfig.json');
    if (fs.existsSync(tsConfig)) {
      // Create tsconfig for CommonJS
      const config = JSON.parse(fs.readFileSync(tsConfig, 'utf8'));
      const cjsConfig = {
        ...config,
        compilerOptions: {
          ...config.compilerOptions,
          module: 'commonjs',
          outDir: './lib'
        }
      };
      
      const cjsConfigPath = path.join(pkg.path, 'tsconfig.cjs.json');
      fs.writeFileSync(cjsConfigPath, JSON.stringify(cjsConfig, null, 2));
      
      // Build CommonJS
      exec(`npx tsc -p ${cjsConfigPath}`, { cwd: pkg.path });
      
      // Clean up temp config
      fs.unlinkSync(cjsConfigPath);
      
      log.verbose(`Generated CommonJS for ${pkg.name}`);
    }
  });
  
  log.success('CommonJS builds complete');
}

// Copy additional files
function copyFiles() {
  log.info('Copying additional files...');
  
  const packages = getPackages();
  
  packages.forEach(pkg => {
    const filesToCopy = ['README.md', 'LICENSE', 'CHANGELOG.md'];
    
    filesToCopy.forEach(file => {
      const srcFile = path.join(pkg.path, file);
      const distFile = path.join(pkg.path, 'dist', file);
      const libFile = path.join(pkg.path, 'lib', file);
      
      if (fs.existsSync(srcFile)) {
        if (fs.existsSync(path.join(pkg.path, 'dist'))) {
          fs.copyFileSync(srcFile, distFile);
        }
        if (fs.existsSync(path.join(pkg.path, 'lib'))) {
          fs.copyFileSync(srcFile, libFile);
        }
        log.verbose(`Copied ${file} for ${pkg.name}`);
      }
    });
  });
  
  log.success('File copy complete');
}

// Validate build
function validateBuild() {
  log.info('Validating build...');
  
  const packages = getPackages();
  let hasErrors = false;
  
  packages.forEach(pkg => {
    // Skip validation for examples package
    if (pkg.name === '@liquescent/log-correlator-examples') {
      return;
    }
    
    const distDir = path.join(pkg.path, 'dist');
    const libDir = path.join(pkg.path, 'lib');
    
    // Check if build outputs exist
    if (!fs.existsSync(distDir) && !fs.existsSync(libDir)) {
      log.error(`No build output for ${pkg.name}`);
      hasErrors = true;
    }
    
    // Check for TypeScript declaration files
    if (fs.existsSync(distDir)) {
      const hasDts = getAllFiles(distDir, '.d.ts').length > 0;
      if (!hasDts) {
        log.error(`No TypeScript declarations for ${pkg.name}`);
        hasErrors = true;
      }
    }
    
    // Validate package.json main/types fields
    if (pkg.json.main && !fs.existsSync(path.join(pkg.path, pkg.json.main))) {
      log.error(`Missing main file for ${pkg.name}: ${pkg.json.main}`);
      hasErrors = true;
    }
    
    if (pkg.json.types && !fs.existsSync(path.join(pkg.path, pkg.json.types))) {
      log.error(`Missing types file for ${pkg.name}: ${pkg.json.types}`);
      hasErrors = true;
    }
  });
  
  if (hasErrors) {
    log.error('Build validation failed');
    process.exit(1);
  }
  
  log.success('Build validation passed');
}

// Print build info
function printBuildInfo() {
  const packages = getPackages();
  
  console.log('\n📦 Build Summary:');
  console.log('═'.repeat(50));
  
  packages.forEach(pkg => {
    const distDir = path.join(pkg.path, 'dist');
    const libDir = path.join(pkg.path, 'lib');
    
    console.log(`\n${pkg.name}:`);
    
    if (fs.existsSync(distDir)) {
      const jsFiles = getAllFiles(distDir, '.js');
      const minFiles = getAllFiles(distDir, '.min.js');
      const dtsFiles = getAllFiles(distDir, '.d.ts');
      
      console.log(`  ESM: ${jsFiles.length - minFiles.length} files`);
      if (BUILD_CONFIG.minify) {
        console.log(`  Minified: ${minFiles.length} files`);
      }
      console.log(`  Types: ${dtsFiles.length} files`);
      
      // Calculate size
      const totalSize = jsFiles.reduce((sum, file) => {
        return sum + fs.statSync(file).size;
      }, 0);
      console.log(`  Size: ${(totalSize / 1024).toFixed(2)} KB`);
    }
    
    if (fs.existsSync(libDir)) {
      const cjsFiles = getAllFiles(libDir, '.js');
      console.log(`  CommonJS: ${cjsFiles.length} files`);
    }
  });
  
  console.log('\n' + '═'.repeat(50));
}

// Main build process
async function build() {
  console.log('🔨 Building log-correlator packages...\n');
  
  const startTime = Date.now();
  
  try {
    // Clean if requested
    if (BUILD_CONFIG.clean) {
      clean();
    }
    
    // Install dependencies
    installDependencies();
    
    // Build TypeScript
    buildTypeScript();
    
    // Generate CommonJS builds
    generateCommonJS();
    
    // Minify if requested
    if (BUILD_CONFIG.minify) {
      const packages = getPackages();
      for (const pkg of packages) {
        await minifyPackage(pkg);
      }
    }
    
    // Copy additional files
    copyFiles();
    
    // Validate build
    validateBuild();
    
    // Print summary
    printBuildInfo();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✨ Build completed in ${duration}s`);
    
  } catch (error) {
    log.error('Build failed');
    console.error(error);
    process.exit(1);
  }
}

// Handle CLI
if (require.main === module) {
  // Show help
  if (process.argv.includes('--help')) {
    console.log(`
Log Correlator Build Script

Usage: node tools/build.js [options]

Options:
  --clean          Clean build artifacts before building
  --minify         Generate minified versions
  --no-sourcemaps  Disable source map generation
  --watch          Watch mode for development
  --verbose        Show detailed output
  --help           Show this help message

Examples:
  node tools/build.js                      # Standard build
  node tools/build.js --clean --minify     # Clean build with minification
  node tools/build.js --watch              # Development watch mode
    `);
    process.exit(0);
  }
  
  // Run build
  build();
}

module.exports = { build, clean, getPackages };