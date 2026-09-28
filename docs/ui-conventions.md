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
- A list row is `rounded-xl border bg-[color:var(--color-surface)] px-3 py-2.5`; a card in a
  grid is `rounded-2xl border bg-[color:var(--color-surface)] p-4`. Both lighten the border to
  `--color-border-light` on hover.
- A status chip is `Badge` (`components/ui/Badge`). Its tones (neutral, muted, accent, cyan,
  gold, purple, red) are theme tokens, so the same status has the same colour on every page.

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
| A short typed answer (a name, a passphrase) | `usePrompt()` from `ConfirmDialog`, never `window.prompt()`. `type: 'password'` hides it; `minLength` keeps OK disabled until it is long enough. |
| An error after an action | An inline line in `--color-red` next to the action, not `alert()`. |

A form ends with the actions on the right: a ghost Cancel, then the primary Save or Add.

## Words

- Every string the user reads goes through `t()` and exists in all eight locales
  (`lib/i18n/locales/*.ts`). `locales.test.ts` fails when a locale misses a key.
- Button and filter labels start with a capital letter ("Duplicates", "Clear all"). Short
  status words inside a row can stay lower case ("overdue", "paid").
- Shared words live under `common.*`: Archive, Show archived ({n}), Hide archived, {n} shown,
  Delete, Cancel, Save, Add, Undo, Remove, Done.
- Dates go through `formatDate` and money through `useMoney()` (or `formatMoney` outside React), both in the active language. Never `` `${cur()}${n.toFixed(2)}` ``.

## Colours

- Colours come from the theme tokens in `app/globals.css`: `--color-accent`, `--color-cyan`,
  `--color-red`, `--color-gold`, `--color-purple`, `--color-orange`, the surfaces and the
  three text shades. Each token has a light-theme value, so the page follows the theme.
- For a tint, add an opacity to the token: `bg-[color:var(--color-accent)]/10`. A hex value in
  a class name (`bg-[#00ff8810]`) ignores the light theme and fails the build.

## Navigation and menu structure

Navigation structure is defined centrally in `apps/web/src/lib/nav.ts` and shared across desktop and mobile menus:

- **Desktop**: Sticky top bar provides the logo, AI command bar, direct Home link, 4 dropdown categories (**Money**, **Shopping**, **Home & car**, **Planner**), notification bell, and user account menu.
- **Account menu**: Holds user profile details, Settings, Jobs, AI history, Trash, language switcher, dark/light theme switch, and sign out.
- **Mobile (phones)**: Bottom tab bar with 5 primary destinations:
  - **Home**: (`/`)
  - **Money**: (`/expenses` and highlights for any Money sub-page)
  - **Quick Add**: Center action opening a sheet to scan receipts, add expenses, or add to shopping list.
  - **Calendar**: (`/calendar`)
  - **More**: Full-height sheet with page search jump-bar, grouped category sections, and account/system tools.

## Accessibility

- An icon-only button has an `aria-label` (and a `title` for mouse users).
- One `h1` per page, rendered by `PageHeader`.
- The E2E run checks `/`, `/items`, `/expenses`, `/bills`, `/settings` and `/login` with axe
  for serious and critical issues.

## Checking a change

- The E2E smoke test opens every page at 1280px and at 390px and fails if a page scrolls
  sideways on the phone.
- Every CI run attaches a `page-screenshots` artifact: each page at desktop and phone width.
  Open it to see what a UI change looks like everywhere, without running the app.

## When the rules do not fit

The test's allowlists name the known exceptions and why: the landing hero, sign-in, setup,
the error pages and the command bar's backdrop. Shrink these lists; do not grow them without
saying why in the PR.
