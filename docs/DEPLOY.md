# Deploying to Azure with `azd`

This repo ships an [Azure Developer CLI (`azd`)](https://learn.microsoft.com/azure/developer/azure-developer-cli/) template that stands up:

- The .NET 8 API (`backend/ChaosMonkey.Api`) on **Azure Container Apps** (external HTTPS ingress, port 8080)
- The Vite/React UI (`frontend/`) on **Azure Static Web Apps** (Free tier)
- **Azure Container Registry** (Basic; admin user disabled, image pull via user-assigned managed identity + AcrPull role)
- A **user-assigned managed identity** for the container app
- **Container Apps Environment** backed by a **Log Analytics workspace**

## Prerequisites

- [Azure Developer CLI](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) `>= 1.10`
- [Docker](https://docs.docker.com/get-docker/) running locally (`azd` builds the API image)
- An Azure subscription where you have `Owner` or `Contributor` + `User Access Administrator` (needed to create the AcrPull role assignment)

## One-command deploy

```bash
azd auth login
azd up
```

`azd up` will:

1. Prompt for an environment name, subscription, and Azure region.
2. Provision the resource group and all Azure resources via `infra/main.bicep`.
3. Build the API container image from `backend/ChaosMonkey.Api/Dockerfile` (build context is `backend/`) and push it to the new ACR.
4. Roll the Container App to the freshly-pushed image.
5. Build the SPA (`npm run build` in `frontend/`) and upload `frontend/dist` to the Static Web App.

When it finishes, `azd` prints the two service URIs (`SERVICE_API_URI`, `SERVICE_WEB_URI`).

## Frontend → API wiring

`frontend/src/api.ts` reads the API base URL from the Vite build-time env var **`VITE_API_BASE_URL`** (falling back to `''`, i.e. same-origin). Because Static Web Apps serves the built assets as-is, the value has to be baked in at build time.

`azure.yaml`'s `postprovision` hook writes `frontend/.env.production` with `VITE_API_BASE_URL` set to the freshly-provisioned `SERVICE_API_URI` as soon as `azd provision` finishes, so the subsequent `npm run build` (run by `azd deploy web`, including as part of `azd up`) picks it up automatically — no manual `azd env set` step required.

On the API side, the Bicep template already injects `AllowedOrigins__0=https://<swa-default-hostname>` so the API's CORS policy trusts the Static Web App origin without any manual step.

> If you use a custom domain for the SWA, add it to the API's allowed origins by setting an extra env var on the container app (e.g. `AllowedOrigins__1`) or by extending `infra/core/resources.bicep`.

## Expected cost

The default SKUs are the cheapest usable tiers and should land in the **low single-digit USD/month** range for light demo traffic:

| Resource | SKU | Notes |
| --- | --- | --- |
| Static Web App | Free | $0 |
| Container Registry | Basic | ~$5/month |
| Container Apps | Consumption (0.5 vCPU / 1 GiB, min 1 / max 3) | Pay-per-second; idle replica keeps a small baseline |
| Log Analytics | Pay-as-you-go, 30-day retention | First 5 GB/month free |
| Managed Identity | — | Free |

Costs scale with traffic and log volume; check the Azure Pricing Calculator for your region.

## Tear everything down

```bash
azd down --purge
```

`--purge` also removes soft-deleted resources so the environment name can be reused immediately.

## Useful follow-ups

- `azd deploy api` — rebuild + redeploy only the container app
- `azd deploy web` — rebuild + redeploy only the SPA
- `azd env get-values` — dump all outputs (registry endpoint, service URIs, resource group, …)
- `azd monitor` — open the Container App logs in the portal
