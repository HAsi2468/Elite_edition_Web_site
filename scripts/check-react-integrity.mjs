import { ESLint } from 'eslint';

async function main() {
  const eslint = new ESLint({
    overrideConfig: {
      rules: {
        'react-hooks/rules-of-hooks': 'error',
        'no-undef': 'error',
        'no-dupe-keys': 'error',
        'no-unused-vars': 'off',
        'no-empty': 'off',
        'react/prop-types': 'off',
        'react-refresh/only-export-components': 'off',
        'react/no-unescaped-entities': 'off'
      }
    }
  });

  console.log('🔍 Auditing all React components for hook rules and undefined references...');
  const results = await eslint.lintFiles([
    'src/components/**/*.{js,jsx}',
    'src/pages/**/*.{js,jsx}',
    'src/hooks/**/*.{js,jsx}',
    'src/contexts/**/*.{js,jsx}'
  ]);

  const criticalIssues = [];
  for (const res of results) {
    const errors = res.messages.filter(m =>
      m.ruleId === 'react-hooks/rules-of-hooks' ||
      m.ruleId === 'no-undef' ||
      m.ruleId === 'no-dupe-keys'
    );
    if (errors.length > 0) {
      criticalIssues.push({
        filePath: res.filePath,
        errors
      });
    }
  }

  if (criticalIssues.length > 0) {
    console.error('\n❌ CRITICAL REACT / JAVASCRIPT INTEGRITY ISSUES DETECTED:');
    let totalErrors = 0;
    for (const issue of criticalIssues) {
      console.error(`\n📄 ${issue.filePath}`);
      for (const err of issue.errors) {
        totalErrors++;
        console.error(`   Line ${err.line}:${err.column} [${err.ruleId}] -> ${err.message}`);
      }
    }
    console.error(`\nTotal critical crash-risk issues: ${totalErrors}`);
    process.exit(1);
  } else {
    console.log('✅ Integrity check passed! Zero React hook violations and zero undefined references.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Error running integrity check:', err);
  process.exit(1);
});
