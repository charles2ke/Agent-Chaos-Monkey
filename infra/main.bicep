targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the azd environment; used to derive resource names and tag resources.')
param environmentName string

@minLength(1)
@description('Azure region for all resources.')
param location string

@description('Object ID of the principal running azd; granted AcrPush so the local image push in `azd up` succeeds.')
param principalId string = ''

@description('AAD principal type of principalId (User, ServicePrincipal, Group, ...). Defaults to User, matching an interactive `azd auth login`; set to ServicePrincipal for CI/CD identities.')
param principalType string = 'User'

@description('Full container image reference for the API. Leave empty on first deploy; azd will build and push, then set this on subsequent deployments.')
param apiImageName string = ''

var abbrs = loadJsonContent('./abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = {
  'azd-env-name': environmentName
}

resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: '${abbrs.resourcesResourceGroups}-${environmentName}'
  location: location
  tags: tags
}

module resources 'core/resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    abbrs: abbrs
    apiImageName: apiImageName
    apiServiceName: 'api'
    webServiceName: 'web'
    principalId: principalId
    principalType: principalType
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.containerRegistryLoginServer
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.containerRegistryName
output SERVICE_API_URI string = resources.outputs.apiUri
output SERVICE_WEB_URI string = resources.outputs.webUri
