# Deployment and operations

## Verified public static demo

GitHub Pages is enabled on `gh-pages` and the first static release was deployed successfully at https://khancon.github.io/docs-ai-agent/ on November 3, 2026. The production browser QA verified the workbench, corpus loading and YAML selector-mismatch example. This is the evidence-only fallback.

## Cloudflare native Worker path

The full app is deployed at **https://kubeguide-khancon.ahnaf-khan1.workers.dev/** on the free Workers plan. All three featured scenarios returned live generated answers with valid citations on November 3, 2026. See `evaluation/live-smoke.json`.

A free Worker named `kubeguide-khancon` runs in the owner's account. `wrangler.jsonc` uses a native `AI` binding, avoiding API keys. The verified origin is `https://kubeguide-khancon.ahnaf-khan1.workers.dev`. Owner-authorized Wrangler deployment and real-provider verification succeeded. Future deployments require a fresh owner-authorized CLI login.

Build the normal (empty base path) static export, run `python scripts/build_sites.py`, then use `node frontend/node_modules/wrangler/bin/wrangler.js deploy`. The CLI dry run validates the 1.2 MiB gzipped bundle and AI binding. Stay on the free plan; do not enable paid overages. The documented scoped OAuth flow uses account/profile reads, Worker scripts, and Workers AI. Remove the temporary local CLI login after verification.

## Public Sites deployment

The current demo is designed for `https://kubeguide-khancon.ahnaf-khan1.chatgpt.site` (verify the deployment record before relying on this URL). The source includes a portable Worker that serves the static Next export and optional same-origin API. The public browser evidence mode needs no external credential.

Build locally:

```sh
python scripts/sync_frontend.py
cd frontend && corepack pnpm build && cd ..
python scripts/build_sites.py
```

`python scripts/build_sites.py` creates `.cache/sites-worker.js`. Use the Sites skill's source/packaging workflow and retain the existing project identity. Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` through server-side Sites environment-variable settings to enable generation. `GENERATION_MODEL` is optional. Secrets must never appear in a source file, browser bundle, screenshot, or committed environment file.

## Vercel frontend

1. Create/sign in to a Vercel account and import this GitHub repository.
2. Select the implementation branch until the PR has merged.
3. Set Root Directory to `frontend`. Include files outside the root directory in the build so `../scripts` and `../data` can be read.
4. Use the committed Vercel configuration. It syncs the corpus before `pnpm build` and publishes `out`.
5. For browser-only evidence mode leave `NEXT_PUBLIC_API_URL` empty. For the Render backend set it to the actual Render HTTPS origin and redeploy.
6. Request `kubeguide-khancon.vercel.app` if available. The name is not reserved by this source code.
7. Verify a signed-out visit, citation drawer, mobile layout, manifest findings, and evaluation download.

## Render Python API

1. Create/sign in to a Render account and connect the GitHub repository.
2. Create a Blueprint from `render.yaml`, selecting the implementation branch until merge.
3. Retain the Free instance plan. No disk or free Postgres is required.
4. Configure `ALLOWED_ORIGINS` using the actual frontend origin(s).
5. Add Cloudflare account ID/token as environment secrets. Leave them empty to run evidence-only API mode.
6. Confirm `/health/ready` reports the expected corpus revision and correct generation availability.
7. Set Vercel's `NEXT_PUBLIC_API_URL` to the actual backend origin.

Free Render instances sleep after inactivity and have 512 MB RAM; the public image omits ONNX/PyTorch and calls hosted query embeddings. Float32 passage vectors and corpus data are already in the image. Filesystem changes are not relied upon. No model download occurs on startup.

## Cloudflare inference setup — owner action required

Create a Cloudflare account, enable Workers AI, and create an account-scoped token with only the required Workers AI permission. Creating accounts/credentials and accepting provider terms must be completed by the owner. Verify the chosen model is available on the free plan. Configure server-side secrets, then test an actual live response and provider error/limit handling. Do not claim live generation is operational until this succeeds.

The default model is a configurable initial candidate, not a claim that it is the newest or best model. Recheck provider model availability at activation time. The free allocation covers both embedding and generation usage. Do not enable paid overages merely to make the demo work.

## Release smoke checks

- `/health/live` and `/health/ready` return 200.
- Corpus checksum/revision agrees with the release.
- Each featured scenario returns sources; YAML example reports selector mismatch.
- Unknown/unanswerable terms do not produce fabricated evidence.
- Invalid JSON, oversized requests, bad YAML and invalid source references are handled.
- Missing provider credentials and provider failure return labeled evidence mode.
- With credentials, check `mode=live_ai`, valid source IDs, actual provider usage, and the displayed privacy wording.
- Check keyboard navigation, mobile overflow, source links, and stop/retry.

## Rollback

Roll back to the previous deployment/version with its matching index. Do not overwrite the deployed index in place. For Render use the prior service deployment. For Vercel promote the previous deployment. For Sites deploy the previously saved version ID. After rollback confirm `/health/ready` and a featured query.

## Updating documentation

Update the fixed revision intentionally; rebuild corpus and vectors offline; run retrieval evaluation and regression tests; review changed failures; release code and data together. Never run refresh jobs as part of API startup. Scheduled unattended refresh is intentionally not enabled without an owner-selected cadence and release policy.

## GitHub Pages alternative (no new hosting account)

Build with `NEXT_PUBLIC_BASE_PATH=/docs-ai-agent`, publish the contents of `frontend/out` to the `gh-pages` branch, and include a `.nojekyll` file. In repository Settings → Pages choose “Deploy from a branch,” `gh-pages`, `/ (root)`, and Save. The intended free URL is `https://khancon.github.io/docs-ai-agent/`. This branch hosts the browser evidence experience; a configured Python API can still be connected through `NEXT_PUBLIC_API_URL` in a future build. Do not claim the URL is live until GitHub reports a successful Pages deployment.
