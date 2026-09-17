targetScope = 'resourceGroup'

param location string
param tags object
param resourceToken string
param abbrs object
param apiImageName string
param apiServiceName string
param webServiceName string

@description('Object ID of the principal running azd; granted AcrPush on the registry so a local image build can be pushed. Leave empty to skip.')
param principalId string = ''

@description('AAD principal type of principalId (User, ServicePrincipal, Group, ...). Defaults to User, matching an interactive `azd auth login`; set to ServicePrincipal for CI/CD identities.')
param principalType string = 'User'

var placeholderImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
var effectiveApiImage = empty(apiImageName) ? placeholderImage : apiImageName

// -----------------------------
// Observability
// -----------------------------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${abbrs.analyticsWorkspace}-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// -----------------------------
// User-assigned managed identity (used by the container app to pull from ACR)
// -----------------------------
resource apiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${abbrs.managedIdentityUserAssigned}-api-${resourceToken}'
  location: location
  tags: tags
}

// -----------------------------
// Container Registry (managed-identity pull, no admin user)
// -----------------------------
resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${abbrs.containerRegistry}${resourceToken}'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    zoneRedundancy: 'Disabled'
  }
}

// Built-in AcrPull role definition ID.
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
// Built-in AcrPush role definition ID.
var acrPushRoleId = '8311e382-0749-4cb8-b61a-304f252e45ec'

resource acrPullAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, apiIdentity.id, acrPullRoleId)
  scope: containerRegistry
  properties: {
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
  }
}

// Grants the principal running `azd` permission to push the locally built image, so `azd up` can
// complete without a separate manual role grant. Skipped when principalId is not supplied.
resource acrPushAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(principalId)) {
  name: guid(containerRegistry.id, principalId, acrPushRoleId)
  scope: containerRegistry
  properties: {
    principalId: principalId
    principalType: principalType
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPushRoleId)
  }
}

// -----------------------------
// Container Apps Environment
// -----------------------------
resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${abbrs.containerAppsEnvironment}-${resourceToken}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// -----------------------------
// Static Web App (Free) — created first so we can pass its default hostname
// as a CORS allowed origin to the API container.
// -----------------------------
resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${abbrs.staticWebApp}-${resourceToken}'
  location: location
  tags: union(tags, {
    'azd-service-name': webServiceName
  })
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    // azd handles the build+upload; no repo connection needed here.
    provider: 'Custom'
  }
}

var webHostname = 'https://${staticWebApp.properties.defaultHostname}'

// -----------------------------
// Container App (API)
// -----------------------------
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${abbrs.containerApp}-api-${resourceToken}'
  location: location
  tags: union(tags, {
    'azd-service-name': apiServiceName
  })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${apiIdentity.id}': {}
    }
  }
  dependsOn: [
    acrPullAssignment
  ]
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: apiIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: effectiveApiImage
          resources: {
            cpu: json('0.5')
            memory: '1.0Gi'
          }
          env: [
            {
              name: 'ASPNETCORE_URLS'
              value: 'http://+:8080'
            }
            {
              name: 'AllowedOrigins__0'
              value: webHostname
            }
          ]
          // Revisions only take traffic once the API reports the configuration it will serve with.
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 8080
              }
              initialDelaySeconds: 10
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health/ready'
                port: 8080
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

output containerRegistryLoginServer string = containerRegistry.properties.loginServer
output containerRegistryName string = containerRegistry.name
output apiUri string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output webUri string = webHostname
