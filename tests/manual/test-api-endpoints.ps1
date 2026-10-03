# Manual check against a running server (npm run dev): private VPC CIDRs are planned,
# public ones are rejected with 400. Works in Windows PowerShell 5.1 and PowerShell 7.
# Exit code: 0 when every check passes, 1 otherwise.
#   .\tests\manual\test-api-endpoints.ps1 [-BaseUrl http://127.0.0.1:5000]
param([string]$BaseUrl = "http://127.0.0.1:5000")

$failures = 0

# POST a plan request; returns the status and body, also for HTTP error responses
function Invoke-Plan([string]$Body) {
    try {
        $resp = Invoke-WebRequest -Uri "$BaseUrl/api/k8s/plan" -Method POST -ContentType "application/json" -Body $Body -UseBasicParsing
        return @{ Status = [int]$resp.StatusCode; Body = $resp.Content }
    } catch {
        if ($_.Exception.Response) {
            # HTTP error status: PowerShell 5.1 and 7 both put the body in ErrorDetails
            return @{ Status = [int]$_.Exception.Response.StatusCode; Body = $_.ErrorDetails.Message }
        }
        return @{ Status = 0; Body = $_.Exception.Message }
    }
}

function Test-Plan([string]$Name, [string]$Body, [int]$ExpectedStatus) {
    $result = Invoke-Plan $Body
    if ($result.Status -eq $ExpectedStatus) {
        Write-Host "[PASS] $Name (status $($result.Status))" -ForegroundColor Green
        $json = $null
        try { $json = $result.Body | ConvertFrom-Json } catch { }
        if ($json.vpc) { Write-Host "       VPC $($json.vpc.cidr): $($json.subnets.public.Count) public, $($json.subnets.private.Count) private subnets" }
        if ($json.error) { Write-Host "       $($json.error)" }
    } else {
        Write-Host "[FAIL] $Name (expected $ExpectedStatus, got $($result.Status)): $($result.Body)" -ForegroundColor Red
        $script:failures++
    }
}

Write-Host "`nAPI private IP validation against $BaseUrl`n" -ForegroundColor Cyan
Test-Plan "Private 10.0.0.0/16 (professional) is planned" '{"deploymentSize":"professional","vpcCidr":"10.0.0.0/16"}' 200
Test-Plan "Private 172.16.0.0/16 (professional) is planned" '{"deploymentSize":"professional","vpcCidr":"172.16.0.0/16"}' 200
Test-Plan "Private 192.168.0.0/16 (standard) is planned" '{"deploymentSize":"standard","vpcCidr":"192.168.0.0/16"}' 200
Test-Plan "Public 8.8.8.0/16 is rejected" '{"deploymentSize":"professional","vpcCidr":"8.8.8.0/16"}' 400
Test-Plan "Public 200.0.0.0/16 is rejected" '{"deploymentSize":"professional","vpcCidr":"200.0.0.0/16"}' 400

if ($failures -gt 0) {
    Write-Host "`n$failures check(s) failed" -ForegroundColor Red
    exit 1
}
Write-Host "`nAll checks passed" -ForegroundColor Green
