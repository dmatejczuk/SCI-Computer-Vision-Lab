param([string]$Address)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$dockerOS = docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0 -or $dockerOS -ne 'linux') { throw 'Start Docker Desktop with Linux containers, then retry.' }
if (-not $Address) {
    $choices = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
        $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and
        $_.InterfaceAlias -notmatch 'vEthernet|WSL|Docker|VPN|Loopback' -and $_.AddressState -eq 'Preferred'
    })
    # Prefer adapters with a default route; host-only/virtual adapters (e.g. VirtualBox) have none.
    $routed = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty InterfaceIndex)
    $preferred = @($choices | Where-Object { $routed -contains $_.InterfaceIndex })
    if ($preferred.Count -gt 0) { $choices = $preferred }
    if ($choices.Count -eq 0) { throw 'No LAN IPv4 address found. Supply -Address with the reachable LAN address.' }
    for ($i = 0; $i -lt $choices.Count; $i++) { Write-Host "$i : $($choices[$i].IPAddress) - $($choices[$i].InterfaceAlias)" }
    $choice = if ($choices.Count -eq 1) { 0 } else { [int](Read-Host 'Choose the LAN interface number') }
    if ($choice -lt 0 -or $choice -ge $choices.Count) { throw 'Invalid interface selection.' }
    $Address = $choices[$choice].IPAddress
}
$parsed = [System.Net.IPAddress]::Parse($Address)
if ($parsed.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or [System.Net.IPAddress]::IsLoopback($parsed)) { throw 'Choose a reachable LAN IPv4 address.' }
Write-Host 'Current TCP port listeners (Docker may already own these ports):'
Get-NetTCPConnection -LocalPort 80,443 -State Listen -ErrorAction SilentlyContinue | Format-Table LocalAddress,LocalPort,OwningProcess
$env:APP_HOST = $Address
$env:APP_TLS_ISSUER = 'internal'
docker compose -f docker-compose.network.yml config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Invalid Compose configuration.' }
docker compose -f docker-compose.network.yml up -d --build --wait --wait-timeout 120
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed. Inspect Docker logs and port conflicts.' }
docker compose -f docker-compose.network.yml cp app:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
if ($LASTEXITCODE -ne 0) { throw 'Could not export the public CA certificate.' }
# certutil is always present; Get-FileHash can be missing in nested shells with a foreign PSModulePath.
certutil -hashfile ./caddy-root.crt SHA256
Write-Host "Open https://$Address on BOTH the computer and phone. Select Telefon on the computer."
Write-Host 'Trust caddy-root.crt on each device through a trusted transfer, comparing its SHA256 fingerprint.'
Write-Host 'iOS additionally requires Full Trust in Certificate Trust Settings. See docs/PHONE_CAMERA.md.'
Write-Host 'Allow TCP 80/443 on the private LAN, and WebRTC peer traffic. Disable Wi-Fi client isolation only through your network administrator.'
Write-Host 'No firewall rules or system certificate trust were changed by this script. Keep caddy_data; do not run down -v.'
