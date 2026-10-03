# Quick manual check against a running server (npm run dev): one private VPC is planned
# and one public VPC is rejected with 400. For all five cases run test-api-endpoints.ps1.
# Works in Windows PowerShell 5.1 and PowerShell 7. Exit code 1 if a check fails.
#   .\tests\manual\test-api.ps1 [-BaseUrl http://127.0.0.1:5000]
param([string]$BaseUrl = "http://127.0.0.1:5000")

$failures = 0

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

$private = Invoke-Plan '{"deploymentSize":"professional","vpcCidr":"10.0.0.0/16"}'
if ($private.Status -eq 200) {
    Write-Host "[PASS] Private 10.0.0.0/16 is planned: VPC $(($private.Body | ConvertFrom-Json).vpc.cidr)" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Private 10.0.0.0/16: expected 200, got $($private.Status): $($private.Body)" -ForegroundColor Red
    $failures++
}

$public = Invoke-Plan '{"deploymentSize":"professional","vpcCidr":"8.8.8.0/16"}'
if ($public.Status -eq 400) {
    Write-Host "[PASS] Public 8.8.8.0/16 is rejected: $(($public.Body | ConvertFrom-Json).error)" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Public 8.8.8.0/16: expected 400, got $($public.Status): $($public.Body)" -ForegroundColor Red
    $failures++
}

if ($failures -gt 0) { exit 1 }
