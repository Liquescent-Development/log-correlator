#!/usr/bin/env node

/**
 * Changelog generation tool for log-correlator
 * Generates and maintains CHANGELOG.md from git commits
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT_DIR, 'CHANGELOG.md');

// Configuration
const CONFIG = {
  unreleased: process.argv.includes('--unreleased'),
  all: process.argv.includes('--all'),
  from: process.argv.find(arg => arg.startsWith('--from='))?.split('=')[1],
  to: process.argv.find(arg => arg.startsWith('--to='))?.split('=')[1] || 'HEAD',
  output: process.argv.find(arg => arg.startsWith('--output='))?.split('=')[1] || CHANGELOG_PATH,
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose')
};

// Commit type mappings
const COMMIT_TYPES = {
  feat: { title: '✨ Features', emoji: '✨' },
  feature: { title: '✨ Features', emoji: '✨' },
  fix: { title: '🐛 Bug Fixes', emoji: '🐛' },
  bugfix: { title: '🐛 Bug Fixes', emoji: '🐛' },
  perf: { title: '⚡ Performance', emoji: '⚡' },
  refactor: { title: '♻️ Refactoring', emoji: '♻️' },
  docs: { title: '📝 Documentation', emoji: '📝' },
  test: { title: '✅ Tests', emoji: '✅' },
  build: { title: '📦 Build', emoji: '📦' },
  ci: { title: '👷 CI/CD', emoji: '👷' },
  chore: { title: '🔧 Maintenance', emoji: '🔧' },
  style: { title: '💄 Style', emoji: '💄' },
  revert: { title: '⏪ Reverts', emoji: '⏪' },
  deps: { title: '📌 Dependencies', emoji: '📌' }
};

// Logging utilities
const log = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  verbose: (msg) => CONFIG.verbose && console.log(`   ${msg}`)
};

// Execute git command
function exec(command) {
  try {
    log.verbose(`Executing: ${command}`);
    return execSync(command, { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
  } catch (error) {
    log.error(`Command failed: ${command}`);
    throw error;
  }
}

// Get all tags
function getTags() {
  try {
    const tags = exec('git tag --sort=-v:refname');
    return tags ? tags.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

// Get commits between two refs
function getCommits(from, to = 'HEAD') {
  const format = '%H|%an|%ae|%ad|%s|%b';
  const command = from 
    ? `git log ${from}..${to} --pretty=format:"${format}"`
    : `git log ${to} --pretty=format:"${format}"`;
  
  const output = exec(command);
  if (!output) return [];
  
  return output.split('\n').map(line => {
    const [hash, author, email, date, subject, body] = line.split('|');
    return { hash, author, email, date, subject, body: body || '' };
  });
}

// Parse commit message
function parseCommit(commit) {
  const { hash, author, date, subject, body } = commit;
  
  // Check for breaking changes
  const isBreaking = subject.includes('!') || 
                    body.toLowerCase().includes('breaking change');
  
  // Parse conventional commit format
  const conventionalMatch = subject.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)/);
  
  if (conventionalMatch) {
    const [, type, scope, description] = conventionalMatch;
    return {
      hash: hash.substring(0, 7),
      type: type.toLowerCase(),
      scope,
      description,
      author,
      date: new Date(date),
      breaking: isBreaking,
      body
    };
  }
  
  // Parse non-conventional commits
  return {
    hash: hash.substring(0, 7),
    type: 'other',
    scope: null,
    description: subject,
    author,
    date: new Date(date),
    breaking: isBreaking,
    body
  };
}

// Group commits by type
function groupCommits(commits) {
  const groups = {
    breaking: [],
    features: [],
    fixes: [],
    performance: [],
    refactor: [],
    docs: [],
    tests: [],
    build: [],
    ci: [],
    chore: [],
    style: [],
    revert: [],
    deps: [],
    other: []
  };
  
  commits.forEach(commit => {
    const parsed = parseCommit(commit);
    
    if (parsed.breaking) {
      groups.breaking.push(parsed);
    }
    
    switch (parsed.type) {
      case 'feat':
      case 'feature':
        groups.features.push(parsed);
        break;
      case 'fix':
      case 'bugfix':
        groups.fixes.push(parsed);
        break;
      case 'perf':
        groups.performance.push(parsed);
        break;
      case 'refactor':
        groups.refactor.push(parsed);
        break;
      case 'docs':
        groups.docs.push(parsed);
        break;
      case 'test':
      case 'tests':
        groups.tests.push(parsed);
        break;
      case 'build':
        groups.build.push(parsed);
        break;
      case 'ci':
        groups.ci.push(parsed);
        break;
      case 'chore':
        groups.chore.push(parsed);
        break;
      case 'style':
        groups.style.push(parsed);
        break;
      case 'revert':
        groups.revert.push(parsed);
        break;
      case 'deps':
      case 'dep':
        groups.deps.push(parsed);
        break;
      default:
        groups.other.push(parsed);
    }
  });
  
  return groups;
}

// Format commit line
function formatCommit(commit) {
  const scope = commit.scope ? `**${commit.scope}:** ` : '';
  const link = `[${commit.hash}]`;
  
  return `- ${scope}${commit.description} ${link}`;
}

// Generate changelog section
function generateSection(version, date, groups) {
  const lines = [];
  
  // Version header
  if (version === 'unreleased') {
    lines.push('## [Unreleased]');
  } else {
    lines.push(`## [${version}] - ${date}`);
  }
  lines.push('');
  
  // Breaking changes
  if (groups.breaking.length > 0) {
    lines.push('### ⚠️ BREAKING CHANGES');
    lines.push('');
    groups.breaking.forEach(commit => {
      lines.push(formatCommit(commit));
      if (commit.body) {
        lines.push('');
        lines.push('  ' + commit.body.trim().replace(/\n/g, '\n  '));
        lines.push('');
      }
    });
    lines.push('');
  }
  
  // Features
  if (groups.features.length > 0) {
    lines.push('### ✨ Features');
    lines.push('');
    groups.features.forEach(commit => {
      lines.push(formatCommit(commit));
    });
    lines.push('');
  }
  
  // Bug fixes
  if (groups.fixes.length > 0) {
    lines.push('### 🐛 Bug Fixes');
    lines.push('');
    groups.fixes.forEach(commit => {
      lines.push(formatCommit(commit));
    });
    lines.push('');
  }
  
  // Performance
  if (groups.performance.length > 0) {
    lines.push('### ⚡ Performance');
    lines.push('');
    groups.performance.forEach(commit => {
      lines.push(formatCommit(commit));
    });
    lines.push('');
  }
  
  // Other sections (only if commits exist)
  const otherSections = [
    { key: 'refactor', title: '♻️ Refactoring' },
    { key: 'docs', title: '📝 Documentation' },
    { key: 'tests', title: '✅ Tests' },
    { key: 'build', title: '📦 Build' },
    { key: 'ci', title: '👷 CI/CD' },
    { key: 'deps', title: '📌 Dependencies' }
  ];
  
  otherSections.forEach(({ key, title }) => {
    if (groups[key].length > 0) {
      lines.push(`### ${title}`);
      lines.push('');
      groups[key].forEach(commit => {
        lines.push(formatCommit(commit));
      });
      lines.push('');
    }
  });
  
  // Other commits (if not hiding)
  if (groups.other.length > 0 && !process.argv.includes('--no-other')) {
    lines.push('### 📝 Other Changes');
    lines.push('');
    groups.other.forEach(commit => {
      lines.push(formatCommit(commit));
    });
    lines.push('');
  }
  
  return lines.join('\n');
}

// Generate full changelog
function generateChangelog() {
  const tags = getTags();
  const sections = [];
  
  // Header
  sections.push('# Changelog');
  sections.push('');
  sections.push('All notable changes to this project will be documented in this file.');
  sections.push('');
  sections.push('The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),');
  sections.push('and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).');
  sections.push('');
  
  // Unreleased section
  if (CONFIG.unreleased || CONFIG.all) {
    const from = tags[0] || null;
    const commits = getCommits(from, 'HEAD');
    
    if (commits.length > 0) {
      const groups = groupCommits(commits);
      sections.push(generateSection('unreleased', null, groups));
    }
  }
  
  // Released versions
  if (CONFIG.all || !CONFIG.unreleased) {
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const previousTag = tags[i + 1] || null;
      
      // Get tag date
      const tagDate = exec(`git log -1 --format=%ai ${tag}`).split(' ')[0];
      
      // Get commits for this release
      const commits = getCommits(previousTag, tag);
      
      if (commits.length > 0) {
        const groups = groupCommits(commits);
        const version = tag.replace(/^v/, '');
        sections.push(generateSection(version, tagDate, groups));
      }
    }
  }
  
  // Add links section
  sections.push('---');
  sections.push('');
  sections.push('## Links');
  sections.push('');
  
  if (CONFIG.all || !CONFIG.unreleased) {
    const repoUrl = getRepoUrl();
    
    sections.push(`[Unreleased]: ${repoUrl}/compare/${tags[0]}...HEAD`);
    
    for (let i = 0; i < tags.length - 1; i++) {
      const version = tags[i].replace(/^v/, '');
      sections.push(`[${version}]: ${repoUrl}/compare/${tags[i + 1]}...${tags[i]}`);
    }
    
    if (tags.length > 0) {
      const firstVersion = tags[tags.length - 1].replace(/^v/, '');
      sections.push(`[${firstVersion}]: ${repoUrl}/releases/tag/${tags[tags.length - 1]}`);
    }
  }
  
  return sections.join('\n');
}

// Get repository URL
function getRepoUrl() {
  try {
    const remote = exec('git config --get remote.origin.url');
    
    // Convert SSH to HTTPS
    if (remote.startsWith('git@github.com:')) {
      return remote
        .replace('git@github.com:', 'https://github.com/')
        .replace('.git', '');
    }
    
    // Clean HTTPS URL
    return remote.replace('.git', '');
  } catch {
    return 'https://github.com/liquescent/log-correlator';
  }
}

// Update existing changelog
function updateChangelog(content) {
  if (fs.existsSync(CONFIG.output)) {
    const existing = fs.readFileSync(CONFIG.output, 'utf8');
    
    // Find where to insert new content
    const unreleasedIndex = existing.indexOf('## [Unreleased]');
    
    if (unreleasedIndex !== -1) {
      // Replace unreleased section
      const nextSectionIndex = existing.indexOf('\n## [', unreleasedIndex + 1);
      
      if (nextSectionIndex !== -1) {
        const before = existing.substring(0, unreleasedIndex);
        const after = existing.substring(nextSectionIndex);
        return before + content + after;
      }
    }
  }
  
  return content;
}

// Main function
function main() {
  console.log('📝 Generating Changelog\n');
  
  try {
    // Generate content based on options
    let content;
    
    if (CONFIG.from) {
      // Generate for specific range
      log.info(`Generating changelog from ${CONFIG.from} to ${CONFIG.to}`);
      const commits = getCommits(CONFIG.from, CONFIG.to);
      const groups = groupCommits(commits);
      content = generateSection('Custom Range', new Date().toISOString().split('T')[0], groups);
    } else {
      // Generate full changelog
      log.info('Generating full changelog');
      content = generateChangelog();
    }
    
    // Write or display
    if (CONFIG.dryRun) {
      console.log('\n--- DRY RUN OUTPUT ---\n');
      console.log(content);
    } else {
      fs.writeFileSync(CONFIG.output, content);
      log.success(`Changelog written to ${CONFIG.output}`);
    }
    
  } catch (error) {
    log.error('Failed to generate changelog');
    console.error(error);
    process.exit(1);
  }
}

// CLI handling
if (require.main === module) {
  if (process.argv.includes('--help')) {
    console.log(`
Changelog Generation Tool

Usage: node tools/changelog.js [options]

Options:
  --unreleased      Generate only unreleased changes
  --all             Generate complete changelog
  --from=<ref>      Generate from specific ref/tag
  --to=<ref>        Generate to specific ref/tag (default: HEAD)
  --output=<file>   Output file (default: CHANGELOG.md)
  --no-other        Hide commits without type
  --dry-run         Show output without writing
  --verbose         Show detailed output
  --help            Show this help message

Examples:
  node tools/changelog.js --all
  node tools/changelog.js --unreleased
  node tools/changelog.js --from=v1.0.0 --to=v2.0.0
  node tools/changelog.js --dry-run --unreleased
    `);
    process.exit(0);
  }
  
  main();
}

module.exports = { generateChangelog, parseCommit, groupCommits };