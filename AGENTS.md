# Repository Guidelines

## Project Structure & Module Organization
This repository is a `uni-app` WeChat Mini Program project. Core app entry files live at the root: `App.vue`, `main.js`, `pages.json`, `manifest.json`, and `uni.scss`. Page views are under `pages/` (for example `pages/index/index.vue`, `pages/fridge/index.vue`, `pages/recipe-detail/index.vue`). Shared UI belongs in `components/`. Static assets such as tab bar icons belong in `static/`. Cloud functions live in `cloudfunctions/`, with one folder per function, for example `cloudfunctions/login/` or `cloudfunctions/getFavorites/`.

Compiled mini-program output is generated to `unpackage/dist/dev/mp-weixin/`. The root `project.config.json` sets `miniprogramRoot` to that folder and `cloudfunctionRoot` to `cloudfunctions/`, so WeChat DevTools opens the **project root** (the folder containing `project.config.json`) and reads mini program code from the compiled output while cloud functions come from source.

## Build, Test, and Development Commands
There is no repo-local `package.json` or scripted CLI workflow yet. Use the standard `uni-app` tools:

- `HBuilderX -> 运行 -> 运行到小程序模拟器 -> 微信开发者工具`: build and launch the app.
- WeChat DevTools: open the project root (the folder containing `project.config.json`). Mini program code is read from `miniprogramRoot` (`unpackage/dist/dev/mp-weixin/`), cloud functions from `cloudfunctionRoot` (`cloudfunctions/`).
- Cloud function deploy: right-click a function under `cloudfunctions/` in WeChat DevTools and choose deploy after setting `cloudfunctionRoot`.

## Coding Style & Naming Conventions
Use Vue 3 with `<script setup>`. Follow the existing style:

- Indentation: tabs in `.vue` files and root config files.
- Components: PascalCase file names, for example `RecipeCard.vue`.
- Pages: route-oriented folders with `index.vue`, for example `pages/user/index.vue`.
- Styles: SCSS with shared tokens from `uni.scss`; prefer existing variables such as `$primary-color` and `$page-bg-color`.

Keep page logic simple, move reusable behavior into hooks or shared components when it appears more than once.

## Testing Guidelines
There is no automated test suite yet. Validate changes by:

- rebuilding the app in HBuilderX,
- testing the affected flow in WeChat DevTools,
- checking cloud function logs for backend changes.

For AI or cloud changes, verify both success and failure states in the UI.

## Documentation
`RPD.md` and `DATABASE.md` are reference documents, not change logs. Do not update them for routine feature work or refactors; only modify them when the user explicitly asks. Treat code as the source of truth for current behavior.

## Commit & Pull Request Guidelines
Git history is not available in this workspace, so no established commit convention can be inferred. Use short, imperative commit messages such as `add cloudbase ai gateway config` or `refine recipe detail loading state`.

For pull requests, include:

- a brief scope summary,
- screenshots or screen recordings for UI changes,
- affected pages or cloud functions,
- any required environment variables or console configuration.

## Security & Configuration Tips
Do not hardcode secrets in frontend code. Keep API keys in cloud function environment variables only. Treat `unpackage/` as build output; make source edits in root files, `pages/`, `components/`, and `cloudfunctions/`.
