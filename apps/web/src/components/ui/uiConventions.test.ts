import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// UI conventions (#351), checked on the source so a page cannot quietly drift from the shared
// look again. docs/ui-conventions.md explains each rule and the component to use instead.
// An allowlist entry is a known exception with a reason, not a place to park new code.

const SRC = join(__dirname, '..', '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

const FILES = [...tsxFiles(join(SRC, 'app')), ...tsxFiles(join(SRC, 'components'))].map((path) => ({
  rel: relative(SRC, path).split('\\').join('/'),
  text: readFileSync(path, 'utf8'),
}));

/** Every match of `re` outside the allowlisted files, as "file:line  text". */
function offenders(re: RegExp, allow: string[] = []): string[] {
  const out: string[] = [];
  for (const f of FILES) {
    if (allow.includes(f.rel)) continue;
    f.text.split('\n').forEach((line, i) => {
      if (re.test(line)) out.push(`${f.rel}:${i + 1}  ${line.trim().slice(0, 120)}`);
    });
  }
  return out;
}

describe('UI conventions (#351, docs/ui-conventions.md)', () => {
  it('pages use PAGE_MAIN and PageHeader, not a hand-made header', () => {
    const allow = [
      'components/ui/PageHeader.tsx',
      // Screens that are not list pages: the landing hero, sign-in, first-run setup, the share
      // sheet, and the error pages.
      'app/page.tsx',
      'app/login/LoginForm.tsx',
      'app/setup/SetupWizard.tsx',
      'app/capture/share/ShareTargetClient.tsx',
      'app/error.tsx',
      'app/global-error.tsx',
      'app/not-found.tsx',
    ];
    expect(offenders(/<h1[\s>]/, allow), 'render the title with <PageHeader> instead of an <h1>').toEqual([]);
    expect(offenders(/<main className="max-w-\[1400px\]/, allow), 'use <main className={PAGE_MAIN}>').toEqual([]);
  });

  it('asks with the app dialog, never the browser one', () => {
    // useConfirm() and usePrompt() are called with an options object: `await confirm({ title, … })`.
    expect(
      offenders(/\bwindow\.(alert|confirm|prompt)\s*\(|(?<![\w.])(alert|confirm|prompt)\(\s*(?!\{)/),
      'use useConfirm(), usePrompt() or an inline message'
    ).toEqual([]);
  });

  it('opens overlays with the shared Modal', () => {
    const allow = [
      'components/ui/Modal.tsx',
      'components/FirstRunTour.tsx', // the guided tour draws its own spotlight
      'components/AiCommandBar.tsx', // the command bar's dimmed backdrop
      'components/SiteNav.tsx', // only mentions the command bar's backdrop in a comment
      'components/ui/FileDrop.tsx', // the page-wide drop target shown while a file is dragged
    ];
    expect(offenders(/fixed inset-0/, allow), 'use <Modal> from components/ui/Modal').toEqual([]);
  });

  it('keeps no local copy of a shared component or control style', () => {
    expect(
      offenders(/^(?:export )?function (Field|Modal|EmptyState|PageHeader|FilterGroup)\b/, [
        'components/ui/Field.tsx',
        'components/ui/Modal.tsx',
        'components/ui/EmptyState.tsx',
        'components/ui/PageHeader.tsx',
      ]),
      'import it from components/ui instead'
    ).toEqual([]);
    expect(
      offenders(/^\s*(?:export )?const (inputClass|selectClass|inputCls|selectCls|selCls|labelCls|fLabel)\s*=/),
      'use controlClass / filterControlClass / compactControlClass from components/ui/Input, or FIELD_LABEL'
    ).toEqual([]);
  });

  it('takes dates through DateInput, in the app language\'s order', () => {
    // A native date input shows the operating system's order (mm/dd/yyyy on a US machine).
    expect(offenders(/type="date"/, ['components/ui/DateInput.tsx']), 'use <DateInput value onValueChange />').toEqual([]);
  });

  it('shows empty lists with EmptyState, not a large emoji', () => {
    const allow = ['app/error.tsx', 'app/not-found.tsx'];
    expect(offenders(/className="text-5xl/, allow), 'use <EmptyState icon={…} title={…} />').toEqual([]);
  });

  it('takes colours from the theme, not from hex values in class names', () => {
    // bg-[#00ff8808] ignores the light theme; bg-[color:var(--color-accent)]/3 follows it.
    expect(offenders(/-\[#[0-9a-fA-F]{3,8}\]/), 'use a --color-* token').toEqual([]);
  });
});
