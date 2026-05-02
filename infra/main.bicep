// PCC Gardens Manager — Azure Infrastructure
// Region: Australia East
// Resources: App Service Plan, API App Service, Web App Service,
//            PostgreSQL Flexible Server, Azure Container Registry

@description('Environment name: dev | staging | prod')
param environment string = 'prod'

@description('Azure region')
param location string = 'australiaeast'

@description('PostgreSQL admin login')
param dbAdminLogin string = 'pccadmin'

@secure()
@description('PostgreSQL admin password')
param dbAdminPassword string

@secure()
@description('JWT secret used by the API')
param jwtSecret string

@secure()
@description('Sentry DSN for the API server')
param sentryDsnApi string = ''

@secure()
@description('Sentry DSN for the frontend (baked in at build time)')
param sentryDsnWeb string = ''

var prefix = 'pcc-gardens-${environment}'

// ── Container Registry ───────────────────────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: replace('${prefix}acr', '-', '')
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

// ── App Service Plan (Linux) ──────────────────────────────────────────────────
resource appPlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: '${prefix}-plan'
  location: location
  kind: 'linux'
  sku: { name: 'B2', tier: 'Basic' }
  properties: { reserved: true }
}

// ── PostgreSQL Flexible Server ────────────────────────────────────────────────
resource pgServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: '${prefix}-pg'
  location: location
  sku: { name: 'Standard_B2s', tier: 'Burstable' }
  properties: {
    administratorLogin: dbAdminLogin
    administratorLoginPassword: dbAdminPassword
    version: '16'
    storage: { storageSizeGB: 32 }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
  }
}

resource pgDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: pgServer
  name: 'pcc_gardens'
  properties: { charset: 'UTF8', collation: 'en_US.UTF8' }
}

// ── API App Service ───────────────────────────────────────────────────────────
resource apiApp 'Microsoft.Web/sites@2023-01-01' = {
  name: '${prefix}-api'
  location: location
  kind: 'app,linux,container'
  properties: {
    serverFarmId: appPlan.id
    siteConfig: {
      linuxFxVersion: 'DOCKER|${acr.properties.loginServer}/pcc-gardens-api:latest'
      appSettings: [
        { name: 'DATABASE_URL', value: 'postgresql://${dbAdminLogin}:${dbAdminPassword}@${pgServer.properties.fullyQualifiedDomainName}/pcc_gardens?sslmode=require' }
        { name: 'JWT_SECRET', value: jwtSecret }
        { name: 'NODE_ENV', value: 'production' }
        { name: 'SENTRY_DSN', value: sentryDsnApi }
        { name: 'DOCKER_REGISTRY_SERVER_URL', value: 'https://${acr.properties.loginServer}' }
        { name: 'DOCKER_REGISTRY_SERVER_USERNAME', value: acr.listCredentials().username }
        { name: 'DOCKER_REGISTRY_SERVER_PASSWORD', value: acr.listCredentials().passwords[0].value }
        { name: 'WEBSITES_PORT', value: '8080' }
      ]
      healthCheckPath: '/api/health/live'
    }
    httpsOnly: true
  }
}

// ── Web App Service ───────────────────────────────────────────────────────────
resource webApp 'Microsoft.Web/sites@2023-01-01' = {
  name: '${prefix}-web'
  location: location
  kind: 'app,linux,container'
  properties: {
    serverFarmId: appPlan.id
    siteConfig: {
      linuxFxVersion: 'DOCKER|${acr.properties.loginServer}/pcc-gardens-web:latest'
      appSettings: [
        { name: 'DOCKER_REGISTRY_SERVER_URL', value: 'https://${acr.properties.loginServer}' }
        { name: 'DOCKER_REGISTRY_SERVER_USERNAME', value: acr.listCredentials().username }
        { name: 'DOCKER_REGISTRY_SERVER_PASSWORD', value: acr.listCredentials().passwords[0].value }
      ]
    }
    httpsOnly: true
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────
output apiUrl string = 'https://${apiApp.properties.defaultHostName}'
output webUrl string = 'https://${webApp.properties.defaultHostName}'
output acrLoginServer string = acr.properties.loginServer
output pgHost string = pgServer.properties.fullyQualifiedDomainName
