# UI conventions

Every page in PHAROS should look and behave the same way, so moving from Bills to Expenses
to Inventory never means learning a new layout. Inventory (`/items`) is the reference page.
The shared pieces live in `apps/web/src/components/ui/`, and a unit test
(`components/ui/uiConventions.test.ts`) fails the build when a page drifts from them.

This page lists what to use for each part of a page. It started with
[#351](https://github.com/achilleasgkekas/pharos/issues/351).

## Page layout

```text
Title  count · subtitle                 [stats] [actions…] [grid|list] [+ New]
───────────────────────────────────────────────────────────────────────────────
[filters sidebar]   content
```

| Part | Use | Notes |
| --- | --- | --- |
| Page wrapper | `<main className={PAGE_MAIN}>` | Same width and padding on every page. |
| Title row | `PageHeader` | Takes `title`, `count` and an optional one-line `subtitle`. No icon in the title: Inventory has none. |
| Header figures | `HeaderStat` | "to pay €120", "due this month €80". |
| Secondary actions | `HeaderButton` | Select, Duplicates, Import, Show archived. The outlined style. |
| View switch | `ViewToggle` | Grid / list, board / list, month / agenda. It lives in the header, never under it. |
| Main action | `PrimaryAction` | Always last on the right, labelled "New". |
| Filters | `FilterLayout`, `FilterSection`, `FilterOptions` | A sidebar on desktop and a drawer on phones. `FilterOptions` for a single-choice list such as status. |

All of these come from `components/ui/PageHeader.tsx`.

## Lists and empty states

- An empty list shows `EmptyState` with the page's own nav icon (the one in `SiteNav`), one
  line saying why it is empty and, if it helps, a hint. No large emoji: they render
  differently on every operating system.
- When filters hide everything, say so (`ex.emptyFiltered`: "Nothing matches these filters.")
  rather than showing the first-run text.
- A list row is a bordered `rounded-xl` block on `--color-surface`; a card in a grid is the same
  block with more padding.

## Forms and dialogs

| Need | Use |
| --- | --- |
| A dialog or a form over the page | `Modal` from `components/ui/Modal` (Radix Dialog: focus trap, Escape, an accessible title). Never a hand-made `fixed inset-0` overlay. |
| A labelled field | `Field`. Its label wraps the control so a screen reader names it. Pass `as="div"` when the child is a row of buttons or other composite widget. |
| A text or number input | `Input` |
| A date | `DateInput`, which shows the app language's day/month order. Not `<input type="date">`. |
| A native `<select>` or a `<textarea>` | `className={controlClass}` from `components/ui/Input` |
| A control in the filter sidebar | `filterControlClass` |
| A dense control in a table row or small popover | `compactControlClass` |
| Buttons | `Button` with `variant` `primary`, `secondary`, `ghost` or `danger` |
| "Are you sure?" | `useConfirm()` from `ConfirmDialog`, never `window.confirm()` or `alert()`. Say where the thing goes: "It moves to Trash." |
| An error after an action | An inline line in `--color-red` next to the action, not `alert()`. |

A form ends with the actions on the right: a ghost Cancel, then the primary Save or Add.

## Words

- Every string the user reads goes through `t()` and exists in all eight locales
  (`lib/i18n/locales/*.ts`). `locales.test.ts` fails when a locale misses a key.
- Button and filter labels start with a capital letter ("Duplicates", "Clear all"). Short
  status words inside a row can stay lower case ("overdue", "paid").
- Shared words live under `common.*`: Archive, Show archived ({n}), Hide archived, {n} shown,
  Delete, Cancel, Save, Add, Undo, Remove, Done.
- Dates go through `formatDate` and money through `formatMoney`, both in the active language.

## Colours

- Colours come from the theme tokens in `app/globals.css`: `--color-accent`, `--color-cyan`,
  `--color-red`, `--color-gold`, `--color-purple`, `--color-orange`, the surfaces and the
  three text shades. Each token has a light-theme value, so the page follows the theme.
- For a tint, add an opacity to the token: `bg-[color:var(--color-accent)]/10`. A hex value in
  a class name (`bg-[#00ff8810]`) ignores the light theme and fails the build.

## Accessibility

- An icon-only button has an `aria-label` (and a `title` for mouse users).
- One `h1` per page, rendered by `PageHeader`.
- The E2E run checks `/`, `/items`, `/expenses`, `/bills`, `/settings` and `/login` with axe
  for serious and critical issues.

## When the rules do not fit

The test's allowlists name the known exceptions and why: the landing hero, sign-in, setup,
the error pages, the Settings header (still to move), the command bar's backdrop and a few
`window.prompt()` calls in Settings. Shrink these lists; do not grow them without saying why
in the PR.
