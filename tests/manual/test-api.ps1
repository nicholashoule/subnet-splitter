# Test API private IP validation
Write-Host "`n=== TEST 1: Valid Private IP (10.0.0.0/16) ===" -ForegroundColor Green
$headers = @{"Content-Type"="application/json"}
$body = '{"deploymentSize":"professional","vpcCidr":"10.0.0.0/16"}'
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/kubernetes/network-plan" -Method POST -Headers $headers -Body $body -UseBasicParsing
    Write-Host "[PASS] SUCCESS - Status Code: $($resp.StatusCode)" -ForegroundColor Green
    $json = $resp.Content | ConvertFrom-Json
    Write-Host "VPC CIDR: $($json.vpc.cidr)"
    Write-Host "Public Subnets: $($json.subnets.public.length)"
    Write-Host "Private Subnets: $($json.subnets.private.length)"
} catch {
    Write-Host "[FAIL] FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Public IP should be REJECTED
Write-Host "`n=== TEST 2: Invalid Public IP (8.8.8.0/16) - Should REJECT ===" -ForegroundColor Yellow
$body2 = '{"deploymentSize":"professional","vpcCidr":"8.8.8.0/16"}'
try {
    $resp2 = Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/kubernetes/network-plan" -Method POST -Headers $headers -Body $body2 -UseBasicParsing
    Write-Host "[FAIL] UNEXPECTED - Request should have been rejected" -ForegroundColor Red
} catch {
    $errResp = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($errResp)
    $errContent = $reader.ReadToEnd()
    Write-Host "[PASS] CORRECTLY REJECTED - Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Green
    Write-Host "Error Message: $errContent"
}

# Test 3: Class B private range (172.16.0.0/12)
Write-Host "`n=== TEST 3: Valid Class B Private IP (172.16.0.0/16) ===" -ForegroundColor Green
$body3 = '{"deploymentSize":"professional","vpcCidr":"172.16.0.0/16"}'
try {
    $resp3 = Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/kubernetes/network-plan" -Method POST -Headers $headers -Body $body3 -UseBasicParsing
    Write-Host "[PASS] SUCCESS - Status Code: $($resp3.StatusCode)" -ForegroundColor Green
    $json3 = $resp3.Content | ConvertFrom-Json
    Write-Host "VPC CIDR: $($json3.vpc.cidr)"
} catch {
    Write-Host "[FAIL] FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Class C private range (192.168.0.0/16)
Write-Host "`n=== TEST 4: Valid Class C Private IP (192.168.0.0/16) ===" -ForegroundColor Green
$body4 = '{"deploymentSize":"standard","vpcCidr":"192.168.0.0/16"}'
try {
    $resp4 = Invoke-WebRequest -Uri "http://127.0.0.1:5000/api/kubernetes/network-plan" -Method POST -Headers $headers -Body $body4 -UseBasicParsing
    Write-Host "[PASS] SUCCESS - Status Code: $($resp4.StatusCode)" -ForegroundColor Green
    $json4 = $resp4.Content | ConvertFrom-Json
    Write-Host "VPC CIDR: $($json4.vpc.cidr)"
} catch {
    Write-Host "[FAIL] FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TESTS COMPLETE ===" -ForegroundColor Cyan
