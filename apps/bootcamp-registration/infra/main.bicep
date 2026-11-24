param location string = resourceGroup().location
param tenantId string
param credentialWriterObjectId string
param clientId string
param dataverseUrl string
param pictureOrigins string = ''

var appName = 'bootcamp-reg-${uniqueString(resourceGroup().id)}'
var vaultName = 'bcreg-${uniqueString(resourceGroup().id)}'
var tags = {
  application: 'bootcamp-registration'
}

resource plan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: 'plan-bootcamp-registration'
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: 'B1'
    tier: 'Basic'
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

resource app 'Microsoft.Web/sites@2024-11-01' = {
  name: appName
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|24-lts'
      appCommandLine: 'node dist/server/main.js --http'
      alwaysOn: true
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      healthCheckPath: '/health'
    }
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  tags: tags
  properties: {
    tenantId: tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enableRbacAuthorization: false
    accessPolicies: [
      {
        tenantId: tenantId
        objectId: credentialWriterObjectId
        permissions: {
          secrets: [
            'set'
          ]
        }
      }
      {
        tenantId: tenantId
        objectId: app.identity.principalId
        permissions: {
          secrets: [
            'get'
          ]
        }
      }
    ]
  }
}

resource settings 'Microsoft.Web/sites/config@2024-11-01' = {
  parent: app
  name: 'appsettings'
  properties: {
    DATAVERSE_URL: dataverseUrl
    PROFILE_PICTURE_ORIGINS: pictureOrigins
    MCP_TENANT_ID: tenantId
    MCP_CLIENT_ID: clientId
    MCP_CLIENT_SECRET: '@Microsoft.KeyVault(SecretUri=${vault.properties.vaultUri}secrets/mcp-client-secret)'
    MCP_PUBLIC_URL: 'https://${app.properties.defaultHostName}'
    HOST: '0.0.0.0'
    PORT: '8080'
    NODE_ENV: 'production'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
  }
}

resource scmPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: app
  name: 'scm'
  properties: {
    allow: false
  }
}

resource ftpPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: app
  name: 'ftp'
  properties: {
    allow: false
  }
}

output appName string = app.name
output appResourceId string = app.id
output vaultName string = vault.name
output vaultUri string = vault.properties.vaultUri
output mcpUrl string = 'https://${app.properties.defaultHostName}/mcp'
