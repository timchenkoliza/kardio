# Архивный снимок перед публикацией: 2026-10-24, 22:09:59 UTC

- **Идентификатор снимка:** `20261024T220959Z`.
- **Начало архивации:** 2026-10-24T22:09:59Z (01:09:59 по Москве, 25.10.2026).
- **Ветка этой записи:** `archive/pre-push-snapshot-20261024-220959`.
  - Основана на `main` = `origin/main` = `acf3cafc2edc5be5c750b9c5e061c651567f5f58`.
  - Содержит только этот документ.
- **Назначение:** подготовка к публикации. Push, merge и deploy не выполнялись. Ни одна существующая ветка, коммит или файл рабочего дерева не изменены. Текущие ветки не переключались, stash для очистки не использовался.

Комплект экспорта — каталог `kardio-full-export-20261024T220959Z/`:
- в облачной среде: `/mnt/user-data/outputs/`;
- на Mac: `~/Documents/_claude_transfer/`.

Итоговые проверки финального bundle лежат в его `EXPORT_REPORT.md`. Финальный bundle содержит и этот коммит, поэтому результаты его проверки нельзя записать внутрь самого коммита.

## Репозитории

Найдено два клона одного репозитория GitHub `timchenkoliza/kardio`. Других Kardio-репозиториев с собственной историей нет.

| Клон | Корень | Общий Git-каталог |
| --- | --- | --- |
| облачная среда (container) | `/home/claude/timchenkoliza/kardio` | `/home/claude/timchenkoliza/kardio/.git` |
| Mac | `/Users/timchenko-e-d/Documents/kardio` | `/Users/timchenko-e-d/Documents/kardio/.git` |

Не относятся к Kardio и в комплект не входят:
- на Mac: пустой репозиторий без коммитов `~/Documents/codex 2` и `~/Documents/physician-b2d-decision-graph` (отдельный проект);
- в облаке: внешние справочные репозитории в каталоге `scratchpad/repos/`.

## Ветки и SHA на начало архивации

### Облачный клон

| Ветка | SHA |
| --- | --- |
| `feat/agent-platform-coverage` (текущая в основном рабочем дереве) | `758a2bb902e346520d21382f4a76bb56ed8582ee` |
| `fix/r1-review` | `731811f037eb0033bdff66eb18113a58c7df3691` |
| `main` (upstream `origin/main`) | `acf3cafc2edc5be5c750b9c5e061c651567f5f58` |
| `port/r1-fixes` | `8dbf71ee2d633be2622539a83a8d924e2abb1c24` |
| `pr-19` | `696c47d40ec45a11bd0d15aea5d31e3cd47ebbf8` |
| `pr-26` | `7090dbe89904398ab85b24eb0134f9b56b8aa730` |
| `pr-27` | `44038977b679424c8dc6db50c4b042885c5e781f` |
| `pr-28` | `895300d7302a58dbee03a861ec7b86068b0fbc5b` |
| `release/r1` | `8d2d1a9e96d2660f27d2b79f52c7c61f16b4af1a` |

- **Отслеживающие ветки:** `origin/main` = `acf3caf…`, `origin/HEAD` → `origin/main`, `local/fix-ux-recovery` = `b46c23a44d9d2d4fc24ac36947757ed3695c8efb`.
- **Теги, stash:** нет.

Известные версии:
- `731811f`, `7eb13af` и `dea13b5` найдены, полные SHA:
  - `731811f037eb0033bdff66eb18113a58c7df3691`;
  - `7eb13af2be95c0361f33fd6ed965d662d820448d`;
  - `dea13b57b721c43be6df506e2e888d066819f709`.
- Полные SHA остальных версий — в `inventory/container-kardio/known-versions.txt`.

### Клон на Mac

- **Ветки:** 22 локальные. Текущая — `feat/agent-mvp-research-slice` = `7090dbe89904398ab85b24eb0134f9b56b8aa730`. Полный список с upstream и состоянием ahead/behind — в `inventory/mac-kardio/branches-local.txt`.
- **Отслеживающие ветки:** 47 (`origin/*`).
- **Тег:** 1, `safety-before-media-rebase-20261019` = `bd9244e06bc0bb98be41110d8ddcfc544ba74bbc`.
- **Stash:** 1, `stash@{0}` = `bcfca6295b9dde763f820bef8f77427e5827ae45` («On rebuild/fullstack-v1: codex: preserve initial scaffold before authoritative baseline refresh»).
- **Отсутствуют на Mac:** `731811f`, `7eb13af` и `758a2bb` — они есть только в облачном клоне. `dea13b5` на Mac есть, это ветка `fix/r1-review`.

## Рабочие деревья и их состояние

### Облачный клон: 6 рабочих деревьев

| Рабочее дерево | HEAD | Изменения |
| --- | --- | --- |
| `/home/claude/timchenkoliza/kardio` | `feat/agent-platform-coverage` | нет |
| `/home/claude/timchenkoliza/kardio-release` | `fix/r1-review` | нет |
| `/home/claude/timchenkoliza/kardio-port` | `port/r1-fixes` | неотслеживаемый только `node_modules` |
| `…/scratchpad/wt-main` | `main` | неотслеживаемые `lib/agents/clinical-terms.ts`, `tests/unit/routing-clinical-terms.test.ts` |
| `…/scratchpad/wt-ux` | отсоединённый HEAD, `b46c23a` | неотслеживаемый `scripts/route-corpus.ts` |
| `…/scratchpad/base-8d2d1a9` | отсоединённый HEAD, `8d2d1a9` | нет |

Во всех деревьях нет ни staged, ни unstaged изменений отслеживаемых файлов.

### Клон на Mac: 6 рабочих деревьев

Состояние снято только командами чтения, с `GIT_OPTIONAL_LOCKS=0`.

| Рабочее дерево | HEAD | Изменения |
| --- | --- | --- |
| `~/Documents/kardio` | `feat/agent-mvp-research-slice` | 8 неотслеживаемых, в том числе `.claude/launch.json`, `.claude/settings.local.json`, `ds-auditor-TASK.md`, `ds-auditor-kit/` |
| `~/Documents/kardio-audit` | `audit/v3-source-of-truth` | изменён `.gitignore`; 10 неотслеживаемых |
| `~/Documents/kardio-feed` | отсоединённый HEAD, `3056292` | нет |
| `~/Documents/kardio/.claude/worktrees/determined-visvesvaraya-e3f810` | `claude/determined-visvesvaraya-e3f810` | 2 неотслеживаемых (`.claude/…`) |
| `~/Documents/kardio/.claude/worktrees/ux-recovery` | `fix/ux-recovery` | нет |
| `/private/tmp/kardio-ux-baseline` | отсоединённый HEAD, `f85d764` | **не проверено:** каталог вне подключённых папок |

## Недостижимые коммиты

- **Облачный клон.** `git fsck --unreachable` нашёл 190 недостижимых коммитов, все в трёх цепочках. Их вершины сохранены новыми ссылками в архивном пространстве имён; существующие ссылки не перемещались:
  - `refs/archive/20261024T220959Z/unreachable/ba5a1e6abf65a132841ab936d2090df36f0f09b6` — style: load integrated workspace composition, 2026-10-19;
  - `refs/archive/20261024T220959Z/unreachable/c893875a4ae93ca38612e646db6168203bf298e8` — style: load visualization pixel pass, 2026-10-19;
  - `refs/archive/20261024T220959Z/unreachable/db82a32ee24524c4fb2eaefbcd4f33bdb47b2cf0` — style: move visualization styling onto semantic tokens, 2026-10-19.
- **Клон на Mac.** Недостижимых коммитов нет. Отсоединённые HEAD `3056292` и `f85d764` достижимы из веток.
- **Reflog** обоих клонов сохранён в `inventory/*/reflog-*.txt`.

## Созданные архивы и проверки (до этого коммита)

- **`bundles/mac/kardio-all-refs.bundle`.**
  - Создан из копии `.git` на VM, чтобы ничего не писать в Git-каталог Mac.
  - Размер 58 135 779 байт, SHA-256 `ab3ffbabb751554d31af01849edaa6e421c8095f47a2a83512ccdb2921982e07`.
  - `git bundle verify`: OK, «records a complete history».
  - `list-heads`: 78 записей. Все 72 ссылки репозитория на месте, SHA совпадают; дополнительно `HEAD` и HEAD рабочих деревьев.
- **Предварительный bundle облачного клона.**
  - Размер 57 794 015 байт, SHA-256 `a5478d66686ff126b1a3b1f7d2779c8e2af6b13b4f15902802314f116c7dc30a`.
  - `verify`: OK, 21 запись. Включает три ссылки `refs/archive/…/unreachable/*`.
  - Финальный bundle создаётся после этого коммита и дополнительно содержит ветку записи.
- **Архивы рабочих деревьев** `worktrees/*.tar.gz`, по одному на дерево, 11 штук: 6 облачных и 5 с Mac.
  - В каждом: отслеживаемые файлы в их текущем виде и все неотслеживаемые неигнорируемые файлы.
  - Рядом с каждым — `.manifest.tsv` (путь, размер, SHA-256 каждого файла) и `.excluded.txt` (исключённые пути и причина).
  - Число файлов в каждом архиве совпало с манифестом, `gzip -t` проходит.
- **Патчи** `patches/<дерево>/`: `staged.patch`, `tracked-vs-HEAD.patch`, `untracked.txt`. Непустой только патч `mac-kardio-audit/tracked-vs-HEAD.patch` (изменение `.gitignore`).

## Ограничения, исключения и что не сохранено

- **Bundle не содержит незакоммиченных изменений.** Они есть только в архивах рабочих деревьев и патчах.
- **Исключены как секреты.** Содержимое не выводилось:
  - `~/Documents/kardio/.env.local`;
  - `~/Documents/kardio/.claude/settings.local.json` и та же копия в `.claude/worktrees/determined-visvesvaraya-e3f810/` — в файле строка подключения к локальной базе с паролем.
- **Исключены как данные, не исходники:**
  - локальные каталоги PostgreSQL `~/Documents/kardio/.local/` (139 МБ) и `…/ux-recovery/.local/` (73 МБ);
  - `context/private-data/` — исследование источников от врачей, CSV и HTML; там возможны персональные данные.
- **Исключены как воспроизводимые:** `node_modules/`, `.next/`, `playwright-report/`, `test-results/`, `tsconfig.tsbuildinfo` и метаданные macOS `.DS_Store`.
- **Не сохранены файлы рабочего дерева `/private/tmp/kardio-ux-baseline`:** каталог недоступен этой сессии. Его HEAD `f85d764` есть в bundle Mac.
- **В Git-каталоге Mac** лежат 6 временных файлов `objects/pack/tmp_*` (1,23 МБ) от прерванного ранее fetch. Они не мешают работе и не удалялись, потому что удаление в подключённой папке запрещено.
- **Проверка публикации (`git push --dry-run`) из облачной среды невозможна.** Git-прокси отвечает 403: у сессии нет прав на `timchenkoliza/kardio`. Чтение `git ls-remote` прошло, 77 ссылок на GitHub. Dry-run нужно выполнить на Mac по `PUSH_PLAN.md`.
