// commitlint.config.cjs — OS 2.2 Agentic Engineering Standard
// Enforces Conventional Commits 1.0.0 across all agents and contributors.
// See .agents/rules/git_conventions.md for the full policy.

'use strict';

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Enforce exactly these commit types — no others accepted
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'perf'],
    ],
    // Scope must be lowercase (e.g., auth, firestore, ui)
    'scope-case': [2, 'always', 'lower-case'],
    // Subject (description) must not start with capital letter or end with period
    'subject-case': [
      2,
      'never',
      ['sentence-case', 'start-case', 'pascal-case', 'upper-case'],
    ],
    'subject-full-stop': [2, 'never', '.'],
    // Keep headers concise
    'header-max-length': [2, 'always', 100],
    // Enforce blank lines before body and footer
    'body-leading-blank': [1, 'always'],
    'footer-leading-blank': [1, 'always'],
    // Foot notes for BREAKING CHANGE and Co-authored-by
    'footer-max-line-length': [2, 'always', 200],
  },
  // Ignore auto-generated commits (release-please, Librarian sync)
  ignores: [
    (commit) => commit.includes('[skip ci]'),
    (commit) => commit.startsWith('chore: release'),
    (commit) => commit.includes('auto-sync Mermaid diagrams via The Librarian'),
  ],
};
