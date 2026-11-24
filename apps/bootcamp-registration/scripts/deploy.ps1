param(
    [Parameter(Mandatory)][string]$SubscriptionId,
    [Parameter(Mandatory)][string]$ArtifactDirectory,
    [string]$Location = 'eastus',
    [string]$ResourceGroup = 'rg-bootcamp-registration',
    [string]$DataverseUrl = 'https://org02f9c7df.crm.dynamics.com/',
    [string]$PictureOrigins = '',
    [switch]$RotateCredential
)

$ErrorActionPreference = 'Stop'
$appRoot = Split-Path $PSScriptRoot -Parent
$graphRoot = 'https://graph.microsoft.com/v1.0'

function Invoke-AzureJson {
    param([string[]]$Arguments)
    $output = & az @Arguments --output json --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw "Azure CLI failed: $($Arguments[0..1] -join ' ')." }
    if ($output) { return ($output -join "`n") | ConvertFrom-Json }
}

function Get-AccessToken {
    param([string]$Resource)
    $token = & az account get-access-token --resource $Resource --tenant $script:tenantId --query accessToken --output tsv --only-show-errors
    if ($LASTEXITCODE -ne 0 -or !$token) { throw 'Could not acquire a deployment access token.' }
    return $token
}

function Invoke-Graph {
    param([string]$Path, [string]$Method = 'GET', [object]$Body)
    $arguments = @{
        Uri = "$graphRoot/$Path"
        Method = $Method
        Headers = @{ Authorization = "Bearer $script:graphToken" }
        ContentType = 'application/json'
    }
    if ($null -ne $Body) { $arguments.Body = $Body | ConvertTo-Json -Depth 12 -Compress }
    return Invoke-RestMethod @arguments
}

function Get-SecretReferenceStatus {
    param([string]$ReferencePath)
    $references = Invoke-AzureJson @('rest', '--method', 'get', '--url', "${ReferencePath}?api-version=2024-11-01")
    $reference = $references.value | Where-Object name -eq 'MCP_CLIENT_SECRET' | Select-Object -First 1
    if (!$reference) { throw 'The app is missing its Key Vault credential reference.' }
    return $reference.properties.status
}

function New-VaultSecretBody {
    param([object]$Credential, [DateTimeOffset]$Expiry)
    if ($Credential.secretText -isnot [string] -or [string]::IsNullOrWhiteSpace($Credential.secretText)) {
        throw 'Microsoft Graph did not return the new credential secretText.'
    }
    return @{ value = $Credential.secretText; attributes = @{ enabled = $true; exp = $Expiry.ToUnixTimeSeconds() } } |
        ConvertTo-Json -Compress
}

if ($ResourceGroup -notmatch '^[a-zA-Z0-9_-]{1,80}$') { throw 'Use a simple resource group name.' }
if (![System.IO.Path]::IsPathRooted($ArtifactDirectory)) { throw 'ArtifactDirectory must be an absolute path outside the source tree.' }
if ([System.IO.Path]::GetFullPath($ArtifactDirectory).StartsWith("$appRoot\", [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Keep deployment artifacts outside the source tree.'
}
$account = Invoke-AzureJson @('account', 'show', '--subscription', $SubscriptionId)
$script:tenantId = $account.tenantId
$script:graphToken = Get-AccessToken 'https://graph.microsoft.com'
$organizerId = (Invoke-Graph 'me?$select=id').id
$crm = (Invoke-Graph "servicePrincipals?`$filter=appId eq '00000007-0000-0000-c000-000000000000'").value | Select-Object -First 1
$crmScope = $crm.oauth2PermissionScopes | Where-Object value -eq 'user_impersonation' | Select-Object -First 1
if (!$crmScope) { throw 'The tenant does not expose the Dynamics CRM delegated permission.' }

Push-Location $appRoot
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Application build failed.' }
    & npm test
    if ($LASTEXITCODE -ne 0) { throw 'Application tests failed.' }

    $displayName = "Bootcamp registration MCP ($ResourceGroup)"
    $existing = @( (Invoke-Graph "applications?`$filter=displayName eq '$displayName'").value )
    if ($existing.Count -gt 1) { throw 'Multiple matching Entra applications exist; resolve the ambiguity before deploying.' }
    if ($existing.Count -eq 0) {
        $scopeId = [guid]::NewGuid().ToString()
        $roleId = [guid]::NewGuid().ToString()
        $registration = Invoke-Graph 'applications' 'POST' @{
            displayName = $displayName
            signInAudience = 'AzureADMyOrg'
            api = @{
                requestedAccessTokenVersion = 2
                oauth2PermissionScopes = @(@{
                    id = $scopeId
                    value = 'access_as_user'
                    type = 'User'
                    isEnabled = $true
                    adminConsentDisplayName = 'Access bootcamp registration'
                    adminConsentDescription = 'Access bootcamp registration with the signed-in organizer identity.'
                    userConsentDisplayName = 'Access bootcamp registration'
                    userConsentDescription = 'Access bootcamp registration using your own Dataverse permissions.'
                })
            }
            appRoles = @(@{
                id = $roleId
                value = 'Bootcamp.Organizer'
                displayName = 'Bootcamp organizer'
                description = 'Manage bootcamp participant registrations.'
                allowedMemberTypes = @('User')
                isEnabled = $true
            })
            requiredResourceAccess = @(@{
                resourceAppId = $crm.appId
                resourceAccess = @(@{ id = $crmScope.id; type = 'Scope' })
            })
        }
        Invoke-Graph "applications/$($registration.id)" 'PATCH' @{ identifierUris = @("api://$($registration.appId)") } | Out-Null
    } else {
        $registration = $existing[0]
        $roleId = ($registration.appRoles | Where-Object value -eq 'Bootcamp.Organizer' | Select-Object -First 1).id
        if (!$roleId -or !$registration.api.oauth2PermissionScopes.Where({ $_.value -eq 'access_as_user' })) {
            throw 'The existing Entra application does not have the expected role and scope.'
        }
    }
    $principal = (Invoke-Graph "servicePrincipals?`$filter=appId eq '$($registration.appId)'").value | Select-Object -First 1
    if (!$principal) {
        $principal = Invoke-Graph 'servicePrincipals' 'POST' @{ appId = $registration.appId; appRoleAssignmentRequired = $true }
    }
    $assignment = (Invoke-Graph "servicePrincipals/$($principal.id)/appRoleAssignedTo").value |
        Where-Object { $_.principalId -eq $organizerId -and $_.appRoleId -eq $roleId }
    if (!$assignment) {
        Invoke-Graph "servicePrincipals/$($principal.id)/appRoleAssignedTo" 'POST' @{
            principalId = $organizerId; resourceId = $principal.id; appRoleId = $roleId
        } | Out-Null
    }
    # Grant CRM delegation only for this organizer, not tenant-wide consent.
    $grant = (Invoke-Graph "oauth2PermissionGrants?`$filter=clientId eq '$($principal.id)' and resourceId eq '$($crm.id)'").value |
        Where-Object { $_.consentType -eq 'AllPrincipals' -or ($_.consentType -eq 'Principal' -and $_.principalId -eq $organizerId) } |
        Where-Object { $_.scope.Split(' ') -contains 'user_impersonation' }
    if (!$grant) {
        Invoke-Graph 'oauth2PermissionGrants' 'POST' @{
            clientId = $principal.id; consentType = 'Principal'; principalId = $organizerId
            resourceId = $crm.id; scope = 'user_impersonation'
        } | Out-Null
    }

    $groupExists = Invoke-AzureJson @('group', 'exists', '--subscription', $SubscriptionId, '--name', $ResourceGroup)
    if (!$groupExists) {
        Invoke-AzureJson @('group', 'create', '--subscription', $SubscriptionId, '--name', $ResourceGroup, '--location', $Location) | Out-Null
    }
    $deployment = Invoke-AzureJson @(
        'deployment', 'group', 'create', '--subscription', $SubscriptionId, '--resource-group', $ResourceGroup,
        '--name', 'bootcamp-registration', '--template-file', (Join-Path $appRoot 'infra\main.bicep'),
        '--parameters', "location=$Location", "tenantId=$tenantId", "credentialWriterObjectId=$organizerId",
        "clientId=$($registration.appId)", "dataverseUrl=$DataverseUrl", "pictureOrigins=$PictureOrigins"
    )
    $outputs = $deployment.properties.outputs
    $appName = $outputs.appName.value
    $appResourceId = $outputs.appResourceId.value
    $vaultUri = $outputs.vaultUri.value
    $mcpUrl = $outputs.mcpUrl.value
    $referencePath = "https://management.azure.com$appResourceId/config/configreferences/appsettings"
    $referenceStatus = Get-SecretReferenceStatus $referencePath
    if ($referenceStatus -notin @('Resolved', 'SecretNotFound') -and !$RotateCredential) {
        throw "Key Vault credential reference failed: $referenceStatus."
    }
    if ($RotateCredential -or $referenceStatus -eq 'SecretNotFound') {
        $expiry = [DateTimeOffset]::UtcNow.AddDays(180)
        $credential = Invoke-Graph "applications/$($registration.id)/addPassword" 'POST' @{
            passwordCredential = @{ displayName = 'App Service OBO'; endDateTime = $expiry.ToString('o') }
        }
        $vaultToken = Get-AccessToken 'https://vault.azure.net'
        $secretBody = New-VaultSecretBody $credential $expiry
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            try {
                Invoke-RestMethod -Method Put -Uri "${vaultUri}secrets/mcp-client-secret?api-version=7.4" -Headers @{
                    Authorization = "Bearer $vaultToken"
                } -ContentType 'application/json' -Body $secretBody | Out-Null
                break
            } catch {
                if ([int]$_.Exception.Response.StatusCode -ne 403 -or $attempt -eq 19) {
                    $status = [int]$_.Exception.Response.StatusCode
                    $details = $_.ErrorDetails.Message | ConvertFrom-Json
                    Invoke-Graph "applications/$($registration.id)/removePassword" 'POST' @{ keyId = $credential.keyId } | Out-Null
                    throw "Key Vault credential storage failed (HTTP $status, $($details.error.code))."
                }
                Start-Sleep -Seconds 3
            }
        }
        $secretBody = $null
        $credential = $null
        $vaultToken = $null
    }
    Invoke-AzureJson @('rest', '--method', 'post', '--url', "$referencePath/refresh?api-version=2024-11-01") | Out-Null

    $stage = Join-Path $ArtifactDirectory 'package'
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    Copy-Item (Join-Path $appRoot 'dist') $stage -Recurse -Force
    Copy-Item (Join-Path $appRoot 'package.json'), (Join-Path $appRoot 'package-lock.json') $stage -Force
    Push-Location $stage
    try {
        & npm ci --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Production dependency installation failed.' }
    } finally { Pop-Location }
    $archive = Join-Path $ArtifactDirectory 'bootcamp-registration.zip'
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -Force
    Invoke-AzureJson @(
        'webapp', 'deploy', '--subscription', $SubscriptionId, '--resource-group', $ResourceGroup, '--name', $appName,
        '--src-path', $archive, '--type', 'zip', '--timeout', '600000', '--track-status', 'false'
    ) | Out-Null
    if ((Get-SecretReferenceStatus $referencePath) -ne 'Resolved') { throw 'The deployed app cannot resolve its Key Vault credential.' }
    $publicOrigin = ([uri]$mcpUrl).GetLeftPart([System.UriPartial]::Authority)
    $healthy = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri "$publicOrigin/health" -SkipHttpErrorCheck -TimeoutSec 15
            if ([int]$response.StatusCode -eq 200 -and ($response.Content | ConvertFrom-Json).status -eq 'ok') {
                $healthy = $true
                break
            }
        } catch {
            if ($attempt -eq 19) { throw 'The deployed HTTPS health endpoint did not become ready.' }
        }
        Start-Sleep -Seconds 3
    }
    if (!$healthy) { throw 'The deployed HTTPS health endpoint did not become ready.' }
    $anonymous = Invoke-WebRequest -Uri $mcpUrl -SkipHttpErrorCheck -TimeoutSec 15
    if ([int]$anonymous.StatusCode -ne 401) { throw 'The deployed MCP endpoint did not reject anonymous access.' }

    [PSCustomObject]@{
        subscriptionId = $SubscriptionId
        resourceGroup = $ResourceGroup
        appName = $appName
        vaultName = $outputs.vaultName.value
        mcpUrl = $mcpUrl
        tenantId = $tenantId
        clientId = $registration.appId
        scope = "api://$($registration.appId)/access_as_user"
    } | ConvertTo-Json | Set-Content (Join-Path $ArtifactDirectory 'deployment.json')
    Write-Output "Deployed MCP endpoint: $mcpUrl"
} finally {
    $script:graphToken = $null
    Pop-Location
}
