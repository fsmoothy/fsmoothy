module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [2, 'always', ['start-case', 'lower-case']],
    'type-enum': [
      2,
      'always',
      [
        'style',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'test',
        'wip',
        'chore',
      ],
    ],
  },
};
